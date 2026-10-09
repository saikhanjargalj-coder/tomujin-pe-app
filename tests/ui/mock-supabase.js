// In-memory stand-in for @supabase/supabase-js used only by the browser smoke test.
// It does NOT enforce RLS (that is tested against real Postgres in tests/rls_test.sql);
// it exists to exercise every screen of the UI and catch runtime errors.
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const ROLE = window.__MOCK_ROLE || "none";
const db = {
  staff: [{ email: "saikhanjargal.j@tomujin.edu.mn", full_name: "Jack", role: "admin", invite_code: "JACK01", created_at: now() }],
  profiles: [], classes: [], students: [], fitness_results: [], lessons: [], class_lessons: [], training_logs: [], grade_entries: [],
  assessment_tests: [
    ["sprint_50m", "50 м гүйлт", "50 m sprint", "s", false], ["push_ups", "Суниалт", "Push-ups", "reps", true], ["long_jump", "Үсрэлт", "Long jump", "cm", true],
  ].map(([code, name_mn, name_en, unit, higher_is_better], i) => ({ code, name_mn, name_en, unit, higher_is_better, sort_order: i, active: true })),
};
window.__db = db;
const fk = { classes: "class_id", students: "student_id", lessons: "lesson_id" };
const weights = { attendance: .2, performance: .3, showcase: .15, attitude: .15, preparation: .1, load_awareness: .1 };
const defaults = {
  classes: () => ({ academic_year: "2026-27" }), students: () => ({ status: "active", last_name: "", access_code: Math.random().toString(16).slice(2, 8).toUpperCase() }),
  staff: () => ({ invite_code: "NEW001" }),
  fitness_results: () => ({ academic_year: "2026-27" }), lessons: () => ({ duration_min: 80, updated_at: now() }),
  grade_entries: () => ({ academic_year: "2026-27", bonus: 0 }), training_logs: () => ({}),
};
function computed(t, r) {
  if (t === "grade_entries") r.core_score = Math.round(Object.entries(weights).reduce((s, [k, w]) => s + (Number(r[k]) || 0) * w, 0) * 10) / 10;
  if (t === "training_logs") r.session_load = r.duration_min * r.rpe;
  return r;
}
function splitTop(s) { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && !d) { out.push(cur.trim()); cur = ""; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function shape(table, row, sel) {
  const out = { ...row };
  for (const part of splitTop(sel)) {
    const m = part.match(/^(\w+)(!inner)?\((.*)\)$/);
    if (!m) continue;
    const [, rel, , sub] = m;
    if (row[fk[rel]] !== undefined) {
      const target = db[rel].find((x) => (x.id) === row[fk[rel]]);
      out[rel] = target ? shape(rel, target, sub) : null;
    } else {
      const back = fk[table];
      const kids = db[rel].filter((x) => x[back] === row.id);
      out[rel] = sub.trim() === "count" ? [{ count: kids.length }] : kids.map((k) => shape(rel, k, sub));
    }
  }
  return out;
}
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; this.sel = "*"; }
  select(sel = "*", opts = {}) { if (this.op === "select") this.op = "select"; this.sel = sel; this.head = opts.head; this.wantCount = !!opts.count; this.returning = true; return this; }
  eq(c, v) { this.f.push((r) => get(r, c) === v); return this; }
  in(c, vs) { this.f.push((r) => vs.includes(get(r, c))); return this; }
  gte(c, v) { this.f.push((r) => get(r, c) >= v); return this; }
  order() { return this; } limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; } single() { this.one = "single"; return this; }
  insert(rows) { this.op = "insert"; this.rows = [].concat(rows); return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  upsert(rows, o) { this.op = "upsert"; this.rows = [].concat(rows); this.conf = o.onConflict.split(","); return this; }
  delete() { this.op = "delete"; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const T = db[this.t];
    if (!T) return { data: null, error: { message: "no table " + this.t } };
    let changed = [];
    if (this.op === "insert") {
      for (const r of this.rows) {
        if (this.t === "students" && r.email && T.some((x) => x.email === r.email)) return { data: null, error: { message: "duplicate key value" } };
        const row = computed(this.t, { id: uid(), created_at: now(), ...(defaults[this.t]?.() || {}), ...r });
        T.push(row); changed.push(row);
      }
    } else if (this.op === "upsert") {
      for (const r of this.rows) {
        let ex = T.find((x) => this.conf.every((c) => x[c] === r[c]));
        if (ex) Object.assign(ex, r, computed(this.t, { ...ex, ...r })); else { ex = computed(this.t, { id: uid(), created_at: now(), ...(defaults[this.t]?.() || {}), ...r }); T.push(ex); }
        changed.push(ex);
      }
    } else if (this.op === "update") {
      for (const r of T.filter((x) => this.f.every((f) => f(x)))) { Object.assign(r, this.patch); computed(this.t, r); changed.push(r); }
    } else if (this.op === "delete") {
      const keep = T.filter((x) => !this.f.every((f) => f(x))); changed = T.filter((x) => !keep.includes(x)); db[this.t] = keep;
    } else {
      let rows = T.map((r) => shape(this.t, r, this.sel));
      const inner = /students!inner/.test(this.sel);
      rows = rows.filter((r) => this.f.every((f) => f(r))).filter((r) => !inner || r.students);
      if (this.lim) rows = rows.slice(0, this.lim);
      if (this.head) return { data: null, count: rows.length, error: null };
      if (this.one) return rows.length || this.one === "maybe" ? { data: rows[0] ?? null, error: null } : { data: null, error: { message: "no rows" } };
      return { data: rows, error: null };
    }
    if (!this.returning) return { data: null, error: null };
    const data = changed.map((r) => shape(this.t, r, this.sel));
    return { data: this.one ? data[0] : data, error: null };
  }
}
function get(r, c) { return c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), r); }

