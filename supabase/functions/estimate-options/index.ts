// estimate-options: Good / Better / Best estimates.
//
// The contractor builds one estimate the normal way. That estimate is the
// "Better" option. This function writes the other two around it (a budget
// way to do the same job and a premium one), the contractor checks them, and
// the customer gets ONE link (#est=<token>) showing all three side by side.
// They pick one and sign on that page. The pick then becomes a normal
// accepted estimate in the contractor's HighLevel, so everything that runs
// after an accepted estimate today still runs: the deposit invoice and pay
// link (OS and Enterprise), workflow 08, the pipeline stage, and the project
// when the deposit is paid.
//
// Signed in (owner or office):
//   { op:"build", trade, title, scope, lines:[{name,desc,qty,unit,price,sec}] }
//        -> { ok, ai, tiers:[good, better, best] }   (pre-tax lines; the portal adds tax)
//   { op:"send", jobId, contactId, customer, phone, email, title, scope, addr,
//     tiers, taxPct, taxOn, discount, recommended, via, validDays, businessName }
//        -> { ok, id, token, link, sent, reason? }
// Public (the token is the credential):
//   { op:"get", token }                        -> what the customer sees
//   { op:"choose", token, key, name, signature, consent }
//   { op:"decline", token, note }
//
// Deploy:  supabase functions deploy estimate-options --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const TIER_MODEL = Deno.env.get("TIER_MODEL") ?? "gemini-3.8-flash";
/* Google retires model names (gemini-2.5-flash is closed to new keys), so try
   the configured one, then the current ones; a model that rejects the thinking
   setting is asked again without it */
const MODELS = [...new Set([TIER_MODEL, "gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"].filter(Boolean))];
let goodModel = "";
// deno-lint-ignore no-explicit-any
async function gemini(body: any, timeoutMs: number): Promise<{ ok: boolean; text: string; status?: number }> {
  let last = 0;
  for (const m of goodModel ? [goodModel, ...MODELS.filter((x) => x !== goodModel)] : MODELS) {
    let b = body;
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_API_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.ok) {
          goodModel = m;
          const out = await r.json();
          return { ok: true, text: out?.candidates?.[0]?.content?.parts?.map((p: { text?: string; thought?: boolean }) => p.thought ? "" : (p.text ?? "")).join("") ?? "" };
        }
        last = r.status;
        if (r.status === 400 && b.generationConfig?.thinkingConfig) { const gc = { ...b.generationConfig }; delete gc.thinkingConfig; b = { ...b, generationConfig: gc }; continue; }
      } catch { last = 0; }
      break;
    }
    if (last !== 404 && last !== 400) break;
  }
  return { ok: false, text: "", status: last };
}
const SITE = (Deno.env.get("PORTAL_URL") || "https://builderpro-os.com/").replace(/\/?$/, "/");
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
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });
const ghlH = (t: string, v = "2021-07-28") => ({ Authorization: `Bearer ${t}`, Version: v, Accept: "application/json", "Content-Type": "application/json" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n: number) => "$" + r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const one = async (path: string): Promise<Row | null> => { try { const r = await rest(path); return r.ok ? ((await r.json())[0] ?? null) : null; } catch { return null; } };

async function take(bucket: string, key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const r = await rest("rpc/rate_take", { method: "POST", body: JSON.stringify({ p_bucket: bucket, p_key: key, p_max: max, p_window_sec: windowSec }) });
    if (!r.ok) return true;
    return (await r.json()) === true;
  } catch { return true; }
}

/* ---------- who's asking (signed in) ---------- */
async function caller(req: Request): Promise<{ owner: string; uid: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt || jwt.split(".").length !== 3) return null;
  let uid = "";
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    uid = r.ok ? String((await r.json())?.id ?? "") : "";
  } catch { /* below */ }
  if (!UUID.test(uid)) return null;
  const tm = await one(`team_members?member=eq.${uid}&accepted_at=not.is.null&select=owner,role&limit=1`);
  if (tm && tm.role !== "office") return null;   // crew and subs don't send estimates
  return { owner: String(tm?.owner ?? uid), uid };
}

