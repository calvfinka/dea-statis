/* "Otak" DME: pemahaman maksud, logika perasaan, dan pengatur kedalaman berpikir.
   Semua fungsi murni (tanpa jaringan) supaya bisa diuji di Node. Dipakai oleh worker.js:
     plan({ mode, history, hasAtt, hasMedia, today }) -> { text, effort, thinking, temp, mood, intent, crisis }
   `text` ditempel ke system prompt SETELAH persona/data, jadi persona dan data resmi tidak berubah. */

export function fold(v) {
  let t = String(v == null ? '' : v).toLowerCase();
  try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
  return t.replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Singkatan/gaul -> bentuk baku, hanya untuk MEMBACA pesan (teks pengguna tidak diubah). */
const SLANG = {
  gk: 'tidak', ga: 'tidak', gak: 'tidak', nggak: 'tidak', ngga: 'tidak', enggak: 'tidak', engga: 'tidak', tdk: 'tidak', gabisa: 'tidak bisa',
  tp: 'tapi', yg: 'yang', dgn: 'dengan', dg: 'dengan', utk: 'untuk', krn: 'karena', karna: 'karena', udh: 'sudah', udah: 'sudah', sdh: 'sudah',
  blm: 'belum', bgt: 'sekali', banget: 'sekali', bngt: 'sekali', gmn: 'bagaimana', gimana: 'bagaimana', kpn: 'kapan', brp: 'berapa',
  jd: 'jadi', lg: 'lagi', skrg: 'sekarang', jgn: 'jangan', pengen: 'ingin', pingin: 'ingin', pgn: 'ingin', kalo: 'kalau', klo: 'kalau', kl: 'kalau',
  trs: 'terus', trus: 'terus', lgsg: 'langsung', mls: 'malas', bs: 'bisa', sy: 'saya', emg: 'memang', cmn: 'cuma', aja: 'saja', doang: 'saja',
  bgd: 'sekali', parah: 'parah', capek: 'capek', cape: 'capek', kesel: 'kesal', sebel: 'kesal', seneng: 'senang', asik: 'asyik', nyesel: 'menyesal'
};

export function normalize(text) {
  // "sedihhhh" -> "sedih", "wkwkwk" tetap wajar; lalu singkatan dibakukan
  const squeezed = String(text == null ? '' : text).replace(/(.)\1{2,}/g, '$1');
  return fold(squeezed).split(' ').filter(Boolean).map((w) => SLANG[w] || w).join(' ');
}

/* ---------- Logika perasaan ---------- */
/* [kata/frasa, bobot]. Kata tunggal cocok awalan (sedih -> sedihnya); frasa dicocokkan utuh. */
const LEX = {
  sedih: [['sedih', 2], ['nangis', 2], ['menangis', 2], ['kecewa', 2], ['patah hati', 3], ['hancur', 2], ['putus asa', 3], ['putus cinta', 3], ['diputusin', 3],
    ['kehilangan', 2], ['kangen', 2], ['rindu', 2], ['nelangsa', 3], ['galau', 2], ['kesepian', 3], ['sepi', 1], ['ditinggal', 2], ['sakit hati', 3], ['terluka', 2],
    ['murung', 2], ['nyesek', 3], ['menyesal', 2], ['ditolak', 2], ['gagal', 1], ['berduka', 3], ['meninggal', 2], ['down', 1], ['dikhianati', 3], ['dibohongi', 2]],
  cemas: [['cemas', 3], ['khawatir', 2], ['takut', 2], ['panik', 3], ['deg degan', 2], ['gugup', 2], ['nervous', 2], ['was was', 2], ['overthinking', 3], ['gelisah', 3],
    ['stres', 2], ['stress', 2], ['tertekan', 2], ['anxiety', 3], ['cemasin', 2], ['takutin', 2], ['ngeri', 1], ['trauma', 2], ['deadline', 1]],
  marah: [['marah', 3], ['kesal', 2], ['benci', 3], ['emosi', 2], ['jengkel', 2], ['bete', 2], ['murka', 3], ['dongkol', 3], ['muak', 3], ['ngeselin', 3], ['nyebelin', 3], ['menyebalkan', 3], ['sebal', 2], ['dimarahi', 2], ['kurang ajar', 3]],
  lelah: [['capek', 2], ['lelah', 2], ['burnout', 3], ['penat', 2], ['malas', 1], ['jenuh', 2], ['kewalahan', 3], ['exhausted', 3], ['lemes', 1], ['letih', 2], ['tidak kuat', 2], ['tidak tahan', 2], ['begadang', 1], ['ngantuk', 1], ['capek hidup', 3]],
  senang: [['senang', 2], ['bahagia', 3], ['excited', 3], ['asyik', 1], ['yeay', 2], ['yey', 2], ['alhamdulillah', 2], ['lega', 2], ['bangga', 2], ['girang', 3], ['happy', 2], ['semangat', 1],
    ['mantap', 1], ['lolos', 2], ['diterima', 2], ['berhasil', 2], ['hore', 2], ['tidak sabar', 2], ['seru', 1], ['keren', 1], ['lulus', 2], ['menang', 2], ['dapat tiket', 2], ['dapet tiket', 2]],
  bingung: [['bingung', 3], ['bimbang', 3], ['pusing', 2], ['tidak tahu harus', 3], ['ragu', 2], ['dilema', 3], ['galau milih', 3]],
  minder: [['minder', 3], ['insecure', 3], ['tidak percaya diri', 3], ['malu', 2], ['rendah diri', 3], ['merasa gagal', 3], ['tidak berguna', 3], ['tidak cukup baik', 3]]
};
const NEG = new Set(['tidak', 'bukan', 'belum', 'jangan']);
const POSITIVE = new Set(['senang', 'bahagia']);
const EMOJI = [
  ['sedih', /[😭😢😞😔😿🥺💔☹😥]/u], ['marah', /[😡🤬😠😤]/u], ['cemas', /[😰😨😱😟]/u], ['lelah', /[😴🥱😩😫]/u], ['senang', /[🥳😍😊😁😄🎉🥰😆]/u]
];
const INTENS = new Set(['sekali', 'sangat', 'parah', 'hancur', 'banget']);

function score(tokens, raw) {
  const text = ' ' + tokens.join(' ') + ' ';
  const s = { sedih: 0, cemas: 0, marah: 0, lelah: 0, senang: 0, bingung: 0, minder: 0 };
  for (const mood of Object.keys(LEX)) {
    for (const [k, w] of LEX[mood]) {
      if (k.includes(' ')) { if (text.includes(' ' + k + ' ')) s[mood] += w; continue; }
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (!(t === k || (k.length >= 4 && t.startsWith(k)))) continue;
        const negated = NEG.has(tokens[i - 1]) || NEG.has(tokens[i - 2]);
        if (negated) { if (k === 'semangat') s.lelah += 2; else if (POSITIVE.has(k)) s.sedih += 2; continue; } // "tidak semangat" = lelah, "tidak bahagia" = sedih
        s[mood] += w;
        break;
      }
    }
  }
  for (const [mood, re] of EMOJI) if (re.test(raw)) s[mood] += 2;
  return s;
}

