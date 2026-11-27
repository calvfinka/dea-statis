/* Tombol +: pilih foto, PDF, atau file teks. Disimpan di memori sampai pesan dikirim (diambil app.js lewat DeaAttach.take()).
   Format mengikuti cleanAttachments di Worker. */
(function () {
  var MAX = 4, items = [];
  var $ = function (id) { return document.getElementById(id); };
  function toast(msg) {
    var old = document.querySelector(".h-toast"); if (old) old.remove();
    var t = document.createElement("div"); t.className = "h-toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  function readUrl(file) {
    return new Promise(function (ok, no) {
      var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = no; r.readAsDataURL(file);
    });
  }
  // foto diperkecil dulu supaya lolos batas Worker (dan hemat kuota data)
  function shrink(file) {
    return readUrl(file).then(function (url) {
      return new Promise(function (ok, no) {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, 1600 / Math.max(img.width, img.height));
          var c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.82).split(",")[1]);
        };
        img.onerror = no; img.src = url;
      });
    });
  }
  function convert(f) {
    if (/^image\//.test(f.type)) return shrink(f).then(function (data) {
      if (data.length > 2800000) throw new Error("Foto terlalu besar.");
      return { type: "image", mime: "image/jpeg", data: data, name: f.name };
    }, function () { throw new Error("Foto ini tidak bisa dibaca."); });
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
      if (f.size > 4 * 1024 * 1024) return Promise.reject(new Error("PDF maksimal 4 MB."));
      return readUrl(f).then(function (u) { return { type: "pdf", mime: "application/pdf", data: u.split(",")[1], name: f.name }; });
    }
    if (/^text\//.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name)) {
      if (f.size > 200 * 1024) return Promise.reject(new Error("File teks maksimal 200 KB."));
      return f.text().then(function (t) {
        if (!t.trim()) throw new Error("File teks kosong.");
        if (t.length > 30000) toast("File panjang, hanya 30.000 karakter pertama yang dibaca.");
        return { type: "text", text: t.slice(0, 30000), name: f.name };
      });
    }
    return Promise.reject(new Error("Yang didukung: foto, PDF, atau teks."));
  }
  // total badan permintaan di Worker dibatasi 8 MB
  function size(list) { return list.reduce(function (a, x) { return a + (x.data || x.text || "").length; }, 0); }

  var boxes = [];
  function paint() {
    boxes.forEach(function (box) {
      box.textContent = ""; box.hidden = !items.length;
      items.forEach(function (it, i) {
        var chip = document.createElement("button"); chip.type = "button"; chip.className = "att-chip";
        chip.setAttribute("aria-label", "Hapus " + it.name); chip.textContent = it.name + "  ×";
        chip.addEventListener("click", function () { items.splice(i, 1); paint(); });
        box.appendChild(chip);
      });
    });
  }
  var input = document.createElement("input");
  input.type = "file"; input.multiple = true; input.hidden = true; input.id = "att-input";
  input.accept = "image/*,application/pdf,text/*,.txt,.md,.csv,.json";
  document.body.appendChild(input);
  input.addEventListener("change", function () {
    var files = Array.prototype.slice.call(input.files || []); input.value = "";
    files.reduce(function (chain, f) {
      return chain.then(function () {
        if (items.length >= MAX) { toast("Maksimal " + MAX + " lampiran."); return; }
        return convert(f).then(function (a) {
          if (size(items.concat(a)) > 7500000) { toast("Total lampiran terlalu besar."); return; }
          items.push(a); paint();
        }).catch(function (e) { toast(e.message || "File gagal dibaca."); });
      });
    }, Promise.resolve());
  });

  [["demo-form", "h-plus"], ["chat-form", "c-plus"]].forEach(function (p) {
    var form = $(p[0]), btn = $(p[1]); if (!form || !btn) return;
    var box = document.createElement("div"); box.className = "att-list"; box.hidden = true;
    form.parentNode.insertBefore(box, form); boxes.push(box);
    btn.addEventListener("click", function () { input.click(); });
  });
  // kirim lampiran tanpa tulisan: isi pertanyaan bawaan (dipasang sebelum home.js dan app.js memprosesnya)
  document.addEventListener("submit", function (e) {
    var ta = e.target.id === "demo-form" ? $("demo-input") : e.target.id === "chat-form" ? $("chat-input") : null;
    if (ta && items.length && !ta.value.trim()) ta.value = "Tolong jelaskan lampiran ini";
  }, true);

  window.DeaAttach = { take: function () { var out = items; items = []; paint(); return out; } };
})();
