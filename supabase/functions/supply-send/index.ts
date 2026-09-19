// supply-send — emails a purchase order to the supply house's contractor desk.
//
//   { op:"send", poId, company:{name,phone,address,email} }
//     -> { ok:true, to, at }                    the branch has it, contractor cc'd
//     -> { ok:false, reason:"no_email" }        the supplier row has no desk email
//     -> { ok:false, reason:"no_mailer" }       RESEND_API_KEY is not set on this deployment
//     -> { ok:false, reason:"mailer", detail }  the mail service refused it
//
// The portal keeps working without this function: when it answers no_mailer
// the portal opens the contractor's own mail app with the same text. When
// it answers ok, the order is stamped sent_to_supplier with who and when.
//
// Mail goes out through Resend (https://resend.com). Setup, once:
//   1. verify the sending domain in Resend (builderpro-os.com) and add its DNS records
//   2. supabase secrets set RESEND_API_KEY=re_... SUPPLY_FROM="BuilderPro Orders <orders@builderpro-os.com>"
//   3. supabase functions deploy supply-send
//
// The recipient is always read from the supplier row on the server, never
// from the request, so a caller can only send an order to the branch it
// already belongs to.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("SUPPLY_FROM") || "BuilderPro Orders <orders@builderpro-os.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Line = { sku?: string; name: string; qty: number; unit?: string; price: number | null; tbc?: boolean };
type PO = { id: string; owner: string; po_number: string; supplier_id: string | null; lines: Line[]; subtotal: number; fees: number; total: number; fulfil: string; job_name: string; notes: string };
type Supplier = { id: string; name: string; branch: string; address: string; account_no: string; email: string };
type Company = { name?: string; phone?: string; address?: string; email?: string };

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function userFromJwt(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

/* A team member works on their owner's account: swap the caller for the owner. */
async function effectiveOwner(id: string, email?: string): Promise<{ id: string; email: string }> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/team_members?member=eq.${id}&accepted_at=not.is.null&select=owner,owner_email&limit=1`, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
    const rows = r.ok ? await r.json() : [];
    if (rows?.[0]?.owner) return { id: rows[0].owner, email: rows[0].owner_email || email || "" };
  } catch { /* fall through */ }
  return { id, email: email ?? "" };
}

const money = (n: number | null | undefined) => n == null ? "" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/* one order, two renderings: plain text for the desk that reads mail on a
   phone, html for the one that prints it */
function render(po: PO, s: Supplier, co: Company) {
  const deliver = po.fulfil === "delivery";
  const tbc = po.lines.filter((l) => l.tbc || l.price == null);
  const priced = po.lines.filter((l) => !(l.tbc || l.price == null));
  const where = deliver ? (co.address ? `Deliver to: ${co.address}` : "Please deliver.") : "Will-call pickup. Our tech will present this PO number at the counter.";
  const lineTxt = (l: Line) => `${l.qty} x ${l.name}${l.sku ? ` [${l.sku}]` : ""}${l.tbc || l.price == null ? "  (price at our account rate)" : `  @ ${money(l.price)}`}`;
  const text = [
    `PURCHASE ORDER ${po.po_number}`,
    `From: ${co.name || "Our company"}${co.phone ? `, ${co.phone}` : ""}${co.email ? `, ${co.email}` : ""}`,
    `To: ${s.name}${s.branch ? `, ${s.branch}` : ""}${s.account_no ? `\nAccount: ${s.account_no}` : ""}${po.job_name ? `\nJob: ${po.job_name}` : ""}`,
    "",
    ...po.lines.map(lineTxt),
    "",
    priced.length ? `Priced lines ${money(po.subtotal)}${po.fees ? `\nDelivery ${money(po.fees)}` : ""}` : "",
    tbc.length ? `${tbc.length} line${tbc.length === 1 ? "" : "s"} marked "price at our account rate": please price at our contractor rate and put it on the invoice.` : "",
    where,
    "",
    `Please put PO ${po.po_number} on the invoice.`,
    po.notes ? `\n${po.notes}` : "",
  ].filter((x) => x !== "").join("\n");

  const rows = po.lines.map((l) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${l.qty}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(l.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#666">${esc(l.sku ?? "")}</td><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${l.tbc || l.price == null ? '<em style="color:#b45309">at account rate</em>' : money(l.price)}</td></tr>`).join("");
  const html = `<!doctype html><body style="font:14px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;padding:20px;max-width:640px">
<div style="font-size:12px;color:#666">${deliver ? "Delivery order" : "Will-call order"}</div>
<div style="font-size:22px;font-weight:700;letter-spacing:.04em;margin:2px 0 14px">${esc(po.po_number)}</div>
<table style="width:100%;font-size:13px;margin-bottom:14px"><tr><td style="vertical-align:top"><b>From</b><br>${esc(co.name || "Our company")}${co.phone ? `<br>${esc(co.phone)}` : ""}${co.email ? `<br>${esc(co.email)}` : ""}</td>
<td style="vertical-align:top;text-align:right"><b>To</b><br>${esc(s.name)}${s.branch ? `<br>${esc(s.branch)}` : ""}${s.account_no ? `<br>Account ${esc(s.account_no)}` : ""}</td></tr></table>
${po.job_name ? `<div style="margin-bottom:10px"><b>Job:</b> ${esc(po.job_name)}</div>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;color:#666;font-size:11px;text-transform:uppercase"><th style="padding:6px 8px">Qty</th><th style="padding:6px 8px">Item</th><th style="padding:6px 8px">SKU</th><th style="padding:6px 8px;text-align:right">Each</th></tr></thead><tbody>${rows}</tbody></table>
<div style="margin-top:12px;font-size:13px">${priced.length ? `Priced lines <b>${money(po.subtotal)}</b>${po.fees ? ` &middot; delivery ${money(po.fees)}` : ""}` : ""}</div>
${tbc.length ? `<div style="margin-top:8px;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:13px">${tbc.length} line${tbc.length === 1 ? "" : "s"} marked <b>at account rate</b>: please price at our contractor rate and put it on the invoice.</div>` : ""}
<div style="margin-top:14px;font-size:13px">${esc(where)}</div>
<div style="margin-top:14px;padding:10px 12px;background:#eef2ff;border-radius:8px;font-size:13px">Please put <b>PO ${esc(po.po_number)}</b> on the invoice.</div>
${po.notes ? `<div style="margin-top:12px;font-size:13px;white-space:pre-wrap">${esc(po.notes)}</div>` : ""}
<div style="margin-top:22px;font-size:11px;color:#888">Sent from BuilderPro OS on behalf of ${esc(co.name || "the contractor")}. Reply to this email to reach them.</div>
</body>`;
  return { text, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let b: { op?: string; poId?: string; company?: Company } = {};
  try { b = await req.json(); } catch { /* no body */ }
  if (b.op !== "send" || !b.poId) return json({ ok: false, error: "op:send with poId" }, 400);

  const user0 = await userFromJwt(req);
  const user = user0 ? await effectiveOwner(user0.id, user0.email) : null;
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  const pos: PO[] = await rest(`purchase_orders?id=eq.${encodeURIComponent(b.poId)}&owner=eq.${user.id}&select=*&limit=1`);
  const po = pos?.[0];
  if (!po) return json({ ok: false, error: "order not found" }, 404);
  if (!po.supplier_id) return json({ ok: false, reason: "no_email" });
  const sups: Supplier[] = await rest(`suppliers?id=eq.${po.supplier_id}&owner=eq.${user.id}&select=id,name,branch,address,account_no,email&limit=1`);
  const s = sups?.[0];
  if (!s) return json({ ok: false, error: "supplier not found" }, 404);
  const to = String(s.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ ok: false, reason: "no_email" });
  if (!RESEND_KEY) return json({ ok: false, reason: "no_mailer" });

  const co: Company = { ...(b.company ?? {}) };
  const replyTo = (co.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(co.email)) ? co.email : (user.email || undefined);
  const { text, html } = render(po, s, co);
  const subject = `PO ${po.po_number} from ${co.name || "a BuilderPro contractor"}${po.job_name ? ` — ${po.job_name}` : ""}`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], cc: replyTo ? [replyTo] : undefined, reply_to: replyTo, subject, text, html }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return json({ ok: false, reason: "mailer", detail: body?.message || body?.error || `mail service ${r.status}` });

  const at = new Date().toISOString();
  try {
    await rest(`purchase_orders?id=eq.${po.id}`, { method: "PATCH", body: JSON.stringify({ sent_to_supplier: true, send_mode: "emailed", sent_to: to, sent_msg_id: body?.id ?? "", branch_sent_at: at, updated_at: at }) });
  } catch { /* the mail went; the stamp is best effort and the portal stamps its copy too */ }
  return json({ ok: true, to, at, id: body?.id ?? "" });
});
