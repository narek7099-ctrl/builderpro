// site-detect: "type your website, we'll take you to the right place".
//
//   POST { domain: "smithroofing.com" }   (signed-in contractor; JWT checked by Supabase)
//     -> { domain, url, reachable, registrar: { name, login } | null,
//          builder: { key, name } | null, sqsp: "<squarespace site id>" | null,
//          installed: bool }
//
// Two different questions, because they often have different answers:
//   - where the DOMAIN is registered: the public registry (RDAP, the modern WHOIS)
//   - what the SITE is built on: the home page's own fingerprint (Wix, Squarespace,
//     GoDaddy Website Builder, WordPress, Webflow, Shopify, Duda, ...)
// It also says whether our tracking snippet is already on the page, so the
// portal can turn green the moment it's pasted and published.
//
// Only reads public pages. Refuses IP addresses and private names (no fetching
// inside anyone's network), times out fast and reads at most ~600 KB.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function clean(raw: string): string | null {
  let d = String(raw || "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null;           // a real dotted name
  if (/^\d+(\.\d+){3}$/.test(d)) return null;                         // no bare IPs
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(d)) return null;
  if (d.endsWith(".supabase.co") || d.endsWith(".supabase.in")) return null;
  return d;
}
const apex = (d: string) => d.replace(/^www\./, "");

async function timed(url: string, ms: number, init: RequestInit = {}): Promise<Response | null> {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal, redirect: "follow" }); } catch { return null; } finally { clearTimeout(t); }
}
async function readCapped(r: Response, max = 600_000): Promise<string> {
  if (!r.body) return "";
  const rd = r.body.getReader(); const dec = new TextDecoder(); let out = "", n = 0;
  while (true) {
    const { done, value } = await rd.read(); if (done || !value) break;
    n += value.length; out += dec.decode(value, { stream: true });
    if (n > max) { try { await rd.cancel(); } catch { /* ignore */ } break; }
  }
  return out;
}

/* ---- where the domain is registered ---- */
const REG_LOGIN: [RegExp, string, string][] = [
  [/godaddy/i, "GoDaddy", "https://sso.godaddy.com/"],
  [/namecheap/i, "Namecheap", "https://www.namecheap.com/myaccount/login/"],
  [/squarespace/i, "Squarespace", "https://account.squarespace.com/"],
  [/google/i, "Squarespace (was Google Domains)", "https://account.squarespace.com/"],
  [/wix/i, "Wix", "https://users.wix.com/signin"],
  [/tucows|hover/i, "Hover", "https://www.hover.com/signin"],
  [/bluehost|fastdomain/i, "Bluehost", "https://my.bluehost.com/"],
  [/hostgator|launchpad/i, "HostGator", "https://portal.hostgator.com/login"],
  [/ionos|1&1|1and1/i, "IONOS", "https://login.ionos.com/"],
  [/network solutions|networksolutions|web\.com|register\.com/i, "Network Solutions", "https://www.networksolutions.com/my-account/login"],
  [/hostinger/i, "Hostinger", "https://hpanel.hostinger.com/"],
  [/cloudflare/i, "Cloudflare", "https://dash.cloudflare.com/login"],
  [/porkbun/i, "Porkbun", "https://porkbun.com/account/login"],
  [/dreamhost/i, "DreamHost", "https://panel.dreamhost.com/"],
  [/name\.com/i, "Name.com", "https://www.name.com/account/login"],
  [/dynadot/i, "Dynadot", "https://www.dynadot.com/account/sign-in"],
  [/shopify/i, "Shopify", "https://admin.shopify.com/"],
  [/amazon|aws/i, "Amazon Route 53", "https://console.aws.amazon.com/route53/"],
];
async function registrar(d: string): Promise<{ name: string; login: string | null } | null> {
  const r = await timed("https://rdap.org/domain/" + encodeURIComponent(apex(d)), 6000, { headers: { accept: "application/rdap+json" } });
  if (!r || !r.ok) return null;
  let j: any; try { j = await r.json(); } catch { return null; }
  const ents: any[] = Array.isArray(j?.entities) ? j.entities : [];
  const reg = ents.find((e) => Array.isArray(e?.roles) && e.roles.includes("registrar"));
  let name = "";
  const v = reg?.vcardArray?.[1];
  if (Array.isArray(v)) { const fn = v.find((x: any) => Array.isArray(x) && x[0] === "fn"); if (fn) name = String(fn[3] || ""); }
  if (!name && reg?.publicIds?.[0]?.identifier) name = "Registrar #" + reg.publicIds[0].identifier;
  if (!name) return null;
  const hit = REG_LOGIN.find(([re]) => re.test(name));
  return { name: hit ? hit[1] : name.replace(/,?\s*(LLC|Inc\.?|Ltd\.?|Corp\.?|Corporation)$/i, "").trim(), login: hit ? hit[2] : null };
}

