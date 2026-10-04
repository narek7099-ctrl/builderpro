// quickbooks-sync — BuilderPro -> QuickBooks Online, one way.
//
//   POST { op:"status" }                 -> connection, account map, recent log
//   POST { op:"connect_url" }            -> { url } send the browser to Intuit
//   POST { op:"disconnect" }             -> revoke at Intuit, forget the tokens
//   POST { op:"accounts" }               -> the company's chart of accounts
//   POST { op:"save_map", map }          -> which account each thing goes to
//   POST { op:"sync" }                   -> send whatever has not been sent yet
//
// What goes across (each item once; qb_sync_log remembers what was sent):
//   - every real project's customer   -> Customer (matched by name if it exists)
//   - the project itself              -> sub-customer "job" under them
//   - each expense on a project       -> Purchase (Expense), on the mapped account,
//                                        tagged to the job; a receipt's store
//                                        becomes the Vendor
//   - money collected on a project    -> Sales Receipt for whatever was collected
//                                        since the last send, into the deposit account
// Nothing is ever read back into BuilderPro, and nothing in QuickBooks is
// changed or removed: a sent item is left alone even if edited here later.
//
// Only the owner or office may use it (qb_whoami). Tokens never leave the server.
// Secrets: QB_CLIENT_ID, QB_CLIENT_SECRET, optional QB_ENV (sandbox|production).

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CID = Deno.env.get("QB_CLIENT_ID") ?? "";
const CSECRET = Deno.env.get("QB_CLIENT_SECRET") ?? "";
const ENV = (Deno.env.get("QB_ENV") || "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
const REDIRECT = `${SB_URL}/functions/v1/quickbooks-oauth`;
const API = ENV === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
const MV = "minorversion=73";
const CATS = ["Materials", "Labor / crew", "Subcontractor", "Permits", "Other"];
const MAX_WRITES = 60;   // per run, so one press never runs past the function's time limit

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- supabase ---------- */
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
async function whoami(auth: string): Promise<string | null> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/qb_whoami`, { method: "POST", headers: { apikey: SB_ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return null;
  const v = await r.json();
  return typeof v === "string" && v ? v : null;
}

/* ---------- intuit ---------- */
type Conn = { owner: string; realm_id: string; access_token: string; refresh_token: string; access_expires_at: string; refresh_expires_at: string; account_map: any; company_name: string; env: string; last_sync_at: string | null; connected_at: string | null };
async function token(c: Conn): Promise<string> {
  if (c.access_token && Date.parse(c.access_expires_at) - Date.now() > 120000) return c.access_token;
  const r = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${CID}:${CSECRET}`), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: c.refresh_token }),
  });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error("QuickBooks sign-in has expired. Connect it again.");
  const now = Date.now();
  c.access_token = t.access_token; c.refresh_token = t.refresh_token || c.refresh_token;
  c.access_expires_at = new Date(now + (t.expires_in || 3600) * 1000).toISOString();
  await rest(`qb_connections?owner=eq.${c.owner}`, { method: "PATCH", body: JSON.stringify({
    access_token: c.access_token, refresh_token: c.refresh_token, access_expires_at: c.access_expires_at,
    refresh_expires_at: new Date(now + (t.x_refresh_token_expires_in || 8640000) * 1000).toISOString(), updated_at: new Date().toISOString() }) });
  return c.access_token;
}
function qbErr(b: any, status: number): string {
  const e = b?.Fault?.Error?.[0];
  return e ? String(e.Detail || e.Message || "QuickBooks refused it").slice(0, 400) : `QuickBooks error ${status}`;
}
async function qb(c: Conn, method: string, path: string, body?: unknown): Promise<any> {
  const tk = await token(c);
  const r = await fetch(`${API}/v3/company/${c.realm_id}/${path}${path.includes("?") ? "&" : "?"}${MV}`, {
    method, headers: { Authorization: `Bearer ${tk}`, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok || b?.Fault) throw new Error(qbErr(b, r.status));
  return b;
}
const q = (c: Conn, sql: string) => qb(c, "GET", `query?query=${encodeURIComponent(sql)}`).then((b) => b.QueryResponse || {});
const lit = (s: string) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const name100 = (s: string) => String(s || "").replace(/[:\t\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
const ymd = (ms: number) => { const d = new Date(ms); return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10); };
const r2 = (n: number) => Math.round((+n || 0) * 100) / 100;
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

/* ---------- sync ---------- */
async function sync(c: Conn) {
  const m = c.account_map || {};
  if (!m.bank || !m.income || !(m.cats && (m.cats.Materials || m.cats.Other))) throw new Error("Pick your accounts first.");
  const fin = await rest(`portal_finance?owner=eq.${c.owner}&select=jobs`);
  const jobs = ((fin && fin[0] && fin[0].jobs) || []).filter((j: any) => j && j.id && !j.sample && (j.status === "active" || j.status === "done"));
  const sent: Record<string, { qb_id: string; amount: number }> = {};
  const paid: Record<string, number> = {}, paidN: Record<string, number> = {};
  for (const r of (await rest(`qb_sync_log?owner=eq.${c.owner}&ok=is.true&select=kind,ref,qb_id,amount`)) || []) {
    sent[`${r.kind}|${r.ref}`] = { qb_id: r.qb_id, amount: +r.amount || 0 };
    if (r.kind === "payment") { const jid = String(r.ref).split(":")[0]; paid[jid] = (paid[jid] || 0) + (+r.amount || 0); paidN[jid] = (paidN[jid] || 0) + 1; }
  }
  let writes = 0, done = 0, failed = 0, left = 0;
  const log = async (kind: string, ref: string, label: string, amount: number | null, qb_id: string | null, err: string | null) => {
    if (qb_id) { sent[`${kind}|${ref}`] = { qb_id, amount: amount || 0 }; done++; } else failed++;
    await rest("qb_sync_log", { method: "POST", body: JSON.stringify({ owner: c.owner, kind, ref, label, amount, qb_id, ok: !!qb_id, error: err }) }).catch(() => {});
  };
  // find by name, else create; remembered under (kind, ref)
  const ensure = async (kind: string, ref: string, entity: string, field: string, value: string, create: () => any): Promise<string | null> => {
    const k = sent[`${kind}|${ref}`]; if (k) return k.qb_id;
    if (writes >= MAX_WRITES) { left++; return null; }
    try {
      const found = (await q(c, `select Id from ${entity} where ${field} = ${lit(value)}`))[entity];
      let id = found && found[0] && found[0].Id;
      if (!id) { writes++; id = (await qb(c, "POST", entity.toLowerCase(), create()))[entity].Id; }
      await log(kind, ref, value, null, String(id), null);
      return String(id);
    } catch (e) { await log(kind, ref, value, null, null, (e as Error).message); return null; }
  };

  const item = await ensure("item", "income", "Item", "Name", "BuilderPro job income",
    () => ({ Name: "BuilderPro job income", Type: "Service", IncomeAccountRef: { value: m.income } }));

  for (const j of jobs) {
    const cname = name100(j.name || "Customer");
    const cust = await ensure("customer", cname.toLowerCase(), "Customer", "DisplayName", cname, () => ({
      DisplayName: cname,
      ...(j.phone ? { PrimaryPhone: { FreeFormNumber: String(j.phone).slice(0, 30) } } : {}),
      ...(j.email ? { PrimaryEmailAddr: { Address: String(j.email).slice(0, 100) } } : {}),
      ...(j.addr ? { BillAddr: { Line1: String(j.addr).slice(0, 500) } } : {}),
    }));
    if (!cust) continue;
    const jname = name100(`${j.title || "Job"} - ${cname}`).slice(0, 90) + ` (${String(j.id).slice(-5)})`;
    const job = await ensure("job", j.id, "Customer", "DisplayName", jname, () => ({ DisplayName: jname, Job: true, BillWithParent: true, ParentRef: { value: cust } }));
    if (!job) continue;

    for (const e of (j.expenses || [])) {
      const amt = r2(e && e.amt); if (!(amt > 0)) continue;
      const ref = `${j.id}:${e.key || hash(`${e.cat}|${e.amt}|${e.when}|${e.note}`)}`;
      if (sent[`expense|${ref}`]) continue;
      if (writes >= MAX_WRITES) { left++; continue; }
      const acct = (m.cats || {})[e.cat] || (m.cats || {}).Other || (m.cats || {}).Materials;
      const note = String(e.note || e.cat || "Expense").slice(0, 400);
      const store = /^(.+?) receipt$/i.exec(note)?.[1];
      let vendor: string | null = null;
      if (store) vendor = await ensure("vendor", name100(store).toLowerCase(), "Vendor", "DisplayName", name100(store), () => ({ DisplayName: name100(store) }));
      try {
        writes++;
        const p = await qb(c, "POST", "purchase", {
          PaymentType: "Cash", AccountRef: { value: m.bank }, TxnDate: ymd(+e.when || Date.now()), PrivateNote: `BuilderPro: ${note}`,
          ...(vendor ? { EntityRef: { value: vendor, type: "Vendor" } } : {}),
          Line: [{ Amount: amt, DetailType: "AccountBasedExpenseLineDetail", Description: note,
            AccountBasedExpenseLineDetail: { AccountRef: { value: acct }, CustomerRef: { value: job } } }],
        });
        await log("expense", ref, `${e.cat || "Expense"} · ${cname}`, amt, String(p.Purchase.Id), null);
      } catch (x) { await log("expense", ref, `${e.cat || "Expense"} · ${cname}`, amt, null, (x as Error).message); }
    }

    const owed = r2((+j.collected || 0) - (paid[j.id] || 0));
    if (owed > 0.004 && item) {
      if (writes >= MAX_WRITES) { left++; continue; }
      const n = (paidN[j.id] || 0) + 1, ref = `${j.id}:${n}`;
      try {
        writes++;
        const s = await qb(c, "POST", "salesreceipt", {
          CustomerRef: { value: job }, TxnDate: ymd(Date.now()), DepositToAccountRef: { value: m.deposit || m.bank },
          PrivateNote: "BuilderPro: payment collected on this project",
          Line: [{ Amount: owed, DetailType: "SalesItemLineDetail", Description: `${j.title || "Job"} - payment`,
            SalesItemLineDetail: { ItemRef: { value: item }, Qty: 1, UnitPrice: owed } }],
        });
        paid[j.id] = (paid[j.id] || 0) + owed; paidN[j.id] = n;
        await log("payment", ref, `Payment · ${cname}`, owed, String(s.SalesReceipt.Id), null);
      } catch (x) { await log("payment", ref, `Payment · ${cname}`, owed, null, (x as Error).message); }
    }
  }
  await rest(`qb_connections?owner=eq.${c.owner}`, { method: "PATCH", body: JSON.stringify({ last_sync_at: new Date().toISOString() }) });
  return { sent: done, failed, more: left > 0 };
}

/* ---------- handler ---------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const auth = req.headers.get("authorization") || "";
  const owner = auth ? await whoami(auth) : null;
  if (!owner) return json({ ok: false, error: "Only the owner or office can use QuickBooks." }, 403);
  let body: any = {}; try { body = await req.json(); } catch (_) { /* empty */ }
  const op = String(body.op || "status");
  if (!CID || !CSECRET) return json({ ok: false, configured: false, error: "QuickBooks keys are not set up on the server yet." });
  try {
    const rows = await rest(`qb_connections?owner=eq.${owner}&select=*`);
    const c: Conn | null = rows && rows[0] && rows[0].realm_id && rows[0].refresh_token ? rows[0] : null;

    if (op === "status") {
      const log = await rest(`qb_sync_log?owner=eq.${owner}&select=kind,label,amount,ok,error,at&order=at.desc&limit=40`);
      return json({ ok: true, configured: true, env: ENV, connected: !!c, company: c?.company_name || "", sandbox: (c?.env || ENV) === "sandbox",
        map: c?.account_map || {}, cats: CATS, last_sync: c?.last_sync_at || null, connected_at: c?.connected_at || null, log });
    }
    if (op === "connect_url") {
      const st = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      await rest("qb_connections?on_conflict=owner", { method: "POST", body: JSON.stringify({ owner, oauth_state: st, oauth_state_at: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      const u = new URL("https://appcenter.intuit.com/connect/oauth2");
      u.search = new URLSearchParams({ client_id: CID, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: REDIRECT, state: st }).toString();
      return json({ ok: true, url: u.toString() });
    }
    if (!c) return json({ ok: false, error: "QuickBooks is not connected." });
    if (op === "disconnect") {
      await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", {
        method: "POST", headers: { Authorization: "Basic " + btoa(`${CID}:${CSECRET}`), "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token: c.refresh_token }),
      }).catch(() => {});
      await rest(`qb_connections?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify({ realm_id: null, access_token: null, refresh_token: null, access_expires_at: null, refresh_expires_at: null, company_name: null, connected_at: null, updated_at: new Date().toISOString() }) });
      return json({ ok: true });
    }
    if (op === "accounts") {
      const a = (await q(c, "select Id, Name, AccountType, AccountSubType, Active from Account maxresults 1000")).Account || [];
      return json({ ok: true, accounts: a.filter((x: any) => x.Active !== false).map((x: any) => ({ id: x.Id, name: x.Name, type: x.AccountType, sub: x.AccountSubType })) });
    }
    if (op === "save_map") {
      const mm = body.map || {}, clean: any = { cats: {} };
      for (const k of ["bank", "deposit", "income"]) if (mm[k]) clean[k] = String(mm[k]).slice(0, 20);
      for (const k of CATS) if (mm.cats && mm.cats[k]) clean.cats[k] = String(mm.cats[k]).slice(0, 20);
      await rest(`qb_connections?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify({ account_map: clean, updated_at: new Date().toISOString() }) });
      return json({ ok: true, map: clean });
    }
    if (op === "sync") return json({ ok: true, ...(await sync(c)) });
    return json({ ok: false, error: "unknown op" }, 400);
  } catch (e) {
    console.error("qb", op, (e as Error).message);
    return json({ ok: false, error: (e as Error).message });
  }
});
