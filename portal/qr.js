/* Tiny QR code encoder (byte mode, error correction M, versions 1-40).
   Follows the structure of Project Nayuki's reference implementation (MIT).
   window.bpQR(text) -> {size, get(x,y)} ; window.bpQRDraw(ctx, text, x, y, px, dark, light) draws it.
   No network, no library: the portal's QR codes work offline and in previews. */
(function(){
  var ECC=[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28];
  var BLK=[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49];
  function raw(v){var r=(16*v+128)*v+64;if(v>=2){var n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;}
  function dataCw(v){return Math.floor(raw(v)/8)-ECC[v]*BLK[v];}
  function gmul(x,y){var z=0;for(var i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z&255;}
  function rsDiv(d){var r=[],i,j,root=1;for(i=0;i<d-1;i++)r.push(0);r.push(1);
    for(i=0;i<d;i++){for(j=0;j<r.length;j++){r[j]=gmul(r[j],root);if(j+1<r.length)r[j]^=r[j+1];}root=gmul(root,2);}return r;}
  function rsRem(data,div){var r=div.map(function(){return 0;});
    data.forEach(function(b){var f=b^r.shift();r.push(0);div.forEach(function(c,i){r[i]^=gmul(c,f);});});return r;}
  function utf8(s){var b=[],u=unescape(encodeURIComponent(s));for(var i=0;i<u.length;i++)b.push(u.charCodeAt(i));return b;}
  function bit(x,i){return ((x>>>i)&1)!==0;}

  function encode(text,forceMask){
    var bytes=utf8(String(text)),v,cap;
    for(v=1;v<=40;v++){cap=dataCw(v)*8;if(4+(v<10?8:16)+bytes.length*8<=cap)break;}
    if(v>40)throw new Error('QR: text too long');
    var bb=[];var put=function(val,len){for(var i=len-1;i>=0;i--)bb.push((val>>>i)&1);};
    put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(function(b){put(b,8);});
    put(0,Math.min(4,cap-bb.length));put(0,(8-bb.length%8)%8);
    for(var pad=0xEC;bb.length<cap;pad^=0xEC^0x11)put(pad,8);
    var data=[];for(var i=0;i<bb.length;i+=8){var c=0;for(var j=0;j<8;j++)c=(c<<1)|bb[i+j];data.push(c);}
    // split into blocks, add error correction, interleave
    var nb=BLK[v],el=ECC[v],rw=Math.floor(raw(v)/8),nshort=nb-rw%nb,slen=Math.floor(rw/nb),div=rsDiv(el),blocks=[],k=0;
    for(i=0;i<nb;i++){var dat=data.slice(k,k+slen-el+(i<nshort?0:1));k+=dat.length;var ec=rsRem(dat,div);if(i<nshort)dat.push(0);blocks.push(dat.concat(ec));}
    var cw=[];for(i=0;i<blocks[0].length;i++)for(j=0;j<nb;j++)if(i!==slen-el||j>=nshort)cw.push(blocks[j][i]);
    // matrix
    var size=v*4+17,M=[],F=[];for(i=0;i<size;i++){M.push(new Array(size).fill(false));F.push(new Array(size).fill(false));}
    var set=function(x,y,d){M[y][x]=d;F[y][x]=true;};
    for(i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
    [[3,3],[size-4,3],[3,size-4]].forEach(function(p){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){var d=Math.max(Math.abs(dx),Math.abs(dy)),xx=p[0]+dx,yy=p[1]+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size)set(xx,yy,d!==2&&d!==4);}});
    var al=[];if(v>1){var na=Math.floor(v/7)+2,step=(v===32)?26:Math.ceil((v*4+4)/(na*2-2))*2;al=[6];for(var pos=size-7;al.length<na;pos-=step)al.splice(1,0,pos);}
    al.forEach(function(ax,ai){al.forEach(function(ay,bi){if((ai===0&&bi===0)||(ai===0&&bi===al.length-1)||(ai===al.length-1&&bi===0))return;
      for(var dy=-2;dy<=2;dy++)for(var dx=-2;dx<=2;dx++)set(ax+dx,ay+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);});});
    var fmt=function(mask){var d=(0<<3)|mask,r=d;for(var i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);var b=((d<<10)|r)^0x5412;
      for(i=0;i<=5;i++)set(8,i,bit(b,i));set(8,7,bit(b,6));set(8,8,bit(b,7));set(7,8,bit(b,8));for(i=9;i<15;i++)set(14-i,8,bit(b,i));
      for(i=0;i<8;i++)set(size-1-i,8,bit(b,i));for(i=8;i<15;i++)set(8,size-15+i,bit(b,i));set(8,size-8,true);};
    fmt(0);
    if(v>=7){var r=v;for(i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);var vb=(v<<12)|r;for(i=0;i<18;i++){var a=size-11+i%3,b2=Math.floor(i/3);set(a,b2,bit(vb,i));set(b2,a,bit(vb,i));}}
    var n=0;for(var right=size-1;right>=1;right-=2){if(right===6)right=5;for(var vert=0;vert<size;vert++)for(j=0;j<2;j++){
      var x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;if(!F[y][x]&&n<cw.length*8){M[y][x]=bit(cw[n>>>3],7-(n&7));n++;}}}
    var mf=[function(x,y){return (x+y)%2===0;},function(x,y){return y%2===0;},function(x,y){return x%3===0;},function(x,y){return (x+y)%3===0;},
      function(x,y){return (Math.floor(x/3)+Math.floor(y/2))%2===0;},function(x,y){return x*y%2+x*y%3===0;},
      function(x,y){return (x*y%2+x*y%3)%2===0;},function(x,y){return ((x+y)%2+x*y%3)%2===0;}];
    var applyMask=function(m){for(var y=0;y<size;y++)for(var x=0;x<size;x++)if(!F[y][x]&&mf[m](x,y))M[y][x]=!M[y][x];};
    var penalty=function(){var p=0,x,y,run,dark=0;
      for(y=0;y<size;y++){run=1;for(x=1;x<=size;x++){if(x<size&&M[y][x]===M[y][x-1])run++;else{if(run>=5)p+=run-2;run=1;}}}
      for(x=0;x<size;x++){run=1;for(y=1;y<=size;y++){if(y<size&&M[y][x]===M[y-1][x])run++;else{if(run>=5)p+=run-2;run=1;}}}
      for(y=0;y<size-1;y++)for(x=0;x<size-1;x++){var c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3;}
      for(y=0;y<size;y++)for(x=0;x<size;x++)if(M[y][x])dark++;
      return p+Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;};
    var best=forceMask,bp=1e9;
    if(best==null)for(var m=0;m<8;m++){applyMask(m);fmt(m);var pn=penalty();if(pn<bp){bp=pn;best=m;}applyMask(m);}
    applyMask(best);fmt(best);
    return {size:size,mask:best,version:v,get:function(x,y){return x>=0&&y>=0&&x<size&&y<size&&M[y][x];}};
  }
  window.bpQR=encode;
  /* draw with a 4-module quiet zone; px = module size */
  window.bpQRDraw=function(ctx,text,x,y,px,dark,light){
    var q=encode(text),full=(q.size+8)*px;
    ctx.fillStyle=light||'#fff';ctx.fillRect(x,y,full,full);ctx.fillStyle=dark||'#000';
    for(var r=0;r<q.size;r++)for(var c=0;c<q.size;c++)if(q.get(c,r))ctx.fillRect(x+(c+4)*px,y+(r+4)*px,px,px);
    return full;
  };
})();
