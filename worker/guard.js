/* Penjaga Worker: siapa yang memanggil (akun / tamu) dan berapa banyak yang boleh.

   Yang diperbaiki dibanding versi lama:
   - Batas lama memakai Map di memori. Tiap isolate Worker punya memori sendiri dan bisa dibuang kapan saja,
     jadi batasnya bocor. Sekarang penghitung disimpan di Durable Object (satu per identitas, konsisten, atomik).
     Tanpa binding LIMITER, Worker tetap jalan dengan penghitung memori (cadangan, tidak dijamin).
   - `user_id` dari klien tidak pernah diverifikasi. Sekarang identitas akun berasal dari token login Supabase
     (header Authorization), diperiksa ke server Supabase. Token tidak valid / tidak ada = tamu.
   - Dua jatah: per menit (anti-lonjakan) dan per hari WIB (melindungi kuota API Groq/Gemini). Tamu dibatasi lebih kecil.
   - IPv6 dihitung per /64 (satu rumah/perangkat bisa memutar ribuan alamat dalam satu blok /64).

   Semua fungsi inti murni atau menerima `fetch` lewat parameter, supaya bisa diuji di Node. */

const WIB = 7 * 3600 * 1000;
const DAY = 86400000;

/* Proyek Supabase yang sama dengan lib/supabaseClient.js. Kunci anon memang publik; env boleh menimpa. */
const DEFAULT_SB_URL = 'https://jhqkylnqvhrljpaknjcg.supabase.co';
const DEFAULT_SB_ANON = 'sb_publishable_WEpourxfk4IKga2XyxKucQ_hkmxuJnY';

/* Alamat + kunci Supabase untuk panggilan dari Worker. Kunci anon (publik) bila ada; proyek kustom tanpa kunci anon memakai service key
   (hanya dikirim dari Worker ke Supabase). Dipakai verifyUser dan places.js. */
export function sbAccess(env) {
  const base = String((env && env.SUPABASE_URL) || DEFAULT_SB_URL).replace(/\/+$/, '');
  const key = (env && (env.SUPABASE_ANON_KEY || (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY))) || DEFAULT_SB_ANON;
  return { base, key };
}

export const MEDIA_COST = 3; // foto/PDF jauh lebih mahal (model visi + token masukan besar)

const num = (v, d) => { const n = parseInt(v, 10); return n > 0 ? n : d; };

export function limitsFor(kind, env) {
  env = env || {};
  return kind === 'user'
    ? { burst: num(env.BURST_USER, 20), dayMax: num(env.QUOTA_USER, 200) }
    : { burst: num(env.BURST_GUEST, 10), dayMax: num(env.QUOTA_GUEST, 40) };
}

/* ---------- Alamat IP ---------- */
function expandV6(s) {
  if (s.includes('.')) return null; // ::ffff:1.2.3.4 dan sejenisnya: pakai apa adanya
  const i = s.indexOf('::');
  if (i < 0) { const p = s.split(':'); return p.length === 8 ? p : null; }
  const head = s.slice(0, i) ? s.slice(0, i).split(':') : [];
  const tail = s.slice(i + 2) ? s.slice(i + 2).split(':') : [];
  const fill = 8 - head.length - tail.length;
  return fill < 0 ? null : head.concat(Array(fill).fill('0'), tail);
}

/* IPv4 apa adanya; IPv6 dipangkas ke awalan /64. */
export function ipKey(ip) {
  const s = String(ip == null ? '' : ip).trim().toLowerCase().slice(0, 64) || 'x';
  if (!s.includes(':')) return s;
  const g = expandV6(s);
  return g ? 'v6:' + g.slice(0, 4).map((h) => h.replace(/^0+(?=.)/, '') || '0').join(':') : s;
}

/* ---------- Penghitung (murni) ---------- */
export const dayKey = (now) => new Date(now + WIB).toISOString().slice(0, 10);
const secondsToMidnightWib = (now) => Math.max(1, Math.ceil(((Math.floor((now + WIB) / DAY) + 1) * DAY - WIB - now) / 1000));

/* rec = { w: menit ke-n, n: jumlah permintaan menit itu, d: hari WIB, c: biaya terpakai hari itu }
   Permintaan yang ditolak TIDAK menambah hitungan. Jatah harian dicek "masih ada sisa", jadi permintaan
   mahal terakhir boleh lewat sedikit (sisa 1, biaya 3 -> tetap lolos, hitungan jadi di atas batas). */
