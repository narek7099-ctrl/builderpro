// quickbooks-oauth — where Intuit sends the browser back after "Allow".
//
// This URL is the Redirect URI registered on the Intuit app:
//   https://<project>.supabase.co/functions/v1/quickbooks-oauth
// Deploy with JWT verification OFF: Intuit's redirect carries no Supabase
// login. Who it belongs to is proven by `state`, a one-time random value
// quickbooks-sync stored on the owner's row a few minutes earlier.
//
//   GET ?code=…&state=…&realmId=…   -> trade the code for tokens, save, go back
//   GET ?error=access_denied&state=… -> clear the state, go back
//
// Secrets: QB_CLIENT_ID, QB_CLIENT_SECRET, optional QB_ENV (sandbox|production,
// default sandbox), optional PORTAL_RETURN_URL.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CID = Deno.env.get("QB_CLIENT_ID") ?? "";
const CSECRET = Deno.env.get("QB_CLIENT_SECRET") ?? "";
const ENV = (Deno.env.get("QB_ENV") || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
const RETURN_URL = Deno.env.get("PORTAL_RETURN_URL") || "https://builderpro-os.com/";
const REDIRECT = `${SB_URL}/functions/v1/quickbooks-oauth`;
const API = ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";

const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, Prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const back = (result: string) =>
  new Response(null, { status: 302, headers: { Location: `${RETURN_URL}#qb=${encodeURIComponent(result)}` } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const state = u.searchParams.get("state") || "";
  if (!state || state.length < 20) return back("error");
  const rows = await rest(`qb_connections?oauth_state=eq.${encodeURIComponent(state)}&select=owner,oauth_state_at`).catch(() => []);
  const row = rows && rows[0];
  if (!row || Date.now() - Date.parse(row.oauth_state_at) > 15 * 60 * 1000) return back("expired");
  const clear = { oauth_state: null, oauth_state_at: null, updated_at: new Date().toISOString() };

  if (u.searchParams.get("error") || !u.searchParams.get("code") || !u.searchParams.get("realmId")) {
    await rest(`qb_connections?owner=eq.${row.owner}`, { method: "PATCH", body: JSON.stringify(clear) }).catch(() => {});
    return back("cancelled");
  }
  try {
    const tok = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${CID}:${CSECRET}`), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: u.searchParams.get("code")!, redirect_uri: REDIRECT }),
    });
    const t = await tok.json();
    if (!tok.ok || !t.access_token) throw new Error(t.error_description || t.error || `token ${tok.status}`);
    const realm = u.searchParams.get("realmId")!;
    let company = "";
    try {
      const ci = await fetch(`${API}/v3/company/${realm}/companyinfo/${realm}?minorversion=73`, { headers: { Authorization: `Bearer ${t.access_token}`, Accept: "application/json" } });
      company = (await ci.json())?.CompanyInfo?.CompanyName || "";
    } catch (_) { /* the name is a nicety */ }
    const now = Date.now();
    await rest(`qb_connections?owner=eq.${row.owner}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...clear, env: ENV, realm_id: realm, company_name: company,
        access_token: t.access_token, refresh_token: t.refresh_token,
        access_expires_at: new Date(now + (t.expires_in || 3600) * 1000).toISOString(),
        refresh_expires_at: new Date(now + (t.x_refresh_token_expires_in || 8640000) * 1000).toISOString(),
        connected_at: new Date().toISOString(),
      }),
    });
    return back("connected");
  } catch (e) {
    console.error("qb oauth", (e as Error).message);
    await rest(`qb_connections?owner=eq.${row.owner}`, { method: "PATCH", body: JSON.stringify(clear) }).catch(() => {});
    return back("error");
  }
});
