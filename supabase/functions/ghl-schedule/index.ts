// Supabase Edge Function: ghl-schedule
// Stores scheduled SMS/Email sends and dispatches them when due.
//
// Actions (POST JSON body { action: ... }):
//   create  { sendAt, channel:'SMS'|'Email', subject?, message, contactIds:[], label? }
//   list    -> { ok, items:[...] }  (pending + recently sent)
//   cancel  { id }
//   process -> dispatch everything due now (call from a 1-min cron)
//
// Deploy:  supabase functions deploy ghl-schedule --no-verify-jwt
// Table:   see 20260815_scheduled_messages.sql migration.
// Cron:    schedule a call to this function with {"action":"process"} every minute
//          (Supabase Dashboard → Database → Cron, or pg_cron / external cron).
//          Protect it by setting SCHED_CRON_KEY and sending header x-cron-key.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SB = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REST = `${SB}/rest/v1/scheduled_messages`;
const HED = { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function dispatchOne(row: any) {
  const ids: string[] = Array.isArray(row.contact_ids) ? row.contact_ids : [];
  let ok = 0, fail = 0;
  for (const cid of ids) {
    try {
      const r = await fetch(`${SB}/functions/v1/ghl-messaging`, {
        method: "POST",
        headers: { apikey: SR, Authorization: `Bearer ${SR}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", msgType: row.channel, contactId: cid, message: row.message, subject: row.subject || "A note from your contractor" }),
      });
      const j = await r.json().catch(() => ({}));
      j && j.ok ? ok++ : fail++;
    } catch (_) { fail++; }
    await new Promise((res) => setTimeout(res, 200));
  }
  await fetch(`${REST}?id=eq.${row.id}`, {
    method: "PATCH", headers: HED,
    body: JSON.stringify({ status: fail && !ok ? "error" : "sent", sent_at: new Date().toISOString(), result: { ok, fail } }),
  });
  return { ok, fail };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SB || !SR) return json({ ok: false, error: "scheduler not configured" });
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const action = body.action;

  try {
    if (action === "create") {
      if (!body.message || !body.sendAt || !Array.isArray(body.contactIds) || !body.contactIds.length)
        return json({ ok: false, error: "message, sendAt and contactIds are required" });
      const row = {
        send_at: new Date(body.sendAt).toISOString(),
        channel: body.channel === "Email" ? "Email" : "SMS",
        subject: body.subject || null,
        message: body.message,
        contact_ids: body.contactIds,
        label: body.label || null,
        status: "pending",
      };
      const r = await fetch(REST, { method: "POST", headers: { ...HED, Prefer: "return=representation" }, body: JSON.stringify(row) });
      const d = await r.json();
      return r.ok ? json({ ok: true, item: d[0] }) : json({ ok: false, error: JSON.stringify(d) });
    }

    if (action === "list") {
      const r = await fetch(`${REST}?order=send_at.asc&limit=100`, { headers: HED });
      const items = await r.json();
      return json({ ok: true, items });
    }

    if (action === "cancel") {
      if (!body.id) return json({ ok: false, error: "id required" });
      await fetch(`${REST}?id=eq.${body.id}&status=eq.pending`, { method: "PATCH", headers: HED, body: JSON.stringify({ status: "canceled" }) });
      return json({ ok: true });
    }

    if (action === "process") {
      const key = Deno.env.get("SCHED_CRON_KEY");
      if (key && req.headers.get("x-cron-key") !== key) return json({ ok: false, error: "unauthorized" }, 401);
      const now = new Date().toISOString();
      const r = await fetch(`${REST}?status=eq.pending&send_at=lte.${now}&order=send_at.asc&limit=50`, { headers: HED });
      const due = await r.json();
      let processed = 0;
      for (const row of (Array.isArray(due) ? due : [])) { await dispatchOne(row); processed++; }
      return json({ ok: true, processed });
    }

    return json({ ok: false, error: "unknown action" });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
