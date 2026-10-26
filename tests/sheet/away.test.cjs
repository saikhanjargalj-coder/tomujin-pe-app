// Tests for "tell in advance" in tools/sheet/attendance.gs: students only READ their own coming PE lessons;
// their request lives on the site and only the teacher's approval writes Ө/Ч into the sheet.
// Stand-in Google Sheet with made-up students only; a fake clock decides "today" and the time of day.
//   node tests/sheet/away.test.cjs
const fs = require("fs"), vm = require("vm"), path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "..", "tools", "sheet", "attendance.gs"), "utf8");
const TZ = "Asia/Ulaanbaatar", OWNER = "saikhanjargal.j@tomujin.edu.mn";
const I = "И", T = "Т", CH = "Ч", OO = "Ө";
const results = [];
function check(name, cond, info) { results.push([!!cond, name]); console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(info))); }

let NOW = Date.parse("2026-10-26T07:15:00+08:00");
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const day = (iso) => new FakeDate(iso + "T00:00:00+08:00");
function fmt(d, tz, f) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return f.replace("yyyy", p.year).replace("MM", p.month).replace("dd", p.day).replace("HH", p.hour).replace("mm", p.minute);
}
function fakeSheet(name, rows) {
  const g = rows.map((r) => r.slice()), notes = {};
  return {
    writes: [], notes,
    getName: () => name,
    getLastColumn: () => Math.max(...g.map((r) => r.length)),
    getLastRow: () => { let n = g.length; while (n > 0 && g[n - 1].every((x) => x === "" || x == null)) n--; return n; },
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (g[r - 1 + i] || [])[c - 1 + j] ?? "")),
        getNotes: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => notes[(r + i) + ":" + (c + j)] || "")),
        getNote: () => notes[r + ":" + c] || "",
        setNote: (v) => { if (v) notes[r + ":" + c] = v; else delete notes[r + ":" + c]; self.writes.push([r, c, "note", v]); },
        setValue: (v) => { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; self.writes.push([r, c, v]); }
      };
    },
    cell: (r, c) => (g[r - 1] || [])[c - 1] ?? "",
    note: (r, c) => notes[r + ":" + c] || ""
  };
}
// school days Mon-Fri from 28 Sep to 27 Nov 2026
const DAYS = []; for (let t = Date.parse("2026-09-28T00:00:00Z"); t <= Date.parse("2026-11-27T00:00:00Z"); t += 864e5) { const w = new Date(t).getUTCDay(); if (w > 0 && w < 6) DAYS.push(new Date(t).toISOString().slice(0, 10)); }
const COL = (iso) => 13 + DAYS.indexOf(iso);   // dates start in column M like the real tabs
function tab(name, students, marks) {
  const head = ["ID", "Нэр", "Овог", "Анги", "Хаус", "И-Мэйл", "Утас", "Зураг", "Анги", "Elective 1", "Elective 2", "Ирц /цаг/"];
  const rows = [Array(12).fill(""), Array(12).fill(""), head.concat(DAYS.map(day))];
  students.forEach((s) => { const r = [s[0], s[1], s[2], s[3], "H", s[5], "99119911", "https://photo", s[4], "", "", 0]; DAYS.forEach((d) => r.push((marks[s[0]] || {})[d] || "")); rows.push(r); });
  return fakeSheet(name, rows);
}
// 10A has PE on Mondays, 10B on Fridays. One make-up Wednesday mark for one 10A student does not make Wednesday a PE day.
const pastMon = ["2026-10-05", "2026-10-12", "2026-10-19"], pastFri = ["2026-10-09", "2026-10-16", "2026-10-23"];
const mk = (days, code, extra) => Object.assign(Object.fromEntries(days.map((d) => [d, code])), extra || {});
const pe10 = tab("PE 10", [
  ["90101", "Туршилт", "Нэг", "10", "10A", "a1@tomujin.edu.mn"],
  ["90102", "Туршилт", "Хоёр", "10", "10A", "a2@tomujin.edu.mn"],
  ["90103", "Туршилт", "Гурав", "10", "10A", "a3@tomujin.edu.mn"],
  ["90104", "#N/A", "", "", "", ""],
  ["90201", "Туршилт", "Дөрөв", "10", "10B", "b1@tomujin.edu.mn"],
  ["90202", "Туршилт", "Тав", "10", "10B", "B2@tomujin.edu.mn"]
], { "90101": mk(pastMon, I, { "2026-10-14": I }), "90102": mk(pastMon, I), "90103": mk(pastMon, T), "90201": mk(pastFri, I), "90202": mk(pastFri, I) });
const pe7 = tab("PE 7", [["90701", "Шинэ", "Сурагч", "7", "", "new7@tomujin.edu.mn"]], {});
const master = fakeSheet("Master", [["ID", "Утас"], ["90101", "99119911"]]);
const SHEETS = [master, pe7, pe10];
const props = {};
function as(email, verified = true) {
  const ss = { getSheets: () => SHEETS, getSheetByName: (n) => SHEETS.find((s) => s.getName() === n) || null, getSpreadsheetTimeZone: () => TZ };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Utilities: { formatDate: fmt },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ users: [{ email, emailVerified: verified }] }) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
    Date: FakeDate
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return (q) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ idToken: "t" }, q)) } }).text);
}
const owner = as(OWNER), a1 = as("a1@tomujin.edu.mn"), a2 = as("a2@tomujin.edu.mn"), a3 = as("a3@tomujin.edu.mn"), b1 = as("b1@tomujin.edu.mn"), b2 = as("b2@tomujin.edu.mn");
const A1 = 4, A2 = 5, A3 = 6;   // sheet rows of the 10A students

