/* My Calculators: the three public tools a contractor gets for their trade.

     quote   embed/<trade>.html          the instant quote calculator
     health  embed/health-<trade>.html   the 45-second health check
     damage  embed/damage-<trade>.html   photo -> damage report

   Each has its own preview, embed code, direct link and QR code, plus a
   "Share on social" panel (UTM-tagged links per platform, captions and
   downloadable share images). The look set in Customize is one theme for all
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
  function biz(){var b='';try{b=((bpSettingsGet()||{}).company||{}).name||'';}catch(e){}return b;}
  function bizOr(){return biz()||'our team';}
  function theme(){var t={};try{t=JSON.parse(localStorage.getItem('bpTheme_calc')||'{}')||{};}catch(e){}return t;}

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

  /* ---------- switcher + shared-look note ---------- */
  window.bpToolSwitcher=function(cur){
    var c=cid();
    return '<div class="bpt-cards" role="tablist" aria-label="Your tools">'+TOOLS.map(function(t){
      return '<button class="bpt-card'+(t.id===cur?' on':'')+'" role="tab" aria-selected="'+(t.id===cur)+'" data-calc-tool="'+t.id+'" onclick="bpCalcTool(\''+t.id+'\')" style="--tc:'+t.color+'">'
        +'<span class="bpt-ico ms">'+t.ico+'</span><span class="bpt-ct"><b>'+esc(t.l)+'</b><small>'+esc(t.s)+'</small></span></button>';
    }).join('')+'</div>'
    +'<div class="bpt-note"><span class=ms>palette</span><span>Customize is shared: your colours, font and logo apply to all three tools. Prices you set drive the quote calculator and the cost ranges in both checks.</span></div>';
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

  /* ---------- embed: iframe, auto-resize, link, QR ---------- */
  function snippets(t){
    var url=bpToolUrl(t), title=tool(t).l;
    var ifr='<iframe src="'+url+'" data-bp-tool="'+t+'" title="'+title+'" loading="lazy" style="width:100%;min-height:'+(t==='quote'?720:640)+'px;border:0;border-radius:16px;overflow:hidden"></iframe>';
    var js='<script>window.addEventListener("message",function(e){if(!e.data||e.data.bp!=="height")return;document.querySelectorAll("iframe[data-bp-tool]").forEach(function(f){if(f.contentWindow===e.source)f.style.height=Math.max(e.data.h,400)+"px";});});</'+'script>';
    return {iframe:ifr,script:js,url:url};
  }
  window.bpToolEmbedHtml=function(t){
    return '<div class="bpx-panel bpt-embed" data-tool-embed="'+t+'">'
      +'<div class="bpx-ptitle">Put the '+esc(tool(t).l.toLowerCase())+' on your website<span class="lg2">one line of code</span></div>'
      +'<p class="bpx-mut bpt-p">Paste this where you want it to appear. It loads your prices and your look live, so anything you save in Customize is on your site the moment you save it. Every result a visitor gets lands in your Lead Radar.</p>'
      +'<div id="bpt-uidnote"></div>'
      +'<div class="bpt-lab">1 · Embed code</div>'
      +'<div class="em-code"><pre id="bpEmbedCode">Getting your embed code…</pre><button class="bpx-rowbtn primary" id="bpEmbedCopy" onclick="bpEmbedCopy()"><span class=ms>content_copy</span> Copy code</button></div>'
      +'<div class="bpt-lab">2 · Optional: auto-resize <small>paste once per page, anywhere after the embed code. The tool then grows and shrinks to fit, with no inner scrollbar.</small></div>'
      +'<div class="em-code"><pre id="bpEmbedScript"></pre><button class="bpx-rowbtn" onclick="bpToolCopyEl(\'bpEmbedScript\',this)"><span class=ms>content_copy</span> Copy script</button></div>'
      +'<div class="bpx-mut" style="font-size:12px;margin-top:8px">Works on WordPress, Squarespace, Wix, Webflow, GoHighLevel sites, or plain HTML. Ask your web person to drop it into an HTML or Embed block.</div>'
      +'<div class="bpt-linkqr">'
        +'<div class="bpt-linkbox"><div class="bpt-lab" style="margin-top:0">Direct link <small>for texts, emails, Google, your van, a yard sign</small></div>'
          +'<div class="bpt-link"><input id="bpToolLink" readonly aria-label="Direct link"><button class="bpx-rowbtn primary" id="bpToolLinkCopy" onclick="bpToolCopyEl(\'bpToolLink\',this)"><span class=ms>link</span> Copy link</button>'
          +'<a class="bpx-rowbtn" id="bpToolLinkOpen" target="_blank" rel="noopener"><span class=ms>open_in_new</span> Open</a></div></div>'
        +'<div class="bpt-qr"><canvas id="bpToolQR" width="232" height="232" aria-label="QR code for the direct link"></canvas>'
          +'<button class="bpx-rowbtn" onclick="bpToolQRDownload()"><span class=ms>download</span> QR code PNG</button></div>'
      +'</div>'
      +bpEmbedLicence()
      +'</div>';
  };
  function bpEmbedLicence(){
    return '<div class="em-lic"><div class="em-lic-h"><span class=ms>gavel</span>Embed licence</div>'
      +'<ol>'
      +'<li><b>It’s licensed, not sold.</b> These tools (the quote calculator, health check and damage check) are licensed to your business, for websites you own or control, for as long as your BuilderPro subscription is active.</li>'
      +'<li><b>Don’t share it.</b> The tools, their code and their design are the copyright of BuilderPro OS. You may not copy, resell, sublicense or hand the embed code or the tools to another business, or place them on a site you don’t own. Sharing the direct link with your own customers is fine.</li>'
      +'<li><b>It’s traceable.</b> Your embed and links carry your account id, and every result records the website it came from, so a copy leads back to the account it was issued to.</li>'
      +'<li><b>If it is shared anyway:</b> we can switch the tools off on unauthorised sites and, where it’s deliberate, end the subscription. Unauthorised copying or distribution of copyrighted software can also be pursued as copyright infringement; US law allows statutory damages of up to $150,000 per work for wilful infringement.</li>'
      +'</ol>'
      +'<div class="em-lic-f">This is a plain-language summary, not legal advice. Your full terms are in your BuilderPro agreement.</div>'
      +'</div>';
  }
  window.bpToolEmbedFill=function(t){
    withUid(function(){
      var s=snippets(t),pre=document.getElementById('bpEmbedCode');if(!pre)return;
      window._bpEmbedSnippet=s.iframe;pre.textContent=s.iframe;
      var sc=document.getElementById('bpEmbedScript');if(sc)sc.textContent=s.script;
      var li=document.getElementById('bpToolLink');if(li){li.value=s.url;li.setAttribute('data-copy',s.url);}
      var op=document.getElementById('bpToolLinkOpen');if(op)op.href=s.url;
      var n=document.getElementById('bpt-uidnote');
      if(n)n.innerHTML=uid?'':'<div class="bpt-warn"><span class=ms>info</span>Sign in to your live account to put your account id in this code and link. Without it the tool shows default prices and leads can’t reach you.</div>';
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
    catch(e){ /* a logo without CORS taints the canvas: redraw without it */ if(canvas._redraw){canvas._redraw(true);download(canvas,name);} }
  }
  window.bpToolQRDownload=function(){
    var url=(document.getElementById('bpToolLink')||{}).value;if(!url)return;
    var cv=document.createElement('canvas');cv.width=cv.height=1024;drawQR(cv,url);
    download(cv,'qr-'+(window._bpCalcTool||'quote')+'-'+cid()+'.png');
  };

  /* ---------- share on social ---------- */
  function captions(t){
    var c=cid(),b=bizOr(),n=NOUN[c]||c,tn=tradeName(c).toLowerCase();
    if(t==='health')return [
      'How healthy is your '+n+'? Take our free 45-second '+n+' health check and get a score, what to fix first and a rough cost. From '+b+'.',
      'Not sure if your '+n+' needs attention? Six quick questions, an instant answer. Free from '+b+', no sign-up.',
      'Before small problems turn into big bills: run the free '+tn+' health check from '+b+' and see where you stand in under a minute.'];
    if(t==='damage')return [
      'Storm, leak or accident? Snap a photo and get a free damage report: severity, likely cause, insurance hints and a repair estimate. From '+b+'.',
      'Got '+n+' damage? Upload a photo, answer 4 quick questions, and '+b+' will show you what you’re dealing with. Free.',
      'Don’t guess what that damage will cost. Our free photo damage check gives you a report in about a minute. From '+b+'.'];
    return [
      'Wondering what your '+n+' project will cost? Get an instant quote in 60 seconds with '+b+'’s free calculator. No calls, no sign-up.',
      'Real prices, no waiting: try '+b+'’s instant '+tn+' quote calculator and see your range right now.',
      'Planning a '+n+' project this season? Get a ballpark price in a minute, then book a free on-site estimate with '+b+'.'];
  }
  var PLAT=[
    {k:'facebook',l:'Facebook',ico:'thumb_up',url:function(u,txt){return 'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(u);}},
    {k:'x',l:'X / Twitter',ico:'alternate_email',url:function(u,txt){return 'https://twitter.com/intent/tweet?text='+encodeURIComponent(txt)+'&url='+encodeURIComponent(u);}},
    {k:'linkedin',l:'LinkedIn',ico:'work',url:function(u){return 'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(u);}},
    {k:'whatsapp',l:'WhatsApp',ico:'chat',url:function(u,txt){return 'https://wa.me/?text='+encodeURIComponent(txt+' '+u);}},
    {k:'sms',l:'Text message',ico:'sms',url:function(u,txt){return 'sms:?&body='+encodeURIComponent(txt+' '+u);}}
  ];
  window.bpToolShareHtml=function(t){
    var caps=captions(t);
    var row=function(p){return '<a class="bpt-sh" data-share="'+p.k+'" target="_blank" rel="noopener"><span class=ms>'+p.ico+'</span>'+p.l+'</a>';};
    var how=function(k,ico,title,body,btns){return '<div class="bpt-how" data-how="'+k+'"><div class="bpt-how-h"><span class=ms>'+ico+'</span><b>'+title+'</b></div><div class="bpt-how-b">'+body+'</div><div class="bpt-how-a">'+btns+'</div></div>';};
    var cl=function(src,label){return '<button class="bpx-rowbtn" data-copy-src="'+src+'" onclick="bpToolCopyStr(this)"><span class=ms>content_copy</span> '+label+'</button>';};
    return '<div class="bpx-panel bpt-share" data-tool-share="'+t+'">'
      +'<div class="bpx-ptitle">Share the '+esc(tool(t).l.toLowerCase())+' on social<span class="lg2">every link is tagged so you can see which platform sends leads</span></div>'
      +'<div class="bpt-shrow">'+PLAT.map(row).join('')
        +'<button class="bpt-sh" id="bpt-native" onclick="bpToolNativeShare()" hidden><span class=ms>ios_share</span>Share…</button></div>'
      +'<div class="bpt-hows">'
        +how('nextdoor','holiday_village','Nextdoor','Nextdoor has no share link. Copy the link, open Nextdoor, and paste it into a post or your Business Page. Neighbours trust local recommendations, so pair it with a short caption below.',cl('nextdoor','Copy link')+'<a class="bpx-rowbtn" href="https://nextdoor.com/" target="_blank" rel="noopener"><span class=ms>open_in_new</span> Open Nextdoor</a>')
        +how('instagram','photo_camera','Instagram','Instagram doesn’t allow links in posts. <b>Link in bio:</b> Edit profile → Links → Add external link, paste this. <b>Stories:</b> post the story image below, tap the sticker icon → <b>Link</b>, paste the link. Captions can say “link in bio”.',cl('instagram','Copy link for bio')+'<button class="bpx-rowbtn" onclick="bpToolShareImg(\'story\')"><span class=ms>download</span> Story image</button>')
        +how('tiktok','music_note','TikTok','TikTok has no web share for links. Add it to your profile: Edit profile → <b>Website</b> (business accounts) and paste the link, then say “link in bio” in your videos. Post the square or story image as a photo post.',cl('tiktok','Copy link for bio')+'<button class="bpx-rowbtn" onclick="bpToolShareImg(\'square\')"><span class=ms>download</span> Square image</button>')
        +how('google','storefront','Google Business Profile','In your Business Profile choose <b>Add update</b>, paste the post text, add the square image, set the button to <b>Learn more</b> and paste the link. To make it your <b>Book</b> button: Edit profile → Bookings (or “Appointment links”) → paste the link.',cl('google','Copy link')+'<button class="bpx-rowbtn" data-copy-src="gbp" onclick="bpToolCopyStr(this)"><span class=ms>content_copy</span> Copy post text</button>')
        +how('fbpage','flag','Facebook Page button','Put it one tap away on your Page: open your Page → <b>Edit action button</b> (or “Add button”) → choose <b>Book now</b> or <b>Learn more</b> → <b>Link to website</b> → paste this link.',cl('facebook','Copy Page button link'))
      +'</div>'
      +'<div class="bpt-lab">Share images <small>with your business name, logo (from Customize) and a QR code to this tool</small></div>'
      +'<div class="bpt-imgs">'
        +'<figure><canvas id="bptImgSquare" width="1080" height="1080" aria-label="Square share image"></canvas><figcaption>Feed post · 1080×1080<button class="bpx-rowbtn primary" data-dl="square" onclick="bpToolShareImg(\'square\')"><span class=ms>download</span> Download PNG</button></figcaption></figure>'
        +'<figure><canvas id="bptImgStory" width="1080" height="1920" aria-label="Story share image"></canvas><figcaption>Story · 1080×1920<button class="bpx-rowbtn primary" data-dl="story" onclick="bpToolShareImg(\'story\')"><span class=ms>download</span> Download PNG</button></figcaption></figure>'
      +'</div>'
      +'<div class="bpt-lab">Suggested captions <small>written with your trade and business name; edit freely</small></div>'
      +'<div class="bpt-caps">'+caps.map(function(c,i){return '<div class="bpt-cap"><p id="bptCap'+i+'">'+esc(c)+'</p><button class="bpx-rowbtn" onclick="bpToolCopyEl(\'bptCap'+i+'\',this)"><span class=ms>content_copy</span> Copy</button></div>';}).join('')+'</div>'
      +(biz()?'':'<div class="bpt-warn" style="margin-top:12px"><span class=ms>info</span>Add your business name in Settings → Company and it appears in these captions and images.</div>')
      +'</div>';
  };
  window.bpToolShareFill=function(t){
    withUid(function(){
      var cap=captions(t)[0];
      document.querySelectorAll('[data-share]').forEach(function(a){
        var k=a.getAttribute('data-share');PLAT.forEach(function(p){if(p.k===k)a.href=p.url(bpToolUrl(t,null,k),cap);});
      });
      document.querySelectorAll('[data-copy-src]').forEach(function(b){
        var s=b.getAttribute('data-copy-src');
        if(s==='gbp'){var c=bpToolCopy(t);b.setAttribute('data-copy',c.h+'. '+captions(t)[1]+' '+bpToolUrl(t,null,'google'));}
        else b.setAttribute('data-copy',bpToolUrl(t,null,s));
      });
      var nb=document.getElementById('bpt-native');if(nb)nb.hidden=!navigator.share;
      drawShare('square');drawShare('story');
    });
  };
  window.bpToolNativeShare=function(){
    var t=window._bpCalcTool||'quote';if(!navigator.share)return;
    navigator.share({title:bpToolCopy(t).h,text:captions(t)[0],url:bpToolUrl(t,null,'share')}).catch(function(){});
  };

  /* share image: business name + logo, headline, QR to the tool */
  function wrap(ctx,text,max){var w=String(text).split(/\s+/),lines=[],cur='';w.forEach(function(x){var t=cur?cur+' '+x:x;if(ctx.measureText(t).width>max&&cur){lines.push(cur);cur=x;}else cur=t;});if(cur)lines.push(cur);return lines;}
  function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  var logoCache={};
  function drawShare(kind,noLogo){
    var cv=document.getElementById(kind==='story'?'bptImgStory':'bptImgSquare');if(!cv)return;
    var t=window._bpCalcTool||'quote',T=tool(t),th=theme(),acc=(/^#[0-9a-f]{6}$/i.test(th.primary||'')?th.primary:T.color),
      ctx=cv.getContext('2d'),W=cv.width,H=cv.height,story=kind==='story',copy=bpToolCopy(t),url=bpToolUrl(t,null,story?'instagram':'facebook'),name=biz();
    var font=(th.font?"'"+th.font+"',":'')+'"Inter","Helvetica Neue",Arial,sans-serif';
    var paint=function(img){
      ctx.clearRect(0,0,W,H);
      var g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#0b1220');g.addColorStop(1,'#111c33');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      var rg=ctx.createRadialGradient(W*.85,H*.08,10,W*.85,H*.08,W*.9);rg.addColorStop(0,acc+'66');rg.addColorStop(1,acc+'00');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
      ctx.fillStyle=acc;ctx.fillRect(0,0,W,14);
      var pad=84,y=story?190:110;
      // brand row
      if(img){var lh=story?120:96,lw=Math.min(img.width*lh/img.height,W*.45);ctx.drawImage(img,pad,y,lw,lh*(lw/(img.width*lh/img.height)));y+=lh+28;}
      ctx.fillStyle='#ffffffcc';ctx.font='600 '+(story?44:38)+'px '+font;ctx.textBaseline='top';
      ctx.fillText((name||tradeName(cid())).slice(0,40),pad,y);y+=story?96:80;
      // kicker + headline
      ctx.fillStyle=acc;ctx.font='700 '+(story?36:30)+'px '+font;ctx.fillText(T.l.toUpperCase(),pad,y);y+=story?70:56;
      ctx.fillStyle='#fff';var hs=story?104:88;ctx.font='800 '+hs+'px '+font;
      wrap(ctx,copy.h,W-pad*2).slice(0,4).forEach(function(l){ctx.fillText(l,pad,y);y+=hs*1.12;});
      y+=story?30:16;ctx.fillStyle='#b9c4d8';var ds=story?40:32;ctx.font='400 '+ds+'px '+font;
      wrap(ctx,copy.d,W-pad*2).slice(0,story?4:2).forEach(function(l){ctx.fillText(l,pad,y);y+=ds*1.35;});
      // QR card
      var qs=story?380:300,qx=story?(W-qs)/2:W-pad-qs,qy=H-pad-qs-(story?190:0);
      ctx.fillStyle='#fff';rr(ctx,qx-18,qy-18,qs+36,qs+36,28);ctx.fill();
      try{var q=bpQR(url),px=Math.floor(qs/(q.size+2)),off=Math.floor((qs-px*q.size)/2);ctx.fillStyle='#0b1220';
        for(var r=0;r<q.size;r++)for(var c=0;c<q.size;c++)if(q.get(c,r))ctx.fillRect(qx+off+c*px,qy+off+r*px,px,px);}catch(e){}
      ctx.textBaseline='top';
      if(story){ctx.fillStyle='#fff';ctx.font='700 46px '+font;var s1='Scan, or tap the link',w1=ctx.measureText(s1).width;ctx.fillText(s1,(W-w1)/2,qy+qs+50);
        ctx.fillStyle='#b9c4d8';ctx.font='400 34px '+font;var s2='Free · takes about a minute',w2=ctx.measureText(s2).width;ctx.fillText(s2,(W-w2)/2,qy+qs+112);}
      else{ctx.fillStyle=acc;rr(ctx,pad,H-pad-96,420,96,48);ctx.fill();ctx.fillStyle='#fff';ctx.font='700 38px '+font;ctx.fillText('Scan to start  →',pad+40,H-pad-96+28);
        ctx.fillStyle='#8a97ad';ctx.font='400 26px '+font;ctx.fillText('Free · no sign-up',pad,H-pad-140);}
      cv.setAttribute('data-drawn',t+':'+(img?'logo':'nologo'));
    };
    cv._redraw=function(skip){drawShare(kind,skip);};
    var logo=!noLogo&&th.logo&&/^(https?:|data:image\/)/i.test(th.logo)?th.logo:'';
    paint(null);
    if(!logo)return;
    var go=function(img){paint(img);try{cv.toDataURL('image/png').slice(0,1);}catch(e){paint(null);}};
    if(logoCache[logo]){if(logoCache[logo]!=='bad')go(logoCache[logo]);return;}
    var im=new Image();if(!/^data:/.test(logo))im.crossOrigin='anonymous';
    im.onload=function(){logoCache[logo]=im;go(im);};im.onerror=function(){logoCache[logo]='bad';};im.src=logo;
  }
  window.bpToolShareImg=function(kind){
    var cv=document.getElementById(kind==='story'?'bptImgStory':'bptImgSquare');if(!cv)return;
    download(cv,(window._bpCalcTool||'quote')+'-'+cid()+'-'+(kind==='story'?'story-1080x1920':'post-1080x1080')+'.png');
  };
})();
