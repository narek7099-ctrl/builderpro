// estimate-accepted — called by the OS/Enterprise GHL workflow "08 Estimate
// Accepted - Deposit" (custom webhook action) the moment a customer accepts an
// estimate. Sends the customer the deposit invoice automatically:
//   deposit = Deposit Percent custom value (default 30) x the accepted estimate's total.
// The contact is tagged deposit-sent, so "10 Invoice Paid" knows the next
// payment is the deposit.
//
// POST JSON (from the GHL webhook):
//   { locationId: "{{location.id}}", contactId: "{{contact.id}}" }
//
// Safe to call twice: a contact already tagged deposit-sent (or deposit-paid)
// is skipped, and only an estimate that really is accepted in that location is used.
//
// Deploy:  supabase functions deploy estimate-accepted --no-verify-jwt
// Secrets: GHL_API_KEY + GHL_COMPANY_ID (agency key, mints the location token)

const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const DEFAULT_PCT = 30;

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function locationToken(loc: string): Promise<string> {
  if (!GHL_API_KEY || !GHL_COMPANY_ID) return "";
  try {
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(),
    });
    if (r.ok) { const d = await r.json(); return d?.access_token ?? ""; }
  } catch { /* fall through */ }
  return "";
}

// the location's "Deposit Percent" custom value (1-100), else the default
async function depositPct(loc: string, t: string): Promise<number> {
  try {
    const r = await fetch(`${GHL_BASE}/locations/${loc}/customValues`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    const cv = (d?.customValues ?? []).find((v: Record<string, unknown>) => /deposit.?percent/i.test(String(v.name ?? "")));
    const n = Number(String(cv?.value ?? "").replace(/[^0-9.]/g, ""));
    if (n > 0 && n <= 100) return n;
  } catch { /* default */ }
  return DEFAULT_PCT;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  // GHL's standard Webhook action nests our keys under customData
  const cd = (b.customData ?? {}) as Record<string, unknown>;
  const loc = String(b.locationId ?? cd.locationId ?? (b.location as Record<string, unknown>)?.id ?? "").trim();
  const contactId = String(b.contactId ?? cd.contactId ?? b.contact_id ?? "").trim();
  if (!loc || !contactId) return json({ ok: false, error: "locationId and contactId required" }, 400);

  const t = await locationToken(loc);
  if (!t) return json({ ok: false, error: "no token for this location" }, 403);

  // the contact (also proves it lives in this location)
  const rc = await fetch(`${GHL_BASE}/contacts/${contactId}`, { headers: ghlH(t) });
  if (!rc.ok) return json({ ok: false, error: "contact not found in this location" }, 404);
  const c = (await rc.json().catch(() => ({})))?.contact ?? {};
  const tags: string[] = (c.tags ?? []).map((x: string) => String(x).toLowerCase());
  if (tags.includes("deposit-sent") || tags.includes("deposit-paid")) return json({ ok: true, skipped: "deposit already sent" });

  // newest accepted estimate for this contact
  const re = await fetch(`${GHL_BASE}/invoices/estimate/list?altId=${loc}&altType=location&limit=50&offset=0`, { headers: ghlH(t) });
  const de = await re.json().catch(() => ({}));
  if (!re.ok) return json({ ok: false, error: de?.message ?? "estimate list failed" }, 502);
  const est = (de?.estimates ?? de?.data ?? [])
    .filter((v: Record<string, unknown>) => String(v.status ?? "").toLowerCase() === "accepted"
      && String((v.contactDetails as Record<string, unknown>)?.id ?? v.contactId ?? "") === contactId)
    .sort((a: Record<string, unknown>, z: Record<string, unknown>) => String(z.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
  if (!est) return json({ ok: false, error: "no accepted estimate for this contact" }, 404);
  const total = Number(est.total ?? est.amountDue ?? 0);
  if (!(total > 0)) return json({ ok: false, error: "estimate total is 0" }, 422);

  const pct = await depositPct(loc, t);
  const amount = Math.round(total * pct) / 100;
  const title = `Deposit — ${String(est.name ?? "your project")}`;
  const phone = String(c.phone ?? "").trim(), email = String(c.email ?? "").trim();
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || String(c.contactName ?? "Customer");
  const biz = (est.businessDetails as Record<string, unknown>) ?? {};

  const ri = await fetch(`${GHL_BASE}/invoices/`, {
    method: "POST", headers: ghlH(t),
    body: JSON.stringify({
      altId: loc, altType: "location", name: title,
      businessDetails: { name: String(biz.name ?? "Your contractor"), ...(biz.phoneNo ? { phoneNo: biz.phoneNo } : {}), ...(biz.address ? { address: biz.address } : {}) },
      currency: String(est.currency ?? "USD"),
      items: [{ name: title, description: `${pct}% deposit on your accepted estimate ${String(est.estimateNumber ?? "")}`.trim(), currency: String(est.currency ?? "USD"), amount, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name, phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0), dueDate: day(7),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    }),
  });
  const di = await ri.json().catch(() => ({}));
  const invId = di?._id ?? di?.id ?? di?.invoice?._id;
  if (!ri.ok || !invId) return json({ ok: false, error: di?.message ?? "invoice create failed" }, 502);

  await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) }).catch(() => {});

  const action = phone && email ? "sms_and_email" : email ? "email" : "sms";
  const rs = await fetch(`${GHL_BASE}/invoices/${invId}/send`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ altId: loc, altType: "location", action, liveMode: true }) });
  return json({ ok: true, id: invId, amount, pct, sent: rs.ok });
});
