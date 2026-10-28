// Tests for the "yavts" action of tools/sheet/attendance.gs (term progress grade from the teacher's working sheet).
// Stand-in sheets with made-up students; the headers are copied from the real working sheet (27 Oct 2026).
//   node tests/sheet/yavts.test.cjs
const fs = require("fs"), vm = require("vm"), path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "..", "tools", "sheet", "attendance.gs"), "utf8");
const results = [];
function check(name, cond, info) { results.push([!!cond, name]); console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(info))); }

function fakeSheet(name, rows) {
  const g = rows.map((r) => r.slice());
  return {
    reads: 0, writes: 0,
    getName: () => name,
    getLastColumn: () => Math.max(0, ...g.map((r) => r.length)),
    getLastRow: () => { let n = g.length; while (n > 0 && g[n - 1].every((x) => x === "" || x == null)) n--; return n; },
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      return {
        getValues: () => { self.reads++; return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (g[r - 1 + i] || [])[c - 1 + j] ?? "")); },
        setValue: () => { self.writes++; }, setNote: () => { self.writes++; }, getNote: () => ""
      };
    }
  };
}
function book(sheets) { return { getSheets: () => sheets, getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null, getSpreadsheetTimeZone: () => "Asia/Ulaanbaatar" }; }
function load(ls, books, tokenEmail = "saikhanjargal.j@tomujin.edu.mn") {
  const opened = [];
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ls, openById: (id) => { opened.push(id); if (!books[id]) throw new Error("You do not have permission"); return books[id]; }, flush() {} },
    Utilities: { formatDate: (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    UrlFetchApp: { fetch: (url, o) => ({ getResponseCode: () => (JSON.parse(o.payload).idToken === "good" ? 200 : 400), getContentText: () => JSON.stringify({ users: [{ email: tokenEmail, emailVerified: true }] }) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
    Date
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { opened, call: (q) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(q) } }).text) };
}

// the school sheet: "PE 12" with the real header row (row 3) and school emails
const lsHead = ["ID", "Нэр", "Овог", "Анги", "Хаус", "И-Мэйл", "Утас", "Зураг", "Анги", "Elective 1", "Elective 2", "Ирц /цаг/", new Date("2026-09-07T00:00:00+08:00")];
const pe12 = fakeSheet("PE 12", [[], [], lsHead,
  ["90001", "Туршилт", "Нэг", "12", "H", "Test1@tomujin.edu.mn", "99119911", "", "12A", "", "", 2, "И"],
  ["90002", "#N/A", "", "", "", "", "", "", "", "", "", 0, ""],
  ["90003", "Туршилт", "Гурав", "12", "H", "test3@gmail.com", "", "", "12B", "", "", 0, "Т"]]);
const pe6 = fakeSheet("PE 6", [[], [], lsHead, ["60001", "Бага", "Анги", "6", "H", "small@tomujin.edu.mn", "", "", "", "", "", 2, "И"]]);
const LS = book([fakeSheet("Master", [["ID"]]), pe6, pe12]);

