// phone-admin — the Agency Command Center's "Phone numbers" tab.
//
//   POST { op: "list" }                          -> every client that has started the Business number step
//   POST { op: "set", user_id, status }          -> status: "pending" | "live" | "none"
//
// Admin only: the caller's Supabase login must be in ADMIN_EMAILS (the same
// secret the agency function uses). A client's texting banner and Settings
// read data.phone.status from client_settings, so "live" switches them on.
//
// Deploy: supabase functions deploy phone-admin --no-verify-jwt   (the admin check is below)

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const H = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

async function admin(req: Request): Promise<string> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !ADMIN_EMAILS.length) return "";
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON } });
  if (!r.ok) return "";
  const email = String((await r.json())?.email ?? "").toLowerCase();
  return ADMIN_EMAILS.includes(email) ? email : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await admin(req);
  if (!who) return json({ ok: false, error: "not authorized" }, 403);
  let b: { op?: string; user_id?: string; status?: string } = {};
  try { b = await req.json(); } catch { /* none */ }

  if (b.op === "list") {
    const r = await fetch(`${SB_URL}/rest/v1/client_settings?select=user_id,email,data,updated_at&data->phone=not.is.null&order=updated_at.desc`, { headers: H });
    const rows = (r.ok ? await r.json() : []) as { user_id: string; email: string; data: Record<string, any>; updated_at: string }[];
    return json({ ok: true, data: rows.map((x) => ({
      user_id: x.user_id, email: x.email, business: x.data?.company?.name ?? "",
      number: x.data?.phone?.number ?? x.data?.company?.phone ?? "", type: x.data?.phone?.type ?? "", path: x.data?.phone?.path ?? "",
      legal: x.data?.phone?.legal ?? "", status: x.data?.phone?.status ?? "", requestedAt: x.data?.phone?.requestedAt ?? "", liveAt: x.data?.phone?.liveAt ?? "",
    })) });
  }

  if (b.op === "set") {
    const status = b.status === "live" || b.status === "pending" ? b.status : "none";
    if (!b.user_id) return json({ ok: false, error: "user_id required" }, 400);
    const g = await fetch(`${SB_URL}/rest/v1/client_settings?user_id=eq.${encodeURIComponent(b.user_id)}&select=data`, { headers: H });
    const row = (g.ok ? await g.json() : [])[0];
    if (!row) return json({ ok: false, error: "client not found" }, 404);
    const data = row.data ?? {};
    data.phone = { ...(data.phone ?? {}), status: status === "none" ? "" : status, ...(status === "live" ? { liveAt: new Date().toISOString() } : {}) };
    const p = await fetch(`${SB_URL}/rest/v1/client_settings?user_id=eq.${encodeURIComponent(b.user_id)}`, {
      method: "PATCH", headers: H, body: JSON.stringify({ data, updated_at: new Date().toISOString() }) });
    fetch(`${SB_URL}/rest/v1/audit_log`, { method: "POST", headers: H, body: JSON.stringify({ actor: who, op: "phone.set", args: { user_id: b.user_id, status }, ok: p.ok, status: p.status }) }).catch(() => {});
    return json({ ok: p.ok });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
