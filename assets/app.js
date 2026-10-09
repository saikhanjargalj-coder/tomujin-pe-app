// Tomujin PE — single-page app (no build step).
// Security is enforced by Supabase Row Level Security (see supabase/migrations).
// The UI only hides what a user cannot do anyway.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const C = window.TOMUJIN_CONFIG || {};
const YEAR = C.ACADEMIC_YEAR || "2026-27";
const DOMAIN = (C.SCHOOL_DOMAIN || "tomujin.edu.mn").toLowerCase();
const app = document.getElementById("app");

const PERIODS = [["baseline", "Эхний (Baseline)"], ["mid", "Дунд"], ["final", "Эцсийн"]];
const TERMS = ["S1", "S2", "S3", "S4"];
const GRADE_PARTS = [
  ["attendance", "Ирц", 20], ["performance", "Тест/гүйцэтгэл", 30], ["showcase", "Showcase", 15],
  ["attitude", "Хандлага/зан төлөв", 15], ["preparation", "Бэлтгэл (хувцас, мат)", 10], ["load_awareness", "Ачааллын мэдлэг", 10],
];
const RPE = ["", "1 · Маш хөнгөн", "2 · Хөнгөн", "3 · Дунд зэрэг", "4 · Бага зэрэг хүнд", "5 · Хүнд",
  "6 · Хүнд+", "7 · Маш хүнд", "8 · Маш хүнд+", "9 · Бараг хамгийн хүнд", "10 · Хамгийн хүнд"];
const FEEL = ["", "1 · Муу", "2 · Ядарсан", "3 · Хэвийн", "4 · Сайн", "5 · Маш сайн"];

// ---------------------------------------------------------------- helpers
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const fullName = (s) => s ? `${s.last_name ? s.last_name + " " : ""}${s.first_name}` : "";
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("mn-MN") : "";
const today = () => new Date().toISOString().slice(0, 10);
let toastTimer;
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast show" + (err ? " err" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = "toast"), err ? 6000 : 2600);
}
async function must(promise) {
  const { data, error, count } = await promise;
  if (error) throw error;
  return count !== undefined && count !== null && data === null ? count : data;
}
function friendlyError(e) {
  const m = String(e?.message || e || "");
  if (/row-level security|permission denied/i.test(m)) return "Энэ үйлдлийг хийх эрх танд алга.";
  if (/duplicate key/i.test(m)) return "Ийм бичлэг аль хэдийн байна.";
  if (/check constraint/i.test(m)) return "Оруулсан утга буруу байна (email нь @" + DOMAIN + " байх ёстой г.м.).";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Сүлжээний алдаа. Интернетээ шалгаад дахин оролдоно уу.";
  return m || "Алдаа гарлаа.";
}
function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === "string" ? v.trim() : v;
  return o;
}
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs || "") };
}
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
function download(name, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function parseRoster(text) {
  const rows = [], errors = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(line.includes("\t") ? "\t" : ",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (i === 0 && /first|нэр|name/i.test(cells[0])) return; // header
    const [first_name, last_name = "", email = "", student_code = "", gender = ""] = cells;
    if (!first_name) { errors.push(`${i + 1}-р мөр: нэр хоосон`); return; }
    const em = email.toLowerCase();
    if (em && !em.endsWith("@" + DOMAIN)) { errors.push(`${i + 1}-р мөр: ${email} нь @${DOMAIN} биш`); return; }
    const g = { m: "M", f: "F", "эр": "M", "эм": "F" }[gender.toLowerCase()] || (["M", "F", "Other"].includes(gender) ? gender : null);
    rows.push({ first_name, last_name, email: em || null, student_code: student_code || null, gender: g });
  });
  return { rows, errors };
}
// Change between two results, signed so that positive = improvement.
export function improvement(base, later, higherIsBetter) {
  if (base === null || base === undefined || later === null || later === undefined) return null;
  const d = Number(later) - Number(base);
  return higherIsBetter ? d : -d;
}
export function coreScore(g) {
  return Math.round(GRADE_PARTS.reduce((s, [k, , w]) => s + (Number(g[k]) || 0) * w / 100, 0) * 10) / 10;
}

// ---------------------------------------------------------------- state
let sb = null, session = null, profile = null, tests = [];
const isStaff = () => profile && (profile.role === "admin" || profile.role === "teacher");
const isAdmin = () => profile && profile.role === "admin";

