# Dea AI — GoWithDME

Asisten Dea di **https://ai.gowithdme.com**: chat, jawaban bersumber, Deep Research, tab gambar/video, lampiran, dan slide. Situs statis tanpa `npm install`.

## Alur deploy

`git push` ke `main` otomatis memperbarui dua hal:

| Bagian | Layanan Cloudflare | Isi |
|---|---|---|
| Tampilan | Pages `dea-web` | `index.html`, `css/`, `js/*.js`, `assets/` |
| Otak Dea | Worker `dme-ai` | `worker/` |

Build command `dea-web` (output `dist`):

```
mkdir -p dist/css dist/js && cp index.html dist/ && cp css/style.css dist/css/ && cp js/*.js dist/js/ && cp -r assets dist/
```

GitHub Pages sudah dimatikan. DNS: CNAME `ai` -> `dea-web.pages.dev`. Setiap mengubah CSS/JS, naikkan `?v=N` di `index.html`.

## Isi repo

```
index.html  css/style.css  assets/
js/app.js        chat, kirim ke Worker, riwayat lokal
js/auth.js       login Supabase + riwayat di akun
js/home.js       halaman awal
js/thread.js     tampilan jawaban, kartu sumber, tab Image/Video, slide
js/attach.js     tombol + (foto, PDF, teks)
js/chatlog.js    persetujuan pencatatan obrolan
worker/          Worker `dme-ai`
supabase/        SQL + edge function
tests/           chatlog.test.mjs
```

## Fitur

| Fitur | Catatan |
|---|---|
| Kartu sumber + sitasi [n] | butuh `TAVILY_API_KEY` atau `SERPER_API_KEY` |
| Tombol globe | mati = tanpa pencarian web |
| Deep Research | 3 pencarian, membaca cuplikan (bukan halaman penuh) |
| Tab Image / Video | filter aman hanya dipasang untuk Serper |
| Lampiran | maks 4; PDF 4 MB, teks 200 KB, foto diperkecil otomatis |
| Slide | disusun di perangkat; simpan PDF atau HTML |

## Batas pemakaian (`worker/guard.js`)

| | Tamu (publik) | Login (user) |
|---|---|---|
| Jatah per hari (reset 00.00 WIB) | 40 | 200 |
| Permintaan per menit | 10 | 20 |

Biaya: chat 1, buka tab Image/Video 1, Deep Research 3, foto/PDF 3. Tamu dihitung per alamat IP, user per akun.
Ubah lewat `QUOTA_GUEST`, `QUOTA_USER`, `BURST_GUEST`, `BURST_USER` di `worker/wrangler.toml` (hapus tanda `#`), lalu push.

## Setup sekali

1. Supabase > Authentication > URL Configuration > Redirect URLs: tambahkan `https://ai.gowithdme.com/**`. Site URL tetap `https://gowithdme.com`.
2. Cloudflare Pages `dea-web` tersambung ke repo ini (lihat Alur deploy).
3. Jalankan SQL di Supabase > SQL Editor, **berurutan** (semuanya aman diulang):

| Urutan | Berkas | Untuk |
|---|---|---|
| 1 | `supabase/schema.sql` | tabel `ai_chats`, `ai_messages` |
| 2 | `supabase/learning.sql` | penilaian 👍/👎, antrean data latihan |
| 3 | `supabase/privasi_v5.sql` | penyaring data pribadi, hapus otomatis |
| 4 | `supabase/admin_ai.sql` | angka pemakaian untuk panel admin (butuh `schema_rbac.sql` dari repo situs utama) |
| 5 | `supabase/places.sql` (+ `places_seed.sql`) | data tempat untuk Dea |
| 6 | `supabase/admin_ai_chat.sql` **dari repo admin** | tabel dan fungsi tab Percakapan |
| 7 | `supabase/sumber.sql` | kolom `sources` supaya kartu sumber tersimpan di akun |

`supabase/cek_trigger.sql` hanya untuk memeriksa bahwa pendaftaran pengguna baru di situs utama tidak rusak (hasil `versi_utama = true` berarti aman). `migrasi_ai_tabel.sql` hanya bila perlu menyalin riwayat dari tabel lama.

## Deploy Worker

Worker `dme-ai` tersambung ke GitHub (Cloudflare Workers Builds). Setiap `git push` ke `main` otomatis ter-deploy. Cek di Cloudflare > Workers & Pages > `dme-ai` > Deployments (sumbernya tertulis GitHub).

Deploy manual (bila perlu), dari folder `worker/`:

```
cd worker
bash deploy.sh        # deploy + isi secret lewat terminal (Enter kosong = lewati)
```

Deploy tidak menghapus secret. Nilai di blok `[vars]` pada `worker/wrangler.toml` bisa menimpa nilai teks yang hanya diisi lewat dashboard.

**Secret** (Cloudflare > dme-ai > Settings > Variables and Secrets, tipe Secret):

| Secret | Fungsi |
|---|---|
| `GROK_API_KEY` | model utama |
| `GEMINI_API_KEY`, `GROQ_API_KEY` | model cadangan |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | memori, pemakaian, pencatat obrolan (pakai kunci **service_role**) |
| `ALERT_WEBHOOK_URL` | peringatan ke Discord |
| `TAVILY_API_KEY` atau `SERPER_API_KEY` | pencarian internet (opsional) |
| `BROWSER_LOG_SECRET` | baca halaman web lewat aturan browser (opsional) |

