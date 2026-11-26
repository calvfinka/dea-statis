# Dea AI — GoWithDME (statis + login Supabase + Worker Cloudflare)

Situs statis tanpa build. Tidak perlu `npm install`.

## Isi
```
index.html   css/style.css   js/app.js   js/auth.js   assets/ (favicon.svg, og.jpg)   CNAME   .nojekyll
```

## Yang tersambung
- **Login Supabase**: proyek yang sama dengan gowithdme.com (Google, Facebook, Discord, GitHub, email + password, link masuk, lupa password). Daftar akun baru tetap di gowithdme.com.
- **Worker Cloudflare `dme-ai`**: pesan dikirim ke `https://dme-ai.calvfinka.workers.dev`. Bila login, header `Authorization: Bearer <token>` ikut terkirim, jadi jatah dan memori Dea dihitung per akun. Tamu tetap bisa chat (jatah lebih kecil). Bila Worker gagal, Dea menjawab dari otak lokal.
- **Riwayat di akun**: tabel `ai_chats` + `ai_messages` (`supabase/schema.sql` di repo `ai` lama). Tamu: localStorage saja. Saat keluar, chat milik akun dihapus dari perangkat.

## Setup sekali
1. Supabase > Authentication > URL Configuration > Redirect URLs: tambahkan `https://ai.gowithdme.com/**`. Site URL tetap `https://gowithdme.com`.
2. SQL Editor: pastikan tabel `ai_chats` dan `ai_messages` ada (jalankan `schema.sql` dari repo lama bila belum).
3. Worker: `ALLOWED_ORIGINS` sudah memuat `https://ai.gowithdme.com` (tidak perlu diubah).
4. GitHub Pages: Settings > Pages > Deploy from a branch > `main` / root.

## Uji
Buka https://ai.gowithdme.com, tekan **Masuk**, login, kirim pesan. Cek di Supabase tabel `ai_messages` terisi dan di Cloudflare > dme-ai > Metrics ada Invocations.
