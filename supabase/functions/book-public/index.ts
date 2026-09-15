// book-public — the customer side of the Inspections calendar.
//
// A contractor's booking page (builderpro-os.com/book/?u=<their id>) and the
// <iframe> they paste on their own website both talk to this. No sign-in: the
// homeowner is anonymous. Everything is scoped by the `u` in the request, which
// is the contractor's owner uuid (or, for older rows, the brain slug).
//
//   { op:"info",  u }                      -> business name, phone, timezone, slot length
//   { op:"slots", u, from, to }            -> { "2026-09-14": ["2026-09-14T15:00:00.000Z", ...], ... }
//   { op:"book",  u, startTime, name, phone, email?, address?, notes? }
//                                          -> creates the contact + appointment in their GoHighLevel
//
// The calendar used is ai_brain.booking_calendar_id — the same one Ridge books
// into — inside ai_brain.ghl_location_id. Falls back to GHL_CALENDAR_ID /
// GHL_LOCATION_ID secrets for a single-account install.
//
// Deploy:
//   supabase functions deploy book-public --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_CLIENT_ID = Deno.env.get("GHL_CLIENT_ID") ?? "";
const GHL_CLIENT_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
const DEF_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const DEF_CAL = Deno.env.get("GHL_CALENDAR_ID") ?? Deno.env.get("GHL_CAL_INSPECTION") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
const sbHeaders = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

// --- token strategy shared with ai-chat / agency: per-location secret -> OAuth mint -> fallbacks ---
let _agencyTok: { token: string; exp: number } | null = null;
async function agencyOAuthToken(): Promise<string> {
  if (_agencyTok && _agencyTok.exp > Date.now() + 60000) return _agencyTok.token;
  if (!SB_URL || !SB_SERVICE) return "";
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1&select=*`, { headers: sbHeaders });
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row?.refresh_token) return "";
    const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (row.access_token && exp > Date.now() + 60000) { _agencyTok = { token: row.access_token, exp }; return row.access_token; }
    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) return row.access_token ?? "";
    const rr = await fetch(`${GHL_BASE}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: GHL_CLIENT_ID, client_secret: GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString() });
    const d = await rr.json();
    if (!rr.ok || !d.access_token) return row.access_token ?? "";
    const newExp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    _agencyTok = { token: d.access_token, exp: newExp };
    await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1`, { method: "PATCH", headers: sbHeaders, body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(newExp).toISOString(), updated_at: new Date().toISOString() }) });
    return d.access_token;
  } catch { return ""; }
}
const locTokenCache: Record<string, string> = {};
async function locationToken(locationId: string): Promise<string> {
  if (!locationId) return GHL_TOKEN || GHL_API_KEY;
  if (locTokenCache[locationId]) return locTokenCache[locationId];
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) { locTokenCache[locationId] = perLoc; return perLoc; }
  try {
    const minter = (await agencyOAuthToken()) || GHL_API_KEY;
    if (minter) {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, { method: "POST", headers: { Authorization: `Bearer ${minter}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString() });
      if (r.ok) { const d = await r.json(); if (d?.access_token) { locTokenCache[locationId] = d.access_token; return d.access_token; } }
    }
  } catch { /* fall through */ }
  return GHL_TOKEN || GHL_API_KEY;
}

