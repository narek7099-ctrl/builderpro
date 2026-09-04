// radar-daily — scheduled: for every active Lead Radar territory, pull fresh
// permits, score them, auto-add the top 10 NEW leads to GHL (tag radar-prospect
// + radar-auto), and tag the owner's GHL contact with "radar-digest" so a GHL
// workflow can notify them ("your 10 leads are ready — go contact them").
//
// Deploy:  supabase functions deploy radar-daily --no-verify-jwt
// Schedule: see the pg_cron SQL in the docs/chat (runs daily at 7am PT).
// Secrets used: GHL_TOKEN (or GHL_API_KEY fallback), SUPABASE_URL,
//               SUPABASE_SERVICE_ROLE_KEY

const GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? Deno.env.get("GHL_API_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GHL_BASE = "https://services.leadconnectorhq.com";
const PER_DAY = 10;

const ghlH = { Authorization: `Bearer ${GHL_TOKEN}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" };
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// per-trade scoring rules against LA recent permits (pi9x-tg5x)
const RULES: Record<string, { kw: string; pts: number; why: string }[]> = {
  roofing: [
    { kw: "reroof", pts: 55, why: "re-roof permit on file" },
    { kw: "roof", pts: 45, why: "roof work permit" },
    { kw: "solar", pts: 78, why: "solar install — roof penetrations age" },
    { kw: "addition", pts: 62, why: "addition — roof tie-in likely" },
    { kw: "adu", pts: 58, why: "ADU build — roof tie-in likely" },
  ],
  hvac: [
    { kw: "hvac", pts: 60, why: "HVAC permit on file" },
    { kw: "addition", pts: 66, why: "addition — new ductwork likely" },
    { kw: "adu", pts: 64, why: "ADU — needs its own HVAC" },
    { kw: "remodel", pts: 52, why: "remodel — system upgrades likely" },
  ],
  landscaping: [
    { kw: "pool", pts: 74, why: "pool build — yard restoration next" },
    { kw: "addition", pts: 58, why: "addition — landscape repair after build" },
    { kw: "adu", pts: 60, why: "ADU — yard rework after build" },
    { kw: "demolition", pts: 50, why: "demolition — cleared lot" },
  ],
  painting: [
    { kw: "addition", pts: 60, why: "addition — interior/exterior paint next" },
    { kw: "remodel", pts: 62, why: "remodel — paint phase follows" },
    { kw: "adu", pts: 56, why: "ADU — full paint job" },
  ],
  countertops: [
    { kw: "kitchen", pts: 72, why: "kitchen remodel — counters next" },
    { kw: "remodel", pts: 50, why: "remodel — counter upgrades likely" },
  ],
};

function scorePermit(row: Record<string, string>, trade: string) {
  const hay = ["work_desc", "permit_type", "permit_sub_type", "use_desc"].map((f) => (row[f] ?? "").toLowerCase()).join(" | ");
  let best: { pts: number; why: string } | null = null;
  for (const r of RULES[trade] ?? RULES.roofing) {
    if (hay.includes(r.kw) && (!best || r.pts > best.pts)) best = { pts: r.pts, why: r.why };
  }
  if (!best) return null;
  // recency: newer permits (for adjacency trades) score a touch higher
  let pts = best.pts;
  const d = new Date(row.issue_date ?? "");
  if (!isNaN(d.getTime())) {
    const months = (Date.now() - d.getTime()) / 2628e6;
    if (months < 6) pts += 6; else if (months > 18) pts -= 5;
  }
  return { pts: Math.min(97, pts), why: best.why, date: (row.issue_date ?? "").slice(0, 10) };
}

async function fetchPermits(zips: string[]) {
  const out: Record<string, string>[] = [];
  const since = new Date(Date.now() - 730 * 864e5).toISOString().slice(0, 10);
  for (const z of zips) {
    const where = encodeURIComponent(`issue_date > '${since}' AND zip_code like '${z}%'`);
    const url = `https://data.lacity.org/resource/pi9x-tg5x.json?$limit=800&$order=issue_date DESC&$where=${where}`;
    try {
      const r = await fetch(url);
      if (r.ok) out.push(...(await r.json()));
    } catch { /* skip zip on failure */ }
  }
  return out;
}

async function existingNames(): Promise<Set<string>> {
  const seen = new Set<string>();
  try {
    const r = await fetch(`${SB_URL}/rest/v1/contacts?select=name&tags=cs.{radar}&limit=2000`, { headers: sbH });
    if (r.ok) for (const c of await r.json()) seen.add((c.name ?? "").toLowerCase().replace(/^radar — /, ""));
  } catch { /* fresh start */ }
  return seen;
}