/* ---- what the site is built on ---- */
const BUILDERS: [string, string, (h: string, hd: Headers) => boolean][] = [
  ["wix", "Wix", (h, hd) => !!hd.get("x-wix-request-id") || /static\.wixstatic\.com|wix\.com website builder|_wixCssImports|wixBiSession/i.test(h)],
  ["squarespace", "Squarespace", (h, hd) => /squarespace/i.test(hd.get("server") || "") || /static1\.squarespace\.com|Static\.SQUARESPACE_CONTEXT|<!-- This is Squarespace\. -->/i.test(h)],
  ["godaddy", "GoDaddy Website Builder", (h) => /img1\.wsimg\.com\/isteam|Go Daddy Website Builder|Starfield Technologies|websites\.godaddy\.com|wsimg\.com\/blobby/i.test(h)],
  ["shopify", "Shopify", (h, hd) => !!hd.get("x-shopid") || /cdn\.shopify\.com|Shopify\.theme/i.test(h)],
  ["webflow", "Webflow", (h) => /data-wf-site|webflow\.com|assets-global\.website-files\.com|cdn\.prod\.website-files\.com/i.test(h)],
  ["duda", "Duda", (h) => /irp\.cdn-website\.com|dmAPI|dudamobile|d2hvr\d*\.cdn-website/i.test(h)],
  ["weebly", "Square Online / Weebly", (h) => /editmysite\.com|weebly\.com|square-online/i.test(h)],
  ["hostinger", "Hostinger Website Builder", (h) => /zyrosite|hostinger website builder|zyro\.com/i.test(h)],
  ["googlesites", "Google Sites", (h) => /sites\.google\.com|googleusercontent\.com\/sitesv/i.test(h)],
  ["hubspot", "HubSpot", (h) => /hs-scripts\.com|hubspot/i.test(h)],
  ["framer", "Framer", (h) => /framerusercontent\.com|framer\.com\/m\//i.test(h)],
  ["carrd", "Carrd", (h) => /carrd\.co/i.test(h)],
  ["wordpress", "WordPress", (h, hd) => /\/wp-content\/|\/wp-includes\/|<meta name="generator" content="WordPress/i.test(h) || /wp-json/.test(hd.get("link") || "")],
  ["netlify", "Netlify", (_h, hd) => /netlify/i.test(hd.get("server") || "")],
  ["github", "GitHub Pages", (_h, hd) => /github\.com/i.test(hd.get("server") || "")],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  const d = clean(body?.domain);
  if (!d) return json({ error: "bad_domain" }, 400);

  const regP = registrar(d);
  let res: Response | null = null, url = "";
  for (const u of ["https://" + d + "/", "https://www." + apex(d) + "/", "http://" + d + "/"]) {
    res = await timed(u, 8000, { headers: { "user-agent": "Mozilla/5.0 (compatible; BuilderProSiteCheck/1.0; +https://builderpro-os.com)", accept: "text/html" } });
    if (res && res.ok) { url = res.url || u; break; }
    res = null;
  }
  // the final address after redirects must still be a public site
  if (res && url) { try { const h = new URL(url).hostname; if (!clean(h)) { res = null; url = ""; } } catch { res = null; url = ""; } }
  const html = res ? await readCapped(res) : "";
  let builder: { key: string; name: string } | null = null;
  if (res) for (const [key, name, test] of BUILDERS) { if (test(html, res.headers)) { builder = { key, name }; break; } }
  /* Squarespace pages carry the site's own id, which is the address of its admin */
  let sqsp: string | null = null;
  if (builder?.key === "squarespace") { const m = /"identifier"\s*:\s*"([a-z0-9-]{3,80})"/i.exec(html); if (m) sqsp = m[1]; }
  const installed = /builderpro-os\.com\/embed\/track\.js/i.test(html);
  return json({ domain: apex(d), url: url || null, reachable: !!res, registrar: await regP, builder, sqsp, installed });
});
