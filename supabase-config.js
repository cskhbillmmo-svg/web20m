// === Supabase config ===
// Paste your project URL and anon public key here.
// The anon key is safe to expose in the browser as long as Row-Level Security (RLS)
// is enabled on your tables. Never put service_role key here.

const SUPABASE_URL = "https://xfvftmbqtipluloezxsp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_jWH_2OV3dvkkOo6xjlNHPA_GhpBzViH";

window.sb =
  SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.length > 20
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

if (!window.sb) {
  console.warn("[supabase] Not configured — fill SUPABASE_URL and SUPABASE_ANON_KEY in supabase-config.js");
}
