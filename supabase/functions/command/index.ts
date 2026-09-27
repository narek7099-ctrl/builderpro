// command — the backend for the BuilderPro Command Center: six AI employees
// (Claude) who run the agency with you, plus the admin data behind the page.
//
//   Every call: the caller's Supabase login must be in ADMIN_EMAILS.
//   POST { op: "chat", agent, thread_id?, message }   talk to an AI employee
//   POST { op: "threads", agent } | { op: "thread", id }
//   POST { op: "approvals", status? } | { op: "approve", id } | { op: "reject", id }
//   POST { op: "accounts" } | { op: "memory" } | { op: "memory_delete", id } | { op: "stats" }
//
// Who may do what without asking (you chose "mix by team"):
//   Research, Builder  act on their own inside their lane
//   CEO                reads and delegates freely; changes wait for you
//   Sales, Marketing, Support  read freely and may leave notes/tasks; anything that
//                      contacts a customer or changes an account waits for you
//   Everyone           creating or changing a client account waits for you
//
// Deploy: --no-verify-jwt (the admin check is below)
// Secrets: ANTHROPIC_API_KEY, ADMIN_EMAILS, GHL_API_KEY, GHL_COMPANY_ID, GHL_SNAPSHOT_ID
import Anthropic from "npm:@anthropic-ai/sdk";
import { SB_URL, sb, callGHL, provisionClient, GHL_OPS, isRead } from "./ghl.ts";

const MODEL = Deno.env.get("COMMAND_MODEL") ?? "claude-opus-5";
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* ------------------------------------------------------------ the team --- */
type Agent = { key: string; name: string; role: string; web: boolean; routine?: string; auto: (tool: string, input: Record<string, unknown>) => boolean };
const readOnly = (tool: string, input: Record<string, unknown>) =>
  ["accounts_list", "support_requests", "brain_get", "memory_list", "business_stats", "db_read"].includes(tool) ||
  (tool === "ghl" && isRead(String(input.op ?? ""))) || tool === "memory_save";
const AGENTS: Record<string, Agent> = {
  ceo: { routine: "Review the business: stats, accounts, pending approvals, and what the teams logged since your last shift. Pick the one or two things that matter most right now and delegate them. Finish with a short brief for the owner.", key: "ceo", name: "CEO", web: true, role:
    "You run the company day to day with the owner. You set priorities, keep the other five on track, and turn the owner's goals into concrete work. Delegate real work to the right team with the delegate tool, then pull their answers together into a clear recommendation. You read everything; changes you want made go to the owner for approval.",
    auto: (t, i) => readOnly(t, i) || t === "delegate" },
  sales: { routine: "Check trials ending soon and new sign-ups. For each, decide the next step and add a note or task on their GHL contact. Draft follow-ups (don't send). Report who needs the owner's attention.", key: "sales", name: "Sales Team", web: true, role:
    "You turn trials and leads into paying contractors. You watch trials that are about to end, find who is engaged and who went quiet, write follow-ups and call scripts, and suggest offers. You may add notes and tasks on contacts yourself; sending anything to a customer waits for the owner.",
    auto: (t, i) => readOnly(t, i) || (t === "ghl" && ["notes.create", "tasks.create"].includes(String(i.op))) },
  marketing: { routine: "Research what's working in contractor marketing right now and draft one concrete piece: an ad, a post, or an email. Instagram and Facebook posting is coming soon; for now leave drafts in your report.", key: "marketing", name: "Marketing Team", web: true, role:
    "You bring contractors in: positioning, ad copy, landing-page copy, email and text campaigns, social posts, and SEO pages for each trade. Research competitors on the web. Drafts are free; anything published or sent to customers waits for the owner.",
    auto: (t, i) => readOnly(t, i) || (t === "ghl" && ["notes.create", "tasks.create"].includes(String(i.op))) },
  support: { routine: "Check support and cancellation requests, business-number requests, and new accounts whose setup log shows a failure or no GHL sub-account. Diagnose each and propose the fix.", key: "support", name: "Support Team", web: false, role:
    "You keep clients happy and set up correctly. Check a client's GHL setup, their AI receptionist, support and cancellation requests, and business-number requests, and work out what's wrong and how to fix it. Replies to clients and account changes wait for the owner.",
    auto: (t, i) => readOnly(t, i) || (t === "ghl" && ["notes.create", "tasks.create"].includes(String(i.op))) },
  builder: { routine: "Audit the newest client sub-accounts: custom values, calendars, tags, and the AI receptionist knowledge. Fill in anything missing that you're allowed to, and list what still needs the owner.", key: "builder", name: "Builder Team", web: false, role:
    "You build and configure: clients' GHL sub-accounts (custom fields, custom values, calendars, tags, products), and their AI receptionist knowledge. You may make those setup changes yourself. Deleting anything, contacting customers, or creating/changing accounts waits for the owner.",
    auto: (t, i) => readOnly(t, i) || t === "brain_save" ||
      (t === "ghl" && ["customfields.create", "customvalues.create", "customvalues.update", "calendars.create", "tags.create", "products.create"].includes(String(i.op))) },
  research: { routine: "Pick one open question that would help the business (lead sources, competitors, pricing, a trade's market) and research it with sources. Save the key finding to memory.", key: "research", name: "Research Team", web: true, role:
    "You find things out: markets, competitors, pricing, lead sources, tools, regulations, and anything the others need. Search the web, read our own data, and report clearly with sources. Save findings worth keeping to memory. You don't change anything.",
    auto: (t, i) => readOnly(t, i) },
};