/* ---------- the owner's HighLevel ---------- */
let house: { at: number; ids: string[] } = { at: 0, ids: [] };
async function houseOwners(): Promise<string[]> {
  if (Date.now() - house.at < 300000) return house.ids;
  const r = await rest("ai_config?key=in.(ghl_events_owner,ghl_house_owners)&select=value").catch(() => null);
  const rows: Row[] = r && r.ok ? await r.json() : [];
  house = { at: Date.now(), ids: rows.flatMap((x) => String(x.value ?? "").split(",")).map((x) => x.trim()).filter((x) => UUID.test(x)) };
  return house.ids;
}
async function ownerLoc(owner: string): Promise<string> {
  const [a, b] = await Promise.all([
    one(`accounts?user_id=eq.${owner}&select=ghl_location_id&limit=1`),
    one(`ai_brain?owner=eq.${owner}&select=ghl_location_id&limit=1`),
  ]);
  const loc = String(a?.ghl_location_id || b?.ghl_location_id || "");
  if (!loc) return "";
  if (HOUSE_LOC && loc === HOUSE_LOC && !(await houseOwners()).includes(owner)) return "";   // a stale pointer to the house account
  return loc;
}
async function ghlToken(loc: string): Promise<string> {
  const k = await one(`ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token&limit=1`);
  if (k?.token) return String(k.token);
  const env = Deno.env.get(`GHL_TOKEN_${loc}`); if (env) return env;
  if (loc === HOUSE_LOC && GHL_TOKEN) return GHL_TOKEN;
  if (GHL_API_KEY && GHL_COMPANY_ID) {
    try {
      const r = await fetch(`${GHL_BASE}/oauth/locationToken`, {
        method: "POST", headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: GHL_COMPANY_ID, locationId: loc }).toString(), signal: AbortSignal.timeout(6000),
      });
      if (r.ok) { const d = await r.json(); if (d?.access_token) return String(d.access_token); }
    } catch { /* none */ }
  }
  return "";
}
/* a BuilderPro contact (uuid) is reached in HighLevel through its ghl_id */
async function ghlContactOf(owner: string, contactId: string): Promise<string> {
  if (!contactId) return "";
  if (!UUID.test(contactId)) return contactId;
  const c = await one(`contacts?id=eq.${contactId}&owner=eq.${owner}&select=ghl_id&limit=1`);
  return String(c?.ghl_id ?? "");
}
async function company(owner: string): Promise<Row> {
  const s = await one(`client_settings?user_id=eq.${owner}&select=data&limit=1`);
  const co = (s?.data?.company ?? {}) as Row;
  const hex = /^#[0-9a-f]{6}$/i.test(String(co.brandColor ?? "")) ? String(co.brandColor) : "";
  const lg = String(co.logoUrl ?? "");
  const logo = /^https:\/\//i.test(lg) && lg.length < 2000 ? lg : "";
  return { name: clean(co.name, 80), phone: clean(co.phone, 30), email: clean(co.email, 120), logo, color: hex, license: clean(co.license, 40) };
}

/* ---------- the three options ---------- */
type Line = { name: string; desc: string; qty: number; unit: string; price: number; sec: string };
const SECS = ["mat", "lab", "oth", "all"];
function linesOf(v: unknown): Line[] {
  return (Array.isArray(v) ? v : []).slice(0, 80).map((l: Row) => ({
    name: clean(l?.name, 120) || "Item", desc: clean(l?.desc ?? l?.description, 300),
    qty: Math.max(0.01, r2(l?.qty) || 1), unit: clean(l?.unit, 12) || "ea",
    price: Math.max(0, r2(l?.price ?? l?.amount)), sec: SECS.includes(String(l?.sec)) ? String(l.sec) : "oth",
  })).filter((l) => l.price > 0);
}
const subOf = (ls: Line[]) => r2(ls.reduce((t, l) => t + r2(l.qty * l.price), 0));
function scaleTo(ls: Line[], target: number): Line[] {
  const s = subOf(ls); if (!(s > 0)) return ls;
  const f = target / s;
  return ls.map((l) => ({ ...l, price: r2(l.price * f) }));
}
/* keep each option in a believable band around the contractor's own price */
function band(ls: Line[], base: number, lo: number, hi: number, mid: number): Line[] {
  const s = subOf(ls);
  if (!(s > 0)) return [];
  const r = s / base;
  return r < lo || r > hi ? scaleTo(ls, base * mid) : ls;
}

