-- GoWithDME AI: tabel riwayat chat (ai_chats + ai_messages) di proyek Supabase UTAMA (satu proyek, ap-southeast-1) yang SAMA dengan gowithdme.com.
-- Aman diulang (IF NOT EXISTS).
--
-- PENTING: file ini sengaja TIDAK menyentuh `profiles`, fungsi `handle_new_user()`, maupun trigger pendaftaran.
-- Semua itu milik situs utama (repo gowithdme: supabase/schema.sql + patch_pengguna_baru.sql) dan dipakai bersama
-- oleh login di kedua situs. Versi lama file ini menimpa handle_new_user() dengan versi sederhana (tanpa nickname/avatar);
-- bila itu pernah dijalankan, jalankan supabase/cek_trigger.sql lalu pulihkan dari patch_pengguna_baru.sql (bagian 3).

-- NAMA: sengaja berawalan ai_ supaya tidak bentrok dengan tabel situs utama (mis. fitur Pesan 1:1 yang mungkin memakai nama chats/messages).
-- Sudah punya data di tabel lama `chats`/`messages`? Lihat supabase/migrasi_ai_tabel.sql.

-- 1) ai_chats
create table if not exists public.ai_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  type       text not null default 'bebas' check (type in ('bebas', 'gunung', 'konser', 'trip')),
  created_at timestamptz not null default now()
);
-- Mendukung query riwayat: where user_id = ? order by created_at desc limit 20
create index if not exists ai_chats_user_created_idx on public.ai_chats (user_id, created_at desc);

-- 2) ai_messages
create table if not exists public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  chat_id    uuid not null references public.ai_chats (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_chat_created_idx on public.ai_messages (chat_id, created_at desc);

-- 3) Row Level Security: setiap orang hanya melihat dan mengubah datanya sendiri
alter table public.ai_chats    enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_chats_own" on public.ai_chats;
create policy "ai_chats_own" on public.ai_chats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_messages_own" on public.ai_messages;
create policy "ai_messages_own" on public.ai_messages for all
  using (exists (select 1 from public.ai_chats c where c.id = chat_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_chats c where c.id = chat_id and c.user_id = auth.uid()));
