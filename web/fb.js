// Tomujin PE — Firebase connection (Auth + Firestore).
// Security is enforced by firestore.rules on the server; this file only talks to Firebase.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocFromServer, setDoc, deleteDoc, collection, collectionGroup, onSnapshot, addDoc,
  query, where, orderBy, limit, writeBatch, runTransaction, serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const C = window.TPE_CONFIG || {};
const DOMAIN = (C.SCHOOL_DOMAIN || "tomujin.edu.mn").toLowerCase();
const BOOT_ADMIN = (C.ADMIN_EMAIL || "").toLowerCase();

function ready() {
  window.dispatchEvent(new Event("tpe-ready"));
}

if (!C.firebase || !C.firebase.apiKey || String(C.firebase.apiKey).indexOf("PASTE") === 0) {
  // Not configured yet: the public parts of the site still work from the built-in content.
  window.TPE = { configured: false, user: null, role: null, onAuth() {}, db: null };
  ready();
} else {
  const app = initializeApp(C.firebase);
  const auth = getAuth(app);
  const fs = getFirestore(app);
  const listeners = [];
  let current = null, role = null;

  const snapWrap = (qs) => ({ docs: qs.docs.map((d) => ({ id: d.id, exists: true, ref: d.ref.path, data: () => d.data() })) });
  function build(base, o) {
    const parts = [];
    (o && o.where || []).forEach((w) => parts.push(where(w[0], w[1], w[2])));
    if (o && o.orderBy) parts.push(orderBy(o.orderBy[0], o.orderBy[1] || "asc"));
    if (o && o.limit) parts.push(limit(o.limit));
    return parts.length ? query(base, ...parts) : base;
  }
  // In data, {__sv:"time"} becomes the server time and {__inc:n} adds n on the server.
  const fix = (v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (v.__sv === "time") return serverTimestamp();
      if (typeof v.__inc === "number") return increment(v.__inc);
      const o = {}; Object.keys(v).forEach((k) => { o[k] = fix(v[k]); }); return o;
    }
    return v;
  };
  const db = {
    doc(path) {
      const r = doc(fs, path);
      return {
        set: (data) => setDoc(r, data),
        update: (data) => setDoc(r, data, { merge: true }),
        get: () => getDoc(r).then((s) => ({ id: s.id, exists: s.exists(), data: () => s.data() })),
        // Asks the server directly (never the local cache): used to confirm what really happened after a network error.
        getServer: () => getDocFromServer(r).then((s) => ({ id: s.id, exists: s.exists(), data: () => s.data() })),
        delete: () => deleteDoc(r),
        onSnapshot: (next, err) => onSnapshot(r, (s) => next({ id: s.id, exists: s.exists(), data: () => s.data() }), err || (() => {}))
      };
    },
    collection(path) {
      const c = collection(fs, path);
      return {
        onSnapshot: (next, err, o) => onSnapshot(build(c, o), (qs) => next(snapWrap(qs)), err || (() => {})),
        add: (data) => addDoc(c, data)
      };
    },
    // Several writes that succeed or fail together. ops: [{op:"set"|"merge"|"delete", path, data}]
    // In data, {__sv:"time"} becomes the server time and {__inc:n} adds n on the server.
    batch(ops) {
      const b = writeBatch(fs);
      ops.forEach((o) => {
        const r = doc(fs, o.path);
        if (o.op === "delete") b.delete(r);
        else if (o.op === "merge") b.set(r, fix(o.data), { merge: true });
        else b.set(r, fix(o.data));
      });
      return b.commit();
    },
    // All-or-nothing read-then-write on the server. decide(snaps) gets {path: {exists, data()}} for every path in
    // reads and returns the writes ([{op, path, data}]) or throws to cancel. If another person changes the same
    // documents first, Firebase runs decide again with fresh data. Unlike batch(), it never queues offline:
    // with no connection it fails at once, so the screen never shows a seat that the server has not given.
    tx(reads, decide) {
      return runTransaction(fs, async (t) => {
        const snaps = {};
        for (const p of reads) { const s = await t.get(doc(fs, p)); snaps[p] = { exists: s.exists(), data: () => s.data() }; }
        const ops = decide(snaps) || [];
        ops.forEach((o) => {
          const r = doc(fs, o.path);
          if (o.op === "delete") t.delete(r);
          else if (o.op === "merge") t.set(r, fix(o.data), { merge: true });
          else t.set(r, fix(o.data));
        });
        return ops;
      });
    },
    group(name, o, next, err) {
      return onSnapshot(build(collectionGroup(fs, name), o), (qs) => next(snapWrap(qs)), err || (() => {}));
    }
  };

  async function loadRole(u) {
    if (!u || !u.emailVerified) return null;
    const email = (u.email || "").toLowerCase();
    if (!email.endsWith("@" + DOMAIN)) return null;
    let admins = [], teachers = [];
    try {
      const s = await getDoc(doc(fs, "config/roles"));
      if (s.exists()) { admins = (s.data().admins || []).map((x) => x.toLowerCase()); teachers = (s.data().teachers || []).map((x) => x.toLowerCase()); }
    } catch (e) { /* not readable yet */ }
    if (BOOT_ADMIN && email === BOOT_ADMIN) return "admin"; // only the owner edits
    if (teachers.includes(email)) return "teacher";
    return "student";
  }

  onAuthStateChanged(auth, async (u) => {
    current = u ? { uid: u.uid, email: u.email, name: u.displayName || "", emailVerified: u.emailVerified } : null;
    role = await loadRole(u);
    window.TPE.user = current; window.TPE.role = role;
    listeners.forEach((cb) => { try { cb(current, role); } catch (e) { console.error(e); } });
  });

  window.TPE = {
    configured: true, user: null, role: null, domain: DOMAIN, db,
    onAuth(cb) { listeners.push(cb); },
    async signIn(email, pw) { await signInWithEmailAndPassword(auth, email.trim(), pw); },
    async signUp(email, pw, name) {
      email = email.trim().toLowerCase();
      if (!email.endsWith("@" + DOMAIN)) throw { code: "tpe/domain" };
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      if (name) await updateProfile(cred.user, { displayName: name });
      await sendEmailVerification(cred.user);
    },
    async resend() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
    async refresh() {
      if (!auth.currentUser) return null;
      await auth.currentUser.reload(); await auth.currentUser.getIdToken(true);
      const u = auth.currentUser;
      current = { uid: u.uid, email: u.email, name: u.displayName || "", emailVerified: u.emailVerified };
      role = await loadRole(u); window.TPE.user = current; window.TPE.role = role;
      listeners.forEach((cb) => cb(current, role));
      return current;
    },
    async reset(email) { await sendPasswordResetEmail(auth, email.trim()); },
    // Sign-in token for the attendance Sheet script, which checks it with Google before doing anything.
    idToken() { return auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error("bad-token")); },
    async signOut() { await signOut(auth); }
  };
  ready();
}
