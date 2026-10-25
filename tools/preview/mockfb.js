/* Tomujin PE — PREVIEW ONLY. A stand-in for Firebase that keeps test data in this browser.
   Nothing here talks to the real site or the real database. */
(function () {
  "use strict";
  var KEY = "tpe-preview-db-v3", RKEY = "tpe-preview-role", TKEY = "tpe-preview-phase";
  var now = Date.now();
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  var role = ls(RKEY) || "guest";
  /* The artifact viewer answers confirm() with "no" without showing it; in the preview every "are you sure?" is taken as yes. */
  try { if (window.self !== window.top) window.confirm = function () { return true; }; } catch (e) {}
  var phase = ls(TKEY) || "p1";
  function regTimes(ph) {
    var t = Date.now(), m = 60e3;
    if (ph === "before") return { open: t + 60 * m, p1: t + 150 * m, close: t + 330 * m };
    if (ph === "p1") return { open: t - 30 * m, p1: t + 60 * m, close: t + 240 * m };
    if (ph === "p2") return { open: t - 150 * m, p1: t - 30 * m, close: t + 120 * m };
    return { open: t - 330 * m, p1: t - 240 * m, close: t - 30 * m };
  }
  var USERS = {
    guest: null,
    student: { uid: "s1", email: "bat.temuulen@tomujin.edu.mn", name: "Бат Тэмүүлэн", emailVerified: true },
    teacher: { uid: "t1", email: "teacher@tomujin.edu.mn", name: "Туршилтын багш", emailVerified: true },
    admin: { uid: "a1", email: "saikhanjargal.j@tomujin.edu.mn", name: "Jack Coach", emailVerified: true }
  };
  var ROLE = { guest: null, student: "student", teacher: "teacher", admin: "admin" };

  function ymd(d) { var u = new Date(d + 8 * 3600e3); return u.toISOString().slice(0, 10); }
  function seedData() {
    var s = {}, td = ymd(now);
    s["config/roles"] = { teachers: ["teacher@tomujin.edu.mn"] };
    s["users/s1"] = { email: "bat.temuulen@tomujin.edu.mn", name: "Бат Тэмүүлэн", classId: "11b", createdAt: now - 864e5 * 20 };
    s["users/s2"] = { email: "anu.bold@tomujin.edu.mn", name: "Ану Болд", classId: "11b", createdAt: now - 864e5 * 18 };
    s["users/s3"] = { email: "temuujin.g@tomujin.edu.mn", name: "Тэмүүжин Ганбат", classId: "10a", createdAt: now - 864e5 * 15 };
    s["assign/a1"] = { date: td, title: "Хүчний 4 хэв: гэрийн хувилбар", min: 20, cls: ["11b"], note: "3 тойрог. Хэцүү бол шатаа доошлуул.", items: [{ id: "pushup" }, { id: "split-squat" }, { id: "dead-bug" }], updatedAt: new Date(now).toISOString() };
    var i, l = [[6, 45, 4, 2], [7, 60, 3, 3], [5, 40, 4, 1], [6, 50, 4, 2]];
    for (i = 0; i < l.length; i++) s["users/s1/loading/l" + i] = { uid: "s1", name: "Бат Тэмүүлэн", classId: "11b", rpe: l[i][0], min: l[i][1], load: l[i][0] * l[i][1], feel: l[i][2], sore: l[i][3], note: "", at: now - 864e5 * (2 + i * 2) };
    s["users/s2/loading/l0"] = { uid: "s2", name: "Ану Болд", classId: "11b", rpe: 5, min: 40, load: 200, feel: 4, sore: 1, note: "", at: now - 864e5 };
    var caps = { bb: 30, hb: 30, "jj-a": 16, "jj-b": 16, "tn-a": 16, "tn-b": 16, "fn-a": 20, "fn-b": 20 };
    var taken = { bb: 22, hb: 9, "jj-a": 16, "jj-b": 11, "tn-a": 15, "tn-b": 4, "fn-a": 6, "fn-b": 0 };
    Object.keys(caps).forEach(function (k) { s["offers/" + k] = { n: taken[k], cap: caps[k] }; });
    for (i = 0; i < 3; i++) s["offers/jj-a/wait/w" + i] = { at: { _ms: now - 6e5 + i * 1e4 } };
    s["feedback/f1"] = { type: "bug", text: "Утсан дээр тэмдэглэлийн товч хэт жижиг байна.", page: "log", dev: "Android Chrome · 390px", status: "new", at: { _ms: now - 7200e3 }, who: "student", uid: "s2", email: "anu.bold@tomujin.edu.mn", name: "Ану Болд", classId: "11b" };
    s["feedback/f2"] = { type: "idea", text: "Нүүр хуудсанд дугуйлангийн хуваарь харагддаг болгоорой.", page: "home", dev: "iPhone/iPad Safari · 390px", status: "new", at: { _ms: now - 3600e3 }, who: "parent", uid: "", contact: "9911 2233" };
    s["feedback/f3"] = { type: "like", text: "Дасгалын хөдөлгөөнт зураг маш ойлгомжтой.", page: "library", dev: "Windows Chrome · 1440px", status: "done", reply: "Баярлалаа!", seen: true, at: { _ms: now - 864e5 }, who: "student", uid: "s3", email: "temuujin.g@tomujin.edu.mn", name: "Тэмүүжин Ганбат", classId: "10a" };
    return s;
  }
  var store;
  try { store = JSON.parse(ls(KEY) || "null"); } catch (e) { store = null; }
  if (!store) store = seedData();
  store["site/clubreg"] = Object.assign({}, store["site/clubreg"] || {}, regTimes(phase));
  var subs = [];
  function persist() { ls(KEY, JSON.stringify(store)); }
  function notify() { persist(); subs.slice().forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  function ts(ms) { return { toMillis: function () { return ms; }, _ms: ms }; }
  function revive(v) { if (v && typeof v === "object" && !Array.isArray(v)) { if (v._ms != null) return ts(v._ms); var o = {}; for (var k in v) o[k] = revive(v[k]); return o; } return v; }
  function fix(v, old) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (v.__sv === "time") return { _ms: Date.now() };
      if (typeof v.__inc === "number") return (typeof old === "number" ? old : 0) + v.__inc;
      var o = {}; for (var k in v) o[k] = fix(v[k], old && typeof old === "object" ? old[k] : undefined); return o;
    }
    return v;
  }
  function merge(a, b) { var o = Object.assign({}, a || {}); for (var k in b) { if (b[k] === null) { delete o[k]; continue; } if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && b[k]._ms == null && o[k] && typeof o[k] === "object") o[k] = merge(o[k], b[k]); else o[k] = b[k]; } return o; }
  function kids(path) { var n = path.split("/").length + 1; return Object.keys(store).filter(function (k) { return k.indexOf(path + "/") === 0 && k.split("/").length === n; }); }
  function snapOf(k) { return { id: k.split("/").pop(), exists: true, ref: k, data: function () { return revive(store[k]); } }; }
  function query(keys, o) {
    var ds = keys.map(snapOf);
    ((o && o.where) || []).forEach(function (w) { ds = ds.filter(function (d) { var v = d.data()[w[0]]; return w[1] === "==" ? v === w[2] : w[1] === "array-contains" ? (v || []).indexOf(w[2]) >= 0 : true; }); });
    if (o && o.orderBy) { var f = o.orderBy[0], dir = o.orderBy[1] === "desc" ? -1 : 1; ds.sort(function (a, b) { var x = a.data()[f], y = b.data()[f]; x = x && x.toMillis ? x.toMillis() : x; y = y && y.toMillis ? y.toMillis() : y; return (x > y ? 1 : x < y ? -1 : 0) * dir; }); }
    if (o && o.limit) ds = ds.slice(0, o.limit);
    return { docs: ds };
  }
  function deny() { return Promise.reject({ code: "permission-denied" }); }

  /* Simplified copy of the registration rules, so the preview behaves like the real site. */
  function regCheck(writes, uid) {
    var touches = writes.some(function (w) { return /^offers\/[^/]+(\/(seats|wait)\/[^/]+)?$/.test(w.path) || /^regs\//.test(w.path); });
    if (!touches || role === "admin") return true;
    var r = store["site/clubreg"]; if (!r) return false;
    var t = Date.now(); if (!(t >= r.open && t < r.close)) return false;
    var max = t < r.p1 ? 1 : 2, ok = true;
    writes.forEach(function (w) {
      var m = w.path.match(/^offers\/([^/]+)$/);
      if (m && w.data && w.data.n != null) { var o = store[w.path] || {}; var nn = typeof w.data.n === "object" ? (o.n || 0) + w.data.n.__inc : w.data.n; if (nn > o.cap) ok = false; }
      var g = w.path.match(/^regs\/(.+)$/); if (g && w.data && w.data.picks && w.data.picks.length > max) ok = false;
      var s = w.path.match(/^offers\/([^/]+)\/(seats|wait)\/(.+)$/); if (s && s[3] !== uid) ok = false;
      if (s && s[2] === "seats" && w.op === "delete" && store[w.path] && store[w.path].status !== "seat") ok = false;
    });
    return ok;
  }
  function apply(ops) {
    ops.forEach(function (o) {
      if (o.op === "delete") delete store[o.path];
      else if (o.op === "merge") store[o.path] = merge(store[o.path], fix(o.data, store[o.path]));
      else store[o.path] = fix(o.data, store[o.path]);
    });
    notify();
  }
  var user = USERS[role];
  function wait(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 120); }); }
  var db = {
    doc: function (path) {
      return {
        set: function (d) { return regCheck([{ op: "set", path: path, data: d }], user && user.uid) ? wait(apply([{ op: "set", path: path, data: d }])) : deny(); },
        update: function (d) { return wait(apply([{ op: "merge", path: path, data: d }])); },
        get: function () { return wait({ id: path.split("/").pop(), exists: !!store[path], data: function () { return revive(store[path]); } }); },
        getServer: function () { return window.__tpeOffline ? wait().then(function () { return Promise.reject({ code: "unavailable" }); }) : this.get(); },
        delete: function () { return wait(apply([{ op: "delete", path: path }])); },
        onSnapshot: function (next) { var f = function () { next({ id: path.split("/").pop(), exists: !!store[path], data: function () { return revive(store[path]); } }); }; subs.push(f); setTimeout(f); return function () { var i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; }
      };
    },
    collection: function (path) {
      return {
        onSnapshot: function (next, err, o) { var f = function () { next(query(kids(path), o)); }; subs.push(f); setTimeout(f); return function () { var i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
        add: function (d) { return wait(apply([{ op: "set", path: path + "/a" + Date.now().toString(36), data: d }])); }
      };
    },
    batch: function (ops) { return regCheck(ops, user && user.uid) ? wait(apply(ops)) : deny(); },
    /* test hooks: __tpeRace = offer id that "someone else" fills just before the transaction,
       __tpeOffline = no connection, __tpeLost = server saved it but the answer never arrived */
    tx: function (reads, decide) {
      if (window.__tpeOffline) return wait().then(function () { return Promise.reject({ code: "unavailable" }); });
      return wait().then(function () {
        if (window.__tpeRace && store["offers/" + window.__tpeRace]) { store["offers/" + window.__tpeRace].n = store["offers/" + window.__tpeRace].cap; window.__tpeRace = null; }
        var snaps = {}; reads.forEach(function (p) { snaps[p] = { exists: !!store[p], data: function () { return revive(store[p]); } }; });
        var ops = decide(snaps) || [];
        if (!regCheck(ops, user && user.uid)) return deny();
        apply(ops);
        if (window.__tpeLost) { window.__tpeLost = false; return Promise.reject({ code: "unavailable" }); }
        return ops;
      });
    },
    group: function (name, o, next) {
      var f = function () { next(query(Object.keys(store).filter(function (k) { var p = k.split("/"); return p.length >= 2 && p[p.length - 2] === name; }), o)); };
      subs.push(f); setTimeout(f); return function () { var i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); };
    }
  };
  var listeners = [];
  window.TPE = {
    configured: true, user: null, role: null, domain: "tomujin.edu.mn", db: db, preview: true,
    onAuth: function (cb) { listeners.push(cb); setTimeout(function () { window.TPE.user = user; window.TPE.role = ROLE[role]; cb(user, ROLE[role]); }, 60); },
    signIn: function () { return Promise.reject({ code: "tpe/preview" }); }, signUp: function () { return Promise.reject({ code: "tpe/preview" }); },
    resend: function () { return Promise.resolve(); }, refresh: function () { return Promise.resolve(user); }, reset: function () { return Promise.resolve(); },
    signOut: function () { ls(RKEY, "guest"); location.reload(); return Promise.resolve(); }
  };

  /* preview control bar */
  function bar() {
    var b = document.createElement("div");
    b.id = "previewBar";
    b.setAttribute("role", "region"); b.setAttribute("aria-label", "Preview тохиргоо");
    b.innerHTML = '<b>PREVIEW</b><span>Жинхэнэ сайт биш · өгөгдөл зөвхөн энэ хөтөч дээр</span>' +
      '<label>Хэн: <select id="pvRole"><option value="guest">Зочин / эцэг эх</option><option value="student">Сурагч (11B)</option><option value="teacher">Багш (зөвхөн харах)</option><option value="admin">Админ (Жак багш)</option></select></label>' +
      '<label>Дугуйлангийн бүртгэл: <select id="pvPhase"><option value="before">Нээгдэхээс өмнө</option><option value="p1">Нээлттэй · 1 сонголт</option><option value="p2">11:00-ээс хойш · 2 сонголт</option><option value="closed">Хаагдсан</option></select></label>' +
      '<button type="button" id="pvReset">Өгөгдлийг шинэчлэх</button><span>Баталгаажуулах асуулт энд автоматаар “Тийм” болно.</span>';
    var css = document.createElement("style");
    css.textContent = "#previewBar{position:relative;z-index:50;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 16px;background:#1c1c1c;color:#fff;font:13px/1.4 system-ui,sans-serif}#previewBar b{background:#f2cd30;color:#1c1c1c;padding:2px 8px;border-radius:6px;letter-spacing:.08em}#previewBar select,#previewBar button{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#fff}#previewBar span{opacity:.8}";
    document.head.appendChild(css);
    document.body.insertBefore(b, document.body.firstChild);
    var r = document.getElementById("pvRole"), p = document.getElementById("pvPhase");
    r.value = role; p.value = phase;
    r.addEventListener("change", function () { ls(RKEY, r.value); location.reload(); });
    p.addEventListener("change", function () { ls(TKEY, p.value); location.reload(); });
    document.getElementById("pvReset").addEventListener("click", function () { ls(KEY, null); location.reload(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bar); else bar();
  window.dispatchEvent(new Event("tpe-ready"));
})();
