/* Tomujin PE <-> "LS Learning Data | TAS 2026-2027" PE attendance bridge (Google Apps Script).
 *
 * Install once, inside the sheet: Extensions > Apps Script, paste this file, Save,
 * Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone, Deploy, Authorize.
 * Copy the web app URL into the site: the class attendance page > Settings.
 *
 * Who may use it: every request carries the person's Firebase sign-in token; this script asks Google
 * to check it before reading or writing anything.
 * - The owner's verified school account: read the PE tabs, write attendance, change the settings.
 * - A verified @tomujin.edu.mn student, only while the owner has switched "tell in advance" on:
 *   see their own coming PE lessons and mark ONE of them "sick" or "excused" in their OWN row, only in an
 *   empty cell, only from today (until the cut-off time) up to the set number of days ahead; and take that
 *   back. They never see anyone else's row and never change a mark the teacher made.
 * What it returns: student ID, first and last name, grade, class (10A...), house, school email, the
 * attendance marks and the week labels of row 1 (P1W8...). It never returns phone numbers, photos, parents' data or anything from other tabs.
 * What it writes: attendance cells on "PE n" tabs, found by student ID (or the student's own email) and
 * by the date in row 3, plus a short note on cells a student filled from the site. Only the school's own codes are accepted.
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
var STUDENT_ACTIONS = { me: 1, away: 1, unaway: 1 };
// the note left on a cell a student filled from the site (the teacher sees it in the sheet)
var NOTE_TAG = 'Tomujin PE: ';
var NOTE_TEXT = '\u0441\u0443\u0440\u0430\u0433\u0447 \u0441\u0430\u0439\u0442\u0430\u0430\u0440 \u0443\u0440\u044c\u0434\u0447\u0438\u043b\u0430\u043d \u043c\u044d\u0434\u044d\u0433\u0434\u0441\u044d\u043d';
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
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'tomujin-pe-attendance', v: 2 })).setMimeType(ContentService.MimeType.JSON);
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
// a cell a student filled from the site: our note and still "excused" or "sick" (a teacher's change wins)
function isMine_(v, note) { return String(note || '').indexOf(NOTE_TAG) === 0 && (v === CODES[3] || v === CODES[4]); }

function read_(sh, tz) {
  var L = layout_(sh, tz), n = sh.getLastRow() - FIRST_ROW + 1;
  var students = [];
  if (n > 0) {
    var rng = sh.getRange(FIRST_ROW, 1, n, L.lastCol), v = rng.getValues(), notes = rng.getNotes();
    v.forEach(function (r, ri) {
      var x = rowInfo_(L, r, sh);
      if (!x) return;
      var m = {}, req = {};
      L.dates.forEach(function (d) {
        var s = String(r[d.col - 1]).trim();
        if (s) m[d.iso] = s;
        if (s && isMine_(s, notes[ri][d.col - 1])) req[d.iso] = 1;
      });
      x.m = m; x.req = req;
      students.push(x);
    });
  }
  return { ok: true, tab: sh.getName(), dates: L.dates.map(function (d) { return d.iso; }), odd: L.odd, weeks: L.weeks, students: students, codes: CODES };
}

/* One call for the teacher home: per class how many students, how many marks, present share, last
   lesson day, the students absent (T) two or more times in the last 28 days, and the coming lessons
   students said in advance they will miss. No other personal data. */
function summary_(ss) {
  var tz = ss.getSpreadsheetTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var from = addDays_(today, -28), out = [], watch = [], weeks = {}, away = [];
  ss.getSheets().forEach(function (sh) {
    if (!TAB_RE.test(sh.getName())) return;
    var r = read_(sh, tz), by = {};
    Object.keys(r.weeks || {}).forEach(function (d) { weeks[d] = r.weeks[d]; });
    r.students.forEach(function (x) {
      var k = x.cls || x.grade || '?', s = by[k] || (by[k] = { cls: k, n: 0, present: 0, marked: 0, absent: 0, excused: 0, sick: 0, last: '', today: 0 });
      s.n++; var a4 = 0;
      Object.keys(x.m).forEach(function (d) {
        if (d > today) return;
        // a student's own advance mark is not the teacher taking attendance: it does not move "last lesson" or "today"
        var v = x.m[d]; s.marked++; if (!x.req[d]) { if (d > s.last) s.last = d; if (d === today) s.today++; }
        if (v === CODES[0] || v === CODES[1]) s.present++; else if (v === CODES[2]) { s.absent++; if (d >= from) a4++; }
        else if (v === CODES[3]) s.excused++; else if (v === CODES[4]) s.sick++;
      });
      if (a4 >= 2) watch.push({ tab: r.tab, id: x.id, first: x.first, last: x.last, cls: k, absent: a4 });
      Object.keys(x.req).forEach(function (d) { if (d >= today) away.push({ tab: r.tab, id: x.id, first: x.first, last: x.last, cls: k, date: d, code: x.m[d] }); });
    });
    Object.keys(by).sort().forEach(function (k) { var s = by[k]; s.tab = r.tab; s.pct = s.marked ? Math.round(s.present / s.marked * 100) : null; out.push(s); });
  });
  away.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  return { ok: true, today: today, week: weeks[today] || '', weeks: weeks, classes: out, watch: watch, away: away, absconf: absConf_() };
}

