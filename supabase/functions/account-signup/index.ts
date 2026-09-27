// account-signup: self-serve sign-up from signup.html. One call:
//   1) creates the BuilderPro login (confirmed, so they can sign straight in)
//   2) saves the account (plan, price, every onboarding answer) and fills the
//      portal's settings (company, owner, hours) so the software is set up
//   3) starts the GHL build + AI receptionist in the background
//   4) returns a Stripe Checkout link: card now, 14-day trial, then monthly
//
//   POST { plan, name, email, phone, password, business, trade, profile{...}, website? (honeypot) }
//   -> { ok, checkout_url? }   (no checkout_url when STRIPE_SECRET_KEY isn't set: plain trial)
//
// Deploy: --no-verify-jwt (the visitor has no login yet).
// Secrets: STRIPE_SECRET_KEY, GHL_API_KEY, GHL_COMPANY_ID, GHL_SNAPSHOT_ID; SITE_URL (optional)
import { SB_URL, SB_SERVICE, sb, provisionClient } from "./ghl.ts";

export const PLANS: Record<string, { name: string; price: number; minutes: number }> = {
  foundation: { name: "Foundation", price: 99, minutes: 150 },
  os: { name: "BuilderPro OS", price: 199, minutes: 300 },
  enterprise: { name: "Enterprise", price: 299, minutes: 500 },
};
// Add-ons ride on the same subscription as the plan. Enterprise includes the AI Team.
export const ADDONS: Record<string, { name: string; price: number }> = {
  ai: { name: "AI Team", price: 49 },
  website: { name: "Website", price: 49 },
};
type Addons = { ai?: boolean; website?: boolean };
const pickAddons = (plan: string, a: Addons = {}): string[] => Object.keys(ADDONS).filter((k) => a[k as keyof Addons] && !(k === "ai" && plan === "enterprise"));
const TRIAL_DAYS = Number(Deno.env.get("TRIAL_DAYS") ?? "14");
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE = (Deno.env.get("SITE_URL") ?? "https://builderpro-os.com").replace(/\/$/, "");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 120) => String(v ?? "").trim().slice(0, n);

async function stripe(path: string, body?: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body ? new URLSearchParams(body).toString() : undefined });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
  return d;
}
const item = (i: number, name: string, price: number, key: string) => ({
  [`line_items[${i}][quantity]`]: "1", [`line_items[${i}][price_data][currency]`]: "usd",
  [`line_items[${i}][price_data][unit_amount]`]: String(price * 100), [`line_items[${i}][price_data][recurring][interval]`]: "month",
  [`line_items[${i}][price_data][product_data][name]`]: name, [`line_items[${i}][price_data][product_data][metadata][key]`]: key,
});
export async function checkoutFor(uid: string, email: string, business: string, plan: string, customer = "", addons: string[] = []) {
  const p = PLANS[plan];
  if (!customer) customer = (await stripe("/customers", { email, name: business, "metadata[user_id]": uid })).id;
  let lines: Record<string, string> = item(0, `BuilderPro ${p.name}`, p.price, "plan");
  addons.forEach((k, i) => { lines = { ...lines, ...item(i + 1, `BuilderPro ${ADDONS[k].name}`, ADDONS[k].price, k) }; });
  const s = await stripe("/checkout/sessions", {
    mode: "subscription", customer, client_reference_id: uid, ...lines,
    "subscription_data[trial_period_days]": String(TRIAL_DAYS),
    "subscription_data[metadata][user_id]": uid, "subscription_data[metadata][plan]": plan, "subscription_data[metadata][addons]": addons.join(","),
    "metadata[user_id]": uid, "metadata[plan]": plan, "metadata[addons]": addons.join(","),
    payment_method_collection: "always",
    success_url: `${SITE}/signup.html?done=1`,
    cancel_url: `${SITE}/signup.html?step=pay`,
  });
  return { customer, url: s.url as string };
}

