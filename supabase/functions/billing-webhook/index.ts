// billing-webhook: Stripe tells us where each BuilderPro subscription stands.
//   checkout.session.completed      -> trial (card on file, 14 days free)
//   customer.subscription.updated   -> trial | active | past_due | cancelled
//   customer.subscription.deleted   -> cancelled
//
// Stripe dashboard -> Developers -> Webhooks -> Add endpoint:
//   https://<project>.supabase.co/functions/v1/billing-webhook
//   events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
// Deploy: --no-verify-jwt (Stripe signs the request instead).
// Secrets: STRIPE_BILLING_WEBHOOK_SECRET (whsec_...)
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WH = Deno.env.get("STRIPE_BILLING_WEBHOOK_SECRET") ?? "";
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
    await patch(o.client_reference_id || o.metadata?.user_id, { status: "trial", stripe_subscription_id: o.subscription ?? "", stripe_customer_id: o.customer ?? "", checkout_url: "" });
  } else if (ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const uid = o.metadata?.user_id;
    const body: Record<string, unknown> = { status: ev.type.endsWith("deleted") ? "cancelled" : (STATUS[o.status] ?? o.status), stripe_subscription_id: o.id };
    if (o.trial_end) body.trial_ends_at = new Date(o.trial_end * 1000).toISOString();
    if (o.metadata?.plan) body.plan = o.metadata.plan;
    // an AI Team bought with the plan lives and dies with the plan's subscription
    if (String(o.metadata?.addons ?? "").split(",").includes("ai")) body.ai_addon = body.status === "trial" ? "active" : body.status;
    await patch(uid, body);
  }
  return new Response("ok");
});
