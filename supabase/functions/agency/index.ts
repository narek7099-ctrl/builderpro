// agency — the secure backend for your private Agency Command Center.
//
// Holds your GHL agency API key + Gemini key (server-side, never in the page).
// Every call is gated: the caller must be signed in as an allowed admin email.
// Two kinds of calls:
//   { op: "ai.plan", command: "..." }  -> Gemini turns your words into a proposed
//                                          {op,args} action + a plain-English summary.
//                                          NOTHING is executed. You approve first.
//   { op: "<real op>", args: {...} }   -> executes against the GHL API.
//
// Deploy:
//   supabase functions deploy agency --no-verify-jwt
//   supabase secrets set GHL_API_KEY=... GHL_COMPANY_ID=... GEMINI_API_KEY=AIza... ADMIN_EMAILS=you@email.com

const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";        // agency-level token (locations)
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";            // sub-account token fallback
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-2.5-flash";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });

// Agency tokens can't read a sub-account's data; mint (and cache) a location-scoped
// token from the agency token. Falls back to GHL_TOKEN, then the agency token.
const locTokenCache: Record<string, string> = {};
async function locationToken(locationId: string): Promise<string> {
  if (!locationId) return GHL_API_KEY;
  if (locTokenCache[locationId]) return locTokenCache[locationId];
  try {
    const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString(),
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.access_token) { locTokenCache[locationId] = d.access_token; return d.access_token; }
    }
  } catch { /* fall through */ }
  return GHL_TOKEN || GHL_API_KEY;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// --- who is calling? verify the Supabase user token and check the allowlist ---
async function requireAdmin(req: Request): Promise<{ ok: boolean; email: string; reason: string }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, email: "", reason: "no token sent" };
  if (!SB_URL) return { ok: false, email: "", reason: "SUPABASE_URL missing" };
  if (!ADMIN_EMAILS.length) return { ok: false, email: "", reason: "ADMIN_EMAILS not set (spelling? all caps?)" };
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON } });
    if (!r.ok) return { ok: false, email: "", reason: `token lookup failed (${r.status})` };
    const u = await r.json();
    const email = (u?.email ?? "").toLowerCase();
    if (!email) return { ok: false, email: "", reason: "no email on token" };
    if (!ADMIN_EMAILS.includes(email)) return { ok: false, email, reason: `${email} not in ADMIN_EMAILS [${ADMIN_EMAILS.join(", ")}]` };
    return { ok: true, email, reason: "ok" };
  } catch (e) {
    return { ok: false, email: "", reason: "verify error: " + String(e).slice(0, 80) };
  }
}

// --- the operations the command center can perform against GHL ---
// Each returns { method, path, body? }. Kept in one place so the AI planner and the
// buttons share exactly the same surface.
function opToRequest(op: string, a: Record<string, string> = {}): { method: string; path: string; body?: unknown } | null {
  switch (op) {
    // clients / sub-accounts
    case "locations.list":   return { method: "GET", path: `/locations/search?companyId=${GHL_COMPANY_ID}&limit=100` };
    case "locations.create": return { method: "POST", path: `/locations/`, body: { companyId: GHL_COMPANY_ID, name: a.name, phone: a.phone, address: a.address, city: a.city, state: a.state, country: a.country ?? "US" } };
    case "locations.update": {
      const b: Record<string, string> = { companyId: GHL_COMPANY_ID };
      ["name","phone","email","address","city","state","postalCode","website","timezone","country","firstName","lastName","companyName"].forEach((k) => { if (a[k] !== undefined && a[k] !== "") b[k] = a[k]; });
      return { method: "PUT", path: `/locations/${a.id}`, body: b };
    }
    case "locations.delete": return { method: "DELETE", path: `/locations/${a.id}?companyId=${GHL_COMPANY_ID}&deleteTwilioAccount=false` };
    // contacts (need locationId)
    case "contacts.list":    return { method: "GET", path: `/contacts/?locationId=${a.locationId}&limit=100${a.query ? `&query=${encodeURIComponent(a.query)}` : ""}` };
    case "contacts.create":  return { method: "POST", path: `/contacts/`, body: { locationId: a.locationId, name: a.name, firstName: a.firstName, lastName: a.lastName, phone: a.phone, email: a.email } };
    case "contacts.update":  return { method: "PUT", path: `/contacts/${a.id}`, body: { name: a.name, phone: a.phone, email: a.email } };
    case "contacts.delete":  return { method: "DELETE", path: `/contacts/${a.id}` };
    case "contacts.tag":     return { method: "POST", path: `/contacts/${a.id}/tags`, body: { tags: (a.tags ? String(a.tags).split(",").map((t) => t.trim()) : []) } };
    // conversations
    case "conversations.list":     return { method: "GET", path: `/conversations/search?locationId=${a.locationId}&limit=50` };
    case "conversations.messages": return { method: "GET", path: `/conversations/${a.id}/messages` };
    case "conversations.send":     return { method: "POST", path: `/conversations/messages`, body: { type: a.type ?? "SMS", contactId: a.contactId, message: a.message } };
    // pipelines / opportunities / workflows
    case "pipelines.list":     return { method: "GET", path: `/opportunities/pipelines?locationId=${a.locationId}` };
    case "opportunities.list": return { method: "GET", path: `/opportunities/search?location_id=${a.locationId}&limit=50` };
    case "opportunities.create": return { method: "POST", path: `/opportunities/`, body: { locationId: a.locationId, pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId, name: a.name, status: a.status ?? "open", contactId: a.contactId, monetaryValue: a.monetaryValue ? Number(a.monetaryValue) : undefined } };
    case "opportunities.move":   return { method: "PUT", path: `/opportunities/${a.id}`, body: { pipelineId: a.pipelineId, pipelineStageId: a.pipelineStageId } };
    case "opportunities.status": return { method: "PUT", path: `/opportunities/${a.id}/status`, body: { status: a.status } };
    case "workflows.list":     return { method: "GET", path: `/workflows/?locationId=${a.locationId}` };
    case "workflows.enroll":   return { method: "POST", path: `/contacts/${a.contactId}/workflow/${a.workflowId}`, body: {} };
    // notes & tasks on a contact
    case "notes.create":       return { method: "POST", path: `/contacts/${a.contactId}/notes`, body: { body: a.body } };
    case "tasks.create":       return { method: "POST", path: `/contacts/${a.contactId}/tasks`, body: { title: a.title, body: a.body ?? "", dueDate: a.dueDate, completed: false } };
    default: return null;
  }
}

