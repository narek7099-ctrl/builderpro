/* Leads → Checks: every homeowner who ran a self-check on the contractor's site.

   Moved out of the old lead-map page (which is gone) into its own view.
   Reads roof_checks: the roofing estimator's Roof Age tab (calc_id 'roofing')
   and the per-trade Health / Damage checkers (calc_id 'health:<trade>' /
   'damage:<trade>'). Status ladder new → contacted → booked → won/lost,
   delete for test runs, CSV export. Sample rows until signed in. */
var CHK_DEMO=[
  {id:'c1',address:'1408 Cedar Ln, Austin, TX',zip:'78704',score:31,band:'warn',label:'Needs attention soon',age:21,material:'asphalt',issues:['granules'],storm:'unknown',permit_year:2005,name:'Dana M.',phone:'(512) 555-0142',created_at:new Date(Date.now()-3*36e5).toISOString(),status:'new'},
  {id:'c2',address:'92 Prairie Dr, Austin, TX',zip:'78745',score:12,band:'bad',label:'Needs attention now',age:24,material:'asphalt',issues:['stains','shingles'],storm:'yes',permit_year:2002,name:'',phone:'',created_at:new Date(Date.now()-26*36e5).toISOString(),status:'new'},
  {id:'c3',address:'7710 Highland Ave, Austin, TX',zip:'78731',score:84,band:'good',label:'Healthy',age:6,material:'metal',issues:[],storm:'no',permit_year:2020,name:'Luis R.',phone:'(512) 555-0199',email:'luis@example.com',created_at:new Date(Date.now()-2*864e5).toISOString(),status:'contacted'},
  {id:'c4',calc_id:'health:hvac',address:'78704',zip:'78704',score:41,band:'warn',label:'Act soon · HVAC health',material:'HVAC',issues:['12–17 years','Over 3 years / never','Noticeably'],name:'Priya S.',phone:'(512) 555-0110',created_at:new Date(Date.now()-5*36e5).toISOString(),status:'new'},
  {id:'c5',calc_id:'damage:concrete',address:'3300 Elm St, Austin, TX 78745',zip:'78745',score:45,band:'warn',label:'Driveway cracking · moderate',material:'Concrete & Paving',issues:['Driveway cracking (moderate)','q:Where is the damage?: Driveway'],name:'',phone:'(512) 555-0188',created_at:new Date(Date.now()-30*36e5).toISOString(),status:'new'}
];
/* roof_checks holds every homeowner self-check: the roofing estimator's Roof Age
   tab (calc_id 'roofing') and the per-trade Health / Damage checkers
   (calc_id 'health:<trade>' / 'damage:<trade>', embed/health-*.html, embed/damage-*.html) */
var CHK_TRADE_NAMES={roofing:'Roofing',hvac:'HVAC',countertops:'Countertops',trim:'Trim',painting:'Painting',pools:'Pools',landscaping:'Landscaping',plumbing:'Plumbing',electrical:'Electrical',general:'Remodel',concrete:'Concrete',flooring:'Flooring'};
function bpChkKind(c){var id=String(c.calc_id||'roofing'),m=id.match(/^(health|damage):(\w+)$/);if(!m)return {tool:'roof',trade:'roofing',label:'Roof age'};var tn=CHK_TRADE_NAMES[m[2]]||m[2];return {tool:m[1],trade:m[2],label:tn+' '+(m[1]==='health'?'health':'damage')};}
/* 2026-11-25: this page is now "Lead stats", every lead combined, in the same look.
   Every lead ends up as a contact, so the totals and the per-day line count contacts;
   where each came from is read from the intake logs: lead_log (calculators, website
   forms, online booking), lead_events (Angi, Thumbtack and the rest, from email) and
   roof_checks (the self-checks). A contact none of them knows came in by a call, a
   text or by hand. Calls the receptionist answered come from the HighLevel dashboard. */
