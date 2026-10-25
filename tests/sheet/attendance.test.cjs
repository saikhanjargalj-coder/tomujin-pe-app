// Tests for tools/sheet/attendance.gs with a stand-in Google Sheet (made-up students, never real data).
//   node tests/sheet/attendance.test.cjs                 synthetic sheet only
//   node tests/sheet/attendance.test.cjs <export.txt>    also reads the "PE n" tabs of a local export (read-only, prints counts only)
const fs = require("fs"), vm = require("vm"), path = require("path");
const SRC = fs.readFileSync(path.join(__dirname, "..", "..", "tools", "sheet", "attendance.gs"), "utf8");
const TZ = "Asia/Ulaanbaatar";
const I = "И", KH = "Х", T = "Т", CH = "Ч", OO = "Ө";
const results = [];
function check(name, cond, info) { results.push([!!cond, name]); console.log((cond ? "PASS " : "FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(info))); }
const ub = (iso) => new Date(iso + "T00:00:00+08:00");

function fakeSheet(name, rows) {
  const g = rows.map((r) => r.slice());
  const width = () => Math.max(...g.map((r) => r.length));
  return {
    writes: [],
    getName: () => name,
    getLastColumn: width,
    getLastRow: () => { let n = g.length; while (n > 0 && g[n - 1].every((x) => x === "" || x == null)) n--; return n; },
    getRange(r, c, nr = 1, nc = 1) {
      const self = this;
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (g[r - 1 + i] || [])[c - 1 + j] ?? "")),
        setValue: (v) => { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; self.writes.push([r, c, v]); }
      };
    },
    cell: (r, c) => (g[r - 1] || [])[c - 1] ?? ""
  };
}
function load(sheets, tokenEmail = "saikhanjargal.j@tomujin.edu.mn", verified = true) {
  const ss = { getSheets: () => sheets, getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null, getSpreadsheetTimeZone: () => TZ };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    Utilities: { formatDate: (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d) },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    UrlFetchApp: { fetch: (url, o) => ({ getResponseCode: () => (JSON.parse(o.payload).idToken === "good" ? 200 : 400), getContentText: () => JSON.stringify({ users: [{ email: tokenEmail, emailVerified: verified }] }) }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
    Date
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx);
  return { call: (q) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(q) } }).text) };
}

// A copy of the real layout: two title rows, header in row 3 with the same column names,
// school days Mon-Fri, and the header mistake seen in the real sheet (2025 dates after 9/Nov).
function syntheticPE12() {
  const head = ["ID", "Нэр", "Овог", "Анги", "Хаус", "И-Мэйл", "Утас", "Зураг", "Анги", "Elective 1", "Elective 2", "Ирц /цаг/"];
  const days = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-10-26", "2026-10-30", "2026-11-09", "2025-09-02", "2025-09-03", "2026-11-16", "2027-01-18"];
  const rows = [Array(12).fill(""), Array(12).fill(""), head.concat(days.map(ub))];
  const st = [["90001", "Туршилт", "Нэг", "12", "12A", "test1@tomujin.edu.mn"], ["90002", "#N/A", "", "", "", ""], ["90003", "Туршилт", "Хоёр", "12", "12B", "Test3@tomujin.edu.mn"]];
  st.forEach((s, i) => rows.push([s[0], s[1], s[2], s[3], "H", s[5], "99119911", "https://photo", s[4], "", "", 0, i === 0 ? I : "", "", "", "", "", "", "", "", "", ""]));
  return rows;
}

const pe12 = fakeSheet("PE 12", syntheticPE12()), ls = fakeSheet("LS 12", [["x"]]);
let api = load([fakeSheet("Master", [["ID"]]), pe12, ls]);
let r = api.call({ idToken: "good", action: "tabs" });
check("only PE tabs are offered", r.ok && JSON.stringify(r.tabs) === '["PE 12"]', r);
r = api.call({ idToken: "good", action: "read", tab: "PE 12" });
check("reads students, skips #N/A placeholders", r.ok && r.students.length === 2 && r.students.map((s) => s.id).join() === "90001,90003", r);
check("class (12A/12B) comes from the second 'Анги' column, grade from the first", r.students[0].cls === "12A" && r.students[0].grade === "12" && r.students[1].cls === "12B");
check("no phone or photo in the answer", !JSON.stringify(r).includes("99119911") && !JSON.stringify(r).includes("photo"));
check("email lower-cased", r.students[1].email === "test3@tomujin.edu.mn");
check("existing mark read by date", r.students[0].m["2026-09-07"] === I);
check("2025 dates after 9/Nov are reported, not used", r.odd.length === 2 && r.odd.every((o) => o.iso.startsWith("2025")) && !r.dates.includes("2025-09-02"), r.odd);
check("the wrong columns say which days they should be", r.odd.map((o) => o.want).join() === "2026-11-10,2026-11-11", r.odd);
check("dates stay in order and include January", r.dates[0] === "2026-09-07" && r.dates.includes("2027-01-18"));