const OP_CATALOG = `
locations.list · locations.create{name,phone?,address?,city?,state?} · locations.update{id,name?,phone?,email?,address?,city?,state?,postalCode?,website?,timezone?} · locations.delete{id}
contacts.list{locationId,query?} · contacts.create{locationId,name,phone?,email?} · contacts.update{id,name?,phone?,email?} · contacts.delete{id} · contacts.tag{id,tags}
conversations.list{locationId} · conversations.messages{id} · conversations.send{contactId,type(SMS|Email),message}
pipelines.list{locationId} · opportunities.list{locationId} · opportunities.create{locationId,pipelineId,pipelineStageId,name,contactId?,monetaryValue?} · opportunities.move{id,pipelineId,pipelineStageId} · opportunities.status{id,status(open|won|lost|abandoned)}
workflows.list{locationId} · workflows.enroll{contactId,workflowId} · notes.create{contactId,body} · tasks.create{contactId,title,dueDate?}
`.trim();

async function callGHL(op: string, args: Record<string, string>) {
  const spec = opToRequest(op, args);
  if (!spec) return json({ error: `unknown op: ${op}` }, 400);
  if (!GHL_API_KEY) return json({ error: "GHL_API_KEY not set" }, 500);
  // locations.* are agency-level; everything else is sub-account data → use a location token.
  const token = op.startsWith("locations.") ? GHL_API_KEY : await locationToken(args.locationId || "");
  const r = await fetch(`${GHL_BASE}${spec.path}`, {
    method: spec.method,
    headers: ghlHeaders(token),
    body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
  });
  const text = await r.text();
  let data: unknown; try { data = JSON.parse(text); } catch { data = text; }
  return json({ ok: r.ok, status: r.status, data });
}

async function aiPlan(command: string) {
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);
  const system =
    `You translate an agency owner's plain-English command into ONE action against their GoHighLevel account.\n` +
    `Choose exactly one op from this catalog and fill its args. Never invent ops or args.\n\nOPS:\n${OP_CATALOG}\n\n` +
    `Reply ONLY as compact JSON: {"op":"<op>","args":{...},"summary":"<one sentence describing exactly what will happen>","confidence":0-1,"clarify":"<a question if the command is ambiguous, else empty>"}.\n` +
    `If a required id/locationId isn't known, put a placeholder and set clarify to ask for it. Destructive ops (delete) must have a clear summary.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: command }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
  });
  if (!r.ok) return json({ error: "planner error", detail: (await r.text()).slice(0, 300) }, 502);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
  let plan: unknown; try { plan = JSON.parse(raw); } catch { plan = { error: "could not parse plan", raw }; }
  return json({ plan });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = await requireAdmin(req);
  if (!admin.ok) return json({ error: "not authorized", reason: admin.reason }, 403);

  let body: { op?: string; args?: Record<string, string>; command?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  if (body.op === "ai.plan") return aiPlan((body.command ?? "").slice(0, 1000));
  if (!body.op) return json({ error: "op required" }, 400);
  return callGHL(body.op, body.args ?? {});
});
