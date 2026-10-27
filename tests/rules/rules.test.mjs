// Server rule tests for firestore.rules, run against the Firestore emulator (never production).
// From the repo root:
//   npm --prefix tests/rules install
//   npx -y firebase-tools@13 emulators:exec --only firestore --project demo-tomujin-pe "node tests/rules/rules.test.mjs"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, writeBatch, runTransaction, serverTimestamp, increment, query, where
} from "firebase/firestore";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OWNER = "saikhanjargal.j@tomujin.edu.mn";
const testEnv = await initializeTestEnvironment({
  projectId: "demo-tomujin-pe",
  firestore: { rules: readFileSync(join(root, "firestore.rules"), "utf8"), host: "127.0.0.1", port: 8080 }
});

const as = (uid, email, verified = true) => testEnv.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const owner = () => as("owner", OWNER);
const stu = (n) => as("s" + n, "s" + n + "@tomujin.edu.mn");
const teacher = () => as("t1", "t1@tomujin.edu.mn");
const guest = () => testEnv.unauthenticatedContext().firestore();
async function seed(fn) { await testEnv.withSecurityRulesDisabled(async (c) => { await fn(c.firestore()); }); }
async function read(path) { let out; await seed(async (db) => { const s = await getDoc(doc(db, path)); out = s.exists() ? s.data() : null; }); return out; }
async function count(path) { let n; await seed(async (db) => { n = (await getDocs(collection(db, path))).size; }); return n; }

/* registration window relative to now (ms): negative = already passed */
async function setReg({ openIn = -60e3, p1In = -30e3, closeIn = 60e3 } = {}) {
  const now = Date.now();
  await seed((db) => setDoc(doc(db, "site/clubreg"), { open: now + openIn, p1: now + p1In, close: now + closeIn }));
}
async function offer(oid, cap, n = 0) { await seed((db) => setDoc(doc(db, "offers/" + oid), { n, cap })); }

/* Same steps as crRun / crLeave in src/clubreg.js (one server transaction). */
async function pick(db, uid, oid, wantWait = false) {
  return runTransaction(db, async (t) => {
    const P = { o: doc(db, "offers/" + oid), s: doc(db, `offers/${oid}/seats/${uid}`), w: doc(db, `offers/${oid}/wait/${uid}`), r: doc(db, "regs/" + uid) };
    const o = await t.get(P.o), s = await t.get(P.s), w = await t.get(P.w), r = await t.get(P.r);
    if (s.exists()) return "had-seat";
    if (w.exists()) return "had-wait";
    const n = +(o.data().n || 0), cap = +(o.data().cap || 0), picks = r.exists() ? (r.data().picks || []) : [];
    let got;
    if (n < cap) { t.set(P.s, { at: serverTimestamp(), status: "seat" }); t.set(P.o, { n: n + 1 }, { merge: true }); got = "seat"; }
    else if (wantWait) { t.set(P.w, { at: serverTimestamp() }); got = "wait"; }
    else throw Object.assign(new Error("full"), { code: "tpe/full" });
    if (!picks.includes(oid)) t.set(P.r, { picks: [...picks, oid] });
    return got;
  });
}
async function leave(db, uid, oid) {
  return runTransaction(db, async (t) => {
    const P = { o: doc(db, "offers/" + oid), s: doc(db, `offers/${oid}/seats/${uid}`), w: doc(db, `offers/${oid}/wait/${uid}`), r: doc(db, "regs/" + uid) };
    const o = await t.get(P.o), s = await t.get(P.s), w = await t.get(P.w), r = await t.get(P.r);
    const picks = r.exists() ? (r.data().picks || []) : [];
    if (s.exists()) { t.delete(P.s); t.set(P.o, { n: Math.max(0, +(o.data().n || 0) - 1) }, { merge: true }); }
    else if (w.exists()) t.delete(P.w);
    if (picks.includes(oid)) t.set(P.r, { picks: picks.filter((x) => x !== oid), rm: oid });
  });
}

const results = [];
async function test(name, fn) {
  await testEnv.clearFirestore();
  try { await fn(); results.push([true, name]); console.log("PASS", name); }
  catch (e) { results.push([false, name]); console.log("FAIL", name, "\n   ", e && (e.message || e)); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg); }

