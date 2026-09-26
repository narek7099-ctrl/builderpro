// mail-connect — connects a contractor's Outlook / Microsoft 365 or Gmail
// inbox and files the lead emails in it (Angi, Thumbtack, HomeAdvisor ...) as
// leads, with nothing to forward and nothing to paste.
//
//   POST { op:"start", provider }  (signed in) -> { ok, url }   Microsoft or Google sign-in page
//   GET  ?code=&state=          the provider's redirect back -> stores the token, 302 to the portal
//   POST { op:"check" }        (signed in) -> checks this account's inbox now
//   POST { op:"disconnect" }   (signed in) -> forgets the token
//   POST { op:"poll" }  + x-cron-secret    -> checks every connected inbox (pg_cron, every 5 min)
//
// What it reads, deliberately narrow. Gmail: it searches only for messages
// FROM the contractor's lead senders, so nothing else is ever returned.
// Outlook (whose API cannot filter by sender domain): it lists the sender of
// messages since the last check and fetches the body only of those whose
// sender matches one of the contractor's lead sources. Each of those is handed to lead-email, exactly as if it had been
// emailed to the source's own address, so there is one reader and one path
// into Contacts. Nothing is marked, moved or deleted in the mailbox.
//
// Deploy:  supabase functions deploy mail-connect --no-verify-jwt
//          (Microsoft's redirect back carries no Supabase JWT)
// Secrets: MS_CLIENT_ID, MS_CLIENT_SECRET   from the Azure app registration (Outlook)
//          GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET  a Google OAuth client (Gmail); falls back to
//                                           GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//          MAIL_TOKEN_KEY, CRON_SECRET      optional: both default to keys kept in Supabase Vault
//          LEAD_EMAIL_SECRET                the same value lead-email uses
//          PORTAL_URL                       where to send people back (default https://builderpro-os.com)
// Redirect URI to register with both Azure and Google: <SUPABASE_URL>/functions/v1/mail-connect
// Gmail's read scope is "restricted": until Google verifies the app, only the
// Google accounts added as test users on the consent screen can connect.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MS_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const MS_SECRET = Deno.env.get("MS_CLIENT_SECRET") ?? "";
let TOKEN_KEY = Deno.env.get("MAIL_TOKEN_KEY") ?? "";
const LEAD_SECRET = Deno.env.get("LEAD_EMAIL_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";
const INBOX_DOMAIN = Deno.env.get("LEAD_INBOX_DOMAIN") ?? "leads.builderpro-os.com";
const G_ID = Deno.env.get("GMAIL_CLIENT_ID") ?? Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const G_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") ?? Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const REDIRECT = `${SB_URL}/functions/v1/mail-connect`;
type Prov = "outlook" | "gmail";
const P: Record<Prov, { auth: string; token: string; scope: string; id: string; secret: string }> = {
  outlook: { auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "offline_access User.Read Mail.Read", id: MS_ID, secret: MS_SECRET },
  gmail: { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/gmail.readonly", id: G_ID, secret: G_SECRET },
};

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
async function makeState(owner: string, prov: Prov) { const p = btoa(JSON.stringify({ o: owner, p: prov, t: Date.now() })); return `${p}.${await hmac(p)}`; }
async function readState(s: string): Promise<{ o: string; p: Prov } | null> {
  const [p, sig] = String(s).split(".");
  if (!p || !sig || (await hmac(p)) !== sig) return null;
  try { const d = JSON.parse(atob(p)); return Date.now() - d.t < 30 * 60 * 1000 && (d.p === "outlook" || d.p === "gmail") ? { o: d.o, p: d.p } : null; } catch { return null; }
}

/* Keys kept in Supabase Vault (migration 20260928000000_mail_connections.sql),
   so nothing has to be pasted into the function's secrets: the token key and
   the scheduler's secret. Readable only with the service role. */
async function vault(name: string): Promise<string> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/mail_vault`, { method: "POST",
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_name: name }) });
  return r.ok ? String((await r.json()) ?? "") : "";
}
async function tokenKey() { if (!TOKEN_KEY) TOKEN_KEY = await vault("mail_token_key"); return TOKEN_KEY; }

/* ---------- the stored token, encrypted at rest ---------- */
async function aesKey() {
  await tokenKey();
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

async function tokenCall(prov: Prov, body: Record<string, string>) {
  const c = P[prov];
  const base: Record<string, string> = { client_id: c.id, client_secret: c.secret, redirect_uri: REDIRECT };
  if (prov === "outlook") base.scope = c.scope;
  const r = await fetch(c.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...base, ...body }) });
  return r.json();
}
function b64u(s: string) { try { return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))); } catch { return ""; } }
/* the html (or text) body out of a Gmail message's parts */
function gmailBody(part: Record<string, unknown>): { html: string; text: string } {
  let html = "", text = "";
  const walk = (p: Record<string, unknown>) => {
    const mt = String(p.mimeType ?? ""), data = String((p.body as { data?: string })?.data ?? "");
    if (data && mt === "text/html" && !html) html = b64u(data);
    if (data && mt === "text/plain" && !text) text = b64u(data);
    for (const c of (p.parts as Record<string, unknown>[] | undefined) ?? []) walk(c);
  };
  walk(part);
  return { html, text };
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
type Conn = { id: string; owner: string; provider: Prov; token_enc: string; last_checked: string | null; found_total: number };
async function checkOne(c: Conn): Promise<{ found: number; error?: string }> {
  const sr = await sb(`lead_sources?owner=eq.${c.owner}&active=eq.true&select=id,vendor,sender_domains,inbox_slug,active`);
  const sources: Src[] = sr.ok ? await sr.json() : [];
  const patch = (o: Record<string, unknown>) => sb(`mail_connections?id=eq.${c.id}`, { method: "PATCH", body: JSON.stringify(o) });
  if (!sources.length) { await patch({ last_checked: new Date().toISOString() }); return { found: 0 }; }

  let refresh = "";
  try { refresh = await unseal(c.token_enc); } catch { await patch({ status: "error", error: "Stored sign-in could not be read. Connect again." }); return { found: 0, error: "token" }; }
  const prov: Prov = c.provider === "gmail" ? "gmail" : "outlook";
  const t = await tokenCall(prov, { grant_type: "refresh_token", refresh_token: refresh });
  if (!t.access_token) {
    await patch({ status: "error", error: (prov === "gmail" ? "Google" : "Microsoft") + " sign-in expired or was revoked. Connect again." });
    return { found: 0, error: "refresh" };
  }
  if (t.refresh_token && t.refresh_token !== refresh) await patch({ token_enc: await seal(t.refresh_token) });
  const H = { Authorization: `Bearer ${t.access_token}` };

  const since = c.last_checked ? new Date(Date.parse(c.last_checked) - 2 * 60 * 1000) : new Date(Date.now() - 24 * 3600 * 1000);
  const started = new Date().toISOString();
  const file = (src: Src, from: string, subject: string, html: string, text: string) =>
    fetch(`${SB_URL}/functions/v1/lead-email?k=${encodeURIComponent(LEAD_SECRET)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: `${src.inbox_slug}@${INBOX_DOMAIN}`, from, subject, html, text }),
    }).catch(() => {});

  if (prov === "gmail") {
    /* Gmail can search by sender, so only lead emails are ever returned */
    const doms = Array.from(new Set(sources.flatMap(domainsOf)));
    if (!doms.length) { await patch({ last_checked: started }); return { found: 0 }; }
    const q = `(${doms.map((d) => "from:" + d).join(" OR ")}) after:${Math.floor(since.getTime() / 1000)}`;
    const G = { Authorization: `Bearer ${t.access_token}` };
    const l = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(q)}`, { headers: G });
    if (!l.ok) { await patch({ status: "error", error: `Gmail answered ${l.status}.` }); return { found: 0, error: "list" }; }
    let found = 0;
    for (const it of ((await l.json()).messages ?? []) as { id: string }[]) {
      const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${it.id}?format=full`, { headers: G });
      if (!m.ok) continue;
      const g = await m.json();
      const hdr = (n: string) => String(((g.payload?.headers ?? []) as { name: string; value: string }[]).find((h) => h.name.toLowerCase() === n)?.value ?? "");
      const from = hdr("from"), addr = (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
      const src = sourceFor(sources, addr);
      if (!src || !src.inbox_slug) continue;
      const body = gmailBody(g.payload ?? {});
      await file(src, from, hdr("subject"), body.html, body.text);
      found++;
    }
    await patch({ status: "connected", error: "", last_checked: started, ...(found ? { last_found: started, found_total: (c.found_total || 0) + found } : {}) });
    return { found };
  }

  // Outlook: headers only, since the last check (the first check looks back a day)
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
    await file(src, m.from?.emailAddress?.name ? `${m.from.emailAddress.name} <${addr}>` : addr, f.subject ?? m.subject ?? "", html, "");
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
    const st = await readState(url.searchParams.get("state") ?? "");
    const code = url.searchParams.get("code") ?? "";
    if (!st || !code) return back("failed");
    const t = await tokenCall(st.p, { grant_type: "authorization_code", code });
    if (!t.refresh_token || !t.access_token) return back("failed");
    const H = { Authorization: `Bearer ${t.access_token}` };
    const email = st.p === "gmail"
      ? await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: H }).then((r) => r.json()).then((d) => d.emailAddress || "").catch(() => "")
      : await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: H }).then((r) => r.json()).then((d) => d.mail || d.userPrincipalName || "").catch(() => "");
    await sb("mail_connections?on_conflict=owner,provider", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ owner: st.o, provider: st.p, email, token_enc: await seal(t.refresh_token), status: "connected", error: "", last_checked: null }),
    });
    return back(st.p + "-connected");
  }

  let b: { op?: string; provider?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }

  if (b.op === "poll") {
    const given = req.headers.get("x-cron-secret") ?? "";
    const want = CRON_SECRET || await vault("mail_cron_secret");
    if (!want || given !== want) return json({ ok: false, error: "forbidden" }, 403);
    const r = await sb("mail_connections?status=eq.connected&select=id,owner,provider,token_enc,last_checked,found_total");
    const conns: Conn[] = r.ok ? await r.json() : [];
    let found = 0;
    for (const c of conns) { try { found += (await checkOne(c)).found; } catch { /* next */ } }
    return json({ ok: true, inboxes: conns.length, found });
  }

  const prov: Prov = b.provider === "gmail" ? "gmail" : "outlook";
  const who = await caller(req);
  if (!who) return json({ ok: false, error: "sign in required" }, 401);

  if (b.op === "start") {
    const c = P[prov];
    if (!c.id || !c.secret || !(await tokenKey())) return json({ ok: false, error: "not_configured", reason: prov === "gmail"
      ? "Gmail connection is not set up on this project yet (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)."
      : "Outlook connection is not set up on this project yet (MS_CLIENT_ID, MS_CLIENT_SECRET)." });
    const u = new URL(c.auth);
    u.searchParams.set("client_id", c.id);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", REDIRECT);
    u.searchParams.set("scope", c.scope);
    u.searchParams.set("state", await makeState(who.owner, prov));
    if (prov === "gmail") { u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); u.searchParams.set("include_granted_scopes", "true"); }
    else { u.searchParams.set("response_mode", "query"); u.searchParams.set("prompt", "select_account"); }
    return json({ ok: true, url: u.toString() });
  }
  if (b.op === "check") {
    const r = await sb(`mail_connections?owner=eq.${who.owner}&status=eq.connected&select=id,owner,provider,token_enc,last_checked,found_total`);
    const cs = (r.ok ? await r.json() : []) as Conn[];
    if (!cs.length) return json({ ok: false, error: "not connected" });
    let found = 0, err = "";
    for (const c of cs) { const o = await checkOne(c); found += o.found; if (o.error) err = o.error; }
    return json({ ok: !err, found, error: err || undefined });
  }
  if (b.op === "disconnect") {
    await sb(`mail_connections?owner=eq.${who.owner}&provider=eq.${prov}`, { method: "DELETE" });
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown op" }, 400);
});
