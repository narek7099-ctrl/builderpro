// GoHighLevel access shared by the command center and self-serve sign-up.
// Ported from the old AGENCY function: agency OAuth token, per-location
// tokens, the op catalog, and full client onboarding from a snapshot.

export const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
export const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
export const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
export const GHL_SNAPSHOT_ID = Deno.env.get("GHL_SNAPSHOT_ID") ?? "";
const GHL_CLIENT_ID = Deno.env.get("GHL_CLIENT_ID") ?? "";
const GHL_CLIENT_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
export const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const GHL_BASE = "https://services.leadconnectorhq.com";

export const sbHeaders = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
export const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init.headers ?? {}) } });
export const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

let _agencyTok: { token: string; exp: number } | null = null;
async function agencyOAuthToken(): Promise<string> {
  if (_agencyTok && _agencyTok.exp > Date.now() + 60000) return _agencyTok.token;
  try {
    const rows = await (await sb("ghl_oauth?id=eq.1&select=*")).json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row?.refresh_token) return "";
    const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (row.access_token && exp > Date.now() + 60000) { _agencyTok = { token: row.access_token, exp }; return row.access_token; }
    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) return row.access_token ?? "";
    const rr = await fetch(`${GHL_BASE}/oauth/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: GHL_CLIENT_ID, client_secret: GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString(),
    });
    const d = await rr.json();
    if (!rr.ok || !d.access_token) return row.access_token ?? "";
    const newExp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    _agencyTok = { token: d.access_token, exp: newExp };
    await sb("ghl_oauth?id=eq.1", { method: "PATCH", body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(newExp).toISOString(), updated_at: new Date().toISOString() }) });
    return d.access_token;
  } catch { return ""; }
}

const locTokenCache: Record<string, string> = {};
export async function locationToken(locationId: string): Promise<string> {
  if (!locationId) return GHL_API_KEY;
  if (locTokenCache[locationId]) return locTokenCache[locationId];
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) return (locTokenCache[locationId] = perLoc);
  try {
    const minter = (await agencyOAuthToken()) || GHL_API_KEY;
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST", headers: { Authorization: `Bearer ${minter}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString(),
    });
    if (r.ok) { const d = await r.json(); if (d?.access_token) return (locTokenCache[locationId] = d.access_token); }
  } catch { /* fall through */ }
  return GHL_TOKEN || GHL_API_KEY;
}

