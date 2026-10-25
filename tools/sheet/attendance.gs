/* Tomujin PE <-> "LS Learning Data | TAS 2026-2027" PE attendance bridge (Google Apps Script).
 *
 * Install once, inside the sheet: Extensions > Apps Script, paste this file, Save,
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, Deploy, Authorize.
 * Copy the web app URL into the site: the class attendance page > Settings.
 *
 * Who may use it: only the owner's verified school account. Every request carries the person's
 * Firebase sign-in token; this script asks Google to check it before reading or writing anything.
 * What it returns: student ID, first and last name, grade, class (10A...), house, school email, the
 * attendance marks and the week labels of row 1 (P1W8...). It never returns phone numbers, photos, parents' data or anything from other tabs.
 * What it writes: one attendance cell (or a list of them) on a "PE n" tab, found by student ID and
 * by the date in row 3. Only the school's own codes are accepted. Nothing else in the sheet changes.
 *
 * This file is plain ASCII on purpose: Mongolian letters are written as \u escapes.
 */
var OWNER = 'saikhanjargal.j@tomujin.edu.mn';
var API_KEY = 'AIzaSyA60u_RFVZ5Z79NE7pMQxMxKosPkoAL4-E';   // public Firebase web key of tomujin-pe
var TAB_RE = /^PE \d+$/;
var HEAD_ROW = 3, FIRST_ROW = 4;
// I (present), Kh (late, counts as present), T (absent), Ch (excused), O-bar (sick), in Cyrillic
var CODES = ['\u0418', '\u0425', '\u0422', '\u0427', '\u04e8'];
var H_ID = 'ID', H_FIRST = '\u041d\u044d\u0440', H_LAST = '\u041e\u0432\u043e\u0433', H_CLASS = '\u0410\u043d\u0433\u0438', H_MAIL = '\u0418-\u041c\u044d\u0439\u043b', H_HOUSE = '\u0425\u0430\u0443\u0441';

function doPost(e) {
  var out;
  try {
    var q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var who = checkToken_(q.idToken);
    if (who !== OWNER) throw new Error('not-allowed');
    out = handle_(q, SpreadsheetApp.getActiveSpreadsheet());
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'tomujin-pe-attendance', v: 1 })).setMimeType(ContentService.MimeType.JSON);
}

/* Google checks the token; we only accept a verified email. */
function checkToken_(token) {
  if (!token) throw new Error('no-token');
  var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: token }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('bad-token');
  var u = (JSON.parse(r.getContentText()).users || [])[0];
  if (!u || !u.emailVerified) throw new Error('bad-token');
  return String(u.email || '').toLowerCase();
}

function handle_(q, ss) {
  if (q.action === 'summary') return summary_(ss);
  if (q.action === 'tabs') return { ok: true, tabs: ss.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return TAB_RE.test(n); }) };
  if (!TAB_RE.test(String(q.tab || ''))) throw new Error('bad-tab');
  var sh = ss.getSheetByName(q.tab);
  if (!sh) throw new Error('no-tab');
  var tz = ss.getSpreadsheetTimeZone();
  if (q.action === 'read') return read_(sh, tz);
  if (q.action === 'mark') {
    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try { return mark_(sh, tz, q.date, q.marks || []); } finally { lock.releaseLock(); }
  }
  throw new Error('bad-action');
}

function layout_(sh, tz) {
  var lastCol = sh.getLastColumn();
  var head = sh.getRange(HEAD_ROW, 1, 1, lastCol).getValues()[0];
  var top = sh.getRange(1, 1, 1, lastCol).getValues()[0];   // week labels (P1W1 ...) above the first day of each week
  var c = {}, good = [], odd = [], last = '', gap = 0, wk = '', weeks = {};
  head.forEach(function (h, i) {
    if (h instanceof Date) {
      // dates run left to right; one that is not after the previous date (for example a 2025 date
      // in the middle of November 2026) is a header mistake: it is reported and never written to
      var iso = Utilities.formatDate(h, tz, 'yyyy-MM-dd');
      var lab = String(top[i] || '').trim(); if (/^P\d+W\d+$/.test(lab)) wk = lab;
      if (iso > last) { good.push({ col: i + 1, iso: iso }); last = iso; gap = 0; if (wk) weeks[iso] = wk; }
      else { gap++; odd.push({ col: i + 1, iso: iso, after: last, want: addDays_(last, gap) }); }
      return;
    }
    var k = String(h).trim();
    if (k === H_ID && !c.id) c.id = i + 1;
    else if (k === H_FIRST && !c.first) c.first = i + 1;
    else if (k === H_LAST && !c.last) c.last = i + 1;
    else if (k === H_MAIL && !c.mail) c.mail = i + 1;
    else if (k === H_HOUSE && !c.house) c.house = i + 1;
    else if (k === H_CLASS) { if (!c.grade) c.grade = i + 1; else if (!c.cls) c.cls = i + 1; }
  });
  if (!c.id || !c.first) throw new Error('bad-header');
  return { c: c, dates: good, odd: odd, lastCol: lastCol, weeks: weeks };
}

