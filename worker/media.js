/* Isi tab Image / Video: { media:'image'|'video', q } -> { items:[{url, thumb, title}] }. Memakai kunci Tavily / Serper yang sama dengan search.js. */
import { providerOf } from './search.js';

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const web = (u) => typeof u === 'string' && /^https:\/\//i.test(u) && u.length < 1000;
const youtubeThumb = (u) => {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(String(u));
  return m ? 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg' : '';
};

/* -> array item, atau null bila penyedia gagal */
export async function searchMedia(type, query, env) {
  const provider = providerOf(env);
  const q = clip(query, 180);
  if (!provider || !q) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const serper = provider === 'serper';
    const url = serper ? 'https://google.serper.dev/' + (type === 'image' ? 'images' : 'videos') : 'https://api.tavily.com/search';
    const body = serper
      ? { q, gl: 'id', hl: 'id', num: 12, safe: 'active' }
      : Object.assign({ query: q, search_depth: 'basic', max_results: 10 }, type === 'image' ? { include_images: true } : { include_domains: ['youtube.com'] });
    const res = await fetch(url, {
      method: 'POST', signal: ctl.signal, body: JSON.stringify(body),
      headers: Object.assign({ 'Content-Type': 'application/json' }, serper ? { 'X-API-KEY': env.SERPER_API_KEY } : { Authorization: 'Bearer ' + env.TAVILY_API_KEY }),
    });
    if (!res.ok) { console.error('MEDIA_FAIL ' + provider + ' HTTP ' + res.status); return null; }
    const j = await res.json();
    let items;
    if (type === 'image') {
      items = serper
        ? (j.images || []).map((r) => ({ url: r.link || r.imageUrl, thumb: r.thumbnailUrl || r.imageUrl, title: r.title }))
        : (j.images || []).map((r) => { const u = typeof r === 'string' ? r : r && r.url; return { url: u, thumb: u, title: r && r.description }; });
    } else {
      items = serper
        ? (j.videos || []).map((r) => ({ url: r.link, thumb: youtubeThumb(r.link) || r.imageUrl, title: r.title }))
        : (j.results || []).map((r) => ({ url: r.url, thumb: youtubeThumb(r.url), title: r.title })).filter((r) => r.thumb);
    }
    return items.filter((r) => web(r.url) && web(r.thumb)).slice(0, 12).map((r) => ({ url: r.url, thumb: r.thumb, title: clip(r.title, 120) }));
  } catch (e) {
    console.error('MEDIA_FAIL ' + provider + ' ' + clip(e && e.message, 120));
    return null;
  } finally { clearTimeout(timer); }
}
