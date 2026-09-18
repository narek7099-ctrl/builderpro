// team-invite — the owner adds, changes and removes the people who can sign
// in to their account.
//
//   { op:"list" }                               -> { ok, members:[...] }
//   { op:"invite", email, name, role }          -> { ok, member, emailed }
//   { op:"role",   id, role }                   -> { ok }
//   { op:"remove", id }                         -> { ok }
//   { op:"resend", id }                         -> { ok, emailed }
//
// Only an account owner may call this. A team member calling it is refused,
// whatever their role. Inviting sends Supabase's own invite email, which
// lands the person on a set-your-password screen; if they already have an
// account they simply sign in, and the row is claimed at that moment.
//
// Deploy: supabase functions deploy team-invite

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

type Member = { id: string; owner: string; owner_email: string; member: string | null; email: string; name: string; role: string; invited_at: string; accepted_at: string | null };

async function userFromReq(req: Request): Promise<{ id: string; email: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: String(u.email ?? "") } : null;
}
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const clean = (m: Member) => ({ id: m.id, email: m.email, name: m.name, role: m.role, invited_at: m.invited_at, accepted_at: m.accepted_at, joined: !!m.member });

/* Supabase's own invite: creates the auth user and emails a set-password
   link. An address that already has an account comes back 422; that person
   just signs in, so it is not a failure here. */
async function sendInvite(email: string, name: string, byName: string): Promise<{ emailed: boolean; note: string }> {
  const r = await fetch(`${SB_URL}/auth/v1/invite`, {
    method: "POST", headers: sbH,
    body: JSON.stringify({ email, data: { full_name: name, invited_by: byName }, redirect_to: SITE }),
  });
  if (r.ok) return { emailed: true, note: "" };
  const t = await r.text();
  if (r.status === 422 || /already/i.test(t)) return { emailed: false, note: "already_has_account" };
  return { emailed: false, note: t.slice(0, 160) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "not_configured" }, 500);

  const user = await userFromReq(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  // a team member never manages the team
  const mine = await rest(`team_members?member=eq.${user.id}&accepted_at=not.is.null&select=id&limit=1`);
  if (Array.isArray(mine) && mine.length) return json({ ok: false, error: "owner_only", reason: "Only the account owner can change the team." }, 403);

  let b: { op?: string; email?: string; name?: string; role?: string; id?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }
  const role = b.role === "office" ? "office" : "crew";

  if (b.op === "list") {
    const rows: Member[] = await rest(`team_members?owner=eq.${user.id}&select=*&order=created_at.asc`);
    return json({ ok: true, members: rows.map(clean) });
  }

  if (b.op === "invite") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const name = String(b.name ?? "").trim().slice(0, 80);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: "bad_email", reason: "That does not look like an email address." });
    if (email === user.email.toLowerCase()) return json({ ok: false, error: "self", reason: "That is your own address." });
    const existing: Member[] = await rest(`team_members?owner=eq.${user.id}&email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
    if (existing.length) return json({ ok: false, error: "exists", reason: "They are already on your team." });
    const [row]: Member[] = await rest(`team_members`, {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ owner: user.id, owner_email: user.email, email, name, role }),
    });
    const sent = await sendInvite(email, name, user.email);
    return json({ ok: true, member: clean(row), emailed: sent.emailed, note: sent.note });
  }

  if (b.op === "role" || b.op === "remove" || b.op === "resend") {
    const id = String(b.id ?? "");
    const [row]: Member[] = await rest(`team_members?id=eq.${encodeURIComponent(id)}&owner=eq.${user.id}&select=*&limit=1`);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    if (b.op === "role") {
      await rest(`team_members?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      return json({ ok: true });
    }
    if (b.op === "remove") {
      await rest(`team_members?id=eq.${row.id}`, { method: "DELETE" });
      return json({ ok: true });
    }
    const sent = await sendInvite(row.email, row.name, user.email);
    return json({ ok: true, emailed: sent.emailed, note: sent.note });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
