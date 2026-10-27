/* Tomujin PE <-> "LS Learning Data | TAS 2026-2027" PE attendance bridge (Google Apps Script).
 *
 * Install once, inside the sheet: Extensions > Apps Script, paste this file, Save,
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, Deploy, Authorize.
 * Copy the web app URL into the site: the class attendance page > Settings.
 *
 * Who may use it: every request carries the person's Firebase sign-in token; this script asks Google
 * to check it before reading or writing anything.
 * - The owner's verified school account: read the PE tabs, write attendance, change the settings.
 * - A verified @tomujin.edu.mn student, only while the owner has switched "tell in advance" on: READ their
 *   own coming PE lessons (date, the teacher's mark if any, whether it can still be asked for). Students never
 *   write to the sheet: their request (reason and comment) is kept on the site, and only when the teacher
 *   approves it does the teacher's own call write "sick" or "excused" here.
 * What it returns: student ID, first and last name, grade, class (10A...), house, school email, the
 * attendance marks and the week labels of row 1 (P1W8...). It never returns phone numbers, photos, parents' data or anything from other tabs.
 * Term progress grades (owner only, action "yavts"): reads the teacher's separate working sheet
 * ("PE 1-r uliral Yavts", tabs "6-r angi" ... "12-r angi" and "Tohirgoo") by the link the owner saves on the site, and
 * returns each student's attendance counts, the teacher's 1-5 levels, the points and the term grade, plus the school
 * email from the "PE n" tabs here (to match the site account). It never writes to that sheet.
 * What it writes (owner only): attendance cells on "PE n" tabs, found by student ID and by the date in row 3,
 * plus a short fixed note on a cell when it comes from an approved student request (never the student's comment).
 * Only the school's own codes are accepted.
 *
 * This file is plain ASCII on purpose: Mongolian letters are written as \u escapes.
 */
var OWNER = 'saikhanjargal.j@tomujin.edu.mn';
var SCHOOL_RE = /@tomujin\.edu\.mn$/;
var API_KEY = 'AIzaSyA60u_RFVZ5Z79NE7pMQxMxKosPkoAL4-E';   // public Firebase web key of tomujin-pe
var TAB_RE = /^PE \d+$/;
var HEAD_ROW = 3, FIRST_ROW = 4;
// I (present), Kh (late, counts as present), T (absent), Ch (excused), O-bar (sick), in Cyrillic
var CODES = ['\u0418', '\u0425', '\u0422', '\u0427', '\u04e8'];
var H_ID = 'ID', H_FIRST = '\u041d\u044d\u0440', H_LAST = '\u041e\u0432\u043e\u0433', H_CLASS = '\u0410\u043d\u0433\u0438', H_MAIL = '\u0418-\u041c\u044d\u0439\u043b', H_HOUSE = '\u0425\u0430\u0443\u0441';
// actions a student may call for themselves; everything else is the owner's only
var STUDENT_ACTIONS = { me: 1 };
// the note put on a cell written from an approved student request (anyone looking at the sheet sees why)
var NOTE_TAG = 'Tomujin PE: ';
var NOTE_TEXT = '\u0441\u0443\u0440\u0430\u0433\u0447\u0438\u0439\u043d \u0443\u0440\u044c\u0434\u0447\u0438\u043b\u0441\u0430\u043d \u0445\u04af\u0441\u044d\u043b\u0442\u0438\u0439\u0433 \u0431\u0430\u0433\u0448 \u0431\u0430\u0442\u0430\u043b\u0441\u0430\u043d';
var ABS_DEFAULT = { on: false, cutoff: '08:30', ahead: 21 };

