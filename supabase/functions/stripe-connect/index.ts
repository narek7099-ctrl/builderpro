// NOT IN USE. Invoices are raised in the sub-account and charged through the
// Stripe connected there, so this is not wired to anything and should not be
// deployed. Kept because it is finished and ready if invoicing ever moves
// in-house; the Payouts page walks the contractor through the sub-account
// connection instead. See supabase/migrations/20260920000000_stripe_connect.sql.
//
// stripe-connect — links a contractor's OWN Stripe account to BuilderPro.
//
// Standard Connect, onboarded with Account Links. We create the connected
// account through the API and hand the contractor a one-time Stripe link to
// finish it; if they already have a Stripe account they sign in to it during
// that flow. Every charge is then made ON their account, so the money goes
// from the homeowner straight to their bank. We never hold it and we take
// nothing on top.
//
//   POST { op:"status" }      -> { ok, connected, account:{...} }  refreshed from Stripe
//   POST { op:"link" }        -> { ok, url }                       send the browser here
//   POST { op:"disconnect" }  -> { ok }                            we stop using it
//
// Account Links rather than OAuth on purpose: OAuth needs a Connect client id
// and registered redirect URIs, and this needs neither. Coming back from
// Stripe proves nothing on its own, so the portal always re-reads the real
// state with op:"status" rather than trusting the return trip.
//
// The account id is never accepted from the caller: it is read from the
// owner's row, so a caller can only ever act on the account they connected.
//
// Connecting a bank account is the owner's own business, so a team member is
// refused here even though they share the rest of the account.
//
// Deploy:  supabase functions deploy stripe-connect
// Secrets: STRIPE_SECRET_KEY   sk_live_… (or sk_test_… while testing)
//          PORTAL_RETURN_URL   https://builderpro-os.com/
// In Stripe you only need Connect switched on. There is no client id to find
// and no redirect URI to register.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SK = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const RETURN_URL = Deno.env.get("PORTAL_RETURN_URL") || "https://builderpro-os.com/";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

/* ---------- stripe ---------- */
async function stripe(path: string, opts: { method?: string; body?: Record<string, string> } = {}) {
  const r = await fetch(`https://api.stripe.com${path}`, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: opts.body ? new URLSearchParams(opts.body).toString() : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out?.error?.message || `stripe ${r.status}`);
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

/* Ask Stripe what the account can actually do. An account that has been
   created but not finished can be linked yet unable to take a card, and the
   contractor needs to be told which. */
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
    livemode: !!a?.livemode,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let b: { op?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }

  const user = await userFromJwt(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);
  if (await isTeamMember(user.id)) {
    return json({ ok: false, error: "Only the account owner can set up payouts." }, 403);
  }
  if (!SK) return json({ ok: false, reason: "not_configured" });

  const owner = user.id;

  try {
    if (b.op === "link") {
      let row = await rowFor(owner);
      let accountId = String(row?.account_id ?? "");

      /* first time through: make the account, and remember it before sending
         them anywhere, so a dropped connection cannot orphan it */
      if (!accountId) {
        const acct = await stripe("/v1/accounts", {
          method: "POST",
          body: {
            type: "standard",
            email: user.email || "",
            "business_profile[product_description]": "Home improvement and contracting services",
          },
        });
        accountId = String(acct?.id ?? "");
        if (!accountId) return json({ ok: false, error: "Stripe did not return an account." });
        await rest("stripe_accounts", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            owner, account_id: accountId, livemode: !!acct?.livemode,
            connected_at: new Date().toISOString(), disconnected_at: null,
          }),
        });
      }

      /* A link is single use and short lived. refresh_url is where Stripe
         sends them if it expires before they finish; the portal just asks
         them to tap Connect again, which mints a fresh one. */
      const link = await stripe("/v1/account_links", {
        method: "POST",
        body: {
          account: accountId,
          type: "account_onboarding",
          refresh_url: `${RETURN_URL}#payouts=refresh`,
          return_url: `${RETURN_URL}#payouts=connected`,
        },
      });
      return json({ ok: true, url: String(link?.url ?? "") });
    }

    if (b.op === "status") {
      const row = await rowFor(owner);
      if (!row?.account_id) return json({ ok: true, connected: false, account: null });
      let extra = {};
      try { extra = await refresh(owner, row.account_id); } catch { /* show what we have */ }
      return json({ ok: true, connected: true, account: shape({ ...row, ...extra } as Row) });
    }

    if (b.op === "disconnect") {
      /* We stop using the account; we do not delete it. It is theirs, it may
         hold a balance, and the money already taken belongs to them. */
      await rest(`stripe_accounts?owner=eq.${owner}`, {
        method: "PATCH",
        body: JSON.stringify({
          account_id: "", charges_enabled: false, payouts_enabled: false, details_submitted: false,
          requirements_due: "", disconnected_at: new Date().toISOString(),
        }),
      });
      return json({ ok: true, connected: false });
    }
  } catch (e) {
    return json({ ok: false, reason: "stripe", detail: String((e as Error)?.message ?? e) });
  }

  return json({ ok: false, error: "op: status | link | disconnect" }, 400);
});
