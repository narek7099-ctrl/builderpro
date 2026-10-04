// ai-ceo: the AI CEO inside the AI Team page.
//
// It reads the whole account once a day (public.bp_ceo_snapshot), writes a
// morning briefing, saves it to public.ceo_reports and rings the bell
// (bp_notify 'ceo_report'). It also ranks who to send to a project
// (public.bp_ceo_route) and answers questions about the business.
//
// Claude is optional. With ANTHROPIC_API_KEY set, Claude writes the briefing
// and the "why" lines; without it (or if a call fails) the same data goes
// through fixed rules and templates, so nothing here ever fails for want of
// a key. Only op 'ask' needs Claude: without a key it answers
// { ok:false, needsKey:true }.
//
//   POST ?daily   (pg_cron: x-cron-key = ai_config.cron_key, or the service
//                 role key as bearer)  every account whose local time is past
//                 6am and that has no daily report yet today
//   POST (signed-in owner or office, Authorization: Bearer <JWT>)
//     { op:"status" }                 ai on/off, today's report, the last 14
//     { op:"daily" }                  run the briefing now (kind 'adhoc')
//     { op:"route", job }             ranked people for one project + why
//     { op:"ask", question, jobs? }   Claude only; 30 an hour per account
//
// Crew and subs are turned away. Every read is filtered to the caller's own
// account (team members act for their owner, as in contract-sign).
//
// Deploy:  supabase functions deploy ai-ceo --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (injected),
//          ANTHROPIC_API_KEY (optional), CEO_MODEL (default claude-sonnet-4-5)

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// read on every call: a key added in the dashboard switches Claude on at once
const aiKey = () => Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = () => Deno.env.get("CEO_MODEL") || "claude-sonnet-4-5";
const ASK_PER_HOUR = 30, RUN_PER_HOUR = 6;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = () => ({ apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" });
type Row = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Snap = Record<string, any>;

async function sb(path: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  return await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(ms) });
}
async function rpc<T = unknown>(fn: string, args: Row, ms = 20000): Promise<T> {
  const r = await sb(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }, ms);
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json() as T;
}
async function rows<T = Row>(path: string): Promise<T[]> {
  try { const r = await sb(path); return r.ok ? await r.json() as T[] : []; } catch { return []; }
}
// a shared counter (public.rate_take); a broken counter never blocks
async function take(bucket: string, key: string, max: number, windowSec: number): Promise<boolean> {
  try { const v = await rpc<unknown>("rate_take", { p_bucket: bucket, p_key: key, p_max: max, p_window_sec: windowSec }, 2500); return v !== false; }
  catch { return true; }
}

// ------------------------------------------------------------------ auth ---
async function userOf(req: Request): Promise<{ id: string; email: string } | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === SB_ANON || token === SB_SERVICE) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON || SB_SERVICE }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: String(u.id), email: String(u.email ?? "") } : null;
  } catch { return null; }
}
// a team member works inside their owner's account (same as contract-sign),
// and we need their role to keep crew and subs out
async function effectiveOwner(id: string): Promise<{ owner: string; role: string }> {
  const r = await rows<{ owner: string; role: string }>(`team_members?member=eq.${id}&accepted_at=not.is.null&select=owner,role&limit=1`);
  return r[0]?.owner ? { owner: r[0].owner, role: r[0].role || "crew" } : { owner: id, role: "owner" };
}
async function cronOk(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (SB_SERVICE && bearer === SB_SERVICE) return true;
  const k = req.headers.get("x-cron-key") ?? "";
  if (!k) return false;
  const c = await rows<{ value: string }>("ai_config?key=eq.cron_key&select=value");
  return !!c[0]?.value && c[0].value === k;
}