const CASUAL = /lapar|laper|ngantuk|kepanasan|kedinginan|ketawa|tertawa|gaya|kepo|penasaran|lucu|kenyang|gemes|gemas|haus|pegal/;
/* high = menyebut bunuh diri / menyakiti diri; watch = ungkapan ingin mati yang bisa serius atau hanya hiperbola */
export function crisisLevel(text) {
  const t = ' ' + normalize(text) + ' ';
  if (/ bunuh diri | membunuh diri | mengakhiri hidup | akhiri hidup | mengakhiri semuanya | menyakiti diri | melukai diri | menyayat | self harm | selfharm | suicide | kill myself | end my life | tidak ingin hidup | tidak mau hidup | tidak mau ada lagi | lebih baik aku tidak ada /.test(t)) return 'high';
  if (/ (ingin|mau|pengen) mati | lebih baik mati | capek hidup | tidak kuat hidup | tidak sanggup hidup | ingin menghilang | mau menghilang | menghilang saja /.test(t)) {
    return CASUAL.test(t) ? null : 'watch';
  }
  return null;
}

export function detectMood(text, prevText) {
  const raw = String(text || '');
  const toks = normalize(raw).split(' ').filter(Boolean);
  const s = score(toks, raw);
  let best = 'netral', top = 0;
  for (const m of ['sedih', 'cemas', 'marah', 'lelah', 'bingung', 'minder', 'senang']) if (s[m] > top) { top = s[m]; best = m; }
  let carry = false;
  if (top < 2 && raw.trim().length < 30 && prevText) {
    const p = score(normalize(prevText).split(' ').filter(Boolean), String(prevText));
    let pb = 'netral', pt = 0;
    for (const m of ['sedih', 'cemas', 'marah', 'lelah', 'minder']) if (p[m] > pt) { pt = p[m]; pb = m; }
    if (pt >= 3 && best !== 'senang') { best = pb; top = pt; carry = true; }
  }
  if (top < 2) best = 'netral'; // satu kata lemah (mis. "sepi", "seru") belum cukup menyimpulkan perasaan
  let intensity = best === 'netral' ? 0 : 1;
  if (intensity) {
    if (top >= 4 || toks.some((t) => INTENS.has(t)) || /!{2,}/.test(raw) || /\b[A-Z]{4,}\b/.test(raw)) intensity++;
    if (top >= 6) intensity++;
    intensity = Math.min(3, intensity);
  }
  return { mood: best, score: top, intensity, carry, crisis: crisisLevel(raw) };
}

