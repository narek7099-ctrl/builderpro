// ghl-estimate — portal estimates: clients create + send real GHL estimates
// (formal quotes the customer can Accept/Decline). Acceptance fires GHL's
// estimate triggers, which can auto-create the deposit invoice.
// Actions: {action:'create', contactId, contactName, phone?, email?, title,
//           amount, items?:[{name,description,qty,amount}], discount?, description?, expiryDays?, send:'sms'|'email'|'both', businessName?}
//          {action:'list'}
// Deploy:  supabase functions deploy ghl-estimate --no-verify-jwt
// Keys: the signed-in client's own sub-account and key (ghl_keys); GHL_LOCATION_ID is the house account's demo only.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const LOC_FALLBACK = Deno.env.get("GHL_LOCATION_ID") ?? "";   // the house (demo) account only
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BR_SB = SB_URL, BR_KEY = SB_SERVICE;
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

/* line items from the portal's estimate builder; falls back to one line for the amount */
function lineItems(b: Record<string, unknown>, title: string, desc: string, amount: number) {
  const raw = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]).slice(0, 80) : [];
  const items = raw.map((it) => ({
    name: String(it?.name ?? "").trim().slice(0, 120) || "Item",
    description: String(it?.description ?? it?.name ?? "").trim().slice(0, 300) || "Item",
    currency: "USD",
    amount: Math.round(Math.max(0, Number(it?.amount ?? 0)) * 100) / 100,
    qty: Math.max(0.01, Math.round(Number(it?.qty ?? 1) * 100) / 100 || 1),
    taxes: [],
  })).filter((it) => it.amount > 0);
  if (!items.length) return { items: [{ name: title, description: desc || title, currency: "USD", amount, qty: 1, taxes: [] }], total: amount };
  const total = Math.round(items.reduce((t, it) => t + Math.round(it.amount * it.qty * 100) / 100, 0) * 100) / 100;
  return { items, total };
}

