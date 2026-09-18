// supply-sync — refreshes a supplier's stock and contractor pricing from a
// partner feed. The portal does everything else (price books, sourcing,
// purchase orders, reconciliation) directly against the tables under RLS;
// this function exists for the one thing a browser cannot do: hold a
// supplier API credential and pull a live feed.
//
//   { op:"sync", supplierId }   -> pulls the adapter for that supplier's
//                                  connection.provider and upserts items
//   { op:"providers" }          -> which adapters this deployment carries
//
// Adapters: each partner feed is an object with pull(conn, items) that
// returns [{sku,name,category,unit,price,list_price,stock}]. Distributor
// APIs (Ferguson, ABC, SRS, Home Depot Pro) are partner-gated; add an
// adapter here once an agreement and credential exist. "demo" ships so
// the live-stock UI can be exercised end to end before that.
//
// Deploy: supabase functions deploy supply-sync

type Item = { sku: string; name: string; category?: string; unit?: string; price: number; list_price?: number | null; stock?: number | null };
type Conn = { type: string; provider?: string; account?: string; key?: string; [k: string]: unknown };
type Adapter = { label: string; live: boolean; pull: (conn: Conn, existing: Item[]) => Promise<Item[]> };

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* ---------- adapters ---------- */
const ADAPTERS: Record<string, Adapter> = {
  demo: {
    label: "Demo feed",
    live: false,
    // Re-rolls stock on the supplier's existing price book so the portal can
    // show "in stock / low / out" states and a fresh timestamp.
    pull: async (_conn, existing) => existing.map((it, i) => {
      const seed = (it.sku.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + Date.now() / 3.6e6) | 0;
      const roll = (seed * 9301 + 49297 + i * 7) % 233280 / 233280;
      const stock = roll < 0.08 ? 0 : roll < 0.22 ? Math.floor(roll * 20) : Math.floor(20 + roll * 400);
      return { ...it, stock };
    }),
  },
  // ferguson: { label: "Ferguson", live: true, pull: async (conn) => { ... } },
  // abc:      { label: "ABC Supply", live: true, pull: async (conn) => { ... } },
};

/* ---------- db ---------- */
async function rest(path: string, init: RequestInit = {}, token = SB_SERVICE) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function userFromJwt(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id } : null;
}


/* A team member works on their owner's account. After auth, swap the caller
   for the owner they belong to (and the owner's email where a lookup is by
   email), so everything downstream reads and writes the right rows. */
async function effectiveOwner(id: string, email?: string): Promise<{ id: string; email: string }> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner,owner_email&limit=1`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
    const rows = r.ok ? await r.json() : [];
    if (rows?.[0]?.owner) return { id: rows[0].owner, email: rows[0].owner_email || email || "" };
  } catch { /* fall through */ }
  return { id, email: email ?? "" };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: { op?: string; supplierId?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }

  if (b.op === "providers") {
    return json({ ok: true, providers: Object.entries(ADAPTERS).map(([k, a]) => ({ key: k, label: a.label, live: a.live })) });
  }

  const user0 = await userFromJwt(req);
  const user = user0 ? await effectiveOwner(user0.id) : null;
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  if (b.op === "sync") {
    const [sup] = await rest(`suppliers?id=eq.${b.supplierId}&owner=eq.${user.id}&select=*`);
    if (!sup) return json({ ok: false, error: "supplier not found" }, 404);
    const conn: Conn = sup.connection ?? { type: "pricebook" };
    if (conn.type !== "api") return json({ ok: false, error: "not_api", reason: "This supplier is a price book, not a live feed." });
    const adapter = ADAPTERS[String(conn.provider ?? "")];
    if (!adapter) return json({ ok: false, error: "no_adapter", reason: `No adapter for "${conn.provider}" in this deployment.` });

    const existing: Item[] = await rest(`supplier_items?supplier_id=eq.${sup.id}&owner=eq.${user.id}&select=sku,name,category,unit,price,list_price,stock`);
    let items: Item[];
    try { items = await adapter.pull(conn, existing); }
    catch (e) { return json({ ok: false, error: "feed_failed", reason: String((e as Error).message ?? e) }); }

    const now = new Date().toISOString();
    const rows = items.filter((it) => it.sku && it.name).map((it) => ({
      owner: user.id, supplier_id: sup.id, sku: it.sku, name: it.name, category: it.category ?? "", unit: it.unit ?? "ea",
      price: Number(it.price) || 0, list_price: it.list_price ?? null, stock: it.stock ?? null, stock_at: now,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await rest(`supplier_items?on_conflict=supplier_id,sku`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows.slice(i, i + 500)) });
    }
    await rest(`suppliers?id=eq.${sup.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ connection: { ...conn, last_sync: now, last_count: rows.length } }) });
    return json({ ok: true, count: rows.length, synced_at: now, live: adapter.live });
  }

  return json({ ok: false, error: "unknown op" }, 400);
});
