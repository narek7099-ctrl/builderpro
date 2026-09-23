/* The Lead Sources page, with a stubbed Supabase. Checks the page renders
   from real-shaped rows and that the webhook URL it hands out is the one the
   intake function expects — a wrong URL here looks like a broken vendor. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:1000}});
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 p.on('console',m=>{if(m.type()==='error'&&!/supabase|unpkg|jsdelivr|net::|Failed to load|favicon/i.test(m.text()))errs.push('console: '+m.text())});
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(async()=>{
   const now=Date.now(), day=864e5;
   const sources=[
     {id:'11111111-1111-1111-1111-111111111111',vendor:'angi',label:'Angi — roofing',secret:'abc123',
      inbox_slug:'ab3k9x2p7q',cost_per_lead:65,active:true,total_leads:2,last_lead_at:new Date(now-2*3600e3).toISOString()},
     {id:'22222222-2222-2222-2222-222222222222',vendor:'website',label:'My site',secret:'',
      inbox_slug:'mn4r7t8w2v',cost_per_lead:null,active:false,total_leads:1,last_lead_at:new Date(now-5*day).toISOString()}
   ];
   const events=[
     {id:'e1',source_id:sources[0].id,name:'Dana Whitfield',phone:'(512) 555-0134',email:'d@x.com',
      address:'7710 Highland Ave',job:'Roof replacement',status:'accepted',cost:65,received_at:new Date(now-2*3600e3).toISOString(),reason:''},
     {id:'e2',source_id:sources[0].id,name:'Dana Whitfield',phone:'512.555.0134',email:'d@x.com',
      address:'',job:'',status:'duplicate',cost:null,received_at:new Date(now-1*3600e3).toISOString(),reason:'same phone or email inside 30 days'},
     {id:'e3',source_id:sources[1].id,name:'Marco Reyes',phone:'5125550199',email:'',
      address:'88 Elm St',job:'Gutter repair',status:'accepted',cost:null,received_at:new Date(now-5*day).toISOString(),reason:''}
   ];
   const table=n=>{const rows=n==='lead_sources'?sources:events;
     const q={select:()=>q,order:()=>q,limit:()=>q,then:(f)=>Promise.resolve({data:rows}).then(f)};return q;};
   window.BP_LIVE=true; window.BP_URL='https://proj.supabase.co';
   window.BP_SB={from:table};
   bpLeadSources();
   await new Promise(x=>setTimeout(x,300));
   const h=document.getElementById('bpxViewArea').innerHTML;
   return {
     url:(h.match(/https:\/\/proj\.supabase\.co\/functions\/v1\/lead-intake\/[0-9a-f-]+(\?k=\w+)?/g)||[]),
     bothCards:h.includes('Angi — roofing')&&h.includes('My site'),
     pausedShown:h.includes('Paused')&&h.includes('Live'),
     leadRow:h.includes('Dana Whitfield')&&h.includes('Marco Reyes'),
     dupBadge:h.includes('duplicate'),
     costPerLead:h.includes('$65'),
     warned:h.includes('Treat it like a password'),
     hasChart:h.includes('bpc-plot')||h.includes('<svg'),
     exportFn:typeof window.bpCsvLeadEvents==='function',
     testFn:typeof window.lsTest==='function',
     gmailBtn:(h.match(/lsGmail\(/g)||[]).length===2&&h.includes('Set up Gmail reader'),
     scriptFn:typeof window.lsScriptFor==='function'||typeof lsScriptFor==='function',
     sendersFn:typeof window.lsSenders==='function'
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const wantA='https://proj.supabase.co/functions/v1/lead-intake/11111111-1111-1111-1111-111111111111?k=abc123';
 const wantB='https://proj.supabase.co/functions/v1/lead-intake/22222222-2222-2222-2222-222222222222';
 const bad = !r.url.includes(wantA) || !r.url.includes(wantB) || !r.bothCards || !r.pausedShown
   || !r.leadRow || !r.dupBadge || !r.warned || !r.exportFn || !r.testFn || !r.gmailBtn || !r.sendersFn || errs.length;
 console.log(bad?'FAIL':'lead sources page behaves');
 await b.close(); process.exit(bad?1:0);
})();
