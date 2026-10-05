// IN USE (payments bridge). Customers pay invoices here, on the contractor's
// own Stripe connected in BuilderPro; stripe-webhook then marks the HighLevel
// invoice paid so the "Invoice Paid" workflows run.
//
//   POST { op:"invoice", l, i, s }   (no login: the link is signed)
//     -> { ok:true, url }  Stripe Checkout for what is still owed on HighLevel
//        invoice i in sub-account l. s = the server's signature of "l.i", so a
//        link can't be edited to point at another invoice.
//     -> { ok:false, paid:true } already paid
//
// stripe-pay — turns an invoice into a card payment link on the contractor's
// OWN Stripe account.
//
//   POST { op:"checkout", amount, description?, invoiceRef?, jobId?,
//          customerName?, customerEmail? }
//     -> { ok:true, url }                    send this to the homeowner
//     -> { ok:false, reason:"not_connected" } no Stripe linked yet
//     -> { ok:false, reason:"not_ready", due } linked but Stripe still wants details
//
// The charge is created ON the connected account (a direct charge), with no
// application fee, so the money settles to the contractor's bank and we take
// nothing. The account id is read from their row here on the server, so a
// caller can never aim a charge at somebody else's account.
//
// Deploy:  supabase functions deploy stripe-pay
// Secrets: STRIPE_SECRET_KEY, PORTAL_RETURN_URL

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const RETURN_URL = Deno.env.get("PORTAL_RETURN_URL") || "https://builderpro-os.com/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

async function userFromJwt(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}
/* the office raises invoices on the owner's account, so map a team member to
   the owner whose Stripe the money should land in */
