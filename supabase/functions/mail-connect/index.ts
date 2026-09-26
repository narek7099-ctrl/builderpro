// mail-connect — connects a contractor's Outlook / Microsoft 365 inbox and
// files the lead emails in it (Angi, Thumbtack, HomeAdvisor ...) as leads,
// with nothing to forward and nothing to paste.
//
//   POST { op:"start" }        (signed in) -> { ok, url }   Microsoft sign-in page
//   GET  ?code=&state=          Microsoft's redirect back   -> stores the token, 302 to the portal
//   POST { op:"check" }        (signed in) -> checks this account's inbox now
//   POST { op:"disconnect" }   (signed in) -> forgets the token
//   POST { op:"poll" }  + x-cron-secret    -> checks every connected inbox (pg_cron, every 5 min)
//
// What it reads, deliberately narrow: every few minutes it lists the SENDER
// and subject of messages that arrived since the last check, and fetches the
// body only of those whose sender matches one of the contractor's lead
// sources. Each of those is handed to lead-email, exactly as if it had been
// emailed to the source's own address, so there is one reader and one path
// into Contacts. Nothing is marked, moved or deleted in the mailbox.
//
// Deploy:  supabase functions deploy mail-connect --no-verify-jwt
//          (Microsoft's redirect back carries no Supabase JWT)
// Secrets: MS_CLIENT_ID, MS_CLIENT_SECRET   from the Azure app registration
//          MAIL_TOKEN_KEY                   any long random string; encrypts stored tokens
//          LEAD_EMAIL_SECRET                the same value lead-email uses
//          CRON_SECRET                      the same value the social scheduler uses
//          PORTAL_URL                       where to send people back (default https://builderpro-os.com)
// Azure redirect URI to register: <SUPABASE_URL>/functions/v1/mail-connect

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MS_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const MS_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
const TOKEN_KEY = Deno.env.get("MAIL_TOKEN_KEY") ?? "";
const LEAD_SECRET = Deno.env.get("LEAD_EMAIL_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";
const INBOX_DOMAIN = Deno.env.get("LEAD_INBOX_DOMAIN") ?? "leads.builderpro-os.com";
const REDIRECT = `${SB_URL}/functions/v1/mail-connect`;
const SCOPE = "offline_access User.Read Mail.Read";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });

/* ---------- who is asking, and whose account they work in ---------- */
async function caller(req: Request): Promise<{ id: string; owner: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user?.id) return null;
  // bp_owner(): a team member works in their owner's account
  const o = await fetch(`${SB_URL}/rest/v1/rpc/bp_owner`, { method: "POST", headers: { apikey: SB_ANON, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  const owner = o.ok ? await o.json().catch(() => null) : null;
  return { id: user.id, owner: typeof owner === "string" && owner ? owner : user.id };
}

/* ---------- signed state, so the redirect back can be trusted ---------- */
async function hmac(s: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SB_SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(s))))).replace(/[+/=]/g, "");
}
async function makeState(owner: string) { const p = btoa(JSON.stringify({ o: owner, t: Date.now() })); return `${p}.${await hmac(p)}`; }
async function readState(s: string): Promise<string | null> {
  const [p, sig] = String(s).split(".");
  if (!p || !sig || (await hmac(p)) !== sig) return null;
  try { const d = JSON.parse(atob(p)); return Date.now() - d.t < 30 * 60 * 1000 ? d.o : null; } catch { return null; }
}

/* ---------- the stored token, encrypted at rest ---------- */
async function aesKey() {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_KEY));
  return crypto.subtle.importKey("raw", h, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(t: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(t)));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  return btoa(String.fromCharCode(...all));
}
async function unseal(s: string) {
  const all = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aesKey(), all.slice(12));
  return new TextDecoder().decode(pt);
}

