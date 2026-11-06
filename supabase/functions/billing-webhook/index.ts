// billing-webhook: Stripe tells us where each BuilderPro subscription stands.
//   checkout.session.completed      -> trial (card on file, 14 days free)
//   customer.subscription.updated   -> trial | active | past_due | cancelled, and cancel_at
//                                      (when a plan set to end will end)
//   customer.subscription.deleted   -> cancelled
//   invoice.payment_failed          -> a "payment_failed" request in the Command Center
//   charge.dispute.created          -> a "dispute" request (answer it in Stripe within the deadline)
//   customer.subscription.trial_will_end -> a "trial_ending" note (Stripe sends this 3 days before)
//
// Stripe dashboard -> Developers -> Webhooks -> Add endpoint:
//   https://<project>.supabase.co/functions/v1/billing-webhook
//   events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted,
//           invoice.payment_failed, charge.dispute.created, customer.subscription.trial_will_end
// Deploy: --no-verify-jwt (Stripe signs the request instead).
// Secrets: STRIPE_BILLING_WEBHOOK_SECRET (whsec_...)
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WH = Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET") ?? "";
const TRIAL_DAYS = Number(Deno.env.get("TRIAL_DAYS") ?? "14");
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });

async function verified(raw: string, header: string): Promise<boolean> {
  if (!WH) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t, sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WH), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((x) => x.toString(16).padStart(2, "0")).join("");
  return sigs.includes(hex);
}
const STATUS: Record<string, string> = { trialing: "trial", active: "active", past_due: "past_due", unpaid: "past_due", incomplete: "checkout", incomplete_expired: "cancelled", canceled: "cancelled", paused: "past_due" };

/* Money problems the owner should see: they land in support_requests, which the
   Command Center's Support/Software Team checks. Matched to the client by their
   Stripe customer id (or the subscription's user_id). Stripe resends events, so
   one request per event id. */
const usd = (c: number) => "$" + ((Number(c) || 0) / 100).toFixed(2);
// deno-lint-ignore no-explicit-any
async function flag(ev: any, o: any) {
  const cust = String(o.customer ?? "");
  let acct: { user_id?: string; email?: string; business?: string } = {};
  if (o.metadata?.user_id) { const r = await sb(`accounts?user_id=eq.${encodeURIComponent(o.metadata.user_id)}&select=user_id,email,business`); acct = (r.ok ? await r.json() : [])[0] ?? {}; }
  if (!acct.user_id && cust) { const r = await sb(`accounts?stripe_customer_id=eq.${encodeURIComponent(cust)}&select=user_id,email,business`); acct = (r.ok ? await r.json() : [])[0] ?? {}; }
  const who = acct.business || acct.email || o.customer_email || cust || "a client";
  const dup = await sb(`support_requests?body=like.*${encodeURIComponent(ev.id)}*&select=id`);
  if (dup.ok && (await dup.json()).length) return;
  let kind = "", subject = "", body = "";
  if (ev.type === "invoice.payment_failed") {
    kind = "payment_failed"; subject = `Card declined: ${who} (${usd(o.amount_due)})`;
    body = `Their payment of ${usd(o.amount_due)} didn't go through (attempt ${o.attempt_count ?? 1}). Stripe retries it automatically and emails them if card emails are on. The app shows them an "update your card" bar. If it keeps failing, reach out before the subscription is cancelled.`;
  } else if (ev.type === "charge.dispute.created") {
    kind = "dispute"; subject = `Chargeback: ${who} disputed ${usd(o.amount)}`;
    body = `Reason: ${o.reason ?? "not given"}. Answer it in the Stripe dashboard (Payments > Disputes) before ${o.evidence_details?.due_by ? new Date(o.evidence_details.due_by * 1000).toISOString().slice(0, 10) : "the deadline"}: send the sign-up date, the trial and billing terms they agreed to, and their usage. Stripe also charges a dispute fee.`;
  } else {
    kind = "trial_ending"; subject = `Trial ends in 3 days: ${who}`;
    body = `Their 14-day trial ends ${o.trial_end ? new Date(o.trial_end * 1000).toISOString().slice(0, 10) : "soon"} and the card on file will be charged. A short check-in now prevents surprise charges and chargebacks.`;
  }
  await sb("support_requests", { method: "POST", body: JSON.stringify({ owner: acct.user_id ?? null, email: acct.email ?? o.customer_email ?? null, kind, subject, body: body + `\n(Stripe event ${ev.id})` }) });
}

