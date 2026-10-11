// ghl-opportunities  —  Supabase Edge Function
// Two actions:
//   { action: "list" }                     -> returns opportunities in the Decision Pending stage
//   { action: "won", opportunityId, contactId } -> tags "booked job" + moves opp to Won stage
//
// Reuses the same GHL Private Integration token stored as GHL_TOKEN (same as your other functions).
// Mirrors the structure of ghl-contacts / ghl-dashboard.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GHL_TOKEN = Deno.env.get("GHL_TOKEN")!;
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// ==== CONFIRM THESE TWO IDS IN GHL (Settings -> Pipelines -> Roofing Sales Pipeline) ====
const PIPELINE_ID = "GLGYa6sWZkHl8vZcQxfY";
const DECISION_PENDING_STAGE_ID = "REPLACE_WITH_DECISION_PENDING_STAGE_ID";
const WON_STAGE_ID = "REPLACE_WITH_WON_STAGE_ID";
// =======================================================================================

const LOCATION_ID = "aUs7E5m1gmLXoeIV3WM9"; // demo location (multi-client: make dynamic later)
const WON_TAG = "booked job";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
/* ---- who may use this function ----
   The HighLevel sub-account behind this function is the BuilderPro house
   account's. Only these get through:
   - our own functions (book-public), with the service key;
   - a signed-in owner or office login of the house account (ai_config
     ghl_events_owner, plus any id in ghl_house_owners).
   Every other BuilderPro account is told its HighLevel isn't connected here,
   so no client ever sees another business's contacts, inbox or calendar.
   Crew and subcontractor logins are refused. */
