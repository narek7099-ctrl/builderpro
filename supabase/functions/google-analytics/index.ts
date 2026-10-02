// google-analytics — "Sign in with Google" for the portal's Marketing → Website tab.
//
// The owner connects their Google account once (read-only scopes). We keep only
// the refresh token, AES-GCM encrypted at rest in public.google_connections, and
// read their GA4 property + Search Console site on demand.
//
// POST (Authorization: Bearer <portal user JWT>)
//   { op: "auth_url", return?: "<portal url>" } -> { ok, url }
//   { op: "status" }                            -> { ok, configured, connected, email, ga_property, gsc_site }
//   { op: "properties" }                        -> { ok, ga: [{id,name,account}], gsc: [{site,permission}] }
//   { op: "select", ga_property?, gsc_site? }   -> { ok }
//   { op: "report", range: 7|30|90 }            -> { ok, ga, gsc }
//   { op: "disconnect" }                        -> { ok }
// GET ?op=callback&code&state                   -> Google redirects here; we store the token and
//                                                  redirect back to the portal with ?google=connected
//
// Deploy:  supabase functions deploy google-analytics --no-verify-jwt
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_KEY (32-byte base64),
//          PORTAL_URL (https://builderpro-os.com), optional GOOGLE_OAUTH_STATE_SECRET.
//          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are built in.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const TOKEN_KEY = Deno.env.get("GOOGLE_TOKEN_KEY") ?? "";
const PORTAL_URL = (Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com").replace(/\/+$/, "");
const STATE_SECRET = Deno.env.get("GOOGLE_OAUTH_STATE_SECRET") || SB_SERVICE;
const REDIRECT_URI = `${SB_URL}/functions/v1/google-analytics?op=callback`;
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const configured = () => !!(SB_URL && SB_SERVICE && CLIENT_ID && CLIENT_SECRET && TOKEN_KEY);

/* ---------------- auth (same pattern as ai-brain-sync) ---------------- */
async function userFromReq(req: Request): Promise<{ id: string; email: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? "" } : null;
  } catch { return null; }
}
async function effectiveOwner(id: string, email?: string): Promise<{ id: string; email: string }> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner,owner_email&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    if (rows?.[0]?.owner) return { id: rows[0].owner, email: rows[0].owner_email || email || "" };
  } catch { /* fall through */ }
  return { id, email: email ?? "" };
}

/* ---------------- crypto helpers ---------------- */
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
async function hmac(data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
let _aes: CryptoKey | null = null;
async function aesKey(): Promise<CryptoKey> {
  if (_aes) return _aes;
  const raw = fromB64(TOKEN_KEY.trim());
  if (raw.length !== 32) throw new Error("GOOGLE_TOKEN_KEY must be 32 bytes, base64");
  _aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return _aes;
}
async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), enc.encode(plain));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}
async function decrypt(blob: string): Promise<string> {
  const [v, iv, ct] = blob.split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("bad token blob");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(), fromB64(ct)));
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/* state = base64url(json{o,n,r,t}) + "." + hmac */
async function makeState(owner: string, ret: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify({ o: owner, n: b64u(crypto.getRandomValues(new Uint8Array(12))), r: ret, t: Date.now() })));
  return `${body}.${await hmac(body)}`;
}
async function readState(state: string): Promise<{ o: string; r: string } | null> {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig || !safeEq(sig, await hmac(body))) return null;
  try {
    const s = JSON.parse(dec.decode(fromB64(body)));
    if (!s.o || Date.now() - Number(s.t) > 15 * 60_000) return null;
    return { o: String(s.o), r: String(s.r || "") };
  } catch { return null; }
}
/* only send people back to our own portal */
function safeReturn(r: string): string {
  try {
    const u = new URL(r);
    const p = new URL(PORTAL_URL);
    if (u.origin === p.origin) return u.toString();
  } catch { /* ignore */ }
  return `${PORTAL_URL}/?portal=1`;
}
function withParam(url: string, k: string, v: string) {
  const u = new URL(url);
  u.searchParams.set(k, v);
  return u.toString();
}