/* ------------------------------------------------------------ tools --- */
const DB_TABLES = ["accounts", "support_requests", "client_settings", "ai_brain", "time_clock", "audit_log", "ai_approvals"];
const TOOLS: Anthropic.Tool[] = [
  { name: "ghl", description: "Run one GoHighLevel operation. Read ops end in .list/.messages/.submissions. Most need args.locationId (the client's sub-account id; get ids from locations.list or accounts_list). Args are strings.",
    input_schema: { type: "object", properties: { op: { type: "string", enum: GHL_OPS }, args: { type: "object", additionalProperties: { type: "string" } }, why: { type: "string", description: "one line: why, shown to the owner if approval is needed" } }, required: ["op", "args"] } },
  { name: "accounts_list", description: "BuilderPro client accounts (self-serve sign-ups): email, business, plan, status, trial end, GHL location id, their sign-up answers, setup log.",
    input_schema: { type: "object", properties: { status: { type: "string", description: "trial | active | past_due | cancelled; omit for all" } } } },
  { name: "account_create", description: "Create a new client account end to end: BuilderPro login (they get an email to set a password), GHL sub-account from the snapshot, AI receptionist. Needs owner approval.",
    input_schema: { type: "object", properties: { name: { type: "string" }, business: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, trade: { type: "string" } }, required: ["name", "business", "email"] } },
  { name: "account_update", description: "Change a client account: status and/or add trial days. Needs owner approval.",
    input_schema: { type: "object", properties: { email: { type: "string" }, status: { type: "string", enum: ["trial", "active", "past_due", "cancelled"] }, add_trial_days: { type: "number" } }, required: ["email"] } },
  { name: "support_requests", description: "Recent support requests from clients: cancellations, business-number (phone) requests, and others.",
    input_schema: { type: "object", properties: { kind: { type: "string" } } } },
  { name: "business_stats", description: "Headline numbers: accounts by status, sign-ups in the last 7 and 30 days, trials ending in the next 3 days.", input_schema: { type: "object", properties: {} } },
  { name: "brain_get", description: "Read a client's AI receptionist knowledge (by their GHL locationId).", input_schema: { type: "object", properties: { locationId: { type: "string" } }, required: ["locationId"] } },
  { name: "brain_save", description: "Update a client's AI receptionist knowledge.",
    input_schema: { type: "object", properties: { locationId: { type: "string" }, business_name: { type: "string" }, services: { type: "string" }, pricing: { type: "string" }, hours: { type: "string" }, service_area: { type: "string" }, faqs: { type: "string" }, tone: { type: "string" }, custom_instructions: { type: "string" } }, required: ["locationId"] } },
  { name: "db_read", description: "Read BuilderPro's own database (the software the contractors use). Tables: accounts, support_requests, client_settings, ai_brain, time_clock, audit_log, ai_approvals. filter is PostgREST syntax like 'status=eq.trial' (optional).",
    input_schema: { type: "object", properties: { table: { type: "string", enum: DB_TABLES }, select: { type: "string" }, filter: { type: "string" }, limit: { type: "number" } }, required: ["table"] } },
  { name: "memory_save", description: "Remember something for the whole team (a decision, a preference of the owner, a finding).", input_schema: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } },
  { name: "memory_list", description: "What the team has saved to memory.", input_schema: { type: "object", properties: {} } },
  { name: "delegate", description: "(CEO only) Hand a task to one of the teams and get their answer back.",
    input_schema: { type: "object", properties: { team: { type: "string", enum: ["sales", "marketing", "support", "builder", "research"] }, task: { type: "string" } }, required: ["team", "task"] } },
];
function toolsFor(a: Agent): Anthropic.Messages.ToolUnion[] {
  const t: Anthropic.Messages.ToolUnion[] = TOOLS.filter((x) => (x.name !== "delegate" || a.key === "ceo") && (x.name !== "db_read" || ["ceo", "support", "builder", "sales"].includes(a.key)));
  if (a.web) t.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 } as unknown as Anthropic.Messages.ToolUnion);
  return t;
}

