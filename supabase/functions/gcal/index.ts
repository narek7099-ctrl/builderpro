// gcal — a contractor's Google Calendar, kept in step with BuilderPro (and with
// their HighLevel calendar whenever HighLevel is reachable).
//
//   POST { op:"start", tz }       (signed in, owner/office) -> { ok, url }  Google's sign-in page
//   GET  ?code=&state=            Google's redirect back -> saves the sign-in, first sync, 302 to the app
//   POST { op:"status" }          (signed in) -> { configured, connected, email, last_sync, error, ask }
//   POST { op:"answer", id, appt, contact_id? }  (signed in) -> the "customer appointment?" answer
//   POST { op:"sync_now" }        (signed in) -> syncs this account now
//   POST { op:"disconnect" }      (signed in) -> removes what we wrote to Google, forgets the sign-in
//   POST { op:"sync" } + x-cron-secret -> every connected account (pg_cron, every 5 minutes)
//
// What one sync does, for the next 60 days:
//   1. Google -> BuilderPro. Every event that makes them busy (not "free", not
//      declined, not one we wrote) lands in gcal_events. A new timed event in
//      work hours is "ask" (the app asks: customer appointment?); anything else
//      is "busy". Moved or deleted events follow.
//   2. BuilderPro -> Google. Project work days, and HighLevel appointments when
//      HighLevel answers, are written to their primary calendar, tagged
//      private bp=1 so step 1 never reads them back. Changed ones are updated,
//      gone ones removed (only for a source that was read this time).
//   3. -> HighLevel (only when it answers; frozen accounts just wait):
//      busy / ask / dismissed  -> a blocked slot, so Lisa won't book over it
//      appt (they said yes)    -> a real appointment for that contact, which
//                                 runs the workflows and moves the pipeline
//
// Deploy: --no-verify-jwt (Google's redirect back carries no Supabase login).
// Secrets: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (or the GMAIL_ ones mail-connect
//          uses: the same Google project). The token key and the scheduler's
//          secret come from Vault through mail_vault(), like mail-connect.
// Google Cloud: enable the Google Calendar API, add the scope
//   https://www.googleapis.com/auth/calendar.events to the consent screen, and
//   add <SUPABASE_URL>/functions/v1/gcal as an authorized redirect URI.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? Deno.env.get("GMAIL_CLIENT_ID") ?? "";
const G_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";
const REDIRECT = `${SB_URL}/functions/v1/gcal`;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DAYS = 60;
const MAX_WRITES = 40;   // per account per run, to stay inside the function's time limit

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
const rows = async (path: string): Promise<Row[]> => { try { const r = await sb(path); return r.ok ? await r.json() : []; } catch { return []; } };
const one = async (path: string): Promise<Row | null> => (await rows(path))[0] ?? null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

/* ---------- who is asking (owner or office) ---------- */
async function caller(req: Request): Promise<{ id: string; owner: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!u.ok) return null;
  const user = await u.json();
  if (!UUID.test(String(user?.id ?? ""))) return null;
  const tm = await one(`team_members?member=eq.${user.id}&accepted_at=not.is.null&select=owner,role&limit=1`);
  if (tm && tm.role !== "office") return null;   // crew and subs don't manage the calendar connection
  return { id: user.id, owner: String(tm?.owner ?? user.id) };
}

/* ---------- signed state for Google's redirect ---------- */
async function hmac(s: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SB_SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("gcal:" + s))))).replace(/[+/=]/g, "");
}
async function makeState(owner: string, tz: string) { const p = btoa(JSON.stringify({ o: owner, z: tz, t: Date.now() })); return `${p}.${await hmac(p)}`; }
async function readState(s: string): Promise<{ o: string; z: string } | null> {
  const [p, sig] = String(s).split(".");
  if (!p || !sig || (await hmac(p)) !== sig) return null;
  try { const d = JSON.parse(atob(p)); return Date.now() - d.t < 30 * 60e3 && UUID.test(d.o) ? { o: d.o, z: String(d.z || "") } : null; } catch { return null; }
}

