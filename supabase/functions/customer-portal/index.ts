// customer-portal — the homeowner's side of a job.
//
// The owner sends a private link, builderpro-os.com/#home=<token>. The page
// has no login: the token is the credential, and this function is the only
// thing it talks to. Every answer is about the one job the token belongs to.
//
//   POST { op:"get", token }
//     -> { ok, business:{name, logo, color (#rrggbb or ""), phone, email, contact (owner's first name)}, job:{...}, money:{...},
//          crew:[{name, trade, photo}], photos:[{url}], docs:[{name, type, url}],
//          contracts:[{title, status, signed_at, link}],
//          permits:[{type, number, status, approved, expires, inspections:[{kind, date, result}]}],
//          job also carries start (plan start), phases[].start, and
//          schedule:[{date, time ("HH:MM" or ""), dur (minutes)}] for every scheduled day,
//          messages:[...], changes:[...], payments:[...], canPay }
//   POST { op:"message", token, body }
//   POST { op:"change_order_decide", token, id, decision:"approve"|"decline",
//          signer_name, signature (data:image/png), consent:true, note? }
//   POST { op:"pay", token } -> { ok, url } a BuilderPro pay link for the
//          homeowner's newest open invoice: card checkout on the contractor's
//          own Stripe (stripe-pay), which then marks the invoice paid
//
// Never returned: the owner id, other jobs, phone numbers of the crew, crew
// pay, subcontractors and their prices or invoices, expenses or profit.
// Photos and documents only when the owner shared them, as signed URLs that
// last an hour.
//
// Deploy:  supabase functions deploy customer-portal --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected), PORTAL_URL,
//          GHL_TOKEN or GHL_API_KEY + GHL_COMPANY_ID (only for Pay now).

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
// same token rules as ghl-invoice

/* ---------- BuilderPro payments bridge ----------
   Customers pay through the contractor's own Stripe connected in BuilderPro
   (stripe-pay), not through HighLevel. The HighLevel invoice stays the record:
   when the card goes through, stripe-webhook records the payment on it, so
   "Invoice Paid" workflows fire as before. Contractors never see HighLevel. */
const BR_SB = Deno.env.get("SUPABASE_URL") ?? "", BR_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BR_SITE = Deno.env.get("PORTAL_URL") || "https://builderpro-os.com/";
/* the client's own HighLevel key, saved from the Command Center */
async function savedKey(loc: string): Promise<string> {
  if (!loc || !BR_SB) return "";
  try {
    const r = await fetch(`${BR_SB}/rest/v1/ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token`, { headers: { apikey: BR_KEY, Authorization: `Bearer ${BR_KEY}` } });
    return r.ok ? String((await r.json())?.[0]?.token ?? "") : "";
  } catch { return ""; }
}
/* a pay link nobody can forge: location + invoice, signed on the server */
async function paySig(loc: string, inv: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("PAY_LINK_SECRET") || BR_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${loc}.${inv}`)));
  return btoa(String.fromCharCode(...s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22);
}
async function bpPayLink(loc: string, inv: string): Promise<string> { return `${BR_SITE}#pay=${loc}.${inv}.${await paySig(loc, inv)}`; }

async function ghlToken(loc: string): Promise<string> {
  const own = await savedKey(loc); if (own) return own;
  if (GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID && loc) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
    } catch { /* fall through */ }
  }
  return GHL_API_KEY;
}
// the owner's own GHL sub-account; never a shared fallback (wrong Stripe)
async function ghlLocation(owner: string): Promise<string> {
  const r = rows(await rest(`ai_brain?owner=eq.${owner}&select=ghl_location_id&limit=1`))[0];
  return String(r?.ghl_location_id ?? "");
}
const BUCKET = "project-files";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const num = (x: unknown) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
const first = (s: unknown) => clean(s, 80).split(/\s+/)[0] || "";