type A = Record<string, string>;
export function opToRequest(op: string, a: A = {}): { method: string; path: string; body?: unknown } | null {
  switch (op) {
    case "locations.list": return { method: "GET", path: `/locations/search?companyId=${GHL_COMPANY_ID}&limit=100` };
    case "snapshots.list": return { method: "GET", path: `/snapshots/?companyId=${GHL_COMPANY_ID}` };
    case "locations.update": {
      const b: Record<string, string> = { companyId: GHL_COMPANY_ID };
      ["name", "phone", "email", "address", "city", "state", "postalCode", "website", "timezone"].forEach((k) => { if (a[k]) b[k] = a[k]; });
      return { method: "PUT", path: `/locations/${a.id}`, body: b };
    }
    case "locations.delete": return { method: "DELETE", path: `/locations/${a.id}?companyId=${GHL_COMPANY_ID}&deleteTwilioAccount=false` };
    case "contacts.list": return { method: "GET", path: `/contacts/?locationId=${a.locationId}&limit=100${a.query ? `&query=${encodeURIComponent(a.query)}` : ""}` };
    case "contacts.create": return { method: "POST", path: `/contacts/`, body: { locationId: a.locationId, name: a.name, phone: a.phone, email: a.email } };
    case "contacts.update": return { method: "PUT", path: `/contacts/${a.id}`, body: { name: a.name, phone: a.phone, email: a.email } };
    case "contacts.delete": return { method: "DELETE", path: `/contacts/${a.id}` };
    case "contacts.tag": return { method: "POST", path: `/contacts/${a.id}/tags`, body: { tags: String(a.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean) } };
    case "conversations.list": return { method: "GET", path: `/conversations/search?locationId=${a.locationId}&limit=50` };
    case "conversations.messages": return { method: "GET", path: `/conversations/${a.id}/messages` };
    case "conversations.send": return { method: "POST", path: `/conversations/messages`, body: { type: a.type ?? "SMS", contactId: a.contactId, message: a.message, ...(a.subject ? { subject: a.subject, html: a.message } : {}) } };
    case "pipelines.list": return { method: "GET", path: `/opportunities/pipelines?locationId=${a.locationId}` };
    case "opportunities.list": return { method: "GET", path: `/opportunities/search?location_id=${a.locationId}&limit=50` };
    case "opportunities.create": return { method: "POST", path: `/opportunities/`, body: { locationId: a.locationId, pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId, name: a.name, status: a.status ?? "open", contactId: a.contactId, monetaryValue: a.monetaryValue ? Number(a.monetaryValue) : undefined } };
    case "opportunities.move": return { method: "PUT", path: `/opportunities/${a.id}`, body: { pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId } };
    case "opportunities.status": return { method: "PUT", path: `/opportunities/${a.id}/status`, body: { status: a.status } };
    case "workflows.list": return { method: "GET", path: `/workflows/?locationId=${a.locationId}` };
    case "workflows.enroll": return { method: "POST", path: `/contacts/${a.contactId}/workflow/${a.workflowId}`, body: {} };
    case "notes.create": return { method: "POST", path: `/contacts/${a.contactId}/notes`, body: { body: a.body } };
    case "tasks.create": return { method: "POST", path: `/contacts/${a.contactId}/tasks`, body: { title: a.title, body: a.body ?? "", dueDate: a.dueDate, completed: false } };
    case "forms.list": return { method: "GET", path: `/forms/?locationId=${a.locationId}&limit=100` };
    case "forms.submissions": return { method: "GET", path: `/forms/submissions?locationId=${a.locationId}&limit=100${a.formId ? `&formId=${a.formId}` : ""}` };
    case "customfields.list": return { method: "GET", path: `/locations/${a.locationId}/customFields` };
    case "customfields.create": return { method: "POST", path: `/locations/${a.locationId}/customFields`, body: { name: a.name, dataType: a.dataType ?? "TEXT", model: a.model ?? "contact" } };
    case "customvalues.list": return { method: "GET", path: `/locations/${a.locationId}/customValues` };
    case "customvalues.create": return { method: "POST", path: `/locations/${a.locationId}/customValues`, body: { name: a.name, value: a.value } };
    case "customvalues.update": return { method: "PUT", path: `/locations/${a.locationId}/customValues/${a.id}`, body: { name: a.name, value: a.value } };
    case "calendars.list": return { method: "GET", path: `/calendars/?locationId=${a.locationId}` };
    case "calendars.create": return { method: "POST", path: `/calendars/`, body: { locationId: a.locationId, name: a.name, description: a.description, slotDuration: a.slotDuration ? Number(a.slotDuration) : 30 } };
    case "appointments.list": return { method: "GET", path: `/calendars/events?locationId=${a.locationId}${a.calendarId ? `&calendarId=${a.calendarId}` : ""}${a.startTime ? `&startTime=${a.startTime}` : ""}${a.endTime ? `&endTime=${a.endTime}` : ""}` };
    case "appointments.create": return { method: "POST", path: `/calendars/events/appointments`, body: { locationId: a.locationId, calendarId: a.calendarId, contactId: a.contactId, startTime: a.startTime, endTime: a.endTime, title: a.title } };
    case "tags.list": return { method: "GET", path: `/locations/${a.locationId}/tags` };
    case "tags.create": return { method: "POST", path: `/locations/${a.locationId}/tags`, body: { name: a.name } };
    case "products.list": return { method: "GET", path: `/products/?locationId=${a.locationId}&limit=100` };
    case "products.create": return { method: "POST", path: `/products/`, body: { locationId: a.locationId, name: a.name, productType: a.productType ?? "SERVICE", description: a.description } };
    case "users.list": return { method: "GET", path: `/users/?locationId=${a.locationId}` };
    default: return null;
  }
}
export const GHL_OPS = [
  "locations.list", "snapshots.list", "locations.update", "locations.delete",
  "contacts.list", "contacts.create", "contacts.update", "contacts.delete", "contacts.tag",
  "conversations.list", "conversations.messages", "conversations.send",
  "pipelines.list", "opportunities.list", "opportunities.create", "opportunities.move", "opportunities.status",
  "workflows.list", "workflows.enroll", "notes.create", "tasks.create", "forms.list", "forms.submissions",
  "customfields.list", "customfields.create", "customvalues.list", "customvalues.create", "customvalues.update",
  "calendars.list", "calendars.create", "appointments.list", "appointments.create",
  "tags.list", "tags.create", "products.list", "products.create", "users.list",
];
export const isRead = (op: string) => /\.(list|messages|submissions)$/.test(op);