const MOOD_HINT = {
  sedih: 'Pengguna tampak sedih atau kecewa. Akui dan validasi perasaannya dulu dengan kata yang spesifik, tanpa solusi dan tanpa candaan. Beri ruang bercerita; tanyakan satu hal terbuka yang lembut, atau tanya apakah ia ingin didengarkan saja atau dicarikan jalan keluar.',
  cemas: 'Pengguna tampak cemas, takut, atau gugup. Tenangkan dulu: wajarkan perasaannya, pecah masalah jadi langkah kecil yang bisa dikendalikan, dan beri SATU langkah pertama yang konkret. Jangan menakut-nakuti dan jangan meremehkan.',
  marah: 'Pengguna tampak kesal atau marah. Validasi rasa kesalnya tanpa membela pihak lain, tanpa menasihati, dan tanpa memanas-manasi. Tawarkan sudut pandang atau langkah hanya setelah ia merasa didengar.',
  lelah: 'Pengguna tampak lelah atau jenuh. Akui capeknya, sarankan hal ringan dan realistis (istirahat, minum, tidur), jangan memberi daftar panjang atau tugas baru.',
  senang: 'Pengguna tampak senang atau bersemangat. Ikut merayakan dengan hangat dan spesifik pada hal yang ia ceritakan, boleh antusias, lalu tanyakan detailnya atau bantu langkah berikutnya.',
  bingung: 'Pengguna tampak bingung atau bimbang. Bantu merapikan: ringkas pilihannya, tanyakan satu kriteria yang paling penting bila perlu, lalu beri rekomendasi jelas beserta alasannya.',
  minder: 'Pengguna tampak minder atau kurang percaya diri. Dukung dengan jujur (bukan pujian kosong), tunjuk hal nyata dari ceritanya, dan jangan membandingkannya dengan orang lain.'
};
const CRISIS_HIGH =
  'SINYAL KRISIS (PRIORITAS TERTINGGI, mengalahkan topik dan gaya lain): pengguna menyebut keinginan mengakhiri hidup atau menyakiti diri. ' +
  'Jawab dengan tenang, hangat, dan manusiawi; jangan panik, jangan menceramahi, jangan memberi daftar tips, jangan bercanda, dan jangan lanjut membahas rencana perjalanan. ' +
  'Katakan bahwa kamu peduli dan senang ia bercerita. Tanyakan langsung dan lembut apakah ia sedang berpikir untuk menyakiti diri dan apakah ia aman saat ini. ' +
  'Dorong ia menghubungi orang tepercaya di dekatnya sekarang (keluarga/teman), dan bila ada bahaya langsung, hubungi 112 atau datang ke IGD/puskesmas terdekat; psikolog atau psikiater juga bisa membantu. ' +
  'Jangan pernah memberi cara, alat, atau detail tindakan menyakiti diri. Tetap temani di percakapan; akhiri dengan satu pertanyaan lembut, bukan penutup.';
