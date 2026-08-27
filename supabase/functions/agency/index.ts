// agency — the secure backend for your private Agency Command Center.
//
// Holds your GHL agency API key + Gemini key (server-side, never in the page).
// Every call is gated: the caller must be signed in as an allowed admin email.
// Two kinds of calls:
//   { op: "ai.plan", command: "..." }  -> Gemini turns your words into a proposed
//                                          {op,args} action + a plain-English summary.
//                                          NOTHING is executed. You approve first.
//   { op: "<real op>", args: {...} }   -> executes against the GHL API.
//
// Deploy:
//   supabase functions deploy agency --no-verify-jwt
//   supabase secrets set GHL_API_KEY=... GHL_COMPANY_ID=... GEMINI_API_KEY=AIza... ADMIN_EMAILS=you@email.com

const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";        // agency-level token (locations)
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";            // sub-account token fallback
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-2.5-flash-lite";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_CLIENT_ID = Deno.env.get("GHL_CLIENT_ID") ?? "";
const GHL_CLIENT_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

// Agency OAuth token (from the marketplace app install) — refreshed as needed.
// This is what lets us mint a token for ANY sub-account, no per-client setup.
let _agencyTok: { token: string; exp: number } | null = null;
async function agencyOAuthToken(): Promise<string> {
  if (_agencyTok && _agencyTok.exp > Date.now() + 60000) return _agencyTok.token;
  if (!SB_URL || !SB_SERVICE) return "";
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1&select=*`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row?.refresh_token) return "";
    const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (row.access_token && exp > Date.now() + 60000) { _agencyTok = { token: row.access_token, exp }; return row.access_token; }
    // refresh
    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) return row.access_token ?? "";
    const rr = await fetch(`${GHL_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: GHL_CLIENT_ID, client_secret: GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString(),
    });
    const d = await rr.json();
    if (!rr.ok || !d.access_token) return row.access_token ?? "";
    const newExp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    _agencyTok = { token: d.access_token, exp: newExp };
    await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1`, {
      method: "PATCH",
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(newExp).toISOString(), updated_at: new Date().toISOString() }),
    });
    return d.access_token;
  } catch { return ""; }
}
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

// Agency tokens can't read a sub-account's data; mint (and cache) a location-scoped
// token from the agency token. Falls back to GHL_TOKEN, then the agency token.
const locTokenCache: Record<string, string> = {};
async function locationToken(locationId: string): Promise<string> {
  if (!locationId) return GHL_API_KEY;
  if (locTokenCache[locationId]) return locTokenCache[locationId];
  // 1) an explicit per-sub-account token secret: GHL_TOKEN_<locationId>
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) { locTokenCache[locationId] = perLoc; return perLoc; }
  // 2) mint one using the agency OAuth token (scales to unlimited clients, no setup)
  try {
    const minter = (await agencyOAuthToken()) || GHL_API_KEY;
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${minter}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString(),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.access_token) { locTokenCache[locationId] = d.access_token; return d.access_token; }
    }
  } catch { /* fall through */ }
  return GHL_TOKEN || GHL_API_KEY;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// --- who is calling? verify the Supabase user token and check the allowlist ---
async function requireAdmin(req: Request): Promise<{ ok: boolean; email: string; reason: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, email: "", reason: "no token sent" };
  if (!SB_URL) return { ok: false, email: "", reason: "SUPABASE_URL missing" };
  if (!ADMIN_EMAILS.length) return { ok: false, email: "", reason: "ADMIN_EMAILS not set (spelling? all caps?)" };
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON } });
    if (!r.ok) return { ok: false, email: "", reason: `token lookup failed (${r.status})` };
    const u = await r.json();
    const email = (u?.email ?? "").toLowerCase();
    if (!email) return { ok: false, email: "", reason: "no email on token" };
    if (!ADMIN_EMAILS.includes(email)) return { ok: false, email, reason: `${email} not in ADMIN_EMAILS [${ADMIN_EMAILS.join(", ")}]` };
    return { ok: true, email, reason: "ok" };
  } catch (e) {
    return { ok: false, email: "", reason: "verify error: " + String(e).slice(0, 80) };
  }
}

// --- the operations the command center can perform against GHL ---
// Each returns { method, path, body? }. Kept in one place so the AI planner and the
// buttons share exactly the same surface.
function opToRequest(op: string, a: Record<string, string> = {}): { method: string; path: string; body?: unknown } | null {
  switch (op) {
    // clients / sub-accounts
    case "locations.list":   return { method: "GET", path: `/locations/search?companyId=${GHL_COMPANY_ID}&limit=100` };
    case "snapshots.list":   return { method: "GET", path: `/snapshots/?companyId=${GHL_COMPANY_ID}` };
    case "locations.create": {
      const b: Record<string, unknown> = { companyId: GHL_COMPANY_ID, name: a.name, phone: a.phone, address: a.address, city: a.city, state: a.state, country: a.country ?? "US", timezone: a.timezone };
      if (a.email) b.email = a.email;
      if (a.firstName) b.firstName = a.firstName;
      if (a.lastName) b.lastName = a.lastName;
      if (a.snapshotId) b.snapshotId = a.snapshotId;   // instantly load your full template into the new client
      return { method: "POST", path: `/locations/`, body: b };
    }
    case "locations.update": {
      const b: Record<string, string> = { companyId: GHL_COMPANY_ID };
      ["name","phone","email","address","city","state","postalCode","website","timezone","country","firstName","lastName","companyName"].forEach((k) => { if (a[k] !== undefined && a[k] !== "") b[k] = a[k]; });
      return { method: "PUT", path: `/locations/${a.id}`, body: b };
    }
    case "locations.delete": return { method: "DELETE", path: `/locations/${a.id}?companyId=${GHL_COMPANY_ID}&deleteTwilioAccount=false` };
    // contacts (need locationId)
    case "contacts.list":    return { method: "GET", path: `/contacts/?locationId=${a.locationId}&limit=100${a.query ? `&query=${encodeURIComponent(a.query)}` : ""}` };
    case "contacts.create":  return { method: "POST", path: `/contacts/`, body: { locationId: a.locationId, name: a.name, firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email } };
    case "contacts.update":  return { method: "PUT", path: `/contacts/${a.id}`, body: { name: a.name, phone: a.phone, email: a.email } };
    case "contacts.delete":  return { method: "DELETE", path: `/contacts/${a.id}` };
    case "contacts.tag":     return { method: "POST", path: `/contacts/${a.id}/tags`, body: { tags: (a.tags ? String(a.tags).split(",").map((t) => t.trim()) : []) } };
    // conversations
    case "conversations.list":     return { method: "GET", path: `/conversations/search?locationId=${a.locationId}&limit=50` };
    case "conversations.messages": return { method: "GET", path: `/conversations/${a.id}/messages` };
    case "conversations.send":     return { method: "POST", path: `/conversations/messages`, body: { type: a.type ?? "SMS", contactId: a.contactId, message: a.message } };
    // pipelines / opportunities / workflows
    case "pipelines.list":     return { method: "GET", path: `/opportunities/pipelines?locationId=${a.locationId}` };
    case "opportunities.list": return { method: "GET", path: `/opportunities/search?location_id=${a.locationId}&limit=50` };
    case "opportunities.create": return { method: "POST", path: `/opportunities/`, body: { locationId: a.locationId, pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId, name: a.name, status: a.status ?? "open", contactId: a.contactId, monetaryValue: a.monetaryValue ? Number(a.monetaryValue) : undefined } };
    case "opportunities.move":   return { method: "PUT", path: `/opportunities/${a.id}`, body: { pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId } };
    case "opportunities.status": return { method: "PUT", path: `/opportunities/${a.id}/status`, body: { status: a.status } };
    case "workflows.list":     return { method: "GET", path: `/workflows/?locationId=${a.locationId}` };
    case "workflows.enroll":   return { method: "POST", path: `/contacts/${a.contactId}/workflow/${a.workflowId}`, body: {} };
    // notes & tasks on a contact
    case "notes.create":       return { method: "POST", path: `/contacts/${a.contactId}/notes`, body: { body: a.body } };
    case "tasks.create":       return { method: "POST", path: `/contacts/${a.contactId}/tasks`, body: { title: a.title, body: a.body ?? "", dueDate: a.dueDate, completed: false } };
    // forms (read-only: builder is UI-only, but submissions + list are available)
    case "forms.list":         return { method: "GET", path: `/forms/?locationId=${a.locationId}&limit=100` };
    case "forms.submissions":  return { method: "GET", path: `/forms/submissions?locationId=${a.locationId}&limit=100${a.formId ? `&formId=${a.formId}` : ""}` };
    // custom fields (fully editable)
    case "customfields.list":   return { method: "GET", path: `/locations/${a.locationId}/customFields` };
    case "customfields.create": return { method: "POST", path: `/locations/${a.locationId}/customFields`, body: { name: a.name, dataType: a.dataType ?? "TEXT", placeholder: a.placeholder, model: a.model ?? "contact" } };
    case "customfields.update": return { method: "PUT", path: `/locations/${a.locationId}/customFields/${a.id}`, body: { name: a.name, placeholder: a.placeholder } };
    case "customfields.delete": return { method: "DELETE", path: `/locations/${a.locationId}/customFields/${a.id}` };
    // custom values (fully editable)
    case "customvalues.list":   return { method: "GET", path: `/locations/${a.locationId}/customValues` };
    case "customvalues.create": return { method: "POST", path: `/locations/${a.locationId}/customValues`, body: { name: a.name, value: a.value } };
    case "customvalues.update": return { method: "PUT", path: `/locations/${a.locationId}/customValues/${a.id}`, body: { name: a.name, value: a.value } };
    case "customvalues.delete": return { method: "DELETE", path: `/locations/${a.locationId}/customValues/${a.id}` };
    // calendars (fully editable)
    case "calendars.list":   return { method: "GET", path: `/calendars/?locationId=${a.locationId}` };
    case "calendars.create": return { method: "POST", path: `/calendars/`, body: { locationId: a.locationId, name: a.name, description: a.description, slotDuration: a.slotDuration ? Number(a.slotDuration) : 30 } };
    case "calendars.update": return { method: "PUT", path: `/calendars/${a.id}`, body: { name: a.name, description: a.description } };
    case "calendars.delete": return { method: "DELETE", path: `/calendars/${a.id}` };
    // appointments (calendar events)
    case "appointments.list":   return { method: "GET", path: `/calendars/events?locationId=${a.locationId}${a.calendarId ? `&calendarId=${a.calendarId}` : ""}${a.startTime ? `&startTime=${a.startTime}` : ""}${a.endTime ? `&endTime=${a.endTime}` : ""}` };
    case "appointments.create": return { method: "POST", path: `/calendars/events/appointments`, body: { locationId: a.locationId, calendarId: a.calendarId, contactId: a.contactId, startTime: a.startTime, endTime: a.endTime, title: a.title } };
    case "appointments.update": return { method: "PUT", path: `/calendars/events/appointments/${a.id}`, body: { startTime: a.startTime, endTime: a.endTime, title: a.title } };
    case "appointments.delete": return { method: "DELETE", path: `/calendars/events/${a.id}` };
    // tags (account-level, editable)
    case "tags.list":   return { method: "GET", path: `/locations/${a.locationId}/tags` };
    case "tags.create": return { method: "POST", path: `/locations/${a.locationId}/tags`, body: { name: a.name } };
    case "tags.delete": return { method: "DELETE", path: `/locations/${a.locationId}/tags/${a.id}` };
    // products & prices (editable)
    case "products.list":   return { method: "GET", path: `/products/?locationId=${a.locationId}&limit=100` };
    case "products.create": return { method: "POST", path: `/products/`, body: { locationId: a.locationId, name: a.name, productType: a.productType ?? "SERVICE", description: a.description } };
    case "products.update": return { method: "PUT", path: `/products/${a.id}`, body: { locationId: a.locationId, name: a.name, description: a.description } };
    case "products.delete": return { method: "DELETE", path: `/products/${a.id}?locationId=${a.locationId}` };
    // opportunity delete + users
    case "opportunities.delete": return { method: "DELETE", path: `/opportunities/${a.id}` };
    case "users.list": return { method: "GET", path: `/users/?locationId=${a.locationId}` };
    default: return null;
  }
}

const OP_CATALOG = `
locations.list · snapshots.list · locations.create{name,phone?,email?,address?,city?,state?,timezone?,snapshotId?} (snapshotId loads your full template — pipelines, workflows, forms, calendars — into the new client) · locations.update{id,name?,phone?,email?,address?,city?,state?,postalCode?,website?,timezone?} · locations.delete{id}
contacts.list{locationId,query?} · contacts.create{locationId,name,phone?,email?} · contacts.update{id,name?,phone?,email?} · contacts.delete{id} · contacts.tag{id,tags}
conversations.list{locationId} · conversations.messages{id} · conversations.send{contactId,type(SMS|Email),message}
pipelines.list{locationId} · opportunities.list{locationId} · opportunities.create{locationId,pipelineId,pipelineStageId,name,contactId?,monetaryValue?} · opportunities.move{id,pipelineId,pipelineStageId} · opportunities.status{id,status(open|won|lost|abandoned)}
workflows.list{locationId} · workflows.enroll{contactId,workflowId} · notes.create{contactId,body} · tasks.create{contactId,title,dueDate?}
forms.list{locationId} · forms.submissions{locationId,formId?}
customfields.list{locationId} · customfields.create{locationId,name,dataType?} · customfields.update{locationId,id,name} · customfields.delete{locationId,id}
customvalues.list{locationId} · customvalues.create{locationId,name,value} · customvalues.update{locationId,id,name,value} · customvalues.delete{locationId,id}
calendars.list{locationId} · calendars.create{locationId,name,slotDuration?} · calendars.update{id,name} · calendars.delete{id}
appointments.list{locationId,calendarId?} · appointments.create{locationId,calendarId,contactId,startTime,endTime,title} · appointments.update{id,startTime?,endTime?,title?} · appointments.delete{id}
tags.list{locationId} · tags.create{locationId,name} · tags.delete{locationId,id}
products.list{locationId} · products.create{locationId,name} · products.update{id,locationId,name} · products.delete{id,locationId}
opportunities.delete{id} · users.list{locationId}
onboard.full{name,phone?,email?,snapshotId?,industry?,tone?,services?,pricing?,hours?,faqs?,inviteEmail?} — fully sets up a NEW client: creates from snapshot, personalizes it, and builds their AI receptionist. Use when the user wants to onboard/set up a new client.
dashboard.stats — cross-client KPIs (contacts, open deals, pipeline & won value per client). readonly.
client.health{locationId} — what's configured for a client (pipelines, calendars, custom values, workflows, AI brain, phone). readonly.
brain.get{slug} — read a client's AI receptionist knowledge (slug = the client's locationId). readonly.
brain.save{slug,business_name?,industry?,tone?,services?,pricing?,hours?,phone?,booking_url?,faqs?,custom_instructions?,assistant_name?} — update a client's AI receptionist knowledge.
radar.assign{email,trade,zips(comma-separated),city?} — grant a client an exclusive Lead Radar territory (their portal login email). radar.list — all territories. readonly. radar.remove{email} — revoke a territory.
`.trim();

// Full client onboarding in one call: create (from snapshot) → personalize custom
// values → create their AI receptionist brain → optionally invite a teammate.
async function onboardFull(a: Record<string, string>) {
  const steps: string[] = [];
  if (!a.name) return json({ ok: false, error: "name required" }, 400);
  // 1) create the sub-account (optionally from a snapshot = full template)
  const createBody: Record<string, unknown> = { companyId: GHL_COMPANY_ID, name: a.name, phone: a.phone, email: a.email, address: a.address, city: a.city, state: a.state, country: a.country ?? "US", timezone: a.timezone };
  if (a.snapshotId) createBody.snapshotId = a.snapshotId;
  const cr = await fetch(`${GHL_BASE}/locations/`, { method: "POST", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify(createBody) });
  const cd = await cr.json().catch(() => ({}));
  if (!cr.ok) return json({ ok: false, step: "create", status: cr.status, data: cd });
  const locationId = cd?.id || cd?.location?.id || cd?._id || "";
  steps.push("Created client" + (a.snapshotId ? " from your snapshot (pipelines, workflows, forms, calendars)" : ""));
  if (!locationId) return json({ ok: true, partial: true, steps, note: "created, but GHL didn't return a location id", data: cd });

  // 2) personalize: set business custom values the snapshot's automations use
  try {
    const lt = await locationToken(locationId);
    const cv = async (name: string, value?: string) => { if (value) { try { await fetch(`${GHL_BASE}/locations/${locationId}/customValues`, { method: "POST", headers: ghlHeaders(lt), body: JSON.stringify({ name, value }) }); } catch { /* ignore */ } } };
    await cv("Business Name", a.name); await cv("Business Phone", a.phone); await cv("Business Email", a.email);
    steps.push("Set business custom values (name / phone / email)");
  } catch { /* ignore */ }

  // 2.5) find the client's first calendar (from the snapshot) so their AI can book
  let bookingCalId = "";
  try {
    const lt2 = await locationToken(locationId);
    const calR = await fetch(`${GHL_BASE}/calendars/?locationId=${locationId}`, { headers: ghlHeaders(lt2) });
    const calD = await calR.json();
    const cals = calD?.calendars || [];
    if (Array.isArray(cals) && cals.length) { bookingCalId = cals[0].id; steps.push("Linked their booking calendar (" + (cals[0].name || bookingCalId) + ")"); }
  } catch { /* ignore */ }

  // 3) create the client's AI receptionist brain (Nova/Atlas)
  if (SB_URL && SB_SERVICE) {
    try {
      const rb = await fetch(`${SB_URL}/rest/v1/ai_brain?on_conflict=slug`, {
        method: "POST",
        headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ slug: locationId, is_demo: false, ghl_location_id: locationId, booking_calendar_id: bookingCalId, assistant_name: a.assistant_name || "Nova", business_name: a.name, industry: a.industry || "", tone: a.tone || "Friendly", services: a.services || "", pricing: a.pricing || "", hours: a.hours || "", phone: a.phone || "", booking_url: a.booking_url || "", faqs: a.faqs || "", custom_instructions: a.custom_instructions || "" }),
      });
      if (rb.ok) steps.push("Created their AI receptionist brain (slug = " + locationId + ")");
    } catch { /* ignore */ }
  }

  // 4) optionally invite a teammate to the new sub-account
  if (a.inviteEmail) {
    try {
      const ur = await fetch(`${GHL_BASE}/users/`, { method: "POST", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify({ companyId: GHL_COMPANY_ID, locationIds: [locationId], firstName: a.inviteFirstName || "", lastName: a.inviteLastName || "", email: a.inviteEmail, type: "account", role: "admin" }) });
      if (ur.ok) steps.push("Invited teammate " + a.inviteEmail);
    } catch { /* ignore */ }
  }

  return json({ ok: true, locationId, steps });
}

// ---- AI brain (client's receptionist knowledge) stored in Supabase ----
async function brainGet(a: Record<string, string>) {
  const slug = a.slug || a.locationId || "";
  if (!slug) return json({ ok: false, error: "slug required" }, 400);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "supabase not configured" }, 500);
  const r = await fetch(`${SB_URL}/rest/v1/ai_brain?slug=eq.${encodeURIComponent(slug)}&select=*`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
  const rows = await r.json().catch(() => []);
  return json({ ok: true, data: Array.isArray(rows) && rows.length ? rows[0] : null });
}
async function brainSave(a: Record<string, string>) {
  const slug = a.slug || a.locationId || "";
  if (!slug) return json({ ok: false, error: "slug required" }, 400);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "supabase not configured" }, 500);
  const row: Record<string, unknown> = { slug, is_demo: false };
  ["assistant_name","business_name","industry","tone","services","pricing","hours","service_area","phone","booking_url","faqs","custom_instructions","booking_calendar_id","ghl_location_id"].forEach((k) => { if (a[k] !== undefined) row[k] = a[k]; });
  const r = await fetch(`${SB_URL}/rest/v1/ai_brain?on_conflict=slug`, {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  const d = await r.json().catch(() => ({}));
  return json({ ok: r.ok, status: r.status, data: Array.isArray(d) ? d[0] : d });
}

// ---- cross-client dashboard: counts per sub-account for the home view ----
async function dashboardStats() {
  if (!GHL_API_KEY) return json({ ok: false, error: "GHL_API_KEY not set" }, 500);
  const lr = await fetch(`${GHL_BASE}/locations/search?companyId=${GHL_COMPANY_ID}&limit=100`, { headers: ghlHeaders(GHL_API_KEY) });
  const ld = await lr.json().catch(() => ({}));
  const locs = (ld?.locations || ld || []) as Array<Record<string, string>>;
  const rowsIn = Array.isArray(locs) ? locs : [];
  const rows = await Promise.all(rowsIn.map(async (l) => {
    const id = l.id;
    const out: Record<string, unknown> = { id, name: l.name || id, contacts: null, openDeals: null, pipelineValue: 0, wonValue: 0, hasBrain: false };
    try {
      const tok = await locationToken(id);
      const h = ghlHeaders(tok);
      // contacts total (limit=1, read meta.total)
      try { const c = await (await fetch(`${GHL_BASE}/contacts/?locationId=${id}&limit=1`, { headers: h })).json(); out.contacts = c?.meta?.total ?? (Array.isArray(c?.contacts) ? c.contacts.length : null); } catch { /* skip */ }
      // opportunities: open count + pipeline/won value
      try {
        const o = await (await fetch(`${GHL_BASE}/opportunities/search?location_id=${id}&limit=100`, { headers: h })).json();
        const opps = (o?.opportunities || []) as Array<Record<string, string>>;
        let open = 0, pv = 0, wv = 0;
        (Array.isArray(opps) ? opps : []).forEach((op) => { const v = Number(op.monetaryValue || 0) || 0; if (op.status === "open") { open++; pv += v; } if (op.status === "won") wv += v; });
        out.openDeals = o?.meta?.total ?? open; out.pipelineValue = pv; out.wonValue = wv;
      } catch { /* skip */ }
    } catch { /* skip */ }
    // does this client have an AI brain?
    if (SB_URL && SB_SERVICE) { try { const b = await fetch(`${SB_URL}/rest/v1/ai_brain?slug=eq.${encodeURIComponent(id)}&select=slug`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }); const br = await b.json(); out.hasBrain = Array.isArray(br) && br.length > 0; } catch { /* skip */ } }
    return out;
  }));
  return json({ ok: true, data: rows });
}

// shared cache of locations for clientHealth's phone lookup
let locList: Array<Record<string, string>> = [];
async function refreshLocList() { try { const lr = await fetch(`${GHL_BASE}/locations/search?companyId=${GHL_COMPANY_ID}&limit=100`, { headers: ghlHeaders(GHL_API_KEY) }); const ld = await lr.json(); const l = ld?.locations || ld || []; locList = Array.isArray(l) ? l : []; } catch { /* skip */ } }

// ---- per-client setup health: what's configured vs missing ----
async function clientHealth(a: Record<string, string>) {
  const id = a.locationId || a.id || "";
  if (!id) return json({ ok: false, error: "locationId required" }, 400);
  const loc = { hasPhone: false, pipelines: 0, calendars: 0, customValues: 0, workflows: 0, hasBrain: false };
  try {
    if (!locList.length) await refreshLocList();
    const tok = await locationToken(id);
    const h = ghlHeaders(tok);
    const get = async (p: string) => { try { return await (await fetch(`${GHL_BASE}${p}`, { headers: h })).json(); } catch { return {}; } };
    const li = (locList.find((x) => x.id === id) as Record<string, string>) || {};
    const [pi, ca, cv, wf] = await Promise.all([
      get(`/opportunities/pipelines?locationId=${id}`),
      get(`/calendars/?locationId=${id}`),
      get(`/locations/${id}/customValues`),
      get(`/workflows/?locationId=${id}`),
    ]);
    loc.hasPhone = !!(li.phone);
    loc.pipelines = (pi?.pipelines || []).length || 0;
    loc.calendars = (ca?.calendars || []).length || 0;
    loc.customValues = (cv?.customValues || []).length || 0;
    loc.workflows = (wf?.workflows || []).length || 0;
  } catch { /* skip */ }
  if (SB_URL && SB_SERVICE) { try { const b = await fetch(`${SB_URL}/rest/v1/ai_brain?slug=eq.${encodeURIComponent(id)}&select=slug`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }); const br = await b.json(); loc.hasBrain = Array.isArray(br) && br.length > 0; } catch { /* skip */ } }
  return json({ ok: true, data: loc });
}
// ---- Lead Radar territories: exclusive trade+zips slots sold per client ----
async function radarAssign(a: Record<string, string>) {
  const email = (a.email ?? "").toLowerCase().trim();
  if (!email) return json({ ok: false, error: "email required" }, 400);
  const zips = String(a.zips ?? "").split(",").map((z) => z.trim()).filter(Boolean);
  const row = { email, trade: a.trade || "roofing", zips, city: a.city || "austin", active: a.active !== "false", updated_at: new Date().toISOString() };
  const r = await fetch(`${SB_URL}/rest/v1/radar_territories?on_conflict=email`, {
    method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  const d = await r.json().catch(() => ({}));
  return json({ ok: r.ok, data: Array.isArray(d) ? d[0] : d });
}
async function radarList() {
  const r = await fetch(`${SB_URL}/rest/v1/radar_territories?select=*&order=updated_at.desc`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
  return json({ ok: r.ok, data: await r.json().catch(() => []) });
}
async function radarRemove(a: Record<string, string>) {
  const email = (a.email ?? "").toLowerCase().trim();
  if (!email) return json({ ok: false, error: "email required" }, 400);
  const r = await fetch(`${SB_URL}/rest/v1/radar_territories?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
  return json({ ok: r.ok });
}

