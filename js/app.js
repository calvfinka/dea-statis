(function () {
  const KEY = "dea-pack-v1";
  const PERSONAS = {
    ceria: { label: "Ceria", blurb: "Hangat, ringan, nemenin kayak bestie yang lagi semangat.", sample: "Hai. Aku Dea. Cerita aja, aku dengerin sambil senyum." },
    galak: { label: "Galak", blurb: "Tegas dan to the point. Tetap sayang, tidak menghina.", sample: "Duduk dulu. Cerita yang jujur, jangan muter-muter." },
    manja: { label: "Manja", blurb: "Lembut dan nempel. Minta perhatian, tetap sopan.", sample: "Jangan pergi dulu. Aku mau nemenin kamu hari ini." },
  };
  const MODES = {
    ngobrol: { label: "Ngobrol", title: "Mau ngobrol apa hari ini?", hint: "Curhat, jokes, atau sekadar ditemenin. Dea tidak buru-buru.", placeholder: "Curhat aja, Dea dengerin…", prompts: ["Lagi capek banget nih", "Temenin ngobrol dong", "Bikinin jokes receh"] },
    gunung: { label: "Gunung", title: "Mau naik gunung mana?", hint: "Kerangka itinerary, checklist, dan hal yang wajib dicek di pengelola.", placeholder: "Tanya soal pendakian…", prompts: ["Itinerary Gunung Prau 2 hari", "Gunung apa yang cocok untuk pemula?", "Checklist perlengkapan naik gunung"] },
    konser: { label: "Konser", title: "Konser mana yang mau kamu datangi?", hint: "Budget, cara pergi, dan titik kumpul. Tanggal pasti dicek di sumber resmi.", placeholder: "Tanya soal konser…", prompts: ["Budget nonton festival di Jakarta", "Tips pergi konser sendirian", "Cara patungan tiket sama teman"] },
    trip: { label: "Trip", title: "Mau jalan ke mana kali ini?", hint: "Rute harian dan hitungan patungan, tanpa mengarang harga kaku.", placeholder: "Mau trip ke mana?", prompts: ["Itinerary Jogja 3 hari 2 malam", "Hitung patungan trip 4 orang", "Spot santai dekat Bandung"] },
  };
  const CRISIS = "Aku di sini, dan kamu nggak harus nanggung ini sendirian. Kalau pikiran menyakiti diri muncul, hubungi orang yang kamu percaya sekarang, atau layanan darurat 119 / 112. Aku teman ngobrol, bukan pengganti bantuan profesional. Mau cerita pelan-pelan, aku tetap dengerin.";

  const $ = (id) => document.getElementById(id);
  let state = load();
  let pending = false;
  let gen = 0;
  let rec = null;
  let heard = "";

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const AUTH = () => window.DeaAuth || null;
  const signedIn = () => !!(AUTH() && AUTH().user);
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      if (raw && raw.persona && raw.mode) return raw;
    } catch (e) {}
    return { persona: "ceria", mode: "ngobrol", chats: [], activeId: null };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function theme() { return document.documentElement.classList.contains("dark") ? "dark" : "light"; }
  function setTheme(next) {
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("dea-theme", next);
    document.querySelectorAll("#theme-home, #theme-chat").forEach((b) => {
      b.setAttribute("aria-label", next === "dark" ? "Mode terang" : "Mode gelap");
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#101311" : "#f4efe6");
  }
  function active() { return state.chats.find((c) => c.id === state.activeId) || null; }
  function ensure() {
    if (active()) return state.activeId;
    const chat = { id: uid(), title: "Obrolan baru", persona: state.persona, mode: state.mode, msgs: [], updated: Date.now() };
    state.chats.unshift(chat);
    state.chats = state.chats.slice(0, 40);
    state.activeId = chat.id;
    save();
    return chat.id;
  }

  function pick(arr, seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
    return arr[h % arr.length];
  }
  function echo(text) {
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) return "itu";
    return t.length > 84 ? t.slice(0, 81) + "…" : t;
  }
  function detect(q, mode) {
    if (/bunuh diri|pengen mati|nyakitin diri|self harm|mengakhiri hidup/.test(q)) return "crisis";
    if (/joke|jokes|lucu|receh|lawak/.test(q)) return "joke";
    if (mode === "gunung" || /gunung|pendakian|summit|basecamp|prau|semeru|bromo|rinjani|merbabu|checklist perlengkapan/.test(q)) return "gunung";
    if (mode === "konser" || /konser|festival|tiket|lineup|nonton/.test(q)) return "konser";
    if (mode === "trip" || /trip|itinerary|jalan-jalan|liburan|jogja|bandung|bali|patungan/.test(q)) return "trip";
    if (/capek|lelah|burnout|pegal|ngantuk banget/.test(q)) return "capek";
    if (/sedih|galau|nangis|putus|kesepian|hampa/.test(q)) return "sedih";
    if (/^(hai|halo|hai dea|hei|pagi|siang|malam)\b/.test(q) || q.length < 8) return "halo";
    if (/tugas|deadline|skripsi|kerjaan|produktif|to-do|todo|rapihin/.test(q)) return "tugas";
    return "default";
  }
  function mountain(q) {
    if (q.includes("prau")) return "Gunung Prau cocok buat yang baru mulai. Jalur yang sering dipakai dari Dieng (Patak Banteng atau Kalilembu), biasanya 1–2 hari, puncaknya ramai karena sunrise. Bawa jaket angin, headlamp, jas hujan, dan air cukup. Kuota dan status buka dicek ke pengelola sebelum berangkat, jangan andalin kabar di story orang.";
    if (q.includes("semeru")) return "Semeru bukan gunung santai. Butuh simaksi, kuota, dan cek status aktivitas vulkanik di PVMBG atau pengelola. Jalur umum lewat Ranu Pane. Kalau cuaca atau status naik, jangan nekat. Aku bisa susunkan kerangka hari, tapi keputusan aman tetap di kamu dan aturan resmi.";
    if (q.includes("bromo")) return "Bromo lebih ke kawasan sunrise daripada pendakian teknis. Penanjakan subuh, lautan pasir, lalu kawah. Bawa jaket tebal, datang lebih awal, dan hormati warga Tengger. Jeep sering dipatungan. Cek jam buka dan cuaca, kabut bisa bikin view hilang total.";
    if (/pemula/.test(q)) return "Buat pemula, pilih yang durasinya pendek dan pengelolanya jelas: Prau, Papandayan, atau Andong sering jadi langkah pertama. Hindari yang butuh simaksi ketat kalau kamu belum pernah kemah. Yang penting sepatu sudah dipakai jalan, bukan baru dibeli di hari H.";
    return "Sebut nama gunung, jumlah hari, dan kamu pemula atau sudah biasa. Nanti aku pecah jadi jam berangkat, pos, dan checklist. Harga tiket dan status buka berubah, jadi aku kasih kerangka, bukan angka palsu.";
  }
  function concert(q) {
    const city = /jakarta/.test(q) ? "Jakarta" : /bandung/.test(q) ? "Bandung" : /surabaya/.test(q) ? "Surabaya" : "kotamu";
    return "Oke, kerangka nonton di " + city + ". Pecah duit jadi empat: tiket (hanya kanal resmi), pulang-pergi, makan, dan darurat. Datang lebih awal, bawa powerbank, tentukan titik kumpul yang bukan pintu keluar, dan rencanakan pulang sebelum ojol menghilang. Aku tidak mengarang tanggal atau harga. Kasih tahu artis atau festivalnya, nanti aku bantu susun malamnya.";
  }
  function trip(q) {
    if (/jogja|yogyakarta/.test(q)) return "Jogja 3 hari 2 malam, versi santai.\n\nHari 1: sampai, cuci muka, Malioboro sore dan makan warmindo atau gudeg.\nHari 2: Keraton dan Taman Sari pagi, Prambanan sore kalau kaki masih kuat.\nHari 3: hutan pinus atau pantai selatan, pilih satu saja.\n\nPatungan 4 orang: satu penginapan, makan warung, motor opsional. Angka kamar cek di hari itu, aku tidak mengunci harga.";
    if (/bandung/.test(q)) return "Bandung enak kalau tidak dipaksa keliling semua spot foto. Pilih satu arah per hari: utara (Dago, lalu satu tempat alam seperti Tangkuban atau Kawah Putih) atau selatan yang lebih sepi. Sisakan sore buat duduk, bukan buat macet. Mau aku susunkan 2 hari berdasarkan kamu naik apa: kereta atau mobil?";
    if (/patungan/.test(q)) return "Patungan yang tidak berantem: tulis dulu penginapan, makan, bensin atau tiket, dan dana darurat. Bagi rata yang bersama, yang pribadi (oleh-oleh, kopi sendiri) tidak masuk. Satu orang pegang catatan, bukan empat orang ingat-ingat. Kasih angka kasar kamu, nanti aku bantu bagi.";
    return "Mau ke mana, berapa hari, dan berapa orang? Aku susun ritme paginya jalan, sorenya istirahat. Satu kota yang kamu sebut, aku kasih kerangka hari tanpa mengarang harga hotel.";
  }
  function localReply(persona, mode, history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    const text = last ? last.content : "";
    const q = text.toLowerCase();
    const kind = detect(q, mode);
    if (kind === "crisis") return CRISIS;
    let body = "";
    if (kind === "joke") body = pick(["Kenapa pendaki bawa jaket dua? Satu buat dingin, satu buat gaya di basecamp. Yang kedua lebih berat, anehnya.", "Deadline itu kayak sunrise di Prau: kelihatan indah dari jauh, pas deket baru sadar kamu belum siap.", "Aku tadi mau bikin jokes konser, tapi tiketnya sold out. Ya sudah, yang ini gratis."], text);
    else if (kind === "gunung") body = /checklist/.test(q) ? "Checklist naik gunung, versi yang benar-benar kepake:\n\n- Sepatu yang sudah dipakai, bukan baru\n- Jaket angin dan lapisan dalam\n- Headlamp plus baterai cadangan\n- Jas hujan, air, dan camilan asin\n- Kantong sampah, obat pribadi, powerbank\n- Cek status gunung dan surat izin kalau wajib\n\nMau aku sesuaikan buat 1 hari atau menginap?" : mountain(q);
    else if (kind === "konser") body = concert(q);
    else if (kind === "trip") body = trip(q);
    else if (kind === "capek") body = persona === "galak" ? "Berhenti dulu. Kamu bukan mesin. Sebut satu hal yang paling nguras hari ini, nanti aku potong jadi langkah 20 menit. Sisanya tidak harus selesai malam ini." : "Capek itu tanda kamu sudah berusaha, bukan tanda kamu lemah. Tarik napas bentar. Mau cerita isi harinya, atau mau aku susunkan istirahat 20 menit yang masuk akal?";
    else if (kind === "sedih") body = "Sedihnya valid, tidak usah dirapikan dulu. Aku tidak akan buru-buru kasih solusi. Kalau mau, cerita satu bagian yang paling berat. Kalau belum sanggup, kita diam bareng sebentar juga tidak apa-apa.";
    else if (kind === "halo") body = persona === "manja" ? "Akhirnya kamu datang. Mau curhat, atau aku yang mulai dengan nanya harimu?" : "Hai, aku Dea dari GoWithDME. Mau curhat, atau dibantu rencanain gunung, konser, atau trip?";
    else if (kind === "tugas") body = "Kita pecah biar kepala enteng.\n\n1. Versi jelek yang selesai dalam 25 menit.\n2. Satu bagian yang benar-benar dinilai orang.\n3. Sisanya dijadwalkan jamnya, bukan 'nanti'.\n\nMau mulai dari yang mana?";
    else body = 'Aku denger: "' + echo(text) + '". Mau aku tanggepin sebagai teman, atau kamu butuh langkah praktisnya? Satu saja, biar tidak berantakan.';
    if (persona === "galak" && kind !== "halo") return "Oke. " + body + " Jangan nanggung semuanya sendiri.";
    if (persona === "manja") return "Hei, aku di sini ya. " + body;
    return body;
  }

  /* Balasan dari Worker `dme-ai`. "" = pakai otak lokal. Login = kirim token supaya jatah dihitung per akun. */
  async function remoteReply(history) {
    if (location.hostname !== "ai.gowithdme.com") return "";
    const message = history[history.length - 1].content;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const token = AUTH() ? await AUTH().token() : null;
      const res = await fetch("https://dme-ai.calvfinka.workers.dev", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
        body: JSON.stringify({
          message,
          mode: state.mode,
          history: history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
          stream: true,
          user_id: userId(),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        // 429 (jatah/menit) dan 400 (pesan terlalu panjang) membawa pesan ramah dari Worker
        if (res.status === 429 || res.status === 400) {
          try { const d = await res.json(); if (d && d.message) return String(d.message); } catch (e) {}
        }
        return "";
      }
      return (await res.text())
        .replace(/^\s*<!--dme:[\s\S]*?-->\n?/, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^\s*_Dea lagi mikir\.\.\._\s*/, "")
        .trim();
    } catch (e) {
      return "";
    } finally {
      clearTimeout(timer);
    }
  }
  function userId() {
    try {
      let id = localStorage.getItem("dme_user_id");
      if (!id) { id = uid(); localStorage.setItem("dme_user_id", id); }
      return id;
    } catch (e) { return "web"; }
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function msgNode(m) {
    const art = el("article", "msg" + (m.role === "user" ? " user" : ""));
    art.appendChild(el("p", "who", m.role === "user" ? "Kamu" : "Dea"));
    const bubble = el("p", "bubble", m.content);
    if (m.role === "dea") {
      const name = el("div", "dea-name");
      name.appendChild(el("span", "logo"));
      name.appendChild(document.createTextNode("Dea · " + PERSONAS[state.persona].label));
      art.insertBefore(name, art.firstChild);
      art.querySelector(".who").remove();
    }
    art.appendChild(bubble);
    return art;
  }
  function paintPicks(root, compact) {
    root.innerHTML = "";
    Object.keys(PERSONAS).forEach((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(state.persona === id));
      const strong = el("strong", "", PERSONAS[id].label);
      b.appendChild(strong);
      if (!compact) b.appendChild(el("span", "", PERSONAS[id].blurb));
      b.addEventListener("click", () => {
        state.persona = id;
        const chat = active();
        if (chat) chat.persona = id;
        save();
        render();
      });
      root.appendChild(b);
    });
  }
  function paintPills(root) {
    root.innerHTML = "";
    Object.keys(MODES).forEach((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(state.mode === id));
      b.textContent = MODES[id].label;
      b.addEventListener("click", () => {
        state.mode = id;
        const chat = active();
        if (chat) chat.mode = id;
        save();
        render();
      });
      root.appendChild(b);
    });
  }
  function paintLog(node, msgs, welcome) {
    node.innerHTML = "";
    const list = msgs.length ? msgs.slice(-6) : [{ role: "dea", content: welcome }];
    list.forEach((m) => node.appendChild(m.role === "dea" && !msgs.length ? simpleDea(m.content) : msgNode(m)));
    if (pending) {
      const t = el("div", "typing");
      t.appendChild(el("i")); t.appendChild(el("i")); t.appendChild(el("i"));
      node.appendChild(t);
    }
    node.scrollTop = node.scrollHeight;
  }
  function simpleDea(text) {
    const art = el("article", "msg");
    art.appendChild(el("p", "who", "Dea"));
    art.appendChild(el("p", "bubble", text));
    return art;
  }
  function when(ts) {
    const d = Date.now() - ts;
    if (d < 60000) return "baru saja";
    if (d < 3600000) return Math.floor(d / 60000) + " mnt";
    if (d < 86400000) return Math.floor(d / 3600000) + " jam";
    return new Date(ts).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  }
  function render() {
    const mode = MODES[state.mode];
    const persona = PERSONAS[state.persona];
    $("demo-meta").textContent = persona.label + " · " + mode.label;
    $("persona-quote").textContent = "“" + persona.sample + "”";
    $("demo-input").placeholder = mode.placeholder;
    $("chat-input").placeholder = mode.placeholder;
    paintPicks($("persona-picks"), false);
    paintPicks($("persona-side"), true);
    paintPills($("mode-pills"));
    paintPills($("mode-bar"));
    const cards = $("mode-cards");
    cards.innerHTML = "";
    Object.keys(MODES).forEach((id) => {
      const a = el("article", "card");
      a.appendChild(el("h3", "", MODES[id].label));
      a.appendChild(el("p", "", MODES[id].hint));
      cards.appendChild(a);
    });
    const chips = $("demo-chips");
    chips.innerHTML = "";
    mode.prompts.slice(0, 2).forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p;
      b.addEventListener("click", () => send(p));
      chips.appendChild(b);
    });
    const chat = active();
    paintLog($("demo-log"), chat ? chat.msgs : [], persona.sample);
    const thread = $("thread");
    thread.innerHTML = "";
    const inner = el("div", "thread-inner");
    if (!chat || !chat.msgs.length) {
      const empty = el("div", "empty");
      empty.appendChild(el("h1", "", mode.title));
      empty.appendChild(el("p", "sub", mode.hint));
      empty.appendChild(el("p", "", "Suasana " + persona.label + ". " + persona.sample));
      mode.prompts.forEach((p) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "prompt";
        b.textContent = p;
        b.addEventListener("click", () => send(p));
        empty.appendChild(b);
      });
      inner.appendChild(empty);
    } else {
      chat.msgs.forEach((m) => inner.appendChild(msgNode(m)));
    }
    if (pending) {
      const t = el("div", "typing");
      t.appendChild(el("i")); t.appendChild(el("i")); t.appendChild(el("i"));
      inner.appendChild(t);
    }
    thread.appendChild(inner);
    thread.scrollTop = thread.scrollHeight;
    const hist = $("history");
    hist.innerHTML = "";
    if (!state.chats.length) hist.appendChild(el("p", "fine", signedIn() ? "Belum ada riwayat. Percakapan tersimpan di akunmu." : "Belum ada riwayat. Percakapan tersimpan di perangkat ini. Masuk untuk menyimpannya di akun."));
    state.chats.forEach((c) => {
      const row = el("div", "hist" + (c.id === state.activeId ? " on" : ""));
      const open = document.createElement("button");
      open.type = "button";
      open.className = "open";
      open.appendChild(el("span", "t", c.title));
      open.appendChild(el("span", "m", PERSONAS[c.persona].label + " · " + MODES[c.mode].label + " · " + when(c.updated)));
      open.addEventListener("click", () => {
        state.activeId = c.id;
        state.persona = c.persona;
        state.mode = c.mode;
        save();
        closeRail();
        show("chat");
        render();
        cloudOpen(c);
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.setAttribute("aria-label", "Hapus " + c.title);
      del.innerHTML = '<span class="i-x"></span>';
      del.addEventListener("click", () => {
        if (c.cloud && AUTH() && AUTH().user) AUTH().cloud.remove(c.id);
        state.chats = state.chats.filter((x) => x.id !== c.id);
        if (state.activeId === c.id) state.activeId = state.chats[0] ? state.chats[0].id : null;
        save();
        render();
      });
      row.appendChild(open);
      row.appendChild(del);
      hist.appendChild(row);
    });
    $("stop").hidden = !pending;
  }

  /* ---- riwayat di akun (hanya bila login; tamu tetap di localStorage) ---- */
  function cloudSave(chat, msg) {
    const A = AUTH();
    if (!A || !A.user || !UUID.test(chat.id)) return;
    if (!chat.cloud) { chat.cloud = true; A.cloud.saveChat(chat); }
    A.cloud.saveMessage(chat.id, msg);
  }
  async function cloudSync() {
    const A = AUTH();
    if (!A || !A.user) return;
    const list = await A.cloud.list();
    let changed = false;
    list.forEach((c) => {
      const have = state.chats.find((x) => x.id === c.id);
      if (have) { have.cloud = true; return; }
      state.chats.push({ id: c.id, title: c.title, persona: state.persona, mode: c.mode, msgs: [], updated: c.at, cloud: true, loaded: false });
      changed = true;
    });
    state.chats.sort((a, b) => b.updated - a.updated);
    state.chats = state.chats.slice(0, 40);
    if (changed) { save(); render(); }
  }
  async function cloudOpen(chat) {
    if (!chat.cloud || chat.loaded !== false || !AUTH() || !AUTH().user) return;
    const msgs = await AUTH().cloud.messages(chat.id);
    if (msgs) { chat.msgs = msgs; chat.loaded = true; save(); }
    render();
  }
  function cloudForget() {
    // keluar: chat milik akun dibuang dari perangkat; chat tamu tetap
    state.chats = state.chats.filter((c) => !c.cloud);
    if (!active()) state.activeId = state.chats[0] ? state.chats[0].id : null;
    save();
    render();
  }

  function show(view) {
    $("home").hidden = view === "chat";
    $("studio").hidden = view !== "chat";
    if (view === "home") closeRail();
  }
  function closeRail() {
    $("rail").classList.remove("open");
    $("scrim").hidden = true;
  }
  function openVoice() {
    show("chat");
    $("voice").hidden = false;
    $("voice-kicker").textContent = "Suara · " + PERSONAS[state.persona].label;
    $("voice-note").textContent = "Tekan tombol, bicara dalam bahasa Indonesia, lalu diam. Dea akan menjawab dengan suara.";
  }
  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
    u.lang = "id-ID";
    u.pitch = state.persona === "galak" ? 0.92 : state.persona === "manja" ? 1.18 : 1.12;
    const voices = window.speechSynthesis.getVoices();
    const id = voices.find((v) => v.lang.toLowerCase().startsWith("id"));
    if (id) u.voice = id;
    window.speechSynthesis.speak(u);
  }

  async function send(raw, opts) {
    const text = (raw || "").trim();
    if (!text || pending) return;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const id = ensure();
    const chat = active();
    chat.persona = state.persona;
    chat.mode = state.mode;
    const userMsg = { id: uid(), role: "user", content: text.slice(0, 2000), at: Date.now() };
    chat.msgs.push(userMsg);
    if (chat.title === "Obrolan baru") chat.title = text.replace(/\s+/g, " ").slice(0, 42);
    cloudSave(chat, userMsg);
    chat.updated = Date.now();
    $("demo-input").value = "";
    $("chat-input").value = "";
    pending = true;
    const token = ++gen;
    save();
    render();
    const history = chat.msgs.slice(-8);
    let answer = "";
    try {
      answer = (await remoteReply(history)) || localReply(state.persona, state.mode, history);
    } catch (e) {
      answer = localReply(state.persona, state.mode, history);
    }
    if (token !== gen) { pending = false; render(); return; }
    const deaMsg = { id: uid(), role: "dea", content: answer, at: Date.now() };
    chat.msgs.push(deaMsg);
    cloudSave(chat, deaMsg);
    chat.msgs = chat.msgs.slice(-80);
    chat.updated = Date.now();
    pending = false;
    save();
    render();
    if (opts && opts.speak) speak(answer);
  }

  function listen() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      $("voice-note").textContent = "Browser ini belum bisa mendengar. Ketik aja, Dea tetap di sini.";
      return;
    }
    heard = "";
    rec = new Ctor();
    rec.lang = "id-ID";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      heard = text.trim();
      $("voice-note").textContent = heard || "Dea lagi dengerin…";
    };
    rec.onerror = () => { $("voice-note").textContent = "Mikrofon tidak kebaca. Cek izin browser, lalu coba lagi."; };
    rec.onend = () => {
      $("listen").textContent = "Mulai bicara";
      const said = heard.trim();
      heard = "";
      if (said) send(said, { speak: true });
    };
    $("listen").textContent = "Selesai bicara";
    $("voice-note").textContent = "Dea lagi dengerin…";
    try { rec.start(); } catch (e) { $("voice-note").textContent = "Suara belum bisa dimulai. Coba sekali lagi."; }
  }

  document.querySelectorAll("[data-open-chat]").forEach((b) => b.addEventListener("click", () => { show("chat"); render(); }));
  document.querySelectorAll("[data-open-home]").forEach((b) => b.addEventListener("click", () => show("home")));
  document.querySelectorAll("[data-voice]").forEach((b) => b.addEventListener("click", openVoice));
  $("open-voice").addEventListener("click", openVoice);
  $("close-voice").addEventListener("click", () => { $("voice").hidden = true; if (rec) rec.stop(); });
  $("voice-type").addEventListener("click", () => { $("voice").hidden = true; show("chat"); });
  $("listen").addEventListener("click", () => {
    if ($("listen").textContent === "Selesai bicara" && rec) rec.stop();
    else listen();
  });
  $("demo-form").addEventListener("submit", (e) => { e.preventDefault(); send($("demo-input").value); });
  $("chat-form").addEventListener("submit", (e) => { e.preventDefault(); send($("chat-input").value); });
  $("new-chat").addEventListener("click", () => {
    const chat = { id: uid(), title: "Obrolan baru", persona: state.persona, mode: state.mode, msgs: [], updated: Date.now() };
    state.chats.unshift(chat);
    state.activeId = chat.id;
    save();
    closeRail();
    show("chat");
    render();
  });
  $("open-rail").addEventListener("click", () => { $("rail").classList.add("open"); $("scrim").hidden = false; });
  $("close-rail").addEventListener("click", closeRail);
  $("scrim").addEventListener("click", closeRail);
  $("stop").addEventListener("click", () => { gen++; pending = false; if (window.speechSynthesis) window.speechSynthesis.cancel(); render(); });
  $("theme-home").addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark"));
  $("theme-chat").addEventListener("click", () => setTheme(theme() === "dark" ? "light" : "dark"));
  document.querySelectorAll("textarea").forEach((ta) => {
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        ta.form.requestSubmit();
      }
    });
  });

  if (AUTH()) {
    AUTH().onChange((event, user) => {
      if (user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) cloudSync();
      if (event === "SIGNED_OUT") cloudForget();
    });
  }

  setTheme(theme());
  render();
})();
