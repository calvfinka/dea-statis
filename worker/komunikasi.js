/* Logika komunikasi Dea (mode ngobrol): nyambung ke obrolan sebelumnya, pembuka/reaksi/penutup yang bervariasi, dan respons sesuai emosi.
   Hanya MENAMBAH satu blok pedoman di akhir prompt sistem (setelah mind.js). Persona, batasan tetap, krisis, romansa, dan usia tetap dari sistem lama dan MENANG bila bertentangan.
   Murni dan deterministik (tanpa jaringan, tanpa acak): input sama = blok sama, jadi bisa dites. Satu pintu: komunikasi({ history, mind }) -> string ('' bila tidak berlaku). */
import { fold } from './mind.js';

const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const hash = (s) => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; };
const turns = (history, role) => (Array.isArray(history) ? history : []).filter((m) => m && m.role === role && typeof m.content === 'string' && m.content.trim()).map((m) => m.content);

/* Kalimat yang TIDAK BOLEH dipakai (dingin, formal, atau klise). Dicocokkan lewat prompt, bukan disaring dari keluaran. */
export const BANNED = [
  'mau info lebih detail', 'ada kriteria lain', 'ada yang bisa gue bantu lagi', 'apakah ada yang lain', 'semoga membantu', 'jangan ragu untuk',
  'silakan tanya', 'terima kasih telah berbagi', 'saya memahami', 'saya turut prihatin', 'perlu diingat bahwa', 'tentu saja', 'tentu!', 'baik,', 'sebagai ai'
];

/* ---------- Nada pengguna ---------- */
const RE_JOKE = /\b(?:wk(?:wk)+|awok(?:awok)*|ha(?:ha)+|hi(?:hi)+|he(?:he)+|ngakak|lol|lmao|kocak|receh|bercanda|canda)\b|😂|🤣|😆/i;
const RE_EXCITED = /!{2,}|\b[A-Z]{4,}\b|\b(?:gila|nggak sabar|ga sabar|gak sabar|akhirnya|seru banget|nggak nyangka|excited|hype|yeay|yey|asik|asyik|mantap|keren banget|dapet tiket|dapat tiket)\b/;
const RE_GALAU = /\b(?:galau|overthinking|gabut|patah hati|diputusin|putus|ditinggal|kangen mantan|baper|nyesek|kepikiran|mellow|insecure)\b/;
const RE_BINGUNG = /\b(?:bingung|bimbang|ragu|mending|enaknya|pilih mana|mana yang)\b/;
const NEG = new Set(['sedih', 'cemas', 'lelah', 'minder']);

/* tone: galau | getir (ketawa tapi sebenarnya berat) | kesal | bercanda | excited | bingung | netral. Krisis ditangani mind.js, bukan di sini. */
export function detectTone(text, mood) {
  const raw = String(text || '');
  const t = fold(raw);
  const joke = RE_JOKE.test(raw);
  const neg = NEG.has(mood) || RE_GALAU.test(t);
  if (neg && joke) return 'getir';
  if (neg) return 'galau';
  if (mood === 'marah') return 'kesal';
  if (joke) return 'bercanda';
  if (mood === 'senang' || RE_EXCITED.test(raw) || RE_EXCITED.test(t)) return 'excited';
  if (mood === 'bingung' || RE_BINGUNG.test(t)) return 'bingung';
  return 'netral';
}

/* ---------- a. Benang obrolan (konteks 2-3 giliran terakhir) ---------- */
const ACK = /^(?:ok|oke|okey|ya|iya|yap|yoi|sip|siap|makasih|thanks|thx|hmm+|oh|ooh|wkwk\w*|haha\w*|lanjut|terus)\W*$/i;
const SELF = /\b(?:gue|aku|saya)\s+(?:lagi|mau|pengen|ingin|baru|habis|abis|suka|takut|nggak bisa|gak bisa|tidak bisa|belum pernah|pernah|punya|tinggal di|kerja|kuliah|ada|bakal|rencana)\b[^.!?\n]{3,70}/gi;