// ---- persistent memory for the command-center AI ----
const sbHeaders = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
async function memorySave(email: string, a: Record<string, string>) {
  if (!a.note) return json({ ok: false, error: "note required" }, 400);
  const r = await fetch(`${SB_URL}/rest/v1/ai_memory`, { method: "POST", headers: { ...sbHeaders, Prefer: "return=representation" }, body: JSON.stringify({ owner_email: email, note: String(a.note).slice(0, 2000) }) });
  const d = await r.json().catch(() => ({}));
  return json({ ok: r.ok, data: Array.isArray(d) ? d[0] : d });
}
async function memoryList(email: string) {
  const r = await fetch(`${SB_URL}/rest/v1/ai_memory?owner_email=eq.${encodeURIComponent(email)}&select=*&order=created_at.desc&limit=100`, { headers: sbHeaders });
  return json({ ok: r.ok, data: await r.json().catch(() => []) });
}
async function memoryDelete(email: string, a: Record<string, string>) {
  if (!a.id) return json({ ok: false, error: "id required" }, 400);
  const r = await fetch(`${SB_URL}/rest/v1/ai_memory?id=eq.${encodeURIComponent(a.id)}&owner_email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: sbHeaders });
  return json({ ok: r.ok });
}
async function loadMemories(email: string): Promise<string> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ai_memory?owner_email=eq.${encodeURIComponent(email)}&select=note&order=created_at.desc&limit=40`, { headers: sbHeaders });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return "";
    return rows.map((m: { note: string }) => "- " + m.note).join("\n");
  } catch { return ""; }
}