// ---------------------------------------------------------------- claude ---
// The Messages API over fetch: one helper, a hard timeout, and any failure
// returns null so the caller falls back to the rules.
async function claude(system: string, user: string, maxTokens = 1200, ms = 45000): Promise<string | null> {
  const key = aiKey(); if (!key) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(ms),
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL(), max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) { console.error("claude", r.status, (await r.text()).slice(0, 300)); return null; }
    const d = await r.json();
    if (d?.stop_reason === "refusal") return null;
    const t = (Array.isArray(d?.content) ? d.content : []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n").trim();
    return t || null;
  } catch (e) { console.error("claude", String(e).slice(0, 200)); return null; }
}
// the report is shown as plain text: strip any markdown Claude slipped in
const plain = (t: string) => t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "").replace(/^\s*[*•]\s+/gm, "- ").replace(/`/g, "").trim();

// ----------------------------------------------------------------- rules ---
const money = (n: unknown) => { const v = Math.round(Number(n) || 0); return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US"); };
const kMoney = (n: number) => n >= 1000 ? "$" + (Math.round(n / 100) / 10).toString().replace(/\.0$/, "") + "k" : money(n);
const arr = <T = Snap>(x: unknown): T[] => Array.isArray(x) ? x as T[] : [];
const plural = (n: number, w: string, p = w + "s") => `${n} ${n === 1 ? w : p}`;
const fmtDay = (iso: string) => { const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z"); return isNaN(+d) ? String(iso) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }); };
const when = (days: number) => days === 0 ? "today" : days === 1 ? "tomorrow" : days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : `in ${days} days`;
const dayDiff = (iso: string, today: string) => Math.round((Date.parse(String(iso).slice(0, 10)) - Date.parse(today)) / 864e5);
const pct = (a: number, b: number) => b > 0 ? Math.round((a - b) / b * 100) : null;

export type Item = { kind: string; icon: string; title: string; detail: string; job?: string; link: string; sev: "high" | "normal"; rank: number; act?: string };
// Everything that needs a person today, most urgent first. The UI lists
// these, the template picks its top 3 actions from them, and a 'high' one
// makes the morning notification high priority.
export function attention(s: Snap): Item[] {
  const t = String(s.day ?? new Date().toISOString().slice(0, 10)), out: Item[] = [];
  const job = (id: unknown) => id ? `activejobs:${id}` : "activejobs";
  for (const x of arr(s.leads?.unanswered_list)) out.push({ kind: "lead", icon: "person_alert", title: `Reply to ${x.name}`, detail: `Lead waiting ${x.hours}h for an answer`, link: x.contact ? `contacts:${x.contact}` : "messaging", sev: "high", rank: 10 + Math.min(9, x.hours / 24), act: `Reply to ${x.name}, a lead who has waited ${x.hours}h.` });
  for (const x of arr(s.customers?.messages_unanswered)) out.push({ kind: "message", icon: "mark_chat_unread", title: `Answer ${x.from || "the homeowner"} on ${x.label}`, detail: `"${String(x.body ?? "").slice(0, 80)}" · waiting ${x.hours}h`, job: x.job, link: job(x.job), sev: "high", rank: 11, act: `Answer ${x.from || "the homeowner"} on ${x.label} (waiting ${x.hours}h).` });
  for (const x of arr(s.projects?.overdue_phases)) out.push({ kind: "overdue", icon: "event_busy", title: `${x.phase} is overdue`, detail: `${x.label} · ${plural(Number(x.days_late), "day")} late`, job: x.job, link: job(x.job), sev: "high", rank: 12 + Math.min(5, x.days_late), act: `Get ${x.phase} on ${x.label} moving: it is ${plural(Number(x.days_late), "day")} late.` });
  for (const x of arr(s.projects?.past_end)) out.push({ kind: "past_end", icon: "running_with_errors", title: `Past its end date: ${x.label}`, detail: `Was due to finish ${fmtDay(x.ended)}, still active`, job: x.job, link: job(x.job), sev: "high", rank: 14, act: `Set a new finish date or close out ${x.label} (ended ${fmtDay(x.ended)}).` });
  for (const x of arr(s.permits?.expiring_14d)) { const d = Number(x.days); out.push({ kind: "permit", icon: "assignment_late", title: `${x.type} permit ${d < 0 ? "expired" : "expires"} ${d < 0 ? fmtDay(x.expires) : when(d)}`, detail: [x.label, x.number ? "#" + x.number : ""].filter(Boolean).join(" · "), job: x.job, link: job(x.job), sev: d <= 3 ? "high" : "normal", rank: d <= 3 ? 13 : 30, act: `Renew the ${x.type} permit on ${x.label} (${d < 0 ? "expired" : "expires"} ${fmtDay(x.expires)}).` }); }
  for (const x of arr(s.permits?.inspections_7d)) { const d = dayDiff(x.date, t); out.push({ kind: "inspection", icon: "fact_check", title: `${x.kind} inspection ${when(d)}`, detail: [x.label, x.permit ? x.permit + " permit" : ""].filter(Boolean).join(" · "), job: x.job, link: job(x.job), sev: d <= 1 ? "high" : "normal", rank: d <= 1 ? 15 : 32, act: `Get ${x.label} ready for the ${x.kind} inspection ${when(d)}.` }); }
  for (const x of arr(s.customers?.contracts_unsigned)) out.push({ kind: "contract", icon: "draw", title: `Contract not signed: ${x.customer || x.title}`, detail: `${x.title}${x.amount ? " · " + money(x.amount) : ""} · sent ${plural(Number(x.days), "day")} ago`, job: x.job || undefined, link: job(x.job), sev: Number(x.days) >= 7 ? "high" : "normal", rank: Number(x.days) >= 7 ? 18 : 34, act: `Call ${x.customer || "the customer"} about the unsigned contract (${money(x.amount)}, sent ${plural(Number(x.days), "day")} ago).` });
  for (const x of arr(s.customers?.change_orders_pending)) out.push({ kind: "change_order", icon: "request_quote", title: `Change order waiting: ${x.title}`, detail: `${money(x.amount)} · ${plural(Number(x.days), "day")} with the homeowner`, job: x.job, link: job(x.job), sev: "normal", rank: 36 });
  for (const x of arr(s.projects?.due_7d)) { const d = dayDiff(x.due, t); out.push({ kind: "due", icon: "event_upcoming", title: `${x.phase} due ${when(d)}`, detail: x.label, job: x.job, link: job(x.job), sev: "normal", rank: d <= 1 ? 20 : 38 }); }
  for (const x of arr(s.projects?.no_crew)) out.push({ kind: "no_crew", icon: "group_off", title: `Nobody assigned: ${x.label}`, detail: x.estimate ? `${money(x.estimate)} project with no crew or sub` : "No crew or sub on it yet", job: x.job, link: job(x.job), sev: "normal", rank: 25, act: `Assign a crew to ${x.label}.` });
  for (const x of arr(s.subs?.insurance_expiring)) { const d = Number(x.days); out.push({ kind: "sub_insurance", icon: "shield", title: `${x.name}: ${x.kind === "coi" ? "insurance" : "licence"} ${d < 0 ? "expired" : "expires"} ${d < 0 ? fmtDay(x.expires) : when(d)}`, detail: "Ask them for a current certificate", link: "subs", sev: d < 0 ? "high" : "normal", rank: d < 0 ? 19 : 40 }); }
  for (const x of arr(s.subs?.invoices_pending)) out.push({ kind: "sub_invoice", icon: "receipt_long", title: `Sub invoice to review: ${money(x.amount)}`, detail: `${x.from} · ${x.label}`, job: x.job, link: job(x.job), sev: "normal", rank: 42 });
  for (const x of arr(s.subs?.invoices_unpaid)) if (Number(x.days) >= 7) out.push({ kind: "sub_unpaid", icon: "payments", title: `Unpaid sub invoice: ${money(x.amount)}`, detail: `${x.from} · approved ${x.days} days ago`, job: x.job, link: job(x.job), sev: "normal", rank: 44 });
  for (const x of arr(s.projects?.no_schedule)) out.push({ kind: "no_schedule", icon: "calendar_add_on", title: `No schedule: ${x.label}`, detail: "No dates or phases set", job: x.job, link: job(x.job), sev: "normal", rank: 50 });
  return out.sort((a, b) => a.rank - b.rank);
}

export function tiles(s: Snap) {
  const m = s.money ?? {}, p = s.projects ?? {}, l = s.leads ?? {};
  return {
    collected_month: Number(m.collected_month) || 0, collected_last_month: Number(m.collected_last_month) || 0,
    expenses_month: Number(m.expenses_month) || 0, outstanding: Number(m.outstanding) || 0,
    active_projects: Number(p.active) || 0, leads_7d: Number(l.new_7d) || 0, leads_24h: Number(l.new_24h) || 0,
    hours_week: Number(s.team?.hours_week) || 0,
  };
}

const actionLine = (i: Item) => i.act ?? `${i.title}${i.detail ? " (" + i.detail + ")" : ""}.`;

// The no-key briefing. Same sections Claude is asked for; every number comes
// straight from the snapshot.
export function rulesReport(s: Snap): string {
  const m = s.money ?? {}, l = s.leads ?? {}, p = s.projects ?? {}, pm = s.permits ?? {}, c = s.customers ?? {}, sub = s.subs ?? {}, tm = s.team ?? {};
  const day = String(s.day ?? new Date().toISOString().slice(0, 10));
  const nice = new Date(day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const L: string[] = [];
  const list = (xs: Snap[], f: (x: Snap) => string, max = 3) => xs.slice(0, max).map(f).join("; ") + (xs.length > max ? `; +${xs.length - max} more` : "");
  L.push(`Good morning${s.company ? ", " + String(s.company).replace(/\.+$/, "") : ""}. Your briefing for ${nice}.`, "");

  L.push("MONEY");
  const cm = Number(m.collected_month) || 0, clm = Number(m.collected_last_month) || 0, em = Number(m.expenses_month) || 0;
  const ch = pct(cm, clm);
  L.push(`- Collected this month: ${money(cm)}` + (clm > 0 ? ` (last month ${money(clm)}, ${ch! >= 0 ? "up" : "down"} ${Math.abs(ch!)}%)` : "") + ".");
  L.push(`- Spent this month: ${money(em)}. Net so far: ${money(cm - em)}.`);
  if (Number(m.card_payments_month) > 0) L.push(`- Card payments this month: ${money(m.card_payments_month)}.`);
  const tb = arr(m.top_balances);
  L.push(`- Still owed on active projects: ${money(m.outstanding)}` + (tb.length ? ` (largest: ${tb[0].label}, ${money(tb[0].balance)})` : "") + ".");
  L.push("");

  L.push("SALES");
  L.push(`- New leads: ${Number(l.new_24h) || 0} in the last 24 hours, ${Number(l.new_7d) || 0} this week.`);
  const ul = arr(l.unanswered_list);
  L.push(ul.length ? `- ${plural(Number(l.unanswered) || ul.length, "lead")} waiting on a reply: ${list(ul, (x) => `${x.name} (${x.hours}h)`)}.` : "- No lead is waiting on a reply.");
  const cu = arr(c.contracts_unsigned);
  if (cu.length) L.push(`- ${plural(cu.length, "contract")} out for signature (${money(cu.reduce((t, x) => t + (Number(x.amount) || 0), 0))}): ${list(cu, (x) => `${x.customer || x.title}, ${x.days}d`)}.`);
  L.push("");

  L.push("PROJECTS & DEADLINES");
  L.push(`- ${plural(Number(p.active) || 0, "active project")}` + (Number(p.done_month) ? `, ${Number(p.done_month)} finished this month` : "") + ".");
  const od = arr(p.overdue_phases); if (od.length) L.push(`- Overdue: ${list(od, (x) => `${x.phase} on ${x.label} (${x.days_late}d late)`)}.`);
  const d7 = arr(p.due_7d); if (d7.length) L.push(`- Due in the next 7 days: ${list(d7, (x) => `${x.phase} on ${x.label} (${fmtDay(x.due)})`)}.`);
  const pe = arr(p.past_end); if (pe.length) L.push(`- Past end date and still open: ${list(pe, (x) => `${x.label} (${x.days}d)`)}.`);
  const pr = arr(pm.expiring_14d); if (pr.length) L.push(`- Permits expiring: ${list(pr, (x) => `${x.type} on ${x.label} (${fmtDay(x.expires)})`)}.`);
  const ins = arr(pm.inspections_7d); if (ins.length) L.push(`- Inspections this week: ${list(ins, (x) => `${x.kind} on ${x.label} (${fmtDay(x.date)})`)}.`);
  const nc = arr(p.no_crew); if (nc.length) L.push(`- No one assigned: ${list(nc, (x) => x.label)}.`);
  const mu = arr(c.messages_unanswered); if (mu.length) L.push(`- Homeowner messages waiting over a day: ${list(mu, (x) => `${x.from || "homeowner"} on ${x.label} (${x.hours}h)`)}.`);
  const co = arr(c.change_orders_pending); if (co.length) L.push(`- Change orders waiting on homeowners: ${list(co, (x) => `${x.title} ${money(x.amount)}`)}.`);
  if (!od.length && !d7.length && !pe.length && !pr.length && !ins.length && !mu.length) L.push("- No deadlines slipping and nothing due this week.");
  L.push("");

  L.push("TEAM");
  L.push(`- Hours logged: ${Number(tm.hours_yesterday) || 0} yesterday, ${Number(tm.hours_week) || 0} this week` + (Number(tm.clocked_in_now) ? `; ${tm.clocked_in_now} clocked in now` : "") + ".");
  const top = arr(tm.top_rated); if (top.length) L.push(`- Top rated: ${list(top, (x) => `${x.name} (${Number(x.avg).toFixed(1)}★, ${plural(Number(x.reviews), "review")})`)}.`);
  const low = arr(tm.low_rated); if (low.length) L.push(`- Worth a check-in: ${list(low, (x) => `${x.name} (${Number(x.avg).toFixed(1)}★)`)}.`);
  const sp = arr(sub.invoices_pending), si = arr(sub.insurance_expiring);
  if (sp.length || si.length || Number(sub.change_orders_pending)) L.push(`- Subs: ${[sp.length ? plural(sp.length, "invoice") + " to review" : "", Number(sub.change_orders_pending) ? plural(Number(sub.change_orders_pending), "change order") + " to decide" : "", si.length ? plural(si.length, "insurance/licence document") + " expiring or expired" : ""].filter(Boolean).join(", ")}.`);
  L.push("");

  L.push("TOP 3 ACTIONS TODAY");
  const acts = attention(s).slice(0, 3).map(actionLine);
  if (acts.length < 3 && Number(l.new_24h) > 0) acts.push(`Call the ${plural(Number(l.new_24h), "new lead")} from the last 24 hours while they're warm.`);
  if (acts.length < 3 && tb.length) acts.push(`Chase the ${money(tb[0].balance)} still owed on ${tb[0].label}.`);
  if (acts.length < 3) acts.push("Nothing urgent. A good day to follow up open quotes and ask happy customers for reviews.");
  acts.slice(0, 3).forEach((a, i) => L.push(`${i + 1}. ${a}`));
  return L.join("\n").trim();
}

