/* Texts vs email. Run with a server on :8771.

   A conversation in the wrong tab is an annoyance. One that has silently
   vanished from both is a lost customer — so the property under test is
   that every conversation lands in exactly one of the two, whatever the
   API did or did not tell us about its channel. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   const ch=window.bpConvChannel;
   const convos=[
     {id:'1',name:'Explicit email',  type:'TYPE_EMAIL', phone:'5125550101', email:'a@x.com'},
     {id:'2',name:'Explicit sms',    type:'TYPE_SMS',   phone:'5125550102', email:'b@x.com'},
     {id:'3',name:'lastMessageType', lastMessageType:'TYPE_EMAIL', phone:'5125550103'},
     {id:'4',name:'Email only',      email:'d@x.com'},
     {id:'5',name:'Phone only',      phone:'5125550105'},
     {id:'6',name:'Both, unknown',   phone:'5125550106', email:'f@x.com'},
     {id:'7',name:'Nothing at all'},
     {id:'8',name:'Call',            type:'TYPE_CALL',  phone:'5125550108'}
   ];
   const got=convos.map(c=>({id:c.id,ch:ch(c)}));
   const everyOne=got.every(g=>g.ch==='sms'||g.ch==='email');
   const byId=Object.fromEntries(got.map(g=>[g.id,g.ch]));
   return {
     everyOne,
     explicitEmail: byId['1']==='email',
     explicitSms:   byId['2']==='sms',
     lastMessageType: byId['3']==='email',
     emailOnly:     byId['4']==='email',
     phoneOnly:     byId['5']==='sms',
     // both present and no channel: unknown, so it goes where a contractor looks first
     bothDefaultsToTexts: byId['6']==='sms',
     nothingDefaultsToTexts: byId['7']==='sms',
     callIsNotEmail: byId['8']==='sms',
     // counts must partition, never overlap or drop
     partitions: got.filter(g=>g.ch==='sms').length + got.filter(g=>g.ch==='email').length === convos.length,
     nullSafe: ch(null)==='sms'&&ch(undefined)==='sms',
     pagesExist: typeof bpEmailPage==='function'&&typeof bpRenderMessaging==='function'
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad=Object.values(r).some(v=>v!==true)||errs.length;
 console.log(bad?'FAIL':'inbox split behaves · nothing falls between the two');
 await b.close(); process.exit(bad?1:0);
})();