var LS_SRC_COL={'Calculators':'#006fff','Website forms':'#8fbcff','Online booking':'#16C79A','Lead services':'#001530','Calls, texts & added by hand':'#c3d3ea'};
function bpLsSrcOf(src){ src=String(src||''); if(/book/i.test(src))return 'Online booking'; if(/calc|estimat|check|damage|health|quote/i.test(src))return 'Calculators'; return 'Website forms'; }
function bpLsKey(r){ var p=String(r.phone||'').replace(/\D/g,'').slice(-10); return p||String(r.email||'').toLowerCase().trim(); }
function bpChkLoad(){
  var el=q('bpChkList'); if(!el)return;
  if(!(window.BP_LIVE&&window.BP_SB)){ bpLsRender(bpLsDemo(),true); return; }
  var safe=function(p){ return Promise.resolve(p).then(function(r){ return (r&&!r.error&&r.data)||[]; },function(){ return []; }); };
  Promise.all([
    (window.bpEnsureContacts?bpEnsureContacts():Promise.resolve()).then(function(){ return window._bpContacts||[]; },function(){ return window._bpContacts||[]; }),
    safe(BP_SB.from('lead_log').select('source,name,phone,email,created_at').order('created_at',{ascending:false}).limit(2000)),
    safe(BP_SB.from('lead_events').select('source_id,name,phone,email,received_at,job').order('received_at',{ascending:false}).limit(2000)),
    safe(BP_SB.from('lead_sources').select('id,vendor,label')),
    safe(BP_SB.from('roof_checks').select('*').order('created_at',{ascending:false}).limit(500)),
    (window.bpApi&&window.GHL_DASH_URL?Promise.resolve(bpApi(GHL_DASH_URL,{})).catch(function(){return null;}):Promise.resolve(null))
  ]).then(function(r){
    var vend={}; r[3].forEach(function(x){ vend[x.id]=x.label||x.vendor||'Lead service'; });
    var feed=[];
    r[1].forEach(function(x){ feed.push({when:x.created_at,name:x.name,phone:x.phone,email:x.email,src:bpLsSrcOf(x.source),detail:x.source||''}); });
    r[2].forEach(function(x){ feed.push({when:x.received_at,name:x.name,phone:x.phone,email:x.email,src:'Lead services',detail:vend[x.source_id]||'Lead service'}); });
    var seen={}; feed.forEach(function(f){ var k=bpLsKey(f); if(k)seen[k]=1; });
    r[4].forEach(function(c){ var k=bpLsKey(c); if(k&&seen[k])return; feed.push({when:c.created_at,name:c.name,phone:c.phone,email:c.email,src:'Calculators',detail:bpChkKind(c).label}); });
    window._bpChkRows=r[4];
    var rec=r[5]&&r[5].recovery; bpLsRender({contacts:r[0],feed:feed,calls:rec?(+rec.calls||0):null,texts:rec?(+rec.texts||0):null},false);
  }).catch(function(){ el.innerHTML='<span class="bpx-mut">Couldn\'t load your lead numbers. Pull down or open the page again.</span>'; });
}
function bpLsDemo(){
  var now=Date.now(), DAY=864e5, srcs=[['Calculators','Roof estimator'],['Website forms','website'],['Online booking','booking'],['Lead services','Angi'],['Lead services','Thumbtack'],['Calculators','Damage check (roofing)']];
  var names=['Dana M.','Luis R.','Priya S.','Tom B.','Rosa M.','Kevin O.','Carlos R.','Ann C.','Mike J.','Sarah K.','Ethan W.','Nina P.','Omar H.','Jess T.','Bob L.','Ava G.','Ray D.','Lena F.'];
  var feed=[], contacts=[];
  names.forEach(function(n,i){ var w=new Date(now-((i*37)%29+.3)*DAY).toISOString(); var sc=srcs[i%srcs.length]; contacts.push({name:n,dateAdded:w,phone:'(512) 555-01'+(10+i)});
    if(i%4!==3) feed.push({when:w,name:n,phone:'(512) 555-01'+(10+i),src:sc[0],detail:sc[1]}); });
  return {contacts:contacts,feed:feed,calls:14,texts:31};
}
function bpLsRender(D,demo){
  var el=q('bpChkList'); if(!el)return; el.classList.remove('bpx-mut');
  var DAY=864e5, now=Date.now(), t=function(x){ return x?Date.parse(x):0; };
  var ct=(D.contacts||[]).filter(function(c){ return c&&c.dateAdded; });
  /* one list of leads for a window of time: each person once (by phone or email), from the
     intake logs first, then the contacts none of them knows (calls, texts, added by hand) */
  var leadsIn=function(from,to){
    var out=[], keys={};
    (D.feed||[]).slice().sort(function(a,b){ return t(a.when)-t(b.when); }).forEach(function(f){ var w=t(f.when); if(w<from||w>=to)return; var k=bpLsKey(f); if(k){ if(keys[k])return; keys[k]=1; } out.push({when:f.when,src:f.src,detail:f.detail}); });
    ct.forEach(function(c){ var w=t(c.dateAdded); if(w<from||w>=to)return; var k=bpLsKey(c); if(k&&keys[k])return; if(k)keys[k]=1; out.push({when:c.dateAdded,src:'Calls, texts & added by hand'}); });
    return out;
  };
  var m30=leadsIn(now-30*DAY,now+DAY), prev=leadsIn(now-60*DAY,now-30*DAY);
  var delta=prev.length?Math.round((m30.length-prev.length)/prev.length*100):null;
  var bySrc={}; m30.forEach(function(f){ bySrc[f.src]=(bySrc[f.src]||0)+1; });
  var srcRows=Object.keys(bySrc).map(function(k){ return [k,bySrc[k]]; }).sort(function(a,b){ return b[1]-a[1]; });
  var f30=m30;
  var calc30=bySrc['Calculators']||0;
  var cnt=function(v){ v=Math.round(+v||0); return v+(v===1?' lead':' leads'); };
  var tile=function(lbl,val,sub,txt){return '<div class="cl-tile'+(txt?' txt':'')+'"><small>'+lbl+'</small><b>'+val+'</b><em>'+sub+'</em></div>';};
  /* last 30 days, one point a day */
  var days=[]; for(var i=29;i>=0;i--){ var d0=new Date(now-i*DAY); d0.setHours(0,0,0,0); days.push({d:d0,n:0}); }
  m30.forEach(function(c){ var d=new Date(t(c.when)); d.setHours(0,0,0,0); days.forEach(function(x){ if(x.d.getTime()===d.getTime())x.n++; }); });
  var mx=Math.max(1,Math.max.apply(0,days.map(function(x){ return x.n; })));
  var fold=function(arr){ if(arr.length<=4) return arr.map(function(r){return {label:r[0],value:r[1]};}); var top=arr.slice(0,3).map(function(r){return {label:r[0],value:r[1]};}); top.push({label:'Other',value:arr.slice(3).reduce(function(s2,r){return s2+r[1];},0),other:true}); return top; };
  var circle=function(title,lead,rws,empty,ramp){ if(!rws.length||!window.bpChart) return '<div class="cl-h"><b>'+title+'</b></div><div class="bpx-mut" style="font-size:12.5px">'+empty+'</div>'; var tot=rws.reduce(function(s2,r){return s2+r.value;},0); var o={title:title,lead:lead,rows:rws,fixed:true,fmt:cnt,centre:String(tot),centreNote:'leads',axis:title}; if(ramp)o.ramp=ramp; return bpChart.donut(o); };
  var grp=window.bpCtGroup||function(){ return 'new'; }, GN={new:'New lead',booked:'Inspection booked',quoted:'Estimate out',customer:'Customer'};
  var stages={}; ct.forEach(function(c){ var g='new'; try{ g=grp(c); }catch(e){} stages[GN[g]||'New lead']=(stages[GN[g]||'New lead']||0)+1; });
  var stageRows=['New lead','Inspection booked','Estimate out','Customer'].filter(function(k){ return stages[k]; }).map(function(k){ return {label:k,value:stages[k]}; });
  var det={}; f30.forEach(function(f){ if(f.src==='Calculators'||f.src==='Lead services'){ var k=f.src==='Lead services'?f.detail:String(f.detail||'Calculator').replace(/^.*\b(estimat\w*)\b.*$/i,'Estimator'); det[k]=(det[k]||0)+1; } });
  var detRows=Object.keys(det).map(function(k){ return [k,det[k]]; }).sort(function(a,b){ return b[1]-a[1]; });
  var recent=(D.feed||[]).slice().sort(function(a,b){ return t(b.when)-t(a.when); }).slice(0,8).map(function(f){
    var when=f.when?new Date(f.when).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    var col=LS_SRC_COL[f.src]||'#006fff', ic={'Calculators':'calculate','Website forms':'language','Online booking':'event_available','Lead services':'storefront'}[f.src]||'person';
    return '<div class="cl-lead"><span class="cl-score" style="background:'+col+'"><span class="ms" style="font-size:17px">'+ic+'</span></span><div><b>'+bpEsc(f.name||(f.phone?f.phone:'Anonymous'))+'</b><small>'+bpEsc(f.src)+(f.detail&&f.detail!==f.src&&!/^(website|booking)$/i.test(f.detail)?' · '+bpEsc(f.detail):'')+'</small></div><em>'+when+'</em></div>';
  }).join('');
  el.innerHTML=(demo?'<div class="cl-demo"><span class=ms>info</span> Sample numbers. Sign in to see your real leads.</div>':'')
    +'<div class="cl-tiles">'
      +tile('Leads, last 30 days',m30.length,delta==null?'every source combined':(delta>=0?'▲ ':'▼ ')+Math.abs(delta)+'% vs the 30 before')
      +tile('Calls answered',D.calls==null?'—':D.calls,D.calls==null?'shows once your number is set up':'by '+bpEsc(window.BP_AI_NAME||'Lisa')+' this month')
      +tile('Calculator leads',calc30,'last 30 days')
      +tile('Top source',srcRows.length?bpEsc(srcRows[0][0]):'—',srcRows.length?cnt(srcRows[0][1])+', last 30 days':'no leads yet',1)
    +'</div>'
    +'<div class="cl-grid2">'
      +'<section class="cl-card cl-chart">'+(window.bpChart?bpChart.area({title:'Leads per day',lead:'last 30 days, every source',x:{label:'Day',values:days.map(function(x){return x.d.toLocaleDateString('en-US',{month:'short',day:'numeric'});})},series:[{name:'Leads',values:days.map(function(x){return x.n;})}],fmt:cnt,fmtKind:'count',yFrom:0,yTo:Math.max(4,Math.ceil(mx/4)*4),height:190}):'')+'</section>'
      +'<div class="cl-3">'
        +'<section class="cl-card cl-chart">'+circle('Where leads come from','last 30 days',fold(srcRows),'No leads in the last 30 days.')+'</section>'
        +'<section class="cl-card cl-chart">'+circle('Where they are now','every contact',stageRows,'No contacts yet.',['#c3d3ea','#8fbcff','#006fff','#16C79A'])+'</section>'
        +'<section class="cl-card cl-chart">'+circle('Calculators and lead services','last 30 days',fold(detRows),'None in the last 30 days.')+'</section>'
      +'</div>'
      +'<section class="cl-card"><div class="cl-h"><b>Latest leads</b><span>every source</span></div>'+(recent||'<div class="bpx-mut" style="font-size:12.5px">Nothing yet.</div>')+'</section>'
    +'</div>';
  window._bpLsFeed=D.feed||[];
}
/* Test runs, duplicates, and the contractor's own kids playing with the widget
   all land in here — they need to be able to clear them out. */
