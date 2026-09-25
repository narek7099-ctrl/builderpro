/* HOUSE SCAN — the map-to-house shot for every calculator except roofing.
   Source for embed-src/house-scan.html, which tools/build-house-scan.py
   assembles from this file plus the map and house code shared with the roof
   scan (embed-src/roof-scan.html), so that code lives in one place.

   The shot: their street from above, their home's outline lights up, the
   camera tilts and the house rises out of the map — then each trade ends its
   own way, all in the same white-block look:

     hvac         a condenser appears beside the house, fan spinning; the camera
                  closes in and turns around it
     countertops  the roof lifts off and the camera drops into a kitchen
     trim         the roof lifts off; baseboard, casing and crown trace a room
     painting     every wall is traced and washed (a room, for interior jobs)
     pools        a pool is outlined, dug and filled in the back yard
     landscaping  the back yard is laid out: lawn, planting, stepping stones
     plumbing     the house turns to glass; supply lines run in to the fixtures
     electrical   the house turns to glass; circuits run out from the panel
     general      the whole house, every edge traced

   Everything is white — how things will LOOK is the image generator's job —
   and nothing waits on the homeowner's choices: the pool and the yard are
   picked at random (the same for the same address), and the real questions
   come after the scan, on the calculator's own steps.

   The measurement is the roof scan's: rapid-handler's building read, so the
   house is theirs. What it hands to each calculator is the step-1 number that
   trade asks for, where the house can supply it (home size for HVAC, painting
   and electrical; pool and yard size from the questions); otherwise the size
   slider opens for them as before. */
