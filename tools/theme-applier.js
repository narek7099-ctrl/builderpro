/* BuilderPro embed theme — injected into every public embed page by
   tools/build-embeds.py, and mirrored in book/index.html.

   Reads the owner's saved look from embed_themes (colours, font, corner radius,
   logo, header image) and applies it. Also listens for a postMessage of
   {type:"bp-theme", theme} so the portal's Customize page can preview edits
   live inside an iframe before they are saved. */
(function(){
  var U="https://ttzwzouhiwdwamuimhpo.supabase.co";
  var A="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0end6b3VoaXdkd2FtdWltaHBvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxMTc2NjgsImV4cCI6MjA5ODY5MzY2OH0.oVqdHZlZLWJd_8nkgPRA9VgAqY4ytg51N1mT3Hqekso";
  var KIND="__KIND__";
  var q=new URLSearchParams(location.search), OWN=(q.get("u")||"").replace(/[^0-9a-f-]/gi,"");
  var FONTS={"Geist":"Geist:wght@400;500;600;700;800","Inter":"Inter:wght@400;500;600;700;800","Plus Jakarta Sans":"Plus+Jakarta+Sans:wght@400;500;600;700;800","Manrope":"Manrope:wght@400;500;600;700;800","DM Sans":"DM+Sans:wght@400;500;600;700","Space Grotesk":"Space+Grotesk:wght@400;500;600;700","Lato":"Lato:wght@400;700;900","Roboto":"Roboto:wght@400;500;700","Nunito":"Nunito:wght@400;600;700;800","Poppins":"Poppins:wght@400;500;600;700","Montserrat":"Montserrat:wght@400;500;600;700;800","Playfair Display":"Playfair+Display:wght@500;600;700"};
  function hex(c){ c=String(c||"").trim(); return /^#[0-9a-f]{6}$/i.test(c)?c:(/^#[0-9a-f]{3}$/i.test(c)?"#"+c[1]+c[1]+c[2]+c[2]+c[3]+c[3]:""); }
  function rgba(h,a){ h=hex(h); if(!h) return ""; return "rgba("+parseInt(h.slice(1,3),16)+","+parseInt(h.slice(3,5),16)+","+parseInt(h.slice(5,7),16)+","+a+")"; }
  function lighten(h,amt){ h=hex(h); if(!h) return ""; var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); var f=function(v){return Math.round(v+(255-v)*amt);}; return "#"+[f(r),f(g),f(b)].map(function(v){return ("0"+v.toString(16)).slice(-2);}).join(""); }
  function darken(h,amt){ h=hex(h); if(!h) return ""; var r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16); var f=function(v){return Math.round(v*(1-amt));}; return "#"+[f(r),f(g),f(b)].map(function(v){return ("0"+v.toString(16)).slice(-2);}).join(""); }
  function safeUrl(u){ u=String(u||"").trim(); return (/^https?:\/\//i.test(u)||/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(u))?u:""; }
  function ensureFont(name){
    if(!FONTS[name]||document.getElementById("bp-font-"+name.replace(/\W/g,""))) return;
    var l=document.createElement("link"); l.id="bp-font-"+name.replace(/\W/g,""); l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family="+FONTS[name]+"&display=swap"; document.head.appendChild(l);
  }
  function apply(t){
    t=t||{}; window.__bpThemeCur=t;
    var css="", p=hex(t.primary), bg=hex(t.bg), card=hex(t.card), ink=hex(t.text), r=(t.radius===""||t.radius==null)?null:Math.max(0,Math.min(28,+t.radius||0));
    if(t.font&&FONTS[t.font]) ensureFont(t.font);
    if(KIND==="calc"){
      var sel="#est-embed";
      if(p) css+=sel+"{--a:"+p+" !important;--al:"+lighten(p,.55)+" !important;--ag:"+rgba(p,.18)+" !important;--blue-l:"+lighten(p,.45)+" !important;--cyan:"+lighten(p,.45)+" !important}";
      if(bg) css+="html,body,.est-stage{background:"+bg+" !important}";
      if(card) css+=sel+"{--card:"+card+" !important;--bg:"+card+" !important;background:"+card+" !important}";
      if(ink) css+=sel+"{--txt:"+ink+" !important;--text:"+ink+" !important;--w:"+ink+" !important;color:"+ink+" !important}";
      if(t.font) css+=sel+","+sel+" *{font-family:'"+t.font+"',system-ui,sans-serif !important}";
      if(r!=null) css+=sel+" button,"+sel+" input,"+sel+" select,"+sel+" .e-card,"+sel+" .e-btn,"+sel+" [class*='card'],"+sel+" [class*='btn']{border-radius:"+r+"px !important}#est-embed{border-radius:"+Math.min(r+6,28)+"px !important}";
      if(t.hideBrand) css+=sel+" [class*='powered'],"+sel+" [class*='brand']{display:none !important}";
    } else {
      if(p) css+=":root{--blue:"+p+" !important;--blue-hi:"+lighten(p,.22)+" !important;--blue-act:"+darken(p,.18)+" !important;--blue-soft:"+lighten(p,.86)+" !important}";
      if(bg) css+="html,body{background:"+bg+" !important}";
      if(card) css+=":root{--card:"+card+" !important;--soft:"+lighten(card,.0)+" !important}.side{background:"+darken(card,.03)+" !important}";
      if(ink) css+=":root{--ink:"+ink+" !important;--body:"+ink+" !important}";
      if(t.font) css+="html,body,button,input,textarea,select{font-family:'"+t.font+"',system-ui,sans-serif !important}";
      if(r!=null) css+=".card{border-radius:"+r+"px !important}.tray{border-radius:"+(r+8)+"px !important}.chip,.mdt-sel,.mdt-opt,.btn,.f input,.f textarea,.summary{border-radius:"+Math.max(4,Math.round(r*.7))+"px !important}";
      if(t.hideBrand) css+=".brand{display:none !important}";
    }
    var st=document.getElementById("bp-theme"); if(!st){ st=document.createElement("style"); st.id="bp-theme"; document.head.appendChild(st); } st.textContent=css;
    // images: a logo above the content, and (booking page) a header photo in the side panel
    var logo=safeUrl(t.logo), hero=safeUrl(t.hero);
    var tries=0; (function mount(){
      var host=KIND==="calc"?document.getElementById("est-embed"):document.querySelector(".side");
      if(!host){ if(++tries<40) setTimeout(mount,150); return; }
      var lg=document.getElementById("bp-logo");
      if(logo){ if(!lg){ lg=document.createElement("div"); lg.id="bp-logo"; lg.style.cssText="padding:"+(KIND==="calc"?"18px 20px 0":"0 0 14px")+";display:flex;align-items:center"; host.insertBefore(lg,host.firstChild); } lg.innerHTML='<img src="'+logo.replace(/"/g,"&quot;")+'" alt="" style="max-height:'+(t.logoSize||44)+'px;max-width:220px;object-fit:contain">'; }
      else if(lg) lg.parentNode.removeChild(lg);
      if(KIND!=="calc"){
        var hv=document.getElementById("bp-hero");
        if(hero){ if(!hv){ hv=document.createElement("div"); hv.id="bp-hero"; host.insertBefore(hv,host.firstChild); } hv.style.cssText="margin:-28px -26px 18px;height:150px;background:linear-gradient(150deg,rgba(18,35,61,.55),rgba(30,58,99,.35)),url("+JSON.stringify(hero)+") center/cover"; if(document.body.classList.contains("embed")){} }
        else if(hv) hv.parentNode.removeChild(hv);
      } else {
        var hc=document.getElementById("bp-hero");
        if(hero){ if(!hc){ hc=document.createElement("div"); hc.id="bp-hero"; host.insertBefore(hc,host.firstChild); } hc.style.cssText="height:160px;background:linear-gradient(150deg,rgba(18,35,61,.55),rgba(30,58,99,.35)),url("+JSON.stringify(hero)+") center/cover"; }
        else if(hc) hc.parentNode.removeChild(hc);
      }
    })();
  }
  window.__bpApplyTheme=apply;
  window.addEventListener("message",function(e){ var d=e&&e.data; if(d&&d.type==="bp-theme"&&d.theme&&typeof d.theme==="object") apply(d.theme); });
  if(OWN){
    fetch(U+"/rest/v1/embed_themes?owner=eq."+OWN+"&kind=eq."+KIND+"&select=theme",{headers:{apikey:A,Authorization:"Bearer "+A}})
      .then(function(r){return r.ok?r.json():[];}).then(function(rows){ if(Array.isArray(rows)&&rows[0]&&rows[0].theme) apply(rows[0].theme); }).catch(function(){});
  }
})();