// Switch plan or add-ons from the portal. Stripe prorates the difference on the next bill.
// deno-lint-ignore no-explicit-any
async function change(a: any, plan: string, want: Addons) {
  if (!a) return json({ ok: false, error: "No account." }, 400);
  if (!PLANS[plan]) plan = a.plan;
  const cur: Addons = a.profile?.addons ?? {};
  const merged: Addons = { ai: want.ai ?? cur.ai, website: want.website ?? cur.website };
  const addons = pickAddons(plan, merged);
  if (SK && a.stripe_subscription_id) {
    const sub = await stripe(`/subscriptions/${a.stripe_subscription_id}`);
    const items: { id: string; price: { product: string } }[] = sub.items?.data ?? [];
    const keyOf = async (it: { price: { product: string } }) => (await stripe(`/products/${it.price.product}`)).metadata?.key ?? "plan";
    const have: Record<string, string> = {};
    for (const it of items) have[await keyOf(it)] = (it as { id: string }).id;
    const body: Record<string, string> = { proration_behavior: "create_prorations", "metadata[plan]": plan, "metadata[addons]": addons.join(",") };
    let i = 0;
    const put = (key: string, name: string, price: number) => {
      if (have[key]) body[`items[${i}][id]`] = have[key];
      body[`items[${i}][price_data][currency]`] = "usd"; body[`items[${i}][price_data][unit_amount]`] = String(price * 100);
      body[`items[${i}][price_data][recurring][interval]`] = "month";
      i++;
    };
    // price_data on an item needs a product id: make one per key the first time
    const product = async (key: string, name: string) => (await stripe("/products", { name, "metadata[key]": key })).id;
    for (const key of ["plan", ...Object.keys(ADDONS)]) {
      const on = key === "plan" || addons.includes(key);
      const name = key === "plan" ? `BuilderPro ${PLANS[plan].name}` : `BuilderPro ${ADDONS[key].name}`;
      const price = key === "plan" ? PLANS[plan].price : ADDONS[key].price;
      if (on) { put(key, name, price); body[`items[${i - 1}][price_data][product]`] = key === "plan" ? await product("plan", name) : (have[key] ? items.find((x) => x.id === have[key])!.price.product : await product(key, name)); }
      else if (have[key]) { body[`items[${i}][id]`] = have[key]; body[`items[${i}][deleted]`] = "true"; i++; }
    }
    try { await stripe(`/subscriptions/${a.stripe_subscription_id}`, body); }
    catch (e) { return json({ ok: false, error: String(e).replace(/^Error: /, "") }, 400); }
  }
  const price = PLANS[plan].price + addons.reduce((t, k) => t + ADDONS[k].price, 0);
  await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ plan, price_monthly: price,
    profile: { ...(a.profile ?? {}), addons: { ai: addons.includes("ai"), website: addons.includes("website") } },
    ...(addons.includes("ai") ? { ai_addon: "active" } : a.ai_addon === "active" && !a.ai_addon_sub_id ? { ai_addon: "off" } : {}) }) });
  await sb(`radar_seats?email=eq.${encodeURIComponent(a.email)}`, { method: "PATCH", body: JSON.stringify({ per_day: plan === "enterprise" ? 5 : 3 }) }).catch(() => {});
  return json({ ok: true, plan, price, addons });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();

  // a signed-in account that left checkout: hand them a fresh link
  if (b.op === "resume" || b.op === "change") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const u = await (await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } })).json().catch(() => ({}));
    if (!u?.id) return json({ ok: false, error: "Sign in first." }, 401);
    const a = (await (await sb(`accounts?user_id=eq.${u.id}&select=*`)).json())[0];
    if (b.op === "change") return await change(a, clean(b.plan, 20), (b.addons ?? {}) as Addons);
    if (!a || !SK || !PLANS[a.plan]) return json({ ok: false, error: "Nothing to pay for." }, 400);
    const c = await checkoutFor(u.id, a.email, a.business, a.plan, a.stripe_customer_id, pickAddons(a.plan, a.profile?.addons ?? {}));
    await sb(`accounts?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ stripe_customer_id: c.customer, checkout_url: c.url }) });
    return json({ ok: true, checkout_url: c.url });
  }

  const plan = clean(b.plan, 20);
  const name = clean(b.name), business = clean(b.business), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 40), trade = clean(b.trade, 80);
  const password = String(b.password ?? "");
  const pr = (b.profile && typeof b.profile === "object" ? b.profile : {}) as Record<string, unknown>;
  const profile: Record<string, unknown> = {};
  for (const k of ["address", "city", "state", "zip", "website", "license", "serviceArea", "crewSize", "years", "services", "pricing", "emergency",
    "assistantName", "tone", "leadGoal", "faqs", "languages", "notes", "timezone", "referral"]) if (pr[k] != null) profile[k] = clean(pr[k], 2000);
  if (pr.hours && typeof pr.hours === "object") profile.hours = pr.hours;
  const addons = pickAddons(plan, (b.addons ?? {}) as Addons);
  profile.addons = { ai: addons.includes("ai"), website: addons.includes("website") };
  if (clean(b.website)) return json({ ok: true });   // bot filled the hidden field
  if (!PLANS[plan]) return json({ ok: false, error: "Pick a plan." }, 400);
  if (!name || !business) return json({ ok: false, error: "Add your name and business name." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  if (password.length < 8) return json({ ok: false, error: "Use a password of at least 8 characters." }, 400);

  const since = new Date(Date.now() - 3600_000).toISOString();
  const cnt = await sb(`signup_attempts?ip=eq.${encodeURIComponent(ip)}&created_at=gt.${since}&select=id`, { headers: { Prefer: "count=exact" } });
  const total = Number((cnt.headers.get("content-range") ?? "*/0").split("/")[1] || 0);
  if (ip && total >= 5) return json({ ok: false, error: "Too many sign-ups from here. Try again in an hour." }, 429);
  const log = (ok: boolean) => sb("signup_attempts", { method: "POST", body: JSON.stringify({ ip, email, ok }) }).catch(() => {});

  const ur = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name, business, phone, trade, plan } }),
  });
  const ud = await ur.json().catch(() => ({}));
  if (!ur.ok || !ud?.id) {
    await log(false);
    const exists = /already|registered|exists/i.test(JSON.stringify(ud));
    return json({ ok: false, exists, error: exists ? "There's already an account with that email. Sign in instead." : "Couldn't create your account. Try again." }, exists ? 409 : 500);
  }
  const uid = ud.id as string;
  await log(true);

  // Stripe first, so the account row knows where billing stands
  let checkout = { customer: "", url: "" };
  if (SK) { try { checkout = await checkoutFor(uid, email, business, plan, "", addons); } catch (e) { console.error("stripe", e); } }
  await sb("accounts", { method: "POST", body: JSON.stringify({
    user_id: uid, email, full_name: name, business, phone, trade, plan, price_monthly: PLANS[plan].price + addons.reduce((t, k) => t + ADDONS[k].price, 0), profile,
    ai_addon: addons.includes("ai") ? "active" : "off",
    status: checkout.url ? "checkout" : "trial", trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
    stripe_customer_id: checkout.customer, checkout_url: checkout.url }) });

  // the portal's own settings, so Settings, the calendar and the AI page are filled in on first login
  await sb("client_settings?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: uid, email, data: {
      company: { name: business, phone, email, trade, website: profile.website ?? "", license: profile.license ?? "",
        address: [profile.address, profile.city, profile.state, profile.zip].filter(Boolean).join(", "), serviceArea: profile.serviceArea ?? "" },
      owner: { name, phone, email },
      ...(profile.hours ? { hours: profile.hours } : {}),
      plan: { key: plan, name: PLANS[plan].name, price: PLANS[plan].price },
    } }) });

  // GHL + AI receptionist in the background; the command center's onboarding
  // queue retries a failed build and has the Builder team finish the setup
  const work = (async () => {
    const r = await provisionClient({ name, business, email, phone, trade, profile });
    await sb(`accounts?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ ghl_location_id: r.locationId, onboard_state: r.locationId ? "provisioned" : "new", setup_log: r.error ? [...r.steps, "Error: " + r.error] : r.steps }) });
  })().catch(async (e) => { await sb(`accounts?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ setup_log: ["Error: " + String(e).slice(0, 200)] }) }); });
  try { (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work); } catch { await work; }

  return json({ ok: true, trial_days: TRIAL_DAYS, checkout_url: checkout.url || undefined });
});
