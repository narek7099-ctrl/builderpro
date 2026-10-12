// push-send — delivers a bell notification to the BuilderPro app on a phone.
//
//   POST { id }   (from the bp_push_on_notification trigger, header x-push-secret)
//
// Loads the notification, finds the recipient's registered devices
// (device_tokens) and sends it: iPhone/iPad through Apple Push Notification
// service, Android through Firebase Cloud Messaging. Tapping it opens the app
// on the same thing the bell would (data.link / data.job -> bpNotify.follow).
// Devices Apple or Google say are gone are forgotten.
//
// The x-push-secret header must match the secret the trigger reads from Vault
// (bp_push_secret); nothing else can make this function send anything.
//
// Secrets (Supabase > Edge Functions > Secrets). Without them it does nothing:
//   Apple:   APNS_KEY_P8 (the .p8 key file's text), APNS_KEY_ID, APNS_TEAM_ID,
//            APNS_BUNDLE_ID (default com.builderpro.app),
//            APNS_ENV (production | sandbox; default production, sandbox tried on BadDeviceToken)
//   Android: FCM_SERVICE_ACCOUNT (the Firebase service account JSON)
//
// Deploy:  supabase functions deploy push-send --no-verify-jwt

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APNS_KEY = (Deno.env.get("APNS_KEY_P8") ?? "").replace(/\\n/g, "\n");
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_TOPIC = Deno.env.get("APNS_BUNDLE_ID") || "com.builderpro.app";
const APNS_ENV = Deno.env.get("APNS_ENV") || "production";
const FCM_SA = Deno.env.get("FCM_SERVICE_ACCOUNT") ?? "";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...sbH, ...(init.headers ?? {}) } });
type Row = Record<string, any>;

const b64u = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b));
  let s = ""; for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemBytes = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

let secret = { v: "", at: 0 };
async function hookSecret(): Promise<string> {
  if (secret.v && Date.now() - secret.at < 600000) return secret.v;
  const r = await rest("rpc/bp_push_secret", { method: "POST", body: "{}" });
  secret = { v: r.ok ? String(await r.json()) : "", at: Date.now() };
  return secret.v;
}

/* ---------------------------------------------------------------- Apple */
let apnsJwt = { v: "", at: 0 };
async function apnsToken(): Promise<string> {
  if (apnsJwt.v && Date.now() - apnsJwt.at < 40 * 60000) return apnsJwt.v; // Apple wants a new one at most hourly
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(APNS_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const body = b64u(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`));
  apnsJwt = { v: `${head}.${body}.${b64u(sig)}`, at: Date.now() };
  return apnsJwt.v;
}
async function toApple(token: string, n: Row, badge: number): Promise<"ok" | "gone" | "fail"> {
  const payload = JSON.stringify({
    aps: { alert: { title: n.title || "BuilderPro", body: n.body || "" }, sound: "default", badge, "thread-id": n.kind || "bp" },
    link: n.link || "", job: n.job_id || "", id: n.id,
  });
  const send = async (host: string) => fetch(`https://${host}/3/device/${token}`, {
    method: "POST", body: payload, signal: AbortSignal.timeout(10000),
    headers: {
      authorization: `bearer ${await apnsToken()}`, "apns-topic": APNS_TOPIC, "apns-push-type": "alert",
      "apns-priority": n.priority === "low" ? "5" : "10", "content-type": "application/json",
    },
  });
  let r = await send(APNS_ENV === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com");
  if (r.status === 400) {
    const why = String((await r.json().catch(() => ({})))?.reason ?? "");
    // a development build's token: try the sandbox once
    if (why === "BadDeviceToken" && APNS_ENV !== "sandbox") r = await send("api.sandbox.push.apple.com");
    else { console.error("apns", why); return why === "BadDeviceToken" ? "gone" : "fail"; }
  }
  if (r.ok) return "ok";
  if (r.status === 410) return "gone";
  console.error("apns", r.status, (await r.text().catch(() => "")).slice(0, 160));
  return "fail";
}

/* --------------------------------------------------------------- Google */
let fcm = { tok: "", at: 0, project: "" };
async function fcmAccess(): Promise<{ tok: string; project: string }> {
  if (fcm.tok && Date.now() - fcm.at < 50 * 60000) return fcm;
  const sa = JSON.parse(FCM_SA);
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${body}.${b64u(sig)}` }),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("fcm token: " + JSON.stringify(d).slice(0, 160));
  fcm = { tok: d.access_token, at: Date.now(), project: sa.project_id };
  return fcm;
}
async function toGoogle(token: string, n: Row): Promise<"ok" | "gone" | "fail"> {
  const { tok, project } = await fcmAccess();
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: n.title || "BuilderPro", body: n.body || "" },
        data: { link: String(n.link || ""), job: String(n.job_id || ""), id: String(n.id) },
        android: { priority: n.priority === "low" ? "normal" : "high", notification: { tag: n.kind || "bp", default_sound: true } },
      },
    }),
  });
  if (r.ok) return "ok";
  const t = await r.text().catch(() => "");
  if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(t)) return "gone";
  console.error("fcm", r.status, t.slice(0, 160));
  return "fail";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const want = await hookSecret();
  if (!want || req.headers.get("x-push-secret") !== want) return json({ ok: false }, 401);
  let b: Row = {};
  try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const id = String(b.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false }, 400);

  const n: Row | undefined = (await (await rest(`notifications?id=eq.${id}&select=id,user_id,kind,title,body,link,job_id,priority,read_at&limit=1`)).json())[0];
  if (!n || n.read_at) return json({ ok: true, skipped: "gone or read" });
  const devs: Row[] = await (await rest(`device_tokens?user_id=eq.${n.user_id}&select=token,platform`)).json();
  if (!devs.length) return json({ ok: true, skipped: "no devices" });
  const apple = !!(APNS_KEY && APNS_KEY_ID && APNS_TEAM_ID), google = !!FCM_SA;
  // the app icon's red number: unread bell items
  const unread = await rest(`notifications?user_id=eq.${n.user_id}&read_at=is.null&select=id`, { headers: { Prefer: "count=exact", Range: "0-0" } })
    .then((r) => Number((r.headers.get("content-range") ?? "").split("/")[1] ?? 0) || 1).catch(() => 1);

  const out: Row = { ok: true, sent: 0, gone: 0, failed: 0, skipped: 0 };
  for (const d of devs) {
    try {
      const res = d.platform === "ios" ? (apple ? await toApple(d.token, n, unread) : null) : (google ? await toGoogle(d.token, n) : null);
      if (res === null) { out.skipped++; continue; }
      if (res === "ok") out.sent++;
      else if (res === "gone") { out.gone++; await rest(`device_tokens?token=eq.${encodeURIComponent(d.token)}`, { method: "DELETE" }); }
      else out.failed++;
    } catch (e) { out.failed++; console.error("push", d.platform, String(e).slice(0, 160)); }
  }
  if (out.skipped) out.note = (!apple ? "Apple keys not set. " : "") + (!google ? "Firebase key not set." : "");
  console.log("push-send", JSON.stringify(out));
  return json(out);
});
