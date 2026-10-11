// pros — Find a Pro: homeowners search BuilderPro contractors and ask for a quote.
//
//   { op:"search", q?, loc? }   -> { ok, pros:[{ id, name, trade, services[], about, city, state, area,
//                                                 phone, website, logo, color, match }] }
//        q    what they need ("roof leak", "kitchen remodel", "plumber")
//        loc  a 5-digit ZIP or a city. ZIP: same ZIP = "area", same first three
//             digits = "nearby". City: matched against the pro's city and the
//             service area they typed in Settings.
//   { op:"request", id, name, phone, email?, service?, details?, loc? }
//        -> adds the homeowner to that contractor's Contacts (tag "Find a Pro"),
//           which rings their bell as a new lead. { ok }
//
// Reads public.bp_directory (filled from Settings by bp_dir_sync) with the
// service key and hands back only the public fields: never the owner's user
// id, street address or email. No sign-in: the homeowner is anonymous.
//
// Deploy:  supabase functions deploy pros --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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
const services = (s: string) => String(s || "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 8);

async function search(b: Pro, req: Request) {
  if (!(await take("pros-search", clientIp(req), 120, 600))) return json({ ok: false, error: "Too many searches. Try again in a few minutes." }, 429);
  const q = clean(b.q, 80), loc = clean(b.loc, 60);
  const r = await rest("bp_directory?listed=eq.true&select=id,name,trade,services,about,city,state,zips,area,phone,website,logo,color&order=updated_at.desc&limit=1000");
  if (!r.ok) return json({ ok: false, error: "Search isn't available right now." }, 502);
  const rows: Pro[] = await r.json();
  const groups = stems(q);
  const hits = rows.map((p) => ({ p, s: score(p, groups), m: place(p, loc) }))
    .filter((x) => x.s > 0 && x.m)
    .sort((a, b) => (a.m === b.m ? 0 : a.m === "area" ? -1 : 1) || b.s - a.s || String(a.p.name).localeCompare(String(b.p.name)))
    .slice(0, 40);
  return json({
    ok: true,
    pros: hits.map(({ p, m }) => ({
      id: p.id, name: p.name, trade: p.trade, services: services(p.services), about: p.about,
      city: p.city, state: p.state, area: p.area, phone: p.phone,
      website: p.website ? (/^https?:\/\//i.test(p.website) ? p.website : "https://" + p.website) : "",
      logo: p.logo, color: p.color, match: m,
    })),
  });
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
  return json({ ok: true, name: pro.name });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Pro = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "Bad request" }, 400); }
  try {
    if (b.op === "search") return await search(b, req);
    if (b.op === "request") return await request(b, req);
    return json({ ok: false, error: "Unknown op" }, 400);
  } catch (e) {
    console.error("pros", e);
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
});
