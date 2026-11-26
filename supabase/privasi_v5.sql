-- GoWithDME AI v5: privasi data belajar. Jalankan di Supabase SQL Editor SETELAH learning.sql. Aman diulang.
-- Isi: (1) penyaring data pribadi lebih ketat, (2) obrolan berisi sinyal usia <18 atau krisis tidak disimpan untuk belajar,
--      (3) hapus otomatis penilaian yang belum disetujui > 90 hari (dipanggil cron Worker), (4) pengguna bisa menghapus penilaiannya sendiri.

-- 1) scrub_pii: email, tautan, @akun, telepon Indonesia, deretan angka panjang (juga yang berspasi/bertitik seperti NIK/kartu).
create or replace function public.scrub_pii(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(t,
            '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
          '(https?://|www\.)[^[:space:]]+', '[tautan]', 'g'),
        '(^|[^A-Za-z0-9_])@[A-Za-z0-9_.]{3,}', '\1[akun]', 'g'),
      '(\+62|62|0)[ .-]?8[0-9]{1,2}[ .-]?[0-9]{3,4}[ .-]?[0-9]{3,5}', '[telepon]', 'g'),
    '[0-9]([ .-]?[0-9]){11,}', '[angka]', 'g')
$$;

-- 2) rate_message: sama seperti sebelumnya, ditambah: bila obrolan ini memuat pengguna yang menyebut usia di bawah 18 atau
--    sinyal krisis, penilaian TIDAK disimpan ke training_logs (tidak ada galat; tombol tetap terasa normal).
drop function if exists public.rate_message(uuid, int, text);
create or replace function public.rate_message(p_message_id uuid, p_rating int, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ans record;
  q text;
  m text;
  minor_re  constant text := '(umur|usia)[[:space:]]+(gue|aku|saya|ku)[[:space:]]+(baru[[:space:]]+)?([5-9]|1[0-7])([^0-9]|$)|(gue|aku|saya)[[:space:]]+(baru[[:space:]]+)?([5-9]|1[0-7])[[:space:]]+(tahun|th|thn)|kelas[[:space:]]+(7|8|9|10|11|12|sd|smp|sma|smk)([^0-9a-z]|$)|anak[[:space:]]+(sd|smp|sma|smk)|masih[[:space:]]+sekolah';
  crisis_re constant text := 'bunuh[[:space:]]+diri|(mau|pengen|ingin)[[:space:]]+mati|(nyakitin|menyakiti|melukai)[[:space:]]+diri|(gak|nggak|tidak|ga)[[:space:]]+(mau|pengen|ingin)[[:space:]]+hidup|self[[:space:]-]?harm';
begin
  if uid is null then raise exception 'login diperlukan' using errcode = '28000'; end if;
  if p_rating not in (-1, 1) then raise exception 'rating tidak valid'; end if;
  if p_reason is not null and p_reason not in ('ngarang', 'salah', 'kurang') then raise exception 'alasan tidak valid'; end if;

  select am.content, am.created_at, am.chat_id, c.type into ans
    from public.ai_messages am join public.ai_chats c on c.id = am.chat_id
   where am.id = p_message_id and am.role = 'assistant' and c.user_id = uid;
  if not found then raise exception 'pesan tidak ditemukan'; end if;

  select content into q from public.ai_messages
   where chat_id = ans.chat_id and role = 'user' and created_at <= ans.created_at
   order by created_at desc limit 1;
  if coalesce(btrim(q), '') = '' or coalesce(btrim(ans.content), '') = '' then raise exception 'isi kosong'; end if;

  -- obrolan sensitif (usia di bawah 18 / krisis): jangan dijadikan data belajar
  if exists (select 1 from public.ai_messages
              where chat_id = ans.chat_id and role = 'user' and (content ~* minor_re or content ~* crisis_re)) then
    return;
  end if;

  m := case ans.type when 'bebas' then 'ngobrol' else ans.type end;

  insert into public.training_logs (user_id, message_id, mode, prompt, response, rating, reason)
  values (uid, p_message_id, m, left(scrub_pii(q), 4000), left(scrub_pii(ans.content), 4000), p_rating,
          case when p_rating = -1 then p_reason else null end)
  on conflict (user_id, message_id) do update
    set rating = excluded.rating,
        reason = excluded.reason,
        approved = case when public.training_logs.rating <> excluded.rating then false else public.training_logs.approved end;
end $$;
revoke all on function public.rate_message(uuid, int, text) from public, anon;
grant execute on function public.rate_message(uuid, int, text) to authenticated;

-- 3) Retensi: hapus penilaian yang belum disetujui dan belum diekspor setelah p_days hari (minimal 7). Dipanggil cron harian Worker.
create or replace function public.purge_training_logs(p_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_days is null or p_days < 7 then raise exception 'p_days minimal 7'; end if;
  delete from public.training_logs
   where approved = false and exported_at is null and created_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_training_logs(int) from public, anon, authenticated;
grant execute on function public.purge_training_logs(int) to service_role;

-- 4) Pengguna menghapus penilaiannya sendiri (yang belum diekspor untuk training; yang sudah diekspor tidak bisa ditarik dari model).
create or replace function public.delete_my_ratings() returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'login diperlukan' using errcode = '28000'; end if;
  delete from public.training_logs where user_id = uid and exported_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.delete_my_ratings() from public, anon;
grant execute on function public.delete_my_ratings() to authenticated;
