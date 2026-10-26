// Tests for "tell in advance" (students marking a coming PE lesson sick/excused) in tools/sheet/attendance.gs.
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
r = owner({ action: "absconf" });
check("owner reads the settings back", r.ok && r.absconf.on && r.absconf.ahead === 21, r);

r = a1({ action: "me" });
check("student sees own PE days: Mondays from today up to 21 days", r.ok && r.days.map((d) => d.date).join() === "2026-10-26,2026-11-02,2026-11-09,2026-11-16", r.days);
check("a one-off Wednesday mark does not make Wednesday a PE day", !r.days.some((d) => d.date === "2026-10-28"));
check("student sees own class and name only", r.me.cls === "10A" && r.me.first === "Туршилт" && r.me.last === "Нэг" && r.me.tab === "PE 10", r.me);
const txt = JSON.stringify(r);
check("nothing about other students, no ID, phone or photo", !/Хоёр|Дөрөв|a2@|b1@|9010[2-4]|9020|99119911|photo/.test(txt) && !("id" in r.me), txt);
check("today's lesson is still open before 08:30", r.days[0].open === true && r.days[0].code === "" && r.days[0].mine === false, r.days[0]);
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

let before = pe10.writes.length;
r = a1({ action: "away", date: "2026-10-26", kind: "sick", id: "90102" });
check("student marks today's lesson sick: Ө in their own row", r.ok && r.code === OO && pe10.cell(A1, COL("2026-10-26")) === OO, r);
check("…and never in the row they name", pe10.cell(A2, COL("2026-10-26")) === "", pe10.cell(A2, COL("2026-10-26")));
const note = pe10.note(A1, COL("2026-10-26"));
check("the cell gets a short note: from the site, reason, time; no free text", /^Tomujin PE: .*\(Өвчтэй\) · 2026-10-26 07:15$/.test(note), note);
check("only that one cell and its note were written", pe10.writes.length - before === 2, pe10.writes.slice(before));
r = a1({ action: "away", date: "2026-10-26", kind: "leave" });
check("student can change sick to excused (Ч)", r.ok && pe10.cell(A1, COL("2026-10-26")) === CH && /\(Чөлөөтэй\)/.test(pe10.note(A1, COL("2026-10-26"))), r);
before = pe10.writes.length;
r = a1({ action: "away", date: "2026-10-27", kind: "sick" });
check("a day without PE for the class is refused", !r.ok && r.error === "not-lesson-day", r);
r = a1({ action: "away", date: "2026-10-19", kind: "sick" });
check("a past lesson is refused", !r.ok && r.error === "not-lesson-day", r);
r = a1({ action: "away", date: "2026-11-23", kind: "sick" });
check("further ahead than 21 days is refused", !r.ok && r.error === "not-lesson-day", r);
r = a1({ action: "away", date: "2026-11-02", kind: "late" });
check("only sick or excused", !r.ok && r.error === "bad-code", r);
r = a1({ action: "away", date: "02.11.2026", kind: "sick" });
check("a malformed date is refused", !r.ok && r.error === "bad-date", r);
check("refused requests write nothing", pe10.writes.length === before, pe10.writes.slice(before));

r = owner({ action: "mark", tab: "PE 10", date: "2026-11-02", marks: [{ id: "90102", code: CH }] });
r = a2({ action: "away", date: "2026-11-02", kind: "sick" });
check("a mark the teacher made is never overwritten", !r.ok && r.error === "already-marked" && pe10.cell(A2, COL("2026-11-02")) === CH, r);
r = a2({ action: "unaway", date: "2026-11-02" });
check("…nor taken back by the student", !r.ok && r.error === "not-yours" && pe10.cell(A2, COL("2026-11-02")) === CH, r);

r = a1({ action: "away", date: "2026-11-02", kind: "sick" });
r = owner({ action: "read", tab: "PE 10" });
const s1 = r.students.filter((s) => s.id === "90101")[0], s2 = r.students.filter((s) => s.id === "90102")[0];
check("teacher's read shows which cells came from students", s1.req["2026-10-26"] === 1 && s1.req["2026-11-02"] === 1 && !s2.req["2026-11-02"], [s1.req, s2.req]);
r = owner({ action: "summary" });
check("teacher home: coming lessons students will miss, in date order", r.ok && r.away.map((x) => x.id + "@" + x.date + "=" + x.code).join() === "90101@2026-10-26=Ч,90101@2026-11-02=Ө", r.away);
check("…with class and tab, no email", r.away[0].cls === "10A" && r.away[0].tab === "PE 10" && !("email" in r.away[0]), r.away[0]);
const c10a = r.classes.filter((c) => c.cls === "10A")[0];
check("a student's own mark for today is not \"attendance taken today\" and does not move the last lesson", c10a.today === 0 && c10a.last === "2026-10-19" && c10a.excused === 1, c10a);
check("future requests are not counted in the class numbers", c10a.sick === 0, c10a);

NOW = Date.parse("2026-10-26T08:31:00+08:00");
r = a1({ action: "me" });
check("after 08:30 today's lesson is closed, later ones stay open", r.ok && r.days[0].open === false && r.days[0].mine === true && r.days[1].open === true, r.days);
r = a1({ action: "unaway", date: "2026-10-26" });
check("after 08:30 today's mark cannot be taken back", !r.ok && r.error === "too-late" && pe10.cell(A1, COL("2026-10-26")) === CH, r);
r = a3({ action: "away", date: "2026-10-26", kind: "sick" });
check("after 08:30 a new mark for today is refused", !r.ok && r.error === "too-late" && pe10.cell(A3, COL("2026-10-26")) === "", r);
NOW = Date.parse("2026-10-26T07:40:00+08:00");
r = a1({ action: "unaway", date: "2026-10-26" });
check("before 08:30 the student can take it back: cell and note cleared", r.ok && pe10.cell(A1, COL("2026-10-26")) === "" && pe10.note(A1, COL("2026-10-26")) === "", r);
r = a1({ action: "unaway", date: "2026-11-09" });
check("taking back an empty cell is refused", !r.ok && r.error === "not-yours", r);

r = a3({ action: "away", date: "2026-11-09", kind: "sick" });
r = owner({ action: "mark", tab: "PE 10", date: "2026-11-09", marks: [{ id: "90103", code: I }] });
check("when the teacher writes over a student's mark, the note goes too", r.ok && pe10.cell(A3, COL("2026-11-09")) === I && pe10.note(A3, COL("2026-11-09")) === "", pe10.note(A3, COL("2026-11-09")));
r = a3({ action: "unaway", date: "2026-11-09" });
check("…and the student can no longer change it", !r.ok && r.error === "not-yours" && pe10.cell(A3, COL("2026-11-09")) === I, r);
r = a3({ action: "me" });
check("the student sees the teacher's mark", r.days.filter((d) => d.date === "2026-11-09")[0].code === I && !r.days.filter((d) => d.date === "2026-11-09")[0].mine, r.days);

for (const a of ["read", "mark", "summary", "tabs"]) { r = a1({ action: a, tab: "PE 10", date: "2026-10-26", marks: [{ id: "90102", code: T }] }); check("student cannot use the teacher action: " + a, !r.ok && r.error === "not-allowed", r); }
check("the Master tab is never touched", master.writes.length === 0);

r = owner({ action: "absconf", set: { on: false, cutoff: "08:30", ahead: 21 } });
r = a1({ action: "away", date: "2026-11-16", kind: "sick" });
check("switched off: students can no longer mark", !r.ok && r.error === "away-off" && pe10.cell(A1, COL("2026-11-16")) === "", r);

const bad = results.filter((x) => !x[0]);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