/* marks: [{id, code}] for one date. code '' clears the cell. Returns what was written.
   When the teacher writes over a cell a student filled from the site, the student's note goes too:
   from then on it is the teacher's mark and the student cannot take it back. */
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
    done.push({ row: FIRST_ROW + i, id: ids[i], code: code });
  });
  done.forEach(function (d) {
    var cell = sh.getRange(d.row, col);
    if (String(cell.getNote() || '').indexOf(NOTE_TAG) === 0) cell.setNote('');
    cell.setValue(d.code);
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
  if (q.action === 'me') return meOut_(findMe_(ss, tz, email), conf, tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.date))) throw new Error('bad-date');
  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    var me = findMe_(ss, tz, email), day = myDays_(me, conf, tz).filter(function (d) { return d.date === q.date; })[0];
    if (!day) throw new Error('not-lesson-day');
    if (!day.open) throw new Error('too-late');
    var cell = me.sh.getRange(me.row, day.col);
    if (q.action === 'away') {
      var code = q.kind === 'sick' ? CODES[4] : q.kind === 'leave' ? CODES[3] : '';
      if (!code) throw new Error('bad-code');
      if (day.code && !day.mine) throw new Error('already-marked');
      cell.setValue(code);
      cell.setNote(NOTE_TAG + NOTE_TEXT + ' (' + (code === CODES[4] ? '\u04e8\u0432\u0447\u0442\u044d\u0439' : '\u0427\u04e9\u043b\u04e9\u04e9\u0442\u044d\u0439') + ') \u00b7 ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'));
      SpreadsheetApp.flush();
      return { ok: true, date: day.date, code: code };
    }
    if (!day.mine) throw new Error('not-yours');
    cell.setValue('');
    cell.setNote('');
    SpreadsheetApp.flush();
    return { ok: true, date: day.date, code: '' };
  } finally { lock.releaseLock(); }
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
      var rng = sh.getRange(FIRST_ROW, 1, n, L.lastCol), vals = rng.getValues(), x = rowInfo_(L, vals[i], sh);
      if (!x) continue;
      return { sh: sh, L: L, i: i, row: FIRST_ROW + i, vals: vals, notes: rng.getNotes(), x: x, key: x.cls || x.grade };
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

/* The student's PE lessons from today up to "ahead" days: what is in the cell, whether they filled it
   from the site, and whether it can still be changed (today only until the cut-off time). */
function myDays_(me, conf, tz) {
  var now = new Date(), today = Utilities.formatDate(now, tz, 'yyyy-MM-dd'), hm = Utilities.formatDate(now, tz, 'HH:mm');
  var wd = lessonWeekdays_(me, today), any = !Object.keys(wd).length, last = addDays_(today, conf.ahead), out = [];
  me.L.dates.forEach(function (d) {
    if (d.iso < today || d.iso > last) return;
    if (!any && !wd[weekday_(d.iso)]) return;
    var v = String(me.vals[me.i][d.col - 1]).trim(), note = me.notes[me.i][d.col - 1];
    out.push({ date: d.iso, col: d.col, code: v, mine: isMine_(v, note), open: d.iso > today || hm < conf.cutoff });
  });
  return out;
}

function meOut_(me, conf, tz) {
  return {
    ok: true, today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), cutoff: conf.cutoff, ahead: conf.ahead,
    me: { first: me.x.first, last: me.x.last, cls: me.key, tab: me.sh.getName() },
    days: myDays_(me, conf, tz).map(function (d) { return { date: d.date, code: d.code, mine: d.mine, open: d.open }; })
  };
}
