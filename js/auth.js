/* Login Supabase untuk Dea (situs statis, tanpa build).
   Proyek Supabase SAMA dengan gowithdme.com dan Next.js lama: akun, nickname, dan Worker `dme-ai` tetap nyambung.
   Kunci "publishable" memang publik; keamanan ada di RLS.
   supabase-js hanya diunduh bila: ada sesi tersimpan, pengguna kembali dari login, atau menekan Masuk.
   Tamu tidak mengunduh apa pun. Window.DeaAuth dipakai app.js. */
(function () {
  "use strict";
  var URL_ = "https://jhqkylnqvhrljpaknjcg.supabase.co";
  var KEY_ = "sb_publishable_WEpourxfk4IKga2XyxKucQ_hkmxuJnY";
  var LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  var MAIN = "https://gowithdme.com";
  var PROVIDERS = [["google", "Google"], ["facebook", "Facebook"], ["discord", "Discord"], ["github", "GitHub"]];
  var TYPE_OF = { ngobrol: "bebas", gunung: "gunung", konser: "konser", trip: "trip" };
  var MODE_OF = { bebas: "ngobrol", gunung: "gunung", konser: "konser", trip: "trip" };

  var listeners = [];
  var sbPromise = null;
  var A = { user: null, ready: false, recovery: false };

  var arrival = (function () {
    var raw = (location.hash + "&" + location.search.replace(/^\?/, "")).replace(/^#/, "");
    var o = {};
    raw.split("&").forEach(function (p) {
      if (!p) return;
      var i = p.indexOf("=");
      try { o[decodeURIComponent(i < 0 ? p : p.slice(0, i))] = i < 0 ? "" : decodeURIComponent(p.slice(i + 1).replace(/\+/g, " ")); } catch (e) {}
    });
    return o;
  })();

  function hasStored() {
    if (arrival.access_token || arrival.code) return true;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && /-auth-token$/.test(k)) return true;
      }
    } catch (e) {}
    return false;
  }

  function emit(event) { listeners.forEach(function (f) { try { f(event, A.user); } catch (e) {} }); }

  function friendly(err) {
    if (!err) return "Terjadi kesalahan. Coba lagi.";
    var t = (String(err.message || err.error_description || err) + " " + String(err.code || "")).toLowerCase();
    var st = err.status || 0;
    if (/failed to fetch|networkerror|load failed|offline/.test(t)) return "Koneksi bermasalah. Periksa internet lalu coba lagi.";
    if (/email_not_confirmed|not confirmed/.test(t)) return "Email belum dikonfirmasi. Cek kotak masuk (dan spam) untuk tautan konfirmasi.";
    if (/invalid_credentials|invalid login|invalid credentials/.test(t)) return "Email atau password salah.";
    if (/over_email_send_rate_limit|email rate limit/.test(t)) return "Batas pengiriman email tercapai. Tunggu beberapa menit.";
    if (/rate limit|too many requests/.test(t) || st === 429) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    if (/otp_disabled|signups? not allowed|user_not_found|not found/.test(t)) return "Email ini belum terdaftar. Daftar dulu di gowithdme.com.";
    if (/same_password|different from the old/.test(t)) return "Password baru harus berbeda dari yang lama.";
    if (/weak_password|password should|weak password/.test(t)) return "Password terlalu lemah. Pakai minimal 8 karakter.";
    if (/jwt|session|expired|not authenticated/.test(t) || st === 401) return "Sesi berakhir. Silakan masuk kembali.";
    return "Terjadi kesalahan. Coba lagi nanti.";
  }

  function loadScript() {
    return new Promise(function (ok, fail) {
      if (window.supabase && window.supabase.createClient) return ok();
      var s = document.createElement("script");
      s.src = LIB;
      s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { fail(new Error("Failed to fetch")); };
      document.head.appendChild(s);
    });
  }

  function client() {
    if (!sbPromise) {
      sbPromise = loadScript().then(function () {
        var sb = window.supabase.createClient(URL_, KEY_, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        // Jangan memanggil supabase di dalam callback ini; cukup teruskan peristiwa.
        sb.auth.onAuthStateChange(function (event, session) {
          A.user = session && session.user ? session.user : null;
          if (event === "PASSWORD_RECOVERY") A.recovery = true;
          A.ready = true;
          setTimeout(function () { emit(event); }, 0);
        });
        return sb;
      }).catch(function () { sbPromise = null; return null; });
    }
    return sbPromise;
  }

  function withClient(fn) {
    return client().then(function (sb) {
      if (!sb) return { error: "Login belum siap. Muat ulang halaman lalu coba lagi." };
      return fn(sb);
    }).catch(function (e) { return { error: friendly(e) }; });
  }
  function home() { return location.origin.replace(/\/+$/, "") + "/"; }
  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim()); }

  /* ---------- aksi login ---------- */
  A.signIn = function (email, pass) {
    return withClient(function (sb) {
      return sb.auth.signInWithPassword({ email: String(email).trim(), password: pass })
        .then(function (r) { return { error: r.error ? friendly(r.error) : null }; });
    });
  };
  A.oauth = function (provider) {
    return withClient(function (sb) {
      var options = { redirectTo: home() };
      if (provider === "google") options.queryParams = { prompt: "select_account" };
      return sb.auth.signInWithOAuth({ provider: provider, options: options })
        .then(function (r) { return { error: r.error ? "Login lewat " + provider + " belum bisa dipakai. Coba cara lain." : null }; });
    });
  };
  A.magic = function (email) {
    if (!validEmail(email)) return Promise.resolve({ error: "Isi email yang valid dahulu." });
    return withClient(function (sb) {
      return sb.auth.signInWithOtp({ email: String(email).trim(), options: { emailRedirectTo: home(), shouldCreateUser: false } })
        .then(function (r) { return { error: r.error ? friendly(r.error) : null }; });
    });
  };
  A.reset = function (email) {
    if (!validEmail(email)) return Promise.resolve({ error: "Isi email yang valid dahulu." });
    return withClient(function (sb) {
      return sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: home() })
        .then(function (r) { return { error: r.error ? friendly(r.error) : null }; });
    });
  };
  A.newPassword = function (pass) {
    if (String(pass || "").length < 8) return Promise.resolve({ error: "Password minimal 8 karakter." });
    return withClient(function (sb) {
      return sb.auth.updateUser({ password: pass })
        .then(function (r) { if (!r.error) A.recovery = false; return { error: r.error ? friendly(r.error) : null }; });
    });
  };
  /* scope local: hanya keluar di situs ini, tidak mencabut sesi gowithdme.com */
  A.signOut = function () {
    return withClient(function (sb) {
      return sb.auth.signOut({ scope: "local" }).then(function (r) { return { error: r.error ? friendly(r.error) : null }; });
    });
  };

  /* Token untuk header Authorization ke Worker (jatah per akun). Tamu: null tanpa mengunduh apa pun. Maks. tunggu 3 dtk. */
  A.token = function () {
    if (!hasStored()) return Promise.resolve(null);
    var timeout = new Promise(function (r) { setTimeout(function () { r(null); }, 3000); });
    return Promise.race([client(), timeout]).then(function (sb) {
      if (!sb) return null;
      return sb.auth.getSession().then(function (r) { return (r.data && r.data.session && r.data.session.access_token) || null; });
    }).catch(function () { return null; });
  };

  A.name = function () {
    var u = A.user;
    if (!u) return "";
    var m = u.user_metadata || {};
    return String(m.nickname || m.full_name || m.name || (u.email || "").split("@")[0] || "Akun").trim();
  };

  A.onChange = function (fn) { listeners.push(fn); };
  A.start = function () { if (hasStored()) client(); };
  A.open = client; // dipanggil saat tombol Masuk ditekan (mulai unduh lebih awal)
  A.arrival = arrival;
  A.main = MAIN;
  A.providers = PROVIDERS;

  /* ---------- riwayat di Supabase (tabel ai_chats + ai_messages; hanya pengguna login) ---------- */
  var queue = Promise.resolve();
  function enqueue(fn) { queue = queue.then(fn).catch(function () {}); }
  function authed() {
    return client().then(function (sb) {
      if (!sb || !A.user) return null;
      return sb;
    });
  }
  A.cloud = {
    list: function () {
      return authed().then(function (sb) {
        if (!sb) return [];
        return sb.from("ai_chats").select("id, title, type, created_at").eq("user_id", A.user.id)
          .order("created_at", { ascending: false }).limit(20).then(function (r) {
            return (r.error || !r.data) ? [] : r.data.map(function (c) {
              return { id: c.id, title: c.title, mode: MODE_OF[c.type] || "ngobrol", at: Date.parse(c.created_at) || Date.now() };
            });
          });
      }).catch(function () { return []; });
    },
    messages: function (chatId) {
      return authed().then(function (sb) {
        if (!sb) return null;
        return sb.from("ai_messages").select("id, role, content, created_at").eq("chat_id", chatId)
          .order("created_at", { ascending: false }).limit(100).then(function (r) {
            if (r.error || !r.data) return null;
            return r.data.reverse().map(function (m) {
              return { id: m.id, role: m.role === "user" ? "user" : "dea", content: m.content, at: Date.parse(m.created_at) || Date.now() };
            });
          });
      }).catch(function () { return null; });
    },
    saveChat: function (chat) {
      enqueue(function () {
        return authed().then(function (sb) {
          if (!sb) return;
          return sb.from("ai_chats").insert({ id: chat.id, user_id: A.user.id, title: String(chat.title || "Obrolan baru").slice(0, 80), type: TYPE_OF[chat.mode] || "bebas" });
        });
      });
    },
    saveMessage: function (chatId, m) {
      enqueue(function () {
        return authed().then(function (sb) {
          if (!sb) return;
          return sb.from("ai_messages").insert({ id: m.id, chat_id: chatId, role: m.role === "user" ? "user" : "assistant", content: String(m.content).slice(0, 8000) });
        });
      });
    },
    remove: function (id) {
      enqueue(function () {
        return authed().then(function (sb) { if (sb) return sb.from("ai_chats").delete().eq("id", id); });
      });
    }
  };

  window.DeaAuth = A;

  /* ---------- lembar login (markup ada di index.html: #login) ---------- */
  function $(id) { return document.getElementById(id); }
  function init() {
    var box = $("login");
    if (!box) return;
    var view = "login"; // login | recovery | akun
    var busy = false;

    function say(text, ok) {
      var m = $("login-msg");
      m.hidden = !text;
      m.textContent = text || "";
      m.className = "login-msg" + (ok ? " ok" : "");
      m.setAttribute("role", ok ? "status" : "alert");
    }
    function setBusy(b) {
      busy = b;
      box.querySelectorAll("button, input").forEach(function (n) { if (n.id !== "login-x") n.disabled = b; });
    }
    function paint() {
      var recovery = view === "recovery";
      var akun = view === "akun";
      $("login-title").textContent = recovery ? "Buat password baru" : akun ? A.name() : "Masuk ke GoWithDME";
      $("login-sub").textContent = recovery
        ? "Tautan reset diterima. Isi password baru (minimal 8 karakter)."
        : akun ? (A.user && A.user.email || "") : "Satu akun untuk gowithdme.com dan Dea. Riwayat obrolan tersimpan dan jatah chat lebih besar.";
      $("login-main").hidden = recovery || akun;
      $("login-recovery").hidden = !recovery;
      $("login-akun").hidden = !akun;
    }
    function open(v) {
      view = v || "login";
      say("");
      paint();
      box.hidden = false;
      if (view === "login") client(); // mulai unduh supabase-js lebih awal
      var first = box.querySelector(view === "recovery" ? "#login-newpass" : view === "akun" ? "#login-out" : "#login-email");
      if (first) setTimeout(function () { first.focus(); }, 30);
    }
    function close() { box.hidden = true; say(""); }
    A.openLogin = open;

    // tombol Masuk / nama akun
    function paintButtons() {
      document.querySelectorAll("[data-auth]").forEach(function (b) {
        b.textContent = A.user ? A.name().slice(0, 14) : "Masuk";
        b.setAttribute("aria-label", A.user ? "Akun " + A.name() : "Masuk");
      });
    }
    A.paintButtons = paintButtons;
    document.querySelectorAll("[data-auth]").forEach(function (b) {
      b.addEventListener("click", function () { open(A.user ? "akun" : "login"); });
    });
    $("login-x").addEventListener("click", close);
    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !box.hidden) close(); });

    // penyedia OAuth
    var grid = $("login-providers");
    PROVIDERS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-ghost";
      b.textContent = p[1];
      b.addEventListener("click", function () {
        setBusy(true); say("Mengarahkan ke " + p[1] + "…", true);
        A.oauth(p[0]).then(function (r) { if (r.error) { setBusy(false); say(r.error); } });
      });
      grid.appendChild(b);
    });

    function run(fn, okText) {
      setBusy(true); say("");
      return fn().then(function (r) {
        setBusy(false);
        if (r.error) say(r.error); else if (okText) say(okText, true);
        return !r.error;
      });
    }
    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var em = $("login-email").value, pw = $("login-pass").value;
      if (!em.trim() || !pw) return say("Isi email dan password.");
      run(function () { return A.signIn(em, pw); }); // berhasil: SIGNED_IN menutup lembar ini
    });
    $("login-forgot").addEventListener("click", function () {
      var em = $("login-email").value;
      run(function () { return A.reset(em); }, "Tautan reset dikirim ke email.");
    });
    $("login-magic").addEventListener("click", function () {
      var em = $("login-email").value;
      run(function () { return A.magic(em); }, "Link masuk dikirim. Buka emailmu lalu ketuk tombolnya.");
    });
    $("login-recovery").addEventListener("submit", function (e) {
      e.preventDefault();
      run(function () { return A.newPassword($("login-newpass").value); }, "Password diperbarui.").then(function (ok) {
        if (ok) setTimeout(close, 900);
      });
    });
    $("login-out").addEventListener("click", function () {
      run(function () { return A.signOut(); }).then(function (ok) { if (ok) close(); });
    });

    A.onChange(function (event) {
      paintButtons();
      if (event === "SIGNED_IN" && !box.hidden && view === "login") close();
      if (event === "SIGNED_OUT" && !box.hidden && view === "akun") close();
      if (event === "PASSWORD_RECOVERY") open("recovery");
    });
    paintButtons();

    // kembali dari tautan: tampilkan galat bila ada
    if (arrival.error || arrival.error_code) {
      var d = String(arrival.error_description || arrival.error_code || "").toLowerCase();
      open("login");
      say(/expired/.test(d) ? "Tautan sudah kedaluwarsa. Minta tautan baru, atau masuk dengan cara lain."
        : /denied|cancel/.test(d) ? "Login dibatalkan."
        : "Login tidak berhasil. Coba lagi atau pakai cara masuk lain.");
    }
    A.start();
    // bersihkan token dari alamat setelah supabase-js membacanya
    if (arrival.access_token || arrival.error || arrival.error_code) {
      setTimeout(function () { try { history.replaceState(null, "", location.pathname); } catch (e) {} }, 1500);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
