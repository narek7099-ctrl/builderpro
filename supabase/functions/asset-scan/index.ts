// asset-scan: reads an equipment nameplate from a photo, and answers
// questions about a piece of equipment.
//
//   { op:"scan", mime, data }               -> { ok, plate:{...} }
//       data is a base64 photo of the data plate / rating label. Returns the
//       make, model and serial as printed, what the equipment is, its size,
//       and the date it was made (printed, or decoded from the serial number
//       using the manufacturer's own date code), with a confidence.
//   { op:"ask", asset:{...}, question, history? } -> { ok, answer }
//       "Ask AI" on an equipment record: a short, practical answer for the
//       tech standing in front of it (specs, common faults, parts, what to
//       check). Uses only what the record holds plus general knowledge.
//   { op:"remind", contactId, nextService:"YYYY-MM-DD" } -> { ok, set }
//       puts the equipment's next service date on the customer in the
//       contractor's own HighLevel (field next_service_date), which is what
//       the "Maintenance Reminder" workflow texts them from.
//
// Signed-in users only. Uses the Gemini key the AI receptionist already has.
//
// Deploy: supabase functions deploy asset-scan

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SCAN_MODEL = Deno.env.get("ASSET_SCAN_MODEL") ?? "gemini-3.8-flash";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const OK_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_BYTES = 8 * 1024 * 1024;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const CATEGORIES = ["ac_condenser", "heat_pump", "furnace", "air_handler", "package_unit", "rooftop_unit", "mini_split", "boiler",
  "water_heater_tank", "water_heater_tankless", "water_softener", "well_pump", "sump_pump", "pool_pump", "pool_heater", "pool_filter",
  "electrical_panel", "generator", "ev_charger", "solar_inverter", "battery", "roof", "garage_door_opener", "appliance", "other"];

const PLATE = {
  type: "OBJECT",
  properties: {
    manufacturer: { type: "STRING", description: "brand as printed (Trane, Carrier, Rheem, Lennox, A.O. Smith...). Empty if not printed." },
    model_no: { type: "STRING", description: "model number exactly as printed, empty if unreadable" },
    serial_no: { type: "STRING", description: "serial number exactly as printed, empty if unreadable" },
    category: { type: "STRING", enum: CATEGORIES },
    name: { type: "STRING", description: "a short plain name a homeowner would recognise, brand first: e.g. 'Trane 3-ton heat pump', 'Rheem 50-gal gas water heater', 'Trane 50-ton IntelliPak rooftop unit'" },
    capacity: { type: "STRING", description: "size: tons, BTU/h, gallons, amps, kW. Derive tons from the model number's BTU code when that's the convention (e.g. 036 = 3 ton). Empty if unknown." },
    fuel: { type: "STRING", description: "electric, natural gas, propane, oil, or empty" },
    refrigerant: { type: "STRING", description: "R-410A, R-22, R-454B, R-32... empty if none printed" },
    voltage: { type: "STRING", description: "e.g. 208/230V 1ph 60Hz, empty if none" },
    mfg_date: { type: "STRING", description: "date of manufacture as YYYY-MM-DD (use the 1st of the month if only month/year is known, Jan 1 if only the year). Printed date first; otherwise decode the serial using that manufacturer's date code. Empty if it can't be worked out." },
    mfg_date_source: { type: "STRING", enum: ["printed", "serial_decoded", "unknown"] },
    date_note: { type: "STRING", description: "one short sentence on how the date was read or decoded, e.g. 'Carrier serial 2316E: week 16 of 2016'" },
    life_years: { type: "NUMBER", description: "typical expected service life in years for this kind and grade of equipment" },
    confidence: { type: "NUMBER", description: "0 to 1, how legible the plate was" },
    note: { type: "STRING", description: "anything unreadable or doubtful, one short sentence, empty if clean" },
  },
  required: ["manufacturer", "model_no", "serial_no", "category", "name", "mfg_date", "mfg_date_source", "life_years", "confidence"],
};