const TIER = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", description: "2 to 5 words naming this option for a homeowner, e.g. 'Standard 14.3 SEER2 system'" },
    summary: { type: "STRING", description: "one plain sentence on who this option suits" },
    bullets: { type: "ARRAY", items: { type: "STRING" }, description: "3 to 5 short highlights of what's included, homeowner language" },
    warranty: { type: "STRING", description: "the warranty in a few words, e.g. '10-yr parts, 1-yr labor'" },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, desc: { type: "STRING" }, qty: { type: "NUMBER" }, unit: { type: "STRING" },
          price: { type: "NUMBER", description: "customer unit price in dollars, before tax" },
          sec: { type: "STRING", enum: ["mat", "lab", "oth"] },
        },
        required: ["name", "qty", "price", "sec"],
      },
    },
  },
  required: ["title", "summary", "bullets", "warranty", "lines"],
};
const TIERS_SCHEMA = { type: "OBJECT", properties: { good: TIER, better: TIER, best: TIER }, required: ["good", "better", "best"] };

const BUILD_PROMPT = `You help a home-services contractor turn ONE estimate into three options a homeowner can choose from: Good, Better and Best.

The estimate you are given IS the Better option. Price it exactly as given: copy its lines unchanged into "better". Only write Better's title, summary, bullets and warranty.

Good: the budget way to do the SAME job properly. A complete, code-compliant job with lower-grade materials or equipment, fewer extras, a shorter warranty. Remove optional add-ons, not essentials. Usually 70% to 90% of Better's price.
Best: the premium version. Top-grade materials or equipment and the upgrades that genuinely make sense for this trade and job (for example HVAC: higher-efficiency variable-speed equipment, a smart thermostat, surge protection, a longer labor warranty, a maintenance plan; roofing: designer shingles, synthetic underlayment, full ice and water shield, ridge vent, an extended manufacturer warranty; plumbing: a better-brand fixture or tankless, a leak sensor; electrical: whole-home surge, a larger panel). Usually 120% to 160% of Better's price.

Rules:
- Prices are CUSTOMER prices (already marked up), before tax. Never add a tax line.
- Keep the labor lines and adjust them only when the scope really changes (premium equipment can take a bit longer).
- Use real-world, conservative prices for anything you add or swap. Don't invent brand model numbers.
- Name lines the way a contractor writes them on an estimate. Keep quantities and units sensible.
- Titles: short and concrete, no hype words like "ultimate" or "platinum". No dashes like "—".
- Bullets are what the homeowner gets, in plain words, most important first.`;

