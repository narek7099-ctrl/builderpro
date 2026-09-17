// supply-scan — reads a supplier invoice, quote or counter receipt from a
// photo or PDF and returns it as structured data.
//
// This is how the two "needs a distributor API" features get closed without
// one. The paperwork the supplier already hands over carries the contractor's
// real negotiated prices and the PO number; reading it gives us both.
//
//   { op:"scan", mime, data }   -> { ok, doc:{...} }   base64 image or PDF
//
// Uses the Gemini key the portal already has for the AI receptionist. No new
// credential, no distributor partnership.
//
// Deploy: supabase functions deploy supply-scan

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// Document reading wants a stronger model than the chat default.
const SCAN_MODEL = Deno.env.get("SUPPLY_SCAN_MODEL") ?? "gemini-2.5-flash";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const OK_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
const MAX_BYTES = 8 * 1024 * 1024;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    doc_type: { type: "STRING", description: "invoice, quote, receipt, packing_slip or unknown" },
    supplier_name: { type: "STRING" },
    branch: { type: "STRING", description: "branch or store name, empty if absent" },
    invoice_no: { type: "STRING", description: "the supplier's own invoice or quote number" },
    po_number: { type: "STRING", description: "the customer PO number printed on the document, empty if absent" },
    account_no: { type: "STRING" },
    dated: { type: "STRING", description: "ISO date YYYY-MM-DD, empty if unreadable" },
    subtotal: { type: "NUMBER" },
    tax: { type: "NUMBER" },
    fees: { type: "NUMBER", description: "delivery or other charges" },
    total: { type: "NUMBER" },
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sku: { type: "STRING", description: "the supplier's item or part number, empty if absent" },
          name: { type: "STRING" },
          qty: { type: "NUMBER" },
          unit: { type: "STRING", description: "ea, bundle, roll, box, case, sq, lf, yd" },
          unit_price: { type: "NUMBER" },
          line_total: { type: "NUMBER" },
        },
        required: ["name", "qty", "unit_price"],
      },
    },
    confidence: { type: "NUMBER", description: "0 to 1, how legible the document was" },
    note: { type: "STRING", description: "anything unreadable or ambiguous, one short sentence, empty if clean" },
  },
  required: ["doc_type", "supplier_name", "total", "lines", "confidence"],
};

const PROMPT = `You are reading a building-supply document for a contractor: a supplier invoice, a quote, or a will-call counter receipt.

Extract it exactly as printed. Rules:
- Numbers are plain, with no currency symbols or thousands separators.
- unit_price is the price for ONE unit, the contractor's price as billed. If only a line total and a quantity are printed, divide.
- Keep the supplier's own SKU or item number in sku. Do not invent one; leave it empty if the document has none.
- Ignore any shelf, list or retail price column. We want what this customer is actually charged.
- Do not include subtotal, tax, delivery or other charge rows in lines. Those belong in subtotal, tax, fees and total.
- po_number is the CUSTOMER's purchase order number, often labelled PO, P.O., Cust PO or Job. It is not the invoice number.
- If the image is unreadable, return confidence below 0.4 and say why in note. Never guess a total.`;

async function userFromJwt(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? { id: u.id } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!GEMINI_API_KEY) return json({ ok: false, error: "not_configured", reason: "GEMINI_API_KEY is not set on this project." });

  let b: { op?: string; mime?: string; data?: string } = {};
  try { b = await req.json(); } catch { /* no body */ }
  if (b.op !== "scan") return json({ ok: false, error: "unknown op" }, 400);

  const user = await userFromJwt(req);
  if (!user) return json({ ok: false, error: "sign in required" }, 401);

  const mime = String(b.mime ?? "");
  const data = String(b.data ?? "");
  if (!OK_MIME.includes(mime)) return json({ ok: false, error: "bad_type", reason: "Send a photo or a PDF." });
  if (!data) return json({ ok: false, error: "empty", reason: "Nothing to read." });
  if (data.length * 0.75 > MAX_BYTES) return json({ ok: false, error: "too_big", reason: "That file is over 8MB. Take the photo again at a smaller size." });

  const body = {
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: mime, data: data } }, { text: "Read this document." }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 4096 },
  };

  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${SCAN_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ ok: false, error: "unreachable", reason: String((e as Error).message ?? e) });
  }
  if (!r.ok) return json({ ok: false, error: "read_failed", reason: `The reader returned ${r.status}.`, detail: (await r.text()).slice(0, 400) });

  const out = await r.json();
  const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  let doc: Record<string, unknown>;
  try { doc = JSON.parse(text); } catch { return json({ ok: false, error: "unparsable", reason: "The reader did not return a clean result. Try a straighter, brighter photo." }); }

  // normalise: numbers as numbers, lines with a usable price only
  const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : 0; };
  const lines = (Array.isArray(doc.lines) ? doc.lines : []).map((l: Record<string, unknown>) => {
    const qty = num(l.qty) || 1;
    const lineTotal = num(l.line_total);
    let unitPrice = num(l.unit_price);
    if (!unitPrice && lineTotal) unitPrice = Math.round((lineTotal / qty) * 100) / 100;
    return { sku: String(l.sku ?? "").trim(), name: String(l.name ?? "").trim(), qty: qty, unit: String(l.unit ?? "ea").trim() || "ea", unit_price: unitPrice, line_total: lineTotal || Math.round(unitPrice * qty * 100) / 100 };
  }).filter((l: { name: string; unit_price: number }) => l.name && l.unit_price >= 0);

  return json({
    ok: true,
    model: SCAN_MODEL,
    doc: {
      doc_type: String(doc.doc_type ?? "unknown"),
      supplier_name: String(doc.supplier_name ?? "").trim(),
      branch: String(doc.branch ?? "").trim(),
      invoice_no: String(doc.invoice_no ?? "").trim(),
      po_number: String(doc.po_number ?? "").trim(),
      account_no: String(doc.account_no ?? "").trim(),
      dated: String(doc.dated ?? "").trim(),
      subtotal: num(doc.subtotal), tax: num(doc.tax), fees: num(doc.fees), total: num(doc.total),
      lines,
      confidence: Math.max(0, Math.min(1, num(doc.confidence))),
      note: String(doc.note ?? "").trim(),
    },
  });
});
