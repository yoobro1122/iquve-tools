// GET /api/load
// Header: Authorization: Bearer <supabase access_token>
// Returns: { state: <saved game state> | null }

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const supabase = getSupabaseAdmin();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const userId = userData.user.id;

  const { data, error } = await supabase
    .from("saves")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ state: data ? data.state : null, updated_at: data ? data.updated_at : null });
};