// ---- audit log: record every write action (fire-and-forget) ----
function isWriteOp(op: string): boolean {
  return !/\.(list|messages|submissions|get)$/.test(op) && op !== "dashboard.stats" && op !== "client.health" && op !== "ai.plan";
}
function audit(actor: string, op: string, args: unknown, ok: boolean, status: number) {
  if (!SB_URL || !SB_SERVICE) return;
  fetch(`${SB_URL}/rest/v1/audit_log`, { method: "POST", headers: sbHeaders, body: JSON.stringify({ actor, op, args: args ?? {}, ok, status }) }).catch(() => {});
}
async function auditList() {
  const r = await fetch(`${SB_URL}/rest/v1/audit_log?select=*&order=created_at.desc&limit=100`, { headers: sbHeaders });
  return json({ ok: r.ok, data: await r.json().catch(() => []) });
}

async function callGHL(op: string, args: Record<string, string>, actor = "") {
  const spec = opToRequest(op, args);
  if (!spec) return json({ error: `unknown op: ${op}` }, 400);
  if (!GHL_API_KEY) return json({ error: "GHL_API_KEY not set" }, 500);
  // locations.* are agency-level; everything else is sub-account data → use a location token.
  const agencyLevel = op.startsWith("locations.") || op.startsWith("snapshots.");
  const token = agencyLevel ? GHL_API_KEY : await locationToken(args.locationId || "");
  const r = await fetch(`${GHL_BASE}${spec.path}`, {
    method: spec.method,
    headers: ghlHeaders(token),
    body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
  });
  const text = await r.text();
  let data: unknown; try { data = JSON.parse(text); } catch { data = text; }
  if (isWriteOp(op)) audit(actor, op, args, r.ok, r.status);
  return json({ ok: r.ok, status: r.status, data });
}

