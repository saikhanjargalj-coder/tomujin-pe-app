/* ---------- owner's full data export: Excel (to read) + JSON (full backup) ----------
   Only the owner sees the button. It reads straight from the server with the owner's own sign-in, so
   firestore.rules still decide what can be read; nothing new is opened to anyone else.
   The Excel file is written here without any outside library (a .xlsx is a zip of small XML files). */

/* --- tiny .xlsx writer (pure functions) --- */
var XL_CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function xlCrc(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = XL_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/* zip with "stored" (uncompressed) entries: files = [[name, Uint8Array]] */
function xlZip(files) {
  var parts = [], cd = [], off = 0, enc = new TextEncoder();
  function u16(v) { return [v & 255, (v >>> 8) & 255]; }
  function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  files.forEach(function (f) {
    var name = enc.encode(f[0]), data = f[1], crc = xlCrc(data);
    var common = [].concat(u16(20), u16(0), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
    var lh = new Uint8Array([].concat(u32(0x04034b50), common));
    parts.push(lh, name, data);
    cd.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(off))), name);
    off += lh.length + name.length + data.length;
  });
  var cdSize = cd.reduce(function (a, x) { return a + x.length; }, 0);
  var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(off), u16(0)));
  return new Blob(parts.concat(cd, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function xlEsc(s) {
  return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function xlCol(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
/* sheets = [{name, rows: [[cell,...],...]}]; row 0 is the bold, frozen header. Cells: number or string. */
function xlBook(sheets) {
  var enc = new TextEncoder(), X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var used = {};
  var names = sheets.map(function (s, i) {
    var n = String(s.name || ('Sheet' + (i + 1))).replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || ('Sheet' + (i + 1)), base = n, k = 2;
    while (used[n.toLowerCase()]) { var tail = ' (' + k++ + ')'; n = base.slice(0, 31 - tail.length) + tail; }
    used[n.toLowerCase()] = 1; return n;
  });
  var files = [];
  var ct = X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  sheets.forEach(function (s, i) { ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; });
  files.push(['[Content_Types].xml', ct + '</Types>']);
  files.push(['_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + RNS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
  files.push(['xl/workbook.xml', X + '<workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheets>' + names.map(function (n, i) { return '<sheet name="' + xlEsc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>']);
  files.push(['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + names.map(function (n, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + RNS + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (names.length + 1) + '" Type="' + RNS + '/styles" Target="styles.xml"/></Relationships>']);
  files.push(['xl/styles.xml', X + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
  sheets.forEach(function (s, si) {
    var rows = s.rows || [], width = [];
    rows.forEach(function (r) { r.forEach(function (v, c) { var l = v == null ? 0 : String(v).length; width[c] = Math.max(width[c] || 6, Math.min(50, l + 2)); }); });
    var out = [X, '<worksheet xmlns="', NS, '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'];
    if (width.length) out.push('<cols>' + width.map(function (w, c) { return '<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + (w || 8) + '" customWidth="1"/>'; }).join('') + '</cols>');
    out.push('<sheetData>');
    rows.forEach(function (r, ri) {
      out.push('<row r="' + (ri + 1) + '">');
      r.forEach(function (v, c) {
        if (v == null || v === '') return;
        var ref = xlCol(c) + (ri + 1), st = ri === 0 ? ' s="1"' : '';
        if (typeof v === 'number' && isFinite(v)) out.push('<c r="' + ref + '"' + st + '><v>' + v + '</v></c>');
        else out.push('<c r="' + ref + '"' + st + ' t="inlineStr"><is><t xml:space="preserve">' + xlEsc(String(v).slice(0, 32760)) + '</t></is></c>');
      });
      out.push('</row>');
    });
    out.push('</sheetData></worksheet>');
    files.push(['xl/worksheets/sheet' + (si + 1) + '.xml', out.join('')]);
  });
  return xlZip(files.map(function (f) { return [f[0], enc.encode(f[1])]; }));
}

/* --- what to export --- */
// A "kind" is the collection names of a path joined by "/": users/abc/loading/x -> "users/loading".
var EXP_LABEL = {
  'users': 'Хэрэглэгчид', 'pending': 'Бүртгүүлээгүй сурагчийн дүн',
  'users/loading': 'Бэлтгэлийн тэмдэглэл', 'users/results': 'Үнэлгээний дүн', 'users/wellbeing': 'Wellbeing үнэлгээ',
  'users/done': 'Хийсэн даалгавар', 'users/saved': 'Хадгалсан дасгал', 'users/plans': 'Сурагчийн төлөвлөгөө',
  'offers': 'Дугуйлангийн суудал', 'offers/seats': 'Дугуйлангийн бүртгэл', 'offers/seats/abs': 'Дугуйланд ирэхгүй',
  'offers/wait': 'Хүлээлгийн жагсаалт', 'offers/log': 'Дугуйлангийн тэмдэглэл', 'regs': 'Сурагчийн сонголт',
  'absreq': 'Чөлөөний хүсэлт',
  'site': 'Сайтын текст', 'classes': 'Ангиуд', 'ex': 'Дасгалын сан', 'art': 'Нийтлэл', 'lessons': 'Хичээл',
  'plans': 'Бэлтгэлийн төлөвлөгөө', 'assign': 'Даалгавар', 'clubs': 'Дугуйлан', 'teams': 'Шигшээ баг',
  'rosters': 'Багийн бүрэлдэхүүн', 'stories': 'Амжилтын түүх', 'matches': 'Тоглолт', 'podcast': 'Podcast',
  'feedback': 'Санал хүсэлт', 'fbnotes': 'Саналын тэмдэглэл', 'config': 'Тохиргоо', 'private': 'Нууц тохиргоо'
};
var EXP_SECTIONS = [
  ['people', 'Сурагчид, хэрэглэгчид (нэр, имэйл, анги)', ['users', 'pending']],
  ['training', 'Бэлтгэлийн тэмдэглэл, үнэлгээ, wellbeing', ['users/loading', 'users/results', 'users/wellbeing', 'users/done', 'users/saved', 'users/plans']],
  ['clubs', 'Дугуйлангийн бүртгэл, ирц', ['offers', 'offers/seats', 'offers/seats/abs', 'offers/wait', 'offers/log', 'regs']],
  ['absence', 'Хичээлээс чөлөө авах хүсэлт', ['absreq']],
  ['content', 'Сайтын агуулга (дасгал, нийтлэл, хичээл, анги, баг, тоглолт)', ['site', 'classes', 'ex', 'art', 'lessons', 'plans', 'assign', 'clubs', 'teams', 'rosters', 'stories', 'matches', 'podcast']],
  ['feedback', 'Санал хүсэлт', ['feedback', 'fbnotes']],
  ['settings', 'Тохиргоо (бусдад бүү өг)', ['config', 'private']]
];
var EXP_GROUP = { 'users/loading': 'loading', 'users/results': 'results', 'users/wellbeing': 'wellbeing', 'users/done': 'done', 'offers/seats/abs': 'abs' }; // rules allow these across all students
var EXP_PER_USER = { 'users/saved': 'saved', 'users/plans': 'plans' };
var EXP_PER_OFFER = { 'offers/seats': 'seats', 'offers/wait': 'wait', 'offers/log': 'log' };
var EXP_TIMEKEYS = /^(at|createdAt|updatedAt|decidedAt|seenAt|open|p1|close)$/;

function expKind(path) { return path.split('/').filter(function (x, i) { return i % 2 === 0; }).join('/'); }
function expIsTime(v) { return v && typeof v === 'object' && typeof v.toMillis === 'function'; }
function expUb(ms) { return new Date(ms + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); }
/* Firestore values -> plain JSON (times keep a marker so a later import can turn them back). */
function expPlain(v) {
  if (v == null) return null;
  if (expIsTime(v)) return { __time: new Date(v.toMillis()).toISOString() };
  if (Array.isArray(v)) return v.map(expPlain);
  if (typeof v === 'object') {
    if (typeof v.toBase64 === 'function') return { __bytes: v.toBase64() };
    if (typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 2) return { __geo: [v.latitude, v.longitude] };
    if (v.firestore && typeof v.path === 'string') return { __ref: v.path };
    var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = expPlain(v[k]); }); return o;
  }
  return v;
}
/* one Excel cell, easy to read */
function expCell(key, v) {
  if (v == null) return '';
  if (expIsTime(v)) return expUb(v.toMillis());
  if (typeof v === 'number') return EXP_TIMEKEYS.test(key) && v > 1e12 && v < 4e12 ? expUb(v) : v;
  if (typeof v === 'boolean') return v ? 'Тийм' : 'Үгүй';
  if (typeof v === 'string') {
    if (/^data:image\//.test(v)) return '[зураг · ' + Math.round(v.length * 0.75 / 1024) + ' KB, JSON нөөцөд бүтнээрээ]';
    return v.length > 32000 ? v.slice(0, 32000) + '…' : v;
  }
  if (Array.isArray(v) && v.every(function (x) { return x == null || typeof x !== 'object' || expIsTime(x); }))
    return v.map(function (x) { return expIsTime(x) ? expUb(x.toMillis()) : x; }).join(', ');
  var s = JSON.stringify(expPlain(v), function (k, x) { return typeof x === 'string' && /^data:image\//.test(x) ? '[зураг]' : x; });
  return s.length > 32000 ? s.slice(0, 32000) + '…' : s;
}
/* the student a document belongs to, from where it lives */
function expUid(kind, path) {
  var p = path.split('/');
  if (/^users\/./.test(kind)) return p[1];
  if (kind === 'regs') return p[1];
  if (kind === 'offers/seats' || kind === 'offers/seats/abs' || kind === 'offers/wait') return p[3];
  return '';
}
var EXP_PARENT = { offers: 'Дугуйлан', users: 'Хэрэглэгчийн ID', seats: 'Сурагчийн ID' };

/* Reads everything in the chosen sections. step(done, total) reports progress. */
async function expCollect(sel, step) {
  var want = {}; EXP_SECTIONS.forEach(function (s) { if (sel.indexOf(s[0]) >= 0) s[2].forEach(function (k) { want[k] = 1; }); });
  var docs = {}, errors = [], done = 0, total = 0;
  function put(list) { list.forEach(function (d) { docs[d.path] = d.data; }); }
  function tick() { done++; if (step) step(done, total); }
  async function pool(jobs, n) {
    total += jobs.length; if (step) step(done, total);
    var i = 0;
    async function worker() { while (i < jobs.length) { var j = jobs[i++]; try { await j(); } catch (e) { errors.push(j.label + ': ' + ((e && (e.code || e.message)) || 'алдаа')); } tick(); } }
    var ws = []; for (var k = 0; k < Math.min(n, jobs.length); k++) ws.push(worker()); await Promise.all(ws);
  }
  function job(label, fn) { fn.label = label; return fn; }
  // 1) students list (needed to name the rows of every other sheet) and club offers
  var users = [], offers = [];
  await pool([
    job('users', async function () { users = await db.list('users'); if (want.users) put(users); }),
    job('offers', async function () { offers = await db.list('offers'); if (want.offers) put(offers); })
  ], 2);
  var names = {}; users.forEach(function (u) { names[u.id] = u.data || {}; });
  // 2) top-level collections, settings, and the across-all-students groups
  var jobs = [];
  Object.keys(want).forEach(function (k) {
    if (k.indexOf('/') < 0 && k !== 'users' && k !== 'offers' && k !== 'config') jobs.push(job(k, async function () { put(await db.list(k)); }));
    if (EXP_GROUP[k]) jobs.push(job(k, async function () {
      var re = new RegExp('^' + k.split('/').map(function (c) { return c + '/[^/]+'; }).join('/') + '$');
      put((await db.groupList(EXP_GROUP[k])).filter(function (d) { return re.test(d.path); }));
    }));
  });
  if (want.config) ['config/roles', 'config/absence'].forEach(function (p) {
    jobs.push(job(p, async function () { var s = await db.doc(p).get(); if (s.exists) docs[p] = s.data(); }));
  });
  await pool(jobs, 8);
  // 3) things that live under each student or each club (no across-all rule for these)
  var uids = {}; users.forEach(function (u) { uids[u.id] = 1; });
  Object.keys(docs).forEach(function (p) { var m = p.match(/^users\/([^/]+)\//); if (m) uids[m[1]] = 1; });
  jobs = [];
  Object.keys(EXP_PER_USER).forEach(function (k) { if (want[k]) Object.keys(uids).forEach(function (u) { jobs.push(job(k + ' · ' + u, async function () { put(await db.list('users/' + u + '/' + EXP_PER_USER[k])); })); }); });
  Object.keys(EXP_PER_OFFER).forEach(function (k) { if (want[k]) offers.forEach(function (o) { jobs.push(job(k + ' · ' + o.id, async function () { put(await db.list('offers/' + o.id + '/' + EXP_PER_OFFER[k])); })); }); });
  await pool(jobs, 8);
  return { docs: docs, names: names, errors: errors, sel: sel };
}

function expStamp() { return expUb(Date.now()).replace(' ', '-').replace(':', ''); }
function expSave(blob, name) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function expOrder() { var o = []; EXP_SECTIONS.forEach(function (s) { s[2].forEach(function (k) { o.push(k); }); }); return o; }

function expJSON(r) {
  var paths = Object.keys(r.docs).sort(), out = {};
  paths.forEach(function (p) { out[p] = expPlain(r.docs[p]); });
  var meta = {
    app: 'Tomujin PE', exportedAt: new Date().toISOString(), by: (ME && ME.email) || '',
    sections: r.sel, count: paths.length, errors: r.errors,
    note: 'Keys are Firestore document paths. {"__time": ISO} marks a Firestore timestamp. Sign-in passwords are not included.'
  };
  return new Blob([JSON.stringify({ meta: meta, docs: out }, null, 1)], { type: 'application/json' });
}

function expXLSX(r) {
  var byKind = {};
  Object.keys(r.docs).sort().forEach(function (p) { var k = expKind(p); (byKind[k] = byKind[k] || []).push(p); });
  var order = expOrder().filter(function (k) { return byKind[k]; }).concat(Object.keys(byKind).filter(function (k) { return expOrder().indexOf(k) < 0; }).sort());
  var summary = [['Хэсэг', 'Firestore зам', 'Бичлэгийн тоо']];
  var sheets = [];
  order.forEach(function (kind) {
    var paths = byKind[kind], segs = kind.split('/');
    var parents = segs.slice(0, -1).map(function (c) { return EXP_PARENT[c] || (c + ' ID'); });
    var person = kind !== 'users' && paths.some(function (p) { return expUid(kind, p); });
    var keys = [], seen = {};
    paths.forEach(function (p) { Object.keys(r.docs[p] || {}).forEach(function (k) { if (!seen[k]) { seen[k] = 1; keys.push(k); } }); });
    var club = segs[0] === 'offers' && typeof crName === 'function';
    var head = parents.concat(['ID']).concat(club ? ['Дугуйлангийн нэр'] : []).concat(person ? ['Нэр', 'Имэйл', 'Анги'] : []).concat(keys).concat(['Зам']);
    if (kind === 'users') head.splice(head.length - 1, 0, 'Анги (нэр)');
    var rows = [head];
    paths.forEach(function (p) {
      var bits = p.split('/'), d = r.docs[p] || {}, row = [];
      for (var i = 0; i < parents.length; i++) row.push(bits[i * 2 + 1]);
      row.push(bits[bits.length - 1]);
      if (club) row.push(crName(bits[1]));
      if (person) { var u = r.names[expUid(kind, p)] || {}; row.push(u.name || '', u.email || '', typeof className === 'function' ? (className(u.classId) || u.classId || '') : (u.classId || '')); }
      keys.forEach(function (k) { row.push(expCell(k, d[k])); });
      if (kind === 'users') row.push(typeof className === 'function' ? className(d.classId) : '');
      row.push(p);
      rows.push(row);
    });
    var label = EXP_LABEL[kind] || kind;
    sheets.push({ name: label, rows: rows });
    summary.push([label, kind.split('/').join('/…/'), paths.length]);
  });
  summary.push([], ['Нийт', '', Object.keys(r.docs).length], ['Татсан', expUb(Date.now()) + ' (Улаанбаатарын цаг)'], ['Татсан хүн', (ME && ME.email) || '']);
  if (r.errors.length) { summary.push([], ['Уншиж чадаагүй хэсэг']); r.errors.forEach(function (e) { summary.push([e]); }); }
  summary.push([], ['Зураг Excel-д багтдаггүй тул JSON нөөцөд бүтнээрээ хадгалагдана. Нэвтрэх нууц үг энд орохгүй.']);
  return xlBook([{ name: 'Тойм', rows: summary }].concat(sheets));
}

var EXPBUSY = false;
function exportBox() {
  var box = h('div', { cls: 'box' }, [h('h3', { text: 'Бүх өгөгдлийг татах (зөвхөн танд харагдана)' }),
    h('p', { cls: 'muted', style: 'font-size:13px', text: 'Firebase дээр хадгалагдсан өгөгдлийг таны компьютер руу татна. Excel файлыг уншиж, шүүхэд ашиглана. JSON бол бүтэн нөөц: зургууд ч бүтнээрээ орох тул өөр систем рүү шилжүүлэхэд ашиглана.' })]);
  var opts = EXP_SECTIONS.map(function (s) { return [s[0], s[1]]; });
  var checks = fChecks('exp-sec', 'Аль хэсгийг татах вэ?', opts, opts.map(function (o) { return o[0]; }));
  box.appendChild(checks);
  box.appendChild(h('p', { cls: 'muted', style: 'font-size:13px', text: 'Бусдад (жишээ нь сургуулийн сайтын хөгжүүлэгчид) өгөхдөө зөвхөн хэрэгтэй хэсгийг нь сонгоорой. Файлд сурагчдын хувийн мэдээлэл ордог.' }));
  var st = h('p', { cls: 'status', role: 'status' });
  function chosen() { return [].slice.call(checks.querySelectorAll('input[type=checkbox]')).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); }
  function run(kind) {
    if (EXPBUSY) return;
    var sel = chosen();
    if (!sel.length) { st.className = 'status err'; st.textContent = 'Дор хаяж нэг хэсэг сонгоно уу.'; return; }
    if (!db.list) { st.className = 'status err'; st.textContent = 'Энэ хувилбар татах боломжгүй байна. Хуудсаа дахин ачаална уу.'; return; }
    EXPBUSY = true; bx.disabled = bj.disabled = true; st.className = 'status'; st.textContent = 'Уншиж байна…';
    expCollect(sel, function (d, t) { st.textContent = 'Уншиж байна… ' + d + ' / ' + t; }).then(function (r) {
      var n = Object.keys(r.docs).length, name = 'tomujin-pe-data-' + expStamp();
      if (kind === 'xlsx') expSave(expXLSX(r), name + '.xlsx'); else expSave(expJSON(r), name + '.json');
      st.className = r.errors.length ? 'status err' : 'status';
      st.textContent = '✓ ' + n + ' бичлэг татагдлаа.' + (r.errors.length ? ' ' + r.errors.length + ' хэсгийг уншиж чадсангүй (файлын "Тойм" / meta.errors-д жагсаасан).' : '');
    }, function (e) {
      st.className = 'status err'; st.textContent = 'Татаж чадсангүй: ' + ((e && (e.code || e.message)) || 'сүлжээгээ шалгаад дахин оролдоно уу.');
    }).then(function () { EXPBUSY = false; bx.disabled = bj.disabled = false; });
  }
  var bx = h('button', { type: 'button', cls: 'btn gold small', text: '⬇ Excel', onclick: function () { run('xlsx'); } });
  var bj = h('button', { type: 'button', cls: 'btn line small', text: '⬇ JSON (бүтэн нөөц)', onclick: function () { run('json'); } });
  box.appendChild(h('div', { cls: 'editrow' }, [bx, bj, st]));
  box.appendChild(h('p', { cls: 'muted', style: 'font-size:13px', text: 'Нэвтрэх нууц үгнүүд файлд орохгүй, тэдгээрийг Firebase өөрөө хамгаалдаг.' }));
  return box;
}
if (typeof module !== 'undefined') module.exports = { xlBook: xlBook, xlCrc: xlCrc, xlCol: xlCol, xlEsc: xlEsc, expKind: expKind, expPlain: expPlain, expCell: expCell, expUid: expUid, expXLSX: expXLSX, expJSON: expJSON };
