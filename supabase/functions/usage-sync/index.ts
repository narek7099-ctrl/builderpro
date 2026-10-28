// usage-sync: each client's Lisa call minutes this month, read from their HighLevel
// sub-account through the BuilderPro Connect app, saved in usage_month. pg_cron runs it
// hourly with the cron key.
//   - 80% of the plan's minutes: a notice in their portal (warned80)
//   - a month that has ended: minutes over the plan at $0.25 each go on their next
//     Stripe invoice, only while ai_config bill_extra_minutes = 'on' (off by default)
// HighLevel status codes and messages are kept in last_error; no tokens are stored.
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KEY = Deno.env.get("GHL_API_KEY") ?? "", CO = Deno.env.get("GHL_COMPANY_ID") ?? "";
const CID = Deno.env.get("GHL_CLIENT_ID") ?? "", CSEC = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const B = "https://services.leadconnectorhq.com";
const INCLUDED: Record<string, number> = { foundation: 150, os: 300, enterprise: 500 };
const EXTRA_PER_MIN = 0.25;
const sb = (p: string, i: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${p}`, { ...i, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const H = (t: string, v = "2021-07-28") => ({ Authorization: `Bearer ${t}`, Version: v, Accept: "application/json" });
const cfg = async (k: string) => String((await (await sb(`ai_config?key=eq.${k}&select=value`)).json())?.[0]?.value ?? "");
const msg = async (r: Response) => { const t = await r.text(); try { const d = JSON.parse(t); return String(d.message ?? d.error ?? "").slice(0, 120); } catch { return t.slice(0, 120); } };

let appTok = "";
async function agencyToken(): Promise<string> {
  if (appTok) return appTok;
  const row = (await (await sb("ghl_oauth?id=eq.1&select=*")).json())?.[0];
  if (!row?.refresh_token) return KEY;
  if (row.access_token && Date.parse(row.expires_at ?? "") > Date.now() + 120e3) return (appTok = row.access_token);
  if (!CID || !CSEC) return KEY;
  const r = await fetch(`${B}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return KEY;
  await sb("ghl_oauth?id=eq.1", { method: "PATCH", body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(Date.now() + (Number(d.expires_in || 86400) - 60) * 1000).toISOString(), updated_at: new Date().toISOString() }) });
  return (appTok = d.access_token);
}
async function locToken(loc: string): Promise<{ token: string; why: string }> {
  const k = (await (await sb(`ghl_keys?location_id=eq.${loc}&select=token`)).json())?.[0]?.token;
  if (k) return { token: k, why: "" };
  const m = await fetch(`${B}/oauth/locationToken`, { method: "POST", headers: { ...H(await agencyToken()), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ companyId: CO, locationId: loc }).toString() });
  if (!m.ok) return { token: "", why: `can't open the sub-account (${m.status} ${await msg(m)})` };
  return { token: (await m.json())?.access_token ?? "", why: "" };
}

/* Lisa's calls this month. First HighLevel's Voice AI call logs (Lisa's calls only);
   if that isn't available, every call in the conversations export (counts all calls). */
// deno-lint-ignore no-explicit-any
const secs = (x: any) => Number(x?.duration ?? x?.callDuration ?? x?.meta?.call?.duration ?? x?.meta?.duration ?? 0) || 0;
async function callMinutes(loc: string, tok: string, from: Date, to: Date): Promise<{ minutes: number; calls: number; source: string; error: string }> {
  const errs: string[] = [];
  let total = 0, n = 0;
  for (let page = 1; page <= 40; page++) {
    const q = new URLSearchParams({ locationId: loc, startDate: String(from.getTime()), endDate: String(to.getTime()), page: String(page), pageSize: "50" });
    const r = await fetch(`${B}/voice-ai/dashboard/call-logs?${q}`, { headers: H(tok) });
    if (!r.ok) { errs.push(`voice-ai call logs ${r.status} ${await msg(r)}`); break; }
    const d = await r.json().catch(() => ({}));
    const rows = d.callLogs ?? d.calls ?? d.data ?? [];
    for (const c of rows) { total += secs(c); n++; }
    if (rows.length < 50) return { minutes: Math.ceil(total / 60), calls: n, source: "Voice AI call logs", error: "" };
  }
  if (!errs.length) return { minutes: Math.ceil(total / 60), calls: n, source: "Voice AI call logs", error: "" };
  total = 0; n = 0;
  let cursor = "";
  for (let i = 0; i < 40; i++) {
    const q = new URLSearchParams({ locationId: loc, channel: "Call", startDate: from.toISOString(), endDate: to.toISOString(), limit: "100", ...(cursor ? { cursor } : {}) });
    const r = await fetch(`${B}/conversations/messages/export?${q}`, { headers: H(tok) });
    if (!r.ok) { errs.push(`calls export ${r.status} ${await msg(r)}`); return { minutes: 0, calls: 0, source: "", error: errs.join("; ") }; }
    const d = await r.json().catch(() => ({}));
    const rows = d.messages ?? [];
    for (const m of rows) { total += secs(m); n++; }
    cursor = d.nextCursor ?? "";
    if (!cursor || !rows.length) break;
  }
  return { minutes: Math.ceil(total / 60), calls: n, source: "all calls (conversations export)", error: errs.join("; ") };
}