const SCAN_PROMPT = `You are reading the data plate (nameplate / rating label) on a piece of home or building equipment, photographed by a contractor's technician on site.

Rules:
- Copy the model and serial numbers EXACTLY as printed, character for character. Watch 0/O, 1/I, 5/S, 8/B. Never invent or "fix" one. If a character is unreadable, leave the field empty and say so in note.
- The model number is labelled Model, Model No, M/N or MOD. The serial is labelled Serial, Serial No, S/N or SER.
- Manufacture date: use a printed date if there is one (Mfg Date, Date of Manufacture). Otherwise decode the serial with the manufacturer's real date code, for example:
  Carrier/Bryant/Payne: first 4 digits are week then year (2316 = week 23 of 2016).
  Trane/American Standard: since 2010 the first 2 digits are the year (13xxxx = 2013); older use a letter code.
  Lennox: digits 3-4 are the year (5815... = 2015).
  Goodman/Amana/Daikin: first 2 digits year, next 2 month (1408 = Aug 2014).
  Rheem/Ruud: the date code is in the first characters, and the convention differs by product line, so decode carefully and explain it in date_note.
  York/Coleman: letters for month and year by series.
  A.O. Smith/State: first 2 digits year, next 2 week.
  Bradford White: first letter year (repeats every 20 years), second letter month.
  If you're not sure of the convention, say so and lower confidence; never present a guess as certain.
- Name it plainly, brand first, with the size.
- life_years: a realistic typical lifespan (AC/heat pump 12-15, furnace 15-20, tank water heater 8-12, tankless 18-20, boiler 20-30, rooftop unit 15-20, mini split 12-15, pool pump 8-12, panel 30-40, generator 20-30, asphalt roof 20-25).
- If the photo is not a nameplate or is unreadable, return confidence below 0.4 and explain in note.`;