/* ---------------- storage ---------------- */
type Conn = { owner: string; email: string | null; refresh_token_enc: string; ga_property: string | null; gsc_site: string | null; connected_at: string };
async function getConn(owner: string): Promise<Conn | null> {
  const r = await fetch(`${SB_URL}/rest/v1/google_connections?owner=eq.${owner}&select=*&limit=1`, { headers: sbH });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0] ?? null;
}
async function upsertConn(row: Partial<Conn> & { owner: string }) {
  const r = await fetch(`${SB_URL}/rest/v1/google_connections?on_conflict=owner`, {
    method: "POST",
    headers: { ...sbH, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`save failed: ${r.status} ${await r.text()}`);
}
async function patchConn(owner: string, patch: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/google_connections?owner=eq.${owner}`, { method: "PATCH", headers: { ...sbH, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
  if (!r.ok) throw new Error(`save failed: ${r.status}`);
}
async function deleteConn(owner: string) {
  await fetch(`${SB_URL}/rest/v1/google_connections?owner=eq.${owner}`, { method: "DELETE", headers: sbH });
}

/* ---------------- Google ---------------- */
const tokCache = new Map<string, { tok: string; exp: number }>();
async function accessToken(c: Conn): Promise<string> {
  const hit = tokCache.get(c.owner);
  if (hit && hit.exp > Date.now() + 60_000) return hit.tok;
  const refresh = await decrypt(c.refresh_token_enc);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    const e = new Error(d.error === "invalid_grant" ? "reconnect" : `token refresh failed (${d.error || r.status})`);
    throw e;
  }
  tokCache.set(c.owner, { tok: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 });
  return d.access_token;
}
async function gget(tok: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Google error ${r.status}`);
  return d;
}
async function gpost(tok: string, url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Google error ${r.status}`);
  return d;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function ranges(n: number) {
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 1); // yesterday: today is partial
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (n - 1));
  const pEnd = new Date(start); pEnd.setUTCDate(start.getUTCDate() - 1);
  const pStart = new Date(pEnd); pStart.setUTCDate(pEnd.getUTCDate() - (n - 1));
  return { cur: { startDate: ymd(start), endDate: ymd(end) }, prev: { startDate: ymd(pStart), endDate: ymd(pEnd) } };
}
type Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
const dv = (r: Row, i = 0) => r.dimensionValues?.[i]?.value ?? "";
const mv = (r: Row, i = 0) => Number(r.metricValues?.[i]?.value ?? 0);

async function gaReport(tok: string, property: string, n: number) {
  const R = ranges(n);
  const url = `https://analyticsdata.googleapis.com/v1beta/${property}:batchRunReports`;
  const totalsMetrics = (key: string) => [{ name: "activeUsers" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: key }, { name: "sessions" }];
  const run = async (key: string) => gpost(tok, url, {
    requests: [
      { dateRanges: [R.cur, R.prev], metrics: totalsMetrics(key) },
      { dateRanges: [R.cur], dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }, { name: key }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 400 },
      { dateRanges: [R.cur], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: 10 },
      { dateRanges: [R.cur], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 10 },
      { dateRanges: [R.cur], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "activeUsers" }], orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }], limit: 5 },
    ],
  });
  // keyEvents replaced conversions in 2024; fall back for older properties
  let d;
  try { d = await run("keyEvents"); } catch { d = await run("conversions"); }
  const [tot, byDate, pages, src, dev] = d.reports ?? [];
  // with two date ranges GA adds a "dateRange" dimension: date_range_0 = current
  const pick = (which: string) => {
    const r = (tot?.rows ?? []).find((x: Row) => dv(x) === which) ?? (which === "date_range_0" ? tot?.rows?.[0] : undefined);
    return r ? { users: mv(r, 0), views: mv(r, 1), avg: mv(r, 2), keyEvents: mv(r, 3), sessions: mv(r, 4) } : { users: 0, views: 0, avg: 0, keyEvents: 0, sessions: 0 };
  };
  return {
    range: R,
    totals: pick("date_range_0"),
    previous: pick("date_range_1"),
    byDate: (byDate?.rows ?? []).map((r: Row) => ({ date: dv(r).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"), users: mv(r, 0), views: mv(r, 1), avg: mv(r, 2), keyEvents: mv(r, 3) })),
    pages: (pages?.rows ?? []).map((r: Row) => ({ path: dv(r), views: mv(r) })),
    sources: (src?.rows ?? []).map((r: Row) => ({ source: dv(r), sessions: mv(r) })),
    devices: (dev?.rows ?? []).map((r: Row) => ({ device: dv(r), users: mv(r) })),
  };
}

async function gscReport(tok: string, site: string, n: number) {
  // Search Console data lags ~2 days
  const end = new Date(); end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end); start.setUTCDate(end.getUTCDate() - (n - 1));
  const pEnd = new Date(start); pEnd.setUTCDate(start.getUTCDate() - 1);
  const pStart = new Date(pEnd); pStart.setUTCDate(pEnd.getUTCDate() - (n - 1));
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const [tot, prev, byDate, queries] = await Promise.all([
    gpost(tok, url, { startDate: ymd(start), endDate: ymd(end) }),
    gpost(tok, url, { startDate: ymd(pStart), endDate: ymd(pEnd) }),
    gpost(tok, url, { startDate: ymd(start), endDate: ymd(end), dimensions: ["date"], rowLimit: 400 }),
    gpost(tok, url, { startDate: ymd(start), endDate: ymd(end), dimensions: ["query"], rowLimit: 10 }),
  ]);
  type G = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
  const t = (d: { rows?: G[] }) => {
    const r = d.rows?.[0] ?? {};
    return { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: (r.ctr ?? 0) * 100, position: r.position ?? 0 };
  };
  return {
    range: { startDate: ymd(start), endDate: ymd(end) },
    totals: t(tot),
    previous: t(prev),
    byDate: (byDate.rows ?? []).map((r: G) => ({ date: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })),
    queries: (queries.rows ?? []).map((r: G) => ({ query: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: (r.ctr ?? 0) * 100, position: r.position ?? 0 })),
  };
}

const reportCache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 15 * 60_000;

/* ---------------- OAuth callback ---------------- */
async function callback(url: URL): Promise<Response> {
  const redirect = (to: string) => new Response(null, { status: 302, headers: { Location: to } });
  const st = await readState(url.searchParams.get("state") ?? "");
  const back = safeReturn(st?.r ?? "");
  if (!st) return redirect(withParam(back, "google", "error"));
  if (url.searchParams.get("error")) return redirect(withParam(back, "google", "cancelled"));
  const code = url.searchParams.get("code");
  if (!code) return redirect(withParam(back, "google", "error"));
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" }),
    });
    const d = await r.json().catch(() => ({}));
    let refresh = d.refresh_token as string | undefined;
    const existing = await getConn(st.o);
    if (!refresh && existing) refresh = await decrypt(existing.refresh_token_enc); // re-consent without a new refresh token
    if (!r.ok || !refresh) return redirect(withParam(back, "google", "error"));
    let email = "";
    try {
      const u = await gget(d.access_token, "https://openidconnect.googleapis.com/v1/userinfo");
      email = u.email ?? "";
    } catch { /* optional */ }
    await upsertConn({
      owner: st.o,
      email,
      refresh_token_enc: await encrypt(refresh),
      ga_property: existing?.ga_property ?? null,
      gsc_site: existing?.gsc_site ?? null,
      connected_at: new Date().toISOString(),
    });
    tokCache.delete(st.o);
    for (const k of reportCache.keys()) if (k.startsWith(st.o + ":")) reportCache.delete(k);
    return redirect(withParam(back, "google", "connected"));
  } catch (e) {
    console.error("callback", e);
    return redirect(withParam(back, "google", "error"));
  }
}