const users = {
  admin: { id: "u-admin", email: "saikhanjargal.j@tomujin.edu.mn" },
  student: { id: "u-stu", email: "anu@tomujin.edu.mn" },
};
if (ROLE === "none") {
  const c = { id: uid(), name: "11B", grade: 11, academic_year: "2026-27", created_at: now() };
  db.classes.push(c);
  db.students.push({ id: uid(), first_name: "Anu", last_name: "Bat", email: "anu@tomujin.edu.mn", class_id: c.id, status: "active", access_code: "ABC123", created_at: now() });
}
const passwords = {};
if (ROLE === "admin") db.profiles.push({ id: "u-admin", email: users.admin.email, role: "admin", student_id: null });
if (ROLE === "student") {
  const c = { id: uid(), name: "11B", grade: 11, academic_year: "2026-27", created_at: now() };
  const s = { id: uid(), first_name: "Anu", last_name: "Bat", email: users.student.email, class_id: c.id, status: "active", created_at: now() };
  const l = { id: uid(), title: "Sprint basics", objectives: "Хурдны техник", equipment: "Ус, пүүз", duration_min: 80, created_at: now() };
  db.classes.push(c); db.students.push(s); db.lessons.push(l);
  db.class_lessons.push({ id: uid(), class_id: c.id, lesson_id: l.id, scheduled_date: "2026-10-10", notes: "Hureelend 10:50" });
  db.fitness_results.push({ id: uid(), student_id: s.id, test_code: "push_ups", period: "baseline", academic_year: "2026-27", value: 20 },
    { id: uid(), student_id: s.id, test_code: "push_ups", period: "mid", academic_year: "2026-27", value: 26 });
  db.profiles.push({ id: "u-stu", email: users.student.email, role: "student", student_id: s.id });
}
let session = users[ROLE] ? { user: users[ROLE], access_token: "x" } : null;
window.__calls = [];
export function createClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => { session = null; return { error: null }; },
      signUp: async ({ email, password, options }) => {
        if (passwords[email]) return { data: {}, error: { message: "User already registered" } };
        const code = options?.data?.access_code;
        const st = db.staff.find((x) => x.email === email), stu = db.students.find((x) => x.email === email && x.status === "active");
        if (!(st && st.invite_code === code) && !(stu && stu.access_code === code)) return { data: {}, error: { message: "Database error saving new user" } };
        const user = { id: uid(), email }; passwords[email] = { password, user };
        db.profiles.push({ id: user.id, email, role: st ? st.role : "student", student_id: st ? null : stu.id });
        session = { user, access_token: "x" }; return { data: { session, user }, error: null };
      },
      signInWithPassword: async ({ email, password }) => {
        const r = passwords[email];
        if (!r || r.password !== password) return { data: {}, error: { message: "Invalid login credentials" } };
        session = { user: r.user, access_token: "x" }; return { data: { session }, error: null };
      },
      updateUser: async ({ password }) => { if (session) passwords[session.user.email] = { password, user: session.user }; return { data: {}, error: null }; },
    },
    from: (t) => new Q(t),
    rpc: (name, args) => ({ then: (res) => {
      const code = "NEWCOD";
      if (name === "reset_student_login") { const s = db.students.find((x) => x.id === args.p_student); s.access_code = code; db.profiles = db.profiles.filter((p) => p.student_id !== s.id); }
      if (name === "reset_staff_login") { db.staff.find((x) => x.email === args.p_email).invite_code = code; db.profiles = db.profiles.filter((p) => p.email !== args.p_email); }
      return Promise.resolve({ data: code, error: null }).then(res);
    } }),
  };
}
