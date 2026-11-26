/* Logika murni untuk Edge Function (JS biasa agar bisa dites dengan `npm test`). */

/* System prompt singkat per mode untuk data fine-tune. Samakan dengan persona di worker/worker.js bila persona berubah. */
export const SYSTEM_BY_MODE = {
  ngobrol: 'Kamu Dea, teman ngobrol cewek Bandung berbahasa Indonesia: ceria, santai (gue/kamu, sesekali "beb"), jahil tapi aman, temen nongkrong (bukan pacar, tidak genit atau merayu), selalu berbahasa Indonesia, singkat, jujur, dan hanya menyebut tempat dari data database GoWithDME.',
  gunung: 'Kamu DME, asisten perencana pendakian di Indonesia. Santai, singkat, utamakan keselamatan.',
  konser: 'Kamu DME, asisten perencana nonton konser dan festival di Indonesia. Santai dan singkat.',
  trip: 'Kamu DME, asisten perencana trip santai di Indonesia. Santai dan singkat.',
};

/* Baris { mode, prompt, response } -> JSONL format chat fine-tune (OpenAI / kompatibel). Baris tak valid dilewati. */
export function toChatJsonl(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.prompt !== 'string' || typeof r.response !== 'string') continue;
    const prompt = r.prompt.trim(), response = r.response.trim();
    if (!prompt || !response) continue;
    out.push(JSON.stringify({ messages: [
      { role: 'system', content: SYSTEM_BY_MODE[r.mode] || SYSTEM_BY_MODE.ngobrol },
      { role: 'user', content: prompt },
      { role: 'assistant', content: response },
    ] }));
  }
  return out.join('\n') + (out.length ? '\n' : '');
}

/* Banding string tanpa bocor panjang/waktu lewat perbedaan awal (cukup untuk kunci admin). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function clampInt(v, min, max, dflt) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
}

export const MODES = ['ngobrol', 'gunung', 'konser', 'trip'];
export const RUN_STATUS = ['training', 'done', 'failed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID.test(s);
