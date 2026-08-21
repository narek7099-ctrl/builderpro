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
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-2.5-flash-lite";
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
  // 1) an explicit per-sub-account token secret: GHL_TOKEN_<locationId>
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) { locTokenCache[locationId] = perLoc; return perLoc; }
  // 2) try to mint one from the agency token (works only with OAuth apps)
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
    // forms (read-only: builder is UI-only, but submissions + list are available)
    case "forms.list":         return { method: "GET", path: `/forms/?locationId=${a.locationId}&limit=100` };
    case "forms.submissions":  return { method: "GET", path: `/forms/submissions?locationId=${a.locationId}&limit=100${a.formId ? `&formId=${a.formId}` : ""}` };
    // custom fields (fully editable)
    case "customfields.list":   return { method: "GET", path: `/locations/${a.locationId}/customFields` };
    case "customfields.create": return { method: "POST", path: `/locations/${a.locationId}/customFields`, body: { name: a.name, dataType: a.dataType ?? "TEXT", placeholder: a.placeholder, model: a.model ?? "contact" } };
    case "customfields.update": return { method: "PUT", path: `/locations/${a.locationId}/customFields/${a.id}`, body: { name: a.name, placeholder: a.placeholder } };
    case "customfields.delete": return { method: "DELETE", path: `/locations/${a.locationId}/customFields/${a.id}` };
    // custom values (fully editable)
    case "customvalues.list":   return { method: "GET", path: `/locations/${a.locationId}/customValues` };
    case "customvalues.create": return { method: "POST", path: `/locations/${a.locationId}/customValues`, body: { name: a.name, value: a.value } };
    case "customvalues.update": return { method: "PUT", path: `/locations/${a.locationId}/customValues/${a.id}`, body: { name: a.name, value: a.value } };
    case "customvalues.delete": return { method: "DELETE", path: `/locations/${a.locationId}/customValues/${a.id}` };
    // calendars (fully editable)
    case "calendars.list":   return { method: "GET", path: `/calendars/?locationId=${a.locationId}` };
    case "calendars.create": return { method: "POST", path: `/calendars/`, body: { locationId: a.locationId, name: a.name, description: a.description, slotDuration: a.slotDuration ? Number(a.slotDuration) : 30 } };
    case "calendars.update": return { method: "PUT", path: `/calendars/${a.id}`, body: { name: a.name, description: a.description } };
    case "calendars.delete": return { method: "DELETE", path: `/calendars/${a.id}` };
    // appointments (calendar events)
    case "appointments.list":   return { method: "GET", path: `/calendars/events?locationId=${a.locationId}${a.calendarId ? `&calendarId=${a.calendarId}` : ""}${a.startTime ? `&startTime=${a.startTime}` : ""}${a.endTime ? `&endTime=${a.endTime}` : ""}` };
    case "appointments.create": return { method: "POST", path: `/calendars/events/appointments`, body: { locationId: a.locationId, calendarId: a.calendarId, contactId: a.contactId, startTime: a.startTime, endTime: a.endTime, title: a.title } };
    case "appointments.update": return { method: "PUT", path: `/calendars/events/appointments/${a.id}`, body: { startTime: a.startTime, endTime: a.endTime, title: a.title } };
    case "appointments.delete": return { method: "DELETE", path: `/calendars/events/${a.id}` };
    // tags (account-level, editable)
    case "tags.list":   return { method: "GET", path: `/locations/${a.locationId}/tags` };
    case "tags.create": return { method: "POST", path: `/locations/${a.locationId}/tags`, body: { name: a.name } };
    case "tags.delete": return { method: "DELETE", path: `/locations/${a.locationId}/tags/${a.id}` };
    // products & prices (editable)
    case "products.list":   return { method: "GET", path: `/products/?locationId=${a.locationId}&limit=100` };
    case "products.create": return { method: "POST", path: `/products/`, body: { locationId: a.locationId, name: a.name, productType: a.productType ?? "SERVICE", description: a.description } };
    case "products.update": return { method: "PUT", path: `/products/${a.id}`, body: { locationId: a.locationId, name: a.name, description: a.description } };
    case "products.delete": return { method: "DELETE", path: `/products/${a.id}?locationId=${a.locationId}` };
    // opportunity delete + users
    case "opportunities.delete": return { method: "DELETE", path: `/opportunities/${a.id}` };
    case "users.list": return { method: "GET", path: `/users/?locationId=${a.locationId}` };
    default: return null;
  }
}

