-- GoWithDME AI: sistem "belajar" berbasis Supabase.
-- Jalankan SETELAH supabase/schema.sql (rate_message membaca ai_chats/ai_messages), di SQL Editor. Aman diulang.
--
-- Alur:
--   1) Pengguna login menekan 👍/👎 pada jawaban AI  -> rpc rate_message()  -> baris di training_logs
--   2) Admin meninjau baris 👍 (view training_review) lalu set approved = true
--   3) Edge Function export-training memanggil claim_training_batch() -> JSONL untuk fine-tune
--   4) Setelah training selesai, Edge Function training-complete memanggil finish_training_run()
--   5) Worker membaca contoh approved sebagai few-shot (belajar instan tanpa training ulang)
--
-- Keamanan: pengguna TIDAK punya akses langsung ke tabel. Satu-satunya pintu masuk adalah rate_message().
-- Data hanya dipakai bila approved = true (ditetapkan admin), jadi rating palsu tidak bisa meracuni model.

-- 1) training_runs: satu baris per ekspor/training
create table if not exists public.training_runs (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'exported' check (status in ('exported', 'training', 'done', 'failed')),
  example_count int  not null default 0,
  model_name    text,
  note          text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

-- 2) training_logs: pasangan prompt-jawaban + rating
create table if not exists public.training_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  message_id  uuid not null,                       -- id pesan AI; satu rating per pengguna per pesan
  mode        text not null check (mode in ('ngobrol', 'gunung', 'konser', 'trip')),
  prompt      text not null check (char_length(prompt)   between 1 and 4000),
  response    text not null check (char_length(response) between 1 and 4000),
  rating      smallint not null check (rating in (-1, 1)),
  reason      text,                                -- alasan 👎: ngarang | salah | kurang (diisi pengguna, opsional)
  approved    boolean not null default false,      -- hanya admin yang mengubah ini
  exported_at timestamptz,
  run_id      uuid references public.training_runs (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (user_id, message_id)
);
-- Mendukung: where approved and rating = 1 and exported_at is null order by created_at
create index if not exists training_logs_ready_idx on public.training_logs (mode, created_at)
  where approved and rating = 1 and exported_at is null;
-- Mendukung: ambil contoh few-shot terbaru per mode (Worker)
create index if not exists training_logs_fewshot_idx on public.training_logs (mode, created_at desc)
  where approved and rating = 1;

-- Tabel lama (dibuat sebelum kolom ini ada): tambahkan kolom + batasan nilainya.
alter table public.training_logs add column if not exists reason text;
alter table public.training_logs drop constraint if exists training_logs_reason_chk;
alter table public.training_logs add constraint training_logs_reason_chk check (reason is null or reason in ('ngarang', 'salah', 'kurang'));

-- 3) RLS aktif, tanpa policy = ditolak untuk anon/authenticated. service_role (Edge Function, Worker) melewati RLS.
alter table public.training_runs enable row level security;
alter table public.training_logs enable row level security;
revoke all on public.training_runs from anon, authenticated;
revoke all on public.training_logs from anon, authenticated;

-- 4) Penyaring data pribadi sederhana (email, nomor telepon Indonesia, angka panjang seperti NIK/kartu)
create or replace function public.scrub_pii(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(t,
               '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
             '(\+62|62|0)[ .-]?8[0-9]{1,2}[ .-]?[0-9]{3,4}[ .-]?[0-9]{3,5}', '[telepon]', 'g'),
           '[0-9]{12,}', '[angka]', 'g')
$$;