let r = a1({ action: "me" });
check("off until the owner switches it on", !r.ok && r.error === "away-off", r);
r = a1({ action: "absconf", set: { on: true, cutoff: "08:30", ahead: 21 } });
check("a student cannot switch it on", !r.ok && r.error === "not-allowed", r);
r = owner({ action: "absconf", set: { on: true, cutoff: "8:30", ahead: 21 } });
check("owner settings: a wrong time is refused", !r.ok && r.error === "bad-conf", r);
r = owner({ action: "absconf", set: { on: "yes", cutoff: "08:30", ahead: 0 } });
check("owner settings: on must be yes/no and days ahead 1-60", !r.ok && r.error === "bad-conf", r);
r = owner({ action: "absconf", set: { on: true, cutoff: "08:30", ahead: 21 } });
check("owner switches it on (08:30, 21 days)", r.ok && r.absconf.on === true && r.absconf.cutoff === "08:30" && r.absconf.ahead === 21, r);

r = a1({ action: "me" });
check("student sees own PE days: Mondays from today up to 21 days", r.ok && r.days.map((d) => d.date).join() === "2026-10-26,2026-11-02,2026-11-09,2026-11-16", r.days);
check("a one-off Wednesday mark does not make Wednesday a PE day", !r.days.some((d) => d.date === "2026-10-28"));
check("student sees own class and name only", r.me.cls === "10A" && r.me.first === "Туршилт" && r.me.last === "Нэг" && r.me.tab === "PE 10", r.me);
const txt = JSON.stringify(r);
check("nothing about other students, no ID, phone or photo", !/Хоёр|Дөрөв|a2@|b1@|9010[2-4]|9020|99119911|photo/.test(txt) && !("id" in r.me), txt);
check("today's lesson can still be asked for before 08:30", r.days[0].open === true && r.days[0].code === "", r.days[0]);
check("each day says only date, teacher's mark, open", Object.keys(r.days[0]).sort().join() === "code,date,open", r.days[0]);
r = b1({ action: "me" });
check("10B student sees Fridays", r.ok && r.days.map((d) => d.date).join() === "2026-10-30,2026-11-06,2026-11-13", r.days);
r = b2({ action: "me" });
check("sheet email with capitals still matches", r.ok && r.me.last === "Тав", r);
r = as("teacher@tomujin.edu.mn")({ action: "me" });
check("a school account not on any PE list is told so", !r.ok && r.error === "not-in-list", r);
r = as("someone@gmail.com")({ action: "me" });
check("non-school accounts are refused", !r.ok && r.error === "not-allowed", r);
r = as("a1@tomujin.edu.mn", false)({ action: "me" });
check("unverified email is refused", !r.ok && r.error === "bad-token", r);
r = as("new7@tomujin.edu.mn")({ action: "me" });
check("a class with no lessons marked yet: every school day in range is offered", r.ok && r.days.length === 16 && r.days[0].date === "2026-10-26", r.days && r.days.length);