/* ---------------- club registration (10/30) ---------------- */
await test("R1 before opening time: no seat", async () => {
  await setReg({ openIn: 60e3, p1In: 120e3, closeIn: 180e3 }); await offer("bb", 30);
  await assertFails(pick(stu(1), "s1", "bb"));
  ok((await read("offers/bb")).n === 0, "counter changed");
});
await test("R2 after closing time: no seat", async () => {
  await setReg({ openIn: -180e3, p1In: -120e3, closeIn: -60e3 }); await offer("bb", 30);
  await assertFails(pick(stu(1), "s1", "bb"));
});
await test("R3 open, before 11:00: first club ok, second club refused", async () => {
  await setReg({ openIn: -60e3, p1In: 60e3, closeIn: 120e3 }); await offer("bb", 30); await offer("fn-a", 20);
  ok(await pick(stu(1), "s1", "bb") === "seat", "first pick");
  await assertFails(pick(stu(1), "s1", "fn-a"));
  ok((await read("regs/s1")).picks.length === 1, "picks");
  ok((await read("offers/fn-a")).n === 0, "second counter changed");
});
await test("R4 after 11:00: second club ok, third refused", async () => {
  await setReg(); await offer("bb", 30); await offer("fn-a", 20); await offer("tn-b", 16);
  await pick(stu(1), "s1", "bb"); await pick(stu(1), "s1", "fn-a");
  await assertFails(pick(stu(1), "s1", "tn-b"));
  ok(JSON.stringify((await read("regs/s1")).picks) === '["bb","fn-a"]', "picks");
});
await test("R5 same child presses twice at once: one seat, count 1", async () => {
  await setReg(); await offer("bb", 30);
  const db = stu(1);
  await Promise.allSettled([pick(db, "s1", "bb"), pick(db, "s1", "bb"), pick(db, "s1", "bb")]);
  ok((await read("offers/bb")).n === 1, "n=" + (await read("offers/bb")).n);
  ok(await count("offers/bb/seats") === 1, "seats");
  ok(JSON.stringify((await read("regs/s1")).picks) === '["bb"]', "picks");
});
await test("R6 two children race for the last seat: exactly one gets it", async () => {
  await setReg(); await offer("tn-a", 1);
  const r = await Promise.allSettled([pick(stu(1), "s1", "tn-a"), pick(stu(2), "s2", "tn-a")]);
  ok(r.filter((x) => x.status === "fulfilled" && x.value === "seat").length === 1, JSON.stringify(r.map((x) => x.status + ":" + (x.value || (x.reason && x.reason.code)))));
  ok((await read("offers/tn-a")).n === 1, "n");
  ok(await count("offers/tn-a/seats") === 1, "seats");
});
await test("R7 twenty children race for 16 seats: 16 seats, never over", async () => {
  await setReg(); await offer("jj-a", 16);
  await Promise.allSettled(Array.from({ length: 20 }, (_, i) => pick(stu(i + 1), "s" + (i + 1), "jj-a")));
  const n = (await read("offers/jj-a")).n, seats = await count("offers/jj-a/seats");
  ok(n === seats && seats <= 16, "n=" + n + " seats=" + seats);
});
await test("R8 waitlist only when full", async () => {
  await setReg(); await offer("bb", 1);
  const db2 = stu(2);
  // not full yet: a waitlist ticket written directly is refused
  const b = writeBatch(db2); b.set(doc(db2, "offers/bb/wait/s2"), { at: serverTimestamp() }); b.set(doc(db2, "regs/s2"), { picks: ["bb"] });
  await assertFails(b.commit());
  await pick(stu(1), "s1", "bb");
  ok(await pick(db2, "s2", "bb", true) === "wait", "wait");
  ok((await read("offers/bb")).n === 1, "n");
});
await test("R9 full offer refuses a seat (no overbooking from old screen numbers)", async () => {
  await setReg(); await offer("bb", 1, 1);
  const db = stu(3);
  const b = writeBatch(db); b.set(doc(db, "offers/bb/seats/s3"), { at: serverTimestamp(), status: "seat" }); b.update(doc(db, "offers/bb"), { n: increment(1) }); b.set(doc(db, "regs/s3"), { picks: ["bb"] });
  await assertFails(b.commit());
});
await test("R10 owner moves a child from waitlist to seat: counter matches", async () => {
  await setReg(); await offer("bb", 1); await pick(stu(1), "s1", "bb"); await pick(stu(2), "s2", "bb", true);
  await leave(stu(1), "s1", "bb");
  const db = owner(), b = writeBatch(db);
  b.set(doc(db, "offers/bb/seats/s2"), { at: serverTimestamp(), status: "pay" }); b.update(doc(db, "offers/bb"), { n: increment(1) }); b.delete(doc(db, "offers/bb/wait/s2"));
  await assertSucceeds(b.commit());
  ok((await read("offers/bb")).n === 1 && await count("offers/bb/seats") === 1 && await count("offers/bb/wait") === 0, "counts");
});
await test("R11 child cannot confirm own payment or status", async () => {
  await setReg(); await offer("bb", 30); await pick(stu(1), "s1", "bb");
  const db = stu(1);
  await assertFails(updateDoc(doc(db, "offers/bb/seats/s1"), { status: "ok" }));
  await assertFails(updateDoc(doc(db, "offers/bb/seats/s1"), { paid: { t2: true } }));
  await assertFails(setDoc(doc(db, "offers/fn-a/seats/s1"), { at: serverTimestamp(), status: "ok" }));
});
await test("R12 child cannot change the seat counter by hand", async () => {
  await setReg(); await offer("bb", 30, 5);
  await assertFails(updateDoc(doc(stu(1), "offers/bb"), { n: 7 }));
  await assertFails(updateDoc(doc(stu(1), "offers/bb"), { n: 6 }));
  await assertFails(updateDoc(doc(stu(1), "offers/bb"), { cap: 99 }));
});
await test("R13 cancel own seat during registration: counter goes down", async () => {
  await setReg(); await offer("bb", 30); await pick(stu(1), "s1", "bb");
  await assertSucceeds(leave(stu(1), "s1", "bb"));
  ok((await read("offers/bb")).n === 0 && (await read("regs/s1")).picks.length === 0, "after leave");
});
await test("R14 after the teacher changed the status, the child cannot cancel alone", async () => {
  await setReg(); await offer("bb", 30); await pick(stu(1), "s1", "bb");
  await assertSucceeds(updateDoc(doc(owner(), "offers/bb/seats/s1"), { status: "pay" }));
  await assertFails(leave(stu(1), "s1", "bb"));
});
await test("R15 children cannot see each other's seats or picks", async () => {
  await setReg(); await offer("bb", 30); await pick(stu(1), "s1", "bb");
  await assertFails(getDoc(doc(stu(2), "offers/bb/seats/s1")));
  await assertFails(getDoc(doc(stu(2), "regs/s1")));
  await assertSucceeds(getDoc(doc(stu(1), "offers/bb/seats/s1")));
  await assertSucceeds(getDoc(doc(guest(), "offers/bb")));          // seat counts are public
  await assertFails(getDoc(doc(guest(), "offers/bb/seats/s1")));
});
await test("R16 no settings document: nobody can register", async () => {
  await offer("bb", 30);
  await assertFails(pick(stu(1), "s1", "bb"));
});

