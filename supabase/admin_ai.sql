-- GoWithDME AI: data untuk menu "AI" di admin.gowithdme.com.
-- Jalankan SETELAH schema.sql dan learning.sql (dan setelah schema_rbac.sql situs utama: memakai is_owner()). Aman diulang.
--
-- PRINSIP PRIVASI: admin melihat ANGKA dan POLA, bukan isi chat.
--   * ai_usage hanya berisi catatan teknis anonim: mode, label topik, kelas perangkat (mobile/desktop), model, lama jawab,
--     jumlah token perkiraan, berhasil/gagal. TIDAK ada isi pesan, TIDAK ada user_id, TIDAK ada lokasi.
--     uid_hash = pseudonim yang berganti tiap bulan (hanya untuk menghitung perangkat unik; tidak bisa dibalik ke akun).
--   * Semua fungsi admin_ai_* khusus Pemilik (is_owner()), ditegakkan di database. Tidak ada fungsi untuk membaca ai_chats/ai_messages orang lain.
--   * Pasangan tanya-jawab yang tampil di "Tinjau jawaban" hanyalah yang SENGAJA dinilai pengguna (👍/👎) dan sudah disamarkan scrub_pii.

-- 1) ai_usage: ditulis Worker (service_role) setiap permintaan ke AI
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  mode       text not null default 'ngobrol',
  topic      text not null default 'lainnya',
  device     text not null default '?' check (device in ('mobile', 'tablet', 'desktop', '?')),
  uid_hash   text,
  provider   text,
  model      text,
  ok         boolean not null,
  err        text,
  ttft_ms    int,
  total_ms   int,
  in_tok     int,
  out_tok    int,
  has_att    boolean not null default false
);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant select, insert, delete on public.ai_usage to service_role;
grant usage, select on sequence public.ai_usage_id_seq to service_role;

-- Hapus catatan lama (dipanggil cron harian Worker). Minimal 30 hari, bawaan 90.
create or replace function public.ai_usage_purge(p_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.ai_usage where created_at < now() - make_interval(days => greatest(30, coalesce(p_days, 90)));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ai_usage_purge(int) from public, anon, authenticated;
grant execute on function public.ai_usage_purge(int) to service_role;

-- 2) Penjaga: hanya Pemilik
create or replace function public._ai_owner_only() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'hanya Pemilik' using errcode = '42501'; end if;
end $$;
revoke all on function public._ai_owner_only() from public, anon, authenticated;

-- 3) Ringkasan: chat per hari, perangkat unik, jam ramai, perangkat, topik, rating, kinerja
create or replace function public.admin_ai_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d int := greatest(1, least(coalesce(p_days, 30), 365));
  since timestamptz := (date_trunc('day', now() at time zone 'Asia/Jakarta') - make_interval(days => d - 1)) at time zone 'Asia/Jakarta';
begin
  perform public._ai_owner_only();
  return jsonb_build_object(
    'days', d,
    'since', since,
    'totals', jsonb_build_object(
      'chats',       (select count(*) from public.ai_chats where created_at >= since),
      'answers',     (select count(*) from public.ai_messages where role = 'assistant' and created_at >= since),
      'login_users', (select count(distinct user_id) from public.ai_chats where created_at >= since),
      'devices',     (select count(distinct uid_hash) from public.ai_usage where created_at >= since and uid_hash is not null),
      'requests',    (select count(*) from public.ai_usage where created_at >= since),
      'failed',      (select count(*) from public.ai_usage where created_at >= since and not ok),
      'with_att',    (select count(*) from public.ai_usage where created_at >= since and has_att)
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'd', to_char(g.day, 'YYYY-MM-DD'), 'req', coalesce(u.req, 0), 'devices', coalesce(u.dev, 0), 'chats', coalesce(c.n, 0)
             ) order by g.day), '[]'::jsonb)
        from generate_series((since at time zone 'Asia/Jakarta')::date, (now() at time zone 'Asia/Jakarta')::date, interval '1 day') as g(day)
        left join (select (created_at at time zone 'Asia/Jakarta')::date as day, count(*) as req, count(distinct uid_hash) as dev
                     from public.ai_usage where created_at >= since group by 1) u on u.day = g.day::date
        left join (select (created_at at time zone 'Asia/Jakarta')::date as day, count(*) as n
                     from public.ai_chats where created_at >= since group by 1) c on c.day = g.day::date
    ),
    'hours', (
      select coalesce(jsonb_agg(jsonb_build_object('h', h.h, 'n', coalesce(x.n, 0)) order by h.h), '[]'::jsonb)
        from generate_series(0, 23) as h(h)
        left join (select extract(hour from created_at at time zone 'Asia/Jakarta')::int as hh, count(*) as n
                     from public.ai_usage where created_at >= since group by 1) x on x.hh = h.h
    ),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('k', device, 'n', n) order by n desc), '[]'::jsonb)
                  from (select device, count(*) as n from public.ai_usage where created_at >= since group by 1) t),
    'topics',  (select coalesce(jsonb_agg(jsonb_build_object('k', topic, 'n', n) order by n desc), '[]'::jsonb)
                  from (select topic, count(*) as n from public.ai_usage where created_at >= since group by 1) t),
    'modes',   (select coalesce(jsonb_agg(jsonb_build_object('k', mode, 'n', n) order by n desc), '[]'::jsonb)
                  from (select mode, count(*) as n from public.ai_usage where created_at >= since group by 1) t),
    'rating', jsonb_build_object(
      'up',       (select count(*) from public.training_logs where rating = 1 and created_at >= since),
      'down',     (select count(*) from public.training_logs where rating = -1 and created_at >= since),
      'pending',  (select count(*) from public.training_logs where rating = 1 and not approved and exported_at is null),
      'approved', (select count(*) from public.training_logs where rating = 1 and approved),
      'reasons',  (select coalesce(jsonb_agg(jsonb_build_object('k', coalesce(reason, 'tanpa'), 'n', n) order by n desc), '[]'::jsonb)
                     from (select reason, count(*) as n from public.training_logs where rating = -1 and created_at >= since group by 1) r)
    ),
    'perf', jsonb_build_object(
      'ttft_p50',  (select round(percentile_cont(0.5)  within group (order by ttft_ms))::int  from public.ai_usage where created_at >= since and ok and ttft_ms is not null),
      'ttft_p95',  (select round(percentile_cont(0.95) within group (order by ttft_ms))::int  from public.ai_usage where created_at >= since and ok and ttft_ms is not null),
      'total_p50', (select round(percentile_cont(0.5)  within group (order by total_ms))::int from public.ai_usage where created_at >= since and ok and total_ms is not null),
      'total_p95', (select round(percentile_cont(0.95) within group (order by total_ms))::int from public.ai_usage where created_at >= since and ok and total_ms is not null),
      'tok_in',    (select coalesce(sum(in_tok), 0)  from public.ai_usage where created_at >= since),
      'tok_out',   (select coalesce(sum(out_tok), 0) from public.ai_usage where created_at >= since),
      'errors',    (select coalesce(jsonb_agg(jsonb_build_object('k', err, 'n', n) order by n desc), '[]'::jsonb)
                      from (select err, count(*) as n from public.ai_usage where created_at >= since and not ok group by 1) e),
      'by_model',  (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n, 'fail', fail, 'ttft_p50', p50) order by n desc), '[]'::jsonb)
                      from (select coalesce(provider, '?') || '/' || coalesce(model, '?') as k, count(*) as n,
                                   count(*) filter (where not ok) as fail,
                                   round(percentile_cont(0.5) within group (order by ttft_ms) filter (where ok and ttft_ms is not null))::int as p50
                              from public.ai_usage where created_at >= since group by 1) m),
      'tokens_daily', (select coalesce(jsonb_agg(jsonb_build_object('d', to_char(day, 'YYYY-MM-DD'), 'in', tin, 'out', tout) order by day), '[]'::jsonb)
                         from (select (created_at at time zone 'Asia/Jakarta')::date as day, coalesce(sum(in_tok), 0) as tin, coalesce(sum(out_tok), 0) as tout
                                 from public.ai_usage where created_at >= since group by 1) t)
    )
  );
