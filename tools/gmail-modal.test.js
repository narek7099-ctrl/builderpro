/* The Gmail setup dialog. Run with a server on :8771.

   Written after it shipped looking like debris: the rule styling the step
   number as a round badge was `.ls-steps b`, which also caught every bold
   word inside the sentences — so "New project" and "Save" each became their
   own little circle on their own line. Computed style, not markup, because
   the markup looked perfectly reasonable the whole time. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:1100}});
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   document.getElementById('bpx').style.display='block';
   window.BP_URL='https://proj.supabase.co';
   window._lsSources=[{id:'a1',vendor:'angi',label:'Angi',secret:'k1',inbox_slug:'ab3k9x2p7q'}];
   lsGmail('a1');
   const card=document.querySelector('#bpx-modal .bpx-modalcard');
   const steps=[...document.querySelectorAll('.ls-steps > li')];
   const num=steps[0].querySelector('i');
   const bold=steps[0].querySelector('b');
   const cs=el=>getComputedStyle(el);
   return {
     wide: card.classList.contains('wide')&&card.getBoundingClientRect().width>600,
     fourSteps: steps.length===4,
     // the number is a circle
     numIsBadge: cs(num).borderRadius.startsWith('50%')&&Math.round(parseFloat(cs(num).width))===24,
     // and the bold words inside the sentence are NOT
     boldIsInline: cs(bold).display==='inline'&&!cs(bold).borderRadius.startsWith('50%'),
     // each step is one flex row: number beside text, not stacked
     oneRowPerStep: steps.every(li=>{
       const i=li.querySelector('i').getBoundingClientRect();
       const s=li.querySelector('span').getBoundingClientRect();
       return s.left > i.right - 1 && Math.abs(s.top - i.top) < 14;
     }),
     // the sentence is not shredded across many lines
     firstStepLines: Math.round(steps[0].querySelector('span').getBoundingClientRect().height
                     / parseFloat(cs(steps[0].querySelector('span')).lineHeight)),
     logoIsWordmark: true
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad = !r.wide||!r.fourSteps||!r.numIsBadge||!r.boldIsInline||!r.oneRowPerStep
   || r.firstStepLines>3 || errs.length;
 console.log(bad?'FAIL':'gmail setup dialog reads as a list');
 await b.close(); process.exit(bad?1:0);
})();
