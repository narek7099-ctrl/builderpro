// lead-in: a lead from a contractor's calculator or checker, so it reaches them.
//
//   POST { owner, page, lead:{ firstName, lastName, phone, email, address, notes, estimateLow, ... } }
//
// The calculators and checkers send each lead to a HighLevel inbound webhook.
// That webhook belongs to BuilderPro's house account, so on its own a
// contractor's calculator lead never reached the contractor. The pages now
// also send it here (embed-src/site-theme.html, "bp-lead-relay"), and this:
//   1. saves it in lead_log (what came in, and where it went)
//   2. adds it to the contractor's BuilderPro Contacts, which rings their bell
//      and their phone (a contact already there with the same phone or email is
//      updated, not duplicated)
//   3. creates it in the contractor's own HighLevel tagged new-lead +
//      calculator-lead, so Speed to Lead and the rest of their workflows run.
//      The page no longer calls BuilderPro's own webhook for a contractor's
//      lead, so this is the only place it goes.
// A lead that couldn't reach HighLevel stays in lead_log as "failed" and is
// tried again by { op:"retry" } (pg_cron, service key only).
//
// owner is the ?u= in the calculator's share link: a contractor's user id, or
// a team member's (resolved to the owner they work for).
//
// Deploy:  supabase functions deploy lead-in --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const HOUSE_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "anon";
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function take(bucket: string, key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const r = await rest("rpc/rate_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_key: key, p_max: max, p_window_sec: windowSec }) });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch { return true; }
}
const one = async (path: string): Promise<Row | null> => { try { const r = await rest(path); return r.ok ? ((await r.json())[0] ?? null) : null; } catch { return null; } };

// a team member's link belongs to the owner they work for
async function ownerOf(id: string): Promise<string> {
  const acc = await one(`accounts?user_id=eq.${id}&select=user_id&limit=1`);
  if (acc) return id;
  const tm = await one(`team_members?member=eq.${id}&accepted_at=not.is.null&select=owner&limit=1`);
  return tm?.owner && UUID.test(String(tm.owner)) ? String(tm.owner) : "";
}
let house: { at: number; ids: string[] } = { at: 0, ids: [] };
async function houseOwners(): Promise<string[]> {
  if (Date.now() - house.at < 300000) return house.ids;
  const r = await rest("ai_config?key=in.(ghl_events_owner,ghl_house_owners)&select=value").catch(() => null);
  const rows: Row[] = r && r.ok ? await r.json() : [];
  house = { at: Date.now(), ids: rows.flatMap((x) => String(x.value ?? "").split(",")).map((x) => x.trim()).filter((x) => UUID.test(x)) };
  return house.ids;
}
// the owner's own HighLevel location; "house" when it's BuilderPro's own; "" when none
async function ownerLoc(owner: string): Promise<string> {
  const [a, b] = await Promise.all([
    one(`accounts?user_id=eq.${owner}&select=ghl_location_id&limit=1`),
    one(`ai_brain?owner=eq.${owner}&select=ghl_location_id&limit=1`),
  ]);
  const loc = String(a?.ghl_location_id || b?.ghl_location_id || "");
  if (!loc) return "";
  // BuilderPro's own account gets its leads here too now (the page no longer
  // calls the house webhook); anyone else pointing at it is a stale pointer
  if (HOUSE_LOC && loc === HOUSE_LOC) return (await houseOwners()).includes(owner) ? loc : "house";
  return loc;
}
/* the BuilderPro Connect app's agency login (ghl_oauth, saved when it was installed),
   renewed when it's about to run out. It can open any sub-account; the agency key can't. */
const APP_SB = Deno.env.get("SUPABASE_URL") ?? "", APP_SK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_ID = Deno.env.get("GHL_CLIENT_ID") ?? "", APP_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "", APP_CO = Deno.env.get("GHL_COMPANY_ID") ?? "";
let appTok: { t: string; exp: number } | null = null;
async function appToken(): Promise<string> {
  if (appTok && appTok.exp > Date.now() + 60e3) return appTok.t;
  try {
    const h = { apikey: APP_SK, Authorization: `Bearer ${APP_SK}`, "Content-Type": "application/json" };
    const row = (await (await fetch(`${APP_SB}/rest/v1/ghl_oauth?id=eq.1&select=*`, { headers: h })).json())?.[0];
    if (!row?.refresh_token) return "";
    const exp = Date.parse(row.expires_at ?? "") || 0;
    if (row.access_token && exp > Date.now() + 60e3) { appTok = { t: row.access_token, exp }; return row.access_token; }
    if (!APP_ID || !APP_SECRET) return "";
    const r = await fetch("https://services.leadconnectorhq.com/oauth/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString(),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return "";
    const nexp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    appTok = { t: d.access_token, exp: nexp };
    await fetch(`${APP_SB}/rest/v1/ghl_oauth?id=eq.1`, { method: "PATCH", headers: h, body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(nexp).toISOString(), updated_at: new Date().toISOString() }) });
    return d.access_token;
  } catch { return ""; }
}
/* a token for one sub-account, opened with the app's login */
const appLocTok: Record<string, string> = {};
async function appMint(loc: string): Promise<string> {
  if (!loc || !APP_CO) return "";
  if (appLocTok[loc]) return appLocTok[loc];
  const t = await appToken();
  if (!t) return "";
  try {
    const r = await fetch("https://services.leadconnectorhq.com/oauth/locationToken", {
      method: "POST", headers: { Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: APP_CO, locationId: loc }).toString(), signal: AbortSignal.timeout(8000),
    });
    if (r.ok) { const d = await r.json(); if (d?.access_token) return (appLocTok[loc] = String(d.access_token)); }
  } catch { /* none */ }
  return "";
}
async function ghlToken(loc: string): Promise<string> {
  const k = await one(`ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token&limit=1`);
  if (k?.token) return String(k.token);
  const env = Deno.env.get(`GHL_TOKEN_${loc}`); if (env) return env;
  if (loc === HOUSE_LOC && GHL_TOKEN) return GHL_TOKEN;
  const app = await appMint(loc); if (app) return app;
  if (GHL_API_KEY && GHL_COMPANY_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST", headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(), signal: AbortSignal.timeout(6000),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return String(d.access_token); }
    } catch { /* none */ }
  }
  return "";
}

