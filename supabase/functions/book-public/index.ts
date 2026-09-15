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
// Which calendar? By default the SAME one the portal's Inspections tab shows: the
// page goes through the ghl-calendar and ghl-contacts functions the portal uses,
// so the inside view and the outside view are one calendar. An account that has
// its own booking_calendar_id + ghl_location_id on ai_brain (a client with their
// own GoHighLevel sub-account) books straight into that instead.
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

// ---- the portal's own calendar ----
// The Inspections tab in the portal is served by the ghl-calendar function, and its
// contacts by ghl-contacts. When an account has no calendar of its own on file, the
// public page goes through those same two functions, so a homeowner books into
// exactly the calendar the roofer sees inside the portal.
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const portalHeaders = { Authorization: `Bearer ${SB_ANON}`, apikey: SB_ANON, "Content-Type": "application/json" };
async function portal(fn: "ghl-calendar" | "ghl-contacts", body: Record<string, unknown>): Promise<Record<string, any>> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/${fn}`, { method: "POST", headers: portalHeaders, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return { ...d, ok: r.ok && d?.ok !== false, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}
async function portalSlots(): Promise<{ ok: boolean; slots: Record<string, string[]>; status?: number }> {
  const d = await portal("ghl-calendar", { action: "slots", cal: "inspection" });
  const slots: Record<string, string[]> = {};
  if (d.ok && d.slots && typeof d.slots === "object") {
    for (const k of Object.keys(d.slots)) { const a = d.slots[k]; if (Array.isArray(a) && a.length) slots[k] = a.map(String); }
  }
  return { ok: !!d.ok, slots, status: d.status };
}
// GHL wants the offset the calendar lives in; the portal writes Pacific, so match it
function fmtPacific(d: Date): string {
  const g: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(d).forEach((p) => { g[p.type] = p.value; });
  if (g.hour === "24") g.hour = "00";
  let off = "-08:00";
  try { off = (new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT-08:00").replace("GMT", "") || "-08:00"; } catch { /* keep default */ }
  return `${g.year}-${g.month}-${g.day}T${g.hour}:${g.minute}:${g.second}${off}`;
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
  // "own": this account has its own calendar on file. "portal": the shared one the
  // portal's Inspections tab shows.
  const mode: "own" | "portal" = loc && cal ? "own" : "portal";

  if (op === "info") {
    let ready = mode === "own", reason = "";
    if (mode === "portal") { const p = await portalSlots(); ready = p.ok; if (!ready) reason = "portal_" + (p.status || 0); }
    return json({
      ok: true,
      business: row?.business_name || "",
      phone: row?.phone || "",
      hours: row?.hours || "",
      area: row?.service_area || "",
      ready, reason, mode,
      demo: !!row?.is_demo,
    });
  }

  if (op === "slots") {
    if (mode === "portal") {
      const p = await portalSlots();
      if (!p.ok) return json({ ok: false, error: "Could not read the calendar right now.", status: p.status }, 502);
      return json({ ok: true, slots: p.slots, tz: "" });
    }
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
    const taken = () => json({ ok: false, error: "That time was just taken. Pick another." }, 409);

    if (mode === "portal") {
      // only a slot the calendar itself offered can be booked
      const p = await portalSlots();
      if (p.ok && !Object.values(p.slots).flat().some((iso) => Date.parse(iso) === startMs)) return taken();
      // the contact, through the same function the portal's Contacts page uses
      const c = await portal("ghl-contacts", { action: "create", name, phone, email });
      const cid = String(c.id || c.contactId || c.contact?.id || c.data?.id || c.meta?.contactId || "");
      if (!cid) return json({ ok: false, error: "Could not save your details. Call us instead.", status: c.status }, 502);
      const startP = fmtPacific(new Date(startMs)), endP = fmtPacific(new Date(startMs + 3600000));
      const r = await portal("ghl-calendar", { action: "create", cal: "inspection", contactId: cid, startTime: startP, endTime: endP, title: "Roof inspection — " + name + (notes ? " (" + notes.slice(0, 80) + ")" : ""), address });
      if (!r.ok) {
        let msg = ""; try { msg = JSON.parse(r.detail || "{}").message || ""; } catch { /* no detail */ }
        return /not available|no longer/i.test(msg) ? taken() : json({ ok: false, error: "Could not book that time. Please try another.", status: r.status }, 502);
      }
      return json({ ok: true, id: r.id || "", startTime, business: row?.business_name || "", phone: row?.phone || "", mode });
    }

    // own calendar: straight to GoHighLevel for this account's sub-account
    const s = await freeSlots(loc, cal, startMs - 86400000, startMs + 86400000);
    const offered = Object.values(s.slots).flat().some((iso) => Date.parse(iso) === startMs);
    if (s.ok && !offered) return taken();

    const tok = await locationToken(loc);
    const cr = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: loc, name, phone, email: email || undefined, address1: address || undefined, source: "Booking page", tags: ["booking-page"] }) });
    const cd = await cr.json().catch(() => ({}));
    // a duplicate phone/email comes back as 400 with the existing contact id in meta
    const cid = cd?.contact?.id || cd?.id || cd?.meta?.contactId || "";
    if (!cid) return json({ ok: false, error: "Could not save your details. Call us instead.", status: cr.status }, 502);
    if (notes) await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ body: "Booking page: " + notes }) }).catch(() => {});

    const endTime = new Date(startMs + 60 * 60000).toISOString();
    const r = await fetch(`${GHL_BASE}/calendars/events/appointments`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: loc, calendarId: cal, contactId: cid, startTime, endTime, title: "Roof inspection — " + name, address: address || undefined, appointmentStatus: "confirmed" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = String(d?.message || "");
      return /not available|no longer/i.test(msg) ? taken() : json({ ok: false, error: "Could not book that time. Please try another.", status: r.status }, 502);
    }
    return json({ ok: true, id: d?.id || "", startTime, business: row?.business_name || "", phone: row?.phone || "", mode });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
