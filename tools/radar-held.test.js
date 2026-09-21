/* The claimed-doors list. It exists because there used to be two lists —
   this one, from radar_claims, and a "My list" page from contacts tagged
   'radar' — and they disagreed: three claimed doors above an empty list. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:900}});
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   const day=864e5, iso=d=>new Date(Date.now()+d).toISOString();
   window._rdMine={
     'A-1':{door:'A-1',address:'12031 W SHERMAN ROAD',state:'claimed', expires_at:iso(14*day)},
     'B-2':{door:'B-2',address:'7650 N ETHEL AVE',    state:'contacted',expires_at:iso(2*day)},
     'C-3':{door:'C-3',address:'7702 N FULTON AVE',   state:'won',      expires_at:iso(9*day)}
   };
   document.getElementById('bpxViewArea').innerHTML='<div id="rdHeldList"></div><button id="rdMineTab"></button>';
   rdHeldRender();
   const h=document.getElementById('rdHeldList').innerHTML;
   const addrs=['12031 W SHERMAN ROAD','7650 N ETHEL AVE','7702 N FULTON AVE'].filter(a=>h.includes(a));
   const order=[...document.querySelectorAll('#rdHeldList tbody tr td:first-child')].map(td=>td.textContent);
   // moving a door along the ladder is optimistic, so the cell changes without a server
   const before=window._rdMine['A-1'].state;
   window.BP_LIVE=false; rdClaimStage('A-1','contacted');
   return {
     rendered:addrs.length,
     lapsingFirst:order[0]==='7650 N ETHEL AVE',       // 2 days left, so first
     hasFunnel:h.includes('rd-funnel'),
     talkedCount:/<b>2<\/b><span>talked/.test(document.getElementById('rdHeldList').innerHTML)||h.includes('talked'),
     lookupBtn:(h.match(/rdLookup\(/g)||[]).length,
     stageBtn:h.includes('rdClaimStage('),
     wonBadge:h.includes('Won'),
     tabCount:document.getElementById('rdMineTab').textContent,
     stageMoved:before==='claimed'&&window._rdMine['A-1'].state==='contacted',
     exportFn:typeof window.bpCsvHeld==='function',
     noOldPage:!/My list — leads you added/.test(document.documentElement.innerHTML)
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad = r.rendered!==3 || !r.lapsingFirst || !r.hasFunnel || r.lookupBtn!==3
   || !r.stageBtn || !r.stageMoved || !r.exportFn || !r.noOldPage || r.tabCount!=='Yours (3)';
 console.log(bad?'FAIL':'claimed-doors list behaves');
 await b.close(); process.exit(bad?1:0);
})();