async function userOf(req: Request): Promise<string> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return "";
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON || SB_SERVICE, Authorization: auth } });
    if (!r.ok) return "";
    return String((await r.json())?.id ?? "");
  } catch { return ""; }
}
async function take(key: string, max: number, windowSec: number): Promise<boolean> {
  if (!SB_SERVICE) return true;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/rate_take`, { method: "POST", headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_bucket: "asset-scan", p_key: key, p_max: max, p_window_sec: windowSec }) });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch { return true; }
}
/* ---------- the contractor's own HighLevel, for the service reminder ---------- */
const GHL_BASE = "https://services.leadconnectorhq.com";
const HOUSE_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const one = async (path: string): Promise<Row | null> => {
  try { const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: sbH }); return r.ok ? ((await r.json())[0] ?? null) : null; } catch { return null; }
};
async function ownerOf(uid: string): Promise<string> {
  const tm = await one(`team_members?member=eq.${uid}&accepted_at=not.is.null&select=owner,role&limit=1`);
  if (tm && tm.role === "sub") return "";
  return String(tm?.owner ?? uid);
}
async function ownerLoc(owner: string): Promise<string> {
  const [a, b] = await Promise.all([
    one(`accounts?user_id=eq.${owner}&select=ghl_location_id&limit=1`),
    one(`ai_brain?owner=eq.${owner}&select=ghl_location_id&limit=1`),
  ]);
  const loc = String(a?.ghl_location_id || b?.ghl_location_id || "");
  if (!loc) return "";
  if (HOUSE_LOC && loc === HOUSE_LOC) {
    const r = await fetch(`${SB_URL}/rest/v1/ai_config?key=in.(ghl_events_owner,ghl_house_owners)&select=value`, { headers: sbH }).catch(() => null);
    const rows: Row[] = r && r.ok ? await r.json() : [];
    if (!rows.flatMap((x) => String(x.value ?? "").split(",")).map((x) => x.trim()).includes(owner)) return "";
  }
  return loc;
}
async function ghlToken(loc: string): Promise<string> {
  const k = await one(`ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token&limit=1`);
  if (k?.token) return String(k.token);
  const env = Deno.env.get(`GHL_TOKEN_${loc}`); if (env) return env;
  if (loc === HOUSE_LOC && GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST", headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(), signal: AbortSignal.timeout(6000),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return String(d.access_token); }
    } catch { /* none */ }
  }
  return "";
}
async function remind(b: Row, uid: string) {
  const owner = await ownerOf(uid);
  if (!owner) return json({ ok: false, error: "not allowed" }, 403);
  const next = isoDate(b.nextService) || (/^\d{4}-\d{2}-\d{2}$/.test(str(b.nextService, 10)) ? str(b.nextService, 10) : "");
  let cid = str(b.contactId, 60);
  if (!cid || !next) return json({ ok: true, set: false, reason: "nothing to set" });
  if (UUID.test(cid)) { const c = await one(`contacts?id=eq.${cid}&owner=eq.${owner}&select=ghl_id&limit=1`); cid = String(c?.ghl_id ?? ""); }
  if (!cid) return json({ ok: true, set: false, reason: "no_contact" });
  const loc = await ownerLoc(owner);
  if (!loc) return json({ ok: true, set: false, reason: "no_highlevel" });
  const t = await ghlToken(loc);
  if (!t) return json({ ok: true, set: false, reason: "no_token" });
  try {
    const r = await fetch(`${GHL_BASE}/contacts/${cid}`, { method: "PUT", headers: { Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: [{ key: "next_service_date", field_value: next }] }) });
    return json({ ok: true, set: r.ok, reason: r.ok ? "" : `highlevel ${r.status}` });
  } catch { return json({ ok: true, set: false, reason: "unreachable" }); }
}

/* Google retires model names (gemini-2.5-flash is closed to new keys), so try
   the configured one, then the current ones; a model that rejects the thinking
   setting is asked again without it */
const MODELS = [...new Set([SCAN_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"].filter(Boolean))];
let goodModel = "";
async function gemini(body: Row, timeoutMs = 25000): Promise<{ ok: boolean; text: string; status?: number; model?: string }> {
  let last = 0;
  for (const m of goodModel ? [goodModel, ...MODELS.filter((x) => x !== goodModel)] : MODELS) {
    let b = body;
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.ok) {
          goodModel = m;
          const out = await r.json();
          return { ok: true, model: m, text: out?.candidates?.[0]?.content?.parts?.map((p: { text?: string; thought?: boolean }) => p.thought ? "" : (p.text ?? "")).join("") ?? "" };
        }
        last = r.status;
        if (r.status === 400 && b.generationConfig?.thinkingConfig) { const gc = { ...b.generationConfig }; delete gc.thinkingConfig; b = { ...b, generationConfig: gc }; continue; }
      } catch { last = 0; }
      break;
    }
    if (last !== 404 && last !== 400) break;
  }
  return { ok: false, text: "", status: last };
}
const str = (v: unknown, n = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const isoDate = (v: unknown) => { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) > 1950 && Date.parse(s) <= Date.now() + 864e5 * 400 ? s : ""; };

async function scan(b: Row) {
  const mime = str(b.mime, 40), data = String(b.data ?? "");
  if (!OK_MIME.includes(mime)) return json({ ok: false, error: "bad_type", reason: "Send a photo of the nameplate." });
  if (!data) return json({ ok: false, error: "empty", reason: "Nothing to read." });
  if (data.length * 0.75 > MAX_BYTES) return json({ ok: false, error: "too_big", reason: "That photo is over 8MB. Take it again at a smaller size." });
  const g = await gemini({
    systemInstruction: { parts: [{ text: SCAN_PROMPT }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data } }, { text: "Read this nameplate." }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: PLATE, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 1024 } },
  });
  if (!g.ok) return json({ ok: false, error: "read_failed", reason: g.status ? `The reader returned ${g.status}. Try again.` : "The reader didn't answer in time. Try again." });
  let p: Row;
  try { p = JSON.parse(g.text); } catch { return json({ ok: false, error: "unparsable", reason: "Couldn't read that clearly. Try a straighter photo with no glare." }); }
  const life = Number(p.life_years);
  return json({
    ok: true, model: g.model,
    plate: {
      manufacturer: str(p.manufacturer, 60), model_no: str(p.model_no, 60), serial_no: str(p.serial_no, 60),
      category: CATEGORIES.includes(String(p.category)) ? String(p.category) : "other",
      name: str(p.name, 90), capacity: str(p.capacity, 40), fuel: str(p.fuel, 30), refrigerant: str(p.refrigerant, 20), voltage: str(p.voltage, 40),
      mfg_date: isoDate(p.mfg_date), mfg_date_source: ["printed", "serial_decoded"].includes(String(p.mfg_date_source)) ? String(p.mfg_date_source) : "unknown",
      date_note: str(p.date_note, 200), life_years: isFinite(life) && life > 0 && life < 80 ? Math.round(life) : 0,
      confidence: Math.max(0, Math.min(1, Number(p.confidence) || 0)), note: str(p.note, 200),
    },
  });
}

const ASK_PROMPT = `You are a senior field technician helping a contractor's tech who is standing in front of a piece of equipment. Answer in plain, practical language: short paragraphs or a short list, no more than about 180 words unless asked for detail.
- Use the equipment record you're given (make, model, serial, age, size, refrigerant, service history).
- Give specific, useful things: what the model is, typical specs, common failures for that model or family, what to check first, typical part names, maintenance steps, safety notes.
- If you aren't sure about a model-specific fact, say "check the installation manual" rather than guessing. Never invent part numbers.
- Safety first: mention lockout/disconnect power, gas, refrigerant handling (EPA 608) where it matters.
- No markdown headings, no emojis.`;

async function ask(b: Row) {
  const a: Row = (b.asset && typeof b.asset === "object") ? b.asset : {};
  const q = str(b.question, 600);
  if (!q) return json({ ok: false, error: "empty", reason: "Ask a question." });
  const rec = ["name", "category", "make", "model", "serial", "capacity", "fuel", "refrigerant", "voltage", "location", "installed_on", "mfg_date", "age", "last_service", "notes"]
    .map((k) => a[k] ? `${k}: ${str(a[k], 300)}` : "").filter(Boolean).join("\n");
  const hist = Array.isArray(a.history) ? a.history.slice(0, 8).map((h: Row) => `- ${str(h.at, 10)} ${str(h.kind, 20)}: ${str(h.summary, 200)}${h.condition ? " (condition " + str(h.condition, 10) + ")" : ""}`).join("\n") : "";
  const turns = (Array.isArray(b.history) ? b.history : []).slice(-6).map((t: Row) => ({ role: t.role === "model" ? "model" : "user", parts: [{ text: str(t.text, 1500) }] }));
  const g = await gemini({
    systemInstruction: { parts: [{ text: ASK_PROMPT + "\n\nEQUIPMENT RECORD\n" + (rec || "(nothing recorded yet)") + (hist ? "\n\nSERVICE HISTORY\n" + hist : "") }] },
    contents: [...turns, { role: "user", parts: [{ text: q }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  }, 20000);
  if (!g.ok || !g.text.trim()) return json({ ok: false, error: "no_answer", reason: "No answer just now. Try again." });
  return json({ ok: true, model: g.model, answer: g.text.trim().slice(0, 4000) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Row = {};
  try { b = await req.json(); } catch { /* empty */ }
  const uid = await userOf(req);
  if (!uid) return json({ ok: false, error: "sign in required" }, 401);
  if (b.op === "remind") return remind(b, uid);
  if (!GEMINI_API_KEY) return json({ ok: false, error: "not_configured", reason: "The AI reader isn't switched on yet." });
  if (!(await take(uid, b.op === "ask" ? 120 : 60, 3600))) return json({ ok: false, error: "too_many", reason: "That's a lot of scans in an hour. Try again in a bit." }, 429);
  if (b.op === "scan") return scan(b);
  if (b.op === "ask") return ask(b);
  return json({ ok: false, error: "unknown op" }, 400);
});
