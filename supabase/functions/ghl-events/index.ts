// ghl-events — delivers BuilderPro events to HighLevel, where workflows act on them.
//
// pg_cron calls this every 2 minutes with x-cron-key (ai_config.cron_key):
//   POST { op:"run" }    -> scan for time-based events, then deliver what is pending
//   POST { op:"setup" }  -> make sure the "BP ..." custom fields exist in HighLevel
//
// For each pending row in ghl_events:
//   1. find the customer's HighLevel contact: the project's contactId, else a
//      match on phone or email, else a new contact
//   2. write the job details into the BP custom fields (job, address, amount,
//      balance, start date, crew lead, portal link, ...)
//   3. take the event's tag off and put it back on (bp-job-completed etc.), so
//      a workflow with the trigger "Contact Tag Added" fires every time
// Accounts without a HighLevel location are marked 'skipped'.
//
// Deploy with JWT verification off; the cron key is the check.
// Secrets: GHL_TOKEN (or GHL_TOKEN_<locationId>), optional GHL_LOCATION_ID.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL = "https://services.leadconnectorhq.com";
const DEF_LOC = Deno.env.get("GHL_LOCATION_ID") || "aUs7E5m1gmLXoeIV3WM9";
const PORTAL = "https://builderpro-os.com/";

const TAGS: Record<string, string> = {
  job_scheduled: "bp-job-scheduled", visit_tomorrow: "bp-visit-tomorrow", crew_arrived: "bp-crew-arrived",
  job_completed: "bp-job-completed", payment_overdue: "bp-payment-overdue", job_anniversary: "bp-job-anniversary",
  storm_followup: "bp-storm-followup",
  contract_signed: "bp-contract-signed", phase_done: "bp-phase-done", schedule_moved: "bp-schedule-moved",
  payment_received: "bp-payment-received", change_order_waiting: "bp-change-order-waiting", inspection_scheduled: "bp-inspection-scheduled",
  warranty_followup: "bp-warranty", message_unanswered: "bp-message-unanswered", over_budget: "bp-over-budget",
  sub_insurance_expiring: "bp-sub-insurance-expiring",
  crew_no_show: "bp-crew-no-show", materials_not_ready: "bp-materials-not-ready", job_stalled: "bp-job-stalled", weather_risk: "bp-weather-risk",
};
/* which plan gets which automation (Foundation gets none: it has no projects) */
const OS_KINDS = ["job_scheduled", "visit_tomorrow", "crew_arrived", "job_completed", "payment_overdue", "payment_received",
  "contract_signed", "phase_done", "schedule_moved", "change_order_waiting", "crew_no_show"];
const allowed = (plan: string, kind: string) => plan === "enterprise" ? !!TAGS[kind] : plan === "os" ? OS_KINDS.includes(kind) : false;
/* alerts to the owner still go out when a project's customer messages are paused */
const INTERNAL = ["message_unanswered", "over_budget", "crew_no_show", "materials_not_ready", "job_stalled", "weather_risk", "sub_insurance_expiring"];
const FIELDS = ["BP Job Name", "BP Job Address", "BP Job Amount", "BP Balance Due", "BP Start Date", "BP Visit Date",
  "BP Crew Lead", "BP Portal Link", "BP Days Overdue", "BP Company Name", "BP Event Note",
  "BP Phase Name", "BP Next Phase", "BP Amount Paid", "BP Old Start Date", "BP Inspection", "BP Change Order", "BP Budget", "BP Spent"];

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, Prefer: "return=representation", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const rpc = (fn: string, args: unknown = {}) => rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