function doPost(e) {
  var out;
  try {
    var q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var who = checkToken_(q.idToken);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (STUDENT_ACTIONS[q.action]) out = student_(q, ss, who);
    else {
      if (who !== OWNER) throw new Error('not-allowed');
      out = handle_(q, ss);
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'tomujin-pe-attendance', v: 3 })).setMimeType(ContentService.MimeType.JSON);
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
  if (q.action === 'absconf') return absConfSet_(q.set);
  if (q.action === 'tabs') return { ok: true, tabs: ss.getSheets().map(function (s) { return s.getName(); }).filter(function (n) { return TAB_RE.test(n); }) };
  if (q.action === 'yavts') return yavts_(ss, q.sheet);
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
  var c = {}, good = [], odd = [], last = '', gap = 0, wk = '', weeks = {}, col = {};
  head.forEach(function (h, i) {
    if (h instanceof Date) {
      // dates run left to right; one that is not after the previous date (for example a 2025 date
      // in the middle of November 2026) is a header mistake: it is reported and never written to
      var iso = Utilities.formatDate(h, tz, 'yyyy-MM-dd');
      var lab = String(top[i] || '').trim(); if (/^P\d+W\d+$/.test(lab)) wk = lab;
      if (iso > last) { good.push({ col: i + 1, iso: iso }); col[iso] = i + 1; last = iso; gap = 0; if (wk) weeks[iso] = wk; }
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
  return { c: c, dates: good, odd: odd, lastCol: lastCol, weeks: weeks, col: col };
}

// the day this column most likely stands for (the header formulas add 1 day per column)
function addDays_(iso, n) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekday_(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }
function monday_(iso) { return addDays_(iso, -((weekday_(iso) + 6) % 7)); }

/* One student row as the site sees it, or null for empty rows and #N/A placeholders. */
function rowInfo_(L, r, sh) {
  var id = String(r[L.c.id - 1]).trim(), first = String(r[L.c.first - 1]).trim();
  if (!id || !first || first.charAt(0) === '#') return null;
  return {
    id: id, first: first, last: L.c.last ? String(r[L.c.last - 1]).trim() : '',
    // a blank grade on a 'PE n' tab means grade n (one row on PE 8 had none)
    grade: (L.c.grade ? String(r[L.c.grade - 1]).trim() : '') || sh.getName().replace(/\D/g, ''), cls: L.c.cls ? String(r[L.c.cls - 1]).trim() : '',
    house: L.c.house ? String(r[L.c.house - 1]).trim() : '',
    email: L.c.mail ? String(r[L.c.mail - 1]).trim().toLowerCase() : ''
  };
}

function read_(sh, tz) {
  var L = layout_(sh, tz), n = sh.getLastRow() - FIRST_ROW + 1;
  var students = [];
  if (n > 0) {
    var v = sh.getRange(FIRST_ROW, 1, n, L.lastCol).getValues();
    v.forEach(function (r) {
      var x = rowInfo_(L, r, sh);
      if (!x) return;
      var m = {};
      L.dates.forEach(function (d) { var s = String(r[d.col - 1]).trim(); if (s) m[d.iso] = s; });
      x.m = m;
      students.push(x);
    });
  }
  return { ok: true, tab: sh.getName(), dates: L.dates.map(function (d) { return d.iso; }), odd: L.odd, weeks: L.weeks, students: students, codes: CODES };
}

/* One call for the teacher home: per class how many students, how many marks, present share, last
   lesson day and the students absent (T) two or more times in the last 28 days. No other personal data. */
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
  return { ok: true, today: today, week: weeks[today] || '', weeks: weeks, classes: out, watch: watch, absconf: absConf_() };
}

/* marks: [{id, code, req}] for one date. code '' clears the cell. Returns what was written.
   req: true when the teacher approves a student's request ("sick" or "excused" only): the cell then gets a
   short fixed note saying so. Any other write removes such a note, so it never sits on a different mark. */
function mark_(sh, tz, iso, marks) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) throw new Error('bad-date');
  var L = layout_(sh, tz), col = L.col[iso] || 0;
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
    if (x.req && code !== CODES[3] && code !== CODES[4]) throw new Error('bad-code');
    done.push({ row: FIRST_ROW + i, id: ids[i], code: code, req: !!x.req });
  });
  var stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  done.forEach(function (d) {
    var cell = sh.getRange(d.row, col);
    cell.setValue(d.code);
    if (d.req) cell.setNote(NOTE_TAG + NOTE_TEXT + ' (' + (d.code === CODES[4] ? '\u04e8\u0432\u0447\u0442\u044d\u0439' : '\u0427\u04e9\u043b\u04e9\u04e9\u0442\u044d\u0439') + ') \u00b7 ' + stamp);
    else if (String(cell.getNote() || '').indexOf(NOTE_TAG) === 0) cell.setNote('');
  });
  SpreadsheetApp.flush();
  return { ok: true, date: iso, written: done.map(function (d) { return { id: d.id, code: d.code }; }) };
}

