# Patch: streaming tampil langsung + timeout rantai model

js/app.js
- remoteReply membaca stream (getReader), teks muncul selagi mengalir (bubble `.msg.live`).
- Batas 45 dtk jadi batas DIAM (reset tiap ada byte), bukan batas total.
- Penanda `<!--...-->` dan "_Dea lagi mikir..._" dibersihkan aman untuk teks setengah jadi.
- Tombol Stop membatalkan stream. Bila putus di tengah, teks yang sudah datang dipakai.

worker/worker.js
- Batas token-pertama: Gemini 12 dtk, Groq 15 dtk (dulu 20 dtk semua). Terburuk 12+15+15 = 42 dtk < 45 dtk klien.
- Bisa diatur tanpa ubah kode: env GEMINI_FIRST_MS, GROQ_FIRST_MS (teks biasa di wrangler.toml [vars]).
- Jalur lampiran (foto/PDF) tidak diubah.

Batalkan: git checkout -- js/app.js worker/worker.js
