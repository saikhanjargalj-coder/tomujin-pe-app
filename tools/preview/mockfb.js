/* Tomujin PE — PREVIEW ONLY. A stand-in for Firebase that keeps test data in this browser.
   Nothing here talks to the real site or the real database. */
(function () {
  "use strict";
  var KEY = "tpe-preview-db-v6", RKEY = "tpe-preview-role", TKEY = "tpe-preview-phase";
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
    s["feedback/f4"] = { type: "idea", text: "Тэмдэглэлд усны хэмжээ бичдэг болгоорой.", page: "log", dev: "Android Chrome · 390px", status: "skip", reply: "Одоохондоо хийхгүй: эхлээд нойр, ачааллын бүртгэлийг тогтворжуулъя.", seen: false, at: { _ms: now - 3 * 864e5 }, who: "student", uid: "s1", email: "bat.temuulen@tomujin.edu.mn", name: "Бат Тэмүүлэн", classId: "11b" };
    s["feedback/f5"] = { type: "bug", text: "Хоол тооцоолуурт тоо оруулахад гар утсан дээр гацаад байна.", page: "calc", dev: "iPhone/iPad Safari · 390px", status: "doing", at: { _ms: now - 2 * 864e5 }, who: "student", uid: "s1", email: "bat.temuulen@tomujin.edu.mn", name: "Бат Тэмүүлэн", classId: "11b" };
    s["fbnotes/f2"] = { text: "Нүүрний шинэчлэлд оруулна.", at: now - 3600e3 };
    /* pickleball B (offer id tn-b; Tue, Thu): four children with seats, for the attendance tools */
    s["users/s4"] = { email: "nomin.b@tomujin.edu.mn", name: "Номин Бат", classId: "9a", createdAt: now - 864e5 * 12 };
    s["users/s5"] = { email: "khulan.e@tomujin.edu.mn", name: "Хулан Энх", classId: "12a", createdAt: now - 864e5 * 10 };
    ["s2", "s3", "s4", "s5"].forEach(function (u) { s["offers/tn-b/seats/" + u] = { status: "ok", at: { _ms: now - 864e5 * 5 } }; });
    s["offers/tn-b/seats/s3"].att = { "2026-11-10": "p", "2026-11-12": "a" };
    s["offers/tn-b/seats/s4/abs/2026-11-19"] = { reason: "Шүдний эмчид очно", at: { _ms: now - 864e5 } };
    /* students may tell in advance that they will miss a PE lesson (the sheet script's own setting is "mockabs") */
    s["config/absence"] = { on: true, url: "preview", cutoff: "08:30", ahead: 21, at: now };
    s["mockabs"] = { on: true, cutoff: "08:30", ahead: 21 };
    /* one request already waiting for the teacher: a 12C student (PE on Fridays) on the next Friday */
    var fri = td; while (new Date(fri + "T00:00:00Z").getUTCDay() !== 5) fri = new Date(Date.parse(fri + "T00:00:00Z") + 864e5).toISOString().slice(0, 10);
    s["absreq/u31218_" + fri] = { uid: "u31218", email: "student31218@tomujin.edu.mn", name: "Болд Жавхлан", cls: "12C", tab: "PE 12", date: fri, kind: "sick", reason: "Шүд өвдөөд эмчид үзүүлнэ", status: "pending", at: { _ms: now - 3600e3 } };
    return s;
  }
  var store;
  try { store = JSON.parse(ls(KEY) || "null"); } catch (e) { store = null; }
  if (!store) store = seedData();
  store["site/clubreg"] = Object.assign({}, store["site/clubreg"] || {}, regTimes(phase));
  /* Strava club box (the owner sets the real club link in edit mode) */
  /* one teacher note on Bat (teachers only) */
  if (!store["tnotes/n1"]) store["tnotes/n1"] = { uid: "s1", lid: "", text: "Гүйлтэнд ахиц сайн. Хүчний дасгалд нуруугаа шулуун байлгахыг сануулах.", at: now - 864e5 * 3 };
  if (!store["site/strava"]) store["site/strava"] = { club: { name: "Tomujin PE", url: "https://www.strava.com/clubs/tomujin-pe-preview", text: "", embed: "" }, coach: {} };
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
    ((o && o.where) || []).forEach(function (w) { ds = ds.filter(function (d) { var v = d.data()[w[0]]; return w[1] === "==" ? v === w[2] : w[1] === ">=" ? v >= w[2] : w[1] === "array-contains" ? (v || []).indexOf(w[2]) >= 0 : true; }); });
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
  /* simplified copy of the absreq rules: a student files their own pending request once, withdraws it while it
     waits; only the owner decides */
  function absCheck(ops) {
    return ops.every(function (w) {
      if (!/^absreq\//.test(w.path)) return true;
      if (role === "admin") return true;
      var cur = store[w.path], uid = user && user.uid;
      if (w.op === "delete") return !!cur && cur.uid === uid && cur.status === "pending";
      if (cur || w.op === "merge") return false;
      var d = w.data || {};
      return d.uid === uid && d.status === "pending" && w.path === "absreq/" + uid + "_" + d.date && typeof d.reason === "string" && d.reason.length >= 2 && d.reason.length <= 300 && (d.kind === "sick" || d.kind === "leave");
    });
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
        set: function (d) {
          /* like the real rules: a training log entry can be created once, never overwritten */
          if (/\/loading\/[^/]+$/.test(path) && store[path] && role !== "admin") return deny();
          /* like the real rules: teacher notes are written by the owner only */
          if (/^tnotes\//.test(path) && role !== "admin") return deny();
          if (!regCheck([{ op: "set", path: path, data: d }], user && user.uid) || !absCheck([{ op: "set", path: path, data: d }])) return deny();
          /* test hooks: __tpeFailSet = the next write is refused; __tpeHold = writes wait until __tpeRelease() */
          if (window.__tpeFailSet) { window.__tpeFailSet = false; return wait().then(deny); }
          if (window.__tpeHold) return new Promise(function (res) { window.__tpeRelease = function () { window.__tpeHold = false; apply([{ op: "set", path: path, data: d }]); res(); }; });
          return wait(apply([{ op: "set", path: path, data: d }]));
        },
        update: function (d) { if (!absCheck([{ op: "merge", path: path, data: d }])) return deny(); return wait(apply([{ op: "merge", path: path, data: d }])); },
        get: function () { return wait({ id: path.split("/").pop(), exists: !!store[path], data: function () { return revive(store[path]); } }); },
        getServer: function () { return window.__tpeOffline ? wait().then(function () { return Promise.reject({ code: "unavailable" }); }) : this.get(); },
        delete: function () { if (!absCheck([{ op: "delete", path: path }])) return deny(); return wait(apply([{ op: "delete", path: path }])); },
        onSnapshot: function (next) { var f = function () { next({ id: path.split("/").pop(), exists: !!store[path], data: function () { return revive(store[path]); } }); }; subs.push(f); setTimeout(f); return function () { var i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; }
      };
    },
    collection: function (path) {
      return {
        onSnapshot: function (next, err, o) { var f = function () { next(query(kids(path), o)); }; subs.push(f); setTimeout(f); return function () { var i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
        add: function (d) { if (path === "tnotes" && role !== "admin") return deny(); return wait(apply([{ op: "set", path: path + "/a" + Date.now().toString(36), data: d }])); }
      };
    },
    batch: function (ops) { if (role !== "admin" && ops.some(function (o) { return /^grades(Staff)?\//.test(o.path); })) return deny(); if (window.__tpeFailSet && ops.some(function (o) { return /^absreq\//.test(o.path); })) { window.__tpeFailSet = false; return wait().then(deny); } return regCheck(ops, user && user.uid) && absCheck(ops) ? wait(apply(ops)) : deny(); },
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
  /* test hooks: __tpeNotify() replays a live update to every open listener, __tpeStore() reads the test data */
  window.__tpeNotify = function () { notify(); };
  window.__tpeStore = function () { return store; };
  /* Stand-in for the school's attendance Sheet (PE 6 ... PE 12) with made-up students.
     Test hooks: __tpeSheetFail = the next write is refused; __tpeSheetHold = writes wait for __tpeSheetRelease(). */
  var FN = ["Анар", "Батзориг", "Билгүүн", "Гэрэл", "Дөлгөөн", "Есүй", "Жавхлан", "Заяа", "Ивээл", "Лхам", "Мөнх", "Номин", "Оюу", "Пүрэв", "Сараа", "Тэмүүлэн", "Ууганаа", "Хулан", "Цэцэг", "Чинзориг", "Шинэ", "Энхжин"];
  var LN = ["Бат", "Дорж", "Ганбаатар", "Сүх", "Энх", "Төмөр", "Болд", "Нямаа"];
  function schoolDays() { var out = [], d = new Date("2026-09-07T00:00:00Z"), e = new Date("2027-06-11T00:00:00Z"); while (d <= e) { var w = d.getUTCDay(); if (w > 0 && w < 6) out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 864e5); } return out; }
  function sheetTab(tab) {
    var k = "mocksheet/" + tab; if (store[k]) return store[k];
    var g = +tab.split(" ")[1], secs = g >= 12 ? ["A", "B", "C"] : g >= 10 ? ["A", "B"] : [""], st = [], n = 0, td = ymd(Date.now());
    /* the real sheet's old header mistake (2025 dates after 9/Nov and 18/Jan) was fixed on 26 Oct 2026;
       tests can bring it back with localStorage "tpe-preview-odd" = "1" to check the warning still works */
    var oddOn = ls("tpe-preview-odd") === "1";
    var dates = schoolDays().filter(function (d) { return !oddOn || !/^2026-11-1[0-3]$|^2027-01-(19|2[0-2])$/.test(d); });
    secs.forEach(function (sc, si) { var size = g >= 10 ? 8 : 6; for (var i = 0; i < size; i++) { n++; var id = String(30000 + g * 100 + n), m = {};
      dates.forEach(function (d, di) { var w = new Date(d + "T00:00:00Z").getUTCDay(); if (d < td && w === ((g + si) % 5) + 1) m[d] = (i + di) % 11 === 0 ? "Т" : (i + di) % 13 === 0 ? "Ч" : (i + di) % 17 === 0 ? "Х" : (i + di) % 19 === 0 ? "Ө" : "И"; });
      var me = g === 11 && sc === "B" && i === 0;
      st.push({ id: id, first: me ? "Тэмүүлэн" : FN[(n * 7 + g) % FN.length], last: me ? "Бат" : LN[(n + g) % LN.length], grade: String(g), cls: sc ? g + sc : "", house: ["Хандгай", "Мазаалай", "Ирвэс", "Хавтгай"][n % 4], email: me ? "bat.temuulen@tomujin.edu.mn" : "student" + id + "@tomujin.edu.mn", m: m }); } });
    var odd = []; if (oddOn) ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2027-01-19", "2027-01-20", "2027-01-21", "2027-01-22"].forEach(function (w, i) { odd.push({ col: 0, iso: "2025-09-0" + (2 + i % 4), want: w }); });
    var weeks = {}, terms = [["2026-09-07", 1], ["2026-11-09", 2], ["2027-01-18", 3], ["2027-03-29", 4]];
    dates.forEach(function (d) { var t = terms.filter(function (x) { return x[0] <= d; }).pop(); if (!t) return; var w = Math.floor((new Date(d + "T00:00:00Z") - new Date(t[0] + "T00:00:00Z")) / (7 * 864e5)) + 1; weeks[d] = "P" + t[1] + "W" + w; });
    store[k] = { dates: dates, odd: odd, weeks: weeks, students: st };
    return store[k];
  }
  /* the same rules as the real script for a student's own coming lessons (test hook: __tpeClock = "now" in ms) */
  function clock() { return window.__tpeClock || Date.now(); }
  function hm(ms) { return new Date(ms + 8 * 3600e3).toISOString().slice(11, 16); }
  function addD(iso, n) { return new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function findMe(TABS) {
    var em = (user && user.email || "").toLowerCase();
    for (var i = 0; i < TABS.length; i++) { var t = sheetTab(TABS[i]), x = t.students.filter(function (s) { return s.email === em; })[0]; if (x) return { tab: TABS[i], t: t, x: x, key: x.cls || x.grade }; }
    return null;
  }
  function myDays(me) {
    var conf = store["mockabs"], now = clock(), td = ymd(now), wd = {}, weeks = {}, nw = 0, rows = me.t.students.filter(function (s) { return (s.cls || s.grade) === me.key; });
    for (var j = me.t.dates.length - 1; j >= 0; j--) { var d = me.t.dates[j]; if (d > td) continue; if (d < addD(td, -112)) break;
      var cnt = rows.filter(function (s) { return s.m[d]; }).length; if (!cnt || cnt * 2 < rows.length) continue;
      var w = addD(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7)); if (!weeks[w]) { if (nw === 3) break; weeks[w] = 1; nw++; } wd[new Date(d + "T00:00:00Z").getUTCDay()] = 1; }
    var any = !Object.keys(wd).length, last = addD(td, conf.ahead);
    return me.t.dates.filter(function (d) { return d >= td && d <= last && (any || wd[new Date(d + "T00:00:00Z").getUTCDay()]); }).map(function (d) {
      return { date: d, code: me.x.m[d] || "", open: d > td || hm(now) < conf.cutoff }; });
  }
  function studentCall(q, TABS) {
    var fail = function (c) { return wait().then(function () { throw new Error(c); }); }, conf = store["mockabs"];
    if (!user || !/@tomujin\.edu\.mn$/.test(user.email)) return fail("not-allowed");
    if (!conf.on) return fail("away-off");
    var me = findMe(TABS); if (!me) return fail("not-in-list");
    return wait(JSON.parse(JSON.stringify({ ok: true, today: ymd(clock()), cutoff: conf.cutoff, ahead: conf.ahead, me: { first: me.x.first, last: me.x.last, cls: me.key, tab: me.tab }, days: myDays(me) })));
  }
  /* Stand-in for the teacher's working sheet "PE 1-р улирлын Явц": attendance from the made-up "PE n" tabs up to today,
     1-5 levels made up from the student ID (a few 3s and 5s), points and grade with the real weights. */
  function yavtsMock(TABS) {
    var w = { att: 25, a: 15, r: 10, k: 15, u: 35 }, td = ymd(Date.now()), out = [];
    TABS.forEach(function (tab) {
      var t = sheetTab(tab), g = tab.split(" ")[1], max = {};
      t.students.forEach(function (x) { var n = Object.keys(x.m).filter(function (d) { return d <= td && d <= "2026-10-30"; }).length, k = x.cls || g; max[k] = Math.max(max[k] || 0, n); });
      t.students.forEach(function (x, i) {
        var c = { i: 0, x: 0, t: 0, ch: 0, o: 0 }, map = { "И": "i", "Х": "x", "Т": "t", "Ч": "ch", "Ө": "o" }, n = 0;
        Object.keys(x.m).forEach(function (d) { if (d <= td && d <= "2026-10-30") { c[map[x.m[d]]]++; n++; } });
        var seen = c.i + c.x + c.t, pct = seen ? (c.i + c.x) / seen : null, h = +x.id % 7;
        var lv = { a: h === 3 ? 5 : h === 5 ? 3 : 4, r: h === 1 ? 3 : 4, k: h === 2 ? 5 : 4, u: h === 3 ? 5 : h === 5 ? 2 : h === 6 ? 3 : 4 };
        var pts = { att: pct == null ? null : Math.round(pct * w.att * 1000) / 1000, a: lv.a / 5 * w.a, r: lv.r / 5 * w.r, k: lv.k / 5 * w.k, u: lv.u / 5 * w.u };
        var y = pct == null ? null : Math.round(pts.att + pts.a + pts.r + pts.k + pts.u);
        out.push({ id: x.id, tab: g, first: x.first, last: x.last, cls: x.cls, email: x.email, c: c, pct: pct == null ? null : Math.round(pct * 1000) / 1000, lv: lv, pts: pts, yavts: y,
          flag: n < (max[x.cls || g] || 0) ? "Ирцийн бүртгэл " + (max[x.cls || g] - n) + " хичээлээр цөөн" : "",
          note: h === 3 ? "Хичээлээс гадуур тогтмол гүйдэг, Strava-д тэмдэглэдэг." : h === 5 ? "Техникээ давтах хэрэгтэй: squat-д өвдөг дотогшоо орж байна." : "" });
      });
    });
    return JSON.parse(JSON.stringify({ ok: true, term: "t1", w: w, tabs: TABS.map(function (t) { return t.split(" ")[1] + "-р анги"; }), students: out, at: Date.now() }));
  }
  function sheetCall(q) {
    var TABS = ["PE 6", "PE 7", "PE 8", "PE 9", "PE 10", "PE 11", "PE 12"];
    if (q.action === "me") return studentCall(q, TABS);
    if (role !== "admin") return wait().then(function () { throw new Error("not-allowed"); });
    if (q.action === "absconf") {
      if (q.set) { var s = q.set; if (typeof s.on !== "boolean" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.cutoff) || !(s.ahead >= 1 && s.ahead <= 60)) return wait().then(function () { throw new Error("bad-conf"); }); store["mockabs"] = { on: s.on, cutoff: s.cutoff, ahead: s.ahead }; persist(); }
      return wait({ ok: true, absconf: JSON.parse(JSON.stringify(store["mockabs"])) });
    }
    if (q.action === "tabs") return wait({ ok: true, tabs: TABS });
    if (q.action === "yavts") return wait(yavtsMock(TABS));
    if (q.action === "summary") {
      var td = ymd(Date.now()), from = new Date(Date.parse(td + "T00:00:00Z") - 28 * 864e5).toISOString().slice(0, 10), out = [], watch = [], weeks = {};
      TABS.forEach(function (tab) { var t = sheetTab(tab), by = {}; Object.keys(t.weeks).forEach(function (d) { weeks[d] = t.weeks[d]; });
        t.students.forEach(function (x) { var k = x.cls || x.grade, c = by[k] || (by[k] = { cls: k, n: 0, present: 0, marked: 0, absent: 0, excused: 0, sick: 0, last: "", today: 0 }), a4 = 0; c.n++;
          Object.keys(x.m).forEach(function (d) { if (d > td) return; var v = x.m[d]; c.marked++; if (d > c.last) c.last = d; if (d === td) c.today++;
            if (v === "И" || v === "Х") c.present++; else if (v === "Т") { c.absent++; if (d >= from) a4++; } else if (v === "Ч") c.excused++; else if (v === "Ө") c.sick++; });
          if (a4 >= 2) watch.push({ tab: tab, id: x.id, first: x.first, last: x.last, cls: k, absent: a4 }); });
        Object.keys(by).sort().forEach(function (k) { var c = by[k]; c.tab = tab; c.pct = c.marked ? Math.round(c.present / c.marked * 100) : null; out.push(c); }); });
      return wait(JSON.parse(JSON.stringify({ ok: true, today: td, week: weeks[td] || "", weeks: weeks, classes: out, watch: watch, absconf: store["mockabs"] })));
    }
    if (TABS.indexOf(q.tab) < 0) return wait().then(function () { throw new Error("bad-tab"); });
    var t = sheetTab(q.tab);
    if (q.action === "read") return wait(JSON.parse(JSON.stringify({ ok: true, tab: q.tab, dates: t.dates, odd: t.odd, weeks: t.weeks, students: t.students })));
    if (q.action === "mark") {
      if (window.__tpeSheetFail) { window.__tpeSheetFail = false; return wait().then(function () { throw new Error("offline"); }); }
      if (t.dates.indexOf(q.date) < 0) return wait().then(function () { throw new Error("no-date-column"); });
      if (q.marks.some(function (w) { return w.req && w.code !== "Ө" && w.code !== "Ч"; })) return wait().then(function () { throw new Error("bad-code"); });
      window.__tpeApproved = (window.__tpeApproved || 0) + q.marks.filter(function (w) { return w.req; }).length;
      var go = function () { q.marks.forEach(function (w) { var s = t.students.filter(function (x) { return x.id === w.id; })[0]; if (s) { if (w.code) s.m[q.date] = w.code; else delete s.m[q.date]; } }); persist(); window.__tpeSheetWrites = (window.__tpeSheetWrites || 0) + 1; return { ok: true }; };
      if (window.__tpeSheetHold) return new Promise(function (res) { window.__tpeSheetRelease = function () { window.__tpeSheetHold = false; res(go()); }; });
      return wait().then(go);
    }
    return wait().then(function () { throw new Error("bad-action"); });
  }
  /* Stand-in for strava-fn: "connecting" just marks the link, activities are made up (last 30 days).
     Test hooks: __tpeStravaFail = next call fails with that error code ("busy", "not-linked"...). */
  function stravaActs() {
    var t = Date.now(), d = 864e5, A = [
      [0.15, "Өглөөний гүйлт", "Run", 1860, 5200, 151], [1.4, "Заалны хүч", "WeightTraining", 2700, 0, 0], [2.3, "Нарантуул хүртэл дугуй", "Ride", 3300, 14100, 128],
      [3.5, "Сагсны бэлтгэл", "Basketball", 4500, 0, 162], [5.2, "Зайсан руу алхалт", "Hike", 5400, 6800, 118], [6.3, "Интервал гүйлт", "Run", 2100, 6100, 164],
      [9.1, "Тэнхлэг, суналт", "Yoga", 1500, 0, 0], [12.2, "Урт гүйлт", "Run", 3600, 9800, 146], [16.4, "Волейбол", "Volleyball", 3900, 0, 140], [24, "Тэшүүр", "IceSkate", 2400, 0, 0]];
    return A.map(function (a, i) { return { id: String(17000000000 + i * 7919), n: a[1], sp: a[2], t: t - a[0] * d, mv: a[3], el: a[3] + 120, d: a[4], up: a[4] ? 40 : 0, hr: a[5] || null, mhr: a[5] ? a[5] + 22 : null }; });
  }
  function stravaCall(path) {
    var uid = user && user.uid, k = "users/" + uid + "/strava/link";
    if (!uid) return wait().then(function () { throw new Error("bad-token"); });
    if (window.__tpeStravaFail) { var c = window.__tpeStravaFail; window.__tpeStravaFail = null; return wait().then(function () { if (c === "not-linked") apply([{ op: "delete", path: k }]); throw new Error(c); }); }
    if (path === "/start") return wait().then(function () { apply([{ op: "set", path: k, data: { on: true, at: Date.now(), all: true } }]); return { linked: true }; });
    if (path === "/disconnect") return wait().then(function () { apply([{ op: "delete", path: k }]); return { ok: true }; });
    if (path === "/activities") return new Promise(function (res, rej) { setTimeout(function () { if (!store[k]) return rej(new Error("not-linked")); res({ items: stravaActs(), at: Date.now() }); }, 400); });
    return wait().then(function () { throw new Error("not-found"); });
  }
  var listeners = [];
  window.TPE = {
    sheet: sheetCall, strava: stravaCall, idToken: function () { return Promise.resolve("preview"); },
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
    css.textContent = "#previewBar{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 16px;background:#1c1c1c;color:#fff;font:13px/1.4 system-ui,sans-serif}#previewBar b{background:#f2cd30;color:#1c1c1c;padding:2px 8px;border-radius:6px;letter-spacing:.08em}#previewBar select,#previewBar button{font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #555;background:#2a2a2a;color:#fff}#previewBar span{opacity:.8}";
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
