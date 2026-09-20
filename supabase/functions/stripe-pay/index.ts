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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let b: {
    op?: string; amount?: number | string; description?: string; invoiceRef?: string;
    jobId?: string; customerName?: string; customerEmail?: string;
  } = {};
  try { b = await req.json(); } catch { /* no body */ }
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