const SYS_BRIEF = `You are the AI CEO of a home-improvement contracting business on BuilderPro. Each morning you brief the owner.
Write a concise morning briefing in plain text. No markdown: no asterisks, no # headings, no tables. Use these section headings, in capitals, each on its own line: MONEY, SALES, PROJECTS & DEADLINES, TEAM, TOP 3 ACTIONS TODAY. Under each heading write short "- " bullet lines; number the 3 actions 1. 2. 3.
Rules: use ONLY the numbers, names, dates and projects in the JSON snapshot. Never invent, estimate, round differently or project figures. If something is empty or zero, say so in a few words or leave it out. Money is in US dollars. Be direct and practical, like a sharp operations manager talking to the owner. Under 250 words. Start with one short greeting line naming the company if it is given.`;

async function writeReport(snap: Snap): Promise<{ text: string; source: "rules" | "claude" }> {
  const rules = rulesReport(snap);
  if (!aiKey()) return { text: rules, source: "rules" };
  const facts = { ...snap, needs_attention: attention(snap).slice(0, 12).map(({ title, detail, sev }) => ({ title, detail, sev })) };
  const t = await claude(SYS_BRIEF, "Today's snapshot of the business (JSON):\n" + JSON.stringify(facts));
  return t && t.length > 40 ? { text: plain(t).slice(0, 12000), source: "claude" } : { text: rules, source: "rules" };
}