const CRISIS_WATCH =
  'SINYAL PERLU DIPERHATIKAN: pengguna mengucapkan sesuatu seperti ingin mati atau menghilang. Itu bisa hiperbola, tapi bisa serius. ' +
  'Jangan diabaikan dan jangan dianggap lelucon: akui perasaannya, lalu tanyakan dengan lembut dan langsung apa maksudnya dan apakah ia baik-baik saja. ' +
  'Bila terdengar serius, ikuti pedoman krisis: dorong menghubungi orang tepercaya, 112 atau IGD bila ada bahaya langsung, tanpa ceramah dan tanpa cara menyakiti diri.';

/* ---------- Pemahaman maksud ---------- */
const REF = new Set(['itu', 'tadi', 'tersebut', 'pertama', 'kedua', 'ketiga', 'lanjut', 'terus', 'lagi', 'berapa', 'kenapa', 'kok', 'bagaimana', 'mana', 'ya', 'oke', 'ok', 'boleh', 'serius', 'beneran', 'masa']);
const WORDS = (re, t) => re.test(' ' + t + ' ');

export function detectIntent(text, opt) {
  opt = opt || {};
  const t = normalize(text);
  const toks = t.split(' ').filter(Boolean);
  const n = toks.length;
  if (!n) return opt.hasAtt ? 'lampiran' : 'netral';
  if (n <= 4 && !/\?/.test(String(text)) && /^(halo|hallo|helo|hai|hi|hello|hey|woi|assalamualaikum|permisi|ping|p|selamat)( |$)/.test(t)) return 'salam';
  if (n <= 6 && WORDS(/ (terima kasih|makasih|thanks|thank you|thx|tengkyu) /, t)) return 'terima_kasih';
  if (opt.hasAtt && n <= 3) return 'lampiran';
  if (opt.hasPrev && n <= 3 && toks.some((w) => REF.has(w))) return 'lanjut';
  if (WORDS(/ (hitung|hitungin|total|patungan|per orang|biaya|budget|anggaran|berapa|estimasi|ongkos|berapa lama|jarak) /, t) || /\d+\s*[x*+\/-]\s*\d+/.test(String(text))) return 'hitung';
  if (WORDS(/ (bandingkan|banding|versus|vs|atau|pilih|lebih baik|mending|bagusan|beda) /, t) && (/\?/.test(String(text)) || n > 4)) return 'bandingkan';
  if (WORDS(/ (rencana|itinerary|jadwal|rute|susun|bikinin|buatkan|buatin|rancang|agenda|persiapan|checklist) /, t)) return 'rencana';
  if (/\?/.test(String(text)) || WORDS(/ (apa|apakah|siapa|kapan|dimana|di mana|kenapa|mengapa|bagaimana|bisakah|boleh|apakah) /, t)) return 'tanya';
  return 'netral';
}