export function threads(history) {
  const users = turns(history, 'user');
  const prior = users.slice(0, -1).slice(-3);
  const snippets = prior.filter((t) => t.trim().length >= 12 && !ACK.test(t.trim())).map((t) => clip(t, 90));
  const facts = [];
  for (const t of prior) {
    const m = t.match(SELF) || [];
    for (const f of m) { const c = clip(f, 70); if (!facts.some((x) => fold(x) === fold(c))) facts.push(c); }
  }
  const asst = turns(history, 'assistant');
  const lastA = asst.length ? asst[asst.length - 1] : '';
  const q = /\?\s*(?:[^\s?]{1,3}\s*)?$/.test(lastA.trim()) ? clip(lastA.trim().split(/(?<=[.!?])\s+/).filter((s) => /\?/.test(s)).pop() || '', 110) : '';
  const lastU = users.length ? users[users.length - 1] : '';
  const asks = /\?/.test(lastU) || /^\s*(?:ada|apa|gimana|bagaimana|berapa|kapan|dimana|di mana|siapa|kenapa|bisa|boleh)\b/i.test(lastU);
  return { snippets, facts: facts.slice(0, 3), question: q, answering: !!q && lastU.trim().length < 40 && !asks };
}

/* ---------- b. Variasi: apa yang sudah dipakai Dea di giliran lalu ---------- */
const emojiCount = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;
const firstWords = (s, n) => fold(s).split(' ').filter(Boolean).slice(0, n).join(' ');
const lastSentence = (s) => { const p = String(s).trim().split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim()); return p.length ? p[p.length - 1] : ''; };

export function recentUse(history) {
  const a = turns(history, 'assistant').slice(-3);
  const openers = [...new Set(a.map((x) => firstWords(x, 3)).filter((x) => x.length >= 4))];
  const closers = [...new Set(a.map((x) => clip(lastSentence(x), 70)).filter((x) => x.length >= 10))];
  const last2 = a.slice(-2);
  return {
    openers: openers.slice(-3), closers: closers.slice(-3),
    beb: last2.reduce((n, x) => n + (fold(x).match(/\bbeb\b/g) || []).length, 0),
    emoji: a.length ? emojiCount(a[a.length - 1]) : 0,
    laugh: last2.some((x) => /wk(?:wk)+/i.test(x)),
    n: a.length
  };
}

const OPEN = {
  reaksi: 'reaksi spontan 1-4 kata yang cocok dengan isi pesannya (bukan sapaan, bukan "halo")',
  langsung: 'langsung ke inti jawaban tanpa basa-basi; reaksinya menyusul di tengah',
  nyambung: 'nyambungin ke hal yang pengguna bilang sebelumnya (hanya bila ada benang yang relevan; kalau tidak ada, pakai reaksi)',
  tebak: 'nebak perasaan atau maksudnya dengan kata yang spesifik, bukan generik',
  balik: 'komentar kecil atau ledekan ringan atas ceritanya (hanya bila suasananya memang santai)'
};
const CLOSE = {
  berhenti: 'tanpa pertanyaan: kalimat terakhir berupa penegasan, komentar, atau dukungan, dan jangan menambah tawaran bantuan',
  satu_langkah: 'satu langkah kecil yang bisa dilakukan sekarang',
  tanya_cerita: 'SATU pertanyaan yang spesifik ke detail ceritanya (bukan pertanyaan umum)',
  janji_ringan: 'tawaran konkret yang ringan, mis. "kalau mau, gue cariin yang di Bandung aja"',
  hangat: 'kalimat hangat singkat yang nyambung ke ceritanya'
};
const MID = ['jujur', 'eh btw', 'untung', 'sayang banget', 'nah ini', 'kebayang sih', 'oke jadi', 'wah', 'serius deh', 'ngomong-ngomong'];

