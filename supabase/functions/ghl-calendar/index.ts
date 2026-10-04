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
const H = (t:string)=>({Authorization:"Bearer "+t,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"});

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  const json=(o:any,code=200)=>new Response(JSON.stringify(o),{status:code,headers:{...CORS,"Content-Type":"application/json"}});
  try{
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
