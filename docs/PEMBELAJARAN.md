# Sistem "belajar" ai.gowithdme.com (Supabase sebagai gudang data)

Model (Groq/Gemini) tidak berubah sendiri. Supabase hanya **menyimpan, menyaring, dan memicu**. Ada dua jalur belajar:

| Jalur | Cara kerja | Perlu training ulang? |
|---|---|---|
| **A. Few-shot (instan)** | Worker menyisipkan 3 contoh jawaban 👍 yang sudah *approved* ke prompt | Tidak |
| **B. Fine-tune (berkala)** | Edge Function mengekspor JSONL, kamu latih di OpenAI / HuggingFace / lokal | Ya |

```
Pengguna login tekan 👍/👎 ──> rpc rate_message ──> training_logs (approved = false)
                                                        │  admin tinjau view training_review, set approved = true
                              ┌─────────────────────────┴───────────────────────┐
                              ▼ (A)                                             ▼ (B)
              Worker baca contoh approved                      export-training → JSONL → fine-tune
              → few-shot di prompt                                     │
                                                       training-complete (done/failed) → webhook CI/CD
```

## Setup (sekali)

1. **SQL Editor**: jalankan `supabase/schema.sql` (kalau belum), lalu `supabase/learning.sql`.
2. **Edge Functions** (butuh Supabase CLI, `supabase link --project-ref <ref>`):
   ```
   supabase secrets set TRAINING_ADMIN_KEY=$(openssl rand -hex 32)
   supabase secrets set PIPELINE_WEBHOOK_URL=https://...   # opsional, dipanggil saat training "done"
   supabase functions deploy export-training --no-verify-jwt
   supabase functions deploy training-complete --no-verify-jwt
   ```
   Simpan nilai `TRAINING_ADMIN_KEY` (dipakai sebagai header `x-admin-key`).
3. **Worker (jalur A)**: `cd worker && bash deploy.sh`. Saat diminta, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_KEY` (service_role, **rahasia, hanya di Worker**). Kosongkan = jalur A mati, sisanya normal.
4. **Frontend**: tidak ada env baru. Push ke `main` seperti biasa.

## Pemakaian harian

**Tinjau & setujui** (SQL Editor):
```sql
select * from training_review limit 50;                       -- 👍 yang belum disetujui
update training_logs set approved = true where id in ('…');   -- setujui; jalur A langsung memakainya (cache maks 10 menit)
```
Cek isi dulu: tolak yang berisi data pribadi, fakta usang (jadwal/harga), atau jawaban yang sebenarnya kurang bagus.

**Ekspor & latih (jalur B)**:
```
curl -D - -H "x-admin-key: $KEY" "https://<ref>.supabase.co/functions/v1/export-training?limit=500&mode=ngobrol" -o train.jsonl
# header x-run-id = id run. Latih train.jsonl di platform pilihanmu (OpenAI fine-tune butuh minimal 10 contoh).
curl -X POST -H "x-admin-key: $KEY" -H "content-type: application/json" \
  -d '{"run_id":"<x-run-id>","status":"done","model_name":"ft:..."}' \
  https://<ref>.supabase.co/functions/v1/training-complete
```
`status: "failed"` mengembalikan contoh ke antrean sehingga bisa diekspor ulang. Contoh yang sudah diekspor tidak diekspor dua kali.

## Keamanan & privasi
- Pengguna tidak punya akses langsung ke tabel (RLS tanpa policy); satu-satunya pintu adalah `rate_message()`.
- `approved` hanya bisa diubah admin, jadi rating massal/palsu tidak masuk ke model.
- Email, nomor telepon Indonesia, dan angka ≥12 digit disamarkan di database (`scrub_pii`). Ini penyaring dasar, **bukan jaminan**; tetap tinjau manual.
- Hanya pengguna login yang bisa menilai, dan hanya pasangan pesan yang dinilai yang disimpan. Chat tamu tidak pernah disimpan.
- Baris terhapus otomatis bila akun dihapus (`on delete cascade`).
- Tambahkan satu kalimat di Kebijakan Privasi gowithdme.com bahwa jawaban yang dinilai dapat dipakai untuk meningkatkan AI.

## Batas yang perlu diketahui
- Model di Worker saat ini (Groq/Gemini via API) tidak bisa di-fine-tune dari sini; hasil jalur B baru terpakai bila kamu mengganti pemanggilan model di `worker.js` ke model hasil latih.
- `SYSTEM_BY_MODE` di `supabase/functions/_shared/format.js` adalah ringkasan persona; samakan dengan `worker/worker.js` bila persona berubah.
- `learning.sql` dan Edge Function belum dijalankan terhadap proyek Supabase sungguhan di lingkungan ini (tidak ada akses jaringan); logika JS-nya sudah dites (`npm test`). Coba dulu di proyek staging / data kecil.
