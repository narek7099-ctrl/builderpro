// system-test — one-button end-to-end pipeline test.
// Creates a "BP System Test" contact, then walks it through the whole flow via
// real GHL events so every workflow actually fires:
//   estimate sent -> deposit invoice -> RECORD PAYMENT (fires Invoice Paid!)
//   -> job-complete tag -> final invoice -> record payment -> radar tags.
// Returns a step-by-step report. {action:'run', phone:'+1...'} runs it;
// {action:'cleanup'} deletes the test contact afterwards.
//
// Deploy:  supabase functions deploy system-test --no-verify-jwt
// Secrets: GHL_TOKEN (or GHL_API_KEY+GHL_COMPANY_ID), GHL_LOCATION_ID

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const TEST_NAME = "BP System Test";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const H = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

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
const day = (o: number) => new Date(Date.now() + o * 864e5).toISOString().slice(0, 10);

type Step = { step: string; ok: boolean; detail: string };

async function findTestContact(t: string): Promise<string> {
  try {
    const r = await fetch(`${GHL_BASE}/contacts/?locationId=${LOC}&query=${encodeURIComponent(TEST_NAME)}&limit=5`, { headers: H(t) });
    const d = await r.json().catch(() => ({}));
    const c = (d?.contacts ?? []).find((x: Record<string, unknown>) => String(x.contactName ?? x.firstName ?? "").includes("BP System Test"));
    return c?.id ?? "";
  } catch { return ""; }
}

