// ai-chat — the brain for Nova (Web OS) and Atlas (BuilderPro), now a REAL receptionist.
// Beyond answering from the business's `ai_brain` knowledge, it can now ACT:
//   • capture a lead   → creates the contact (+note) in the business's GoHighLevel account
//   • check openings   → reads live free slots from their booking calendar
//   • book a time      → creates the contact and the appointment in GHL
// Actions only switch on when the brain row has ghl_location_id set (the command
// center's onboarding sets it automatically). Without it, it's a pure Q&A assistant.
//
// Deploy:
//   supabase functions deploy ai-chat --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=AIza... GHL_API_KEY=... GHL_COMPANY_ID=...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-2.5-flash-lite";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const GHL_CLIENT_ID = Deno.env.get("GHL_CLIENT_ID") ?? "";
const GHL_CLIENT_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const ghlHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
const sbHeaders = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };

// --- same token strategy as the agency function: per-location secret → OAuth mint → fallbacks ---
let _agencyTok: { token: string; exp: number } | null = null;
async function agencyOAuthToken(): Promise<string> {
  if (_agencyTok && _agencyTok.exp > Date.now() + 60000) return _agencyTok.token;
  if (!SB_URL || !SB_SERVICE) return "";
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1&select=*`, { headers: sbHeaders });
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row?.refresh_token) return "";
    const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (row.access_token && exp > Date.now() + 60000) { _agencyTok = { token: row.access_token, exp }; return row.access_token; }
    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) return row.access_token ?? "";
    const rr = await fetch(`${GHL_BASE}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ client_id: GHL_CLIENT_ID, client_secret: GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString() });
    const d = await rr.json();
    if (!rr.ok || !d.access_token) return row.access_token ?? "";
    const newExp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    _agencyTok = { token: d.access_token, exp: newExp };
    await fetch(`${SB_URL}/rest/v1/ghl_oauth?id=eq.1`, { method: "PATCH", headers: sbHeaders, body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(newExp).toISOString(), updated_at: new Date().toISOString() }) });
    return d.access_token;
  } catch { return ""; }
}
const locTokenCache: Record<string, string> = {};
async function locationToken(locationId: string): Promise<string> {
  if (!locationId) return "";
  if (locTokenCache[locationId]) return locTokenCache[locationId];
  const perLoc = Deno.env.get("GHL_TOKEN_" + locationId);
  if (perLoc) { locTokenCache[locationId] = perLoc; return perLoc; }
  try {
    const minter = (await agencyOAuthToken()) || GHL_API_KEY;
    if (minter) {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, { method: "POST", headers: { Authorization: `Bearer ${minter}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId }).toString() });
      if (r.ok) { const d = await r.json(); if (d?.access_token) { locTokenCache[locationId] = d.access_token; return d.access_token; } }
    }
  } catch { /* fall through */ }
  return GHL_TOKEN || GHL_API_KEY;
}

async function loadBrain(slug: string): Promise<Record<string, string> | null> {
  if (!slug || !SB_URL || !SB_SERVICE) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ai_brain?slug=eq.${encodeURIComponent(slug)}&select=*`, { headers: sbHeaders });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch { return null; }
}

// --- receptionist actions against the business's GHL account ---
async function actLead(locId: string, a: Record<string, string>): Promise<string> {
  const tok = await locationToken(locId);
  const r = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: locId, name: a.name || "Website visitor", phone: a.phone || undefined, email: a.email || undefined, source: "AI receptionist" }) });
  const d = await r.json().catch(() => ({}));
  const cid = d?.contact?.id || d?.id || "";
  if (r.ok && cid && a.note) {
    await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ body: "AI receptionist: " + a.note }) }).catch(() => {});
  }
  return r.ok ? `Lead saved (contact ${cid}).` : `Could not save the lead (HTTP ${r.status}).`;
}
async function actSlots(locId: string, calId: string, a: Record<string, string>): Promise<string> {
  if (!calId) return "No booking calendar is configured.";
  const tok = await locationToken(locId);
  const start = a.date ? Date.parse(a.date + "T00:00:00Z") : Date.now();
  const end = start + 7 * 86400000;   // look one week ahead
  const r = await fetch(`${GHL_BASE}/calendars/${calId}/free-slots?startDate=${start}&endDate=${end}`, { headers: ghlHeaders(tok) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return `Could not read the calendar (HTTP ${r.status}).`;
  // response is keyed by date: { "2026-08-23": { slots: ["2026-08-23T09:00:00-07:00", ...] }, ... }
  const out: string[] = [];
  for (const k of Object.keys(d)) {
    const s = (d[k]?.slots ?? []) as string[];
    if (Array.isArray(s) && s.length) out.push(`${k}: ${s.slice(0, 6).join(", ")}`);
    if (out.length >= 5) break;
  }
  return out.length ? "Open slots (ISO times):\n" + out.join("\n") : "No open slots in the next 7 days.";
}
async function actBook(locId: string, calId: string, a: Record<string, string>): Promise<string> {
  if (!calId) return "No booking calendar is configured.";
  if (!a.startTime) return "Missing a start time.";
  const tok = await locationToken(locId);
  // 1) make sure the contact exists
  const cr = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: locId, name: a.name || "Booking", phone: a.phone || undefined, email: a.email || undefined, source: "AI receptionist" }) });
  const cd = await cr.json().catch(() => ({}));
  const cid = cd?.contact?.id || cd?.id || cd?.meta?.contactId || "";
  if (!cid) return `Could not create the contact for the booking (HTTP ${cr.status}).`;
  // 2) book the appointment
  const startMs = Date.parse(a.startTime);
  const endTime = a.endTime || new Date(startMs + 30 * 60000).toISOString();
  const r = await fetch(`${GHL_BASE}/calendars/events/appointments`, { method: "POST", headers: ghlHeaders(tok), body: JSON.stringify({ locationId: locId, calendarId: calId, contactId: cid, startTime: a.startTime, endTime, title: (a.name || "Appointment") + " — booked by AI" }) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? `BOOKED ✓ appointment at ${a.startTime} (id ${d?.id || "?"}).` : `Booking failed (HTTP ${r.status}): ${JSON.stringify(d).slice(0, 150)}`;
}

function buildSystem(b: Record<string, string>, canAct: boolean, hasCal: boolean): string {
  const name = b.business_name || b.name || "this business";
  const assistant = b.assistant_name || "Nova";
  const line = (label: string, v?: string) => (v && String(v).trim() ? `${label}: ${v}\n` : "");
  return (
    `You are ${assistant}, the AI receptionist for ${name}` + (b.industry ? `, a ${b.industry} business.` : ".") +
    `\n\nUse ONLY the knowledge below. If something isn't covered, say you'll have the team follow up — never invent prices, guarantees, or policies.\n\n` +
    line("Business", name) + line("Industry", b.industry) + line("Services", b.services) + line("Pricing", b.pricing) +
    line("Hours", b.hours) + line("Service area", b.service_area) + line("Phone", b.phone) + line("Booking link", b.booking_url) +
    line("FAQs", b.faqs) + line("Extra instructions", b.custom_instructions) +
    `\nToday's date: ${new Date().toISOString().slice(0, 10)}.\n` +
    (canAct
      ? `\nYou can also TAKE ACTIONS:\n` +
        `- When a visitor shares contact info or wants a quote/callback → action {"type":"lead","name","phone","email","note"} (note = what they want).\n` +
        (hasCal
          ? `- When they ask about availability/openings → action {"type":"slots","date":"YYYY-MM-DD"} and I'll give you real open times to relay.\n` +
            `- When they pick a time AND you have their name + phone or email → action {"type":"book","name","phone","email","startTime":"<ISO from the slots list>"}.\n` +
            `- NEVER book without name + (phone or email) + an exact slot time. Ask for what's missing first.\n`
          : ``) +
        `Only one action per turn. Set action to null when just talking.\n`
      : `\n`) +
    `Style: ${(b.tone || "friendly").toLowerCase()}. Reply in 2–4 short sentences, plain text (no markdown). Ask a helpful follow-up that moves toward booking or a quote. Speak as ${name}'s own assistant ("we", "our").\n` +
    `Respond ONLY as JSON: {"reply":"<what to say to the visitor>","action":null|{...}}`
  );
}

async function gemini(body: unknown): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  let r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  for (let i = 0; i < 2 && (r.status === 503 || r.status === 429); i++) {
    await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
    r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
  return r;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);

  let payload: { message?: string; slug?: string; business?: Record<string, string> | null; history?: Array<{ role: string; content: string }> };
  try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const message = (payload.message ?? "").toString().slice(0, 2000).trim();
  if (!message) return json({ error: "message required" }, 400);

  const brain = payload.slug ? await loadBrain(payload.slug) : null;
  const b = { ...(brain ?? {}), ...(payload.business ?? {}) } as Record<string, string>;
  const locId = b.ghl_location_id || "";
  const calId = b.booking_calendar_id || "";
  const canAct = !!locId && !!(GHL_API_KEY || GHL_TOKEN || GHL_CLIENT_ID);
  const system = buildSystem(b, canAct, !!calId);

  const history = (Array.isArray(payload.history) ? payload.history : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content).slice(0, 2000) }] }));
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [...history, { role: "user", parts: [{ text: message }] }];

  try {
    // agent loop: up to 2 action rounds (e.g. check slots → relay them; book → confirm)
    for (let round = 0; round < 3; round++) {
      const r = await gemini({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { maxOutputTokens: 500, temperature: 0.6, responseMimeType: "application/json" } });
      if (!r.ok) return json({ error: "model error", detail: (await r.text()).slice(0, 400) }, 502);
      const data = await r.json();
      const raw = (data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "").trim();
      let out: { reply?: string; action?: Record<string, string> | null };
      try { out = JSON.parse(raw); } catch { out = { reply: raw || "I'm here to help — could you tell me a bit more?", action: null }; }
      const act = out.action;

      if (!canAct || !act || !act.type || round === 2) {
        return json({ reply: out.reply || "I'm here to help — could you tell me a bit more about what you need?" });
      }

      // execute the action, feed the result back, and let the model finish its reply
      let result = "";
      if (act.type === "lead") result = await actLead(locId, act);
      else if (act.type === "slots") result = await actSlots(locId, calId, act);
      else if (act.type === "book") result = await actBook(locId, calId, act);
      else result = "Unknown action.";

      contents.push({ role: "model", parts: [{ text: raw }] });
      contents.push({ role: "user", parts: [{ text: `(system — action result, use it to reply to the visitor; do not repeat raw ISO times, phrase them naturally): ${result}` }] });
      // for lead capture, one round is enough — the model's next reply confirms it
    }
    return json({ reply: "I'm here to help — could you tell me a bit more about what you need?" });
  } catch (e) {
    return json({ error: "request failed", detail: String(e).slice(0, 200) }, 502);
  }
});
