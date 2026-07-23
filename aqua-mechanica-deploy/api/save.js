// POST /api/save
// Body: raw JSON game state (whatever serializeState() in the client produces)
// Header: Authorization: Bearer <supabase access_token>
//
// This function verifies the caller's Supabase session token, then upserts
// their save data into the `saves` table keyed by their auth user id.

const { getSupabaseAdmin } = require("../lib/supabaseAdmin");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
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

  // Verify the token and get the user it belongs to.
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  const userId = userData.user.id;

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Body must be valid JSON" });
      return;
    }
  }
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "Missing save payload" });
    return;
  }

  const { error: upsertError } = await supabase
    .from("saves")
    .upsert(
      {
        user_id: userId,
        state: body,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    res.status(500).json({ error: upsertError.message });
    return;
  }

  res.status(200).json({ ok: true });
};