await test("R17 both shifts of the same club are refused by the server", async () => {
  await setReg(); await offer("jj-a", 16); await offer("jj-b", 16); await offer("fn-a", 20);
  await pick(stu(1), "s1", "jj-a");
  await assertFails(pick(stu(1), "s1", "jj-b"));
  ok(await pick(stu(1), "s1", "fn-a") === "seat", "different club still allowed");
});

/* ---------------- feedback ---------------- */
const fbGuest = (x = {}) => Object.assign({ type: "idea", text: "Илүү том товч хэрэгтэй", page: "home", dev: "Android Chrome · 390px", status: "new", at: serverTimestamp(), who: "parent", uid: "" }, x);
await test("F1 parent without login can send feedback", async () => {
  await assertSucceeds(setDoc(doc(guest(), "feedback/a1"), fbGuest({ contact: "9911 2233" })));
});
await test("F2 refused: guest with name/email, wrong status, empty or too long text, bad type", async () => {
  await assertFails(setDoc(doc(guest(), "feedback/a2"), fbGuest({ email: "x@y.mn" })));
  await assertFails(setDoc(doc(guest(), "feedback/a3"), fbGuest({ status: "done" })));
  await assertFails(setDoc(doc(guest(), "feedback/a4"), fbGuest({ text: "  " })));
  await assertFails(setDoc(doc(guest(), "feedback/a5"), fbGuest({ text: "x".repeat(2001) })));
  await assertFails(setDoc(doc(guest(), "feedback/a6"), fbGuest({ type: "<script>" })));
  await assertFails(setDoc(doc(guest(), "feedback/a7"), fbGuest({ extra: 1 })));
});
await test("F3 signed-in student sends with own uid only", async () => {
  await assertSucceeds(setDoc(doc(stu(1), "feedback/b1"), fbGuest({ uid: "s1", who: "student", email: "s1@tomujin.edu.mn", name: "Бат", classId: "11b" })));
  await assertFails(setDoc(doc(stu(1), "feedback/b2"), fbGuest({ uid: "s2", who: "student", email: "s1@tomujin.edu.mn" })));
  await assertFails(setDoc(doc(stu(1), "feedback/b3"), fbGuest({ uid: "s1", who: "student", email: "s2@tomujin.edu.mn" })));
});
await test("F4 only the owner reads all feedback; a student reads only own", async () => {
  await seed((db) => Promise.all([setDoc(doc(db, "feedback/c1"), { uid: "s1", text: "a" }), setDoc(doc(db, "feedback/c2"), { uid: "", text: "b", contact: "99" })]));
  await assertFails(getDoc(doc(guest(), "feedback/c2")));
  await assertFails(getDoc(doc(stu(2), "feedback/c1")));
  await assertSucceeds(getDoc(doc(stu(1), "feedback/c1")));
  await assertSucceeds(getDocs(collection(owner(), "feedback")));
  await assertFails(getDocs(collection(teacher(), "feedback")));
});
await test("F5 student may only mark the reply as seen", async () => {
  await seed((db) => setDoc(doc(db, "feedback/d1"), { uid: "s1", text: "a", status: "done", reply: "ok" }));
  await assertSucceeds(updateDoc(doc(stu(1), "feedback/d1"), { seen: true }));
  await assertFails(updateDoc(doc(stu(1), "feedback/d1"), { status: "new" }));
  await assertFails(updateDoc(doc(stu(1), "feedback/d1"), { reply: "fake" }));
});
await test("F6 private notes on feedback: owner only, never the sender or a teacher", async () => {
  await seed((db) => Promise.all([setDoc(doc(db, "feedback/e1"), { uid: "s1", text: "a", status: "new" }), setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] })]));
  await assertSucceeds(setDoc(doc(owner(), "fbnotes/e1"), { text: "Ээж нь утсаар ярьсан", at: 1 }));
  await assertSucceeds(getDoc(doc(owner(), "fbnotes/e1")));
  await assertFails(getDoc(doc(stu(1), "fbnotes/e1")));
  await assertFails(getDocs(collection(stu(1), "fbnotes")));
  await assertFails(getDoc(doc(teacher(), "fbnotes/e1")));
  await assertFails(getDoc(doc(guest(), "fbnotes/e1")));
  await assertFails(setDoc(doc(stu(1), "fbnotes/e2"), { text: "x" }));
  await assertFails(setDoc(doc(owner(), "fbnotes/e3"), { text: "x".repeat(2001) }));
  await assertSucceeds(deleteDoc(doc(owner(), "fbnotes/e1")));
});
await test("F7 owner marks 'Хийхгүй' with a reason; the sender reads it and can only mark it seen", async () => {
  await seed((db) => setDoc(doc(db, "feedback/e4"), { uid: "s1", text: "a", status: "new" }));
  await assertSucceeds(updateDoc(doc(owner(), "feedback/e4"), { status: "skip", reply: "Дүрмээр шийдэгддэг", seen: false }));
  await assertSucceeds(getDoc(doc(stu(1), "feedback/e4")));
  await assertSucceeds(updateDoc(doc(stu(1), "feedback/e4"), { seen: true }));
  await assertFails(updateDoc(doc(stu(1), "feedback/e4"), { status: "new", seen: true }));
});
await test("P1 private settings (attendance Sheet script address): owner only", async () => {
  await seed((db) => setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }));
  await assertSucceeds(setDoc(doc(owner(), "private/peatt"), { url: "https://script.google.com/macros/s/x/exec", sheet: "", at: 1 }));
  await assertSucceeds(getDoc(doc(owner(), "private/peatt")));
  await assertFails(getDoc(doc(teacher(), "private/peatt")));
  await assertFails(getDoc(doc(stu(1), "private/peatt")));
  await assertFails(getDoc(doc(guest(), "private/peatt")));
  await assertFails(setDoc(doc(teacher(), "private/peatt"), { url: "https://evil" }));
});
await test("P2 tell-in-advance switch: signed-in school users read, only the owner writes valid settings", async () => {
  const good = { on: true, url: "https://script.google.com/macros/s/AKfy_x-1/exec", cutoff: "08:30", ahead: 21, at: 1 };
  await assertSucceeds(setDoc(doc(owner(), "config/absence"), good));
  await assertSucceeds(getDoc(doc(stu(1), "config/absence")));
  await assertSucceeds(getDoc(doc(teacher(), "config/absence")));
  await assertFails(getDoc(doc(guest(), "config/absence")));
  await assertFails(getDoc(doc(as("g1", "someone@gmail.com"), "config/absence")));
  await assertFails(getDoc(doc(as("s9", "s9@tomujin.edu.mn", false), "config/absence")));
  await assertFails(setDoc(doc(stu(1), "config/absence"), good));
  await assertFails(setDoc(doc(teacher(), "config/absence"), good));
  await assertFails(setDoc(doc(owner(), "config/absence"), Object.assign({}, good, { url: "https://evil.example/exec" })));
  await assertFails(setDoc(doc(owner(), "config/absence"), Object.assign({}, good, { cutoff: "8:30" })));
  await assertFails(setDoc(doc(owner(), "config/absence"), Object.assign({}, good, { ahead: 90 })));
  await assertFails(setDoc(doc(owner(), "config/absence"), Object.assign({}, good, { extra: "x" })));
  await assertFails(getDoc(doc(stu(1), "config/other")));
});

