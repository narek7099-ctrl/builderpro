// marketing-oauth — connects a client's ad & listing accounts to the portal's
// Marketing tab and reads back live numbers.
//   Meta Ads (Facebook/Instagram)  — OAuth, last-30-day spend / leads / campaigns
//   Google Ads                     — OAuth, last-30-day cost / conversions / campaigns
//   Google Business Profile        — OAuth, calls / direction requests / website clicks
//   Yelp                           — API key on our side; client just picks their listing
//
// Browser flow (GET, opened in a new tab):
//   ?op=start&provider=meta|google_ads|gbp&t=<client JWT>   -> 302 to the provider consent page
//   ?op=callback&provider=...&code=...&state=...            -> stores tokens, 302 back to the portal
// Portal calls (POST, Authorization: Bearer <client JWT>):
//   { op:"list" }                       -> connections (no tokens)
//   { op:"stats" }                      -> live numbers per connected provider (cached 30 min)
//   { op:"disconnect", provider }       -> remove
//   { op:"yelp.search", query, location }  -> candidate listings
//   { op:"yelp.connect", id }           -> link a listing
//
// Deploy:  supabase functions deploy marketing-oauth --no-verify-jwt
// Secrets: META_APP_ID, META_APP_SECRET,
//          GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, (GOOGLE_ADS_LOGIN_CUSTOMER_ID)
//          YELP_API_KEY, PORTAL_URL (where to send people back, e.g. https://builderpro-os.com)
// Redirect URI to register with Meta + Google:  <SUPABASE_URL>/functions/v1/marketing-oauth

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const META_APP_ID = Deno.env.get("META_APP_ID") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const G_ADS_DEV = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const G_ADS_LOGIN = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "";
const YELP_KEY = Deno.env.get("YELP_API_KEY") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";
const REDIRECT = `${SB_URL}/functions/v1/marketing-oauth`;
const STATS_TTL = 30 * 60 * 1000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const page = (title: string, body: string) => new Response(
  `<!doctype html><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<body style="font:15px Inter,-apple-system,sans-serif;background:#eef1f5;color:#0f2540;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">` +
  `<div style="background:#fff;border-radius:12px;padding:32px;max-width:440px;box-shadow:0 10px 40px rgba(15,30,60,.12)"><h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="color:#5b6b82;margin:0 0 18px">${body}</p><a href="${PORTAL_URL}" style="color:#2f6bff;font-weight:600">Back to BuilderPro OS</a></div></body>`,
  { headers: { "Content-Type": "text/html" } });

type Row = Record<string, unknown>;
const PROVIDERS = ["meta", "google_ads", "gbp", "yelp"];

async function userFromJwt(jwt: string): Promise<{ id: string; email: string } | null> {
  if (!jwt) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email ?? "" } : null;
  } catch { return null; }
}

// --- signed state so the callback can trust who started the connection ---
async function hmac(s: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SB_SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "");
}
async function makeState(uid: string, provider: string): Promise<string> {
  const p = btoa(JSON.stringify({ u: uid, p: provider, t: Date.now() })).replace(/=+$/, "");
  return `${p}.${await hmac(p)}`;
}
async function readState(state: string): Promise<{ u: string; p: string } | null> {
  const [p, sig] = state.split(".");
  if (!p || !sig || (await hmac(p)) !== sig) return null;
  try {
    const d = JSON.parse(atob(p));
    if (Date.now() - Number(d.t) > 20 * 60 * 1000) return null;
    return d;
  } catch { return null; }
}