window.bpChkDel=function(id){
  if(!(window.BP_LIVE&&window.BP_SB)){ alert('Sign in to change your checks.'); return; }
  var row=(window._bpChkRows||[]).filter(function(c){return String(c.id)===String(id);})[0];
  if(!bpAskDel('the check for '+((row&&(row.address||row.name))||'this homeowner')))return;
  window._bpChkRows=(window._bpChkRows||[]).filter(function(c){return String(c.id)!==String(id);});
  bpChkLoad();
  Promise.resolve(BP_SB.from('roof_checks').delete().eq('id',id)).then(function(){},function(){ bpChkLoad(); });
};
window.bpChkStatus=function(btn,id,status){
  if(!(window.BP_LIVE&&window.BP_SB)){alert('Sign in to track checks.');return;}
  btn.disabled=true;
  Promise.resolve(BP_SB.from('roof_checks').update({status:status}).eq('id',id)).then(function(){bpChkLoad();},function(){btn.disabled=false;alert('Couldn\'t save that — try again.');});
};
window.bpCsvLeadStats=function(){var rows=(window._bpLsFeed||[]).slice().sort(function(a,b){return Date.parse(b.when||0)-Date.parse(a.when||0);});bpCsv('leads',['When','Source','Detail','Name','Phone','Email'],rows.map(function(f){return [f.when||'',f.src,f.detail||'',f.name||'',f.phone||'',f.email||''];}));};
window.bpCsvRoofChecks=function(){var rows=window._bpChkRows||[];bpCsv('checks',['When','Check','Score','Result','Address','ZIP','Name','Phone','Email','Age','Material','Issues','Storm','Permit year','Built year','Status'],rows.map(function(c){return [c.created_at||'',bpChkKind(c).label,c.score,c.label||'',c.address||'',c.zip||'',c.name||'',c.phone||'',c.email||'',c.age==null?'':c.age,c.material||'',(c.issues||[]).filter(function(x){return !/^photo:/.test(x);}).join('; '),c.storm||'',c.permit_year||'',c.built_year||'',c.status||''];}));};
/* the page shell */
window.bpChecks=function(){
  var area=q('bpxViewArea'); if(!area)return;
  bpChkCss();
  area.innerHTML='<div class="cl">'
    /* 2026-11-20: the title and blurb repeated the page's own line, and the Calculators tab sits right beside this one */
    +'<div class="cl-top"><div><p>Every lead combined: calculators, website forms, online booking, lead services, calls and the ones you add.</p></div>'
    +'<div class="cl-acts">'+bpCsvBtn('bpCsvLeadStats()','Export CSV')+'</div></div>'
    +'<div id="bpChkList" class="bpx-mut" style="font-size:13px">Loading…</div></div>';
  if(window.bpSpin)bpSpin(false);
  bpChkLoad();
};
function bpChkCss(){
  if(document.getElementById('cl-css'))return;var c=document.createElement('style');c.id='cl-css';
  c.textContent='#bpx .cl-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:16px}#bpx .cl-top h2{margin:0;font-size:20px;color:var(--ink)}#bpx .cl-top p{margin:4px 0 0;font-size:13px;color:var(--mu);max-width:620px}'
   +'#bpx .cl-acts{display:flex;gap:8px;flex-wrap:wrap}#bpx .cl-acts .bpx-btn{width:auto;margin:0;gap:6px}#bpx .cl-acts .ms{font-size:17px}'
   +'#bpx .cl-demo{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#0e4792;background:#edf5ff;border:1px solid #aacefe;border-radius:10px;padding:8px 12px;margin-bottom:12px}#bpx .cl-demo .ms{font-size:18px}'
   +'#bpx .cl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}'
   +'#bpx .cl-grid2{display:flex;flex-direction:column;gap:12px}#bpx .cl-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}#bpx .cl-chart{min-width:0}'
   +'@media(max-width:1100px){#bpx .cl-3{grid-template-columns:minmax(0,1fr)}}'
   +'#bpx .cl-tile{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:14px 16px;position:relative;min-width:0}#bpx .cl-tile .ms{position:absolute;right:14px;top:14px;font-size:20px;color:#2457d6;background:#eef3ff;border-radius:8px;padding:5px}'
   +'#bpx .cl-tile small{display:block;font-size:12px;color:var(--mu);font-weight:600}#bpx .cl-tile b{display:block;font-size:24px;margin-top:6px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:30px}#bpx .cl-tile em{display:block;font-style:normal;font-size:12px;color:var(--mu);margin-top:2px}'
   +'#bpx .cl-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#bpx .cl-wide{grid-column:1/-1}'
   +'#bpx .cl-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}#bpx .cl-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}#bpx .cl-h b{font-size:14.5px;color:var(--ink)}#bpx .cl-h span{font-size:12px;color:var(--mu)}'
   +'#bpx .cl-bars{display:flex;align-items:flex-end;gap:3px;height:120px}#bpx .cl-bars i{flex:1;background:#2457d6;border-radius:3px 3px 0 0;min-width:0}#bpx .cl-bars i.z{background:var(--line)}#bpx .cl-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--mu);margin-top:6px}'
   +'#bpx .cl-row{display:grid;grid-template-columns:minmax(0,140px) 1fr 34px;align-items:center;gap:10px;padding:5px 0;font-size:13px}#bpx .cl-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}#bpx .cl-row i{height:8px;background:var(--soft,#f2f4f7);border-radius:6px;overflow:hidden}#bpx .cl-row i b{display:block;height:100%;background:#2457d6;border-radius:6px}#bpx .cl-row em{font-style:normal;text-align:right;font-weight:600;color:var(--ink)}'
   +'#bpx .cl-stack{display:flex;height:14px;border-radius:8px;overflow:hidden;gap:2px}#bpx .cl-legend{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:12px;font-size:12.5px;color:var(--mu)}#bpx .cl-legend span{display:flex;align-items:center;gap:6px}#bpx .cl-legend i{width:9px;height:9px;border-radius:50%}#bpx .cl-legend b{color:var(--ink);margin-left:auto}'
   +'#bpx .cl-lead{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line-2,var(--line))}#bpx .cl-lead:first-of-type{border-top:0}#bpx .cl-score{flex:0 0 32px;height:32px;border-radius:8px;color:#fff;font-weight:700;font-size:12.5px;display:grid;place-items:center}#bpx .cl-lead div{flex:1;min-width:0}#bpx .cl-lead b{display:block;font-size:13px;color:var(--ink)}#bpx .cl-lead small{display:block;font-size:11.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#bpx .cl-lead em{font-style:normal;font-size:12px;color:var(--mu)}'
   +'@media(max-width:900px){#bpx .cl-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}#bpx .cl-grid{grid-template-columns:minmax(0,1fr)}}';
  document.head.appendChild(c);
}
