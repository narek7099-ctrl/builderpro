// test-login: one-click sign-in to BuilderPro's own TEST accounts, so the
// browser tester never types a password. GET ?key=<ai_config.test_login_key>&who=<name>
// redirects to a one-time sign-in link for that test account and signs in on
// builderpro-os.com. Only the accounts listed below; anything else is refused.
// Turn it off by clearing ai_config.test_login_key.
// Deploy: --no-verify-jwt (the key check is below)
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = (Deno.env.get("SITE_URL") ?? "https://builderpro-os.com").replace(/\/$/, "");
const TEST: Record<string, string> = {
  plan99: "narek7099+plan99@gmail.com", plan199: "narek7099+plan199@gmail.com", plan299: "narek7099+plan299@gmail.com",
  owner: "narek7099+owner@gmail.com", crew: "narek7099+crew@gmail.com", sub: "narek7099+sub@gmail.com",
  homeowner: "narek7099+homeowner@gmail.com", az2: "narek7099+az2@gmail.com",
};
const H = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const page = (t: string, s = 400) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><p style="font:16px system-ui;padding:24px">${t}</p>`, { status: s, headers: { "Content-Type": "text/html; charset=utf-8" } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const key = u.searchParams.get("key") ?? "", who = (u.searchParams.get("who") ?? "").toLowerCase();
  const c = await fetch(`${SB_URL}/rest/v1/ai_config?key=eq.test_login_key&select=value`, { headers: H });
  const want = c.ok ? ((await c.json())[0]?.value ?? "") : "";
  if (!want || key !== want) return page("Not allowed.", 403);
  const email = TEST[who];
  if (!email) return page("Pick one of: " + Object.keys(TEST).join(", "));
  // make a one-time link, redeem it here, and hand the session to the site in the
  // URL hash (supabase-js picks it up); no "set a password" step, no email sent
  const r = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", email }) });
  const d = await r.json().catch(() => ({}));
  const hashed = d?.hashed_token ?? d?.properties?.hashed_token;
  if (!r.ok || !hashed) return page("Couldn't make the sign-in link: " + JSON.stringify(d).slice(0, 200), 500);
  const v = await fetch(`${SB_URL}/auth/v1/verify`, { method: "POST", headers: H, body: JSON.stringify({ type: "magiclink", token_hash: hashed }) });
  const s = await v.json().catch(() => ({}));
  if (!v.ok || !s?.access_token) return page("Couldn't sign in: " + JSON.stringify(s).slice(0, 200), 500);
  const frag = new URLSearchParams({ access_token: s.access_token, refresh_token: s.refresh_token, expires_in: String(s.expires_in ?? 3600), expires_at: String(s.expires_at ?? ""), token_type: "bearer" });
  return Response.redirect(`${SITE}/index.html?portal=1#${frag}`, 302);
});
