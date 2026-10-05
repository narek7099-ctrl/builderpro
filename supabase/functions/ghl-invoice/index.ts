// ghl-invoice — the portal's invoicing: clients create + send real GHL invoices
// to their customers, so GHL "Invoice paid" workflow triggers fire on payment.
// Actions (POST JSON):
//   {action:'create', contactId, contactName, phone?, email?, title, amount, description?, dueDays?, send:'sms'|'email'|'both'}
//   {action:'list'}  -> {ok, items:[{id,name,total,status,contact,createdAt,dueDate}]}
//
// Deploy:  supabase functions deploy ghl-invoice --no-verify-jwt
// Secrets: GHL_TOKEN (location token), GHL_LOCATION_ID (required),
//          optional GHL_API_KEY + GHL_COMPANY_ID to mint a location token.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Fallback only. Each client's invoices belong in THEIR OWN sub-account so the
// money lands in THEIR Stripe — resolved per signed-in owner below.
const LOC_FALLBACK = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });


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
async function payLink(loc: string, inv: string): Promise<string> { return `${BR_SITE}#pay=${loc}.${inv}.${await paySig(loc, inv)}`; }
/* mark the invoice "sent" in HighLevel without HighLevel messaging anyone (our text carries the
   BuilderPro pay link instead), so it isn't left as a draft and can take the payment */
async function markSent(t: string, loc: string, inv: string): Promise<boolean> {
  const h = { Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };
  let userId = "";
  try { const u = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${loc}`, { headers: h }); userId = String((await u.json())?.users?.[0]?.id ?? ""); } catch { /* optional */ }
  const r = await fetch(`https://services.leadconnectorhq.com/invoices/${inv}/send`, { method: "POST", headers: h,
    body: JSON.stringify({ altId: loc, altType: "location", action: "send_manually", liveMode: true, ...(userId ? { userId } : {}) }) });
  return r.ok;
}
/* text and/or email the customer the pay link from the contractor's own number and address */
async function sendPayLink(t: string, contactId: string, how: "sms" | "email" | "both", text: string, subject: string): Promise<{ sent: boolean; error?: string }> {
  const h = { Authorization: `Bearer ${t}`, Version: "2021-04-15", Accept: "application/json", "Content-Type": "application/json" };
  const out: string[] = []; let ok = false;
  const go = async (body: Record<string, unknown>) => {
    const r = await fetch("https://services.leadconnectorhq.com/conversations/messages", { method: "POST", headers: h, body: JSON.stringify({ contactId, ...body }) });
    if (r.ok) ok = true; else out.push(`${body.type} ${r.status}: ${((await r.json().catch(() => ({}))) as Record<string, string>)?.message ?? ""}`);
  };
  if (how !== "email") await go({ type: "SMS", message: text });
  if (how !== "sms") await go({ type: "Email", subject, html: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>").replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>') });
  return ok ? { sent: true } : { sent: false, error: out.join("; ") };
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

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);


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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const who = await ownerLocation(jwt);
  let loc = who.loc;
  if (!who.id) return json({ ok: false, error: "Sign in to use invoices." }, 401);
  /* a client's invoices only ever go in their own sub-account; never a shared one */
  if (!loc && LOC_FALLBACK && await isHouse(who.id)) loc = LOC_FALLBACK;
  if (!loc) return json({ ok: false, error: "Your account isn't fully set up yet. We'll let you know as soon as invoices are ready." }, 409);
  const t = await token(loc);
  if (!t) return json({ ok: false, error: "no GHL token" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.action === "list") {
    const r = await fetch(`${GHL_BASE}/invoices/?altId=${loc}&altType=location&limit=25&offset=0`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? "list failed" }, 502);
    const items = (d?.invoices ?? []).map((v: Record<string, unknown>) => ({
      id: v._id ?? v.id,
      name: v.name ?? "Invoice",
      total: v.total ?? 0,
      status: v.status ?? "draft",
      contact: (v.contactDetails as Record<string, unknown>)?.name ?? "",
      createdAt: v.createdAt ?? "",
      dueDate: v.dueDate ?? "",
    }));
    return json({ ok: true, items });
  }

  if (b.action === "create") {
    const contactId = String(b.contactId ?? "").trim();
    const amount = Number(b.amount ?? 0);
    const title = String(b.title ?? "Invoice").trim() || "Invoice";
    if (!contactId || !(amount > 0)) return json({ ok: false, error: "contactId and amount required" }, 400);
    const phone = String(b.phone ?? "").trim();
    const email = String(b.email ?? "").trim();
    const desc = String(b.description ?? "").trim();
    const dueDays = Math.max(0, Number(b.dueDays ?? 7));

    const payload = {
      altId: loc, altType: "location",
      name: title,
      businessDetails: { name: String(b.businessName ?? "Your contractor") },
      currency: "USD",
      items: [{ name: title, description: desc || title, currency: "USD", amount, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name: String(b.contactName ?? "Customer"), phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0),
      dueDate: day(dueDays),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    };
    const r = await fetch(`${GHL_BASE}/invoices/`, { method: "POST", headers: ghlH(t), body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? JSON.stringify(d).slice(0, 300) }, 502);
    const invId = d?._id ?? d?.id ?? d?.invoice?._id;
    if (!invId) return json({ ok: false, error: "created but no invoice id returned", raw: d }, 502);

    // tag the contact so workflows can tell deposit vs final without title filters
    try {
      const low = title.toLowerCase();
      if (low.includes("deposit")) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) });
      } else if (low.includes("final")) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "DELETE", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) });
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["final-sent"] }) });
      }
    } catch { /* tagging is best-effort */ }

    // send the customer a BuilderPro pay link (their card goes to the contractor's own Stripe)
    const how = b.send === "email" ? "email" : b.send === "both" ? "both" : "sms";
    const biz = String(b.businessName ?? "Your contractor");
    await markSent(t, loc, String(invId));
    const link = await payLink(loc, String(invId));
    const msg = `${biz}: your invoice "${title}" for $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is ready. Pay securely by card here: ${link}`;
    const sr = await sendPayLink(t, contactId, how, msg, `${biz}: ${title}`);
    const sent = sr.sent, sendErr = sr.error ?? "";
    return json({ ok: true, id: invId, sent, payLink: link, sendError: sendErr || undefined });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