// local date and hour for an account (accounts.profile.timezone, as ai-team)
async function localNow(owner: string): Promise<{ day: string; hour: number }> {
  const a = await rows<{ profile: Row | null }>(`accounts?user_id=eq.${owner}&select=profile&limit=1`);
  const tz = String((a[0]?.profile as Row | null)?.timezone || "America/Chicago");
  const parts = (z: string) => new Intl.DateTimeFormat("en-US", { timeZone: z, hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  let f: Intl.DateTimeFormatPart[]; try { f = parts(tz); } catch { f = parts("America/Chicago"); }
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return { day: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) % 24 };
}

async function runBriefing(owner: string, kind: "daily" | "adhoc", day?: string) {
  const snap = await rpc<Snap>("bp_ceo_snapshot", { p_owner: owner });
  if (day) snap.day = day;
  const { text, source } = await writeReport(snap);
  const att = attention(snap), crit = att.filter((x) => x.sev === "high");
  const stats = { tiles: tiles(snap), attention: att.slice(0, 20), critical: crit.length, snapshot: snap };
  const d = String(snap.day);
  const up = await sb("ceo_reports?on_conflict=owner,day,kind", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ owner, day: d, kind, stats, text, source, created_at: new Date().toISOString() }) });
  if (!up.ok) throw new Error("save report: " + up.status);
  const saved = ((await up.json()) as Row[])[0] ?? {};
  if (kind === "daily") {
    const body = crit.length ? `${plural(crit.length, "thing")} need you today: ${crit.slice(0, 2).map((x) => x.title).join("; ")}` : "Nothing urgent. Money, sales, projects and team in one read.";
    try { await rpc("bp_notify", { p_owner: owner, p_kind: "ceo_report", p_title: "Your morning briefing is ready", p_body: body.slice(0, 300), p_link: "aiteam:ceo", p_job: null, p_priority: crit.length ? "high" : "normal", p_dedupe: `ceo:${d}`, p_audience: "office" }); } catch (e) { console.error("notify", String(e)); }
    try { await rpc("bp_notify_scan", { p_owner: owner }); } catch (e) { console.error("scan", String(e)); }
  }
  return { id: saved.id, day: d, kind, text, source, stats, created_at: saved.created_at };
}

