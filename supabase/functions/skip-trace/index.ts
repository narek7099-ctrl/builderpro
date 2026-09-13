// skip-trace — reveals the owner name / phone / email for a Lead Radar address
// using a licensed data provider (BatchData). The API key stays server-side and
// every lookup costs money, so the portal confirms before calling.
//
// COMPLIANCE: skip-traced numbers are for manual CALLS and direct mail. Do NOT
// feed them into automated SMS — cold texts to traced numbers are TCPA risk.
//
// Deploy:  supabase functions deploy skip-trace --no-verify-jwt
// Secrets: SKIPTRACE_API_KEY   (from app.batchdata.com — API token)

const API_KEY = Deno.env.get("SKIPTRACE_API_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !SB_URL || !SB_SERVICE) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_SERVICE } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? "" } : null;
  } catch { return null; }
}

// only clients WITH an active Radar territory may spend lookups
async function hasTerritory(email: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/radar_territories?email=eq.${encodeURIComponent(email.toLowerCase())}&active=eq.true&select=email`, {
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
    });
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!API_KEY) return json({ ok: false, error: "SKIPTRACE_API_KEY not set — add your BatchData API token in Supabase secrets" }, 500);

  const user = await verifyUser(req);
  if (!user) return json({ ok: false, error: "not signed in" }, 401);
  if (!(await hasTerritory(user.email))) return json({ ok: false, error: "no active Lead Radar territory on this account" }, 403);

  let body: { street?: string; city?: string; state?: string; zip?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const street = (body.street ?? "").toString().slice(0, 120).trim();
  if (!street) return json({ ok: false, error: "street required" }, 400);

  try {
    const r = await fetch("https://api.batchdata.com/api/v1/property/skip-trace", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        requests: [{
          propertyAddress: {
            street,
            city: (body.city ?? "").toString().slice(0, 60),
            state: (body.state ?? "").toString().slice(0, 2),
            zip: (body.zip ?? "").toString().slice(0, 10),
          },
        }],
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: "provider error", status: r.status, detail: JSON.stringify(d).slice(0, 300) }, 502);

    // normalize across BatchData response shapes
    const persons = d?.results?.persons ?? d?.results?.[0]?.persons ?? d?.persons ?? [];
    const p = Array.isArray(persons) && persons.length ? persons[0] : null;
    if (!p) return json({ ok: true, found: false, note: "No owner match for this address." });

    const name = [p?.name?.first, p?.name?.last].filter(Boolean).join(" ") || p?.name?.full || "";
    const phones = (p?.phoneNumbers ?? p?.phones ?? []).map((x: { number?: string; phoneNumber?: string; type?: string; dnc?: boolean }) => ({
      number: x.number || x.phoneNumber || "",
      type: x.type || "",
      dnc: !!x.dnc,
    })).filter((x: { number: string }) => x.number).slice(0, 4);
    const emails = (p?.emails ?? []).map((x: { email?: string } | string) => (typeof x === "string" ? x : x.email || "")).filter(Boolean).slice(0, 3);

    return json({ ok: true, found: true, name, phones, emails });
  } catch (e) {
    return json({ ok: false, error: "request failed", detail: String(e).slice(0, 200) }, 502);
  }
});