async function ghlAddLead(addr: string, trade: string, why: string, date: string, score: number) {
  const note = `Lead Radar AUTO-ADD · score ${score} · ${why} · permit ${date} · ${addr}`;
  const r = await fetch(`${GHL_BASE}/contacts/`, {
    method: "POST", headers: ghlH,
    body: JSON.stringify({ name: `Radar — ${addr}`, tags: ["radar-prospect", "radar-auto", trade], source: "Lead Radar daily", address1: addr }),
  });
  const d = await r.json().catch(() => ({}));
  const id = d?.contact?.id ?? "";
  if (id) { try { await fetch(`${GHL_BASE}/contacts/${id}/notes`, { method: "POST", headers: ghlH, body: JSON.stringify({ body: note }) }); } catch { /* note optional */ } }
  // mirror into portal contacts for dedupe + portal visibility
  try {
    await fetch(`${SB_URL}/rest/v1/contacts`, { method: "POST", headers: sbH, body: JSON.stringify({ name: `Radar — ${addr}`, tags: ["radar", trade, "auto"], notes: note, ghl_id: id }) });
  } catch { /* non-fatal */ }
  return id;
}

async function notifyOwner(email: string, leads: { addr: string; score: number; why: string }[]) {
  // find (or create) the owner's own contact in GHL, add a digest note + tag.
  // A GHL workflow on tag "radar-digest" sends them the actual SMS/email/push.
  let id = "";
  try {
    const r = await fetch(`${GHL_BASE}/contacts/search/duplicate?email=${encodeURIComponent(email)}`, { headers: ghlH });
    const d = await r.json().catch(() => ({}));
    id = d?.contact?.id ?? "";
  } catch { /* fall through */ }
  if (!id) {
    const r = await fetch(`${GHL_BASE}/contacts/`, { method: "POST", headers: ghlH, body: JSON.stringify({ email, name: `Radar owner — ${email}`, tags: [] }) });
    const d = await r.json().catch(() => ({}));
    id = d?.contact?.id ?? d?.meta?.contactId ?? "";
  }
  if (!id) return false;
  const list = leads.map((l, i) => `${i + 1}. ${l.addr} — ${l.score} (${l.why})`).join("\n");
  try { await fetch(`${GHL_BASE}/contacts/${id}/notes`, { method: "POST", headers: ghlH, body: JSON.stringify({ body: `📡 Lead Radar daily — ${leads.length} new leads to contact today:\n${list}\nOpen your portal → Lead Radar to see them on the map.` }) }); } catch { /* optional */ }
  // remove + re-add tag so the workflow re-triggers every day
  try { await fetch(`${GHL_BASE}/contacts/${id}/tags`, { method: "DELETE", headers: ghlH, body: JSON.stringify({ tags: ["radar-digest"] }) }); } catch { /* ok */ }
  const r2 = await fetch(`${GHL_BASE}/contacts/${id}/tags`, { method: "POST", headers: ghlH, body: JSON.stringify({ tags: ["radar-digest"] }) });
  return r2.ok;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "POST/GET" }, 405);
  if (!GHL_TOKEN || !SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);

  const terrRes = await fetch(`${SB_URL}/rest/v1/radar_territories?active=eq.true&select=*`, { headers: sbH });
  if (!terrRes.ok) return json({ ok: false, error: "territories fetch failed" }, 502);
  const terrs = await terrRes.json();
  const seen = await existingNames();
  const results: Record<string, unknown>[] = [];

  for (const t of terrs) {
    const zips: string[] = (t.zips ?? []).length ? t.zips : ["91605"];
    const trade = RULES[t.trade] ? t.trade : "roofing";
    const permits = await fetchPermits(zips);
    const scored: { addr: string; score: number; why: string; date: string }[] = [];
    const dupe = new Set<string>();
    for (const p of permits) {
      const addr = (p.primary_address ?? "").trim();
      if (!addr) continue;
      const key = addr.toLowerCase();
      if (dupe.has(key) || seen.has(key)) continue;
      const sc = scorePermit(p, trade);
      if (!sc) continue;
      dupe.add(key);
      scored.push({ addr, score: sc.pts, why: sc.why, date: sc.date });
    }
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, PER_DAY);
    let added = 0;
    for (const l of top) { if (await ghlAddLead(l.addr, trade, l.why, l.date, l.score)) { added++; seen.add(l.addr.toLowerCase()); } }
    const notified = top.length ? await notifyOwner(t.email, top) : false;
    results.push({ email: t.email, trade, zips, permits: permits.length, candidates: scored.length, added, notified });
  }
  return json({ ok: true, ran_at: new Date().toISOString(), territories: results });
});
