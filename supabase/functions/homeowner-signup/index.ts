// homeowner-signup — a free BuilderPro account for a homeowner.
//
//   POST { email, password, name, phone? }  -> { ok }   (then the page signs in itself)
//
// Same shape as account-signup for contractors: the user is created with the
// admin API, already confirmed, and marked user_metadata.bp_role = "homeowner"
// so the app sends them to "My projects" (#my) and never into the contractor
// app. No accounts row, no plan, nothing billed. Rate limited per IP.
//
// Deploy:  supabase functions deploy homeowner-signup --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "anon";

async function take(key: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/rate_take`, {
      method: "POST", headers: sbH, body: JSON.stringify({ p_bucket: "homeowner-signup", p_key: key, p_max: 5, p_window_sec: 3600 }),
    });
    return r.ok ? (await r.json()) === true : true;
  } catch { return true; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "Bad request" }, 400); }
  if (b.website) return json({ ok: true }); // honeypot field: bots fill it, people never see it

  const email = clean(b.email, 160).toLowerCase(), password = String(b.password ?? ""), name = clean(b.name, 80), phone = clean(b.phone, 30);
  if (!name) return json({ ok: false, error: "Add your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  if (password.length < 8) return json({ ok: false, error: "Use at least 8 characters for your password." }, 400);
  if (password.length > 72) return json({ ok: false, error: "That password is too long." }, 400);
  if (!(await take(clientIp(req)))) return json({ ok: false, error: "Too many sign-ups from here. Try again in an hour." }, 429);

  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: "POST", headers: sbH,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { bp_role: "homeowner", full_name: name, phone } }),
  });
  if (r.ok) return json({ ok: true });
  const d = await r.json().catch(() => ({}));
  const msg = String(d?.msg ?? d?.message ?? d?.error_description ?? "");
  if (r.status === 422 || /already|registered|exists/i.test(msg)) return json({ ok: false, exists: true, error: "That email already has an account. Sign in instead." }, 409);
  if (/password/i.test(msg)) return json({ ok: false, error: msg.slice(0, 160) }, 400);
  console.error("homeowner-signup", r.status, msg);
  return json({ ok: false, error: "We couldn't create your account. Try again in a minute." }, 500);
});
