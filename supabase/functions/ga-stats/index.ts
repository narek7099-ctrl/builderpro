// Supabase Edge Function: ga-stats
// Returns real Google Analytics (GA4) metrics for the BuilderPro dashboard.
//
// Required function secrets (set with `supabase secrets set ...`):
//   GA_PROPERTY_ID   -> the NUMERIC GA4 property id (Admin → Property Settings → Property ID), e.g. 481234567
//   GA_CLIENT_EMAIL  -> the service-account email (…@…iam.gserviceaccount.com)
//   GA_PRIVATE_KEY   -> the service-account private key (PEM, keep the -----BEGIN/END PRIVATE KEY----- lines)
//
// Deploy:  supabase functions deploy ga-stats --no-verify-jwt
//
// The service account must be added as a *Viewer* on the GA4 property, and the
// "Google Analytics Data API" must be enabled in the Google Cloud project.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function b64url(input: ArrayBuffer | string): string {
  let str = typeof input === "string" ? input : String.fromCharCode(...new Uint8Array(input));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(clientEmail: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token as string;
}

function fmtDur(seconds: number): string {
  const s = Math.round(seconds || 0);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const propertyId = Deno.env.get("GA_PROPERTY_ID");
    const clientEmail = Deno.env.get("GA_CLIENT_EMAIL");
    const privateKey = (Deno.env.get("GA_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
    if (!propertyId || !clientEmail || !privateKey) {
      return new Response(JSON.stringify({ ok: false, error: "GA not configured" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const token = await getAccessToken(clientEmail, privateKey);
    const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`;
    const body = {
      requests: [
        { // 0: this month + last month totals
          dateRanges: [
            { startDate: "today", endDate: "today", name: "d" }, // placeholder, overwritten below
          ],
          metrics: [
            { name: "activeUsers" }, { name: "screenPageViews" },
            { name: "sessions" }, { name: "averageSessionDuration" },
          ],
        },
        { // 1: daily active users, last 84 days (bucketed to weeks client-side)
          dateRanges: [{ startDate: "84daysAgo", endDate: "today" }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "activeUsers" }],
          orderBys: [{ dimension: { dimensionName: "date" } }],
          limit: 400,
        },
        { // 2: top pages this month
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: 6,
        },
        { // 3: traffic sources this month
          dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 6,
        },
      ],
    };
    // this-month + last-month via two date ranges on request 0
    body.requests[0].dateRanges = [
      { startDate: "30daysAgo", endDate: "today", name: "cur" },
      { startDate: "60daysAgo", endDate: "31daysAgo", name: "prev" },
    ];

    const gaRes = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const ga = await gaRes.json();
    if (ga.error) throw new Error(JSON.stringify(ga.error));
    const reports = ga.reports || [];

    // report 0: totals (two date ranges → two rows)
    const totRows = reports[0]?.rows || [];
    const cur = totRows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_0") || totRows[0];
    const prev = totRows.find((r: any) => r.dimensionValues?.[0]?.value === "date_range_1") || totRows[1];
    const num = (r: any, i: number) => (r ? Number(r.metricValues?.[i]?.value || 0) : 0);
    const visitors = num(cur, 0), visitorsPrev = num(prev, 0);
    const pageViews = num(cur, 1), sessions = num(cur, 2), avgDur = num(cur, 3);
    const delta = visitorsPrev > 0 ? Math.round(((visitors - visitorsPrev) / visitorsPrev) * 100) : null;

    // report 1: daily → 12 weekly buckets
    const dayRows = reports[1]?.rows || [];
    const days = dayRows.map((r: any) => ({ date: r.dimensionValues[0].value, v: Number(r.metricValues[0].value || 0) }));
    const weekly: { label: string; value: number }[] = [];
    for (let w = 0; w < 12; w++) {
      const slice = days.slice(w * 7, w * 7 + 7);
      weekly.push({ label: "W" + (w + 1), value: slice.reduce((a, b) => a + b.v, 0) });
    }

    const topPages = (reports[2]?.rows || []).map((r: any) => ({
      path: r.dimensionValues[0].value, views: Number(r.metricValues[0].value || 0),
    }));
    const sources = (reports[3]?.rows || []).map((r: any) => ({
      name: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value || 0),
    }));

    return new Response(JSON.stringify({
      ok: true,
      visitorsThisMonth: visitors,
      visitorsDelta: delta,
      pageViews, sessions,
      avgEngagement: fmtDur(avgDur),
      weekly, topPages, sources,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
