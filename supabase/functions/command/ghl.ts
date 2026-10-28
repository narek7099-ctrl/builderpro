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
  /* the client's own key, saved from the Command Center (ghl_keys) */
  try { const k = (await (await sb(`ghl_keys?location_id=eq.${encodeURIComponent(locationId)}&select=token`)).json())?.[0]?.token; if (k) return (locTokenCache[locationId] = k); } catch { /* none */ }
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
   custom values and their AI receptionist brain. */
// deno-lint-ignore no-explicit-any
type Profile = Record<string, any>;
const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
export function hoursText(h: Profile | undefined): string {
  if (!h) return "";
  return DAYS.map(([k, n]) => { const d = h[k]; return d && d.open ? `${n} ${d.from}-${d.to}` : `${n} closed`; }).join(", ");
}
// each plan has its own template snapshot; the generic one is the fallback
const PLAN_SNAP: Record<string, string> = { foundation: "m8xaXFkznoQZLjySnFlZ", os: "cdRGIx2azgolhnDj257c", enterprise: "cWoCOr2RJDfc3x3FxnQm" };
const planSnap = (plan?: string) => (plan && (Deno.env.get("GHL_SNAPSHOT_" + plan.toUpperCase()) || PLAN_SNAP[plan])) || GHL_SNAPSHOT_ID;
export const PLAN_NAME: Record<string, string> = { foundation: "Foundation", os: "OS", enterprise: "Enterprise" };

/* The ready pool: blank sub-accounts made while the agency is on Agency Pro
   (the only plan whose API can create them). A sign-up takes one when
   HighLevel won't create a new sub-account. */
export async function createPoolAccount(plan: string, n: number): Promise<{ ok: boolean; locationId?: string; error?: string }> {
  if (!GHL_API_KEY || !GHL_COMPANY_ID) return { ok: false, error: "GHL_API_KEY / GHL_COMPANY_ID not set" };
  const name = `BuilderPro pool · ${PLAN_NAME[plan] ?? plan} ${n}`, snap = planSnap(plan);
  const cr = await fetch(`${GHL_BASE}/locations/`, { method: "POST", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify({ companyId: GHL_COMPANY_ID, name, country: "US", ...(snap ? { snapshotId: snap } : {}) }) });
  const cd = await cr.json().catch(() => ({}));
  const locationId = cd?.id || cd?.location?.id || cd?._id || "";
  if (!cr.ok || !locationId) return { ok: false, error: `GHL said ${cr.status}: ${JSON.stringify(cd).slice(0, 200)}` };
  await sb("ghl_pool", { method: "POST", body: JSON.stringify({ location_id: locationId, plan, name }) });
  return { ok: true, locationId };
}
async function takePooled(a: { name: string; business: string; email: string; phone?: string; profile?: Profile; plan?: string; userId?: string }, steps: string[]): Promise<string> {
  const r = await sb("rpc/ghl_pool_take", { method: "POST", body: JSON.stringify({ p_plan: a.plan || "enterprise", p_user: a.userId || null }) });
  const loc = r.ok ? String((await r.json().catch(() => "")) ?? "") : "";
  if (!loc) return "";
  const pf: Profile = a.profile ?? {};
  steps.push(`Took a ready ${PLAN_NAME[a.plan || "enterprise"] ?? a.plan} sub-account from the pool (${loc})`);
  // the pool account still has its pool name: give it the client's business details
  const body: Record<string, string> = { companyId: GHL_COMPANY_ID, name: a.business || a.name, email: a.email };
  for (const [k, v] of [["phone", a.phone], ["address", pf.address], ["city", pf.city], ["state", pf.state], ["postalCode", pf.zip], ["website", pf.website], ["timezone", pf.timezone]]) if (v) body[k as string] = String(v);
  const u = await fetch(`${GHL_BASE}/locations/${loc}`, { method: "PUT", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify(body) }).catch(() => null);
  steps.push(u?.ok ? "Renamed to " + (a.business || a.name) : `Couldn't rename it in HighLevel (${u?.status ?? "no answer"}): rename it to ${a.business || a.name} by hand`);
  return loc;
}