await test("R1 PE lesson request: a student files their own, with a reason; only they and the owner read it", async () => {
  await seed((db) => setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }));
  const ok = { uid: "s1", email: "s1@tomujin.edu.mn", name: "Бат", cls: "11B", tab: "PE 11", date: "2026-11-04", kind: "sick", reason: "Халуурч байна", status: "pending", at: serverTimestamp() };
  await assertSucceeds(setDoc(doc(stu(1), "absreq/s1_2026-11-04"), ok));
  await assertSucceeds(getDoc(doc(stu(1), "absreq/s1_2026-11-04")));
  await assertSucceeds(getDocs(query(collection(stu(1), "absreq"), where("uid", "==", "s1"))));
  await assertFails(getDocs(collection(stu(1), "absreq")));                       // not everyone's
  await assertFails(getDoc(doc(stu(2), "absreq/s1_2026-11-04")));
  await assertFails(getDoc(doc(teacher(), "absreq/s1_2026-11-04")));               // the comment is the owner's only
  await assertFails(getDoc(doc(guest(), "absreq/s1_2026-11-04")));
  await assertSucceeds(getDocs(collection(owner(), "absreq")));
  const bad = (x, id = "s1_2026-11-05", who = stu(1)) => assertFails(setDoc(doc(who, "absreq/" + id), Object.assign({}, ok, { date: "2026-11-05" }, x)));
  await bad({ status: "ok" });                                  // cannot approve itself
  await bad({ reason: "" });                                    // a reason is needed
  await bad({ reason: "x".repeat(301) });
  await bad({ kind: "late" });
  await bad({ uid: "s2" });                                     // only for yourself
  await bad({ email: "s2@tomujin.edu.mn" });
  await bad({}, "s1_2026-11-06");                               // the id matches the date
  await bad({ tab: "Master" });
  await bad({ extra: 1 });
  await bad({ at: 1 });                                         // server time only
  await bad({}, "s2_2026-11-05", stu(2));                       // another account cannot file for s1
});
await test("R2 PE lesson request: only the owner decides; the student withdraws only while it waits", async () => {
  await seed((db) => setDoc(doc(db, "absreq/s1_2026-11-11"), { uid: "s1", email: "s1@tomujin.edu.mn", date: "2026-11-11", kind: "leave", reason: "Тэмцээн", status: "pending" }));
  await assertFails(updateDoc(doc(stu(1), "absreq/s1_2026-11-11"), { status: "ok" }));
  await assertFails(updateDoc(doc(stu(1), "absreq/s1_2026-11-11"), { reason: "өөр" }));
  await assertFails(updateDoc(doc(teacher(), "absreq/s1_2026-11-11"), { status: "ok" }));
  await assertFails(updateDoc(doc(owner(), "absreq/s1_2026-11-11"), { reason: "засав" }));   // the owner cannot rewrite the student's words
  await assertSucceeds(updateDoc(doc(owner(), "absreq/s1_2026-11-11"), { status: "ok", decidedAt: 1 }));
  await assertFails(deleteDoc(doc(stu(1), "absreq/s1_2026-11-11")));                         // decided: stays
  await assertFails(setDoc(doc(stu(1), "absreq/s1_2026-11-11"), { uid: "s1", email: "s1@tomujin.edu.mn", name: "", cls: "11B", tab: "PE 11", date: "2026-11-11", kind: "sick", reason: "дахиад", status: "pending", at: serverTimestamp() }));
  await seed((db) => setDoc(doc(db, "absreq/s1_2026-11-18"), { uid: "s1", email: "s1@tomujin.edu.mn", date: "2026-11-18", kind: "sick", reason: "Эмч", status: "pending" }));
  await assertFails(deleteDoc(doc(stu(2), "absreq/s1_2026-11-18")));
  await assertSucceeds(deleteDoc(doc(stu(1), "absreq/s1_2026-11-18")));
});