-- 5) Pintu masuk pengguna: simpan / ubah rating. Boleh dipanggil ulang untuk mengganti 👍 <-> 👎.
--    Klien HANYA mengirim id pesan + rating. Teks pertanyaan dan jawaban dibaca dari ai_messages (milik pengguna itu),
--    jadi pasangan teks tidak bisa dikarang dari browser.
drop function if exists public.rate_message(uuid, text, text, text, int); -- pintu lama (menerima teks dari klien) ditutup
drop function if exists public.rate_message(uuid, int);                    -- versi tanpa alasan (diganti yang di bawah)
create or replace function public.rate_message(p_message_id uuid, p_rating int, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ans record;
  q text;
  m text;
begin
  if uid is null then raise exception 'login diperlukan' using errcode = '28000'; end if;
  if p_rating not in (-1, 1) then raise exception 'rating tidak valid'; end if;
  if p_reason is not null and p_reason not in ('ngarang', 'salah', 'kurang') then raise exception 'alasan tidak valid'; end if;

  -- jawaban AI milik pengguna ini
  select am.content, am.created_at, am.chat_id, c.type into ans
    from public.ai_messages am join public.ai_chats c on c.id = am.chat_id
   where am.id = p_message_id and am.role = 'assistant' and c.user_id = uid;
  if not found then raise exception 'pesan tidak ditemukan'; end if;

  -- pertanyaan = pesan pengguna terakhir sebelum jawaban itu
  select content into q from public.ai_messages
   where chat_id = ans.chat_id and role = 'user' and created_at <= ans.created_at
   order by created_at desc limit 1;
  if coalesce(btrim(q), '') = '' or coalesce(btrim(ans.content), '') = '' then raise exception 'isi kosong'; end if;

  m := case ans.type when 'bebas' then 'ngobrol' else ans.type end;

  insert into public.training_logs (user_id, message_id, mode, prompt, response, rating, reason)
  values (uid, p_message_id, m, left(scrub_pii(q), 4000), left(scrub_pii(ans.content), 4000), p_rating,
          case when p_rating = -1 then p_reason else null end) -- alasan hanya untuk 👎
  on conflict (user_id, message_id) do update
    set rating = excluded.rating,
        reason = excluded.reason,
        -- rating berubah => tinjauan admin diulang; yang sudah diekspor tidak ditarik kembali
        approved = case when public.training_logs.rating <> excluded.rating then false else public.training_logs.approved end;
end $$;
revoke all on function public.rate_message(uuid, int, text) from public, anon;
grant execute on function public.rate_message(uuid, int, text) to authenticated;

-- 6) Bahan tinjauan admin (Table Editor / SQL Editor): 👍 yang belum disetujui.
--    Setujui:  update public.training_logs set approved = true where id in ('...', '...');
create or replace view public.training_review as
  select id, mode, prompt, response, created_at
  from public.training_logs
  where rating = 1 and not approved and exported_at is null
  order by created_at desc;
revoke all on public.training_review from anon, authenticated;

-- 7) Ambil satu batch untuk training: tandai exported + buat training_runs, kembalikan baris-nya.
--    Hanya service_role (dipanggil Edge Function export-training).
create or replace function public.claim_training_batch(p_limit int default 500, p_mode text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; rows jsonb;
begin
  p_limit := greatest(1, least(coalesce(p_limit, 500), 5000));
  insert into public.training_runs default values returning id into rid;

  with picked as (
    select id from public.training_logs
    where approved and rating = 1 and exported_at is null and (p_mode is null or mode = p_mode)
    order by created_at
    limit p_limit
    for update skip locked
  ), upd as (
    update public.training_logs t
       set exported_at = now(), run_id = rid
      from picked where t.id = picked.id
    returning t.mode, t.prompt, t.response, t.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'prompt', prompt, 'response', response) order by created_at), '[]'::jsonb)
    into rows from upd;

  update public.training_runs set example_count = jsonb_array_length(rows) where id = rid;
  return jsonb_build_object('run_id', rid, 'rows', rows);
end $$;
revoke all on function public.claim_training_batch(int, text) from public, anon, authenticated;
grant execute on function public.claim_training_batch(int, text) to service_role;

-- 8) Tutup satu run. status 'failed' mengembalikan contoh ke antrean agar bisa diekspor ulang.
create or replace function public.finish_training_run(
  p_run_id uuid, p_status text, p_model text default null, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('training', 'done', 'failed') then raise exception 'status tidak valid'; end if;
  update public.training_runs
     set status = p_status,
         model_name = coalesce(p_model, model_name),
         note = coalesce(p_note, note),
         finished_at = case when p_status in ('done', 'failed') then now() else finished_at end
   where id = p_run_id;
  if not found then raise exception 'run tidak ditemukan'; end if;
  if p_status = 'failed' then
    update public.training_logs set exported_at = null, run_id = null where run_id = p_run_id;
  end if;
end $$;
revoke all on function public.finish_training_run(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_training_run(uuid, text, text, text) to service_role;
