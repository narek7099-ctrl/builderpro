// ghl-schedule — scheduled sends for the BuilderPro portal.
// Actions (POST JSON):
//   {action:'create', channel:'SMS'|'Email', subject?, message, contactIds:[], sendAt:ISO, label?}
//   {action:'list'}                 -> {ok, items:[...]}
//   {action:'cancel', id}           -> {ok}
//   {action:'run'}                  -> processes due pending rows (called by pg_cron)
//
// Deploy:  supabase functions deploy ghl-schedule --no-verify-jwt
// Table:   scheduled_msgs (see SETUP.md)
// Secrets: GHL_TOKEN (or GHL_API_KEY), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? Deno.env.get("GHL_API_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const ghlH = { Authorization: `Bearer ${GHL_TOKEN}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };

async function sendOne(channel: string, contactId: string, message: string, subject: string) {
  const body: Record<string, unknown> = channel === "Email"
    ? { type: "Email", contactId, subject, html: `<p>${message.replace(/\n/g, "<br>")}</p>`, emailTo: undefined }
    : { type: "SMS", contactId, message };
  const r = await fetch(`${GHL_BASE}/conversations/messages`, { method: "POST", headers: ghlH, body: JSON.stringify(body) });
  return r.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const action = String(b.action ?? "");

  if (action === "create") {
    const contactIds = Array.isArray(b.contactIds) ? b.contactIds.map(String).filter(Boolean) : [];
    const message = String(b.message ?? "").trim();
    const sendAt = new Date(String(b.sendAt ?? ""));
    if (!contactIds.length || !message || isNaN(sendAt.getTime())) return json({ ok: false, error: "contactIds, message, sendAt required" }, 400);
    if (sendAt.getTime() < Date.now()) return json({ ok: false, error: "sendAt must be in the future" }, 400);
    const row = {
      channel: b.channel === "Email" ? "Email" : "SMS",
      subject: String(b.subject ?? "A note from your contractor"),
      message,
      contact_ids: contactIds,
      send_at: sendAt.toISOString(),
      label: String(b.label ?? "Message"),
      status: "pending",
    };
    const r = await fetch(`${SB_URL}/rest/v1/scheduled_msgs`, { method: "POST", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(row) });
    if (!r.ok) return json({ ok: false, error: "db insert failed" }, 502);
    const d = await r.json();
    return json({ ok: true, item: d[0] ?? row });
  }

  if (action === "list") {
    const r = await fetch(`${SB_URL}/rest/v1/scheduled_msgs?select=*&order=send_at.asc&limit=100`, { headers: sbH });
    if (!r.ok) return json({ ok: false, error: "db read failed" }, 502);
    return json({ ok: true, items: await r.json() });
  }

  if (action === "cancel") {
    const id = String(b.id ?? "");
    if (!id) return json({ ok: false, error: "id required" }, 400);
    const r = await fetch(`${SB_URL}/rest/v1/scheduled_msgs?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
      method: "PATCH", headers: sbH, body: JSON.stringify({ status: "canceled" }),
    });
    return json({ ok: r.ok });
  }

  if (action === "run") {
    if (!GHL_TOKEN) return json({ ok: false, error: "no GHL token" }, 500);
    const now = new Date().toISOString();
    const r = await fetch(`${SB_URL}/rest/v1/scheduled_msgs?status=eq.pending&send_at=lte.${encodeURIComponent(now)}&select=*&limit=20`, { headers: sbH });
    if (!r.ok) return json({ ok: false, error: "db read failed" }, 502);
    const due = await r.json();
    const results: Record<string, unknown>[] = [];
    for (const row of due) {
      // claim it first so overlapping runs never double-send
      const claim = await fetch(`${SB_URL}/rest/v1/scheduled_msgs?id=eq.${row.id}&status=eq.pending`, {
        method: "PATCH", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify({ status: "sending" }),
      });
      const claimed = claim.ok ? await claim.json() : [];
      if (!claimed.length) continue;
      let ok = 0, fail = 0;
      for (const cid of row.contact_ids ?? []) {
        try { (await sendOne(row.channel, cid, row.message, row.subject)) ? ok++ : fail++; }
        catch { fail++; }
        await new Promise((res) => setTimeout(res, 220));
      }
      await fetch(`${SB_URL}/rest/v1/scheduled_msgs?id=eq.${row.id}`, {
        method: "PATCH", headers: sbH, body: JSON.stringify({ status: fail && !ok ? "failed" : "sent", sent_count: ok, fail_count: fail }),
      });
      results.push({ id: row.id, ok, fail });
    }
    return json({ ok: true, processed: results.length, results });
  }

  return json({ ok: false, error: "unknown action" }, 400);
});
