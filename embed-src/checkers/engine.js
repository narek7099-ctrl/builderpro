/* Health / Damage checker engine — one engine, per-trade data in trades.js.
   The build (tools/build-checkers.py) prepends:
     var CK_TOOL='health'|'damage', CK_TRADE='<trade>', CK_WEBHOOK='<the trade calculator's lead webhook>';
   Each finished check is filed exactly like the Roof Age Checker:
     - a row in roof_checks (calc_id = '<tool>:<trade>') so it shows in the portal
       under Lead Radar → Checks, and
     - a POST to the trade calculator's lead webhook with tool:'health'|'damage'. */
(function(){
var SB='https://ttzwzouhiwdwamuimhpo.supabase.co';
var ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0end6b3VoaXdkd2FtdWltaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTc2NjgsImV4cCI6MjA5ODY5MzY2OH0.oVqdHZlZLWJd_8nkgPRA9VgAqY4ytg51N1mT3Hqekso';
var AI_TIMEOUT=20000, SCAN_MIN=2600, SCAN_MAX=4500;
var T=CK_TRADES[CK_TRADE], TOOL=CK_TOOL;
var OWN=''; try{OWN=(new URLSearchParams(location.search).get('u')||'').replace(/[^0-9a-f-]/gi,'');}catch(e){}
var CFG={company:'',bookingUrl:'',cost:JSON.parse(JSON.stringify(T.cost)),owner:OWN||null};
var S={i:0,ans:{},photos:[],ai:null,aiState:'idle',aiStart:0,saved:false,contact:{}};
var $=function(id){return document.getElementById(id);};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var money=function(n){n=Math.round(n/50)*50;return '$'+n.toLocaleString('en-US');};
var range=function(r){return money(r[0])+' – '+money(r[1]);};

/* owner's prices and booking link: same row the trade's calculator reads */
try{
  fetch(SB+'/rest/v1/calculator_pricing?calc_id=eq.'+CK_TRADE+(OWN?'&owner=eq.'+OWN:'')+'&select=pricing,owner',{headers:{apikey:ANON,Authorization:'Bearer '+ANON}})
  .then(function(r){return r.ok?r.json():[];}).then(function(rows){
    if(!rows||!rows.length)return; var p=rows[0].pricing||{};
    if(rows[0].owner)CFG.owner=rows[0].owner;
    if(typeof p.bookingUrl==='string')CFG.bookingUrl=p.bookingUrl;
    if(typeof p.companyName==='string')CFG.company=p.companyName;
    var c=p.checker||{}; ['maint','repair','major'].forEach(function(k){var v=c[k];if(Array.isArray(v)&&v.length===2&&+v[0]>=0&&+v[1]>=+v[0])CFG.cost[k]=[+v[0],+v[1]];});
  }).catch(function(){});
}catch(e){}

/* ---------- screens ---------- */
var COMMON_DMG=[
  {id:'cause',q:'What happened?',opts:['Storm or weather — recently','Sudden event (impact, burst, accident)','It got worse slowly over time','Not sure']},
  {id:'extent',q:'How big is the damage?',opts:['One small spot','One area','Several areas','Widespread']}
];
function screens(){
  if(TOOL==='health'){
    var a=[{k:'intro'}]; T.health.qs.forEach(function(q){a.push({k:'q',q:q});}); a.push({k:'contact'}); a.push({k:'result'}); return a;
  }
  var d=T.damage;
  return [{k:'photos'},{k:'scan'},
    {k:'dq',q:{id:'where',q:'Where is the damage?',opts:d.where.map(function(w){return w[0];})}},
    {k:'dq',q:COMMON_DMG[0]},{k:'dq',q:COMMON_DMG[1]},
    {k:'dq',q:{id:'worse',q:d.worse,opts:d.worseOpts}},
    {k:'contact'},{k:'report'}];
}
var SC=screens();
function go(n){
  var back=n<S.i; S.i=n; var s=SC[n], st=$('ck-stage');
  var total=SC.length-1; $('ck-bar').style.width=Math.round(n/total*100)+'%';
  $('ck-cnt').textContent=n<total?(n+1)+'/'+total:'Done';
  $('ck-back').hidden=!(n>0&&n<total&&s.k!=='scan'&&SC[n-1].k!=='scan');
  var h='';
  if(s.k==='intro')h=introHtml();
  else if(s.k==='q'||s.k==='dq')h=qHtml(s.q,s.k==='dq');
  else if(s.k==='contact')h=contactHtml();
  else if(s.k==='photos')h=photosHtml();
  else if(s.k==='scan')h=scanHtml();
  else if(s.k==='result')h=resultHtml();
  else if(s.k==='report')h='<div class="ck-card"><div class="ck-scanmsg"><span class="ck-spin"></span>Finishing your damage report…</div></div>';
  st.innerHTML=h.replace('class="ck-card"','class="ck-card'+(back?' back':'')+'"');
  try{window.scrollTo(0,0);}catch(e){}
  if(s.k==='scan')runScan();
  if(s.k==='report')finishReport();
  if(s.k==='result')save(lastHealth);
  if(s.k==='photos')bindPhotos();
  try{parent.postMessage({bp:'checker-step',tool:TOOL,trade:CK_TRADE,step:n,of:total},'*');}catch(e){}
}
window.ckBack=function(){if(S.i>0)go(S.i-1);};

function introHtml(){
  var n=T.health.qs.length;
  return '<div class="ck-card"><p class="ck-kicker">'+esc(T.name)+' · free check</p><h1 class="ck-h">'+esc(T.health.title)+'</h1>'
    +'<p class="ck-sub">'+n+' quick taps, about 30 seconds. You\'ll get a health score for your '+esc(T.noun)+', what each answer means, and a rough cost for any work.</p>'
    +'<button class="e-btnmain ck-main" onclick="ckNext()">Start my check</button>'
    +'<div class="ck-meta"><span>✓ No sign-up needed</span><span>✓ Instant result</span></div></div>';
}
window.ckNext=function(){go(S.i+1);};
function qHtml(q,dmg){
  var cur=S.ans[q.id];
  var opts=q.opts.map(function(o,i){var lab=dmg?o:o[0];return '<button class="ck-opt'+(cur&&cur.i===i?' on':'')+'" onclick="ckPick(\''+q.id+'\','+i+',this)"><b></b><span>'+esc(lab)+'</span></button>';}).join('');
  return '<div class="ck-card"><h2 class="ck-h">'+esc(q.q)+'</h2>'+(q.hint?'<p class="ck-sub">'+esc(q.hint)+'</p>':'<p class="ck-sub">Tap one.</p>')+'<div class="ck-opts">'+opts+'</div></div>';
}
window.ckPick=function(id,i,btn){
  var s=SC[S.i], q=s.q, o=q.opts[i];
  S.ans[id]=s.k==='dq'?{i:i,label:o,q:q.q}:{i:i,label:o[0],pts:o[1],mean:o[2],q:q.q};
  var bs=btn.parentNode.querySelectorAll('.ck-opt'); for(var k=0;k<bs.length;k++)bs[k].classList.toggle('on',bs[k]===btn);
  setTimeout(function(){if(SC[S.i]===s)go(S.i+1);},180);
};
function contactHtml(){
  var c=S.contact;
  return '<div class="ck-card"><h2 class="ck-h">Where should we send your '+(TOOL==='health'?'result':'report')+'?</h2><p class="ck-sub">Optional — leave a number and we\'ll follow up with a free inspection time.</p>'
    +'<label class="ck-f"><span>Name</span><input id="ck-name" autocomplete="name" value="'+esc(c.name)+'"></label>'
    +'<label class="ck-f"><span>Phone</span><input id="ck-phone" type="tel" autocomplete="tel" inputmode="tel" value="'+esc(c.phone)+'"></label>'
    +'<label class="ck-f"><span>Email</span><input id="ck-email" type="email" autocomplete="email" value="'+esc(c.email)+'"></label>'
    +'<label class="ck-f"><span>ZIP or address</span><input id="ck-addr" autocomplete="postal-code" value="'+esc(c.addr)+'"></label>'
    +'<button class="e-btnmain ck-main" id="ck-go" onclick="ckContact(false)">See my '+(TOOL==='health'?'health score':'damage report')+' →</button>'
    +'<button class="ck-link" onclick="ckContact(true)">Skip and see it</button></div>';
}
window.ckContact=function(skip){
  var g=function(id){return (($(id)||{}).value||'').trim();};
  S.contact={name:g('ck-name'),phone:g('ck-phone'),email:g('ck-email'),addr:g('ck-addr')};
  if(!skip){
    var ph=S.contact.phone.replace(/\D/g,'');
    if(ph&&ph.length<10){$('ck-phone').classList.add('bad');$('ck-phone').focus();return;}
    if(S.contact.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(S.contact.email)){$('ck-email').classList.add('bad');$('ck-email').focus();return;}
  }
  if(TOOL==='health')lastHealth=computeHealth();
  go(S.i+1);
};

/* ---------- health ---------- */
var BANDS={good:{label:'Good',cls:'ck-good',db:'good'},watch:{label:'Watch',cls:'ck-watch',db:'mid'},act:{label:'Act soon',cls:'ck-act',db:'warn'},urgent:{label:'Urgent',cls:'ck-urgent',db:'bad'}};
var lastHealth=null;
function computeHealth(){
  var score=100, why=[];
  T.health.qs.forEach(function(q){var a=S.ans[q.id]; if(!a)return; score-=a.pts; why.push({pts:a.pts,q:q.q,a:a.label,mean:a.mean});});
  score=Math.max(5,Math.min(98,Math.round(score)));
  var band=score>=75?'good':score>=55?'watch':score>=35?'act':'urgent', c=CFG.cost, est, work;
  if(band==='good'){est=c.maint;work='Routine maintenance / tune-up';}
  else if(band==='watch'){est=[c.maint[0],Math.round((c.maint[1]+c.repair[1])/2)];work='Maintenance plus small repairs';}
  else if(band==='act'){est=c.repair;work='Repairs';}
  else {est=[c.repair[0],c.repair[1]];work='Repairs — replacement may be needed';}
  return {score:score,band:band,why:why,est:est,work:work,major:band==='urgent'||band==='act'?c.major:null};
}
function gauge(score,cls){
  var r=90, len=Math.PI*r, f=score/100, ang=-90+180*f;
  return '<div class="ck-gauge '+cls+'"><svg viewBox="0 0 220 128" aria-hidden="true">'
    +'<path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="var(--soft)" stroke-width="18" stroke-linecap="round"/>'
    +'<path d="M20 112 A90 90 0 0 1 200 112" fill="none" stroke="var(--c)" stroke-width="18" stroke-linecap="round" stroke-dasharray="'+(len*f).toFixed(1)+' '+len.toFixed(1)+'"/>'
    +'<g transform="rotate('+ang.toFixed(1)+' 110 112)"><line x1="110" y1="112" x2="110" y2="34" stroke="var(--txt)" stroke-width="3" stroke-linecap="round"/><circle cx="110" cy="112" r="6" fill="var(--txt)"/></g>'
    +'</svg><div class="num">'+score+'<small>out of 100</small></div></div>';
}
function resultHtml(){
  var r=lastHealth||computeHealth(); lastHealth=r; var B=BANDS[r.band];
  var bad=r.why.filter(function(w){return w.pts>0;}).sort(function(a,b){return b.pts-a.pts;});
  var steps=[];
  if(r.band==='good')steps=['Keep up routine maintenance — a check-up every 1–2 years.','Re-run this check after any big storm or change you notice.'];
  else {
    if(bad[0])steps.push('Biggest concern — '+bad[0].a.toLowerCase()+': '+bad[0].mean);
    if(bad[1])steps.push('Also worth checking — '+bad[1].a.toLowerCase()+': '+bad[1].mean);
    steps.push(r.band==='urgent'?'Book an inspection this week — waiting usually makes the repair bigger.':'Book an inspection in the next few weeks and get a written estimate.');
  }
  var ctas=bookCtas(r.band==='good');
  return '<div class="ck-card '+B.cls+'"><p class="ck-kicker" style="text-align:center">Your '+esc(T.noun)+' health</p>'+gauge(r.score,B.cls)
    +'<div class="ck-status">'+B.label+'</div>'
    +'<div class="ck-sec"><h3>What your answers mean</h3><div class="ck-why">'+r.why.map(function(w){return '<div><em class="'+(w.pts>0?'':'ok')+'">'+(w.pts>0?'−'+w.pts:'✓')+'</em><span><b>'+esc(w.a)+'.</b> '+esc(w.mean)+'</span></div>';}).join('')+'</div></div>'
    +'<div class="ck-sec"><h3>Recommended next steps</h3><ol class="ck-steps">'+steps.map(function(s){return '<li>'+esc(s)+'</li>';}).join('')+'</ol></div>'
    +'<div class="ck-sec"><h3>Rough cost of likely work</h3><div class="ck-cost"><span>'+esc(r.work)+'</span><b>'+range(r.est)+'</b></div>'
    +(r.major?'<div class="ck-cost"><span>If replacement is needed</span><b>'+range(r.major)+'</b></div>':'')
    +'<p class="ck-note">A ballpark from typical local pricing — an inspection gives you the real number.</p></div>'
    +ctas+'<button class="ck-link" onclick="ckRestart()">Start over</button></div>';
}
function bookCtas(estFirst){
  var est='<a class="ck-ghost" href="'+esc(estUrl())+'" target="_top" onclick="return ckEst()">Get a full estimate</a>';
  var book='<button class="e-btnmain ck-main" onclick="ckBook()">Book a free inspection</button>';
  return '<div class="ck-sec">'+(estFirst?est.replace('ck-ghost','ck-ghost')+book.replace('e-btnmain ck-main','ck-ghost'):book+est)+'</div>';
}
function estUrl(){return CK_TRADE+'.html'+(OWN?'?u='+OWN:'');}
window.ckEst=function(){try{parent.postMessage({bp:'estimate',trade:CK_TRADE},'*');}catch(e){} location.href=estUrl(); return false;};
window.ckBook=function(){
  try{parent.postMessage({bp:'book',trade:CK_TRADE,tool:TOOL,address:S.contact.addr||''},'*');}catch(e){}
  if(CFG.bookingUrl){window.open(CFG.bookingUrl,'_blank','noopener');return;}
  location.href=estUrl();
};
window.ckRestart=function(){S.ans={};S.photos=[];S.ai=null;S.aiState='idle';S.saved=false;lastHealth=null;go(0);};

/* ---------- damage: photos ---------- */
function photosHtml(){
  return '<div class="ck-card"><p class="ck-kicker">'+esc(T.name)+' · free damage check</p><h1 class="ck-h">'+esc(T.damage.title)+'</h1>'
    +'<p class="ck-sub">Snap 1–3 photos of the damage. We\'ll scan them, ask 4 quick questions, and give you a damage report with a repair estimate.</p>'
    +'<label class="ck-drop" id="ck-drop"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
    +'<span id="ck-droplab">Take or upload a photo</span><small>Up to 3 · close-up and one wider shot work best</small>'
    +'<input id="ck-file" type="file" accept="image/*" capture="environment" multiple hidden></label>'
    +'<div class="ck-thumbs" id="ck-thumbs"></div>'
    +'<button class="e-btnmain ck-main" id="ck-scanbtn" onclick="ckStartScan()" disabled>Scan my photos</button>'
    +'<button class="ck-link" onclick="ckNoPhoto()">No photo? Answer the questions instead</button></div>';
}
function bindPhotos(){
  var inp=$('ck-file'); if(!inp)return;
  inp.onchange=function(){
    var files=[].slice.call(inp.files||[]).filter(function(f){return /^image\//.test(f.type)||/\.(jpe?g|png|webp|heic)$/i.test(f.name);});
    var room=3-S.photos.length; files=files.slice(0,room);
    Promise.all(files.map(prep)).then(function(list){list.forEach(function(p){if(p)S.photos.push(p);});drawThumbs();});
    inp.value='';
  };
  drawThumbs();
}
function drawThumbs(){
  var el=$('ck-thumbs'); if(!el)return;
  el.innerHTML=S.photos.map(function(p,i){return '<div><img src="'+p.view+'" alt="Photo '+(i+1)+'"><button aria-label="Remove photo" onclick="ckDelPhoto('+i+')">×</button></div>';}).join('');
  var b=$('ck-scanbtn'); if(b)b.disabled=!S.photos.length;
  var d=$('ck-drop'); if(d)d.style.display=S.photos.length>=3?'none':'';
  var l=$('ck-droplab'); if(l)l.textContent=S.photos.length?'Add another photo':'Take or upload a photo';
}
window.ckDelPhoto=function(i){S.photos.splice(i,1);drawThumbs();};
/* downscale on the phone: 1024px for the scan, 320px thumbnails for the lead */
function prep(file){
  return new Promise(function(res){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var mk=function(max,q){var s=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*s));c.height=Math.max(1,Math.round(img.naturalHeight*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q);};
      var big=mk(1024,.82); res({view:big,data:big.split(',')[1],thumb:mk(320,.6)}); URL.revokeObjectURL(url);
    };
    img.onerror=function(){URL.revokeObjectURL(url);res(null);};
    img.src=url;
  });
}
window.ckNoPhoto=function(){S.photos=[];S.aiState='skipped';go(2);};
window.ckStartScan=function(){if(!S.photos.length)return;callAI();go(1);};

/* the photo scan runs while the homeowner answers; the report waits for it at most AI_TIMEOUT */
function callAI(){
  S.aiState='pending'; S.ai=null; S.aiStart=Date.now();
  var ctl=new AbortController(), t=setTimeout(function(){ctl.abort();},AI_TIMEOUT);
  var body={trade:CK_TRADE,tradeName:T.name,owner:CFG.owner,images:S.photos.map(function(p){return {mime:'image/jpeg',data:p.data};}),
    answers:{},ranges:{maint:CFG.cost.maint,repair:CFG.cost.repair,major:CFG.cost.major},types:T.damage.where.map(function(w){return w[1];})};
  S.aiP=fetch(SB+'/functions/v1/damage-scan',{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+ANON},body:JSON.stringify(body)})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){clearTimeout(t);if(d&&d.ok&&Array.isArray(d.damages)){S.ai=d;S.aiState='done';}else S.aiState='failed';if(S.onAI)S.onAI();})
    .catch(function(){clearTimeout(t);S.aiState='failed';if(S.onAI)S.onAI();});
}
function scanHtml(){
  var p=S.photos[0];
  return '<div class="ck-card"><h2 class="ck-h">Scanning your photo'+(S.photos.length>1?'s':'')+'…</h2>'
    +'<div class="ck-scanwrap"><div class="ck-shot scanning" id="ck-shot"><img src="'+p.view+'" alt=""><div class="ck-scan"></div></div></div>'
    +'<div class="ck-scanmsg" id="ck-scanmsg"><span class="ck-spin"></span><span id="ck-scantxt">Looking for '+esc(T.noun)+' damage…</span></div></div>';
}
function boxesHtml(list){
  return list.map(function(d){var b=d.box||[0,0,0,0],low=b[1]<.08;return '<div class="box" style="left:'+(b[0]*100).toFixed(1)+'%;top:'+(b[1]*100).toFixed(1)+'%;width:'+(b[2]*100).toFixed(1)+'%;height:'+(b[3]*100).toFixed(1)+'%"><span style="'+(low?'top:auto;bottom:-24px;border-radius:0 5px 5px 5px':'')+'">'+esc(d.type)+'</span></div>';}).join('');
}
function runScan(){
  var t0=Date.now(), msgs=['Checking surfaces…','Measuring the affected area…','Matching damage patterns…'], mi=0, done=false;
  var tick=setInterval(function(){var el=$('ck-scantxt');if(el&&S.aiState==='pending')el.textContent=msgs[mi++%msgs.length];},900);
  var finish=function(){
    if(done)return; done=true; clearInterval(tick); S.onAI=null;
    var shot=$('ck-shot'), txt=$('ck-scantxt');
    if(S.aiState==='done'&&shot){
      var mine=S.ai.damages.filter(function(d){return (d.photo|0)===0&&d.box;});
      shot.classList.remove('scanning'); var sl=shot.querySelector('.ck-scan'); if(sl)sl.remove();
      shot.insertAdjacentHTML('beforeend',boxesHtml(mine));
      if(txt)txt.textContent=S.ai.damages.length?'Found '+S.ai.damages.length+' area'+(S.ai.damages.length>1?'s':'')+' — 4 quick questions next.':'Scan done — 4 quick questions next.';
      setTimeout(function(){if(SC[S.i].k==='scan')go(2);},1100);
    } else {
      if(txt)txt.textContent='Got it — 4 quick questions while we finish.';
      setTimeout(function(){if(SC[S.i].k==='scan')go(2);},500);
    }
  };
  var check=function(){var e=Date.now()-t0; if((S.aiState!=='pending'&&e>=SCAN_MIN)||e>=SCAN_MAX)finish();};
  S.onAI=function(){var e=Date.now()-t0; setTimeout(check,Math.max(0,SCAN_MIN-e));};
  setTimeout(check,SCAN_MIN); setTimeout(check,SCAN_MAX);
}

