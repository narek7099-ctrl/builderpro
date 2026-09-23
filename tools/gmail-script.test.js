/* The generated Apps Script. Run with a server on :8771.

   Worth testing precisely because nobody reviews it: the contractor pastes
   it whole into Google and it either works or silently does nothing. The
   cases below are the three ways it could be wrong without anyone noticing
   — wrong endpoint, wrong source, or a search that matches too much. */
const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage();
 const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
 await p.route('**://**',r=>r.request().url().startsWith('http://localhost:8771')?r.continue():r.abort());
 await p.goto('http://localhost:8771/index.html',{waitUntil:'domcontentloaded'});
 const r=await p.evaluate(()=>{
   window.BP_URL='https://proj.supabase.co';
   const angi={id:'a1',vendor:'angi',label:'Angi',secret:'srckey123',inbox_slug:'ab3k9x2p7q'};
   const local={id:'g1',vendor:'generic',label:'Acme',secret:'k2',inbox_slug:'mn4r7t8w2v',
                sender_domains:'leads@acmeleads.com'};
   const bare={id:'g2',vendor:'generic',label:'Nobody',secret:'k3',inbox_slug:'zz9q8w7e6r'};
   // a source with no inbox slug must produce NO script at all. The old
   // fallback made '@leads.builderpro-os.com' — a script that ran fine and
   // filed nothing, because the endpoint could not tell which source it was.
   const slugless={id:'x1',vendor:'angi',label:'Angi',secret:'k9'};
   const a=lsScriptFor(angi), g=lsScriptFor(local);
   return {
     endpoint:a.includes("ENDPOINT = 'https://proj.supabase.co/functions/v1/lead-email?k=srckey123'"),
     perSourceKey:a.includes('srckey123')&&!a.includes('k2'),
     inbox:a.includes("ab3k9x2p7q@"),
     search:(a.match(/var SEARCH   = '([^']*)'/)||[])[1],
     localSearch:(g.match(/var SEARCH   = '([^']*)'/)||[])[1],
     bareSearch:(lsScriptFor(bare).match(/var SEARCH   = '([^']*)'/)||[])[1],
     guard:a.includes('if (!SEARCH) return;'),
     labels:a.includes('addLabel(label)'),
     installs:a.includes('everyMinutes(5)'),
     deletesOldTriggers:a.includes('deleteTrigger'),
     noSend:!/sendEmail|GmailApp\.send|moveToTrash|\.delete\(/.test(a),
     // the script is pasted as-is: a stray backtick or unescaped quote breaks it
     parses:(()=>{ try{ new Function(a); return true; }catch(e){ return String(e); } })(),
     noSlugNoScript: lsScriptFor(slugless)==='',
     inboxHasSlugBeforeAt: /var INBOX    = '[a-z2-9]{10}@/.test(a)
   };
 });
 console.log(JSON.stringify(r,null,1));
 console.log('ERRORS:',errs.length?errs:'none');
 const bad = !r.endpoint || !r.perSourceKey || !r.inbox || !r.guard || !r.labels
   || !r.installs || !r.deletesOldTriggers || !r.noSend || r.parses!==true
   || !/from:angi\.com/.test(r.search) || !/newer_than:1d/.test(r.search)
   || !/from:acmeleads\.com/.test(r.localSearch)
   || r.bareSearch !== ''     // no senders configured must mean no search at all
   || !r.noSlugNoScript || !r.inboxHasSlugBeforeAt;
 console.log(bad?'FAIL':'generated gmail script behaves');
 await b.close(); process.exit(bad?1:0);
})();
