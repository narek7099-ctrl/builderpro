import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS" };
const LOCATION = "aUs7E5m1gmLXoeIV3WM9";
const API = "https://services.leadconnectorhq.com";
const H = (t:string)=>({Authorization:"Bearer "+t,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"});

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response("ok",{headers:CORS});
  const json=(o:any,code=200)=>new Response(JSON.stringify(o),{status:code,headers:{...CORS,"Content-Type":"application/json"}});
  try{
    const token=Deno.env.get("GHL_TOKEN"); if(!token) return json({error:"NO_TOKEN"},400);
    const body=await req.json().catch(()=>({}));
    const action=body.action||"list";

    if(action==="list"){
      const r=await fetch(API+`/conversations/search?locationId=${LOCATION}&limit=30`,{headers:H(token)});
      if(!r.ok) return json({ok:false,status:r.status,detail:(await r.text()).slice(0,300)});
      const d=await r.json();
      const conversations=(d.conversations||[]).map((c:any)=>({
        id:c.id, contactId:c.contactId, name:c.contactName||c.fullName||"(no name)",
        phone:c.phone||"", email:c.email||"",
        last:c.lastMessageBody||"", lastType:c.lastMessageType||"", lastDate:c.lastMessageDate||c.dateUpdated,
        dir:c.lastMessageDirection||"", unread:c.unreadCount||0
      }));
      return json({ok:true, conversations});
    }

    if(action==="thread"){
      if(!body.id) return json({error:"missing id"},400);
      const r=await fetch(API+`/conversations/${body.id}/messages`,{headers:H(token)});
      if(!r.ok) return json({ok:false,status:r.status,detail:(await r.text()).slice(0,300)});
      const d=await r.json();
      const raw=(d.messages?.messages)||[];
      const messages=raw.map((m:any)=>({
        id:m.id, dir:m.direction, body:m.body||"", date:m.dateAdded,
        type:m.messageType||"", status:m.status||"",
        activity: m.messageType==="TYPE_ACTIVITY_APPOINTMENT" ? (m.activity?.title||"Appointment update") : null
      })).reverse();
      return json({ok:true, messages});
    }

    if(action==="send"){
      // type: "SMS" or "Email"; needs contactId; Email also needs subject
      const payload:any={ type: body.msgType||"SMS", contactId: body.contactId, message: body.message };
      if((body.msgType==="Email")){
        payload.subject=body.subject||"Message from your roofer";
        payload.html=body.html||body.message;
        // plain-text copy for clients that do not show HTML
        if(body.html) payload.message=String(body.text||body.message||"").slice(0,20000);
      }
      // attachments: public file URLs (the portal uploads them to the mail-attachments bucket)
      if(Array.isArray(body.attachments)){
        const urls=body.attachments.filter((u:unknown)=>typeof u==="string"&&/^https:\/\//.test(u)).slice(0,10);
        if(urls.length) payload.attachments=urls;
      }
      const r=await fetch(API+`/conversations/messages`,{method:"POST",headers:H(token),body:JSON.stringify(payload)});
      const txt=await r.text();
      return json({ok:r.ok, status:r.status, detail:txt.slice(0,400)});
    }

    return json({error:"unknown action"},400);
  }catch(e){ return json({error:String(e)},500); }
});
