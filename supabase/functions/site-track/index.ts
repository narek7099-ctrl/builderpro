// site-track: ingest for embed/track.js, the traffic snippet a contractor
// pastes into their own website's <head>.
//
//   POST (text/plain or application/json, so the browser sends no preflight)
//     { u: "<owner uuid>", s: "<session id>", d: "desktop|mobile|tablet", c: "US",
//       e: [ { t: "pageview", ts: 1730000000000, p: "/roofing", ti: "Roofing",
//              r: "google.com", us: "google", um: "cpc", uc: "spring", v: {} }, ... ] }
//     -> 204
//
//   POST { op: "verify", u: "<owner uuid>" }
//     -> { installed: bool, last_seen: iso|null, path: string|null }
//     (the portal's "Check installation" button; RLS reads work too, this is
//      for the snippet's own ?bp_verify=1 handshake and for signed-out checks)
//
// Public: deploy with --no-verify-jwt. Writes with the service role to
// public.site_events (see migrations/20261001000000_site_events.sql).
// No cookies, no IPs stored, no personal data: everything is clamped and
// whitelisted here, whatever the snippet sends.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SID = /^[A-Za-z0-9_-]{8,40}$/;
const TYPES = new Set(["pageview", "time", "tool_open", "tool_done", "lead", "call_click", "email_click", "form_submit", "verify", "custom"]);
const DEVICES = new Set(["desktop", "mobile", "tablet"]);
const MAX_BATCH = 25;

// ---- light in-memory rate limit (per isolate; good enough to blunt a loop or a bot) ----
const WINDOW_MS = 60_000;
const LIMIT_IP = 240;      // events per minute per IP
const LIMIT_SESSION = 120; // events per minute per session
const hits = new Map<string, { n: number; at: number }>();
function allow(key: string, n: number, limit: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.at > WINDOW_MS) { hits.set(key, { n, at: now }); return n <= limit; }
  h.n += n;
  return h.n <= limit;
}
function sweep() {
  if (hits.size < 5000) return;
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.at > WINDOW_MS) hits.delete(k);
}

// owners that don't exist: remember for a while instead of hitting the DB
const badOwner = new Map<string, number>();

const str = (v: unknown, max: number): string | null => {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001f]/g, " ").trim();
  return s ? s.slice(0, max) : null;
};
// a referrer is kept as a bare host — never a full URL with someone's query string
const host = (v: unknown): string | null => {
  const s = str(v, 300);
  if (!s) return null;
  try { return new URL(/^https?:\/\//.test(s) ? s : "https://" + s).hostname.replace(/^www\./, "").slice(0, 120); } catch { return null; }
};
// a path, without query or fragment (they can carry emails, tokens)
const path = (v: unknown): string | null => {
  const s = str(v, 300);
  if (!s) return null;
  return s.split(/[?#]/)[0].slice(0, 200) || "/";
};
function cleanValue(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  let n = 0;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (++n > 8) break;
    const key = String(k).replace(/[^\w-]/g, "").slice(0, 32);
    if (!key) continue;
    if (typeof x === "number" && isFinite(x)) out[key] = Math.round(x * 100) / 100;
    else if (typeof x === "boolean") out[key] = x;
    else if (typeof x === "string") out[key] = x.slice(0, 80);
  }
  return out;
}

async function rest(pathq: string, init: RequestInit = {}) {
  return await fetch(SB_URL + "/rest/v1/" + pathq, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 64_000) return json({ error: "too large" }, 413);
    body = JSON.parse(raw);
  } catch { return json({ error: "bad json" }, 400); }

  const owner = String(body?.u ?? "").toLowerCase();
  if (!UUID.test(owner)) return json({ error: "bad owner id" }, 400);
  if ((badOwner.get(owner) ?? 0) > Date.now()) return new Response(null, { status: 204, headers: cors });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  sweep();

  // ---- verify: has this site sent anything? ----
  if (body?.op === "verify") {
    if (!allow("v:" + ip, 1, 30)) return json({ error: "slow down" }, 429);
    const r = await rest("site_events?owner=eq." + owner + "&select=ts,path,type&order=ts.desc&limit=1");
    const rows = r.ok ? await r.json() : [];
    const last = rows[0] ?? null;
    return json({ installed: !!last, last_seen: last?.ts ?? null, path: last?.path ?? null });
  }

  const session = String(body?.s ?? "");
  if (!SID.test(session)) return json({ error: "bad session" }, 400);
  const evs = Array.isArray(body?.e) ? body.e.slice(0, MAX_BATCH) : [];
  if (!evs.length) return new Response(null, { status: 204, headers: cors });
  if (!allow("ip:" + ip, evs.length, LIMIT_IP) || !allow("s:" + session, evs.length, LIMIT_SESSION)) {
    return json({ error: "rate limited" }, 429);
  }

  const device = DEVICES.has(body?.d) ? body.d : null;
  const country = /^[A-Z]{2}$/.test(String(body?.c ?? "")) ? body.c : null;
  const now = Date.now();
  const rows = evs
    .filter((e: any) => e && TYPES.has(e.t))
    .map((e: any) => {
      // trust the browser's clock only within a day of ours
      const t = Number(e.ts);
      const ts = isFinite(t) && Math.abs(now - t) < 864e5 ? new Date(t) : new Date(now);
      return {
        owner, session, device, country,
        ts: ts.toISOString(),
        type: e.t,
        path: path(e.p),
        title: str(e.ti, 160),
        referrer: host(e.r),
        utm_source: str(e.us, 80),
        utm_medium: str(e.um, 80),
        utm_campaign: str(e.uc, 120),
        value: cleanValue(e.v),
      };
    });
  if (!rows.length) return new Response(null, { status: 204, headers: cors });

  const r = await rest("site_events", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
  if (!r.ok) {
    const t = await r.text();
    // unknown owner (foreign key): stop listening to it for 10 minutes
    if (/foreign key|23503/.test(t)) badOwner.set(owner, Date.now() + 10 * 60_000);
    else console.error("site-track insert failed", r.status, t.slice(0, 300));
  }
  return new Response(null, { status: 204, headers: cors });
});
