// ghl-dashboard — lead and pipeline figures from the house HighLevel
// sub-account. { view:"contacts" } returns the contact list instead.
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
    const token=Deno.env.get("GHL_TOKEN"); if(!token) return json({error:"NO_TOKEN"});
    const body = req.method==="POST" ? await req.json().catch(()=>({})) : {};
    const view = body.view || "dashboard";

    // pull contacts (shared by both views)
    let contacts:any[]=[]; let page=1;
    while(page<=10){
      const r=await fetch(API+"/contacts/search",{method:"POST",headers:H(token),body:JSON.stringify({locationId:LOCATION,pageLimit:100,page})});
      if(!r.ok) break; const d=await r.json(); const batch=d.contacts||[];
      contacts=contacts.concat(batch); if(batch.length<100) break; page++;
    }

    // ---- CONTACTS view: return the list ----
    if (view==="contacts") {
      const list = contacts.map((c:any)=>({
        id: c.id,
        name: (c.contactName || ((c.firstName||"")+" "+(c.lastName||"")).trim() || "(no name)"),
        phone: c.phone || "",
        email: c.email || "",
        tags: c.tags || [],
        dateAdded: c.dateAdded || c.createdAt || null,
      }));
      list.sort((a:any,b:any)=> new Date(b.dateAdded||0).getTime() - new Date(a.dateAdded||0).getTime());
      return json({ contactsList: list, total: list.length });
    }

    // ---- DASHBOARD view (default) ----
    const now=new Date();
    const todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();
    const monthStart=new Date(now.getFullYear(),now.getMonth(),1).getTime();
    const has=(c:any,t:string)=>(c.tags||[]).indexOf(t)>=0;
    const created=(c:any)=>{const t=c.dateAdded||c.createdAt||c.dateCreated;return t?new Date(t).getTime():0;};
    const countTag=(t:string,since?:number)=>contacts.filter(c=>has(c,t)&&(since?created(c)>=since:true)).length;

    const out:any={
      newLeadsToday: countTag("new_lead", todayStart),
      newLeadsMonth: countTag("new_lead", monthStart),
      appointmentsBookedMonth: countTag("appointment booked", monthStart),
      missedCallsRecoveredMonth: countTag("missed-call-recovered", monthStart),
      missedTextsRecoveredMonth: countTag("missed-text-recovered", monthStart),
      leadsReactivatedMonth: countTag("reactivated leads", monthStart),
      wonClosedJobs: countTag("booked job"),
      totalContacts: contacts.length,
    };
    out.recovery = { calls: countTag("missed-call-recovered"), texts: countTag("missed-text-recovered"), reactivated: countTag("reactivated leads") };
    const series=(filter:(c:any)=>boolean)=>{
      const arr:any[]=[];
      for(let i=13;i>=0;i--){
        const dS=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i).getTime(); const dE=dS+86400000;
        arr.push({label:new Date(dS).toLocaleDateString("en-US",{month:"short",day:"numeric"}), count: contacts.filter(c=>filter(c)&&created(c)>=dS&&created(c)<dE).length});
      }
      return arr;
    };
    out.leadsOverTime = series(c=>has(c,"new_lead"));
    out.bookedOverTime = series(c=>has(c,"booked job"));

    const o=await fetch(API+`/opportunities/search?location_id=${LOCATION}&limit=100`,{headers:H(token)});
    let opps:any[]=[];
    if(o.ok){ const od=await o.json(); opps=od.opportunities||[]; out.openOpportunities=od.meta?.total??opps.length; let v=0; for(const op of opps) v+=Number(op.monetaryValue||0); out.pipelineValue=Math.round(v); }
    const pl=await fetch(API+`/opportunities/pipelines?locationId=${LOCATION}`,{headers:H(token)});
    if(pl.ok){
      const pd=await pl.json(); const pipe=(pd.pipelines||[])[0]; const stages=pipe?(pipe.stages||[]):[];
      const cnt:any={}, val:any={};
      for(const op of opps){ const s=op.pipelineStageId||op.stageId; cnt[s]=(cnt[s]||0)+1; val[s]=(val[s]||0)+Number(op.monetaryValue||0); }
      out.funnel=stages.map((s:any)=>({stage:s.name, count:cnt[s.id]||0, value:Math.round(val[s.id]||0)}));
    }
    return json(out);
  }catch(e){ return json({error:String(e)}); }
});