/* ---------- HighLevel ---------- */
const tokenFor = (loc: string) => Deno.env.get("GHL_TOKEN_" + loc) || Deno.env.get("GHL_TOKEN") || "";
async function ghl(loc: string, method: string, path: string, body?: unknown) {
  const r = await fetch(GHL + path, {
    method, headers: { Authorization: `Bearer ${tokenFor(loc)}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text(); let d: any = {}; try { d = JSON.parse(t); } catch (_) { /* text */ }
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} ${r.status}: ${(d && (d.message || d.error)) || t.slice(0, 160)}`);
  return d;
}
const fieldCache: Record<string, Record<string, string>> = {};
async function fields(loc: string, create: boolean): Promise<Record<string, string>> {
  if (fieldCache[loc] && !create) return fieldCache[loc];
  const d = await ghl(loc, "GET", `/locations/${loc}/customFields?model=contact`);
  const have: Record<string, string> = {};
  for (const f of d.customFields || []) have[String(f.name).toLowerCase()] = f.id;
  for (const n of FIELDS) {
    if (have[n.toLowerCase()]) continue;
    if (!create) continue;
    const c = await ghl(loc, "POST", `/locations/${loc}/customFields`, { name: n, dataType: "TEXT", model: "contact" });
    const f = c.customField || c; if (f && f.id) have[n.toLowerCase()] = f.id;
  }
  fieldCache[loc] = have;
  return have;
}
const digits = (s: string) => String(s || "").replace(/\D/g, "");
async function contactFor(loc: string, j: any): Promise<string> {
  if (j.contactId) return String(j.contactId);
  const tryq = async (q: string) => { try { const d = await ghl(loc, "GET", `/contacts/search/duplicate?locationId=${loc}&${q}`); return d?.contact?.id || ""; } catch (_) { return ""; } };
  let id = "";
  if (digits(j.phone).length >= 10) id = await tryq("number=" + encodeURIComponent("+1" + digits(j.phone).slice(-10)));
  if (!id && j.email) id = await tryq("email=" + encodeURIComponent(String(j.email).trim()));
  if (id) return id;
  const nm = String(j.name || "Customer").trim().split(/\s+/);
  const c = await ghl(loc, "POST", "/contacts/", {
    locationId: loc, firstName: nm[0] || "Customer", lastName: nm.slice(1).join(" "), name: String(j.name || "Customer"),
    ...(digits(j.phone).length >= 10 ? { phone: "+1" + digits(j.phone).slice(-10) } : {}),
    ...(j.email ? { email: String(j.email).trim() } : {}),
    ...(j.addr ? { address1: String(j.addr) } : {}), source: "BuilderPro",
  });
  return c?.contact?.id || "";
}

/* ---------- the details a workflow can use ---------- */
const money = (n: number) => "$" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pretty = (d: string) => { const t = Date.parse(String(d).slice(0, 10) + "T12:00:00"); return isFinite(t) ? new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""; };
async function details(owner: string, j: any, ev: any) {
  j = j || {};
  const dates = (j.sched?.dates || []).filter((x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  let lead = "", company = "", portal = "";
  try {
    const cs = await rest(`client_settings?user_id=eq.${owner}&select=data`);
    const data = (cs && cs[0] && cs[0].data) || {};
    company = String((data.company && typeof data.company === "object" ? data.company.name : data.company) || data.companyName || "").trim().replace(/\.+$/, "");
    const crew = (data.crews || []).find((c: any) => c.id === j.crew);
    if (crew && crew.lead) { const e = await rest(`employees?id=eq.${crew.lead}&select=name`); lead = e?.[0]?.name || ""; }
  } catch (_) { /* optional */ }
  if (!lead && ev.data?.by) lead = ev.data.by;
  if (j.id) try {
    const l = await rest(`customer_portal_links?owner=eq.${owner}&job_id=eq.${encodeURIComponent(j.id)}&enabled=is.true&select=token`);
    if (l?.[0]?.token) portal = `${PORTAL}#home=${l[0].token}`;
  } catch (_) { /* optional */ }
  const owed = Math.max(0, (+j.estimate || 0) - (+j.collected || 0));
  return {
    "BP Job Name": String(j.title || "your project"), "BP Job Address": String(j.addr || ""),
    "BP Job Amount": j.estimate ? money(+j.estimate) : "", "BP Balance Due": owed > 0 ? money(owed) : "$0",
    "BP Start Date": dates[0] ? pretty(dates[0]) : "", "BP Visit Date": ev.data?.date ? pretty(ev.data.date) : "",
    "BP Crew Lead": String(lead || "").split(" ")[0], "BP Portal Link": portal,
    "BP Days Overdue": ev.data?.days ? String(ev.data.days) : "", "BP Company Name": company,
    "BP Event Note": String(ev.data?.note || (ev.data?.doc ? `Your ${ev.data.doc} expires ${pretty(ev.data.date)}` : "")
      || (ev.kind === "crew_no_show" ? `Booked for ${ev.data?.start || "today"}, nobody has clocked in` : "")
      || (ev.kind === "materials_not_ready" ? `${ev.data?.items || "The"} item order list is still a draft` : "")),
    "BP Phase Name": String(ev.data?.phase || ""), "BP Next Phase": String(ev.data?.next || ""),
    "BP Amount Paid": ev.data?.amount != null && ev.kind === "payment_received" ? money(+ev.data.amount) : "",
    "BP Old Start Date": ev.data?.old ? pretty(ev.data.old) : "",
    "BP Inspection": ev.data?.inspection ? `${ev.data.inspection}${ev.data.permit ? " (" + ev.data.permit + " permit)" : ""}` : "",
    "BP Change Order": ev.data?.change_order ? `${ev.data.change_order}${ev.data.amount ? " · " + money(+ev.data.amount) : ""}` : "",
    "BP Budget": ev.data?.budget ? money(+ev.data.budget) : "", "BP Spent": ev.data?.spent ? money(+ev.data.spent) : "",
  };
}

/* ---------- weather: tomorrow's booked jobs, checked once each, 3pm-9pm LA ---------- */
async function weather() {
  const la = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  if (la.getHours() < 15 || la.getHours() > 21) return 0;
  const t = new Date(la.getTime() + 864e5), tom = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const fin = await rest(`portal_finance?select=owner,jobs`);
  const accts: Record<string, any> = {}; let n = 0;
  for (const row of fin || []) {
    const jobs = (row.jobs || []).filter((j: any) => j && j.status === "active" && !j.sample && (j.sched?.dates || []).includes(tom)
      && j.geo && isFinite(+j.geo.lat) && isFinite(+j.geo.lng));
    if (!jobs.length) continue;
    if ((await accountOf(row.owner, accts)).plan !== "enterprise") continue;
    const done = await rest(`ghl_events?owner=eq.${row.owner}&dedupe=like.wx*${tom}&select=dedupe`).catch(() => []);
    const seen = new Set((done || []).map((x: any) => x.dedupe));
    for (const j of jobs) {
      const key = `wx:${j.id}:${tom}`; if (seen.has(key)) continue;
      let pp = 0, gust = 0;
      try {
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${+j.geo.lat}&longitude=${+j.geo.lng}&daily=precipitation_probability_max,wind_gusts_10m_max&wind_speed_unit=mph&timezone=America%2FLos_Angeles&start_date=${tom}&end_date=${tom}`)).json();
        pp = +(w?.daily?.precipitation_probability_max?.[0] || 0); gust = +(w?.daily?.wind_gusts_10m_max?.[0] || 0);
      } catch (_) { continue; }
      const risky = pp >= 60 || gust >= 40;
      const note = [pp >= 60 ? `${Math.round(pp)}% chance of rain` : "", gust >= 40 ? `gusts to ${Math.round(gust)} mph` : ""].filter(Boolean).join(", ");
      /* a checked-and-fine job is stored as skipped, so it isn't fetched again tonight */
      await rest(`ghl_events?on_conflict=owner,dedupe`, { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: JSON.stringify({ owner: row.owner, kind: "weather_risk", job_id: j.id, dedupe: key, status: risky ? "pending" : "skipped",
          error: risky ? null : `Forecast fine (${Math.round(pp)}% rain, ${Math.round(gust)} mph gusts)`, data: { date: tom, note, rain: pp, gust } }) }).catch(() => {});
      if (risky) n++;
    }
  }
  return n;
}

/* ---------- deliver ---------- */
async function accountOf(owner: string, cache: Record<string, any>): Promise<{ plan: string; loc: string }> {
  if (cache[owner]) return cache[owner];
  let plan = "", loc = "";
  try { const a = await rest(`accounts?user_id=eq.${owner}&select=plan,ghl_location_id`); plan = String(a?.[0]?.plan || "").toLowerCase(); loc = a?.[0]?.ghl_location_id || ""; } catch (_) { /* none */ }
  const c = await rest(`ai_config?key=eq.ghl_events_owner&select=value`).catch(() => []);
  const isHouse = !!(c?.[0]?.value && String(c[0].value) === owner);   // the BuilderPro house account runs everything
  if (isHouse) plan = "enterprise";
  if (plan !== "os" && plan !== "enterprise" && plan !== "foundation") plan = "os";   // trial: the OS set
  if (isHouse) loc = DEF_LOC;
  if (!loc) loc = await locationOf(owner, {});
  return (cache[owner] = { plan, loc });
}
async function locationOf(owner: string, cache: Record<string, string>): Promise<string> {
  if (cache[owner] !== undefined) return cache[owner];
  let loc = "";
  try { const b = await rest(`ai_brain?owner=eq.${owner}&ghl_location_id=neq.&select=ghl_location_id&limit=1`); loc = b?.[0]?.ghl_location_id || ""; } catch (_) { /* none */ }
  return (cache[owner] = loc);
}
async function deliver() {
  const rows = await rest(`ghl_events?status=eq.pending&order=created_at.asc&limit=40&select=*`);
  const accts: Record<string, any> = {}, jobsOf: Record<string, any[]> = {};
  let sent = 0, failed = 0, skipped = 0;
  for (const ev of rows || []) {
    const patch = (p: any) => rest(`ghl_events?id=eq.${ev.id}`, { method: "PATCH", body: JSON.stringify(p) }).catch(() => {});
    const acct = await accountOf(ev.owner, accts), loc = acct.loc;
    if (!allowed(acct.plan, ev.kind)) { await patch({ status: "skipped", error: "Not on your plan (" + acct.plan + ")" }); skipped++; continue; }
    if (!loc || !tokenFor(loc)) { await patch({ status: "skipped", error: "No HighLevel account connected" }); skipped++; continue; }
    try {
      if (!jobsOf[ev.owner]) { const f = await rest(`portal_finance?owner=eq.${ev.owner}&select=jobs`); jobsOf[ev.owner] = (f?.[0]?.jobs) || []; }
      const sub = ev.data?.sub;   // sub paperwork goes to the sub, not a customer
      const j = sub ? null : jobsOf[ev.owner].find((x: any) => x && x.id === ev.job_id);
      if (!sub && !j) { await patch({ status: "skipped", error: "Project no longer exists" }); skipped++; continue; }
      if (j && j.autoPause && !INTERNAL.includes(ev.kind)) { await patch({ status: "skipped", error: "Automations paused for this project" }); skipped++; continue; }
      const cid = await contactFor(loc, sub ? { name: sub.name || sub.company, phone: sub.phone, email: sub.email } : j);
      if (!cid) throw new Error("No contact");
      const map = await fields(loc, true);
      const vals = await details(ev.owner, j, ev);
      const cf = Object.keys(vals).filter((k) => map[k.toLowerCase()]).map((k) => ({ id: map[k.toLowerCase()], field_value: vals[k as keyof typeof vals] }));
      await ghl(loc, "PUT", `/contacts/${cid}`, { customFields: cf });
      const tag = TAGS[ev.kind]; if (!tag) throw new Error("Unknown event " + ev.kind);
      await ghl(loc, "DELETE", `/contacts/${cid}/tags`, { tags: [tag] }).catch(() => {});
      await ghl(loc, "POST", `/contacts/${cid}/tags`, { tags: [tag] });
      await patch({ status: "sent", sent_at: new Date().toISOString(), contact_id: cid, error: null, attempts: (ev.attempts || 0) + 1 });
      sent++;
    } catch (e) {
      const a = (ev.attempts || 0) + 1;
      await patch({ status: a >= 5 ? "failed" : "pending", attempts: a, error: String((e as Error).message).slice(0, 400) });
      failed++;
    }
  }
  return { sent, failed, skipped };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const key = req.headers.get("x-cron-key") || "";
  const cfg = await rest(`ai_config?key=eq.cron_key&select=value`).catch(() => []);
  if (!key || !cfg?.[0]?.value || key !== cfg[0].value) return json({ ok: false, error: "forbidden" }, 403);
  let body: any = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  try {
    if (body.op === "setup") {
      const loc = body.location || DEF_LOC;
      const map = await fields(loc, true);
      return json({ ok: true, location: loc, fields: FIELDS.map((n) => ({ name: n, id: map[n.toLowerCase()] || null })), tags: Object.values(TAGS) });
    }
    if (body.op === "peek" && body.contact) {   // read-only check of one contact's tags and BP fields
      const loc = body.location || DEF_LOC, map = await fields(loc, false), byId: Record<string, string> = {};
      Object.keys(map).forEach((k) => { byId[map[k]] = k; });
      const c = (await ghl(loc, "GET", `/contacts/${body.contact}`)).contact || {};
      return json({ ok: true, tags: c.tags || [], fields: (c.customFields || []).filter((f: any) => byId[f.id]).map((f: any) => ({ [byId[f.id]]: f.value })) });
    }
    if (body.scan !== false) await rpc("bp_ghl_scan_all").catch((e) => console.error("scan", e.message));
    if (body.scan !== false) await weather().catch((e) => console.error("weather", e.message));
    return json({ ok: true, ...(await deliver()) });
  } catch (e) {
    console.error("ghl-events", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