const G_URL = Deno.env.get("SUPABASE_URL") ?? "", G_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "", G_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
async function gRows(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(`${G_URL}/rest/v1/${path}`, { headers: { apikey: G_SERVICE, Authorization: `Bearer ${G_SERVICE}` } });
  return r.ok ? await r.json() : [];
}
async function gate(req: Request): Promise<{ status: number; error: string } | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (G_SERVICE && (jwt === G_SERVICE || req.headers.get("x-internal-key") === G_SERVICE)) return null;
  const no = { status: 401, error: "Sign in to use this." };
  if (!jwt || jwt === G_ANON) return no;
  try {
    const r = await fetch(`${G_URL}/auth/v1/user`, { headers: { apikey: G_ANON, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return no;
    const u = await r.json();
    if (!u?.id) return no;
    const tm = await gRows(`team_members?member=eq.${u.id}&accepted_at=not.is.null&select=owner,role&limit=1`);
    if (tm[0] && tm[0].role !== "office") return { status: 403, error: "Only the owner and office can use this." };
    const owner = String(tm[0]?.owner ?? u.id);
    const cfg = await gRows(`ai_config?key=in.(ghl_events_owner,ghl_house_owners)&select=value`);
    const house = cfg.flatMap((c) => String(c.value ?? "").split(",")).map((s) => s.trim()).filter(Boolean);
    if (house.includes(owner)) return null;
    return { status: 403, error: "HighLevel isn't connected for this account yet." };
  } catch { return no; }
}

function ghlHeaders() {
  return {
    "Authorization": `Bearer ${GHL_TOKEN}`,
    "Version": GHL_VERSION,
    "Content-Type": "application/json",
  };
}

// Fetch the pipeline's stages [{id, name}] from GHL
let _stageCache: any[] | null = null;
async function listStages(): Promise<any[]> {
  if (_stageCache) return _stageCache;
  const r = await fetch(`${GHL_BASE}/opportunities/pipelines?locationId=${LOCATION_ID}`, { headers: ghlHeaders() });
  const d = await r.json();
  const pipelines = d.pipelines || [];
  const p = pipelines.find((x: any) => x.id === PIPELINE_ID) || pipelines[0];
  _stageCache = (p && p.stages) ? p.stages.map((s: any) => ({ id: s.id, name: s.name })) : [];
  return _stageCache;
}
// Resolve a stage ID by (partial, case-insensitive) name
async function resolveStageId(nameWanted: string): Promise<string> {
  const stages = await listStages();
  const want = nameWanted.toLowerCase();
  const hit = stages.find((s: any) => (s.name || "").toLowerCase().includes(want));
  return hit ? hit.id : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const g = await gate(req); if (g) return json({ ok: false, error: g.error }, g.status);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    // ---------- LIST Decision Pending opportunities ----------
    if (action === "list") {
      // Step 1: resolve the Decision Pending stage ID from the pipeline definition
      const stageId = await resolveStageId("decision pending");
      if (!stageId) {
        return json({ error: "stage_not_found", detail: "Could not find a 'Decision Pending' stage in the pipeline.", stages: await listStages() }, 500);
      }

      // Step 2: fetch open opportunities in the pipeline
      const url =
        `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}` +
        `&pipeline_id=${PIPELINE_ID}` +
        `&status=open` +
        `&limit=100`;

      const r = await fetch(url, { headers: ghlHeaders() });
      const d = await r.json();
      if (!r.ok) {
        return json({ error: "ghl_list_failed", detail: d }, 500);
      }

      const all = d.opportunities || [];

      // Step 3: filter by the resolved stage ID (search response has stage ID, not name)
      const filtered = all.filter((o: any) => {
        const sid = o.pipelineStageId || o.pipeline_stage_id || o.stageId || "";
        return sid === stageId;
      });

      const opps = filtered.map((o: any) => ({
        opportunityId: o.id,
        contactId: o.contact?.id || o.contactId || "",
        name: o.contact?.name || o.name || "Unknown",
        phone: o.contact?.phone || "",
        email: o.contact?.email || "",
        value: o.monetaryValue || 0,
        updatedAt: o.updatedAt || o.dateUpdated || "",
      }));

      return json({ opportunities: opps });
    }

    // ---------- LIST Won / confirmed jobs ----------
    if (action === "won_list") {
      const wonStage = await resolveStageId("won");
      const url =
        `${GHL_BASE}/opportunities/search?location_id=${LOCATION_ID}` +
        `&pipeline_id=${PIPELINE_ID}` +
        `&status=won` +
        `&limit=100`;
      const r = await fetch(url, { headers: ghlHeaders() });
      const d = await r.json();
      if (!r.ok) return json({ error: "ghl_wonlist_failed", detail: d }, 500);

      const opps = (d.opportunities || []).map((o: any) => ({
        opportunityId: o.id,
        contactId: o.contact?.id || o.contactId || "",
        name: o.contact?.name || o.name || "Unknown",
        phone: o.contact?.phone || "",
        value: o.monetaryValue || 0,
        wonAt: o.lastStatusChangeAt || o.updatedAt || o.dateUpdated || "",
      }));
      // newest first
      opps.sort((a: any, b: any) => (b.wonAt || "").localeCompare(a.wonAt || ""));
      return json({ opportunities: opps });
    }

    // ---------- DUMP all pipeline stages (name -> id) ----------
    if (action === "stages") {
      return json({ stages: await listStages() });
    }

    // ---------- GET a single opportunity (debug read-back) ----------
    if (action === "get") {
      const { opportunityId } = body;
      if (!opportunityId) return json({ error: "missing_opportunityId" }, 400);
      const r = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, { headers: ghlHeaders() });
      const d = await r.json();
      return json({ status: r.status, raw: d });
    }

    // ---------- MARK a deal as WON ----------
    if (action === "won") {
      const { opportunityId, contactId } = body;
      if (!opportunityId) return json({ error: "missing_opportunityId" }, 400);

      // resolve the Won stage ID by name (fallback to hardcoded if provided)
      let wonStage = await resolveStageId("won");
      if (!wonStage && WON_STAGE_ID !== "REPLACE_WITH_WON_STAGE_ID") wonStage = WON_STAGE_ID;
      if (!wonStage) return json({ error: "won_stage_not_found", stages: await listStages() }, 500);

      // 1) move opportunity to Won stage + mark status won
      const upd = await fetch(`${GHL_BASE}/opportunities/${opportunityId}`, {
        method: "PUT",
        headers: ghlHeaders(),
        body: JSON.stringify({
          pipelineId: PIPELINE_ID,
          pipelineStageId: wonStage,
          status: "won",
        }),
      });
      const updData = await upd.json();
      if (!upd.ok) return json({ error: "ghl_update_failed", detail: updData }, 500);

      // 2) tag the contact "booked job" (this is what the dashboard counts as Won)
      let tagResult: any = "skipped";
      if (contactId) {
        const tr = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
          method: "POST",
          headers: ghlHeaders(),
          body: JSON.stringify({ tags: [WON_TAG] }),
        });
        tagResult = { status: tr.status, body: await tr.json().catch(() => ({})) };
      }

      return json({ ok: true, opportunityId, wonStageUsed: wonStage, updateResponse: updData, tagResult });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "exception", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
