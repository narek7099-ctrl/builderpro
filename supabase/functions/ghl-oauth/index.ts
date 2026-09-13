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

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title>` +
    `<body style="font:16px -apple-system,sans-serif;background:#0e0e13;color:#eceaf3;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">` +
    `<div><h1 style="color:#7c5cff">${title}</h1><p style="color:#9b98a8;max-width:420px">${body}</p></div></body>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return page("Nothing to do", "Open the Connect link from your app to authorize.");
  if (!CLIENT_ID || !CLIENT_SECRET) return page("Not configured", "GHL_CLIENT_ID / GHL_CLIENT_SECRET secrets are missing.");

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
    if (!r.ok || !d.access_token) return page("Authorize failed", `GHL said: ${JSON.stringify(d).slice(0, 300)}`);

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
    if (!save.ok) return page("Saved token but…", `Could not write to ghl_oauth (${save.status}). Did you run the SQL?`);

    return page("Connected! ✅", "Your agency is linked. The command center can now reach every sub-account automatically. You can close this tab.");
  } catch (e) {
    return page("Error", String(e).slice(0, 200));
  }
});