async function stripe(path: string, body: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
  return d;
}
const ym = (d: Date) => d.toISOString().slice(0, 7);

/* The Command Center (an ADMIN_EMAILS login): { op: "usage" } this month's minutes per
   account + the switch + the last run's log; { op: "bill_extra", on } flips the switch. */
const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function admin(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok || !ADMINS.length) return false;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${tok}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } });
  return r.ok && ADMINS.includes(String((await r.json())?.email ?? "").toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const c = await cfg("cron_key");
  if (!c || req.headers.get("x-cron-key") !== c) {
    if (!(await admin(req))) return json({ ok: false, error: "not authorized" }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.op === "bill_extra") {
      await sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "bill_extra_minutes", value: b.on ? "on" : "off" }) });
      return json({ ok: true });
    }
    const rows = await (await sb(`usage_month?month=eq.${ym(new Date())}&select=user_id,minutes,calls,included,source,last_error,updated_at`)).json();
    return json({ ok: true, data: rows, bill_extra: (await cfg("bill_extra_minutes")) === "on", log: await cfg("usage_log") });
  }
  const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const billOn = (await cfg("bill_extra_minutes")) === "on";
  const accts = await (await sb("accounts?select=user_id,email,plan,status,ghl_location_id,stripe_customer_id&ghl_location_id=neq.&status=in.(trial,active,past_due)")).json();
  const out: string[] = [];
  for (const a of Array.isArray(accts) ? accts : []) {
    const included = INCLUDED[a.plan] ?? 0;
    const t = await locToken(a.ghl_location_id);
    const save = (month: string, row: Record<string, unknown>) => sb("usage_month?on_conflict=user_id,month", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ user_id: a.user_id, month, included, updated_at: new Date().toISOString(), ...row }) });
    if (!t.token) { await save(ym(now), { last_error: t.why }); out.push(`${a.email}: ${t.why}`); continue; }
    const u = await callMinutes(a.ghl_location_id, t.token, start, now);
    const old = (await (await sb(`usage_month?user_id=eq.${a.user_id}&month=eq.${ym(now)}&select=warned80`)).json())?.[0];
    // a count that failed keeps the last good number
    if (!u.source) await save(ym(now), { last_error: u.error });
    else await save(ym(now), { minutes: u.minutes, calls: u.calls, source: u.source, last_error: u.error || null, warned80: !!old?.warned80 || (included > 0 && u.minutes >= included * 0.8) });
    out.push(`${a.email}: ${u.minutes} of ${included} min${u.error ? " (" + u.error + ")" : ""}`);
    // last month: settle it once (final count, then extra minutes onto their next invoice)
    const pm = ym(prevStart);
    const prev = (await (await sb(`usage_month?user_id=eq.${a.user_id}&month=eq.${pm}&select=*`)).json())?.[0];
    if (prev && prev.extra_billed == null) {
      const f = await callMinutes(a.ghl_location_id, t.token, prevStart, start);
      const mins = f.error && !f.source ? Number(prev.minutes) : f.minutes;
      const over = Math.max(0, mins - Number(prev.included || included));
      let billed: number | null = null;
      if (over === 0 || a.status !== "active") billed = 0;   // a trial or unpaid month is never billed
      else if (billOn && SK && a.stripe_customer_id) {
        try {
          await stripe("/invoiceitems", { customer: a.stripe_customer_id, currency: "usd", amount: String(Math.round(over * EXTRA_PER_MIN * 100)),
            description: `Extra Lisa call minutes, ${pm}: ${over} min × $${EXTRA_PER_MIN.toFixed(2)}`, "metadata[user_id]": a.user_id, "metadata[month]": pm });
          billed = over * EXTRA_PER_MIN;
        } catch (e) { out.push(`${a.email}: extra minutes not billed (${String(e).slice(0, 100)})`); }
      }
      await save(pm, { minutes: mins, ...(billed != null ? { extra_billed: billed } : {}) });
    }
  }
  const lines = out.slice(0, 40).map((l) => now.toISOString().slice(0, 16).replace("T", " ") + "  " + l).join("\n");
  await sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "usage_log", value: lines }) });
  return new Response("ok");
});
