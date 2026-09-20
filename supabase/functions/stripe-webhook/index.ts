// stripe-webhook — Stripe telling us a card went through on a contractor's
// own connected account.
//
// Handles, for Connect events:
//   checkout.session.completed / payment_intent.succeeded
//        -> log the payment and top up the job's "paid so far", so profit on
//           the job is right without anyone typing it in
//   account.updated
//        -> keep the Payouts page honest about what Stripe will allow
//   account.application.deauthorized
//        -> the contractor unlinked us from inside Stripe; forget the account
//
// Nothing here trusts the request until the signature checks out: anyone can
// POST to this URL, so the body is verified against the signing secret first
// and rejected outright if it does not match.
//
// Deploy:  supabase functions deploy stripe-webhook      (Verify JWT OFF —
//          Stripe does not carry our JWT; the signature is the auth.)
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET  (whsec_… from the
//          endpoint you add in Stripe → Developers → Webhooks, listening to
//          "events on connected accounts")

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WH_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/* ---------- signature ----------
   Stripe signs `${timestamp}.${rawBody}` with the endpoint secret and sends
   it as  t=…,v1=…  . Recompute and compare; anything else is not from Stripe. */
async function verify(raw: string, header: string): Promise<boolean> {
  if (!WH_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=").map((x) => x.trim())) as [string, string][]);
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  // reject replays of an old body
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...sbH, Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/* whose account this event belongs to: the charge says so, otherwise the
   connected account id does */
async function ownerFor(accountId: string, meta: Record<string, string> = {}): Promise<string> {
  if (meta.bp_owner) return meta.bp_owner;
  if (!accountId) return "";
  try {
    const rows = await rest(`stripe_accounts?account_id=eq.${encodeURIComponent(accountId)}&select=owner&limit=1`);
    return rows?.[0]?.owner ?? "";
  } catch { return ""; }
}

/* what Stripe kept, so the contractor sees the real net. Best effort: the
   payment is already recorded whether or not this lookup works. */
async function feeFor(paymentIntent: string, accountId: string): Promise<{ fee: number; net: number }> {
  try {
    const r = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(paymentIntent)}?expand[]=latest_charge.balance_transaction`, {
      headers: { Authorization: `Bearer ${SK}`, "Stripe-Account": accountId },
    });
    if (!r.ok) return { fee: 0, net: 0 };
    const pi = await r.json();
    const bt = pi?.latest_charge?.balance_transaction;
    return { fee: Number(bt?.fee ?? 0) || 0, net: Number(bt?.net ?? 0) || 0 };
  } catch { return { fee: 0, net: 0 }; }
}

/* put the money back on the job, the way a payment recorded by hand would */
async function creditJob(owner: string, jobId: string, dollars: number, name: string) {
  if (!owner || !(dollars > 0)) return;
  try {
    const rows = await rest(`portal_finance?owner=eq.${owner}&select=jobs`);
    const jobs: Record<string, unknown>[] = (rows?.[0]?.jobs ?? []) as Record<string, unknown>[];
    if (!jobs.length) return;
    // the pay link carried the job id; fall back to an active job in that name
    let job = jobId ? jobs.find((j) => String(j.id ?? "") === jobId) : undefined;
    if (!job && name) {
      job = jobs.find((j) => j.status === "active" && String(j.name ?? "").toLowerCase() === name.toLowerCase());
    }
    if (!job) return;
    const prev = Number(job.collected ?? 0) || 0;
    job.collected = Math.round((prev + dollars) * 100) / 100;
    await rest(`portal_finance?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify({ jobs }) });
  } catch { /* the payment log still stands */ }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("stripe-signature") ?? ""))) {
    return json({ ok: false, error: "bad signature" }, 400);
  }

  let ev: Record<string, any> = {};
  try { ev = JSON.parse(raw); } catch { return json({ ok: false, error: "bad body" }, 400); }

  const type = String(ev?.type ?? "");
  const accountId = String(ev?.account ?? "");
  const obj = ev?.data?.object ?? {};

  try {
    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
      const meta = (obj?.metadata ?? {}) as Record<string, string>;
      const owner = await ownerFor(accountId, meta);
      if (!owner) return json({ ok: true, skipped: "unknown account" });

      const isSession = type === "checkout.session.completed";
      const intent = String(isSession ? (obj?.payment_intent ?? "") : (obj?.id ?? ""));
      if (!intent) return json({ ok: true, skipped: "no payment intent" });
      // a Checkout session that has not actually been paid is not money
      if (isSession && obj?.payment_status && obj.payment_status !== "paid") {
        return json({ ok: true, skipped: "session unpaid" });
      }

      const amount = Number(isSession ? (obj?.amount_total ?? 0) : (obj?.amount_received ?? obj?.amount ?? 0)) || 0;
      const { fee, net } = await feeFor(intent, accountId);
      const who = isSession ? (obj?.customer_details ?? {}) : {};
      const name = String(who?.name ?? "");

      await rest("stripe_payments", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          owner, account_id: accountId, payment_intent: intent,
          checkout_session: isSession ? String(obj?.id ?? "") : "",
          amount, fee, net: net || Math.max(0, amount - fee),
          currency: String(obj?.currency ?? "usd"),
          status: "succeeded",
          customer_name: name,
          customer_email: String(who?.email ?? ""),
          description: String(obj?.description ?? "").slice(0, 300),
          invoice_ref: String(meta.bp_invoice ?? ""),
          job_id: meta.bp_job || null,
          paid_at: new Date().toISOString(),
        }),
      });

      await creditJob(owner, String(meta.bp_job ?? ""), amount / 100, name);
      return json({ ok: true, recorded: intent });
    }

    if (type === "account.updated") {
      const owner = await ownerFor(accountId);
      if (!owner) return json({ ok: true, skipped: "unknown account" });
      const due: string[] = [...(obj?.requirements?.currently_due ?? []), ...(obj?.requirements?.past_due ?? [])];
      await rest(`stripe_accounts?owner=eq.${owner}`, {
        method: "PATCH",
        body: JSON.stringify({
          charges_enabled: !!obj?.charges_enabled,
          payouts_enabled: !!obj?.payouts_enabled,
          details_submitted: !!obj?.details_submitted,
          requirements_due: due.slice(0, 12).join(","),
          business_name: obj?.business_profile?.name ?? "",
          country: obj?.country ?? "",
          currency: obj?.default_currency ?? "usd",
          checked_at: new Date().toISOString(),
        }),
      });
      return json({ ok: true, updated: owner });
    }

    if (type === "account.application.deauthorized") {
      const owner = await ownerFor(accountId);
      if (owner) {
        await rest(`stripe_accounts?owner=eq.${owner}`, {
          method: "PATCH",
          body: JSON.stringify({
            account_id: "", charges_enabled: false, payouts_enabled: false,
            details_submitted: false, requirements_due: "", disconnected_at: new Date().toISOString(),
          }),
        });
      }
      return json({ ok: true, disconnected: owner });
    }
  } catch (e) {
    // 500 so Stripe retries rather than dropping a real payment
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }

  return json({ ok: true, ignored: type });
});
