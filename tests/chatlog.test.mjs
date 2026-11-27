/* Uji pencatat percakapan. Jalankan dari root repo dea-statis:  node tests/chatlog.test.mjs */
import { parseLogReq, cleanText, readReply, logChat, wrapChatLog } from '../worker/chatlog.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'ok     ' : 'GAGAL  ') + m); if (!c) fail++; };
const SID = '11111111-2222-4333-8444-555555555555';
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'svc', USAGE_SALT: 's' };
const body = (o) => JSON.stringify(Object.assign({ message: 'halo', mode: 'ngobrol', history: [{ role: 'user', content: 'halo dea' }], user_id: 'dev-1' }, o));

/* parseLogReq */
ok(parseLogReq(body({})) === null, 'tanpa chat_log:true tidak dicatat');
ok(parseLogReq(body({ chat_log: 'ya' })) === null, 'chat_log harus persis true');
ok(parseLogReq(body({ chat_log: true, voice: true })) === null, 'permintaan suara tidak dicatat');
ok(parseLogReq('bukan json') === null, 'body rusak tidak melempar galat');
const p = parseLogReq(body({ chat_log: true, chat_id: SID }));
ok(p && p.prompt === 'halo dea' && p.chatId === SID && p.mode === 'ngobrol', 'prompt, chat_id, mode terbaca');
ok(parseLogReq(body({ chat_log: true, chat_id: 'ngawur' })).chatId === null, 'chat_id bukan UUID dibuang');
ok(parseLogReq(body({ chat_log: true, history: [{ role: 'user', content: 'x'.repeat(9000) }] })).prompt.length === 8000, 'prompt dipotong 8000');

/* cleanText / readReply */
ok(cleanText('<!--dme:{"cards":[]}-->\n_Dea lagi mikir..._\n\n<!--net-->\nHalo!') === 'Halo!', 'penanda layar dibuang');
const mk = (t, ct) => new Response(t, { headers: { 'Content-Type': ct } });
ok((await readReply(mk('Hai juga', 'text/plain').body, 'text/plain')) === 'Hai juga', 'readReply teks alir');
ok((await readReply(mk(JSON.stringify({ text: 'Hai json' }), 'application/json').body, 'application/json')) === 'Hai json', 'readReply JSON');

/* logChat dengan fetch palsu */
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), { status: 200 });
  return new Response(null, { status: 201 });
};
let r = await logChat(ENV, { prompt: 'q', reply: 'a', chatId: SID, mode: 'ngobrol', token: 'tok', cf: { city: 'Bandung', region: 'West Java', country: 'ID' } });
const sess = JSON.parse(calls.find((c) => c.url.includes('ai_chat_sessions')).init.body);
const msgs = JSON.parse(calls.find((c) => c.url.includes('ai_chat_messages')).init.body);
ok(r === 'ok' && sess.user_id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && sess.device === null, 'akun login: user_id dari token, device kosong');
ok(sess.city === 'Bandung' && sess.id === SID && !('ip' in sess), 'kota kasar ikut, tanpa IP');
ok(msgs.length === 2 && msgs[0].role === 'user' && msgs[1].role === 'assistant', 'dua baris pesan (user, assistant)');
calls.length = 0;
r = await logChat(ENV, { prompt: 'q', reply: 'a', chatId: SID, mode: 'ngobrol', token: null, uid: 'dev-1', cf: {} });
const gs = JSON.parse(calls.find((c) => c.url.includes('ai_chat_sessions')).init.body);
ok(r === 'ok' && gs.user_id === null && /^[0-9a-f]{16}$/.test(gs.device) && gs.device !== 'dev-1', 'tamu: perangkat berupa pseudonim, bukan ID mentah');
calls.length = 0;
ok((await logChat(ENV, { prompt: 'q', reply: 'a', token: null, uid: '' })) === 'skip', 'tanpa akun dan tanpa perangkat: dilewati');
ok((await logChat({}, { prompt: 'q', reply: 'a', uid: 'd' })) === 'skip', 'tanpa kunci Supabase: dilewati');
ok((await logChat({ ...ENV, CHAT_LOG: 'off' }, { prompt: 'q', reply: 'a', uid: 'd' })) === 'skip', 'CHAT_LOG=off mematikan pencatatan');
globalThis.fetch = async () => { throw new Error('jaringan putus'); };
const origErr = console.error; console.error = () => {};
ok((await logChat(ENV, { prompt: 'q', reply: 'a', uid: 'd' })) === 'fail', 'Supabase mati: gagal diam-diam, tidak melempar');
console.error = origErr;

/* wrapChatLog: jawaban utuh sampai ke pengguna + tercatat di latar */
calls.length = 0;
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 201 }); };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const enc = new TextEncoder();
const streamCore = { scheduled() { return 'cron'; }, async fetch() {
  const s = new ReadableStream({ start(c) { c.enqueue(enc.encode('<!--net-->\nHalo ')); c.enqueue(enc.encode('Kal!')); c.close(); } });
  return new Response(s, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Quota-Remaining': '9' } });
} };
const w = wrapChatLog(streamCore);
ok(w.scheduled() === 'cron', 'scheduled() diteruskan');
let req = new Request('https://w/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({ chat_log: true, chat_id: SID }) });
let res = await w.fetch(req, ENV, ctx);
const seen = await res.text();
await Promise.all(waits);
ok(seen === '<!--net-->\nHalo Kal!' && res.headers.get('X-Quota-Remaining') === '9', 'pengguna menerima jawaban utuh + header asli');
const logged = JSON.parse(calls.find((c) => c.url.includes('ai_chat_messages')).init.body);
ok(logged[1].content === 'Halo Kal!', 'yang tercatat bersih dari penanda layar');

calls.length = 0; waits.length = 0;
req = new Request('https://w/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body({}) });
res = await w.fetch(req, ENV, ctx); await res.text(); await Promise.all(waits);
ok(calls.length === 0, 'tanpa persetujuan: tidak ada panggilan ke Supabase');

calls.length = 0; waits.length = 0;
const errCore = { async fetch() { return new Response(JSON.stringify({ code: 'rate' }), { status: 429 }); } };
req = new Request('https://w/', { method: 'POST', body: body({ chat_log: true }) });
res = await wrapChatLog(errCore).fetch(req, ENV, ctx); await Promise.all(waits);
ok(res.status === 429 && calls.length === 0, 'jawaban galat (429) tidak dicatat dan lolos apa adanya');

calls.length = 0; waits.length = 0;
const jsonCore = { async fetch() { return new Response(JSON.stringify({ text: 'Jawab JSON' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } };
req = new Request('https://w/', { method: 'POST', body: body({ chat_log: true }) });
res = await wrapChatLog(jsonCore).fetch(req, ENV, ctx);
ok((await res.json()).text === 'Jawab JSON', 'jalur JSON tetap utuh ke pengguna'); await Promise.all(waits);
ok(JSON.parse(calls.find((c) => c.url.includes('ai_chat_messages')).init.body)[1].content === 'Jawab JSON', 'jalur JSON tercatat');

res = await w.fetch(new Request('https://w/', { method: 'GET' }), ENV, ctx);
ok(res.status === 200, 'GET (health) lewat tanpa dibungkus');

console.log(fail ? `\n${fail} pemeriksaan GAGAL` : '\nsemua lulus');
process.exit(fail ? 1 : 0);