/* ---------- damage: report ---------- */
var SEV_ORDER={minor:0,moderate:1,severe:2};
function rules(){
  var a=S.ans, c=CFG.cost;
  var where=a.where?a.where.i:0, cause=a.cause?a.cause.i:3, ext=a.extent?a.extent.i:1, worse=a.worse?a.worse.i:3;
  var wv=[3,2,0,1][worse], pts=ext+wv;
  var sev=pts>=4?'severe':pts>=2?'moderate':'minor';
  if(CK_TRADE==='electrical'&&worse<=1)sev='severe';
  var type=T.damage.where[where][1];
  var urgency=sev==='severe'||worse===0?'Urgent — get it looked at within 24–48 hours':sev==='moderate'?'Soon — within the next 2 weeks':'Plan it — within the next few months';
  if(CK_TRADE==='electrical'&&worse===0)urgency='Urgent — turn off that circuit and call an electrician today';
  var est=sev==='minor'?[c.maint[0],Math.round(c.repair[0]+(c.repair[1]-c.repair[0])*.25)]:sev==='moderate'?c.repair:[Math.round((c.repair[0]+c.repair[1])/2),Math.round(c.repair[1]+(c.major[0]-c.repair[1])*.5)];
  if(est[1]<est[0])est=[est[1],est[0]];
  var causeTxt=['Storm or weather damage','Sudden impact or failure','Gradual wear, age or moisture over time','Unclear — an inspection will confirm the cause'][cause];
  var ins=cause===0?'Likely — storm and weather damage is commonly covered by homeowners insurance. Photograph everything and call before repairs.':cause===1?'Possibly — sudden, accidental damage is often covered; gradual wear usually isn\'t.':cause===2?'Unlikely — insurers usually treat wear and slow leaks as maintenance.':'Unclear — the inspection will tell you whether it\'s worth filing.';
  var repair=sev==='minor'?'Spot repair of the damaged '+T.noun+' area':sev==='moderate'?'Repair the damaged area and check what\'s around it':'Repair or partial replacement — confirm the extent on site first';
  return {damages:[{type:type,severity:sev,confidence:null}],cause:causeTxt,urgency:urgency,repair:repair,estimate:{low:est[0],high:est[1]},insurance:ins,sev:sev,source:'answers'};
}
function merge(){
  var R=rules(); if(S.aiState!=='done'||!S.ai)return R;
  var A=S.ai, c=CFG.cost, lo=c.maint[0], hi=c.major[1];
  var dm=(A.damages||[]).filter(function(d){return d&&d.type;});
  var top=dm.reduce(function(m,d){return Math.max(m,SEV_ORDER[d.severity]!=null?SEV_ORDER[d.severity]:1);},-1);
  var sev=top<0?R.sev:['minor','moderate','severe'][Math.max(top,SEV_ORDER[R.sev]-(R.sev==='severe'?0:1))];
  var e=A.estimate||{}, el=+e.low, eh=+e.high;
  if(!(el>0&&eh>=el)){el=R.estimate.low;eh=R.estimate.high;}
  /* keep the scan's number inside the band its severity calls for */
  var band={minor:[c.maint[0],c.repair[1]],moderate:[c.maint[1],c.repair[1]],severe:[c.repair[0],c.major[1]]}[sev];
  lo=Math.max(lo,band[0]); hi=Math.min(hi,band[1]);
  el=Math.max(lo,Math.min(hi,el)); eh=Math.max(el,Math.min(hi,eh));
  /* A scan range like "$450 – $22,000" is no help to anyone. Cap the spread,
     and only let it run from a repair into a full replacement when the damage
     is severe AND the homeowner said it covers several areas or more. */
  var ext=S.ans.extent?S.ans.extent.i:1, large=sev==='severe'&&ext>=2;
  eh=Math.min(eh,Math.max(el*4,el+c.repair[1]));
  if(!large&&el<c.major[0]&&eh>c.repair[1]){
    var bd=(sev==='severe'&&el>=c.repair[1])?c.major:c.repair;
    el=Math.max(bd[0],Math.min(bd[1],el)); eh=Math.max(el,Math.min(bd[1],eh));
  }
  el=Math.round(el); eh=Math.round(eh);
  var urg=String(A.urgency||''); if(/urgent|immediate|24|today/i.test(R.urgency)&&!/urgent|immediate/i.test(urg))urg=R.urgency;
  return {damages:dm.length?dm:R.damages,cause:A.cause||R.cause,urgency:urg||R.urgency,repair:A.repair||R.repair,estimate:{low:el,high:eh},insurance:A.insurance||R.insurance,sev:sev,source:'scan'};
}
function finishReport(){
  var render=function(){S.onAI=null; var r=merge(); lastDamage=r; $('ck-stage').innerHTML=reportHtml(r); save(r);};
  if(S.aiState!=='pending')return render();
  var left=Math.max(0,AI_TIMEOUT-(Date.now()-S.aiStart));
  var to=setTimeout(function(){S.aiState='failed';render();},left);
  S.onAI=function(){clearTimeout(to);render();};
}
var lastDamage=null;
function reportHtml(r){
  var sevCls={minor:'ck-watch',moderate:'ck-act',severe:'ck-urgent'}[r.sev], sevLab={minor:'Minor',moderate:'Moderate',severe:'Severe'}[r.sev];
  var scanned=r.source==='scan';
  var photos=S.photos.map(function(p,i){var mine=scanned?r.damages.filter(function(d){return (d.photo|0)===i&&d.box;}):[];return '<div class="ck-shot"><img src="'+p.view+'" alt="Photo '+(i+1)+'">'+boxesHtml(mine)+'</div>';}).join('');
  return '<div class="ck-card '+sevCls+'"><p class="ck-kicker">'+esc(T.damage.title)+' · report</p>'
    +'<h1 class="ck-h">'+esc(r.damages[0].type)+'</h1>'
    +'<div class="ck-status" style="margin:10px 0 4px">'+sevLab+' damage</div>'
    +'<div style="margin-top:10px">'+r.damages.map(function(d){return '<span class="ck-pill sev-'+esc(d.severity)+'">'+esc(d.type)+(d.confidence?' · '+Math.round(d.confidence*100)+'%':'')+'</span>';}).join('')+'</div>'
    +(scanned?'':'<p class="ck-note">'+(S.photos.length?'The photo scan isn\'t available right now, so this report is based on your answers. Your photos are attached for the inspector to review.':'Based on your answers.')+'</p>')
    +(photos?'<div class="ck-sec"><h3>'+(scanned?'What the scan found':'Your photos')+'</h3><div class="ck-photos">'+photos+'</div></div>':'')
    +'<div class="ck-sec"><h3>Likely cause</h3><p style="margin:0;font-size:15px;line-height:1.5">'+esc(r.cause)+'</p></div>'
    +'<div class="ck-sec"><h3>Urgency</h3><p style="margin:0;font-size:15px;line-height:1.5;font-weight:600">'+esc(r.urgency)+'</p></div>'
    +'<div class="ck-sec"><h3>Recommended repair</h3><p style="margin:0;font-size:15px;line-height:1.5">'+esc(r.repair)+'</p>'
    +'<div class="ck-cost"><span>Estimated repair</span><b>'+range([r.estimate.low,r.estimate.high])+'</b></div><p class="ck-note">A ballpark from typical local pricing — an on-site inspection confirms the scope and price.</p></div>'
    +'<div class="ck-sec"><h3>Insurance claim likely?</h3><div class="ck-ins">'+esc(r.insurance)+'</div></div>'
    +bookCtas(false)+'<button class="ck-link" onclick="ckRestart()">Check something else</button></div>';
}