// --- storage ---
async function getIntegrations(uid: string): Promise<Row[]> {
  const r = await fetch(`${SB_URL}/rest/v1/integrations?owner=eq.${uid}&select=*`, { headers: sbH });
  return r.ok ? await r.json() : [];
}
async function upsertIntegration(row: Row) {
  await fetch(`${SB_URL}/rest/v1/integrations?on_conflict=owner,provider`, {
    method: "POST", headers: { ...sbH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
}
async function patchIntegration(id: unknown, patch: Row) {
  await fetch(`${SB_URL}/rest/v1/integrations?id=eq.${id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}
const safe = (r: Row) => ({ provider: r.provider, status: r.status, account_id: r.account_id, account_name: r.account_name, meta: r.meta ?? {}, connected_at: r.connected_at, updated_at: r.updated_at });

// --- Google token refresh ---
async function googleToken(row: Row): Promise<string> {
  const exp = row.expires_at ? Date.parse(String(row.expires_at)) : 0;
  if (row.access_token && exp > Date.now() + 60000) return String(row.access_token);
  if (!row.refresh_token) return String(row.access_token ?? "");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, grant_type: "refresh_token", refresh_token: String(row.refresh_token) }).toString(),
  });
  const d = await r.json().catch(() => ({}));
  if (!d.access_token) return String(row.access_token ?? "");
  const expires_at = new Date(Date.now() + (Number(d.expires_in || 3600) - 60) * 1000).toISOString();
  await patchIntegration(row.id, { access_token: d.access_token, expires_at });
  return d.access_token;
}

// --- provider stats (last 30 days) ---
async function metaStats(row: Row) {
  const t = String(row.access_token ?? ""), acct = String(row.account_id ?? "");
  const leadsOf = (actions: Array<{ action_type: string; value: string }> | undefined) =>
    (actions ?? []).filter((a) => /lead|contact|schedule|submit_application|onsite_conversion\.messaging_first_reply/i.test(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
  const ins = await fetch(`https://graph.facebook.com/v19.0/${acct}/insights?fields=spend,impressions,clicks,actions&date_preset=last_30d&access_token=${t}`).then((r) => r.json()).catch(() => ({}));
  const d = ins?.data?.[0] ?? {};
  const camps = await fetch(`https://graph.facebook.com/v19.0/${acct}/campaigns?fields=name,status,insights.date_preset(last_30d){spend,actions,impressions,clicks}&limit=25&access_token=${t}`).then((r) => r.json()).catch(() => ({}));
  const campaigns = (camps?.data ?? []).map((c: Row) => {
    const i = ((c.insights as Row)?.data as Row[])?.[0] ?? {};
    return { name: c.name, status: String(c.status ?? "").toLowerCase(), spend: Number(i.spend || 0), leads: leadsOf(i.actions as never), clicks: Number(i.clicks || 0) };
  });
  return { spend: Number(d.spend || 0), impressions: Number(d.impressions || 0), clicks: Number(d.clicks || 0), leads: leadsOf(d.actions), campaigns };
}
async function googleAdsStats(row: Row) {
  if (!G_ADS_DEV) return { error: "google_ads_dev_token_missing" };
  const t = await googleToken(row), cid = String(row.account_id ?? "").replace(/-/g, "");
  const h: Record<string, string> = { Authorization: `Bearer ${t}`, "developer-token": G_ADS_DEV, "Content-Type": "application/json" };
  if (G_ADS_LOGIN) h["login-customer-id"] = G_ADS_LOGIN.replace(/-/g, "");
  const q = "SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING LAST_30_DAYS";
  const r = await fetch(`https://googleads.googleapis.com/v17/customers/${cid}/googleAds:searchStream`, { method: "POST", headers: h, body: JSON.stringify({ query: q }) });
  const d = await r.json().catch(() => []);
  const rows: Row[] = Array.isArray(d) ? d.flatMap((b: Row) => (b.results as Row[]) ?? []) : [];
  const campaigns = rows.map((x) => { const c = x.campaign as Row, m = x.metrics as Row; return { name: c?.name, status: String(c?.status ?? "").toLowerCase(), spend: Number(m?.costMicros || 0) / 1e6, leads: Number(m?.conversions || 0), clicks: Number(m?.clicks || 0) }; });
  const sum = (k: "spend" | "leads" | "clicks") => campaigns.reduce((s, c) => s + (c[k] || 0), 0);
  return { spend: sum("spend"), leads: sum("leads"), clicks: sum("clicks"), campaigns, error: r.ok ? undefined : String((d as Row)?.error ?? "google ads error").slice(0, 200) };
}
async function gbpStats(row: Row) {
  const t = await googleToken(row), loc = String(row.account_id ?? ""); // "locations/123"
  if (!loc) return { error: "no location" };
  const end = new Date(), start = new Date(Date.now() - 30 * 864e5);
  const dr = `dailyRange.start_date.year=${start.getFullYear()}&dailyRange.start_date.month=${start.getMonth() + 1}&dailyRange.start_date.day=${start.getDate()}&dailyRange.end_date.year=${end.getFullYear()}&dailyRange.end_date.month=${end.getMonth() + 1}&dailyRange.end_date.day=${end.getDate()}`;
  const metrics = ["CALL_CLICKS", "WEBSITE_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS", "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"];
  const r = await fetch(`https://businessprofileperformance.googleapis.com/v1/${loc}:fetchMultiDailyMetricsTimeSeries?${metrics.map((m) => "dailyMetrics=" + m).join("&")}&${dr}`, { headers: { Authorization: `Bearer ${t}` } });
  const d = await r.json().catch(() => ({}));
  const tot: Record<string, number> = {};
  for (const s of d?.multiDailyMetricTimeSeries ?? []) for (const m of s.dailyMetricTimeSeries ?? []) tot[m.dailyMetric] = (m.timeSeries?.datedValues ?? []).reduce((a: number, v: Row) => a + Number(v.value || 0), 0);
  return { calls: tot.CALL_CLICKS || 0, website: tot.WEBSITE_CLICKS || 0, directions: tot.BUSINESS_DIRECTION_REQUESTS || 0, views: (tot.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0) + (tot.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0), error: r.ok ? undefined : "gbp error" };
}
async function yelpStats(row: Row) {
  const id = String(row.account_id ?? "");
  const h = { Authorization: `Bearer ${YELP_KEY}` };
  const b = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(id)}`, { headers: h }).then((r) => r.json()).catch(() => ({}));
  const rv = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(id)}/reviews?limit=3&sort_by=newest`, { headers: h }).then((r) => r.json()).catch(() => ({}));
  return { rating: Number(b.rating || 0), reviews: Number(b.review_count || 0), url: b.url, reviewsList: (rv.reviews ?? []).map((x: Row) => ({ rating: x.rating, text: String(x.text ?? "").slice(0, 200), user: (x.user as Row)?.name, at: x.time_created })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);
  const url = new URL(req.url);

  // ---------------- browser redirects ----------------
  if (req.method === "GET") {
    const op = url.searchParams.get("op") ?? "";
    const provider = url.searchParams.get("provider") ?? "";
    if (op === "start") {
      const user = await userFromJwt(url.searchParams.get("t") ?? "");
      if (!user) return page("Please sign in", "Open the Marketing tab in your portal and tap Connect again.");
      const state = await makeState(user.id, provider);
      if (provider === "meta") {
        if (!META_APP_ID) return page("Meta Ads isn't switched on yet", "Our team is finishing the Meta connection for BuilderPro OS. You'll get a note the moment it's live.");
        const u = new URL("https://www.facebook.com/v19.0/dialog/oauth");
        u.search = new URLSearchParams({ client_id: META_APP_ID, redirect_uri: REDIRECT, state, scope: "ads_read,ads_management,business_management,leads_retrieval,pages_show_list", response_type: "code" }).toString();
        return Response.redirect(u.toString(), 302);
      }
      if (provider === "google_ads" || provider === "gbp") {
        if (!G_ID) return page("Google isn't switched on yet", "Our team is finishing the Google connection for BuilderPro OS. You'll get a note the moment it's live.");
        const scope = provider === "google_ads" ? "https://www.googleapis.com/auth/adwords" : "https://www.googleapis.com/auth/business.manage";
        const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        u.search = new URLSearchParams({ client_id: G_ID, redirect_uri: REDIRECT, state, scope, response_type: "code", access_type: "offline", prompt: "consent" }).toString();
        return Response.redirect(u.toString(), 302);
      }
      return page("Unknown provider", "That connection isn't available.");
    }
    if (op === "callback" || url.searchParams.get("code")) {
      const st = await readState(url.searchParams.get("state") ?? "");
      const code = url.searchParams.get("code") ?? "";
      if (!st || !code) return page("Connection expired", "Please go back to Marketing and tap Connect again.");
      const back = `${PORTAL_URL}?connected=${st.p}`;
      try {
        if (st.p === "meta") {
          const tk = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT)}&code=${code}`).then((r) => r.json());
          let token = tk.access_token ?? "";
          if (!token) return page("Meta didn't accept the connection", String(tk?.error?.message ?? "").slice(0, 200));
          const ll = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${token}`).then((r) => r.json()).catch(() => ({}));
          if (ll.access_token) token = ll.access_token;
          const accts = await fetch(`https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&limit=10&access_token=${token}`).then((r) => r.json()).catch(() => ({}));
          const a = (accts?.data ?? [])[0] ?? {};
          await upsertIntegration({ owner: st.u, provider: "meta", status: a.id ? "connected" : "no_ad_account", account_id: a.id ?? "", account_name: a.name ?? "", access_token: token, expires_at: new Date(Date.now() + 55 * 864e5).toISOString(), meta: { accounts: (accts?.data ?? []).slice(0, 10) } });
          return Response.redirect(back, 302);
        }
        if (st.p === "google_ads" || st.p === "gbp") {
          const tk = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }).toString() }).then((r) => r.json());
          if (!tk.access_token) return page("Google didn't accept the connection", String(tk?.error_description ?? tk?.error ?? "").slice(0, 200));
          const expires_at = new Date(Date.now() + (Number(tk.expires_in || 3600) - 60) * 1000).toISOString();
          let account_id = "", account_name = "", meta: Row = {}, status = "connected";
          if (st.p === "google_ads") {
            if (G_ADS_DEV) {
              const lc = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", { headers: { Authorization: `Bearer ${tk.access_token}`, "developer-token": G_ADS_DEV } }).then((r) => r.json()).catch(() => ({}));
              const names: string[] = lc?.resourceNames ?? [];
              account_id = (names[0] ?? "").replace("customers/", ""); account_name = account_id ? `Google Ads ${account_id}` : ""; meta = { accounts: names };
              if (!account_id) status = "no_ad_account";
            } else status = "pending_setup";
          } else {
            const ac = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json()).catch(() => ({}));
            const acct = (ac?.accounts ?? [])[0];
            if (acct?.name) {
              const ls = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title&pageSize=10`, { headers: { Authorization: `Bearer ${tk.access_token}` } }).then((r) => r.json()).catch(() => ({}));
              const l = (ls?.locations ?? [])[0];
              account_id = l?.name ?? ""; account_name = l?.title ?? acct.accountName ?? ""; meta = { account: acct.name, locations: (ls?.locations ?? []).slice(0, 10) };
            }
            if (!account_id) status = "no_listing";
          }
          await upsertIntegration({ owner: st.u, provider: st.p, status, account_id, account_name, access_token: tk.access_token, refresh_token: tk.refresh_token ?? null, expires_at, meta });
          return Response.redirect(back, 302);
        }
      } catch (e) { return page("Something went wrong", String(e).slice(0, 200)); }
      return page("Unknown provider", "That connection isn't available.");
    }
    return json({ ok: true, providers: PROVIDERS, configured: { meta: !!META_APP_ID, google: !!G_ID, google_ads: !!(G_ID && G_ADS_DEV), yelp: !!YELP_KEY } });
  }

  // ---------------- portal API ----------------
  if (req.method !== "POST") return json({ ok: false, error: "POST" }, 405);
  const user = await userFromJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!user) return json({ ok: false, error: "sign in required" }, 401);
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  const configured = { meta: !!META_APP_ID, google_ads: !!G_ID, gbp: !!G_ID, yelp: !!YELP_KEY };

  if (b.op === "list") {
    const rows = await getIntegrations(user.id);
    return json({ ok: true, connections: rows.map(safe), configured });
  }
  if (b.op === "disconnect") {
    await fetch(`${SB_URL}/rest/v1/integrations?owner=eq.${user.id}&provider=eq.${encodeURIComponent(b.provider ?? "")}`, { method: "DELETE", headers: sbH });
    return json({ ok: true });
  }
  if (b.op === "yelp.search") {
    if (!YELP_KEY) return json({ ok: false, error: "not_configured" });
    const r = await fetch(`https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(b.query ?? "")}&location=${encodeURIComponent(b.location ?? "")}&limit=6`, { headers: { Authorization: `Bearer ${YELP_KEY}` } });
    const d = await r.json().catch(() => ({}));
    return json({ ok: true, results: (d.businesses ?? []).map((x: Row) => ({ id: x.id, name: x.name, rating: x.rating, reviews: x.review_count, address: ((x.location as Row)?.display_address as string[] ?? []).join(", "), url: x.url })) });
  }
  if (b.op === "yelp.connect") {
    if (!YELP_KEY) return json({ ok: false, error: "not_configured" });
    const x = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(b.id ?? "")}`, { headers: { Authorization: `Bearer ${YELP_KEY}` } }).then((r) => r.json()).catch(() => ({}));
    if (!x?.id) return json({ ok: false, error: "listing not found" });
    await upsertIntegration({ owner: user.id, provider: "yelp", status: "connected", account_id: x.id, account_name: x.name, meta: { url: x.url, rating: x.rating, reviews: x.review_count } });
    return json({ ok: true });
  }
  if (b.op === "stats") {
    const rows = await getIntegrations(user.id);
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      const m = (row.meta as Row) ?? {};
      const cached = m.stats as Row | undefined, at = Number(m.stats_at ?? 0);
      if (cached && !b.force && Date.now() - at < STATS_TTL) { out[String(row.provider)] = cached; continue; }
      let s: Row = {};
      try {
        if (row.provider === "meta") s = await metaStats(row);
        else if (row.provider === "google_ads") s = await googleAdsStats(row);
        else if (row.provider === "gbp") s = await gbpStats(row);
        else if (row.provider === "yelp") s = await yelpStats(row);
      } catch (e) { s = { error: String(e).slice(0, 120) }; }
      out[String(row.provider)] = s;
      await patchIntegration(row.id, { meta: { ...m, stats: s, stats_at: Date.now() } });
    }
    return json({ ok: true, stats: out, connections: rows.map(safe), configured });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
