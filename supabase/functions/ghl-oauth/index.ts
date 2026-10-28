// ghl-oauth — one-time authorize callback for the GHL Marketplace app.
// GHL redirects here with ?code=... after you click "Connect". We exchange it for
// an agency access_token + refresh_token and store them in the ghl_oauth table.
// The agency function then uses these to auto-mint a token for ANY sub-account.
//
// Deploy:
//   supabase functions deploy ghl-oauth --no-verify-jwt
//   supabase secrets set GHL_CLIENT_ID=... GHL_CLIENT_SECRET=...
// Set this function's URL as the app's Redirect URI.

const CLIENT_ID = Deno.env.get("GHL_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REDIRECT_URI = `${SB_URL}/functions/v1/ghl-oauth`;

// Supabase serves HTML from functions as plain text, so the result is shown on the
// Command Center page instead (it reads ?connected= and ?conn_error=)
const SITE = (Deno.env.get("SITE_URL") ?? "https://builderpro-os.com").replace(/\/$/, "");
const back = (ok: boolean, text: string) => Response.redirect(`${SITE}/command.html?${ok ? "connected" : "conn_error"}=${encodeURIComponent(text)}`, 302);
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return back(false, "Open the install link from the BuilderPro Connect app to connect HighLevel.");
  if (!CLIENT_ID || !CLIENT_SECRET) return back(false, "GHL_CLIENT_ID / GHL_CLIENT_SECRET are missing in Supabase secrets.");

  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      user_type: "Company",
      redirect_uri: REDIRECT_URI,
    });
    const r = await fetch("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) return back(false, `HighLevel turned the connection down: ${JSON.stringify(d).slice(0, 200)}`);

    const expires_at = new Date(Date.now() + (Number(d.expires_in || 86400) - 60) * 1000).toISOString();
    const save = await fetch(`${SB_URL}/rest/v1/ghl_oauth?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE,
        Authorization: `Bearer ${SB_SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ id: 1, access_token: d.access_token, refresh_token: d.refresh_token, company_id: d.companyId ?? d.locationId ?? "", expires_at, updated_at: new Date().toISOString() }),
    });
    if (!save.ok) return back(false, `Connected, but the login couldn't be saved (${save.status}).`);

    return back(true, "HighLevel (BuilderPro Connect)");
  } catch (e) {
    return back(false, String(e).slice(0, 200));
  }
});
