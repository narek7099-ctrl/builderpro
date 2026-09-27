// ai-team: the $49/month AI Team add-on inside a contractor's portal.
// Three assistants work on that contractor's own business only:
//   Sales      leads, quotes, follow-ups          (web search)
//   Marketing  ads, posts, promotions, reviews    (web search)
//   Office     schedule, reminders, invoices, the daily brief
// Models: Sonnet by default; heavy jobs (research, strategy, long plans) go
// to Opus. Anything that contacts a customer or changes their data waits for
// the contractor's approval. 150 messages a month per account.
//
//   POST (signed-in contractor) { op: status | subscribe | chat | threads | thread | approvals | approve | reject }
//   POST ?brief  (pg_cron, x-cron-key) runs each account's 7am daily brief
// Secrets: ANTHROPIC_API_KEY, STRIPE_SECRET_KEY, GHL_API_KEY, GHL_COMPANY_ID
import Anthropic from "npm:@anthropic-ai/sdk";
import { SB_URL, sb, callGHL } from "./ghl.ts";

const SONNET = Deno.env.get("AITEAM_MODEL") ?? "claude-sonnet-5";
const OPUS = Deno.env.get("AITEAM_HEAVY_MODEL") ?? "claude-opus-5";
const CAP = Number(Deno.env.get("AITEAM_MONTHLY_MESSAGES") ?? "150");
const PRICE = Number(Deno.env.get("AITEAM_PRICE") ?? "49");
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE = (Deno.env.get("SITE_URL") ?? "https://builderpro-os.com").replace(/\/$/, "");
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// $ per million tokens, for the usage log (input, output, cache read)
const RATES: Record<string, [number, number, number]> = { "claude-sonnet-5": [2, 10, 0.2], "claude-opus-5": [5, 25, 0.5], "claude-haiku-4-5": [1, 5, 0.1] };
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const month = () => new Date().toISOString().slice(0, 7);

type Acct = { user_id: string; email: string; business: string; full_name: string; trade: string; phone: string; plan: string; ghl_location_id: string; profile: Record<string, unknown>; ai_addon: string; stripe_customer_id: string };
type Agent = { key: string; name: string; role: string; web: boolean };
const AGENTS: Record<string, Agent> = {
  sales: { key: "sales", name: "Sales", web: true, role: "You help win jobs: follow up on new leads and open quotes, write texts and emails that get replies, suggest who to call today, draft call scripts, and spot quotes going cold." },
  marketing: { key: "marketing", name: "Marketing", web: true, role: "You bring in customers: write Facebook and Google ads, social posts, promotions, review requests and replies, and ideas that fit a local contractor. Look at what nearby competitors do when it helps." },
  office: { key: "office", name: "Office", web: false, role: "You keep the business running: today's schedule, appointments, reminders, overdue invoices and quotes, tasks, and the daily brief. Be brief and practical." },
};
// what the assistants may do without asking; everything else waits for the contractor
const AUTO_GHL = new Set(["contacts.list", "conversations.list", "conversations.messages", "pipelines.list", "opportunities.list", "calendars.list", "appointments.list", "tags.list", "notes.create", "tasks.create"]);
const ASK_GHL = new Set(["conversations.send", "contacts.create", "contacts.update", "contacts.tag", "opportunities.create", "opportunities.move", "opportunities.status", "appointments.create"]);
const GHL_ALLOWED = [...AUTO_GHL, ...ASK_GHL];
const HEAVY = /\b(research|strategy|strategic|plan for|business plan|grow|growth|competitor|competition|analy[sz]e|analysis|market(ing)? plan|pricing strategy|compare|forecast|90[- ]day|quarter|year plan)\b/i;

const TOOLS: Anthropic.Tool[] = [
  { name: "ghl", description: "Work in this contractor's CRM (GoHighLevel). Reads: contacts.list (args.query to search), conversations.list, conversations.messages (args.id), pipelines.list, opportunities.list, calendars.list, appointments.list (args.startTime/endTime ms), tags.list. Writes: notes.create/tasks.create (args.contactId, body/title/dueDate) run straight away; conversations.send (args.contactId, message, type SMS|Email, subject), contacts.create/update/tag, opportunities.create/move/status, appointments.create wait for the owner's approval. Args are strings; the account is filled in for you.",
    input_schema: { type: "object", properties: { op: { type: "string", enum: GHL_ALLOWED }, args: { type: "object", additionalProperties: { type: "string" } }, why: { type: "string", description: "one line the owner sees if approval is needed" } }, required: ["op", "args"] } },
  { name: "business_info", description: "This contractor's business details from BuilderPro: services, prices, hours, service area, plan.", input_schema: { type: "object", properties: {} } },
];

