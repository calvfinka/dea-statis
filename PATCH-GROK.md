# Patch Grok — DEA tetap yang lama

Yang dikunci (tidak diubah):

- Personality / system prompt Dea (`NGOBROL_PERSONA`). Tetap cewek Bandung, "gue", santai, manja kalau diajak.
- Gaya gombalan dan sinyal "kangen" / "gombalin aku". Itu di `worker/mind.js` (`RE_ROMANCE`, `ROMANCE_HINT`). Berkas ini byte-sama dengan yang lama.
- Routing `ai.gowithdme.com`. `CNAME` tetap. Fetch chat di `js/app.js` (`remoteReply`) tetap ke `https://dme-ai.calvfinka.workers.dev`. `index.html` tidak disentuh.
- Kunci lama tidak dipindah, tidak dicetak, tidak ditulis di file.

Yang berubah:

| Bagian | Isi |
|---|---|
| Model utama | `grok-4.7` lewat secret `GROK_API_KEY` |
| Base URL | `https://api.x.ai/v1/chat/completions` |
| Body | `messages`, `temperature` (dari mind, ngobrol ~0.8), `max_tokens` 4000, `stream`, `reasoning_effort: "low"` |
| Balasan | `choices[0].message.content` / stream `choices[0].delta.content`. Proses mikir tidak dikirim ke chat. |
| Cadangan | Gemini lalu Groq, hanya kalau Grok gagal |
| Suara | `POST /` body `{ "voice": true, "text": "..." }` → `https://api.x.ai/v1/tts`, `voice_id` `iris`, `language` `id`. Kalau gagal, suara browser yang lebih natural. |

Pasang kunci (jangan taruh di file):

```
cd worker
npx wrangler secret put GROK_API_KEY
npx wrangler deploy
```

Ganti model atau suara tanpa ubah kode: `GROK_MODEL` dan `GROK_VOICE` di `worker/wrangler.toml`, lalu deploy ulang.

Cek: `https://dme-ai.calvfinka.workers.dev/health` → `"grok": true` dan `"voice": true`. Isinya cuma ada/tidak, bukan kunci.
