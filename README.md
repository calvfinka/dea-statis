# Dea AI — GoWithDME (statis + login Supabase + Worker Cloudflare)

Situs statis tanpa build. Tidak perlu `npm install`.

## Isi
```
index.html   css/style.css   js/app.js   js/auth.js   assets/ (favicon.svg, og.jpg)   CNAME   .nojekyll
worker/      kode Worker Cloudflare `dme-ai` (otak Dea, jatah, memori, pencarian)
supabase/    SQL tabel + edge function (schema.sql, learning.sql, dll.)
docs/        catatan lama dari repo ai
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

## Deploy Worker (dari folder `worker/`)
```
cd worker
bash deploy.sh        # deploy + isi secret lewat terminal
```
Secret (isi di Cloudflare > dme-ai > Settings > Variables and Secrets, tipe Secret):
`GEMINI_API_KEY`, `GROQ_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ALERT_WEBHOOK_URL` (webhook Discord),
`TAVILY_API_KEY` atau `SERPER_API_KEY` (opsional, pencarian internet), `BROWSER_LOG_SECRET` (opsional).
Nama model (teks biasa) ada di `worker/wrangler.toml`: `GEMINI_MODEL`, `GEMINI_LITE_MODEL`, `GROQ_MODEL`, `GROQ_VISION_MODEL`.
Cek hidup: `https://dme-ai.calvfinka.workers.dev/health`

## Pencatatan obrolan (untuk admin > AI (Dea) > Percakapan)
Tanpa persetujuan, tidak ada isi chat yang dicatat. Pengguna memilih lewat kotak sekali muncul, atau kapan saja lewat saklar **Catat obrolan saya** di jendela profil (`js/chatlog.js`). Worker mencatat lewat `worker/chatlog.js` (butuh secret `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY`). Jalankan `supabase/admin_ai_chat.sql` dari repo admin lebih dulu. Uji: `node tests/chatlog.test.mjs`.
