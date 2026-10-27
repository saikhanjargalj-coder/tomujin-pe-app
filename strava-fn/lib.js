'use strict';
/* Tomujin PE ↔ Strava. Each student connects THEIR OWN Strava and sees only THEIR OWN activities.

   Strava's API Agreement and API Policy (June 2026) shape everything here:
   - A person's Strava data is shown only to that person: never to teachers, classmates or the public.
     The teacher sees only what the student chooses to write into their training log.
   - Strava data is not kept. Activities are fetched live; a short copy is reused for 10 minutes to save
     API calls and is deleted within 24 hours (daily clean-up). Maps, GPS and location are dropped.
   - Tokens live in a server-only collection (no client can read it) and are deleted when the student
     disconnects or when Strava says the connection is gone.
   - The secret key never reaches the browser.

   This file has no Firebase imports so it can be tested with stand-ins (see test.js). index.js wires it up. */

const crypto = require('crypto');

const ORIGINS = ['https://tomujin-pe.web.app', 'https://tomujin-pe.firebaseapp.com', 'https://pe.tomujin.edu.mn'];
const DOMAIN = '@tomujin.edu.mn';
const SCOPE = 'read,activity:read_all';      // read_all: activities set to "Only you" also show, to their owner only
const CACHE_MS = 10 * 60e3;                 // reuse a student's list for 10 minutes
const FORCE_MS = 60e3;                      // "refresh" button: at most once a minute
const STATE_MS = 15 * 60e3;                 // the Strava sign-in page must be finished within 15 minutes
const DAYS = 30;                            // show the last 30 days
const WEBHOOK_TOKEN = 'tomujin-pe-strava';  // only confirms that we asked for the webhook; not a secret
const API = 'https://www.strava.com';

function fail(status, code) { const e = new Error(code); e.status = status; e.code = code; return e; }

/* Only what the student needs to see and log. No map, no polyline, no start/end coordinates, no device, no gear. */
function slim(a) {
  const n = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
  return {
    id: String(a.id),
    n: String(a.name || '').slice(0, 120),
    sp: String(a.sport_type || a.type || ''),
    t: Date.parse(a.start_date) || 0,
    mv: Math.round(n(a.moving_time)),
    el: Math.round(n(a.elapsed_time)),
    d: Math.round(n(a.distance)),
    up: Math.round(n(a.total_elevation_gain)),
    hr: a.has_heartrate && a.average_heartrate ? Math.round(a.average_heartrate) : null,
    mhr: a.has_heartrate && a.max_heartrate ? Math.round(a.max_heartrate) : null
  };
}

/* d = { db, verify(idToken) -> decoded token, fetch, now() -> ms, clientId() -> string, secret() -> string,
         base: public URL of this function without trailing slash, origins?: allowed site addresses } */