r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-10-26", marks: [{ id: "90001", code: I }, { id: "90003", code: T }] });
check("writes marks by student ID into the date column", r.ok && pe12.cell(4, 16) === I && pe12.cell(6, 16) === T, [r, pe12.cell(4, 16), pe12.cell(6, 16)]);
r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-10-26", marks: [{ id: "90003", code: "" }] });
check("empty code clears the cell", r.ok && pe12.cell(6, 16) === "");
r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-10-26", marks: [{ id: "90003", code: OO }] });
check("sick (Ө) is accepted", r.ok && pe12.cell(6, 16) === OO, r);
const before = pe12.writes.length;
r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-10-26", marks: [{ id: "90001", code: CH }, { id: "90003", code: "P" }] });
check("an unknown code refuses the whole request, nothing written", !r.ok && r.error === "bad-code" && pe12.writes.length === before, r);
r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-10-26", marks: [{ id: "99999", code: I }] });
check("unknown student is refused", !r.ok && /no-student/.test(r.error));
r = api.call({ idToken: "good", action: "mark", tab: "PE 12", date: "2026-11-10", marks: [{ id: "90001", code: I }] });
check("a date without its own column is refused (header mistake days)", !r.ok && r.error === "no-date-column");
r = api.call({ idToken: "good", action: "mark", tab: "LS 12", date: "2026-10-26", marks: [] });
check("other tabs (LS, Master) cannot be read or written", !r.ok && r.error === "bad-tab");
r = api.call({ idToken: "good", action: "read", tab: "Master" });
check("Master tab with personal data is never returned", !r.ok && r.error === "bad-tab");
r = load([pe12], "teacher@tomujin.edu.mn").call({ idToken: "good", action: "read", tab: "PE 12" });
check("another verified account is refused", !r.ok && r.error === "not-allowed");
r = load([pe12], "saikhanjargal.j@tomujin.edu.mn", false).call({ idToken: "good", action: "read", tab: "PE 12" });
check("unverified email is refused", !r.ok && r.error === "bad-token");
r = api.call({ idToken: "forged", action: "read", tab: "PE 12" });
check("a token Google rejects is refused", !r.ok && r.error === "bad-token");
r = api.call({ action: "read", tab: "PE 12" });
check("no token, no data", !r.ok && r.error === "no-token");

// optional: the real export, read-only, counts only
if (process.argv[2]) {
  const csv = (t) => { const rows = [], row = []; let f = "", q = false, cur = []; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ",") { cur.push(f); f = ""; } else if (c === "\n") { cur.push(f); rows.push(cur); cur = []; f = ""; } else if (c !== "\r") f += c; } if (f || cur.length) { cur.push(f); rows.push(cur); } return rows; };
  const txt = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n?/g, "\n");
  const parts = txt.split(/^## Sheet name: (.*)$/m);
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const tabs = [];
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i].trim(); if (!/^PE \d+$/.test(name)) continue;
    const rows = csv(parts[i + 1].replace(/^\n+|\n+$/g, ""));
    // the export shows dates as "7/Sep"; rebuild them the way the sheet stores them, keeping the wrong ones wrong
    let prev = null;
    rows[2] = rows[2].map((h) => { const m = /^(\d{1,2})\/([A-Z][a-z]{2})$/.exec(h); if (!m) return h; let y = M[m[2]] >= 8 ? 2026 : 2027; const d = ub(`${y}-${String(M[m[2]] + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`); if (prev && d < prev && M[m[2]] === 8) { return ub(`2025-09-${m[1].padStart(2, "0")}`); } prev = d; return d; });
    tabs.push(fakeSheet(name, rows));
  }
  const a = load(tabs);
  tabs.forEach((s) => { const x = a.call({ idToken: "good", action: "read", tab: s.getName() }); console.log(`${s.getName()}: ${x.ok ? x.students.length + " students, " + x.dates.length + " dates, header problems " + x.odd.length + " (" + [...new Set(x.odd.map((o) => o.iso))].join(" ") + "), classes " + [...new Set(x.students.map((s) => s.cls || s.grade))].join("/") : x.error}`); });
}

const bad = results.filter((x) => !x[0]);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