async function userOf(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u as { id: string; email: string } : null;
}
async function acctOf(uid: string): Promise<Acct | null> {
  const r = await sb(`accounts?user_id=eq.${uid}&select=*`);
  return r.ok ? ((await r.json())[0] ?? null) : null;
}
async function usage(uid: string) {
  const r = await sb(`cai_usage?owner=eq.${uid}&month=eq.${month()}&select=*`);
  return (r.ok ? (await r.json())[0] : null) ?? { messages: 0, cost_cents: 0 };
}
async function addUsage(uid: string, model: string, u: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }, msgs = 0) {
  const [ri, ro, rc] = RATES[model] ?? RATES["claude-sonnet-5"];
  const inp = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25;
  const cents = (inp * ri + (u.cache_read_input_tokens ?? 0) * rc + (u.output_tokens ?? 0) * ro) / 1e6 * 100;
  const cur = await usage(uid);
  await sb("cai_usage?on_conflict=owner,month", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({
    owner: uid, month: month(), messages: (cur.messages ?? 0) + msgs,
    input_tokens: Number(cur.input_tokens ?? 0) + (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output_tokens: Number(cur.output_tokens ?? 0) + (u.output_tokens ?? 0), cost_cents: Number(cur.cost_cents ?? 0) + cents }) });
}

function system(a: Agent, acct: Acct) {
  const p = acct.profile ?? {};
  return `You are the ${a.name} assistant on ${acct.business}'s BuilderPro AI Team. ${acct.business} is a ${acct.trade || "contracting"} business${p.city ? " in " + p.city + (p.state ? ", " + p.state : "") : ""}, owned by ${acct.full_name}. You work only for this business.
Your job: ${a.role}
Their services: ${p.services || "see business_info"}. Service area: ${p.serviceArea || "see business_info"}.
How to work: look things up with your tools rather than guessing. Anything that messages a customer or changes their records is queued for the owner to approve; when that happens, say what you drafted and why, and don't retry it. Write the way a good office manager talks to the owner: plain, short, concrete. Customer-facing drafts should sound like ${acct.full_name.split(" ")[0] || "the owner"}, not like marketing copy. Today is ${new Date().toISOString().slice(0, 10)}.`;
}

async function runTool(acct: Acct, name: string, input: Record<string, unknown>) {
  if (name === "business_info") {
    const s = await sb(`client_settings?user_id=eq.${acct.user_id}&select=data`);
    return { plan: acct.plan, trade: acct.trade, answers: acct.profile, settings: s.ok ? ((await s.json())[0]?.data ?? {}) : {} };
  }
  if (name === "ghl") {
    const op = String(input.op);
    if (!GHL_ALLOWED.includes(op)) return { error: "not allowed" };
    if (!acct.ghl_location_id) return { error: "This account's CRM isn't connected yet." };
    const args = { ...(input.args as Record<string, string> ?? {}), locationId: acct.ghl_location_id };
    const r = await callGHL(op, args);
    return { ok: r.ok, status: r.status, data: r.data };
  }
  return { error: "unknown tool" };
}

async function history(thread: string): Promise<Anthropic.MessageParam[]> {
  const r = await sb(`cai_messages?thread_id=eq.${thread}&select=role,content&order=id.asc`);
  const rows: { role: "user" | "assistant"; content: unknown }[] = r.ok ? await r.json() : [];
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  const blocks = (c: unknown) => typeof c === "string" ? [{ type: "text", text: c }] : (c as unknown[]);
  for (const m of rows) {
    // earlier turns may have run on the other model: keep their text and tool
    // calls, drop thinking blocks (they only replay on the model that wrote them)
    let content = blocks(m.content).filter((b) => !["thinking", "redacted_thinking"].includes((b as { type: string }).type));
    if (!content.length) content = [{ type: "text", text: "(no reply)" }];
    const last = out[out.length - 1];
    if (last && last.role === m.role) { last.content = [...last.content, ...content]; continue; }
    out.push({ role: m.role, content });
  }
  // a tool call left without an answer (a run that died mid-way)
  for (let i = 0; i < out.length; i++) {
    if (out[i].role !== "assistant") continue;
    const ids = (out[i].content as { type: string; id?: string }[]).filter((b) => b.type === "tool_use").map((b) => b.id);
    if (!ids.length) continue;
    const nxt = out[i + 1];
    const got = nxt ? (nxt.content as { type: string; tool_use_id?: string }[]).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [];
    const miss = ids.filter((id) => !got.includes(id)).map((id) => ({ type: "tool_result", tool_use_id: id, content: "This call didn't finish.", is_error: true }));
    if (!miss.length) continue;
    if (nxt && nxt.role === "user") nxt.content = [...miss, ...nxt.content]; else out.splice(i + 1, 0, { role: "user", content: miss });
  }
  return out as unknown as Anthropic.MessageParam[];
}
const save = (thread: string, role: string, content: unknown, model = "") =>
  sb("cai_messages", { method: "POST", body: JSON.stringify({ thread_id: thread, role, content, model }) });

