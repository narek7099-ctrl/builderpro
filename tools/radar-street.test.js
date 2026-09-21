const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   window.bpJobsGet=function(){return [{id:'j1',name:'Smith re-roof',addr:'7710 Highland Ave, Austin TX 78704',completed_at:'2026-08-01'}];};
   const st={a:rdStreetOf('7710 Highland Ave, Austin TX'),b:rdStreetOf('7712 HIGHLAND AVENUE'),c:rdStreetOf('12 Oak Ln')};
   const mk=(addr)=>({lat:30.25,lng:-97.75,addr:addr,base:70,age:22,ageExact:22,year:2004,kind:'due',desc:'x'});
   const same=mk('7712 Highland Ave'), other=mk('88 Elm St'), self=mk('7710 Highland Ave');
   const leads=[same,other,self];
   leads.forEach(l=>{l.door=rdDoorKey(l.addr);});
   rdRescore(leads,RADAR_TRADES[Object.keys(RADAR_TRADES)[0]],[],[]);
   return {st, sameFlag:!!same.myJob, otherFlag:!!other.myJob, selfSkipped:!self.myJob,
           boosted:same.score>other.score, sameScore:same.score, otherScore:other.score,
           why:same.why};
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad = r.st.a!==r.st.b || r.st.a===r.st.c || !r.sameFlag || r.otherFlag || !r.selfSkipped || !r.boosted;
 console.log(bad?'FAIL':'own-street head-start behaves');
 await b.close(); process.exit(bad?1:0);
})();
