# HANDOFF Dea AI — per 27 November 2026

## Tujuan
Dea AI (ai.gowithdme.com) bergaya Felo.ai. Branding pink #EC4899 + ungu, Plus Jakarta Sans, ikon Lucide inline. Dikerjakan bertahap untuk hemat limit.

## Stack dan deploy
Lihat README.md. Ringkas: repo calvfinka/dea-statis (main); `git push` otomatis deploy Pages `dea-web` dan Worker `dme-ai`. Login dan riwayat di Supabase.

## Status
| Tahap | Isi | Status |
|---|---|---|
| 1-2 | Halaman awal dan thread | selesai |
| 3 | Kartu sumber, globe | terlihat jalan di HP |
| 4 | Deep Research | terlihat jalan di HP |
| 5 | Slide | pratinjau jalan; Simpan PDF belum dikonfirmasi |
| 6 | Tab Image/Video, link | Video terlihat jalan; Image belum dikonfirmasi |
| 7 | Tombol + | foto terlihat jalan; PDF belum dikonfirmasi |
| 8 | Sumber tersimpan di akun | sudah dipasang, belum diverifikasi |
| 9 | Perapian | sudah dipasang, belum diverifikasi |

## Tahap berikutnya (satu per satu)

### Tahap 10: batasan publik vs user
Sudah ada: tamu 40/hari, 10/menit; user 200/hari, 20/menit (guard.js).
Usulan, BELUM disetujui pemilik:
- Deep Research dan lampiran PDF hanya untuk user login.
- Tamu 20/hari, user 100/hari.
- Pesan ajakan login yang ramah saat tamu memakai fitur khusus user.
Penegakan wajib di Worker (bukan hanya menyembunyikan tombol). Tamu tetap bisa chat biasa.

### Tahap 11: tampilkan sisa jatah
Worker sudah mengirim header X-Quota-Limit dan X-Quota-Remaining. Tampilkan di layar.

### Tahap 12: tes dan bereskan
Uji PDF, Simpan PDF, tab Image, kartu sumber dari akun, mode terang/gelap, tamu vs login.

### Tahap 13 (opsional)
Slide jadi .pptx; tombol Create; Deep Research membaca isi halaman (browse.js); tombol suka/tidak suka.

## Hal yang diketahui
- Sumber pencarian kadang tidak nyambung atau datanya beda tanggal.
- Nomor [n] ditulis model, bisa tidak muncul.
- Lampiran hanya dibaca pada pesan itu.
- File *.bak-chatlog dan dea-patch-stream/ adalah sisa lama. Jangan jalankan apply.sh.
- Project Pages lama `dea-statis` tidak dipakai lagi; hapus setelah yakin.

## Aturan
- Jangan ubah personality Dea, routing domain, atau logika Supabase/js/app.js tanpa alasan kuat.
- Kirim hanya file yang berubah dalam ZIP, plus langkah untuk Codespace.
- Jangan menaruh kunci API di repo.
- Push: git pull ; unzip -o <zip> ; git add <file> ; git commit ; git pull --rebase ; git push

## Cara mulai sesi baru
Kirim ZIP repo terbaru + file ini, lalu tulis: "kerjakan tahap 10".