// --- who is `u`? an owner uuid first, a brain slug second ---
type Row = Record<string, string | null>;
async function findBrain(u: string): Promise<Row | null> {
  if (!u || !SB_URL || !SB_SERVICE) return null;
  const get = async (qs: string) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain?${qs}&select=id,owner,slug,business_name,phone,hours,service_area,booking_calendar_id,ghl_location_id,is_demo&limit=1`, { headers: sbHeaders });
      const rows = r.ok ? await r.json() : [];
      return Array.isArray(rows) && rows.length ? rows[0] as Row : null;
    } catch { return null; }
  };
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u);
  return (isUuid ? await get(`owner=eq.${u}`) : null) || await get(`slug=eq.${encodeURIComponent(u)}`);
}
function target(row: Row | null) {
  const loc = String(row?.ghl_location_id || DEF_LOC || "");
  const cal = String(row?.booking_calendar_id || DEF_CAL || "");
  return { loc, cal };
}

// GHL free-slots is keyed by date; normalise to date -> ISO[] and keep the calendar's timezone
async function freeSlots(loc: string, cal: string, from: number, to: number): Promise<{ ok: boolean; slots: Record<string, string[]>; tz: string; status?: number }> {
  const tok = await locationToken(loc);
  const r = await fetch(`${GHL_BASE}/calendars/${cal}/free-slots?startDate=${from}&endDate=${to}`, { headers: ghlHeaders(tok) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, slots: {}, tz: "", status: r.status };
  const slots: Record<string, string[]> = {};
  let tz = "";
  for (const k of Object.keys(d)) {
    if (k === "traceId") continue;
    const s = d[k]?.slots;
    if (Array.isArray(s) && s.length) slots[k] = s.map(String);
    // some responses carry the calendar's timezone alongside the slots
    if (!tz && typeof d[k]?.timezone === "string") tz = d[k].timezone;
  }
  return { ok: true, slots, tz };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const op = String(b.op || "");
  const u = String(b.u || "").replace(/[^0-9a-z_-]/gi, "").slice(0, 80);
  const row = await findBrain(u);
  const { loc, cal } = target(row);

  if (op === "info") {
    return json({
      ok: true,
      business: row?.business_name || "",
      phone: row?.phone || "",
      hours: row?.hours || "",
      area: row?.service_area || "",
      ready: !!(loc && cal),
      // why it is not ready, so the owner's portal can say what to fix
      reason: (loc && cal) ? "" : !row ? "no_row" : !loc ? "no_location" : "no_calendar",
      demo: !!row?.is_demo,
    });
  }

  if (!loc || !cal) return json({ ok: false, error: "This contractor has not connected a booking calendar yet." }, 404);

  if (op === "slots") {
    const from = Number(b.from) || Date.now();
    // cap the window at 62 days so one page load can't hammer the calendar
    const to = Math.min(Number(b.to) || from + 31 * 86400000, from + 62 * 86400000);
    const s = await freeSlots(loc, cal, from, to);
    if (!s.ok) return json({ ok: false, error: "Could not read the calendar right now.", status: s.status }, 502);
    return json({ ok: true, slots: s.slots, tz: s.tz });
  }

  if (op === "book") {
    const name = String(b.name || "").trim().slice(0, 120);
    const phone = String(b.phone || "").trim().slice(0, 40);
    const email = String(b.email || "").trim().slice(0, 160);
    const address = String(b.address || "").trim().slice(0, 240);
    const notes = String(b.notes || "").trim().slice(0, 1000);
    const startTime = String(b.startTime || "");
    const startMs = Date.parse(startTime);
    if (!name || !phone) return json({ ok: false, error: "Name and phone are required." }, 400);
    if (!startMs || startMs < Date.now() - 600000) return json({ ok: false, error: "Pick a time in the future." }, 400);
    // only a slot the calendar itself offered can be booked — no arbitrary times from the browser
    const s = await freeSlots(loc, cal, startMs - 86400000, startMs + 86400000);
    const offered = Object.values(s.slots).flat().some((iso) => Date.parse(iso) === startMs);
    if (s.ok && !offered) return json({ ok: false, error: "That time was just taken. Pick another." }, 409);

    const tok = await locationToken(loc);
    const cr = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: loc, name, phone, email: email || undefined, address1: address || undefined, source: "Booking page", tags: ["booking-page"] }) });
    const cd = await cr.json().catch(() => ({}));
    // a duplicate phone/email comes back as 400 with the existing contact id in meta
    const cid = cd?.contact?.id || cd?.id || cd?.meta?.contactId || "";
    if (!cid) return json({ ok: false, error: "Could not save your details. Call us instead." , status: cr.status }, 502);
    if (notes) await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ body: "Booking page: " + notes }) }).catch(() => {});

    const endTime = new Date(startMs + 60 * 60000).toISOString();
    const r = await fetch(`${GHL_BASE}/calendars/events/appointments`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: loc, calendarId: cal, contactId: cid, startTime, endTime, title: "Roof inspection — " + name, address: address || undefined, appointmentStatus: "confirmed" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(d?.message || "");
      return json({ ok: false, error: /not available|no longer/i.test(msg) ? "That time was just taken. Pick another." : "Could not book that time. Please try another.", status: r.status }, 502);
    }
    return json({ ok: true, id: d?.id || "", startTime, business: row?.business_name || "", phone: row?.phone || "" });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
