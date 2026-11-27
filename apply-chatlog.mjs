/* Pasang pencatat percakapan ke repo dea-statis. Jalankan dari root repo dea-statis:  node apply-chatlog.mjs
   Aman diulang (tidak menambah dua kali). Salinan asli disimpan sebagai *.bak-chatlog. */
import fs from 'node:fs';

function edit(file, steps) {
  if (!fs.existsSync(file)) { console.log('LEWAT   ' + file + ' tidak ditemukan'); return false; }
  let s = fs.readFileSync(file, 'utf8');
  const orig = s;
  for (const [name, test, fn] of steps) {
    if (test(s)) { console.log('sudah   ' + file + ': ' + name); continue; }
    const n = fn(s);
    if (n === s) { console.log('GAGAL   ' + file + ': ' + name + ' (penanda tidak ketemu, tempel manual dari PATCH.md)'); process.exitCode = 1; continue; }
    s = n; console.log('dipasang ' + file + ': ' + name);
  }
  if (s !== orig) { fs.writeFileSync(file + '.bak-chatlog', orig); fs.writeFileSync(file, s); }
  return true;
}

edit('worker/worker.js', [
  ['import wrapChatLog', (s) => s.includes("from './chatlog.js'"),
    (s) => s.replace(/(import \{[^}]*\} from '\.\/usage\.js';\n)/, "$1import { wrapChatLog } from './chatlog.js';\n")],
  ['handler dibungkus', (s) => s.includes('wrapChatLog(deaCore)'),
    (s) => s.replace('export default {\n  async fetch(request, env, ctx) {', 'const deaCore = {\n  async fetch(request, env, ctx) {')
            .replace(/\nexport \{ needsInternet/, '\nexport default wrapChatLog(deaCore);\n\nexport { needsInternet')],
]);

edit('js/app.js', [
  ['kirim chat_log + chat_id', (s) => s.includes('DeaChatLog'),
    (s) => s.replace('        body: JSON.stringify({\n          message,', '        body: JSON.stringify(Object.assign({\n          message,')
            .replace('          user_id: userId(),\n        }),', '          user_id: userId(),\n        }, window.DeaChatLog ? window.DeaChatLog.fields(state.activeId, state.persona) : {})),')],
]);

edit('index.html', [
  ['muat js/chatlog.js', (s) => s.includes('js/chatlog.js'),
    (s) => s.replace('  <script src="js/app.js"></script>', '  <script src="js/chatlog.js"></script>\n  <script src="js/app.js"></script>')],
]);
