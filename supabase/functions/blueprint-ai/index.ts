// blueprint-ai — reads a blueprint (plan set page, roof plan, floor plan,
// elevation) and returns what a contractor needs from it: what the sheet is,
// the measurements it states, a takeoff of materials, and what to watch for.
//
//   { op:"analyze", mime, data, trade? }  -> { ok, analysis:{...} }
//
// Same shape and key as supply-scan: Gemini vision with a response schema,
// behind the signed-in user's JWT. The numbers it returns are read off the
// drawing or derived from its dimensions and scale, and the prompt makes it
// say which. A takeoff that pretends to precision it does not have is worse
// than none, so anything estimated is marked as estimated.
//
// Deploy: supabase functions deploy blueprint-ai
// Secrets: GEMINI_API_KEY (already set for the receptionist and supply-scan)
//          BLUEPRINT_MODEL optional, defaults to gemini-2.5-pro

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("BLUEPRINT_MODEL") ?? "gemini-2.5-pro";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const OK_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 18 * 1024 * 1024;   // Gemini's inline request limit is 20 MB

const SCHEMA = {
  type: "OBJECT",
  properties: {
    sheet_type: { type: "STRING", description: "roof plan, floor plan, elevation, site plan, section, detail, electrical, plumbing, mechanical, or other" },
    summary: { type: "STRING", description: "two or three plain sentences: what this drawing shows and what it means for the job" },
    scale: { type: "STRING", description: "the drawing scale as printed, empty if none" },
    measurements: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING", description: "e.g. Roof area, Ridge length, Living area, Wall height, Pitch" },
          value: { type: "STRING", description: "the figure with its unit, e.g. 2,480 sq ft, 42 ft, 6/12" },
          source: { type: "STRING", description: "printed (read off the drawing) or estimated (derived from dimensions and scale)" },
        },
        required: ["label", "value", "source"],
      },
    },
    takeoff: {
      type: "ARRAY",
      description: "materials this drawing implies for the contractor's trade, with quantities",
      items: {
        type: "OBJECT",
        properties: {
          item: { type: "STRING" },
          qty: { type: "NUMBER" },
          unit: { type: "STRING", description: "sq, bundle, roll, lf, sq ft, ea, sheet, gal" },
          basis: { type: "STRING", description: "one short line on how the quantity was reached, including waste allowed" },
        },
        required: ["item", "qty", "unit"],
      },
    },
    flags: { type: "ARRAY", items: { type: "STRING" }, description: "things to check or watch: missing dimensions, code items, unusual details, conflicts between sheets" },
    confidence: { type: "NUMBER", description: "0 to 1, how legible and complete the drawing was" },
  },
  required: ["sheet_type", "summary", "measurements", "takeoff", "flags", "confidence"],
};

const prompt = (trade: string) => `You are an experienced ${trade || "general"} contractor and estimator reading a construction drawing for a job you are pricing.

Return what matters to the contractor. Rules:
- Read printed dimensions, notes, pitch symbols and the scale exactly. Mark those measurements source "printed".
- Where you work a figure out from dimensions and the scale (an area, a length of ridge or eave, a count), mark it "estimated" and keep the arithmetic sensible.
- The takeoff is for the ${trade || "contractor's"} trade. Quantities include a normal waste allowance, and each line says in "basis" how it was reached.
- Never invent a dimension the drawing does not support. If the sheet is unreadable or not a construction drawing, say so in summary, return empty lists and confidence below 0.4.
- flags: anything the contractor should check before quoting, such as a missing dimension, an unusual detail, a likely code item or a conflict.
- Plain language, no filler.`;

async function userFromJwt(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!GEMINI_API_KEY) return json({ ok: false, error: "not_configured", reason: "GEMINI_API_KEY is not set on this project." });

  let b: { op?: string; mime?: string; data?: string; trade?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }
  if (b.op !== "analyze") return json({ ok: false, error: "unknown op" }, 400);

  const user = await userFromJwt(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  const mime = String(b.mime ?? "");
  const data = String(b.data ?? "");
  if (!OK_MIME.includes(mime)) return json({ ok: false, error: "bad_type", reason: "Send a PDF or an image of the drawing." });
  if (!data) return json({ ok: false, error: "empty", reason: "Nothing to read." });
  if (data.length * 0.75 > MAX_BYTES) return json({ ok: false, error: "too_big", reason: "That file is over 18 MB. Send the one sheet you want read." });

  const body = {
    systemInstruction: { parts: [{ text: prompt(String(b.trade ?? "").slice(0, 40)) }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data } }, { text: "Read this drawing." }] }],
    generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 8192 },
  };

  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ ok: false, error: "unreachable", reason: String((e as Error).message ?? e) });
  }
  if (!r.ok) return json({ ok: false, error: "read_failed", reason: `The reader returned ${r.status}.`, detail: (await r.text()).slice(0, 400) });

  const out = await r.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let a: Record<string, unknown>;
  try { a = JSON.parse(text); } catch { return json({ ok: false, error: "unparsable", reason: "The reader did not return a clean result. Try a sharper scan of one sheet." }); }

  const str = (v: unknown) => String(v ?? "").trim();
  const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; };
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  return json({
    ok: true,
    model: MODEL,
    analysis: {
      sheet_type: str(a.sheet_type) || "other",
      summary: str(a.summary),
      scale: str(a.scale),
      measurements: arr(a.measurements).map((m) => ({ label: str(m.label), value: str(m.value), source: str(m.source) === "printed" ? "printed" : "estimated" })).filter((m) => m.label && m.value).slice(0, 24),
      takeoff: arr(a.takeoff).map((t) => ({ item: str(t.item), qty: num(t.qty), unit: str(t.unit) || "ea", basis: str(t.basis) })).filter((t) => t.item).slice(0, 40),
      flags: (Array.isArray(a.flags) ? a.flags : []).map(str).filter(Boolean).slice(0, 12),
      confidence: Math.max(0, Math.min(1, num(a.confidence))),
      analyzed_at: new Date().toISOString(),
    },
  });
});
