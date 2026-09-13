// contract-sign — the public half of contracts + e-signature.
//
// The homeowner's signing page is unauthenticated, so it never touches the
// contracts table directly. It calls here with an unguessable token and we do
// the reading and writing with the service role, exposing exactly one contract
// and never the owner's other data.
//
// Public (no auth, token is the credential):
//   { op:"get",     token }            -> the contract as the signer should see it
//   { op:"sign",    token, signer_name, signer_email, signature, kind, consent }
//   { op:"decline", token, note }
//
// Owner (Authorization: Bearer <client JWT>):
//   { op:"send",  id }                 -> marks sent and returns the signing link
//   { op:"void",  id }
//
// What this records for ESIGN / UETA: the exact document text shown, explicit
// consent to sign electronically, the signature, and an audit trail of every
// event with IP and user agent. It does NOT make a bad contract enforceable —
// the contractor's template should still be reviewed by their own lawyer.
//
// Deploy:  supabase functions deploy contract-sign --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injected), PORTAL_URL.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PORTAL_URL = Deno.env.get("PORTAL_URL") ?? "https://builderpro-os.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
type Row = Record<string, unknown>;

const clientIp = (req: Request) =>
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
  req.headers.get("cf-connecting-ip") || "";
const agentOf = (req: Request) => (req.headers.get("user-agent") ?? "").slice(0, 300);

async function byToken(token: string): Promise<Row | null> {
  if (!token || !/^[a-f0-9]{20,64}$/i.test(token)) return null;
  const r = await fetch(`${SB_URL}/rest/v1/contracts?token=eq.${encodeURIComponent(token)}&select=*&limit=1`, { headers: sbH });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] as Row : null;
}
async function patch(id: unknown, body: Row) {
  await fetch(`${SB_URL}/rest/v1/contracts?id=eq.${id}`, { method: "PATCH", headers: sbH, body: JSON.stringify(body) });
}
const trail = (row: Row, event: string, req: Request) =>
  ([...(row.audit as Row[] ?? []), { at: new Date().toISOString(), event, ip: clientIp(req), agent: agentOf(req) }]).slice(-40);

// only what the signer needs — never the owner id, token or internal columns
const forSigner = (r: Row) => ({
  title: r.title, body: r.body, scope: r.scope, amount: r.amount, deposit: r.deposit,
  start_note: r.start_note, address: r.address,
  customer_name: r.customer_name, customer_email: r.customer_email,
  status: r.status, signed_at: r.signed_at, signer_name: r.signer_name,
  signature: r.signature, declined_at: r.declined_at,
});

async function userFromJwt(jwt: string): Promise<{ id: string } | null> {
  if (!jwt) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id } : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "missing secrets" }, 500);

  let b: Record<string, string>;
  try { b = await req.json(); } catch { return json({ ok: false, error: "invalid JSON" }, 400); }

  // ---------------- public, token-scoped ----------------
  if (b.op === "get") {
    const row = await byToken(b.token);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    if (row.status === "void") return json({ ok: false, error: "void" }, 410);
    // first open marks it viewed, so the contractor can see it landed
    if (row.status === "sent") {
      await patch(row.id, { status: "viewed", viewed_at: new Date().toISOString(), audit: trail(row, "viewed", req) });
      row.status = "viewed";
    }
    return json({ ok: true, contract: forSigner(row) });
  }

  if (b.op === "sign") {
    const row = await byToken(b.token);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    if (row.status === "void") return json({ ok: false, error: "This agreement is no longer available." }, 410);
    if (row.status === "signed") return json({ ok: true, already: true, contract: forSigner(row) });

    const name = String(b.signer_name ?? "").trim();
    const sig = String(b.signature ?? "");
    const kind = b.kind === "typed" ? "typed" : "drawn";
    if (name.length < 2) return json({ ok: false, error: "Please type your full legal name." });
    if (b.consent !== true) return json({ ok: false, error: "Please tick the box agreeing to sign electronically." });
    if (!sig || !/^data:image\/png;base64,/.test(sig) || sig.length > 400000) {
      return json({ ok: false, error: "Please add your signature." });
    }

    const now = new Date().toISOString();
    await patch(row.id, {
      status: "signed", signed_at: now, signer_name: name,
      signer_email: String(b.signer_email ?? "").trim() || null,
      signature: sig, signature_kind: kind, consent: true,
      signer_ip: clientIp(req), signer_agent: agentOf(req),
      audit: trail(row, "signed as " + name, req),
    });
    const fresh = await byToken(b.token);
    return json({ ok: true, contract: fresh ? forSigner(fresh) : null });
  }

  if (b.op === "decline") {
    const row = await byToken(b.token);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    if (row.status === "signed") return json({ ok: false, error: "Already signed." });
    await patch(row.id, {
      status: "declined", declined_at: new Date().toISOString(),
      decline_note: String(b.note ?? "").slice(0, 500),
      audit: trail(row, "declined", req),
    });
    return json({ ok: true });
  }

  // ---------------- owner ----------------
  const user = await userFromJwt((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  const own = async (id: string) => {
    const r = await fetch(`${SB_URL}/rest/v1/contracts?id=eq.${encodeURIComponent(id)}&owner=eq.${user.id}&select=*&limit=1`, { headers: sbH });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length ? rows[0] as Row : null;
  };

  if (b.op === "send") {
    const row = await own(b.id);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    if (row.status === "signed") return json({ ok: false, error: "Already signed." });
    await patch(row.id, {
      status: row.status === "viewed" ? "viewed" : "sent",
      sent_at: new Date().toISOString(),
      audit: trail(row, "sent", req),
    });
    return json({ ok: true, link: `${PORTAL_URL}#sign=${row.token}` });
  }

  if (b.op === "void") {
    const row = await own(b.id);
    if (!row) return json({ ok: false, error: "not_found" }, 404);
    await patch(row.id, { status: "void", audit: trail(row, "voided", req) });
    return json({ ok: true });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