export async function callGHL(op: string, args: A): Promise<{ ok: boolean; status: number; data: unknown }> {
  const spec = opToRequest(op, args);
  if (!spec) return { ok: false, status: 400, data: `unknown op ${op}` };
  if (!GHL_API_KEY) return { ok: false, status: 500, data: "GHL_API_KEY not set" };
  const agencyLevel = op.startsWith("locations.") || op.startsWith("snapshots.");
  const token = agencyLevel ? GHL_API_KEY : await locationToken(args.locationId || "");
  const r = await fetch(`${GHL_BASE}${spec.path}`, { method: spec.method, headers: ghlHeaders(token), body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined });
  const text = await r.text();
  let data: unknown; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

/* A new client, end to end: GHL sub-account from the snapshot, business
   custom values, their AI receptionist brain, and a GHL login. */
// deno-lint-ignore no-explicit-any
type Profile = Record<string, any>;
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
export function hoursText(h: Profile | undefined): string {
  if (!h) return "";
  return DAYS.map(([k, n]) => { const d = h[k]; return d && d.open ? `${n} ${d.from}-${d.to}` : `${n} closed`; }).join(", ");
}
export async function provisionClient(a: { name: string; business: string; email: string; phone?: string; trade?: string; profile?: Profile; plan?: string }): Promise<{ ok: boolean; locationId: string; steps: string[]; error?: string }> {
  const pf: Profile = a.profile ?? {};
  const steps: string[] = [];
  if (!GHL_API_KEY || !GHL_COMPANY_ID) return { ok: false, locationId: "", steps, error: "GHL_API_KEY / GHL_COMPANY_ID not set" };
  const body: Record<string, unknown> = { companyId: GHL_COMPANY_ID, name: a.business || a.name, phone: a.phone || undefined, email: a.email, country: "US",
    address: pf.address || undefined, city: pf.city || undefined, state: pf.state || undefined, postalCode: pf.zip || undefined, website: pf.website || undefined, timezone: pf.timezone || undefined };
  // each plan has its own template snapshot; the generic one is the fallback
  const PLAN_SNAP: Record<string, string> = { foundation: "m8xaXFkznoQZLjySnFlZ", os: "cdRGIx2azgolhnDj257c", enterprise: "cWoCOr2RJDfc3x3FxnQm" };
  const snap = (a.plan && (Deno.env.get("GHL_SNAPSHOT_" + a.plan.toUpperCase()) || PLAN_SNAP[a.plan])) || GHL_SNAPSHOT_ID;
  if (snap) body.snapshotId = snap;
  const cr = await fetch(`${GHL_BASE}/locations/`, { method: "POST", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify(body) });
  const cd = await cr.json().catch(() => ({}));
  if (!cr.ok) return { ok: false, locationId: "", steps, error: `GHL said ${cr.status}: ${JSON.stringify(cd).slice(0, 200)}` };
  const locationId = cd?.id || cd?.location?.id || cd?._id || "";
  steps.push("GHL sub-account created" + (snap ? " from the " + (a.plan || "default") + " snapshot" : " (no snapshot set, so it's empty)"));
  if (!locationId) return { ok: true, locationId, steps };
  try {
    const lt = await locationToken(locationId);
    // the plan snapshot already has these custom values (placeholders), so update
    // the existing one by name; create it only when the snapshot doesn't have it
    const have: { id: string; name: string }[] = await fetch(`${GHL_BASE}/locations/${locationId}/customValues`, { headers: ghlHeaders(lt) })
      .then((r) => r.json()).then((d) => d?.customValues ?? []).catch(() => []);
    for (const [n, v] of [["Business Name", a.business], ["Business Phone", a.phone], ["Business Email", a.email], ["Business Address", [pf.address, pf.city, pf.state, pf.zip].filter(Boolean).join(", ")],
      ["Business Website", pf.website], ["Service Area", pf.serviceArea], ["Business Hours", hoursText(pf.hours)], ["Trade", a.trade], ["Owner Name", a.name], ["License Number", pf.license],
      ["Owner Email", a.email], ["Owner Phone", a.phone]]) {
      if (!v) continue;
      const cur = have.find((x) => String(x.name).toLowerCase() === String(n).toLowerCase());
      await fetch(`${GHL_BASE}/locations/${locationId}/customValues${cur ? "/" + cur.id : ""}`, { method: cur ? "PUT" : "POST", headers: ghlHeaders(lt), body: JSON.stringify({ name: n, value: v }) }).catch(() => {});
    }
    steps.push("Business details filled in");
  } catch { /* optional */ }
  let calId = "";
  try {
    const cd2 = await (await fetch(`${GHL_BASE}/calendars/?locationId=${locationId}`, { headers: ghlHeaders(await locationToken(locationId)) })).json();
    // OS/Enterprise snapshots also carry Job + Maintenance Visit calendars; the AI books inspections
    const cals: { id: string; name?: string }[] = cd2?.calendars ?? [];
    calId = (cals.find((c) => /inspection/i.test(c.name ?? "")) ?? cals[0])?.id ?? "";
  } catch { /* optional */ }
  const rb = await sb("ai_brain?on_conflict=slug", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ slug: locationId, is_demo: false, ghl_location_id: locationId, owner_email: a.email, booking_calendar_id: calId,
      assistant_name: pf.assistantName || "Lisa", business_name: a.business, industry: a.trade || "", tone: pf.tone || "Friendly", phone: a.phone || "",
      services: pf.services || "", pricing: pf.pricing || "", hours: hoursText(pf.hours), service_area: pf.serviceArea || "", faqs: pf.faqs || "",
      custom_instructions: [pf.emergency ? "We offer emergency service: " + pf.emergency : "", pf.leadGoal ? "Main goal on every call: " + pf.leadGoal : "", pf.languages ? "Languages spoken: " + pf.languages : "", pf.notes || ""].filter(Boolean).join("\n") }),
  });
  if (rb.ok) steps.push("AI receptionist set up" + (pf.services ? " with their services, hours and FAQs" : ""));
  try {
    const [first, ...rest] = (a.name || "").trim().split(/\s+/);
    const ur = await fetch(`${GHL_BASE}/users/`, {
      method: "POST", headers: ghlHeaders(GHL_API_KEY),
      body: JSON.stringify({ companyId: GHL_COMPANY_ID, locationIds: [locationId], firstName: first || a.business, lastName: rest.join(" "), email: a.email, phone: a.phone || "", type: "account", role: "admin",
        permissions: { paymentsEnabled: true, settingsEnabled: true, invoiceEnabled: true, contactsEnabled: true, conversationsEnabled: true, appointmentsEnabled: true, opportunitiesEnabled: true, dashboardStatsEnabled: true, reviewsEnabled: true, marketingEnabled: true, workflowsEnabled: true, phoneCallEnabled: true } }),
    });
    steps.push(ur.ok ? "GHL login created for " + a.email : "GHL login not created (" + ur.status + ")");
  } catch { steps.push("GHL login not created"); }
  return { ok: true, locationId, steps };
}