// Outside tools (Higgsfield, GitHub, Canva...) connected in the Connections tab,
// reached through Claude's MCP connector. These run immediately: the owner
// chooses which teams get each one and can switch off single tools.
type Mcp = { name: string; label: string; url: string; token: string; agents: string[]; disabled_tools: string[] };
async function mcpFor(agent: string): Promise<Mcp[]> {
  const r = await sb(`ai_mcp?enabled=eq.true&agents=cs.{${agent}}&select=name,label,url,token,agents,disabled_tools`);
  return r.ok ? await r.json() : [];
}

async function memoryText(): Promise<string> {
  const r = await sb("ai_memory?select=note&order=id.desc&limit=40");
  const rows = r.ok ? await r.json() : [];
  return rows.map((m: { note: string }) => "- " + m.note).join("\n");
}
async function system(a: Agent): Promise<string> {
  const mem = await memoryText();
  return `You are the ${a.name} at BuilderPro, an AI employee in the owner's Command Center.
BuilderPro sells "BuilderPro OS" to contractors (roofers, plumbers, HVAC, electricians, remodelers...): a portal plus a GoHighLevel sub-account per client, an AI receptionist that answers calls and texts, lead tools, estimates, invoices, crews and scheduling. Plans: Foundation $99/mo, BuilderPro OS $199/mo, Enterprise $299/mo, each with a 14-day free trial (card taken at sign-up by Stripe). New contractors sign up on the website and answer onboarding questions; each gets a GHL sub-account built from the owner's snapshot.
The team: CEO, Sales, Marketing, Support, Builder, Research. You are the ${a.name}.
Your job: ${a.role}
How to work: use your tools to look things up rather than guessing. Tools from connected services (e.g. Higgsfield for images and video) run immediately and may cost credits, so use them when the task calls for it, not speculatively. When a change needs the owner's approval, the tool call is queued for them and you are told so; don't retry it, just say what you proposed and why. Be direct and concrete, like a sharp employee reporting to the owner. Use short headings and lists when they help. Today is ${new Date().toISOString().slice(0, 10)}.
${mem ? "\nThe team's memory (things the owner told you, decisions, findings):\n" + mem : ""}`;
}

