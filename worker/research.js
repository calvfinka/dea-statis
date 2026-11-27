/* Deep Research: beberapa pencarian paralel, digabung jadi satu daftar sumber, lalu dijawab sebagai laporan bersitasi.
   Aktif bila pesan diawali "riset mendalam ..." (tombol Deep Research di home) atau klien mengirim research:true. */
import { searchInternet } from './search.js';

export const RESEARCH_COST = 3; // jatah pesan: satu riset = tiga pencarian
const PREFIX = /^\s*(?:(?:dea|tolong|please|plis)[\s,]+)*(?:riset mendalam|deep research)\b(?:\s+(?:tentang|soal|mengenai))?[\s:,-]*/i;
const MAX_SOURCES = 10;

/* Topik riset dari pesan terakhir; '' = bukan permintaan riset (atau topiknya kosong). */
export function researchTopic(history, flag) {
  const last = [...(history || [])].reverse().find((m) => m && m.role === 'user');
  const text = String((last && last.content) || '');
  if (!PREFIX.test(text) && flag !== true) return '';
  return text.replace(PREFIX, '').replace(/\s+/g, ' ').trim().slice(0, 150);
}

export function researchQueries(topic, today) {
  const year = String(today || '').match(/20\d\d/);
  return [topic, topic + ' terbaru' + (year ? ' ' + year[0] : ''), topic + ' kelebihan kekurangan dan tips'];
}

/* -> { ok:true, answer:'', results, sites } | { ok:false, reason, results:[] } (bentuk sama dengan searchInternet) */
export async function researchSearch(topic, env, today) {
  const all = await Promise.all(researchQueries(topic, today).map((q) => searchInternet(q, env)));
  const seen = new Set();
  const results = [];
  // bergiliran antar pencarian supaya tiap sudut pandang kebagian tempat
  for (let i = 0; i < 5; i++) {
    for (const sr of all) {
      const r = sr.ok && sr.results[i];
      if (!r || !r.url || seen.has(r.url) || results.length >= MAX_SOURCES) continue;
      seen.add(r.url);
      results.push(r);
    }
  }
  if (!results.length) return { ok: false, reason: (all[0] && all[0].reason) || 'empty', results: [] };
  const sites = [];
  results.forEach((r) => { try { const h = new URL(r.url).hostname.replace(/^www\./, ''); if (!sites.includes(h)) sites.push(h); } catch (e) {} });
  return { ok: true, answer: '', results, sites: sites.slice(0, 3) };
}

export const RESEARCH_NOTE =
  '[MODE DEEP RESEARCH - hanya untuk balasan ini, menggantikan aturan panjang jawaban] Tulis laporan riset sekitar 300-450 kata dari hasil pencarian di atas: ' +
  'ringkasan 2 kalimat, lalu 3-4 bagian dengan subjudul **tebal** dan poin berawalan "- ", lalu kesimpulan serta saran langkah berikutnya. ' +
  'Jangan pakai tabel atau judul "#". Setiap fakta diberi nomor sumber [n]. Kalau sumber saling beda atau ada yang tidak ditemukan, katakan terus terang. ' +
  'Gaya bicara tetap Dea.';
