// cc-requests: client requests for the Command Center (an ADMIN_EMAILS login).
//   { op: "list" }        open requests (cancellations, website add-ons, phone numbers,
//                         failed setups...), Enterprise clients first (priority support)
//   { op: "done", id }    mark one handled
// Deploy: --no-verify-jwt (the admin check is below)
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMINS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
const sb = (p: string, i: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${p}`, { ...i, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
async function admin(req: Request) {
  const tok = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!tok || !ADMINS.length) return false;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${tok}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } });
  return r.ok && ADMINS.includes(String((await r.json())?.email ?? "").toLowerCase());
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await admin(req))) return json({ ok: false, error: "not authorized" }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.op === "done") {
    const r = await sb(`support_requests?id=eq.${encodeURIComponent(String(b.id ?? ""))}`, { method: "PATCH", body: JSON.stringify({ status: "done", handled_at: new Date().toISOString() }) });
    return json({ ok: r.ok });
  }
  const rows = await (await sb("support_requests?status=eq.open&select=id,owner,email,kind,subject,body,created_at&order=created_at.desc&limit=100")).json();
  const ids = [...new Set((Array.isArray(rows) ? rows : []).map((x: { owner: string }) => x.owner).filter(Boolean))];
  const accts = ids.length ? await (await sb(`accounts?user_id=in.(${ids.join(",")})&select=user_id,business,plan,status`)).json() : [];
  const by = new Map((Array.isArray(accts) ? accts : []).map((a: { user_id: string }) => [a.user_id, a]));
  // deno-lint-ignore no-explicit-any
  const data = (Array.isArray(rows) ? rows : []).map((x: any) => { const a: any = by.get(x.owner) ?? {}; return { ...x, business: a.business ?? "", plan: a.plan ?? "", priority: a.plan === "enterprise" }; })
    .sort((p, q) => Number(q.priority) - Number(p.priority));
  return json({ ok: true, data });
});
