// Tomujin PE — public settings.
// The Firebase web config below is SAFE to publish: it only identifies the project.
// Who can read or write what is decided by firestore.rules on the server.
//
// Where to find it: Firebase console → Project settings (⚙) → General → "Your apps" → Web app → "SDK setup and configuration" → Config
window.TPE_CONFIG = {
  firebase: {
    apiKey: "AIzaSyA60u_RFVZ5Z79NE7pMQxMxKosPkoAL4-E",
    authDomain: "tomujin-pe.firebaseapp.com",
    projectId: "tomujin-pe",
    storageBucket: "tomujin-pe.firebasestorage.app",
    messagingSenderId: "334731538677",
    appId: "1:334731538677:web:a537db0954cd6e4f5795bc"
  },
  SCHOOL_DOMAIN: "tomujin.edu.mn",
  // This account is always an admin, even before the roles list exists.
  // It must match the email written in firestore.rules.
  ADMIN_EMAIL: "saikhanjargal.j@tomujin.edu.mn",
  ACADEMIC_YEAR: "2026-27",
  // Home page: coach photo and contact footer. Leave "" to hide an item.
  COACH_PHOTO: "",   // full https link to a photo, e.g. "https://.../jack.jpg"
  CONTACT: {
    email: "saikhanjargal.j@tomujin.edu.mn",
    phone: "",       // e.g. "+976 9911 2233"
    facebook: "https://www.facebook.com/share/1Lfghqh6Nn/",    // e.g. "https://facebook.com/..."
    instagram: "https://www.instagram.com/jacks.journey1",   // e.g. "https://instagram.com/..."
    youtube: "https://youtube.com/@saikhanjargal1"      // e.g. "https://youtube.com/@..."
  }
};