/* ---------------- club attendance ---------------- */
await test("A1 only the owner marks attendance (with history); student and teacher cannot", async () => {
  await seed((db) => Promise.all([setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }), setDoc(doc(db, "offers/tn-b"), { n: 1, cap: 16 }), setDoc(doc(db, "offers/tn-b/seats/s1"), { status: "ok", at: 1 })]));
  const mark = { att: { "2026-11-19": "p" }, atth: { "2026-11-19": [{ v: "p", was: "", t: 1 }] } };
  await assertSucceeds(setDoc(doc(owner(), "offers/tn-b/seats/s1"), mark, { merge: true }));
  await assertFails(setDoc(doc(teacher(), "offers/tn-b/seats/s1"), mark, { merge: true }));
  await assertFails(setDoc(doc(stu(1), "offers/tn-b/seats/s1"), { att: { "2026-11-19": "p" } }, { merge: true }));
  await assertSucceeds(getDoc(doc(stu(1), "offers/tn-b/seats/s1")));
  await assertSucceeds(getDoc(doc(teacher(), "offers/tn-b/seats/s1")));
});
await test("A2 only the owner cancels a session; it is public so children see why", async () => {
  await seed((db) => Promise.all([setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }), setDoc(doc(db, "offers/tn-b"), { n: 1, cap: 16 })]));
  await assertSucceeds(setDoc(doc(owner(), "offers/tn-b"), { off: { "2026-11-12": "Заал засвартай" } }, { merge: true }));
  await assertFails(setDoc(doc(teacher(), "offers/tn-b"), { off: { "2026-11-13": "x" } }, { merge: true }));
  await assertFails(setDoc(doc(stu(1), "offers/tn-b"), { off: { "2026-11-13": "x" } }, { merge: true }));
  await assertSucceeds(getDoc(doc(guest(), "offers/tn-b")));
});

