// project-create — called by the GHL "Deposit Paid → Won" workflow (webhook
// action). Creates an Active Project in the portal for the given client, so
// the job appears the moment the deposit is paid.
//
// POST JSON (from GHL custom webhook):
//   { owner_email: "support@builderpro-os.com",   // the client's PORTAL login
//     name: "{{contact.name}}", phone: "{{contact.phone}}",
//     contactId: "{{contact.id}}", estimate: "14200", title?: "Roof replacement" }
//
// Deploy:  supabase functions deploy project-create --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in)
//          PORTAL_OWNER_EMAIL (optional fallback when owner_email not sent)

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FALLBACK_EMAIL = Deno.env.get("PORTAL_OWNER_EMAIL") ?? "";

const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

async function userIdByEmail(email: string): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: sbH });
  if (!r.ok) return "";
  const d = await r.json().catch(() => ({}));
  const users = d?.users ?? (Array.isArray(d) ? d : []);
  const u = users.find((x: Record<string, unknown>) => String(x.email ?? "").toLowerCase() === email.toLowerCase()) ?? users[0];
  return u?.id ?? "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  const email = String(b.owner_email ?? FALLBACK_EMAIL).trim();
  const name = String(b.name ?? "").trim() || "New job";
  if (!email) return json({ ok: false, error: "owner_email required (or set PORTAL_OWNER_EMAIL secret)" }, 400);

  const owner = await userIdByEmail(email);
  if (!owner) return json({ ok: false, error: `no portal user found for ${email}` }, 404);

  // load current jobs
  const rr = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}&select=jobs`, { headers: sbH });
  if (!rr.ok) return json({ ok: false, error: "portal_finance read failed" }, 502);
  const rows = await rr.json();
  const jobs: Record<string, unknown>[] = (rows[0]?.jobs ?? []) as Record<string, unknown>[];

  const contactId = String(b.contactId ?? "").trim() || null;
  // dedupe: same GHL contact already has an active job -> don't double-create
  if (contactId && jobs.some((j) => j.contactId === contactId && j.status === "active")) {
    return json({ ok: true, skipped: "active job already exists for this contact" });
  }

  const estimate = Number(String(b.estimate ?? "").replace(/[^0-9.]/g, "")) || 0;
  jobs.unshift({
    id: "j" + Date.now() + Math.floor(Math.random() * 1000),
    name, phone: String(b.phone ?? "").trim(),
    title: String(b.title ?? "").trim() || "Job",
    estimate, collected: null, status: "active", expenses: [],
    dealId: null, contactId, wonAt: Date.now(), doneAt: null,
    sched: {}, photos: [],
  });

  const up = await fetch(`${SB_URL}/rest/v1/portal_finance`, {
    method: "POST",
    headers: { ...sbH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ owner, jobs }),
  });
  if (!up.ok) {
    // row may exist with fin data; PATCH instead
    const p = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}`, {
      method: "PATCH", headers: sbH, body: JSON.stringify({ jobs }),
    });
    if (!p.ok) return json({ ok: false, error: "portal_finance write failed" }, 502);
  }
  return json({ ok: true, created: name, owner_email: email, jobs_count: jobs.length });
});