async function run(acct: Acct, a: Agent, thread: string, text: string, opts: { heavy?: boolean; effort?: string; count?: boolean } = {}) {
  const model = opts.heavy ? OPUS : SONNET;
  const client = new Anthropic();
  const messages = await history(thread);
  const lastM = messages[messages.length - 1];
  if (lastM && lastM.role === "user") (lastM.content as unknown[]).push({ type: "text", text }); else messages.push({ role: "user", content: text });
  await save(thread, "user", text);
  const tools: Anthropic.Messages.ToolUnion[] = [...TOOLS];
  if (a.web) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 4 } as unknown as Anthropic.Messages.ToolUnion);
  const approvals: unknown[] = [];
  let reply = "", counted = false;
  for (let i = 0; i < 8; i++) {
    const params: Record<string, unknown> = {
      model, max_tokens: 12000, system: [{ type: "text", text: system(a, acct), cache_control: { type: "ephemeral" } }], messages, tools,
      thinking: { type: "adaptive" }, output_config: { effort: opts.effort ?? (opts.heavy ? "high" : "medium") },
    };
    if (model === OPUS) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
    // deno-lint-ignore no-explicit-any
    const res: any = await client.beta.messages.create(params as any);
    await addUsage(acct.user_id, model, res.usage ?? {}, opts.count && !counted ? 1 : 0); counted = true;
    messages.push({ role: "assistant", content: res.content }); await save(thread, "assistant", res.content, model);
    const t = (res.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (t) reply = t;
    if (res.stop_reason === "refusal") { reply = reply || "I can't help with that one."; break; }
    if (res.stop_reason === "pause_turn") continue;
    const uses = (res.content as { type: string; id: string; name: string; input: Record<string, unknown> }[]).filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    const results = await Promise.all(uses.map(async (u) => {
      const input = u.input ?? {};
      if (u.name === "ghl" && ASK_GHL.has(String(input.op))) {
        const summary = `${String(input.op).replace(".", " ")}: ${input.why ?? JSON.stringify(input.args ?? {})}`.slice(0, 400);
        const q = await sb("cai_approvals", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner: acct.user_id, thread_id: thread, agent: a.key, tool: "ghl", input, summary }) });
        const row = (await q.json())[0]; approvals.push(row);
        return { type: "tool_result", tool_use_id: u.id, content: `Queued for the owner's approval (${row.id}). Not sent yet. Tell them what you drafted.` };
      }
      try { return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(await runTool(acct, u.name, input)).slice(0, 40000) }; }
      catch (e) { return { type: "tool_result", tool_use_id: u.id, content: "Error: " + String(e).slice(0, 200), is_error: true }; }
    }));
    const tr = { role: "user" as const, content: results as unknown as Anthropic.MessageParam["content"] };
    messages.push(tr); await save(thread, "user", tr.content);
  }
  await sb(`cai_threads?id=eq.${thread}`, { method: "PATCH", body: JSON.stringify({ updated_at: new Date().toISOString() }) });
  return { reply, approvals, model };
}