// the day this column most likely stands for (the header formulas add 1 day per column)
function addDays_(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function read_(sh, tz) {
  var L = layout_(sh, tz), n = sh.getLastRow() - FIRST_ROW + 1;
  var students = [];
  if (n > 0) {
    var v = sh.getRange(FIRST_ROW, 1, n, L.lastCol).getValues();
    v.forEach(function (r) {
      var id = String(r[L.c.id - 1]).trim(), first = String(r[L.c.first - 1]).trim();
      if (!id || !first || first.charAt(0) === '#') return;   // empty rows and #N/A placeholders
      var m = {};
      L.dates.forEach(function (d) { var x = String(r[d.col - 1]).trim(); if (x) m[d.iso] = x; });
      students.push({
        id: id, first: first, last: L.c.last ? String(r[L.c.last - 1]).trim() : '',
        // a blank grade on a 'PE n' tab means grade n (one row on PE 8 has none)
        grade: (L.c.grade ? String(r[L.c.grade - 1]).trim() : '') || sh.getName().replace(/\D/g, ''), cls: L.c.cls ? String(r[L.c.cls - 1]).trim() : '',
        house: L.c.house ? String(r[L.c.house - 1]).trim() : '',
        email: L.c.mail ? String(r[L.c.mail - 1]).trim().toLowerCase() : '', m: m
      });
    });
  }
  return { ok: true, tab: sh.getName(), dates: L.dates.map(function (d) { return d.iso; }), odd: L.odd, weeks: L.weeks, students: students, codes: CODES };
}

/* One call for the teacher home: per class how many students, how many marks, present share, last
   lesson day, and the students absent (T) two or more times in the last 28 days. No other personal data. */
function summary_(ss) {
  var tz = ss.getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var from = addDays_(today, -28), out = [], watch = [], weeks = {};
  ss.getSheets().forEach(function (sh) {
    if (!TAB_RE.test(sh.getName())) return;
    var r = read_(sh, tz), by = {};
    Object.keys(r.weeks || {}).forEach(function (d) { weeks[d] = r.weeks[d]; });
    r.students.forEach(function (x) {
      var k = x.cls || x.grade || '?', s = by[k] || (by[k] = { cls: k, n: 0, present: 0, marked: 0, absent: 0, excused: 0, sick: 0, last: '', today: 0 });
      s.n++; var a4 = 0;
      Object.keys(x.m).forEach(function (d) {
        if (d > today) return;
        var v = x.m[d]; s.marked++; if (d > s.last) s.last = d; if (d === today) s.today++;
        if (v === CODES[0] || v === CODES[1]) s.present++; else if (v === CODES[2]) { s.absent++; if (d >= from) a4++; }
        else if (v === CODES[3]) s.excused++; else if (v === CODES[4]) s.sick++;
      });
      if (a4 >= 2) watch.push({ tab: r.tab, id: x.id, first: x.first, last: x.last, cls: k, absent: a4 });
    });
    Object.keys(by).sort().forEach(function (k) { var s = by[k]; s.tab = r.tab; s.pct = s.marked ? Math.round(s.present / s.marked * 100) : null; out.push(s); });
  });
  return { ok: true, today: today, week: weeks[today] || '', weeks: weeks, classes: out, watch: watch };
}

/* marks: [{id, code}] for one date. code '' clears the cell. Returns what was written. */
function mark_(sh, tz, iso, marks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) throw new Error('bad-date');
  var L = layout_(sh, tz), col = 0;
  L.dates.forEach(function (d) { if (d.iso === iso) col = d.col; });
  if (!col) throw new Error('no-date-column');
  var n = sh.getLastRow() - FIRST_ROW + 1;
  var ids = n > 0 ? sh.getRange(FIRST_ROW, L.c.id, n, 1).getValues().map(function (r) { return String(r[0]).trim(); }) : [];
  var done = [];
  marks.forEach(function (x) {
    var code = String(x.code || '');
    if (code && CODES.indexOf(code) < 0) throw new Error('bad-code');
    var i = ids.indexOf(String(x.id).trim());
    if (i < 0 || !String(x.id).trim()) throw new Error('no-student:' + x.id);
    if (ids.indexOf(String(x.id).trim(), i + 1) >= 0) throw new Error('duplicate-student:' + x.id);
    done.push({ row: FIRST_ROW + i, id: ids[i], code: code });
  });
  done.forEach(function (d) { sh.getRange(d.row, col).setValue(d.code); });
  SpreadsheetApp.flush();
  return { ok: true, date: iso, written: done.map(function (d) { return { id: d.id, code: d.code }; }) };
}
