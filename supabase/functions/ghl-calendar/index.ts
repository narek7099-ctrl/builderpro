import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS" };
const LOCATION = "aUs7E5m1gmLXoeIV3WM9";
const CALS:any = { inspection:"V41O3qJWPnbYKGQXTUNz", jobs:"hQSYlMWWdp15PXBI31Dl" };
const API = "https://services.leadconnectorhq.com";
// the first team member on a calendar: HighLevel won't book a round-robin
// calendar (the Jobs one) without an assigned user
const TEAM:any = {};
async function teamUser(cal:string, token:string){
  if(TEAM[cal]!==undefined) return TEAM[cal];
  try{
    const r=await fetch(API+`/calendars/${cal}`,{headers:H(token)});
    const d=await r.json();
    const m=((d.calendar||d).teamMembers||[]);
    TEAM[cal]=(m.find((x:any)=>x.isPrimary)||m[0]||{}).userId||"";
  }catch(_){ TEAM[cal]=""; }
  return TEAM[cal];
}
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
const H = (t:string)=>({Authorization:"Bearer "+t,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"});

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  const json=(o:any,code=200)=>new Response(JSON.stringify(o),{status:code,headers:{...CORS,"Content-Type":"application/json"}});
  try{
    const g = await gate(req); if (g) return json({ ok: false, error: g.error }, g.status);
    const token=Deno.env.get("GHL_TOKEN"); if(!token) return json({error:"NO_TOKEN"},400);
    const body=await req.json().catch(()=>({}));
    const action=body.action||"list";
    const CAL = CALS[body.cal] || CALS.inspection;  // default inspection

    if(action==="list"){
      const start=body.start || (Date.now()-30*86400000);
      const end=body.end || (Date.now()+90*86400000);
      const r=await fetch(API+`/calendars/events?locationId=${LOCATION}&calendarId=${CAL}&startTime=${start}&endTime=${end}`,{headers:H(token)});
      if(!r.ok) return json({ok:false,status:r.status,detail:(await r.text()).slice(0,300)});
      const d=await r.json();
      const events=(d.events||[]).map((e:any)=>({ id:e.id, title:e.title||"Appointment", contactId:e.contactId||null, start:e.startTime, end:e.endTime, status:e.appointmentStatus||e.appoinmentStatus||"confirmed", address:e.address||"" }));
      events.sort((a:any,b:any)=> new Date(a.start).getTime()-new Date(b.start).getTime());
      return json({ok:true, events});
    }

    if(action==="slots"){
      const start=body.start || Date.now();
      const end=body.end || (Date.now()+21*86400000);
      const r=await fetch(API+`/calendars/${CAL}/free-slots?startDate=${start}&endDate=${end}&timezone=America/Los_Angeles`,{headers:H(token)});
      if(!r.ok) return json({ok:false,status:r.status,detail:(await r.text()).slice(0,300)});
      const d=await r.json();
      const byDate:any={};
      for(const k of Object.keys(d)){ if(d[k] && Array.isArray(d[k].slots)) byDate[k]=d[k].slots; }
      return json({ok:true, slots:byDate});
    }

    if(action==="delete"){
      if(!body.id) return json({error:"missing id"},400);
      const r=await fetch(API+`/calendars/events/appointments/${body.id}`,{method:"DELETE",headers:H(token)});
      // already gone counts as done
      return json({ok:r.ok||r.status===404, status:r.status, detail:(await r.text()).slice(0,300)});
    }
    if(action==="update"){
      if(!body.id) return json({error:"missing id"},400);
      const payload:any={};
      if(body.startTime) payload.startTime=body.startTime;
      if(body.endTime) payload.endTime=body.endTime;
      if(body.title!=null) payload.title=body.title;
      if(body.address!=null) payload.address=body.address;
      if(payload.startTime||payload.endTime){ const who=body.assignedUserId||await teamUser(CAL,token); if(who) payload.assignedUserId=who; }
      if(body.ignoreValidation) { payload.ignoreDateRange=true; payload.ignoreFreeSlotValidation=true; payload.toNotify=false; }
      const r=await fetch(API+`/calendars/events/appointments/${body.id}`,{method:"PUT",headers:H(token),body:JSON.stringify(payload)});
      return json({ok:r.ok, status:r.status, detail:(await r.text()).slice(0,300)});
    }
    if(action==="create"){
      const payload:any={ calendarId:CAL, locationId:LOCATION, contactId:body.contactId, startTime:body.startTime, endTime:body.endTime, title:body.title||"Appointment" };
      if(body.address) payload.address=body.address;
      const who=body.assignedUserId||await teamUser(CAL,token);
      if(who) payload.assignedUserId=who;
      // for free-form (jobs) bookings, ignore GHL slot validation and don't text the customer
      if(body.ignoreValidation) { payload.ignoreDateRange=true; payload.ignoreFreeSlotValidation=true; payload.toNotify=false; }
      const r=await fetch(API+`/calendars/events/appointments`,{method:"POST",headers:H(token),body:JSON.stringify(payload)});
      const txt=await r.text();
      let id=""; try{ const d=JSON.parse(txt); id=d.id||(d.appointment&&d.appointment.id)||""; }catch(_){ const m=/"id"\s*:\s*"([^"]+)"/.exec(txt); id=m?m[1]:""; }
      return json({ok:r.ok, status:r.status, id, detail:txt.slice(0,300)});
    }
    return json({error:"unknown action"},400);
  }catch(e){ return json({error:String(e)},500); }
});