Nama model dan suara (teks biasa) ada di `worker/wrangler.toml`: `GROK_MODEL`, `GROK_VOICE`, `GEMINI_MODEL`, `GEMINI_LITE_MODEL`, `GROQ_MODEL`, `GROQ_VISION_MODEL`.

Cek hidup: `https://dme-ai.calvfinka.workers.dev/health` (hanya menampilkan ada/tidaknya kunci, bukan isinya).

## Isi folder `worker/`

| Berkas | Peran |
|---|---|
| `worker.js` | pintu masuk, merangkai jawaban, urutan model |
| `chatlog.js` | pencatat percakapan untuk panel admin (lihat bawah) |
| `research.js` | Deep Research |
| `media.js` | tab Image / Video |
| `guard.js` | jatah dan batas kecepatan per akun/tamu (Durable Object `Limiter`) |
| `usage.js` | catatan pemakaian anonim (`ai_usage`), pseudonim perangkat |
| `memory.js` | memori per akun |
| `search.js`, `browse.js` | pencarian internet dan baca halaman |
| `places.js`, `site.js` | data tempat dan data situs GoWithDME |
| `mind.js` | membaca suasana pesan dan memilih rencana jawaban |
| `kb.js`, `kb2.js`, `komunikasi.js`, `claude.js` | pengetahuan dan logika jawaban pendukung |

Persona Dea dan gaya jawabannya dikunci di `worker.js` (`NGOBROL_PERSONA`) dan `mind.js`. Jangan diubah tanpa sengaja.

## Pencatatan obrolan (untuk admin > AI (Dea) > Percakapan)

**Tanpa persetujuan pengguna, tidak ada isi chat yang dicatat.** Alurnya:

1. Pengguna memilih lewat kotak yang muncul sekali di ai.gowithdme.com, atau kapan saja lewat saklar **Catat obrolan saya** di jendela profil (`js/chatlog.js`). Pilihan disimpan di browser (`dea_chatlog`).
2. Bila menyala, `js/app.js` menambahkan `chat_log`, `chat_id`, dan `persona` ke permintaan.
3. `worker/chatlog.js` membungkus Worker: jawaban tetap mengalir ke pengguna, satu salinan dibaca di latar belakang lalu ditulis ke Supabase (`ai_chat_sessions`, `ai_chat_messages`). Gagal diam-diam, jadi chat Dea tidak ikut gagal bila Supabase bermasalah.
4. Yang disimpan: isi pesan, mode, suasana Dea, kota/provinsi kasar dari Cloudflare (bukan GPS, bukan IP), akun (bila login) atau pseudonim perangkat (tamu). Masa simpan 90 hari.
5. Hanya Pemilik yang bisa membacanya, lewat panel admin; setiap pembukaan tercatat di log audit.

Matikan total tanpa mengubah kode: isi variabel teks `CHAT_LOG = "off"` di Worker.

Bila kolom `persona` belum ada di Supabase (SQL admin lama), chat tetap tercatat tanpa suasana Dea sampai `admin_ai_chat.sql` terbaru dijalankan.

Perbarui halaman Privasi di gowithdme.com agar menyebut pencatatan ini. Permintaan hapus data lewat `personal@gowithdme.com` dilayani dengan tombol "Hapus riwayat orang ini" di panel admin.

## Belajar dari penilaian (tab Pelatihan di admin)

Tab Pelatihan menghitung jawaban yang dinilai 👍 pengguna lalu disetujui Pemilik di tab Tinjau jawaban. Penjelasan lengkap ada di `docs/PEMBELAJARAN.md`.

- Ekspor data latihan: deploy edge function `export-training` dan `training-complete`
  ```
  supabase functions deploy export-training --no-verify-jwt
  supabase functions deploy training-complete --no-verify-jwt
  supabase secrets set TRAINING_ADMIN_KEY=<kunci-panjang-acak>
  ```
- Catatan: tombol 👍/👎 belum ada di antarmuka ini, jadi angka di tab Pelatihan akan tetap 0 sampai tombol itu ditambahkan.

## Uji

- Fungsional: buka https://ai.gowithdme.com, tekan **Masuk**, login, kirim pesan. Cek tabel `ai_messages` di Supabase terisi dan di Cloudflare > dme-ai > Metrics ada Invocations.
- Pencatat obrolan: nyalakan saklar di profil, kirim satu chat, lalu buka admin > AI (Dea) > Percakapan.
- Otomatis: `node tests/chatlog.test.mjs`

Bila chat tidak muncul di admin, cari `CHAT_LOG_FAIL` di Cloudflare > dme-ai > Observability. Penyebab paling sering: `SUPABASE_SERVICE_KEY` belum terisi atau bukan kunci service_role, atau `admin_ai_chat.sql` belum dijalankan.

## Jangan dijalankan

- `dea-patch-stream/apply.sh`: itu versi lama. Menjalankannya menimpa `worker/worker.js` dan `js/app.js` sehingga pencatat chat, Grok, dan persona saat ini hilang.
- `PATCH-worker-chat-log.md` dari repo admin: cara lama, sudah digantikan `worker/chatlog.js`. Bila dipasang juga, chat tercatat dua kali.