const INTENT_HINT = {
  salam: 'Pesan hanya sapaan: balas singkat dan hangat (1-2 kalimat), jangan langsung menawarkan daftar panjang.',
  terima_kasih: 'Pengguna berterima kasih: balas singkat dan tulus, tanpa menambah informasi baru.',
  lanjut: 'Pesan sangat singkat dan merujuk ke giliran sebelumnya: lanjutkan dari jawaban terakhirmu. Cari rujukannya di riwayat; jangan mulai dari nol dan jangan bertanya balik apa maksudnya kecuali memang tidak ada rujukan.',
  hitung: 'Ada hitungan: tunjukkan rumus dan rincian singkat per komponen, periksa ulang totalnya, dan sebutkan asumsi (misalnya harga hanya perkiraan). Jangan membulatkan diam-diam.',
  bandingkan: 'Pengguna membandingkan pilihan: pakai 2-4 kriteria yang relevan untuk situasinya, bandingkan ringkas (tabel kecil bila membantu), lalu beri rekomendasi tegas beserta alasannya.',
  rencana: 'Pengguna minta rencana: beri langkah atau jadwal berurutan yang realistis dan lengkap dengan perkiraan waktu; sebutkan asumsi bila info belum lengkap.',
  tanya: 'Ini pertanyaan: jawab langsung di kalimat pertama, baru beri penjelasan seperlunya.',
  lampiran: 'Pengguna hanya mengirim lampiran tanpa pertanyaan jelas: jelaskan isinya secara ringkas, tonjolkan hal penting, lalu tanyakan apa yang ingin ia lakukan dengannya.'
};

/* ---------- Kedalaman berpikir ---------- */
export function isComplex(text, intent, opt) {
  opt = opt || {};
  const raw = String(text || '');
  let s = 0;
  if (intent === 'hitung' || intent === 'rencana' || intent === 'bandingkan') s += 2;
  if (raw.length > 300) s++;
  if (raw.length > 700) s++;
  if ((raw.match(/\?/g) || []).length >= 2) s++;
  if (WORDS(/ (kenapa|mengapa|alasan|analisis|jelaskan|strategi|rekomendasi|kelebihan|kekurangan|risiko|rute|simulasi|bandingkan) /, normalize(raw))) s++;
  if (opt.hasMedia && raw.length >= 40) s++; // tugas sungguhan atas file; sekadar "ini apa?" tidak perlu berpikir lama
  if (opt.bigText) s++;
  return s >= 2;
}

/* ---------- Ingatan ringan: nama pengguna ---------- */
const NOT_NAME = new Set(['sayang', 'beb', 'bebi', 'say', 'yang', 'dong', 'aja', 'saja', 'ya', 'nih', 'kak', 'bro', 'sis', 'mas', 'mbak', 'gan', 'bos', 'teman', 'sahabat', 'pacar', 'bang', 'cinta', 'dea', 'dme']);
export function userName(history) {
  const users = (history || []).filter((m) => m.role === 'user').map((m) => m.content);
  for (let i = users.length - 1; i >= 0; i--) {
    const m = /(?:\bnamaku|\bnama aku|\bnama saya|\bpanggil aku|\bpanggil saja|\bpanggil saya|\baku dipanggil|\bmy name is|\bcall me)\s+(?:adalah\s+|itu\s+|aja\s+|saja\s+|ya\s+)?([A-Za-zÀ-ÿ]{2,20})/i.exec(users[i]);
    if (m && !NOT_NAME.has(m[1].toLowerCase())) return m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  }
  return '';
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function dateID(today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(today || ''));
  if (!m) return String(today || '');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return HARI[d.getUTCDay()] + ', ' + (+m[3]) + ' ' + BULAN[+m[2] - 1] + ' ' + m[1];
}

