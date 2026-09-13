// ghl-estimate — portal estimates: clients create + send real GHL estimates
// (formal quotes the customer can Accept/Decline). Acceptance fires GHL's
// estimate triggers, which can auto-create the deposit invoice.
// Actions: {action:'create', contactId, contactName, phone?, email?, title,
//           amount, description?, expiryDays?, send:'sms'|'email'|'both', businessName?}
//          {action:'list'}
// Deploy:  supabase functions deploy ghl-estimate --no-verify-jwt
// Secrets: GHL_TOKEN (location), GHL_LOCATION_ID; optional GHL_API_KEY+GHL_COMPANY_ID.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

async function token(): Promise<string> {
  if (GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID && LOC) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: LOC }).toString(),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
    } catch { /* fall through */ }
  }
  return GHL_API_KEY;
}
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!LOC) return json({ ok: false, error: "GHL_LOCATION_ID secret not set" }, 500);
  const t = await token();
  if (!t) return json({ ok: false, error: "no GHL token" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.action === "list") {
    const r = await fetch(`${GHL_BASE}/invoices/estimate/list?altId=${LOC}&altType=location&limit=25&offset=0`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? "list failed" }, 502);
    const arr = d?.estimates ?? d?.data ?? [];
    const items = arr.map((v: Record<string, unknown>) => ({
      id: v._id ?? v.id,
      name: v.name ?? "Estimate",
      total: v.total ?? v.amountDue ?? 0,
      status: v.status ?? "draft",
      contact: (v.contactDetails as Record<string, unknown>)?.name ?? "",
      createdAt: v.createdAt ?? "",
      expiryDate: v.expiryDate ?? v.dueDate ?? "",
    }));
    return json({ ok: true, items });
  }

  if (b.action === "create") {
    const contactId = String(b.contactId ?? "").trim();
    const amount = Number(b.amount ?? 0);
    const title = String(b.title ?? "Estimate").trim() || "Estimate";
    if (!contactId || !(amount > 0)) return json({ ok: false, error: "contactId and amount required" }, 400);
    const phone = String(b.phone ?? "").trim();
    const email = String(b.email ?? "").trim();
    const desc = String(b.description ?? "").trim();
    const expiryDays = Math.max(1, Number(b.expiryDays ?? 14));

    const payload = {
      altId: LOC, altType: "location",
      name: title,
      businessDetails: { name: String(b.businessName ?? "Your contractor") },
      currency: "USD",
      items: [{ name: title, description: desc || title, currency: "USD", amount, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name: String(b.contactName ?? "Customer"), phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0),
      expiryDate: day(expiryDays),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    };
    const r = await fetch(`${GHL_BASE}/invoices/estimate`, { method: "POST", headers: ghlH(t), body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? JSON.stringify(d).slice(0, 300) }, 502);
    const estId = d?._id ?? d?.id ?? d?.estimate?._id;
    if (!estId) return json({ ok: false, error: "created but no estimate id returned", raw: d }, 502);

    const sendPref = b.send === "email" ? "email" : b.send === "both" ? "sms_and_email" : "sms";
    let sent = false, sendErr = "";
    try {
      const rs = await fetch(`${GHL_BASE}/invoices/estimate/${estId}/send`, {
        method: "POST", headers: ghlH(t),
        body: JSON.stringify({ altId: LOC, altType: "location", action: sendPref, liveMode: true }),
      });
      sent = rs.ok;
      if (!rs.ok) sendErr = (await rs.json().catch(() => ({})))?.message ?? `send ${rs.status}`;
    } catch (e) { sendErr = String(e).slice(0, 120); }

    return json({ ok: true, id: estId, sent, sendError: sendErr || undefined });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
