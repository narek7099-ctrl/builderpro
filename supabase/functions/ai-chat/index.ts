// ai-chat — gives Nova (Web OS) and Atlas (BuilderPro) a real brain, using Google
// Gemini's FREE tier. Loads a business's knowledge from `ai_brain` (by slug) and/or
// live request context, builds a system prompt, and calls Gemini. The API key stays
// server-side and never reaches the browser.
//
// Deploy:
//   supabase functions deploy ai-chat --no-verify-jwt
//   supabase secrets set GEMINI_API_KEY=AIza...        (free key from aistudio.google.com)
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "gemini-2.5-flash-lite";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function loadBrain(slug: string): Promise<Record<string, unknown> | null> {
  if (!slug || !SB_URL || !SB_SERVICE) return null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/ai_brain?slug=eq.${encodeURIComponent(slug)}&select=*`,
      { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } },
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

function buildSystem(brain: Record<string, unknown> | null, live: Record<string, unknown> | null): string {
  const b = { ...(brain ?? {}), ...(live ?? {}) } as Record<string, string>;
  const name = b.business_name || b.name || "this business";
  const assistant = b.assistant_name || b.assistant || "Nova";
  const industry = b.industry || "";
  const tone = b.tone || "Friendly";
  const line = (label: string, v?: string) => (v && String(v).trim() ? `${label}: ${v}\n` : "");

  return (
    `You are ${assistant}, the AI receptionist for ${name}` +
    (industry ? `, a ${industry} business.` : ".") +
    `\n\nUse ONLY the knowledge below. If something isn't covered, say you'll have the team follow up, and offer to book — never invent specific prices, guarantees, or policies.\n\n` +
    line("Business", String(name)) +
    line("Industry", industry) +
    line("Services", b.services) +
    line("Pricing", b.pricing) +
    line("Hours", b.hours) +
    line("Service area", b.service_area) +
    line("Phone", b.phone) +
    line("Booking link", b.booking_url) +
    line("FAQs", b.faqs) +
    line("Extra instructions", b.custom_instructions) +
    `\nStyle: ${tone.toLowerCase()}. Reply in 2–4 short sentences, plain text (no markdown). ` +
    `Ask a helpful follow-up question when it moves the conversation toward booking or a quote. ` +
    `Speak as ${name}'s own assistant ("we", "our").`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 500);

  let payload: {
    message?: string;
    slug?: string;
    business?: Record<string, unknown> | null;
    history?: Array<{ role: string; content: string }>;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const message = (payload.message ?? "").toString().slice(0, 2000).trim();
  if (!message) return json({ error: "message required" }, 400);

  const brain = payload.slug ? await loadBrain(payload.slug) : null;
  const system = buildSystem(brain, payload.business ?? null);

  // Gemini uses roles "user" and "model" (not "assistant").
  const history = Array.isArray(payload.history) ? payload.history.slice(-10) : [];
  const contents = [
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content).slice(0, 2000) }],
      })),
    { role: "user", parts: [{ text: message }] },
  ];

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "model error", detail: detail.slice(0, 400) }, 502);
    }
    const data = await r.json();
    const reply =
      (data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "")
        .trim() ||
      "I'm here to help — could you tell me a bit more about what you need?";
    return json({ reply });
  } catch (e) {
    return json({ error: "request failed", detail: String(e).slice(0, 200) }, 502);
  }
});