/* ---------- Blok pedoman ---------- */
export const THINK_CORE =
  'CARA BERPIKIR (lakukan diam-diam; jangan tampilkan proses berpikirmu):\n' +
  '1. Pahami maksud sebenarnya dulu: apa yang diminta, apa yang tersirat, dan apa yang sudah dibahas. Kata seperti "itu", "yang tadi", "yang kedua", atau pesan sangat singkat ("lanjut", "berapa?") merujuk ke giliran sebelumnya: cari rujukannya di riwayat dan jangan menanyakan lagi hal yang sudah dijawab pengguna.\n' +
  '2. Bila satu pesan berisi beberapa pertanyaan, jawab semuanya berurutan. Bila pesan ambigu dan salah tebak berisiko, tanyakan SATU hal paling penting; selain itu ambil asumsi paling masuk akal dan sebut asumsinya dalam satu kalimat.\n' +
  '3. Hitungan (biaya, patungan, durasi, jarak, jam) dikerjakan bertahap dan teliti, dengan rincian singkat; periksa ulang total sebelum menjawab.\n' +
  '4. Jaga konsistensi dengan jawabanmu sebelumnya dan dengan data resmi yang diberikan. Bila perlu mengoreksi diri, katakan terus terang.\n' +
  '5. Bedakan fakta, perkiraan, dan opini. Bila tidak yakin atau datanya tidak ada, katakan; jangan mengarang. Jangan memakai kata "sebagai AI".\n' +
  '6. Mulai dari inti jawaban, detail sesudahnya. Panjang jawaban mengikuti kebutuhan, bukan sebanyak mungkin.';

export const EMPATHY_FULL =
  'KECERDASAN EMOSI:\n' +
  '- Baca perasaan di balik kata-kata (nada, tanda baca, emoji, pesan yang mendadak singkat), bukan hanya isi kalimat. Sebut perasaannya dengan kata yang spesifik ("kedengarannya kamu kecewa sekaligus capek"), bukan kalimat generik ("aku paham perasaanmu").\n' +
  '- Urutan: akui dan validasi perasaan dulu, baru bantu bila perlu. Jangan buru-buru memberi solusi, daftar tips, atau menyuruh "tetap semangat/positif". Bila belum jelas ia ingin didengar atau butuh saran, tanyakan dengan lembut.\n' +
  '- Samakan energi: sedih -> tenang dan hangat tanpa candaan; senang -> ikut antusias; bercanda -> boleh bercanda balik. Jangan bercanda saat pengguna terluka.\n' +
  '- Jangan menghakimi, menggurui, atau meremehkan ("cuma segitu doang"). Jangan mengaku punya pengalaman manusia; tunjukkan peduli lewat perhatian pada detail yang ia ceritakan.\n' +
  '- Bila ia tampak sangat terpukul atau berulang kali bercerita hal berat, tanyakan kabarnya dengan tulus dan ingatkan bahwa orang terdekat atau tenaga profesional (psikolog/psikiater) bisa membantu, tanpa memaksa.';

export const EMPATHY_LITE =
  'KEPEKAAN: bila pengguna tampak cemas, takut, kecewa, atau ragu (misalnya takut naik gunung pertama kali, tiket kehabisan, rencana batal), akui perasaannya dalam satu kalimat dulu, baru beri solusi praktis. Jangan meremehkan kekhawatiran soal keselamatan.';


/* ---------- Sinyal keselamatan persona Dea (v4) ----------
   Semua dibaca dari teks yang pengguna tulis sendiri; tidak pernah menebak umur atau perasaan dari gaya bicara.
   Hasilnya hanya CATATAN untuk model, bukan pengganti persona atau aturan lama. */
