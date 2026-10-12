// pros — Find a Pro: homeowners search BuilderPro contractors and ask for a quote.
//
//   { op:"search", q?, loc? }   -> { ok, pros:[{ id, name, trade, services[], about, city, state, area,
//                                                 phone, website, logo, color, match }] }
//        q    what they need ("roof leak", "kitchen remodel", "plumber")
//        loc  a 5-digit ZIP or a city. ZIP: same ZIP = "area", same first three
//             digits = "nearby". City: matched against the pro's city and the
//             service area they typed in Settings.
//   { op:"pro", id }            -> { ok, pro:{ ...the search fields, photos[], yelp:{rating,count,url,reviews[]},
//                                                 builderpro:{rating,count,reviews[]} } }
//        one listing in full. Yelp is read live when what we have is over a
//        day old (Yelp's caching limit) and stored on bp_directory.yelp.
//        Also calc (their instant-estimate calculator, on plans that have
//        one) and book (their inspection booking page, when it can book).
//   { op:"yelp_check", url }    -> { ok, name, rating, count, city } for Settings, so a contractor
//                                  can see the Yelp page they pasted is theirs
//   { op:"request", id, name, phone, email?, service?, details?, loc? }
//        -> adds the homeowner to that contractor's Contacts (tag "Find a Pro"),
//           which rings their bell as a new lead, and, when the contractor has
//           their own HighLevel, creates the contact there tagged new-lead +
//           find-a-pro so Speed to Lead and their other workflows fire and the
//           conversation lands in their inbox. A signed-in homeowner's request
//           is also kept in homeowner_requests for "My projects". { ok }
//
// Reads public.bp_directory (filled from Settings by bp_dir_sync) with the
// service key and hands back only the public fields: never the owner's user
// id, street address or email. No sign-in: the homeowner is anonymous.
//
// Deploy:  supabase functions deploy pros --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const YELP_KEY = Deno.env.get("YELP_API_KEY") ?? "";
const YELP_TTL = 23 * 3600 * 1000; // Yelp lets us keep what it returns for 24 hours
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = "https://builderpro-os.com";
const GHL_BASE = "https://services.leadconnectorhq.com";
const HOUSE_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "";
const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "";
const GHL_COMPANY_ID = Deno.env.get("GHL_COMPANY_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "anon";

async function take(bucket: string, key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const r = await rest("rpc/rate_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_key: key, p_max: max, p_window_sec: windowSec }) });
    if (!r.ok) return true; // the limiter being down should not take the directory down with it
    return (await r.json()) === true;
  } catch { return true; }
}

/* ------------------------------------------------------------ matching */
// what people type -> the words contractors use
const SYN: Record<string, string[]> = {
  roof: ["roof", "roofing", "shingle", "gutter", "leak"], roofer: ["roof", "roofing"], leak: ["leak", "roof", "plumb"],
  plumber: ["plumb"], plumbing: ["plumb"], pipe: ["plumb", "pipe", "repip"], drain: ["drain", "plumb"], toilet: ["plumb"],
  "water heater": ["water heater", "plumb"], electrician: ["electric"], electrical: ["electric"], wiring: ["electric"], outlet: ["electric"],
  hvac: ["hvac", "heating", "air condition", "furnace"], ac: ["hvac", "air condition"], heating: ["hvac", "heating", "furnace"],
  kitchen: ["kitchen", "remodel", "cabinet", "countertop"], bathroom: ["bath", "remodel"], bath: ["bath", "remodel"],
  remodel: ["remodel", "renovat", "general contractor"], renovation: ["remodel", "renovat"], addition: ["addition", "adu", "general contractor"],
  adu: ["adu", "addition"], paint: ["paint"], painter: ["paint"], painting: ["paint"], floor: ["floor", "tile"], flooring: ["floor"],
  tile: ["tile", "floor"], window: ["window"], windows: ["window"], door: ["door"], doors: ["door"], fence: ["fenc"], fencing: ["fenc"],
  concrete: ["concrete", "driveway", "patio"], driveway: ["driveway", "concrete", "paving"], landscaping: ["landscap", "yard", "lawn"],
  yard: ["landscap", "yard"], deck: ["deck", "patio"], siding: ["siding"], solar: ["solar"], handyman: ["handyman", "repair"],
  cabinets: ["cabinet"], countertops: ["countertop"], gutters: ["gutter"], insulation: ["insulat"], drywall: ["drywall"],
};
function stems(q: string): string[][] {
  const t = q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out: string[][] = [];
  if (SYN[t]) out.push(SYN[t]);
  for (const w of t.split(" ")) {
    if (w.length < 2 || ["a", "an", "the", "my", "for", "and", "in", "of", "to", "need", "new", "fix", "repair", "services", "service", "contractor", "company"].includes(w)) continue;
    const base = w.replace(/(ers|ing|er|es|s)$/, "");
    out.push(SYN[w] ?? [base.length >= 3 ? base : w]);
  }
  return out;
}

type Pro = Record<string, any>;
function score(p: Pro, groups: string[][]): number {
  if (!groups.length) return 1;
  const hayTrade = String(p.trade || "").toLowerCase(), haySvc = String(p.services || "").toLowerCase(),
    hayAll = `${p.name} ${p.about}`.toLowerCase();
  let s = 0;
  for (const g of groups) {
    let best = 0;
    for (const w of g) {
      if (hayTrade.includes(w)) best = Math.max(best, 3);
      else if (haySvc.includes(w)) best = Math.max(best, 2);
      else if (hayAll.includes(w)) best = Math.max(best, 1);
    }
    s += best;
  }
  return s;
}
function place(p: Pro, loc: string): "area" | "nearby" | "" {
  if (!loc) return "area";
  const zips: string[] = Array.isArray(p.zips) ? p.zips : [];
  if (/^\d{5}$/.test(loc)) {
    if (zips.includes(loc)) return "area";
    if (zips.some((z) => z.slice(0, 3) === loc.slice(0, 3))) return "nearby";
    return "";
  }
  const l = loc.toLowerCase().replace(/,?\s+[a-z]{2}$/, "").trim(); // "Burbank, CA" -> "burbank"
  if (!l) return "area";
  if (String(p.city || "").toLowerCase() === l) return "area";
  if (String(p.area || "").toLowerCase().includes(l)) return "area";
  if (String(p.city || "").toLowerCase().includes(l)) return "nearby";
  return "";
}
const COLS = "id,name,trade,services,about,city,state,zips,area,phone,website,logo,color,yelp_id,yelp,yelp_at,photos,bp_rating,bp_count,bp_reviews,sample";
const pub = (p: Pro, m: string) => ({
  id: p.id, name: p.name, trade: p.trade, services: services(p.services), about: p.about,
  city: p.city, state: p.state, area: p.area, phone: p.phone,
  website: p.website ? (/^https?:\/\//i.test(p.website) ? p.website : "https://" + p.website) : "",
  logo: p.logo, color: p.color, match: m, ...summary(p),
  sample: !!p.sample, // a test company with written-by-us reviews: the page labels it
});
const services = (s: string) => String(s || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 8);

/* ---------------------------------------------------------------- Yelp */
const yelpGet = (path: string) =>
  fetch(`https://api.yelp.com/v3/${path}`, { headers: { Authorization: `Bearer ${YELP_KEY}`, Accept: "application/json" }, signal: AbortSignal.timeout(6000) })
    .then(async (r) => (r.ok ? r.json() : null)).catch(() => null);
const yelpAlias = (u: string) => {
  const m = /yelp\.[a-z.]+\/biz\/([A-Za-z0-9_%-]+)/i.exec(u);
  return m ? decodeURIComponent(m[1]).slice(0, 120) : /^[A-Za-z0-9_-]{3,120}$/.test(u) ? u : "";
};
async function yelpRead(alias: string): Promise<Pro | null> {
  if (!YELP_KEY || !alias) return null;
  const [b, rv] = await Promise.all([yelpGet(`businesses/${encodeURIComponent(alias)}`), yelpGet(`businesses/${encodeURIComponent(alias)}/reviews?limit=3&sort_by=yelp_sort`)]);
  if (!b?.id) return null;
  return {
    name: clean(b.name, 120), rating: Number(b.rating) || 0, count: Number(b.review_count) || 0,
    url: String(b.url || "").split("?")[0], city: clean(b.location?.city, 80),
    photos: (Array.isArray(b.photos) ? b.photos : []).filter((u: string) => /^https:\/\/[a-z0-9.-]+\.yelpcdn\.com\//i.test(u)).slice(0, 3),
    reviews: (Array.isArray(rv?.reviews) ? rv.reviews : []).slice(0, 3).map((x: Pro) => ({
      rating: Number(x.rating) || 0, text: clean(x.text, 400), name: clean(x.user?.name, 40), at: clean(x.time_created, 30), url: String(x.url || "").split("?")[0],
    })),
  };
}
// refresh one listing's Yelp data when it is stale; returns what to show
async function yelpFresh(p: Pro): Promise<Pro> {
  if (!p.yelp_id || !YELP_KEY) return {};
  const at = p.yelp_at ? Date.parse(p.yelp_at) : 0;
  if (at && Date.now() - at < YELP_TTL && p.yelp && Object.keys(p.yelp).length) return p.yelp;
  const y = await yelpRead(p.yelp_id);
  const keep = y ?? {};
  await rest(`bp_directory?id=eq.${p.id}`, { method: "PATCH", body: JSON.stringify({ yelp: keep, yelp_at: new Date().toISOString() }) }).catch(() => {});
  return keep;
}
const half = (n: unknown) => Math.round((Number(n) || 0) * 10) / 10;
function summary(p: Pro) {
  const y: Pro = p.yelp && Object.keys(p.yelp).length && p.yelp_at && Date.now() - Date.parse(p.yelp_at) < 24 * 3600 * 1000 ? p.yelp : {};
  const photos: string[] = [...(Array.isArray(p.photos) ? p.photos : []), ...(Array.isArray(y.photos) ? y.photos : [])];
  return {
    cover: photos[0] || "", photoCount: photos.length,
    builderpro: p.bp_count > 0 ? { rating: half(p.bp_rating), count: p.bp_count } : null,
    yelp: y.count > 0 ? { rating: half(y.rating), count: y.count, url: y.url } : null,
  };
}

/* ------------------------------------------- calculator, booking, HighLevel */
// trade -> which of the 12 calculators (the same ids as BP_CALC_IDS in the app)
const CALC = ["roofing", "hvac", "plumbing", "electrical", "landscaping", "pools", "trim", "painting", "countertops", "concrete", "flooring"];
function calcId(trade: string): string {
  const t = trade.toLowerCase();
  if (/air|heat|furnace/.test(t)) return "hvac";
  for (const c of CALC) if (t.includes(c.replace(/s$/, "").replace(/ing$/, ""))) return c;
  if (/electric/.test(t)) return "electrical";
  if (/pool/.test(t)) return "pools";
  if (/paint/.test(t)) return "painting";
  return "general";
}
let house: { at: number; ids: string[] } = { at: 0, ids: [] };
async function houseOwners(): Promise<string[]> {
  if (Date.now() - house.at < 300000) return house.ids;
  const r = await rest("ai_config?key=in.(ghl_events_owner,ghl_house_owners)&select=value").catch(() => null);
  const rows: Pro[] = r && r.ok ? await r.json() : [];
  house = { at: Date.now(), ids: rows.flatMap((x) => String(x.value ?? "").split(",")).map((x) => x.trim()).filter((x) => UUID.test(x)) };
  return house.ids;
}
// the owner's own HighLevel location, or "" (the house location only for house owners)
async function ownerLoc(owner: string): Promise<string> {
  const [a, br] = await Promise.all([
    rest(`accounts?user_id=eq.${owner}&select=ghl_location_id,plan,status&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
    rest(`ai_brain?owner=eq.${owner}&select=ghl_location_id,booking_calendar_id,is_demo&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
  ]);
  const loc = String(a[0]?.ghl_location_id || br[0]?.ghl_location_id || "");
  if (!loc) return "";
  if (HOUSE_LOC && loc === HOUSE_LOC && !(await houseOwners()).includes(owner)) return "";
  return loc;
}
async function ghlTokenFor(loc: string): Promise<string> {
  const k = await rest(`ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []);
  if (k[0]?.token) return String(k[0].token);
  const env = Deno.env.get(`GHL_TOKEN_${loc}`); if (env) return env;
  if (loc === HOUSE_LOC && GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST", headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(), signal: AbortSignal.timeout(6000),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return String(d.access_token); }
    } catch { /* no token */ }
  }
  return "";
}
// what the listing can offer beyond a quote request
async function extras(owner: string): Promise<{ calc: string; book: string }> {
  const [a, br, hs] = await Promise.all([
    rest(`accounts?user_id=eq.${owner}&select=plan,status&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
    rest(`ai_brain?owner=eq.${owner}&select=ghl_location_id,booking_calendar_id,is_demo&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
    houseOwners(),
  ]);
  const acc = a[0] ?? {}, b = br[0] ?? {};
  const live = ["active", "trial"].includes(String(acc.status));
  // calculators are on every plan but Foundation
  const calc = live && acc.plan !== "foundation" ? "yes" : "";
  // booking: their own calendar on their own HighLevel, a demo brain, or the house account
  const ownCal = !!(b.ghl_location_id && b.booking_calendar_id && b.ghl_location_id !== HOUSE_LOC);
  const book = live && (ownCal || b.is_demo === true || hs.includes(owner)) ? `${SITE}/book/?u=${owner}` : "";
  return { calc, book };
}

async function search(b: Pro, req: Request) {
  if (!(await take("pros-search", clientIp(req), 120, 600))) return json({ ok: false, error: "Too many searches. Try again in a few minutes." }, 429);
  const q = clean(b.q, 80), loc = clean(b.loc, 60);
  const r = await rest(`bp_directory?listed=eq.true&select=${COLS}&order=updated_at.desc&limit=1000`);
  if (!r.ok) return json({ ok: false, error: "Search isn't available right now." }, 502);
  const rows: Pro[] = await r.json();
  const groups = stems(q);
  const hits = rows.map((p) => ({ p, s: score(p, groups), m: place(p, loc) }))
    .filter((x) => x.s > 0 && x.m)
    .sort((a, b) => (a.m === b.m ? 0 : a.m === "area" ? -1 : 1) || b.s - a.s || String(a.p.name).localeCompare(String(b.p.name)))
    .slice(0, 40);
  // listings whose Yelp numbers are over a day old: refresh a few after answering
  const stale = hits.map((x) => x.p).filter((p) => p.yelp_id && (!p.yelp_at || Date.now() - Date.parse(p.yelp_at) > YELP_TTL)).slice(0, 4);
  // deno-lint-ignore no-explicit-any
  if (stale.length && YELP_KEY) (globalThis as any).EdgeRuntime?.waitUntil?.(Promise.all(stale.map(yelpFresh)));
  // better-reviewed pros first within the same match level and relevance
  const stars = (p: Pro) => { const s = summary(p); return (s.builderpro?.rating ?? 0) * 2 + (s.yelp?.rating ?? 0) + (s.cover ? 0.5 : 0); };
  hits.sort((a, b) => (a.m === b.m ? 0 : a.m === "area" ? -1 : 1) || b.s - a.s || stars(b.p) - stars(a.p));
  return json({ ok: true, pros: hits.map(({ p, m }) => pub(p, m)) });
}

async function one(b: Pro, req: Request) {
  if (!(await take("pros-search", clientIp(req), 120, 600))) return json({ ok: false, error: "Too many requests. Try again in a few minutes." }, 429);
  const id = clean(b.id, 40);
  if (!UUID.test(id)) return json({ ok: false, error: "Not found" }, 404);
  const r = await rest(`bp_directory?id=eq.${id}&listed=eq.true&select=${COLS}&limit=1`);
  const p: Pro | undefined = r.ok ? (await r.json())[0] : undefined;
  if (!p) return json({ ok: false, error: "This listing isn't available." }, 404);
  const [y, own] = await Promise.all([
    yelpFresh(p),
    rest(`bp_directory?id=eq.${id}&select=user_id,trade&limit=1`).then((r) => r.ok ? r.json() : []).catch(() => []),
  ]);
  p.yelp = y; p.yelp_at = new Date().toISOString();
  const owner = String(own[0]?.user_id ?? "");
  const ex = owner ? await extras(owner) : { calc: "", book: "" };
  // the calculator page already carries the owner id in its public link (u=)
  const calc = ex.calc ? `${SITE}/embed/${calcId(String(p.trade || ""))}.html?u=${owner}&utm_source=find-a-pro` : "";
  const photos = [...(p.photos ?? []), ...(y.photos ?? [])];
  return json({
    ok: true,
    pro: {
      ...pub(p, ""), photos,
      zips: p.zips ?? [], calc, book: ex.book,
      builderpro: p.bp_count > 0 ? { rating: half(p.bp_rating), count: p.bp_count, reviews: Array.isArray(p.bp_reviews) ? p.bp_reviews : [] } : null,
      yelp: y.count > 0 ? { rating: half(y.rating), count: y.count, url: y.url, reviews: y.reviews ?? [] } : null,
    },
  });
}

async function yelpCheck(b: Pro, req: Request) {
  if (!(await take("pros-yelp-check", clientIp(req), 15, 3600))) return json({ ok: false, error: "Too many checks. Try again later." }, 429);
  if (!YELP_KEY) return json({ ok: false, error: "Yelp isn't set up yet." });
  const alias = yelpAlias(clean(b.url, 300));
  if (!alias) return json({ ok: false, error: "Paste the link to your page on yelp.com (it has /biz/ in it)." });
  const y = await yelpRead(alias);
  if (!y) return json({ ok: false, error: "We couldn't find that page on Yelp." });
  return json({ ok: true, name: y.name, rating: half(y.rating), count: y.count, city: y.city, url: y.url });
}

async function request(b: Pro, req: Request) {
  const id = clean(b.id, 40);
  if (!UUID.test(id)) return json({ ok: false, error: "Pick a contractor first." }, 400);
  const name = clean(b.name, 80), phone = clean(b.phone, 30), email = clean(b.email, 120).toLowerCase();
  const service = clean(b.service, 60), details = clean(b.details, 1000), loc = clean(b.loc, 120);
  if (!name) return json({ ok: false, error: "Add your name." }, 400);
  if (phone.replace(/\D/g, "").length < 10) return json({ ok: false, error: "Add a phone number with area code." }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "That email doesn't look right." }, 400);
  const ip = clientIp(req);
  if (!(await take("pros-req-ip", ip, 6, 3600))) return json({ ok: false, error: "You've sent a lot of requests. Try again in an hour." }, 429);
  const r = await rest(`bp_directory?id=eq.${id}&listed=eq.true&select=user_id,name&limit=1`);
  const pro = r.ok ? ((await r.json()) as Pro[])[0] : null;
  if (!pro) return json({ ok: false, error: "That contractor isn't taking requests here right now." }, 404);
  if (!(await take("pros-req-pro", pro.user_id + ":" + phone.replace(/\D/g, ""), 2, 86400))) return json({ ok: true, dup: true });
  const notes = [
    "Quote request from Find a Pro (builderpro-os.com).",
    service ? "Service: " + service : "",
    loc ? "Location: " + loc : "",
    details ? "Details: " + details : "",
  ].filter(Boolean).join("\n");
  const ins = await rest("contacts", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ owner: pro.user_id, name, phone, email, tags: ["Find a Pro", ...(service ? [service.slice(0, 40)] : [])], notes }),
  });
  if (!ins.ok) return json({ ok: false, error: "We couldn't send that. Try again in a minute." }, 502);
  const user = await signedIn(req);
  const after = Promise.all([
    user ? rest("homeowner_requests", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ user_id: user, pro_id: id, pro_name: pro.name, service, details }) }).catch(() => {}) : null,
    toGhl(pro.user_id, { name, phone, email, service, details, loc }),
  ]);
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(after); else await after;
  return json({ ok: true, name: pro.name });
}

// the homeowner's user id when the request carries their sign-in, else ""
async function signedIn(req: Request): Promise<string> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt === SB_ANON || jwt.split(".").length !== 3) return "";
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON || SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return "";
    const u = await r.json();
    return UUID.test(String(u?.id ?? "")) ? String(u.id) : "";
  } catch { return ""; }
}

// into the contractor's own HighLevel: contact + tags (workflows) + a note with the job
async function toGhl(owner: string, l: { name: string; phone: string; email: string; service: string; details: string; loc: string }) {
  try {
    const loc = await ownerLoc(owner);
    if (!loc) { console.log("pros ghl: no HighLevel for this owner, BuilderPro Contacts only"); return; }
    const tok = await ghlTokenFor(loc);
    if (!tok) { console.log("pros ghl: no token for", loc); return; }
    const h = { Authorization: `Bearer ${tok}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };
    const digits = l.phone.replace(/\D/g, "");
    // 555-01xx numbers are reserved for fiction: treat them as tests so customer workflows skip them
    const test = /^1?\d{3}55501\d{2}$/.test(digits);
    const [first, ...rest_] = l.name.split(/\s+/);
    const r = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST", headers: h, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        locationId: loc, firstName: first, lastName: rest_.join(" ") || undefined, name: l.name,
        phone: l.phone, email: l.email || undefined, source: "BuilderPro Find a Pro",
        tags: ["new-lead", "find-a-pro", ...(test ? ["system-test"] : [])],
      }),
    });
    const d = await r.json().catch(() => ({}));
    const cid = d?.contact?.id || d?.id || "";
    if (!r.ok || !cid) { console.error("pros ghl", r.status, JSON.stringify(d).slice(0, 200)); return; }
    const note = ["Quote request from BuilderPro Find a Pro.", l.service && "Service: " + l.service, l.loc && "Location: " + l.loc, l.details && "Details: " + l.details].filter(Boolean).join("\n");
    await fetch(`${GHL_BASE}/contacts/${cid}/notes`, { method: "POST", headers: h, body: JSON.stringify({ body: note }), signal: AbortSignal.timeout(6000) }).catch(() => {});
    console.log("pros ghl: contact", cid, "in", loc, test ? "(test)" : "");
  } catch (e) { console.error("pros ghl", String(e).slice(0, 160)); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Pro = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "Bad request" }, 400); }
  try {
    if (b.op === "search") return await search(b, req);
    if (b.op === "request") return await request(b, req);
    if (b.op === "pro") return await one(b, req);
    if (b.op === "yelp_check") return await yelpCheck(b, req);
    return json({ ok: false, error: "Unknown op" }, 400);
  } catch (e) {
    console.error("pros", e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
});
