/* Pencatat pemakaian ANONIM untuk menu AI di admin.gowithdme.com (tabel public.ai_usage, supabase/admin_ai.sql).

   Yang dicatat: mode, label topik, kelas perangkat (mobile/tablet/desktop), model, lama jawab, token perkiraan, berhasil/gagal.
   TIDAK dicatat: isi pesan, user_id mentah, alamat IP, lokasi. Topik hanyalah satu label dari daftar tetap (lihat topicOf).
   uid_hash = sha256(user_id + bulan + garam) dipotong 16 hex: pseudonim yang berganti tiap bulan, hanya untuk menghitung perangkat unik.

   Semua fungsi di sini tidak pernah melempar error dan tidak boleh memperlambat jawaban (dipanggil lewat ctx.waitUntil). */

const TOPIC_RE = [
  ['cari_teman', /cari teman|teman (jalan|seperjalanan|naik|nonton|konser)|barengan|bareng|ajakan|partner|nebeng|teman baru/],
  ['cafe_makan', /cafe|kafe|kopi|coffee|nongkrong|resto|restoran|makan|kuliner|warung|brunch|jajan/],
  ['gunung', /gunung|pendakian|mendaki|basecamp|summit|camping|tektok|pos \d|puncak/],
  ['konser', /konser|festival|lineup|line up|tiket|band|musik/],
  ['trip', /trip|liburan|itinerary|wisata|jalan jalan|hotel|penginapan|destinasi|backpack|rute|tour|pantai/],
];
const MOOD_CURHAT = new Set(['sedih', 'cemas', 'marah', 'lelah', 'minder']);
export const TOPICS = ['krisis', 'curhat', 'sapaan', 'cari_teman', 'cafe_makan', 'gunung', 'konser', 'trip', 'pencarian', 'lainnya'];

/* Satu label topik dari daftar tetap. Teks pesan TIDAK disimpan; hanya label ini yang keluar dari fungsi. */
export function topicOf(text, mode, mind) {
  mind = mind || {};
  if (mind.crisis) return 'krisis';
  if (mode === 'search') return 'pencarian';
  if (mode === 'ngobrol' && MOOD_CURHAT.has(mind.mood)) return 'curhat';
  if (mind.intent === 'salam' || mind.intent === 'terima_kasih') return 'sapaan';
  const t = String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
  for (const [k, re] of TOPIC_RE) if (re.test(t)) return k;
  if (mode === 'gunung' || mode === 'konser' || mode === 'trip') return mode;
  return 'lainnya';
}

/* Kelas kasar dari User-Agent. Hanya 4 nilai; UA mentah tidak disimpan. */
export function deviceOf(ua) {
  const s = String(ua || '');
  if (!s) return '?';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini/i.test(s)) return 'mobile';
  return 'desktop';
}

/* Perkiraan kasar: 1 token ≈ 4 karakter (cukup untuk melihat tren dan boros-tidaknya, bukan untuk tagihan). */
export const estTokens = (chars) => Math.max(0, Math.ceil((Number(chars) || 0) / 4));

export async function pseudonym(userId, salt, now) {
  try {
    const id = String(userId || '').slice(0, 80);
    if (!id) return null;
    const month = new Date((now == null ? Date.now() : now) + 7 * 3600 * 1000).toISOString().slice(0, 7);
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id + '|' + month + '|' + (salt || 'dme')));
    return Array.from(new Uint8Array(buf)).slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return null; }
}

const clampInt = (v, max) => (Number.isFinite(+v) && v !== null && v !== undefined ? Math.max(0, Math.min(max, Math.round(+v))) : null);

/* Bentuk satu baris ai_usage dari data permintaan. Hanya kolom yang dikenal, semuanya dibatasi panjangnya. */
export function buildRow(r) {
  return {
    mode: String(r.mode || 'ngobrol').slice(0, 20),
    topic: TOPICS.includes(r.topic) ? r.topic : 'lainnya',
    device: ['mobile', 'tablet', 'desktop'].includes(r.device) ? r.device : '?',
    uid_hash: r.uidHash || null,
    provider: r.provider ? String(r.provider).slice(0, 20) : null,
    model: r.model ? String(r.model).slice(0, 60) : null,
    ok: !!r.ok,
    err: r.ok ? null : String(r.err || 'busy').slice(0, 20),
    ttft_ms: clampInt(r.ttft, 600000),
    total_ms: clampInt(r.total, 600000),
    in_tok: clampInt(r.inTok, 5000000),
    out_tok: clampInt(r.outTok, 5000000),
    has_att: !!r.hasAtt,
  };
}

const base = (env) => String(env.SUPABASE_URL).replace(/\/+$/, '');
const hdr = (env) => ({ apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' });
const enabled = (env) => !!(env && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY && env.USAGE_LOG !== 'off');

/* Kirim satu catatan ke Supabase. r.uid (id perangkat dari klien) hanya dipakai untuk membuat uid_hash, tidak pernah dikirim. */
export async function logUsage(env, r) {
  if (!enabled(env)) return 'skip';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const row = buildRow({ ...r, uidHash: await pseudonym(r.uid, env.USAGE_SALT) });
    const res = await fetch(base(env) + '/rest/v1/ai_usage', { method: 'POST', signal: ctl.signal, headers: { ...hdr(env), Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return 'ok';
  } catch (e) {
    console.error('USAGE_LOG_FAIL', e && e.message);
    return 'fail';
  } finally { clearTimeout(timer); }
}

/* Hapus catatan lebih dari 90 hari (dipanggil cron harian). */
export async function purgeUsage(env) {
  if (!enabled(env)) return 'skip';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(base(env) + '/rest/v1/rpc/ai_usage_purge', { method: 'POST', signal: ctl.signal, headers: hdr(env), body: JSON.stringify({ p_days: 90 }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return 'ok';
  } catch (e) {
    console.error('USAGE_PURGE_FAIL', e && e.message);
    return 'fail';
  } finally { clearTimeout(timer); }
}

/* Hapus penilaian belajar yang belum disetujui/diekspor dan lebih dari 90 hari (dipanggil cron harian).
   Fungsi SQL: supabase/privasi_v5.sql (purge_training_logs). Yang sudah disetujui admin atau diekspor tidak disentuh. */
export async function purgeTraining(env) {
  if (!enabled(env)) return 'skip';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(base(env) + '/rest/v1/rpc/purge_training_logs', { method: 'POST', signal: ctl.signal, headers: hdr(env), body: JSON.stringify({ p_days: 90 }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return 'ok';
  } catch (e) {
    console.error('TRAINING_PURGE_FAIL', e && e.message);
    return 'fail';
  } finally { clearTimeout(timer); }
}