function fallback(base: Line[], trade: string): Row {
  const t = String(trade || "").toLowerCase();
  const warrantyBy = /roof/.test(t) ? ["Manufacturer warranty, 2-yr workmanship", "Manufacturer warranty, 5-yr workmanship", "Extended manufacturer warranty, 10-yr workmanship"]
    : /hvac|heat|air|furnace/.test(t) ? ["10-yr parts, 1-yr labor", "10-yr parts, 2-yr labor", "10-yr parts, 10-yr labor"]
    : ["1-yr workmanship", "2-yr workmanship", "5-yr workmanship"];
  const good = base.map((l) => ({ ...l, price: r2(l.price * (l.sec === "mat" ? 0.8 : l.sec === "lab" ? 0.95 : 1)) }));
  const sub = subOf(base);
  const best = base.map((l) => ({ ...l, price: r2(l.price * (l.sec === "mat" ? 1.25 : l.sec === "lab" ? 1.1 : 1)) }))
    .concat([{ name: "Extended workmanship warranty", desc: warrantyBy[2], qty: 1, unit: "ea", price: r2(Math.max(150, sub * 0.06)), sec: "oth" },
             { name: "Priority service, first year", desc: "Front of the line if anything needs attention", qty: 1, unit: "ea", price: r2(Math.max(99, sub * 0.03)), sec: "oth" }]);
  return {
    good: { title: "Essential", summary: "The job done right at the lowest price.", bullets: ["Standard-grade materials", "Complete, code-compliant installation", "Clean-up and haul-away"], warranty: warrantyBy[0], lines: good },
    better: { title: "Recommended", summary: "The best value for most homes.", bullets: ["Quality materials we recommend", "Complete, code-compliant installation", "Clean-up and haul-away", "Longer workmanship warranty"], warranty: warrantyBy[1], lines: base },
    best: { title: "Premium", summary: "Top-grade materials and the longest protection.", bullets: ["Premium-grade materials", "Upgrades that last longer", "Longest workmanship warranty", "Priority service for a year"], warranty: warrantyBy[2], lines: best },
  };
}
function tierOut(key: string, name: string, t: Row, lines: Line[]): Row {
  return {
    key, name, title: clean(t?.title, 60) || name, summary: clean(t?.summary, 200),
    bullets: (Array.isArray(t?.bullets) ? t.bullets : []).map((x: unknown) => clean(x, 120)).filter(Boolean).slice(0, 6),
    warranty: clean(t?.warranty, 80), lines,
  };
}
async function build(b: Row, who: { owner: string }) {
  const base = linesOf(b.lines);
  if (!base.length) return json({ ok: false, error: "Price the estimate first. Its lines become the Better option." }, 400);
  if (!(await take("tiers", who.owner, 60, 3600))) return json({ ok: false, error: "too many" }, 429);
  const sub = subOf(base);
  const trade = clean(b.trade, 40), title = clean(b.title, 120), scope = clean(b.scope, 2000);
  let raw: Row | null = null, ai = false, aiErr = "";
  if (GEMINI_API_KEY) {
    const g = await gemini({
      systemInstruction: { parts: [{ text: BUILD_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ trade, job: title, scope, better_subtotal: sub, better_lines: base.map((l) => ({ name: l.name, desc: l.desc, qty: l.qty, unit: l.unit, price: l.price, sec: l.sec === "all" ? "oth" : l.sec })) }) }] }],
      generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema: TIERS_SCHEMA, maxOutputTokens: 8000, thinkingConfig: { thinkingBudget: 0 } },
    }, 40000);
    if (g.ok) { try { raw = JSON.parse(g.text); ai = true; } catch { aiErr = "unparsable"; } }
    else aiErr = `model ${g.status ?? 0}`;
  }
  const fb = fallback(base, trade);
  const src = raw ?? fb;
  let good = band(linesOf(src.good?.lines), sub, 0.6, 0.95, 0.82);
  let best = band(linesOf(src.best?.lines), sub, 1.1, 1.8, 1.35);
  if (!good.length) good = fb.good.lines;
  if (!best.length) best = fb.best.lines;
  return json({
    ok: true, ai, ...(aiErr ? { ai_error: aiErr } : {}),
    tiers: [
      tierOut("good", "Good", src.good ?? fb.good, good),
      tierOut("better", "Better", src.better ?? fb.better, base),
      tierOut("best", "Best", src.best ?? fb.best, best),
    ],
  });
}

/* totals worked out here, never trusted from the browser */
function priced(t: Row, taxPct: number, taxOn: string, discount: number): Row {
  const lines = linesOf(t.lines);
  const sub = subOf(lines);
  const taxBase = taxOn === "all" ? sub : subOf(lines.filter((l) => l.sec === "mat" || l.sec === "all"));
  const tax = r2(taxBase * Math.max(0, Math.min(20, taxPct)) / 100);
  const disc = Math.max(0, Math.min(r2(discount), r2(sub + tax)));
  return {
    key: ["good", "better", "best"].includes(String(t.key)) ? String(t.key) : "better",
    name: clean(t.name, 20) || "Option", title: clean(t.title, 60), summary: clean(t.summary, 200),
    bullets: (Array.isArray(t.bullets) ? t.bullets : []).map((x: unknown) => clean(x, 120)).filter(Boolean).slice(0, 6),
    warranty: clean(t.warranty, 80), lines, sub, tax, taxPct: r2(taxPct), taxOn: taxOn === "all" ? "all" : "materials", disc, total: r2(sub + tax - disc),
  };
}

