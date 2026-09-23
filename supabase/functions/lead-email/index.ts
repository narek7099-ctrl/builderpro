// lead-email — lead notifications arriving as email instead of a webhook.
//
//   POST /functions/v1/lead-email        (called by the inbound-email provider)
//
// Angi, Thumbtack and most small sellers will never offer a webhook, but all
// of them send an email for every lead. The contractor sets one forwarding
// rule in the inbox those notifications already land in, pointing at the
// address this function owns, and from then on an emailed lead is just a
// lead.
//
// This function does NOT write leads. It parses the message and hands the
// fields to the ordinary lead-intake endpoint, so both routes share one write
// path — the dedupe, the contact row, the GHL push, the event log. Two write
// paths would drift, and the email one is the one whose drift nobody notices.
//
// Deploy:  supabase functions deploy lead-email --no-verify-jwt
//          (the provider cannot send a Supabase JWT; the inbound address is
//           the credential, and a bad one is answered with 200 — see below)
// Secrets: LEAD_EMAIL_SECRET  optional. If set, the provider must include it
//                             as ?k= on the URL it posts to. Every provider
//                             can do this, so set it.

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("LEAD_EMAIL_SECRET") ?? "";

import { parseEmail, forwardCode, normaliseInbound } from "./email-parse.js";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const sb = (path: string, init: RequestInit = {}) =>
  fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

/* ---------------------------------------------------------------- providers */
/* The field mapping lives in email-parse.js so tools/email-parse.test.js can
   run it against real Postmark, Mailgun and SendGrid payloads. A mapping that
   misses does not throw — every message simply parses as empty, and the only
   symptom is leads that never arrive. */
type Msg = { to: string; from: string; subject: string; text: string; html: string };

async function readMessage(req: Request): Promise<Msg> {
  const type = (req.headers.get("content-type") ?? "").toLowerCase();
  let o: Record<string, unknown> = {};
  if (type.includes("form")) {
    const f = await req.formData();
    f.forEach((v, k) => { if (typeof v === "string") o[k] = v; });
  } else {
    try { o = await req.json(); } catch { o = {}; }
  }
  return normaliseInbound(o) as Msg;
}

/* The envelope's "to" can be "Leads <ab3k9x2p7q@leads.example.com>, other@…"
   or a JSON blob, depending on the provider. All we want is our own slug. */
function slugOf(to: string): string {
  const m = String(to).toLowerCase().match(/([a-z2-9]{10})@/);
  return m ? m[1] : "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const k = new URL(req.url).searchParams.get("k") ?? "";
  const msg = await readMessage(req);
  const slug = slugOf(msg.to);

  /* Everything below answers 200 even when it does nothing.
     An inbound-email provider treats a non-2xx as a delivery failure and
     retries, often for days, and then bounces to the sender. A misaddressed
     message or one we cannot read is not worth a retry — it will parse no
     better the fourth time — and a bounce would go to a homeowner or to the
     vendor rather than to anyone who could fix it. The reason rides in the
     body, where the provider's own logs will show it. */
  if (!slug) return json({ ok: true, skipped: "no inbox address in the envelope" });

  const sr = await sb("rpc/lead_source_for_inbox", { method: "POST", body: JSON.stringify({ p_slug: slug }) });
  const rows = await sr.json().catch(() => []);
  const src = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!src) return json({ ok: true, skipped: "unknown or paused inbox" });

  /* Two callers, two credentials.

     An inbound-email provider posts every contractor's mail through one URL,
     so it carries the shared LEAD_EMAIL_SECRET. A Gmail script lives in one
     contractor's own Google account, where they can read it — so it carries
     that source's own key and nothing else. A single shared secret pasted
     into every customer's script would not be a secret at all, and the first
     person to look at their own script would hold everyone's.

     Checked after the source is resolved, because the per-source key cannot
     be compared until we know which source is being addressed. A wrong key
     is a 401: unlike a message we merely cannot use, this one is worth the
     caller retrying once they fix it. */
  if (HOOK_SECRET && k !== HOOK_SECRET && k !== src.secret) {
    return json({ ok: false, error: "bad key for this source" }, 401);
  }

  /* Setting the forward up means Google emails a confirmation code to the
     address being verified, which is this one. Left alone it would be filed
     as an unusable lead with the code buried in the stored payload — and the
     contractor stranded at step two of their own setup instructions. So it
     is pulled out and put in the open, labelled as what it is rather than
     dressed up as a lead. */
  const code = forwardCode(msg) as { code: string; link: string } | null;
  const lead = code
    ? { name: "\u2709 Forwarding code " + code.code, phone: "", email: "", address: "",
        job: "Confirmation code " + code.code + " \u2014 paste this back into the forwarding screen you came from."
          + (code.link ? " Or open: " + code.link : "") }
    : parseEmail(msg) as { name: string; phone: string; email: string; address: string; job: string };

  /* No phone and no email means the forwarding rule is catching the wrong
     messages — a weekly summary, a billing notice. Passed along anyway: the
     intake endpoint records it as rejected with a reason, and a contractor
     wondering why nothing arrives is much better served by a row that says
     "no phone or email in the payload" than by silence. */
  const r = await fetch(`${SB_URL}/functions/v1/lead-intake/${src.id}?k=${encodeURIComponent(src.secret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...lead,
      // kept so the raw payload on the event is the email it came from, which
      // is what a contractor needs when a vendor disputes the lead
      _email_subject: msg.subject,
      _email_from: msg.from,
    }),
  });
  const d = await r.json().catch(() => ({}));
  return json({ ok: true, status: (d as { status?: string }).status ?? "unknown", parsed: { name: lead.name, phone: lead.phone } });
});
