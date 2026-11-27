-- Kartu sumber ikut tersimpan di riwayat akun. Jalankan di Supabase > SQL Editor. Aman diulang.
-- Hanya MENAMBAH satu kolom (boleh kosong). Data lama tidak diubah; aturan RLS "ai_messages_own" tetap berlaku.
alter table public.ai_messages add column if not exists sources jsonb;
notify pgrst, 'reload schema';