/* ---------- students telling in advance that they will miss a lesson ---------- */
function absConf_() {
  var raw = PropertiesService.getScriptProperties().getProperty('ABS'), c = {};
  try { c = raw ? JSON.parse(raw) : {}; } catch (e) { c = {}; }
  return {
    on: c.on === true,
    cutoff: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.cutoff)) ? c.cutoff : ABS_DEFAULT.cutoff,
    ahead: (c.ahead >= 1 && c.ahead <= 60) ? Math.floor(c.ahead) : ABS_DEFAULT.ahead
  };
}
function absConfSet_(s) {
  if (s) {
    if (typeof s.on !== 'boolean') throw new Error('bad-conf');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(s.cutoff))) throw new Error('bad-conf');
    if (!(s.ahead >= 1 && s.ahead <= 60 && Math.floor(s.ahead) === s.ahead)) throw new Error('bad-conf');
    PropertiesService.getScriptProperties().setProperty('ABS', JSON.stringify({ on: s.on, cutoff: s.cutoff, ahead: s.ahead }));
  }
  return { ok: true, absconf: absConf_() };
}

function student_(q, ss, email) {
  if (!SCHOOL_RE.test(email)) throw new Error('not-allowed');
  var conf = absConf_();
  if (!conf.on) throw new Error('away-off');
  var tz = ss.getSpreadsheetTimeZone();
  return meOut_(findMe_(ss, tz, email), conf, tz);
}

/* The student's own row, found by their verified school email. */
function findMe_(ss, tz, email) {
  var tabs = ss.getSheets().filter(function (s) { return TAB_RE.test(s.getName()); });
  for (var t = 0; t < tabs.length; t++) {
    var sh = tabs[t], L = layout_(sh, tz), n = sh.getLastRow() - FIRST_ROW + 1;
    if (!L.c.mail || n < 1) continue;
    var mails = sh.getRange(FIRST_ROW, L.c.mail, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      if (String(mails[i][0]).trim().toLowerCase() !== email) continue;
      var vals = sh.getRange(FIRST_ROW, 1, n, L.lastCol).getValues(), x = rowInfo_(L, vals[i], sh);
      if (!x) continue;
      return { sh: sh, L: L, i: i, row: FIRST_ROW + i, vals: vals, x: x, key: x.cls || x.grade };
    }
  }
  throw new Error('not-in-list');
}

/* The weekdays this class has PE: the days most of the class got a mark, in the last 3 weeks that had
   lessons (up to 16 weeks back). With no lessons yet, every school day counts. */
function lessonWeekdays_(me, today) {
  var L = me.L, rows = [], wd = {}, weeks = {}, nw = 0, from = addDays_(today, -112);
  me.vals.forEach(function (r) { var x = rowInfo_(L, r, me.sh); if (x && (x.cls || x.grade) === me.key) rows.push(r); });
  for (var j = L.dates.length - 1; j >= 0; j--) {
    var d = L.dates[j];
    if (d.iso > today) continue;
    if (d.iso < from) break;
    var cnt = 0; rows.forEach(function (r) { if (String(r[d.col - 1]).trim()) cnt++; });
    if (!cnt || cnt * 2 < rows.length) continue;
    var w = monday_(d.iso);
    if (!weeks[w]) { if (nw === 3) break; weeks[w] = 1; nw++; }
    wd[weekday_(d.iso)] = 1;
  }
  return wd;
}

/* The student's PE lessons from today up to "ahead" days: the teacher's mark if any, and whether a request
   can still be sent (today only until the cut-off time). */