const OP_CATALOG = `
locations.list · locations.create{name,phone?,address?,city?,state?} · locations.update{id,name?,phone?,email?,address?,city?,state?,postalCode?,website?,timezone?} · locations.delete{id}
contacts.list{locationId,query?} · contacts.create{locationId,name,phone?,email?} · contacts.update{id,name?,phone?,email?} · contacts.delete{id} · contacts.tag{id,tags}
conversations.list{locationId} · conversations.messages{id} · conversations.send{contactId,type(SMS|Email),message}
pipelines.list{locationId} · opportunities.list{locationId} · opportunities.create{locationId,pipelineId,pipelineStageId,name,contactId?,monetaryValue?} · opportunities.move{id,pipelineId,pipelineStageId} · opportunities.status{id,status(open|won|lost|abandoned)}
workflows.list{locationId} · workflows.enroll{contactId,workflowId} · notes.create{contactId,body} · tasks.create{contactId,title,dueDate?}
forms.list{locationId} · forms.submissions{locationId,formId?}
customfields.list{locationId} · customfields.create{locationId,name,dataType?} · customfields.update{locationId,id,name} · customfields.delete{locationId,id}
customvalues.list{locationId} · customvalues.create{locationId,name,value} · customvalues.update{locationId,id,name,value} · customvalues.delete{locationId,id}
calendars.list{locationId} · calendars.create{locationId,name,slotDuration?} · calendars.update{id,name} · calendars.delete{id}
appointments.list{locationId,calendarId?} · appointments.create{locationId,calendarId,contactId,startTime,endTime,title} · appointments.update{id,startTime?,endTime?,title?} · appointments.delete{id}
tags.list{locationId} · tags.create{locationId,name} · tags.delete{locationId,id}
products.list{locationId} · products.create{locationId,name} · products.update{id,locationId,name} · products.delete{id,locationId}
opportunities.delete{id} · users.list{locationId}
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

async function aiChat(command: string, history: Array<{ role: string; content: string }>) {
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);
  const system =
    `You are the AI operator assistant inside an agency owner's private GoHighLevel command center. ` +
    `You help them run their agency: clients (sub-accounts), contacts, conversations, deals/pipelines, calendars, forms, custom fields, tags, products, and more.\n\n` +
    `You do TWO things:\n` +
    `1) CHAT — answer questions, explain, give advice, be conversational and helpful.\n` +
    `2) ACT — perform ONE action from the ops catalog when the user wants something done.\n\n` +
    `Rules:\n` +
    `- If the user asks something that needs live data (counts, lists, "what's in…"), choose the matching READ op (a *.list / *.messages / *.submissions op) and set readonly=true. The app will run it and send you the data so you can answer.\n` +
    `- For CHANGES (create/update/delete/send/move/enroll/tag/book), propose the action with readonly=false. The owner approves before it runs.\n` +
    `- If you're just answering/chatting, use mode "reply".\n` +
    `- Never invent ops or ids. If you need an id you don't have, ask in "text".\n\n` +
    `OPS:\n${OP_CATALOG}\n\n` +
    `Respond ONLY as compact JSON: {"mode":"reply"|"action","text":"<friendly message to show the user — always include this>","op":"<op or empty>","args":{...},"summary":"<what the action does>","readonly":true|false}.`;
  const contents = [
    ...(Array.isArray(history) ? history : [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-14)
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content).slice(0, 3000) }] })),
    { role: "user", parts: [{ text: command }] },
  ];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
  });
  if (!r.ok) return json({ error: "planner error", detail: (await r.text()).slice(0, 300) }, 502);
  const d = await r.json();
  const raw = d?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
  let plan: unknown; try { plan = JSON.parse(raw); } catch { plan = { mode: "reply", text: raw || "(no reply)" }; }
  return json({ plan });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = await requireAdmin(req);
  if (!admin.ok) return json({ error: "not authorized", reason: admin.reason }, 403);

  let body: { op?: string; args?: Record<string, string>; command?: string; history?: Array<{ role: string; content: string }> };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  if (body.op === "ai.plan") return aiChat((body.command ?? "").slice(0, 2000), body.history ?? []);
  if (!body.op) return json({ error: "op required" }, 400);
  return callGHL(body.op, body.args ?? {});
});
