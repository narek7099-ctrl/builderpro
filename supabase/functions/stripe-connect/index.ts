// stripe-connect — links a contractor's OWN Stripe account to BuilderPro.
//
// Standard Connect, over OAuth. The contractor signs in to Stripe (or creates
// an account) and comes back; we keep the account id they authorised. Every
// charge is then made ON their account, so the money goes from the homeowner
// straight to their bank. We never hold it and we take nothing on top.
//
//   POST { op:"status"  }  -> { ok, connected, account:{...} }   refreshed from Stripe
//   POST { op:"link"    }  -> { ok, url }                        send the browser here
//   POST { op:"disconnect" } -> { ok }                           revokes our access
//   GET  ?code=..&state=..  Stripe's redirect back; stores the account and
//                           bounces to the portal.
//
// The account id is never accepted from the caller: it is read from the
// owner's row, so a caller can only ever act on the account they connected.
//
// Connecting a bank account is the owner's own business, so a team member is
// refused here even though they share the rest of the account.
//
// Deploy:  supabase functions deploy stripe-connect        (Verify JWT OFF —
//          Stripe's redirect arrives without our JWT; the POST ops check it
//          themselves.)
// Secrets: STRIPE_SECRET_KEY        sk_live_… (or sk_test_… while testing)
//          STRIPE_CONNECT_CLIENT_ID ca_…      Stripe → Settings → Connect → Platform
//          STRIPE_STATE_SECRET      any long random string
//          PORTAL_RETURN_URL        https://builderpro-os.com/
// In Stripe, add this function's URL as an OAuth redirect URI:
//          https://<project>.supabase.co/functions/v1/stripe-connect

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const CLIENT_ID = Deno.env.get("STRIPE_CONNECT_CLIENT_ID") ?? "";
const STATE_SECRET = Deno.env.get("STRIPE_STATE_SECRET") || SB_SERVICE;
const RETURN_URL = Deno.env.get("PORTAL_RETURN_URL") || "https://builderpro-os.com/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- supabase ---------- */
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...sbH, Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/* ---------- who is calling ---------- */
async function userFromJwt(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}
/* a team member works on someone else's account; payouts are not theirs to set */
async function isTeamMember(id: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    return !!rows?.[0]?.owner;
  } catch { return false; }
}

/* ---------- state: signed and short-lived, so the callback cannot be forged ---------- */
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
}
async function signState(owner: string): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ o: owner, e: Date.now() + 15 * 60_000 })));
  return `${body}.${await hmac(body)}`;
}
async function readState(state: string): Promise<string> {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return "";
  const expect = await hmac(body);
  // constant-time enough: compare fixed-length digests
  if (sig.length !== expect.length) return "";
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return "";
  try {
    const p = JSON.parse(unb64url(body));
    return p?.e > Date.now() ? String(p.o || "") : "";
  } catch { return ""; }
}

/* ---------- stripe ---------- */
async function stripe(path: string, opts: { method?: string; body?: Record<string, string>; base?: string } = {}) {
  const base = opts.base ?? "https://api.stripe.com";
  const r = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: opts.body ? new URLSearchParams(opts.body).toString() : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out?.error?.error_description || out?.error?.message || `stripe ${r.status}`);
  return out;
}

type Row = {
  owner: string; account_id: string; livemode: boolean; charges_enabled: boolean; payouts_enabled: boolean;
  details_submitted: boolean; requirements_due: string; business_name: string; country: string; currency: string;
  connected_at: string | null; disconnected_at: string | null;
};

async function rowFor(owner: string): Promise<Row | null> {
  const rows = await rest(`stripe_accounts?owner=eq.${owner}&select=*&limit=1`);
  return rows?.[0] ?? null;
}

/* Ask Stripe what the account can actually do. A connected account that has
   not finished onboarding can be linked but unable to take a card yet, and
   the contractor needs to be told which. */
async function refresh(owner: string, accountId: string) {
  const a = await stripe(`/v1/accounts/${encodeURIComponent(accountId)}`);
  const due: string[] = [
    ...(a?.requirements?.currently_due ?? []),
    ...(a?.requirements?.past_due ?? []),
  ];
  const patch = {
    charges_enabled: !!a?.charges_enabled,
    payouts_enabled: !!a?.payouts_enabled,
    details_submitted: !!a?.details_submitted,
    requirements_due: due.slice(0, 12).join(","),
    business_name: a?.business_profile?.name || a?.settings?.dashboard?.display_name || "",
    country: a?.country || "",
    currency: a?.default_currency || "usd",
    checked_at: new Date().toISOString(),
  };
  await rest(`stripe_accounts?owner=eq.${owner}`, { method: "PATCH", body: JSON.stringify(patch) });
  return patch;
}

