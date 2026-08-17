// ai-chat — gives Nova (Web OS) and Atlas (BuilderPro) a real brain.
//
// It loads a business's knowledge from the `ai_brain` table (by slug) and/or takes
// live business context from the request, builds a system prompt, and calls Claude.
// The Anthropic API key stays here as a secret and never reaches the browser.
//
// Deploy:
//   supabase functions deploy ai-chat --no-verify-jwt
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5-20251001";
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
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);

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

  const history = Array.isArray(payload.history) ? payload.history.slice(-10) : [];
  const messages = [
    ...history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
    { role: "user", content: message },
  ];

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 400, system, messages }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "model error", detail: detail.slice(0, 400) }, 502);
    }
    const data = await r.json();
    const reply = (data?.content?.[0]?.text ?? "").trim() ||
      "I'm here to help — could you tell me a bit more about what you need?";
    return json({ reply });
  } catch (e) {
    return json({ error: "request failed", detail: String(e).slice(0, 200) }, 502);
  }
});
