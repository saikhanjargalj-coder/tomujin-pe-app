'use strict';
/* Offline test of lib.js with stand-ins for Firestore, Firebase Auth and Strava. Run: node test.js */
const assert = require('assert');
const { makeHandler, cleanup } = require('./lib');

function memDb() {
  const m = new Map();
  const snap = (p) => ({ id: p.split('/').pop(), exists: m.has(p), data: () => JSON.parse(JSON.stringify(m.get(p))), ref: { delete: async () => m.delete(p) } });
  const doc = (p) => ({ get: async () => snap(p), set: async (v) => { m.set(p, JSON.parse(JSON.stringify(v))); }, delete: async () => { m.delete(p); }, _p: p });
  return {
    m, doc,
    collection: (c) => ({
      where: (f, op, v) => ({
        get: async () => ({ docs: [...m.keys()].filter((k) => k.split('/').length === 2 && k.startsWith(c + '/')).filter((k) => { const x = m.get(k)[f]; return op === '==' ? x === v : x < v; }).map(snap) })
      })
    }),
    batch: () => { const ops = []; return { set: (r, v) => ops.push(() => r.set(v)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const o of ops) await o(); } }; }
  };
}

let NOW = Date.UTC(2026, 9, 27, 4, 0, 0);
const calls = [];
let stravaReply = {};
async function fakeFetch(url, o) {
  calls.push({ url, o });
  const key = Object.keys(stravaReply).find((k) => url.indexOf(k) >= 0);
  const r = key ? stravaReply[key](url, o) : { status: 404, body: {} };
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
}
const USERS = { good: { uid: 'u1', email: 'bat@tomujin.edu.mn', email_verified: true }, other: { uid: 'u2', email: 'sod@tomujin.edu.mn', email_verified: true },
  gmail: { uid: 'u3', email: 'x@gmail.com', email_verified: true }, unverified: { uid: 'u4', email: 'y@tomujin.edu.mn', email_verified: false } };

const db = memDb();
const handler = makeHandler({
  db, fetch: fakeFetch, now: () => NOW, clientId: () => '12345', secret: () => 'shh-secret',
  verify: async (t) => { if (!USERS[t]) throw new Error('bad'); return USERS[t]; },
  base: 'https://asia-east1-tomujin-pe.cloudfunctions.net/strava'
});

function call(method, path, { token, body, query, origin } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const req = { method, path, body, query: query || {}, get: (h) => ({ authorization: token ? 'Bearer ' + token : '', origin: origin || 'https://tomujin-pe.web.app' })[h.toLowerCase()] };
    const res = {
      code: 200, headers,
      set(k, v) { headers[k] = v; return res; }, status(c) { res.code = c; return res; },
      json(b) { resolve({ code: res.code, body: b, headers }); }, send(b) { resolve({ code: res.code, body: b, headers }); },
      redirect(c, u) { resolve({ code: c, location: u, headers }); }
    };
    handler(req, res);
  });
}

const act = (id, name, sport, startIso, moving, dist, hr) => ({ id, name, sport_type: sport, type: sport, start_date: startIso, moving_time: moving, elapsed_time: moving + 60, distance: dist,
  total_elevation_gain: 12, has_heartrate: !!hr, average_heartrate: hr, max_heartrate: hr ? hr + 20 : undefined,
  map: { summary_polyline: 'SECRET_POLYLINE' }, start_latlng: [47.9, 106.9], end_latlng: [47.9, 106.9], device_name: 'Watch' });