/* ---------- the sign-in, encrypted at rest with mail-connect's key ---------- */
async function vault(name: string): Promise<string> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/mail_vault`, { method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_name: name }) });
  return r.ok ? String((await r.json()) ?? "") : "";
}
let KEY: CryptoKey | null = null;
async function aesKey() {
  if (KEY) return KEY;
  const raw = Deno.env.get("MAIL_TOKEN_KEY") || await vault("mail_token_key");
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return (KEY = await crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]));
}
async function seal(t: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(t)));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  return btoa(String.fromCharCode(...all));
}
async function unseal(s: string) {
  const all = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aesKey(), all.slice(12)));
}
async function tokenCall(body: Record<string, string>): Promise<Row> {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SECRET, redirect_uri: REDIRECT, ...body }) });
  return r.json().catch(() => ({}));
}
async function accessFor(link: Row): Promise<string> {
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: await unseal(link.token_enc) });
  if (!t.access_token) {
    await sb(`gcal_links?owner=eq.${link.owner}`, { method: "PATCH", body: JSON.stringify({ status: "reconnect", error: String(t.error_description || t.error || "Google sign-in expired").slice(0, 200) }) });
    return "";
  }
  return String(t.access_token);
}

/* ---------- time zones: a local date and time in their zone, as an instant ---------- */
function offsetMin(at: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(at)).filter((x) => x.type !== "literal").map((x) => [x.type, +x.value]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - at) / 60e3;
}
function zoned(date: string, hhmm: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = (hhmm || "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  let at = guess - offsetMin(guess, tz) * 60e3;
  at = guess - offsetMin(at, tz) * 60e3;
  return at;
}
const localHour = (at: number, tz: string) => +new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(at));
const validTz = (z: string) => { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; } };

/* ---------- HighLevel (the same token chain lead-in uses) ---------- */
const GHL = "https://services.leadconnectorhq.com";
const HOUSE_LOC = Deno.env.get("GHL_LOCATION_ID") ?? "", GHL_TOKEN = Deno.env.get("GHL_TOKEN") ?? "";
const GHL_API_KEY = Deno.env.get("GHL_API_KEY") ?? "", GHL_CO = Deno.env.get("GHL_COMPANY_ID") ?? "";
const APP_ID = Deno.env.get("GHL_CLIENT_ID") ?? "", APP_SECRET = Deno.env.get("GHL_CLIENT_SECRET") ?? "";
let appTok: { t: string; exp: number } | null = null;
async function appToken(): Promise<string> {
  if (appTok && appTok.exp > Date.now() + 60e3) return appTok.t;
  try {
    const row = await one("ghl_oauth?id=eq.1&select=*");
    if (!row?.refresh_token) return "";
    const exp = Date.parse(row.expires_at ?? "") || 0;
    if (row.access_token && exp > Date.now() + 60e3) { appTok = { t: row.access_token, exp }; return row.access_token; }
    if (!APP_ID || !APP_SECRET) return "";
    const r = await fetch(`${GHL}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: "refresh_token", refresh_token: row.refresh_token, user_type: "Company" }).toString() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) return "";
    const nexp = Date.now() + (Number(d.expires_in || 86400) - 60) * 1000;
    appTok = { t: d.access_token, exp: nexp };
    await sb("ghl_oauth?id=eq.1", { method: "PATCH", body: JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token ?? row.refresh_token, expires_at: new Date(nexp).toISOString(), updated_at: new Date().toISOString() }) });
    return d.access_token;
  } catch { return ""; }
}
async function mint(loc: string, bearer: string): Promise<string> {
  if (!bearer || !GHL_CO) return "";
  try {
    const r = await fetch(`${GHL}/oauth/locationToken`, { method: "POST", headers: { Authorization: `Bearer ${bearer}`, Version: "2021-07-28", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: GHL_CO, locationId: loc }).toString(), signal: AbortSignal.timeout(8000) });
    if (r.ok) { const d = await r.json(); return String(d?.access_token ?? ""); }
  } catch { /* none */ }
  return "";
}
async function ghlToken(loc: string): Promise<string> {
  const k = await one(`ghl_keys?location_id=eq.${encodeURIComponent(loc)}&select=token&limit=1`);
  if (k?.token) return String(k.token);
  if (loc === HOUSE_LOC && GHL_TOKEN) return GHL_TOKEN;
  return (await mint(loc, await appToken())) || (GHL_API_KEY ? await mint(loc, GHL_API_KEY) : "");
}
async function ghlFor(owner: string): Promise<{ loc: string; cal: string; tok: string } | null> {
  const [a, b] = await Promise.all([one(`accounts?user_id=eq.${owner}&select=ghl_location_id&limit=1`), one(`ai_brain?owner=eq.${owner}&select=ghl_location_id,booking_calendar_id&limit=1`)]);
  const loc = String(a?.ghl_location_id || b?.ghl_location_id || "");
  if (!loc) return null;
  const tok = await ghlToken(loc);
  if (!tok) return null;
  // one cheap read: a frozen or closed account answers 401/403 and we wait for next time
  const ping = await fetch(`${GHL}/calendars/?locationId=${loc}`, { headers: gH(tok), signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!ping || !ping.ok) return null;
  return { loc, cal: String(b?.booking_calendar_id || ""), tok };
}
const gH = (t: string) => ({ Authorization: `Bearer ${t}`, Version: "2021-04-15", Accept: "application/json", "Content-Type": "application/json" });

/* ---------- one account ---------- */
async function syncOne(link: Row): Promise<Row> {
  const owner = String(link.owner), tz = validTz(link.tz) ? link.tz : "America/Los_Angeles";
  const at = await accessFor(link);
  if (!at) return { owner, ok: false, error: "reconnect" };
  const G = { Authorization: `Bearer ${at}`, "Content-Type": "application/json" };
  const now = Date.now(), from = new Date(now - 864e5).toISOString(), to = new Date(now + DAYS * 864e5).toISOString();
  let writes = 0;
  const ghl = await ghlFor(owner);

  /* 1. Google -> BuilderPro */
  const items: Row[] = [];
  let page = "";
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${GCAL}?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${encodeURIComponent(from)}&timeMax=${encodeURIComponent(to)}${page ? "&pageToken=" + encodeURIComponent(page) : ""}`, { headers: G });
    if (!r.ok) { const e = await r.text(); await sb(`gcal_links?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify({ error: `Google ${r.status}: ${e.slice(0, 160)}` }) }); return { owner, ok: false, error: r.status }; }
    const d = await r.json();
    items.push(...(d.items ?? []));
    page = d.nextPageToken ?? ""; if (!page) break;
  }
  const seen = new Set<string>();
  const have = await rows(`gcal_events?owner=eq.${owner}&select=*&limit=1000`);
  const byG: Record<string, Row> = Object.fromEntries(have.map((x) => [x.google_id, x]));
  const fresh: Row[] = [];
  for (const it of items) {
    if (it.status === "cancelled" || it.transparency === "transparent") continue;
    if (it.extendedProperties?.private?.bp === "1") continue;                       // one of ours
    if ((it.attendees ?? []).some((a: Row) => a.self && a.responseStatus === "declined")) continue;
    const allDay = !it.start?.dateTime;
    const s = allDay ? zoned(String(it.start?.date), "00:00", tz) : Date.parse(it.start.dateTime);
    const e = allDay ? zoned(String(it.end?.date), "00:00", tz) : Date.parse(it.end?.dateTime ?? it.start.dateTime);
    if (!isFinite(s) || !isFinite(e)) continue;
    const id = String(it.id), title = clean(it.summary || "Busy", 160);
    seen.add(id);
    const old = byG[id];
    if (!old) {
      // a new timed event in work hours might be a customer: ask; the rest just blocks time
      const h = localHour(s, tz), dur = (e - s) / 60e3;
      const ask = !allDay && h >= 7 && h < 19 && dur <= 240 && s > now;
      fresh.push({ owner, google_id: id, title, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), all_day: allDay, kind: ask ? "ask" : "busy" });
    } else if (old.title !== title || Date.parse(old.starts_at) !== s || Date.parse(old.ends_at) !== e) {
      const moved = Date.parse(old.starts_at) !== s || Date.parse(old.ends_at) !== e;
      await sb(`gcal_events?id=eq.${old.id}`, { method: "PATCH", body: JSON.stringify({ title, starts_at: new Date(s).toISOString(), ends_at: new Date(e).toISOString(), all_day: allDay,
        ghl_state: moved && (old.ghl_block_id || old.ghl_appt_id) ? "update" : old.ghl_state, updated_at: new Date().toISOString() }) });
    }
  }
  if (fresh.length) await sb("gcal_events?on_conflict=owner,google_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(fresh) });
  // gone from Google (inside the window we read): remove, or let HighLevel clean up first
  for (const x of have) {
    if (seen.has(x.google_id)) continue;
    const s = Date.parse(x.starts_at);
    if (s < Date.parse(from) || s > Date.parse(to)) continue;
    if (x.ghl_block_id || x.ghl_appt_id) await sb(`gcal_events?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ ghl_state: "delete" }) });
    else await sb(`gcal_events?id=eq.${x.id}`, { method: "DELETE" });
  }
  // and anything long past
  await sb(`gcal_events?owner=eq.${owner}&ends_at=lt.${new Date(now - 7 * 864e5).toISOString()}&ghl_state=neq.delete`, { method: "DELETE" });

  /* 2. BuilderPro -> Google */
  const want: Record<string, Row> = {};
  const readOk: Record<string, boolean> = { job: false, ghl: false };
  const pf = await one(`portal_finance?owner=eq.${owner}&select=jobs&limit=1`);
  if (pf) {
    readOk.job = true;
    for (const j of (Array.isArray(pf.jobs) ? pf.jobs : [])) {
      if (!j || j.status !== "active" || !j.sched || !Array.isArray(j.sched.dates)) continue;
      for (const day of j.sched.dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day))) continue;
        const sl = (j.sched.slots && j.sched.slots[day]) || null;
        const t = String((sl && sl.t) || j.sched.time || "");
        const s = t ? zoned(day, t, tz) : zoned(day, "00:00", tz);
        if (s < now - 864e5 || s > now + DAYS * 864e5) continue;
        const dur = sl ? (+sl.dur || 120) : (j.sched.end && t ? Math.max(30, (zoned(day, String(j.sched.end), tz) - s) / 60e3) : (+j.sched.dur || 480));
        const title = `${clean(j.name || "Project", 80)}${j.title ? " · " + clean(j.title, 60) : ""}`;
        want[`job:${j.id}:${day}`] = t
          ? { summary: title, start: { dateTime: new Date(s).toISOString(), timeZone: tz }, end: { dateTime: new Date(s + dur * 60e3).toISOString(), timeZone: tz }, location: clean(j.addr, 200) }
          : { summary: title, start: { date: day }, end: { date: new Date(Date.parse(day + "T12:00:00Z") + 864e5).toISOString().slice(0, 10) }, location: clean(j.addr, 200) };
      }
    }
  }
  if (ghl && ghl.cal) {
    const r = await fetch(`${GHL}/calendars/events?locationId=${ghl.loc}&calendarId=${ghl.cal}&startTime=${now - 864e5}&endTime=${now + DAYS * 864e5}`, { headers: gH(ghl.tok) }).catch(() => null);
    if (r && r.ok) {
      readOk.ghl = true;
      const mine = new Set(have.map((x) => x.ghl_appt_id).filter(Boolean));
      for (const ev of ((await r.json()).events ?? []) as Row[]) {
        if (!ev.id || mine.has(ev.id) || /cancel/i.test(String(ev.appointmentStatus ?? ""))) continue;
        want[`ghl:${ev.id}`] = { summary: clean(ev.title || "Inspection", 120), start: { dateTime: new Date(ev.startTime).toISOString(), timeZone: tz }, end: { dateTime: new Date(ev.endTime || Date.parse(ev.startTime) + 36e5).toISOString(), timeZone: tz }, location: clean(ev.address, 200) };
      }
    }
  }
  const pushed = await rows(`gcal_pushed?owner=eq.${owner}&select=*&limit=2000`);
  const pByRef: Record<string, Row> = Object.fromEntries(pushed.map((x) => [x.ref, x]));
  for (const [ref, body] of Object.entries(want)) {
    if (writes >= MAX_WRITES) break;
    const sig = JSON.stringify(body), p = pByRef[ref];
    const ev = { ...body, description: "Added by BuilderPro. Change it in BuilderPro and this updates.", extendedProperties: { private: { bp: "1", bpref: ref } } };
    if (!p) {
      const r = await fetch(GCAL, { method: "POST", headers: G, body: JSON.stringify(ev) }); writes++;
      if (r.ok) { const d = await r.json(); await sb("gcal_pushed", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner, ref, google_id: d.id, sig }) }); }
    } else if (p.sig !== sig) {
      const r = await fetch(`${GCAL}/${encodeURIComponent(p.google_id)}`, { method: "PATCH", headers: G, body: JSON.stringify(ev) }); writes++;
      if (r.ok) await sb(`gcal_pushed?owner=eq.${owner}&ref=eq.${encodeURIComponent(ref)}`, { method: "PATCH", body: JSON.stringify({ sig, updated_at: new Date().toISOString() }) });
      else if (r.status === 404 || r.status === 410) await sb(`gcal_pushed?owner=eq.${owner}&ref=eq.${encodeURIComponent(ref)}`, { method: "DELETE" });   // they deleted it in Google: write it again next run
    }
  }
  for (const p of pushed) {
    if (writes >= MAX_WRITES) break;
    const src = String(p.ref).split(":")[0];
    if (want[p.ref] || !readOk[src]) continue;
    await fetch(`${GCAL}/${encodeURIComponent(p.google_id)}`, { method: "DELETE", headers: G }).catch(() => null); writes++;
    await sb(`gcal_pushed?owner=eq.${owner}&ref=eq.${encodeURIComponent(p.ref)}`, { method: "DELETE" });
  }

  /* 3. -> HighLevel */
  let hl = "waiting";
  if (ghl) {
    hl = "ok";
    const list = await rows(`gcal_events?owner=eq.${owner}&select=*&limit=1000`);
    for (const x of list) {
      if (writes >= MAX_WRITES) break;
      const s = x.starts_at, e = x.ends_at, done = (patch: Row) => sb(`gcal_events?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
      if (x.ghl_state === "delete") {
        for (const id of [x.ghl_block_id, x.ghl_appt_id].filter(Boolean)) { await fetch(`${GHL}/calendars/events/${id}`, { method: "DELETE", headers: gH(ghl.tok) }).catch(() => null); writes++; }
        await sb(`gcal_events?id=eq.${x.id}`, { method: "DELETE" });
        continue;
      }
      if (Date.parse(e) < now) continue;
      if (x.kind === "appt" && x.contact_id && ghl.cal) {
        if (!x.ghl_appt_id) {
          const cid = await ghlContact(owner, x.contact_id, ghl);
          if (!cid) { await done({ ghl_state: "no_contact" }); continue; }
          const r = await fetch(`${GHL}/calendars/events/appointments`, { method: "POST", headers: gH(ghl.tok), body: JSON.stringify({
            calendarId: ghl.cal, locationId: ghl.loc, contactId: cid, startTime: s, endTime: e, title: x.title, appointmentStatus: "confirmed", ignoreFreeSlotValidation: true, toNotify: true }) }); writes++;
          const d = await r.json().catch(() => ({}));
          const id = String(d?.id ?? d?.appointment?.id ?? "");
          if (!r.ok || !id) { await done({ ghl_state: `failed ${r.status}` }); continue; }
          if (x.ghl_block_id) { await fetch(`${GHL}/calendars/events/${x.ghl_block_id}`, { method: "DELETE", headers: gH(ghl.tok) }).catch(() => null); writes++; }
          await done({ ghl_appt_id: id, ghl_block_id: "", ghl_state: "done" });
        } else if (x.ghl_state === "update") {
          await fetch(`${GHL}/calendars/events/appointments/${x.ghl_appt_id}`, { method: "PUT", headers: gH(ghl.tok), body: JSON.stringify({ startTime: s, endTime: e, ignoreFreeSlotValidation: true }) }); writes++;
          await done({ ghl_state: "done" });
        }
        continue;
      }
      if (x.kind !== "appt") {
        if (!x.ghl_block_id) {
          const r = await fetch(`${GHL}/calendars/events/block-slots`, { method: "POST", headers: gH(ghl.tok), body: JSON.stringify({
            locationId: ghl.loc, ...(ghl.cal ? { calendarId: ghl.cal } : {}), startTime: s, endTime: e, title: `Busy: ${x.title}`.slice(0, 120) }) }); writes++;
          const d = await r.json().catch(() => ({}));
          const id = String(d?.id ?? d?.event?.id ?? "");
          await done(r.ok && id ? { ghl_block_id: id, ghl_state: "done" } : { ghl_state: `failed ${r.status}` });
        } else if (x.ghl_state === "update") {
          await fetch(`${GHL}/calendars/events/block-slots/${x.ghl_block_id}`, { method: "PUT", headers: gH(ghl.tok), body: JSON.stringify({ startTime: s, endTime: e, title: `Busy: ${x.title}`.slice(0, 120) }) }); writes++;
          await done({ ghl_state: "done" });
        }
      }
    }
  }
  await sb(`gcal_links?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify({ last_sync: new Date().toISOString(), status: "connected", error: "" }) });
  return { owner, ok: true, google: items.length, writes, highlevel: hl };
}

/* the customer they picked, as a HighLevel contact (made there if it isn't yet) */
async function ghlContact(owner: string, contactId: string, ghl: { loc: string; tok: string }): Promise<string> {
  const c = await one(`contacts?id=eq.${contactId}&owner=eq.${owner}&select=id,name,phone,email,ghl_id&limit=1`);
  if (!c) return "";
  if (c.ghl_id) return String(c.ghl_id);
  const r = await fetch(`${GHL}/contacts/upsert`, { method: "POST", headers: { ...gH(ghl.tok), Version: "2021-07-28" }, body: JSON.stringify({
    locationId: ghl.loc, name: c.name || undefined, phone: c.phone || undefined, email: c.email || undefined, source: "Google Calendar" }) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  const id = String(d?.contact?.id ?? d?.id ?? "");
  if (id) await sb(`contacts?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify({ ghl_id: id }) });
  return id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  /* Google's redirect back */
  if (req.method === "GET") {
    const back = (q: string) => Response.redirect(`${PORTAL_URL}?gcal=${q}#calendar`, 302);
    if (url.searchParams.get("error")) return back("cancelled");
    const st = await readState(url.searchParams.get("state") ?? "");
    const code = url.searchParams.get("code") ?? "";
    if (!st || !code) return back("failed");
    const t = await tokenCall({ grant_type: "authorization_code", code });
    if (!t.refresh_token || !t.access_token) return back("failed");
    if (!String(t.scope ?? "").includes("calendar")) return back("noscope");   // they unticked calendar access
    const probe = await fetch(`${GCAL}?maxResults=1`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
    const link = { owner: st.o, email: clean(probe?.summary, 120), token_enc: await seal(t.refresh_token), tz: validTz(st.z) ? st.z : "America/Los_Angeles",
      status: "connected", error: "", connected_at: new Date().toISOString() };
    await sb("gcal_links?on_conflict=owner", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(link) });
    try { await syncOne(link); } catch { /* the 5-minute run picks it up */ }
    return back("connected");
  }

  let b: Row = {};
  try { b = await req.json(); } catch { /* no body */ }

  if (b.op === "sync") {
    const given = req.headers.get("x-cron-secret") ?? "";
    const want = CRON_SECRET || await vault("mail_cron_secret");
    if (!want || given !== want) return json({ ok: false, error: "forbidden" }, 403);
    if (!G_ID || !G_SECRET) return json({ ok: true, skipped: "not_configured" });
    const links = await rows("gcal_links?status=eq.connected&select=*&limit=200");
    const out: Row[] = [];
    for (const l of links) { try { out.push(await syncOne(l)); } catch (e) { out.push({ owner: l.owner, ok: false, error: String(e).slice(0, 120) }); } }
    return json({ ok: true, accounts: out.length, out });
  }

  const who = await caller(req);
  if (!who) return json({ ok: false, error: "Sign in as the owner or office." }, 401);
  const owner = who.owner;

  if (b.op === "start") {
    if (!G_ID || !G_SECRET) return json({ ok: false, error: "not_configured" });
    const tz = clean(b.tz, 60);
    const q = new URLSearchParams({ client_id: G_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent",
      include_granted_scopes: "true", state: await makeState(owner, validTz(tz) ? tz : "") });
    return json({ ok: true, url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` });
  }
  if (b.op === "status") {
    const l = await one(`gcal_links?owner=eq.${owner}&select=email,status,error,last_sync,tz&limit=1`);
    const ask = l ? (await rows(`gcal_events?owner=eq.${owner}&kind=eq.ask&starts_at=gte.${new Date().toISOString()}&select=id`)).length : 0;
    return json({ ok: true, configured: !!(G_ID && G_SECRET), connected: !!l && l.status === "connected", reconnect: l?.status === "reconnect", email: l?.email ?? "", last_sync: l?.last_sync ?? null, error: l?.error ?? "", tz: l?.tz ?? "", ask });
  }
  if (b.op === "answer") {
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ ok: false, error: "bad id" }, 400);
    const ev = await one(`gcal_events?id=eq.${id}&owner=eq.${owner}&select=*&limit=1`);
    if (!ev) return json({ ok: false, error: "not found" }, 404);
    if (b.appt === true) {
      const cid = clean(b.contact_id, 40);
      const c = UUID.test(cid) ? await one(`contacts?id=eq.${cid}&owner=eq.${owner}&select=id,name&limit=1`) : null;
      if (!c) return json({ ok: false, error: "Pick the customer." }, 400);
      await sb(`gcal_events?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ kind: "appt", contact_id: c.id, contact_name: clean(c.name, 120), ghl_state: "pending", updated_at: new Date().toISOString() }) });
    } else {
      if (ev.kind === "appt" && ev.ghl_appt_id) return json({ ok: false, error: "This one is already a booked appointment. Cancel it in BuilderPro instead." }, 409);
      await sb(`gcal_events?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ kind: "dismissed", contact_id: null, contact_name: "", updated_at: new Date().toISOString() }) });
    }
    // push it to HighLevel now if it's reachable, not in five minutes
    const l = await one(`gcal_links?owner=eq.${owner}&select=*&limit=1`);
    if (l && l.status === "connected") {
      const work = syncOne(l).catch(() => null);
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(work); else await work;
    }
    return json({ ok: true });
  }
  if (b.op === "sync_now") {
    const l = await one(`gcal_links?owner=eq.${owner}&select=*&limit=1`);
    if (!l) return json({ ok: false, error: "not connected" });
    return json(await syncOne(l));
  }
  if (b.op === "disconnect") {
    const l = await one(`gcal_links?owner=eq.${owner}&select=*&limit=1`);
    if (l) {
      try {
        const at = await accessFor(l);
        if (at) {
          // take back what we wrote, then let go of the sign-in
          for (const p of await rows(`gcal_pushed?owner=eq.${owner}&select=google_id&limit=500`)) await fetch(`${GCAL}/${encodeURIComponent(p.google_id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${at}` } }).catch(() => null);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(await unseal(l.token_enc))}`, { method: "POST" }).catch(() => null);
        }
      } catch { /* forget it anyway */ }
    }
    await sb(`gcal_pushed?owner=eq.${owner}`, { method: "DELETE" });
    // the busy blocks we put in HighLevel come out too (when it answers); real
    // appointments they made from Google stay, they're customers' bookings now
    const ghl = await ghlFor(owner).catch(() => null);
    if (ghl) for (const x of await rows(`gcal_events?owner=eq.${owner}&ghl_block_id=neq.&select=ghl_block_id&limit=500`)) await fetch(`${GHL}/calendars/events/${x.ghl_block_id}`, { method: "DELETE", headers: gH(ghl.tok) }).catch(() => null);
    await sb(`gcal_events?owner=eq.${owner}&ghl_appt_id=eq.`, { method: "DELETE" });
    await sb(`gcal_links?owner=eq.${owner}`, { method: "DELETE" });
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
