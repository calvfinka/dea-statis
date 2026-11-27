/* Halaman awal (tahap 1). Hanya mengurus tampilan home; logika chat tetap di app.js.
   Memakai id lama (demo-form, demo-input, new-chat, history, open-voice, theme-home, [data-auth]). */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var app = $("home");
  if (!app) return;
  var KEY = "dea-pack-v1";
  var PLACE = "Tanya apa aja ke Dea...";
  var narrow = function () { return window.matchMedia("(max-width: 860px)").matches; };
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  /* ---- sidebar: collapse (desktop) / drawer (HP) ---- */
  function setCollapsed(on) { app.classList.toggle("collapsed", on); if (!narrow()) store("dea-home-side", on ? "0" : "1"); }
  function openDrawer() { app.classList.add("drawer"); app.classList.remove("collapsed"); $("h-scrim").hidden = false; }
  function closeDrawer() { app.classList.remove("drawer"); app.classList.add("collapsed"); $("h-scrim").hidden = true; }
  if (narrow() || read("dea-home-side") === "0") app.classList.add("collapsed");
  $("h-collapse").addEventListener("click", function () { narrow() ? closeDrawer() : setCollapsed(true); });
  $("h-open").addEventListener("click", function () { narrow() ? openDrawer() : setCollapsed(false); });
  $("h-scrim").addEventListener("click", closeDrawer);
  window.addEventListener("resize", function () {
    if (!narrow()) { app.classList.remove("drawer"); $("h-scrim").hidden = true; app.classList.toggle("collapsed", read("dea-home-side") === "0"); }
    else if (!app.classList.contains("drawer")) app.classList.add("collapsed");
  });

  /* ---- menu ---- */
  function focusInput() { var t = $("demo-input"); t.focus(); }
  $("h-newchat").addEventListener("click", function () { if (narrow()) closeDrawer(); focusInput(); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "i" || e.key === "I") && !app.hidden) { e.preventDefault(); focusInput(); }
  });
  $("h-more").addEventListener("click", function () {
    var open = $("h-more").getAttribute("aria-expanded") !== "true";
    $("h-more").setAttribute("aria-expanded", String(open));
    $("h-more-list").hidden = !open;
  });
  $("h-more-voice").addEventListener("click", function () { $("open-voice").click(); });
  $("h-more-theme").addEventListener("click", function () { $("theme-home").click(); });
  $("h-settings").addEventListener("click", function () { var b = document.querySelector(".h-login [data-auth]"); if (b) b.click(); });

  /* ---- riwayat: 5 chat terakhir dari localStorage ---- */
  function chats() {
    try { var s = JSON.parse(read(KEY) || "null"); return (s && s.chats) || []; } catch (e) { return []; }
  }
  function paintHist() {
    var box = $("h-hist");
    var list = chats().filter(function (c) { return c.msgs && c.msgs.length; }).slice(0, 5);
    box.innerHTML = "";
    if (!list.length) { var p = document.createElement("p"); p.textContent = "Belum ada obrolan."; box.appendChild(p); return; }
    list.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button"; b.textContent = c.title || "Obrolan"; b.title = c.title || "";
      b.addEventListener("click", function () {
        var btns = document.querySelectorAll("#history .hist .open");
        var all = chats(); var idx = all.findIndex(function (x) { return x.id === c.id; });
        if (btns[idx]) btns[idx].click();
        closeDrawerIfNarrow();
      });
      box.appendChild(b);
    });
  }
  function closeDrawerIfNarrow() { if (narrow()) { app.classList.remove("drawer"); $("h-scrim").hidden = true; } }
  var hist = $("history");
  if (hist && window.MutationObserver) new MutationObserver(paintHist).observe(hist, { childList: true });
  paintHist();

  /* ---- nama di profil / tombol login (diisi auth.js lewat [data-auth]) ---- */
  var loginBtn = document.querySelector(".h-login [data-auth]");
  function paintMe() {
    var t = loginBtn ? loginBtn.textContent.trim() : "";
    $("h-me-name").textContent = t && t !== "Masuk" && t !== "Login" ? t : "Tamu";
  }
  if (loginBtn && window.MutationObserver) new MutationObserver(paintMe).observe(loginBtn, { childList: true, characterData: true, subtree: true });
  paintMe();

  /* ---- search box ---- */
  var ta = $("demo-input");
  function grow() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; }
  ta.addEventListener("input", grow);
  // app.js menimpa placeholder tiap render; kembalikan ke teks Dea
  function lockPlace() { if (ta.placeholder !== PLACE) ta.placeholder = PLACE; }
  new MutationObserver(lockPlace).observe(ta, { attributes: true, attributeFilter: ["placeholder"] });
  lockPlace();

  // kirim dari home = obrolan baru (klik #new-chat dulu, lalu app.js mengirim ke chat baru itu)
  document.addEventListener("submit", function (e) {
    if (e.target !== $("demo-form")) return;
    if (!ta.value.trim()) return;
    var nc = $("new-chat");
    if (nc) nc.click();
  }, true);

  function toast(msg) {
    var old = document.querySelector(".h-toast"); if (old) old.remove();
    var t = document.createElement("div"); t.className = "h-toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200);
  }
  document.querySelectorAll("a[data-soon]").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); toast(a.getAttribute("data-soon")); });
  });
  $("h-create").addEventListener("click", function () { $("h-create").classList.toggle("on"); toast($("h-create").classList.contains("on") ? "Mode Create aktif (tampilan saja dulu)." : "Mode Create mati."); });
  $("h-web").setAttribute("aria-pressed", String(read("dea-web") !== "0"));
  $("h-web").addEventListener("click", function () {
    var on = $("h-web").getAttribute("aria-pressed") !== "true";
    $("h-web").setAttribute("aria-pressed", String(on)); store("dea-web", on ? "1" : "0");
    toast(on ? "Pencarian web aktif (otomatis bila perlu)." : "Pencarian web dimatikan.");
  });
  var pro = $("h-pro");
  pro.setAttribute("aria-checked", read("dea-home-pro") === "1" ? "true" : "false");
  pro.addEventListener("click", function () {
    var on = pro.getAttribute("aria-checked") !== "true";
    pro.setAttribute("aria-checked", String(on)); store("dea-home-pro", on ? "1" : "0");
  });
  $("h-hint-x").addEventListener("click", function () { $("h-hint").remove(); });
  $("h-agent").addEventListener("click", focusInput);

  /* ---- chips: pilih mode lewat pill tersembunyi milik app.js, isi prompt ---- */
  var MODE_LABEL = { ngobrol: "Ngobrol", gunung: "Gunung", konser: "Konser", trip: "Trip" };
  function setMode(id) {
    var btns = document.querySelectorAll("#mode-pills button");
    for (var i = 0; i < btns.length; i++) if (btns[i].textContent === MODE_LABEL[id]) { btns[i].click(); break; }
  }
  document.querySelectorAll(".h-chip[data-q]").forEach(function (c) {
    c.addEventListener("click", function () {
      setMode(c.getAttribute("data-mode"));
      ta.value = c.getAttribute("data-q"); grow(); focusInput();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  });
  $("h-chip-more").addEventListener("click", function () {
    var b = $("h-chip-more"), open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open)); $("h-chip-extra").hidden = !open;
  });
})();