export function hit(rec, o) {
  const now = o.now == null ? Date.now() : o.now;
  const r = Object.assign({ w: 0, n: 0, d: '', c: 0 }, rec || {});
  const w = Math.floor(now / 60000), d = dayKey(now);
  if (r.w !== w) { r.w = w; r.n = 0; }
  if (r.d !== d) { r.d = d; r.c = 0; }
  const cost = (o.cost | 0) > 0 ? o.cost | 0 : 1;
  const out = (ok, reason, retryAfter) => ({ rec: r, ok, reason: reason || null, limit: o.dayMax, remaining: Math.max(0, o.dayMax - r.c), retryAfter: retryAfter || 0 });
  if (r.n >= o.burst) return out(false, 'rate', Math.max(1, Math.ceil(((w + 1) * 60000 - now) / 1000)));
  if (r.c >= o.dayMax) return out(false, 'quota', secondsToMidnightWib(now));
  r.n += 1; r.c += cost;
  return out(true);
}

/* Kembalikan biaya satu permintaan yang gagal dilayani (semua model gagal). Hanya bila masih hari WIB yang sama;
   hitungan tidak pernah di bawah 0. Hitungan per menit ikut dikurangi bila masih menit yang sama. */
export function refundRec(rec, o) {
  const now = o.now == null ? Date.now() : o.now;
  const r = Object.assign({ w: 0, n: 0, d: '', c: 0 }, rec || {});
  const cost = (o.cost | 0) > 0 ? o.cost | 0 : 1;
  if (r.d === dayKey(now)) r.c = Math.max(0, r.c - cost);
  if (r.w === Math.floor(now / 60000)) r.n = Math.max(0, r.n - 1);
  return r;
}

/* ---------- Durable Object: satu instans per identitas ---------- */
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.trunc(n))) : d; };

export class Limiter {
  constructor(state) { this.state = state; }
  async fetch(request) {
    let o;
    try { o = await request.json(); } catch (e) { return new Response('bad', { status: 400 }); }
    const rec = await this.state.storage.get('r');
    if (o.refund) {
      const back = refundRec(rec, { cost: clamp(o.cost, 1, 10, 1) });
      await this.state.storage.put('r', back);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }
    const res = hit(rec, { burst: clamp(o.burst, 1, 1000, 10), dayMax: clamp(o.dayMax, 1, 100000, 40), cost: clamp(o.cost, 1, 10, 1) });
    await this.state.storage.put('r', res.rec);
    if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(Date.now() + DAY);
    return new Response(JSON.stringify({ ok: res.ok, reason: res.reason, limit: res.limit, remaining: res.remaining, retryAfter: res.retryAfter }), { headers: { 'Content-Type': 'application/json' } });
  }
  /* Bersihkan identitas yang tidak aktif sejak kemarin supaya penyimpanan tidak menumpuk. */
  async alarm() {
    const rec = await this.state.storage.get('r');
    if (!rec || rec.d < dayKey(Date.now() - DAY)) await this.state.storage.deleteAll();
    else await this.state.storage.setAlarm(Date.now() + DAY);
  }
}

/* ---------- Cadangan memori (bila LIMITER tidak ada / gagal) ---------- */
const mem = new Map();
function memHit(id, args) {
  const res = hit(mem.get(id), args);
  mem.set(id, res.rec);
  if (mem.size > 5000) mem.clear();
  return { ok: res.ok, reason: res.reason, limit: res.limit, remaining: res.remaining, retryAfter: res.retryAfter };
}

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms); })]).finally(() => clearTimeout(t));
}

/* Memotong jatah satu permintaan. Mengembalikan { ok, reason, limit, remaining, retryAfter, via }.
   Gagal menghubungi Durable Object = jangan menjatuhkan layanan: pakai cadangan memori dan catat GUARD_FAIL. */
export async function charge(env, ident, cost) {
  const lim = limitsFor(ident.kind, env);
  const args = { burst: lim.burst, dayMax: lim.dayMax, cost };
  if (env && env.LIMITER && typeof env.LIMITER.idFromName === 'function') {
    try {
      const stub = env.LIMITER.get(env.LIMITER.idFromName(ident.id));
      const r = await withTimeout(stub.fetch('https://limiter/hit', { method: 'POST', body: JSON.stringify(args) }), 1500);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return Object.assign(await r.json(), { via: 'do' });
    } catch (e) { console.error('GUARD_FAIL', e && e.message); }
  }
  return Object.assign(memHit(ident.id, args), { via: 'mem' });
}

