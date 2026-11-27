# Dea AI — GoWithDME

Asisten ngobrol Dea di **https://ai.gowithdme.com**. Situs statis tanpa build (tidak perlu `npm install`), login lewat Supabase, otaknya di Cloudflare Worker `dme-ai`.

## Isi repo

```
index.html  css/style.css  assets/  CNAME  .nojekyll      situs (GitHub Pages)
js/app.js        antarmuka chat, kirim pesan ke Worker, riwayat lokal
js/auth.js       login Supabase + riwayat di akun (ai_chats, ai_messages)
js/chatlog.js    persetujuan + saklar "Catat obrolan saya"
prompt/          teks system prompt Dea
worker/          kode Worker Cloudflare `dme-ai` (lihat di bawah)
supabase/        SQL tabel + edge function (export-training, training-complete)
docs/            PEMBELAJARAN.md, PERUBAHAN_SUPABASE.md
tests/           chatlog.test.mjs
PATCH-GROK.md    catatan pindah model utama ke Grok
```

Berkas `*.bak-chatlog` hanya salinan cadangan dari pemasangan pencatat chat. Boleh dihapus.

## Yang tersambung

- **Login Supabase**: proyek yang sama dengan gowithdme.com (Google, Facebook, Discord, GitHub, email + password, link masuk, lupa password). Daftar akun baru tetap di gowithdme.com.
- **Worker `dme-ai`**: pesan dikirim ke `https://dme-ai.calvfinka.workers.dev`. Bila login, header `Authorization: Bearer <token>` ikut terkirim, jadi jatah dan memori Dea dihitung per akun. Tamu tetap bisa chat dengan jatah lebih kecil. Bila Worker gagal, Dea menjawab dari otak lokal.
- **Model**: Grok (xAI) sebagai utama, lalu Gemini, lalu Groq sebagai cadangan bila yang di depannya gagal. Detail di `PATCH-GROK.md`.
- **Riwayat di akun**: tabel `ai_chats` + `ai_messages`. Tamu hanya di localStorage. Saat keluar, chat milik akun dihapus dari perangkat.
- **Panel admin**: admin.gowithdme.com > AI (Dea) membaca angka pemakaian, ulasan jawaban, dan (bila pengguna setuju) isi percakapan.

## Setup sekali

1. Supabase > Authentication > URL Configuration > Redirect URLs: tambahkan `https://ai.gowithdme.com/**`. Site URL tetap `https://gowithdme.com`.
2. GitHub Pages: Settings > Pages > Deploy from a branch > `main` / root.
3. Jalankan SQL di Supabase > SQL Editor, **berurutan** (semuanya aman diulang):

| Urutan | Berkas | Untuk |
|---|---|---|
| 1 | `supabase/schema.sql` | tabel `ai_chats`, `ai_messages` |
| 2 | `supabase/learning.sql` | penilaian 👍/👎, antrean data latihan |
| 3 | `supabase/privasi_v5.sql` | penyaring data pribadi, hapus otomatis |
| 4 | `supabase/admin_ai.sql` | angka pemakaian untuk panel admin (butuh `schema_rbac.sql` dari repo situs utama) |
| 5 | `supabase/places.sql` (+ `places_seed.sql`) | data tempat untuk Dea |
| 6 | `supabase/admin_ai_chat.sql` **dari repo admin** | tabel dan fungsi tab Percakapan |

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