async function sendText(t: string, contactId: string, how: string, text: string, subject: string): Promise<{ sent: boolean; error: string }> {
  const out: string[] = []; let ok = false;
  const go = async (body: Row) => {
    try {
      const r = await fetch(`${GHL_BASE}/conversations/messages`, { method: "POST", headers: ghlH(t, "2021-04-15"), body: JSON.stringify({ contactId, ...body }) });
      if (r.ok) ok = true; else out.push(`${body.type} ${r.status}: ${((await r.json().catch(() => ({}))) as Row)?.message ?? ""}`);
    } catch (e) { out.push(String(e).slice(0, 80)); }
  };
  if (how !== "email") await go({ type: "SMS", message: text });
  if (how !== "sms") await go({ type: "Email", subject, html: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>").replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>') });
  return { sent: ok, error: out.join("; ") };
}

async function send(b: Row, who: { owner: string; uid: string }) {
  if (!(await take("options-send", who.owner, 60, 3600))) return json({ ok: false, error: "too many" }, 429);
  const taxPct = Number(b.taxPct) || 0, taxOn = String(b.taxOn ?? "materials"), disc = Number(b.discount) || 0;
  const tiers = (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 3).map((t: Row) => priced(t, taxPct, taxOn, disc)).filter((t: Row) => t.total > 0);
  if (tiers.length < 2) return json({ ok: false, error: "Each option needs a price." }, 400);
  const jobId = clean(b.jobId, 60), contactId = clean(b.contactId, 60);
  if (!contactId) return json({ ok: false, error: "Pick the customer first." }, 400);
  const via = ["sms", "email", "both"].includes(String(b.via)) ? String(b.via) : "sms";
  const validDays = Math.max(1, Math.min(90, Number(b.validDays) || 14));
  const co = await company(who.owner);
  const biz = co.name || clean(b.businessName, 80) || "Your contractor";
  const ghlContact = await ghlContactOf(who.owner, contactId);
  const row = {
    owner: who.owner, job_id: jobId, contact_id: contactId, ghl_contact: ghlContact,
    customer: clean(b.customer, 120), phone: clean(b.phone, 30), email: clean(b.email, 120),
    title: clean(b.title, 120) || "Your estimate", scope: clean(b.scope, 4000), addr: clean(b.addr, 200),
    tiers, recommended: ["good", "better", "best"].includes(String(b.recommended)) ? String(b.recommended) : "better",
    show: ["items", "sections", "total"].includes(String(b.show)) ? String(b.show) : "items",
    status: "sent", expires_at: new Date(Date.now() + validDays * 864e5).toISOString(),
    audit: [{ at: new Date().toISOString(), event: "sent", by: who.uid }],
  };
  // a new set replaces the one sent before for the same sheet
  if (jobId) await rest(`estimate_options?owner=eq.${who.owner}&job_id=eq.${encodeURIComponent(jobId)}&status=eq.sent`, { method: "PATCH", body: JSON.stringify({ status: "void", updated_at: new Date().toISOString() }) }).catch(() => {});
  const ins = await rest("estimate_options", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!ins.ok) return json({ ok: false, error: "Couldn't save the options." }, 500);
  const saved = (await ins.json())[0] as Row;
  const link = `${SITE}#est=${saved.token}`;
  // text / email the link from the contractor's own HighLevel number and address
  let sent = false, reason = "";
  const loc = await ownerLoc(who.owner);
  if (!loc) reason = "no_highlevel";
  else if (!ghlContact) reason = "no_contact";
  else {
    const t = await ghlToken(loc);
    if (!t) reason = "no_token";
    else {
      const first = row.customer.split(/\s+/)[0] || "there";
      const r = await sendText(t, ghlContact, via,
        `${biz}: Hi ${first}, your estimate for ${row.title} is ready. We put together ${tiers.length} options so you can pick what fits best: ${link}`,
        `${biz}: your estimate options`);
      sent = r.sent; reason = r.sent ? "" : (r.error || "send_failed");
    }
  }
  await rest(`estimate_options?id=eq.${saved.id}`, { method: "PATCH", body: JSON.stringify({ audit: [...row.audit, { at: new Date().toISOString(), event: sent ? "messaged" : "not_messaged", reason }] }) }).catch(() => {});
  return json({ ok: true, id: saved.id, token: saved.token, link, sent, reason, tiers });
}

/* ---------- public side ---------- */
async function byToken(token: unknown): Promise<Row | null> {
  const t = String(token ?? "");
  if (!/^[a-f0-9]{24,64}$/i.test(t)) return null;
  return one(`estimate_options?token=eq.${t}&select=*&limit=1`);
}
const forCustomer = (r: Row, co: Row) => ({
  title: r.title, scope: r.scope, addr: r.addr, customer: r.customer, status: r.status, chosen: r.chosen,
  recommended: r.recommended, show: r.show, signer_name: r.signer_name, chosen_at: r.chosen_at, expires_at: r.expires_at, created_at: r.created_at,
  expired: r.status === "sent" && r.expires_at && Date.parse(r.expires_at) < Date.now(),
  tiers: (r.tiers ?? []).map((t: Row) => ({ key: t.key, name: t.name, title: t.title, summary: t.summary, bullets: t.bullets, warranty: t.warranty, lines: t.lines, sub: t.sub, tax: t.tax, taxPct: t.taxPct, disc: t.disc, total: t.total })),
  company: co,
});
async function get(b: Row, req: Request) {
  if (!(await take("options-get", clientIp(req) || "anon", 120, 3600))) return json({ ok: false, error: "too many" }, 429);
  const r = await byToken(b.token);
  if (!r || r.status === "void") return json({ ok: false, error: r ? "void" : "not_found" }, 404);
  if (!r.viewed_at) {
    await rest(`estimate_options?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ viewed_at: new Date().toISOString() }) }).catch(() => {});
    await notify(r.owner, "estimate_viewed", `${r.customer || "Your customer"} opened their estimate options`, r.title, r.job_id ? `quote:${r.job_id}` : "estimates", "normal", `opt-view:${r.id}`);
  }
  return json({ ok: true, options: forCustomer(r, await company(r.owner)) });
}
async function notify(owner: string, kind: string, title: string, body: string, link: string, priority: string, dedupe: string) {
  await rest("rpc/bp_notify", { method: "POST", body: JSON.stringify({ p_owner: owner, p_kind: kind, p_title: title, p_body: body, p_link: link, p_job: null, p_priority: priority, p_dedupe: dedupe, p_audience: "office" }) }).catch(() => {});
}

/* the pick becomes an accepted estimate in the contractor's HighLevel */
async function toGhl(r: Row, tier: Row): Promise<Row> {
  const res: Row = {};
  const loc = await ownerLoc(r.owner);
  if (!loc) return { skipped: "no_highlevel" };
  if (!r.ghl_contact) return { skipped: "no_contact" };
  const t = await ghlToken(loc);
  if (!t) return { skipped: "no_token" };
  const co = await company(r.owner);
  const items = (tier.lines as Line[]).map((l) => ({ name: l.name.slice(0, 120), description: (l.desc || l.name).slice(0, 300), currency: "USD", amount: r2(l.price), qty: l.qty, taxes: [] }));
  if (tier.tax > 0) items.push({ name: `Sales tax (${tier.taxPct}%)`, description: "Sales tax", currency: "USD", amount: r2(tier.tax), qty: 1, taxes: [] });
  const payload: Row = {
    altId: loc, altType: "location", name: `${r.title} (${tier.name}: ${tier.title})`.slice(0, 120),
    businessDetails: { name: co.name || "Your contractor" }, currency: "USD", items,
    discount: tier.disc > 0 ? { type: "fixed", value: tier.disc } : { type: "percentage", value: 0 },
    contactDetails: { id: r.ghl_contact, name: r.customer || "Customer", phoneNo: r.phone || undefined, email: r.email || undefined },
    issueDate: day(0), expiryDate: day(30), sentTo: { email: r.email ? [r.email] : [], phoneNo: r.phone ? [r.phone] : [] }, liveMode: true,
  };
  try {
    const c = await fetch(`${GHL_BASE}/invoices/estimate`, { method: "POST", headers: ghlH(t), body: JSON.stringify(payload) });
    const d = await c.json().catch(() => ({}));
    res.est_id = String(d?._id ?? d?.id ?? d?.estimate?._id ?? "");
    if (!c.ok || !res.est_id) return { error: `estimate ${c.status}: ${String(d?.message ?? "").slice(0, 120)}` };
  } catch (e) { return { error: String(e).slice(0, 120) }; }

  // the deposit first (OS and Enterprise), so the 08 workflow's own call sees deposit-sent and skips
  const acct = await one(`accounts?user_id=eq.${r.owner}&select=plan&limit=1`);
  if (String(acct?.plan ?? "") !== "foundation") {
    try {
      const d = await fetch(`${SB_URL}/functions/v1/estimate-accepted`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_SERVICE}`, "x-bp-internal": SB_SERVICE },
        body: JSON.stringify({ locationId: loc, contactId: r.ghl_contact, total: tier.total, name: payload.name, businessName: co.name || "" }),
      });
      res.deposit = await d.json().catch(() => ({ ok: false }));
    } catch (e) { res.deposit = { ok: false, error: String(e).slice(0, 120) }; }
  } else res.deposit = { skipped: "plan" };

  // then mark it accepted, which runs the contractor's "Estimate accepted" workflow
  try {
    const u = await fetch(`${GHL_BASE}/invoices/estimate/${res.est_id}`, { method: "PUT", headers: ghlH(t),
      body: JSON.stringify({ ...payload, frequencySettings: { enabled: false }, estimateStatus: "accepted" }) });
    res.accepted = u.ok;
    if (!u.ok) res.accept_error = `${u.status}: ${String(((await u.json().catch(() => ({}))) as Row)?.message ?? "").slice(0, 120)}`;
  } catch (e) { res.accepted = false; res.accept_error = String(e).slice(0, 120); }
  await fetch(`${GHL_BASE}/contacts/${r.ghl_contact}/tags`, { method: "POST", headers: ghlH(t), body: JSON.stringify({ tags: ["estimate-accepted", `chose-${tier.key}`] }) }).catch(() => {});
  return res;
}