/* ------------------------------------------------------------ running tools --- */
async function runTool(name: string, input: Record<string, unknown>, depth: number): Promise<unknown> {
  switch (name) {
    case "ghl": return await callGHL(String(input.op), (input.args ?? {}) as Record<string, string>);
    case "accounts_list": {
      const r = await sb(`accounts?select=email,full_name,business,phone,trade,status,plan,trial_ends_at,ghl_location_id,setup_log,onboard_state,price_monthly,profile,created_at&order=created_at.desc&limit=200${input.status ? "&status=eq." + encodeURIComponent(String(input.status)) : ""}`);
      return r.ok ? await r.json() : { error: r.status };
    }
    case "account_create": return await createAccount(input as Record<string, string>);
    case "account_update": {
      const email = String(input.email ?? "").toLowerCase();
      const g = await sb(`accounts?email=eq.${encodeURIComponent(email)}&select=trial_ends_at`); const row = (g.ok ? await g.json() : [])[0];
      if (!row) return { error: "no account with that email" };
      const patch: Record<string, unknown> = {};
      if (input.status) patch.status = input.status;
      if (input.add_trial_days) patch.trial_ends_at = new Date(Math.max(Date.parse(row.trial_ends_at), Date.now()) + Number(input.add_trial_days) * 864e5).toISOString();
      const p = await sb(`accounts?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", body: JSON.stringify(patch), headers: { Prefer: "return=representation" } });
      return p.ok ? await p.json() : { error: p.status };
    }
    case "support_requests": {
      const r = await sb(`support_requests?select=*&order=created_at.desc&limit=50${input.kind ? "&kind=eq." + encodeURIComponent(String(input.kind)) : ""}`);
      return r.ok ? await r.json() : { error: r.status };
    }
    case "business_stats": {
      const r = await sb("accounts?select=status,plan,price_monthly,created_at,trial_ends_at,email,business");
      const rows: { status: string; plan: string; price_monthly: number; created_at: string; trial_ends_at: string; email: string; business: string }[] = r.ok ? await r.json() : [];
      const by: Record<string, number> = {}; rows.forEach((x) => (by[x.status] = (by[x.status] || 0) + 1));
      const plans: Record<string, number> = {}; rows.forEach((x) => (plans[x.plan] = (plans[x.plan] || 0) + 1));
      const ago = (d: number) => rows.filter((x) => Date.now() - Date.parse(x.created_at) < d * 864e5).length;
      return { total: rows.length, by_status: by, by_plan: plans, mrr_paying: rows.filter((x) => x.status === "active").reduce((s, x) => s + (x.price_monthly || 0), 0), signups_7d: ago(7), signups_30d: ago(30),
        trials_ending_3d: rows.filter((x) => x.status === "trial" && Date.parse(x.trial_ends_at) - Date.now() < 3 * 864e5 && Date.parse(x.trial_ends_at) > Date.now()).map((x) => ({ email: x.email, business: x.business, ends: x.trial_ends_at })) };
    }
    case "brain_get": {
      const r = await sb(`ai_brain?slug=eq.${encodeURIComponent(String(input.locationId))}&select=*`); const rows = r.ok ? await r.json() : [];
      return rows[0] ?? { error: "no AI receptionist for that location" };
    }
    case "brain_save": {
      const row: Record<string, unknown> = { slug: input.locationId, is_demo: false };
      ["business_name", "services", "pricing", "hours", "service_area", "faqs", "tone", "custom_instructions"].forEach((k) => { if (input[k] !== undefined) row[k] = input[k]; });
      const r = await sb("ai_brain?on_conflict=slug", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
      return r.ok ? { ok: true } : { error: r.status };
    }
    case "db_read": {
      const t = String(input.table); if (!DB_TABLES.includes(t)) return { error: "table not allowed" };
      const f = String(input.filter ?? "").replace(/[^\w.,=()*:@%+\-&]/g, "");
      const r = await sb(`${t}?select=${encodeURIComponent(String(input.select ?? "*"))}${f ? "&" + f : ""}&limit=${Math.min(Number(input.limit) || 50, 200)}`);
      return r.ok ? await r.json() : { error: r.status, detail: (await r.text()).slice(0, 200) };
    }
    case "memory_save": { const r = await sb("ai_memory", { method: "POST", body: JSON.stringify({ note: String(input.note).slice(0, 2000) }) }); return { ok: r.ok }; }
    case "memory_list": { const r = await sb("ai_memory?select=id,note,created_at&order=id.desc&limit=100"); return r.ok ? await r.json() : []; }
    case "delegate": {
      if (depth > 0) return { error: "teams can't delegate further" };
      const a = AGENTS[String(input.team)]; if (!a) return { error: "no such team" };
      const t = await newThread(a.key, "From the CEO: " + String(input.task).slice(0, 60), "ceo");
      const out = await runAgent(a, t, String(input.task), 1, "ceo");
      return { team: a.name, answer: out.reply, approvals_queued: out.approvals.length };
    }
  }
  return { error: "unknown tool" };
}
async function createAccount(a: Record<string, string>) {
  const email = String(a.email ?? "").toLowerCase();
  const inv = await fetch(`${SB_URL}/auth/v1/invite`, { method: "POST", headers: { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, data: { full_name: a.name, business: a.business } }) });
  const u = await inv.json().catch(() => ({}));
  if (!inv.ok || !u?.id) return { error: "login not created: " + JSON.stringify(u).slice(0, 200) };
  await sb("accounts", { method: "POST", body: JSON.stringify({ user_id: u.id, email, full_name: a.name, business: a.business, phone: a.phone ?? "", trade: a.trade ?? "" }) });
  await sb("client_settings?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: u.id, email, data: { company: { name: a.business, phone: a.phone ?? "", email }, owner: { name: a.name, email } } }) });
  const p = await provisionClient({ name: a.name, business: a.business, email, phone: a.phone, trade: a.trade });
  await sb(`accounts?user_id=eq.${u.id}`, { method: "PATCH", body: JSON.stringify({ ghl_location_id: p.locationId, onboard_state: p.locationId ? "provisioned" : "new", setup_log: p.error ? [...p.steps, "Error: " + p.error] : p.steps }) });
  return { ok: p.ok, email, locationId: p.locationId, steps: p.steps, error: p.error, note: "They got an email invite to set their password." };
}

/* ------------------------------------------------------------ threads --- */
async function newThread(agent: string, title: string, by: string) {
  const r = await sb("ai_threads", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ agent, title: title.slice(0, 80), created_by: by }) });
  return (await r.json())[0].id as string;
}
async function history(thread: string): Promise<Anthropic.Beta.Messages.BetaMessageParam[]> {
  const r = await sb(`ai_messages?thread_id=eq.${thread}&select=role,content&order=id.asc`);
  const rows: { role: "user" | "assistant"; content: unknown }[] = r.ok ? await r.json() : [];
  /* keep the history valid: consecutive user turns (an approval note, then a
     new message) are merged, and a tool call left without a result (a run
     that crashed mid-way) gets an error result so the API accepts it */
  const blocks = (c: unknown) => typeof c === "string" ? [{ type: "text", text: c }] : (c as unknown[]);
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  for (const m of rows) {
    const prev = out[out.length - 1];
    if (prev && prev.role === "assistant" && m.role === "assistant") out.push({ role: "user", content: [{ type: "text", text: "(continued)" }] });
    if (out.length && out[out.length - 1].role === "assistant") {
      const ids = (out[out.length - 1].content as { type: string; id?: string }[]).filter((b) => b.type === "tool_use").map((b) => b.id);
      const got = m.role === "user" ? blocks(m.content).filter((b) => (b as { type: string }).type === "tool_result").map((b) => (b as { tool_use_id: string }).tool_use_id) : [];
      const missing = ids.filter((id) => !got.includes(id));
      if (missing.length) {
        const fix = missing.map((id) => ({ type: "tool_result", tool_use_id: id, content: "This call didn't finish.", is_error: true }));
        if (m.role === "user") { out.push({ role: "user", content: [...fix, ...blocks(m.content)] }); continue; }
        out.push({ role: "user", content: fix });
      }
    }
    const last = out[out.length - 1];
    if (last && last.role === "user" && m.role === "user") { last.content = [...last.content, ...blocks(m.content)]; continue; }
    out.push({ role: m.role, content: blocks(m.content) });
  }
  if (out.length && out[out.length - 1].role === "assistant") {
    const ids = (out[out.length - 1].content as { type: string; id?: string }[]).filter((b) => b.type === "tool_use").map((b) => b.id);
    if (ids.length) out.push({ role: "user", content: ids.map((id) => ({ type: "tool_result", tool_use_id: id, content: "This call didn't finish.", is_error: true })) });
  }
  return out as unknown as Anthropic.Beta.Messages.BetaMessageParam[];
}
const save = (thread: string, role: string, content: unknown) =>
  sb("ai_messages", { method: "POST", body: JSON.stringify({ thread_id: thread, role, content }) });

/* The loop: call Claude, run the tools it asks for (or queue them for the
   owner), feed results back, until it answers. Append-only, so earlier turns
   (and their thinking) are sent back unchanged. */
async function runAgent(a: Agent, thread: string, userText: string, depth = 0, by = "owner") {
  const client = new Anthropic();
  const sys = await system(a);
  const messages = await history(thread);
  const conns = await mcpFor(a.key);
  const tools: unknown[] = toolsFor(a);
  for (const c of conns) tools.push({ type: "mcp_toolset", mcp_server_name: c.name, ...(c.disabled_tools.length ? { configs: Object.fromEntries(c.disabled_tools.map((t) => [t, { enabled: false }])) } : {}) });
  const first: Anthropic.Beta.Messages.BetaMessageParam = { role: "user", content: userText };
  const lastM = messages[messages.length - 1];
  if (lastM && lastM.role === "user") (lastM.content as unknown[]).push({ type: "text", text: userText }); else messages.push(first);
  await save(thread, "user", first.content);
  const approvals: unknown[] = [];
  let reply = "";
  for (let i = 0; i < (depth ? 6 : 10); i++) {
    // deno-lint-ignore no-explicit-any
    const res: any = await client.beta.messages.create({
      model: MODEL, max_tokens: 16000, system: sys, messages, tools,
      thinking: { type: "adaptive" }, output_config: { effort: depth ? "low" : "medium" },
      betas: ["server-side-fallback-2026-07-01", ...(conns.length ? ["mcp-client-2025-11-20"] : [])], fallbacks: "default",
      ...(conns.length ? { mcp_servers: conns.map((c) => ({ type: "url", name: c.name, url: c.url, ...(c.token ? { authorization_token: c.token } : {}) })) } : {}),
    // deno-lint-ignore no-explicit-any
    } as any);
    messages.push({ role: "assistant", content: res.content }); await save(thread, "assistant", res.content);
    const text = (res.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) reply = text;
    if (res.stop_reason === "refusal") { reply = reply || "I can't help with that one."; break; }
    if (res.stop_reason === "pause_turn") continue;
    const uses = (res.content as { type: string; id: string; name: string; input: Record<string, unknown> }[]).filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) break;
    const results = await Promise.all(uses.map(async (u) => {
      const input = u.input ?? {};
      if (u.name === "delegate" && a.key !== "ceo") return { type: "tool_result", tool_use_id: u.id, content: "Only the CEO can delegate.", is_error: true };
      if (!a.auto(u.name, input)) {
        const summary = u.name === "ghl" ? `${input.op} ${JSON.stringify(input.args ?? {})}${input.why ? " — " + input.why : ""}` : `${u.name} ${JSON.stringify(input)}`;
        const q = await sb("ai_approvals", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ thread_id: thread, agent: a.key, tool: u.name, input, summary: summary.slice(0, 500) }) });
        const row = (await q.json())[0]; approvals.push(row);
        return { type: "tool_result", tool_use_id: u.id, content: `Queued for the owner's approval (request ${row.id}). It has not run yet. Don't retry it; tell the owner what you proposed and why.` };
      }
      try {
        const out = await runTool(u.name, input, depth);
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 60000) };
      } catch (e) { return { type: "tool_result", tool_use_id: u.id, content: "Error: " + String(e).slice(0, 300), is_error: true }; }
    }));
    const tr = { role: "user" as const, content: results as unknown as Anthropic.Beta.Messages.BetaMessageParam["content"] };
    messages.push(tr); await save(thread, "user", tr.content);
  }
  await sb(`ai_threads?id=eq.${thread}`, { method: "PATCH", body: JSON.stringify({ updated_at: new Date().toISOString() }) });
  return { reply, approvals };
}

/* a transcript the page can show: text, and one line per tool call */
function transcript(rows: { role: string; content: unknown }[]) {
  const out: { role: string; text: string; tools?: string[] }[] = [];
  for (const m of rows) {
    if (typeof m.content === "string") { out.push({ role: m.role, text: m.content }); continue; }
    const blocks = (m.content as { type: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown }[]) ?? [];
    if (m.role === "user") { if (blocks.every((b) => b.type === "tool_result")) continue; }
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const tools = blocks.filter((b) => b.type === "tool_use" || b.type === "server_tool_use" || b.type === "mcp_tool_use").map((b) => b.type === "mcp_tool_use" ? String((b as { server_name?: string }).server_name ?? "") + ": " + String(b.name ?? "").replace(/_/g, " ") : b.name === "ghl" ? "GHL " + (b.input?.op ?? "") : b.name === "web_search" ? "Searched: " + (b.input?.query ?? "") : String(b.name).replace(/_/g, " "));
    if (text || tools.length) out.push({ role: m.role, text, tools });
  }
  return out;
}

/* ------------------------------------------------------------ admin gate --- */
// 24/7: pg_cron calls ?shift every 5 min. Each tick onboards new sign-ups; every
// 30 min it also runs the team whose last shift is oldest (each team every 3h).
async function shift(req: Request) {
  const cfg = await sb("ai_config?select=key,value"); const rows: { key: string; value: string }[] = cfg.ok ? await cfg.json() : [];
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  if (!get("cron_key") || req.headers.get("x-cron-key") !== get("cron_key")) return json({ ok: false }, 403);
  // onboarding runs in the background so the scheduler's 5-second call returns
  // deno-lint-ignore no-explicit-any
  const bg = (p: Promise<unknown>) => (globalThis as any).EdgeRuntime?.waitUntil?.(p);
  bg(autoOnboard().catch(() => {}));
  const onboard = "started";
  if (get("shifts_on") === "false" || !Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: true, onboard, skipped: true });
  // the scheduler ticks every 5 min for onboarding; a team shift only every 30
  const lastAny = Math.max(0, ...rows.filter((r) => r.key.startsWith("shift_")).map((r) => Date.parse(r.value) || 0));
  if (Date.now() - lastAny < 29 * 6e4) return json({ ok: true, onboard });
  let pick = "", oldest = Infinity;
  for (const k of Object.keys(AGENTS)) { const t = Date.parse(get("shift_" + k) || "1970-01-01"); if (t < oldest) { oldest = t; pick = k; } }
  const now = new Date().toISOString();
  await sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "shift_" + pick, value: now }) });
  const a = AGENTS[pick];
  const run = (async () => {
    const th = await newThread(a.key, "Shift " + now.slice(0, 16).replace("T", " "), "shift");
    await runAgent(a, th, "Your scheduled shift. " + a.routine + " Work on your own; the owner will read your report later. Keep the report short: what you did, what you found, what needs the owner.");
  })().catch(() => {});
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(run);
  return json({ ok: true, agent: pick });
}

// New sign-ups, without the owner: retry a GHL build that failed (3 tries,
// then Support is told), then the Builder team checks and finishes the setup.
async function autoOnboard() {
  const done: string[] = [];
  const r = await sb(`accounts?onboard_state=in.(new,provisioned)&created_at=lt.${new Date(Date.now() - 2 * 6e4).toISOString()}&select=*&order=created_at.asc&limit=5`);
  const rows = r.ok ? await r.json() : [];
  for (const a of rows) {
    const log: string[] = Array.isArray(a.setup_log) ? a.setup_log : [];
    if (!a.ghl_location_id) {
      if (a.onboard_attempts >= 3) {
        await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ onboard_state: "failed" }) });
        await sb("support_requests", { method: "POST", body: JSON.stringify({ owner: a.user_id, email: a.email, kind: "setup_failed", subject: "GHL setup failed for " + a.business, body: "Automatic GHL setup failed 3 times. Last: " + log.slice(-1)[0] }) }).catch(() => {});
        done.push(a.email + ": failed, sent to Support"); continue;
      }
      const p = await provisionClient({ name: a.full_name, business: a.business, email: a.email, phone: a.phone, trade: a.trade, profile: a.profile });
      await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ ghl_location_id: p.locationId, onboard_attempts: a.onboard_attempts + 1,
        onboard_state: p.locationId ? "provisioned" : "new", setup_log: [...log, `Retry ${a.onboard_attempts + 1}:`, ...p.steps, ...(p.error ? ["Error: " + p.error] : [])] }) });
      done.push(a.email + (p.locationId ? ": GHL built" : ": retry failed"));
      continue;
    }
    if (!Deno.env.get("ANTHROPIC_API_KEY")) continue;
    // one Builder check per tick keeps each run short
    await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ onboard_state: "onboarding" }) });
    const th = await newThread("builder", "Onboard: " + a.business, "shift");
    const out = await runAgent(AGENTS.builder, th, `A new client just signed up and their GHL sub-account was built automatically. Finish their setup without the owner.
Client: ${a.full_name}, ${a.business}, ${a.email}, ${a.phone || "no phone"}, trade: ${a.trade || "unknown"}, plan: ${a.plan}. GHL locationId: ${a.ghl_location_id}.
Their sign-up answers (use these, don't invent): ${JSON.stringify(a.profile ?? {})}
Setup log so far: ${log.join(" | ")}
1) Check the sub-account: custom values (Business Name/Phone/Email), calendars, tags, users. Add what's missing (a booking calendar, trade tags).
2) Check their AI receptionist knowledge (brain_get). It was filled from their answers; complete any gap (services list, FAQs a caller of a ${a.trade || "contractor"} business would ask) with brain_save, keeping their own words.
   Add a product for each main service they listed, and a tag for their trade and for their plan.
3) Report in 3-5 lines what you set up and anything the owner must do.`);
    await sb(`accounts?user_id=eq.${a.user_id}`, { method: "PATCH", body: JSON.stringify({ onboard_state: "onboarded", setup_log: [...log, "Builder team finished setup: " + out.reply.slice(0, 300)] }) });
    done.push(a.email + ": onboarded by Builder");
    break;
  }
  return done;
}

async function admin(req: Request): Promise<string> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !ADMIN_EMAILS.length) return "";
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SB_ANON } });
  if (!r.ok) return "";
  const email = String((await r.json())?.email ?? "").toLowerCase();
  return ADMIN_EMAILS.includes(email) ? email : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (new URL(req.url).searchParams.get("shift") !== null) return await shift(req);
  const who = await admin(req);
  if (!who) return json({ ok: false, error: "not authorized" }, 403);
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* none */ }
  const op = String(b.op ?? "");

  if (op === "me") return json({ ok: true, email: who, ai: !!Deno.env.get("ANTHROPIC_API_KEY"), snapshot: !!Deno.env.get("GHL_SNAPSHOT_ID"), stripe: !!Deno.env.get("STRIPE_SECRET_KEY"),
    agents: Object.values(AGENTS).map((a) => ({ key: a.key, name: a.name })) });
  if (op === "chat") {
    const a = AGENTS[String(b.agent)]; if (!a) return json({ ok: false, error: "no such agent" }, 400);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ ok: false, error: "Add ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets first." }, 400);
    const msg = String(b.message ?? "").slice(0, 8000); if (!msg) return json({ ok: false, error: "empty" }, 400);
    const thread = b.thread_id ? String(b.thread_id) : await newThread(a.key, msg, who);
    try { const out = await runAgent(a, thread, msg); return json({ ok: true, thread_id: thread, ...out }); }
    catch (e) { return json({ ok: false, thread_id: thread, error: String(e).slice(0, 400) }, 500); }
  }
  if (op === "status") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(AGENTS)) {
      const t = await sb(`ai_threads?agent=eq.${k}&select=id,title,updated_at,created_by&order=updated_at.desc&limit=1`);
      const p = await sb(`ai_approvals?agent=eq.${k}&status=eq.pending&select=id`);
      out[k] = { last: (t.ok ? await t.json() : [])[0] ?? null, pending: (p.ok ? await p.json() : []).length };
    }
    const c = await sb("ai_config?key=eq.shifts_on&select=value"); const on = ((c.ok ? await c.json() : [])[0]?.value ?? "true") === "true";
    const m = await sb("ai_mcp?enabled=eq.true&select=name,label,agents"); 
    return json({ ok: true, data: out, shifts_on: on, connections: m.ok ? await m.json() : [] });
  }
  if (op === "shifts") {
    await sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "shifts_on", value: b.on ? "true" : "false" }) });
    return json({ ok: true });
  }
  if (op === "mcp_list") {
    const r = await sb("ai_mcp?select=id,name,label,url,token,agents,disabled_tools,enabled&order=id.asc");
    const rows = r.ok ? await r.json() : [];
    return json({ ok: true, data: rows.map((x: Mcp & { token: string }) => ({ ...x, token: x.token ? "••••" + x.token.slice(-4) : "" })) });
  }
  if (op === "mcp_save") {
    const name = String(b.name ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const url = String(b.url ?? "").trim();
    if (!name || !/^https:\/\//.test(url)) return json({ ok: false, error: "Give it a name and an https:// address." }, 400);
    const row: Record<string, unknown> = { name, label: String(b.label ?? name).slice(0, 60), url, enabled: b.enabled !== false,
      agents: (Array.isArray(b.agents) ? b.agents : []).map(String).filter((k) => AGENTS[k]),
      disabled_tools: (Array.isArray(b.disabled_tools) ? b.disabled_tools : String(b.disabled_tools ?? "").split(",")).map((t) => String(t).trim()).filter(Boolean) };
    if (b.token) row.token = String(b.token).trim();
    const r = b.id ? await sb(`ai_mcp?id=eq.${Number(b.id)}`, { method: "PATCH", body: JSON.stringify(row) })
      : await sb("ai_mcp", { method: "POST", body: JSON.stringify(row) });
    return r.ok ? json({ ok: true }) : json({ ok: false, error: r.status === 409 ? "That name is taken." : "Could not save." }, 400);
  }
  if (op === "mcp_delete") { await sb(`ai_mcp?id=eq.${Number(b.id)}`, { method: "DELETE" }); return json({ ok: true }); }
  if (op === "threads") { const r = await sb(`ai_threads?agent=eq.${encodeURIComponent(String(b.agent))}&select=id,title,created_by,updated_at&order=updated_at.desc&limit=50`); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "thread") { const r = await sb(`ai_messages?thread_id=eq.${encodeURIComponent(String(b.id))}&select=role,content&order=id.asc`); return json({ ok: true, data: transcript(r.ok ? await r.json() : []) }); }
  if (op === "approvals") { const r = await sb(`ai_approvals?select=*&order=created_at.desc&limit=100${b.status ? "&status=eq." + encodeURIComponent(String(b.status)) : ""}`); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "approve" || op === "reject") {
    const g = await sb(`ai_approvals?id=eq.${encodeURIComponent(String(b.id))}&status=eq.pending&select=*`); const row = (g.ok ? await g.json() : [])[0];
    if (!row) return json({ ok: false, error: "not pending" }, 404);
    if (op === "reject") {
      await sb(`ai_approvals?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected", decided_by: who, decided_at: new Date().toISOString() }) });
      if (row.thread_id) await save(row.thread_id, "user", `[The owner rejected: ${row.summary}${b.note ? ". Their note: " + b.note : ""}]`);
      return json({ ok: true });
    }
    let result: unknown, status = "approved";
    try { result = await runTool(row.tool, row.input, 0); if ((result as { ok?: boolean; error?: string })?.error || (result as { ok?: boolean })?.ok === false) status = "failed"; }
    catch (e) { result = { error: String(e) }; status = "failed"; }
    await sb(`ai_approvals?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ status, result, decided_by: who, decided_at: new Date().toISOString() }) });
    await sb("audit_log", { method: "POST", body: JSON.stringify({ actor: who, op: "ai." + row.tool, args: row.input, ok: status === "approved", status: 200 }) }).catch(() => {});
    if (row.thread_id) await save(row.thread_id, "user", `[The owner approved: ${row.summary}. Result: ${JSON.stringify(result).slice(0, 3000)}]`);
    return json({ ok: true, status, result });
  }
  if (op === "accounts") { const r = await sb("accounts?select=*&order=created_at.desc&limit=500"); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "stats") return json({ ok: true, data: await runTool("business_stats", {}, 0) });
  if (op === "memory") { const r = await sb("ai_memory?select=id,note,created_at&order=id.desc&limit=200"); return json({ ok: true, data: r.ok ? await r.json() : [] }); }
  if (op === "memory_delete") { await sb(`ai_memory?id=eq.${Number(b.id)}`, { method: "DELETE" }); return json({ ok: true }); }
  if (op === "account_create") { const r = await createAccount(b as Record<string, string>); return json(r); }
  return json({ ok: false, error: "unknown op" }, 400);
});
