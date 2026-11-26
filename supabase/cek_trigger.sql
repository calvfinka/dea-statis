-- Cek: apakah handle_new_user() masih versi situs utama (membuat nickname + avatar untuk pengguna baru)?
-- Jalankan di SQL Editor. Hasil `versi_utama = true` berarti aman.
select position('nick_make' in pg_get_functiondef('public.handle_new_user'::regproc)) > 0 as versi_utama;

-- Bila false: jalankan ulang BAGIAN 3 ("handle_new_user() final") dari repo gowithdme, file supabase/patch_pengguna_baru.sql.