function myDays_(me, conf, tz) {
  var now = new Date(), today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), hm = Utilities.formatDate(now, tz, 'HH:mm');
  var wd = lessonWeekdays_(me, today), any = !Object.keys(wd).length, last = addDays_(today, conf.ahead), out = [];
  me.L.dates.forEach(function (d) {
    if (d.iso < today || d.iso > last) return;
    if (!any && !wd[weekday_(d.iso)]) return;
    out.push({ date: d.iso, code: String(me.vals[me.i][d.col - 1]).trim(), open: d.iso > today || hm < conf.cutoff });
  });
  return out;
}

function meOut_(me, conf, tz) {
  return {
    ok: true, today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), cutoff: conf.cutoff, ahead: conf.ahead,
    me: { first: me.x.first, last: me.x.last, cls: me.key, tab: me.sh.getName() },
    days: myDays_(me, conf, tz)
  };
}

/* ---------- term progress grade ("Yavts") from the teacher's working sheet ----------
   The working sheet has one tab per grade ("6-r angi" ... "12-r angi", row 1 = headers) and a settings tab
   ("Tohirgoo") with the weights: labels in column A, numbers in column B. Columns are found by the start of
   their header, so moving or adding columns keeps working. Read only: nothing is written there. */
var YV_TAB_RE = /^(\d{1,2})-\u0440 \u0430\u043d\u0433\u0438$/;
var YV_SET = '\u0422\u043e\u0445\u0438\u0440\u0433\u043e\u043e';
var YV_ATT = '\u0418\u0440\u0446', YV_PCT = '\u0418\u0440\u0446 %', YV_PTS = '\u043e\u043d\u043e\u043e';
var YV_FIRST = '\u041d\u044d\u0440', YV_LAST = '\u041e\u0432\u043e\u0433', YV_CLS = '\u0410\u043d\u0433\u0438';
var YV_TOTAL = '\u042f\u0412\u0426', YV_FLAG = '\u0410\u043d\u0445\u0430\u0430\u0440\u0430\u0445', YV_NOTE = '\u0411\u0430\u0433\u0448';
// the four teacher-rated parts: activity, readiness, knowledge, application & habits
var YV_PARTS = [['a', '\u0418\u0434\u044d\u0432\u0445'], ['r', '\u0411\u044d\u043b\u044d\u043d'], ['k', '\u041c\u044d\u0434\u043b\u044d\u0433'], ['u', '\u0425\u044d\u0440\u044d\u0433\u043b\u044d\u044d']];
var YV_CODEKEY = ['i', 'x', 't', 'ch', 'o'];   // same order as CODES

function yvSheetId_(s) {
  s = String(s || '').trim();
  var m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  throw new Error('no-yavts-sheet');
}
function yvNum_(v) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v * 1000) / 1000 : null; }
function yvStarts_(h, s) { return h.slice(0, s.length) === s; }

/* where each value sits on a class tab */
function yvCols_(head) {
  var c = { codes: {}, lv: {}, pts: {} };
  head.forEach(function (raw, i) {
    var h = String(raw).trim();
    if (!h) return;
    var code = CODES.indexOf(h);
    if (code >= 0) { if (c.codes[YV_CODEKEY[code]] == null) c.codes[YV_CODEKEY[code]] = i; return; }
    if (h === 'ID') { if (c.id == null) c.id = i; return; }
    if (yvStarts_(h, YV_PCT)) { if (c.pct == null) c.pct = i; return; }
    if (yvStarts_(h, YV_ATT) && h.indexOf(YV_PTS) > 0) { if (c.pts.att == null) c.pts.att = i; return; }
    for (var p = 0; p < YV_PARTS.length; p++) {
      if (!yvStarts_(h, YV_PARTS[p][1])) continue;
      var k = YV_PARTS[p][0];
      if (h.indexOf(YV_PTS) > 0) { if (c.pts[k] == null) c.pts[k] = i; }
      else if (h.indexOf('(') > 0) { if (c.lv[k] == null) c.lv[k] = i; }
      return;
    }
    if (yvStarts_(h, YV_TOTAL)) { if (c.total == null) c.total = i; return; }
    if (yvStarts_(h, YV_FIRST)) { if (c.first == null) c.first = i; return; }
    if (yvStarts_(h, YV_LAST)) { if (c.last == null) c.last = i; return; }
    if (yvStarts_(h, YV_CLS)) { if (c.cls == null) c.cls = i; return; }
    if (yvStarts_(h, YV_FLAG)) { if (c.flag == null) c.flag = i; return; }
    if (yvStarts_(h, YV_NOTE)) { if (c.note == null) c.note = i; return; }
  });
  return c;
}