const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
const agentOf = (req: Request) => (req.headers.get("user-agent") ?? "").slice(0, 300);

// --- rate limit: per IP, per isolate. Stops someone hammering to guess tokens
// or flooding the thread; the 48-hex token is the real lock.
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const a = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  a.push(now);
  hits.set(key, a);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return a.length > max;
}
const recent = (key: string, windowMs = 10 * 60 * 1000) => (hits.get(key) ?? []).filter((t) => Date.now() - t < windowMs).length;

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });
  const txt = await r.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}
const rows = (r: { data: any }) => (Array.isArray(r.data) ? r.data : []);

async function signed(ref: unknown): Promise<string> {
  const s = String(ref ?? "");
  if (/^https:\/\//i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|webp);base64,/i.test(s) && s.length < 3_000_000) return s;  // demo / not yet uploaded
  if (!s.startsWith("sb:")) return "";
  const path = s.slice(3).split("#")[0];
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST", headers: sbH, body: JSON.stringify({ expiresIn: 3600 }),
    });
    const d = await r.json();
    const u = d?.signedURL || d?.signedUrl || "";
    return u ? (u.startsWith("http") ? u : `${SB_URL}/storage/v1${u}`) : "";
  } catch { return ""; }
}

type Ctx = { link: Row; job: Row; jobs: Row[] };
async function byToken(token: unknown): Promise<Ctx | null> {
  const t = String(token ?? "");
  if (!/^[a-f0-9]{40,64}$/i.test(t)) return null;
  const l = rows(await rest(`customer_portal_links?token=eq.${t.toLowerCase()}&enabled=is.true&select=*&limit=1`))[0];
  if (!l) return null;
  const pf = rows(await rest(`portal_finance?owner=eq.${l.owner}&select=jobs&limit=1`))[0];
  const jobs = arr(pf?.jobs);
  const job = jobs.find((j) => String(j?.id ?? "") === l.job_id);
  return job ? { link: l, job, jobs } : null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const isoDay = (s: unknown) => { const v = String(s ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""; };
// the next Monday-to-Friday day after an ISO date
function nextWorkDay(s: string): string {
  const d = new Date(s + "T12:00:00Z");
  if (isNaN(d.getTime())) return "";
  do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return iso(d);
}

/* contract total: the job's estimate plus approved change orders the owner's
   portal has not yet folded into it (it remembers which in job.custCoApplied) */
function moneyOf(job: Row, changes: Row[], payments: Row[]) {
  const applied = new Set(arr(job.custCoApplied).map(String));
  const pendingAdd = changes.filter((c) => c.status === "approved" && !applied.has(String(c.id))).reduce((t, c) => t + num(c.amount), 0);
  const contract = r2(num(job.estimate) + pendingAdd);
  const paid = r2(num(job.collected));
  return { contract, paid, due: r2(Math.max(contract - paid, 0)), changeOrders: r2(changes.filter((c) => c.status === "approved").reduce((t, c) => t + num(c.amount), 0)), payments };
}

async function view(c: Ctx) {
  const { link: l, job: j } = c;
  const owner = l.owner, jid = encodeURIComponent(l.job_id);
  const [cs, msgs, cos, cts, pays, loc] = await Promise.all([
    rest(`client_settings?user_id=eq.${owner}&select=data&limit=1`),
    rest(`customer_messages?owner=eq.${owner}&job_id=eq.${jid}&select=id,from_customer,author,body,created_at,read_at&order=created_at.asc&limit=300`),
    rest(`customer_change_orders?owner=eq.${owner}&job_id=eq.${jid}&status=neq.void&select=id,title,description,amount,status,signer_name,signed_at,signature,created_at&order=created_at.desc`),
    rest(`contracts?owner=eq.${owner}&job_id=eq.${jid}&status=in.(sent,viewed,signed)&select=title,status,token,amount,signed_at,sent_at&order=created_at.desc`),
    rest(`stripe_payments?owner=eq.${owner}&invoice_ref=eq.${encodeURIComponent("portal:" + l.job_id)}&status=eq.succeeded&select=amount,paid_at,currency&order=paid_at.desc&limit=50`),
    ghlLocation(owner),
  ]);
  const data = rows(cs)[0]?.data ?? {};
  const co = data.company ?? {};
  // the person the homeowner is talking to: the owner's first name, if set
  const contact = first(data.owner?.name);

  // crew: the job's crew (settings.crews) and people put on it directly —
  // first names, trade and photo only
  const ids = new Set<string>();
  arr(j.assignees).forEach((a) => { if (UUID.test(String(a?.employeeId ?? ""))) ids.add(String(a.employeeId)); });
  if (typeof j.crew === "string") {
    const cr = arr(data.crews).find((x) => String(x?.id ?? "") === j.crew);
    arr(cr?.members).forEach((m) => { if (UUID.test(String(m))) ids.add(String(m)); });
  } else arr(j.crew).forEach((m) => { if (UUID.test(String(m))) ids.add(String(m)); });
  const emps = ids.size ? rows(await rest(`employees?owner=eq.${owner}&active=is.true&id=in.(${[...ids].join(",")})&select=name,trade,photo_url&order=name.asc`)) : [];
  const crew = await Promise.all(emps.map(async (e: Row) => ({ name: first(e.name), trade: clean(e.trade, 60), photo: await signed(e.photo_url) })));

  const sp = new Set(arr(l.share_photos).map(String)), sd = new Set(arr(l.share_docs).map(String));
  const photos = (await Promise.all(arr(j.photos).filter((p) => sp.has(String(p))).slice(0, 60).map((p) => signed(p)))).filter(Boolean).map((url) => ({ url }));
  const docs = (await Promise.all(arr(j.docs).filter((d) => d && sd.has(String(d.d))).slice(0, 60).map(async (d) => ({
    name: clean(d.n, 120) || "Document", type: /pdf/i.test(String(d.t ?? "")) ? "pdf" : "image", url: await signed(d.d),
  })))).filter((d) => d.url);

  const today = iso(new Date());
  const dates = arr(j.sched?.dates).map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  // phases: each starts the working day after the one before it ends (the
  // plan's own rule, portal/progress.js); the first starts on plan.start
  const planStart = isoDay(j.plan?.start);
  let prevDue = "";
  const phases = arr(j.plan?.phases).map((p, i) => {
    const due = isoDay(p?.due);
    const start = i === 0 ? planStart : prevDue ? nextWorkDay(prevDue) : "";
    prevDue = due;
    return { name: clean(p?.name, 80), days: num(p?.days) || 1, due, start: start && due && start > due ? due : start, done: !!p?.doneAt };
  });
  // every scheduled day with its time window (slots[day] = {t:"HH:MM", dur:minutes}),
  // past ones too so the calendar can show them; nothing else from the slot
  const slots: Row = (j.sched?.slots && typeof j.sched.slots === "object") ? j.sched.slots : {};
  const schedule = dates.slice(-120).map((d) => {
    const sl = slots[d] && typeof slots[d] === "object" ? slots[d] : null;
    const t = /^\d{1,2}:\d{2}$/.test(String(sl?.t ?? "")) ? String(sl.t) : "";
    return { date: d, time: t, dur: t ? Math.max(0, Math.min(24 * 60, Math.round(num(sl?.dur)))) : 0 };
  });
  const tot = phases.reduce((t, p) => t + p.days, 0), done = phases.reduce((t, p) => t + (p.done ? p.days : 0), 0);
  const changes = rows(cos);
  const payments = rows(pays).map((p: Row) => ({ amount: r2(num(p.amount) / 100), at: p.paid_at }));

  return {
    ok: true,
    business: {
      name: clean(co.name, 120), logo: /^https:\/\//i.test(String(co.logoUrl ?? "")) ? co.logoUrl : "",
      color: /^#[0-9a-f]{6}$/i.test(String(co.brandColor ?? "")) ? String(co.brandColor) : "",
      phone: clean(co.phone, 40), email: clean(co.email, 120), contact,
    },
    job: {
      title: clean(j.title, 160), customer: first(j.name), addr: clean(j.addr, 200),
      status: j.status === "done" ? "done" : "active",
      progress: tot ? Math.round(done / tot * 100) : (j.status === "done" ? 100 : null),
      phases, next_visit: dates.find((d) => d >= today) || "", time: clean(j.sched?.time, 40),
      visits: dates.filter((d) => d >= today).slice(0, 10),
      finish: phases.length ? phases[phases.length - 1].due : "",
      start: planStart || phases.find((p) => p.start)?.start || dates[0] || "",
      schedule,
    },
    money: moneyOf(j, changes, payments),
    canPay: !!(loc && (GHL_TOKEN || GHL_API_KEY || await savedKey(loc))),
    crew,
    photos, docs,
    contracts: rows(cts).map((k: Row) => ({ title: clean(k.title, 160), status: k.status, signed_at: k.signed_at, amount: k.amount, link: `${PORTAL_URL}#sign=${k.token}` })),
    permits: arr(j.permits).filter((p) => p && String(p.gone ?? "") !== "true").map((p) => ({
      type: clean(p.type, 80), number: clean(p.number, 60), status: clean(p.status, 40), approved: clean(p.approved, 10), expires: clean(p.expires, 10),
      // inspections: what, when, result only (no inspector notes, no fees)
      inspections: arr(p.inspections).filter((x) => x && (x.date || x.kind)).slice(0, 30).map((x) => ({
        kind: clean(x.kind, 80), date: isoDay(x.date), result: ["Passed", "Failed", "Pending"].includes(String(x.result)) ? String(x.result) : "Pending",
      })),
    })),
    messages: rows(msgs).map((m: Row) => ({ id: m.id, mine: !!m.from_customer, author: m.from_customer ? "" : clean(m.author, 60) || contact || clean(co.name, 60), body: m.body, at: m.created_at, read: !!m.read_at })),
    changes: changes.map((x: Row) => ({ id: x.id, title: x.title, description: x.description, amount: num(x.amount), status: x.status, signer_name: x.signer_name, signed_at: x.signed_at, signature: x.status === "approved" ? x.signature : null, at: x.created_at })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);
  const ip = clientIp(req) || "anon";
  if (limited(ip, 120)) return json({ ok: false, error: "Too many requests. Try again in a few minutes." }, 429);

  let b: Row;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  try {
    // twenty wrong tokens from one address and it waits, right or wrong
    if (recent("miss:" + ip) >= 20) return json({ ok: false, error: "Too many requests. Try again in a few minutes." }, 429);
    const c = await byToken(b.token);
    if (!c) { limited("miss:" + ip, 20); return json({ ok: false, error: "not_found" }, 404); }
    const { link: l } = c;
    const owner = l.owner, jid = encodeURIComponent(l.job_id);

    if (b.op === "get") {
      const now = new Date().toISOString();
      // seen: the link (owner sees "last viewed"), and the business's messages
      await Promise.all([
        rest(`customer_portal_links?owner=eq.${owner}&job_id=eq.${jid}`, { method: "PATCH", body: JSON.stringify({ last_seen_at: now }) }),
        rest(`customer_messages?owner=eq.${owner}&job_id=eq.${jid}&from_customer=is.false&read_at=is.null`, { method: "PATCH", body: JSON.stringify({ read_at: now }) }),
      ]);
      return json(await view(c));
    }

    if (b.op === "message") {
      if (limited("msg:" + ip, 20)) return json({ ok: false, error: "That's a lot of messages at once. Try again in a few minutes." }, 429);
      const body = clean(b.body, 2000);
      if (!body) return json({ ok: false, error: "Type a message first." });
      const r = await rest("customer_messages", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ owner, job_id: l.job_id, from_customer: true, author: first(c.job.name), body }),
      });
      if (!r.ok) return json({ ok: false, error: "Couldn't send. Try again." }, 500);
      return json(await view(c));
    }

    if (b.op === "change_order_decide") {
      const id = String(b.id ?? "");
      if (!UUID.test(id)) return json({ ok: false, error: "not_found" }, 404);
      const co = rows(await rest(`customer_change_orders?id=eq.${id}&owner=eq.${owner}&job_id=eq.${jid}&select=id,status&limit=1`))[0];
      if (!co) return json({ ok: false, error: "not_found" }, 404);
      if (co.status !== "pending") return json({ ok: false, error: co.status === "void" ? "This change was withdrawn by your contractor." : "You already answered this one." });
      const approve = b.decision === "approve";
      const now = new Date().toISOString();
      let patch: Row;
      if (approve) {
        const name = clean(b.signer_name, 120), sig = String(b.signature ?? "");
        if (name.length < 2) return json({ ok: false, error: "Please type your full name." });
        if (b.consent !== true) return json({ ok: false, error: "Please tick the box agreeing to sign electronically." });
        if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 400000) return json({ ok: false, error: "Please add your signature." });
        patch = { status: "approved", signer_name: name, signature: sig, signed_at: now, ip: clientIp(req), agent: agentOf(req) };
      } else {
        patch = { status: "declined", signer_name: clean(b.signer_name, 120) || null, signed_at: now, decline_note: clean(b.note, 500) || null, ip: clientIp(req), agent: agentOf(req) };
      }
      // conditional on still pending, so a double tap or a withdraw racing it cannot both land
      const r = await rest(`customer_change_orders?id=eq.${id}&owner=eq.${owner}&status=eq.pending`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch),
      });
      if (!r.ok || !rows(r).length) return json({ ok: false, error: "This change order was just updated. Reload the page." }, 409);
      return json(await view(c));
    }

    if (b.op === "pay") {
      if (limited("pay:" + ip, 10)) return json({ ok: false, error: "Too many attempts. Try again in a few minutes." }, 429);
      const no = (error: string) => json({ ok: false, error });
      const loc = await ghlLocation(owner);
      const t = loc ? await ghlToken(loc) : "";
      if (!loc || !t) return no("Online payment isn't set up yet. Contact your contractor to pay.");
      const r = await fetch(`${GHL_BASE}/invoices/?altId=${loc}&altType=location&limit=100&offset=0`, { headers: ghlH(t) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return no("Your invoice couldn't be opened. Try again, or contact your contractor.");
      // this homeowner's invoices: same email, else same name
      const em = String(c.job.email ?? "").trim().toLowerCase(), nm = String(c.job.name ?? "").trim().toLowerCase();
      const open = arr(d?.invoices).filter((v) => {
        const cd = (v.contactDetails ?? {}) as Row;
        const st = String(v.status ?? "").toLowerCase();
        const mine = (em && String(cd.email ?? "").toLowerCase() === em) || (nm && String(cd.name ?? "").trim().toLowerCase() === nm);
        return mine && !["paid", "void", "draft"].includes(st);
      }).sort((x, y) => String(y.createdAt ?? "").localeCompare(String(x.createdAt ?? "")));
      const inv = open[0];
      if (!inv) return no("There's no open invoice yet. Your contractor will send one when a payment is due.");
      const id = String(inv._id ?? inv.id ?? "");
      /* paid through BuilderPro, into the contractor's own Stripe; paying marks this invoice paid */
      return json({ ok: true, url: await bpPayLink(loc, id), amount: num(inv.amountDue ?? inv.total) });
    }

    return json({ ok: false, error: "unknown op" }, 400);
  } catch (e) {
    console.error("customer-portal", e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
});
