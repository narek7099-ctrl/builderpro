// project-create — called by the GHL "Deposit Paid → Won" workflow (webhook
// action). Creates an Active Project in the portal for the given client, so
// the job appears the moment the deposit is paid. If the contractor built an
// estimate sheet for this contact in the portal, that sheet becomes the
// project (its order list, budget and price carry over).
//
// POST JSON (from GHL custom webhook; keys may sit under customData):
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
/* GHL_WEBHOOK_SECRET: once set in Supabase, every call must carry it
   (?k=..., an x-webhook-secret header, or "secret" in the workflow's custom
   data). Without it anyone who knows a client's login email could call this. */
const HOOK_SECRET = Deno.env.get("GHL_WEBHOOK_SECRET") ?? "";
function hookOk(req: Request, b: Record<string, unknown>, cd: Record<string, unknown>): boolean {
  if (!HOOK_SECRET) return true;
  let k = ""; try { k = new URL(req.url).searchParams.get("k") ?? ""; } catch { /* no url */ }
  k = k || req.headers.get("x-webhook-secret") || String(cd.secret ?? b.secret ?? "");
  return k === HOOK_SECRET;
}
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function userIdByEmail(email: string): Promise<string> {
  const r = await fetch(`${SB_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: sbH });
  if (!r.ok) return "";
  const d = await r.json().catch(() => ({}));
  const users = d?.users ?? (Array.isArray(d) ? d : []);
  const u = users.find((x: Record<string, unknown>) => String(x.email ?? "").toLowerCase() === email.toLowerCase()) ?? users[0];
  return u?.id ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  // GHL nests webhook custom data under customData — read both layers,
  // plus GHL's standard contact fields as a final fallback.
  const cd = (b.customData ?? b.custom_data ?? {}) as Record<string, unknown>;
  const pick = (k: string) => String(b[k] ?? cd[k] ?? "").trim();
  if (!hookOk(req, b, cd)) return json({ ok: false, error: "unauthorized" }, 401);

  const email = pick("owner_email") || FALLBACK_EMAIL;
  const name = pick("name") || String(b.full_name ?? b.first_name ?? "").trim() || "New job";
  const phone = pick("phone");
  const contactId = pick("contactId") || String(b.contact_id ?? "").trim() || null;

  if (!email) return json({ ok: false, error: "owner_email required (or set PORTAL_OWNER_EMAIL secret)" }, 400);

  const owner = await userIdByEmail(email);
  if (!owner) return json({ ok: false, error: `no portal user found for ${email}` }, 404);

  const rr = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}&select=jobs`, { headers: sbH });
  if (!rr.ok) return json({ ok: false, error: "portal_finance read failed" }, 502);
  const rows = await rr.json();
  const jobs: Record<string, unknown>[] = (rows[0]?.jobs ?? []) as Record<string, unknown>[];

  if (contactId && jobs.some((j) => j.contactId === contactId && j.status === "active")) {
    return json({ ok: true, skipped: "active job already exists for this contact" });
  }

  const estimate = Number(pick("estimate").replace(/[^0-9.]/g, "")) || 0;
  // an estimate sheet built in the portal for this contact becomes the project
  const sheet = contactId ? jobs.find((j) => j.contactId === contactId && j.status === "quote") : undefined;
  if (sheet) {
    sheet.status = "active";
    sheet.wonAt = Date.now();
    if (!(Number(sheet.estimate) > 0) && estimate) sheet.estimate = estimate;
    if (!sheet.name || sheet.name === "New customer") sheet.name = name;
    if (!sheet.phone) sheet.phone = phone;
    sheet.sched = sheet.sched ?? {}; sheet.photos = sheet.photos ?? []; sheet.expenses = sheet.expenses ?? [];
  } else {
    jobs.unshift({
      id: "j" + Date.now() + Math.floor(Math.random() * 1000),
      name, phone,
      title: pick("title") || "Job",
      estimate, collected: null, status: "active", expenses: [],
      dealId: null, contactId, wonAt: Date.now(), doneAt: null,
      sched: {}, photos: [],
    });
  }

  const up = await fetch(`${SB_URL}/rest/v1/portal_finance`, {
    method: "POST",
    headers: { ...sbH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ owner, jobs }),
  });
  if (!up.ok) {
    const p = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}`, {
      method: "PATCH", headers: sbH, body: JSON.stringify({ jobs }),
    });
    if (!p.ok) return json({ ok: false, error: "portal_finance write failed" }, 502);
  }
  return json({ ok: true, created: name, from_estimate: !!sheet, owner_email: email, jobs_count: jobs.length });
});