// students can never write to the sheet
const w0 = pe10.writes.length;
for (const a of ["away", "unaway", "mark", "read", "summary", "tabs"]) {
  r = a1({ action: a, tab: "PE 10", date: "2026-10-26", kind: "sick", marks: [{ id: "90101", code: OO, req: true }] });
  check("student cannot use: " + a, !r.ok && r.error === "not-allowed", r);
}
check("…and nothing was written", pe10.writes.length === w0 && pe10.cell(A1, COL("2026-10-26")) === "", pe10.writes.slice(w0));

// the teacher approves a request: the code goes in with a fixed note (never the student's comment)
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-02", marks: [{ id: "90101", code: OO, req: true }] });
const note = pe10.note(A1, COL("2026-11-02"));
check("approved request: Ө written with a short fixed note", r.ok && pe10.cell(A1, COL("2026-11-02")) === OO && /^Tomujin PE: .*баталсан \(Өвчтэй\) · 2026-10-26 07:15$/.test(note), [r, note]);
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-09", marks: [{ id: "90102", code: CH, req: true }] });
check("approved request: Ч (Чөлөөтэй)", r.ok && pe10.cell(A2, COL("2026-11-09")) === CH && /\(Чөлөөтэй\)/.test(pe10.note(A2, COL("2026-11-09"))), r);
const w1 = pe10.writes.length;
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-02", marks: [{ id: "90103", code: I, req: true }] });
check("an approval can only be sick or excused", !r.ok && r.error === "bad-code" && pe10.writes.length === w1, r);
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-02", marks: [{ id: "90101", code: T }] });
check("a later plain mark replaces it and removes the note", r.ok && pe10.cell(A1, COL("2026-11-02")) === T && pe10.note(A1, COL("2026-11-02")) === "", pe10.note(A1, COL("2026-11-02")));
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-16", marks: [{ id: "90103", code: T }] });
check("a plain mark never adds a note", r.ok && pe10.note(A3, COL("2026-11-16")) === "");
r = a1({ action: "me" });
check("the student sees the teacher's marks", r.days.filter((d) => d.date === "2026-11-02")[0].code === T, r.days);

r = owner({ action: "summary" });
check("summary carries the settings, nothing about requests", r.ok && r.absconf.on === true && !("away" in r), Object.keys(r));
r = owner({ action: "read", tab: "PE 10" });
check("teacher's read has no request data (requests live on the site)", r.ok && !("req" in r.students[0]), Object.keys(r.students[0]));

NOW = Date.parse("2026-10-26T08:31:00+08:00");
r = a1({ action: "me" });
check("after 08:30 today's lesson is closed, later ones stay open", r.ok && r.days[0].open === false && r.days[1].open === true, r.days);
NOW = Date.parse("2026-10-26T07:15:00+08:00");

check("the Master tab is never touched", master.writes.length === 0);
r = owner({ action: "absconf", set: { on: false, cutoff: "08:30", ahead: 21 } });
r = a1({ action: "me" });
check("switched off: students get nothing", !r.ok && r.error === "away-off", r);

const bad = results.filter((x) => !x[0]);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
