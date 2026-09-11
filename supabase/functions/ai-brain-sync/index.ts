// ai-brain-sync — the portal's "Publish" button for Ridge (the AI receptionist).
// Replaces the old "email the team" flow: the client edits Ridge's knowledge in
// the portal, taps Publish, and this function
//   1) upserts their `ai_brain` row (what ai-chat uses live for web/SMS replies)
//   2) mirrors it into GHL location Custom Values (ridge_services, ridge_pricing,
//      ridge_faq, ridge_rules, ridge_hours, ridge_service_area, ridge_business_name,
//      ridge_tone) — reference those in the Voice AI agent prompt once, e.g.
//      {{custom_values.ridge_services}}, and every publish is live on the phone line.
//
// POST (Authorization: Bearer <client JWT>)
//   { op: "get" }                               -> current brain + publish status
//   { op: "publish", brain: {...}, company: {...} } -> save + sync
//
// Deploy:  supabase functions deploy ai-brain-sync --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in),
//          GHL_TOKEN or (GHL_API_KEY + GHL_COMPANY_ID), GHL_LOCATION_ID

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const AI_NAME = "Ridge";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

async function userFromReq(req: Request): Promise<{ id: string; email: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? "" } : null;
  } catch { return null; }
}

let _tok = "";
async function ghlToken(): Promise<string> {
  if (GHL_TOKEN) return GHL_TOKEN;
  if (_tok) return _tok;
  if (!GHL_API_KEY || !GHL_COMPANY_ID || !LOC) return "";
  try {
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: LOC }).toString(),
    });
    const d = await r.json().catch(() => ({}));
    _tok = d?.access_token ?? "";
  } catch { /* no token */ }
  return _tok;
}

type Row = Record<string, unknown>;
const SAFE = ["slug", "assistant_name", "business_name", "industry", "tone", "services", "pricing", "hours", "service_area", "phone", "booking_url", "faqs", "custom_instructions", "published_at", "ghl_synced_at", "updated_at", "ghl_location_id"];
const pick = (r: Row) => Object.fromEntries(SAFE.map((k) => [k, r[k] ?? null]));

// the client's brain row: owned by them, else the location's row (claimed), else new
async function findBrain(uid: string): Promise<Row | null> {
  const get = async (qs: string) => {
    const r = await fetch(`${SB_URL}/rest/v1/ai_brain?${qs}&select=*&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length ? rows[0] as Row : null;
  };
  const own = await get(`owner=eq.${uid}`);
  if (own) return own;
  if (LOC) {
    const loc = await get(`slug=eq.${encodeURIComponent(LOC)}&owner=is.null`);
    if (loc) {
      await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${loc.id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ owner: uid }) });
      return { ...loc, owner: uid };
    }
  }
  return null;
}

async function syncCustomValues(vals: Record<string, string>): Promise<"synced" | "skipped" | "failed"> {
  const t = await ghlToken();
  if (!t || !LOC) return "skipped";
  try {
    const r = await fetch(`${GHL_BASE}/locations/${LOC}/customValues`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    const existing: Row[] = d?.customValues ?? [];
    const byName = new Map(existing.map((c) => [String(c.name ?? "").toLowerCase(), c]));
    let ok = true;
    for (const [name, value] of Object.entries(vals)) {
      const cur = byName.get(name.toLowerCase());
      const body = JSON.stringify({ name, value: value || "—" });
      const res = cur
        ? await fetch(`${GHL_BASE}/locations/${LOC}/customValues/${cur.id}`, { method: "PUT", headers: ghlH(t), body })
        : await fetch(`${GHL_BASE}/locations/${LOC}/customValues`, { method: "POST", headers: ghlH(t), body });
      if (!res.ok) ok = false;
    }
    return ok ? "synced" : "failed";
  } catch { return "failed"; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);
  const user = await userFromReq(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  let b: { op?: string; brain?: Record<string, string>; company?: Record<string, string> };
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.op === "get") {
    const row = await findBrain(user.id);
    return json({ ok: true, brain: row ? pick(row) : null, ghl_linked: !!LOC });
  }

  if (b.op === "publish") {
    const br = b.brain ?? {}, co = b.company ?? {};
    const s = (v: unknown) => String(v ?? "").slice(0, 6000).trim();
    const now = new Date().toISOString();
    const fields: Row = {
      owner: user.id, is_demo: false, assistant_name: AI_NAME,
      business_name: s(co.name), industry: s(co.trade), tone: s(br.tone) || "Friendly",
      services: s(br.services), pricing: s(br.pricing), faqs: s(br.faq), custom_instructions: s(br.rules),
      hours: s(co.hours), service_area: s(co.serviceArea), phone: s(co.phone),
      published_at: now,
    };
    if (LOC) fields.ghl_location_id = LOC;
    const row = await findBrain(user.id);
    let saved: Row | null = null;
    if (row) {
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${row.id}`, { method: "PATCH", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(fields) });
      const rows = r.ok ? await r.json() : [];
      saved = rows[0] ?? null;
    } else {
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain`, { method: "POST", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify({ ...fields, slug: LOC || `u-${user.id.slice(0, 8)}` }) });
      const rows = r.ok ? await r.json() : [];
      saved = rows[0] ?? null;
    }
    if (!saved) return json({ ok: false, error: "could not save brain" }, 502);

    const ghl = await syncCustomValues({
      ridge_business_name: String(fields.business_name), ridge_tone: String(fields.tone),
      ridge_services: String(fields.services), ridge_pricing: String(fields.pricing),
      ridge_faq: String(fields.faqs), ridge_rules: String(fields.custom_instructions),
      ridge_hours: String(fields.hours), ridge_service_area: String(fields.service_area),
    });
    if (ghl === "synced") {
      await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${saved.id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ ghl_synced_at: now }) });
      saved.ghl_synced_at = now;
    }
    return json({ ok: true, brain: pick(saved), ghl });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
