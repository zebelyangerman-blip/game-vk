/* Native, transient 2D effects. One canvas, one clock and an explicit hit schedule.
   Gameplay decides the affected cells; this module only stages their presentation. */
(() => {
 'use strict';
 const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const lerp=(a,b,t)=>a+(b-a)*t,out=t=>1-Math.pow(1-clamp(t),3);
 const colors=['#ff6d83','#68b6ff','#64e4a0','#ffdc69','#bb91ff','#69ece5'];
 const images=new Map(),textures=new Map(),jobs=new Set();
 const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
 const budgets={high:220,medium:120,low:40};
 let suspended=false;
 function image(path,url){
  if(images.has(path))return images.get(path);
  const im=new Image();im.src=url(path);images.set(path,im);return im;
 }
 function preload(url){
  for(const p of ['match3/specials/rocket_horizontal.png','match3/specials/rocket_vertical.png','match3/specials/bomb.png','match3/specials/rainbow.png','match3/boosters/hammer.png'])image(p,url);
 }
 function matchPlan(data){
  const {size=8,width,height,pitch,centers,board,tiles,chain=1}=data;
  const duration=chain===1?830:chain===2?700:560,peak=chain===1?235:chain===2?185:135;
  const indices=[...new Set([...data.cleared,...data.crateHits])],cleared=new Set(data.cleared),links=[];
  const hits=indices.map((index,k)=>({index,...centers[index],at:peak+Math.min(70,k*22),color:colors[board[index]?.type]||'#ffd989',obstacle:tiles[index]?.ice?'ice':tiles[index]?.crate?'wood':tiles[index]?.chain?'chain':null}));
  const effects=hits.map(h=>({...h,type:'match',start:0,peak:h.at,end:duration,seed:h.index*13+1}));
  for(const a of data.cleared)for(const b of [a%size<size-1?a+1:-1,a+size]){
   if(!cleared.has(b)||board[a]?.type!==board[b]?.type)continue;
   links.push({a:centers[a],b:centers[b],color:colors[board[a]?.type]||'#ffd989'});
  }
  return {kind:'match',width,height,pitch,duration,effects,hits,links,transforms:[],cues:[{at:peak,name:chain>1?'combo':'match'}]};
 }
 function createPlan(data){
  if(!data.context&&!data.activated.length)return matchPlan(data);
  const {size=8,width,height,pitch,centers,board,tiles,context}=data;
  const eligible=new Set([...data.cleared,...data.crateHits]),cleared=new Set(data.cleared);
  const times=new Map([...eligible].map(i=>[i,Infinity])),scheduled=new Set(),effects=[],transforms=[],cues=[];
  const point=i=>centers[i]||{x:width/2,y:height/2};
  const rc=i=>[Math.floor(i/size),i%size];
  const distance=(a,b)=>Math.hypot(point(a).x-point(b).x,point(a).y-point(b).y);
  const hit=(i,at)=>{if(eligible.has(i))times.set(i,Math.min(times.get(i),at));};
  const pieces=context?.pieces||[],origin=pieces[1]?.i??pieces[0]?.i??data.initial[0]??0;
  function add(type,index,start=0,short=false,extra={}){
   const p=point(index),charge=short?165:type==='rocket'?250:type==='hammer'?350:330;
   const peak=start+charge,travel=short?340:type==='rocket'?670:410;
   const e={type,index,x:p.x,y:p.y,start,peak,travelEnd:peak+travel,end:peak+travel+(short?360:510),short,...extra};
   effects.push(e);if(type!=='creation')cues.push({at:peak,name:type==='rocket'?'rocket':type==='hammer'?'wood':type==='rainbow'||type==='prism'?'rainbow':'bomb',strong:!short&&type==='bomb'});
   if(type==='rocket'){
    const [r,c]=rc(index),axis=e.axis||'h';
    for(const i of eligible){const [y,x]=rc(i);if(axis==='h'?y===r:x===c){
     const delta=axis==='h'?point(i).x-p.x:point(i).y-p.y;
     const end=delta<0?(axis==='h'?p.x:p.y):(axis==='h'?width-p.x:height-p.y);
     const f=clamp(Math.abs(delta)/Math.max(pitch,end)),u=(-.65+Math.sqrt(.4225+1.4*f))/.7;
     hit(i,peak+u*travel);
    }}
   }else if(type==='bomb'){
    const [r,c]=rc(index),radius=e.radius??1;
    for(const i of eligible){const [y,x]=rc(i);if(Math.abs(y-r)<=radius&&Math.abs(x-c)<=radius)hit(i,peak+distance(i,index)/Math.max(pitch,pitch*(radius+.5))*180);}
   }else if(type==='hammer')hit(index,peak);
   return e;
  }
  function power(index,start=0,short=false){
   if(scheduled.has(index))return;scheduled.add(index);
   const g=board[index],type=g?.special;
   if(type==='rocketH'||type==='rocketV')add('rocket',index,start,short,{axis:type==='rocketH'?'h':'v'});
   else if(type==='bomb')add('bomb',index,start,short,{radius:1});
   else if(type==='rainbow'){
    const targets=[...cleared].filter(i=>i!==index&&board[i]?.type===data.commonType);
    rainbow(index,targets,start,short,false);
   }
  }
  function rainbow(index,targets,start=0,short=false,transform=false,prism=false,partner=null){
   const e=add(prism?'prism':'rainbow',index,start,short,{targets:[],partner}),cue=cues[cues.length-1];
   e.peak=start+(short?190:330);e.travelEnd=e.peak+510;e.end=start+(prism?1510:1390);
   hit(index,e.peak);
   const maxDistance=Math.hypot(width,height);
   for(const i of targets){
    const arrive=e.peak+270+distance(i,index)/maxDistance*200;
    e.targets.push({index:i,...point(i),arrive,color:colors[board[i]?.type]||colors[i%6],bend:((i%3)-1)*pitch*.46});
    if(transform){transforms.push({index:i,at:arrive});power(i,arrive+30,true);}
    else hit(i,arrive);
   }
   // A single charging cue. The release cue follows the travelling energy.
   cue.at=e.peak;
   return e;
  }
  const kind=context?.kind||'single';
  if(kind.startsWith('booster-')){
   add(kind==='booster-rocket'?'rocket':kind==='booster-hammer'?'hammer':'bomb',origin,0,false,{axis:'h',radius:1,ghost:kind!=='booster-hammer'});
  }else if(kind==='bomb-pair'){
   pieces.forEach(p=>scheduled.add(p.i));add('bomb',origin,0,false,{radius:2,partner:pieces[0]?.i,mega:true});
  }else if(kind==='rocket-pair'){
   pieces.forEach(p=>scheduled.add(p.i));const lines=new Set();
   for(const p of pieces)for(const axis of ['h','v']){const [r,c]=rc(p.i),key=axis+':'+(axis==='h'?r:c);if(lines.has(key))continue;lines.add(key);add('rocket',p.i,0,false,{axis});}
  }else if(kind==='rocket-bomb'){
   pieces.forEach(p=>scheduled.add(p.i));add('bomb',origin,0,false,{radius:1,mega:true,partner:pieces[0]?.i});
   const [r,c]=rc(origin);
   for(let d=-1;d<=1;d++){
    if(r+d>=0&&r+d<size)add('rocket',(r+d)*size+c,140+Math.abs(d)*45,true,{axis:'h'});
    if(c+d>=0&&c+d<size)add('rocket',r*size+c+d,140+Math.abs(d)*45,true,{axis:'v'});
   }
  }else if(kind==='rainbow-pair'){
   pieces.forEach(p=>scheduled.add(p.i));rainbow(origin,[...cleared].filter(i=>i!==origin),0,false,false,true,pieces[0]?.i);
  }else if(kind==='rainbow-link'){
   const source=pieces.find(p=>p.g?.special==='rainbow')?.i??origin;
   scheduled.add(source);
   const other=pieces.find(p=>p.i!==source)?.g,transform=!!other?.special;
   rainbow(source,[...new Set(data.initial)].filter(i=>i!==source&&cleared.has(i)),0,false,transform);
  }else{
   for(const i of data.initial)if(data.activated.includes(i))power(i);
   for(const i of data.initial)if(!data.activated.includes(i))hit(i,170);
  }
  // Causality is preserved even when many child effects share the same wave.
  for(let guard=0;guard<data.activated.length;guard++){
   const remaining=data.activated.filter(i=>!scheduled.has(i));if(!remaining.length)break;
   remaining.sort((a,b)=>(times.get(a)??Infinity)-(times.get(b)??Infinity));
   const i=remaining[0],at=times.get(i);
   power(i,Number.isFinite(at)?at+35:360,true);
  }
  for(const i of eligible)if(!Number.isFinite(times.get(i))){
   const [r,c]=rc(i),adj=[];for(const j of cleared){const [y,x]=rc(j);if(Math.abs(y-r)+Math.abs(x-c)===1&&Number.isFinite(times.get(j)))adj.push(times.get(j));}
   hit(i,adj.length?Math.min(...adj)+45:650);
  }
  // Compress only the late chain, not the primary preparation or launch.
  const rawEnd=Math.max(1250,...effects.map(e=>e.end),...times.values());
  const duration=Math.min(rawEnd,kind==='single'?1700:1780),k=rawEnd>duration?(duration-800)/(rawEnd-800):1;
  const map=t=>t<=800?t:800+(t-800)*k;
  for(const e of effects){e.seed=(e.index+1)*13+effects.indexOf(e)*7;for(const key of ['start','peak','travelEnd','end'])e[key]=map(e[key]);if(e.targets)for(const t of e.targets)t.arrive=map(t.arrive);}
  const hits=[...times].map(([index,at])=>({index,at:map(at),...point(index),color:colors[board[index]?.type]||'#ffd989',obstacle:tiles[index]?.ice?'ice':tiles[index]?.crate?'wood':tiles[index]?.chain?'chain':null})).sort((a,b)=>a.at-b.at);
  transforms.forEach(t=>t.at=map(t.at));cues.forEach(c=>c.at=map(c.at));
  const primary=effects[0]?.type;
  cues.unshift({at:0,name:primary==='rainbow'||primary==='prism'?'rainbowCharge':primary==='bomb'?'bombCharge':primary==='hammer'?'hammerCharge':'rocketCharge'});
  const visibleDuration=Math.max(duration,...hits.map(h=>h.at+300));
  return {kind,width,height,pitch,duration:visibleDuration,effects,hits,partnerPoints:centers,transforms:transforms.sort((a,b)=>a.at-b.at),cues:cues.sort((a,b)=>a.at-b.at)};
 }
 function texture(kind,color){
  const key=kind+color;if(textures.has(key))return textures.get(key);
  const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');
  if(kind==='smoke'){
   const g=x.createRadialGradient(43,39,4,48,48,45);g.addColorStop(0,'#d8ccb69c');g.addColorStop(.42,'#9ba8a17a');g.addColorStop(1,'#4b696100');x.fillStyle=g;x.fillRect(0,0,96,96);
  }else{
   const g=x.createRadialGradient(48,48,0,48,48,47);g.addColorStop(0,'#fffbeae8');g.addColorStop(.12,color+'de');g.addColorStop(.36,color+'78');g.addColorStop(1,color+'00');x.fillStyle=g;x.fillRect(0,0,96,96);
  }
  textures.set(key,c);return c;
 }
 function glow(ctx,x,y,r,color,alpha=1){if(r<=0||alpha<=0)return;ctx.globalAlpha=clamp(alpha);ctx.drawImage(texture('glow',color),x-r,y-r,r*2,r*2);ctx.globalAlpha=1;}
 function star(ctx,x,y,r,color,rotation=0,alpha=1){
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.globalAlpha=clamp(alpha);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.2,-r*.2);ctx.lineTo(r,0);ctx.lineTo(r*.2,r*.2);ctx.lineTo(0,r);ctx.lineTo(-r*.2,r*.2);ctx.lineTo(-r,0);ctx.lineTo(-r*.2,-r*.2);ctx.closePath();ctx.fill();ctx.restore();
 }
 function sprite(ctx,im,x,y,w,angle=0,alpha=1){
  if(!im?.complete||!im.naturalWidth)return;
  const h=w*im.naturalHeight/im.naturalWidth;ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=clamp(alpha);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();
 }
 function curve(a,b,bend,t){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy)),c={x:(a.x+b.x)/2-dy/d*bend,y:(a.y+b.y)/2+dx/d*bend};
  return {x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y,c};
 }
 function drawLink(ctx,a,b,bend,t,alpha,color,pitch){
  const p=curve(a,b,bend,t),c=p.c,part={x:lerp(a.x,c.x,t),y:lerp(a.y,c.y,t)};
  ctx.save();ctx.globalAlpha=clamp(alpha);const g=ctx.createLinearGradient(a.x,a.y,b.x,b.y);g.addColorStop(0,'#c899ff');g.addColorStop(.65,color);g.addColorStop(1,'#fff5bd');ctx.strokeStyle=g;ctx.lineWidth=Math.max(1.2,pitch*.04);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(part.x,part.y,p.x,p.y);ctx.stroke();ctx.restore();
  return p;
 }
 function makeParticles(plan,tier){
  const out=[],density=tier==='high'?1:tier==='medium'?.62:.24;
  const add=(e,type,x,y,vx,vy,size,born,life,color,seed)=>out.push({type,x,y,vx,vy,size,born,life,color,seed,gravity:type==='shard'?plan.pitch*.25:type==='smoke'?-plan.pitch*.08:plan.pitch*.06});
  for(const e of plan.effects){
   const seed=e.seed||1;
   if(e.type==='match'){
    const n=Math.max(3,Math.round(9*density)),life=Math.min(490,e.end-e.peak-25);
    for(let i=0;i<n;i++){
     const a=i*2.399+seed*.27,v=plan.pitch*(.40+(i%3)*.15);
     add(e,i%4===3?'star':'shard',e.x,e.y,Math.cos(a)*v,Math.sin(a)*v-plan.pitch*.12,plan.pitch*(i%4===3?.065:.082),e.peak+i%3*15,life,e.color,i+seed);
    }
   }else if(e.type==='bomb'||e.type==='hammer'){
    const n=Math.max(4,Math.round((e.mega?32:20)*density)),radius=plan.pitch*(e.radius??1);
    for(let i=0;i<n;i++){
     const a=(i/n)*TAU+seed*.27,v=radius*(.75+((i*7)%11)/13);
     add(e,i%4===0?'shard':'spark',e.x,e.y,Math.cos(a)*v,Math.sin(a)*v,plan.pitch*(i%4===0?.10:.055),e.peak+i%3*22,500+i%5*68,i%3?'#ffe3a0':'#ffac4f',i+seed);
    }
    if(tier!=='low')for(let i=0;i<Math.round(7*density);i++){
     const a=i*2.4+seed;add(e,'smoke',e.x+Math.cos(a)*plan.pitch*.25,e.y+Math.sin(a)*plan.pitch*.18,Math.cos(a)*radius*.32,-plan.pitch*(.25+i%3*.13),plan.pitch*(.56+i%3*.08),e.peak+95+i*27,Math.min(730,e.end-e.peak-95),'#abb2a3',i+seed);
    }
   }else if(e.type==='rocket'){
    for(const sign of [-1,1]){
     const distance=sign<0?(e.axis==='h'?e.x:e.y):(e.axis==='h'?plan.width-e.x:plan.height-e.y);
     const n=Math.max(4,Math.round(16*density));
     for(let i=0;i<n;i++){
      const u=i/n,f=.65*u+.35*u*u,delta=sign*distance*f,j=((i*13+seed)%9-4)*plan.pitch*.025;
      add(e,'spark',e.x+(e.axis==='h'?delta:j),e.y+(e.axis==='v'?delta:j),e.axis==='h'?-sign*plan.pitch*.5:j*3,e.axis==='v'?-sign*plan.pitch*.5:j*3,plan.pitch*.055,e.peak+u*(e.travelEnd-e.peak),500,'#ffe8b1',i+seed);
     }
    }
   }else{
    const n=Math.max(5,Math.round((e.type==='prism'?34:17)*density));
    for(let i=0;i<n;i++){
     const a=i*2.399+seed,r=plan.pitch*(e.type==='prism'?1.4:.6);
     add(e,'star',e.x+Math.cos(a)*r,e.y+Math.sin(a)*r,Math.cos(a)*r*.5,-plan.pitch*.18+Math.sin(a)*r*.5,plan.pitch*.085,e.start+i%5*53,Math.min(1100,e.end-e.start),colors[i%6],i+seed);
    }
   }
  }
  for(const h of plan.hits){
   const n=h.obstacle?Math.round(6*density):Math.max(1,Math.round(2*density));
   for(let i=0;i<n;i++){
    const a=i*2.399+h.index,ice=h.obstacle==='ice',wood=h.obstacle==='wood';
    out.push({type:i%3===2?'spark':'shard',x:h.x,y:h.y,vx:Math.cos(a)*plan.pitch*.42,vy:Math.sin(a)*plan.pitch*.35-plan.pitch*.13,size:plan.pitch*(h.obstacle?.075:.065),born:h.at+i*8,life:430+i%3*35,color:ice?'#c3f5ff':wood?'#d8b17a':h.color,seed:i+h.index,gravity:plan.pitch*.37});
   }
  }
  return out.sort((a,b)=>a.born-b.born);
 }
 function renderMatch(ctx,e,t,pitch){
  const charge=clamp((t-e.start)/(e.peak-e.start)),after=clamp((t-e.peak)/(e.end-e.peak));
  if(t<e.peak){
   glow(ctx,e.x,e.y,pitch*(.39+.19*charge),e.color,.10+.23*charge);
   const r=pitch*(.37+.045*charge);ctx.save();ctx.globalAlpha=.18+.55*charge;ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(1,pitch*.026);
   ctx.beginPath();for(let n=0;n<=8;n++){const a=n*TAU/8+Math.PI/8;n?ctx.lineTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r):ctx.moveTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r);}ctx.stroke();ctx.restore();
   star(ctx,e.x+pitch*(.28-.11*charge),e.y-pitch*.26,pitch*(.04+.045*charge),'#fff8dc',charge*.8,.8*charge);return;
  }
  const fade=Math.pow(1-after,1.7),radius=pitch*(.19+.44*out(after));
  glow(ctx,e.x,e.y,radius,e.color,fade*.44);
  ctx.save();ctx.globalAlpha=fade*.65;ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(.8,pitch*.025)*(1-after*.6);ctx.beginPath();
  for(let n=0;n<=6;n++){const a=n*TAU/6+Math.PI/6,r=radius*(n%2?.93:1);n?ctx.lineTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r):ctx.moveTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r);}ctx.stroke();ctx.restore();
 }
 function renderCalm(ctx,e,t,plan,url){
  const charge=clamp((t-e.start)/Math.max(1,e.peak-e.start)),after=clamp((t-e.peak)/Math.max(1,e.end-e.peak));
  const alpha=t<e.peak?.10+.22*charge:.42*Math.sin(Math.PI*(.2+.8*after)),pitch=plan.pitch;
  const color=e.type==='match'?e.color:e.type==='rocket'?'#a1e9e3':e.type==='rainbow'||e.type==='prism'?'#bca4ff':'#ffdf94';
  glow(ctx,e.x,e.y,pitch*.64,color,alpha);
  if(e.type==='creation')return;
  if(t<e.peak){
   if(e.ghost){const path=e.type==='rocket'?(e.axis==='v'?'match3/specials/rocket_vertical.png':'match3/specials/rocket_horizontal.png'):'match3/specials/bomb.png';sprite(ctx,image(path,url),e.x,e.y,pitch*.75,0,clamp(charge*3));}return;
  }
  if(e.type==='rocket'){
   ctx.save();ctx.globalAlpha=(1-after)*.28;ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.4,pitch*.035);ctx.lineCap='round';ctx.beginPath();
   ctx.moveTo(e.axis==='h'?0:e.x,e.axis==='h'?e.y:0);ctx.lineTo(e.axis==='h'?plan.width:e.x,e.axis==='h'?e.y:plan.height);ctx.stroke();ctx.restore();
  }else if(e.type==='rainbow'||e.type==='prism')sprite(ctx,image('match3/specials/rainbow.png',url),e.x,e.y,pitch*.90,0,(1-after)*.7);
 }
 function renderBomb(ctx,e,t,pitch,tier,url){
  const radius=pitch*((e.radius??1)+.55),charge=clamp((t-e.start)/(e.peak-e.start));
  if(t<e.peak){
   const beat=.5+.5*Math.sin(charge*Math.PI*4);glow(ctx,e.x,e.y,pitch*(.45+.18*charge),'#ffcf74',.18+.23*charge);
   ctx.save();ctx.globalAlpha=.25+.4*charge;ctx.strokeStyle='#ffe1a0';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(e.x,e.y,pitch*(.65-.14*charge),-Math.PI/2,-Math.PI/2+TAU*charge);ctx.stroke();ctx.restore();
   star(ctx,e.x+pitch*.24,e.y-pitch*.4,pitch*(.06+.035*beat),'#fff1b8',t*.008,.75);
   if((e.short||e.ghost)&&url)sprite(ctx,image('match3/specials/bomb.png',url),e.x,e.y-pitch*.18*(1-out(charge)),pitch*(.69+.08*charge),Math.sin(charge*Math.PI*2)*.04,clamp(charge*4));return;
  }
  const span=e.end-e.peak,u=clamp((t-e.peak)/span),wave=out(clamp((t-e.peak)/(e.travelEnd-e.peak))),r=radius*(.14+.86*wave);
  const burn=clamp((1-u)/.34),body=pitch*(.28+.62*out(clamp(u*2.6)));
  ctx.save();ctx.globalAlpha=burn*.68;const fire=ctx.createRadialGradient(e.x,e.y,body*.05,e.x,e.y,body*1.16);
  fire.addColorStop(0,'#fff9d9');fire.addColorStop(.24,'#ffe5a0');fire.addColorStop(.56,'#ffc05e');fire.addColorStop(.80,'#e995424c');fire.addColorStop(1,'#cc704000');ctx.fillStyle=fire;
  ctx.beginPath();for(let n=0;n<=56;n++){const a=n/56*TAU,rr=body*(1+.16*Math.sin(a*7+e.seed+u*2));const x=e.x+Math.cos(a)*rr,y=e.y+Math.sin(a)*rr;n?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();ctx.restore();
  if(tier!=='low')for(let k=0;k<6;k++){
   const a=k*TAU/6+e.seed*.07,d=pitch*.47*wave;glow(ctx,e.x+Math.cos(a)*d,e.y+Math.sin(a)*d,pitch*(.2+.28*wave),'#ffc274',burn*.32);
  }
  glow(ctx,e.x,e.y,pitch*(.32+.32*wave),'#ffe6a9',burn*.72);
  for(let k=0;k<(tier==='low'?1:2);k++){
   const q=clamp(u-k*.1),a=(.88-.45*q)*clamp((1-u)/.22);if(q<=0||a<=.02)continue;
   ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=k?'#ffeebd':'#ffcf74';ctx.lineWidth=(k?1.3:2.8)*(1-q)+.6;
   ctx.beginPath();for(let n=0;n<=56;n++){const angle=n/56*TAU,rr=r*(k?.88:1)*(1+Math.sin(angle*9+e.seed)*.014);const x=e.x+Math.cos(angle)*rr,y=e.y+Math.sin(angle)*rr;n?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.restore();
  }
 }
 function renderRocket(ctx,e,t,plan,tier,url){
  const {pitch,width,height}=plan,vertical=e.axis==='v';
  if(t<e.peak){
   const u=clamp((t-e.start)/(e.peak-e.start));glow(ctx,e.x,e.y,pitch*.66,'#8dece8',u*.22);
   if(e.short||e.ghost){sprite(ctx,image(vertical?'match3/specials/rocket_vertical.png':'match3/specials/rocket_horizontal.png',url),e.x,e.y-pitch*.16*(1-out(u)),pitch*.70,0,clamp(u*4));}return;
  }
  const progress=clamp((t-e.peak)/(e.travelEnd-e.peak)),f=.65*progress+.35*progress*progress,fade=1-clamp((t-e.travelEnd)/(e.end-e.travelEnd));
  for(const sign of [-1,1]){
   const distance=sign<0?(vertical?e.y:e.x):(vertical?height-e.y:width-e.x),delta=sign*(distance+pitch*.30)*f;
   const x=e.x+(vertical?0:delta),y=e.y+(vertical?delta:0),length=Math.min(Math.abs(delta),pitch*2.5),tx=x-(vertical?0:sign*length),ty=y-(vertical?sign*length:0);
   if(length>0){
    const g=ctx.createLinearGradient(tx,ty,x+(vertical?0:sign*2),y+(vertical?sign*2:0));g.addColorStop(0,'#77e0dd00');g.addColorStop(.5,'#8ae4e452');g.addColorStop(.88,'#ffc969c4');g.addColorStop(1,'#fff3c6e8');
    const w=pitch*.115*(.7+.3*fade);ctx.save();ctx.globalAlpha=fade;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(x+(vertical?w:0),y+(vertical?0:w));ctx.lineTo(x-(vertical?w:0),y-(vertical?0:w));ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fff1c2';ctx.globalAlpha=fade*.7;ctx.lineWidth=Math.max(1,pitch*.026);ctx.beginPath();ctx.moveTo(lerp(tx,x,.5),lerp(ty,y,.5));ctx.lineTo(x,y);ctx.stroke();ctx.restore();
   }
   glow(ctx,x,y,pitch*.3,'#ffdb83',fade*.6);
   if(progress<.985){const path=vertical?'match3/specials/rocket_vertical.png':'match3/specials/rocket_horizontal.png',angle=vertical?(sign<0?0:Math.PI):(sign>0?0:Math.PI);sprite(ctx,image(path,url),x,y,pitch*(vertical?.49:.73),angle,fade);}
   if(tier!=='low'&&progress>.5){ctx.save();ctx.globalAlpha=fade*.14;ctx.strokeStyle='#a0ece5';ctx.lineWidth=pitch*.10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(x,y);ctx.stroke();ctx.restore();}
  }
 }
 function renderRainbow(ctx,e,t,plan,tier,url){
  const {pitch}=plan,charge=clamp((t-e.start)/(e.peak-e.start)),release=clamp((t-e.peak)/(e.end-e.peak)),fade=1-clamp((t-e.travelEnd)/(e.end-e.travelEnd));
  let x=e.x,y=e.y;
  if(e.partner!=null){const partner=plan.partnerPoints?.[e.partner];if(partner){const f=out(charge);x=lerp(e.x,(e.x+partner.x)/2,f);y=lerp(e.y,(e.y+partner.y)/2,f);}}
  const origin={x,y},r=pitch*(e.type==='prism'?.9:.69)*(1+.12*Math.sin(charge*Math.PI));
  glow(ctx,x,y,r*1.5,'#b598ff',(.15+.17*charge)*fade);
  for(let k=0;k<6;k++){
   ctx.save();ctx.globalAlpha=fade*.64;ctx.strokeStyle=colors[k];ctx.lineWidth=1.5+pitch*.018;ctx.beginPath();const a=t*.0015+k*TAU/6;ctx.arc(x,y,r,a,a+TAU/6*.7);ctx.stroke();ctx.restore();
  }
  sprite(ctx,image('match3/specials/rainbow.png',url),x,y,pitch*(e.type==='prism'?1.18:1.04)*(1+.055*Math.sin(charge*Math.PI)),Math.sin(charge*Math.PI)*.10,fade);
  const limit=tier==='high'?16:tier==='medium'?10:5;
  for(const [k,target]of (e.targets||[]).entries()){
   if(k%Math.max(1,Math.ceil(e.targets.length/limit))!==0)continue;
   const start=e.peak+Math.min(90,k*7),u=clamp((t-start)/Math.max(1,target.arrive-start));if(t<start)continue;
   const after=clamp((t-target.arrive)/350),alpha=(.25+.5*Math.sin(u*Math.PI/2))*(1-after)*fade;
   const p=drawLink(ctx,origin,target,target.bend,out(u),alpha,target.color,pitch);
   if(u<1){glow(ctx,p.x,p.y,pitch*.19,target.color,.80);star(ctx,p.x,p.y,pitch*.09,'#fff8d5',t*.003,.92);}
   else if(after<1){glow(ctx,target.x,target.y,pitch*.42,target.color,(1-after)*.55);star(ctx,target.x,target.y,pitch*.15*(1-after),'#fff9d8',t*.002,1-after);}
  }
  if(e.type==='prism'&&t>=e.peak){
   const rr=lerp(pitch*.9,Math.max(plan.width,plan.height)*.66,out(release));ctx.save();ctx.globalAlpha=Math.pow(1-release,2)*.55;ctx.lineWidth=2.5;
   for(let k=0;k<6;k++){ctx.strokeStyle=colors[k];ctx.beginPath();ctx.arc(x,y,rr,k*TAU/6,(k+1)*TAU/6-.02);ctx.stroke();}ctx.restore();
  }
 }
 function renderHammer(ctx,e,t,plan,url){
  const u=clamp((t-e.start)/(e.peak-e.start)),after=clamp((t-e.peak)/(e.end-e.peak)),side=e.x>plan.width*.6?-1:1;
   if(after<.30){const angle=side*(t<e.peak?lerp(-.8,.05,out(u)):.05+Math.sin(after*12)*.09),offset=plan.pitch*(t<e.peak?.25*(1-out(u)):0);sprite(ctx,image('match3/boosters/hammer.png',url),e.x+side*plan.pitch*.23,e.y+plan.pitch*.27-offset,plan.pitch*.95,angle,t<e.peak?clamp(u*5):1-after/.3);}
  if(t>=e.peak)renderBomb(ctx,{...e,radius:.12},t,plan.pitch,'low');
 }
 function renderParticles(ctx,list,time,cap){
  let count=0;
  // Prefer recent particles under pressure; smoke is the first decoration dropped.
  for(let i=list.length-1;i>=0&&count<cap;i--){
   const p=list[i],age=time-p.born;if(age<0||age>p.life)continue;count++;
   const u=age/p.life,drag=out(u),x=p.x+p.vx*drag,y=p.y+p.vy*drag+p.gravity*u*u,alpha=Math.sin(Math.min(1,u*6)*Math.PI/2)*Math.pow(1-u,1.25);
   if(p.type==='smoke'){const r=p.size*(.6+u*1.1);ctx.globalAlpha=alpha*.34;ctx.drawImage(texture('smoke',p.color),x-r,y-r,r*2,r*2);ctx.globalAlpha=1;}
   else if(p.type==='star')star(ctx,x,y,p.size*(.8+.2*(1-u)),p.color,p.seed+u*2,alpha);
   else if(p.type==='shard'){
    const r=p.size*(1-u*.65);ctx.save();ctx.translate(x,y);ctx.rotate(p.seed+u*3);ctx.globalAlpha=alpha;ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(r*.6,0);ctx.lineTo(0,r*.75);ctx.lineTo(-r*.65,0);ctx.closePath();ctx.fill();ctx.fillStyle='#fff9d5';ctx.globalAlpha=alpha*.65;ctx.beginPath();ctx.moveTo(0,-r);ctx.lineTo(0,r*.6);ctx.lineTo(-r*.6,0);ctx.closePath();ctx.fill();ctx.restore();
   }else{
    glow(ctx,x,y,p.size*2,p.color,alpha*.4);ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(.8,p.size*.35);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-p.vx*.04*(1-u),y-p.vy*.04*(1-u));ctx.stroke();ctx.restore();
   }
  }
  return count;
 }
 function play(host,plan,options={}){
  const {url,onHit=()=>{},onTransform=()=>{},onCue=()=>{},tier=()=> 'medium'}=options;
  const canvas=document.createElement('canvas');canvas.className='fx-canvas';canvas.setAttribute('aria-hidden','true');host.append(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)canvas.remove();
  const quality=tier(),particles=reducedQuery.matches?[]:makeParticles(plan,quality),cueTimes=new Map();
  let time=0,last=performance.now(),frame=0,hitCursor=0,transformCursor=0,cueCursor=0,ended=false,peakParticles=0,frames=0,longFrames=0,resolve,reject;
  const finished=new Promise((a,b)=>{resolve=a;reject=b;});
  function dispose(cancel=false){if(ended)return;ended=true;cancelAnimationFrame(frame);canvas.remove();jobs.delete(job);const detail={kind:plan.kind,cancelled:cancel,duration:time,plannedDuration:plan.duration,frames,longFrames,peakParticles,fallback:!ctx,reduced:reducedQuery.matches};host.dispatchEvent(new CustomEvent('gardenfx:end',{detail}));resolve(detail);}
  function draw(){
   if(!ctx)return;
   canvas.style.opacity=String(clamp((plan.duration-time)/150));
   const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight),q=tier(),dpr=Math.min(q==='low'?1:2,devicePixelRatio||1);
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   ctx.setTransform(canvas.width/plan.width,0,0,canvas.height/plan.height,0,0);ctx.clearRect(0,0,plan.width,plan.height);
   if(plan.links?.length){
    const peak=plan.effects[0].peak,u=clamp(time/peak),fade=1-clamp((time-peak)/180);
    ctx.save();ctx.lineWidth=Math.max(1.4,plan.pitch*.036);ctx.lineCap='round';ctx.globalAlpha=(.12+.38*u)*fade;
    for(const link of plan.links){ctx.strokeStyle=link.color;ctx.beginPath();ctx.moveTo(link.a.x,link.a.y);ctx.lineTo(link.b.x,link.b.y);ctx.stroke();}ctx.restore();
   }
   for(const e of plan.effects){if(time<e.start||time>e.end)continue;
    if(reducedQuery.matches)renderCalm(ctx,e,time,plan,url);
    else if(e.type==='match')renderMatch(ctx,e,time,plan.pitch);
    else if(e.type==='rocket')renderRocket(ctx,e,time,plan,q,url);
    else if(e.type==='rainbow'||e.type==='prism')renderRainbow(ctx,e,time,plan,q,url);
    else if(e.type==='hammer')renderHammer(ctx,e,time,plan,url);
    else if(e.type==='creation'){const u=clamp((time-e.start)/(e.end-e.start));glow(ctx,e.x,e.y,plan.pitch*(.35+.55*out(u)),'#ffd986',Math.sin(u*Math.PI)*.35);for(let k=0;k<5;k++){const a=k*TAU/5+u*.4;star(ctx,e.x+Math.cos(a)*plan.pitch*(.42+u*.35),e.y+Math.sin(a)*plan.pitch*(.42+u*.35),plan.pitch*.08,colors[k],u,.9*Math.sin(u*Math.PI));}}
    else renderBomb(ctx,e,time,plan.pitch,q,url);
   }
   for(const h of plan.hits){const u=(time-h.at)/310;if(u<0||u>1)continue;const a=Math.pow(1-u,2)*.35;glow(ctx,h.x,h.y,plan.pitch*.42,h.color,a);}
   if(!reducedQuery.matches)peakParticles=Math.max(peakParticles,renderParticles(ctx,particles,time,budgets[q]));
  }
  function tick(now){
   frame=0;if(ended||suspended)return;
   try{
    const delta=now-last;last=now;if(delta>40)longFrames++;time+=Math.min(delta,50);frames++;
    while(transformCursor<plan.transforms.length&&plan.transforms[transformCursor].at<=time){onTransform(plan.transforms[transformCursor++].index);}
    while(cueCursor<plan.cues.length&&plan.cues[cueCursor].at<=time){const cue=plan.cues[cueCursor++],prev=cueTimes.get(cue.name)??-1000;if(time-prev>=140){cueTimes.set(cue.name,time);onCue(cue.name,cue);}}
    while(hitCursor<plan.hits.length&&plan.hits[hitCursor].at<=time){const h=plan.hits[hitCursor++];onHit(h.index,h);}
    draw();if(time>=plan.duration)dispose();else frame=requestAnimationFrame(tick);
   }catch(e){ended=true;cancelAnimationFrame(frame);canvas.remove();jobs.delete(job);reject(e);}
  }
  const job={pause(value){cancelAnimationFrame(frame);frame=0;if(!value&&!ended){last=performance.now();frame=requestAnimationFrame(tick);}},cancel:()=>dispose(true)};
  jobs.add(job);host.dispatchEvent(new CustomEvent('gardenfx:start',{detail:{kind:plan.kind,duration:plan.duration,effects:plan.effects.length,hits:plan.hits.length}}));draw();if(!suspended)frame=requestAnimationFrame(tick);
  return finished;
 }
 function suspend(value){value=!!value;if(suspended===value)return;suspended=value;for(const job of jobs)job.pause(value);}
 function cancel(){for(const job of [...jobs])job.cancel();}
 window.GardenFX=Object.freeze({createPlan,play,preload,suspend,cancel,budgets,active:()=>jobs.size});
})();