/* the client's own HighLevel key, saved from the Command Center */
async function savedKey(loc: string): Promise<string> {
  if (!loc || !BR_SB) return "";
  try {
    const r = await fetch(`${BR_SB}/rest/v1/ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token`, { headers: { apikey: BR_KEY, Authorization: `Bearer ${BR_KEY}` } });
    return r.ok ? String((await r.json())?.[0]?.token ?? "") : "";
  } catch { return ""; }
}
async function token(loc: string): Promise<string> {
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
// The signed-in client's own GHL sub-account. Without it we must not fall back
// to a shared location — that would put their customer's money in someone
// else's Stripe, so we refuse instead.
async function ownerLocation(jwt: string): Promise<{ id: string; loc: string }> {
  const none = { id: "", loc: "" };
  if (!jwt || !SB_URL || !SB_SERVICE) return none;
  try {
    const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!u.ok) return none;
    const me0 = await u.json();
    if (!me0?.id) return none;
    const me = await effectiveOwner(me0.id, me0.email);
    const h = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` };
    const get = async (qs: string) => {
      const r = await fetch(`${SB_URL}/rest/v1/ai_brain?${qs}&select=ghl_location_id&limit=1`, { headers: h });
      if (!r.ok) return "";
      const rows = await r.json();
      return String(rows?.[0]?.ghl_location_id ?? "");
    };
    // owned row first; otherwise the row onboarding set up for this email
    return { id: me.id, loc: (await get(`owner=eq.${me.id}`)) || (me.email ? await get(`owner_email=ilike.${encodeURIComponent(me.email)}`) : "") };
  } catch { return none; }
}
/* whether the signed-in owner is the BuilderPro house account, the only one
   allowed to use the shared demo sub-account */
async function isHouse(id: string): Promise<boolean> {
  if (!id) return false;
  const r = await fetch(`${SB_URL}/rest/v1/ai_config?key=eq.ghl_events_owner&select=value`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }).catch(() => null);
  const v = r && r.ok ? (await r.json())?.[0]?.value : "";
  return !!v && String(v) === id;
}

/* A team member works on their owner's account. After auth, swap the caller
   for the owner they belong to (and the owner's email where a lookup is by
   email), so everything downstream reads and writes the right rows. */
async function effectiveOwner(id: string, email?: string): Promise<{ id: string; email: string }> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner,owner_email&limit=1`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
    const rows = r.ok ? await r.json() : [];
    if (rows?.[0]?.owner) return { id: rows[0].owner, email: rows[0].owner_email || email || "" };
  } catch { /* fall through */ }
  return { id, email: email ?? "" };
}
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const who = await ownerLocation(jwt);
  let LOC = who.loc;
  if (!who.id) return json({ ok: false, error: "Sign in to use estimates." }, 401);
  /* a client's estimates live in their own sub-account (the deposit flow reads them there) */
  if (!LOC && LOC_FALLBACK && await isHouse(who.id)) LOC = LOC_FALLBACK;
  if (!LOC) return json({ ok: false, error: "Your account isn't fully set up yet. We'll let you know as soon as estimates are ready." }, 409);
  const t = await token(LOC);
  if (!t) return json({ ok: false, error: "no GHL token" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.action === "list") {
    const r = await fetch(`${GHL_BASE}/invoices/estimate/list?altId=${LOC}&altType=location&limit=25&offset=0`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? "list failed" }, 502);
    const arr = d?.estimates ?? d?.data ?? [];
    const items = arr.map((v: Record<string, unknown>) => ({
      id: v._id ?? v.id,
      name: v.name ?? "Estimate",
      total: v.total ?? v.amountDue ?? 0,
      status: v.status ?? "draft",
      contact: (v.contactDetails as Record<string, unknown>)?.name ?? "",
      createdAt: v.createdAt ?? "",
      expiryDate: v.expiryDate ?? v.dueDate ?? "",
    }));
    return json({ ok: true, items });
  }

  if (b.action === "create") {
    const contactId = String(b.contactId ?? "").trim();
    let amount = Number(b.amount ?? 0);
    const title = String(b.title ?? "Estimate").trim() || "Estimate";
    const hasItems = Array.isArray(b.items) && (b.items as unknown[]).length > 0;
    if (!contactId || !(amount > 0 || hasItems)) return json({ ok: false, error: "contactId and amount required" }, 400);
    const phone = String(b.phone ?? "").trim();
    const email = String(b.email ?? "").trim();
    const desc = String(b.description ?? "").trim();
    const li = lineItems(b, title, desc, amount);
    const disc = Math.min(Math.max(0, Math.round(Number(b.discount ?? 0) * 100) / 100), li.total);
    amount = Math.round((li.total - disc) * 100) / 100;
    if (!(amount > 0)) return json({ ok: false, error: "the total is $0" }, 400);
    const expiryDays = Math.max(1, Number(b.expiryDays ?? 14));

    const payload = {
      altId: LOC, altType: "location",
      name: title,
      businessDetails: { name: String(b.businessName ?? "Your contractor") },
      currency: "USD",
      items: li.items,
      discount: disc > 0 ? { type: "fixed", value: disc } : { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name: String(b.contactName ?? "Customer"), phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0),
      expiryDate: day(expiryDays),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    };
    const r = await fetch(`${GHL_BASE}/invoices/estimate`, { method: "POST", headers: ghlH(t), body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? JSON.stringify(d).slice(0, 300) }, 502);
    const estId = d?._id ?? d?.id ?? d?.estimate?._id;
    if (!estId) return json({ ok: false, error: "created but no estimate id returned", raw: d }, 502);

    const sendPref = b.send === "email" ? "email" : b.send === "both" ? "sms_and_email" : "sms";
    let sent = false, sendErr = "";
    try {
      const rs = await fetch(`${GHL_BASE}/invoices/estimate/${estId}/send`, {
        method: "POST", headers: ghlH(t),
        body: JSON.stringify({ altId: LOC, altType: "location", action: sendPref, liveMode: true }),
      });
      sent = rs.ok;
      if (!rs.ok) sendErr = (await rs.json().catch(() => ({})))?.message ?? `send ${rs.status}`;
    } catch (e) { sendErr = String(e).slice(0, 120); }

    return json({ ok: true, id: estId, sent, sendError: sendErr || undefined });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