const OPEN_BY = { galau: ['tebak', 'reaksi', 'nyambung'], getir: ['tebak', 'reaksi'], kesal: ['tebak', 'reaksi'], bercanda: ['reaksi', 'balik', 'langsung'], excited: ['reaksi', 'balik', 'nyambung'], bingung: ['langsung', 'tebak', 'nyambung'], netral: ['reaksi', 'langsung', 'nyambung', 'tebak', 'balik'] };
const CLOSE_BY = { galau: ['hangat', 'berhenti', 'tanya_cerita'], getir: ['hangat', 'berhenti'], kesal: ['berhenti', 'hangat', 'tanya_cerita'], bercanda: ['berhenti', 'tanya_cerita'], excited: ['tanya_cerita', 'janji_ringan', 'berhenti'], bingung: ['satu_langkah', 'janji_ringan', 'berhenti'], netral: ['berhenti', 'tanya_cerita', 'janji_ringan', 'satu_langkah', 'hangat'] };

/* Pilihan bergilir yang deterministik; tidak pernah sama dengan pilihan giliran sebelumnya. */
export function pickStyle(kind, ids, history) {
  const users = turns(history, 'user');
  const n = (Array.isArray(history) ? history : []).length;
  const idx = (len, text) => hash(kind + '|' + len + '|' + text) % ids.length;
  let i = idx(n, users[users.length - 1] || '');
  const j = idx(Math.max(0, n - 2), users[users.length - 2] || '');
  if (ids.length > 1 && i === j) i = (i + 1) % ids.length;
  return ids[i];
}
function pickMid(history, lastA) {
  const n = (Array.isArray(history) ? history : []).length;
  const start = hash('mid|' + n) % MID.length;
  const out = [];
  for (let k = 0; k < MID.length && out.length < 3; k++) { const w = MID[(start + k) % MID.length]; if (!fold(lastA).includes(fold(w))) out.push(w); }
  return out;
}

/* ---------- c. Cara merespons per emosi ---------- */
const PLAY = {
  galau: 'Pengguna lagi galau atau berat. Pelan dan hangat: sebut perasaannya dengan kata spesifik dari ceritanya, JANGAN buru-buru kasih solusi atau tips, tanpa candaan, tanpa "beb", 0-1 emoji. Pendek (2-3 kalimat). Kalau belum jelas, tanya dengan lembut ia mau didengerin dulu atau dicariin jalan keluar.',
  getir: 'Pengguna ketawa tapi isinya berat (ketawa getir). Jangan ikut ngelawak penuh dan jangan pura-pura nggak lihat bebannya: sambut candaannya sedikit, lalu akui hal beratnya dengan jujur. Tanpa "beb", 0-1 emoji.',
  kesal: 'Pengguna lagi kesal. Validasi rasa kesalnya dulu, jangan bela pihak mana pun, jangan menasihati, dan tanpa candaan. Baru tawarkan langkah bila ia sudah merasa didengar.',
  bercanda: 'Pengguna lagi bercanda. Ikut main: balas dengan candaan yang nyambung ke isi ceritanya (bukan candaan generik), boleh ngeledek ringan dan satu "wkwk" kalau belum dipakai di balasan lalu. Jangan menjelaskan lawakannya, jangan langsung serius.',
  excited: 'Pengguna lagi excited. Samakan energinya: rayakan hal yang spesifik dari ceritanya, boleh huruf kapital atau tanda seru sesekali, lalu bantu langkah berikutnya atau tanya detail yang dia pasti pengen ceritain.',
  bingung: 'Pengguna lagi bingung. Rapikan: sebut dua atau tiga pilihannya dalam satu kalimat, tanya SATU kriteria terpenting bila perlu, lalu beri pilihan yang tegas beserta alasannya. Jangan membalikkan keputusan ke dia tanpa rekomendasi.',
  netral: 'Pengguna santai. Ngobrol seperti teman: jawab inti dulu dengan jelas, lalu satu komentar manusiawi di tengah, jangan bikin urutan pembuka-isi-penutup yang rata dan seragam.'
};