end $$;
revoke all on function public.admin_ai_stats(int) from public, anon;
grant execute on function public.admin_ai_stats(int) to authenticated;

-- 4) Tinjau jawaban yang dinilai pengguna. p_kind: pending (👍 menunggu), approved (👍 disetujui), down (👎)
create or replace function public.admin_ai_review_list(p_kind text default 'pending', p_limit int default 30, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 30), 100));
  off int := greatest(0, coalesce(p_offset, 0));
  cond text;
  res jsonb;
begin
  perform public._ai_owner_only();
  if p_kind not in ('pending', 'approved', 'down') then raise exception 'jenis tidak valid'; end if;
  select jsonb_build_object(
    'total', (select count(*) from public.training_logs t
               where case p_kind when 'pending' then t.rating = 1 and not t.approved and t.exported_at is null
                                 when 'approved' then t.rating = 1 and t.approved
                                 else t.rating = -1 end),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select t.id, t.mode, t.rating, t.reason, t.approved, t.prompt, t.response, t.created_at
          from public.training_logs t
         where case p_kind when 'pending' then t.rating = 1 and not t.approved and t.exported_at is null
                           when 'approved' then t.rating = 1 and t.approved
                           else t.rating = -1 end
         order by t.created_at desc limit lim offset off) r), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.admin_ai_review_list(text, int, int) from public, anon;
grant execute on function public.admin_ai_review_list(text, int, int) to authenticated;

-- 5) Keputusan Pemilik: approve (👍 dipakai sebagai contoh), unapprove, delete (buang baris; mis. 👎 yang sudah ditangani atau 👍 yang ditolak)
create or replace function public.admin_ai_review_set(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._ai_owner_only();
  if p_action = 'approve' then
    update public.training_logs set approved = true where id = p_id and rating = 1;
  elsif p_action = 'unapprove' then
    update public.training_logs set approved = false where id = p_id and exported_at is null;
  elsif p_action = 'delete' then
    delete from public.training_logs where id = p_id and exported_at is null;
  else
    raise exception 'aksi tidak valid';
  end if;
  if not found then raise exception 'baris tidak ditemukan atau sudah diekspor'; end if;
  if to_regprocedure('public._rbac_log(text,uuid,jsonb)') is not null then
    perform public._rbac_log('ai.review.' || p_action, null, jsonb_build_object('id', p_id));
  end if;
end $$;
revoke all on function public.admin_ai_review_set(uuid, text) from public, anon;
grant execute on function public.admin_ai_review_set(uuid, text) to authenticated;

-- 6) Riwayat pelatihan (fine-tune)
create or replace function public.admin_ai_runs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._ai_owner_only();
  return jsonb_build_object(
    'ready', (select count(*) from public.training_logs where rating = 1 and approved and exported_at is null),
    'exported', (select count(*) from public.training_logs where exported_at is not null),
    'runs', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
        select id, status, example_count, model_name, note, created_at, finished_at
          from public.training_runs order by created_at desc limit 30) r), '[]'::jsonb)
  );
end $$;
revoke all on function public.admin_ai_runs() from public, anon;
grant execute on function public.admin_ai_runs() to authenticated;
