/* Labour costing. Run with a server on :8771.

   These numbers decide whether a contractor thinks a job made money. A
   burden that silently reads zero, or overtime at straight time, produces a
   job that looks profitable and was not — and nothing in the UI would look
   wrong. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 p.on('console',m=>{if(m.type()==='error'&&!/supabase|unpkg|jsdelivr|net::|Failed to load|favicon/i.test(m.text()))errs.push('console: '+m.text())});
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   const round=n=>Math.round(n*100)/100;
   const hourly={id:'e1',name:'Dave',kind:'w2',pay_type:'hourly',rate:25,burden_pct:38,active:true};
   const bare  ={id:'e2',name:'Sam', kind:'w2',pay_type:'hourly',rate:25,burden_pct:0, active:true};
   const sub   ={id:'e3',name:'Ace', kind:'1099',pay_type:'hourly',rate:40,burden_pct:0,active:true};
   const daily ={id:'e4',name:'Lee', kind:'w2',pay_type:'day',rate:240,burden_pct:25,active:true};
   const sal   ={id:'e5',name:'Pat', kind:'w2',pay_type:'salary',rate:83200,burden_pct:25,active:true};

   BP_CREW.emps=[hourly,bare,sub,daily,sal];
   BP_CREW.entries=[
     {id:'t1',employee_id:'e1',job_id:'j1',job_name:'Smith',worked_on:'2026-09-01',hours:8,ot_hours:0,cost:276},
     {id:'t2',employee_id:'e1',job_id:'j1',job_name:'Smith',worked_on:'2026-09-02',hours:8,ot_hours:2,cost:379.5},
     {id:'t3',employee_id:'e3',job_id:'j2',job_name:'Jones',worked_on:'2026-09-02',hours:8,ot_hours:0,cost:320}
   ];

   return {
     // $25 + 38% = $34.50/hr
     burdened: round(bpBurdenedRate(hourly)),
     bareIsWage: round(bpBurdenedRate(bare)),
     // a 1099 has no burden to add
     subNoBurden: round(bpBurdenedRate(sub)),
     // $240/day over 8 hours = $30, +25% = $37.50
     dayRate: round(bpBurdenedRate(daily)),
     // $83,200 over a nominal 2080-hour year = $40, +25% = $50
     salaryRate: round(bpBurdenedRate(sal)),
     // the job's labour line: 276 + 379.5
     jobLabour: round(bpProjLabour('j1')),
     otherJob: round(bpProjLabour('j2')),
     unknownJob: bpProjLabour('nope'),
     jobHours: bpProjHours('j1'),
     activeExcludesNobody: bpEmpsActive().length
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const want={burdened:34.5,bareIsWage:25,subNoBurden:40,dayRate:37.5,salaryRate:50,
   jobLabour:655.5,otherJob:320,unknownJob:0,activeExcludesNobody:5};
 const bad=Object.keys(want).some(k=>r[k]!==want[k])
   || r.jobHours.hours!==16 || r.jobHours.ot!==2 || r.jobHours.people!==1 || errs.length;
 if(bad) Object.keys(want).forEach(k=>{ if(r[k]!==want[k]) console.log('  mismatch '+k+': got '+r[k]+' want '+want[k]); });
 console.log(bad?'FAIL':'labour costing behaves');
 await b.close(); process.exit(bad?1:0);
})();
