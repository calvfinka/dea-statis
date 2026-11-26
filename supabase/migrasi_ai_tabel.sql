-- Migrasi: tabel riwayat AI berganti nama chats/messages -> ai_chats/ai_messages (hindari bentrok dengan situs utama).
-- Jalankan SETELAH schema.sql (membuat tabel baru yang kosong). Aman diulang.
--
-- LANGKAH 0 (wajib baca): cek dulu tabel lama itu milik siapa.
--   select column_name from information_schema.columns where table_name = 'chats' and table_schema = 'public';
-- Tabel milik AI memiliki kolom: id, user_id, title, type, created_at (type berisi bebas/gunung/konser/trip).
-- Bila kolomnya BERBEDA (ada kolom lain seperti sender_id, receiver_id, dst.), itu tabel situs utama: JANGAN disentuh,
-- lewati file ini (riwayat lama dibiarkan; riwayat baru mulai kosong).
--
-- Bila memang tabel AI, hapus tanda komentar blok di bawah untuk menyalin riwayat lama. Tabel lama TIDAK dihapus otomatis.

/*
insert into public.ai_chats (id, user_id, title, type, created_at)
  select id, user_id, title, type, created_at from public.chats
  on conflict (id) do nothing;

insert into public.ai_messages (id, chat_id, role, content, created_at)
  select id, chat_id, role, content, created_at from public.messages
  where chat_id in (select id from public.ai_chats)
  on conflict (id) do nothing;
*/

-- Setelah yakin riwayat baru tampil benar di aplikasi (dan tabel lama memang milik AI), baru boleh dihapus manual:
--   drop table public.messages; drop table public.chats;
