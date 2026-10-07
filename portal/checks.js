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
function bpChkLoad(){
  var el=q('bpChkList'); if(!el)return;
  if(!(window.BP_LIVE&&window.BP_SB)){ bpChkRender(CHK_DEMO,true); return; }
  Promise.resolve(BP_SB.from('roof_checks').select('*').order('created_at',{ascending:false}).limit(100)).then(function(r){
    if(r&&r.error)throw r.error; bpChkRender((r&&r.data)||[],false);
  }).catch(function(e){ el.innerHTML='<span class="bpx-mut">Couldn\'t load checks'+(e&&/relation|does not exist/i.test(String(e.message||e))?' — the roof_checks table isn\'t created yet (run the migration).':'.')+'</span>'; });
}
/* Calculator leads are worked by the automations (they go straight into the
   CRM and the follow-up workflows), so this page only reports on them:
   how many, how warm, which tools and areas bring them, and the latest few. */
function bpChkRender(rows,demo){
  var el=q('bpChkList'); if(!el)return; el.classList.remove('bpx-mut');
  window._bpChkRows=rows; window._bpChkDemo=demo;
  var DAY=864e5, now=Date.now(), t=function(c){return c.created_at?Date.parse(c.created_at):0;};
  var m30=rows.filter(function(c){return now-t(c)<30*DAY;}), prev=rows.filter(function(c){var a=now-t(c);return a>=30*DAY&&a<60*DAY;});
  var withC=rows.filter(function(c){return c.phone||c.email;}).length, urgent=m30.filter(function(c){return c.band==='bad'||c.band==='warn';}).length;
  var pct=function(a,b){return b?Math.round(a/b*100):0;}, delta=prev.length?Math.round((m30.length-prev.length)/prev.length*100):null;
  var tile=function(lbl,val,sub,ic){return '<div class="cl-tile"><span class="ms">'+ic+'</span><small>'+lbl+'</small><b>'+val+'</b><em>'+sub+'</em></div>';};
  /* last 30 days, one bar a day */
  var days=[];for(var i=29;i>=0;i--){var d0=new Date(now-i*DAY);d0.setHours(0,0,0,0);days.push({d:d0,n:0});}
  m30.forEach(function(c){var d=new Date(t(c));d.setHours(0,0,0,0);days.forEach(function(x){if(x.d.getTime()===d.getTime())x.n++;});});
  var mx=Math.max(1,Math.max.apply(0,days.map(function(x){return x.n;})));
  var bars=days.map(function(x){return '<i title="'+x.d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+': '+x.n+'" style="height:'+Math.max(4,x.n/mx*100)+'%"'+(x.n?'':' class="z"')+'></i>';}).join('');
  var count=function(fn){var o={};rows.forEach(function(c){var k=fn(c);if(k)o[k]=(o[k]||0)+1;});return Object.keys(o).map(function(k){return [k,o[k]];}).sort(function(a,b){return b[1]-a[1];});};
  var list=function(arr,empty){if(!arr.length)return '<div class="bpx-mut" style="font-size:12.5px">'+empty+'</div>';var top=arr[0][1];return arr.slice(0,6).map(function(r){return '<div class="cl-row"><span>'+bpEsc(r[0])+'</span><i><b style="width:'+Math.round(r[1]/top*100)+'%"></b></i><em>'+r[1]+'</em></div>';}).join('');};
  var tools=count(function(c){return bpChkKind(c).label;}), zips=count(function(c){return c.zip||'';});
  var bands=[['bad','Needs attention now','#dc2626'],['warn','Needs attention soon','#ea580c'],['mid','Keep an eye on it','#d97706'],['good','Healthy','#16a34a']].map(function(bd){return [bd,rows.filter(function(c){return c.band===bd[0];}).length];});
  var bandBar=rows.length?'<div class="cl-stack">'+bands.filter(function(x){return x[1];}).map(function(x){return '<i style="flex:'+x[1]+';background:'+x[0][2]+'" title="'+x[0][1]+': '+x[1]+'"></i>';}).join('')+'</div><div class="cl-legend">'+bands.map(function(x){return '<span><i style="background:'+x[0][2]+'"></i>'+x[0][1]+' <b>'+x[1]+'</b></span>';}).join('')+'</div>':'<div class="bpx-mut" style="font-size:12.5px">No results yet.</div>';
  var recent=rows.slice(0,8).map(function(c){
    var ck=bpChkKind(c), when=c.created_at?new Date(c.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'';
    var col=c.band==='good'?'#16a34a':c.band==='mid'?'#d97706':c.band==='warn'?'#ea580c':'#dc2626';
    return '<div class="cl-lead"><span class="cl-score" style="background:'+col+'">'+(c.score!=null?c.score:'–')+'</span><div><b>'+bpEsc(c.name||(c.phone?c.phone:'Anonymous'))+'</b><small>'+bpEsc(ck.label)+(c.zip?' · '+bpEsc(c.zip):'')+(c.label?' · '+bpEsc(c.label):'')+'</small></div><em>'+when+'</em></div>';
  }).join('');
  el.innerHTML=(demo?'<div class="cl-demo"><span class=ms>info</span> Sample numbers. Sign in to see your real calculator leads.</div>':'')
    +'<div class="cl-tiles">'
      +tile('Leads, last 30 days',m30.length,delta==null?'from your calculators':(delta>=0?'▲ ':'▼ ')+Math.abs(delta)+'% vs the 30 before','calculate')
      +tile('Left contact info',pct(withC,rows.length)+'%',withC+' of '+rows.length+' all time','contact_phone')
      +tile('Urgent, last 30 days',urgent,'need work now or soon','priority_high')
      +tile('Top tool',tools.length?bpEsc(tools[0][0]):'—',tools.length?tools[0][1]+' leads':'no leads yet','star')
    +'</div>'
    +'<div class="cl-grid">'
      +'<section class="cl-card cl-wide"><div class="cl-h"><b>Leads per day</b><span>last 30 days</span></div><div class="cl-bars">'+bars+'</div><div class="cl-axis"><span>'+days[0].d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</span><span>Today</span></div></section>'
      +'<section class="cl-card"><div class="cl-h"><b>Which tools bring leads</b></div>'+list(tools,'No leads yet.')+'</section>'
      +'<section class="cl-card"><div class="cl-h"><b>Top ZIP codes</b></div>'+list(zips,'No ZIP codes yet.')+'</section>'
      +'<section class="cl-card"><div class="cl-h"><b>How urgent</b></div>'+bandBar+'</section>'
      +'<section class="cl-card"><div class="cl-h"><b>Latest leads</b><span>followed up automatically</span></div>'+(recent||'<div class="bpx-mut" style="font-size:12.5px">Nothing yet.</div>')+'</section>'
    +'</div>';
}
/* Test runs, duplicates, and the contractor's own kids playing with the widget
   all land in here — they need to be able to clear them out. */
window.bpChkDel=function(id){
  if(!(window.BP_LIVE&&window.BP_SB)){ alert('Sign in to change your checks.'); return; }
  var row=(window._bpChkRows||[]).filter(function(c){return String(c.id)===String(id);})[0];
  if(!bpAskDel('the check for '+((row&&(row.address||row.name))||'this homeowner')))return;
  window._bpChkRows=(window._bpChkRows||[]).filter(function(c){return String(c.id)!==String(id);});
  bpChkRender(window._bpChkRows,window._bpChkDemo);
  Promise.resolve(BP_SB.from('roof_checks').delete().eq('id',id)).then(function(){},function(){ bpChkLoad(); });
};
window.bpChkStatus=function(btn,id,status){
  if(!(window.BP_LIVE&&window.BP_SB)){alert('Sign in to track checks.');return;}
  btn.disabled=true;
  Promise.resolve(BP_SB.from('roof_checks').update({status:status}).eq('id',id)).then(function(){bpChkLoad();},function(){btn.disabled=false;alert('Couldn\'t save that — try again.');});
};
window.bpCsvRoofChecks=function(){var rows=window._bpChkRows||[];bpCsv('checks',['When','Check','Score','Result','Address','ZIP','Name','Phone','Email','Age','Material','Issues','Storm','Permit year','Built year','Status'],rows.map(function(c){return [c.created_at||'',bpChkKind(c).label,c.score,c.label||'',c.address||'',c.zip||'',c.name||'',c.phone||'',c.email||'',c.age==null?'':c.age,c.material||'',(c.issues||[]).filter(function(x){return !/^photo:/.test(x);}).join('; '),c.storm||'',c.permit_year||'',c.built_year||'',c.status||''];}));};
/* the page shell */
window.bpChecks=function(){
  var area=q('bpxViewArea'); if(!area)return;
  bpChkCss();
  area.innerHTML='<div class="cl">'
    +'<div class="cl-top"><div><h2>Calculator leads</h2><p>Homeowners who used your calculators and checkers. They go straight into your automations, so follow-up happens on its own; this page shows how they are doing.</p></div>'
    +'<div class="cl-acts">'+bpCsvBtn('bpCsvRoofChecks()','Export CSV')
    +'<button class="bpx-btn ghost" onclick="bpNav(\'calculator\')"><span class=ms>calculate</span>My Calculators</button></div></div>'
    +'<div id="bpChkList" class="bpx-mut" style="font-size:13px">Loading…</div></div>';
  if(window.bpSpin)bpSpin(false);
  bpChkLoad();
};
function bpChkCss(){
  if(document.getElementById('cl-css'))return;var c=document.createElement('style');c.id='cl-css';
  c.textContent='#bpx .cl-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:16px}#bpx .cl-top h2{margin:0;font-size:20px;color:var(--ink)}#bpx .cl-top p{margin:4px 0 0;font-size:13px;color:var(--mu);max-width:620px}'
   +'#bpx .cl-acts{display:flex;gap:8px;flex-wrap:wrap}#bpx .cl-acts .bpx-btn{width:auto;margin:0;gap:6px}#bpx .cl-acts .ms{font-size:17px}'
   +'#bpx .cl-demo{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:#92400e;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:8px 12px;margin-bottom:12px}#bpx .cl-demo .ms{font-size:18px}'
   +'#bpx .cl-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}'
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
