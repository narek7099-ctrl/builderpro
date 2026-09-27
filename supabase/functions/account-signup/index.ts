// account-signup — self-serve sign-up from the website: a free trial, made
// instantly. One call creates the BuilderPro login, the GHL sub-account from
// the snapshot (with the business filled in and a GHL login), the AI
// receptionist, and the account row the command center lists.
//
//   POST { name, business, email, phone, trade, password, website? }
//        website is a honeypot field: real people leave it empty.
//
// Deploy: --no-verify-jwt (the visitor has no login yet).
// Secrets: GHL_API_KEY, GHL_COMPANY_ID, GHL_SNAPSHOT_ID (the template every new client gets)
import { SB_URL, SB_SERVICE, sb, provisionClient } from "./ghl.ts";

const TRIAL_DAYS = Number(Deno.env.get("TRIAL_DAYS") ?? "14");
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (v: unknown, n = 120) => String(v ?? "").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "Bad request." }, 400); }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const name = clean(b.name), business = clean(b.business), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 40), trade = clean(b.trade, 300);
  const password = String(b.password ?? "");
  if (clean(b.website)) return json({ ok: true });   // bot filled the hidden field
  if (!name || !business) return json({ ok: false, error: "Add your name and business name." }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  if (password.length < 8) return json({ ok: false, error: "Use a password of at least 8 characters." }, 400);

  // five tries an hour from one address
  const since = new Date(Date.now() - 3600_000).toISOString();
  const cnt = await sb(`signup_attempts?ip=eq.${encodeURIComponent(ip)}&created_at=gt.${since}&select=id`, { headers: { Prefer: "count=exact" } });
  const total = Number((cnt.headers.get("content-range") ?? "*/0").split("/")[1] || 0);
  if (ip && total >= 5) return json({ ok: false, error: "Too many sign-ups from here. Try again in an hour." }, 429);
  const log = (ok: boolean) => sb("signup_attempts", { method: "POST", body: JSON.stringify({ ip, email, ok }) }).catch(() => {});

  // 1) the login
  const ur = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name, business, phone, trade } }),
  });
  const ud = await ur.json().catch(() => ({}));
  if (!ur.ok || !ud?.id) {
    await log(false);
    const exists = /already|registered|exists/i.test(JSON.stringify(ud));
    return json({ ok: false, exists, error: exists ? "There's already an account with that email. Sign in instead." : "Couldn't create your account. Try again." }, exists ? 409 : 500);
  }
  const uid = ud.id as string;
  await log(true);
  await sb("accounts", { method: "POST", body: JSON.stringify({ user_id: uid, email, full_name: name, business, phone, trade, trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString() }) });
  await sb("client_settings?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: uid, email, data: { company: { name: business, phone, email, trade }, owner: { name, phone, email } } }) });

  // 2) GHL + AI receptionist, in the background so the visitor isn't kept waiting
  const work = (async () => {
    const r = await provisionClient({ name, business, email, phone, trade });
    await sb(`accounts?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ ghl_location_id: r.locationId, setup_log: r.error ? [...r.steps, "Error: " + r.error] : r.steps }) });
  })().catch(async (e) => { await sb(`accounts?user_id=eq.${uid}`, { method: "PATCH", body: JSON.stringify({ setup_log: ["Error: " + String(e).slice(0, 200)] }) }); });
  try { (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work); } catch { await work; }

  return json({ ok: true, trial_days: TRIAL_DAYS });
});