(function(){
  var TRADE = window.HS_TRADE || 'general';
  var HS_END = 15.0, HS_WAIT_MAX = 28;
  var st = null;
  (function(){ try{ if(document.getElementById('rs-geist')) return; var l=document.createElement('link'); l.id='rs-geist'; l.rel='stylesheet';
    l.href='https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap'; (document.head||document.documentElement).appendChild(l); }catch(e){} })();
  function $(id){ return document.getElementById(id); }
  function reduced(){ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } }

/*@@SHARED@@*/

  /* ── per-trade words ───────────────────────────────────────────────────── */
  var LABELS = {
    hvac:        ['Locating your home','Analyzing satellite imagery','Mapping your home','Placing your system','Sizing the space'],
    countertops: ['Locating your home','Analyzing satellite imagery','Mapping your home','Opening up the kitchen','Laying out the counters'],
    trim:        ['Locating your home','Analyzing satellite imagery','Mapping your home','Stepping inside','Tracing the trim'],
    painting:    ['Locating your home','Analyzing satellite imagery','Mapping your home','Tracing the walls','Measuring paintable area'],
    pools:       ['Locating your home','Analyzing satellite imagery','Mapping your yard','Placing your pool','Filling it in'],
    landscaping: ['Locating your home','Analyzing satellite imagery','Mapping your yard','Laying out the yard','Planting it in'],
    plumbing:    ['Locating your home','Analyzing satellite imagery','Mapping your home','Finding the service line','Running the supply lines'],
    electrical:  ['Locating your home','Analyzing satellite imagery','Mapping your home','Finding the panel','Running the circuits'],
    general:     ['Locating your home','Analyzing satellite imagery','Mapping your home','Measuring every wall','Sizing the house']
  };
  var STEP_T = [0.0, 2.6, 5.6, 8.8, 11.8];
  function label(i){ return (LABELS[TRADE]||LABELS.general)[i]; }

  /* ── the scene, in the house's own frame ───────────────────────────────────
     Every trade ending is built in "house coordinates": a along the house's
     long grid line, b across it, y up, in feet, around the house's centre.
     hx() works those out once from the measured house. */
  function hx(geo){
    if(geo._hx) return geo._hx;
    var th=(geo.axes&&geo.axes.th)||0, u=[Math.cos(th),Math.sin(th)], v=[-Math.sin(th),Math.cos(th)];
    var pts=[]; (geo.foot||[]).forEach(function(f){ f.forEach(function(p){ pts.push(p); }); });
    var cx=0,cz=0; pts.forEach(function(p){ cx+=p[0]; cz+=p[2]; }); cx/=pts.length||1; cz/=pts.length||1;
    var a0=1e9,a1=-1e9,b0=1e9,b1=-1e9;
    pts.forEach(function(p){ var dx=p[0]-cx, dz=p[2]-cz, a=dx*u[0]+dz*u[1], b=dx*v[0]+dz*v[1];
      if(a<a0)a0=a; if(a>a1)a1=a; if(b<b0)b0=b; if(b>b1)b1=b; });
    var H={c:[cx,cz], u:u, v:v, a0:a0, a1:a1, b0:b0, b1:b1, wall:10};
    H.w=function(a,y,b){ return [cx+u[0]*a+v[0]*b, y, cz+u[1]*a+v[1]*b]; };
    /* which side faces the street: the nearest road on the map, snapped to
       the house's grid. No map, or no road near: south, the usual default. */
    var fx=0, fz=1;
    if(st&&st.map&&st.map.roads&&st.map.roads.length){
      var best=1e12;
      st.map.roads.forEach(function(rd){ for(var i=0;i+1<rd.pts.length;i++){
        var p=rd.pts[i], q=rd.pts[i+1], ex=q[0]-p[0], ez=q[1]-p[1], L=ex*ex+ez*ez||1;
        var t=Math.max(0,Math.min(1,((cx-p[0])*ex+(cz-p[1])*ez)/L)), px=p[0]+ex*t, pz=p[1]+ez*t, d=(px-cx)*(px-cx)+(pz-cz)*(pz-cz);
        if(d<best){ best=d; fx=px-cx; fz=pz-cz; }
      } });
    }
    var fa=fx*u[0]+fz*u[1], fb=fx*v[0]+fz*v[1];
    H.front = Math.abs(fa)>Math.abs(fb) ? [fa>0?1:-1,0] : [0,fb>0?1:-1];   /* in (a,b) */
    H.side  = [ -H.front[1], H.front[0] ];
    geo._hx=H; return H;
  }
  /* a box in house coordinates -> faces in the world */
  /* deco: [side b0, side a1, side b1, side a0, top] drawers, called right
     after that face is painted, so detail is hidden exactly when its face
     is. cull: a wall that should not be drawn while it faces the camera. */
  function box(H, a0,a1, y0,y1, b0,b1, grp, style, deco, cull){
    var P=function(a,y,b){ return H.w(a,y,b); };
    var v=[P(a0,y0,b0),P(a1,y0,b0),P(a1,y0,b1),P(a0,y0,b1),P(a0,y1,b0),P(a1,y1,b0),P(a1,y1,b1),P(a0,y1,b1)];
    var f=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]];
    return f.map(function(ix,i){ return {v:ix.map(function(k){ return v[k]; }), kind:i===4?'top':'side', grp:grp, style:style||{}, deco:deco&&deco[i], cull:cull}; });
  }
  function seg(ctx,P,a,b,part,col,wpx){ if(part<=0) return; var A=P(a),B=P(b); ctx.strokeStyle=col; ctx.lineWidth=wpx; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(A.x+(B.x-A.x)*part, A.y+(B.y-A.y)*part); ctx.stroke(); }
  /* draw a chain of segments progressively, p in 0..1 across the whole chain */
  function chain(ctx,P,list,p,col,wpx){ var n=list.length, d=p*n; for(var i=0;i<n;i++){ var q=Math.max(0,Math.min(1,d-i)); if(q<=0) break; seg(ctx,P,list[i][0],list[i][1],q,col,wpx); } }
  function dot(ctx,P,p,r,col){ var q=P(p); ctx.fillStyle=col; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,Math.PI*2); ctx.fill(); }
  function faceTo(H, a, b){ var p=H.w(a,0,b); return Math.atan2(-(p[0]-H.c[0]), -(p[2]-H.c[1])); }
  function ringPts(H, poly, y){ return poly.map(function(q){ return H.w(q[0],y,q[1]); }); }

  var BLUE='#006fff', INK='rgba(0,21,48,.16)';

  /* ── shapes for the subjects ───────────────────────────────────────────── */
  /* an upright cylinder: n sides and a top */
  function cyl(H, a, b, r, y0, y1, n, grp, fill, topDeco){
    var ring=function(y){ var p=[]; for(var i=0;i<n;i++){ var t=i/n*Math.PI*2; p.push(H.w(a+Math.cos(t)*r, y, b+Math.sin(t)*r)); } return p; };
    var lo=ring(y0), hi=ring(y1), out=[];
    for(var i=0;i<n;i++){ var j=(i+1)%n; out.push({v:[lo[i],lo[j],hi[j],hi[i]], kind:'side', grp:grp, style:{fill:fill}}); }
    out.push({v:hi, kind:'top', grp:grp, style:{fill:fill}, deco:topDeco});
    return out;
  }
  /* a pipe run, drawn as a tube: a dark edge and a white core, round at the
     bends. A few lines per segment, so a whole assembly stays cheap.
     flow: blue dashes running along it. */
  function pipe(H, pts, dia, grp, flow, now){
    var out=[];
    for(var i=0;i+1<pts.length;i++){ (function(a,b){
      out.push({v:[a,b], kind:'pipe', grp:grp, draw:function(ctx,P,dpr){
        var A=P(a), B=P(b), wpx=Math.max(2*dpr, dia*P.scale);
        ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.strokeStyle='rgba(0,21,48,.38)'; ctx.lineWidth=wpx+2*dpr; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
        ctx.strokeStyle='#ffffff'; ctx.lineWidth=wpx; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
        if(flow){ ctx.strokeStyle=BLUE; ctx.lineWidth=Math.max(1.2*dpr,wpx*0.35); ctx.setLineDash([wpx*1.2, wpx*2.6]); ctx.lineDashOffset=-now*wpx*6*(flow||1);
          ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); ctx.setLineDash([]); }
      }});
    })(H.w(pts[i][0],pts[i][1],pts[i][2]), H.w(pts[i+1][0],pts[i+1][1],pts[i+1][2])); }
    return out;
  }
  /* a round shrub or canopy: a white ball with a soft underside */
  function blob(H, a, y, b, r, grp){
    var c=H.w(a,y,b);
    return {v:[c], kind:'blob', grp:grp, draw:function(ctx,P,dpr){ var q=P(c), R=r*P.scale;
      ctx.fillStyle='#ffffff'; ctx.strokeStyle='rgba(0,21,48,.28)'; ctx.lineWidth=1*dpr;
      ctx.beginPath(); ctx.arc(q.x,q.y,R,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle='rgba(0,21,48,.05)'; ctx.beginPath(); ctx.arc(q.x+R*0.18,q.y+R*0.22,R*0.72,0,Math.PI*2); ctx.fill(); }};
  }
  /* a flat slab at ground level, drawn before everything else */
  function ground(H, poly, y, fill, deco){
    var pts=poly.map(function(p){ return H.w(p[0],y,p[1]); });
    return {v:pts, kind:'ground', under:true, draw:function(ctx,P,dpr){
      ctx.fillStyle=fill; ctx.strokeStyle='rgba(0,21,48,.2)'; ctx.lineWidth=1*dpr;
      ctx.beginPath(); pts.forEach(function(p,i){ var q=P(p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      if(deco) deco(ctx,P,dpr); }};
  }

  /* a pool: a deck around it, the coping traced, the water with a slow
     ripple, a diving board, a ladder, two loungers */
  function poolScene(T,H,now){
    var q=randomPool(), poly=poolPoly(q), L=poly.ext[0], W=poly.ext[1];
    var kd=ease(span(T,8.8,9.4)), kh=ease(span(T,9.3,10.3)), kw=ease(span(T,10.2,11.2)), kx=ease(span(T,10.6,11.4));
    var dx=L/2+6, dz=W/2+6, depth=5*kh, deckY=0.3;
    var ring=poly.pts;
    var faces=[];
    if(kd>0.01){
      /* the deck with the pool cut out of it, and the pool inside */
      faces.push({v:[H.w(-dx,deckY,-dz),H.w(dx,deckY,dz)], kind:'ground', under:true, draw:function(ctx,P,dpr){
        var o=[[-dx,-dz],[dx,-dz],[dx,dz],[-dx,dz]].map(function(p){ return P(H.w(p[0]*kd,deckY,p[1]*kd)); });
        var top=ring.map(function(p){ return H.w(p[0],deckY,p[1]); }), op=top.map(P);
        ctx.fillStyle='#f6f8fb'; ctx.strokeStyle='rgba(0,21,48,.2)'; ctx.lineWidth=1*dpr;
        ctx.beginPath(); o.forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath();
        if(kh>0){ op.slice().reverse().forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); }
        ctx.fill('evenodd'); ctx.stroke();
        if(kh<=0) return;
        var bot=ring.map(function(p){ return H.w(p[0],deckY-depth,p[1]); }), area=0;
        for(var i=0;i<op.length;i++){ var A=op[i], B=op[(i+1)%op.length]; area+=A.x*B.y-B.x*A.y; }
        ctx.save(); ctx.beginPath(); op.forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); ctx.clip();
        ctx.fillStyle='#eef1f5'; ctx.beginPath(); bot.map(P).forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); ctx.fill();
        for(var j=0;j<top.length;j++){ var k=(j+1)%top.length, qd=[top[j],top[k],bot[k],bot[j]].map(P), sa=0;
          for(var m=0;m<4;m++){ var A2=qd[m], B2=qd[(m+1)%4]; sa+=A2.x*B2.y-B2.x*A2.y; }
          if(sa*area<0) continue;
          ctx.fillStyle='#e3e8ee'; ctx.beginPath(); qd.forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); ctx.fill(); }
        if(kw>0){ var wy=deckY-depth+(depth-0.5)*kw, wt=ring.map(function(p){ return P(H.w(p[0],wy,p[1])); });
          ctx.fillStyle='rgba(255,255,255,.88)'; ctx.beginPath(); wt.forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); ctx.fill();
          /* two slow ripples across the surface */
          ctx.strokeStyle='rgba(0,111,255,.35)'; ctx.lineWidth=1.2*dpr;
          for(var r2=0;r2<2;r2++){ var f=((now*0.12+r2*0.5)%1), ra=-L/2+L*f;
            var p1=P(H.w(ra,wy+0.01,-W*0.28)), p2=P(H.w(ra+L*0.08,wy+0.01,0)), p3=P(H.w(ra,wy+0.01,W*0.28));
            ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.quadraticCurveTo(p2.x,p2.y,p3.x,p3.y); ctx.stroke(); } }
        ctx.restore();
        var edges=[]; for(var e=0;e<top.length;e++) edges.push([top[e],top[(e+1)%top.length]]);
        ctx.lineCap='round'; chain(ctx,P,edges,span(T,9.2,10.2),BLUE,2.2*dpr);
      }});
    }
    if(kx>0.01){
      faces=faces.concat(box(H,-L/2-3.4,-L/2+1.2,deckY,deckY+1.1*kx,-0.8,0.8,'board',{fill:[252,253,254]}));
      faces=faces.concat(box(H,-L/2-3.8,-L/2-2.6,deckY,deckY+1.1*kx,-0.9,0.9,'stand',{fill:[244,247,250]}));
      [[L/2-3,1],[L/2-6.5,1]].forEach(function(c,i){
        var bz=W/2+2.2;
        faces=faces.concat(box(H,c[0]-1,c[0]+1,deckY,deckY+0.9*kx,bz,bz+5.4,'lounge'+i,{fill:[250,251,253]}));
        faces=faces.concat(box(H,c[0]-1,c[0]+1,deckY+0.9*kx,deckY+2.6*kx,bz+4.4,bz+5.4,'back'+i,{fill:[252,253,254]}));
      });
      /* a ladder at the far corner */
      var la=L/2-2.5, lb=-W/2+0.2;
      faces=faces.concat(pipe(H,[[la-0.6,deckY,lb-0.6],[la-0.6,deckY+2.4*kx,lb-0.6],[la-0.6,deckY+2.4*kx,lb+0.5],[la-0.6,deckY-1.5,lb+0.5]],0.18,'ladderA',0,now));
      faces=faces.concat(pipe(H,[[la+0.6,deckY,lb-0.6],[la+0.6,deckY+2.4*kx,lb-0.6],[la+0.6,deckY+2.4*kx,lb+0.5],[la+0.6,deckY-1.5,lb+0.5]],0.18,'ladderB',0,now));
    }
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(0,0.5,1.2),Math.max(dx,dz)*0.95,6,0.62) };
  }

  /* a finished back yard: lawn, a paver patio under a pergola, a fire pit,
     raised planting beds with shrubs, two trees and a stepping-stone path */
  function yardScene(T,H,now){
    var q=randomYard(), k0=ease(span(T,8.8,9.4)), k1=ease(span(T,9.3,10.1)), k2=ease(span(T,9.9,10.9)), k3=ease(span(T,10.5,11.5)), k4=ease(span(T,11.0,11.8));
    var X=22, Z=16, faces=[];
    if(k0>0.01){
      faces.push(ground(H,[[-X*k0,-Z*k0],[X*k0,-Z*k0],[X*k0,Z*k0],[-X*k0,Z*k0]],0,'#f3f6f9', function(ctx,P,dpr){
        /* mowing stripes, faint */
        ctx.strokeStyle='rgba(0,21,48,.05)'; ctx.lineWidth=5*dpr;
        for(var a=-X+4;a<X;a+=6){ var p=P(H.w(a*k0,0.01,-Z*k0)), r=P(H.w(a*k0,0.01,Z*k0)); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(r.x,r.y); ctx.stroke(); }
      }));
    }
    if(k1>0.01){
      /* the patio, with its paver joints */
      faces=faces.concat(box(H,-X+1,-X+17,0,0.3*k1+0.01,-Z+1,-Z+13,'patio',{fill:[247,249,252]},[null,null,null,null,function(ctx,P,dpr){
        ctx.strokeStyle='rgba(0,21,48,.16)'; ctx.lineWidth=1*dpr; var y=0.3*k1+0.012;
        for(var a=-X+3;a<-X+17;a+=2) ln(ctx,P,H.w(a,y,-Z+1),H.w(a,y,-Z+13));
        for(var b=-Z+3;b<-Z+13;b+=2) ln(ctx,P,H.w(-X+1,y,b),H.w(-X+17,y,b)); }]));
      /* the fire pit */
      faces=faces.concat(cyl(H,-X+9,-Z+7,1.8,0.3,0.3+1.3*k1,10,'pit',[244,247,250],function(ctx,P,dpr){
        var pts=[]; for(var i=0;i<10;i++){ var t=i/10*Math.PI*2; pts.push(H.w(-X+9+Math.cos(t)*1.1,0.3+1.3*k1+0.01,-Z+7+Math.sin(t)*1.1)); }
        ctx.strokeStyle='rgba(0,21,48,.35)'; ctx.lineWidth=1*dpr; loop(ctx,P,pts,'#e7ecf2'); }));
    }
    if(k2>0.01){
      /* the pergola over the patio */
      var h=8*k2, pa=[[-X+2,-Z+2],[-X+16,-Z+2],[-X+2,-Z+12],[-X+16,-Z+12]];
      pa.forEach(function(p,i){ faces=faces.concat(box(H,p[0]-0.3,p[0]+0.3,0.3,h,p[1]-0.3,p[1]+0.3,'post'+i,{fill:[250,251,253]})); });
      if(k2>0.6){
        faces=faces.concat(box(H,-X+1.4,-X+16.6,h,h+0.5,-Z+1.8,-Z+2.2,'beamA',{fill:[252,253,254]}));
        faces=faces.concat(box(H,-X+1.4,-X+16.6,h,h+0.5,-Z+11.8,-Z+12.2,'beamB',{fill:[252,253,254]}));
        for(var r=0;r<5;r++){ var ra=-X+2.5+r*3.2; faces=faces.concat(box(H,ra-0.15,ra+0.15,h+0.5,h+0.8,-Z+1.2,-Z+12.8,'raft'+r,{fill:[253,253,254]})); }
      }
    }
    if(k3>0.01){
      /* raised beds along the back and one side, and shrubs in them */
      faces=faces.concat(box(H,-X+19,X-1,0,0.9*k3+0.01,-Z+1,-Z+4,'bedA',{fill:[244,247,250]}));
      faces=faces.concat(box(H,X-4,X-1,0,0.9*k3+0.01,-Z+4,Z-1,'bedB',{fill:[244,247,250]}));
      for(var s1=0;s1<q.shrubs;s1++){ var t1=(s1+0.5)/q.shrubs; faces.push(blob(H,-X+20+(2*X-21)*t1,0.9+1.1*k3,-Z+2.5,1.2*k3,'shA'+s1)); }
      for(var s2=0;s2<3;s2++){ faces.push(blob(H,X-2.5,0.9+1.1*k3,-Z+7+s2*7,1.2*k3,'shB'+s2)); }
    }
    if(k4>0.01){
      /* two trees, and stepping stones from the patio across the lawn */
      [[X-9,Z-5],[-X+6,Z-4]].forEach(function(c,i){
        faces=faces.concat(box(H,c[0]-0.4,c[0]+0.4,0,6*k4,c[1]-0.4,c[1]+0.4,'trunk'+i,{fill:[240,243,247]}));
        faces.push(blob(H,c[0],6*k4+2.2,c[1],3.2*k4,'crown'+i)); });
      for(var st2=0;st2<q.stones;st2++){ var tt=(st2+0.5)/q.stones, sa=-X+17+(X-6)*tt, sb=-Z+8+(Z-4)*tt*0.7;
        faces=faces.concat(box(H,sa-1.1,sa+1.1,0,0.15*k4+0.01,sb-0.8,sb+0.8,'stone'+st2,{fill:[252,253,254]})); }
    }
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(0,2.5,0),X*0.95,10,0.62) };
  }

  /* plumbing, as the thing itself: a water heater with its flue, the cold
     main coming up and in, hot and cold runs to a manifold of shut-offs,
     water moving through the lines */
  function pipeScene(T,H,now){
    var k1=ease(span(T,8.8,9.6)), k2=span(T,9.4,11.0), k3=ease(span(T,10.6,11.4));
    var faces=[];
    faces.push(ground(H,[[-6,-4],[6,-4],[6,4],[-6,4]],0,'#f3f6f9'));
    if(k1>0.01){
      faces=faces.concat(cyl(H,-3,0,1.25,0,5.2*k1,14,'heater',[250,251,253],function(ctx,P,dpr){
        ctx.strokeStyle='rgba(0,21,48,.3)'; ctx.lineWidth=1*dpr; var pts=[]; for(var i=0;i<14;i++){ var t=i/14*Math.PI*2; pts.push(H.w(-3+Math.cos(t)*0.45,5.2*k1+0.01,Math.sin(t)*0.45)); } loop(ctx,P,pts,'#eef1f5'); }));
      if(k1>0.9) faces=faces.concat(pipe(H,[[-3,5.2,0],[-3,7.4,0]],0.7,'flue',0,now));
    }
    /* the runs draw in along their length */
    var cold=[[4.5,0,-2.2],[4.5,6.2,-2.2],[-2.4,6.2,-2.2],[-2.4,6.2,-0.6],[-2.4,5.2,-0.6]];
    var hot=[[-3.6,5.2,0.6],[-3.6,6.6,0.6],[3.2,6.6,0.6],[3.2,3.2,0.6],[3.2,3.2,2.4]];
    var manifold=[[3.2,3.2,2.4],[-0.8,3.2,2.4]];
    function part(path,p){ if(p<=0) return []; var n=path.length-1, d=p*n, out=[path[0]];
      for(var i=0;i<n;i++){ var f=Math.max(0,Math.min(1,d-i)); if(f<=0) break; var a=path[i], b=path[i+1]; out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f]); }
      return out; }
    var c=part(cold,k2), hp=part(hot,k2), m=part(manifold,span(T,10.6,11.2));
    if(c.length>1) faces=faces.concat(pipe(H,c,0.35,'cold',k2>=1?1:0,now));
    if(hp.length>1) faces=faces.concat(pipe(H,hp,0.35,'hot',k2>=1?1:0,now));
    if(m.length>1) faces=faces.concat(pipe(H,m,0.45,'mani',0,now));
    if(k3>0.01){
      /* five outlets off the manifold, each with a shut-off valve and handle */
      for(var o=0;o<5;o++){ var oa=2.6-o*0.8;
        faces=faces.concat(pipe(H,[[oa,3.2,2.4],[oa,3.2-1.8*k3,2.4]],0.22,'out'+o,0,now));
        faces=faces.concat(box(H,oa-0.2,oa+0.2,2.2,2.2+0.45*k3,2.2,2.6,'valve'+o,{fill:[252,253,254]},[null,null,null,null,(function(xa){ return function(ctx,P,dpr){ ctx.strokeStyle=BLUE; ctx.lineWidth=2.4*dpr; ctx.lineCap='round'; ln(ctx,P,H.w(xa,2.2+0.45*k3+0.02,2.4),H.w(xa+0.5,2.2+0.45*k3+0.02,2.4)); }; })(oa)]));
      }
      /* the main shut-off on the cold line */
      faces=faces.concat(box(H,4.25,4.75,2.4,2.4+0.6*k3,-2.45,-1.95,'mainv',{fill:[252,253,254]},[null,null,null,null,function(ctx,P,dpr){ ctx.strokeStyle=BLUE; ctx.lineWidth=2.6*dpr; ctx.lineCap='round'; ln(ctx,P,H.w(4.5,2.4+0.6*k3+0.02,-2.2),H.w(5.3,2.4+0.6*k3+0.02,-2.2)); }]));
    }
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(0.4,3.4,0),5.6,7.6,0.5) };
  }

  /* electrical, as the thing itself: the meter base with its meter, a
     service panel with a main breaker and two rows of breakers that switch
     on one by one, and conduit running up out of it */
  function panelScene(T,H,now){
    /* turned to face the camera as it comes round */
    var H0=H; H={w:function(x,y,z){ return H0.w(-x,y,-z); }, front:H0.front, side:H0.side};
    var k1=ease(span(T,8.8,9.6)), k2=ease(span(T,9.4,10.2)), on=span(T,10.6,12.6), k3=span(T,9.8,10.8);
    var faces=[];
    faces.push(ground(H,[[-5,-3],[5,-3],[5,3],[-5,3]],0,'#f3f6f9'));
    /* a backboard the panel is mounted on */
    if(k1>0.01){ faces=faces.concat(box(H,-1.1,-0.7,0,1.4*k1,0.05,0.4,'legA',{fill:[244,247,250]}));
      faces=faces.concat(box(H,0.7,1.1,0,1.4*k1,0.05,0.4,'legB',{fill:[244,247,250]}));
      faces=faces.concat(pipe(H,[[2.7,0,0.2],[2.7,2.6*k1,0.2]],0.3,'mpost',0,now)); }
    if(k2>0.01){
      var PW=1.4, y0=1.4, y1=1.4+4.2*k2;
      faces=faces.concat(box(H,-PW,PW,y0,y1,0,0.45,'panel',{fill:[252,253,254]},[null,null,function(ctx,P,dpr){
        if(k2<0.95) return;
        var z=0.452, f=function(a,y){ return H.w(a,y,z); };
        ctx.lineWidth=1*dpr; ctx.strokeStyle='rgba(0,21,48,.35)';
        loop(ctx,P,[f(-PW+0.15,y0+0.15),f(PW-0.15,y0+0.15),f(PW-0.15,y1-0.15),f(-PW+0.15,y1-0.15)],null);
        /* the main breaker */
        loop(ctx,P,[f(-0.45,y1-0.9),f(0.45,y1-0.9),f(0.45,y1-0.35),f(-0.45,y1-0.35)],on>0?'rgba(0,111,255,.18)':'#ffffff');
        /* two rows of breakers, switching on in turn */
        for(var r=0;r<8;r++){ var yy=y1-1.25-r*0.36;
          [[-1.05,-0.1],[0.1,1.05]].forEach(function(c,side){ var idx=r*2+side, lit=on*16>idx;
            loop(ctx,P,[f(c[0],yy-0.26),f(c[1],yy-0.26),f(c[1],yy),f(c[0],yy)], lit?'rgba(0,111,255,.22)':'#ffffff');
            ctx.strokeStyle=lit?BLUE:'rgba(0,21,48,.35)'; ln(ctx,P,f((c[0]+c[1])/2-0.12,yy-0.13),f((c[0]+c[1])/2+0.12,yy-0.13)); ctx.strokeStyle='rgba(0,21,48,.35)'; }); }
      },null,null]));
      /* the meter base and meter, beside it */
      faces=faces.concat(box(H,2.1,3.3,2.6,2.6+1.9*k2,0,0.35,'mbase',{fill:[250,251,253]}));
      if(k2>0.6) faces.push({v:[H.w(2.7,3.55,0.36)], kind:'meter', grp:'meter', draw:function(ctx,P,dpr){ var c=P(H.w(2.7,3.55,0.36)), R=0.46*P.scale;
        ctx.fillStyle='#ffffff'; ctx.strokeStyle='rgba(0,21,48,.4)'; ctx.lineWidth=1.2*dpr; ctx.beginPath(); ctx.arc(c.x,c.y,R,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle=BLUE; ctx.lineWidth=1.6*dpr; var ang=now*1.5; ctx.beginPath(); ctx.moveTo(c.x,c.y); ctx.lineTo(c.x+Math.cos(ang)*R*0.7,c.y+Math.sin(ang)*R*0.7); ctx.stroke(); }});
    }
    if(k3>0){
      /* conduit: three runs up out of the panel, one across to the meter */
      [-0.8,0,0.8].forEach(function(a,i){ faces=faces.concat(pipe(H,[[a,5.6,0.25],[a,5.6+1.8*k3,0.25]],0.3,'cond'+i,on>=1?1:0,now)); });
      faces=faces.concat(pipe(H,[[1.4,3.2,0.2],[1.4+0.7*k3,3.2,0.2]],0.3,'feed',0,now));
    }
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(0,3.6,0.2),4.8,7.8,0.4) };
  }

  /* ── subjects that replace the house ──────────────────────────────────────
     Built around (0,0) in house coordinates, i.e. where the house stood. */
  function dissolve(T){ return 1-ease(span(T,8.3,9.4)); }
  function subjectCam(T,c,R,Hh,tilt){ return {c:c, R:R, H:Hh, tilt:tilt, p:ease(span(T,8.5,10.2))}; }
  function ln(ctx,P,a,b){ var A=P(a),B=P(b); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); }
  function loop(ctx,P,pts,fill){ ctx.beginPath(); pts.forEach(function(p,i){ var q=P(p); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); if(fill){ ctx.fillStyle=fill; ctx.fill(); } ctx.stroke(); }
  var LINE='rgba(0,21,48,.3)', LINE2='rgba(0,21,48,.45)';

  /* a condenser: pad, base pan, louvred cabinet with corner posts, service
     panel and line set, a disconnect on its post, and a guarded fan turning */
  function hvacUnit(T,H,now){
    var W=2.0, k1=ease(span(T,8.8,9.3)), k2=ease(span(T,9.1,10.1)), k3=ease(span(T,9.9,10.4)), det=span(T,10.1,11.2);
    var top=0.65+3.0*k2, lid=top+0.24*k3;
    function side(s,t,y){ var e=W+0.002; return s===0?H.w(t*W,y,-e):s===1?H.w(e,y,t*W):s===2?H.w(-t*W,y,e):H.w(-e,y,-t*W); }
    function louvres(s,from,to){ return function(ctx,P,dpr){ if(det<=0) return;
      ctx.save(); ctx.globalAlpha*=det; ctx.lineWidth=1*dpr; ctx.strokeStyle=LINE;
      for(var y=1.0;y<=top-0.35;y+=0.45) ln(ctx,P,side(s,from,y),side(s,to,y));
      ctx.strokeStyle=LINE2; [-0.93,0.93].forEach(function(t){ ln(ctx,P,side(s,t,0.68),side(s,t,top-0.02)); });
      ctx.restore(); }; }
    function service(ctx,P,dpr){ louvres(3,0.1,0.86)(ctx,P,dpr); if(det<=0) return;
      ctx.save(); ctx.globalAlpha*=det; ctx.lineWidth=1.2*dpr; ctx.strokeStyle=LINE2;
      loop(ctx,P,[side(3,-0.86,1.05),side(3,-0.05,1.05),side(3,-0.05,top-0.4),side(3,-0.86,top-0.4)],'rgba(255,255,255,.9)');
      [[-0.78,1.2],[-0.13,1.2],[-0.78,top-0.55],[-0.13,top-0.55]].forEach(function(q){ var c=P(side(3,q[0],q[1])); ctx.fillStyle=LINE2; ctx.beginPath(); ctx.arc(c.x,c.y,1.4*dpr,0,Math.PI*2); ctx.fill(); });
      /* the line set: suction (insulated, blue) and liquid, out and down */
      var o1=side(3,0.35,0.95), o2=side(3,0.6,0.95);
      ctx.lineCap='round';
      ctx.strokeStyle=BLUE; ctx.lineWidth=3.2*dpr; ln(ctx,P,o1,H.w(-W-1.1,0.95,-0.35*W)); ln(ctx,P,H.w(-W-1.1,0.95,-0.35*W),H.w(-W-1.1,0.3,-0.35*W));
      ctx.strokeStyle=LINE2; ctx.lineWidth=1.8*dpr; ln(ctx,P,o2,H.w(-W-0.8,0.95,-0.6*W)); ln(ctx,P,H.w(-W-0.8,0.95,-0.6*W),H.w(-W-0.8,0.3,-0.6*W));
      ctx.restore(); }
    function fan(ctx,P,dpr){ if(k3<0.5) return;
      var y=lid+0.005, ang=now*6, ring=function(r){ var pts=[]; for(var i=0;i<20;i++){ var t=i/20*Math.PI*2; pts.push(H.w(Math.cos(t)*r,y,Math.sin(t)*r)); } return pts; };
      ctx.save(); ctx.lineWidth=1*dpr;
      /* blades under the guard */
      for(var k=0;k<3;k++){ var a0=ang+k*Math.PI*2/3, bl=[];
        [[0.35,-0.34],[1.6,-0.2],[1.6,0.26],[0.35,0.3]].forEach(function(q){ bl.push(H.w(Math.cos(a0+q[1])*q[0],y,Math.sin(a0+q[1])*q[0])); });
        ctx.strokeStyle=BLUE; loop(ctx,P,bl,'rgba(0,111,255,.10)'); }
      ctx.strokeStyle=LINE; [1.75,1.05].forEach(function(r){ loop(ctx,P,ring(r),null); });
      for(var sp=0;sp<8;sp++){ var t2=sp/8*Math.PI*2; ln(ctx,P,H.w(Math.cos(t2)*0.36,y,Math.sin(t2)*0.36),H.w(Math.cos(t2)*1.75,y,Math.sin(t2)*1.75)); }
      ctx.strokeStyle=LINE2; loop(ctx,P,ring(0.34),'#ffffff');
      ctx.restore(); }
    function disc(ctx,P,dpr){ if(det<=0) return; ctx.save(); ctx.globalAlpha*=det; ctx.strokeStyle=LINE2; ctx.lineWidth=1*dpr;
      loop(ctx,P,[H.w(2.752,1.9,-2.35),H.w(2.752,1.9,-1.85),H.w(2.752,2.8,-1.85),H.w(2.752,2.8,-2.35)],null);
      ln(ctx,P,H.w(2.752,2.35,-2.25),H.w(2.752,2.35,-1.95)); ctx.restore(); }
    var faces=[];
    if(k1>0.01) faces=faces.concat(box(H,-2.9,2.9,0,0.3*k1+0.01,-2.9,2.9,'pad',{fill:[236,240,245]}));
    if(k1>0.3) faces=faces.concat(box(H,-2.25,2.25,0.3,0.3+0.35*k1,-2.25,2.25,'pan',{fill:[241,244,248]}));
    if(k2>0.01) faces=faces.concat(box(H,-W,W,0.65,top,-W,W,'cab',{fill:[250,251,253]},[louvres(0,-0.86,0.86),louvres(1,-0.86,0.86),louvres(2,-0.86,0.86),service,null]));
    if(k3>0.01) faces=faces.concat(box(H,-W-0.12,W+0.12,top,lid,-W-0.12,W+0.12,'lid',{fill:[252,253,254]},[null,null,null,null,fan]));
    if(k2>0.4) faces=faces.concat(box(H,2.45,2.75,0.3,0.3+2.7*k2,-2.45,-1.75,'disc',{fill:[247,249,251]},[null,disc,null,null,null]));
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(0,2.1,0),3.7,4.4,0.52) };
  }

  /* a kitchen: an L of base cabinets with doors and drawers, a counter slab,
     sink and cooktop, uppers, a fridge column, an island with stools */
  function kitchen(T,H,now){
    var kf=ease(span(T,8.8,9.2)), kb=ease(span(T,9.0,9.8)), ks=ease(span(T,9.7,10.0)), ku=ease(span(T,9.8,10.4)), kt=ease(span(T,10.2,10.6)), det=span(T,10.3,11.4);
    var ch=2.95*kb+0.01, sh=ch+0.2*ks;
    var faces=[], F=function(){ faces=faces.concat(box.apply(null,arguments)); };
    function doors(axis,fixed,from,to,y0,y1,drawer){ return function(ctx,P,dpr){ if(det<=0) return; ctx.save(); ctx.globalAlpha*=det; ctx.strokeStyle=LINE; ctx.lineWidth=1*dpr;
      var pt=function(t,y){ return axis==='a'?H.w(t,y,fixed):H.w(fixed,y,t); };
      for(var t=from+2.4;t<to-0.3;t+=2.4) ln(ctx,P,pt(t,y0+0.25),pt(t,y1-0.1));
      if(drawer) ln(ctx,P,pt(from+0.08,y1-0.55),pt(to-0.08,y1-0.55));
      ctx.restore(); }; }
    function sink(ctx,P,dpr){ if(det<=0) return; ctx.save(); ctx.globalAlpha*=det; ctx.strokeStyle=LINE2; ctx.lineWidth=1.2*dpr; var y=sh+0.005;
      loop(ctx,P,[H.w(-1,y,-4.75),H.w(1.6,y,-4.75),H.w(1.6,y,-3.45),H.w(-1,y,-3.45)],'#eef1f5');
      ctx.lineWidth=2.2*dpr; ln(ctx,P,H.w(0.3,y,-4.9),H.w(0.3,y+1.1,-4.9)); ln(ctx,P,H.w(0.3,y+1.1,-4.9),H.w(0.3,y+1.1,-4.3)); ctx.restore(); }
    function cooktop(ctx,P,dpr){ if(det<=0) return; ctx.save(); ctx.globalAlpha*=det; ctx.strokeStyle=LINE2; ctx.lineWidth=1.2*dpr; var y=sh+0.005;
      [[-5.4,-1.6],[-4.6,-1.6],[-5.4,-0.6],[-4.6,-0.6]].forEach(function(c){ var pts=[]; for(var i=0;i<12;i++){ var t=i/12*Math.PI*2; pts.push(H.w(c[0]+Math.cos(t)*0.3,y,c[1]+Math.sin(t)*0.3)); } loop(ctx,P,pts,null); });
      ctx.restore(); }
    function fridge(ctx,P,dpr){ if(det<=0) return; ctx.save(); ctx.globalAlpha*=det; ctx.strokeStyle=LINE; ctx.lineWidth=1*dpr;
      ln(ctx,P,H.w(7.4,0.1,-2.39),H.w(7.4,6.7,-2.39)); ln(ctx,P,H.w(6.05,2.6,-2.39),H.w(8.75,2.6,-2.39));
      ctx.strokeStyle=LINE2; ctx.lineWidth=2*dpr; ln(ctx,P,H.w(7.2,3.4,-2.39),H.w(7.2,5.2,-2.39)); ln(ctx,P,H.w(7.6,3.4,-2.39),H.w(7.6,5.2,-2.39)); ctx.restore(); }
    if(kf>0.01) F(H,-7,9.5,0,0.12,-5.6,5.2,'floor',{fill:[242,245,249]});
    if(kb>0.01){
      F(H,-6,6,0.12,ch,-5,-3,'run1',{fill:[250,251,253]},[null,null,doors('a',-2.998,-6,6,0.12,ch,true),null,null]);
      F(H,-6,-4,0.12,ch,-3,3,'run2',{fill:[250,251,253]},[null,doors('b',-3.998,-3,3,0.12,ch,true),null,null,null]);
      F(H,-1.5,3.5,0.12,ch,0,2.6,'isl',{fill:[250,251,253]},[doors('a',-0.002,-1.5,3.5,0.12,ch,false),null,null,null,null]);
    }
    if(ks>0.01){
      F(H,-6.1,6.1,ch,sh,-5.05,-2.85,'top1',{fill:[255,255,255]},[null,null,null,null,sink]);
      F(H,-6.1,-3.85,ch,sh,-2.85,3.1,'top2',{fill:[255,255,255]},[null,null,null,null,cooktop]);
      F(H,-1.7,3.7,ch,sh,-0.15,3.1,'top3',{fill:[255,255,255]});
    }
    if(ku>0.01){
      F(H,-6,6,4.9,4.9+2.4*ku,-5,-4,'upper',{fill:[250,251,253]},[null,null,doors('a',-3.998,-6,6,4.9,4.9+2.4*ku,false),null,null]);
      F(H,6,8.8,0.12,0.12+6.7*ku,-5,-2.4,'fridge',{fill:[248,250,252]},[null,null,fridge,null,null]);
    }
    if(kt>0.01){ [-0.6,1,2.6].forEach(function(a,i){ F(H,a-0.4,a+0.4,0.12,0.12+2.3*kt,3.5,4.3,'stool'+i,{fill:[246,248,251]}); }); }
    var tops=[]; var rect=function(a0,a1,b0,b1){ var c=[H.w(a0,sh,b0),H.w(a1,sh,b0),H.w(a1,sh,b1),H.w(a0,sh,b1)]; tops.push([c[0],c[1]],[c[1],c[2]],[c[2],c[3]],[c[3],c[0]]); };
    rect(-6.1,6.1,-5.05,-2.85); rect(-6.1,-3.85,-2.85,3.1); rect(-1.7,3.7,-0.15,3.1);
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,H.w(1.2,2.4,-0.6),9.2,7.8,0.55),
      over: function(ctx,P,dpr){ if(ks<0.9) return; ctx.save(); ctx.lineCap='round'; chain(ctx,P,tops,span(T,10.8,12.2),BLUE,2*dpr); ctx.restore(); } };
  }

  /* a room, seen as a dollhouse: the walls turned toward the camera step
     aside so the inside stays in view as it turns. Trim traces baseboard,
     door and window casing and crown; painting traces and washes the walls. */
  function room(T,H,now,mode){
    var A=7, B=6, Hh=9, t=0.35, kf=ease(span(T,8.8,9.3)), kw=ease(span(T,9.2,10.2)), wh=Hh*kw+0.01;
    var cen=H.w(0,4,0);
    /* 1 when the wall's inside faces the camera, fading to 0 as it turns
       toward it — a fade rather than a blink */
    function cull(dirA,dirB){ return function(P){ var c=P(H.w(dirA*A,4,dirB*B)), o=P(H.w(dirA*(A+3),4,dirB*(B+3))), d=(o.z-c.z)/3; return Math.max(0,Math.min(1,0.5+d*2.2)); }; }
    /* one wall's worth of detail, drawn on its inner face */
    function inner(w){ return function(ctx,P,dpr){
      var pt=function(s,y){ return w==='n'?H.w(s,y,-B+0.003):w==='s'?H.w(s,y,B-0.003):w==='w'?H.w(-A+0.003,y,s):H.w(A-0.003,y,s); };
      var len=(w==='n'||w==='s')?A:B;
      ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
      if(mode==='trim'){
        var bp=span(T,10.4,11.4), cp=span(T,12.0,13.0);
        if(bp>0){ ctx.strokeStyle=BLUE; ctx.lineWidth=2.2*dpr; seg(ctx,P,pt(-len,0.45),pt(len,0.45),bp,BLUE,2.2*dpr); ctx.globalAlpha*=0.5; seg(ctx,P,pt(-len,0.2),pt(len,0.2),bp,LINE2,1*dpr); ctx.globalAlpha/=0.5; }
        if(w==='n'){ var dp=span(T,11.2,12.0); chain(ctx,P,[[pt(1,0.15),pt(1,7)],[pt(1,7),pt(4,7)],[pt(4,7),pt(4,0.15)]],dp,BLUE,2.2*dpr);
          if(dp>0){ ctx.globalAlpha*=dp*0.6; chain(ctx,P,[[pt(0.7,0.15),pt(0.7,7.3)],[pt(0.7,7.3),pt(4.3,7.3)],[pt(4.3,7.3),pt(4.3,0.15)]],1,LINE2,1*dpr); ctx.globalAlpha/=Math.max(dp*0.6,1e-6); } }
        if(w==='w'){ var wp=span(T,11.6,12.4); chain(ctx,P,[[pt(-2,3),pt(2,3)],[pt(2,3),pt(2,6.5)],[pt(2,6.5),pt(-2,6.5)],[pt(-2,6.5),pt(-2,3)]],wp,BLUE,2.2*dpr);
          if(wp>0) seg(ctx,P,pt(-2.4,2.85),pt(2.4,2.85),wp,LINE2,1.6*dpr); }
        if(cp>0){ seg(ctx,P,pt(-len,8.55),pt(len,8.55),cp,BLUE,2.2*dpr); seg(ctx,P,pt(-len,8.85),pt(len,8.85),cp,LINE2,1*dpr); }
      } else {
        var i={n:0,e:1,s:2,w:3}[w], tp=span(T,10.2+i*0.5,11.1+i*0.5), wash=span(T,12.2,13.3);
        var q=[pt(-len,0.15),pt(len,0.15),pt(len,Hh),pt(-len,Hh)];
        if(wash>0){ ctx.globalAlpha*=0.16*wash; ctx.fillStyle=BLUE; ctx.beginPath(); q.forEach(function(p,j){ var s2=P(p); j?ctx.lineTo(s2.x,s2.y):ctx.moveTo(s2.x,s2.y); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha/=0.16*wash; }
        chain(ctx,P,[[q[0],q[1]],[q[1],q[2]],[q[2],q[3]],[q[3],q[0]]],tp,BLUE,2*dpr);
      }
      ctx.restore(); }; }
    var faces=[];
    if(kf>0.01) faces=faces.concat(box(H,-A-t,A+t,0,0.15,-B-t,B+t,'floor',{fill:[242,245,249]}));
    if(kw>0.01){
      faces=faces.concat(box(H,-A-t,A+t,0,wh,-B-t,-B,'wn',{fill:[247,249,252]},[null,null,inner('n'),null,null],cull(0,-1)));
      faces=faces.concat(box(H,-A-t,A+t,0,wh,B,B+t,'ws',{fill:[247,249,252]},[inner('s'),null,null,null,null],cull(0,1)));
      faces=faces.concat(box(H,-A-t,-A,0,wh,-B,B,'ww',{fill:[247,249,252]},[null,inner('w'),null,null,null],cull(-1,0)));
      faces=faces.concat(box(H,A,A+t,0,wh,-B,B,'we',{fill:[247,249,252]},[null,null,null,inner('e'),null],cull(1,0)));
    }
    return { faces:faces, houseA:dissolve(T), cam:subjectCam(T,cen,9.6,9.5,0.6) };
  }

  /* ── the endings ─────────────────────────────────────────────────────────────
     Each returns what this frame adds: extra faces (sorted with the house),
     how the house itself is shown (ghost, roof lifted), where the camera
     should head, and an overlay for lines drawn on top. */
  function roomBox(H){
    /* a room tucked into a corner of the house, sized to fit it */
    var w=Math.min(15, (H.a1-H.a0)*0.45), d=Math.min(13, (H.b1-H.b0)*0.55);
    var a0=H.a0+1.5, b0=H.b0+1.5; return {a0:a0,a1:a0+w,b0:b0,b1:b0+d};
  }
  function lift(T){ return {roofLift:30*ease(span(T,8.4,9.8)), roofA:1-span(T,8.6,9.6)}; }

  var FINALE = {
    /* HVAC, countertops, trim and interior painting: the house has done its
       job once it has risen. It dissolves, and the subject builds up where it
       stood and becomes the thing that turns, filling the frame. */
    hvac: function(T,H,now){ return hvacUnit(T,H,now); },
    countertops: function(T,H,now){ return kitchen(T,H,now); },
    trim: function(T,H,now){ return room(T,H,now,'trim'); },
    painting: function(T,H,now,geo){
      if(typeof eS!=='undefined' && eS.mode==='interior') return room(T,H,now,'paint');
      /* exterior: every wall of their house, traced, then washed */
      var walls2=geo.faces.filter(function(f){ return f.kind==='wall'; });
      return { faces:[], houseA:1,
        wallWash: ease(span(T,11.2,13.0)),
        over: function(ctx,P,dpr){
          var n=walls2.length, p=span(T,8.8,11.8)*n;
          ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
          for(var i=0;i<n;i++){ var q=Math.max(0,Math.min(1,p-i)); if(q<=0) break;
            var v=walls2[i].v; chain(ctx,P,[[v[0],v[1]],[v[1],v[2]],[v[2],v[3]],[v[3],v[0]]],q,BLUE,1.6*dpr); }
          ctx.restore();
        } };
    },

    plumbing: function(T,H,now){ return pipeScene(T,H,now); },
    _plumbOld: function(T,H){
      var L=lift(T), fa=H.front[0], fb=H.front[1];
      var ea = fa!==0 ? (fa>0?H.a1:H.a0) : (H.a0+H.a1)/2+(H.a1-H.a0)*0.2;
      var eb = fb!==0 ? (fb>0?H.b1:H.b0) : (H.b0+H.b1)/2+(H.b1-H.b0)*0.2;
      var y=0.9, ma=(H.a0+H.a1)/2, mb=(H.b0+H.b1)/2;
      var street=H.w(ea+fa*14,y,eb+fb*14), entry=H.w(ea,y,eb), hub=H.w(ma,y,mb);
      /* the trunk runs along the long axis; fixtures off it at each end and the middle */
      var t0=H.w(H.a0+4,y,mb), t1=H.w(H.a1-4,y,mb);
      var fix=[[H.a0+4,H.b0+3],[H.a1-4,H.b1-3],[ma+2,H.b0+3]];
      var legs=fix.map(function(q){ var base=H.w(q[0],y,mb), up=H.w(q[0],y,q[1]); return [[base,up],[up,H.w(q[0],3.4,q[1])]]; });
      var heater=H.w(H.a0+2.2,0,H.b1-2.2);
      var faces=span(T,9.2,9.8)>0 ? box(H,H.a0+1.2,H.a0+3.2,0,5*ease(span(T,9.2,9.8))+0.01,H.b1-3.2,H.b1-1.2,'heater',{fill:[250,251,253]}) : [];
      return { faces:faces, roofLift:L.roofLift, roofA:L.roofA, houseA:1-0.78*span(T,8.8,9.8), ghostEdges:true,
        over: function(ctx,P,dpr){
          ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
          chain(ctx,P,[[street,entry],[entry,hub]],span(T,9.6,10.6),BLUE,3*dpr);
          chain(ctx,P,[[hub,t0],[hub,t1]],span(T,10.4,11.2),BLUE,2.6*dpr);
          legs.forEach(function(l,i){ chain(ctx,P,l,span(T,11.0+i*0.35,11.8+i*0.35),BLUE,2*dpr);
            var on=span(T,11.8+i*0.35,12.2+i*0.35); if(on>0){ ctx.globalAlpha=on; dot(ctx,P,l[1][1],4*dpr,BLUE); ctx.globalAlpha=1; } });
          ctx.restore();
        } };
    },

    electrical: function(T,H,now){ return panelScene(T,H,now); },
    _elecOld: function(T,H,now){
      var L=lift(T), sa=H.side[0], sb=H.side[1];
      var pa = sa!==0 ? (sa>0?H.a1-0.3:H.a0+0.3) : H.a0+3, pb = sb!==0 ? (sb>0?H.b1-0.3:H.b0+0.3) : H.b0+3;
      var k=ease(span(T,9.2,9.8));
      var faces=k>0.02 ? box(H,pa-0.9,pa+0.9,4,4+2.8*k,pb-0.9,pb+0.9,'panel',{fill:[250,251,253]}) : [];
      var ceil=8.6, ma=(H.a0+H.a1)/2, mb=(H.b0+H.b1)/2;
      var rooms=[[H.a0+(H.a1-H.a0)*0.2,H.b0+(H.b1-H.b0)*0.3],[H.a0+(H.a1-H.a0)*0.5,H.b0+(H.b1-H.b0)*0.7],[H.a0+(H.a1-H.a0)*0.8,H.b0+(H.b1-H.b0)*0.3],[H.a0+(H.a1-H.a0)*0.8,H.b0+(H.b1-H.b0)*0.75]];
      var up=[[H.w(pa,6.8,pb),H.w(pa,ceil,pb)]];
      var runs=rooms.map(function(q){ return [[H.w(pa,ceil,pb),H.w(q[0],ceil,pb)],[H.w(q[0],ceil,pb),H.w(q[0],ceil,q[1])],[H.w(q[0],ceil,q[1]),H.w(q[0],1.2,q[1])]]; });
      return { faces:faces, roofLift:L.roofLift, roofA:L.roofA, houseA:1-0.78*span(T,8.8,9.8), ghostEdges:true,
        over: function(ctx,P,dpr){
          ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
          chain(ctx,P,up,span(T,9.8,10.2),BLUE,2.4*dpr);
          runs.forEach(function(r,i){ var a=10.2+i*0.55;
            chain(ctx,P,r,span(T,a,a+1.3),BLUE,1.8*dpr);
            var on=span(T,a+1.3,a+1.6); if(on>0){ var pulse=0.6+0.4*Math.sin(now*5+i);
              ctx.globalAlpha=on; dot(ctx,P,r[2][1],(3.5+2*pulse)*dpr,'rgba(0,111,255,.25)'); dot(ctx,P,r[2][1],3*dpr,BLUE); ctx.globalAlpha=1; } });
          ctx.restore();
        } };
    },

    /* the whole house: it rises, the roof lifts to show every room's worth of
       floor, and the full outline — walls and roof — is drawn round it */
    general: function(T,H,now,geo){
      var edges=[]; geo.faces.forEach(function(f){ if(f.kind!=='roof') return; var v=f.v; for(var i=0;i<v.length;i++) edges.push([v[i],v[(i+1)%v.length]]); });
      var floor=span(T,9.4,10.4);
      return { faces: floor>0 ? box(H,H.a0+0.5,H.a1-0.5,0,0.12,H.b0+0.5,H.b1-0.5,'floor',{fill:[240,244,249]}) : [],
        roofLift: 14*ease(span(T,9.0,10.2)), roofA: 1-0.55*span(T,9.0,10.2), houseA:1-0.55*span(T,9.2,10.2), ghostEdges:true,
        over: function(ctx,P,dpr){ ctx.save(); ctx.lineCap='round'; chain(ctx,P,edges,span(T,10.2,12.8),BLUE,1.6*dpr); ctx.restore(); } };
    },

    pools: function(T,H,now){ return poolScene(T,H,now); },
    _poolOld: function(T,H){
      var q=randomPool(), poly=poolPoly(q), loc='back';
      var dir = loc==='front' ? H.front : loc==='side' ? H.side : [-H.front[0],-H.front[1]];
      var ext = dir[0]!==0 ? (H.a1-H.a0)/2 : (H.b1-H.b0)/2;
      var len = dir[0]!==0 ? poly.ext[0] : poly.ext[1];
      var ca=(H.a0+H.a1)/2+dir[0]*(ext+10+len/2), cb=(H.b0+H.b1)/2+dir[1]*(ext+10+len/2);
      var ring=poly.pts.map(function(p){ return [ca+p[0], cb+p[1]]; });
      var depth=5*ease(span(T,9.6,10.8)), fill=ease(span(T,10.8,12.2));
      var camP=ease(span(T,9.0,11.0));
      var mid=[((H.a0+H.a1)/2+ca)/2, ((H.b0+H.b1)/2+cb)/2];
      var reach=Math.hypot(ca-(H.a0+H.a1)/2, cb-(H.b0+H.b1)/2)/2 + Math.max(len, Math.max(H.a1-H.a0,H.b1-H.b0)/2);
      return { faces:[], houseA:1, face2: faceTo(H,ca,cb),
        cam: camP>0 ? {c:H.w(mid[0],3,mid[1]), R:reach*0.9, H:10, p:camP} : null,
        under: function(ctx,P,dpr){
          /* the hole: clip to the opening, show only the walls facing the camera */
          var top=ringPts(H,ring,0), bot=ringPts(H,ring,-depth);
          var opening=top.map(P), area=0;
          for(var i=0;i<opening.length;i++){ var a=opening[i], b=opening[(i+1)%opening.length]; area+=a.x*b.y-b.x*a.y; }
          ctx.save();
          var ground=span(T,8.6,9.4);
          if(ground>0){ ctx.globalAlpha=ground; ctx.fillStyle='#f3f5f8'; ctx.beginPath(); opening.forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
          if(depth>0.05){
            ctx.beginPath(); opening.forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.clip();
            ctx.fillStyle='#eef1f5'; ctx.beginPath(); bot.map(P).forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill();
            for(var j=0;j<top.length;j++){ var k2=(j+1)%top.length;
              var quad=[top[j],top[k2],bot[k2],bot[j]].map(P), sa=0;
              for(var m=0;m<4;m++){ var A=quad[m], B=quad[(m+1)%4]; sa+=A.x*B.y-B.x*A.y; }
              if(sa*area<0) continue;
              ctx.fillStyle='#e2e7ee'; ctx.beginPath(); quad.forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); }
            if(fill>0){ var wy=-depth+(depth-0.6)*fill, water=ringPts(H,ring,wy).map(P);
              ctx.fillStyle='rgba(255,255,255,'+(0.75*fill+0.1)+')'; ctx.beginPath(); water.forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); }
          }
          ctx.restore();
          var edges=[]; for(var e=0;e<top.length;e++) edges.push([top[e],top[(e+1)%top.length]]);
          ctx.save(); ctx.lineCap='round'; chain(ctx,P,edges,span(T,8.6,9.6),BLUE,2.2*dpr); ctx.restore();
        } };
    },

    landscaping: function(T,H,now){ return yardScene(T,H,now); },
    _yardOld: function(T,H){
      var q=randomYard(), where='back', size=q.size;
      var patches=[];
      var mk=function(dir,area){
        var alongA = dir[0]===0, width=(alongA?(H.a1-H.a0):(H.b1-H.b0))+16, depth=Math.max(14,Math.min(70,area/width));
        var e0 = dir[0]!==0 ? (dir[0]>0?H.a1:H.a0) : (dir[1]>0?H.b1:H.b0);
        var near=e0+(dir[0]||dir[1])*4, far=near+(dir[0]||dir[1])*depth;
        var mid = alongA ? (H.a0+H.a1)/2 : (H.b0+H.b1)/2;
        var r = alongA ? [[mid-width/2,Math.min(near,far)],[mid+width/2,Math.min(near,far)],[mid+width/2,Math.max(near,far)],[mid-width/2,Math.max(near,far)]]
                       : [[Math.min(near,far),mid-width/2],[Math.max(near,far),mid-width/2],[Math.max(near,far),mid+width/2],[Math.min(near,far),mid+width/2]];
        patches.push(r);
      };
      var back=[-H.front[0],-H.front[1]];
      if(where==='front'||where==='both') mk(H.front, where==='both'?size/2:size);
      if(where==='back'||where==='both') mk(back, where==='both'?size/2:size);
      var camP=ease(span(T,9.0,11.0)), cen=[0,0], n=0;
      patches.forEach(function(r){ r.forEach(function(p){ cen[0]+=p[0]; cen[1]+=p[1]; n++; }); });
      cen=[(cen[0]/n+(H.a0+H.a1)/2)/2, (cen[1]/n+(H.b0+H.b1)/2)/2];
      var reach=0; patches.forEach(function(r){ r.forEach(function(p){ reach=Math.max(reach, Math.hypot(p[0]-cen[0],p[1]-cen[1])); }); });
      return { faces:[], houseA:1, face2: faceTo(H,cen[0],cen[1]),
        cam: camP>0 ? {c:H.w(cen[0],3,cen[1]), R:reach*0.85, H:10, p:camP} : null,
        under: function(ctx,P,dpr,now){
          patches.forEach(function(r,pi){
            var ring=ringPts(H,r,0), scr=ring.map(P), g=span(T,9.6+pi*0.3,10.8+pi*0.3);
            if(g>0){ ctx.save(); ctx.globalAlpha=g; ctx.fillStyle='#f3f5f8'; ctx.beginPath(); scr.forEach(function(s,i){ i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); ctx.restore(); }
            var edges=[]; for(var e=0;e<4;e++) edges.push([ring[e],ring[(e+1)%4]]);
            ctx.save(); ctx.lineCap='round'; chain(ctx,P,edges,span(T,8.6+pi*0.3,9.6+pi*0.3),BLUE,2*dpr); ctx.restore();
            /* shrubs along the far edge and stepping stones across */
            var a0=Math.min(r[0][0],r[2][0]), a1=Math.max(r[0][0],r[2][0]), b0=Math.min(r[0][1],r[2][1]), b1=Math.max(r[0][1],r[2][1]);
            for(var s=0;s<q.shrubs;s++){ var t=(s+0.5)/q.shrubs, pop=ease(span(T,10.8+s*0.15+pi*0.3,11.3+s*0.15+pi*0.3)); if(pop<=0) continue;
              var sp = (a1-a0)>(b1-b0) ? H.w(a0+(a1-a0)*t,1.2,b0+(b1-b0)*0.18) : H.w(a0+(a1-a0)*0.18,1.2,b0+(b1-b0)*t);
              var sc=P(sp), rr=Math.max(3, P.scale*1.6)*pop;
              ctx.fillStyle='#ffffff'; ctx.strokeStyle='rgba(0,21,48,.22)'; ctx.lineWidth=1*dpr;
              ctx.beginPath(); ctx.arc(sc.x,sc.y,rr,0,Math.PI*2); ctx.fill(); ctx.stroke();
              ctx.fillStyle='#eef1f5'; ctx.beginPath(); ctx.arc(sc.x+rr*0.25,sc.y+rr*0.25,rr*0.55,0,Math.PI*2); ctx.fill(); }
            for(var k=0;k<q.stones;k++){ var t2=(k+0.5)/q.stones, on=span(T,11.8+k*0.12+pi*0.3,12.2+k*0.12+pi*0.3); if(on<=0) continue;
              var ca=(a1-a0)>(b1-b0) ? (a0+a1)/2 : a0+(a1-a0)*t2, cb=(a1-a0)>(b1-b0) ? b0+(b1-b0)*t2 : (b0+b1)/2;
              var st2=ringPts(H,[[ca-1.2,cb-0.8],[ca+1.2,cb-0.8],[ca+1.2,cb+0.8],[ca-1.2,cb+0.8]],0.05).map(P);
              ctx.globalAlpha=on; ctx.fillStyle='#ffffff'; ctx.strokeStyle='rgba(0,21,48,.2)'; ctx.lineWidth=1*dpr;
              ctx.beginPath(); st2.forEach(function(s2,i){ i?ctx.lineTo(s2.x,s2.y):ctx.moveTo(s2.x,s2.y); }); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha=1; }
          });
        } };
    }
  };

  /* "Random", but the same for the same address: seeded from it, so going
     back and forth never shows a different pool. The real choices come after,
     on the calculator's own steps. */
  function seeded(){ var str=String((st&&st.addrText)||'x'), h=2166136261; for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
    return function(){ h=Math.imul(h^(h>>>15),2246822507); h=Math.imul(h^(h>>>13),3266489909); h^=h>>>16; return (h>>>0)/4294967296; }; }
  function randomPool(){ if(st._pool) return st._pool; var r=seeded();
    var shapes=['rect','freeform','kidney','l'], sizes=[288,400,512,650];
    return (st._pool={shape:shapes[Math.floor(r()*4)], size:sizes[Math.floor(r()*4)]}); }
  function randomYard(){ if(st._yard) return st._yard; var r=seeded(); r(); r();
    return (st._yard={size:900+Math.round(r()*1800), shrubs:4+Math.floor(r()*5), stones:3+Math.floor(r()*4)}); }

  /* pool outlines, centred, in feet (a, b) */
  function poolPoly(q){
    var s=q.size||512, shape=q.shape||'rect', ratio=2;
    var W=Math.sqrt(s/ratio), L=W*ratio, pts=[];
    if(shape==='rect'){ pts=[[-L/2,-W/2],[L/2,-W/2],[L/2,W/2],[-L/2,W/2]]; }
    else if(shape==='l'){ var a=L/2, b=W/2; pts=[[-a,-b],[a,-b],[a,b],[a*0.1,b],[a*0.1,b+W*0.55],[-a,b+W*0.55]]; }
    else if(shape==='kidney'){ for(var i=0;i<36;i++){ var t=i/36*Math.PI*2; var r=1-0.28*Math.pow(Math.max(0,Math.cos(t-Math.PI/2)),3); pts.push([Math.cos(t)*L/2*r, Math.sin(t)*W/2*(r*1.1)]); } }
    else { for(var j=0;j<36;j++){ var t2=j/36*Math.PI*2; var rr=1+0.12*Math.sin(3*t2)+0.06*Math.cos(5*t2); pts.push([Math.cos(t2)*L/2*rr, Math.sin(t2)*W/2*rr]); } }
    var ea=0, eb=0; pts.forEach(function(p){ ea=Math.max(ea,Math.abs(p[0])*2); eb=Math.max(eb,Math.abs(p[1])*2); });
    return {pts:pts, ext:[ea,eb]};
  }

  /* ── one frame ───────────────────────────────────────────────────────────── */
  function draw(){
    if(!st) return;
    var cv=st.cv, ctx=st.ctx, dpr=st.dpr;
    var r=cv.getBoundingClientRect();
    if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){ cv.width=Math.round(r.width*dpr); cv.height=Math.round(r.height*dpr); }
    var nowMs=performance.now(), dt=Math.min(0.05,(nowMs-(st.lastMs||nowMs))/1000); st.lastMs=nowMs;
    var now=(nowMs-st.t0)/1000;
    var T=st.clockHeld||st.clockAt===undefined ? st.clock : Math.min(HS_END, st.clock+(nowMs-st.clockAt)/1000), w=cv.width, h=cv.height;
    ctx.clearRect(0,0,w,h);

    var geo=null;
    if(st.target){ geo=pickGeo(st); if(st.arrive===undefined) st.arrive=T; }
    if(geo&&(!st.frame||st.frameGeo!==geo)){ st.frame=frameFor(geo); st.frameGeo=geo; }
    var H=geo?hx(geo):null;
    var fin=(geo&&T>=8.2&&FINALE[TRADE]) ? FINALE[TRADE](T,H,now,geo) : null;

    /* the camera: the house, then wherever this trade's ending points it */
    var tc=st.frame?st.frame.c.slice():[0,0,0], tR=st.frame?st.frame.R:60, tH=st.frame?st.frame.H:20, tTilt=0.46;
    if(fin&&fin.cam){ var p=fin.cam.p; for(var j=0;j<3;j++) tc[j]+=(fin.cam.c[j]-tc[j])*p; tR+=(fin.cam.R-tR)*p; tH+=(fin.cam.H-tH)*p; if(fin.cam.tilt) tTilt+=(fin.cam.tilt-tTilt)*p; }
    if(!st.cam){ st.cam={c:tc.slice(), R:tR, H:tH, tilt:tTilt}; }
    var k=Math.min(1, dt*3.5);
    for(var i=0;i<3;i++) st.cam.c[i]+=(tc[i]-st.cam.c[i])*k;
    st.cam.R+=(tR-st.cam.R)*k; st.cam.H+=(tH-st.cam.H)*k; st.cam.tilt+=(tTilt-st.cam.tilt)*k;

    var tiltP=ease(span(T,5.0,7.4));
    var tilt=Math.PI/2 + (st.cam.tilt-Math.PI/2)*tiltP;
    var zoomP=ease(span(T,0.2,5.0)), zoom=Math.exp(Math.log(7.5)*(1-zoomP));
    /* The house turns slowly, as the roof scan does. An ending can ask to be
       faced instead — the pool, the yard, the AC unit — and the turn then
       eases round to put it toward the camera, three-quarters on, and sways
       gently there rather than carrying it round behind the house. */
    if(T>=5.0){
      if(fin&&fin.face2!==undefined){
        var want=fin.face2-0.62+0.55+0.22*Math.sin(now*0.45), cur=st.spin||0;
        var d=((want-cur)%(Math.PI*2)+Math.PI*3)%(Math.PI*2)-Math.PI;
        st.spin=cur+d*Math.min(1,dt*1.6);
      } else st.spin=(st.spin||0)+dt*0.32;
    }
    var yaw=0.62+(st.spin||0);
    var start=st.arrive===undefined?99:st.arrive;
    var grow=ease(span(T,Math.max(5.8,start+0.4),Math.max(8.2,start+2.8)));
    var P=makeProj(cv,{c:st.cam.c,R:st.cam.R,H:st.cam.H,tilt:tilt,yaw:yaw,zoom:zoom,grow:grow});
    var P1=makeProj(cv,{c:st.cam.c,R:st.cam.R,H:st.cam.H,tilt:tilt,yaw:yaw,zoom:zoom,grow:1});

    /* the street, on its own 1x layer underneath */
    var mapA=Math.min(span(T,0,0.8), 1-span(T,9.2,10.8));
    if(st.map&&!st.mapWide) rsPaintMaps(st);
    var mcv=st.mcv, mctx=st.mctx, mr=mcv.getBoundingClientRect();
    if(mcv.width!==Math.round(mr.width)||mcv.height!==Math.round(mr.height)){ mcv.width=Math.round(mr.width); mcv.height=Math.round(mr.height); }
    if(mapA>0||st.mapDrawn){ mctx.clearRect(0,0,mcv.width,mcv.height); st.mapDrawn=false; }
    var PM=makeProj(mcv,{c:st.cam.c,R:st.cam.R,H:st.cam.H,tilt:tilt,yaw:yaw,zoom:zoom,grow:1});
    if(st.mapWide&&mapA>0){ st.mapDrawn=true;
      var footA=geo?Math.min(span(T,Math.max(3.0,start),Math.max(4.2,start+1.2)),1):0;
      drawMap(mctx,PM,1,mapA,geo&&geo.foot,footA);
    }
    if(!geo||grow<=0.01){ st.raf=requestAnimationFrame(draw); return; }
    st.geoLocked=geo;

    /* ground-level work (pool, yard) sits under the house */
    if(fin&&fin.under) fin.under(ctx,P1,dpr,now);

    /* the house, plus whatever this ending adds, back to front */
    var lift=fin&&fin.roofLift||0, roofA=fin&&fin.roofA!==undefined?fin.roofA:1, houseA=fin&&fin.houseA!==undefined?fin.houseA:1;
    /* once the house has dissolved it is not drawn at all — carrying it,
       invisible, through every frame of the subject's turn was wasted work */
    var list=houseA>0.01 ? geo.faces.map(function(f){
      if(f.kind==='roof'&&lift){ return {f:f, v:f.v.map(function(p){ return [p[0],p[1]+lift/Math.max(grow,0.01),p[2]]; }), a:roofA}; }
      return {f:f, v:f.v, a:1};
    }) : [];
    if(fin&&fin.faces) fin.faces.forEach(function(f){ list.push({f:f, v:f.v, a:1, extra:true}); });
    var faces=list.map(function(o){ var PP=o.extra?P1:P; var pts=o.v.map(PP), z=0; for(var i=0;i<pts.length;i++) z+=pts[i].z; return {f:o.f,pts:pts,z:z/pts.length,a:o.a,extra:o.extra,PP:PP}; });
    var gz={}; faces.forEach(function(F){ var g=F.f.grp; if(g===undefined) return; var o=gz[g]||(gz[g]={s:0,n:0}); F.pts.forEach(function(p){ o.s+=p.z; o.n++; }); });
    faces.sort(function(a,b){
      /* ground-level pieces (a lawn, a deck) always first */
      var ua=a.f.under?1:0, ub=b.f.under?1:0; if(ua!==ub) return ub-ua;
      var ga=a.f.grp, gb=b.f.grp;
      if(ga!==undefined&&gb!==undefined&&ga!==gb) return gz[gb].s/gz[gb].n - gz[ga].s/gz[ga].n;
      return b.z-a.z;
    });
    var wash=fin&&fin.wallWash||0;
    function paint(c2,F,alpha){
      c2.save(); c2.globalAlpha=alpha;
      if(F.f.draw){ F.f.draw(c2,F.PP,dpr,F); c2.restore(); return; }     /* pipes, bushes, a pool: drawn their own way */
      var sh=shade(F.f,F.PP,F.f.kind==='roof'||F.f.kind==='top'?'roof':'wall');
      var base=F.f.style&&F.f.style.fill ? F.f.style.fill : (F.f.kind==='roof'||F.f.kind==='top'?[255,255,255]:[226,232,240]);
      var col=base.map(function(c){ return Math.round(c*sh); });
      if(wash>0&&F.f.kind==='wall'&&!F.extra){ col=[Math.round(col[0]-(col[0]-214)*wash*0.55),Math.round(col[1]-(col[1]-230)*wash*0.55),Math.round(col[2]-(col[2]-255)*wash*0.4)]; }
      c2.fillStyle='rgb('+col.join(',')+')'; c2.strokeStyle=INK; c2.lineWidth=1*dpr; c2.lineJoin='round';
      c2.beginPath(); F.pts.forEach(function(p,i){ i?c2.lineTo(p.x,p.y):c2.moveTo(p.x,p.y); }); c2.closePath(); c2.fill(); c2.stroke();
      if(fin&&fin.face) fin.face(c2,F.PP,F,dpr);
      if(F.f.deco) F.f.deco(c2,F.PP,dpr);
      c2.restore();
    }
    /* how much of a subject face shows: a wall turned toward the camera
       fades out and back in as it turns, rather than blinking */
    function vis(F){ if(!F.f.cull) return 1; var v=F.f.cull(F.PP); return v===true?0:v===false?1:v; }
    var growA=Math.min(1,grow*4);
    if(houseA>=0.999){
      faces.forEach(function(F){ var a=F.a*(F.extra?vis(F):growA); if(a>0.01) paint(ctx,F,a); });
    } else {
      if(houseA>0.01){
        /* Faded face by face, a house's walls pile up where they overlap into
           grey smears. Drawn whole on its own layer and faded as one picture,
           it reads as glass; what the ending adds goes on top, sharp. */
        var hc=st.hcv||(st.hcv=document.createElement('canvas'));
        if(hc.width!==w||hc.height!==h){ hc.width=w; hc.height=h; }
        var hctx=hc.getContext('2d'); hctx.clearRect(0,0,w,h);
        faces.forEach(function(F){ if(!F.extra){ var a=F.a*growA; if(a>0.01) paint(hctx,F,a); } });
        ctx.save(); ctx.globalAlpha=Math.max(0,houseA); ctx.drawImage(hc,0,0); ctx.restore();
      }
      faces.forEach(function(F){ if(F.extra){ var a=vis(F); if(a>0.01) paint(ctx,F,a); } });
    }
    /* a see-through house keeps its outline, so it still reads as a house */
    if(fin&&fin.ghostEdges&&houseA<0.6){
      ctx.save(); ctx.globalAlpha=0.55; ctx.strokeStyle='rgba(0,21,48,.28)'; ctx.lineWidth=1*dpr;
      geo.faces.forEach(function(f){ if(f.kind==='roof') return; var pts=f.v.map(P); ctx.beginPath(); pts.forEach(function(p,i){ i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y); }); ctx.closePath(); ctx.stroke(); });
      ctx.restore();
    }
    if(fin&&fin.over) fin.over(ctx,P1,dpr);

    st.raf=requestAnimationFrame(draw);
  }
  function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

  /* ── the clock ─────────────────────────────────────────────────────────────── */
  function tick(){
    if(!st) return;
    var el=(performance.now()-st.t0)/1000;
    var holdAt=STEP_T[4]-0.2, raw=el-(st.paused||0);
    if(st.data===undefined && raw>holdAt){
      st.paused=el-holdAt; raw=holdAt;
      if(el>HS_WAIT_MAX){ finish(null); return; }
    }
    if(st.failed && raw>=STEP_T[2]){ finish(null); return; }
    st.clock=Math.min(HS_END, raw);
    st.clockAt=performance.now(); st.clockHeld=(st.data===undefined && raw>=holdAt) || st.clock>=HS_END;
    var T=st.clock, idx=0;
    for(var i=0;i<STEP_T.length;i++){ if(T>=STEP_T[i]) idx=i; }
    if(idx!==st.idx){ st.idx=idx; $('rs-now').textContent=label(idx); }
    var pc=Math.round(T/HS_END*100); $('rs-bar').style.width=pc+'%'; $('rs-pct').textContent=pc+'%';
    if(T>=HS_END && st.data){ finish(st.data); return; }
    st.timer=setTimeout(tick, 60);
  }

  /* ── the stage ─────────────────────────────────────────────────────────────── */
  function panel(){ return $('hs-addrpanel') || $('e-addrpanel'); }
  function ensureStage(){
    var stage=$('rs-stage'); if(stage) return stage;
    var pn=panel(); if(!pn) return null;
    var anchor=$('e-mapwrap') || $('hs-anchor'); if(!anchor) return null;
    stage=document.createElement('div'); stage.className='rs-stage'; stage.id='rs-stage';
    stage.setAttribute('role','status'); stage.setAttribute('aria-live','polite');
    stage.innerHTML=
      '<div class="hs-q" id="hs-q"></div>'
     +'<div class="rs-canvas-wrap" id="hs-canvas"><canvas id="rs-mapcv" aria-hidden="true"></canvas><canvas id="rs-cv" aria-hidden="true"></canvas>'
     +'<div class="rs-addr"><i></i><span id="rs-addr"></span></div></div>'
     +'<div class="rs-panel" id="hs-livepanel">'
     +  '<div id="rs-live"><div class="rs-row"><b id="rs-now">Locating your home</b><span id="rs-pct">0%</span></div>'
     +  '<div class="rs-bar"><i id="rs-bar"></i></div></div>'
     +  '<div class="rs-result" id="rs-result"></div>'
     +'</div>';
    anchor.parentNode.insertBefore(stage, anchor);
    return stage;
  }

  /* nothing is asked before the shot any more; askFirst just starts it */
  function askFirst(go){ go(); }

  /* ── start: when an address is chosen ─────────────────────────────────────── */
  function begin(addr){
    var stage=ensureStage(); if(!stage) return;
    var pn=panel(); pn.classList.add('hs-mode'); pn.classList.remove('hs-done','hs-fallback');
    stop();
    $('rs-addr').textContent=String(addr||'').split(',').slice(0,3).join(',');
    $('rs-live').style.display=''; $('rs-result').className='rs-result'; $('rs-result').innerHTML='';
    $('rs-bar').style.width='0'; $('rs-pct').textContent='0%'; $('rs-now').textContent=label(0);
    stage.classList.add('on');
    var cv=$('rs-cv'), mcv=$('rs-mapcv');
    /* the scan state exists from the moment the address is picked, so the
       street and the measurement start loading while any questions are asked */
    st={ cv:cv, ctx:cv.getContext('2d'), mcv:mcv, mctx:mcv.getContext('2d'), dpr:Math.min(2, window.devicePixelRatio||1),
         t0:performance.now(), clock:0, idx:-1, data:undefined, target:null, waiting:true, addrText:String(addr||'') };
    /* where the scan replaces the trace, the size is the scan's to give;
       where the size is asked on its own step, leave it as that step set it */
    if(!$('hs-addrpanel')){ try{ eS.sqft=0; eCheckBtn1(); }catch(e){} }
    var me=st;
    askFirst(function(ans){
      if(st!==me) return;
      me.q=ans||{}; me.waiting=false; me.t0=performance.now(); me.paused=0; me.clock=0; me.clockAt=undefined; me.lastMs=undefined; me.spin=0;
      draw(); tick();
    });
  }

  function hsData(d){
    var me=st; if(!me) return;
    if(d && d.totalAreaSqft>0){
      var pitch=+d.avgPitchDegrees||0, trueSqft=Math.round(d.totalAreaSqft), plan=Math.round(trueSqft*Math.cos(pitch*Math.PI/180));
      me.data={ trueSqft:trueSqft, planSqft:plan, pitch:pitch, planes:(d.roof&&d.roof.planes&&d.roof.planes.length)||0 };
      me.target=modelFor(trueSqft, pitch);
      me.bc=(me.origin&&d.centerLat&&d.centerLng) ? worldOf(me.origin,d.centerLat,d.centerLng) : [0,0];
      try{ me.planes=planesModel(d.roof, me.origin); }catch(e){ me.planes=null; }
      if(!me.planes){
        var g0=buildGeometry(me.target), o=me.origin;
        if(o&&d.centerLat&&d.centerLng){
          var FT=3.28084, dx=(d.centerLng-o.lng)*111320*Math.cos(o.lat*Math.PI/180)*FT, dz=-(d.centerLat-o.lat)*110574*FT, seen=[];
          var mv=function(v){ if(v._m) return; v._m=1; seen.push(v); v[0]+=dx; v[2]+=dz; };
          g0.faces.forEach(function(f){ f.v.forEach(mv); }); g0.roofEdges.forEach(function(e){ mv(e[0]); mv(e[1]); });
          (g0.foot||[]).forEach(function(f){ f.forEach(mv); }); if(g0.ridge){ mv(g0.ridge[0]); mv(g0.ridge[1]); }
          seen.forEach(function(v){ delete v._m; });
        }
        me.gen=g0;
      }
    } else { me.data=null; me.failed=true; }
  }

  /* ── the finish: what the scan found, and the hand-off to the calculator ──── */
  var RESULT = {
    hvac:        function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[fmt(d.planSqft),'Living area to size for']]; },
    painting:    function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[fmt(Math.round(Math.sqrt(d.planSqft)*4*9)),'Exterior wall, approx. sq ft']]; },
    electrical:  function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[fmt(d.planSqft),'Home size to price']]; },
    general:     function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[fmt(d.trueSqft),'Roof area, sq ft']]; },
    _:           function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft']]; }
  };
  var PREFILL = {
    hvac:function(d){ return d.planSqft; }, painting:function(d){ return d.planSqft; }, electrical:function(d){ return d.planSqft; }
  };
  function fmt(n){ return (typeof n==='number') ? Math.round(n).toLocaleString() : String(n); }

  function finish(data){
    if(!st) return;
    clearTimeout(st.timer);
    var res=$('rs-result'), q=st.q||{};
    $('rs-live').style.display='none';
    if(!data){
      res.innerHTML='<div class="rs-fail">We couldn’t find this home from satellite</div>'
        +'<p class="rs-note">Common with new builds and heavy tree cover. You can still enter the size below.</p>';
      res.className='rs-result on';
      handoff(null, q); return;
    }
    $('rs-bar').style.width='100%';
    var cards=(RESULT[TRADE]||RESULT._)(data,q);
    res.innerHTML='<div class="rs-grid hs-grid'+cards.length+'">'+cards.map(function(c){ return '<div><b>'+c[0]+'</b><span>'+c[1]+'</span></div>'; }).join('')+'</div>'
      +'<p class="rs-note">'+(PREFILL[TRADE]?'Measured from satellite. Adjust the size below if it’s off.':'Measured from satellite. Now tell us about the job.')+'</p>';
    res.className='rs-result on';
    handoff(data, q);
    st.done=true;
  }

  function handoff(data, q){
    var pn=panel(); pn.classList.remove('hs-mode'); pn.classList.add('hs-done');
    var v = (data&&PREFILL[TRADE]) ? PREFILL[TRADE](data,q) : null;
    var sw=$('e-sldwrap'), sld=$('e-sld');
    if(sw&&!$('hs-addrpanel')){ sw.style.display='block'; try{ window.eManualOpen=true; eManualOpen=true; }catch(e){} }
    if(sld&&typeof eUpdateSlider==='function'){
      var val = v ? Math.max(+sld.min, Math.min(+sld.max, Math.round(v/10)*10)) : +sld.value;
      if(!$('hs-addrpanel') || v) { try{ eUpdateSlider(val); }catch(e){} }
    }
    try{ eCheckBtn1(); }catch(e){}
    var cont=$('hs-cont'); if(cont) cont.disabled=false;
  }

  function stop(){ if(st){ clearTimeout(st.timer); cancelAnimationFrame(st.raf); } st=null; }

  /* ── plumbing, electrical and remodel had no address step: add one ─────────── */
  function insertPanel(){
    if($('e-mapwrap')||$('hs-addrpanel')) return;          /* already has one */
    var zp=$('e-zippanel'), ap=$('e-addrpanel'); if(!zp||!ap) return;
    var d=document.createElement('div'); d.className='e-addrpanel'; d.id='hs-addrpanel'; d.style.display='none';
    d.innerHTML=
      '<div class="e-shdr"><span class="e-seye">Your property</span>'
     +'<div class="e-stitle">What’s the<br><em>Property Address?</em></div>'
     +'<div class="e-ssub">Enter the address and we’ll find your home from satellite. Nothing to draw.</div></div>'
     +'<div class="e-asearch"><input type="text" class="e-asearch-input" id="e-addrIn" placeholder="Start typing a US address..." autocomplete="off" oninput="eHandleAddrInput(event)" onkeydown="eHandleAddrKey(event)">'
     +'<div class="e-suggestions" id="e-suggestions"></div></div>'
     +'<div id="hs-anchor"></div>'
     +'<div class="e-btnrow"><button class="e-btnback" type="button" id="hs-back">← Back</button>'
     +'<button class="e-btnmain" type="button" id="hs-cont" disabled>Continue →</button></div>';
    ap.parentNode.insertBefore(d, ap);
    $('hs-back').onclick=function(){ stop(); var s=$('rs-stage'); if(s) s.classList.remove('on'); d.style.display='none'; zp.style.display='block'; };
    $('hs-cont').onclick=function(){
      d.style.display='none'; ap.style.display='block';
      var s1=$('e-sld'); if(s1&&typeof eUpdateSlider==='function') try{ eUpdateSlider(+s1.value); }catch(e){}
      /* the house can fill in this trade's size: electrical's home size */
      if(st&&st.data&&PREFILL[TRADE]&&typeof eUpdateSlider==='function'){ var s2=$('e-sld'); if(s2) try{ eUpdateSlider(Math.max(+s2.min,Math.min(+s2.max,Math.round(PREFILL[TRADE](st.data,st.q||{})/50)*50))); }catch(e){} }
    };
    var _next=window.eZipNext;
    window.eZipNext=eZipNext=function(){
      var z=$('e-zippanel'); if(z) z.style.display='none'; d.style.display='block';
      var ts=$('e-tstep'); if(ts) ts.innerHTML='Step <b>1</b> — Address';
    };
    /* back from the size step returns to the address, not the ZIP */
    var _back=window.eZipBack;
    window.eZipBack=eZipBack=function(){ if(ap.style.display!=='none'){ ap.style.display='none'; d.style.display='block'; return; } return _back&&_back.apply(this,arguments); };
  }

  /* ── wire into the estimator, wrapping rather than rewriting ──────────────── */
  function wire(){
    if(typeof eSelectAddress!=='function'||typeof eSolarMeasure!=='function') return false;
    insertPanel();
    var _select=eSelectAddress;
    eSelectAddress=window.eSelectAddress=function(fullAddr){
      begin(fullAddr);
      var r; try{ r=_select.apply(this, arguments); }catch(e){}
      return r;
    };
    if(typeof eInitMap==='function'){ var _init=eInitMap; eInitMap=window.eInitMap=function(){ var r; try{ r=_init.apply(this, arguments); }catch(e){} return r; }; }
    eSolarMeasure=window.eSolarMeasure=function(lat, lon){
      rsMapLoad(lat, lon);
      if(window.RS_DEMO){ setTimeout(function(){ hsData(window.RS_DEMO); }, 1400); return; }
      fetch(E_SOLAR_URL,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+E_SOLAR_ANON,'apikey':E_SOLAR_ANON}, body:JSON.stringify({lat:lat,lng:lon}) })
        .then(function(r){ return r.json(); })
        .then(function(d){ hsData(d&&d.found&&d.totalAreaSqft>0 ? d : null); })
        .catch(function(){ hsData(null); });
    };
    var sub=document.querySelector('#e-addrpanel .e-ssub');
    if(sub&&$('e-mapwrap')) sub.textContent='Enter the address and we’ll find your home from satellite. Nothing to draw.';
    if(typeof eRestart==='function'){ var _rs=eRestart; eRestart=window.eRestart=function(){ stop(); var s=$('rs-stage'); if(s) s.classList.remove('on'); var p=panel(); if(p) p.classList.remove('hs-mode','hs-done','hs-fallback'); return _rs.apply(this, arguments); }; }
    window.hsDebug={ get st(){ return st; } };
    return true;
  }
  if(!wire()){ document.addEventListener('DOMContentLoaded', wire); }
})();
