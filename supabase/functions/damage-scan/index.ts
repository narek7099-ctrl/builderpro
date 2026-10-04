// damage-scan — reads 1-3 homeowner photos of damage for one trade and returns
// a short damage report with boxes around what it sees. Called by the public
// embed/damage-<trade>.html pages (anon key, no sign-in: homeowners use it).
//
//   POST { trade, tradeName?, images:[{mime,data(base64)}], answers?, types?,
//          ranges:{maint:[lo,hi],repair:[lo,hi],major:[lo,hi]}, owner? }
//   -> { ok:true, model, damages:[{type,severity,box:[x,y,w,h],confidence,photo}],
//        cause, urgency, repair, estimate:{low,high}, insurance }
//
// Same provider pattern as blueprint-ai / supply-scan: Gemini vision with a
// response schema. Boxes are normalised 0..1 of the photo they're on. The
// estimate is clamped to the trade's price ranges the page sends (the owner's
// own calculator overrides when they have them), so the model can't quote a
// number outside what that contractor charges. The page has a 20 s timeout
// and a rules-based fallback, so any failure here just returns ok:false.
//
// Deploy: supabase functions deploy damage-scan --no-verify-jwt
//   (or keep JWT verification on: the page sends the anon key as Bearer)
// Secrets: GEMINI_API_KEY (already set for blueprint-ai / supply-scan)
//          DAMAGE_MODEL optional, defaults to gemini-2.5-flash (fast enough for the 20 s budget)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MODEL = Deno.env.get("DAMAGE_MODEL") ?? "gemini-2.5-flash";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const TRADES = ["roofing", "hvac", "countertops", "trim", "painting", "pools", "landscaping", "plumbing", "electrical", "general", "concrete", "flooring"];
const OK_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 3;
const MAX_BYTES = 4 * 1024 * 1024; // per image; the page sends ~1024px JPEGs (~150 KB)
const SEVERITY = ["minor", "moderate", "severe"];

const SCHEMA = {
  type: "OBJECT",
  properties: {
    damages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", description: "short name of the damage, e.g. Missing shingles, Hairline crack, Water stain" },
          severity: { type: "STRING", enum: SEVERITY },
          photo: { type: "INTEGER", description: "0-based index of the photo this box is on" },
          box: { type: "ARRAY", items: { type: "NUMBER" }, description: "[x, y, width, height] of the damaged area, each 0..1 of the photo's width/height, origin top-left" },
          confidence: { type: "NUMBER", description: "0..1" },
        },
        required: ["type", "severity", "photo", "box", "confidence"],
      },
    },
    cause: { type: "STRING", description: "one plain sentence: the most likely cause" },
    urgency: { type: "STRING", description: "one short line starting with Urgent, Soon or Plan it, and a timeframe" },
    repair: { type: "STRING", description: "one or two plain sentences: the recommended repair" },
    estimate: { type: "OBJECT", properties: { low: { type: "NUMBER" }, high: { type: "NUMBER" } }, required: ["low", "high"] },
    insurance: { type: "STRING", description: "one or two sentences: whether an insurance claim is likely worthwhile and why" },
  },
  required: ["damages", "cause", "urgency", "repair", "estimate", "insurance"],
};

type Range = [number, number];
const rng = (v: unknown, d: Range): Range => {
  const a = Array.isArray(v) ? v.map(Number) : [];
  return a.length === 2 && a.every((n) => isFinite(n) && n >= 0) && a[1] >= a[0] ? [a[0], a[1]] : d;
};

const prompt = (trade: string, types: string[], ranges: Record<string, Range>, answers: Record<string, string>) => `You are an experienced ${trade} contractor looking at a homeowner's photos of possible damage, to give them a quick, honest first read.

Rules:
- Only report damage you can actually see. For each, draw a tight box around it: [x, y, width, height] as fractions 0..1 of that photo, origin top-left, and say which photo (0-based).
- If the photos don't show ${trade} damage, or are too dark/blurry to tell, return an empty damages list and say so in cause. Never invent damage.
- At most 6 damages. Severity is minor, moderate or severe. Confidence 0..1.
- Typical damage types for this trade include: ${types.join(", ") || "any"}.
- Estimate in USD for the recommended repair, within this contractor's price ranges: small fix ${ranges.maint[0]}-${ranges.maint[1]}, repair ${ranges.repair[0]}-${ranges.repair[1]}, major/replacement ${ranges.major[0]}-${ranges.major[1]}. Pick the range that matches what you see.
- Insurance: storm, wind, hail, fire, sudden accidental damage are often covered; wear, age and slow leaks usually are not. Be clear it's not a coverage decision.
- Plain language for a homeowner. No markdown.
${Object.keys(answers).length ? "The homeowner said: " + Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join("; ") : ""}`;