const shape = (r: Row | null, extra: Record<string, unknown> = {}) => !r || !r.account_id ? null : {
  account_id: r.account_id,
  last4: r.account_id.slice(-4),
  livemode: r.livemode,
  charges_enabled: r.charges_enabled,
  payouts_enabled: r.payouts_enabled,
  details_submitted: r.details_submitted,
  requirements_due: r.requirements_due ? r.requirements_due.split(",").filter(Boolean) : [],
  business_name: r.business_name,
  country: r.country,
  currency: r.currency,
  connected_at: r.connected_at,
  ...extra,
};

/* ---------- the callback Stripe sends the contractor back to ---------- */
function bounce(status: string, detail = "") {
  const u = new URL(RETURN_URL);
  u.hash = `payouts=${status}${detail ? `&d=${encodeURIComponent(detail.slice(0, 120))}` : ""}`;
  return new Response(null, { status: 302, headers: { ...CORS, Location: u.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  /* Stripe's redirect: ?code & state, or ?error when the contractor backed out */
  if (req.method === "GET") {
    const qs = new URL(req.url).searchParams;
    if (qs.get("error")) return bounce("denied", qs.get("error_description") ?? "");
    const code = qs.get("code") ?? "";
    const owner = await readState(qs.get("state") ?? "");
    if (!code || !owner) return bounce("error", "That link expired. Start again from Payouts.");
    try {
      const tok = await stripe("/oauth/token", {
        method: "POST", base: "https://connect.stripe.com",
        body: { grant_type: "authorization_code", code, client_secret: SK },
      });
      const accountId = String(tok?.stripe_user_id ?? "");
      if (!accountId) return bounce("error", "Stripe did not return an account.");
      await rest("stripe_accounts", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({
          owner, account_id: accountId, livemode: !!tok?.livemode,
          connected_at: new Date().toISOString(), disconnected_at: null,
        }),
      });
      try { await refresh(owner, accountId); } catch { /* the link stands even if the lookup hiccups */ }
      return bounce("connected");
    } catch (e) {
      return bounce("error", String((e as Error)?.message ?? e));
    }
  }

  let b: { op?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }

  const user = await userFromJwt(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);
  if (await isTeamMember(user.id)) {
    return json({ ok: false, error: "Only the account owner can set up payouts." }, 403);
  }
  if (!SK || !CLIENT_ID) return json({ ok: false, reason: "not_configured" });

  const owner = user.id;

  if (b.op === "link") {
    const u = new URL("https://connect.stripe.com/oauth/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", CLIENT_ID);
    u.searchParams.set("scope", "read_write");
    u.searchParams.set("state", await signState(owner));
    u.searchParams.set("stripe_user[email]", user.email || "");
    return json({ ok: true, url: u.toString() });
  }

  if (b.op === "status") {
    const row = await rowFor(owner);
    if (!row?.account_id) return json({ ok: true, connected: false, account: null });
    let extra = {};
    try { extra = await refresh(owner, row.account_id); } catch { /* show what we have */ }
    return json({ ok: true, connected: true, account: shape({ ...row, ...extra } as Row) });
  }

  if (b.op === "disconnect") {
    const row = await rowFor(owner);
    if (row?.account_id) {
      try {
        await stripe("/oauth/deauthorize", {
          method: "POST", base: "https://connect.stripe.com",
          body: { client_id: CLIENT_ID, stripe_user_id: row.account_id },
        });
      } catch { /* already revoked on Stripe's side; clear ours regardless */ }
      await rest(`stripe_accounts?owner=eq.${owner}`, {
        method: "PATCH",
        body: JSON.stringify({
          account_id: "", charges_enabled: false, payouts_enabled: false, details_submitted: false,
          requirements_due: "", disconnected_at: new Date().toISOString(),
        }),
      });
    }
    return json({ ok: true, connected: false });
  }

  return json({ ok: false, error: "op: status | link | disconnect" }, 400);
});
