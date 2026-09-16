// ai-brain-sync — the portal's "Publish" button for the AI receptionist (Atlas by default; clients can rename it).
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
//   { op: "calendars" }                         -> the calendars in their GHL sub-account
//   { op: "set_calendar", calendarId }          -> which one takes public inspection bookings
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
const AI_NAME = "Atlas";

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

// a token for whichever sub-account this client owns, not just the LOC secret
const locTokCache: Record<string, string> = {};
async function locationToken(locationId: string): Promise<string> {
  if (!locationId || locationId === LOC) return (await ghlToken()) || GHL_TOKEN;
  if (locTokCache[locationId]) return locTokCache[locationId];
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) { locTokCache[locationId] = perLoc; return perLoc; }
  if (GHL_API_KEY && GHL_COMPANY_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString(),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) { locTokCache[locationId] = d.access_token; return d.access_token; } }
    } catch { /* fall through */ }
  }
  return GHL_TOKEN;
}

type Row = Record<string, unknown>;
const SAFE = ["slug", "assistant_name", "business_name", "industry", "tone", "services", "pricing", "hours", "service_area", "phone", "booking_url", "faqs", "custom_instructions", "published_at", "ghl_synced_at", "updated_at", "ghl_location_id", "booking_calendar_id"];
const pick = (r: Row) => Object.fromEntries(SAFE.map((k) => [k, r[k] ?? null]));