function makeHandler(d) {
  const origins = d.origins || ORIGINS;
  const pickOrigin = (o) => (origins.indexOf(o) >= 0 ? o : origins[0]);
  const form = (o) => new URLSearchParams(o).toString();

  async function me(req) {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!m) throw fail(401, 'bad-token');
    let t;
    try { t = await d.verify(m[1]); } catch (e) { throw fail(401, 'bad-token'); }
    const email = String(t.email || '').toLowerCase();
    if (!t.email_verified || !email.endsWith(DOMAIN)) throw fail(403, 'not-allowed');
    return t.uid;
  }

  async function unlink(uid) {
    const b = d.db.batch();
    b.delete(d.db.doc('stravaTokens/' + uid));
    b.delete(d.db.doc('stravaCache/' + uid));
    b.delete(d.db.doc('users/' + uid + '/strava/link'));
    await b.commit();
  }

  async function start(uid, body) {
    const state = crypto.randomBytes(24).toString('base64url');
    await d.db.doc('stravaState/' + state).set({ uid, origin: pickOrigin(body.origin), at: d.now() });
    const q = new URLSearchParams({
      client_id: d.clientId(), redirect_uri: d.base + '/callback', response_type: 'code',
      approval_prompt: 'auto', scope: SCOPE, state
    });
    return { url: API + '/oauth/authorize?' + q.toString() };
  }

  async function callback(req, res) {
    const back = (origin, r) => res.redirect(302, origin + '/?strava=' + r + '#strava');
    const st = String(req.query.state || ''), code = String(req.query.code || '');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(st)) return back(origins[0], 'expired');
    const ref = d.db.doc('stravaState/' + st);
    const snap = await ref.get();
    if (!snap.exists) return back(origins[0], 'expired');
    const s = snap.data();
    await ref.delete();                                   // one use only
    const origin = pickOrigin(s.origin);
    if (d.now() - s.at > STATE_MS) return back(origin, 'expired');
    if (req.query.error || !code) return back(origin, 'denied');
    const scope = String(req.query.scope || '').split(',');
    if (scope.indexOf('activity:read') < 0 && scope.indexOf('activity:read_all') < 0) return back(origin, 'scope');

    const r = await d.fetch(API + '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: d.clientId(), client_secret: d.secret(), code, grant_type: 'authorization_code' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      const msg = JSON.stringify(j).toLowerCase();
      console.warn('strava token exchange failed', r.status, msg.slice(0, 300));
      return back(origin, /limit|capacity|exceed/.test(msg) ? 'full' : 'fail');
    }
    const athlete = String((j.athlete && j.athlete.id) || '');
    // One Strava account belongs to one school account: an older link to the same Strava account is removed.
    if (athlete) {
      const old = await d.db.collection('stravaTokens').where('athleteId', '==', athlete).get();
      for (const doc of old.docs) if (doc.id !== s.uid) await unlink(doc.id);
    }
    const b = d.db.batch();
    b.set(d.db.doc('stravaTokens/' + s.uid), {
      athleteId: athlete, access: j.access_token, refresh: j.refresh_token,
      expiresAt: (j.expires_at || 0) * 1000, scope: scope.join(','), at: d.now()
    });
    b.set(d.db.doc('users/' + s.uid + '/strava/link'), { on: true, at: d.now(), all: scope.indexOf('activity:read_all') >= 0 });
    b.delete(d.db.doc('stravaCache/' + s.uid));
    await b.commit();
    return back(origin, 'ok');
  }

  async function fresh(uid, tref, tok) {
    if (tok.expiresAt - d.now() > 120e3) return tok;
    const r = await d.fetch(API + '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: d.clientId(), client_secret: d.secret(), grant_type: 'refresh_token', refresh_token: tok.refresh })
    });
    if (r.status === 400 || r.status === 401) { await unlink(uid); throw fail(409, 'not-linked'); }
    if (r.status === 429) throw fail(503, 'busy');
    if (!r.ok) throw fail(502, 'strava');
    const j = await r.json();
    const next = Object.assign({}, tok, { access: j.access_token, refresh: j.refresh_token || tok.refresh, expiresAt: (j.expires_at || 0) * 1000 });
    await tref.set(next);
    return next;
  }

  async function activities(uid, body) {
    const tref = d.db.doc('stravaTokens/' + uid);
    const ts = await tref.get();
    if (!ts.exists) throw fail(409, 'not-linked');
    const cref = d.db.doc('stravaCache/' + uid);
    const c = await cref.get();
    if (c.exists) {
      const age = d.now() - c.data().at;
      if (age < (body.force ? FORCE_MS : CACHE_MS)) return { items: c.data().items, at: c.data().at };
    }
    const tok = await fresh(uid, tref, ts.data());
    const after = Math.floor((d.now() - DAYS * 864e5) / 1000);
    const r = await d.fetch(API + '/api/v3/athlete/activities?per_page=60&after=' + after, { headers: { Authorization: 'Bearer ' + tok.access } });
    if (r.status === 401) { await unlink(uid); throw fail(409, 'not-linked'); }
    if (r.status === 429) throw fail(503, 'busy');
    if (!r.ok) throw fail(502, 'strava');
    const list = await r.json();
    const items = (Array.isArray(list) ? list : []).map(slim).sort((a, b) => b.t - a.t);
    const at = d.now();
    await cref.set({ at, items });
    return { items, at };
  }

  async function disconnect(uid) {
    const tref = d.db.doc('stravaTokens/' + uid);
    const ts = await tref.get();
    if (ts.exists) {
      try {
        const tok = await fresh(uid, tref, ts.data());
        // Tells Strava to forget this app for this athlete. oauth/deauthorize works until 1 June 2027;
        // Strava's replacement is POST /oauth/revoke (switch before then).
        await d.fetch(API + '/oauth/deauthorize', { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access } });
      } catch (e) { /* the link is removed on our side either way */ }
    }
    await unlink(uid);
    return { ok: true };
  }

  /* Strava tells us when an athlete removes this app on Strava's side: the stored link goes at once. */
  async function webhook(req, res) {
    if (req.method === 'GET') {
      if (req.query['hub.verify_token'] !== WEBHOOK_TOKEN) return res.status(403).json({ error: 'verify' });
      return res.json({ 'hub.challenge': String(req.query['hub.challenge'] || '') });
    }
    const e = req.body || {};
    if (e.object_type === 'athlete' && e.updates && String(e.updates.authorized) === 'false') {
      const q = await d.db.collection('stravaTokens').where('athleteId', '==', String(e.owner_id || e.object_id || '')).get();
      for (const doc of q.docs) await unlink(doc.id);
    }
    return res.status(200).json({ ok: true });
  }

  return async function handler(req, res) {
    const origin = req.get('origin') || '';
    if (origins.indexOf(origin) >= 0) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Max-Age', '3600');
      return res.status(204).send('');
    }
    const path = String(req.path || '/').replace(/\/+$/, '') || '/';
    try {
      if (path === '/webhook') return await webhook(req, res);
      if (req.method === 'GET' && path === '/callback') return await callback(req, res);
      if (req.method === 'GET' && path === '/ping') return res.json({ ok: true });
      if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
      const uid = await me(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (path === '/start') return res.json(await start(uid, body));
      if (path === '/activities') return res.json(await activities(uid, body));
      if (path === '/disconnect') return res.json(await disconnect(uid));
      return res.status(404).json({ error: 'not-found' });
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return res.status(status).json({ error: e.code && e.status ? e.code : 'server' });
    }
  };
}

/* Daily: delete activity copies older than a day and sign-in attempts older than an hour. */
async function cleanup(db, now) {
  let n = 0;
  for (const [coll, age] of [['stravaCache', 24 * 3600e3], ['stravaState', 3600e3]]) {
    const q = await db.collection(coll).where('at', '<', now - age).get();
    for (const doc of q.docs) { await doc.ref.delete(); n++; }
  }
  return n;
}

module.exports = { makeHandler, cleanup, slim, ORIGINS, SCOPE, WEBHOOK_TOKEN };