async function tokenCall(body: Record<string, string>) {
  const r = await fetch(`${AUTH}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_ID, client_secret: MS_SECRET, redirect_uri: REDIRECT, scope: SCOPE, ...body }),
  });
  return r.json();
}

/* ---------- which senders are lead sources ----------
   The platforms' own sending domains (kept in step with portal/lead-senders.js)
   plus whatever the contractor typed on each source. A sender that matches
   nothing is never opened. */
const VENDOR_SENDERS: Record<string, string[]> = {
  angi: ["angi.com", "angieslist.com", "emails.angi.com", "leads.angi.com"],
  homeadvisor: ["homeadvisor.com", "emails.homeadvisor.com"],
  thumbtack: ["thumbtack.com", "email.thumbtack.com"],
  networx: ["networx.com", "networxsystems.com"],
  modernize: ["modernize.com", "email.modernize.com"],
};
type Src = { id: string; vendor: string; sender_domains: string; inbox_slug: string; active: boolean };
function domainsOf(s: Src) {
  return (VENDOR_SENDERS[s.vendor] ?? []).concat(String(s.sender_domains || "").split(/[\s,;]+/))
    .map((d) => d.trim().toLowerCase().replace(/^.*@/, "")).filter((d) => d.includes("."));
}
function sourceFor(sources: Src[], address: string): Src | null {
  const dom = String(address || "").toLowerCase().replace(/^.*@/, "");
  for (const s of sources) for (const d of domainsOf(s)) if (dom === d || dom.endsWith("." + d)) return s;
  return null;
}

/* ---------- checking one inbox ---------- */
type Conn = { id: string; owner: string; token_enc: string; last_checked: string | null; found_total: number };
async function checkOne(c: Conn): Promise<{ found: number; error?: string }> {
  const sr = await sb(`lead_sources?owner=eq.${c.owner}&active=eq.true&select=id,vendor,sender_domains,inbox_slug,active`);
  const sources: Src[] = sr.ok ? await sr.json() : [];
  const patch = (o: Record<string, unknown>) => sb(`mail_connections?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(o) });
  if (!sources.length) { await patch({ last_checked: new Date().toISOString() }); return { found: 0 }; }

  let refresh = "";
  try { refresh = await unseal(c.token_enc); } catch { await patch({ status: "error", error: "Stored sign-in could not be read. Connect again." }); return { found: 0, error: "token" }; }
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: refresh });
  if (!t.access_token) {
    await patch({ status: "error", error: "Microsoft sign-in expired or was revoked. Connect again." });
    return { found: 0, error: "refresh" };
  }
  if (t.refresh_token && t.refresh_token !== refresh) await patch({ token_enc: await seal(t.refresh_token) });
  const H = { Authorization: `Bearer ${t.access_token}` };

  // headers only, since the last check (the first check looks back a day)
  const since = c.last_checked ? new Date(Date.parse(c.last_checked) - 2 * 60 * 1000) : new Date(Date.now() - 24 * 3600 * 1000);
  const started = new Date().toISOString();
  const list = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=id,from,subject,receivedDateTime&$top=50&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${since.toISOString()}`, { headers: H });
  if (!list.ok) { await patch({ status: "error", error: `Outlook answered ${list.status}.` }); return { found: 0, error: "list" }; }
  const msgs = ((await list.json()).value ?? []) as { id: string; from?: { emailAddress?: { address?: string; name?: string } }; subject?: string }[];

  let found = 0;
  for (const m of msgs) {
    const addr = m.from?.emailAddress?.address ?? "";
    const src = sourceFor(sources, addr);
    if (!src || !src.inbox_slug) continue;              // not a lead sender: never opened
    const full = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${m.id}?$select=body,subject,from`, { headers: { ...H, Prefer: 'outlook.body-content-type="html"' } });
    if (!full.ok) continue;
    const f = await full.json();
    const html = String(f?.body?.content ?? "");
    // into the one reader, as if it had arrived at the source's own address
    await fetch(`${SB_URL}/functions/v1/lead-email?k=${encodeURIComponent(LEAD_SECRET)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: `${src.inbox_slug}@${INBOX_DOMAIN}`, from: m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${addr}>` : addr, subject: f.subject ?? m.subject ?? "", html }),
    }).catch(() => {});
    found++;
  }
  await patch({ status: "connected", error: "", last_checked: started, ...(found ? { last_found: started, found_total: (c.found_total || 0) + found } : {}) });
  return { found };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  /* Microsoft's redirect back */
  if (req.method === "GET") {
    const back = (q: string) => Response.redirect(`${PORTAL_URL}?mail=${q}#leadsources`, 302);
    if (url.searchParams.get("error")) return back("cancelled");
    const owner = await readState(url.searchParams.get("state") ?? "");
    const code = url.searchParams.get("code") ?? "";
    if (!owner || !code) return back("failed");
    const t = await tokenCall({ grant_type: "authorization_code", code });
    if (!t.refresh_token || !t.access_token) return back("failed");
    const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
    await sb("mail_connections?on_conflict=owner,provider", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ owner, provider: "outlook", email: me.mail || me.userPrincipalName || "", token_enc: await seal(t.refresh_token), status: "connected", error: "", last_checked: null }),
    });
    return back("connected");
  }

  let b: { op?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }

  if (b.op === "poll") {
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ ok: false, error: "forbidden" }, 403);
    const r = await sb("mail_connections?status=eq.connected&select=id,owner,token_enc,last_checked,found_total");
    const conns: Conn[] = r.ok ? await r.json() : [];
    let found = 0;
    for (const c of conns) { try { found += (await checkOne(c)).found; } catch { /* next */ } }
    return json({ ok: true, inboxes: conns.length, found });
  }

  if (!MS_ID || !MS_SECRET || !TOKEN_KEY) return json({ ok: false, error: "not_configured", reason: "Outlook connection is not set up on this project yet (MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_TOKEN_KEY)." });
  const who = await caller(req);
  if (!who) return json({ ok: false, error: "sign in required" }, 401);

  if (b.op === "start") {
    const u = new URL(`${AUTH}/authorize`);
    u.searchParams.set("client_id", MS_ID);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", REDIRECT);
    u.searchParams.set("response_mode", "query");
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("prompt", "select_account");
    u.searchParams.set("state", await makeState(who.owner));
    return json({ ok: true, url: u.toString() });
  }
  if (b.op === "check") {
    const r = await sb(`mail_connections?owner=eq.${who.owner}&select=id,owner,token_enc,last_checked,found_total`);
    const c = (r.ok ? await r.json() : [])[0] as Conn | undefined;
    if (!c) return json({ ok: false, error: "not connected" });
    const out = await checkOne(c);
    return json({ ok: !out.error, found: out.found, error: out.error });
  }
  if (b.op === "disconnect") {
    await sb(`mail_connections?owner=eq.${who.owner}`, { method: "DELETE" });
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
