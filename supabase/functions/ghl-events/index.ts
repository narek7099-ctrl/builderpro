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
  storm_alert: "bp-storm-alert",
};
/* which plan gets which automation (Foundation gets none: it has no projects) */
const OS_KINDS = ["job_scheduled", "visit_tomorrow", "crew_arrived", "job_completed", "payment_overdue", "payment_received",
  "contract_signed", "phase_done", "schedule_moved", "change_order_waiting", "crew_no_show"];
const allowed = (plan: string, kind: string) => plan === "enterprise" ? !!TAGS[kind] : plan === "os" ? OS_KINDS.includes(kind) : false;
/* alerts to the owner still go out when a project's customer messages are paused */
const INTERNAL = ["message_unanswered", "over_budget", "crew_no_show", "materials_not_ready", "job_stalled", "weather_risk", "sub_insurance_expiring", "storm_alert"];
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

/* ---------- storms: past customers near a hail or wind report, owner asked first ----------
   Once a day after the NOAA Storm Prediction Center closes its report day (12Z),
   read that day's hail and wind reports. For each Enterprise account, a done job
   counts when its trade can be hurt by that storm and a report is within the
   owner's radius (default 5 miles). One storm_alerts row per owner per day; the
   owner taps Send (workflow 36) or Dismiss. Reminder at 24h, lapses at 72h, or
   sends at 48h when they turned on data.automation.stormAutoSend. */
