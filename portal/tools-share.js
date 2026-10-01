/* My Calculators: the three public tools a contractor gets for their trade.

     quote   embed/<trade>.html          the instant quote calculator
     health  embed/health-<trade>.html   the 45-second health check
     damage  embed/damage-<trade>.html   photo -> damage report

   Each has its own preview and a compact "Get it" panel: copy embed code
   (frame + auto-resize in one paste), copy link, QR download and
   UTM-tagged share links per platform. The look set in Customize is one theme for all
   three. bpCalculator() in index.html owns the page shell and calls in here.
   QR codes come from portal/qr.js (inline encoder, no network). */
(function(){
  var SITE='https://builderpro-os.com';
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

  /* what the quote calculator prices, in a homeowner's words — mirrors
     QUOTE_NOUN in tools/og_meta.py, which writes the link-preview cards */
  var NOUN={roofing:'roof',hvac:'HVAC',countertops:'countertop',trim:'trim carpentry',painting:'painting',pools:'pool',landscaping:'landscaping',
    plumbing:'plumbing',electrical:'electrical',general:'remodel',concrete:'driveway',flooring:'flooring'};
  var TOOLS=[
    {id:'quote',l:'Instant quote calculator',s:'A real price range in about a minute',ico:'calculate',color:'#2563eb'},
    {id:'health',l:'Health check',s:'Six questions, a score and next steps',ico:'monitor_heart',color:'#10a37f'},
    {id:'damage',l:'Damage check',s:'Photo in, damage report out',ico:'photo_camera',color:'#ea580c'}
  ];
  window.BP_CALC_TOOLS=TOOLS;
  function tool(id){for(var i=0;i<TOOLS.length;i++)if(TOOLS[i].id===id)return TOOLS[i];return TOOLS[0];}
  function cid(){return window._bpCalcCur||(window.bpCalcAssigned?bpCalcAssigned():'roofing');}
  function tradeName(c){var n=c;try{BP_CALC_IDS.forEach(function(p){if(p[0]===c)n=p[1];});}catch(e){}return n;}

  window.bpToolCopy=function(t,c){
    c=c||cid(); var n=NOUN[c]||c;
    if(t==='health')return {h:'Free 45-second '+n+' health check',d:'Six quick questions, an instant health score, what to fix first and what it should cost.',name:tradeName(c)+' health check'};
    if(t==='damage')return {h:'Snap a photo, get a damage report',d:'Upload a photo of the damage and get severity, likely cause, insurance hints and a repair estimate.',name:tradeName(c)+' damage check'};
    return {h:'Get your instant '+n+' quote in 60 seconds',d:'Answer a few quick questions and see a real price range for your project. Free, no sign-up.',name:tradeName(c)+' quote calculator'};
  };
  function file(t,c){return (t==='quote'?'':t+'-')+c+'.html';}

  /* the owner's id goes in every link so leads land in their account */
  var uid=null, uidAsked=false;
  function withUid(cb){
    if(uid||uidAsked){cb(uid);return;}
    if(!(window.BP_LIVE&&window.BP_SB&&window.bpSetUser)){uidAsked=true;cb(null);return;}
    Promise.resolve(bpSetUser()).then(function(u){uidAsked=true;uid=u&&u.id||null;cb(uid);},function(){uidAsked=true;cb(null);});
  }
  /* forget the cached id (sign-in changed) */
  window.bpToolUidReset=function(){uid=null;uidAsked=false;};
  window.bpToolUrl=function(t,c,src){
    var qs=[];if(uid)qs.push('u='+encodeURIComponent(uid));
    if(src)qs.push('utm_source='+src,'utm_medium=social','utm_campaign='+t);
    return SITE+'/embed/'+file(t,c||cid())+(qs.length?'?'+qs.join('&'):'');
  };

  function copyText(text,btn,label){
    var done=function(){if(!btn)return;var old=btn.getAttribute('data-l')||btn.innerHTML;btn.setAttribute('data-l',old);btn.innerHTML='<span class=ms>check</span> Copied';setTimeout(function(){btn.innerHTML=old;},1800);};
    var fallback=function(){var ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}document.body.removeChild(ta);done();};
    window._bpLastCopy=text;
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done,fallback);else fallback();
  }
  window.bpToolCopyEl=function(id,btn){var el=document.getElementById(id);if(el)copyText(el.getAttribute('data-copy')||el.textContent,btn);};
  window.bpToolCopyStr=function(btn){copyText(btn.getAttribute('data-copy')||'',btn);};

  /* ---------- switcher: plain text segmented control ---------- */
  var SEG={quote:'Quote calculator',health:'Health check',damage:'Damage check'};
  window.bpToolSwitcher=function(cur){
    return '<div class="bpt-seg" role="tablist" aria-label="Your tools">'+TOOLS.map(function(t){
      return '<button class="bpt-seg-b'+(t.id===cur?' on':'')+'" role="tab" aria-selected="'+(t.id===cur)+'" data-calc-tool="'+t.id+'" onclick="bpCalcTool(\''+t.id+'\')">'+SEG[t.id]+'</button>';
    }).join('')+'</div>';
  };

  /* ---------- preview (health / damage; the quote calculator keeps its own) ---------- */
  window.bpToolPreview=function(host,t){
    withUid(function(){
      var f=document.createElement('iframe');f.className='bpx-calc-iframe';f.setAttribute('title','Live '+tool(t).l.toLowerCase()+' preview');
      f.setAttribute('data-tool',t);
      f.src='embed/'+file(t,cid())+(uid?'?u='+encodeURIComponent(uid):'');
      host.innerHTML='';host.appendChild(f);
    });
  };

  /* ---------- "Get it": one compact panel of copy / download / share buttons ---------- */
  function snippets(t){
    var url=bpToolUrl(t), title=tool(t).l;
    var ifr='<iframe src="'+url+'" data-bp-tool="'+t+'" title="'+title+'" loading="lazy" style="width:100%;min-height:'+(t==='quote'?720:640)+'px;border:0;border-radius:16px;overflow:hidden"></iframe>';
    var js='<script>window.addEventListener("message",function(e){if(!e.data||e.data.bp!=="height")return;document.querySelectorAll("iframe[data-bp-tool]").forEach(function(f){if(f.contentWindow===e.source)f.style.height=Math.max(e.data.h,400)+"px";});});</'+'script>';
    /* one paste: the frame plus the auto-resize listener */
    return {iframe:ifr,script:js,embed:ifr+'\n'+js,url:url};
  }
  var PLAT=[
    {k:'facebook',l:'Facebook',url:function(u){return 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u);}},
    {k:'x',l:'X',url:function(u,txt){return 'https://twitter.com/intent/tweet?text='+encodeURIComponent(txt)+'&url='+encodeURIComponent(u);}},
    {k:'linkedin',l:'LinkedIn',url:function(u){return 'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(u);}},
    {k:'whatsapp',l:'WhatsApp',url:function(u,txt){return 'https://wa.me/?text='+encodeURIComponent(txt+' '+u);}},
    {k:'sms',l:'Text',url:function(u,txt){return 'sms:?&body='+encodeURIComponent(txt+' '+u);}}
  ];
  window.bpToolGetHtml=function(t){
    var btn=function(id,ico,label,extra){return '<button class="bpt-btn" id="'+id+'" onclick="bpToolCopyStr(this)"'+(extra||'')+'><span class=ms>'+ico+'</span>'+label+'</button>';};
    return '<aside class="bpt-get" data-tool-get="'+t+'">'
      +'<div class="bpt-get-h">Get it</div>'
      +'<div id="bpt-uidnote"></div>'
      +'<div class="bpt-grp"><div class="bpt-grp-l">Website</div>'
        +btn('bptCopyEmbed','code','Copy embed code',' data-copy=""')
        +btn('bptCopyLink','link','Copy link',' data-copy=""')
      +'</div>'
      +'<div class="bpt-grp bpt-qrrow"><canvas id="bpToolQR" width="232" height="232" aria-label="QR code for the direct link"></canvas>'
        +'<div><div class="bpt-grp-l">QR code</div><button class="bpt-btn" id="bptQRDl" onclick="bpToolQRDownload()"><span class=ms>download</span>Download QR</button></div></div>'
      +'<div class="bpt-grp"><div class="bpt-grp-l">Share</div><div class="bpt-shgrid">'
        +PLAT.map(function(p){return '<a class="bpt-chip" data-share="'+p.k+'" target="_blank" rel="noopener">'+p.l+'</a>';}).join('')
        +'<button class="bpt-chip" id="bptCopyBio" data-copy="" onclick="bpToolCopyStr(this)" title="Paste into your Instagram or TikTok bio">Instagram / TikTok bio</button>'
      +'</div></div>'
      +'<p class="bpt-lic">Licensed to your business for sites you own while your subscription is active. Please don’t share the code with other businesses.</p>'
      +'</aside>';
  };
  window.bpToolEmbedFill=function(t){
    withUid(function(){
      var s=snippets(t),e=document.getElementById('bptCopyEmbed');if(!e)return;
      window._bpEmbedSnippet=s.embed;window._bpToolLink=s.url;
      e.setAttribute('data-copy',s.embed);
      var l=document.getElementById('bptCopyLink');if(l)l.setAttribute('data-copy',s.url);
      var bio=document.getElementById('bptCopyBio');if(bio)bio.setAttribute('data-copy',bpToolUrl(t,null,'instagram'));
      var txt=bpToolCopy(t).h;
      document.querySelectorAll('[data-share]').forEach(function(a){
        var k=a.getAttribute('data-share');PLAT.forEach(function(p){if(p.k===k)a.href=p.url(bpToolUrl(t,null,k),txt);});
      });
      var n=document.getElementById('bpt-uidnote');
      if(n)n.innerHTML=uid?'':'<div class="bpt-warn">Sign in to your live account so leads from these links reach you.</div>';
      drawQR(document.getElementById('bpToolQR'),s.url);
    });
  };
  function drawQR(cv,url){
    if(!cv)return false;var ctx=cv.getContext('2d');
    try{var q=bpQR(url),px=Math.max(2,Math.floor(cv.width/(q.size+8))),full=(q.size+8)*px;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);bpQRDraw(ctx,url,Math.floor((cv.width-full)/2),Math.floor((cv.height-full)/2),px,'#0b1220','#fff');cv.setAttribute('data-qr',url);return true;}
    catch(e){ctx.fillStyle='#f3f4f6';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='#6b7280';ctx.font='13px sans-serif';ctx.fillText('QR unavailable',60,cv.height/2);return false;}
  }
  function download(canvas,name){
    var go=function(href){var a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a);if(/^blob:/.test(href))URL.revokeObjectURL(href);},500);};
    try{ if(canvas.toBlob)canvas.toBlob(function(b){go(b?URL.createObjectURL(b):canvas.toDataURL('image/png'));},'image/png'); else go(canvas.toDataURL('image/png')); }
    catch(e){}
  }
  window.bpToolQRDownload=function(){
    var url=window._bpToolLink;if(!url)return;
    var cv=document.createElement('canvas');cv.width=cv.height=1024;drawQR(cv,url);
    download(cv,'qr-'+(window._bpCalcTool||'quote')+'-'+cid()+'.png');
  };
})();
