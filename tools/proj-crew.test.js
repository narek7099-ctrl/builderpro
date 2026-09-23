/* Crew on a job. Run with a server on :8771.

   Assignment and hours are separate on purpose: contractors routinely
   assign four people and send three. The test that matters is that
   assigning somebody costs the job nothing until a day is actually
   logged — inferring one from the other would be wrong in whichever
   direction it guessed. */
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
     photos:[],docs:[],sched:{},expenses:[],budget:{'Labor / crew':4000}};
   localStorage.setItem('bpJobs',JSON.stringify([job])); window._bpJobs=[job];
   BP_CREW.emps=[
     {id:'e1',name:'Dave',trade:'Roofer',kind:'w2',pay_type:'hourly',rate:25,burden_pct:38,active:true},
     {id:'e2',name:'Sam', trade:'Labourer',kind:'w2',pay_type:'hourly',rate:18,burden_pct:38,active:true},
     {id:'e3',name:'Gone',kind:'w2',pay_type:'hourly',rate:20,burden_pct:0,active:false}
   ];
   BP_CREW.entries=[];
   document.getElementById('bpxViewArea').innerHTML='<div id="bpx-pj-crew"></div><div id="bpx-pj-budget"></div>';
   window._bpProjId='j1'; window._bpProjExp=[]; window._bpProjBudget=null;

   bpProjCrewRender();
   const inactiveHidden=!document.getElementById('bpx-pj-crew').innerHTML.includes('Gone');

   // assign two people
   bpProjCrewSet('e1',true); bpProjCrewSet('e2',true);
   const saved=JSON.parse(localStorage.getItem('bpJobs'))[0].crew;

   // assignment alone must cost the job nothing
   bpProjBudgetRender();
   const budgetAfterAssign=document.getElementById('bpx-pj-budget').innerHTML;
   const noPhantomCost=budgetAfterAssign.includes('$0 of $4,000')||budgetAfterAssign.includes('$4,000 left');

   // now a real day: 8h at $25+38% = $276
   BP_CREW.entries=[{id:'t1',employee_id:'e1',job_id:'j1',job_name:'Smith',worked_on:'2026-09-01',hours:8,ot_hours:0,cost:276}];
   bpProjCrewRender(); bpProjBudgetRender();
   const crewHtml=document.getElementById('bpx-pj-crew').innerHTML;
   const budgetHtml=document.getElementById('bpx-pj-budget').innerHTML;

   // unassigning must not delete the logged hours
   bpProjCrewSet('e2',false);
   const afterUnassign=bpProjLabour('j1');

   return {
     inactiveHidden,
     assignedBoth: Array.isArray(saved)&&saved.length===2&&saved.indexOf('e1')>=0,
     noPhantomCost,
     showsBurdenedRate: crewHtml.includes('$34.50/hr to you'),
     showsHoursOnPerson: crewHtml.includes('8 h')&&crewHtml.includes('$276'),
     budgetPicksItUp: budgetHtml.includes('$276'),
     labourSurvivesUnassign: afterUnassign===276,
     stillAssignedOne: JSON.parse(localStorage.getItem('bpJobs'))[0].crew.length===1
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad=Object.values(r).some(v=>v!==true)||errs.length;
 console.log(bad?'FAIL':'crew on a job behaves');
 await b.close(); process.exit(bad?1:0);
})();
