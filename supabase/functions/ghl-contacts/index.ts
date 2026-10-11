// ghl-contacts — create, update and delete contacts in the house HighLevel
// sub-account (the portal's Contacts page, and book-public for bookings).
//   { action:"create", name, phone?, email? } -> { ok, created }
//   { action:"update", id, name?, phone?, email? } -> { ok }
//   { action:"delete", id } -> { ok }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS" };
const LOCATION = "aUs7E5m1gmLXoeIV3WM9";
const API = "https://services.leadconnectorhq.com";
const H = (t:string)=>({Authorization:"Bearer "+t,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"});
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

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  const json=(o:any,code=200)=>new Response(JSON.stringify(o),{status:code,headers:{...CORS,"Content-Type":"application/json"}});
  try{
    const g = await gate(req); if (g) return json({ ok: false, error: g.error }, g.status);
    const token=Deno.env.get("GHL_TOKEN"); if(!token) return json({error:"NO_TOKEN"},400);
    const body=await req.json().catch(()=>({}));
    const action=body.action;

    // split a full name into first/last for GHL
    const splitName=(name:string)=>{ const p=(name||"").trim().split(/\s+/); return { firstName:p.shift()||"", lastName:p.join(" ") }; };

    if(action==="update"){
      if(!body.id) return json({error:"missing id"},400);
      const payload:any={};
      if(body.name!=null){ const n=splitName(body.name); payload.firstName=n.firstName; payload.lastName=n.lastName; }
      if(body.phone!=null) payload.phone=body.phone;
      if(body.email!=null) payload.email=body.email;
      const r=await fetch(API+`/contacts/${body.id}`,{method:"PUT",headers:H(token),body:JSON.stringify(payload)});
      const txt=await r.text();
      if(!r.ok) return json({ok:false,status:r.status,detail:txt.slice(0,300)});
      return json({ok:true});
    }

    if(action==="create"){
      const n=splitName(body.name||"");
      const payload:any={ locationId:LOCATION, firstName:n.firstName, lastName:n.lastName };
      if(body.phone) payload.phone=body.phone;
      if(body.email) payload.email=body.email;
      const r=await fetch(API+`/contacts/`,{method:"POST",headers:H(token),body:JSON.stringify(payload)});
      const txt=await r.text();
      if(!r.ok) return json({ok:false,status:r.status,detail:txt.slice(0,300)});
      return json({ok:true, created: JSON.parse(txt).contact?.id || null});
    }

    if(action==="delete"){
      if(!body.id) return json({error:"missing id"},400);
      const r=await fetch(API+`/contacts/${body.id}`,{method:"DELETE",headers:H(token)});
      const txt=await r.text();
      if(!r.ok) return json({ok:false,status:r.status,detail:txt.slice(0,300)});
      return json({ok:true});
    }

    return json({error:"unknown action"},400);
  }catch(e){ return json({error:String(e)},500); }
});
