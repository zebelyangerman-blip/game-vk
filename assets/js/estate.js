/* A single garden coordinate system: 1000 x 680. Ground routes, anchors and depth
   belong to the scene, rather than to independent task thumbnails. */
(() => {
 'use strict';
 const NS='http://www.w3.org/2000/svg',W=1000,H=680;
 const backdrops='assets/estate/world-backdrop.webp';
 let serial=0;
 const layouts={
  1:{house:[500,418,405],plaza:[755,535,123,40],routes:['M500 700 L500 560 Q500 515 500 418','M500 575 Q615 554 755 535','M500 575 Q400 580 305 559'],fence:[[[65,452],[285,452]],[[715,452],[935,452]],[[70,622],[423,622]],[[577,622],[930,622]],[[65,452],[70,622]],[[935,452],[930,622]]],spots:{clean_fountain:[[755,532,165]],revive_garden:[[217,594,188],[798,640,190]],restore_bench:[[305,568,140]],light_porch:[[416,547,43],[584,547,43]],revive_trees:[[125,431,155],[872,431,150]]}},
  2:{distant:[770,290,175],plaza:[470,478,147,47],routes:['M500 700 Q470 610 515 550 Q575 490 470 478','M515 550 Q670 548 795 558','M515 550 Q355 565 210 594'],spots:{revive_trees:[[470,445,220],[115,472,151]],bush:[[230,540,135],[700,478,126]],revive_garden:[[275,651,192],[789,657,200]],restore_bench:[[796,564,154]],light_porch:[[670,564,46],[320,578,44]],sign:[[533,637,58]]}},
  3:{house:[500,448,480],plaza:[500,525,120,37],routes:['M500 700 L500 525 L500 448','M500 585 Q382 602 270 616','M500 585 Q657 594 792 608'],fence:[[[72,479],[261,479]],[[739,479],[928,479]],[[72,479],[80,642]],[[928,479],[920,642]],[[80,642],[386,642]],[[614,642],[920,642]]],spots:{bush:[[207,551,140],[795,551,140]],revive_garden:[[795,652,202]],light_porch:[[386,575,46],[614,575,46]],restore_bench:[[269,625,170]],ivy:[[320,401,60],[680,406,58]]}},
  4:{distant:[500,285,185],plaza:[505,541,270,85],routes:['M505 700 L505 590','M190 570 Q505 690 835 570','M505 486 L505 295'],fence:[[[75,438],[290,438]],[[710,438],[925,438]],[[75,438],[80,610]],[[925,438],[920,610]]],spots:{clean_fountain:[[505,514,236]],revive_garden:[[214,650,208],[765,650,208]],restore_bench:[[822,558,148]],light_porch:[[181,526,45],[826,526,45]],revive_trees:[[869,425,143]],bush:[[197,490,130],[715,459,127]]}},
  5:{distant:[500,277,150],plaza:[497,563,251,76],routes:['M497 700 L497 613','M497 617 Q640 609 800 599','M497 493 L497 285'],fence:[[[65,433],[273,433]],[[727,433],[935,433]],[[65,433],[65,590]],[[935,433],[935,590]]],spots:{clean_fountain:[[497,537,266]],pond:[[800,588,212]],revive_garden:[[196,644,215]],restore_bench:[[783,662,163]],light_porch:[[266,548,48],[712,548,48]],bush:[[817,451,135]],revive_trees:[[142,417,153]]}},
  6:{house:[566,406,365],plaza:[505,508,332,91],terrace:true,routes:['M505 700 L505 593 Q505 525 566 406'],spots:{balustrade:[[222,573,220],[785,573,220]],restore_bench:[[242,529,168]],bush:[[821,544,151]],light_porch:[[784,470,49],[304,477,46]],revive_garden:[[224,650,210],[754,650,199]],ivy:[[407,382,57],[723,369,49]]}},
  7:{distant:[765,280,170],plaza:[250,535,88,29],routes:['M234 700 Q163 626 220 570 Q252 532 316 501','M234 640 Q511 684 796 603'],spots:{pond:[[532,554,465]],bush:[[826,497,158]],rocks:[[733,597,157],[375,575,106]],revive_trees:[[114,471,176]],revive_garden:[[816,656,200]],light_porch:[[862,565,45]],restore_bench:[[255,540,166]],sign:[[174,656,56]]}},
  8:{distant:[770,279,165],plaza:[508,566,236,70],pergola:true,routes:['M508 700 L508 618','M508 609 Q376 599 244 568','M508 609 Q652 604 798 576'],fence:[[[80,445],[287,445]],[[713,445],[920,445]],[[920,445],[922,612]]],spots:{restore_bench:[[508,513,229]],clean_fountain:[[243,548,165]],bush:[[792,572,151]],light_porch:[[361,555,48],[655,555,48]],revive_garden:[[789,652,207],[213,649,198]],revive_trees:[[116,425,143]]}},
  9:{distant:[768,270,156],plaza:[501,493,158,51],routes:['M501 700 Q653 676 650 582 Q644 524 578 505','M650 582 Q728 587 800 561','M650 609 Q408 669 241 618'],spots:{revive_trees:[[499,453,218],[115,491,151]],revive_garden:[[469,612,264],[807,656,196]],bush:[[223,522,153]],clean_fountain:[[800,548,180]],restore_bench:[[241,627,161]],light_porch:[[723,571,44],[636,641,45]]}},
 10:{house:[500,414,425],plaza:[500,517,112,35],routes:['M500 700 L500 414','M500 573 Q654 565 793 541'],fence:[[[60,443],[282,443]],[[718,443],[940,443]],[[60,443],[67,624]],[[940,443],[933,624]],[[67,624],[373,624]],[[627,624],[933,624]]],spots:{gate:[[500,639,254]],clean_fountain:[[793,536,180]],revive_trees:[[120,425,161],[884,425,151]],revive_garden:[[230,590,218],[790,646,208]],light_porch:[[408,547,45],[592,547,45]]}}
 };
 function el(tag,cls){const n=document.createElement(tag);if(cls)n.className=cls;return n;}
 function svg(tag,attrs={},parent){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(parent)parent.append(n);return n;}
 function img(path){const n=el('img');n.src=window.GardenAssets.url(path);n.alt='';n.draggable=false;return n;}
 function animate(n,frames,options){
  if(!n?.animate||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  n.getAnimations().filter(a=>a.__gardenEstateMotion).forEach(a=>a.cancel());
  const a=n.animate(frames,{duration:1100,easing:'cubic-bezier(.17,.75,.27,1)',...options});a.__gardenEstateMotion=true;a.finished.catch(()=>{});return a;
 }
 function temporary(n,motion){if(motion)motion.finished.then(()=>n.remove()).catch(()=>n.remove());else n.remove();}
 function dismiss(scene){scene.querySelector('.estate-inspect')?.remove();scene.querySelectorAll('.object-inspected').forEach(n=>n.classList.remove('object-inspected'));delete scene.dataset.activeTask;}
 function interact(scene,n,task,options,built,keyboard=false){
  dismiss(scene);scene.dataset.activeTask=task.id;n.classList.add('object-inspected');
  const role=task.role,target=n.querySelector('.object-art');
  if(built&&['revive_trees','revive_garden','bush'].includes(role))animate(target,[{transform:'rotate(0)'},{transform:'rotate(-2deg)',offset:.25},{transform:'rotate(1.5deg)',offset:.62},{transform:'rotate(0)'}],{duration:1150,easing:'ease-in-out'});
  else if(built)animate(target,[{filter:'brightness(1)'},{filter:'brightness(1.15)',offset:.3},{filter:'brightness(1)',offset:1}],{duration:1150});
  if(built&&['clean_fountain','pond'].includes(role)){
   const water=n.querySelector('.fountain-water,.pond-water');if(water)water.querySelectorAll('.tap-water-ripple').forEach(r=>{r.getAnimations().forEach(a=>a.cancel());r.remove();});if(water)for(let k=0;k<3;k++){
    const ripple=el('i','tap-water-ripple');water.append(ripple);
    const motion=animate(ripple,[{transform:'scale(.15)',opacity:0},{transform:'scale(.5)',opacity:.9,offset:.22},{transform:'scale(1.4)',opacity:0}],{duration:1200,delay:k*110});temporary(ripple,motion);
   }
  }
  options.onInteract?.(task,built);
  const card=el('div','estate-inspect');card.setAttribute('role','group');card.setAttribute('aria-label',task.title);card.addEventListener('click',e=>e.stopPropagation());
  const copy=el('div','estate-inspect-copy'),title=el('b'),note=el('small');title.textContent=task.title;
  const selected=task.styles?.[(options.styles[task.id]||1)-1];note.textContent=built?(selected?.name||'Восстановлено'):task.desc;copy.append(title,note);card.append(copy);
  if(!built||task.styles){const action=el('button','estate-inspect-action');action.type='button';action.textContent=built?'Стиль':'К задаче';action.addEventListener('click',()=>{dismiss(scene);options.onChoose?.(task);});card.append(action);}
  const close=el('button','estate-inspect-close');close.type='button';close.setAttribute('aria-label','Закрыть сведения об объекте');close.textContent='×';close.addEventListener('click',()=>{dismiss(scene);n.focus({preventScroll:true});});card.append(close);scene.append(card);
  animate(card,[{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:210});
  if(keyboard)card.querySelector('button')?.focus({preventScroll:true});
 }
 function render(scene,options){
  const {zone,tasks,done,styles,unlocked=true,preview=false,onChoose}=options,c=layouts[zone.id]||layouts[1],complete=new Set(done);
  const prefix='estate'+(++serial)+'-',count=tasks.filter(t=>complete.has(t.id)).length;
  scene.replaceChildren();scene.className=preview?'estate-preview-scene':'estate-scene composed-scene';
  scene.dataset.zone=zone.id;scene.dataset.progress=count;scene.dataset.zoneTheme=zone.theme;
  scene.dataset.lightsOn=String(options.lightsOn!==false);
  if(!preview){scene.onclick=e=>{if(!e.target.closest('.estate-object,.estate-inspect,.scene-light-toggle'))dismiss(scene);};scene.onkeydown=e=>{if(e.key==='Escape'&&scene.querySelector('.estate-inspect')){e.preventDefault();e.stopPropagation();const active=scene.querySelector('.object-inspected');dismiss(scene);active?.focus({preventScroll:true});}};}
  scene.style.setProperty('--estate-progress',count/10);
  const world=el('div','estate-world');world.setAttribute('aria-hidden',preview?'true':'false');scene.append(world);
  const backdrop=el('div','estate-backdrop');backdrop.style.backgroundImage=`url("${window.GardenAssets.url(backdrops.slice(7))}")`;world.append(backdrop);
  const ground=svg('svg',{viewBox:`0 0 ${W} ${H}`,class:'estate-ground',preserveAspectRatio:'none','aria-hidden':'true'},world);
  const defs=svg('defs',{},ground);
  const shade=svg('radialGradient',{id:prefix+'shadow'},defs);svg('stop',{offset:0,'stop-color':'#153820','stop-opacity':'.3'},shade);svg('stop',{offset:1,'stop-color':'#153820','stop-opacity':0},shade);
  const stone=svg('linearGradient',{id:prefix+'stone',x2:0,y2:1},defs);svg('stop',{offset:0,'stop-color':'#e9d8ad'},stone);svg('stop',{offset:1,'stop-color':'#bca979'},stone);
  const soil=svg('radialGradient',{id:prefix+'soil'},defs);svg('stop',{offset:0,'stop-color':'#756248'},soil);svg('stop',{offset:'.8','stop-color':'#7f7351'},soil);svg('stop',{offset:1,'stop-color':'#879552','stop-opacity':0},soil);
  const pathTask=tasks.find(t=>t.role==='repair_path'),pathBuilt=pathTask&&complete.has(pathTask.id),pathStyle=styles[pathTask?.id]||1;
  const pattern=svg('pattern',{id:prefix+'pavers',patternUnits:'userSpaceOnUse',width:pathStyle===3?33:54,height:pathStyle===3?22:35},defs);
  const colors=pathStyle===2?['#ad6245','#c88358','#d39465']:pathStyle===3?['#a7a69a','#c3c3ab','#8e9b91']:['#ddd2ab','#c9be98','#eee0b4'];
  svg('rect',{width:60,height:40,fill:pathStyle===2?'#8c6149':'#8b9070'},pattern);
  if(pathStyle===2){for(let y=0;y<2;y++)for(let x=-1;x<3;x++)svg('rect',{x:x*27+(y%2?14:0)+1,y:y*17.5+1,width:25,height:15.5,rx:2,fill:colors[(x+y+4)%3],stroke:'#e6b785','stroke-width':'.7'},pattern);}
  else if(pathStyle===3){for(let y=0;y<2;y++)for(let x=0;x<3;x++)svg('rect',{x:x*11+(y%2?5:0),y:y*11,width:10,height:10,rx:3,fill:colors[(x+y)%3],stroke:'#d1d0b5','stroke-width':'.5'},pattern);}
  else{for(const [d,i]of [['M1 1L25 2L22 18L4 17Z',0],['M27 1L53 0L51 16L26 18Z',1],['M0 20L20 19L28 33L1 35Z',2],['M24 20L51 18L54 33L31 34Z',0]])svg('path',{d,fill:colors[i],stroke:'#f5e7be','stroke-width':1},pattern);}
  // A route is laid once as connected ground geometry. It cannot end at a PNG edge.
  const routes=svg('g',{'data-task':pathTask?.id||'route',class:'estate-route'+(pathBuilt?' restored':' weathered')},ground);
  for(const d of c.routes){
   svg('path',{d,fill:'none',stroke:pathBuilt?'#42532c':'#70894d','stroke-width':69,'stroke-linecap':'round','stroke-linejoin':'round',opacity:'.28',transform:'translate(1,6)'},routes);
   svg('path',{d,fill:'none',stroke:pathBuilt?'#eadbb0':'#829258','stroke-width':63,'stroke-linecap':'round','stroke-linejoin':'round'},routes);
   svg('path',{d,fill:'none',stroke:pathBuilt?`url(#${prefix}pavers)`:'#9c986d','stroke-width':57,'stroke-linecap':'round','stroke-linejoin':'round',class:'laid-path'},routes);
  }
  if(c.plaza){
   const [x,y,rx,ry]=c.plaza,p=svg('g',{class:'estate-plaza'},ground);
   svg('ellipse',{cx:x+2,cy:y+5,rx:rx+7,ry:ry+6,fill:'#345637',opacity:'.27'},p);
   svg('ellipse',{cx:x,cy:y,rx,ry,fill:pathBuilt?`url(#${prefix}pavers)`:'#9b9b70',stroke:pathBuilt?'#e6d8b0':'#899363','stroke-width':7},p);
   svg('ellipse',{cx:x,cy:y,rx:rx-12,ry:ry-9,fill:'none',stroke:pathBuilt?'#a79c75':'#848d5e','stroke-width':2,opacity:'.65'},p);
  }
  if(c.terrace){
   const t=tasks.find(t=>t.role==='balustrade');
   for(let k=0;k<3;k++)svg('path',{d:`M440 ${577+k*9} Q505 ${593+k*9} 569 ${577+k*9}`,fill:'none',stroke:complete.has(t?.id)?'#dfd4b3':'#9d957c','stroke-width':7,opacity:'.9'},ground);
  }
  const objects=[];const occurrence={};
  function add(task,path,spot,extra={}){if(!spot)return;objects.push({task,path,spot,...extra});}
  for(const task of tasks){
   const n=occurrence[task.role]||0;occurrence[task.role]=n+1;
   const path=task.art[(styles[task.id]||1)-1]||task.art[0];
   if(task.role==='clear_yard'||task.role==='restore_windows'||task.role==='repair_path')continue;
   if(task.role==='wash_facade'){add(task,path,c.house,{hero:true});continue;}
   if(task.role==='repair_fence'){
    const built=complete.has(task.id);
    for(const [a,b]of c.fence||[]){
     const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),sections=Math.max(1,Math.ceil(len/112));
     if(Math.abs(dy)>70){
      // Perspective rails follow the boundary while every post remains upright.
      const end=[b[0]+(a[0]<500?38:-38),b[1]],side=svg('g',{'data-task':task.id,class:'estate-side-fence'+(built?'':' neglected')},ground),style=styles[task.id]||1;
      const color=style===3?'#33413a':style===2?'#ecebd3':'#c5c3aa',edge=style===3?'#bbaf6d':'#fbf3d9';
      for(const h of [17,46])svg('path',{d:`M${a[0]} ${a[1]-h*.85} L${end[0]} ${end[1]-h}`,stroke:'#617049','stroke-width':style===3?5:11,fill:'none','stroke-linecap':'round'},side);
      for(const h of [20,49])svg('path',{d:`M${a[0]} ${a[1]-h*.85} L${end[0]} ${end[1]-h}`,stroke:color,'stroke-width':style===3?3:7,fill:'none','stroke-linecap':'round'},side);
      const posts=style===2?12:style===3?10:6;
      for(let k=0;k<=posts;k++){
       const f=k/posts,x=a[0]+(end[0]-a[0])*f,y=a[1]+dy*f,height=51*(.85+f*.15),width=style===3?3:style===2?7:10;
       svg('path',{d:`M${x-width/2} ${y} L${x-width/2} ${y-height+7} L${x} ${y-height} L${x+width/2} ${y-height+7} L${x+width/2} ${y} Z`,fill:color,stroke:edge,'stroke-width':'.8'},side);
       if(style===1)svg('rect',{x:x-7,y:y-height+2,width:14,height:4,fill:edge,rx:1},side);
       if(style===3)svg('circle',{cx:x,cy:y-height,r:2,fill:edge},side);
      }
      continue;
     }
     for(let j=0;j<sections;j++)add(task,path,[a[0]+dx*(j+.5)/sections,a[1]+dy*(j+.5)/sections,len/sections+9],{angle:Math.atan2(dy,dx)*180/Math.PI,section:j,rail:true,built});
    }
    continue;
   }
   const spots=c.spots[task.role]||[];
   const multi=tasks.filter(t=>t.role===task.role).length>1;
   for(const p of multi?[spots[n]].filter(Boolean):spots)add(task,path,p,{hero:task.role==='pond'||task.role==='clean_fountain'});
  }
  const houseTask=tasks.find(t=>t.role==='wash_facade'),windows=tasks.find(t=>t.role==='restore_windows');
  if(c.distant)add(null,'estate/house_stone_elegant.png',c.distant,{distant:true,hero:true});
  if(zone.id===3){add(null,'estate/tree_round_green.png',[90,410,138],{distant:true});add(null,'estate/tree_conifer.png',[899,408,91],{distant:true});}
  if(c.pergola){
   const built=tasks.filter(t=>complete.has(t.id)).length>=3;
   const p=svg('g',{class:'estate-pergola','data-task':tasks.find(t=>t.role==='restore_bench')?.id},ground);
   svg('path',{d:'M363 508L363 357Q502 288 650 357L650 508',fill:'none',stroke:built?'#d9c596':'#8e9271','stroke-width':17,'stroke-linejoin':'round'},p);
   svg('path',{d:'M363 358Q502 306 650 358M358 378Q502 322 655 378',fill:'none',stroke:built?'#efdeaf':'#aaa385','stroke-width':7},p);
   for(let k=0;k<7;k++)svg('path',{d:`M${365+k*47} 341L${365+k*47} 371`,stroke:built?'#bda574':'#838866','stroke-width':5},p);
   if(count>=6){svg('path',{d:'M373 384Q505 433 640 384',fill:'none',stroke:'#735b35','stroke-width':2},p);for(let k=0;k<8;k++)svg('circle',{cx:383+k*35,cy:391+Math.sin(k/7*Math.PI)*26,r:4,fill:'#ffe7a0',class:preview?'':'estate-bulb'},p);}
  }
  // Roots, beds and cast shadows are drawn on the same ground plane as the paths.
  for(const o of objects){
   const [x,y,w]=o.spot,built=!o.task||complete.has(o.task.id),role=o.task?.role;
   if(role==='revive_trees'||role==='bush'||role==='revive_garden'||role==='rocks'){
    const soilPatch=svg('ellipse',{cx:x,cy:y-2,rx:w*.49,ry:w*.085,fill:`url(#${prefix}soil)`,opacity:built?'.92':'.7'},ground);soilPatch.dataset.task=o.task.id;
   }
   svg('ellipse',{cx:x+w*.075,cy:y+1,rx:w*(o.rail?.4:.46),ry:w*(o.rail?.048:.079),fill:`url(#${prefix}shadow)`,opacity:o.distant?.4:built?1:.68},ground);
  }
  objects.sort((a,b)=>a.spot[1]-b.spot[1]);
  for(const o of objects){
   const [x,y,w]=o.spot,built=!o.task||complete.has(o.task.id),role=o.task?.role||'distant';
   const n=el(o.task&&!preview&&unlocked?'button':'div','estate-object object-'+role+(built?' built':' neglected')+(o.rail?' fence-section':'')+(o.distant?' distant-object':''));
   if(n.tagName==='BUTTON')n.type='button';if(o.task)n.dataset.task=o.task.id;
   n.dataset.role=role;n.style.setProperty('--section',o.section||0);
   Object.assign(n.style,{left:x/W*100+'%',top:y/H*100+'%',width:w/W*100+'%',zIndex:Math.round(y)+10});
   if(o.angle)n.style.setProperty('--object-angle',o.angle+'deg');
   const graphic=el('span','object-art');graphic.append(img(o.path));n.append(graphic);
   if(o.task){n.setAttribute('aria-label',o.task.title+(built?'':' — предстоит восстановить'));if(!preview&&unlocked){n.title=o.task.title;n.addEventListener('click',e=>{e.stopPropagation();interact(scene,n,o.task,options,built,e.detail===0);});}}
   else n.setAttribute('aria-hidden','true');
   if(role==='light_porch'&&built){graphic.append(el('span','estate-lamp-glow'));}
   if((role==='pond'||role==='clean_fountain')&&built){
    const water=el('span',role==='pond'?'pond-water':'fountain-water');for(let k=0;k<2;k++){const ripple=el('i','water-ripple');ripple.style.setProperty('--ripple-delay',k*.9+'s');water.append(ripple);}graphic.append(water);
    if(role==='clean_fountain')graphic.append(el('span','fountain-glint'));
   }
   if(o.task===houseTask&&windows&&complete.has(windows.id)){
    const kind=styles[houseTask.id]||1,lights=el('span','estate-window-lights window-tone-'+(styles[windows.id]||1));
    const positions=kind===1?[[26,56],[49,52],[74,55],[29,71],[71,72]]:kind===2?[[30,52],[48,52],[69,52],[31,70],[69,70]]:[[30,52],[52,49],[75,55],[29,70],[52,69],[73,73]];
    for(const [lx,ly]of positions){const l=el('i');l.style.left=lx+'%';l.style.top=ly+'%';lights.append(l);}graphic.append(lights);
   }
   world.append(n);
  }
  const clearTask=tasks.find(t=>t.role==='clear_yard'),clean=complete.has(clearTask?.id);
  if(!clean){
   const clutter=el('div','estate-clutter');clutter.dataset.task=clearTask?.id||'';
   for(const [p,x,y,w]of [['estate/debris_pile.png',480,618,159],['estate/grass_tuft.png',324,521,67],['estate/grass_tuft.png',628,498,70],['estate/grass_tuft.png',180,613,86],['estate/grass_tuft.png',832,625,91]]){
    const n=el('span','estate-debris');Object.assign(n.style,{left:x/W*100+'%',top:y/H*100+'%',width:w/W*100+'%'});n.append(img(p));clutter.append(n);
   }
   world.append(clutter);
  }
  if(count>=5&&!preview){
   for(const [p,x,y,w,cls]of [['estate/butterfly_orange.png',710,432,23,'estate-butterfly'],['estate/bird_blue.png',310,379,25,'estate-bird']]){
    const n=el('span',cls);Object.assign(n.style,{left:x/W*100+'%',top:y/H*100+'%',width:w/W*100+'%'});n.setAttribute('aria-hidden','true');n.append(img(p));world.append(n);
   }
  }
  if(!preview){
   const badge=el('div','scene-badge');badge.textContent=zone.id+' / 10 · '+zone.title;scene.append(badge);
   const light=el('div','estate-light');light.setAttribute('aria-hidden','true');world.append(light);
   if(unlocked&&(tasks.some(t=>complete.has(t.id)&&['light_porch','restore_windows'].includes(t.role))||c.pergola&&count>=6)){
    const button=el('button','scene-light-toggle');button.type='button';button.textContent='✦ Свет';
    const update=value=>{scene.dataset.lightsOn=String(value);button.setAttribute('aria-pressed',String(value));button.title=value?'Выключить свет в окнах и фонарях':'Включить свет в окнах и фонарях';button.setAttribute('aria-label',button.title);};update(options.lightsOn!==false);
    button.addEventListener('click',e=>{e.stopPropagation();const value=scene.dataset.lightsOn!=='true';update(value);options.onLights?.(value);});scene.append(button);
   }
   if(!unlocked){const cover=el('div','zone-lock');cover.append(img('match3/ui/lock.png'));const p=el('p');p.textContent='Откроется на уровне '+zone.unlockLevel;cover.append(p);scene.append(cover);}
  }
  return scene;
 }
 function reveal(scene,task){
  if(!task)return;
  const pieces=[...scene.querySelectorAll('[data-task="'+task.id+'"]')];
  const role=task.role;
  if(role==='clear_yard'){
   const dust=el('div','estate-clean-dust');scene.append(dust);
   temporary(dust,animate(dust,[{opacity:0,transform:'scale(.6)'},{opacity:.65,transform:'scale(.95)',offset:.22},{opacity:0,transform:'scale(1.3)'}],{duration:1250}));
  }
  pieces.forEach((n,k)=>{
   if(n.classList.contains('estate-route')){
    const paths=n.querySelectorAll('path');for(const p of paths){const len=p.getTotalLength();animate(p,[{strokeDasharray:len+' '+len,strokeDashoffset:String(len)},{strokeDasharray:len+' '+len,strokeDashoffset:'0'}],{duration:1250});}
   }else if(n.classList.contains('estate-side-fence')){
    animate(n,[{opacity:0},{opacity:1}],{duration:1100,delay:k*25});
   }else if(n.classList.contains('estate-object')){
    const target=n.querySelector('.object-art')||n;
    if(role==='repair_fence'||role==='balustrade')animate(target,[{opacity:0,transform:'translateY(14px) scaleY(.75)'},{opacity:1,transform:'translateY(0) scaleY(1)'}],{duration:1000,delay:Math.min(k*45,350)});
    else if(role==='revive_garden'||role==='bush'||role==='revive_trees')animate(target,[{opacity:.25,transform:'scale(.67,.45)'},{opacity:1,transform:'scale(1.035,1.035)',offset:.78},{transform:'scale(1)'}],{duration:1250,delay:k*60});
    else if(role==='light_porch')animate(target,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)',offset:.55},{opacity:1,filter:'brightness(1.35)',offset:.8},{filter:'brightness(1)'}],{duration:1150,delay:k*70});
    else if(role==='clean_fountain'||role==='pond')animate(target,[{opacity:.45,filter:'saturate(.1)'},{opacity:1,filter:'saturate(1)',offset:.55},{opacity:1,filter:'brightness(1.15)',offset:.8},{filter:'brightness(1)'}],{duration:1250});
    else animate(target,[{opacity:.4,filter:'sepia(.6) brightness(.8)'},{opacity:1,filter:'sepia(0) brightness(1.18)',offset:.65},{filter:'brightness(1)'}],{duration:1200});
   }
  });
  if(role==='restore_windows')scene.querySelectorAll('.estate-window-lights i').forEach((n,k)=>animate(n,[{opacity:0},{opacity:1}],{duration:1000,delay:k*75}));
  const glint=el('div','estate-renovation-glint');scene.append(glint);
  temporary(glint,animate(glint,[{opacity:0,transform:'translate(-50%,-50%) scale(.3)'},{opacity:.6,transform:'translate(-50%,-50%) scale(.8)',offset:.35},{opacity:0,transform:'translate(-50%,-50%) scale(1.4)'}],{duration:1300}));
 }
 window.GardenEstate=Object.freeze({render,reveal,dismiss});
})();