/* ---------- filing the lead ---------- */
function save(r){
  if(S.saved||!r)return; S.saved=true;
  var c=S.contact, host=''; try{host=(document.referrer||'').replace(/^https?:\/\//,'').split('/')[0]||(parent!==window?'embed':location.host);}catch(e){host='embed';}
  var zip=((c.addr||'').match(/\b\d{5}\b/)||[''])[0], row, hook;
  var answers=Object.keys(S.ans).map(function(k){return (S.ans[k].q||k)+': '+S.ans[k].label;});
  if(TOOL==='health'){
    var B=BANDS[r.band];
    row={score:r.score,band:B.db,label:B.label+' · '+T.name+' health',issues:r.why.filter(function(w){return w.pts>0;}).map(function(w){return w.a;}).slice(0,12)};
    hook={score:r.score,status:B.label,estimateLow:r.est[0],estimateHigh:r.est[1],answers:answers};
  } else {
    var sc={minor:70,moderate:45,severe:20}[r.sev];
    row={score:sc,band:{minor:'mid',moderate:'warn',severe:'bad'}[r.sev],label:r.damages[0].type+' · '+r.sev,
      issues:r.damages.map(function(d){return d.type+' ('+d.severity+')';}).concat(answers.map(function(a){return 'q:'+a;})).concat(S.photos.map(function(p){return 'photo:'+p.thumb;}))};
    hook={score:sc,status:r.sev,damages:r.damages,cause:r.cause,urgency:r.urgency,repair:r.repair,estimateLow:r.estimate.low,estimateHigh:r.estimate.high,insurance:r.insurance,scanned:r.source==='scan',answers:answers,photos:S.photos.map(function(p){return p.thumb;})};
  }
  row.owner=CFG.owner; row.calc_id=TOOL+':'+CK_TRADE; row.material=T.name; row.address=c.addr||null; row.zip=zip||null;
  row.name=c.name||''; row.phone=c.phone||''; row.email=c.email||''; row.host=host;
  try{fetch(SB+'/rest/v1/roof_checks',{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON,Authorization:'Bearer '+ANON,Prefer:'return=minimal'},body:JSON.stringify(row)}).catch(function(){});}catch(e){}
  var nm=(c.name||'').split(' ');
  hook.source=(CFG.company?CFG.company+' ':'')+(TOOL==='health'?T.health.title:T.damage.title); hook.tool=TOOL; hook.trade=CK_TRADE;
  hook.firstName=nm[0]||''; hook.lastName=nm.slice(1).join(' '); hook.phone=c.phone||''; hook.email=c.email||''; hook.address=c.addr||''; hook.zip=zip; hook.timestamp=new Date().toISOString();
  try{if(CK_WEBHOOK)fetch(CK_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(hook)}).catch(function(){});}catch(e){}
  try{parent.postMessage({bp:'checker-done',tool:TOOL,trade:CK_TRADE,score:row.score,label:row.label},'*');}catch(e){}
}

document.addEventListener('DOMContentLoaded',function(){go(0);});
if(document.readyState!=='loading')go(0);
})();
