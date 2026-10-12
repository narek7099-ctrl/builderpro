// account-delete — delete my BuilderPro account, from inside the app.
//
//   POST { confirm: "DELETE" }   with the user's sign-in (Authorization: Bearer <jwt>)
//     -> { ok, done: true }      a homeowner account: deleted now, with its saved
//                                projects and quote requests (they cascade)
//     -> { ok, requested: true } a business or team login: a deletion request is
//                                filed (support_requests, kind account-delete), because the
//                                account carries billing, crews and customer records that are
//                                closed out by hand: confirmed within 2 business days, done
//                                within 30 (privacy policy, data-deletion.html)
//
// Apple requires that an app which lets people create an account also lets
// them start deleting it in the app (App Review 5.1.1(v)).
//
// Deploy:  supabase functions deploy account-delete --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === SB_ANON) return json({ ok: false, error: "Sign in first." }, 401);
  const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON || SB_SERVICE, Authorization: `Bearer ${jwt}` } });
  if (!ur.ok) return json({ ok: false, error: "Sign in again, then try once more." }, 401);
  const user = await ur.json();
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* empty */ }
  if (b.confirm !== "DELETE") return json({ ok: false, error: "Confirm first." }, 400);

  const homeowner = user?.user_metadata?.bp_role === "homeowner";
  const [acct, team] = await Promise.all([
    rest(`accounts?user_id=eq.${user.id}&select=user_id&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
    rest(`team_members?member=eq.${user.id}&select=id&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
  ]);

  if (homeowner && !acct.length && !team.length) {
    const d = await fetch(`${SB_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: sbH });
    if (!d.ok) {
      console.error("account-delete", d.status, (await d.text()).slice(0, 200));
      return json({ ok: false, error: "We couldn't delete it just now. Try again, or email privacy@builderpro-os.com." }, 500);
    }
    return json({ ok: true, done: true });
  }

  // a business or team login: file the request (once)
  const open = await rest(`support_requests?owner=eq.${user.id}&kind=eq.account-delete&status=eq.open&select=id&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []);
  if (!open.length) {
    const r = await rest("support_requests", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        owner: user.id, email: user.email ?? "", kind: "account-delete", status: "open",
        subject: "Delete my account (requested in the app)",
        body: `${acct.length ? "Business owner account" : team.length ? "Team member login" : "Login"} ${user.email ?? ""} asked to delete their account and data. Cancel billing first if there is a subscription.`,
      }),
    });
    if (!r.ok) {
      console.error("account-delete request", r.status, (await r.text()).slice(0, 200));
      return json({ ok: false, error: "We couldn't file that just now. Email privacy@builderpro-os.com with the subject Delete my data." }, 500);
    }
  }
  return json({ ok: true, requested: true });
});
