// ghl-diag: setup check + watcher, run by pg_cron every 5 minutes (cron key required).
//   - checks whether the agency key may open each sub-account (mints a location
//     token for the house account) and writes the result to ai_config ghl_mint
//     (status codes and HighLevel's messages only, never tokens)
//   - once it may: finishes accounts listed in ai_config refinish (user ids, comma
//     separated) whose sub-account was built before that worked: business custom
//     values and the booking calendar for their AI receptionist
//   ?loc=<id> runs the full check on one sub-account into ai_config ghl_diag2.
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "", SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KEY = Deno.env.get("GHL_API_KEY") ?? "", CO = Deno.env.get("GHL_COMPANY_ID") ?? "";
const B = "https://services.leadconnectorhq.com";
const sb = (p: string, i: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${p}`, { ...i, headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(i.headers ?? {}) } });
const H = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/json" });
const msg = async (r: Response) => { const t = await r.text(); try { const d = JSON.parse(t); return String(d.message ?? d.error ?? d.msg ?? "").slice(0, 160); } catch { return t.slice(0, 160); } };
const cfg = async (k: string) => String((await (await sb(`ai_config?key=eq.${k}&select=value`)).json())?.[0]?.value ?? "");
const setCfg = (k: string, v: string) => sb("ai_config?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: k, value: v }) });
/* the Marketplace app's agency login (ghl_oauth, saved by ghl-oauth on install), renewed
   when it's about to run out; the agency key is the fallback (it can't mint, but says why) */
const CID = Deno.env.get("GHL_CLIENT_ID") ?? "", CSEC = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
let appTok = "";
async function agencyToken(): Promise<string> {
  if (appTok) return appTok;
  const row = (await (await sb("ghl_oauth?id=eq.1&select=*")).json())?.[0];
  if (!row?.refresh_token) return KEY;
  if (row.access_token && Date.parse(row.expires_at ?? "") > Date.now() + 120e3) return (appTok = row.access_token);
  if (!CID || !CSEC) return KEY;
  const r = await fetch(`${B}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: CID, client_secret: CSEC, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) return KEY;
  await sb("ghl_oauth?id=eq.1", { method: "PATCH", body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(Date.now() + (Number(d.expires_in || 86400) - 60) * 1000).toISOString(), updated_at: new Date().toISOString() }) });
  return (appTok = d.access_token);
}
async function mint(loc: string): Promise<{ token: string; status: number; why: string }> {
  const m = await fetch(`${B}/oauth/locationToken`, { method: "POST", headers: { ...H(await agencyToken()), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ companyId: CO, locationId: loc }).toString() });
  if (!m.ok) return { token: "", status: m.status, why: await msg(m) };
  return { token: (await m.json())?.access_token ?? "", status: m.status, why: "" };
}
// deno-lint-ignore no-explicit-any
async function refinish(a: any, tok: string): Promise<string[]> {
  const loc = a.ghl_location_id, pf = a.profile ?? {}, steps: string[] = [];
  const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
  const hours = pf.hours ? DAYS.map(([k, n]) => { const d = pf.hours[k]; return d && d.open ? `${n} ${d.from}-${d.to}` : `${n} closed`; }).join(", ") : "";
  const cvr = await fetch(`${B}/locations/${loc}/customValues`, { headers: H(tok) });
  const have: { id: string; name: string }[] = cvr.ok ? (await cvr.json())?.customValues ?? [] : [];
  let n = 0;
  for (const [k, v] of [["Business Name", a.business], ["Business Phone", a.phone], ["Business Email", a.email], ["Business Address", [pf.address, pf.city, pf.state, pf.zip].filter(Boolean).join(", ")],
    ["Business Website", pf.website], ["Service Area", pf.serviceArea], ["Business Hours", hours], ["Trade", a.trade], ["Owner Name", a.full_name], ["License Number", pf.license],
    ["Owner Email", a.email], ["Owner Phone", a.phone]]) {
    if (!v) continue;
    const cur = have.find((x) => String(x.name).toLowerCase() === String(k).toLowerCase());
    const r = await fetch(`${B}/locations/${loc}/customValues${cur ? "/" + cur.id : ""}`, { method: cur ? "PUT" : "POST", headers: H(tok), body: JSON.stringify({ name: k, value: v }) });
    if (r.ok) n++;
  }
  steps.push(cvr.ok ? `Business details filled in (${n} custom values)` : `Custom values still blocked (${cvr.status})`);
  const cr = await fetch(`${B}/calendars/?locationId=${loc}`, { headers: H(tok) });
  const cals: { id: string; name?: string }[] = cr.ok ? (await cr.json())?.calendars ?? [] : [];
  const cal = (cals.find((c) => /inspection/i.test(c.name ?? "")) ?? cals[0])?.id ?? "";
  if (cal) { await sb(`ai_brain?slug=eq.${loc}`, { method: "PATCH", body: JSON.stringify({ booking_calendar_id: cal }) }); steps.push("AI receptionist books into the " + ((cals.find((c) => c.id === cal)?.name) ?? "first") + " calendar"); }
  else steps.push(cr.ok ? "No calendar found" : `Calendars still blocked (${cr.status})`);
  // their HighLevel login, if the first try was turned down
  if ((a.setup_log ?? []).some((l: string) => /GHL login not created/.test(l)) && !(a.setup_log ?? []).some((l: string) => /GHL login created/.test(l))) {
    const [first, ...rest] = String(a.full_name || "").trim().split(/\s+/);
    const ur = await fetch(`${B}/users/`, { method: "POST", headers: H(KEY), body: JSON.stringify({ companyId: CO, locationIds: [loc], firstName: first || a.business, lastName: rest.join(" "), email: a.email, phone: a.phone || "", type: "account", role: "admin",
      permissions: { paymentsEnabled: true, settingsEnabled: true, invoiceEnabled: true, contactsEnabled: true, conversationsEnabled: true, appointmentsEnabled: true, opportunitiesEnabled: true, dashboardStatsEnabled: true, reviewsEnabled: true, marketingEnabled: true, workflowsEnabled: true, phoneCallEnabled: true } }) });
    steps.push(ur.ok ? "GHL login created for " + a.email : `GHL login still not created (${ur.status} ${await msg(ur)})`);
  }
  return steps;
}
Deno.serve(async (req) => {
  const c = await cfg("cron_key");
  if (!c || req.headers.get("x-cron-key") !== c) return new Response("no", { status: 403 });
  const loc = new URL(req.url).searchParams.get("loc") ?? "";
  if (loc) {
    const out: string[] = [];
    const m = await mint(loc); out.push("mint location token: " + m.status + (m.token ? " ok" : " " + m.why));
    const g = await fetch(`${B}/locations/${loc}`, { headers: H(KEY) }); out.push("agency key GET location: " + g.status + (g.ok ? "" : " " + await msg(g)));
    if (m.token) { const p = await fetch(`${B}/opportunities/pipelines?locationId=${loc}`, { headers: H(m.token) }); out.push("pipelines: " + p.status + " " + (p.ok ? JSON.stringify(((await p.json()).pipelines ?? []).map((x: { name: string; id: string; stages: { name: string }[] }) => `${x.name} [${x.id}] (${x.stages.map((s) => s.name).join(", ")})`)) : await msg(p))); }
    await setCfg("ghl_diag2", out.join("\n"));
    return new Response("ok");
  }
  // the watcher
  const house = await cfg("house_location_id");
  if (!house) return new Response("no house");
  const m = await mint(house);
  await setCfg("ghl_mint", (m.token ? "ok" : `no (${m.status} ${m.why})`) + " at " + new Date().toISOString().slice(0, 16).replace("T", " "));
  if (!m.token) return new Response("not yet");
  const ids = (await cfg("refinish")).split(",").map((s) => s.trim()).filter(Boolean);
  const left: string[] = [];
  for (const id of ids) {
    const a = (await (await sb(`accounts?user_id=eq.${id}&select=*`)).json())?.[0];
    if (!a) continue;
    if (!a.ghl_location_id) { left.push(id); continue; }   // not built yet: try again next tick
    const t = await mint(a.ghl_location_id);
    if (!t.token) { left.push(id); continue; }
    const steps = await refinish(a, t.token);
    await sb(`accounts?user_id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ setup_log: [...(Array.isArray(a.setup_log) ? a.setup_log : []), "Finished once the agency key could open the sub-account:", ...steps] }) });
  }
  await setCfg("refinish", left.join(","));
  return new Response("ok");
});