function transcript(rows: { role: string; content: unknown; model: string }[]) {
  const out: { role: string; text: string; tools?: string[]; deep?: boolean }[] = [];
  for (const m of rows) {
    if (typeof m.content === "string") { out.push({ role: m.role, text: m.content }); continue; }
    const b = (m.content as { type: string; text?: string; name?: string; input?: Record<string, unknown> }[]) ?? [];
    if (m.role === "user" && b.every((x) => x.type === "tool_result")) continue;
    const text = b.filter((x) => x.type === "text").map((x) => x.text).join("\n").trim();
    const tools = b.filter((x) => x.type === "tool_use" || x.type === "server_tool_use").map((x) => x.name === "web_search" ? "Searched: " + (x.input?.query ?? "") : x.name === "ghl" ? "CRM: " + String(x.input?.op ?? "").replace(".", " ") : "Checked business info");
    if (text || tools.length) out.push({ role: m.role, text, tools, deep: m.model === OPUS });
  }
  return out;
}

async function newThread(owner: string, agent: string, title: string, kind = "chat") {
  const r = await sb("cai_threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ owner, agent, title: title.slice(0, 80), kind }) });
  return (await r.json())[0].id as string;
}

async function stripe(path: string, body: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1${path}`, { method: "POST", headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
  const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error"); return d;
}

// 7am in the contractor's time zone: the Office assistant writes the day's brief
async function briefs() {
  const r = await sb("accounts?ai_addon=eq.active&select=*");
  const rows: (Acct & { ai_brief_at: string | null })[] = r.ok ? await r.json() : [];
  const done: string[] = [];
  for (const a of rows) {
    const tz = String(a.profile?.timezone || "America/Chicago");
    let hour = 0, day = "";
    try {
      const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
      hour = Number(f.find((x) => x.type === "hour")?.value); day = `${f.find((x) => x.type === "year")?.value}-${f.find((x) => x.type === "month")?.value}-${f.find((x) => x.type === "day")?.value}`;
    } catch { continue; }
    if (hour < 7 || hour > 10) continue;
    if (a.ai_brief_at && Date.now() - Date.parse(a.ai_brief_at) < 20 * 3600e3) continue;
    await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ ai_brief_at: new Date().toISOString() }) });
    try {
      const th = await newThread(a.user_id, "office", "Daily brief " + day, "brief");
      await run(a, AGENTS.office, th, `Write today's brief for ${a.full_name}. Check today's appointments, new contacts and conversations from the last day, and open opportunities that have gone quiet for 3+ days. Then give: 1) today at a glance, 2) who to call or text first and why, 3) up to 3 follow-up messages ready to send (queue them with conversations.send so the owner can approve with one tap). Keep it under 200 words plus the drafts.`, { effort: "low" });
      done.push(a.email);
    } catch (e) { console.error("brief", a.email, e); }
  }
  return done;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (new URL(req.url).searchParams.get("brief") !== null) {
    const c = await sb("ai_config?key=eq.cron_key&select=value"); const key = (c.ok ? (await c.json())[0]?.value : "") ?? "";
    if (!key || req.headers.get("x-cron-key") !== key) return json({ ok: false }, 403);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: true, skipped: true });
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(briefs().catch(() => {}));
    return json({ ok: true });
  }
  const u = await userOf(req);
  if (!u) return json({ ok: false, error: "Sign in first." }, 401);
  const acct = await acctOf(u.id);
  if (!acct) return json({ ok: false, error: "No BuilderPro account found." }, 404);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* none */ }
  const op = String(b.op ?? "status");
  const on = acct.ai_addon === "active";

  if (op === "status") {
    const us = await usage(u.id);
    const p = await sb(`cai_approvals?owner=eq.${u.id}&status=eq.pending&select=id`);
    return json({ ok: true, addon: acct.ai_addon, price: PRICE, cap: CAP, used: us.messages ?? 0, pending: p.ok ? (await p.json()).length : 0,
      crm: !!acct.ghl_location_id, agents: Object.values(AGENTS).map((a) => ({ key: a.key, name: a.name })) });
  }
  if (op === "subscribe") {
    if (on) return json({ ok: true, already: true });
    if (!SK) return json({ ok: false, error: "Billing isn't set up yet. Contact support@builderpro-os.com." }, 400);
    let customer = acct.stripe_customer_id;
    if (!customer) { customer = (await stripe("/customers", { email: acct.email, name: acct.business, "metadata[user_id]": u.id })).id; await sb(`accounts?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ stripe_customer_id: customer }) }); }
    const s = await stripe("/checkout/sessions", {
      mode: "subscription", customer, client_reference_id: u.id,
      "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][unit_amount]": String(PRICE * 100),
      "line_items[0][price_data][recurring][interval]": "month", "line_items[0][price_data][product_data][name]": "BuilderPro AI Team",
      "metadata[user_id]": u.id, "metadata[kind]": "ai_addon", "subscription_data[metadata][user_id]": u.id, "subscription_data[metadata][kind]": "ai_addon",
      success_url: `${SITE}/index.html?portal=1&aiteam=on`, cancel_url: `${SITE}/index.html?portal=1&aiteam=off`,
    });
    await sb(`accounts?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ ai_addon: acct.ai_addon === "off" ? "checkout" : acct.ai_addon }) });
    return json({ ok: true, url: s.url });
  }
  if (!on) return json({ ok: false, error: "Add the AI Team to use this.", addon: acct.ai_addon }, 402);

  if (op === "chat") {
    const a = AGENTS[String(b.agent)]; if (!a) return json({ ok: false, error: "No such assistant." }, 400);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: false, error: "The AI Team is being set up. Try again shortly." }, 503);
    const msg = String(b.message ?? "").trim().slice(0, 6000); if (!msg) return json({ ok: false, error: "Type a message." }, 400);
    const us = await usage(u.id);
    if ((us.messages ?? 0) >= CAP) return json({ ok: false, error: `You've used all ${CAP} messages this month. They reset on the 1st.`, capped: true }, 429);
    let thread = b.thread_id ? String(b.thread_id) : "";
    if (thread) { const t = await sb(`cai_threads?id=eq.${encodeURIComponent(thread)}&owner=eq.${u.id}&select=id`); if (!(t.ok && (await t.json()).length)) thread = ""; }
    if (!thread) thread = await newThread(u.id, a.key, msg);
    const heavy = b.deep === true || HEAVY.test(msg) || msg.length > 900;
    try { const out = await run(acct, a, thread, msg, { heavy, count: true }); return json({ ok: true, thread_id: thread, ...out, deep: out.model === OPUS }); }
    catch (e) { return json({ ok: false, thread_id: thread, error: "Something went wrong. Try again." + (String(e).includes("rate") ? " (busy right now)" : "") }, 500); }
  }
  if (op === "threads") { const r = await sb(`cai_threads?owner=eq.${u.id}${b.agent ? "&agent=eq." + encodeURIComponent(String(b.agent)) : ""}&select=id,agent,title,kind,updated_at&order=updated_at.desc&limit=40`); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "thread") {
    const t = await sb(`cai_threads?id=eq.${encodeURIComponent(String(b.id))}&owner=eq.${u.id}&select=id`);
    if (!(t.ok && (await t.json()).length)) return json({ ok: false, error: "Not found." }, 404);
    const r = await sb(`cai_messages?thread_id=eq.${encodeURIComponent(String(b.id))}&select=role,content,model&order=id.asc`);
    return json({ ok: true, data: transcript(r.ok ? await r.json() : []) });
  }
  if (op === "approvals") { const r = await sb(`cai_approvals?owner=eq.${u.id}&select=*&order=created_at.desc&limit=60`); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "approve" || op === "reject") {
    const g = await sb(`cai_approvals?id=eq.${encodeURIComponent(String(b.id))}&owner=eq.${u.id}&status=eq.pending&select=*`); const row = (g.ok ? await g.json() : [])[0];
    if (!row) return json({ ok: false, error: "Already handled." }, 404);
    if (op === "reject") {
      await sb(`cai_approvals?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", decided_at: new Date().toISOString() }) });
      if (row.thread_id) await save(row.thread_id, "user", `[The owner declined: ${row.summary}${b.note ? ". Note: " + b.note : ""}]`);
      return json({ ok: true });
    }
    // the owner may have edited the message text before approving
    const input = row.input as { op: string; args: Record<string, string> };
    if (typeof b.message === "string" && input.args) input.args.message = String(b.message).slice(0, 4000);
    let result: unknown, status = "approved";
    try { result = await runTool(acct, "ghl", input); if ((result as { ok?: boolean })?.ok === false) status = "failed"; } catch (e) { result = { error: String(e) }; status = "failed"; }
    await sb(`cai_approvals?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status, input, result, decided_at: new Date().toISOString() }) });
    if (row.thread_id) await save(row.thread_id, "user", `[The owner approved: ${row.summary}. ${status === "approved" ? "Done." : "It failed: " + JSON.stringify(result).slice(0, 300)}]`);
    return json({ ok: status === "approved", status, error: status === "failed" ? "The CRM didn't accept it. Check the contact and try again." : undefined });
  }
  return json({ ok: false, error: "Unknown request." }, 400);
});
