// radar-sync — bridges Lead Radar prospects into GoHighLevel with the two-stage
// tag flow that keeps automations legal:
//   action "push"      → creates the GHL contact tagged radar-prospect + <trade>
//                        (NO automations should trigger on this tag — no consent yet)
//   action "contacted" → adds the radar-contacted tag once the client confirms a
//                        real conversation happened; wire your GHL workflows to
//                        trigger on radar-contacted.
//
// Deploy:  supabase functions deploy radar-sync --no-verify-jwt
// Secrets: GHL_TOKEN (sub-account token) — same ones the other functions use.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

async function verifyUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_SERVICE) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_SERVICE } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? "" } : null;
  } catch { return null; }
}

async function ghlToken(): Promise<string> {
  if (GHL_TOKEN) return GHL_TOKEN;
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

  const user = await verifyUser(req);
  if (!user) return json({ ok: false, error: "not signed in" }, 401);

  let body: { action?: string; address?: string; trade?: string; note?: string; ghlId?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  const token = await ghlToken();
  if (!token) return json({ ok: false, error: "no GHL token configured" }, 500);
  const locId = GHL_LOCATION_ID;

  if (body.action === "push") {
    const address = (body.address ?? "").toString().slice(0, 160).trim();
    if (!address) return json({ ok: false, error: "address required" }, 400);
    const trade = (body.trade ?? "radar").toString().slice(0, 40);
    const cbody: Record<string, unknown> = { name: "Radar — " + address, address1: address, source: "Lead Radar", tags: ["radar-prospect", trade] };
    if (locId) cbody.locationId = locId;
    const r = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify(cbody) });
    const d = await r.json().catch(() => ({}));
    const cid = d?.contact?.id || d?.id || "";
    if (r.ok && cid && body.note) {
      await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify({ body: String(body.note).slice(0, 500) }) }).catch(() => {});
    }
    return json({ ok: r.ok, status: r.status, ghlId: cid });
  }

  if (body.action === "contacted") {
    const cid = (body.ghlId ?? "").toString().trim();
    if (!cid) return json({ ok: false, error: "ghlId required" }, 400);
    const r = await fetch(`${GHL_BASE}/contacts/${cid}/tags`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify({ tags: ["radar-contacted"] }) });
    const d = await r.json().catch(() => ({}));
    return json({ ok: r.ok, status: r.status, data: d });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
