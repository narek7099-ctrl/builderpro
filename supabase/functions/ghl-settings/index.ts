// Supabase Edge Function: ghl-settings
// Pushes BuilderPro Settings into GoHighLevel (LeadConnector) so the business
// profile + custom values in GHL stay in sync with what the contractor edits
// in the dashboard.
//
// Action (POST JSON body):
//   sync  { company:{name,trade,phone,email,website,address,serviceArea,license},
//           hours:{mon:{open,from,to},...}, autoReply, owner:{name,email,phone} }
//     -> updates the GHL Location business profile (name/phone/email/website/address)
//        and upserts the rest as GHL Custom Values (usable in workflows + templates).
//     returns { ok, location:bool, customValues:{updated,created,failed} }
//
// Env (Supabase → Edge Functions → Secrets):
//   GHL_TOKEN         Private Integration / Location API token (Bearer)
//   GHL_LOCATION_ID   the sub-account (location) id to write to
//   GHL_API_BASE      optional, defaults to https://services.leadconnectorhq.com
//   GHL_API_VERSION   optional, defaults to 2021-07-28
//
// Deploy:  supabase functions deploy ghl-settings --no-verify-jwt
//
// Note: the logo is a device-side image (data URL) and is NOT pushed here —
// GHL needs a hosted media URL, which is a separate upload step.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE = Deno.env.get("GHL_API_BASE") || "https://services.leadconnectorhq.com";
const VERSION = Deno.env.get("GHL_API_VERSION") || "2021-07-28";
const TOKEN = Deno.env.get("GHL_TOKEN") || "";
const LOCATION = Deno.env.get("GHL_LOCATION_ID") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function ghlHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Version: VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

const DAYS: [string, string][] = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
];

function hoursToText(hours: any): string {
  if (!hours || typeof hours !== "object") return "";
  return DAYS.map(([k, label]) => {
    const d = hours[k];
    if (!d || !d.open) return `${label}: Closed`;
    return `${label}: ${d.from || "08:00"}–${d.to || "17:00"}`;
  }).join("\n");
}

// Update the Location business profile. Only sends fields we actually have.
async function updateLocation(company: any): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = {};
  if (company.name) body.name = company.name;
  if (company.phone) body.phone = company.phone;
  if (company.email) body.email = company.email;
  if (company.website) body.website = company.website;
  if (company.address) body.address = company.address;
  if (!Object.keys(body).length) return { ok: true };
  const r = await fetch(`${BASE}/locations/${LOCATION}`, {
    method: "PUT",
    headers: ghlHeaders(),
    body: JSON.stringify(body),
  });
  if (r.ok) return { ok: true };
  const t = await r.text().catch(() => "");
  return { ok: false, error: `location ${r.status}: ${t.slice(0, 300)}` };
}

// Upsert a set of Custom Values by name (create if missing, update if present).
async function upsertCustomValues(pairs: Record<string, string>): Promise<{ updated: number; created: number; failed: number }> {
  const out = { updated: 0, created: 0, failed: 0 };
  // Load existing custom values so we can match by name.
  let existing: any[] = [];
  try {
    const r = await fetch(`${BASE}/locations/${LOCATION}/customValues`, { headers: ghlHeaders() });
    const j = await r.json().catch(() => ({}));
    existing = j.customValues || j.customValue || j || [];
    if (!Array.isArray(existing)) existing = [];
  } catch (_) { existing = []; }
  const byName: Record<string, any> = {};
  for (const cv of existing) if (cv && cv.name) byName[String(cv.name).toLowerCase()] = cv;

  for (const [name, value] of Object.entries(pairs)) {
    if (value == null || value === "") continue;
    const hit = byName[name.toLowerCase()];
    try {
      if (hit && hit.id) {
        const r = await fetch(`${BASE}/locations/${LOCATION}/customValues/${hit.id}`, {
          method: "PUT", headers: ghlHeaders(), body: JSON.stringify({ name, value }),
        });
        r.ok ? out.updated++ : out.failed++;
      } else {
        const r = await fetch(`${BASE}/locations/${LOCATION}/customValues`, {
          method: "POST", headers: ghlHeaders(), body: JSON.stringify({ name, value }),
        });
        r.ok ? out.created++ : out.failed++;
      }
    } catch (_) { out.failed++; }
    await new Promise((res) => setTimeout(res, 120));
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!TOKEN || !LOCATION) return json({ ok: false, error: "GHL not configured (set GHL_TOKEN and GHL_LOCATION_ID)" });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const action = body.action || "sync";
  if (action !== "sync") return json({ ok: false, error: "unknown action" });

  const company = body.company || {};
  const owner = body.owner || {};

  try {
    const loc = await updateLocation(company);

    const cv = await upsertCustomValues({
      "Business Name": company.name || "",
      "Trade": company.trade || "",
      "Service Area": company.serviceArea || "",
      "License Number": company.license || "",
      "Business Hours": hoursToText(body.hours),
      "Auto Reply Message": body.autoReply || "",
      "Owner Name": owner.name || "",
      "Owner Email": owner.email || "",
      "Owner Phone": owner.phone || "",
    });

    return json({ ok: loc.ok, location: loc.ok, locationError: loc.error, customValues: cv });
  } catch (e) {
    return json({ ok: false, error: String(e) });
  }
});
