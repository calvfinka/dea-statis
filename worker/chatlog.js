/* Pencatat percakapan Dea untuk admin.gowithdme.com > AI > Percakapan (tabel ai_chat_sessions + ai_chat_messages,
   supabase/admin_ai_chat.sql di repo admin). Pembungkus: tidak mengubah alur jawaban, gagal diam-diam, dan hanya mencatat
   bila klien mengirim chat_log:true setelah pengguna menyetujui pemberitahuan (js/chatlog.js). */
import { pseudonym } from './usage.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 8000;

/* Ambil bagian yang perlu dari body permintaan. null = jangan catat. */
export function parseLogReq(raw) {
  let d;
  try { d = JSON.parse(raw); } catch (e) { return null; }
  if (!d || d.voice === true || d.chat_log !== true) return null;
  const h = Array.isArray(d.history) ? d.history : [];
  let prompt = '';
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i] && h[i].role === 'user' && typeof h[i].content === 'string') { prompt = h[i].content; break; }
  }
  if (!prompt && typeof d.message === 'string') prompt = d.message;
  prompt = prompt.trim();
  if (!prompt) return null;
  return {
    chatId: UUID.test(String(d.chat_id || '')) ? d.chat_id : null,
    mode: typeof d.mode === 'string' ? d.mode.slice(0, 20) : null,
    uid: typeof d.user_id === 'string' ? d.user_id : '',
    prompt: prompt.slice(0, MAX),
  };
}

/* Buang penanda layar (kartu, "lagi mikir", penanda internet) sama seperti cleanReply di klien. */
export function cleanText(t) {
  return String(t || '')
    .replace(/<!--[\s\S]*?-->\n?/g, '')
    .replace(/<!--[\s\S]*$/, '')
    .replace(/^\s*_Dea lagi mikir\.\.\._\s*/, '')
    .trim();
}

/* Baca isi jawaban penuh dari cabang body: JSON {text} atau teks alir. */
export async function readReply(stream, contentType) {
  const txt = await new Response(stream).text();
  if (/json/i.test(contentType || '')) {
    try { const j = JSON.parse(txt); return cleanText(j && j.text); } catch (e) { return ''; }
  }
  return cleanText(txt);
}

const base = (env) => String(env.SUPABASE_URL).replace(/\/+$/, '');
const svc = (env) => ({ apikey: env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' });

/* Tulis satu pasang tanya-jawab. Akun login: id dari token (ditanyakan ke Supabase). Tamu: pseudonim perangkat. */
export async function logChat(env, o) {
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || env.CHAT_LOG === 'off') return 'skip';
    if (!o.reply) return 'skip';
    let userId = null;
    if (o.token) {
      const r = await fetch(base(env) + '/auth/v1/user', { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + o.token } });
      if (r.ok) userId = ((await r.json()) || {}).id || null;
    }
    const device = userId ? null : await pseudonym(o.uid, env.USAGE_SALT);
    if (!userId && !device) return 'skip';
    const sid = o.chatId || crypto.randomUUID();
    const H = { ...svc(env), Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY };
    const cf = o.cf || {};
    const a = await fetch(base(env) + '/rest/v1/ai_chat_sessions?on_conflict=id', {
      method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: sid, user_id: userId, device, city: cf.city || null, region: cf.region || null, country: cf.country || null, mode: o.mode, last_at: new Date().toISOString() }),
    });
    if (!a.ok) throw new Error('sesi HTTP ' + a.status);
    const b = await fetch(base(env) + '/rest/v1/ai_chat_messages', {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify([{ session_id: sid, role: 'user', content: o.prompt }, { session_id: sid, role: 'assistant', content: o.reply.slice(0, MAX) }]),
    });
    if (!b.ok) throw new Error('pesan HTTP ' + b.status);
    return 'ok';
  } catch (e) {
    console.error('CHAT_LOG_FAIL', e && e.message);
    return 'fail';
  }
}

/* Bungkus handler Worker. Jawaban tetap mengalir ke pengguna; satu cabang salinan dibaca di latar belakang. */
export function wrapChatLog(core) {
  return {
    ...core, // scheduled() dan lainnya diteruskan apa adanya
    async fetch(request, env, ctx) {
      if (request.method !== 'POST' || !ctx || !ctx.waitUntil || env.CHAT_LOG === 'off') return core.fetch(request, env, ctx);
      let copy = null;
      try { copy = request.clone(); } catch (e) { copy = null; }
      const res = await core.fetch(request, env, ctx);
      try {
        if (!copy || !res || res.status !== 200 || !res.body) return res;
        const info = parseLogReq(await copy.text());
        if (!info) return res;
        const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || null;
        const cf = request.cf || {};
        const [toUser, toLog] = res.body.tee();
        ctx.waitUntil(readReply(toLog, res.headers.get('Content-Type')).then((reply) => logChat(env, { ...info, reply, token, cf })));
        return new Response(toUser, { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) {
        return res;
      }
    },
  };
}