// what the page sent, in words, for the contact note
function noteOf(src: string, l: Row): string {
  const money = (n: unknown) => { const v = Number(n); return isFinite(v) && v > 0 ? "$" + Math.round(v).toLocaleString("en-US") : ""; };
  const lo = money(l.estimateLow), hi = money(l.estimateHigh);
  const skip = new Set(["firstName", "lastName", "name", "phone", "email", "timestamp", "source", "estimateLow", "estimateHigh", "estimateValue", "photos", "images", "thumbs"]);
  const rest_ = Object.keys(l).filter((k) => !skip.has(k) && l[k] !== "" && l[k] != null && typeof l[k] !== "object")
    .slice(0, 20).map((k) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${clean(l[k], 200)}`);
  return [`Lead from ${src}.`, lo && hi ? `Estimate shown: ${lo} to ${hi}` : "", ...rest_].filter(Boolean).join("\n");
}
function sourceOf(page: string, l: Row): string {
  const s = clean(l.source, 80);
  if (s) return s;
  const p = page.replace(/\.html$/, "");
  if (/^health-/.test(p)) return "Health check (" + p.slice(7) + ")";
  if (/^damage-/.test(p)) return "Damage check (" + p.slice(7) + ")";
  return (p ? p.charAt(0).toUpperCase() + p.slice(1) : "Instant") + " estimate";
}

async function toGhl(logId: string, owner: string, c: { first: string; last: string; name: string; phone: string; email: string; address: string; src: string; note: string },
  opt: { tags?: string[]; loc?: string } = {}) {
  const done = (patch: Row) => rest(`lead_log?id=eq.${logId}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) }).catch(() => {});
  try {
    const loc = opt.loc || await ownerLoc(owner);
    if (loc === "house") return done({ ghl_status: "house" });
    if (!loc) return done({ ghl_status: "none" });
    const tok = await ghlToken(loc);
    if (!tok) return done({ ghl_status: "failed", ghl_error: "no HighLevel key for this account" });
    const h = { Authorization: `Bearer ${tok}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };
    const r = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST", headers: h, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        locationId: loc, firstName: c.first || undefined, lastName: c.last || undefined, name: c.name || undefined,
        phone: c.phone || undefined, email: c.email || undefined, address1: c.address || undefined,
        source: c.src, tags: opt.tags || ["new-lead", "calculator-lead"],
      }),
    });
    const d = await r.json().catch(() => ({}));
    const cid = String(d?.contact?.id || d?.id || "");
    if (!r.ok || !cid) return done({ ghl_status: "failed", ghl_error: `HTTP ${r.status} ${JSON.stringify(d).slice(0, 160)}` });
    await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: h, body: JSON.stringify({ body: c.note }), signal: AbortSignal.timeout(6000) }).catch(() => {});
    return done({ ghl_status: "sent", ghl_contact: cid, ghl_error: "" });
  } catch (e) {
    return done({ ghl_status: "failed", ghl_error: String(e).slice(0, 160) });
  }
}

async function intake(b: Row, req: Request) {
  const raw = clean(b.owner, 40);
  if (!UUID.test(raw)) return json({ ok: false, error: "no owner" }, 400);
  const l: Row = b.lead && typeof b.lead === "object" ? b.lead : {};
  const first = clean(l.firstName, 60), last = clean(l.lastName, 60);
  const name = clean(l.name, 120) || [first, last].filter(Boolean).join(" ");
  const phone = clean(l.phone, 30), email = clean(l.email, 120).toLowerCase();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: true, skipped: "no way to reach them" });
  if (!(await take("lead-in-ip", clientIp(req), 20, 3600))) return json({ ok: false, error: "too many" }, 429);
  const owner = await ownerOf(raw);
  if (!owner) return json({ ok: false, error: "unknown owner" }, 404);
  if (!(await take("lead-in-dup", owner + ":" + (digits || email), 3, 600))) return json({ ok: true, dup: true });
  const page = clean(b.page, 60), src = sourceOf(page, l), note = noteOf(src, l), address = clean(l.address, 200);
  // keep only plain values, and no photos (they can be large)
  const keep: Row = {};
  for (const k of Object.keys(l).slice(0, 40)) if (l[k] == null || typeof l[k] !== "object") keep[k] = typeof l[k] === "string" ? clean(l[k], 500) : l[k];

  const lg = await rest("lead_log", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner, source: src, page, name, phone, email, lead: keep }) });
  const logId = lg.ok ? String((await lg.json())[0]?.id ?? "") : "";

  // BuilderPro Contacts: update the same person if they're already there
  let contactId = "";
  // phones are stored however they were typed, so narrow by the last four
  // digits and compare the digits here
  let match: Row | null = null;
  if (digits.length >= 10) {
    const r = await rest(`contacts?owner=eq.${owner}&phone=ilike.*${digits.slice(-4)}*&select=id,phone,notes,tags&limit=50`).catch(() => null);
    const rows: Row[] = r && r.ok ? await r.json() : [];
    match = rows.find((x) => String(x.phone || "").replace(/\D/g, "").slice(-10) === digits.slice(-10)) ?? null;
  }
  if (!match && email) match = await one(`contacts?owner=eq.${owner}&email=eq.${encodeURIComponent(email)}&select=id,notes,tags&limit=1`);
  if (match) {
    contactId = String(match.id);
    const tags = Array.from(new Set([...(Array.isArray(match.tags) ? match.tags : []), "Calculator lead"]));
    await rest(`contacts?id=eq.${contactId}`, { method: "PATCH", body: JSON.stringify({ tags, notes: (String(match.notes || "") + "\n\n" + note).trim().slice(-8000), updated_at: new Date().toISOString() }) }).catch(() => {});
    // an update doesn't ring the bell the way a new contact does: a returning
    // person asking for a new price is a hot lead, so say so
    await rest("rpc/bp_notify", { method: "POST", body: JSON.stringify({
      p_owner: owner, p_kind: "lead_new", p_title: "Back again: " + (name || phone || email),
      p_body: [src, phone, email].filter(Boolean).join(" · "), p_link: "contacts:" + contactId, p_job: null,
      p_priority: "high", p_dedupe: "leadin:" + (logId || contactId), p_audience: "office",
    }) }).catch(() => {});
  } else {
    const ins = await rest("contacts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner, name: name || phone || email, phone, email, tags: ["Calculator lead"], notes: note }) });
    if (ins.ok) contactId = String((await ins.json())[0]?.id ?? "");
  }
  if (logId && contactId) await rest(`lead_log?id=eq.${logId}`, { method: "PATCH", body: JSON.stringify({ contact_id: contactId }) }).catch(() => {});

  const work = logId ? toGhl(logId, owner, { first, last, name, phone, email, address, src, note }) : Promise.resolve();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return json({ ok: true });
}

// A contact the owner (or office) added in BuilderPro, handed to their own
// HighLevel as a new lead so Lisa's first text and follow-up run.
//   POST { op:"push", contact_id }  (their sign-in)  -> { ok, sent, reason? }
async function push(b: Row, req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return json({ ok: false, error: "sign in" }, 401);
  let uid = "";
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    uid = r.ok ? String((await r.json())?.id ?? "") : "";
  } catch { /* below */ }
  if (!UUID.test(uid)) return json({ ok: false, error: "sign in" }, 401);
  const tm = await one(`team_members?member=eq.${uid}&accepted_at=not.is.null&select=owner,role&limit=1`);
  if (tm && tm.role !== "office") return json({ ok: false, error: "owner or office only" }, 403);
  const owner = String(tm?.owner ?? uid);
  const id = clean(b.contact_id, 40);
  if (!UUID.test(id)) return json({ ok: false, error: "no contact" }, 400);
  const c = await one(`contacts?id=eq.${id}&owner=eq.${owner}&select=id,name,phone,email&limit=1`);
  if (!c) return json({ ok: false, error: "not found" }, 404);
  if (!(await take("lead-push", owner, 60, 3600))) return json({ ok: false, error: "too many" }, 429);
  const loc0 = await ownerLoc(owner);
  if (!loc0) return json({ ok: true, sent: false, reason: "no_highlevel" });
  const loc = loc0 === "house" ? HOUSE_LOC : loc0;
  const name = clean(c.name, 120), phone = clean(c.phone, 30), email = clean(c.email, 120);
  const src = "Added in BuilderPro", note = "Added by hand in BuilderPro and sent to you as a new lead.";
  const lg = await rest("lead_log", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner, source: src, page: "contacts", name, phone, email, lead: {}, contact_id: id }) });
  const logId = lg.ok ? String((await lg.json())[0]?.id ?? "") : "";
  if (!logId) return json({ ok: false, error: "log" }, 500);
  const [first, ...more] = name.split(/\s+/);
  await toGhl(logId, owner, { first: first || "", last: more.join(" "), name, phone, email, address: "", src, note }, { tags: ["new-lead", "added-manually"], loc });
  const st = await one(`lead_log?id=eq.${logId}&select=ghl_status,ghl_contact,ghl_error&limit=1`);
  if (st?.ghl_contact) await rest(`contacts?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ ghl_id: st.ghl_contact }) }).catch(() => {});
  return json({ ok: true, sent: st?.ghl_status === "sent", reason: st?.ghl_status === "sent" ? "" : (st?.ghl_error || st?.ghl_status || "") });
}

// leads that didn't reach HighLevel: try again (up to 5 times over a day)
async function retry(req: Request) {
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!SB_SERVICE || key !== SB_SERVICE) return json({ ok: false }, 401);
  const since = new Date(Date.now() - 86400000).toISOString();
  const r = await rest(`lead_log?ghl_status=in.(pending,failed)&tries=lt.5&created_at=gte.${since}&select=*&order=created_at.asc&limit=25`);
  const rows: Row[] = r.ok ? await r.json() : [];
  for (const x of rows) {
    await rest(`lead_log?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ tries: (x.tries || 0) + 1 }) }).catch(() => {});
    const l: Row = x.lead || {};
    await toGhl(x.id, x.owner, { first: clean(l.firstName, 60), last: clean(l.lastName, 60), name: x.name, phone: x.phone, email: x.email, address: clean(l.address, 200), src: x.source, note: noteOf(x.source, l) });
  }
  return json({ ok: true, tried: rows.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let b: Row = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad request" }, 400); }
  try {
    if (b.op === "retry") return await retry(req);
    if (b.op === "push") return await push(b, req);
    return await intake(b, req);
  } catch (e) {
    console.error("lead-in", String(e).slice(0, 200));
    return json({ ok: false, error: "server" }, 500);
  }
});
