'use strict';
/* Cloud Functions for the Strava link (see STRAVA.md). Deployed on its own from this folder, so the
   site's normal "firebase deploy" is not affected. Needs the Blaze plan and two secrets:
   STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET (from strava.com/settings/api). */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { makeHandler, cleanup } = require('./lib');

admin.initializeApp();
const REGION = 'asia-east1';
const CLIENT_ID = defineSecret('STRAVA_CLIENT_ID');
const CLIENT_SECRET = defineSecret('STRAVA_CLIENT_SECRET');
const PROJECT = process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId;

const db = admin.firestore();
const handler = makeHandler({
  db,
  verify: (t) => admin.auth().verifyIdToken(t),
  fetch: (u, o) => fetch(u, o),
  now: () => Date.now(),
  clientId: () => CLIENT_ID.value().trim(),
  secret: () => CLIENT_SECRET.value().trim(),
  base: 'https://' + REGION + '-' + PROJECT + '.cloudfunctions.net/strava'
});

exports.strava = onRequest(
  { region: REGION, secrets: [CLIENT_ID, CLIENT_SECRET], invoker: 'public', maxInstances: 3, memory: '256MiB', timeoutSeconds: 30 },
  handler
);

exports.stravaCleanup = onSchedule(
  { schedule: 'every day 04:00', timeZone: 'Asia/Ulaanbaatar', region: REGION },
  async () => { const n = await cleanup(db, Date.now()); console.log('strava cleanup removed', n); }
);
