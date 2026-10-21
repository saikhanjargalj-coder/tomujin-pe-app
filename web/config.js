// Tomujin PE — public settings.
// The Firebase web config below is SAFE to publish: it only identifies the project.
// Who can read or write what is decided by firestore.rules on the server.
//
// Where to find it: Firebase console → Project settings (⚙) → General → "Your apps" → Web app → "SDK setup and configuration" → Config
window.TPE_CONFIG = {
  firebase: {
    apiKey: "PASTE_API_KEY",
    authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
    projectId: "PASTE_PROJECT_ID",
    storageBucket: "PASTE_PROJECT_ID.appspot.com",
    messagingSenderId: "PASTE_SENDER_ID",
    appId: "PASTE_APP_ID"
  },
  SCHOOL_DOMAIN: "tomujin.edu.mn",
  // This account is always an admin, even before the roles list exists.
  // It must match the email written in firestore.rules.
  ADMIN_EMAIL: "saikhanjargal.j@tomujin.edu.mn",
  ACADEMIC_YEAR: "2026-27"
};
