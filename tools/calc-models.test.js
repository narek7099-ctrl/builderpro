/* The calculator pricing models. Run with a server on :8771.

   Every trade we claim to support needs a model the pricing editor can open
   without crashing, and a shape the embed page can read. A missing field
   does not throw — it renders an empty input and quietly prices at zero. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   const WANT=['roofing','hvac','plumbing','electrical','general','landscaping','pools','trim','painting','countertops'];
   const out={missing:[],bad:[],idxWrong:[],noName:[]};
   const names=Object.fromEntries(BP_CALC_IDS);
   WANT.forEach(id=>{
     const d=BP_CALC_DEFS[id];
     if(!d){ out.missing.push(id); return; }
     if(!names[id]) out.noName.push(id);
     if(BP_CALC_IDX[id]===undefined) out.idxWrong.push(id);
     if(!d.unit||!Array.isArray(d.groups)||!d.groups.length){ out.bad.push(id+':shape'); return; }
     const pricing=d.groups.find(g=>g.prop==='pricing'||g.prop==='interiorScope');
     if(!pricing||!pricing.items.length) out.bad.push(id+':no pricing group');
     d.groups.forEach(g=>{
       if(!g.prop||!g.title||!Array.isArray(g.fields)||!Array.isArray(g.items)) { out.bad.push(id+'/'+g.prop+':group shape'); return; }
       g.items.forEach(it=>{
         if(!it.k||!it.l) out.bad.push(id+'/'+g.prop+':item missing k or l');
         // every declared field must actually be present and numeric
         g.fields.forEach(f=>{ if(typeof it[f]!=='number') out.bad.push(id+'/'+g.prop+'/'+it.k+':'+f); });
       });
       // a multiplier of 0 would zero the whole estimate
       if(g.flat) g.items.forEach(it=>{ if(!(it.v>0)) out.bad.push(id+'/'+g.prop+'/'+it.k+':v<=0'); });
     });
   });
   // what contractors actually type in the trade box must reach the right
   // calculator. Matching on the calculator's own name missed all of these.
   const alias={};
   [['Plumber','plumbing'],['plumbing contractor','plumbing'],['Electrician','electrical'],
    ['General Contractor','general'],['GC','general'],['Remodeling','general'],
    ['Roofer','roofing'],['Painter','painting'],['Landscaper','landscaping'],
    ['Pool Builder','pools'],['Finish Carpenter','trim'],['Granite & Quartz','countertops'],
    ['Heating and Air','hvac'],['Air Conditioning','hvac']
   ].forEach(([typed,want])=>{
     window._bpSettingsStub={company:{trade:typed}};
     const got=(function(){ const real=window.bpSettingsGet;
       window.bpSettingsGet=()=>window._bpSettingsStub;
       const id=bpCalcAssigned(); window.bpSettingsGet=real; return id; })();
     if(got!==want) alias[typed]=got+' (wanted '+want+')';
   });
   out.alias=alias;
   return {out, count:Object.keys(BP_CALC_DEFS).length, ids:BP_CALC_IDS.length};
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const o=r.out;
 const bad=Object.keys(o.alias||{}).length||o.missing.length||o.bad.length||o.idxWrong.length||o.noName.length||r.count!==10||r.ids!==10||errs.length;
 console.log(bad?'FAIL':'all ten trades have a usable model');
 await b.close(); process.exit(bad?1:0);
})();
