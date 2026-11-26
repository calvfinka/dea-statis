# Supabase: nama tabel aman, rating anti-palsu, keep-alive (24 Nov 2026)

| Berkas | Perubahan |
|---|---|
| `supabase/schema.sql`, `lib/history.js` | `chats`/`messages` -> `ai_chats`/`ai_messages` (tidak bentrok dengan tabel situs utama). RLS + indeks ikut diganti nama |
| `supabase/migrasi_ai_tabel.sql` (BARU) | Cara menyalin riwayat lama (blok dikomentari; cek dulu tabel lama memang milik AI) |
| `supabase/learning.sql`, `lib/feedback.js`, `components/Message.jsx` | `rate_message(p_message_id, p_rating)`: teks diambil database dari `ai_messages`, bukan dari browser. Fungsi lama 5-argumen dihapus (pintu yang bisa dipalsukan) |
| `worker/worker.js` | `pingSupabase()` dipanggil cron harian: 1 query ringan agar proyek gratis tidak dijeda (7 hari). Gagal hanya tercatat di log `SUPABASE_PING_FAIL` |
| `tests/learning.test.mjs` | +2 tes (110 total lulus) |

**Urutan terbit:** (1) SQL Editor: `schema.sql`, lalu `learning.sql`, lalu (bila perlu) `migrasi_ai_tabel.sql`; (2) `cd worker && bash deploy.sh`; (3) push frontend. Antara langkah 1 dan 3, riwayat versi lama tidak tersimpan dan rating gagal (tanpa merusak data), jadi lakukan berurutan dan cepat.

Catatan tambahan (dokumen lain belum diubah, tambahkan bila perlu):
- README.md, bagian Setup Supabase: sebut `ai_chats` + `ai_messages`, dan `learning.sql` dijalankan ulang (rate_message diperbarui).
- PEMBELAJARAN.md: `rate_message(id_pesan, rating)`; teks dibaca database dari `ai_messages`, jadi pesan harus sudah tersimpan agar bisa dinilai.
- Keep-alive butuh secret `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` di Worker.