/* ---------------- student data ---------------- */
await test("U1 own profile only", async () => {
  await seed((db) => setDoc(doc(db, "users/s1"), { email: "s1@tomujin.edu.mn", name: "Бат", classId: "11b", createdAt: 1 }));
  await assertSucceeds(getDoc(doc(stu(1), "users/s1")));
  await assertFails(getDoc(doc(stu(2), "users/s1")));
  await assertFails(updateDoc(doc(stu(1), "users/s1"), { classId: "12a" }));   // class is changed by the teacher only
});
await test("U2 training log: own, valid, cannot be edited later", async () => {
  const L = { uid: "s1", rpe: 6, min: 40, at: 1, note: "сайн" };
  await assertSucceeds(setDoc(doc(stu(1), "users/s1/loading/x1"), L));
  await assertFails(setDoc(doc(stu(1), "users/s1/loading/x2"), Object.assign({}, L, { rpe: 0 })));
  await assertFails(setDoc(doc(stu(1), "users/s1/loading/x3"), Object.assign({}, L, { min: 0 })));
  await assertFails(updateDoc(doc(stu(1), "users/s1/loading/x1"), { rpe: 2 }));
  await assertFails(setDoc(doc(stu(2), "users/s1/loading/x4"), L));
});
await test("U3 plans: own account only", async () => {
  await assertSucceeds(setDoc(doc(stu(1), "users/s1/plans/p1"), { plan: { id: "p1", goal: "str" }, at: 1 }));
  await assertSucceeds(getDoc(doc(stu(1), "users/s1/plans/p1")));
  await assertFails(getDoc(doc(stu(2), "users/s1/plans/p1")));
  await assertFails(setDoc(doc(stu(2), "users/s1/plans/p2"), { plan: {}, at: 1 }));
});
await test("U4 teacher reads student logs but cannot edit content or roles", async () => {
  await seed((db) => Promise.all([setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }), setDoc(doc(db, "users/s1/loading/x1"), { uid: "s1", rpe: 5, min: 30 })]));
  await assertSucceeds(getDoc(doc(teacher(), "users/s1/loading/x1")));
  await assertFails(setDoc(doc(teacher(), "site/texts"), { t: {} }));
  await assertFails(setDoc(doc(teacher(), "config/roles"), { teachers: ["t1@tomujin.edu.mn", "x@tomujin.edu.mn"] }));
  await assertFails(updateDoc(doc(teacher(), "users/s1/loading/x1"), { rpe: 9 }));
});
await test("U5 members-only content: unverified, other domain and guests are refused", async () => {
  await seed((db) => setDoc(doc(db, "ex/e1"), { n: "x" }));
  await assertSucceeds(getDoc(doc(stu(1), "ex/e1")));
  await assertFails(getDoc(doc(as("s9", "s9@tomujin.edu.mn", false), "ex/e1")));
  await assertFails(getDoc(doc(as("g1", "someone@gmail.com"), "ex/e1")));
  await assertFails(getDoc(doc(guest(), "ex/e1")));
  await assertSucceeds(getDoc(doc(guest(), "site/clubreg")));
});
await test("U7 Strava: link flag only for its student, server collections closed, log link checked", async () => {
  await seed((db) => Promise.all([
    setDoc(doc(db, "config/roles"), { teachers: ["t1@tomujin.edu.mn"] }),
    setDoc(doc(db, "users/s1/strava/link"), { on: true, at: 1, all: true }),
    setDoc(doc(db, "stravaTokens/s1"), { athleteId: "777", access: "A", refresh: "R", expiresAt: 1, at: 1 }),
    setDoc(doc(db, "stravaCache/s1"), { at: 1, items: [] }),
    setDoc(doc(db, "stravaState/abc"), { uid: "s1", at: 1 })]));
  await assertSucceeds(getDoc(doc(stu(1), "users/s1/strava/link")));
  await assertFails(getDoc(doc(stu(2), "users/s1/strava/link")));
  await assertFails(getDoc(doc(teacher(), "users/s1/strava/link")));          // Strava stays with its owner
  await assertFails(setDoc(doc(stu(1), "users/s1/strava/link"), { on: true })); // only the server writes it
  for (const p of ["stravaTokens/s1", "stravaCache/s1", "stravaState/abc"]) {
    await assertFails(getDoc(doc(stu(1), p)));
    await assertFails(getDoc(doc(owner(), p)));
    await assertFails(setDoc(doc(stu(1), p), { at: 2 }));
  }
  const L = { uid: "s1", rpe: 6, min: 40, at: 1 };
  await assertSucceeds(setDoc(doc(stu(1), "users/s1/loading/sv1"), Object.assign({}, L, { strava: "https://www.strava.com/activities/12345678901" })));
  await assertSucceeds(setDoc(doc(stu(1), "users/s1/loading/sv2"), Object.assign({}, L, { strava: "https://strava.app.link/AbC123xyz" })));
  await assertFails(setDoc(doc(stu(1), "users/s1/loading/sv3"), Object.assign({}, L, { strava: "https://evil.example/activities/1" })));
  await assertFails(setDoc(doc(stu(1), "users/s1/loading/sv4"), Object.assign({}, L, { strava: "javascript:alert(1)" })));
  await assertFails(setDoc(doc(stu(1), "users/s1/loading/sv5"), Object.assign({}, L, { strava: 123 })));
});
await test("U6 only the owner edits site content", async () => {
  await assertFails(setDoc(doc(stu(1), "site/texts"), { t: { x: "hack" } }));
  await assertSucceeds(setDoc(doc(owner(), "site/texts"), { t: { x: "ok" } }));
});

await testEnv.cleanup();
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} passed` + (failed.length ? "\nFAILED: " + failed.map((r) => r[1]).join("; ") : ""));
process.exit(failed.length ? 1 : 0);