/* The first client to check out: remind the owner to move Supabase to Pro (the
   free plan has no restorable backups). Once, ever: ai_config reminder_supabase_pro. */
// deno-lint-ignore no-explicit-any
async function firstClientReminder(o: any) {
  try {
    const r = await sb("ai_config?key=eq.reminder_supabase_pro&select=value");
    if (r.ok && ((await r.json())[0]?.value ?? "") !== "") return;
    await sb("ai_config", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "reminder_supabase_pro", value: new Date().toISOString() }) });
    await sb("support_requests", { method: "POST", body: JSON.stringify({ owner: null, email: o.customer_details?.email ?? o.customer_email ?? null, kind: "reminder",
      subject: "First client signed up: upgrade Supabase to Pro",
      body: "You asked to be reminded when the first client signs up. Upgrade Supabase to Pro ($25/mo) now: the free plan has no backups you can restore, so a mistake or outage could lose client data. Supabase > Organization settings > Billing > Change plan. Then turn on leaked-password protection (Authentication > Passwords)." }) });
  } catch { /* a reminder never blocks billing */ }
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await verified(raw, req.headers.get("stripe-signature") ?? ""))) return new Response("bad signature", { status: 400 });
  const ev = JSON.parse(raw), o = ev.data?.object ?? {};
  const patch = async (uid: string, body: Record<string, unknown>) => { if (uid) await sb(`accounts?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify(body) }); };
  // the $49 AI Team add-on is its own subscription, tagged metadata.kind = ai_addon
  const addon = (o.metadata?.kind ?? "") === "ai_addon";
  if (addon && ev.type === "checkout.session.completed") {
    await patch(o.client_reference_id || o.metadata?.user_id, { ai_addon: "active", ai_addon_sub_id: o.subscription ?? "" });
  } else if (addon && (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted")) {
    const st = ev.type.endsWith("deleted") ? "cancelled" : ({ trialing: "active", active: "active", past_due: "past_due", unpaid: "past_due", canceled: "cancelled", incomplete_expired: "cancelled" } as Record<string, string>)[o.status] ?? o.status;
    await patch(o.metadata?.user_id, { ai_addon: st, ai_addon_sub_id: o.id });
  } else if (ev.type === "checkout.session.completed" && o.mode === "subscription") {
    // the trial clock starts at checkout, not at signup
    await patch(o.client_reference_id || o.metadata?.user_id, { status: "trial", trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(), stripe_subscription_id: o.subscription ?? "", stripe_customer_id: o.customer ?? "", checkout_url: "" });
    await firstClientReminder(o);
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const uid = o.metadata?.user_id;
    const body: Record<string, unknown> = { status: ev.type.endsWith("deleted") ? "cancelled" : (STATUS[o.status] ?? o.status), stripe_subscription_id: o.id };
    if (o.trial_end) body.trial_ends_at = new Date(o.trial_end * 1000).toISOString();
    if (o.metadata?.plan) body.plan = o.metadata.plan;
    // set to end (Cancel in the portal, or in the Stripe dashboard): when; cleared if they keep it
    if (ev.type.endsWith("updated")) { const end = o.cancel_at ?? (o.cancel_at_period_end ? o.current_period_end ?? o.items?.data?.[0]?.current_period_end : null); body.cancel_at = end ? new Date(end * 1000).toISOString() : null; }
    // an AI Team bought with the plan lives and dies with the plan's subscription
    if (String(o.metadata?.addons ?? "").split(",").includes("ai")) body.ai_addon = body.status === "trial" ? "active" : body.status;
    await patch(uid, body);
  } else if (["invoice.payment_failed", "charge.dispute.created", "customer.subscription.trial_will_end"].includes(ev.type)) {
    await flag(ev, o);
  }
  return new Response("ok");
});
