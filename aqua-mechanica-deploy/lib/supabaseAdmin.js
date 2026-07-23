const { createClient } = require("@supabase/supabase-js");

let client = null;

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * NEVER expose this key or this client to the browser — it bypasses Row Level Security.
 * Only import/use this inside /api functions (server-side Vercel functions).
 */
function getSupabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Set them in your Vercel project settings (Project -> Settings -> Environment Variables)."
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

module.exports = { getSupabaseAdmin };
