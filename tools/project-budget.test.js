/* Project budgets. Run with a server on :8771.

   A budget is a COST ceiling, not a price, and the numbers have to be
   pessimistic where they are uncertain: a job that looks under budget when
   it is not is worse than no budget at all, because the contractor stops
   watching. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:1000}});
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 p.on('console',m=>{if(m.type()==='error'&&!/supabase|unpkg|jsdelivr|net::|Failed to load|favicon/i.test(m.text()))errs.push('console: '+m.text())});
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   const job={id:'j1',name:'Smith',title:'Re-roof',status:'active',estimate:20000,collected:null,
     photos:[],docs:[],sched:{},expenses:[],
     budget:{'Materials':8000,'Labor / crew':5000}};
   localStorage.setItem('bpJobs',JSON.stringify([job])); window._bpJobs=[job];
   document.getElementById('bpxViewArea').innerHTML='<div id="bpx-pj-budget"></div><div id="bpx-pj-exps"></div>';
   window._bpProjId='j1';

   const read=()=>document.getElementById('bpx-pj-budget').innerHTML;

   // under budget
   window._bpProjExp=[{cat:'Materials',amt:'3000'}];
   window._bpProjBudget=null; bpProjBudgetRender();
   const under=read();

   // over on one line, still under overall
   window._bpProjExp=[{cat:'Materials',amt:'9000'},{cat:'Labor / crew',amt:'1000'}];
   window._bpProjBudget=null; bpProjBudgetRender();
   const oneOver=read();

   // over overall, still under the estimate
   window._bpProjExp=[{cat:'Materials',amt:'9000'},{cat:'Labor / crew',amt:'6000'}];
   window._bpProjBudget=null; bpProjBudgetRender();
   const over=read();

   // past the estimate: now losing money
   window._bpProjExp=[{cat:'Materials',amt:'14000'},{cat:'Labor / crew',amt:'9000'}];
   window._bpProjBudget=null; bpProjBudgetRender();
   const losing=read();

   // spend under a category with NO budget line must still count
   window._bpProjExp=[{cat:'Materials',amt:'3000'},{cat:'Fuel',amt:'2000'}];
   window._bpProjBudget=null; bpProjBudgetRender();
   const unbudgeted=read();

   // no budget at all
   const bare=Object.assign({},job); delete bare.budget;
   localStorage.setItem('bpJobs',JSON.stringify([bare])); window._bpJobs=[bare];
   window._bpProjExp=[]; window._bpProjBudget=null; bpProjBudgetRender();
   const none=read();

   return {
     underShowsLeft: under.includes('5,000 left'),
     underNoWarning: !under.includes('over its budget'),
     oneOverFlagsLine: oneOver.includes('1,000 over'),
     oneOverNoGlobalAlarm: !oneOver.includes('over its budget'),
     overWarns: over.includes('over its budget'),
     overStillProfitable: over.includes('margin you planned has gone'),
     losingSaysSo: losing.includes('losing money'),
     // $3000 + $2000 unbudgeted = $5000 against $13,000 budgeted
     unbudgetedCounted: unbudgeted.includes('$5,000</b><span>spent'),
     noneSuggests: none.includes('No budget set')&&none.includes('$13,000'),
     profitShown: under.includes('profit if it lands here')
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad=Object.values(r).some(v=>v!==true)||errs.length;
 console.log(bad?'FAIL':'project budgets behave');
 await b.close(); process.exit(bad?1:0);
})();
