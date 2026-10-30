// health-check: is BuilderPro working? Runs every morning (cron health-check-daily) and
// on demand from the Command Center's System health card. Spends nothing: it pings
// functions with OPTIONS (they answer before doing any work), reads the scheduler's
// history and our own tables, and checks that secrets exist (names only, never values).
//   cron POST (x-cron-key)       run the checks, save a row in health_checks
//   { op: "status" }  (admin)    the latest saved result and the last 7 days
//   { op: "run" }     (admin)    run now, save and return it
//   cron key + { op: "test_alert" }  send a test bell notification to the admins
//   x-site-check-key + { op: "site_report" }  the daily website check (GitHub,
//        tools/site-check.js) saves its result in ai_config site_check; the morning
//        run lists its problems with the rest
// A morning run with problems puts a notification in each admin's BuilderPro bell.
// Deploy: --no-verify-jwt (cron key or the admin check below)
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
const sb = (p: string, i: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${p}`, { ...i, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-site-check-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const cfg = async (k: string) => String((await (await sb(`ai_config?key=eq.${k}&select=value`)).json())?.[0]?.value ?? "");
async function admin(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok || !ADMINS.length) return false;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${tok}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } });
  return r.ok && ADMINS.includes(String((await r.json())?.email ?? "").toLowerCase());
}

// what each function is for, in words the card shows when one is down. Supabase lets one
// function call about 30 others per run, so this is the 24 that matter most; the scheduled
// ones left out (usage-sync, mail-connect, ai-ceo) are watched through their schedules.
const FUNCS: Record<string, string> = {
  "account-signup": "sign-ups and Cancel", "billing-webhook": "plan payments from Stripe", "stripe-pay": "invoice payments",
  "stripe-webhook": "invoice payment updates", "customer-portal": "customer project pages", "contract-sign": "contract signing",
  "book-public": "booking pages", "lead-in": "new leads", "lead-intake": "website lead forms", "estimate-accepted": "estimate approvals",
  "homeowner-signup": "homeowner accounts", "command": "the Command Center", "cc-requests": "Requests", "account-delete": "Delete account",
  "push-send": "phone notifications", "ghl-dashboard": "HighLevel dashboard", "ghl-messaging": "texts and inbox", "ghl-invoice": "invoice sync",
  "ghl-diag": "the HighLevel watcher", "ghl-oauth": "the BuilderPro Connect app", "ghl-events": "HighLevel events",
  "ghl-schedule": "scheduled texts", "ai-chat": "AI chat", "ai-team": "the AI Team",
};
const SECRETS: Record<string, string> = {
  STRIPE_SECRET_KEY: "payments and Cancel", STRIPE_BILLING_WEBHOOK_SECRET: "plan payment updates", STRIPE_WEBHOOK_SECRET: "invoice payment updates",
  ADMIN_EMAILS: "the Command Center login", ANTHROPIC_API_KEY: "the AI Team and AI chat", GEMINI_API_KEY: "photo tools",
  GHL_CLIENT_ID: "the BuilderPro Connect app", GHL_CLIENT_SECRET: "the BuilderPro Connect app", GHL_COMPANY_ID: "HighLevel setup",
};
// minutes between runs, from the cron schedule
const every = (s: string) => { const m = s.match(/^\*\/(\d+) /); return m ? Number(m[1]) : /^\d+ \* \* \* \*$/.test(s) ? 60 : 1440; };
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 6e4); return m < 120 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };

type Item = { area: string; text: string };
async function check() {
  const problems: Item[] = [], notes: Item[] = [];
  // 1. every function answers (a few at a time, one retry)
  const ping = async (f: string, again = true): Promise<string> => {
    try {
      const r = await fetch(`${SB_URL}/functions/v1/${f}`, { method: "OPTIONS", signal: AbortSignal.timeout(15000) });
      await r.body?.cancel();
      const bad = r.status === 404 ? `${f} is missing (${FUNCS[f]})` : r.status >= 500 ? `${f} is crashing, error ${r.status} (${FUNCS[f]})` : "";
      return bad && again ? ping(f, false) : bad;
    } catch (e) {
      const why = String((e as Error)?.message ?? e);
      if (/rate limit/i.test(why)) return `${f} wasn't checked (Supabase's limit on calls per run)`;
      return again ? ping(f, false) : `${f} did not answer (${FUNCS[f]}): ${why.slice(0, 80)}`;
    }
  };
  const names = Object.keys(FUNCS);
  for (let i = 0; i < names.length; i += 6) for (const d of await Promise.all(names.slice(i, i + 6).map((f) => ping(f)))) if (d) (/wasn't checked/.test(d) ? notes : problems).push({ area: "Functions", text: d });
  // 2. scheduled jobs ran, and background calls mostly worked
  const db = await (await sb("rpc/bp_health_db", { method: "POST", body: "{}" })).json().catch(() => null);
  for (const j of db?.jobs ?? []) {
    if (!j.active) { notes.push({ area: "Schedule", text: `${j.name} is switched off` }); continue; }
    const last = j.last ? Date.parse(j.last) : 0, gap = every(j.schedule);
    if (!last) notes.push({ area: "Schedule", text: `${j.name} hasn't had its first run yet` });
    else if (Date.now() - last > (gap * 3 + 10) * 6e4) problems.push({ area: "Schedule", text: `${j.name} hasn't run since ${ago(last)} (it should run every ${gap >= 1440 ? "day" : gap >= 60 ? "hour" : gap + " min"})` });
    if (j.failed > 0) problems.push({ area: "Schedule", text: `${j.name} failed ${j.failed}× in the last day${j.why ? ": " + j.why : ""}` });
  }
  const c = db?.calls ?? { total: 0, failed: 0 };
  if (c.total >= 20 && c.failed / c.total > 0.05) problems.push({ area: "Schedule", text: `${c.failed} of ${c.total} background calls failed or timed out in the last 6 hours` });
  else if (c.failed) notes.push({ area: "Schedule", text: `${c.failed} of ${c.total} background calls timed out in the last 6 hours (normal now and then)` });
  // 3. HighLevel: the watcher stamps every run
  const mint = await cfg("ghl_mint"), at = Date.parse((mint.match(/at (\d{4}-\d\d-\d\d \d\d:\d\d)/)?.[1] ?? "").replace(" ", "T") + ":00Z");
  const frozen = /not active/i.test(mint);
  if (!at || Date.now() - at > 20 * 6e4) problems.push({ area: "HighLevel", text: `The HighLevel watcher last ran ${at ? ago(at) : "never"} (it runs every 5 min)` });
  if (frozen) notes.push({ area: "HighLevel", text: "HighLevel is frozen: new client setups, texts and tags wait until you unfreeze it" });
  else if (/^no /.test(mint)) problems.push({ area: "HighLevel", text: `HighLevel won't let BuilderPro in: ${mint.slice(3, 120)}` });
  // 4. client accounts
  const accts = await (await sb("accounts?select=business,status,plan,onboard_state,ghl_location_id,created_at&status=in.(trial,active,past_due)")).json().catch(() => []);
  for (const a of Array.isArray(accts) ? accts : []) {
    const fresh = Date.now() - Date.parse(a.created_at) < 14 * 864e5, age = Date.now() - Date.parse(a.created_at);
    if (a.status === "past_due") problems.push({ area: "Billing", text: `${a.business}: their card payment failed (Stripe is retrying)` });
    if (!a.ghl_location_id && age > 36e5 && fresh) (frozen ? notes : problems).push({ area: "Clients", text: `${a.business}: HighLevel setup isn't finished${a.onboard_state === "failed" ? " (it failed; Accounts → Retry setup)" : ""}${frozen ? ", waiting for HighLevel" : ""}` });
  }
  const old = await (await sb(`support_requests?status=eq.open&created_at=lt.${new Date(Date.now() - 2 * 864e5).toISOString()}&select=id`)).json().catch(() => []);
  if (Array.isArray(old) && old.length) notes.push({ area: "Clients", text: `${old.length} request${old.length > 1 ? "s have" : " has"} been waiting more than 2 days` });
  // 5. secrets exist (names only)
  for (const [k, why] of Object.entries(SECRETS)) if (!Deno.env.get(k)) problems.push({ area: "Settings", text: `The secret ${k} is missing (${why})` });
  if (!Deno.env.get("APNS_KEY_P8") || !Deno.env.get("FCM_SERVICE_ACCOUNT")) notes.push({ area: "Settings", text: "Phone notifications are off until the Apple and Firebase keys are added (docs/APP-STORES.md, step 2)" });
  // 6. the website: the daily GitHub check (tools/site-check.js) reports here before this runs
  const cfgSite = await cfg("site_check");
  const site = (() => { try { return JSON.parse(cfgSite); } catch { return null; } })();
  if (!site) notes.push({ area: "Website", text: "The daily website check hasn't reported yet (it needs the SITE_CHECK_KEY secret in GitHub)" });
  else if (Date.now() - Date.parse(site.at) > 50 * 36e5) problems.push({ area: "Website", text: `The daily website check last reported ${ago(Date.parse(site.at))} (it runs every morning in GitHub Actions)` });
  else for (const p of site.problems ?? []) problems.push({ area: "Website", text: String(p.text ?? p).slice(0, 200) });
  return { ok: problems.length === 0, problems, notes, checked: Object.keys(FUNCS).length };
}
// a bell notification (and a phone push, once the app has its keys) for each Command
// Center admin who has a BuilderPro login; at most one per day per kind (dedupe)
async function alertAdmins(title: string, body: string, dedupe: string) {
  const u = await (await fetch(`${SB_URL}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } })).json().catch(() => ({}));
  const ids = (u?.users ?? []).filter((x: { email?: string }) => ADMINS.includes(String(x.email ?? "").toLowerCase())).map((x: { id: string }) => x.id);
  let sent = 0;
  for (const id of ids) {
    const had = await (await sb(`notifications?user_id=eq.${id}&dedupe=eq.${encodeURIComponent(dedupe)}&select=id`)).json().catch(() => []);
    if (Array.isArray(had) && had.length) continue;
    const r = await sb("notifications", { method: "POST", body: JSON.stringify({ owner: id, user_id: id, kind: "system_health", title, body, link: "command", priority: "high", dedupe }) });
    if (r.ok) sent++;
  }
  return sent;
}
async function runAndSave(source: string) {
  const r = await check();
  await sb("health_checks", { method: "POST", body: JSON.stringify({ ok: r.ok, problems: r.problems, notes: r.notes, source }) });
  // the morning run tells you; pressing Check now doesn't (you're already looking)
  if (!r.ok && source === "daily") {
    const n = r.problems.length, list = r.problems.slice(0, 2).map((p) => p.text).join(" · ");
    await alertAdmins(`BuilderPro: ${n} problem${n > 1 ? "s" : ""} found this morning`, list + (n > 2 ? ` · and ${n - 2} more` : "") + ". Open the Command Center to see them.", `health-${new Date().toISOString().slice(0, 10)}`);
  }
  return { ...r, at: new Date().toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = req.headers.get("x-cron-key");
  if (key) {
    const c = await cfg("cron_key");
    if (!c || key !== c) return new Response("no", { status: 403 });
    const t = await req.json().catch(() => ({}));
    if (t.op === "test_alert") return json({ ok: true, sent: await alertAdmins("BuilderPro: test alert", "This is how the morning health check tells you about a problem. Nothing is wrong.", `health-test-${new Date().toISOString().slice(0, 10)}`) });
    return json({ ok: true, result: await runAndSave("daily") });
  }
  const siteKey = req.headers.get("x-site-check-key");
  if (siteKey) {
    const k = await cfg("site_check_key");
    if (!k || siteKey !== k) return new Response("no", { status: 403 });
    const t = await req.json().catch(() => ({}));
    if (t.op !== "site_report") return json({ ok: false, error: "unknown op" }, 400);
    const keep = { ok: !!t.ok, problems: (Array.isArray(t.problems) ? t.problems : []).slice(0, 20).map((p: { text?: string }) => ({ text: String(p?.text ?? "").slice(0, 200) })),
      pages: Number(t.pages) || 0, tools: Number(t.tools) || 0, at: new Date().toISOString() };
    const r = await sb("ai_config", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "site_check", value: JSON.stringify(keep) }) });
    return json({ ok: r.ok });
  }
  if (!(await admin(req))) return json({ ok: false, error: "not authorized" }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.op === "run") return json({ ok: true, data: await runAndSave("manual") });
  const rows = await (await sb(`health_checks?at=gt.${new Date(Date.now() - 7 * 864e5).toISOString()}&select=at,ok,problems,notes,source&order=at.desc&limit=50`)).json().catch(() => []);
  return json({ ok: true, data: Array.isArray(rows) ? rows[0] ?? null : null, week: (Array.isArray(rows) ? rows : []).map((x: { at: string; ok: boolean }) => ({ at: x.at, ok: x.ok })) });
});
