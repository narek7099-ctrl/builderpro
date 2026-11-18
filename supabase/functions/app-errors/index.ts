// app-errors — the Command Center's "App errors" tab.
//
//   POST { op: "list", status?: "open"|"fixed"|"ignored"|"all", area?: "app"|"site" }
//        -> the errors people's devices reported (portal/errors.js), newest first, 200 at most
//   POST { op: "set", id, status: "open"|"fixed"|"ignored", note? }
//        -> "fixed" remembers the app version it was fixed in; if the same error comes back
//           from a newer version it opens again by itself (see bp_report_error)
//   POST { op: "count" } -> how many are open (for the tab's badge)
//
// Admin only: the caller's Supabase login must be in ADMIN_EMAILS (the same secret the
// command and phone-admin functions use). The table (public.client_errors) has row level
// security with no policies, so only this function's service role can read it.
//
// Deploy: supabase functions deploy app-errors --no-verify-jwt   (the admin check is below)

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

const COLS = "id,kind,area,message,source,stack,view,path,app_ver,ua,online,count,users,anon,first_at,last_at,status,status_at,fixed_ver,back_at,note";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const who = await admin(req);
  if (!who) return json({ ok: false, error: "not authorized" }, 403);
  let b: { op?: string; id?: number; status?: string; area?: string; note?: string; ver?: string } = {};
  try { b = await req.json(); } catch { /* none */ }

  if (b.op === "count") {
    const r = await fetch(`${SB_URL}/rest/v1/client_errors?select=id&status=eq.open`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    const n = Number((r.headers.get("content-range") ?? "").split("/")[1] ?? 0) || 0;
    return json({ ok: true, open: n });
  }

  if (b.op === "list") {
    const st = ["open", "fixed", "ignored"].includes(String(b.status)) ? `&status=eq.${b.status}` : "";
    const ar = b.area === "app" || b.area === "site" ? `&area=eq.${b.area}` : "";
    const r = await fetch(`${SB_URL}/rest/v1/client_errors?select=${COLS}${st}${ar}&order=last_at.desc&limit=200`, { headers: H });
    if (!r.ok) return json({ ok: false, error: "could not read errors" }, 500);
    const rows = (await r.json()) as Record<string, unknown>[];
    // the people who hit it are counted, never named here
    return json({ ok: true, data: rows.map((x) => ({ ...x, users: Array.isArray(x.users) ? (x.users as unknown[]).length : 0 })) });
  }

  if (b.op === "set") {
    const id = Number(b.id);
    const status = ["open", "fixed", "ignored"].includes(String(b.status)) ? String(b.status) : "";
    if (!id || !status) return json({ ok: false, error: "id and status required" }, 400);
    const g = await fetch(`${SB_URL}/rest/v1/client_errors?id=eq.${id}&select=app_ver`, { headers: H });
    const row = (g.ok ? await g.json() : [])[0];
    if (!row) return json({ ok: false, error: "not found" }, 404);
    const patch: Record<string, unknown> = { status, status_at: new Date().toISOString() };
    // fixed in the version after the one it was last seen in: a report from that
    // version or older is a phone that hasn't updated yet, not the error coming back
    if (status === "fixed") patch.fixed_ver = String(b.ver || row.app_ver || "").slice(0, 24) || null;
    if (status === "open") patch.back_at = null;
    if (typeof b.note === "string") patch.note = b.note.slice(0, 500);
    const p = await fetch(`${SB_URL}/rest/v1/client_errors?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(patch) });
    fetch(`${SB_URL}/rest/v1/audit_log`, { method: "POST", headers: H, body: JSON.stringify({ actor: who, op: "app_error.set", args: { id, status }, ok: p.ok, status: p.status }) }).catch(() => {});
    return json({ ok: p.ok });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