/* weights from the settings tab: the first number next to each label */
function yvWeights_(wb) {
  var w = {}, sh = wb.getSheetByName(YV_SET);
  if (!sh) return w;
  var n = Math.min(sh.getLastRow(), 40);
  if (n < 1) return w;
  sh.getRange(1, 1, n, 2).getValues().forEach(function (r) {
    var label = String(r[0]).trim(), v = r[1];
    if (typeof v !== 'number' || !label) return;
    if (yvStarts_(label, YV_ATT) && label.indexOf('%') < 0) { if (w.att == null) w.att = v; return; }
    YV_PARTS.forEach(function (p) { if (yvStarts_(label, p[1]) && w[p[0]] == null) w[p[0]] = v; });
  });
  return w;
}

/* school email of every student on the "PE n" tabs here, by student ID */
function yvMails_(ss) {
  var tz = ss.getSpreadsheetTimeZone(), out = {};
  ss.getSheets().forEach(function (sh) {
    if (!TAB_RE.test(sh.getName())) return;
    var L = layout_(sh, tz), n = sh.getLastRow() - FIRST_ROW + 1;
    if (!L.c.mail || n < 1) return;
    var ids = sh.getRange(FIRST_ROW, L.c.id, n, 1).getValues(), mails = sh.getRange(FIRST_ROW, L.c.mail, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      var id = String(ids[i][0]).trim(), em = String(mails[i][0]).trim().toLowerCase();
      if (id && SCHOOL_RE.test(em) && !out[id]) out[id] = em;
    }
  });
  return out;
}

function yavts_(ss, link) {
  var wb;
  try { wb = SpreadsheetApp.openById(yvSheetId_(link)); }
  catch (e) { if (String(e && e.message) === 'no-yavts-sheet') throw e; throw new Error('yavts-open'); }
  var mails = yvMails_(ss), w = yvWeights_(wb), students = [], tabs = [];
  wb.getSheets().forEach(function (sh) {
    var m = sh.getName().match(YV_TAB_RE);
    if (!m) return;
    var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    if (lastCol < 1 || lastRow < 2) return;
    var v = sh.getRange(1, 1, lastRow, lastCol).getValues(), c = yvCols_(v[0]);
    if (c.id == null || c.total == null) throw new Error('yavts-header:' + sh.getName());
    tabs.push(sh.getName());
    for (var r = 1; r < v.length; r++) {
      var row = v[r], id = String(row[c.id]).trim();
      if (!id) continue;
      var x = {
        id: id, tab: m[1], first: c.first != null ? String(row[c.first]).trim() : '', last: c.last != null ? String(row[c.last]).trim() : '',
        cls: c.cls != null ? String(row[c.cls]).trim() : '', email: mails[id] || '',
        c: {}, pct: c.pct != null ? yvNum_(row[c.pct]) : null, lv: {}, pts: {},
        yavts: yvNum_(row[c.total]), flag: c.flag != null ? String(row[c.flag]).trim() : '', note: c.note != null ? String(row[c.note]).trim() : ''
      };
      if (x.first.charAt(0) === '#') x.first = '';
      YV_CODEKEY.forEach(function (k) { var j = c.codes[k]; x.c[k] = j != null ? (yvNum_(row[j]) || 0) : 0; });
      Object.keys(c.lv).forEach(function (k) { x.lv[k] = yvNum_(row[c.lv[k]]); });
      Object.keys(c.pts).forEach(function (k) { x.pts[k] = yvNum_(row[c.pts[k]]); });
      students.push(x);
    }
  });
  if (!tabs.length) throw new Error('yavts-no-tabs');
  return { ok: true, term: 't1', w: w, tabs: tabs, students: students, at: new Date().getTime() };
}
