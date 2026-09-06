// ghl-invoice — the portal's invoicing: clients create + send real GHL invoices
// to their customers, so GHL "Invoice paid" workflow triggers fire on payment.
// Actions (POST JSON):
//   {action:'create', contactId, contactName, phone?, email?, title, amount, description?, dueDays?, send:'sms'|'email'|'both'}
//   {action:'list'}  -> {ok, items:[{id,name,total,status,contact,createdAt,dueDate}]}
//
// Deploy:  supabase functions deploy ghl-invoice --no-verify-jwt
// Secrets: GHL_TOKEN (location token), GHL_LOCATION_ID (required),
//          optional GHL_API_KEY + GHL_COMPANY_ID to mint a location token.

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
    const r = await fetch(`${GHL_BASE}/invoices/?altId=${LOC}&altType=location&limit=25&offset=0`, { headers: ghlH(t) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? "list failed" }, 502);
    const items = (d?.invoices ?? []).map((v: Record<string, unknown>) => ({
      id: v._id ?? v.id,
      name: v.name ?? "Invoice",
      total: v.total ?? 0,
      status: v.status ?? "draft",
      contact: (v.contactDetails as Record<string, unknown>)?.name ?? "",
      createdAt: v.createdAt ?? "",
      dueDate: v.dueDate ?? "",
    }));
    return json({ ok: true, items });
  }

  if (b.action === "create") {
    const contactId = String(b.contactId ?? "").trim();
    const amount = Number(b.amount ?? 0);
    const title = String(b.title ?? "Invoice").trim() || "Invoice";
    if (!contactId || !(amount > 0)) return json({ ok: false, error: "contactId and amount required" }, 400);
    const phone = String(b.phone ?? "").trim();
    const email = String(b.email ?? "").trim();
    const desc = String(b.description ?? "").trim();
    const dueDays = Math.max(0, Number(b.dueDays ?? 7));

    const payload = {
      altId: LOC, altType: "location",
      name: title,
      businessDetails: { name: String(b.businessName ?? "Your contractor") },
      currency: "USD",
      items: [{ name: title, description: desc || title, currency: "USD", amount, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name: String(b.contactName ?? "Customer"), phoneNo: phone || undefined, email: email || undefined },
      issueDate: day(0),
      dueDate: day(dueDays),
      sentTo: { email: email ? [email] : [], phoneNo: phone ? [phone] : [] },
      liveMode: true,
    };
    const r = await fetch(`${GHL_BASE}/invoices/`, { method: "POST", headers: ghlH(t), body: JSON.stringify(payload) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, status: r.status, error: d?.message ?? JSON.stringify(d).slice(0, 300) }, 502);
    const invId = d?._id ?? d?.id ?? d?.invoice?._id;
    if (!invId) return json({ ok: false, error: "created but no invoice id returned", raw: d }, 502);

    // tag the contact so workflows can tell deposit vs final without title filters
    try {
      const low = title.toLowerCase();
      if (low.includes("deposit")) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) });
      } else if (low.includes("final")) {
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "DELETE", headers: ghlH(t), body: JSON.stringify({ tags: ["deposit-sent"] }) });
        await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["final-sent"] }) });
      }
    } catch { /* tagging is best-effort */ }

    // send it (sms/email/both); failure to send still leaves a draft they can send from GHL
    const sendPref = b.send === "email" ? "email" : b.send === "both" ? "sms_and_email" : "sms";
    let sent = false, sendErr = "";
    try {
      const rs = await fetch(`${GHL_BASE}/invoices/${invId}/send`, {
        method: "POST", headers: ghlH(t),
        body: JSON.stringify({ altId: LOC, altType: "location", action: sendPref, liveMode: true }),
      });
      sent = rs.ok;
      if (!rs.ok) sendErr = (await rs.json().catch(() => ({})))?.message ?? `send ${rs.status}`;
    } catch (e) { sendErr = String(e).slice(0, 120); }

    return json({ ok: true, id: invId, sent, sendError: sendErr || undefined });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