type Rpt = { kind: "hail" | "wind"; size: number; speed: number; place: string; state: string; lat: number; lon: number };
/* the storm a job's trade cares about; null = storms don't matter for it */
const NOT_STORM = /(floor|carpet|hardwood|laminate|tile|countertop|granite|quartz|plumb|pipe|water heater|drain|electric|wiring|panel upgrade|kitchen|bath|interior|cabinet|trim|drywall|concrete|driveway|pool|remodel)/;
function stormClass(t: string): string | null {
  const x = String(t || "").toLowerCase();
  if (/(roof|shingle|gutter|soffit|fascia|flashing)/.test(x)) return "roof";
  if (/(siding|window|skylight)/.test(x)) return "exterior";
  if (/solar/.test(x)) return "solar";
  if (/(hvac|furnace|heat pump|air cond|\ba\/?c\b|condenser|mini.?split)/.test(x)) return "hvac";
  if (/(fence|fencing|tree|landscap|lawn|yard|pergola|deck)/.test(x)) return "wind";
  if (/paint/.test(x) && /(exterior|outside|house paint)/.test(x)) return "paint";
  return null;
}
function jobStormClass(j: any, company: string): string | null {
  const txt = [j.trade, j.type, j.title].filter(Boolean).join(" ") || String(j.notes || "");
  const c = stormClass(txt); if (c) return c;
  if (NOT_STORM.test(String(txt).toLowerCase())) return null;
  return stormClass(company);   // a job that says nothing about its trade takes the company's
}
const HITS: Record<string, (r: Rpt) => boolean> = {
  roof: (r) => r.kind === "hail" ? r.size >= 1 : r.speed >= 58,
  exterior: (r) => r.kind === "hail" ? r.size >= 1 : r.speed >= 58,
  solar: (r) => r.kind === "hail" && r.size >= 1,
  wind: (r) => r.kind === "wind" && r.speed >= 58,
  hvac: (r) => r.kind === "hail" && r.size >= 1.25,
  paint: (r) => r.kind === "hail" && r.size >= 1.5,
};
const miles = (a: number, b: number, c: number, d: number) => {
  const R = 3958.8, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2));
};
const rptText = (r: Rpt) => r.kind === "hail" ? `${r.size.toFixed(2)} in hail near ${r.place}, ${r.state}` : `${r.speed} mph wind near ${r.place}, ${r.state}`;
async function spc(day: string): Promise<Rpt[]> {
  const yymmdd = day.slice(2).replace(/-/g, ""), out: Rpt[] = [];
  for (const kind of ["hail", "wind"] as const) {
    const r = await fetch(`https://www.spc.noaa.gov/climo/reports/${yymmdd}_rpts_${kind}.csv`);
    if (!r.ok) throw new Error(`spc ${kind} ${r.status}`);
    (await r.text()).split("\n").slice(1).forEach((l) => {
      const f = l.split(","); if (f.length < 7) return;
      const v = +f[1], lat = +f[5], lon = +f[6]; if (!isFinite(lat) || !isFinite(lon) || !isFinite(v)) return;   // "UNK" wind speeds drop out
      out.push({ kind, size: kind === "hail" ? v / 100 : 0, speed: kind === "wind" ? v : 0, place: f[2].trim(), state: f[4].trim(), lat, lon });
    });
  }
  return out.filter((r) => r.kind === "hail" ? r.size >= 1 : r.speed >= 58);
}
async function storms(force?: string) {
  const now = new Date();
  const day = force || new Date(now.getTime() - 864e5).toISOString().slice(0, 10);   // the SPC day that closed at 12Z today
  if (!force) {
    if (now.getUTCHours() < 13) return 0;
    const m = await rest(`ai_config?key=eq.storm_scan_day&select=value`).catch(() => []);
    if (m?.[0]?.value === day) return 0;
  }
  const reports = await spc(day);
  const mark = () => rest(`ai_config?on_conflict=key`, { method: "POST", headers: { Prefer: "return=minimal,resolution=merge-duplicates" }, body: JSON.stringify({ key: "storm_scan_day", value: day }) });
  if (!reports.length) { if (!force) await mark().catch(() => {}); return 0; }
  const fin = await rest(`portal_finance?select=owner,jobs`);
  const accts: Record<string, any> = {}; let made = 0;
  const since = new Date(now.getTime() - 90 * 864e5).toISOString();
  for (const row of fin || []) {
    if ((await accountOf(row.owner, accts)).plan !== "enterprise") continue;
    const done = (row.jobs || []).filter((j: any) => j && j.status === "done" && !j.sample && !j.autoPause && j.geo && isFinite(+j.geo.lat) && isFinite(+j.geo.lng));
    if (!done.length) continue;
    const cs = (await rest(`client_settings?user_id=eq.${row.owner}&select=data`).catch(() => []))?.[0]?.data || {};
    const acc = (await rest(`accounts?user_id=eq.${row.owner}&select=trade`).catch(() => []))?.[0] || {};
    const company = String(cs.company?.trade || acc.trade || "");
    const radius = Math.min(25, Math.max(1, +(cs.automation?.stormMiles) || 5));
    const recent = new Set(((await rest(`ghl_events?owner=eq.${row.owner}&kind=eq.storm_followup&created_at=gte.${since}&select=job_id`).catch(() => [])) || []).map((x: any) => x.job_id));
    const hits: any[] = [], used = new Map<string, Rpt>();
    for (const j of done) {
      if (recent.has(j.id)) continue;
      const cls = jobStormClass(j, company); if (!cls) continue;
      let best: Rpt | null = null, bd = 1e9;
      for (const r of reports) {
        if (!HITS[cls](r)) continue;
        const d = miles(+j.geo.lat, +j.geo.lng, r.lat, r.lon);
        if (d <= radius && d < bd) { best = r; bd = d; }
      }
      if (!best) continue;
      hits.push({ id: j.id, name: j.name || "", addr: j.addr || "", miles: Math.round(bd * 10) / 10, why: rptText(best) });
      used.set(`${best.lat},${best.lon},${best.kind}`, best);
    }
    if (!hits.length) continue;
    const rp = [...used.values()].sort((a, b) => (b.size - a.size) || (b.speed - a.speed));
    const summary = rptText(rp[0]) + (rp.length > 1 ? ` (+${rp.length - 1} more report${rp.length > 2 ? "s" : ""})` : "");
    const ins = await rest(`storm_alerts?on_conflict=owner,day`, { method: "POST", headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify({ owner: row.owner, day, reports: rp.slice(0, 40), jobs: hits, summary }) }).catch((e) => { console.error("storm insert", e.message); return []; });
    const a = ins?.[0]; if (!a) continue;
    made++;
    const n = hits.length, nice = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    await rpc("bp_notify", { p_owner: row.owner, p_kind: "storm_alert", p_title: `Storm near ${n} past customer${n === 1 ? "" : "s"}`,
      p_body: `${summary} on ${nice}. Send them the free storm check text?`, p_link: `storm:${a.id}`, p_job: null, p_priority: "high",
      p_dedupe: `storm:${a.id}`, p_audience: "office" }).catch((e) => console.error("storm notify", e.message));
    /* a text to the owner too (workflow 52 "Storm Alert to You" sends it to Owner Phone) */
    await rest(`ghl_events?on_conflict=owner,dedupe`, { method: "POST", headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify({ owner: row.owner, kind: "storm_alert", job_id: hits[0].id, dedupe: `stormalert:${a.id}`,
        data: { note: `Storm near ${n} past customer${n === 1 ? "" : "s"}: ${summary}. Open BuilderPro to send the storm check text.` } }) }).catch(() => {});
  }
  if (!force) await mark().catch(() => {});
  return made;
}
/* reminders, the 48h auto-send (if turned on) and the 72h lapse */
async function stormTick() {
  const rows = await rest(`storm_alerts?status=eq.pending&select=id,owner,created_at,reminded_at,jobs,summary`).catch(() => []);
  const now = Date.now(), H = 36e5;
  for (const a of rows || []) {
    const age = (now - Date.parse(a.created_at)) / H, n = (a.jobs || []).length;
    if (age >= 72) { await rest(`storm_alerts?id=eq.${a.id}&status=eq.pending`, { method: "PATCH", body: JSON.stringify({ status: "expired", decided_at: new Date().toISOString() }) }).catch(() => {}); continue; }
    if (age >= 48) {
      const cs = (await rest(`client_settings?user_id=eq.${a.owner}&select=data`).catch(() => []))?.[0]?.data || {};
      if (cs.automation?.stormAutoSend) {
        const k = await rpc("bp_storm_send", { p_owner: a.owner, p_id: a.id, p_jobs: null, p_note: null }).catch(() => -1);
        if (+k >= 0) await rpc("bp_notify", { p_owner: a.owner, p_kind: "storm_alert", p_title: `Storm check text sent to ${k} past customer${+k === 1 ? "" : "s"}`,
          p_body: `You didn’t answer within 48 hours, so it went out as your setting says. ${a.summary}.`, p_link: `storm:${a.id}`, p_job: null, p_priority: "normal",
          p_dedupe: `storm-auto:${a.id}`, p_audience: "office" }).catch(() => {});
        continue;
      }
    }
    if (age >= 24 && !a.reminded_at) {
      await rpc("bp_notify", { p_owner: a.owner, p_kind: "storm_alert", p_title: `Reminder: storm near ${n} past customer${n === 1 ? "" : "s"}`,
        p_body: `${a.summary}. The offer lapses in 2 days if you don’t send it.`, p_link: `storm:${a.id}`, p_job: null, p_priority: "high",
        p_dedupe: `storm-r:${a.id}`, p_audience: "office" }).catch(() => {});
      await rest(`storm_alerts?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ reminded_at: new Date().toISOString() }) }).catch(() => {});
    }
  }
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
    if (body.scan !== false) await storms().catch((e) => console.error("storms", e.message));
    if (body.scan !== false) await stormTick().catch((e) => console.error("stormTick", e.message));
    if (body.op === "storms") return json({ ok: true, made: await storms(String(body.day || "")) });   // a backfill/test for one SPC day
    return json({ ok: true, ...(await deliver()) });
  } catch (e) {
    console.error("ghl-events", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
