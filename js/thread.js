/* Halaman thread (tahap 2). Hanya mempercantik tampilan #thread dan header;
   logika kirim/simpan chat tetap di app.js. Dibaca: #thread, localStorage "dea-pack-v1". */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var th = $("thread");
  if (!th) return;
  var KEY = "dea-pack-v1";
  var ICON = function (n) { return '<svg class="lu"><use href="#l-' + n + '"/></svg>'; };

  function toast(msg) {
    var old = document.querySelector(".h-toast"); if (old) old.remove();
    var t = document.createElement("div"); t.className = "h-toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  function copy(text, okMsg) {
    function fallback() {
      var a = document.createElement("textarea"); a.value = text; a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select(); try { document.execCommand("copy"); toast(okMsg); } catch (e) { toast("Gagal menyalin."); } a.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }
  function save(name, text, mime) {
    var url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" }));
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  var plain = function (t) { return String(t).replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\s?\[\d{1,2}\]/g, ""); };
  var rawOf = function (b) { return b ? (b.dataset.raw != null ? b.dataset.raw : b.textContent) : ""; };

  /* ---- format ringan: **tebal** dan [1] jadi elemen (tanpa innerHTML) ---- */
  function rich(b) {
    if (b.children.length) return;
    var t = b.textContent; b.dataset.raw = t;
    var parts = t.split(/(\*\*[^*\n]+\*\*|\[\d{1,2}\])/g);
    if (parts.length === 1) return;
    b.textContent = "";
    parts.forEach(function (p) {
      if (!p) return;
      var m = /^\*\*([^*\n]+)\*\*$/.exec(p);
      if (m) { var st = document.createElement("strong"); st.textContent = m[1]; b.appendChild(st); return; }
      m = /^\[(\d{1,2})\]$/.exec(p);
      if (m) { var sp = document.createElement("sup"); sp.className = "cite"; sp.textContent = m[1]; b.appendChild(sp); return; }
      b.appendChild(document.createTextNode(p));
    });
  }

  /* ---- kartu sumber (data dari bubble.dataset.src) ---- */
  function sourcesOf(b) {
    try { return JSON.parse((b && b.dataset.src) || "[]"); } catch (e) { return []; }
  }
  function sourceCards(list) {
    var box = document.createElement("div"); box.className = "t-cards";
    list.forEach(function (s, i) {
      if (!/^https?:\/\//i.test(s.u)) return;
      var a = document.createElement("a"); a.className = "t-card"; a.href = s.u; a.target = "_blank"; a.rel = "noopener noreferrer";
      var title = document.createElement("span"); title.textContent = s.t || s.u;
      var site = document.createElement("small");
      var host = s.u; try { host = new URL(s.u).hostname.replace(/^www\./, ""); } catch (e) {}
      site.textContent = (i + 1) + " · " + host;
      a.appendChild(title); a.appendChild(site); box.appendChild(a);
    });
    return box;
  }
  function paintSources(bar, list) {
    var key = JSON.stringify(list), old = bar.querySelector(".t-cards");
    if (old && old.dataset.key === key) return;
    if (old) old.remove();
    if (!list.length) return;
    var box = sourceCards(list); box.dataset.key = key; bar.appendChild(box);
  }

  /* ---- slide: disusun di perangkat dari isi jawaban (tanpa panggilan AI) ---- */
  function slidesFrom(answer, title, sources) {
    var slides = [{ h: title || "Jawaban Dea", items: [], cover: true }], cur = null;
    function open(h) { cur = { h: h, items: [] }; slides.push(cur); }
    String(answer).split("\n").forEach(function (line) {
      var t = line.trim();
      if (!t || /^_?Sumber: internet/.test(t)) return;
      var head = /^(?:#{1,4}\s+(.+)|\*\*([^*]+)\*\*:?)$/.exec(t);
      if (head) { open((head[1] || head[2]).replace(/\*\*/g, "")); return; }
      t = plain(t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1").replace(/^(?:[-*•]|\d+\.)\s+/, ""));
      if (!cur) open("Ringkasan");
      var used = cur.items.join("").length;
      if (cur.items.length >= 5 || (cur.items.length && used + t.length > 420)) open(cur.h.replace(/ \(lanjutan\)$/, "") + " (lanjutan)");
      cur.items.push(t);
    });
    slides = slides.filter(function (s) { return s.cover || s.items.length; });
    for (var i = 0; i < sources.length; i += 6)
      slides.push({ h: "Sumber", items: sources.slice(i, i + 6).map(function (s, k) { return (i + k + 1) + ". " + s.t + " - " + s.u; }) });
    return slides;
  }
  function node(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  var DECK_CSS = ".deck-page{box-sizing:border-box;width:100%;aspect-ratio:16/9;container-type:inline-size;overflow:hidden;background:#fff;color:#18181b;border-radius:12px;border-top:6px solid #EC4899;font-family:'Plus Jakarta Sans',sans-serif}" +
    ".deck-in{box-sizing:border-box;height:100%;padding:5cqw 6cqw;display:flex;flex-direction:column;justify-content:center;gap:2cqw}" +
    ".deck-in h2{margin:0;font-family:inherit;letter-spacing:0;font-size:4.4cqw;line-height:1.2;color:#8B5CF6}.deck-in ul{margin:0;padding-left:3cqw;font-size:2.3cqw;line-height:1.4;overflow-wrap:anywhere}.deck-in li{margin-bottom:.8cqw}" +
    ".deck-cover h2{font-size:6cqw}.deck-cover p{margin:0;font-size:2.4cqw;color:#EC4899}";
  var PRINT_CSS = "@page{size:297mm 167mm;margin:0}@media print{html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important;background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
    "body>*:not(.deck){display:none!important}.deck{position:static!important;overflow:visible!important;padding:0!important;background:#fff!important}.deck-bar{display:none!important}" +
    ".deck-list{max-width:none!important;display:block!important}.deck-page{width:297mm;height:166mm;border-radius:0;break-after:page}.deck-page:last-child{break-after:auto}}";
  function openDeck(ans, q) {
    q = String(q).replace(/^\s*(?:(?:dea|tolong)[\s,]+)*(?:riset mendalam|deep research)(?:\s+(?:tentang|soal|mengenai))?[\s:,-]*/i, "") || q;
    var b = ans && ans.querySelector(".bubble"); if (!b) return;
    var old = document.querySelector(".deck"); if (old) old.remove();
    var slides = slidesFrom(rawOf(b), q, sourcesOf(b));
    var deck = node("div", "deck"); deck.setAttribute("role", "dialog"); deck.setAttribute("aria-label", "Pratinjau slide");
    var css = node("style", "", DECK_CSS + PRINT_CSS); deck.appendChild(css);
    var bar = node("div", "deck-bar"), list = node("div", "deck-list");
    slides.forEach(function (s) {
      var page = node("section", "deck-page"), inner = node("div", "deck-in" + (s.cover ? " deck-cover" : ""));
      inner.appendChild(node("h2", "", s.h));
      if (s.cover) inner.appendChild(node("p", "", "Dibuat bersama Dea"));
      else { var ul = node("ul"); s.items.forEach(function (x) { ul.appendChild(node("li", "", x)); }); inner.appendChild(ul); }
      page.appendChild(inner); list.appendChild(page);
    });
    function btn(label, fn) { var x = node("button", "a-btn", label); x.type = "button"; x.addEventListener("click", fn); bar.appendChild(x); }
    btn("Simpan PDF", function () { window.print(); });
    btn("Unduh HTML", function () {
      save("dea-slide.html", '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Slide Dea</title><style>body{margin:0;padding:16px;background:#18181b}.deck-list{max-width:960px;margin:auto;display:grid;gap:16px}' + DECK_CSS + PRINT_CSS + '</style></head><body><div class="deck">' + list.outerHTML + '</div></body></html>', "text/html");
    });
    btn("Tutup", function () { deck.remove(); });
    deck.appendChild(bar); deck.appendChild(list); document.body.appendChild(deck);
  }

  /* ---- menu kecil ---- */
  function closeMenus() {
    document.querySelectorAll(".s-menu").forEach(function (m) { m.hidden = true; });
    var more = $("s-more"); if (more) more.setAttribute("aria-expanded", "false");
  }
  document.addEventListener("click", function (e) { if (!e.target.closest(".s-menu-wrap, .a-wrap")) closeMenus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeMenus(); });
  function toggleMenu(menu) { var open = menu.hidden; closeMenus(); menu.hidden = !open; return open; }
  function menuOf(items) {
    var m = document.createElement("div"); m.className = "s-menu"; m.setAttribute("role", "menu"); m.hidden = true;
    items.forEach(function (it) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem");
      b.innerHTML = ICON(it[0]); b.appendChild(document.createTextNode(it[1]));
      b.addEventListener("click", function () { closeMenus(); it[2](); });
      m.appendChild(b);
    });
    return m;
  }

  /* ---- potongan thread: tab + aksi di bawah jawaban ---- */
  function buildTabs() {
    var d = document.createElement("div"); d.className = "t-tabs";
    d.innerHTML = '<div class="t-row"><div class="t-list" role="tablist">' +
      '<button type="button" class="on" role="tab" data-tab="answer" aria-selected="true">' + ICON("spark") + 'Answer</button>' +
      '<button type="button" role="tab" aria-selected="false" data-tab="image">' + ICON("image") + 'Image</button>' +
      '<button type="button" role="tab" aria-selected="false" data-tab="video">' + ICON("video") + 'Video</button>' +
      '</div><button type="button" class="t-src" aria-expanded="false"><span>Source &amp; Thinking</span>' + ICON("right") + '</button></div>' +
      '<div class="t-panel" hidden></div>';
    d.querySelectorAll(".t-list button").forEach(function (b) {
      b.addEventListener("click", function () { showTab(d, b.getAttribute("data-tab")); });
    });
    var src = d.querySelector(".t-src"), panel = d.querySelector(".t-panel");
    src.addEventListener("click", function () {
      var open = panel.hidden; panel.hidden = !open; src.setAttribute("aria-expanded", String(open));
    });
    return d;
  }
  /* ---- tab Image / Video: diambil dari Worker saat tab dibuka, disimpan di memori ---- */
  var mediaCache = {};
  function loadMedia(type, q) {
    var key = type + "|" + q;
    if (mediaCache[key]) return mediaCache[key];
    var auth = window.DeaAuth;
    mediaCache[key] = Promise.resolve(auth ? auth.token() : null).then(function (token) {
      var h = { "Content-Type": "application/json" };
      if (token) h.Authorization = "Bearer " + token;
      return fetch("https://dme-ai.calvfinka.workers.dev", { method: "POST", headers: h, body: JSON.stringify({ media: type, q: q }) });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok || !j.items) throw new Error(j.message || ""); return j.items; });
    });
    mediaCache[key].catch(function () { delete mediaCache[key]; });
    return mediaCache[key];
  }
  function showTab(bar, type) {
    bar.querySelectorAll(".t-list button").forEach(function (b) {
      var on = b.getAttribute("data-tab") === type;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on));
    });
    var old = bar.querySelector(".t-media"); if (old) old.remove();
    bar.dataset.tab = type;
    for (var n = bar.nextElementSibling; n && !n.classList.contains("user"); n = n.nextElementSibling) n.hidden = type !== "answer";
    if (type === "answer") return;
    var box = node("div", "t-media " + type, "Sebentar, lagi dicari...");
    bar.appendChild(box);
    var u = bar.previousElementSibling, q = u && u.querySelector(".bubble") ? u.querySelector(".bubble").textContent : "";
    loadMedia(type, q).then(function (items) {
      box.textContent = items.length ? "" : "Belum ketemu " + (type === "image" ? "gambar" : "video") + " untuk pertanyaan ini.";
      items.forEach(function (it) {
        if (!/^https:/i.test(it.url) || !/^https:/i.test(it.thumb)) return;
        var a = node("a"); a.href = it.url; a.target = "_blank"; a.rel = "noopener noreferrer";
        var img = new Image(); img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.alt = it.title || ""; img.src = it.thumb;
        img.onerror = function () { a.remove(); };
        a.appendChild(img); if (type === "video") a.appendChild(node("span", "", it.title));
        box.appendChild(a);
      });
    }).catch(function (e) { box.textContent = e.message || "Gagal memuat. Ketuk tab lagi untuk mencoba."; });
  }
  function context(actions) {
    var ans = actions.previousElementSibling, bar = ans && ans.previousElementSibling, q = bar && bar.previousElementSibling;
    return {
      a: rawOf(ans && ans.querySelector(".bubble")),
      q: q && q.querySelector(".bubble") ? q.querySelector(".bubble").textContent : ""
    };
  }
  function buildActions() {
    var d = document.createElement("div"); d.className = "t-actions";
    var c = document.createElement("span"); c.className = "a-wrap";
    c.innerHTML = '<button type="button" class="a-btn pri">' + ICON("repeat") + 'Convert answer to...</button>';
    c.appendChild(menuOf([
      ["copy", "Teks polos (salin)", function () { copy(plain(context(d).a), "Disalin sebagai teks."); }],
      ["file", "Markdown (salin)", function () { var x = context(d); copy("# " + x.q + "\n\n" + x.a, "Disalin sebagai Markdown."); }],
      ["slides", "Slide", function () { openDeck(d.previousElementSibling, context(d).q); }],
      ["book", "Dea Docs", function () { toast("Convert ke Dea Docs segera hadir."); }]
    ]));
    c.firstChild.addEventListener("click", function () { toggleMenu(c.lastChild); });
    var e = document.createElement("span"); e.className = "a-wrap";
    e.innerHTML = '<button type="button" class="a-btn">' + ICON("download") + 'Export</button>';
    e.appendChild(menuOf([
      ["file", "Unduh .txt", function () { var x = context(d); save("dea-jawaban.txt", x.q + "\n\n" + plain(x.a) + "\n", "text/plain"); }],
      ["file", "Unduh .md", function () { var x = context(d); save("dea-jawaban.md", "# " + x.q + "\n\n" + x.a + "\n", "text/markdown"); }]
    ]));
    e.firstChild.addEventListener("click", function () { toggleMenu(e.lastChild); });
    var r = document.createElement("span"); r.className = "a-right";
    var cp = document.createElement("button"); cp.type = "button"; cp.className = "a-ico"; cp.setAttribute("aria-label", "Salin jawaban"); cp.innerHTML = ICON("copy");
    cp.addEventListener("click", function () { copy(plain(context(d).a), "Jawaban disalin."); });
    var sh = document.createElement("button"); sh.type = "button"; sh.className = "a-ico"; sh.setAttribute("aria-label", "Bagikan jawaban"); sh.innerHTML = ICON("share");
    sh.addEventListener("click", function () { var x = context(d); shareText(x.q + "\n\n" + plain(x.a)); });
    r.appendChild(cp); r.appendChild(sh);
    d.appendChild(c); d.appendChild(e); d.appendChild(r);
    return d;
  }
  function shareText(text) {
    if (navigator.share) navigator.share({ title: "Dea AI", text: text }).catch(function () {});
    else copy(text, "Disalin, tinggal tempel untuk dibagikan.");
  }

  /* ---- dekorasi: dijalankan ulang tiap #thread dibangun / teks mengalir ---- */
  var raf = 0;
  var obs = new MutationObserver(function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; decorate(); }); });
  function watch() { obs.observe(th, { childList: true, subtree: true, characterData: true }); }
  function decorate() {
    obs.disconnect();
    try {
      var inner = th.querySelector(".thread-inner"); if (!inner) return;
      inner.querySelectorAll(".msg:not(.user) .bubble").forEach(rich);
      inner.querySelectorAll(".msg.user").forEach(function (u) {
        var bar = u.nextElementSibling;
        if (!bar || !bar.classList.contains("t-tabs")) { bar = buildTabs(); u.after(bar); }
        var ans = bar.nextElementSibling;
        var isAns = ans && ans.classList.contains("msg") && !ans.classList.contains("user");
        var n = 0;
        var list = isAns ? sourcesOf(ans.querySelector(".bubble")) : [];
        paintSources(bar, list);
        if (isAns) {
          var seen = {};
          rawOf(ans.querySelector(".bubble")).replace(/\[(\d{1,2})\]/g, function (_, k) { seen[k] = 1; return ""; });
          n = Object.keys(seen).length;
        }
        if (list.length) n = list.length;
        bar.querySelector(".t-src span").textContent = (n ? n + " " : "") + "Source & Thinking";
        bar.querySelector(".t-panel").textContent = list.length
          ? "Sumber dari pencarian web. Angka [n] di jawaban sesuai nomor kartu."
          : n
          ? "Jawaban ini menandai " + n + " rujukan. Daftar tautan sumbernya belum tersedia di versi ini."
          : "Belum ada sumber yang dilampirkan di jawaban ini.";
        if (isAns && !ans.classList.contains("live")) {
          var nx = ans.nextElementSibling;
          if (!nx || !nx.classList.contains("t-actions")) ans.after(buildActions());
        }
      });
    } finally { watch(); }
  }

  /* ---- header thread ---- */
  function chat() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null") || {}; return (s.chats || []).filter(function (c) { return c.id === s.activeId; })[0] || null; }
    catch (e) { return null; }
  }
  function threadText(md) {
    var out = [];
    th.querySelectorAll(".thread-inner > .msg").forEach(function (m) {
      var b = m.querySelector(".bubble"); if (!b) return;
      var u = m.classList.contains("user"), t = u ? b.textContent : (md ? rawOf(b) : plain(rawOf(b)));
      out.push(u ? (md ? "## " + t : "Kamu: " + t) : (md ? t : "Dea: " + t));
    });
    return out.join("\n\n") + "\n";
  }
  function lastAnswer() {
    var all = th.querySelectorAll(".thread-inner > .msg:not(.user):not(.live) .bubble");
    return all.length ? plain(rawOf(all[all.length - 1])) : "";
  }
  $("s-slide").addEventListener("click", function () {
    var all = th.querySelectorAll(".thread-inner > .t-actions");
    if (!all.length) { toast("Belum ada jawaban untuk dijadikan slide."); return; }
    var d = all[all.length - 1];
    openDeck(d.previousElementSibling, context(d).q);
  });
  $("s-share").addEventListener("click", function () {
    var t = lastAnswer(); if (!t) { toast("Belum ada jawaban untuk dibagikan."); return; }
    shareText(t);
  });
  $("s-more").addEventListener("click", function () {
    var open = toggleMenu($("s-menu")); $("s-more").setAttribute("aria-expanded", String(open));
  });
  $("s-menu").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-act]"); if (!b) return;
    closeMenus();
    var act = b.getAttribute("data-act");
    if (act === "docs") toast("Save to Dea Docs segera hadir.");
    else if (act === "drive") toast("Save to Google Drive segera hadir.");
    else if (act === "notion") toast("Save to Notion segera hadir.");
    else if (act === "download") {
      var c = chat(); if (!th.querySelector(".thread-inner > .msg")) { toast("Thread masih kosong."); return; }
      save("dea-thread.md", "# " + ((c && c.title) || "Obrolan Dea") + "\n\n" + threadText(true), "text/markdown");
    } else if (act === "delete") {
      if (!chat()) { toast("Tidak ada thread yang dihapus."); return; }
      if (!window.confirm("Hapus thread ini? Tidak bisa dibatalkan.")) return;
      var del = document.querySelector("#history .hist.on .icon-btn");
      if (del) del.click();
      var home = document.querySelector("[data-open-home]"); if (home) home.click();
      toast("Thread dihapus.");
    }
  });

  /* ---- kotak ketik & pintasan ---- */
  var ci = $("chat-input");
  if (ci) ci.addEventListener("input", function () { ci.style.height = "auto"; ci.style.height = Math.min(ci.scrollHeight, 140) + "px"; });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I") && !$("studio").hidden) { e.preventDefault(); $("new-chat").click(); }
  });

  decorate();
})();