/* Mengembalikan jatah yang tadi dipotong charge() bila permintaan akhirnya tidak terlayani. Tidak pernah melempar. */
export async function refund(env, ident, cost) {
  try {
    if (env && env.LIMITER && typeof env.LIMITER.idFromName === 'function') {
      const stub = env.LIMITER.get(env.LIMITER.idFromName(ident.id));
      const r = await withTimeout(stub.fetch('https://limiter/hit', { method: 'POST', body: JSON.stringify({ refund: true, cost }) }), 1500);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return true;
    }
    if (mem.has(ident.id)) mem.set(ident.id, refundRec(mem.get(ident.id), { cost }));
    return true;
  } catch (e) { console.error('REFUND_FAIL', e && e.message); return false; }
}

/* ---------- Identitas ---------- */
export function jwtClaims(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3 || !p[1]) return null;
  try {
    const b = p[1].replace(/-/g, '+').replace(/_/g, '/');
    const j = JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
    return j && typeof j.sub === 'string' && j.sub && typeof j.exp === 'number' ? { sub: j.sub, exp: j.exp } : null;
  } catch (e) { return null; }
}

async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}

const vcache = new Map();
const V_OK = 5 * 60 * 1000;   // token valid diingat 5 menit (tidak melewati masa berlaku token)
const V_BAD = 60 * 1000;      // token ditolak diingat 1 menit: pengirim token sampah tidak memicu panggilan berulang ke Supabase
const V_ERR = 15 * 1000;      // Supabase gagal dihubungi: coba lagi sebentar lagi, sementara jadi tamu

/* Mengembalikan id akun (uuid) bila token valid, selain itu null. Tidak pernah melempar error. */
export async function verifyUser(token, env, o) {
  o = o || {};
  const now = o.now == null ? Date.now() : o.now;
  const f = o.fetch || globalThis.fetch;
  const c = jwtClaims(token);
  if (!c || c.exp * 1000 <= now) return null; // bentuk salah / kedaluwarsa: tanpa panggilan jaringan
  const { base, key } = sbAccess(env);
  const ck = await sha256hex(token);
  const hitc = vcache.get(ck);
  if (hitc && hitc.until > now) return hitc.uid;
  const save = (uid, ms) => { if (vcache.size > 2000) vcache.clear(); vcache.set(ck, { uid, until: Math.min(now + ms, uid ? c.exp * 1000 : Infinity) }); return uid; };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2500);
  try {
    const r = await f(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + token }, signal: ctl.signal });
    if (r.status === 401 || r.status === 403) return save(null, V_BAD);
    if (!r.ok) return save(null, V_ERR);
    const j = await r.json();
    return j && j.id === c.sub ? save(j.id, V_OK) : save(null, V_BAD);
  } catch (e) {
    return save(null, V_ERR);
  } finally { clearTimeout(timer); }
}

/* { kind: 'user' | 'guest', id, ip }. Token tidak valid = tamu (tidak pernah ditolak, supaya sesi kedaluwarsa tidak memutus chat). */
export async function identify(request, env, o) {
  const ip = ipKey(request.headers.get('CF-Connecting-IP'));
  const m = /^Bearer\s+([A-Za-z0-9\-_.]{20,4096})$/.exec(request.headers.get('Authorization') || '');
  if (m) {
    const uid = await verifyUser(m[1], env, o);
    if (uid) return { kind: 'user', id: 'u:' + uid, ip };
  }
  return { kind: 'guest', id: 'g:' + ip, ip };
}

export function quotaHeaders(q) {
  return q && q.limit ? { 'X-Quota-Limit': String(q.limit), 'X-Quota-Remaining': String(q.remaining) } : {};
}

export function denyMessage(q, kind) {
  if (q.reason === 'rate') return 'Terlalu banyak permintaan. Tunggu sebentar ya.';
  return kind === 'user'
    ? 'Jatah chat hari ini sudah habis. Jatah diperbarui otomatis tiap tengah malam WIB.'
    : 'Jatah chat tamu hari ini sudah habis. Masuk dengan akunmu untuk jatah lebih besar, atau coba lagi besok.';
}
