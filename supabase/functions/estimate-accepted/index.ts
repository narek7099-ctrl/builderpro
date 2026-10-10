// estimate-accepted — called by the OS/Enterprise GHL workflow "08 Estimate
// Accepted - Deposit" (custom webhook action) the moment a customer accepts an
// estimate. Sends the customer the deposit invoice automatically:
//   deposit = Deposit Percent custom value (default 30) x the accepted estimate's total.
// The contact is tagged deposit-sent, so "10 Invoice Paid" knows the next
// payment is the deposit.
//
// POST JSON (from the GHL webhook):
//   { locationId: "{{location.id}}", contactId: "{{contact.id}}" }
//
// Safe to call twice: a contact already tagged deposit-sent (or deposit-paid)
// is skipped, and only an estimate that really is accepted in that location is used.
//
// Deploy:  supabase functions deploy estimate-accepted --no-verify-jwt
// Keys: the client's own key in ghl_keys (Command Center), else GHL_API_KEY + GHL_COMPANY_ID (agency key, mints the location token)

const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const DEFAULT_PCT = 30;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);


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

async function locationToken(loc: string): Promise<string> {
  const own = await savedKey(loc); if (own) return own;
  if (!GHL_API_KEY || !GHL_COMPANY_ID) return "";
  try {
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(),
    });
    if (r.ok) { const d = await r.json(); return d?.access_token ?? ""; }
  } catch { /* fall through */ }
  return "";
}

// the location's "Deposit Percent" custom value (1-100), else the default
async function depositPct(loc: string, t: string): Promise<number> {
  try {
    const r = await fetch(`${GHL_BASE}/locations/${loc}/customValues`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    const cv = (d?.customValues ?? []).find((v: Record<string, unknown>) => /deposit.?percent/i.test(String(v.name ?? "")));
    const n = Number(String(cv?.value ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0 && n <= 100) return n;
  } catch { /* default */ }
  return DEFAULT_PCT;
}

/* GHL_WEBHOOK_SECRET: once set in Supabase, every call must carry it
   (?k=..., an x-webhook-secret header, or "secret" in the workflow's custom
   data). Without it anyone who knows a client's login email could call this. */
const HOOK_SECRET = Deno.env.get("GHL_WEBHOOK_SECRET") ?? "";
function hookOk(req: Request, b: Record<string, unknown>, cd: Record<string, unknown>): boolean {
  if (!HOOK_SECRET) return true;
  let k = ""; try { k = new URL(req.url).searchParams.get("k") ?? ""; } catch { /* no url */ }
  k = k || req.headers.get("x-webhook-secret") || String(cd.secret ?? b.secret ?? "");
  return k === HOOK_SECRET;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  // GHL's standard Webhook action nests our keys under customData
  const cd = (b.customData ?? {}) as Record<string, unknown>;
  if (!hookOk(req, b, cd)) return json({ ok: false, error: "unauthorized" }, 401);
  const loc = String(b.locationId ?? cd.locationId ?? (b.location as Record<string, unknown>)?.id ?? "").trim();
  const contactId = String(b.contactId ?? cd.contactId ?? b.contact_id ?? "").trim();
  if (!loc || !contactId) return json({ ok: false, error: "locationId and contactId required" }, 400);

  const t = await locationToken(loc);
  if (!t) return json({ ok: false, error: "no token for this location" }, 403);

  // the contact (also proves it lives in this location)
  const rc = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlH(t) });
  if (!rc.ok) return json({ ok: false, error: "contact not found in this location" }, 404);
  const c = (await rc.json().catch(() => ({})))?.contact ?? {};
  const tags: string[] = (c.tags ?? []).map((x: string) => String(x).toLowerCase());
  if (tags.includes("deposit-sent") || tags.includes("deposit-paid")) return json({ ok: true, skipped: "deposit already sent" });

  // newest accepted estimate for this contact
  const re = await fetch(`${GHL_BASE}/invoices/estimate/list?altId=${loc}&altType=location&limit=50&offset=0`, { headers: ghlH(t) });
  const de = await re.json().catch(() => ({}));
  if (!re.ok) return json({ ok: false, error: de?.message ?? "estimate list failed" }, 502);
  const est = (de?.estimates ?? de?.data ?? [])
    .filter((v: Record<string, unknown>) => String(v.status ?? "").toLowerCase() === "accepted"
      && String((v.contactDetails as Record<string, unknown>)?.id ?? v.contactId ?? "") === contactId)
    .sort((a: Record<string, unknown>, z: Record<string, unknown>) => String(z.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
  if (!est) return json({ ok: false, error: "no accepted estimate for this contact" }, 404);
  const total = Number(est.total ?? est.amountDue ?? 0);
  if (!(total > 0)) return json({ ok: false, error: "estimate total is 0" }, 422);

  const pct = await depositPct(loc, t);
  const amount = Math.round(total * pct) / 100;
  const title = `Deposit — ${String(est.name ?? "your project")}`;
  const phone = String(c.phone ?? "").trim(), email = String(c.email ?? "").trim();
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || String(c.contactName ?? "Customer");
  const biz = (est.businessDetails as Record<string, unknown>) ?? {};

  const ri = await fetch(`${GHL_BASE}/invoices/`, {
    method: "POST", headers: ghlH(t),
    body: JSON.stringify({
      altId: loc, altType: "location", name: title,
      businessDetails: { name: String(biz.name ?? "Your contractor"), ...(biz.phoneNo ? { phoneNo: biz.phoneNo } : {}), ...(biz.address ? { address: biz.address } : {}) },
      currency: String(est.currency ?? "USD"),
      items: [{ name: title, description: `${pct}% deposit on your accepted estimate ${String(est.estimateNumber ?? "")}`.trim(), currency: String(est.currency ?? "USD"), amount, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name, phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0), dueDate: day(7),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    }),
  });
  const di = await ri.json().catch(() => ({}));
  const invId = di?._id ?? di?.id ?? di?.invoice?._id;
  if (!ri.ok || !invId) return json({ ok: false, error: di?.message ?? "invoice create failed" }, 502);

  await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) }).catch(() => {});

  /* the deposit is paid through BuilderPro (the contractor's own Stripe); paying it marks this invoice paid */
  await markSent(t, loc, String(invId));
  const link = await payLink(loc, String(invId)), bname = String(biz.name ?? "Your contractor");
  const how = phone && email ? "both" : email ? "email" : "sms";
  const sr = await sendPayLink(t, contactId, how,
    `${bname}: thanks for accepting your estimate! Your ${pct}% deposit of $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is ready. Pay securely by card here: ${link}`,
    `${bname}: your deposit invoice`);
  return json({ ok: true, id: invId, amount, pct, sent: sr.sent, sendError: sr.error });
});