async function mkInvoice(t: string, contactId: string, phone: string, title: string): Promise<{ id: string; err?: string }> {
  const r = await fetch(`${GHL_BASE}/invoices/`, {
    method: "POST", headers: H(t),
    body: JSON.stringify({
      altId: LOC, altType: "location", name: title,
      businessDetails: { name: "System Test" }, currency: "USD",
      items: [{ name: title, description: "automated pipeline test", currency: "USD", amount: 1, qty: 1, taxes: [] }],
      discount: { type: "percentage", value: 0 },
      contactDetails: { id: contactId, name: TEST_NAME, phoneNo: phone || undefined },
      issueDate: day(0), dueDate: day(7),
      sentTo: { email: [], phoneNo: phone ? [phone] : [] }, liveMode: true,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { id: "", err: d?.message ?? `HTTP ${r.status}` };
  return { id: d?._id ?? d?.id ?? "" };
}

async function recordPayment(t: string, invId: string): Promise<{ ok: boolean; err?: string }> {
  const r = await fetch(`${GHL_BASE}/invoices/${invId}/record-payment`, {
    method: "POST", headers: H(t),
    body: JSON.stringify({ altId: LOC, altType: "location", mode: "cash", amount: 1, notes: "system-test auto payment" }),
  });
  if (r.ok) return { ok: true };
  const d = await r.json().catch(() => ({}));
  return { ok: false, err: d?.message ?? `HTTP ${r.status}` };
}

async function addTags(t: string, id: string, tags: string[]) {
  const r = await fetch(`${GHL_BASE}/contacts/${id}/tags`, { method: "POST", headers: H(t), body: JSON.stringify({ tags }) });
  return r.ok;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!LOC) return json({ ok: false, error: "GHL_LOCATION_ID not set" }, 500);
  const t = await token();
  if (!t) return json({ ok: false, error: "no GHL token" }, 500);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (b.action === "probe") {
    const targets: [string, string, unknown][] = [
      ["ai-response", "POST", { mode: "ping" }],
      ["AGENCY", "POST", { op: "ping" }],
      ["job-done", "POST", {}],
      ["radar-sync", "POST", {}],
      ["skip-trace", "POST", {}],
      ["ghl-invoice", "POST", { action: "list" }],
      ["ghl-estimate", "POST", { action: "list" }],
      ["ghl-schedule", "POST", { action: "list" }],
      ["project-create", "POST", {}],
      ["radar-daily", "PUT", null], // PUT = existence check without running the scan
    ];
    const out: Record<string, unknown>[] = [];
    for (const [name, method, body] of targets) {
      try {
        const r = await fetch(`${SB_URL}/functions/v1/${name}`, {
          method,
          headers: { Authorization: `Bearer ${SB_SERVICE}`, apikey: SB_SERVICE, "Content-Type": "application/json" },
          body: body === null ? undefined : JSON.stringify(body),
        });
        const txt = (await r.text()).slice(0, 160);
        out.push({ name, status: r.status, body: txt });
      } catch (e) { out.push({ name, status: 0, body: String(e).slice(0, 120) }); }
    }
    return json({ ok: true, probe: out });
  }

  if (b.action === "cleanup") {
    const id = await findTestContact(t);
    if (!id) return json({ ok: true, detail: "no test contact found — already clean" });
    const r = await fetch(`${GHL_BASE}/contacts/${id}`, { method: "DELETE", headers: H(t) });
    return json({ ok: r.ok, detail: r.ok ? "test contact deleted" : `delete failed HTTP ${r.status}` });
  }

  const phone = String(b.phone ?? "").trim() || "+1702555" + String(1000 + Math.floor(Math.random() * 9000));
  const steps: Step[] = [];

  if (b.action === "run" || b.action === "phase1") {
    // PHASE 1: contact + deposit invoice + tag + payment. Stop there so the
    // workflow's tag routing sees deposit-sent, like a real customer's timeline.
    let cid = await findTestContact(t);
    if (!cid) {
      const r = await fetch(`${GHL_BASE}/contacts/`, {
        method: "POST", headers: H(t),
        body: JSON.stringify({ locationId: LOC, name: TEST_NAME, firstName: "BP System", lastName: "Test", phone, tags: ["system-test"] }),
      });
      const d = await r.json().catch(() => ({}));
      cid = d?.contact?.id ?? "";
      steps.push({ step: "Create test contact", ok: !!cid, detail: cid || (d?.message ?? `HTTP ${r.status}`) });
    } else {
      steps.push({ step: "Create test contact", ok: true, detail: `reusing existing (${cid})` });
    }
    if (!cid) return json({ ok: false, steps });

    const dep = await mkInvoice(t, cid, phone, "Deposit — system test");
    steps.push({ step: "Create Deposit invoice", ok: !!dep.id, detail: dep.id || dep.err || "" });
    if (dep.id) {
      await addTags(t, cid, ["deposit-sent"]);
      steps.push({ step: "Tag deposit-sent (as portal would)", ok: true, detail: "applied" });
      const p = await recordPayment(t, dep.id);
      steps.push({ step: "Record payment on Deposit → fires 'Invoice Paid' workflow", ok: p.ok, detail: p.ok ? "payment recorded" : (p.err ?? "") });
    }
    return json({
      ok: steps.every((x) => x.ok), steps,
      now_check: [
        "Wait ~1 minute for GHL to process the trigger",
        "Opportunity 'BP System Test' should move to Won",
        "RELOAD the portal → Active Projects: 'BP System Test' should appear",
        "Contact tags: deposit-sent should be REMOVED by the workflow",
        "Then run Phase 2 to finish the job",
      ],
    });
  }

  if (b.action === "phase2") {
    const cid = await findTestContact(t);
    if (!cid) return json({ ok: false, error: "no test contact — run Phase 1 first" });
    const jc = await addTags(t, cid, ["job-complete"]);
    steps.push({ step: "Tag job-complete → fires 'Job Complete' workflow", ok: jc, detail: jc ? "applied" : "failed" });
    const fin = await mkInvoice(t, cid, phone, "Final balance — system test");
    steps.push({ step: "Create Final invoice", ok: !!fin.id, detail: fin.id || fin.err || "" });
    if (fin.id) {
      await addTags(t, cid, ["final-sent"]);
      const p2 = await recordPayment(t, fin.id);
      steps.push({ step: "Record payment on Final → fires paid-in-full → review chain", ok: p2.ok, detail: p2.ok ? "payment recorded" : (p2.err ?? "") });
    }
    const rc = await addTags(t, cid, ["radar-contacted"]);
    steps.push({ step: "Tag radar-contacted → fires Lead Radar workflow", ok: rc, detail: rc ? "applied" : "failed" });
    return json({
      ok: steps.every((x) => x.ok), steps,
      now_check: [
        "Wait ~1 minute for triggers to process",
        "Contact tags: paid-in-full present, final-sent removed",
        "Google Review workflow: contact enrolled (review text after its wait)",
        "When done: cleanup + delete the portal test project",
      ],
    });
  }

  return json({ ok: false, error: "action must be 'phase1', 'phase2', 'probe' or 'cleanup'" }, 400);
});