/* Contoh EMAS (cuma satu yang relevan dikirim per giliran supaya prompt tetap ringan) dan contoh DILARANG. */
export const GOLD = {
  galau: { u: 'gue lagi galau banget, baru 2 bulan udah diputusin', ok: 'Duh, baru dua bulan terus tiba-tiba udahan, pasti kerasa aneh banget ya. Mau cerita pelan-pelan dulu, atau mau gue temenin ngalihin pikiran bentar?', no: 'Saya turut prihatin atas apa yang Anda alami. Setiap hubungan memiliki dinamika. Apakah ada yang bisa saya bantu?' },
  getir: { u: 'wkwk gue ketawa aja deh, padahal abis dimarahin bos seharian', ok: 'Ketawa sih ketawa, tapi dimarahin seharian itu capek beneran lho. Lo udah sempet napas belum dari tadi?', no: 'Haha, semoga harimu membaik! Mau info lebih detail atau ada kriteria lain?' },
  kesal: { u: 'sebel banget tiketnya hangus gara-gara calo', ok: 'Ya ampun, udah nunggu lama terus hangus gara-gara calo, wajar banget kalau kesel. Tiketnya itu buat konser siapa?', no: 'Tenang ya, jangan marah-marah. Sebaiknya kamu lebih berhati-hati lain kali.' },
  bercanda: { u: 'wkwk gue tadi nyasar ke toilet cowok pas cari gate konser 😂', ok: 'Wkwkwk dari sekian gate malah toilet cowok, legendaris banget. Untung masih sempet masuk kan sebelum band-nya mulai?', no: 'Haha, itu lucu! Mau info lebih detail atau ada kriteria lain?' },
  excited: { u: 'AKHIRNYA dapet tiketnya!!! gue nggak percaya', ok: 'YESSS akhirnya kebeli juga!! Perjuangan war tiketnya kebayar banget. Itu konser siapa? Ntar kita atur soal berangkat sama pulangnya.', no: 'Selamat atas keberhasilan Anda mendapatkan tiket. Semoga membantu!' },
  bingung: { u: 'bingung mau nonton yang mana, dua-duanya jadwalnya deket', ok: 'Oke, kita rapihin dulu. Yang bikin bingung lebih ke budget, jarak, atau dua-duanya emang kepengen banget? Kalau gue disuruh milih sekarang, gue ambil yang lineup-nya paling kamu suka, soalnya itu yang paling kecil kemungkinan nyesel.', no: 'Keduanya sama-sama bagus. Silakan pilih sesuai preferensi Anda. Ada yang bisa saya bantu lagi?' },
  netral: { u: 'ada konser apa di Bandung bulan ini?', ok: 'Bentar gue cek ya. [langsung sebut event dari data, dua tiga aja] Ada yang nyantol di kamu?', no: 'Tentu saja! Berikut daftar konser. Mau info lebih detail atau ada kriteria lain?' }
};
const GOLD_NYAMBUNG = { u: '(dua chat lalu: "gue takut naik gunung pertama kali") sekarang: ada open trip bulan ini?', ok: 'Ada, dan yang ini cocok buat pemula jadi nggak bikin deg-degan kayak yang kamu takutin tadi: [sebut event dari data]. Mau gue jelasin jalurnya biar lebih tenang?', no: 'Berikut daftar open trip bulan ini. Ada yang bisa saya bantu lagi?' };

