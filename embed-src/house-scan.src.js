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
  function box(H, a0,a1, y0,y1, b0,b1, grp, style){
    var P=function(a,y,b){ return H.w(a,y,b); };
    var v=[P(a0,y0,b0),P(a1,y0,b0),P(a1,y0,b1),P(a0,y0,b1),P(a0,y1,b0),P(a1,y1,b0),P(a1,y1,b1),P(a0,y1,b1)];
    var f=[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]];
    return f.map(function(ix,i){ return {v:ix.map(function(k){ return v[k]; }), kind:i===4?'top':'side', grp:grp, style:style||{}}; });
  }
  function seg(ctx,P,a,b,part,col,wpx){ if(part<=0) return; var A=P(a),B=P(b); ctx.strokeStyle=col; ctx.lineWidth=wpx; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(A.x+(B.x-A.x)*part, A.y+(B.y-A.y)*part); ctx.stroke(); }
  /* draw a chain of segments progressively, p in 0..1 across the whole chain */
  function chain(ctx,P,list,p,col,wpx){ var n=list.length, d=p*n; for(var i=0;i<n;i++){ var q=Math.max(0,Math.min(1,d-i)); if(q<=0) break; seg(ctx,P,list[i][0],list[i][1],q,col,wpx); } }
  function dot(ctx,P,p,r,col){ var q=P(p); ctx.fillStyle=col; ctx.beginPath(); ctx.arc(q.x,q.y,r,0,Math.PI*2); ctx.fill(); }
  function faceTo(H, a, b){ var p=H.w(a,0,b); return Math.atan2(-(p[0]-H.c[0]), -(p[2]-H.c[1])); }
  function ringPts(H, poly, y){ return poly.map(function(q){ return H.w(q[0],y,q[1]); }); }

  var BLUE='#006fff', INK='rgba(0,21,48,.16)';

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
    hvac: function(T,H,now){
      var sa=H.side[0], sb=H.side[1];
      /* on the side wall, a little toward the back, clear of the wall */
      /* a big unit, set close against the wall — just its pad's width out */
      var U=2.6, gap=U+0.9;
      var ca = sa!==0 ? (sa>0?H.a1+gap:H.a0-gap) : (H.a0+H.a1)/2 - H.front[0]*(H.a1-H.a0)*0.15;
      var cb = sb!==0 ? (sb>0?H.b1+gap:H.b0-gap) : (H.b0+H.b1)/2 - H.front[1]*(H.b1-H.b0)*0.15;
      var rise=ease(span(T,8.4,9.4)), top=0.35+4.4*rise;
      var faces=[].concat(
        box(H, ca-U-0.6,ca+U+0.6, 0,0.35, cb-U-0.6,cb+U+0.6, 'pad', {fill:[236,240,245]}),
        rise>0.02 ? box(H, ca-U,ca+U, 0.35,top, cb-U,cb+U, 'unit', {fill:[250,251,253], top:'fan'}) : []);
      var camP=ease(span(T,10.0,12.2));
      return {
        faces:faces, houseA:1-0.7*camP,
        face2: faceTo(H,ca,cb),
        cam: camP>0 ? {c:H.w(ca,2.5,cb), R:15, H:7, p:camP} : null,
        face: function(ctx,P,F,dpr){
          if(!F.f.style||F.f.style.top!=='fan'||F.f.kind!=='top') return;
          /* the fan grille and blades, turning, on the unit's top */
          var ang=now*7, R=U*0.8, y=top+0.01, pts=[];
          for(var i=0;i<=28;i++){ var t=i/28*Math.PI*2; pts.push(P(H.w(ca+Math.cos(t)*R, y, cb+Math.sin(t)*R))); }
          ctx.save(); ctx.globalAlpha*=rise; ctx.strokeStyle='rgba(0,21,48,.35)'; ctx.lineWidth=1*dpr;
          ctx.beginPath(); pts.forEach(function(q,i){ i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.stroke();
          ctx.strokeStyle=BLUE; ctx.lineWidth=2*dpr; ctx.lineCap='round';
          for(var k=0;k<4;k++){ var t2=ang+k*Math.PI/2, c0=P(H.w(ca,y,cb)), c1=P(H.w(ca+Math.cos(t2)*R*0.9, y, cb+Math.sin(t2)*R*0.9));
            ctx.beginPath(); ctx.moveTo(c0.x,c0.y); ctx.lineTo(c1.x,c1.y); ctx.stroke(); }
          ctx.restore();
        },
        over: function(ctx,P,dpr){
          /* the refrigerant line, from the unit into the wall */
          var wa = sa!==0 ? (sa>0?H.a1:H.a0) : ca, wb = sb!==0 ? (sb>0?H.b1:H.b0) : cb;
          ctx.save(); ctx.lineCap='round';
          chain(ctx,P,[[H.w(ca-sa*U,1.6,cb-sb*U),H.w(wa,1.6,wb)],[H.w(wa,1.6,wb),H.w(wa,7,wb)]], span(T,9.6,10.6), BLUE, 2*dpr);
          ctx.restore();
        }
      };
    },

    countertops: function(T,H){
      var L=lift(T), r=roomBox(H), k=ease(span(T,9.4,10.4)), h=3*k+0.01;
      var faces=[], run=function(a0,a1,b0,b1,g){ faces=faces.concat(box(H,a0,a1,0,h,b0,b1,g,{fill:[250,251,253]})); };
      if(k>0.02){
        run(r.a0, r.a1, r.b0, r.b0+2.2, 'k1');                          /* along the back wall */
        run(r.a0, r.a0+2.2, r.b0+2.2, r.b1-1, 'k2');                    /* the return */
        var ia=(r.a0+r.a1)/2+1, ib=(r.b0+r.b1)/2+1;
        run(ia-3, ia+3, ib-1.5, ib+1.5, 'k3');                           /* the island */
      }
      var camP=ease(span(T,9.6,11.8));
      return { faces:faces, roofLift:L.roofLift, roofA:L.roofA, houseA:1-0.75*span(T,9.0,10.2),
        cam: camP>0 ? {c:H.w((r.a0+r.a1)/2,2,(r.b0+r.b1)/2), R:Math.max(17,(r.a1-r.a0)*1.1), H:4, tilt:0.78, p:camP} : null,
        over: function(ctx,P,dpr){
          var p=span(T,10.4,11.8); if(p<=0||k<0.5) return;
          var tops=[];
          var rect=function(a0,a1,b0,b1){ var c=[H.w(a0,h,b0),H.w(a1,h,b0),H.w(a1,h,b1),H.w(a0,h,b1)]; tops.push([c[0],c[1]],[c[1],c[2]],[c[2],c[3]],[c[3],c[0]]); };
          rect(r.a0,r.a1,r.b0,r.b0+2.2); rect(r.a0,r.a0+2.2,r.b0+2.2,r.b1-1);
          var ia=(r.a0+r.a1)/2+1, ib=(r.b0+r.b1)/2+1; rect(ia-3,ia+3,ib-1.5,ib+1.5);
          ctx.save(); ctx.lineCap='round'; chain(ctx,P,tops,p,BLUE,2*dpr); ctx.restore();
        } };
    },

    trim: function(T,H){
      var L=lift(T), r=roomBox(H), k=ease(span(T,9.2,10.0));
      var faces=k>0.02 ? box(H,r.a0,r.a1,0,0.15,r.b0,r.b1,'floor',{fill:[244,246,249]}) : [];
      var camP=ease(span(T,9.4,11.4));
      return { faces:faces, roofLift:L.roofLift, roofA:L.roofA, houseA:1-0.78*span(T,9.0,10.0),
        cam: camP>0 ? {c:H.w((r.a0+r.a1)/2,3.5,(r.b0+r.b1)/2), R:Math.max(16,(r.a1-r.a0)*1.05), H:9, tilt:0.68, p:camP} : null,
        over: function(ctx,P,dpr){
          var loop=function(y){ var c=[H.w(r.a0,y,r.b0),H.w(r.a1,y,r.b0),H.w(r.a1,y,r.b1),H.w(r.a0,y,r.b1)]; return [[c[0],c[1]],[c[1],c[2]],[c[2],c[3]],[c[3],c[0]]]; };
          ctx.save(); ctx.lineCap='round';
          /* the room's corners, faint, so the trim has walls to sit on */
          if(k>0.5){ ctx.globalAlpha=0.5*k; [[r.a0,r.b0],[r.a1,r.b0],[r.a1,r.b1],[r.a0,r.b1]].forEach(function(q){ seg(ctx,P,H.w(q[0],0,q[1]),H.w(q[0],9,q[1]),1,'rgba(0,21,48,.3)',1*dpr); }); ctx.globalAlpha=1; }
          chain(ctx,P,loop(0.45),span(T,10.2,11.4),BLUE,2.2*dpr);                        /* baseboard */
          var da=r.a0+(r.a1-r.a0)*0.55;
          chain(ctx,P,[[H.w(da,0,r.b0),H.w(da,7,r.b0)],[H.w(da,7,r.b0),H.w(da+3,7,r.b0)],[H.w(da+3,7,r.b0),H.w(da+3,0,r.b0)]],span(T,11.2,12.1),BLUE,2.2*dpr);   /* door casing */
          chain(ctx,P,loop(8.7),span(T,11.9,13.1),BLUE,2.2*dpr);                         /* crown */
          ctx.restore();
        } };
    },

    painting: function(T,H,now,geo){
      var interior = (typeof eS!=='undefined' && eS.mode==='interior');
      if(interior){
        var L=lift(T), r=roomBox(H), camP=ease(span(T,9.4,11.4));
        var walls=[[r.a0,r.b0,r.a1,r.b0],[r.a1,r.b0,r.a1,r.b1],[r.a1,r.b1,r.a0,r.b1],[r.a0,r.b1,r.a0,r.b0]];
        return { faces:[], roofLift:L.roofLift, roofA:L.roofA, houseA:1-0.78*span(T,9.0,10.0),
          cam: camP>0 ? {c:H.w((r.a0+r.a1)/2,4,(r.b0+r.b1)/2), R:Math.max(16,(r.a1-r.a0)*1.05), H:9, tilt:0.68, p:camP} : null,
          over: function(ctx,P,dpr){
            ctx.save(); ctx.lineCap='round';
            walls.forEach(function(wl,i){
              var p=span(T,10.0+i*0.7,10.9+i*0.7); if(p<=0) return;
              var c=[H.w(wl[0],0,wl[1]),H.w(wl[2],0,wl[3]),H.w(wl[2],9,wl[3]),H.w(wl[0],9,wl[1])];
              var wash=span(T,12.4,13.4);
              if(wash>0){ ctx.globalAlpha=0.18*wash; ctx.fillStyle=BLUE; ctx.beginPath(); c.forEach(function(q,j){ var s=P(q); j?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1; }
              chain(ctx,P,[[c[0],c[1]],[c[1],c[2]],[c[2],c[3]],[c[3],c[0]]],p,BLUE,2*dpr);
            });
            ctx.restore();
          } };
      }
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

    plumbing: function(T,H){
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

    electrical: function(T,H,now){
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

    pools: function(T,H){
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

    landscaping: function(T,H){
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
    var list=geo.faces.map(function(f){
      if(f.kind==='roof'&&lift){ return {f:f, v:f.v.map(function(p){ return [p[0],p[1]+lift/Math.max(grow,0.01),p[2]]; }), a:roofA}; }
      return {f:f, v:f.v, a:1};
    });
    if(fin&&fin.faces) fin.faces.forEach(function(f){ list.push({f:f, v:f.v, a:1, extra:true}); });
    var faces=list.map(function(o){ var PP=o.extra?P1:P; var pts=o.v.map(PP), z=pts.reduce(function(s,p){ return s+p.z; },0)/pts.length; return {f:o.f,pts:pts,z:z,a:o.a,extra:o.extra,PP:PP}; });
    var gz={}; faces.forEach(function(F){ var g=F.f.grp; if(g===undefined) return; var o=gz[g]||(gz[g]={s:0,n:0}); F.pts.forEach(function(p){ o.s+=p.z; o.n++; }); });
    faces.sort(function(a,b){
      var ga=a.f.grp, gb=b.f.grp;
      if(ga!==undefined&&gb!==undefined&&ga!==gb) return gz[gb].s/gz[gb].n - gz[ga].s/gz[ga].n;
      return b.z-a.z;
    });
    var wash=fin&&fin.wallWash||0;
    function paint(c2,F,alpha){
      var sh=shade(F.f,F.PP,F.f.kind==='roof'||F.f.kind==='top'?'roof':'wall');
      var base=F.f.style&&F.f.style.fill ? F.f.style.fill : (F.f.kind==='roof'||F.f.kind==='top'?[255,255,255]:[226,232,240]);
      var col=base.map(function(c){ return Math.round(c*sh); });
      if(wash>0&&F.f.kind==='wall'&&!F.extra){ col=[Math.round(col[0]-(col[0]-214)*wash*0.55),Math.round(col[1]-(col[1]-230)*wash*0.55),Math.round(col[2]-(col[2]-255)*wash*0.4)]; }
      c2.save(); c2.globalAlpha=alpha;
      c2.fillStyle='rgb('+col.join(',')+')'; c2.strokeStyle=INK; c2.lineWidth=1*dpr; c2.lineJoin='round';
      c2.beginPath(); F.pts.forEach(function(p,i){ i?c2.lineTo(p.x,p.y):c2.moveTo(p.x,p.y); }); c2.closePath(); c2.fill(); c2.stroke();
      if(fin&&fin.face) fin.face(c2,F.PP,F,dpr);
      c2.restore();
    }
    var growA=Math.min(1,grow*4);
    if(houseA>=0.999){
      faces.forEach(function(F){ var a=F.a*growA; if(a>0.01) paint(ctx,F,a); });
    } else {
      /* Faded face by face, a house's walls pile up where they overlap into
         grey smears. Drawn whole on its own layer and faded as one picture,
         it reads as glass; what the ending adds goes on top, sharp. */
      var hc=st.hcv||(st.hcv=document.createElement('canvas'));
      if(hc.width!==w||hc.height!==h){ hc.width=w; hc.height=h; }
      var hctx=hc.getContext('2d'); hctx.clearRect(0,0,w,h);
      faces.forEach(function(F){ if(!F.extra){ var a=F.a*growA; if(a>0.01) paint(hctx,F,a); } });
      ctx.save(); ctx.globalAlpha=Math.max(0,houseA); ctx.drawImage(hc,0,0); ctx.restore();
      faces.forEach(function(F){ if(F.extra) paint(ctx,F,1); });
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
    hvac:        function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[d.planes>1?d.planes:'—','Roof planes'],[fmt(d.planSqft),'Living area to size for']]; },
    painting:    function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[fmt(Math.round(Math.sqrt(d.planSqft)*4*9)),'Exterior wall, approx. sq ft'],[d.planes>1?d.planes:'—','Roof planes']]; },
    electrical:  function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[d.planes>1?d.planes:'—','Roof planes'],[fmt(d.planSqft),'Home size to price']]; },
    _:           function(d){ return [[fmt(d.planSqft),'Home footprint, sq ft'],[d.planes>1?d.planes:'—','Roof planes'],[fmt(d.trueSqft),'Roof area, sq ft']]; }
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
    res.innerHTML='<div class="rs-grid hs-grid3">'+cards.map(function(c){ return '<div><b>'+c[0]+'</b><span>'+c[1]+'</span></div>'; }).join('')+'</div>'
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
