// job-complete — called by the BuilderPro client portal when a job is marked done.
// Verifies the logged-in client, makes sure the "job-complete" tag exists in the
// GHL sub-account, and applies it to the job's contact. The GHL token never
// reaches the browser.
//
// Deploy:
//   supabase functions deploy job-complete --no-verify-jwt
// Secrets used (already set for the other ghl-* functions):
//   GHL_TOKEN         — sub-account (location) token for the BuilderPro account
//   GHL_LOCATION_ID   — optional; lets us pre-create the tag at the location level
//   GHL_API_KEY / GHL_COMPANY_ID — optional fallbacks for minting a location token

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const TAG = "job-complete";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

async function verifyUser(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_SERVICE) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_SERVICE } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u?.id;
  } catch { return false; }
}

async function ghlToken(): Promise<string> {
  if (GHL_TOKEN) return GHL_TOKEN;
  // fallback: mint a location token from the agency key
  if (GHL_API_KEY && GHL_COMPANY_ID && GHL_LOCATION_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: GHL_LOCATION_ID }).toString(),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
    } catch { /* fall through */ }
  }
  return GHL_API_KEY;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!(await verifyUser(req))) return json({ ok: false, error: "not signed in" }, 401);

  let body: { contactId?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const contactId = (body.contactId ?? "").toString().trim();
  if (!contactId) return json({ ok: false, error: "contactId required" }, 400);

  const token = await ghlToken();
  if (!token) return json({ ok: false, error: "no GHL token configured" }, 500);

  // 1) make sure the tag exists at the location level (best-effort — applying a
  //    tag to a contact also auto-creates it in GHL, so a failure here is fine)
  if (GHL_LOCATION_ID) {
    try {
      await fetch(`${GHL_BASE}/locations/${GHL_LOCATION_ID}/tags`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify({ name: TAG }) });
    } catch { /* ignore — may already exist */ }
  }

  // 2) apply the tag to the contact
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify({ tags: [TAG] }) });
    const d = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: r.status, data: d });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 200) }, 502);
  }
});