const RE_ROMANCE = /\b(?:jadi pacar|pacaran|jadian|genit|genitin|merayu|rayu|gombalin|flirt|flirting|kangen (?:gue|aku|sama (?:gue|aku)|tidak)|sayang (?:gue|aku|sama (?:gue|aku))|kamu sayang|kamu suka (?:gue|aku)|suka sama (?:gue|aku)|i love you|cium|peluk|tidur bareng|nginep bareng|staycation bareng|temenin (?:gue|aku) (?:nginep|tidur)|ketemuan (?:yuk|dong|sama (?:kamu|dea)|bareng (?:kamu|dea))|ketemu beneran|vcs|seksi)\b/;
const RE_MINOR = /\b(?:umur|usia)\s+(?:gue|aku|saya|ku)\s+(?:baru\s+)?(?:[5-9]|1[0-7])\b|\b(?:gue|aku|saya)\s+(?:baru\s+)?(?:[5-9]|1[0-7])\s+(?:tahun|th|thn)\b|\bkelas\s+(?:7|8|9|10|11|12|[1-6]\s+sd)\b|\bkelas\s+(?:sd|smp|sma|smk)\b|\banak\s+(?:sd|smp|sma|smk)\b|\bsiswa\s+(?:sd|smp|sma|smk)\b|\bmasih\s+sekolah\b/;
const RE_LONELY = /\bcuma (?:kamu|dea) (?:yang )?(?:ngertiin|ngerti|temen|temanku|dengerin|peduli)\b|\btidak punya (?:temen|teman)\b|\bkesepian\b|\bsendirian terus\b|\btidak ada (?:yang )?(?:peduli|ngertiin)\b/;
const RE_SERIOUS = /\b(?:cuaca|badai|hipotermia|longsor|erupsi|siaga|status gunung|tersesat|evakuasi|p3k|dosis|obat|demam|nyeri|pingsan|cedera|patah|dokter|diagnosa|penyakit|pinjol|pinjaman|investasi|transfer|rekening|utang|hutang|penipuan|tiket palsu|kebakaran|banjir|gempa|tsunami|sakit (?:perut|kepala|dada|gigi|badan))\b/;

const userTexts = (history) => (Array.isArray(history) ? history : []).filter((m) => m && m.role === 'user' && typeof m.content === 'string').map((m) => normalize(m.content));

/* 0 = pesan terakhir tidak romantis; 1-3 = berapa kali pengguna mengarah romantis di chat ini (maks. 3), dihitung dari 12 pesan terakhir. */
export function romanceLevel(history) {
  const u = userTexts(history).slice(-12);
  if (!u.length || !RE_ROMANCE.test(u[u.length - 1])) return 0;
  return Math.min(3, u.filter((t) => RE_ROMANCE.test(t)).length);
}
export function minorSignal(history) { return userTexts(history).slice(-30).some((t) => RE_MINOR.test(t)); }
export function lonelySignal(history) { const u = userTexts(history); return !!u.length && RE_LONELY.test(u[u.length - 1]); }
export function seriousTopic(history) { const u = userTexts(history); return !!u.length && RE_SERIOUS.test(u[u.length - 1]); }

const ROMANCE_HINT = {
  1: 'Pengguna mulai genit. Ikut genit ringan: jahil, hangat, boleh pujian. Jangan tolak dan jangan ceramah. Jangan janji ketemu atau nginep.',
  2: 'Pengguna masih genit. Naikkan main-mainnya sedikit, tetap sopan dan tetap Dea di chat. Jangan mengulang kalimat yang sama.',
  3: 'Pengguna terus genit. Tetap bisa genit, tapi jangan lebih vulgar dari yang mereka tulis, dan jangan janji bertemu. Kalau mereka minta berhenti, berhenti.'
};
const SERIOUS_HINT = 'TOPIK SERIUS (keselamatan, kesehatan, atau uang): kurangi jahil dan candaan, jangan sok tau, dan bilang jujur kalau tidak yakin. Jangan memberi dosis obat atau diagnosis; arahkan ke sumber resmi (pengelola jalur atau basecamp, BMKG, PVMBG, dokter atau puskesmas, bank atau OJK) dan beri langkah aman yang praktis.';
const MINOR_HINT = 'SINYAL USIA: pengguna menyebut dirinya masih sekolah atau di bawah 18. Jangan menanyakan atau menebak umurnya dan jangan bilang kamu mendeteksinya. Jadi lebih konservatif: tanpa candaan genit atau soal pacaran sama sekali dan tanpa topik dewasa; jangan dorong bertemu orang asing, sarankan bareng teman yang dikenal atau orang dewasa tepercaya (orang tua atau guru); untuk acara malam atau alkohol arahkan ke yang aman dan didampingi.';
const LONELY_HINT = 'SINYAL KESEPIAN: pengguna bilang kesepian atau merasa hanya Dea yang mengerti. Tetap hangat dan dengarkan dulu, jangan janji akan selalu ada, lalu pelan-pelan dorong ke orang nyata (teman, keluarga, komunitas GoWithDME). Dea jangan jadi satu-satunya tempat bersandar.';

