-- Tabel tempat (cafe dsb) untuk Dea di ai.gowithdme.com.
-- Worker membaca tabel ini (hanya baris active = true) lewat REST dengan kunci anon + RLS, jadi TIDAK butuh secret baru.
-- Jalankan di SQL Editor Supabase (proyek yang sama dengan schema.sql). Aman dijalankan ulang.
-- Aturan emas: kolom yang tidak diketahui dibiarkan NULL. Dea akan bilang "belum ada data", bukan menebak.

create table if not exists public.places (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (length(btrim(name)) between 2 and 120),
  category      text not null default 'cafe' check (category in ('cafe', 'resto', 'wisata', 'taman', 'lainnya')),
  city          text not null default 'Bandung',          -- Bandung Raya (kota + kabupaten + Bandung Barat)
  area          text,                                      -- kawasan: Dago, Braga, Lembang, ...
  address       text,
  lat           numeric(9, 6) check (lat between -90 and 90),
  lng           numeric(9, 6) check (lng between -180 and 180),
  tags          text[] not null default '{}'
                check (tags <@ array['tenang', 'ramai', 'kerja', 'outdoor', 'view', 'estetik', 'keluarga', '24jam', 'live-music']::text[]),
  price_min     integer check (price_min >= 0),            -- rupiah, harga menu termurah / "mulai dari"
  price_max     integer check (price_max >= 0),
  opening_hours text,                                      -- teks bebas, mis. '08.00-22.00 setiap hari'
  description   text check (description is null or length(description) <= 300),
  maps_url      text check (maps_url is null or maps_url ~ '^https://'),
  source_url    text,                                      -- dari mana data ini diambil
  verified      boolean not null default false,            -- true = sudah dicek langsung oleh tim GWM
  verified_at   timestamptz,
  active        boolean not null default true,             -- false = disembunyikan dari Dea dan publik
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint places_price_order check (price_min is null or price_max is null or price_min <= price_max),
  constraint places_verified_at check (not verified or verified_at is not null)
);

create index if not exists places_tags_idx on public.places using gin (tags);

create or replace function public.places_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists places_touch on public.places;
create trigger places_touch before update on public.places for each row execute function public.places_touch();

-- RLS: siapa pun (anon + login) boleh MEMBACA baris aktif. Tidak ada policy tulis: hanya SQL Editor / service_role yang bisa mengubah.
alter table public.places enable row level security;
drop policy if exists places_public_read on public.places;
create policy places_public_read on public.places for select to anon, authenticated using (active);
grant select on public.places to anon, authenticated;

-- Cara menandai sudah dicek (setelah kamu cek jam buka, harga, dan alamat sendiri):
--   update public.places set verified = true, verified_at = now() where slug = 'kyomi';
-- Cara menyembunyikan tempat yang sudah tutup:
--   update public.places set active = false where slug = 'kyomi';