// --- rate limits (per isolate). Each scan is a paid AI call on a public page,
// so one visitor gets a few scans, and the whole function has a ceiling.
const hits = new Map<string, number[]>();
function over(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const a = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (a.length >= max) { hits.set(key, a); return true; }
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 864e5) hits.delete(k);
  return false;
}
const MIN = 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (!GEMINI_API_KEY) return json({ ok: false, error: "not_configured", reason: "GEMINI_API_KEY is not set on this project." });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* no body */ }

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "anon";
  // 3 scans per 10 minutes and 10 a day per visitor; 600 an hour overall
  if (over("ip10:" + ip, 3, 10 * MIN) || over("ipday:" + ip, 10, 1440 * MIN) || over("all", 600, 60 * MIN)) {
    return json({ ok: false, error: "rate_limited", reason: "You've run a few scans already. Please try again later, or contact the contractor for a free inspection." }, 429);
  }

  const trade = String(b.trade ?? "");
  if (!TRADES.includes(trade)) return json({ ok: false, error: "bad_trade" }, 400);
  const tradeName = String(b.tradeName ?? trade).slice(0, 40);
  const imgs = (Array.isArray(b.images) ? b.images : []).slice(0, MAX_IMAGES) as { mime?: string; data?: string }[];
  if (!imgs.length) return json({ ok: false, error: "no_images" }, 400);
  for (const i of imgs) {
    if (!OK_MIME.includes(String(i.mime ?? ""))) return json({ ok: false, error: "bad_type" }, 400);
    if (!i.data || String(i.data).length * 0.75 > MAX_BYTES) return json({ ok: false, error: "too_big" }, 413);
  }
  const r0 = (b.ranges ?? {}) as Record<string, unknown>;
  const ranges = { maint: rng(r0.maint, [150, 500]), repair: rng(r0.repair, [400, 2500]), major: rng(r0.major, [4000, 20000]) };
  const types = (Array.isArray(b.types) ? b.types : []).map((t) => String(t).slice(0, 60)).slice(0, 8);
  const answers: Record<string, string> = {};
  const a0 = (b.answers ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(a0).slice(0, 8)) answers[k.slice(0, 30)] = String(a0[k]).slice(0, 120);

  const parts: unknown[] = imgs.map((i) => ({ inlineData: { mimeType: i.mime, data: i.data } }));
  parts.push({ text: `These are ${imgs.length} photo(s), in order (photo 0${imgs.length > 1 ? ".." + (imgs.length - 1) : ""}). Report the ${tradeName} damage.` });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 18000); // the page gives up at 20 s
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt(tradeName, types, ranges, answers) }] },
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    return json({ ok: false, error: "unreachable", reason: String((e as Error).message ?? e) });
  }
  clearTimeout(timer);
  if (!r.ok) return json({ ok: false, error: "read_failed", reason: `The reader returned ${r.status}.` });

  const out = await r.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let a: Record<string, unknown>;
  try { a = JSON.parse(text); } catch { return json({ ok: false, error: "unparsable" }); }

  const str = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
  const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };
  const c01 = (v: unknown) => Math.max(0, Math.min(1, num(v)));
  const damages = (Array.isArray(a.damages) ? a.damages : []).slice(0, 6).map((d: Record<string, unknown>) => {
    const bx = Array.isArray(d.box) ? d.box.map(c01) : [];
    let box: number[] | null = bx.length === 4 ? bx : null;
    if (box) { box[2] = Math.min(box[2], 1 - box[0]); box[3] = Math.min(box[3], 1 - box[1]); if (box[2] < 0.01 || box[3] < 0.01) box = null; }
    const photo = Math.max(0, Math.min(imgs.length - 1, Math.round(num(d.photo))));
    return { type: str(d.type, 60), severity: SEVERITY.includes(String(d.severity)) ? String(d.severity) : "moderate", photo, box, confidence: c01(d.confidence) };
  }).filter((d) => d.type);

  // the number never leaves the contractor's own ranges
  const lo = ranges.maint[0], hi = ranges.major[1];
  const e = (a.estimate ?? {}) as Record<string, unknown>;
  let el = num(e.low), eh = num(e.high);
  if (!(el > 0 && eh >= el)) { el = ranges.repair[0]; eh = ranges.repair[1]; }
  el = Math.max(lo, Math.min(hi, el)); eh = Math.max(el, Math.min(hi, eh));

  return json({
    ok: true, model: MODEL, damages,
    cause: str(a.cause), urgency: str(a.urgency, 160), repair: str(a.repair), insurance: str(a.insurance),
    estimate: { low: Math.round(el), high: Math.round(eh) },
  });
});