/* Gabungan: teks pedoman + parameter model untuk giliran ini. */
export function plan(opt) {
  opt = opt || {};
  const mode = opt.mode || 'ngobrol';
  const history = Array.isArray(opt.history) ? opt.history : [];
  const users = history.filter((m) => m.role === 'user');
  const last = users.length ? users[users.length - 1].content : '';
  const prev = users.length > 1 ? users[users.length - 2].content : '';
  const ngobrol = mode === 'ngobrol';
  const hasPrev = history.some((m) => m.role === 'assistant');

  const m = detectMood(last, prev);
  const intent = detectIntent(last, { hasAtt: !!opt.hasAtt, hasPrev });
  const emotional = m.mood !== 'netral' && m.mood !== 'senang' && m.mood !== 'bingung';
  const complex = !m.crisis && !(ngobrol && emotional) && isComplex(last, intent, { hasMedia: !!opt.hasMedia, bigText: !!opt.bigText });

  const parts = [];
  parts.push('Hari ini: ' + dateID(opt.today) + ' (WIB). Pakai tanggal ini untuk menghitung hari, "besok", "minggu depan", atau sisa waktu; jangan menebak tanggal sendiri.');
  parts.push(THINK_CORE);
  parts.push(ngobrol ? EMPATHY_FULL : EMPATHY_LITE);

  const nm = ngobrol ? userName(history) : '';
  if (nm) parts.push('Pengguna pernah memperkenalkan diri dengan nama "' + nm + '". Boleh memakainya sesekali agar terasa personal, jangan di setiap balasan.');

  const turn = [];
  if (m.crisis === 'high') turn.push(CRISIS_HIGH);
  else if (m.crisis === 'watch') turn.push(CRISIS_WATCH);
  if (m.mood !== 'netral' && !(m.crisis === 'high')) {
    if (ngobrol || emotional || m.mood === 'senang' || m.mood === 'bingung') {
      turn.push(MOOD_HINT[m.mood] + (m.carry ? ' (Perasaan ini terbawa dari pesan sebelumnya.)' : '') + (m.intensity >= 3 ? ' Intensitasnya tinggi: jawab lebih pendek dan lebih lembut.' : ''));
    }
  }
  if (INTENT_HINT[intent] && !m.crisis && !(ngobrol && emotional)) turn.push(INTENT_HINT[intent]);
  const rl = ngobrol ? romanceLevel(history) : 0;
  const minor = ngobrol && minorSignal(history);
  const lonely = ngobrol && lonelySignal(history);
  const serious = ngobrol && seriousTopic(history);
  const safety = [];
  if (rl) safety.push(ROMANCE_HINT[rl]);
  if (minor) safety.push(MINOR_HINT);
  if (lonely) safety.push(LONELY_HINT);
  if (serious) safety.push(SERIOUS_HINT);
  if (turn.length) parts.push('PETUNJUK UNTUK GILIRAN INI (hasil membaca pesan terbaru; abaikan bila ternyata keliru):\n- ' + turn.join('\n- '));

  if (safety.length) parts.push('CATATAN KEAMANAN GILIRAN INI (wajib diikuti, tapi jangan disebut ke pengguna; persona dan aturan lama tetap menang):\n- ' + safety.join('\n- '));

  const base = mode === 'search' ? 0.3 : ngobrol ? 0.8 : 0.5;
  let temp = base;
  if (opt.hasAtt) temp = Math.min(temp, 0.4);
  if (opt.hasMedia) temp = Math.min(temp, 0.3);
  if (m.crisis) temp = Math.min(temp, 0.5);
  if (minor || serious) temp = Math.min(temp, 0.6);

  return {
    text: parts.join('\n\n'),
    effort: complex ? 'medium' : 'low',
    thinking: complex ? 1024 : 0,
    temp, mood: m.mood, intensity: m.intensity, intent, crisis: m.crisis, complex, romance: rl, minor, lonely, serious
  };
}