// ---- batch: run a multi-step plan in one approved call ----
async function runBatch(steps: Array<{ op: string; args?: Record<string, string> }>, actor: string) {
  const results: Array<{ op: string; ok: boolean; status?: number; data?: unknown }> = [];
  for (const s of (steps || []).slice(0, 10)) {
    if (!s?.op) continue;
    try {
      const resp = await callGHL(s.op, s.args ?? {}, actor);
      const body = await resp.json();
      results.push({ op: s.op, ok: body.ok !== false, status: body.status, data: body.data });
      if (body.ok === false) break;   // stop the chain on the first failure
    } catch (e) {
      results.push({ op: s.op, ok: false, data: String(e).slice(0, 200) });
      break;
    }
  }
  return json({ ok: results.every((r) => r.ok), results });
}

// Gemini call with retries — free tier throws 503/429 under load.
async function gemini(body: unknown): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  let r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  for (let i = 0; i < 2 && (r.status === 503 || r.status === 429); i++) {
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  return r;
}

async function aiChat(command: string, history: Array<{ role: string; content: string }>, email: string) {
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);
  const memories = await loadMemories(email);
  const system =
    `You are the AI operator assistant inside an agency owner's private GoHighLevel command center. ` +
    `You help them run their agency: clients (sub-accounts), contacts, conversations, deals/pipelines, calendars, forms, custom fields, tags, products, and more.\n\n` +
    (memories ? `THINGS THE OWNER TOLD YOU TO REMEMBER (always respect these):\n${memories}\n\n` : "") +
    `You do THREE things:\n` +
    `1) CHAT — answer questions, explain, give advice, be conversational.\n` +
    `2) ACT — perform ONE action from the ops catalog.\n` +
    `3) PLAN — for multi-part requests, propose a SEQUENCE of steps (up to 8). The owner approves once and every step runs in order.\n\n` +
    `Rules:\n` +
    `- If the user asks something that needs live data (counts, lists, "what's in…"), choose the matching READ op (a *.list / *.messages / *.submissions op) and set readonly=true. The app runs it and sends you the data so you can answer.\n` +
    `- For CHANGES (create/update/delete/send/move/enroll/tag/book), propose the action with readonly=false. The owner approves before it runs.\n` +
    `- If a request needs SEVERAL changes ("create a client AND add a calendar AND tag…"), use mode "plan" with steps:[{op,args,summary},...] in execution order. Steps run top to bottom; a step CANNOT use an id created by an earlier step in the same plan — if a later step needs a new id, stop the plan there and say you'll continue after it runs.\n` +
    `- When the owner says "remember …" or states a lasting preference, ACT with op memory.save{note} (readonly=false).\n` +
    `- If you're just answering/chatting, use mode "reply".\n` +
    `- Never invent ops or ids. If you need an id you don't have, ask in "text".\n\n` +
    `OPS:\n${OP_CATALOG}\n` +
    `memory.save{note} — permanently remember a fact/preference the owner tells you · memory.list — see saved memories · memory.delete{id}\n` +
    `audit.list — recent actions taken in this command center. readonly.\n\n` +
    `Respond ONLY as compact JSON: {"mode":"reply"|"action"|"plan","text":"<friendly message — always include>","op":"<op or empty>","args":{...},"steps":[{"op":"..","args":{..},"summary":".."}],"summary":"<what the action/plan does>","readonly":true|false}. Omit steps unless mode is "plan".`;
  const contents = [
    ...(Array.isArray(history) ? history : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-14)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content).slice(0, 3000) }] })),
    { role: "user", parts: [{ text: command }] },
  ];
  const r = await gemini({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3, responseMimeType: "application/json" } });
  if (!r.ok) return json({ error: "planner error", detail: (await r.text()).slice(0, 300) }, 502);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
  let plan: unknown; try { plan = JSON.parse(raw); } catch { plan = { mode: "reply", text: raw || "(no reply)" }; }
  return json({ plan });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = await requireAdmin(req);
  if (!admin.ok) return json({ error: "not authorized", reason: admin.reason }, 403);

  let body: { op?: string; args?: Record<string, string>; command?: string; history?: Array<{ role: string; content: string }> };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  if (body.op === "ai.plan") return aiChat((body.command ?? "").slice(0, 2000), body.history ?? [], admin.email);
  if (body.op === "onboard.full") { const resp = await onboardFull(body.args ?? {}); audit(admin.email, "onboard.full", body.args, true, 200); return resp; }
  if (body.op === "dashboard.stats") return dashboardStats();
  if (body.op === "client.health") return clientHealth(body.args ?? {});
  if (body.op === "brain.get") return brainGet(body.args ?? {});
  if (body.op === "brain.save") { const resp = await brainSave(body.args ?? {}); audit(admin.email, "brain.save", { slug: (body.args ?? {}).slug }, true, 200); return resp; }
  if (body.op === "radar.assign") { const resp = await radarAssign(body.args ?? {}); audit(admin.email, "radar.assign", body.args, true, 200); return resp; }
  if (body.op === "radar.list") return radarList();
  if (body.op === "radar.remove") { const resp = await radarRemove(body.args ?? {}); audit(admin.email, "radar.remove", body.args, true, 200); return resp; }
  if (body.op === "memory.save") return memorySave(admin.email, body.args ?? {});
  if (body.op === "memory.list") return memoryList(admin.email);
  if (body.op === "memory.delete") return memoryDelete(admin.email, body.args ?? {});
  if (body.op === "audit.list") return auditList();
  if (body.op === "batch") return runBatch((body as { steps?: Array<{ op: string; args?: Record<string, string> }> }).steps ?? [], admin.email);
  if (!body.op) return json({ error: "op required" }, 400);
  return callGHL(body.op, body.args ?? {}, admin.email);
});