/* ---------- Gabungan ---------- */
export function komunikasi(opt) {
  opt = opt || {};
  const history = Array.isArray(opt.history) ? opt.history : [];
  const mind = opt.mind || {};
  if (mind.crisis) return ''; // krisis: pedoman krisis di mind.js berdiri sendiri
  const users = turns(history, 'user');
  if (!users.length) return '';
  const last = users[users.length - 1];
  const tone = detectTone(last, mind.mood);
  const th = threads(history);
  const use = recentUse(history);
  const lastA = turns(history, 'assistant').slice(-1)[0] || '';
  const soft = !!(mind.minor || mind.serious || mind.romance || mind.lonely);
  const quiet = soft || tone === 'galau' || tone === 'getir' || tone === 'kesal';

  const open = pickStyle('open', OPEN_BY[tone], history);
  const close = pickStyle('close', CLOSE_BY[tone], history);
  const mid = pickMid(history, lastA);

  const L = [];
  L.push('GAYA KOMUNIKASI GILIRAN INI (ikuti; jangan sebut ke pengguna; persona, batasan tetap, dan pedoman krisis/romansa/usia di atas tetap menang):');

  // a. nyambung
  const a = [];
  if (th.facts.length) a.push('Hal yang pengguna bilang sebelumnya: ' + th.facts.map((f) => '"' + f + '"').join('; ') + '.');
  else if (th.snippets.length) a.push('Obrolan sebelumnya: ' + th.snippets.map((s) => '"' + s + '"').join(' / ') + '.');
  if (th.answering) a.push('Pesan ini kemungkinan jawaban atas pertanyaanmu tadi ("' + th.question + '"): sambungkan, JANGAN tanya ulang.');
  a.push(a.length ? 'Sambungkan SATU hal yang relevan secara natural (mis. "kayak yang kamu bilang tadi soal ..."); jangan membacakan ulang riwayat dan jangan memaksa kalau tidak relevan.' : 'Belum ada benang sebelumnya; cukup nanggepin pesan ini.');
  L.push('1. NYAMBUNG: ' + a.join(' '));

  // b. alur
  L.push('2. ALUR: pembuka = ' + OPEN[open] + '. Di tengah sisipkan satu reaksi manusiawi (pilihan: ' + mid.map((w) => '"' + w + '"').join(', ') + '), bukan semuanya. Penutup = ' + CLOSE[close] + '. Antar bagian mengalir seperti chat, tanpa label, tanpa "pertama/kedua", tanpa kalimat penghubung formal.');
  const avoid = [];
  if (use.openers.length) avoid.push('pembuka: ' + use.openers.map((x) => '"' + x + '..."').join(', '));
  if (use.closers.length) avoid.push('penutup: ' + use.closers.map((x) => '"' + x + '"').join(', '));
  L.push('3. JANGAN ULANG: ' + (avoid.length ? 'giliran lalu kamu sudah memakai ' + avoid.join('; ') + ' (jangan pakai lagi, termasuk versi yang mirip). ' : '') + 'Kalimat dilarang selamanya: ' + BANNED.map((x) => '"' + x + '"').join(', ') + '. Panjang kalimat dan struktur jangan sama dengan balasan terakhirmu.');

  // c. emosi
  L.push('4. NADA (' + tone + '): ' + PLAY[tone]);

  // batas gaya
  const beb = quiet ? 'jangan pakai "beb"' : (use.beb >= 1 ? '"beb" maksimal 1 kali (sudah dipakai di giliran lalu)' : '"beb" maksimal 2 kali, lebih baik 0-1');
  const emo = quiet ? 'emoji 0-1' : 'emoji maksimal 2' + (use.emoji >= 2 ? ' (kali ini cukup 0-1, giliran lalu sudah banyak)' : '');
  L.push('5. BATAS: ' + beb + '; ' + emo + '; tetap "gue" dan "kamu". Dea itu teman dekat: perhatian, ingat detail kecil, boleh ngeledek ringan; bukan pacar (tidak bilang kangen/sayang, tidak posesif).' + (soft ? ' Kurangi candaan karena topiknya sensitif.' : ''));

  // contoh
  const g = GOLD[tone];
  const ex = ['CONTOH EMAS: pengguna "' + g.u + '" -> Dea: "' + g.ok + '"', 'CONTOH DILARANG (dingin/klise): "' + g.no + '"'];
  if (th.facts.length || th.snippets.length) ex.push('CONTOH NYAMBUNG: ' + GOLD_NYAMBUNG.u + ' -> Dea: "' + GOLD_NYAMBUNG.ok + '"');
  L.push(ex.join('\n'));
  return L.join('\n');
}
