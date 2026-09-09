// payment-sync — called by the GHL "Invoice Paid" workflow (webhook action).
// Updates the matching portal job's "Paid so far" so profits stay live:
//   deposit → adds the payment to collected
//   final   → tops collected up to at least the estimate (fully collected)
//
// POST JSON (from GHL custom webhook; customData nesting handled):
//   { owner_email?: "client portal login",       // falls back to PORTAL_OWNER_EMAIL
//     contactId: "{{contact.id}}", name: "{{contact.name}}", phone: "{{contact.phone}}",
//     kind: "deposit" | "final",
//     amount: "1500" }                            // payment amount (required for deposit)
//
// Deploy:  create edge function `payment-sync`, paste this, Verify JWT OFF.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (built in), PORTAL_OWNER_EMAIL.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FALLBACK_EMAIL = Deno.env.get("PORTAL_OWNER_EMAIL") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? Deno.env.get("GHL_API_KEY") ?? "";
const GHL_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

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
  const cd = (b.customData ?? b.custom_data ?? {}) as Record<string, unknown>;
  const pick = (k: string) => String(cd[k] ?? b[k] ?? "").trim();

  const email = pick("owner_email") || FALLBACK_EMAIL;
  if (!email) return json({ ok: false, error: "owner_email required (or set PORTAL_OWNER_EMAIL secret)" }, 400);
  const contactId = pick("contactId") || String(b.contact_id ?? "").trim();
  const name = pick("name") || String(b.full_name ?? "").trim();
  const phone = pick("phone").replace(/\D/g, "");
  const kind = pick("kind").toLowerCase() === "final" ? "final" : "deposit";
  let amount = Number(pick("amount").replace(/[^0-9.]/g, "")) || 0;

  // fallback 1: scan the webhook's standard payload for an amount-ish field
  if (!(amount > 0)) {
    const scan = (o: unknown, depth: number): number => {
      if (!o || typeof o !== "object" || depth > 3) return 0;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        if (/amount_?paid|amountpaid|total_?amount|invoice_?total|^total$|^amount$/i.test(k)) {
          const n = Number(String(v).replace(/[^0-9.]/g, ""));
          if (n > 0) return n;
        }
        const nested = scan(v, depth + 1);
        if (nested > 0) return nested;
      }
      return 0;
    };
    amount = scan(b, 0);
  }

  // fallback 2: look the invoice up in GHL by invoice number
  const invNo = pick("invoiceNumber") || pick("invoice_number");
  if (!(amount > 0) && invNo && GHL_TOKEN && GHL_LOC) {
    try {
      const r = await fetch(`${GHL_BASE}/invoices/?altId=${GHL_LOC}&altType=location&limit=50&offset=0`, {
        headers: { Authorization: `Bearer ${GHL_TOKEN}`, Version: "2021-07-28", Accept: "application/json" },
      });
      const d = await r.json().catch(() => ({}));
      const inv = (d?.invoices ?? []).find((v: Record<string, unknown>) =>
        String(v.invoiceNumber ?? "").replace(/\D/g, "") === invNo.replace(/\D/g, ""));
      if (inv) amount = Number(inv.amountPaid ?? inv.total ?? 0) || 0;
    } catch { /* fall through */ }
  }

  if (kind === "deposit" && !(amount > 0)) {
    return json({ ok: false, error: "could not determine amount — pass invoiceNumber in custom data", got: Object.keys(cd).length ? cd : Object.keys(b) }, 400);
  }

  const owner = await userIdByEmail(email);
  if (!owner) return json({ ok: false, error: `no portal user found for ${email}` }, 404);

  const rr = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}&select=jobs`, { headers: sbH });
  if (!rr.ok) return json({ ok: false, error: "portal_finance read failed" }, 502);
  const rows = await rr.json();
  const jobs: Record<string, unknown>[] = (rows[0]?.jobs ?? []) as Record<string, unknown>[];

  // match: contactId on an active job first, then name, then phone; prefer active over done
  const score = (j: Record<string, unknown>) => {
    let s = 0;
    if (contactId && j.contactId === contactId) s += 100;
    if (name && String(j.name ?? "").toLowerCase() === name.toLowerCase()) s += 40;
    if (phone && String(j.phone ?? "").replace(/\D/g, "") === phone) s += 40;
    if (j.status === "active") s += 10;
    return s;
  };
  const job = jobs.filter((j) => score(j) >= 40).sort((a, b2) => score(b2) - score(a))[0];
  if (!job) return json({ ok: false, error: "no matching job found", contactId, name }, 404);

  const prev = Number(job.collected ?? 0) || 0;
  const est = Number(job.estimate ?? 0) || 0;
  let next = prev + amount;
  if (kind === "final" && est > 0 && next < est) next = est;   // final payment = fully collected
  job.collected = Math.round(next * 100) / 100;

  const p = await fetch(`${SB_URL}/rest/v1/portal_finance?owner=eq.${owner}`, {
    method: "PATCH", headers: sbH, body: JSON.stringify({ jobs }),
  });
  if (!p.ok) return json({ ok: false, error: "portal_finance write failed" }, 502);
  return json({ ok: true, job: job.name, kind, added: amount, collected: job.collected });
});