/* the estimate sheet in BuilderPro takes the chosen option's price */
async function toSheet(r: Row, tier: Row, estId: string) {
  if (!r.job_id) return;
  const pf = await one(`portal_finance?owner=eq.${r.owner}&select=jobs&limit=1`);
  const jobs: Row[] = Array.isArray(pf?.jobs) ? pf!.jobs : [];
  const j = jobs.find((x) => x && x.id === r.job_id);
  if (!j) return;
  j.quote = j.quote ?? {};
  j.quote.status = "accepted"; j.quote.acceptedAt = Date.now();
  if (estId) j.quote.estId = estId;
  j.quote.sentTotal = tier.total;
  j.quote.opt = { ...(j.quote.opt ?? {}), id: r.id, status: "chosen", chosen: tier.key, title: tier.title, total: tier.total, at: Date.now() };
  j.estimate = tier.total;
  await rest(`portal_finance?owner=eq.${r.owner}`, { method: "PATCH", body: JSON.stringify({ jobs }) }).catch(() => {});
}

async function choose(b: Row, req: Request) {
  if (!(await take("options-choose", clientIp(req) || "anon", 20, 3600))) return json({ ok: false, error: "Too many tries. Wait a bit and try again." }, 429);
  const r = await byToken(b.token);
  if (!r || r.status === "void") return json({ ok: false, error: "These options are no longer available. Ask your contractor to send them again." }, 404);
  if (r.status === "chosen") return json({ ok: true, options: forCustomer(r, await company(r.owner)) });
  if (r.status !== "sent") return json({ ok: false, error: "These options were declined. Ask your contractor to send them again." }, 409);
  if (r.expires_at && Date.parse(r.expires_at) < Date.now()) return json({ ok: false, error: "These prices have expired. Ask your contractor for an updated estimate." }, 410);
  const tier = (r.tiers ?? []).find((t: Row) => t.key === b.key);
  if (!tier) return json({ ok: false, error: "Pick one of the options." }, 400);
  const name = clean(b.name, 120), sig = String(b.signature ?? "");
  if (name.length < 2) return json({ ok: false, error: "Type your full name." }, 400);
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length > 300000) return json({ ok: false, error: "Draw your signature." }, 400);
  if (b.consent !== true) return json({ ok: false, error: "Tick the box to agree to sign electronically." }, 400);
  const now = new Date().toISOString();
  const audit = [...(r.audit ?? []), { at: now, event: "chosen", key: tier.key, total: tier.total, ip: clientIp(req), agent: (req.headers.get("user-agent") ?? "").slice(0, 300) }].slice(-40);
  // only the first pick counts
  const up = await rest(`estimate_options?id=eq.${r.id}&status=eq.sent`, { method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "chosen", chosen: tier.key, signer_name: name, signature: sig, chosen_at: now, updated_at: now, audit }) });
  const rows = up.ok ? await up.json() : [];
  if (!rows.length) { const again = await byToken(b.token); return json({ ok: true, options: forCustomer(again ?? r, await company(r.owner)) }); }
  const row = rows[0] as Row;
  await notify(r.owner, "estimate_accepted", `${r.customer || "Your customer"} picked ${tier.name}: ${money(tier.total)}`,
    `${r.title} · ${tier.title}. Signed by ${name}.`, r.job_id ? `quote:${r.job_id}` : "estimates", "high", `opt-pick:${r.id}`);
  const work = (async () => {
    const g = await toGhl(row, tier);
    await rest(`estimate_options?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ est_id: String(g.est_id ?? ""), deposit: g, updated_at: new Date().toISOString() }) }).catch(() => {});
    await toSheet(row, tier, String(g.est_id ?? ""));
  })();
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(work); else await work;
  return json({ ok: true, options: forCustomer(row, await company(r.owner)) });
}
async function decline(b: Row, req: Request) {
  if (!(await take("options-choose", clientIp(req) || "anon", 20, 3600))) return json({ ok: false, error: "too many" }, 429);
  const r = await byToken(b.token);
  if (!r || r.status !== "sent") return json({ ok: false, error: "not available" }, 404);
  const note = clean(b.note, 1000), now = new Date().toISOString();
  await rest(`estimate_options?id=eq.${r.id}&status=eq.sent`, { method: "PATCH", body: JSON.stringify({ status: "declined", note, updated_at: now, audit: [...(r.audit ?? []), { at: now, event: "declined", ip: clientIp(req) }].slice(-40) }) });
  await notify(r.owner, "estimate_declined", `${r.customer || "Your customer"} passed on the estimate options`, note ? `"${note}"` : r.title, r.job_id ? `quote:${r.job_id}` : "estimates", "high", `opt-decl:${r.id}`);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  let b: Row = {};
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }
  if (b.op === "get") return get(b, req);
  if (b.op === "choose") return choose(b, req);
  if (b.op === "decline") return decline(b, req);
  const who = await caller(req);
  if (!who) return json({ ok: false, error: "Sign in as the owner or office to send estimates." }, 401);
  if (b.op === "build") return build(b, who);
  if (b.op === "send") return send(b, who);
  return json({ ok: false, error: "unknown op" }, 400);
});