// cron: every account with projects whose morning has come and that has no daily report yet
async function dailyAll(budgetMs = 50000) {
  const t0 = Date.now(), done: string[] = [], failed: string[] = [];
  const owners = await rows<{ owner: string }>("portal_finance?select=owner&limit=2000");
  for (const { owner } of owners) {
    if (Date.now() - t0 > budgetMs) break;
    try {
      const { day, hour } = await localNow(owner);
      if (hour < 6) continue;
      if ((await rows(`ceo_reports?owner=eq.${owner}&day=eq.${day}&kind=eq.daily&select=id&limit=1`)).length) continue;
      await runBriefing(owner, "daily", day); done.push(owner);
    } catch (e) { failed.push(owner); console.error("daily", owner, String(e).slice(0, 200)); }
  }
  return { done: done.length, failed: failed.length };
}

// ----------------------------------------------------------------- route ---
type Cand = { kind: string; id: string; name: string; trade: string; score: number; rating: number | null; reviews: number; years?: number; jobs_done: number; free: boolean; flags: string[]; reasons: string[]; conflicts: Snap[]; team_id?: string | null; explain?: string; size?: number; color?: string; members?: Snap[] };
function spanOf(job: Snap): string {
  if (!Array.isArray(job.dates) || !job.dates.length) return "";
  const ds = (job.dates as string[]).slice().sort(), a = fmtDay(ds[0]), z = fmtDay(ds[ds.length - 1]);
  return ds.length === 1 ? a : a.split(" ")[0] === z.split(" ")[0] ? `${a}-${z.split(" ")[1]}` : `${a}-${z}`;
}
// "Roof crew A (3 people, 4.7★) - roofing crew, free Oct 6-9; this is a $25k job, so top-rated crew recommended."
export function explainCrew(c: Cand, job: Snap, best: boolean): string {
  const n = Number(c.size ?? arr(c.members).length) || 0;
  const bits = [`${n} ${n === 1 ? "person" : "people"}`, c.rating != null ? `${Number(c.rating).toFixed(1)}★` : ""].filter(Boolean).join(", ");
  const why: string[] = [];
  const tr = String(c.trade || "general");
  why.push(c.flags.includes("trade_mismatch") ? `${tr} crew, not a ${String(job.trade)} match` : `${tr} crew`);
  const span = spanOf(job);
  if (!c.free) why.push(`booked ${span || "those days"}${c.conflicts?.[0]?.label ? " on " + String(c.conflicts[0].label) : ""}`);
  else if (span) why.push(`free ${span}`);
  if (c.jobs_done > 0) why.push(`${c.jobs_done} finished job${c.jobs_done > 1 ? "s" : ""} together`);
  let s = `${c.name} (${bits}) - ${why.join(", ")}`;
  if (best && c.free && !c.flags.includes("trade_mismatch") && Number(job.weight) >= 1.3 && Number(job.estimate) > 0) s += `; this is a ${kMoney(Number(job.estimate))} job, so top-rated crew recommended`;
  return s + ".";
}
export function explainRules(c: Cand, job: Snap, best: boolean): string {
  if (c.kind === "crew") return explainCrew(c, job, best);
  const bits = [c.trade || (c.kind === "sub" ? "Sub" : ""), c.rating != null ? `${Number(c.rating).toFixed(1)}★` : "", c.years ? `${c.years} yrs` : ""].filter(Boolean).join(", ");
  const why: string[] = [];
  if (!c.flags.includes("trade_mismatch") && best) why.push(c.rating != null && c.rating >= 4.5 ? `best-rated ${String(job.trade)} pick` : `best ${String(job.trade)} match`);
  why.push(...c.reasons.filter((r) => !/matches this|★ from/.test(r)).map((r) => r.charAt(0).toLowerCase() + r.slice(1)));
  if (c.free && Array.isArray(job.dates) && job.dates.length) {
    const span = spanOf(job);
    for (let i = 0; i < why.length; i++) if (/^free on the job/.test(why[i])) why[i] = `free ${span}`;
  }
  let s = `${c.name}${bits ? " (" + bits + ")" : ""} - ${why.join("; ")}`;
  if (best && Number(job.weight) >= 1.3 && Number(job.estimate) > 0) s += `; this is a ${kMoney(Number(job.estimate))} job, so top-rated crew recommended`;
  return s + ".";
}
async function route(owner: string, jobId: string) {
  const r = await rpc<Snap>("bp_ceo_route", { p_owner: owner, p_job: jobId });
  if (!r?.ok) return { ok: false, error: r?.error === "job not found" ? "Project not found." : "Could not rank people for this project." };
  const job = r.job as Snap, cands = arr<Cand>(r.candidates);
  cands.forEach((c, i) => { c.explain = explainRules(c, job, i === 0); });
  // the best-matching crew (also in candidates, appended if it missed the top 5)
  const bestCrew = r.best_crew ? cands.find((c) => c.kind === "crew" && c.id === (r.best_crew as Snap).id) ?? null : null;
  let source: "rules" | "claude" = "rules";
  if (aiKey() && cands.length) {
    const t = await claude(
      `You explain staffing recommendations for a contractor. For each candidate write ONE short sentence (max 30 words) saying why they rank where they do. Use only facts in the JSON (trade, rating, reviews, years, jobs_done, free/conflicts, flags, reasons, the job's estimate and weight). Never invent numbers. A weight above 1.3 means a bigger-than-usual job where rating and experience matter more. Mention insurance problems for subs. Candidates with kind "crew" are whole crews (size, members, the crew's trade, average rating): say so and whether they are free. Reply with only a JSON array of strings, same order as the candidates.`,
      JSON.stringify({ job, candidates: cands.map(({ explain: _e, ...c }) => c) }), 800, 25000);
    try {
      const a = JSON.parse(String(t ?? "").replace(/^```(json)?|```$/g, "").trim());
      if (Array.isArray(a) && a.length === cands.length && a.every((x) => typeof x === "string" && x.length > 5)) { cands.forEach((c, i) => { c.explain = plain(a[i]).slice(0, 300); }); source = "claude"; }
    } catch { /* keep the rules text */ }
  }
  return { ok: true, job, candidates: cands, best_crew: bestCrew, flagged: r.flagged ?? [], on_job: r.on_job ?? [], considered: r.considered ?? cands.length, source };
}