// ---------------------------------------------------------------- boot
async function boot() {
  if (!C.SUPABASE_URL || !C.SUPABASE_KEY) {
    app.innerHTML = `<div class="auth"><div class="hero"><div class="tag">#JUSTSHOWUP</div><h1>Тохиргоо дутуу</h1>
      <p>assets/config.js файлд SUPABASE_URL болон SUPABASE_KEY-г оруулна уу. README.md-д алхам бүрийг тайлбарласан.</p><div></div></div><div class="panel"></div></div>`;
    return;
  }
  // Auth errors come back in the URL (e.g. unregistered email rejected by the database).
  const urlErr = new URLSearchParams(location.hash.replace(/^#/, "") + "&" + location.search.replace(/^\?/, "")).get("error_description");
  sb = createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (/access_token|error_description|^#?$/.test(location.hash) || /error|code=/.test(location.search)) {
    history.replaceState(null, "", location.pathname + "#/");
  }
  sb.auth.onAuthStateChange((event, s) => {
    const changed = (s?.user?.id || null) !== (session?.user?.id || null);
    session = s;
    // Defer: Supabase must not be called from inside this callback.
    if (changed || event === "SIGNED_OUT") { profile = null; setTimeout(render, 0); }
  });
  window.addEventListener("hashchange", render);
  render(urlErr ? loginErrorText(urlErr) : null);
}
function loginErrorText(desc) {
  if (/Database error saving new user|not registered|Only @/i.test(desc))
    return `Энэ email Tomujin PE-д бүртгэлгүй байна. Зөвхөн @${DOMAIN} хаяг, мөн багшийн бүртгэсэн хаяг нэвтэрнэ. PE багшдаа хандана уу.`;
  if (/expired|invalid/i.test(desc)) return "Нэвтрэх линкний хугацаа дууссан байна. Шинэ линк авна уу.";
  return desc;
}

// ---------------------------------------------------------------- render
async function render(loginMsg = null) {
  if (typeof loginMsg !== "string") loginMsg = null;
  try {
    if (!session) return renderLogin(loginMsg);
    if (!profile) {
      profile = await must(sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
      if (!profile) return renderNoAccess();
      tests = await must(sb.from("assessment_tests").select("*").eq("active", true).order("sort_order"));
    }
    const { parts, params } = parseHash();
    if (parts[0] === "password") return passwordView();
    if (!isStaff()) return await studentHome(params);
    const [section, id] = parts;
    const views = { "": dashboard, classes: id ? classDetail : classesList, students: studentReport, assessment: assessmentEntry,
      grades: gradesEntry, lessons: id ? lessonEditor : lessonsList, logs: logsView, staff: staffView };
    const view = views[section || ""];
    if (!view) return go("#/");
    await view(id, params);
  } catch (e) {
    console.error(e);
    shell(`<div class="card"><h2>Алдаа гарлаа</h2><p class="muted">${esc(friendlyError(e))}</p>
      <button class="btn" onclick="location.reload()">Дахин ачаалах</button></div>`);
  }
}

function shell(content, active = "") {
  const items = isStaff()
    ? [["", "Самбар"], ["classes", "Ангиуд"], ["assessment", "Фитнес тест"], ["grades", "Үнэлгээ"], ["lessons", "Хичээлийн сан"], ["logs", "Дасгалын бүртгэл"]]
        .concat(isAdmin() ? [["staff", "Багш нар"]] : []).concat([["password", "Нууц үг солих"]])
    : [["", "Миний хуудас"], ["password", "Нууц үг солих"]];
  app.innerHTML = `<div class="layout">
    <aside class="side">
      <div class="brand"><div class="mark">T</div><div><strong>Tomujin PE</strong><small>#JUSTSHOWUP</small></div></div>
      <nav class="nav">${items.map(([h, l]) => `<a href="#/${h}" class="${active === h ? "on" : ""}">${l}</a>`).join("")}</nav>
      <div class="who"><span>${esc(profile?.email || "")}</span><button id="signout">Гарах</button></div>
    </aside>
    <main class="main">${content}</main></div>`;
  $("#signout").onclick = async () => { await sb.auth.signOut(); session = null; profile = null; go("#/"); };
}

// ---------------------------------------------------------------- auth screens
function renderLogin(msg, mode = "login") {
  const isReg = mode === "register";
  app.innerHTML = `<div class="auth">
    <section class="hero"><div class="tag">TOMUJIN ALTERNATIVE SCHOOL</div>
      <div><h1>Just show up<br>for yourself.</h1><p>Биеийн тамирын хичээл, фитнес тест, дасгалын бүртгэл, хувийн ахиц — нэг дор.</p></div>
      <div class="tag">#JUSTSHOWUP</div></section>
    <section class="panel"><div class="box">
      <div class="tabs"><a href="#" data-mode="login" class="${isReg ? "" : "on"}">Нэвтрэх</a><a href="#" data-mode="register" class="${isReg ? "on" : ""}">Анх удаа бүртгүүлэх</a></div>
      <div><h1 style="font-size:26px">${isReg ? "Бүртгүүлэх" : "Нэвтрэх"}</h1><p class="sub">${isReg ? "PE багшаас авсан 6 оронтой кодоо ашиглана." : "Сургуулийн @" + esc(DOMAIN) + " хаяг, нууц үгээрээ."}</p></div>
      ${msg ? `<div class="msg err">${esc(msg)}</div>` : ""}
      <form id="authform" class="form">
        <label class="f">Сургуулийн email<input name="email" type="email" required placeholder="нэр@${esc(DOMAIN)}" autocomplete="email"></label>
        ${isReg ? `<label class="f">Бүртгэлийн код (багшаас)<input name="code" required minlength="6" maxlength="6" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em"></label>` : ""}
        <label class="f">${isReg ? "Шинэ нууц үг (8+ тэмдэгт)" : "Нууц үг"}<input name="password" type="password" required minlength="${isReg ? 8 : 1}" autocomplete="${isReg ? "new-password" : "current-password"}"></label>
        ${isReg ? `<label class="f">Нууц үгээ давтах<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>` : ""}
        <button class="btn primary" style="justify-content:center;padding:12px">${isReg ? "Бүртгүүлэх" : "Нэвтрэх"}</button>
      </form>
      <div id="authmsg"></div>
      <p class="muted" style="font-size:12px">${isReg ? "Код нэг л удаа хэрэгтэй. Дараагийн удаа email, нууц үгээрээ нэвтэрнэ." : "Нууц үгээ мартсан бол PE багшдаа хандаж шинэ код авна."}</p>
    </div></section></div>`;
  $$("[data-mode]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); renderLogin(null, a.dataset.mode); }));
  const out = $("#authmsg");
  const fail = (t) => (out.innerHTML = `<div class="msg err">${esc(t)}</div>`);
  $("#authform").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const email = f.email.toLowerCase();
    if (!email.endsWith("@" + DOMAIN)) return fail(`Зөвхөн @${DOMAIN} хаяг ашиглана.`);
    if (isReg && f.password !== f.password2) return fail("Нууц үг хоорондоо таарахгүй байна.");
    const btn = e.target.querySelector("button"); btn.disabled = true; out.innerHTML = "";
    const { data, error } = isReg
      ? await sb.auth.signUp({ email, password: f.password, options: { data: { access_code: f.code.toUpperCase().trim() } } })
      : await sb.auth.signInWithPassword({ email, password: f.password });
    btn.disabled = false;
    if (error) return fail(authErrorText(error.message, isReg));
    if (isReg && !data.session) return (out.innerHTML = `<div class="msg ok">Бүртгэл үүслээ. Email-ээ баталгаажуулаад "Нэвтрэх" хэсгээр орно уу.</div>`);
    session = data.session; profile = null; go("#/");
  });
}
function authErrorText(m, isReg) {
  if (/Invalid login credentials/i.test(m)) return "Email эсвэл нууц үг буруу байна. Анх удаа бол \"Анх удаа бүртгүүлэх\" хэсгийг ашиглана.";
  if (/Email not confirmed/i.test(m)) return "Email баталгаажаагүй байна. Багшдаа хандана уу.";
  if (/already registered|already been registered|exists/i.test(m)) return "Энэ email аль хэдийн бүртгэлтэй. \"Нэвтрэх\" хэсгээр орно уу. Нууц үгээ мартсан бол багшаас шинэ код авна.";
  if (/Database error|not registered|Invalid registration code/i.test(m)) return "Email бүртгэлгүй эсвэл код буруу байна. Кодоо PE багшаасаа шалгана уу.";
  if (/Password should|weak/i.test(m)) return "Нууц үг хэт сул байна. Дор хаяж 8 тэмдэгт, үсэг тоо холино уу.";
  if (/rate limit|too many/i.test(m)) return "Хэт олон оролдлого хийлээ. Хэдэн минут хүлээгээд дахин оролдоно уу.";
  return isReg ? "Бүртгүүлэхэд алдаа гарлаа: " + m : m;
}
function renderNoAccess() {
  app.innerHTML = `<div class="auth"><section class="hero"><div class="tag">#JUSTSHOWUP</div><h1>Эрх тохируулаагүй</h1><div></div></section>
    <section class="panel"><div class="box"><p>${esc(session.user.email)} хаягаар нэвтэрсэн боловч энэ хаяг одоогоор ямар нэг анги эсвэл багшийн бүртгэлтэй холбогдоогүй байна.</p>
    <p class="muted">PE багшдаа хандаж бүртгүүлнэ үү. Бүртгэсний дараа дахин нэвтрэхэд хангалттай.</p>
    <button class="btn primary" id="out">Гарах</button></div></section></div>`;
  $("#out").onclick = async () => { await sb.auth.signOut(); };
}

// ---------------------------------------------------------------- shared data
async function loadClasses() {
  return must(sb.from("classes").select("*").eq("academic_year", YEAR).order("grade").order("name"));
}
function classOptions(classes, selected) {
  return classes.map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`).join("");
}
async function loadStudentData(studentId) {
  const [student, results, grades, logs] = await Promise.all([
    must(sb.from("students").select("*, classes(id,name,grade)").eq("id", studentId).maybeSingle()),
    must(sb.from("fitness_results").select("*").eq("student_id", studentId).eq("academic_year", YEAR)),
    must(sb.from("grade_entries").select("*").eq("student_id", studentId).eq("academic_year", YEAR)),
    must(sb.from("training_logs").select("*").eq("student_id", studentId).order("session_date", { ascending: false }).limit(60)),
  ]);
  return { student, results, grades, logs };
}
function resultsTable(results) {
  const by = {};
  for (const r of results) (by[r.test_code] ||= {})[r.period] = r.value;
  const rows = tests.map((t) => {
    const v = by[t.code] || {};
    const later = v.final ?? v.mid;
    const d = improvement(v.baseline, later, t.higher_is_better);
    const cls = d === null ? "" : d > 0 ? "up" : d < 0 ? "down" : "muted";
    const sign = d === null ? "—" : `${d > 0 ? "▲ +" : d < 0 ? "▼ " : ""}${Math.round(d * 100) / 100}`;
    return `<tr><td>${esc(t.name_mn)}<div class="muted" style="font-size:12px">${esc(t.name_en)}</div></td>
      ${PERIODS.map(([p]) => `<td class="num">${v[p] ?? "—"}</td>`).join("")}<td class="num">${esc(t.unit)}</td><td class="num ${cls}">${sign}</td></tr>`;
  }).join("");
  return `<div class="tablewrap"><table><thead><tr><th>Тест</th>${PERIODS.map(([, l]) => `<th class="num">${l}</th>`).join("")}<th class="num">Нэгж</th><th class="num">Ахиц</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">Ахиц: ▲ сайжирсан, ▼ буурсан (эхний үр дүнтэй харьцуулав). Хүнтэй бус, өөрийнхөө эхлэлтэй харьцуулна.</p>`;
}
function gradesTable(grades) {
  if (!grades.length) return `<div class="empty">Үнэлгээ хараахан ороогүй байна.</div>`;
  const byTerm = Object.fromEntries(grades.map((g) => [g.term, g]));
  return `<div class="tablewrap"><table><thead><tr><th>Хэсэг</th>${TERMS.map((t) => `<th class="num">${t}</th>`).join("")}</tr></thead><tbody>
    ${GRADE_PARTS.map(([k, l, w]) => `<tr><td>${l} <span class="muted">(${w}%)</span></td>${TERMS.map((t) => `<td class="num">${byTerm[t]?.[k] ?? "—"}</td>`).join("")}</tr>`).join("")}
    <tr><td><b>Нийт (100%)</b></td>${TERMS.map((t) => `<td class="num"><b>${byTerm[t] ? byTerm[t].core_score : "—"}</b></td>`).join("")}</tr>
    <tr><td>Нэмэлт оноо (тусдаа)</td>${TERMS.map((t) => `<td class="num">${byTerm[t] ? "+" + byTerm[t].bonus : "—"}</td>`).join("")}</tr>
    </tbody></table></div>
    ${grades.filter((g) => g.teacher_comment).map((g) => `<p><span class="pill">${g.term}</span> ${esc(g.teacher_comment)}</p>`).join("")}`;
}
function logsTable(logs, withStudent = false) {
  if (!logs.length) return `<div class="empty">Дасгалын бүртгэл алга.</div>`;
  return `<div class="tablewrap"><table><thead><tr><th>Огноо</th>${withStudent ? "<th>Сурагч</th>" : ""}<th>Дасгал</th><th class="num">Хугацаа</th><th class="num">Идэвхтэй</th><th class="num">RPE</th><th class="num">Ачаалал</th><th class="num">Бие</th><th>Эргэцүүлэл</th></tr></thead><tbody>
    ${logs.map((l) => `<tr><td>${fmtDate(l.session_date)}</td>${withStudent ? `<td><a href="#/students/${l.student_id}">${esc(fullName(l.students))}</a> <span class="muted">${esc(l.students?.classes?.name || "")}</span></td>` : ""}
      <td>${esc(l.activity)}</td><td class="num">${l.duration_min}′</td><td class="num">${l.active_min ?? "—"}</td><td class="num">${l.rpe}</td>
      <td class="num">${l.session_load}</td><td class="num">${l.body_feeling ?? "—"}</td><td>${esc(l.reflection || "")}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function logSummary(logs) {
  const last28 = logs.filter((l) => (Date.now() - new Date(l.session_date)) / 864e5 <= 28);
  const load = last28.reduce((s, l) => s + l.session_load, 0);
  const rpe = last28.length ? Math.round(last28.reduce((s, l) => s + l.rpe, 0) / last28.length * 10) / 10 : "—";
  return `<div class="grid g3" style="margin-bottom:14px">
    <div class="stat"><b>${last28.length}</b><span>Сүүлийн 28 хоногт дасгал</span></div>
    <div class="stat"><b>${rpe}</b><span>Дундаж RPE</span></div>
    <div class="stat"><b>${load}</b><span>Нийт ачаалал (мин × RPE)</span></div></div>`;
}

// ---------------------------------------------------------------- teacher: dashboard
async function dashboard() {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const [classes, students, results, logsWeek, recent] = await Promise.all([
    must(sb.from("classes").select("id", { count: "exact", head: true }).eq("academic_year", YEAR)),
    must(sb.from("students").select("id", { count: "exact", head: true }).eq("status", "active")),
    must(sb.from("fitness_results").select("id", { count: "exact", head: true }).eq("academic_year", YEAR)),
    must(sb.from("training_logs").select("id", { count: "exact", head: true }).gte("session_date", weekAgo)),
    must(sb.from("training_logs").select("*, students(first_name,last_name,classes(name))").order("created_at", { ascending: false }).limit(10)),
  ]);
  shell(`<div class="top"><div><h1>Сайн байна уу</h1><p class="sub">${YEAR} хичээлийн жил · Just show up.</p></div>
      <div class="row"><a class="btn" href="#/classes">+ Анги</a><a class="btn accent" href="#/assessment">Тест оруулах</a></div></div>
    <div class="grid g4" style="margin-bottom:18px">
      <div class="stat"><b>${classes}</b><span>Анги</span></div><div class="stat"><b>${students}</b><span>Идэвхтэй сурагч</span></div>
      <div class="stat"><b>${results}</b><span>Фитнес тестийн үр дүн</span></div><div class="stat"><b>${logsWeek}</b><span>Энэ 7 хоногийн дасгал</span></div></div>
    <div class="card"><h2>Сүүлийн дасгалын бүртгэлүүд</h2>${logsTable(recent, true)}</div>
    ${classes === 0 ? `<div class="card"><h2>Эхлэх</h2><ol class="muted"><li>Ангиуд хэсэгт анги нэмнэ (жишээ нь 11B).</li><li>Ангидаа сурагчдыг нэмнэ — Excel-ээс хуулж буулгаж болно.</li><li>Сурагчид өөрсдийн @${esc(DOMAIN)} хаягаар нэвтэрнэ.</li></ol></div>` : ""}`, "");
}

// ---------------------------------------------------------------- teacher: classes
async function classesList() {
  const classes = await must(sb.from("classes").select("*, students(count)").eq("academic_year", YEAR).order("grade").order("name"));
  shell(`<div class="top"><div><h1>Ангиуд</h1><p class="sub">${YEAR} · ${classes.length} анги</p></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Анги</th><th class="num">Түвшин</th><th class="num">Сурагч</th><th>Байршил</th><th>Багш</th></tr></thead><tbody>
    ${classes.map((c) => `<tr><td><a href="#/classes/${c.id}"><b>${esc(c.name)}</b></a></td><td class="num">${c.grade}</td><td class="num">${c.students?.[0]?.count ?? 0}</td><td>${esc(c.location || "")}</td><td>${esc(c.teacher_email || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Анги алга. Доор нэмнэ үү.</td></tr>`}
    </tbody></table></div></div>
    <div class="card"><h2>Анги нэмэх</h2><form id="addClass" class="form grid g4">
      <label class="f">Нэр<input name="name" required placeholder="11B"></label>
      <label class="f">Түвшин (1–12)<input name="grade" type="number" min="1" max="12" required></label>
      <label class="f">Байршил<input name="location" placeholder="B1 заал"></label>
      <label class="f">Багшийн email<input name="teacher_email" type="email" value="${esc(profile.email)}"></label>
      <div class="full"><button class="btn primary">Нэмэх</button></div></form></div>`, "classes");
  $("#addClass").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await must(sb.from("classes").insert({ name: f.name.toUpperCase(), grade: Number(f.grade), location: f.location || null, teacher_email: f.teacher_email?.toLowerCase() || null, academic_year: YEAR }));
      toast("Анги нэмэгдлээ"); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
}

async function classDetail(id) {
  const [cls, students, assigned, library, classes] = await Promise.all([
    must(sb.from("classes").select("*").eq("id", id).maybeSingle()),
    must(sb.from("students").select("*").eq("class_id", id).order("last_name").order("first_name")),
    must(sb.from("class_lessons").select("*, lessons(id,title,focus)").eq("class_id", id).order("scheduled_date", { ascending: true, nullsFirst: false })),
    must(sb.from("lessons").select("id,title,grade_band").order("title")),
    loadClasses(),
  ]);
  if (!cls) return go("#/classes");
  const registered = new Set((await must(sb.from("profiles").select("student_id").eq("role", "student"))).map((p) => p.student_id));
  shell(`<div class="top"><div><a href="#/classes" class="muted">← Ангиуд</a><h1>${esc(cls.name)}</h1><p class="sub">${cls.grade}-р анги · ${students.filter((s) => s.status === "active").length} идэвхтэй сурагч${cls.location ? " · " + esc(cls.location) : ""}</p></div>
      <div class="row"><a class="btn accent" href="#/assessment?class=${id}">Фитнес тест</a><a class="btn" href="#/grades?class=${id}">Үнэлгээ</a><button class="btn" id="exportCsv">CSV татах</button></div></div>
    <div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Сурагчид</h2><span class="spacer"></span><button class="btn sm" id="printCodes">Бүртгэлийн код хэвлэх</button></div>
    <p class="muted" style="margin:0 0 10px;font-size:13px">Сурагч анх удаа email + <b>бүртгэлийн код</b> + шинэ нууц үгээр бүртгүүлнэ. Нууц үгээ мартвал "Нэвтрэлт сэргээх" дарж шинэ код өгнө (өгөгдөл устахгүй).</p>
    <div class="tablewrap"><table><thead><tr><th>Код</th><th>Нэр</th><th>Email</th><th>Хүйс</th><th>Төлөв</th><th>Бүртгэлийн код</th><th>Нэвтрэлт</th><th></th></tr></thead><tbody>
      ${students.map((s) => `<tr><td>${esc(s.student_code || "")}</td><td><a href="#/students/${s.id}"><b>${esc(fullName(s))}</b></a></td><td>${esc(s.email || "")}${s.email ? "" : ' <span class="pill">email алга</span>'}</td>
        <td>${esc(s.gender || "")}</td><td><span class="pill">${s.status === "active" ? "идэвхтэй" : "идэвхгүй"}</span></td>
        <td><code style="letter-spacing:.15em;font-weight:700">${esc(s.access_code || "")}</code></td>
        <td>${registered.has(s.id) ? '<span class="pill up">бүртгүүлсэн</span>' : '<span class="pill muted">хүлээгдэж буй</span>'}</td>
        <td class="num" style="white-space:nowrap">${s.email ? `<button class="btn sm" data-reset="${s.id}" data-name="${esc(fullName(s))}">Нэвтрэлт сэргээх</button> ` : ""}<button class="btn sm" data-toggle="${s.id}" data-status="${s.status}">${s.status === "active" ? "Идэвхгүй болгох" : "Идэвхжүүлэх"}</button></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Сурагч алга.</td></tr>`}
    </tbody></table></div></div>
    <div class="grid g2">
      <div class="card"><h2>Сурагч нэмэх</h2><form id="addStudent" class="form grid g2">
        <label class="f">Нэр<input name="first_name" required></label><label class="f">Овог<input name="last_name"></label>
        <label class="f">Email<input name="email" type="email" placeholder="@${esc(DOMAIN)}"></label><label class="f">Сурагчийн код<input name="student_code"></label>
        <label class="f">Хүйс<select name="gender"><option value="">—</option><option value="M">Эр</option><option value="F">Эм</option><option value="Other">Бусад</option></select></label>
        <div class="full"><button class="btn primary">Нэмэх</button></div></form></div>
      <div class="card"><h2>Олноор нэмэх</h2><p class="muted" style="margin-top:0;font-size:13px">Excel-ээс баганаар хуулж буулгана: <b>нэр, овог, email, код, хүйс(M/F)</b>. Мөр бүр нэг сурагч.</p>
        <form id="bulk" class="form"><textarea name="rows" placeholder="Anu	Bat	anu.b@${esc(DOMAIN)}	S1001	F"></textarea><button class="btn">Импорт хийх</button></form></div>
    </div>
    <div class="card"><h2>Хуваарилсан хичээлүүд</h2>
      ${assigned.length ? `<div class="tablewrap"><table><thead><tr><th>Огноо</th><th>Хичээл</th><th>Тэмдэглэл</th><th></th></tr></thead><tbody>${assigned.map((a) => `<tr><td>${a.scheduled_date ? fmtDate(a.scheduled_date) : "—"}</td><td><a href="#/lessons/${a.lesson_id}">${esc(a.lessons?.title)}</a></td><td>${esc(a.notes || "")}</td><td class="num"><button class="btn sm danger" data-unassign="${a.id}">Хасах</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Хичээл хуваарилаагүй.</div>`}
      <form id="assign" class="form grid g4" style="margin-top:14px">
        <label class="f">Хичээл<select name="lesson_id" required><option value="">Сонгох…</option>${library.map((l) => `<option value="${l.id}">${esc(l.title)}${l.grade_band ? " · " + esc(l.grade_band) : ""}</option>`).join("")}</select></label>
        <label class="f">Огноо<input name="scheduled_date" type="date"></label><label class="f">Тэмдэглэл<input name="notes" placeholder="Hureelend, 10:50"></label>
        <div style="align-self:end"><button class="btn primary">Хуваарилах</button></div></form>
      ${library.length ? "" : `<p class="note">Эхлээд <a href="#/lessons">Хичээлийн сан</a>-д хичээл үүсгэнэ.</p>`}</div>
    <details class="card"><summary>Ангийн мэдээлэл засах / устгах</summary><form id="editClass" class="form grid g4" style="margin-top:14px">
      <label class="f">Нэр<input name="name" value="${esc(cls.name)}" required></label><label class="f">Түвшин<input name="grade" type="number" min="1" max="12" value="${cls.grade}" required></label>
      <label class="f">Байршил<input name="location" value="${esc(cls.location || "")}"></label><label class="f">Багшийн email<input name="teacher_email" value="${esc(cls.teacher_email || "")}"></label>
      <label class="f full">Тэмдэглэл<textarea name="notes">${esc(cls.notes || "")}</textarea></label>
      <div class="full row"><button class="btn primary">Хадгалах</button><span class="spacer"></span><button type="button" class="btn danger" id="delClass">Анги устгах</button></div></form></details>`, "classes");

  $("#addStudent").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await must(sb.from("students").insert({ first_name: f.first_name, last_name: f.last_name, email: f.email?.toLowerCase() || null, student_code: f.student_code || null, gender: f.gender || null, class_id: id }));
      toast("Сурагч нэмэгдлээ"); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
  $("#bulk").onsubmit = async (e) => {
    e.preventDefault();
    const { rows, errors } = parseRoster(formData(e.target).rows || "");
    if (errors.length) { toast(errors.slice(0, 3).join(" · "), true); return; }
    if (!rows.length) { toast("Мөр олдсонгүй", true); return; }
    try {
      await must(sb.from("students").insert(rows.map((r) => ({ ...r, class_id: id }))));
      toast(`${rows.length} сурагч нэмэгдлээ`); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
  $$("[data-toggle]").forEach((b) => (b.onclick = async () => {
    try {
      await must(sb.from("students").update({ status: b.dataset.status === "active" ? "inactive" : "active" }).eq("id", b.dataset.toggle));
      render();
    } catch (err) { toast(friendlyError(err), true); }
  }));
  $("#assign").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await must(sb.from("class_lessons").insert({ class_id: id, lesson_id: f.lesson_id, scheduled_date: f.scheduled_date || null, notes: f.notes || null }));
      toast("Хичээл хуваарилагдлаа"); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
  $$("[data-unassign]").forEach((b) => (b.onclick = async () => {
    try { await must(sb.from("class_lessons").delete().eq("id", b.dataset.unassign)); render(); } catch (err) { toast(friendlyError(err), true); }
  }));
  $("#editClass").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await must(sb.from("classes").update({ name: f.name.toUpperCase(), grade: Number(f.grade), location: f.location || null, teacher_email: f.teacher_email?.toLowerCase() || null, notes: f.notes || null }).eq("id", id));
      toast("Хадгалагдлаа"); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
  $("#delClass").onclick = async () => {
    if (students.length) { toast("Ангид сурагч байгаа тул устгах боломжгүй. Эхлээд сурагчдыг өөр анги руу шилжүүлнэ үү.", true); return; }
    if (!confirm(`${cls.name} ангийг устгах уу?`)) return;
    try { await must(sb.from("classes").delete().eq("id", id)); go("#/classes"); } catch (err) { toast(friendlyError(err), true); }
  };
  $("#exportCsv").onclick = () => exportClassCsv(cls, students);
  $$("[data-reset]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`${b.dataset.name}-ийн нэвтрэлтийг сэргээх үү? Хуучин нууц үг ажиллахаа больж, шинэ код үүснэ. Тест, үнэлгээ, бүртгэл устахгүй.`)) return;
    try { const code = await must(sb.rpc("reset_student_login", { p_student: b.dataset.reset })); toast(`Шинэ код: ${code}`); setTimeout(render, 1500); }
    catch (err) { toast(friendlyError(err), true); }
  }));
  $("#printCodes").onclick = () => printCodes(`${cls.name} — бүртгэлийн код`, students.filter((s) => s.status === "active" && s.email).map((s) => [fullName(s), s.email, s.access_code, registered.has(s.id)]));
}

async function exportClassCsv(cls, students) {
  try {
    const ids = students.map((s) => s.id);
    if (!ids.length) { toast("Сурагч алга", true); return; }
    const [results, grades] = await Promise.all([
      must(sb.from("fitness_results").select("*").in("student_id", ids).eq("academic_year", YEAR)),
      must(sb.from("grade_entries").select("*").in("student_id", ids).eq("academic_year", YEAR)),
    ]);
    const header = ["Код", "Овог нэр", "Email", "Төлөв"];
    for (const t of tests) for (const [p] of PERIODS) header.push(`${t.name_en} ${p} (${t.unit})`);
    for (const term of TERMS) header.push(`${term} нийт`, `${term} нэмэлт`);
    const lines = [header.map(csvCell).join(",")];
    for (const s of students) {
      const row = [s.student_code, fullName(s), s.email, s.status];
      for (const t of tests) for (const [p] of PERIODS) row.push(results.find((r) => r.student_id === s.id && r.test_code === t.code && r.period === p)?.value ?? "");
      for (const term of TERMS) { const g = grades.find((x) => x.student_id === s.id && x.term === term); row.push(g?.core_score ?? "", g?.bonus ?? ""); }
      lines.push(row.map(csvCell).join(","));
    }
    download(`TomujinPE_${cls.name}_${YEAR}.csv`, lines.join("\n"));
  } catch (err) { toast(friendlyError(err), true); }
}

// ---------------------------------------------------------------- teacher: student report
async function studentReport(id) {
  const { student, results, grades, logs } = await loadStudentData(id);
  if (!student) return go("#/classes");
  const classes = await loadClasses();
  shell(`<div class="top"><div><a href="#/classes/${student.class_id || ""}" class="muted noprint">← ${esc(student.classes?.name || "Ангиуд")}</a>
      <h1>${esc(fullName(student))}</h1><p class="sub">${esc(student.classes?.name || "Ангигүй")} · ${esc(student.student_code || "")} · ${esc(student.email || "email алга")} · ${YEAR}</p></div>
      <div class="row noprint"><button class="btn" onclick="window.print()">Хэвлэх / PDF</button></div></div>
    <div class="card"><h2>Фитнес тест</h2>${resultsTable(results)}</div>
    <div class="card"><h2>Үнэлгээ</h2>${gradesTable(grades)}</div>
    <div class="card"><h2>Дасгалын бүртгэл</h2>${logSummary(logs)}${logsTable(logs)}</div>
    <details class="card noprint"><summary>Сурагчийн мэдээлэл засах</summary><form id="editStudent" class="form grid g3" style="margin-top:14px">
      <label class="f">Нэр<input name="first_name" value="${esc(student.first_name)}" required></label><label class="f">Овог<input name="last_name" value="${esc(student.last_name)}"></label>
      <label class="f">Email<input name="email" type="email" value="${esc(student.email || "")}"></label><label class="f">Код<input name="student_code" value="${esc(student.student_code || "")}"></label>
      <label class="f">Анги<select name="class_id"><option value="">—</option>${classOptions(classes, student.class_id)}</select></label>
      <label class="f">Хүйс<select name="gender">${[["", "—"], ["M", "Эр"], ["F", "Эм"], ["Other", "Бусад"]].map(([v, l]) => `<option value="${v}" ${student.gender === v || (!student.gender && !v) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f full">Тэмдэглэл (зөвхөн багш харна)<textarea name="notes">${esc(student.notes || "")}</textarea></label>
      <div class="full row"><button class="btn primary">Хадгалах</button><span class="spacer"></span><button type="button" class="btn danger" id="delStudent">Сурагч устгах</button></div></form></details>`, "classes");
  $("#editStudent").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try {
      await must(sb.from("students").update({ first_name: f.first_name, last_name: f.last_name, email: f.email?.toLowerCase() || null, student_code: f.student_code || null, class_id: f.class_id || null, gender: f.gender || null, notes: f.notes || null }).eq("id", id));
      toast("Хадгалагдлаа"); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
  $("#delStudent").onclick = async () => {
    if (!confirm(`${fullName(student)}-г бүх тест, үнэлгээ, дасгалын бүртгэлтэй нь БҮРМӨСӨН устгах уу? Ихэнх тохиолдолд "Идэвхгүй болгох" нь илүү зөв.`)) return;
    try { await must(sb.from("students").delete().eq("id", id)); toast("Устгагдлаа"); go(`#/classes/${student.class_id || ""}`); } catch (err) { toast(friendlyError(err), true); }
  };
}

// ---------------------------------------------------------------- teacher: fitness entry
async function assessmentEntry(_, params) {
  const classes = await loadClasses();
  const classId = params.get("class") || classes[0]?.id || "";
  const period = params.get("period") || "baseline";
  if (!classes.length) { shell(`<div class="top"><h1>Фитнес тест</h1></div><div class="card empty">Эхлээд <a href="#/classes">анги</a> нэмнэ үү.</div>`, "assessment"); return; }
  const students = await must(sb.from("students").select("id,first_name,last_name,student_code").eq("class_id", classId).eq("status", "active").order("last_name").order("first_name"));
  const results = students.length ? await must(sb.from("fitness_results").select("*").in("student_id", students.map((s) => s.id)).eq("period", period).eq("academic_year", YEAR)) : [];
  const cell = (sid, code) => results.find((r) => r.student_id === sid && r.test_code === code);
  shell(`<div class="top"><div><h1>Фитнес тест</h1><p class="sub">Хоосон үлдээсэн нүд хадгалагдахгүй. Утгыг устгавал тухайн үр дүн устна.</p></div></div>
    <div class="card noprint"><div class="row">
      <label class="f">Анги<select id="selClass">${classOptions(classes, classId)}</select></label>
      <label class="f">Үе<select id="selPeriod">${PERIODS.map(([v, l]) => `<option value="${v}" ${v === period ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="f">Тестийн огноо<input type="date" id="testedOn" value="${today()}"></label></div></div>
    <div class="card"><form id="entry"><div class="tablewrap"><table><thead><tr><th>Сурагч</th>${tests.map((t) => `<th class="num" title="${esc(t.name_en)}">${esc(t.name_mn)}<br><span class="muted">${esc(t.unit)}${t.higher_is_better ? " ↑" : " ↓"}</span></th>`).join("")}</tr></thead><tbody>
      ${students.map((s) => `<tr><td><a href="#/students/${s.id}">${esc(fullName(s))}</a></td>${tests.map((t) => { const r = cell(s.id, t.code); return `<td><input type="number" step="any" inputmode="decimal" name="${s.id}|${t.code}" value="${r ? r.value : ""}" data-orig="${r ? r.value : ""}" data-rid="${r ? r.id : ""}"></td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="${tests.length + 1}" class="empty">Энэ ангид идэвхтэй сурагч алга.</td></tr>`}
    </tbody></table></div>
    <div class="row" style="margin-top:14px"><button class="btn primary">Хадгалах</button><span class="muted" style="font-size:13px">↑ их байх тусам сайн · ↓ бага байх тусам сайн (секунд г.м.)</span></div></form></div>`, "assessment");
  const nav = () => go(`#/assessment?class=${$("#selClass").value}&period=${$("#selPeriod").value}`);
  $("#selClass").onchange = nav; $("#selPeriod").onchange = nav;
  $("#entry").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); btn.disabled = true;
    const upserts = [], deletes = [];
    for (const inp of $$("input[name*='|']", e.target)) {
      if (inp.value === inp.dataset.orig) continue;
      const [student_id, test_code] = inp.name.split("|");
      if (inp.value === "") { if (inp.dataset.rid) deletes.push(inp.dataset.rid); }
      else upserts.push({ student_id, test_code, period, academic_year: YEAR, value: Number(inp.value), tested_on: $("#testedOn").value || today() });
    }
    try {
      if (upserts.length) await must(sb.from("fitness_results").upsert(upserts, { onConflict: "student_id,test_code,period,academic_year" }));
      if (deletes.length) await must(sb.from("fitness_results").delete().in("id", deletes));
      toast(upserts.length + deletes.length ? `${upserts.length} хадгалж, ${deletes.length} устгалаа` : "Өөрчлөлт алга");
      render();
    } catch (err) { toast(friendlyError(err), true); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------- teacher: grades
async function gradesEntry(_, params) {
  const classes = await loadClasses();
  const classId = params.get("class") || classes[0]?.id || "";
  const term = TERMS.includes(params.get("term")) ? params.get("term") : "S1";
  if (!classes.length) { shell(`<div class="top"><h1>Үнэлгээ</h1></div><div class="card empty">Эхлээд <a href="#/classes">анги</a> нэмнэ үү.</div>`, "grades"); return; }
  const students = await must(sb.from("students").select("id,first_name,last_name").eq("class_id", classId).eq("status", "active").order("last_name").order("first_name"));
  const grades = students.length ? await must(sb.from("grade_entries").select("*").in("student_id", students.map((s) => s.id)).eq("term", term).eq("academic_year", YEAR)) : [];
  shell(`<div class="top"><div><h1>Үнэлгээ</h1><p class="sub">Хэсэг бүрийг 0–100 оноогоор. Нийт = жигнэсэн дүн (100%). Нэмэлт оноо (0–10) тусдаа хадгалагдана, нийтэд нэмэгдэхгүй.</p></div></div>
    <div class="card"><div class="row"><label class="f">Анги<select id="selClass">${classOptions(classes, classId)}</select></label>
      <label class="f">Улирал<select id="selTerm">${TERMS.map((t) => `<option ${t === term ? "selected" : ""}>${t}</option>`).join("")}</select></label></div></div>
    <div class="card"><form id="gform"><div class="tablewrap"><table><thead><tr><th>Сурагч</th>${GRADE_PARTS.map(([, l, w]) => `<th class="num">${l}<br><span class="muted">${w}%</span></th>`).join("")}<th class="num">Нэмэлт<br><span class="muted">0–10</span></th><th class="num">Нийт</th><th>Сэтгэгдэл</th></tr></thead><tbody>
      ${students.map((s) => { const g = grades.find((x) => x.student_id === s.id) || {};
        return `<tr data-sid="${s.id}"><td><a href="#/students/${s.id}">${esc(fullName(s))}</a></td>
          ${GRADE_PARTS.map(([k]) => `<td><input type="number" min="0" max="100" step="any" name="${k}" value="${g[k] ?? ""}"></td>`).join("")}
          <td><input type="number" min="0" max="10" step="any" name="bonus" value="${g.bonus ?? ""}"></td><td class="num"><b data-core>${g.id ? g.core_score : "—"}</b></td>
          <td><input name="teacher_comment" value="${esc(g.teacher_comment || "")}" style="min-width:180px"></td></tr>`; }).join("") || `<tr><td colspan="10" class="empty">Идэвхтэй сурагч алга.</td></tr>`}
    </tbody></table></div><div class="row" style="margin-top:14px"><button class="btn primary">Хадгалах</button></div></form></div>`, "grades");
  const nav = () => go(`#/grades?class=${$("#selClass").value}&term=${$("#selTerm").value}`);
  $("#selClass").onchange = nav; $("#selTerm").onchange = nav;
  $("#gform").addEventListener("input", (e) => {
    const tr = e.target.closest("tr[data-sid]"); if (!tr) return;
    const g = Object.fromEntries($$("input", tr).map((i) => [i.name, i.value]));
    $("[data-core]", tr).textContent = coreScore(g);
  });
  $("#gform").onsubmit = async (e) => {
    e.preventDefault();
    const rows = [];
    for (const tr of $$("tr[data-sid]", e.target)) {
      const g = Object.fromEntries($$("input", tr).map((i) => [i.name, i.value.trim()]));
      if (!Object.values(g).some((v) => v !== "")) continue;
      const row = { student_id: tr.dataset.sid, academic_year: YEAR, term, teacher_comment: g.teacher_comment || null, bonus: numOrNull(g.bonus) ?? 0 };
      for (const [k] of GRADE_PARTS) row[k] = numOrNull(g[k]);
      rows.push(row);
    }
    try {
      if (rows.length) await must(sb.from("grade_entries").upsert(rows, { onConflict: "student_id,academic_year,term" }));
      toast(`${rows.length} сурагчийн үнэлгээ хадгалагдлаа`); render();
    } catch (err) { toast(friendlyError(err), true); }
  };
}

// ---------------------------------------------------------------- teacher: lessons
async function lessonsList() {
  const lessons = await must(sb.from("lessons").select("id,title,grade_band,focus,duration_min,updated_at").order("updated_at", { ascending: false }));
  shell(`<div class="top"><div><h1>Хичээлийн сан</h1><p class="sub">Дахин ашиглах хичээлүүд. Ангид хуваарилсан хичээлийг тухайн ангийн сурагчид харна.</p></div><a class="btn primary" href="#/lessons/new">+ Шинэ хичээл</a></div>
    <div class="card"><input id="filter" placeholder="Хайх…" style="margin-bottom:10px"><div class="list" id="llist">
    ${lessons.map((l) => `<a class="item" href="#/lessons/${l.id}" data-text="${esc((l.title + " " + (l.focus || "") + " " + (l.grade_band || "")).toLowerCase())}"><span><b>${esc(l.title)}</b><br><span class="muted">${esc(l.focus || "")}</span></span><span class="muted">${esc(l.grade_band || "")} · ${l.duration_min}′</span></a>`).join("") || `<div class="empty">Хичээл алга.</div>`}
    </div></div>`, "lessons");
  $("#filter").oninput = (e) => { const q = e.target.value.toLowerCase(); $$("#llist a").forEach((a) => (a.style.display = a.dataset.text.includes(q) ? "" : "none")); };
}
async function lessonEditor(id) {
  const isNew = id === "new";
  const l = isNew ? { duration_min: 80 } : await must(sb.from("lessons").select("*").eq("id", id).maybeSingle());
  if (!l) return go("#/lessons");
  const fields = [["objectives", "Зорилго"], ["warmup", "Халаалт, хөдөлгөөний бэлтгэл"], ["main_part", "Үндсэн хэсэг"], ["game", "Хэрэглээ / тоглоом / сорил"], ["reflection", "Эргэцүүлэл, бүртгэл"], ["equipment", "Тоног төхөөрөмж"], ["safety", "Аюулгүй байдал, ялгаатай хандлага"]];
  shell(`<div class="top"><div><a href="#/lessons" class="muted">← Хичээлийн сан</a><h1>${isNew ? "Шинэ хичээл" : esc(l.title)}</h1></div></div>
    <div class="card"><form id="lform" class="form grid g3">
      <label class="f full">Гарчиг<input name="title" value="${esc(l.title || "")}" required></label>
      <label class="f">Анги/түвшин<input name="grade_band" value="${esc(l.grade_band || "")}" placeholder="6-7"></label>
      <label class="f">Чиглэл<input name="focus" value="${esc(l.focus || "")}" placeholder="Хурд, координаци"></label>
      <label class="f">Хугацаа (мин)<input name="duration_min" type="number" min="10" max="240" value="${l.duration_min}"></label>
      ${fields.map(([k, lab]) => `<label class="f full">${lab}<textarea name="${k}">${esc(l[k] || "")}</textarea></label>`).join("")}
      <div class="full row"><button class="btn primary">Хадгалах</button><span class="spacer"></span>${isNew ? "" : `<button type="button" class="btn danger" id="del">Устгах</button>`}</div></form></div>`, "lessons");
  $("#lform").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const row = { ...f, duration_min: Number(f.duration_min) || 80 };
    for (const k of Object.keys(row)) if (row[k] === "") row[k] = null;
    try {
      const saved = isNew ? await must(sb.from("lessons").insert(row).select("id").single()) : await must(sb.from("lessons").update(row).eq("id", id).select("id").single());
      toast("Хадгалагдлаа"); go(`#/lessons/${saved.id}`);
    } catch (err) { toast(friendlyError(err), true); }
  };
  $("#del")?.addEventListener("click", async () => {
    if (!confirm("Энэ хичээлийг устгах уу? Ангиудад хуваарилсан нь мөн хасагдана.")) return;
    try { await must(sb.from("lessons").delete().eq("id", id)); go("#/lessons"); } catch (err) { toast(friendlyError(err), true); }
  });
}

// ---------------------------------------------------------------- teacher: logs
async function logsView(_, params) {
  const classes = await loadClasses();
  const classId = params.get("class") || "";
  let q = sb.from("training_logs").select("*, students!inner(first_name,last_name,class_id,classes(name))").order("session_date", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (classId) q = q.eq("students.class_id", classId);
  const logs = await must(q);
  shell(`<div class="top"><div><h1>Дасгалын бүртгэл</h1><p class="sub">Сурагчдын Loading Form: ачаалал = хугацаа (мин) × RPE (1–10).</p></div></div>
    <div class="card"><div class="row"><label class="f">Анги<select id="selClass"><option value="">Бүх анги</option>${classOptions(classes, classId)}</select></label></div></div>
    <div class="card">${logSummary(logs)}${logsTable(logs, true)}</div>`, "logs");
  $("#selClass").onchange = (e) => go(`#/logs${e.target.value ? "?class=" + e.target.value : ""}`);
}

// ---------------------------------------------------------------- admin: staff
async function staffView() {
  if (!isAdmin()) return go("#/");
  const staff = await must(sb.from("staff").select("*").order("created_at"));
  const regStaff = new Set((await must(sb.from("profiles").select("email").in("role", ["admin", "teacher"]))).map((p) => p.email));
  shell(`<div class="top"><div><h1>Багш нар</h1><p class="sub">Энд нэмсэн @${esc(DOMAIN)} хаягууд бүртгэлийн кодоор анх бүртгүүлж, багшийн эрхтэй нэвтэрнэ.</p></div></div>
    <div class="card"><div class="tablewrap"><table><thead><tr><th>Email</th><th>Нэр</th><th>Эрх</th><th>Бүртгэлийн код</th><th>Нэвтрэлт</th><th></th></tr></thead><tbody>
    ${staff.map((s) => `<tr><td>${esc(s.email)}</td><td>${esc(s.full_name)}</td><td><span class="pill">${s.role}</span></td>
      <td><code style="letter-spacing:.15em;font-weight:700">${esc(s.invite_code || "")}</code></td>
      <td>${regStaff.has(s.email) ? '<span class="pill up">бүртгүүлсэн</span>' : '<span class="pill muted">хүлээгдэж буй</span>'}</td>
      <td class="num" style="white-space:nowrap">${s.email === profile.email ? "" : `<button class="btn sm" data-sreset="${esc(s.email)}">Нэвтрэлт сэргээх</button> <button class="btn sm danger" data-del="${esc(s.email)}">Хасах</button>`}</td></tr>`).join("")}
    </tbody></table></div></div>
    <div class="card"><h2>Багш нэмэх</h2><form id="sform" class="form grid g4">
      <label class="f">Email<input name="email" type="email" required placeholder="@${esc(DOMAIN)}"></label><label class="f">Нэр<input name="full_name"></label>
      <label class="f">Эрх<select name="role"><option value="teacher">Багш</option><option value="admin">Админ</option></select></label>
      <div style="align-self:end"><button class="btn primary">Нэмэх</button></div></form></div>`, "staff");
  $("#sform").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    try { await must(sb.from("staff").insert({ email: f.email.toLowerCase(), full_name: f.full_name || "", role: f.role })); toast("Нэмэгдлээ"); render(); }
    catch (err) { toast(friendlyError(err), true); }
  };
  $$("[data-sreset]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`${b.dataset.sreset}-ийн нэвтрэлтийг сэргээх үү? Шинэ код үүснэ.`)) return;
    try { const code = await must(sb.rpc("reset_staff_login", { p_email: b.dataset.sreset })); toast(`Шинэ код: ${code}`); setTimeout(render, 1500); }
    catch (err) { toast(friendlyError(err), true); }
  }));
  $$("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm(`${b.dataset.del}-г хасах уу?`)) return;
    try { await must(sb.from("staff").delete().eq("email", b.dataset.del)); render(); } catch (err) { toast(friendlyError(err), true); }
  }));
}

// ---------------------------------------------------------------- shared: password + code printing
function passwordView() {
  shell(`<div class="top"><div><h1>Нууц үг солих</h1><p class="sub">${esc(profile.email)}</p></div></div>
    <div class="card" style="max-width:460px"><form id="pwform" class="form">
      <label class="f">Шинэ нууц үг (8+ тэмдэгт)<input name="p1" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="f">Давтах<input name="p2" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary">Хадгалах</button></form></div>`, "password");
  $("#pwform").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.p1 !== f.p2) { toast("Нууц үг хоорондоо таарахгүй байна", true); return; }
    const { error } = await sb.auth.updateUser({ password: f.p1 });
    if (error) toast(authErrorText(error.message, false), true); else { toast("Нууц үг шинэчлэгдлээ"); e.target.reset(); }
  };
}
function printCodes(title, rows) {
  const w = window.open("", "_blank");
  if (!w) { toast("Popup хаагдсан байна. Browser-ийн popup зөвшөөрнө үү.", true); return; }
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
    <style>body{font-family:system-ui,sans-serif;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:10px;text-align:left}code{font-size:18px;letter-spacing:.2em;font-weight:700}</style>
    <h2>${esc(title)}</h2><p>Сайт: <b>${esc(location.origin)}</b> → "Анх удаа бүртгүүлэх" → email + код + шинэ нууц үг.</p>
    <table><tr><th>Нэр</th><th>Email</th><th>Код</th><th></th></tr>${rows.map(([n, e, c, done]) => `<tr><td>${esc(n)}</td><td>${esc(e)}</td><td><code>${esc(c)}</code></td><td>${done ? "бүртгүүлсэн" : ""}</td></tr>`).join("")}</table>
    <script>print()<\/script>`);
  w.document.close();
}

// ---------------------------------------------------------------- student
async function studentHome() {
  const sid = profile.student_id;
  if (!sid) return renderNoAccess();
  const [{ student, results, grades, logs }, lessons] = await Promise.all([
    loadStudentData(sid),
    must(sb.from("class_lessons").select("*, lessons(*)").order("scheduled_date", { ascending: false, nullsFirst: false }).limit(20)),
  ]);
  if (!student) return renderNoAccess();
  shell(`<div class="top"><div><h1>Сайн уу, ${esc(student.first_name)}!</h1><p class="sub">${esc(student.classes?.name || "")} · ${YEAR} · Өөрийнхөө төлөө ирж, хичээгээрэй.</p></div></div>
    <div class="card"><h2>Дасгал бүртгэх (Loading Form)</h2><form id="logf" class="form grid g3">
      <label class="f">Огноо<input type="date" name="session_date" value="${today()}" max="${today()}" required></label>
      <label class="f">Юу хийсэн бэ?<input name="activity" required placeholder="PE хичээл, гүйлт, хөлбөмбөг…"></label>
      <label class="f">Нийт хугацаа (мин)<input type="number" name="duration_min" min="1" max="300" required></label>
      <label class="f">Идэвхтэй хөдөлсөн (мин)<input type="number" name="active_min" min="0" max="300"></label>
      <label class="f">Хэр хүнд байсан бэ? (RPE)<select name="rpe" required><option value="">Сонгох…</option>${RPE.slice(1).map((l, i) => `<option value="${i + 1}">${l}</option>`).join("")}</select></label>
      <label class="f">Бие хэр байна?<select name="body_feeling"><option value="">—</option>${FEEL.slice(1).map((l, i) => `<option value="${i + 1}">${l}</option>`).join("")}</select></label>
      <label class="f full">Эргэцүүлэл: юу сурсан, дараа юуг сайжруулах вэ?<textarea name="reflection"></textarea></label>
      <div class="full"><button class="btn primary">Илгээх</button> <span class="muted" style="font-size:12px">Илгээсний дараа засах боломжгүй — үнэнээр бөглөөрэй.</span></div></form></div>
    <div class="card"><h2>Миний дасгалууд</h2>${logSummary(logs)}${logsTable(logs)}</div>
    <div class="card"><h2>Миний фитнес тест</h2>${resultsTable(results)}</div>
    <div class="card"><h2>Миний үнэлгээ</h2>${gradesTable(grades)}</div>
    <div class="card"><h2>Ангийн хичээлүүд</h2>${lessons.length ? lessons.map((cl) => `<details style="padding:10px 0;border-bottom:1px solid var(--line)"><summary>${cl.scheduled_date ? fmtDate(cl.scheduled_date) + " · " : ""}${esc(cl.lessons?.title)}</summary>
      <div style="padding-top:8px">${cl.notes ? `<p><b>${esc(cl.notes)}</b></p>` : ""}${[["objectives", "Зорилго"], ["equipment", "Авчрах/хэрэгтэй зүйл"], ["reflection", "Эргэцүүлэл"]].filter(([k]) => cl.lessons?.[k]).map(([k, lab]) => `<p><span class="muted">${lab}:</span> ${esc(cl.lessons[k])}</p>`).join("")}</div></details>`).join("") : `<div class="empty">Хичээл хуваарилаагүй байна.</div>`}</div>`, "");
  $("#logf").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      await must(sb.from("training_logs").insert({ student_id: sid, session_date: f.session_date, activity: f.activity, duration_min: Number(f.duration_min),
        active_min: numOrNull(f.active_min), rpe: Number(f.rpe), body_feeling: numOrNull(f.body_feeling), reflection: f.reflection || null }));
      toast("Бүртгэгдлээ. Just show up!"); render();
    } catch (err) { toast(friendlyError(err), true); btn.disabled = false; }
  };
}

if (!window.__TOMUJIN_TEST__) boot();