// the client's brain row: owned by them, else the location's row (claimed), else new
// Onboarding creates the brain row (with the client's GHL sub-account) before the
// client has ever signed in, so it starts unowned. The first time they sign in we
// claim the row that was set up for their email — that is what links their portal
// login to their own GHL sub-account, and therefore to their own Stripe payouts.
async function findBrain(uid: string, email?: string): Promise<Row | null> {
  const get = async (qs: string) => {
    const r = await fetch(`${SB_URL}/rest/v1/ai_brain?${qs}&select=*&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length ? rows[0] as Row : null;
  };
  const claim = async (row: Row | null) => {
    if (!row) return null;
    await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${row.id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ owner: uid }) });
    return { ...row, owner: uid };
  };
  const own = await get(`owner=eq.${uid}`);
  if (own) return own;
  // match the email onboarding was run with (case-insensitive), unowned rows only
  if (email) {
    const byEmail = await get(`owner_email=ilike.${encodeURIComponent(email)}&owner=is.null`);
    if (byEmail) return claim(byEmail);
  }
  // single-tenant fallback: the one location named by the LOC secret
  if (LOC) return claim(await get(`slug=eq.${encodeURIComponent(LOC)}&owner=is.null`));
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

  let b: { op?: string; brain?: Record<string, string>; company?: Record<string, string>; calendarId?: string; locationId?: string };
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.op === "get") {
    const row = await findBrain(user.id, user.email);
    return json({ ok: true, brain: row ? pick(row) : null, ghl_linked: !!(row?.ghl_location_id || LOC) });
  }

  // ---- which calendar takes public inspection bookings ----
  // The booking page (builderpro-os.com/book) books into ai_brain.booking_calendar_id
  // inside ai_brain.ghl_location_id. These ops let the owner set both themselves:
  // a client whose row was never created by onboarding would otherwise be stuck.
  const clean = (v: unknown) => String(v ?? "").trim().slice(0, 80);
  const idOk = (v: string) => /^[A-Za-z0-9_-]*$/.test(v);

  if (b.op === "calendars") {
    const row = await findBrain(user.id, user.email);
    const sel = String(row?.booking_calendar_id ?? "");
    // an explicit locationId lets them look up a sub-account before it is saved
    const asked = clean(b.locationId);
    if (asked && !idOk(asked)) return json({ ok: false, error: "That does not look like a location id." }, 400);
    const loc = asked || String(row?.ghl_location_id ?? "") || LOC;
    if (!loc) return json({ ok: true, calendars: [], reason: row ? "no_location" : "no_row", selected: sel, has_row: !!row });
    const t = await locationToken(loc);
    if (!t) return json({ ok: true, calendars: [], reason: "no_token", selected: sel, location: loc, has_row: !!row });
    try {
      const r = await fetch(`${GHL_BASE}/calendars/?locationId=${encodeURIComponent(loc)}`, { headers: ghlH(t) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return json({ ok: true, calendars: [], reason: "ghl_" + r.status, selected: sel, location: loc, has_row: !!row });
      const cals = (d?.calendars ?? []).map((c: Row) => ({ id: String(c.id ?? ""), name: String(c.name ?? "Calendar") })).filter((c: { id: string }) => c.id);
      return json({ ok: true, calendars: cals, selected: sel, location: loc, has_row: !!row });
    } catch { return json({ ok: true, calendars: [], reason: "unreachable", selected: sel, location: loc, has_row: !!row }); }
  }

  // The public booking page shows the business name, phone and area from this
  // record. A login whose record was never created by onboarding gets one here,
  // keyed to them, so the page is not nameless — no calendar or sub-account needed.
  if (b.op === "profile") {
    const co = b.company ?? {};
    const txt = (v: unknown) => String(v ?? "").slice(0, 300).trim();
    const vals: Array<[string, string]> = [["business_name", txt(co.name)], ["phone", txt(co.phone)], ["service_area", txt(co.area)], ["hours", txt(co.hours)]];
    const row = await findBrain(user.id, user.email);
    const fields: Row = { updated_at: new Date().toISOString() };
    if (row) {
      for (const [k, v] of vals) if (v && !String(row[k] ?? "").trim()) fields[k] = v;
      if (Object.keys(fields).length === 1) return json({ ok: true, brain: pick(row), changed: false });
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${row.id}`, { method: "PATCH", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(fields) });
      const saved = r.ok ? ((await r.json().catch(() => []))[0] ?? null) : null;
      return json({ ok: !!saved, brain: saved ? pick(saved) : pick(row), changed: !!saved });
    }
    const create: Row = { ...fields, owner: user.id, owner_email: user.email, is_demo: false, assistant_name: AI_NAME, slug: `u-${user.id.slice(0, 8)}` };
    for (const [k, v] of vals) if (v) create[k] = v;
    if (LOC) create.ghl_location_id = LOC;
    const r = await fetch(`${SB_URL}/rest/v1/ai_brain`, { method: "POST", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(create) });
    if (!r.ok) return json({ ok: false, error: "Could not create your account record.", detail: (await r.text()).slice(0, 200) }, 502);
    const saved = (await r.json().catch(() => []))[0] ?? null;
    return json({ ok: true, brain: saved ? pick(saved) : null, changed: true });
  }

  if (b.op === "set_calendar") {
    const id = clean(b.calendarId), locId = clean(b.locationId);
    if (!idOk(id)) return json({ ok: false, error: "That does not look like a calendar id." }, 400);
    if (!idOk(locId)) return json({ ok: false, error: "That does not look like a location id." }, 400);
    const co = b.company ?? {};
    const txt = (v: unknown) => String(v ?? "").slice(0, 300).trim();
    const row = await findBrain(user.id, user.email);
    const fields: Row = { booking_calendar_id: id, updated_at: new Date().toISOString() };
    if (locId) fields.ghl_location_id = locId;
    // the booking page shows the business name, phone and area; fill any that are
    // still blank from what the portal already knows, without touching published copy
    const blanks: Array<[string, string]> = [["business_name", txt(co.name)], ["phone", txt(co.phone)], ["service_area", txt(co.area)], ["hours", txt(co.hours)]];
    let saved: Row | null = null;
    if (row) {
      for (const [k, v] of blanks) if (v && !String(row[k] ?? "").trim()) fields[k] = v;
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain?id=eq.${row.id}`, { method: "PATCH", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(fields) });
      if (!r.ok) return json({ ok: false, error: "Could not save that calendar." }, 502);
      saved = (await r.json().catch(() => []))[0] ?? null;
    } else {
      // no record yet: create one owned by this login so the booking page can find it
      const loc = locId || LOC;
      if (!loc) return json({ ok: false, error: "Add your GoHighLevel location id too — without it there is no account to book into." }, 400);
      const create: Row = {
        ...fields, owner: user.id, owner_email: user.email, is_demo: false,
        assistant_name: AI_NAME, ghl_location_id: loc, slug: loc,
      };
      for (const [k, v] of blanks) if (v) create[k] = v;
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain`, { method: "POST", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(create) });
      if (!r.ok) return json({ ok: false, error: "Could not create your account record." , detail: (await r.text()).slice(0, 200) }, 502);
      saved = (await r.json().catch(() => []))[0] ?? null;
    }
    return json({ ok: true, booking_calendar_id: id, brain: saved ? pick(saved) : null });
  }

  if (b.op === "publish") {
    const br = b.brain ?? {}, co = b.company ?? {};
    const s = (v: unknown) => String(v ?? "").slice(0, 6000).trim();
    const now = new Date().toISOString();
    const fields: Row = {
      owner: user.id, is_demo: false, assistant_name: s(br.assistant_name) || AI_NAME,
      business_name: s(co.name), industry: s(co.trade), tone: s(br.tone) || "Friendly",
      services: s(br.services), pricing: s(br.pricing), faqs: s(br.faq), custom_instructions: s(br.rules),
      hours: s(co.hours), service_area: s(co.serviceArea), phone: s(co.phone),
      published_at: now,
    };
    if (LOC) fields.ghl_location_id = LOC;
    // pass the email here too: a client who hits Publish before ever opening
    // Payouts would otherwise create a second brain row instead of claiming theirs
    const row = await findBrain(user.id, user.email);
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