// ------------------------------------------------------------------- ask ---
async function ask(owner: string, q: string, withJobs: boolean) {
  const snap = await rpc<Snap>("bp_ceo_snapshot", { p_owner: owner });
  let jobs: Snap[] = [];
  if (withJobs) {
    const pf = await rows<{ jobs: Snap[] }>(`portal_finance?owner=eq.${owner}&select=jobs&limit=1`);
    jobs = arr(pf[0]?.jobs).filter((j) => j && j.status !== "archived").slice(0, 60).map((j) => ({
      id: j.id, title: j.title, customer: j.name, status: j.status, estimate: j.estimate, collected: j.collected,
      dates: arr<string>(j.sched?.dates).slice(0, 10), phases: arr(j.plan?.phases).slice(0, 8).map((p) => ({ name: p.name, due: p.due, done: !!p.doneAt })),
      people: arr(j.assignees).map((a) => a.name).filter(Boolean), subs: arr(j.subs).map((x) => x.name).filter(Boolean),
    }));
  }
  const t = await claude(
    `You are the AI CEO of this contracting business. Answer the owner's question using ONLY the JSON data provided (a snapshot of the business${withJobs ? " and its project list" : ""}). Never invent numbers, names or dates; if the data doesn't answer it, say what is missing and where in BuilderPro to look. Plain text, no markdown. Short: under 150 words unless a list is needed.`,
    JSON.stringify({ snapshot: snap, projects: withJobs ? jobs : undefined }) + "\n\nQuestion: " + q, 900, 40000);
  return t ? { ok: true, answer: plain(t), source: "claude" } : { ok: false, error: "The CEO couldn't answer right now. Try again in a minute." };
}