// the working sheet: same headers as the real one, plus a hidden raw tab that must be ignored
const H = ["ID", "Нэр", "Овог", "Анги", "И", "Х", "Т", "Ч", "Ө", "Бүртгэлтэй хичээл", "Ирц %", "Идэвх, оролцоо (1–5)", "Бэлэн байдал (1–5)", "Мэдлэг (1–5)", "Хэрэглээ, дадал (1–5)", "Ирц оноо", "Идэвх оноо", "Бэлэн оноо", "Мэдлэг оноо", "Хэрэглээ оноо", "ЯВЦ (100)", "Анхаарах", "Багшийн тэмдэглэл"];
// since 28 Oct 2026 the sheet also has the columns a student reads (the 6-р анги tab below keeps the old layout)
const H4 = H.concat(["Гарааны үнэлгээ (тойм)", "Давуу тал", "Анхаарах тал", "Нэмэлт өгүүлбэр", "Сэтгэгдэл (автомат)"]);
const g12 = fakeSheet("12-р анги", [H4,
  [90001, "Туршилт", "Нэг", "12A", 6, 1, 0, 1, 0, 8, 1, 5, 4, 4, 5, 25, 15, 8, 12, 35, 95, "", "Хичээлээс гадуур тогтмол гүйдэг",
    "Сунах 14 см · Миль 8:10 · Суниалт 22 · Харайлт 185 см", "тэсвэр", "уян хатан чанар", "", "Туршилт хичээл бүрт идэвхтэй оролцож байлаа. Цаашид уян хатан чанар дээрээ ажиллаарай."],
  [90002, "", "", "", 0, 0, 0, 0, 0, 0, "", 4, 4, 4, 4, "", 12, 8, 12, 28, "", "Нэр алга (Master-т байхгүй?)", "", "", "", "", "", "#N/A"],
  [90003, "Туршилт", "Гурав", "12B", 4, 0, 2, 0, 0, 6, 0.6667, 3, 3, 3, 2, 16.667, 9, 6, 9, 14, 55, "Ирцийн бүртгэл 1 хичээлээр цөөн", "", "Гарааны дүн бүртгэгдээгүй", "", "", "", "Гурав " + "а".repeat(2000)],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
const g6 = fakeSheet("6-р анги", [H, [60001, "Бага", "Анги", "", 8, 0, 0, 0, 0, 8, 1, 4, 4, 4, 4, 25, 12, 8, 12, 28, 85, "", ""]]);
const set = fakeSheet("Тохиргоо", [["PE 1-р улирлын Явцын дүн — тохиргоо"], ["Бүрэлдэхүүн", "Жин (оноо)", "Тайлбар"],
  ["Ирц", 25, ""], ["Идэвх, оролцоо", 15, ""], ["Бэлэн байдал", 10, ""], ["Мэдлэг", 15, ""], ["Хэрэглээ, дадал", 35, ""], ["Нийт", 100, ""],
  [], ["Түвшин", "Идэвх, оролцоо", "Бэлэн байдал"], [5, "x", "y"], ["Ирц % хэрхэн бодогдох вэ"], ["(И + Х) ÷ (И + Х + Т)", "", ""]]);
const raw = fakeSheet("raw12", [["90001", "Туршилт"]]);
const ID = "1qp37EAYmw1iVmIhnu0DepbEmNJoIagG2GvS-LL7w2Ck";
const books = {}; books[ID] = book([set, g6, g12, raw]);

let api = load(LS, books);
let r = api.call({ idToken: "good", action: "yavts", sheet: "https://docs.google.com/spreadsheets/d/" + ID + "/edit?pli=1&gid=12#gid=12" });
check("reads the working sheet by its link", r.ok && api.opened[0] === ID, r);
check("only the class tabs are read (raw tabs ignored)", r.ok && r.tabs.join() === "6-р анги,12-р анги", r.tabs);
check("every student row with an ID comes back, empty rows skipped", r.ok && r.students.map((s) => s.id).join() === "60001,90001,90002,90003", r.students && r.students.map((s) => s.id));
const a = r.students.filter((s) => s.id === "90001")[0], b = r.students.filter((s) => s.id === "90003")[0], z = r.students.filter((s) => s.id === "90002")[0], six = r.students.filter((s) => s.id === "60001")[0];
check("weights come from the settings tab", r.w.att === 25 && r.w.a === 15 && r.w.r === 10 && r.w.k === 15 && r.w.u === 35, r.w);
check("attendance counts by code", a.c.i === 6 && a.c.x === 1 && a.c.t === 0 && a.c.ch === 1 && a.c.o === 0, a.c);
check("levels, points, grade and percent", a.lv.a === 5 && a.lv.r === 4 && a.lv.k === 4 && a.lv.u === 5 && a.pts.att === 25 && a.pts.u === 35 && a.yavts === 95 && a.pct === 1, a);
check("decimals are kept short", b.pct === 0.667 && b.pts.att === 16.667, b);
check("school email joined by ID from the PE tabs, lower-cased", a.email === "test1@tomujin.edu.mn" && six.email === "small@tomujin.edu.mn", [a.email, six.email]);
check("a non-school email is never passed on", b.email === "", b.email);
check("class and grade tab", a.cls === "12A" && a.tab === "12" && six.cls === "" && six.tab === "6", [a.cls, a.tab, six.tab]);
check("a student without a grade yet has yavts null", z.yavts === null && z.pct === null && z.flag.length > 0, z);
check("teacher note and flag come along for the owner", a.note === "Хичээлээс гадуур тогтмол гүйдэг" && b.flag.indexOf("цөөн") > 0, [a.note, b.flag]);
check("script answers with v4", r.v === 4, r.v);
check("the comment, baseline, strength and area to work on come along", a.comment.indexOf("идэвхтэй") > 0 && a.base.indexOf("Миль 8:10") > 0 && a.str === "тэсвэр" && a.weak === "уян хатан чанар", [a.comment, a.base, a.str, a.weak]);
check("'Анхаарах тал' does not take the place of the attendance flag", b.flag.indexOf("цөөн") > 0 && a.flag === "" && a.weak === "уян хатан чанар", [a.flag, b.flag]);
check("a formula error in the comment becomes empty", z.comment === "", z.comment);
check("a long comment is cut to 1500 characters", b.comment.length === 1500 && b.base === "Гарааны дүн бүртгэгдээгүй", b.comment.length);
check("a tab without the new columns still works (empty texts)", six.comment === "" && six.base === "" && six.str === "" && six.weak === "" && six.yavts === 85, six);
check("no phone number from the school sheet", !JSON.stringify(r).includes("99119911"));
check("the working sheet is never written", [set, g6, g12, raw].every((s) => s.writes === 0) && pe12.writes === 0);

r = api.call({ idToken: "good", action: "yavts", sheet: ID });
check("a bare sheet ID works too", r.ok && r.students.length === 4);
r = api.call({ idToken: "good", action: "yavts", sheet: "" });
check("no link: clear error", !r.ok && r.error === "no-yavts-sheet", r);
r = api.call({ idToken: "good", action: "yavts", sheet: "https://docs.google.com/spreadsheets/d/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/edit" });
check("a sheet the script cannot open: clear error", !r.ok && r.error === "yavts-open", r);
const badBook = {}; badBook[ID] = book([fakeSheet("12-р анги", [["Нэр", "Овог"], ["x", "y"]])]);
r = load(LS, badBook).call({ idToken: "good", action: "yavts", sheet: ID });
check("a class tab without ID or ЯВЦ column is reported", !r.ok && /^yavts-header:12-р анги$/.test(r.error), r);
const noTabs = {}; noTabs[ID] = book([set]);
r = load(LS, noTabs).call({ idToken: "good", action: "yavts", sheet: ID });
check("a sheet with no class tabs is reported", !r.ok && r.error === "yavts-no-tabs", r);
r = load(LS, books, "teacher@tomujin.edu.mn").call({ idToken: "good", action: "yavts", sheet: ID });
check("only the owner may read grades", !r.ok && r.error === "not-allowed", r);
r = load(LS, books, "s1@tomujin.edu.mn").call({ idToken: "good", action: "yavts", sheet: ID });
check("a student cannot read grades through the script", !r.ok && r.error === "not-allowed", r);
r = api.call({ action: "yavts", sheet: ID });
check("no token, no grades", !r.ok && r.error === "no-token");

const bad = results.filter((x) => !x[0]);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
