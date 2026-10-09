// Public settings for the browser. These two values are SAFE to publish:
// the publishable (anon) key only allows what the database RLS policies allow.
// NEVER put the service_role / secret key here.
//
// Where to find them: Supabase dashboard → Project Settings → API
//   SUPABASE_URL  = "Project URL"
//   SUPABASE_KEY  = "Publishable key" (sb_publishable_...) or the legacy "anon public" key
window.TOMUJIN_CONFIG = {
  SUPABASE_URL: "https://pyetbbcnbsglkrqjgujm.supabase.co",
  SUPABASE_KEY: "",
  ACADEMIC_YEAR: "2026-27",
  SCHOOL_DOMAIN: "tomujin.edu.mn",
  // Show the "Sign in with Google" button (requires Google provider set up in Supabase).
  GOOGLE_LOGIN: true
};