async function effectiveOwner(id: string): Promise<string> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    if (rows?.[0]?.owner) return rows[0].owner;
  } catch { /* fall through to themselves */ }
  return id;
}


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

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* a customer opening a pay link: the invoice's open balance, paid on the contractor's Stripe */
async function invoiceCheckout(b: Record<string, string>): Promise<Response> {
  const loc = String(b.l ?? ""), inv = String(b.i ?? ""), sig = String(b.s ?? "");
  if (!/^[A-Za-z0-9]{6,40}$/.test(loc) || !/^[A-Za-z0-9_-]{6,60}$/.test(inv)) return json({ ok: false, error: "This payment link isn't valid." }, 400);
  const want = await paySig(loc, inv);
  if (sig.length !== want.length || [...want].reduce((d, ch, k) => d | (ch.charCodeAt(0) ^ sig.charCodeAt(k)), 0) !== 0) return json({ ok: false, error: "This payment link isn't valid." }, 400);
  const t = await savedKey(loc) || Deno.env.get("GHL_TOKEN_" + loc) || Deno.env.get("GHL_TOKEN") || "";
  if (!t) return json({ ok: false, error: "Online payment isn't set up yet. Contact your contractor to pay." });
  const r = await fetch(`https://services.leadconnectorhq.com/invoices/${inv}?altId=${loc}&altType=location`, { headers: { Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json" } });
  const v = r.ok ? await r.json().catch(() => ({})) : {};
  if (!r.ok || !v) return json({ ok: false, error: "This invoice couldn't be found. Contact your contractor." });
  const st = String(v.status ?? "").toLowerCase();
  const due = Number(v.amountDue ?? (Number(v.total ?? 0) - Number(v.amountPaid ?? 0))) || 0;
  if (st === "paid" || due <= 0) return json({ ok: false, paid: true, error: "This invoice is already paid. Thank you!" });
  if (st === "void") return json({ ok: false, error: "This invoice was cancelled. Contact your contractor." });
  /* whose Stripe: the BuilderPro account that owns this sub-account */
  const own = async (q: string) => { const x = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: sbH }); return x.ok ? (await x.json())?.[0] : null; };
  const owner = (await own(`accounts?ghl_location_id=eq.${loc}&select=user_id&limit=1`))?.user_id
    || (await own(`ai_brain?ghl_location_id=eq.${loc}&select=owner&limit=1`))?.owner || "";
  const row = owner ? await own(`stripe_accounts?owner=eq.${owner}&select=account_id,charges_enabled,currency&limit=1`) : null;
  if (!row?.account_id || !row?.charges_enabled) return json({ ok: false, error: "Online payment isn't set up yet. Contact your contractor to pay." });
  const cents = Math.round(due * 100), cd = (v.contactDetails ?? {}) as Record<string, string>;
  const label = `${String(v.name ?? "Invoice")}${v.invoiceNumber ? " #" + v.invoiceNumber : ""}`.slice(0, 250);
  const md = { bp_owner: owner, bp_ghl_invoice: inv, bp_ghl_loc: loc, bp_invoice: String(v.invoiceNumber ?? inv).slice(0, 80), bp_job: "" };
  const body: Record<string, string> = {
    mode: "payment", "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": String(row.currency || v.currency || "usd").toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": label,
    success_url: `${RETURN_URL}#pay=done`, cancel_url: `${RETURN_URL}#pay=${loc}.${inv}.${sig}`,
  };
  Object.entries(md).forEach(([k, x]) => { body[`metadata[${k}]`] = x; body[`payment_intent_data[metadata][${k}]`] = x; });
  if (cd.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cd.email)) body.customer_email = cd.email;
  body["payment_intent_data[description]"] = `${label}${cd.name ? " — " + cd.name : ""}`.slice(0, 200);
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST",
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Account": row.account_id }, body: new URLSearchParams(body).toString() });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, error: "Payment couldn't start. Try again in a minute." });
  return json({ ok: true, url: out.url, amount: money(due), label, business: String((v.businessDetails ?? {}).name ?? "") });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let b: {
    op?: string; amount?: number | string; description?: string; invoiceRef?: string;
    jobId?: string; customerName?: string; customerEmail?: string;
  } = {};
  try { b = await req.json(); } catch { /* no body */ }
  if (b.op === "invoice") return SK ? await invoiceCheckout(b as unknown as Record<string, string>) : json({ ok: false, error: "Online payment isn't set up yet. Contact your contractor to pay." });
  if (b.op !== "checkout") return json({ ok: false, error: "op: checkout" }, 400);
  if (!SK) return json({ ok: false, reason: "not_configured" });

  const caller = await userFromJwt(req);
  if (!caller) return json({ ok: false, error: "sign in required" }, 401);
  const owner = await effectiveOwner(caller.id);

  /* whose account, decided here and not by the caller */
  const r = await fetch(`${SB_URL}/rest/v1/stripe_accounts?owner=eq.${owner}&select=account_id,charges_enabled,requirements_due,currency&limit=1`, { headers: sbH });
  const row = r.ok ? (await r.json())?.[0] : null;
  const accountId = String(row?.account_id ?? "");
  if (!accountId) return json({ ok: false, reason: "not_connected" });
  if (!row?.charges_enabled) {
    return json({ ok: false, reason: "not_ready", due: String(row?.requirements_due ?? "").split(",").filter(Boolean) });
  }

  /* amount arrives in dollars, Stripe wants whole cents, and a typo should
     not quietly become a charge */
  const dollars = Number(String(b.amount ?? "").replace(/[$,\s]/g, ""));
  const cents = Math.round(dollars * 100);
  if (!Number.isFinite(cents) || cents < 50 || cents > 99_999_999) {
    return json({ ok: false, error: "amount must be between $0.50 and $999,999" }, 400);
  }

  const label = (b.description || "").trim() || (b.invoiceRef ? `Invoice ${b.invoiceRef}` : "Payment");
  const body: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": String(row?.currency || "usd"),
    "line_items[0][price_data][unit_amount]": String(cents),
    "line_items[0][price_data][product_data][name]": label.slice(0, 250),
    success_url: `${RETURN_URL}#payouts=paid`,
    cancel_url: `${RETURN_URL}#payouts=cancelled`,
    // so the webhook can put the payment back on the right job
    "metadata[bp_owner]": owner,
    "metadata[bp_invoice]": String(b.invoiceRef ?? "").slice(0, 80),
    "metadata[bp_job]": String(b.jobId ?? "").slice(0, 64),
    "payment_intent_data[metadata][bp_owner]": owner,
    "payment_intent_data[metadata][bp_invoice]": String(b.invoiceRef ?? "").slice(0, 80),
    "payment_intent_data[metadata][bp_job]": String(b.jobId ?? "").slice(0, 64),
  };
  if (b.customerEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.customerEmail)) body.customer_email = b.customerEmail;
  if (b.customerName) body["payment_intent_data[description]"] = `${label} — ${b.customerName}`.slice(0, 200);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // the charge belongs to the contractor's account, not ours
      "Stripe-Account": accountId,
    },
    body: new URLSearchParams(body).toString(),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ ok: false, reason: "stripe", detail: out?.error?.message ?? `stripe ${res.status}` });

  return json({ ok: true, url: out?.url ?? "", id: out?.id ?? "", amount: cents });
});
