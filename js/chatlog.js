/* Persetujuan pencatatan obrolan (ai.gowithdme.com). Tanpa "Boleh", Worker tidak mencatat isi obrolan apa pun. */
(function (w) {
  "use strict";
  var K = "dea_chatlog";
  function get() { try { return localStorage.getItem(K); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(K, v); } catch (e) {} }

  w.DeaChatLog = {
    allowed: function () { return get() === "1"; },
    /* Bidang tambahan untuk body permintaan ke Worker. */
    fields: function (chatId) { return get() === "1" ? { chat_log: true, chat_id: chatId || undefined } : {}; },
    set: set
  };

  function show() {
    if (get() !== null || document.getElementById("chatlogBar")) return;
    var bar = document.createElement("div");
    bar.id = "chatlogBar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Pencatatan obrolan");
    bar.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:60;max-width:520px;margin:0 auto;padding:12px 14px;border-radius:14px;background:var(--surface,#fff);color:var(--ink,#1c1c1c);border:1px solid var(--line,#d8d2c6);box-shadow:0 8px 28px rgba(0,0,0,.18);font:14px/1.45 system-ui,sans-serif";
    bar.innerHTML = '<p style="margin:0 0 10px">Boleh obrolanmu dengan Dea dicatat? Pemilik Dea bisa membacanya untuk memperbaiki layanan. Disimpan 90 hari bersama kota kasar (bukan GPS, bukan IP). Hapus kapan saja lewat <b>personal@gowithdme.com</b>. Detail di <a href="https://gowithdme.com/privacy" target="_blank" rel="noopener">Privasi</a>.</p>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" data-v="0" style="font:inherit;padding:8px 14px;border-radius:99px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer">Tidak</button><button type="button" data-v="1" style="font:inherit;font-weight:700;padding:8px 14px;border-radius:99px;border:0;background:#1f7a4d;color:#fff;cursor:pointer">Boleh</button></div>';
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) return;
      set(b.getAttribute("data-v"));
      bar.remove();
    });
    document.body.appendChild(bar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(show, 1200); });
  else setTimeout(show, 1200);
})(window);