(async () => {
  // CORS preflight only for the school's own addresses
  let r = await call('OPTIONS', '/start');
  assert.strictEqual(r.code, 204); assert.strictEqual(r.headers['Access-Control-Allow-Origin'], 'https://tomujin-pe.web.app');
  r = await call('OPTIONS', '/start', { origin: 'https://evil.example' });
  assert.strictEqual(r.headers['Access-Control-Allow-Origin'], undefined);

  // sign-in is required, and only verified school accounts
  r = await call('POST', '/start'); assert.strictEqual(r.code, 401);
  r = await call('POST', '/start', { token: 'nope' }); assert.strictEqual(r.code, 401);
  r = await call('POST', '/start', { token: 'gmail' }); assert.strictEqual(r.code, 403);
  r = await call('POST', '/start', { token: 'unverified' }); assert.strictEqual(r.code, 403);
  r = await call('POST', '/activities', { token: 'good', body: {} }); assert.strictEqual(r.code, 409); assert.strictEqual(r.body.error, 'not-linked');

  // start: a Strava sign-in link with a one-time state; the secret is never in it
  r = await call('POST', '/start', { token: 'good', body: { origin: 'https://evil.example' } });
  assert.strictEqual(r.code, 200);
  const u = new URL(r.body.url);
  assert.strictEqual(u.origin + u.pathname, 'https://www.strava.com/oauth/authorize');
  assert.strictEqual(u.searchParams.get('client_id'), '12345');
  assert.strictEqual(u.searchParams.get('redirect_uri'), 'https://asia-east1-tomujin-pe.cloudfunctions.net/strava/callback');
  assert.strictEqual(u.searchParams.get('scope'), 'read,activity:read_all');
  assert.ok(r.body.url.indexOf('shh-secret') < 0);
  const state = u.searchParams.get('state');
  assert.strictEqual(db.m.get('stravaState/' + state).origin, 'https://tomujin-pe.web.app', 'unknown origin falls back to the real site');

  // callback: student pressed "Cancel" on Strava
  r = await call('GET', '/callback', { query: { state, error: 'access_denied' } });
  assert.strictEqual(r.code, 302); assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=denied#strava');
  // the same state cannot be used twice
  r = await call('GET', '/callback', { query: { state, code: 'abc', scope: 'read,activity:read_all' } });
  assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=expired#strava');
  // made-up state
  r = await call('GET', '/callback', { query: { state: '../../users/u1', code: 'abc' } });
  assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=expired#strava');

  // activities not allowed (only "read" ticked)
  let s2 = new URL((await call('POST', '/start', { token: 'good', body: { origin: 'https://pe.tomujin.edu.mn' } })).body.url).searchParams.get('state');
  r = await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read' } });
  assert.strictEqual(r.location, 'https://pe.tomujin.edu.mn/?strava=scope#strava');

  // took too long on Strava's page
  s2 = new URL((await call('POST', '/start', { token: 'good', body: {} })).body.url).searchParams.get('state');
  NOW += 16 * 60e3;
  r = await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=expired#strava');

  // app is full (Strava's athlete limit)
  stravaReply['/oauth/token'] = () => ({ status: 403, body: { message: 'Limit of connected athletes exceeded' } });
  s2 = new URL((await call('POST', '/start', { token: 'good', body: {} })).body.url).searchParams.get('state');
  r = await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=full#strava');

  // success
  stravaReply['/oauth/token'] = (url, o) => {
    const p = new URLSearchParams(o.body);
    assert.strictEqual(p.get('client_secret'), 'shh-secret');
    if (p.get('grant_type') === 'authorization_code') return { status: 200, body: { access_token: 'A1', refresh_token: 'R1', expires_at: Math.floor(NOW / 1000) + 6 * 3600, athlete: { id: 777, firstname: 'Bat' } } };
    return { status: 200, body: { access_token: 'A2', refresh_token: 'R2', expires_at: Math.floor(NOW / 1000) + 6 * 3600 } };
  };
  s2 = new URL((await call('POST', '/start', { token: 'good', body: {} })).body.url).searchParams.get('state');
  r = await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  assert.strictEqual(r.location, 'https://tomujin-pe.web.app/?strava=ok#strava');
  assert.strictEqual(db.m.get('stravaTokens/u1').athleteId, '777');
  assert.strictEqual(db.m.get('users/u1/strava/link').on, true);
  assert.strictEqual(JSON.stringify(db.m.get('users/u1/strava/link')).indexOf('A1'), -1, 'token never in the student-readable doc');
  assert.ok(!db.m.has('stravaState/' + s2));

  // activities: slimmed, newest first, no map or location
  stravaReply['/api/v3/athlete/activities'] = (url, o) => {
    assert.strictEqual(o.headers.Authorization, 'Bearer ' + db.m.get('stravaTokens/u1').access);
    assert.ok(/after=\d+/.test(url));
    return { status: 200, body: [act(11, 'Өглөөний гүйлт', 'Run', '2026-10-20T23:30:00Z', 1800, 5000, 150), act(12, 'Заал', 'WeightTraining', '2026-10-25T09:00:00Z', 2700, 0, null)] };
  };
  const before = calls.length;
  r = await call('POST', '/activities', { token: 'good', body: {} });
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(r.body.items.map((x) => x.id), ['12', '11']);
  assert.deepStrictEqual(r.body.items[1], { id: '11', n: 'Өглөөний гүйлт', sp: 'Run', t: Date.parse('2026-10-20T23:30:00Z'), mv: 1800, el: 1860, d: 5000, up: 12, hr: 150, mhr: 170 });
  assert.strictEqual(r.body.items[0].hr, null);
  assert.ok(JSON.stringify(db.m.get('stravaCache/u1')).indexOf('POLYLINE') < 0 && JSON.stringify(r.body).indexOf('47.9') < 0);
  // reused for 10 minutes; "refresh" at most once a minute
  r = await call('POST', '/activities', { token: 'good', body: {} });
  assert.strictEqual(calls.length, before + 1);
  NOW += 30e3; r = await call('POST', '/activities', { token: 'good', body: { force: true } });
  assert.strictEqual(calls.length, before + 1);
  NOW += 40e3; r = await call('POST', '/activities', { token: 'good', body: { force: true } });
  assert.strictEqual(calls.length, before + 2);

  // another student cannot read u1's activities: they have no link of their own
  r = await call('POST', '/activities', { token: 'other', body: {} });
  assert.strictEqual(r.code, 409);

  // token expiry -> refreshed and the new refresh token kept
  NOW += 7 * 3600e3;
  r = await call('POST', '/activities', { token: 'good', body: {} });
  assert.strictEqual(r.code, 200);
  assert.strictEqual(db.m.get('stravaTokens/u1').access, 'A2'); assert.strictEqual(db.m.get('stravaTokens/u1').refresh, 'R2');

  // Strava busy
  NOW += 11 * 60e3; stravaReply['/api/v3/athlete/activities'] = () => ({ status: 429, body: {} });
  r = await call('POST', '/activities', { token: 'good', body: {} });
  assert.strictEqual(r.code, 503); assert.strictEqual(r.body.error, 'busy');

  // the same Strava account connected from another school account moves there
  s2 = new URL((await call('POST', '/start', { token: 'other', body: {} })).body.url).searchParams.get('state');
  NOW += 1000;
  r = await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  assert.ok(db.m.has('stravaTokens/u2') && !db.m.has('stravaTokens/u1') && !db.m.has('users/u1/strava/link'));

  // revoked on Strava's side -> 401 -> link removed
  stravaReply['/api/v3/athlete/activities'] = () => ({ status: 401, body: {} });
  r = await call('POST', '/activities', { token: 'other', body: {} });
  assert.strictEqual(r.code, 409); assert.ok(!db.m.has('stravaTokens/u2') && !db.m.has('users/u2/strava/link'));

  // webhook: verification and deauthorization
  r = await call('GET', '/webhook', { query: { 'hub.verify_token': 'wrong', 'hub.challenge': 'x' } }); assert.strictEqual(r.code, 403);
  r = await call('GET', '/webhook', { query: { 'hub.verify_token': 'tomujin-pe-strava', 'hub.challenge': 'xyz' } }); assert.deepStrictEqual(r.body, { 'hub.challenge': 'xyz' });
  stravaReply['/oauth/token'] = () => ({ status: 200, body: { access_token: 'A9', refresh_token: 'R9', expires_at: Math.floor(NOW / 1000) + 6 * 3600, athlete: { id: 888 } } });
  s2 = new URL((await call('POST', '/start', { token: 'good', body: {} })).body.url).searchParams.get('state');
  await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  assert.ok(db.m.has('stravaTokens/u1'));
  r = await call('POST', '/webhook', { body: { object_type: 'athlete', aspect_type: 'update', object_id: 888, owner_id: 888, updates: { authorized: 'false' } } });
  assert.strictEqual(r.code, 200); assert.ok(!db.m.has('stravaTokens/u1'));

  // disconnect from the site
  s2 = new URL((await call('POST', '/start', { token: 'good', body: {} })).body.url).searchParams.get('state');
  await call('GET', '/callback', { query: { state: s2, code: 'abc', scope: 'read,activity:read_all' } });
  stravaReply['/oauth/deauthorize'] = (url, o) => { assert.strictEqual(o.headers.Authorization, 'Bearer A9'); return { status: 200, body: {} }; };
  r = await call('POST', '/disconnect', { token: 'good', body: {} });
  assert.deepStrictEqual(r.body, { ok: true }); assert.ok(!db.m.has('stravaTokens/u1') && !db.m.has('users/u1/strava/link'));
  assert.ok(calls.some((c) => c.url.indexOf('/oauth/deauthorize') >= 0));

  // daily clean-up
  db.m.set('stravaCache/old', { at: NOW - 25 * 3600e3, items: [] }); db.m.set('stravaCache/new', { at: NOW - 3600e3, items: [] });
  db.m.set('stravaState/oldstate', { at: NOW - 2 * 3600e3 });
  await cleanup(db, NOW);
  assert.ok(!db.m.has('stravaCache/old') && db.m.has('stravaCache/new') && !db.m.has('stravaState/oldstate'));

  // unknown path / wrong method
  r = await call('GET', '/activities'); assert.strictEqual(r.code, 405);
  r = await call('POST', '/nothing', { token: 'good' }); assert.strictEqual(r.code, 404);
  r = await call('GET', '/ping'); assert.deepStrictEqual(r.body, { ok: true });

  console.log('strava-fn: all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
