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
function bpChkRender(rows,demo){
  var el=q('bpChkList'); if(!el)return; el.classList.remove('bpx-mut');
  var tab=q('bpChkTab'); if(tab)tab.textContent='Checks'+(rows.length?' ('+rows.length+')':'');
  if(!rows.length){ el.innerHTML='<span class="bpx-mut">Nothing yet. Every homeowner who runs a health or damage check (or the roof age check) on your site lands here with their score — even if they don\'t book.</span>'; return; }
  var col=function(b){return b==='good'?'#15803d':b==='mid'?'#b45309':b==='warn'?'#c2410c':'#b91c1c';};
  var pg=bpPage('checks',rows,10,'bpChkRender(window._bpChkRows,window._bpChkDemo)'); window._bpChkRows=rows; window._bpChkDemo=demo;
  el.innerHTML=(demo?'<div style="background:#fff7ed;border:1px solid #f59e0b;color:#92400e;border-radius:10px;padding:8px 12px;font-size:12.5px;font-weight:600;margin-bottom:10px"><span class=ms>warning</span> DEMO — sample checks. Sign in to see the real ones from your site.</div>':'')
    +pg.items.map(function(c){
      var when=c.created_at?new Date(c.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
      var ck=bpChkKind(c), iss=(c.issues||[]).filter(function(x){return !/^(photo|q):/.test(x);}), pics=(c.issues||[]).filter(function(x){return /^photo:data:image\/(jpeg|png|webp);base64,/.test(x);}).map(function(x){return x.slice(6);});
      var facts=[c.age!=null?'~'+c.age+' yrs':'',ck.tool==='roof'?(c.material||''):'',iss.length?iss.join(', '):'no issues noted',c.storm==='yes'?'storm last year':'',c.permit_year?'permit '+c.permit_year:(c.built_year?'built '+c.built_year:'')].filter(Boolean).join(' · ');
      var kind='<span class="bpx-badge" style="margin-right:4px">'+bpEsc(ck.label)+'</span>';
      var thumbs=pics.length?'<div style="display:flex;gap:6px;margin-top:6px">'+pics.map(function(u){return '<a href="'+u+'" target="_blank" rel="noopener"><img src="'+u+'" alt="Damage photo" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"></a>';}).join('')+'</div>':'';
      var who=c.name||c.phone?('<b>'+bpEsc(c.name||'No name')+'</b>'+(c.phone?' · <a href="tel:'+bpEsc(c.phone)+'" style="color:var(--blue);text-decoration:none">'+bpEsc(c.phone)+'</a>':'')+(c.email?' · '+bpEsc(c.email):'')):'<span class="bpx-mut">No contact left — address only</span>';
      var st=c.status&&c.status!=='new'?'<span class="bpx-badge'+(c.status==='won'?' ok':c.status==='lost'?' bad':'')+'">'+bpEsc(c.status)+'</span>':'';
      var acts=(c.status==='new'||!c.status)?'<button class="bpx-rowbtn primary" style="margin:0" onclick="bpChkStatus(this,\''+bpEsc(c.id)+'\',\'contacted\')">Contacted</button>':(c.status==='contacted'?'<button class="bpx-rowbtn primary" style="margin:0" onclick="bpChkStatus(this,\''+bpEsc(c.id)+'\',\'booked\')">Booked</button>':(c.status==='booked'?'<button class="bpx-rowbtn primary" style="margin:0" onclick="bpChkStatus(this,\''+bpEsc(c.id)+'\',\'won\')">Won</button>':''));
      return '<div style="display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">'
        +'<span title="'+bpEsc(c.label||'')+'" style="flex:0 0 auto;width:38px;height:38px;border-radius:10px;background:'+col(c.band)+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">'+(c.score!=null?c.score:'—')+'</span>'
        +'<div style="flex:1;min-width:200px"><div style="font-size:13.5px">'+kind+'<b>'+bpEsc(c.address||'Address not given')+'</b> '+st+'</div><div style="font-size:12.5px;margin-top:2px">'+who+'</div><div class="bpx-mut" style="font-size:11.5px;margin-top:2px">'+bpEsc((c.label&&ck.tool!=='roof'?c.label+' · ':'')+facts)+(when?' · '+when:'')+'</div>'+thumbs+'</div>'
        +'<div style="display:flex;gap:6px;flex-wrap:wrap">'+(demo?'':bpDelBtn("bpChkDel('"+String(c.id).replace(/'/g,"")+"')",'Delete this check'))+acts+(c.address?'<a class="bpx-rowbtn" style="margin:0;text-decoration:none" href="https://maps.apple.com/?q='+encodeURIComponent(c.address)+'" target="_blank" rel="noopener">Map</a>':'')+'</div></div>';
    }).join('')+pg.nav;
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
  area.innerHTML='<div class="bpx-panel">'
    +'<div class="bpx-chead" style="margin-bottom:6px"><div><b id="bpChkTab" style="font-size:16px">Checks</b>'
    +'<div class="bpx-mut" style="font-size:12.5px;margin-top:3px">Homeowners who ran a health or damage check (or the roof age check) on your site · the ones who left a number are warm</div></div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'+bpCsvBtn('bpCsvRoofChecks()','Export CSV')
    +'<button class="bpx-btn ghost" style="width:auto;margin:0;padding:9px 14px;font-size:13px" onclick="bpNav(\'calculator\')"><span class=ms style="font-size:17px;vertical-align:-4px;margin-right:4px">calculate</span>My Calculators</button></div></div>'
    +'<div id="bpChkList" class="bpx-mut" style="font-size:13px">Loading checks…</div></div>';
  if(window.bpSpin)bpSpin(false);
  bpChkLoad();
};