/* ---------------- main ---------------- */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("op") === "callback") {
    if (!configured()) return new Response("Google sign-in is not set up yet.", { status: 503 });
    return callback(url);
  }
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let b: { op?: string; return?: string; range?: number; ga_property?: string | null; gsc_site?: string | null };
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  if (!configured()) {
    if (b.op === "status") return json({ ok: true, configured: false, connected: false });
    return json({ ok: false, error: "not_configured" }, 503);
  }
  const u0 = await userFromReq(req);
  const user = u0 ? await effectiveOwner(u0.id, u0.email) : null;
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  try {
    if (b.op === "auth_url") {
      const state = await makeState(user.id, safeReturn(String(b.return ?? "")));
      const q = new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code", scope: SCOPES,
        access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
      });
      return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
    }

    const c = await getConn(user.id);
    if (b.op === "status") {
      return json({ ok: true, configured: true, connected: !!c, email: c?.email ?? null, ga_property: c?.ga_property ?? null, gsc_site: c?.gsc_site ?? null, connected_at: c?.connected_at ?? null });
    }
    if (!c) return json({ ok: false, error: "not_connected" }, 400);

    if (b.op === "disconnect") {
      try {
        const refresh = await decrypt(c.refresh_token_enc);
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }) });
      } catch { /* revoke is best effort; the row goes regardless */ }
      await deleteConn(user.id);
      tokCache.delete(user.id);
      for (const k of reportCache.keys()) if (k.startsWith(user.id + ":")) reportCache.delete(k);
      return json({ ok: true });
    }

    if (b.op === "select") {
      const clean = (v: unknown) => (v == null || v === "" ? null : String(v).trim().slice(0, 300));
      const patch: Record<string, unknown> = {};
      if ("ga_property" in b) {
        const p = clean(b.ga_property);
        if (p && !/^properties\/\d+$/.test(p)) return json({ ok: false, error: "That is not a GA4 property id." }, 400);
        patch.ga_property = p;
      }
      if ("gsc_site" in b) {
        const s = clean(b.gsc_site);
        if (s && !/^(https?:\/\/|sc-domain:)/.test(s)) return json({ ok: false, error: "That is not a Search Console site." }, 400);
        patch.gsc_site = s;
      }
      await patchConn(user.id, patch);
      for (const k of reportCache.keys()) if (k.startsWith(user.id + ":")) reportCache.delete(k);
      return json({ ok: true });
    }

    const tok = await accessToken(c);

    if (b.op === "properties") {
      const [ga, gsc] = await Promise.all([
        gget(tok, "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200").catch((e) => ({ _err: String(e.message || e) })),
        gget(tok, "https://www.googleapis.com/webmasters/v3/sites").catch((e) => ({ _err: String(e.message || e) })),
      ]);
      type PS = { property: string; displayName: string };
      type AS = { displayName: string; propertySummaries?: PS[] };
      const props = ((ga.accountSummaries ?? []) as AS[]).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ id: p.property, name: p.displayName, account: a.displayName })));
      const sites = ((gsc.siteEntry ?? []) as { siteUrl: string; permissionLevel: string }[])
        .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
        .map((s) => ({ site: s.siteUrl, permission: s.permissionLevel }));
      return json({ ok: true, ga: props, gsc: sites, ga_error: ga._err ?? null, gsc_error: gsc._err ?? null });
    }

    if (b.op === "report") {
      const n = [7, 30, 90].includes(Number(b.range)) ? Number(b.range) : 30;
      const key = `${user.id}:${n}:${c.ga_property}:${c.gsc_site}`;
      const hit = reportCache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return json({ ok: true, cached: true, ...(hit.data as object) });
      const [ga, gsc] = await Promise.all([
        c.ga_property ? gaReport(tok, c.ga_property, n).catch((e) => ({ error: String(e.message || e) })) : null,
        c.gsc_site ? gscReport(tok, c.gsc_site, n).catch((e) => ({ error: String(e.message || e) })) : null,
      ]);
      const data = { range: n, ga, gsc };
      if (!(ga && "error" in ga) && !(gsc && "error" in gsc)) reportCache.set(key, { at: Date.now(), data });
      return json({ ok: true, ...data });
    }

    return json({ ok: false, error: "unknown op" }, 400);
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (msg === "reconnect") return json({ ok: false, error: "reconnect", message: "Google access was removed. Connect again." }, 400);
    console.error(e);
    return json({ ok: false, error: msg }, 500);
  }
});
