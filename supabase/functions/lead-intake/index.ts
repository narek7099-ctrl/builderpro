// lead-intake — the webhook a lead vendor posts to.
//
//   POST /functions/v1/lead-intake/<source-id>[?k=<secret>]
//
// Angi, Thumbtack, Networx, a local ping-post seller, or the form on the
// contractor's own site. The contractor is already buying these leads. What
// they are not doing is answering them inside a minute, and on a shared lead
// that is most of what decides who gets the job: the vendor sold the same
// homeowner to three other contractors in the same breath.
//
// So the one thing this endpoint must do well is be quick. It writes the
// contact, tags it so the existing GHL workflow fires, and answers the
// vendor. The GHL push happens after the response goes out — see below.
//
// Deploy:  supabase functions deploy lead-intake --no-verify-jwt
//          (--no-verify-jwt is required: vendors cannot send a Supabase JWT.
//           The source id in the path is the credential, like a Slack or
//           Stripe webhook URL.)
// Secrets: GHL_TOKEN / GHL_API_KEY etc — the same ones the other functions use.

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ghlHeaders = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_SERVICE,
      Authorization: `Bearer ${SB_SERVICE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/* ------------------------------------------------------------------ parsing */
/* The parser lives in parse.js beside this file, in plain JavaScript, so
   tools/lead-parse.test.js can run it under node against real payload
   shapes. It is the part most likely to be wrong and least likely to say
   so: a field name that does not match just yields a lead with no phone
   number, which looks like a bad lead rather than a bug. */
import { parseLead } from "./parse.js";

type Lead = { name: string; phone: string; phoneKey: string; email: string; address: string; job: string };

/* Bodies arrive as JSON, as a form post, or occasionally as a query string on
   an empty POST. All three are common enough to be worth handling — a vendor
   whose integration "does not work" will not debug it for you, they will just
   keep sending. */
async function readBody(req: Request, url: URL): Promise<Record<string, unknown>> {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  try {
    if (type.includes("json")) return await req.json();
    if (type.includes("form")) {
      const f = await req.formData();
      const o: Record<string, unknown> = {};
      f.forEach((v, k) => { o[k] = typeof v === "string" ? v : ""; });
      return o;
    }
    const raw = (await req.text()).trim();
    if (raw.startsWith("{")) return JSON.parse(raw);
    if (raw) {
      const o: Record<string, unknown> = {};
      new URLSearchParams(raw).forEach((v, k) => { o[k] = v; });
      if (Object.keys(o).length) return o;
    }
  } catch { /* fall through to the query string */ }
  const q: Record<string, unknown> = {};
  url.searchParams.forEach((v, k) => { if (k !== "k") q[k] = v; });
  return q;
}

async function ghlToken(): Promise<string> {
  if (GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID && GHL_LOCATION_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST",
        headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: GHL_LOCATION_ID }).toString(),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
    } catch { /* fall through */ }
  }
  return GHL_API_KEY;
}

/* The GHL contact. Tagged `new-lead` plus the vendor, which is what the
   workflow triggers on — that workflow is the thirty-second reply, and it is
   the entire reason this endpoint is worth having.

   This runs AFTER the vendor has had its answer. A ping-post seller that
   waits on GHL will time out and re-post, or mark the contractor as a slow
   endpoint and stop sending — and neither the contact row nor the lead is
   lost if the push fails, because the row is already written. */
async function pushToGhl(lead: Lead, vendor: string, label: string, eventId: string) {
  try {
    const token = await ghlToken();
    if (!token) return;
    const body: Record<string, unknown> = {
      name: lead.name,
      phone: lead.phone || undefined,
      email: lead.email || undefined,
      address1: lead.address || undefined,
      source: label || vendor,
      tags: ["new-lead", "lead-source", vendor],
    };
    if (GHL_LOCATION_ID) body.locationId = GHL_LOCATION_ID;
    const r = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(token), body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    const cid = d?.contact?.id || d?.id || "";
    if (cid && lead.job) {
      await fetch(`${GHL_BASE}/contacts/${cid}/notes`, {
        method: "POST", headers: ghlHeaders(token), body: JSON.stringify({ body: lead.job.slice(0, 500) }),
      }).catch(() => {});
    }
    if (cid) await sb(`lead_events?id=eq.${eventId}`, { method: "PATCH", body: JSON.stringify({ ghl_id: cid }) });
  } catch { /* the lead is already recorded; GHL catching up is not worth a retry storm */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const url = new URL(req.url);
  // .../lead-intake/<uuid>
  const id = (url.pathname.split("/").filter(Boolean).pop() ?? "").toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ ok: false, error: "webhook id missing from the URL" }, 404);
  const secret = url.searchParams.get("k") ?? req.headers.get("x-webhook-secret") ?? "";

  const sr = await sb("rpc/lead_source_for_hook", {
    method: "POST",
    body: JSON.stringify({ p_id: id, p_secret: secret }),
  });
  const rows = await sr.json().catch(() => []);
  const src = Array.isArray(rows) && rows.length ? rows[0] : null;
  // Same answer for "no such webhook" and "wrong secret", so the URL cannot be
  // probed for which half was wrong.
  if (!src) return json({ ok: false, error: "unknown webhook" }, 404);

  const body = await readBody(req, url);
  const lead = parseLead(body) as Lead;

  // A lead with no way to reach anybody is not a lead. Recorded as rejected
  // rather than dropped, because "we sent you 40 leads" deserves an answer
  // with the 6 unreachable ones itemised.
  const reachable = !!(lead.phoneKey || lead.email);

  /* Duplicate within 30 days, by phone first and email second. Vendors resell
     and re-post, and sometimes the same homeowner fills in two forms. Charged
     twice for one person is the single most common lead-buying complaint, so
     this is flagged and kept rather than silently merged. */
  let dup = false;
  if (reachable) {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    // phone_key is the generated, digits-only column: two vendors spelling
    // one number differently is the commonest duplicate there is
    const key = lead.phoneKey
      ? `phone_key=eq.${encodeURIComponent(lead.phoneKey)}`
      : `email=eq.${encodeURIComponent(lead.email)}`;
    const q = await sb(`lead_events?owner=eq.${src.owner}&${key}&received_at=gt.${since}&status=eq.accepted&select=id&limit=1`);
    const prev = await q.json().catch(() => []);
    dup = Array.isArray(prev) && prev.length > 0;
  }

  const status = !reachable ? "rejected" : dup ? "duplicate" : "accepted";
  const reason = !reachable ? "no phone or email in the payload" : dup ? "same phone or email inside 30 days" : "";

  // The contact row first — it is what the portal reads, and it must exist
  // whether or not GHL is reachable this second.
  let contactId: string | null = null;
  if (status === "accepted") {
    const note = [lead.job, lead.address ? "Address: " + lead.address : "", "Source: " + (src.label || src.vendor)]
      .filter(Boolean).join("\n");
    const cr = await sb("contacts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        owner: src.owner,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        notes: note,
        tags: ["lead-source", src.vendor, ...(src.trade ? [src.trade] : [])],
      }),
    });
    const cd = await cr.json().catch(() => []);
    contactId = Array.isArray(cd) && cd.length ? cd[0].id : null;
  }

  const er = await sb("lead_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      source_id: src.id, owner: src.owner,
      name: lead.name, phone: lead.phone, email: lead.email, address: lead.address, job: lead.job,
      status, reason, contact_id: contactId,
      cost: status === "accepted" ? src.cost_per_lead : null,
      raw: body,
    }),
  });
  const ed = await er.json().catch(() => []);
  const eventId = Array.isArray(ed) && ed.length ? ed[0].id : "";

  if (status === "accepted") {
    // incremented in SQL: a read-then-write here would lose counts whenever
    // two leads land in the same second
    await sb("rpc/lead_source_bump", { method: "POST", body: JSON.stringify({ p_id: src.id }) }).catch(() => {});
  }

  /* Answer the vendor now. The GHL push — and so the automated reply to the
     homeowner — carries on in the background: a vendor kept waiting on a
     third-party API will time out and re-post the same lead, or drop this
     endpoint as unreliable. EdgeRuntime.waitUntil keeps the worker alive for
     it after the response has gone out. */
  if (status === "accepted" && eventId) {
    const work = pushToGhl(lead, src.vendor, src.label, eventId);
    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(work);
    } catch { /* older runtime: the push still runs, the response just waits */ }
  }

  return json({ ok: true, status, id: eventId, duplicate: dup });
});
