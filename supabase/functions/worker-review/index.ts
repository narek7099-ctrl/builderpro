// worker-review — the customer side of crew ratings.
//
// When the owner marks a job done the portal creates a review_requests row
// (token = uuid) and hands them a link: embed/rate.html?t=<token>&u=<owner>.
// The homeowner opens it with no sign-in; this function is the only thing
// that page talks to.
//
//   GET  ?t=<token>
//     -> { ok, used, business:{name, logo, phone}, job:{title}, customer,
//          workers:[{id, name, trade, photo}] }
//        photo is a short-lived signed URL (private bucket) or the https URL
//        stored on the employee. Nothing about money, addresses or phones of
//        the workers leaves here.
//   POST { t, overall?:1-5, comment?, ratings:[{employeeId, rating:1-5, comment?}] }
//     -> { ok:true, reviewUrl? }
//        One submit per token: the request is claimed with a conditional
//        update (used_at is null) before anything is written, so two
//        submits racing cannot both land. Ratings for anyone not on the
//        request are dropped. reviewUrl is the business's public review link
//        (client_settings.data.company.reviewUrl) when the overall rating is
//        4 or 5, so a happy customer can be pointed at Google.
//
// Deploy:
//   supabase functions deploy worker-review --no-verify-jwt
// Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set by the platform).

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "project-files";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sb = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- rate limit: per IP, per isolate. The single-use token is the real limit;
// this just stops someone hammering GET to guess tokens.
const hits = new Map<string, number[]>();
function limited(ip: string, max = 30, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return arr.length > max;
}

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sb, ...(init.headers ?? {}) } });
  const txt = await r.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: r.ok, status: r.status, data };
}

async function signed(ref: string | null): Promise<string> {
  if (!ref) return "";
  if (/^https:\/\//i.test(ref)) return ref;
  if (!ref.startsWith("sb:")) return "";
  const path = ref.slice(3).split("#")[0];
  try {
    const r = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST", headers: sb, body: JSON.stringify({ expiresIn: 3600 }),
    });
    const d = await r.json();
    const u = d?.signedURL || d?.signedUrl || "";
    return u ? (u.startsWith("http") ? u : `${SB_URL}/storage/v1${u}`) : "";
  } catch { return ""; }
}

type Req = { token: string; owner: string; job_id: string; job_title: string | null; workers: { employeeId: string; name?: string }[]; customer_name: string | null; used_at: string | null };

async function loadRequest(t: string): Promise<Req | null> {
  const r = await rest(`review_requests?token=eq.${t}&select=token,owner,job_id,job_title,workers,customer_name,used_at`);
  const row = Array.isArray(r.data) ? r.data[0] : null;
  return row ? (row as Req) : null;
}
function workerIds(q: Req): string[] {
  return (Array.isArray(q.workers) ? q.workers : []).map((w) => String(w?.employeeId || "")).filter((x) => UUID.test(x));
}
const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!SB_URL || !SB_SERVICE) return json({ ok: false, error: "not configured" }, 500);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "anon";
  if (limited(ip)) return json({ ok: false, error: "Too many requests. Try again in a few minutes." }, 429);

  try {
    if (req.method === "GET") {
      const t = new URL(req.url).searchParams.get("t") ?? "";
      if (!UUID.test(t)) return json({ ok: false, error: "This link isn't valid." }, 400);
      const q = await loadRequest(t);
      if (!q) return json({ ok: false, error: "This link isn't valid." }, 404);
      const ids = workerIds(q);
      const [cs, emps] = await Promise.all([
        rest(`client_settings?user_id=eq.${q.owner}&select=data`),
        ids.length ? rest(`employees?owner=eq.${q.owner}&id=in.(${ids.join(",")})&select=id,name,trade,photo_url`) : Promise.resolve({ ok: true, status: 200, data: [] }),
      ]);
      const co = (Array.isArray(cs.data) && (cs.data[0] as any)?.data?.company) || {};
      const byId = new Map<string, any>((Array.isArray(emps.data) ? emps.data : []).map((e: any) => [e.id, e]));
      const workers = await Promise.all(ids.map(async (id) => {
        const e = byId.get(id), snap = q.workers.find((w) => w.employeeId === id);
        const full = String(e?.name || snap?.name || "Crew member");
        return { id, name: full, trade: e?.trade || "", photo: await signed(e?.photo_url ?? null) };
      }));
      return json({
        ok: true, used: !!q.used_at,
        business: { name: co.name || "", logo: /^https:\/\//i.test(co.logoUrl || "") ? co.logoUrl : "", phone: co.phone || "" },
        job: { title: q.job_title || "" },
        customer: clean(q.customer_name, 80).split(/\s+/)[0] || "",
        workers,
      });
    }

    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    let b: any = {};
    try { b = await req.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
    const t = String(b?.t || "");
    if (!UUID.test(t)) return json({ ok: false, error: "This link isn't valid." }, 400);
    const q = await loadRequest(t);
    if (!q) return json({ ok: false, error: "This link isn't valid." }, 404);
    if (q.used_at) return json({ ok: false, error: "Thanks — this job has already been rated.", used: true }, 409);

    const allowed = new Set(workerIds(q));
    const seen = new Set<string>();
    const ratings = (Array.isArray(b.ratings) ? b.ratings : []).map((r: any) => ({
      employeeId: String(r?.employeeId || ""), rating: Math.round(Number(r?.rating)), comment: clean(r?.comment, 1000),
    })).filter((r: any) => allowed.has(r.employeeId) && r.rating >= 1 && r.rating <= 5 && !seen.has(r.employeeId) && seen.add(r.employeeId));
    const overall = Math.round(Number(b?.overall));
    const hasOverall = overall >= 1 && overall <= 5;
    if (!ratings.length && !hasOverall) return json({ ok: false, error: "Pick at least one star rating." }, 400);

    // claim the request first: only one submit can win
    const claim = await rest(`review_requests?token=eq.${t}&used_at=is.null`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ used_at: new Date().toISOString(), overall: hasOverall ? overall : null, overall_comment: clean(b?.comment, 1000) || null }),
    });
    if (!claim.ok || !Array.isArray(claim.data) || !claim.data.length) return json({ ok: false, error: "Thanks — this job has already been rated.", used: true }, 409);

    if (ratings.length) {
      const rows = ratings.map((r: any) => ({
        owner: q.owner, job_id: q.job_id, employee_id: r.employeeId, rating: r.rating, comment: r.comment || null,
        customer_name: q.customer_name, source: "link", request_token: t,
      }));
      const ins = await rest("worker_reviews", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(rows) });
      if (!ins.ok) {
        // give the link back so they can try again
        await rest(`review_requests?token=eq.${t}`, { method: "PATCH", body: JSON.stringify({ used_at: null, overall: null, overall_comment: null }) });
        return json({ ok: false, error: "Couldn't save that. Please try again." }, 500);
      }
    }

    let reviewUrl = "";
    if (hasOverall && overall >= 4) {
      const cs = await rest(`client_settings?user_id=eq.${q.owner}&select=data`);
      const u = String((Array.isArray(cs.data) && (cs.data[0] as any)?.data?.company?.reviewUrl) || "");
      if (/^https:\/\//i.test(u)) reviewUrl = u;
    }
    return json({ ok: true, reviewUrl });
  } catch (e) {
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
});