// ----------------------------------------------------------------- serve ---
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);
  let b: Row = {};
  try { b = await req.json(); } catch { /* empty body */ }

  if (new URL(req.url).searchParams.get("daily") !== null) {
    if (!(await cronOk(req))) return json({ ok: false }, 403);
    return json({ ok: true, ...(await dailyAll()) });
  }

  const u = await userOf(req);
  if (!u) return json({ ok: false, error: "Sign in first." }, 401);
  const { owner, role } = await effectiveOwner(u.id);
  if (role !== "owner" && role !== "office") return json({ ok: false, error: "Only the owner and office can use the AI CEO." }, 403);
  const op = String(b.op ?? "status");

  try {
    if (op === "status") {
      const list = await rows(`ceo_reports?owner=eq.${owner}&select=id,day,kind,source,created_at&order=day.desc,created_at.desc&limit=14`);
      const latest = list[0] ? (await rows(`ceo_reports?id=eq.${list[0].id}&owner=eq.${owner}&select=*&limit=1`))[0] ?? null : null;
      return json({ ok: true, ai: !!aiKey(), model: aiKey() ? MODEL() : null, latest, reports: list });
    }
    if (op === "report") {
      const r = (await rows(`ceo_reports?id=eq.${encodeURIComponent(String(b.id ?? ""))}&owner=eq.${owner}&select=*&limit=1`))[0];
      return r ? json({ ok: true, report: r }) : json({ ok: false, error: "Not found." }, 404);
    }
    if (op === "daily") {
      if (!(await take("ceo_run", owner, RUN_PER_HOUR, 3600))) return json({ ok: false, error: "That's a lot of runs. Try again in a bit." }, 429);
      const { day } = await localNow(owner);
      return json({ ok: true, report: await runBriefing(owner, "adhoc", day), ai: !!aiKey() });
    }
    if (op === "route") {
      const job = String(b.job ?? "").slice(0, 80);
      if (!job) return json({ ok: false, error: "Which project?" }, 400);
      const r = await route(owner, job);
      return json(r, r.ok ? 200 : 404);
    }
    if (op === "ask") {
      if (!aiKey()) return json({ ok: false, needsKey: true, error: "Connect Claude in Supabase to turn this on." });
      const q = String(b.question ?? "").trim().slice(0, 1000);
      if (!q) return json({ ok: false, error: "Ask a question." }, 400);
      if (!(await take("ceo_ask", owner, ASK_PER_HOUR, 3600))) return json({ ok: false, error: `You've asked ${ASK_PER_HOUR} questions this hour. Try again later.` }, 429);
      return json(await ask(owner, q, b.jobs !== false));
    }
  } catch (e) {
    console.error("ai-ceo", op, String(e).slice(0, 300));
    return json({ ok: false, error: "Something went wrong. Try again." }, 500);
  }
  return json({ ok: false, error: "Unknown request." }, 400);
});
