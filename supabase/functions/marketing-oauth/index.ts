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
//   { op:"competitors.search", query, location, limit } -> nearby rivals (Yelp, most-reviewed first)
//   { op:"competitors.list", force }    -> tracked rivals (snapshots refreshed daily) + your own listing numbers
//   { op:"competitors.track", id } / { op:"competitors.untrack", id }
//   { op:"competitors.reviews", id }    -> a rival's 3 newest reviews
//   ?op=start&provider=social&t=<jwt>   -> Meta consent for Facebook Page + Instagram posting/insights
//   { op:"social.stats" }               -> followers / reach / engagement / recent posts per channel (cached 30 min)
//   { op:"social.posts.list" }          -> the planner (also publishes anything due for this client)
//   { op:"social.posts.create", channels[], text, image_url, link_url, scheduled_at }
//   { op:"social.posts.delete", id }
//   { op:"social.select_page", page_id }-> pick a different Facebook Page from the connected account
//   { op:"social.publish_due" } with header x-cron-secret: CRON_SECRET  -> cron entry point (see the migration)
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
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
// posting + insights for a Facebook Page and the Instagram business account attached to it
const SOCIAL_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content,instagram_basic,instagram_content_publish,instagram_manage_insights,business_management";
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

// --- competitors: tracked rival listings + a daily snapshot history ---
async function getCompetitors(uid: string): Promise<Row[]> {
  const r = await fetch(`${SB_URL}/rest/v1/competitors?owner=eq.${uid}&select=*&order=created_at.asc`, { headers: sbH });
  return r.ok ? await r.json() : [];
}
async function patchCompetitor(id: unknown, patch: Row) {
  await fetch(`${SB_URL}/rest/v1/competitors?id=eq.${id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
}
const safeComp = (r: Row) => ({ id: r.yelp_id, name: r.name, snapshot: r.snapshot ?? {}, history: r.history ?? [], added_at: r.created_at, updated_at: r.updated_at });
// the subset of a Yelp business record the portal shows
const yelpLite = (x: Row) => ({
  id: x.id, name: x.name, rating: Number(x.rating ?? 0), reviews: Number(x.review_count ?? 0), price: x.price ?? "",
  categories: ((x.categories as Row[]) ?? []).map((c) => c.title).slice(0, 4),
  phone: x.display_phone ?? "", url: x.url ?? "", image: x.image_url ?? "",
  address: (((x.location as Row)?.display_address as string[]) ?? []).join(", "),
  distance_mi: x.distance ? Math.round(Number(x.distance) / 160.9) / 10 : null,
  closed: !!x.is_closed,
});

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

// --- social: Graph API helpers, per-channel stats, publishing ---
const fb = (path: string, token: string, init?: RequestInit) =>
  fetch(`https://graph.facebook.com/v19.0/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, init).then((r) => r.json()).catch(() => ({}));
const form = (o: Record<string, string>) => new URLSearchParams(o);
const insVal = (x: Row, name: string) => { const s = (((x.insights as Row)?.data as Row[]) ?? []).find((i) => i.name === name); return Number((((s?.values as Row[]) ?? [])[0])?.value ?? 0); };

async function socialStats(row: Row) {
  const t = String(row.access_token ?? ""), page = String(row.account_id ?? ""), m = (row.meta as Row) ?? {}, ig = String(((m.ig as Row) ?? {}).id ?? "");
  const out: Row = { facebook: null, instagram: null };
  if (page) {
    const p = await fb(`${page}?fields=fan_count,followers_count,name,link,picture{url}`, t);
    const ins = await fb(`${page}/insights?metric=page_impressions_unique,page_post_engagements&period=days_28`, t);
    const val = (name: string) => { const s = ((ins.data as Row[]) ?? []).find((x) => x.name === name); const vs = (s?.values as Row[]) ?? []; return Number(vs[vs.length - 1]?.value ?? 0); };
    const posts = await fb(`${page}/posts?fields=message,created_time,permalink_url,full_picture,insights.metric(post_impressions_unique,post_engaged_users)&limit=8`, t);
    out.facebook = {
      name: p.name, followers: Number(p.followers_count ?? p.fan_count ?? 0), reach: val("page_impressions_unique"), engagement: val("page_post_engagements"), link: p.link, picture: p.picture?.data?.url,
      error: p.error?.message,
      posts: ((posts.data as Row[]) ?? []).map((x) => ({ id: x.id, text: String(x.message ?? "").slice(0, 180), at: x.created_time, url: x.permalink_url, image: x.full_picture, reach: insVal(x, "post_impressions_unique"), engagement: insVal(x, "post_engaged_users"), channel: "facebook" })),
    };
  }
  if (ig) {
    const a = await fb(`${ig}?fields=username,followers_count,media_count,profile_picture_url`, t);
    const since = Math.floor((Date.now() - 28 * 864e5) / 1000), until = Math.floor(Date.now() / 1000);
    const ins = await fb(`${ig}/insights?metric=reach&period=day&since=${since}&until=${until}`, t);
    const reach = ((((ins.data as Row[]) ?? [])[0]?.values as Row[]) ?? []).reduce((s: number, v: Row) => s + Number(v.value || 0), 0);
    const media = await fb(`${ig}/media?fields=caption,timestamp,permalink,media_url,thumbnail_url,like_count,comments_count&limit=8`, t);
    out.instagram = {
      name: a.username, followers: Number(a.followers_count ?? 0), media: Number(a.media_count ?? 0), reach, picture: a.profile_picture_url, error: a.error?.message,
      posts: ((media.data as Row[]) ?? []).map((x) => ({ id: x.id, text: String(x.caption ?? "").slice(0, 180), at: x.timestamp, url: x.permalink, image: x.media_url ?? x.thumbnail_url, engagement: Number(x.like_count ?? 0) + Number(x.comments_count ?? 0), channel: "instagram" })),
    };
  }
  return out;
}

async function publishPost(post: Row, ints: Row[]): Promise<{ results: Row; status: string }> {
  const social = ints.find((i) => i.provider === "social"), gbp = ints.find((i) => i.provider === "gbp");
  const results: Row = {};
  const text = String(post.text ?? ""), img = String(post.image_url ?? ""), link = String(post.link_url ?? "");
  for (const ch of ((post.channels as string[]) ?? [])) {
    try {
      if (ch === "facebook") {
        if (!social?.account_id) throw new Error("Facebook Page not connected");
        const t = String(social.access_token), page = String(social.account_id);
        const r = img
          ? await fb(`${page}/photos`, t, { method: "POST", body: form({ url: img, caption: text }) })
          : await fb(`${page}/feed`, t, { method: "POST", body: form({ message: text, ...(link ? { link } : {}) }) });
        if (!r.id && !r.post_id) throw new Error(r.error?.message ?? "Facebook rejected the post");
        results[ch] = { ok: true, id: r.post_id ?? r.id };
      } else if (ch === "instagram") {
        if (!social) throw new Error("Instagram not connected");
        const t = String(social.access_token), ig = String((((social.meta as Row)?.ig as Row) ?? {}).id ?? "");
        if (!ig) throw new Error("No Instagram business account is linked to this Facebook Page");
        if (!img) throw new Error("Instagram needs a photo");
        const c = await fb(`${ig}/media`, t, { method: "POST", body: form({ image_url: img, caption: text }) });
        if (!c.id) throw new Error(c.error?.message ?? "Instagram rejected the photo");
        const p = await fb(`${ig}/media_publish`, t, { method: "POST", body: form({ creation_id: c.id }) });
        if (!p.id) throw new Error(p.error?.message ?? "Instagram couldn't publish");
        results[ch] = { ok: true, id: p.id };
      } else if (ch === "gbp") {
        if (!gbp) throw new Error("Google Business Profile not connected");
        const t = await googleToken(gbp), acct = String(((gbp.meta as Row) ?? {}).account ?? ""), loc = String(gbp.account_id ?? "");
        if (!acct || !loc) throw new Error("No Google listing selected");
        const body: Row = { languageCode: "en-US", summary: text, topicType: "STANDARD" };
        if (img) body.media = [{ mediaFormat: "PHOTO", sourceUrl: img }];
        if (link) body.callToAction = { actionType: "LEARN_MORE", url: link };
        const r = await fetch(`https://mybusiness.googleapis.com/v4/${acct}/${loc}/localPosts`, { method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({}));
        if (!r.name) throw new Error(r.error?.message ?? "Google rejected the post");
        results[ch] = { ok: true, id: r.name };
      } else throw new Error("unsupported channel");
    } catch (e) { results[ch] = { ok: false, error: String((e as Error)?.message ?? e).slice(0, 180) }; }
  }
  const oks = Object.values(results).filter((r) => (r as Row).ok).length, n = Object.keys(results).length;
  return { results, status: n && oks === n ? "published" : oks ? "partial" : "failed" };
}

// publish everything whose time has come; `owner` narrows it to one client (used on page load)
async function publishDue(owner?: string): Promise<number> {
  const q = `${SB_URL}/rest/v1/social_posts?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(new Date().toISOString())}${owner ? `&owner=eq.${owner}` : ""}&select=*&limit=20`;
  const rows: Row[] = await fetch(q, { headers: sbH }).then((r) => r.ok ? r.json() : []).catch(() => []);
  let n = 0;
  for (const post of rows) {
    // claim the row first so a cron tick and a page load can't both post it
    const c = await fetch(`${SB_URL}/rest/v1/social_posts?id=eq.${post.id}&status=eq.scheduled`, { method: "PATCH", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify({ status: "publishing" }) });
    const claimed = c.ok ? await c.json() : [];
    if (!claimed.length) continue;
    const ints = await getIntegrations(String(post.owner));
    const { results, status } = await publishPost(post, ints);
    await fetch(`${SB_URL}/rest/v1/social_posts?id=eq.${post.id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ status, results, published_at: new Date().toISOString() }) });
    n++;
  }
  return n;
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
      if (provider === "social") {
        if (!META_APP_ID) return page("Facebook & Instagram aren't switched on yet", "Our team is finishing the Meta connection for BuilderPro OS. You'll get a note the moment it's live.");
        const u = new URL("https://www.facebook.com/v19.0/dialog/oauth");
        u.search = new URLSearchParams({ client_id: META_APP_ID, redirect_uri: REDIRECT, state, scope: SOCIAL_SCOPES, response_type: "code" }).toString();
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
        if (st.p === "social") {
          const tk = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${encodeURIComponent(REDIRECT)}&code=${code}`).then((r) => r.json());
          let token = tk.access_token ?? "";
          if (!token) return page("Meta didn't accept the connection", String(tk?.error?.message ?? "").slice(0, 200));
          const ll = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${token}`).then((r) => r.json()).catch(() => ({}));
          if (ll.access_token) token = ll.access_token;
          // page tokens minted from a long-lived user token don't expire; keep the user token to re-derive them
          const pages = await fb("me/accounts?fields=id,name,access_token,instagram_business_account{id,username},followers_count,fan_count,picture{url}&limit=25", token);
          const list = ((pages.data as Row[]) ?? []);
          const p = list[0] ?? {};
          const ig = (p.instagram_business_account as Row) ?? null;
          await upsertIntegration({ owner: st.u, provider: "social", status: p.id ? "connected" : "no_page", account_id: p.id ?? "", account_name: p.name ?? "", access_token: p.access_token ?? token, refresh_token: token, expires_at: new Date(Date.now() + 55 * 864e5).toISOString(), meta: { pages: list.map((x) => ({ id: x.id, name: x.name, ig: x.instagram_business_account ?? null })), ig, picture: (p.picture as Row)?.data ? ((p.picture as Row).data as Row).url : null } });
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
  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  // the scheduler has no user; it authenticates with a shared secret and can only do one thing
  if (b.op === "social.publish_due") {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ ok: false, error: "forbidden" }, 403);
    return json({ ok: true, published: await publishDue() });
  }
  const user = await userFromJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!user) return json({ ok: false, error: "sign in required" }, 401);
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
  // ---------------- competitors (Yelp-backed) ----------------
  if (b.op === "competitors.search") {
    if (!YELP_KEY) return json({ ok: false, error: "not_configured" });
    const u = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(b.query ?? "")}&location=${encodeURIComponent(b.location ?? "")}&limit=${Math.min(Number(b.limit ?? 15), 20)}&sort_by=review_count`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${YELP_KEY}` } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: String((d as Row)?.error?.description ?? "yelp error").slice(0, 160) });
    return json({ ok: true, results: (d.businesses ?? []).map(yelpLite) });
  }
  if (b.op === "competitors.list") {
    const [rows, ints] = await Promise.all([getCompetitors(user.id), getIntegrations(user.id)]);
    // refresh any snapshot older than a day, appending to history so the portal can show review velocity
    const fresh: Row[] = [];
    for (const row of rows) {
      const age = Date.now() - Date.parse(String(row.updated_at ?? 0));
      if (YELP_KEY && (age > 24 * 3600e3 || b.force)) {
        const x = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(String(row.yelp_id))}`, { headers: { Authorization: `Bearer ${YELP_KEY}` } }).then((r) => r.json()).catch(() => ({}));
        if (x?.id) {
          const snap = { ...yelpLite(x), photos: (x.photos ?? []).length, claimed: x.is_claimed !== false, hours: !!(x.hours ?? []).length };
          const hist = ([...(row.history as Row[] ?? [])]).concat([{ at: Date.now(), rating: snap.rating, reviews: snap.reviews }]).slice(-60);
          await patchCompetitor(row.id, { name: snap.name, snapshot: snap, history: hist });
          fresh.push({ ...row, name: snap.name, snapshot: snap, history: hist }); continue;
        }
      }
      fresh.push(row);
    }
    const yelp = ints.find((i) => i.provider === "yelp"), gbp = ints.find((i) => i.provider === "gbp");
    const ym = (yelp?.meta as Row) ?? {}, ys = (ym.stats as Row) ?? {};
    const me = { name: yelp?.account_name ?? gbp?.account_name ?? "", yelp_id: yelp?.account_id ?? "", rating: Number(ys.rating ?? ym.rating ?? 0), reviews: Number(ys.reviews ?? ym.reviews ?? 0), url: ys.url ?? ym.url ?? "", gbp: !!gbp, yelp: !!yelp };
    return json({ ok: true, competitors: fresh.map(safeComp), me, configured: { yelp: !!YELP_KEY } });
  }
  if (b.op === "competitors.track") {
    if (!YELP_KEY) return json({ ok: false, error: "not_configured" });
    const x = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(b.id ?? "")}`, { headers: { Authorization: `Bearer ${YELP_KEY}` } }).then((r) => r.json()).catch(() => ({}));
    if (!x?.id) return json({ ok: false, error: "listing not found" });
    const snap = { ...yelpLite(x), photos: (x.photos ?? []).length, claimed: x.is_claimed !== false, hours: !!(x.hours ?? []).length };
    await fetch(`${SB_URL}/rest/v1/competitors?on_conflict=owner,yelp_id`, {
      method: "POST", headers: { ...sbH, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ owner: user.id, yelp_id: x.id, name: x.name, snapshot: snap, history: [{ at: Date.now(), rating: snap.rating, reviews: snap.reviews }], updated_at: new Date().toISOString() }),
    });
    return json({ ok: true });
  }
  if (b.op === "competitors.untrack") {
    await fetch(`${SB_URL}/rest/v1/competitors?owner=eq.${user.id}&yelp_id=eq.${encodeURIComponent(b.id ?? "")}`, { method: "DELETE", headers: sbH });
    return json({ ok: true });
  }
  if (b.op === "competitors.reviews") {
    if (!YELP_KEY) return json({ ok: false, error: "not_configured" });
    const rv = await fetch(`https://api.yelp.com/v3/businesses/${encodeURIComponent(b.id ?? "")}/reviews?limit=3&sort_by=newest`, { headers: { Authorization: `Bearer ${YELP_KEY}` } }).then((r) => r.json()).catch(() => ({}));
    return json({ ok: true, reviews: (rv.reviews ?? []).map((x: Row) => ({ rating: x.rating, text: String(x.text ?? "").slice(0, 240), user: (x.user as Row)?.name, at: x.time_created })) });
  }

  // ---------------- social media ----------------
  if (b.op === "social.stats") {
    const ints = await getIntegrations(user.id);
    const s = ints.find((i) => i.provider === "social"), gbp = ints.find((i) => i.provider === "gbp");
    const m = (s?.meta as Row) ?? {};
    let stats: Row = (m.social_stats as Row) ?? {};
    const at = Number(m.social_stats_at ?? 0);
    if (s?.account_id && (b.force || Date.now() - at > STATS_TTL)) {
      try { stats = await socialStats(s); } catch (e) { stats = { error: String(e).slice(0, 120) }; }
      await patchIntegration(s.id, { meta: { ...m, social_stats: stats, social_stats_at: Date.now() } });
    }
    return json({
      ok: true, stats,
      connected: { facebook: !!s?.account_id, instagram: !!((m.ig as Row) ?? {}).id, gbp: !!gbp?.account_id },
      configured: { meta: !!META_APP_ID, google: !!G_ID },
      page: s ? { name: s.account_name, id: s.account_id, ig: ((m.ig as Row) ?? {}).username ?? null, pages: (m.pages as Row[]) ?? [], picture: m.picture ?? null, status: s.status } : null,
    });
  }
  if (b.op === "social.select_page") {
    const ints = await getIntegrations(user.id), s = ints.find((i) => i.provider === "social");
    if (!s) return json({ ok: false, error: "not connected" });
    const pages = await fb("me/accounts?fields=id,name,access_token,instagram_business_account{id,username},picture{url}&limit=25", String(s.refresh_token ?? s.access_token));
    const p = (((pages.data as Row[]) ?? [])).find((x) => x.id === b.page_id);
    if (!p) return json({ ok: false, error: "page not found" });
    await patchIntegration(s.id, { account_id: p.id, account_name: p.name, access_token: p.access_token, status: "connected", meta: { ...((s.meta as Row) ?? {}), ig: p.instagram_business_account ?? null, picture: (p.picture as Row)?.data ? ((p.picture as Row).data as Row).url : null, social_stats: null, social_stats_at: 0 } });
    return json({ ok: true });
  }
  if (b.op === "social.posts.list") {
    await publishDue(user.id);
    const rows = await fetch(`${SB_URL}/rest/v1/social_posts?owner=eq.${user.id}&select=*&order=scheduled_at.desc.nullslast&limit=150`, { headers: sbH }).then((r) => r.ok ? r.json() : []).catch(() => []);
    return json({ ok: true, posts: rows });
  }
  if (b.op === "social.posts.create") {
    const bb = b as unknown as Row;
    const channels = ((bb.channels as string[]) ?? []).filter((c) => ["facebook", "instagram", "gbp"].includes(c));
    const text = String(bb.text ?? "").trim(), image_url = String(bb.image_url ?? "").trim(), link_url = String(bb.link_url ?? "").trim();
    if (!channels.length) return json({ ok: false, error: "pick at least one channel" });
    if (!text && !image_url) return json({ ok: false, error: "write something or add a photo" });
    if (channels.includes("instagram") && !image_url) return json({ ok: false, error: "Instagram posts need a photo" });
    const when = bb.scheduled_at ? Date.parse(String(bb.scheduled_at)) : NaN;
    const future = !isNaN(when) && when > Date.now() + 30e3;
    const row = { owner: user.id, channels, text, image_url: image_url || null, link_url: link_url || null, scheduled_at: new Date(future ? when : Date.now()).toISOString(), status: future ? "scheduled" : "publishing", results: {} };
    const ins = await fetch(`${SB_URL}/rest/v1/social_posts`, { method: "POST", headers: { ...sbH, Prefer: "return=representation" }, body: JSON.stringify(row) });
    const created = ins.ok ? (await ins.json())[0] : null;
    if (!created) return json({ ok: false, error: "couldn't save the post (is the social_posts table created?)" });
    if (future) return json({ ok: true, post: created });
    const ints = await getIntegrations(user.id);
    const { results, status } = await publishPost(created, ints);
    await fetch(`${SB_URL}/rest/v1/social_posts?id=eq.${created.id}`, { method: "PATCH", headers: sbH, body: JSON.stringify({ status, results, published_at: new Date().toISOString() }) });
    return json({ ok: true, post: { ...created, status, results } });
  }
  if (b.op === "social.posts.delete") {
    await fetch(`${SB_URL}/rest/v1/social_posts?owner=eq.${user.id}&id=eq.${encodeURIComponent(b.id ?? "")}`, { method: "DELETE", headers: sbH });
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