export async function provisionClient(a: { name: string; business: string; email: string; phone?: string; trade?: string; profile?: Profile; plan?: string; userId?: string }): Promise<{ ok: boolean; locationId: string; steps: string[]; error?: string }> {
  const pf: Profile = a.profile ?? {};
  const steps: string[] = [];
  if (!GHL_API_KEY || !GHL_COMPANY_ID) return { ok: false, locationId: "", steps, error: "GHL_API_KEY / GHL_COMPANY_ID not set" };
  const body: Record<string, unknown> = { companyId: GHL_COMPANY_ID, name: a.business || a.name, phone: a.phone || undefined, email: a.email, country: "US",
    address: pf.address || undefined, city: pf.city || undefined, state: pf.state || undefined, postalCode: pf.zip || undefined, website: pf.website || undefined, timezone: pf.timezone || undefined };
  const snap = planSnap(a.plan);
  if (snap) body.snapshotId = snap;
  const cr = await fetch(`${GHL_BASE}/locations/`, { method: "POST", headers: ghlHeaders(GHL_API_KEY), body: JSON.stringify(body) });
  const cd = await cr.json().catch(() => ({}));
  if (!cr.ok) {
    const pooled = await takePooled(a, steps).catch(() => "");
    if (pooled) { await finishClient(pooled, a, steps); await retryLater(a.userId, steps); return { ok: true, locationId: pooled, steps }; }
    return { ok: false, locationId: "", steps, error: `GHL said ${cr.status}: ${JSON.stringify(cd).slice(0, 200)}` + (cr.status === 403 ? " (and the ready pool is empty)" : "") };
  }
  const locationId = cd?.id || cd?.location?.id || cd?._id || "";
  steps.push("GHL sub-account created" + (snap ? " from the " + (a.plan || "default") + " snapshot" : " (no snapshot set, so it's empty)"));
  if (!locationId) return { ok: true, locationId, steps };
  await finishClient(locationId, a, steps);
  await retryLater(a.userId, steps);
  return { ok: true, locationId, steps };
}
/* details HighLevel turned down: the ghl-diag watcher fills them in on a later tick */
async function retryLater(userId: string | undefined, steps: string[]) {
  if (!userId || !steps.some((x) => /not filled in/.test(x))) return;
  const r = await sb("ai_config?key=eq.refinish&select=value"), cur = String((r.ok ? await r.json() : [])[0]?.value ?? "");
  const ids = cur.split(",").map((x) => x.trim()).filter(Boolean);
  if (!ids.includes(userId)) await sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "refinish", value: [...ids, userId].join(",") }) });
}

/* Everything after the sub-account exists: business custom values, the
   booking calendar and the AI receptionist. Also run when a
   sub-account was made by hand and its key added in the Command Center. */
export async function finishClient(locationId: string, a: { name: string; business: string; email: string; phone?: string; trade?: string; profile?: Profile }, steps: string[] = []): Promise<string[]> {
  const pf: Profile = a.profile ?? {};
  try {
    const lt = await locationToken(locationId);
    // the plan snapshot already has these custom values (placeholders), so update
    // the existing one by name; create it only when the snapshot doesn't have it
    const cvr = await fetch(`${GHL_BASE}/locations/${locationId}/customValues`, { headers: ghlHeaders(lt) }).catch(() => null);
    const have: { id: string; name: string }[] = cvr?.ok ? await cvr.json().then((d) => d?.customValues ?? []).catch(() => []) : [];
    let filled = 0;
    for (const [n, v] of [["Business Name", a.business], ["Business Phone", a.phone], ["Business Email", a.email], ["Business Address", [pf.address, pf.city, pf.state, pf.zip].filter(Boolean).join(", ")],
      ["Business Website", pf.website], ["Service Area", pf.serviceArea], ["Business Hours", hoursText(pf.hours)], ["Trade", a.trade], ["Owner Name", a.name], ["License Number", pf.license],
      ["Owner Email", a.email], ["Owner Phone", a.phone],
      // the AI receptionist's name: its greeting and prompt read this, and a blank one makes it invent a name
      ["ridge_assistant_name", pf.assistantName || "Lisa"]]) {
      if (!v) continue;
      const cur = have.find((x) => String(x.name).toLowerCase() === String(n).toLowerCase());
      const w = await fetch(`${GHL_BASE}/locations/${locationId}/customValues${cur ? "/" + cur.id : ""}`, { method: cur ? "PUT" : "POST", headers: ghlHeaders(lt), body: JSON.stringify({ name: n, value: v }) }).catch(() => null);
      if (w?.ok) filled++;
    }
    // only say it worked when HighLevel took them (the watcher retries if not)
    steps.push(filled ? `Business details filled in (${filled} custom values)` : `Business details not filled in: HighLevel said ${cvr?.status ?? "nothing"}`);
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
  /* no HighLevel login for the client: HighLevel would email them an invite to
     sign in there, and contractors work in BuilderPro only */
  return steps;
}

/* BuilderPro's own customers in the house HighLevel account: each status change
   (trial, trial ending, paid, payment failed, cancelled) adds the tag that starts
   that workflow (GHL-BUILD-GUIDE section 1) and moves their card in the
   "BuilderPro customers" pipeline. Runs only once ai_config house_location_id is set. */
const HOUSE_TAG: Record<string, [string, string]> = {
  trial: ["bp-trial-started", "Trial"], trial_ending: ["bp-trial-ending", "Trial"], active: ["bp-paid", "Paid"],
  past_due: ["bp-payment-failed", "Past due"], cancelled: ["bp-cancelled", "Cancelled"],
};
export const houseKey = (a: { status?: string; trial_ends_at?: string }) =>
  a.status === "trial" && a.trial_ends_at && Date.parse(a.trial_ends_at) < Date.now() + 3 * 864e5 ? "trial_ending" : String(a.status ?? "");
export async function houseSync(house: string): Promise<string[]> {
  const out: string[] = [];
  if (!house) return out;
  const r = await sb("accounts?select=user_id,email,full_name,business,phone,plan,status,trial_ends_at,house_synced&order=created_at.desc&limit=200");
  // deno-lint-ignore no-explicit-any
  const todo = (r.ok ? await r.json() : []).filter((a: any) => houseKey(a) !== String(a.house_synced ?? "")).slice(0, 10);
  if (!todo.length) return out;
  const tok = await locationToken(house), H = ghlHeaders(tok);
  let pipe: { id: string; stages: { id: string; name: string }[] } | undefined;
  try {
    const pd = await (await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${house}`, { headers: H })).json();
    pipe = (pd?.pipelines ?? []).find((p: { name?: string }) => /builderpro customers/i.test(p.name ?? ""));
  } catch { /* no pipeline yet: tags still go on */ }
  for (const a of todo) {
    const key = houseKey(a), hit = HOUSE_TAG[key];
    const done = () => sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ house_synced: key }) });
    if (!hit || !a.email) { await done(); continue; }
    // the owner's own test logins (name+tag@) get no phone, so the workflows only email
    const phone = /\+[^@]*@/.test(a.email) ? undefined : (a.phone || undefined);
    const [first, ...rest] = String(a.full_name || a.business || "").trim().split(/\s+/);
    const ur = await fetch(`${GHL_BASE}/contacts/upsert`, { method: "POST", headers: H,
      body: JSON.stringify({ locationId: house, email: a.email, phone, firstName: first || undefined, lastName: rest.join(" ") || undefined, companyName: a.business || undefined, source: "BuilderPro app" }) });
    const ud = await ur.json().catch(() => ({}));
    const cid = ud?.contact?.id || ud?.id || "";
    if (!ur.ok || !cid) { out.push(`${a.email}: contact not saved (${ur.status} ${JSON.stringify(ud).slice(0, 120)})`); continue; }
    const tr = await fetch(`${GHL_BASE}/contacts/${cid}/tags`, { method: "POST", headers: H, body: JSON.stringify({ tags: [hit[0], "bp-customer", "bp-plan-" + (a.plan || "unknown")] }) });
    if (!tr.ok) { out.push(`${a.email}: tag ${hit[0]} not added (${tr.status})`); continue; }
    let opp = "";
    const stage = pipe?.stages?.find((s) => s.name.toLowerCase() === hit[1].toLowerCase());
    if (pipe && stage) {
      try {
        const sd = await (await fetch(`${GHL_BASE}/opportunities/search?location_id=${house}&pipeline_id=${pipe.id}&contact_id=${cid}`, { headers: H })).json();
        const ex = sd?.opportunities?.[0]?.id;
        const or = await fetch(`${GHL_BASE}/opportunities/${ex ?? ""}`, { method: ex ? "PUT" : "POST", headers: H,
          body: JSON.stringify(ex ? { pipelineId: pipe.id, pipelineStageId: stage.id, status: key === "cancelled" ? "lost" : "open" }
            : { locationId: house, pipelineId: pipe.id, pipelineStageId: stage.id, contactId: cid, name: a.business || a.email, status: key === "cancelled" ? "lost" : "open" }) });
        opp = or.ok ? ", card in " + hit[1] : `, card not moved (${or.status})`;
      } catch { opp = ", card not moved"; }
    }
    await done();
    out.push(`${a.email}: ${hit[0]}${opp}`);
  }
  return out;
}
