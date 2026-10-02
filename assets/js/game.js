
(() => {
  'use strict';
let userPaused=false,platformPaused=false,settingsVisible=false,quality='auto',gameSeed=1,extraMovesAdded=0;
let boardRandom=Math.random,suppressClickUntil=0,saveRevision=0,saveWarningShown=false,lastShopPurchase=0;
let fxActive=new Set(),fxPool=[],lastSfxAt={},musicMode=null,estateRevealId=null,motionGeneration=0;
let tutorial=null,tutorialProgress={version:1,status:'new',step:0};
const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
const qualityCaps={high:90,medium:48,low:14};
function effectiveQuality(){return reducedQuery.matches?'low':quality==='auto'?((navigator.deviceMemory||4)<4?'low':innerWidth<600?'medium':'high'):quality;}
function isSuspended(){return userPaused||platformPaused||settingsVisible||tutorial?.helpOpen||document.hidden;}
function gameplaySuspended(){return isSuspended()||currentView!=='game'||!shopModal.hidden||!dailyModal.hidden||!designModal.hidden;}
function canInput(){return gameState==='playing'&&!busy&&!gameplaySuspended()&&moves>0&&(!tutorial?.active||tutorial.accepting);}
function refreshPause(){
 const paused=isSuspended();if(document.hidden)cleanFX();document.body.classList.toggle('system-paused',paused);
 const boardPaused=paused||currentView!=='game'||!shopModal.hidden||!dailyModal.hidden||!designModal.hidden;
 GardenFX.suspend(boardPaused);
 boardEl.classList.toggle('paused-board',boardPaused);
 for(const a of document.getAnimations()){
   const target=a.effect?.target;if(!target||target.closest?.('#settingsModal'))continue;
   const stop=paused||(boardEl.contains(target)&&boardPaused)||(target.closest?.('#estateScene')&&(currentView!=='estate'||!designModal.hidden));
   try{if(stop&&a.playState==='running'){a.pause();a.__gardenPaused=true;}else if(!stop&&a.__gardenPaused){a.__gardenPaused=false;a.play();}}catch(_){ }
 }
 setSystemAudioPaused(paused);
 const cover=document.getElementById('pauseCover');if(cover){const opening=cover.hidden&&userPaused,closing=!cover.hidden&&!userPaused;cover.hidden=!userPaused;if(opening)document.getElementById('resumeBtn').focus();else if(closing)document.getElementById('pauseBtn').focus();}
 tutorial?.syncControls();
}
function setQuality(value){cleanFX();quality=['auto','high','medium','low'].includes(value)?value:'auto';document.body.dataset.quality=effectiveQuality();document.getElementById('qualitySelect').value=quality;saveProgress();}
function playMotion(el,frames,options={}){
 if(!el?.animate)return null;
 if(reducedQuery.matches){
  frames=frames.map(({transform,translate,scale,rotate,...frame})=>frame);
  if(!frames.some(frame=>Object.keys(frame).some(key=>!['offset','easing','composite'].includes(key))))return null;
 }
 el.getAnimations().filter(a=>a.__gardenMotion).forEach(a=>a.cancel());
 const a=el.animate(frames,{duration:180,easing:'cubic-bezier(.18,.72,.28,1)',fill:'both',...options});
 a.__gardenMotion=true;a.finished.catch(()=>{});
 if(fxActive.has(el)){clearTimeout(el.__fxTimer);el.__fxMotion=a;a.finished.then(()=>{if(fxActive.has(el)&&el.__fxMotion===a)releaseFX(el);}).catch(()=>{});}
 return a;
}
function cleanFX(){for(const n of [...fxActive])releaseFX(n);}
function releaseFX(n){
 if(!fxActive.delete(n))return;
 clearTimeout(n.__fxTimer);n.getAnimations().forEach(a=>a.cancel());n.remove();
 n.__fxMotion=null;
 n.style.cssText='';n.className='';n.replaceChildren();
 if(fxPool.length<qualityCaps.high)fxPool.push(n);
}
function emitFX(cls,x,y,size=20,duration=500,target=boardEl){
 if(reducedQuery.matches||isSuspended()||currentView!=='game'&&target===boardEl||fxActive.size>=qualityCaps[effectiveQuality()])return null;
 const n=fxPool.pop()||document.createElement('span');n.className='garden-fx '+cls;
 Object.assign(n.style,{left:x+'px',top:y+'px',width:size+'px',height:size+'px'});
 n.setAttribute('aria-hidden','true');target.append(n);fxActive.add(n);
 n.__fxTimer=setTimeout(()=>releaseFX(n),duration+90);return n;
}
function cellPoint(i){
 const cell=boardEl.querySelector('.cell[data-index="'+i+'"]');
 return cell?{x:cell.offsetLeft+cell.offsetWidth/2,y:cell.offsetTop+cell.offsetHeight/2}:{x:boardEl.clientWidth/2,y:boardEl.clientHeight/2};
}
function goalFeedback(indices,before){
 currentLevel().goals.forEach((g,k)=>{
  if(goalProgress(g)<=before[k])return;
  const row=goalsPanel.children[k];if(!row)return;
  playMotion(row,[{transform:'scale(1)'},{transform:'scale(1.045)',offset:.35},{transform:'scale(1)'}],{duration:260});
  sfx(goalDone(g)?'goal':'collect');
  if(reducedQuery.matches||!indices.length)return;
  const p=cellPoint(indices[k%indices.length]),br=boardEl.getBoundingClientRect(),rr=row.getBoundingClientRect();
  const card=document.querySelector('.game-card'),cr=card.getBoundingClientRect();const n=emitFX('goal-mote',p.x+br.left-cr.left,p.y+br.top-cr.top,18,480,card);if(!n)return;
  n.style.backgroundImage='url("'+asset(goalAsset(g))+'")';
  const dx=rr.left+rr.width*.2-br.left-p.x,dy=rr.top+rr.height/2-br.top-p.y;
  playMotion(n,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},
   {transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-25}px)) scale(.85)`,opacity:.95,offset:.5},
   {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.35)`,opacity:0}],{duration:480});
 });
}
function snapshotTurn(){return {board:board.map(g=>g?{...g}:null),tiles:tiles.map(t=>({...t})),moves,score,bestCombo,collected:[...collected],cleared:{...cleared}};}
function restoreTurn(s){motionGeneration++;GardenFX.cancel();board=s.board;tiles=s.tiles;moves=s.moves;score=s.score;bestCombo=s.bestCombo;collected=s.collected;cleared=s.cleared;selected=null;cleanFX();render();}
async function animateSwap(a,b,returning=false){
 render();const pa=cellPoint(a),pb=cellPoint(b),duration=returning?155:185;
 for(const [i,dx,dy]of [[a,pb.x-pa.x,pb.y-pa.y],[b,pa.x-pb.x,pa.y-pb.y]]){
  const cell=boardEl.querySelector('.cell[data-index="'+i+'"]');cell?.classList.add('in-motion');
  playMotion(cell?.querySelector('.gem'),[
   {transform:`translate(${dx}px,${dy}px) scale(1.02)`},
   {transform:`translate(${-dx*.035}px,${-dy*.035}px) scale(1.035)`,offset:.82,easing:'ease-out'},
   {transform:'translate(0,0) scale(1)'}],{duration,easing:'cubic-bezier(.16,.65,.25,1)'});
 }
 await sleep(duration);
 for(const i of [a,b])boardEl.querySelector('.cell[data-index="'+i+'"]')?.classList.remove('in-motion');
}


let layoutFrame=0;
function scheduleFit(){if(layoutFrame)cancelAnimationFrame(layoutFrame);layoutFrame=requestAnimationFrame(()=>{layoutFrame=0;fitBoard();});}
function fitBoard(){
 if(currentView!=='game')return;
 const card=document.querySelector('.game-card'),wrap=document.querySelector('.board-wrap');if(!card||!wrap)return;
 const cs=getComputedStyle(card),padding=parseFloat(cs.paddingLeft)||0,gap=parseFloat(cs.rowGap)||0;
 const width=card.clientWidth-padding*2,height=window.visualViewport?.height||innerHeight;
 let size;
 if(tutorial?.active){
  const hudWidth=card.querySelector('.hud').getBoundingClientRect().width;const fieldWidth=innerWidth<=700&&innerHeight>=innerWidth?width:(hudWidth||goalsPanel.getBoundingClientRect().width),y=wrap.getBoundingClientRect().top;
  const footer=document.getElementById('tutorialFooter').getBoundingClientRect().height,dock=card.querySelector('.booster-dock').getBoundingClientRect().height;
  size=Math.floor(Math.min(fieldWidth,Math.max(145,height-y-footer-dock-padding-gap*3-12),480));
  wrap.style.width=size+'px';wrap.style.height=size+'px';return;
 }
 if(innerWidth>innerHeight&&innerHeight<520)size=Math.floor(Math.min(height-95,width*.51));
 else{const foot=document.querySelector('.booster-dock').getBoundingClientRect().height;const y=wrap.getBoundingClientRect().top;const safeBottom=parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom)||12;const reserve=Math.max(innerWidth<=350?9:19,safeBottom-3);size=Math.floor(Math.min(width,Math.max(200,height-y-foot-gap*2-padding-reserve),570));}
 wrap.style.width=size+'px';wrap.style.height=size+'px';
}
function zoneTasks(id=selectedEstateZone){return ESTATE_TASKS.filter(t=>t.zone===id);}
function renderEstateScene(zone){
 if(currentView!=='estate')return;
 GardenEstate.render(estateScene,{zone,tasks:zoneTasks(zone.id),done:estateDone,styles:estateStyles,unlocked:zoneUnlocked(zone),lightsOn:estateLightsOn,
  onLights:value=>{estateLightsOn=value;saveProgress();sfx('tap');},
  onInteract:(task,built)=>sfx(built&&['pond','clean_fountain'].includes(task.role)?'fountain':built&&['revive_trees','revive_garden','bush'].includes(task.role)?'rustle':'touch'),
  onChoose:task=>{
   if(estateDone.includes(task.id)){if(task.styles)openDesignPicker(task,false);return;}
   const row=estateTasksEl.querySelector('[data-task="'+task.id+'"]');if(!row)return;
   row.scrollIntoView({behavior:reducedQuery.matches?'instant':'smooth',block:'nearest'});row.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
   playMotion(row,[{boxShadow:'0 0 0 0 #f3d58a00'},{boxShadow:'0 0 0 2px #f3d58aaa',offset:.25},{boxShadow:'0 0 0 0 #f3d58a00'}],{duration:1250});
  }});
}
function progressSnapshot(){return{schema:14,updatedAt:saveRevision,unlockedLevel,renovationTokens,rewardedLevels,estateDone,estateStyles,selectedEstateZone,levelStars,bestScores,selectedCampaignChapter,coins,inventory,dailyLastClaim,dailyStreak,dailyTotalClaims,estateLightsOn,musicEnabled,soundEnabled,quality,tutorial:tutorialProgress};}
function openSettings(){settingsVisible=true;document.getElementById('settingsModal').hidden=false;document.getElementById('settingsModal').setAttribute('aria-hidden','false');document.getElementById('qualitySelect').value=quality;refreshPause();document.getElementById('settingsClose').focus();}
function closeSettings(){if(!settingsVisible)return;settingsVisible=false;document.getElementById('settingsModal').hidden=true;document.getElementById('settingsModal').setAttribute('aria-hidden','true');refreshPause();document.getElementById('settingsBtn').focus();}
function trapFocus(e){const modal=[document.getElementById('tutorialHelp'),document.getElementById('settingsModal'),designModal,shopModal,dailyModal,document.getElementById('pauseCover')].find(m=>m&&!m.hidden);if(!modal)return;const nodes=[...modal.querySelectorAll('button:not(:disabled),summary,select,a[href],input')].filter(n=>n.getClientRects().length);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}

  const ASSET_BASE='assets/';
  const assetCatalog=new Map([...document.querySelectorAll('link[data-asset]')].map(n=>[n.dataset.asset,n.href]));
  const asset=p=>{
    if(/^(?:data:|blob:|https?:|file:)/.test(p))return p;
    if(assetCatalog.has(p))return assetCatalog.get(p);
    const path=ASSET_BASE+p;
    try{return new URL(path,document.baseURI).href;}catch(_){return path;}
  };
  window.GardenAssets=Object.freeze({url:asset});

  const GEM_ASSETS=['match3/gems/gem_red.png','match3/gems/gem_blue.png','match3/gems/gem_green.png','match3/gems/gem_yellow.png','match3/gems/gem_purple.png','match3/gems/gem_cyan.png'];
  const SPECIAL_ASSETS={rocketH:['match3/specials/rocket_horizontal.png','match3/specials/rocket_horizontal_glow.png'],rocketV:['match3/specials/rocket_vertical.png','match3/specials/rocket_vertical_glow.png'],bomb:['match3/specials/bomb.png','match3/specials/bomb_glow.png'],rainbow:['match3/specials/rainbow.png','match3/specials/rainbow_glow.png']};
  const GOAL_ASSETS={score:'match3/currency/star.png',ice:'match3/obstacles/ice.png',crate:'match3/obstacles/crate.png',chain:'match3/obstacles/chain_lock.png',drop:'match3/obstacles/key.png'};
  function artImg(path,cls='',alt=''){const im=document.createElement('img');im.src=asset(path);if(cls)im.className=cls;im.alt=alt;im.draggable=false;return im}
  function goalAsset(goal){return goal.kind==='collect'?GEM_ASSETS[goal.type]:GOAL_ASSETS[goal.kind]||'match3/currency/star.png'}
  async function preloadArt(){
 GardenFX.preload(asset);
 const loader=document.getElementById('artLoader'),fill=document.getElementById('artLoaderFill'),txt=document.getElementById('artLoaderText');
 const essential=[...GEM_ASSETS,...Object.values(SPECIAL_ASSETS).flat(),'match3/obstacles/ice.png','match3/obstacles/crate.png','match3/obstacles/chain_lock.png','match3/obstacles/key.png','branding/logo_gem_garden_ru.png'];let done=0;
 const loadOne=p=>new Promise(resolve=>{const im=new Image();let finished=false;const end=()=>{if(finished)return;finished=true;clearTimeout(timer);im.onload=im.onerror=null;done++;if(fill)fill.style.width=Math.round(done/essential.length*100)+'%';resolve();};const timer=setTimeout(end,6000);im.onload=im.onerror=end;im.src=asset(p);});
 await Promise.all(essential.map(loadOne));loader?.classList.add('done');if(txt)txt.textContent='';fitBoard();
 // Remaining images are loaded naturally by the scenes that actually use them.
}

  const SIZE=8, TYPES=6;
  const SPECIAL={ROCKET_H:'rocketH',ROCKET_V:'rocketV',BOMB:'bomb',RAINBOW:'rainbow'};
  const SAVE_KEY='gemGardenV14Progress';
  const LEGACY_SAVE_KEYS=['gemGardenV12Progress','gemGardenV11Progress','gemGardenV10Progress','gemGardenV9Progress','gemGardenV8Progress','gemGardenV7Progress','gemGardenV6Progress','gemGardenV5Progress'];
  const BOOSTER_DEFS={
    hammer:{icon:'🔨',name:'Молоток',price:120,desc:'Убирает выбранный самоцвет или наносит один удар по препятствию.',asset:'match3/boosters/hammer.png'},
    rocket:{icon:'🚀',name:'Ракета',price:180,desc:'Мгновенно очищает выбранный горизонтальный ряд.',asset:'match3/boosters/rocket.png'},
    bomb:{icon:'💣',name:'Бомба',price:220,desc:'Взрывает область 3×3 вокруг выбранной клетки.',asset:'match3/boosters/bomb.png'},
    shuffle:{icon:'🔀',name:'Перемешивание',price:100,desc:'Перемешивает доступные самоцветы без траты хода.',asset:'match3/boosters/shuffle.png'},
    moves:{icon:'➕',name:'+5 ходов',price:250,desc:'Сразу добавляет пять ходов к текущему уровню.',asset:'match3/boosters/plus_5_moves.png'}
  };
  const STARTER_INVENTORY={hammer:1,rocket:1,bomb:1,shuffle:1,moves:1};
  const DAILY_REWARDS=[
    {day:1,icon:'🪙',asset:'match3/currency/coin.png',title:'100 монет',note:'На покупки в магазине',reward:{coins:100}},
    {day:2,icon:'🔨',asset:'match3/boosters/hammer.png',title:'Молоток',note:'1 усилитель',reward:{boosters:{hammer:1}}},
    {day:3,icon:'🪙',asset:'match3/currency/coin.png',title:'150 монет',note:'Продолжай серию',reward:{coins:150}},
    {day:4,icon:'🔀',asset:'match3/boosters/shuffle.png',title:'Миксер',note:'1 перемешивание',reward:{boosters:{shuffle:1}}},
    {day:5,icon:'🪙',asset:'match3/currency/coin.png',title:'200 монет',note:'Уже почти финал',reward:{coins:200}},
    {day:6,icon:'💣',asset:'match3/boosters/bomb.png',title:'Бомба',note:'1 усилитель',reward:{boosters:{bomb:1}}},
    {day:7,icon:'🎁',asset:'match3/ui/reward_chest.png',title:'Большой подарок',note:'300 🪙 + 🚀 + ➕',reward:{coins:300,boosters:{rocket:1,moves:1}}}
  ];
  const ESTATE_TASKS=[
 {"id":"clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":1,"art":["estate/debris_pile.png"],"order":0},
 {"id":"repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":1,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":1},
 {"id":"repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":1,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":2},
 {"id":"clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":1,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":3},
 {"id":"revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":1,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":4},
 {"id":"wash_facade","icon":"🏠","title":"Обновить фасад","desc":"Выбрать новый характер дома","cost":1,"styles":[{"name":"Каменная усадьба","emoji":"🏠","note":"Каменная усадьба"},{"name":"Синяя крыша","emoji":"🏡","note":"Синяя крыша"},{"name":"Викторианский дом","emoji":"🧱","note":"Викторианский дом"}],"role":"wash_facade","zone":1,"art":["estate/house_stone_elegant.png","estate/house_blue_classic.png","estate/house_green_victorian.png"],"order":5},
 {"id":"restore_windows","icon":"🪟","title":"Оживить окна","desc":"Тёплый свет и блеск стёкол","cost":1,"styles":[{"name":"Лунный свет","emoji":"🩵","note":"Освещение окон дома"},{"name":"Тёплый вечер","emoji":"💛","note":"Освещение окон дома"},{"name":"Мягкие тени","emoji":"🩶","note":"Освещение окон дома"}],"role":"restore_windows","zone":1,"art":["estate/window_arched_blue.png","estate/window_rect_blue.png","estate/window_round_blue.png"],"order":6},
 {"id":"restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":1,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":7},
 {"id":"light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":1,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":8},
 {"id":"revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":1,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":9},
 {"id":"z2_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":2,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z2_2_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":2,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":1},
 {"id":"z2_3_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":2,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":2},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z2_4_bush","role":"bush","zone":2,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":3},
 {"id":"z2_5_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":2,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":4},
 {"id":"z2_6_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":2,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":5},
 {"id":"z2_7_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":2,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":6},
 {"id":"z2_8_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":2,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":7},
 {"id":"z2_9_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":2,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":8},
 {"title":"Установить табличку","desc":"Новая деталь вашего сада","cost":1,"icon":"","id":"z2_10_sign","role":"sign","zone":2,"art":["estate/estate_sign.png"],"order":9},
 {"id":"z3_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":3,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z3_2_wash_facade","icon":"🏠","title":"Обновить фасад","desc":"Выбрать новый характер дома","cost":1,"styles":[{"name":"Каменная усадьба","emoji":"🏠","note":"Каменная усадьба"},{"name":"Синяя крыша","emoji":"🏡","note":"Синяя крыша"},{"name":"Викторианский дом","emoji":"🧱","note":"Викторианский дом"}],"role":"wash_facade","zone":3,"art":["estate/house_stone_elegant.png","estate/house_blue_classic.png","estate/house_green_victorian.png"],"order":1},
 {"id":"z3_3_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":3,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":2},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z3_4_bush","role":"bush","zone":3,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":3},
 {"id":"z3_5_restore_windows","icon":"🪟","title":"Оживить окна","desc":"Тёплый свет и блеск стёкол","cost":1,"styles":[{"name":"Лунный свет","emoji":"🩵","note":"Освещение окон дома"},{"name":"Тёплый вечер","emoji":"💛","note":"Освещение окон дома"},{"name":"Мягкие тени","emoji":"🩶","note":"Освещение окон дома"}],"role":"restore_windows","zone":3,"art":["estate/window_arched_blue.png","estate/window_rect_blue.png","estate/window_round_blue.png"],"order":4},
 {"id":"z3_6_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":3,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":5},
 {"id":"z3_7_repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":3,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":6},
 {"id":"z3_8_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":3,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":7},
 {"id":"z3_9_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":3,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":8},
 {"title":"Посадить плющ","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z3_10_ivy","role":"ivy","zone":3,"art":["estate/ivy_vine.png","estate/green_branch.png"],"order":9},
 {"id":"z4_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":4,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z4_2_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":4,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":1},
 {"id":"z4_3_clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":4,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":2},
 {"id":"z4_4_repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":4,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":3},
 {"id":"z4_5_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":4,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":4},
 {"id":"z4_6_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":4,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":5},
 {"id":"z4_7_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":4,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":6},
 {"id":"z4_8_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":4,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":7},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z4_9_bush","role":"bush","zone":4,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":8},
 {"id":"z4_10_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":4,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":9},
 {"id":"z5_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":5,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z5_2_clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":5,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":1},
 {"title":"Очистить пруд","desc":"Новая деталь вашего сада","cost":1,"icon":"","id":"z5_3_pond","role":"pond","zone":5,"art":["estate/pond.png"],"order":2},
 {"id":"z5_4_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":5,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":3},
 {"id":"z5_5_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":5,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":4},
 {"id":"z5_6_repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":5,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":5},
 {"id":"z5_7_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":5,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":6},
 {"id":"z5_8_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":5,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":7},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z5_9_bush","role":"bush","zone":5,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":8},
 {"id":"z5_10_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":5,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":9},
 {"id":"z6_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":6,"art":["estate/debris_pile.png"],"order":0},
 {"title":"Починить балюстраду","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z6_2_balustrade","role":"balustrade","zone":6,"art":["estate/balcony_balustrade.png","estate/fence_stone_balustrade.png"],"order":1},
 {"id":"z6_3_wash_facade","icon":"🏠","title":"Обновить фасад","desc":"Выбрать новый характер дома","cost":1,"styles":[{"name":"Каменная усадьба","emoji":"🏠","note":"Каменная усадьба"},{"name":"Синяя крыша","emoji":"🏡","note":"Синяя крыша"},{"name":"Викторианский дом","emoji":"🧱","note":"Викторианский дом"}],"role":"wash_facade","zone":6,"art":["estate/house_stone_elegant.png","estate/house_blue_classic.png","estate/house_green_victorian.png"],"order":2},
 {"id":"z6_4_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":6,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":3},
 {"id":"z6_5_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":6,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":4},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z6_6_bush","role":"bush","zone":6,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":5},
 {"id":"z6_7_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":6,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":6},
 {"id":"z6_8_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":6,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":7},
 {"id":"z6_9_restore_windows","icon":"🪟","title":"Оживить окна","desc":"Тёплый свет и блеск стёкол","cost":1,"styles":[{"name":"Лунный свет","emoji":"🩵","note":"Освещение окон дома"},{"name":"Тёплый вечер","emoji":"💛","note":"Освещение окон дома"},{"name":"Мягкие тени","emoji":"🩶","note":"Освещение окон дома"}],"role":"restore_windows","zone":6,"art":["estate/window_arched_blue.png","estate/window_rect_blue.png","estate/window_round_blue.png"],"order":8},
 {"title":"Посадить плющ","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z6_10_ivy","role":"ivy","zone":6,"art":["estate/ivy_vine.png","estate/green_branch.png"],"order":9},
 {"id":"z7_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":7,"art":["estate/debris_pile.png"],"order":0},
 {"title":"Очистить пруд","desc":"Новая деталь вашего сада","cost":1,"icon":"","id":"z7_2_pond","role":"pond","zone":7,"art":["estate/pond.png"],"order":1},
 {"id":"z7_3_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":7,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":2},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z7_4_bush","role":"bush","zone":7,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":3},
 {"title":"Украсить берег","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z7_5_rocks","role":"rocks","zone":7,"art":["estate/rock_flowers.png","estate/flower_cluster.png"],"order":4},
 {"id":"z7_6_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":7,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":5},
 {"id":"z7_7_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":7,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":6},
 {"id":"z7_8_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":7,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":7},
 {"id":"z7_9_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":7,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":8},
 {"title":"Установить табличку","desc":"Новая деталь вашего сада","cost":1,"icon":"","id":"z7_10_sign","role":"sign","zone":7,"art":["estate/estate_sign.png"],"order":9},
 {"id":"z8_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":8,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z8_2_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":8,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":1},
 {"id":"z8_3_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":8,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":2},
 {"id":"z8_4_clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":8,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":3},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z8_5_bush","role":"bush","zone":8,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":4},
 {"id":"z8_6_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":8,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":5},
 {"id":"z8_7_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":8,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":6},
 {"id":"z8_8_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":8,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":7},
 {"id":"z8_9_repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":8,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":8},
 {"id":"z8_10_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":8,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":9},
 {"id":"z9_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":9,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z9_2_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":9,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":1},
 {"id":"z9_3_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":9,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":2},
 {"id":"z9_4_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":9,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":3},
 {"title":"Посадить кусты","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z9_5_bush","role":"bush","zone":9,"art":["estate/bush_flowering.png","estate/bush_round.png"],"order":4},
 {"id":"z9_6_clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":9,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":5},
 {"id":"z9_7_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":9,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":6},
 {"id":"z9_8_restore_bench","icon":"🪑","title":"Поставить скамью","desc":"Вернуть место для отдыха","cost":1,"styles":[{"name":"Деревянная","emoji":"🪵","note":"Простая садовая классика"},{"name":"Белая","emoji":"🤍","note":"Лёгкая парковая скамья"},{"name":"Кованая","emoji":"⚜️","note":"Тёмный декоративный металл"}],"role":"restore_bench","zone":9,"art":["estate/bench_wood_iron.png","estate/bench_white_ornate.png","estate/bench_stone.png"],"order":7},
 {"id":"z9_9_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":9,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":8},
 {"id":"z9_10_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":9,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":9},
 {"id":"z10_1_clear_yard","icon":"🧹","title":"Расчистить участок","desc":"Убрать мусор и сорняки","cost":1,"role":"clear_yard","zone":10,"art":["estate/debris_pile.png"],"order":0},
 {"id":"z10_2_wash_facade","icon":"🏠","title":"Обновить фасад","desc":"Выбрать новый характер дома","cost":1,"styles":[{"name":"Каменная усадьба","emoji":"🏠","note":"Каменная усадьба"},{"name":"Синяя крыша","emoji":"🏡","note":"Синяя крыша"},{"name":"Викторианский дом","emoji":"🧱","note":"Викторианский дом"}],"role":"wash_facade","zone":10,"art":["estate/house_stone_elegant.png","estate/house_blue_classic.png","estate/house_green_victorian.png"],"order":1},
 {"title":"Установить ворота","desc":"Новая деталь вашего сада","cost":1,"icon":"","styles":[{"name":"Вариант 1","note":"Бесплатная смена после строительства","emoji":""},{"name":"Вариант 2","note":"Бесплатная смена после строительства","emoji":""}],"id":"z10_3_gate","role":"gate","zone":10,"art":["estate/gate_iron.png","estate/fence_corner_stone.png"],"order":2},
 {"id":"z10_4_clean_fountain","icon":"⛲","title":"Запустить фонтан","desc":"Очистить чашу и вернуть воду","cost":1,"styles":[{"name":"Классический","emoji":"⛲","note":"Серый камень и голубая вода"},{"name":"Белый мрамор","emoji":"💠","note":"Светлый торжественный фонтан"},{"name":"Садовая чаша","emoji":"🏺","note":"Тёплый декоративный камень"}],"role":"clean_fountain","zone":10,"art":["estate/fountain_classic.png","estate/fountain_statue.png","estate/fountain_rectangular.png"],"order":3},
 {"id":"z10_5_revive_trees","icon":"🌳","title":"Оздоровить деревья","desc":"Завершить первое преображение","cost":1,"styles":[{"name":"Зелёная крона","emoji":"🌳","note":"Зелёная крона"},{"name":"Розовое цветение","emoji":"🍎","note":"Розовое цветение"},{"name":"Стройная ель","emoji":"🍂","note":"Стройная ель"}],"role":"revive_trees","zone":10,"art":["estate/tree_round_green.png","estate/tree_pink_blossom.png","estate/tree_conifer.png"],"order":4},
 {"id":"z10_6_revive_garden","icon":"🌷","title":"Оживить клумбы","desc":"Посадить первые цветы","cost":1,"styles":[{"name":"Весенний микс","emoji":"🌷","note":"Тюльпаны, ромашки и яркие цветы"},{"name":"Розовый сад","emoji":"🌹","note":"Романтическая клумба в розовых тонах"},{"name":"Лавандовый","emoji":"🪻","note":"Спокойный фиолетовый сад"}],"role":"revive_garden","zone":10,"art":["estate/flowerbed_multicolor.png","estate/flowerbed_roses.png","estate/flowerbed_purple_white.png"],"order":5},
 {"id":"z10_7_light_porch","icon":"💡","title":"Зажечь фонарь","desc":"Осветить вход в дом","cost":1,"styles":[{"name":"Тёплая латунь","emoji":"🟡","note":"Мягкий золотистый свет"},{"name":"Чёрный фонарь","emoji":"🏮","note":"Контрастный современный корпус"},{"name":"Винтажный","emoji":"✨","note":"Янтарный свет старой усадьбы"}],"role":"light_porch","zone":10,"art":["estate/lamp_stone_gold.png","estate/lamp_black.png","estate/lamp_green_triple.png"],"order":6},
 {"id":"z10_8_repair_path","icon":"🪨","title":"Восстановить дорожку","desc":"Вернуть аккуратный вход к дому","cost":1,"styles":[{"name":"Светлый камень","emoji":"⬜","note":"Классическая светлая дорожка"},{"name":"Терракота","emoji":"🟧","note":"Тёплая плитка для уютного двора"},{"name":"Садовая мозаика","emoji":"🔷","note":"Декоративный узор из камня"}],"role":"repair_path","zone":10,"art":["estate/path_stone.png","estate/path_red_brick.png","estate/path_cobblestone.png"],"order":7},
 {"id":"z10_9_repair_fence","icon":"🪵","title":"Починить забор","desc":"Выпрямить и укрепить старые секции","cost":1,"styles":[{"name":"Каменная балюстрада","emoji":"🟫","note":"Каменная балюстрада"},{"name":"Белый штакетник","emoji":"🤍","note":"Белый штакетник"},{"name":"Чёрная ковка","emoji":"⚫","note":"Чёрная ковка"}],"role":"repair_fence","zone":10,"art":["estate/fence_stone_balustrade.png","estate/fence_white_picket.png","estate/fence_black_iron.png"],"order":8},
 {"id":"z10_10_restore_windows","icon":"🪟","title":"Оживить окна","desc":"Тёплый свет и блеск стёкол","cost":1,"styles":[{"name":"Лунный свет","emoji":"🩵","note":"Освещение окон дома"},{"name":"Тёплый вечер","emoji":"💛","note":"Освещение окон дома"},{"name":"Мягкие тени","emoji":"🩶","note":"Освещение окон дома"}],"role":"restore_windows","zone":10,"art":["estate/window_arched_blue.png","estate/window_rect_blue.png","estate/window_round_blue.png"],"order":9}
];


  const ESTATE_ZONES=[{"id":1,"icon":"\ud83d\udeaa","title":"\u041f\u0430\u0440\u0430\u0434\u043d\u044b\u0439 \u0432\u0445\u043e\u0434","levels":"1\u201310","unlockLevel":1,"theme":"entrance","caption":"\ud83c\udfda \u041f\u0430\u0440\u0430\u0434\u043d\u044b\u0439 \u0432\u0445\u043e\u0434 \u0438 \u043f\u0435\u0440\u0435\u0434\u043d\u0438\u0439 \u0434\u0432\u043e\u0440","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":2,"icon":"\ud83c\udf3f","title":"\u0421\u0442\u0430\u0440\u044b\u0439 \u0441\u0430\u0434","levels":"11\u201320","unlockLevel":11,"theme":"garden","caption":"\ud83c\udf3f \u0417\u0430\u0440\u043e\u0441\u0448\u0438\u0439 \u0441\u0442\u0430\u0440\u044b\u0439 \u0441\u0430\u0434","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":3,"icon":"\ud83c\udfe0","title":"\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0434\u043e\u043c","levels":"21\u201330","unlockLevel":21,"theme":"house","caption":"\ud83c\udfe0 \u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0434\u043e\u043c \u0443\u0441\u0430\u0434\u044c\u0431\u044b","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":4,"icon":"\ud83c\udfdb\ufe0f","title":"\u0426\u0435\u043d\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u0432\u043e\u0440","levels":"31\u201340","unlockLevel":31,"theme":"courtyard","caption":"\ud83c\udfdb\ufe0f \u0426\u0435\u043d\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u0432\u043e\u0440","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":5,"icon":"\u26f2","title":"\u0424\u043e\u043d\u0442\u0430\u043d\u043d\u0430\u044f \u043f\u043b\u043e\u0449\u0430\u0434\u044c","levels":"41\u201350","unlockLevel":41,"theme":"fountain","caption":"\u26f2 \u0424\u043e\u043d\u0442\u0430\u043d\u043d\u0430\u044f \u043f\u043b\u043e\u0449\u0430\u0434\u044c","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":6,"icon":"\ud83c\udf24\ufe0f","title":"\u0422\u0435\u0440\u0440\u0430\u0441\u0430","levels":"51\u201360","unlockLevel":51,"theme":"terrace","caption":"\ud83c\udf24\ufe0f \u0422\u0435\u0440\u0440\u0430\u0441\u0430 \u0443 \u0434\u043e\u043c\u0430","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":7,"icon":"\ud83e\udd86","title":"\u041f\u0440\u0443\u0434","levels":"61\u201370","unlockLevel":61,"theme":"pond","caption":"\ud83e\udd86 \u041f\u0440\u0443\u0434 \u0438 \u0431\u0435\u0440\u0435\u0433\u043e\u0432\u0430\u044f \u0437\u043e\u043d\u0430","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":8,"icon":"\ud83d\udd25","title":"\u0417\u043e\u043d\u0430 \u043e\u0442\u0434\u044b\u0445\u0430","levels":"71\u201380","unlockLevel":71,"theme":"lounge","caption":"\ud83d\udd25 \u0412\u0435\u0447\u0435\u0440\u043d\u044f\u044f \u0437\u043e\u043d\u0430 \u043e\u0442\u0434\u044b\u0445\u0430","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":9,"icon":"\ud83c\udf3a","title":"\u0411\u043e\u043b\u044c\u0448\u043e\u0439 \u0441\u0430\u0434","levels":"81\u201390","unlockLevel":81,"theme":"grandgarden","caption":"\ud83c\udf3a \u0411\u043e\u043b\u044c\u0448\u043e\u0439 \u0434\u0435\u043a\u043e\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0439 \u0441\u0430\u0434","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."},{"id":10,"icon":"\ud83d\udc51","title":"\u0424\u0438\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435","levels":"91\u2013100","unlockLevel":91,"theme":"finale","caption":"\ud83d\udc51 \u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0438\u0435 \u0432\u0441\u0435\u0439 \u0443\u0441\u0430\u0434\u044c\u0431\u044b","desc":"\u041a\u0430\u0436\u0434\u0430\u044f \u043f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u2014 \u0435\u0449\u0451 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0441\u0430\u0434\u0430."}];
  const ZONE_ICON_ASSETS=['estate/gate_iron.png','estate/tree_round_green.png','estate/house_stone_elegant.png','estate/fountain_classic.png','estate/fountain_statue.png','estate/bench_white_ornate.png','estate/pond.png','estate/lamp_stone_gold.png','estate/flowerbed_roses.png','estate/house_green_victorian.png'];
  const GEM_NAMES=['рубинов','сапфиров','изумрудов','топазов','аметистов','аквамаринов'];
  
  const coord=(r,c)=>r*SIZE+c;
  const pts=list=>list.map(([r,c])=>coord(r,c));
  
  const seededRandom=seed=>{let x=(seed>>>0)||1;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}};
  const shuffled=(list,seed)=>{const out=[...list],rnd=seededRandom(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out};
  
  const INTERIOR=pts(Array.from({length:6},(_,r)=>Array.from({length:6},(_,c)=>[r+1,c+1])).flat());
  
  
  

  const BASE_LEVELS=[
    {id:1,title:'Первые ростки',moves:24,goals:[{kind:'collect',type:0,target:12}],layout:{}},
    {id:2,title:'Морозное утро',moves:28,goals:[{kind:'ice',target:8},{kind:'collect',type:1,target:10}],layout:{
      ice:pts([[2,2],[2,3],[2,4],[2,5],[5,2],[5,3],[5,4],[5,5]])
    }},
    {id:3,title:'Старые ящики',moves:28,goals:[{kind:'crate',target:6},{kind:'score',target:700}],layout:{
      crates:pts([[2,1],[2,6],[3,3],[3,4],[5,1],[5,6]])
    }},
    {id:4,title:'Двойной лёд',moves:30,goals:[{kind:'ice',target:8},{kind:'score',target:1000}],layout:{
      ice2:pts([[2,2],[2,3],[2,4],[2,5],[4,2],[4,3],[4,4],[4,5]])
    }},
    {id:5,title:'Крепкая древесина',moves:32,goals:[{kind:'crate',target:6},{kind:'collect',type:3,target:12}],layout:{
      crates2:pts([[1,2],[1,5],[3,1],[3,6],[5,2],[5,5]])
    }},
    {id:6,title:'Скованные самоцветы',moves:30,goals:[{kind:'chain',target:10},{kind:'collect',type:4,target:10}],layout:{
      chains:pts([[1,2],[1,5],[2,3],[2,4],[3,2],[3,5],[4,2],[4,5],[5,3],[5,4]])
    }},
    {id:7,title:'Разбитая дорожка',moves:30,goals:[{kind:'ice',target:6},{kind:'score',target:1200}],layout:{
      holes:pts([[1,0],[1,7],[2,0],[2,7],[5,0],[5,7],[6,0],[6,7]]),
      ice:pts([[2,2],[2,5],[3,3],[3,4],[5,2],[5,5]])
    }},
    {id:8,title:'Ключи от сада',moves:34,goals:[{kind:'drop',target:2},{kind:'collect',type:2,target:12}],layout:{
      holes:pts([[2,0],[2,7],[4,0],[4,7]]),drops:pts([[0,2],[0,5]])
    }},
    {id:9,title:'Через преграды',moves:38,goals:[{kind:'crate',target:4},{kind:'chain',target:6},{kind:'drop',target:2}],layout:{
      crates:pts([[2,1],[2,6],[4,1],[4,6]]),
      chains:pts([[1,3],[1,4],[3,2],[3,5],[5,3],[5,4]]),
      drops:pts([[0,2],[0,5]])
    }},
    {id:10,title:'Испытание садовника',moves:44,goals:[{kind:'ice',target:6},{kind:'crate',target:4},{kind:'chain',target:6},{kind:'drop',target:2},{kind:'score',target:2200}],layout:{
      holes:pts([[1,0],[1,7],[6,0],[6,7]]),
      ice:pts([[2,2],[2,5],[5,2],[5,5]]),ice2:pts([[3,3],[3,4]]),
      crates:pts([[2,1],[2,6]]),crates2:pts([[4,1],[4,6]]),
      chains:pts([[1,3],[1,4],[4,2],[4,5],[5,3],[5,4]]),
      drops:pts([[0,2],[0,5]])
    }}
  ];

  const CHAPTER_TITLES=[
    ['Первые шаги','Холодная роса','Старые доски','Ледяная клумба','Крепкий заслон','Садовые цепи','Узкая дорожка','Потерянные ключи','Смешанное испытание','Ворота открыты'],
    ['Заросшая тропа','Ледяные листья','Ящики садовника','Цветочная дуга','Тихая аллея','Птичий дворик','Каменный круг','Яблоневый путь','Сердце сада','Сад пробуждается'],
    ['Старое крыльцо','Пыльные окна','Крепкие балки','Запертая дверь','Лестница наверх','Тяжёлая крыша','Дом в цепях','Ключ от веранды','Большой ремонт','Дом снова жив'],
    ['Площадь в пыли','Каменный узор','Арка двора','Ящики на площади','Цепи у ворот','Разбитый проход','Ключи от арки','Центральный круг','Двор оживает','Парадный двор'],
    ['Холодная чаша','Первые струи','Каменные борта','Ключи фонтана','Ледяная вода','Сломанные каналы','Розарий у воды','Площадь в цепях','Большой запуск','Фонтан сияет'],
    ['Старый настил','Солнечный угол','Тяжёлые ящики','Навес в ремонте','Ключ от террасы','Узкий проход','Вечерние фонари','Место для отдыха','Последние доски','Терраса готова'],
    ['Заросший берег','Холодная вода','Ключи у пруда','Старый мостик','Камышовый путь','Ящики на берегу','Цепи мостика','Кувшинки','Тихая заводь','Пруд оживает'],
    ['Расчистить площадку','Костровой круг','Беседка','Ящики барбекю','Ключ от вечера','Гирлянды','Узкая площадка','Большая компания','Вечерний вызов','Огни зажжены'],
    ['Аллея','Большой цветник','Пергола','Редкие растения','Ключ садовника','Сад бабочек','Каменный лабиринт','Розарий','Парадная аллея','Большой сад'],
    ['Парадные ворота','Последний лёд','Финальные ящики','Цепи усадьбы','Последние ключи','Большой каскад','Испытание мастера','Праздничная площадь','Перед открытием','Усадьба мечты']
  ];

  function buildGeneratedLevel(id){
  const chapter=Math.floor((id-1)/10)+1,step=(id-1)%10+1;
  const archetypes=['corridor','core','islands','funnel','fortress','edge','crossroads','asymmetric','cascade','mastery'];
  const arch=archetypes[(step-1+Math.floor((chapter-2)/2)*3)%archetypes.length];
  const rng=seededRandom(0x4712+id*104729),mirror=chapter%2===0;
  const tr=i=>Math.floor(i/8)*8+(mirror?7-i%8:i%8);
  const shape={corridor:[0,7,8,15,48,55,56,63],core:[0,7,56,63],islands:[3,4,11,12,51,52,59,60],funnel:[0,7,48,55,56,57,62,63],fortress:[0,7,56,63],edge:[27,28,35,36],crossroads:[0,1,6,7,8,15,48,55,56,57,62,63],asymmetric:[0,1,8,56,57],cascade:[0,7,56,63],mastery:[0,7,56,63]};
  const holes=(shape[arch]||[]).map(tr);
  const layout={holes,ice:[],ice2:[],crates:[],crates2:[],chains:[],drops:[]};
  const banned=new Set(holes);
  const focus=chapter===2?'ice':chapter===3?'crate':chapter===4?'chain':chapter===5?'drop':chapter===6?'crate':chapter===7?'drop':chapter===8?'chain':chapter===9?'ice':'mixed';
  const boss=step===10,spike=step===5;
  let dropCount=(focus==='drop'||chapter>=8&&step%3===0)?(chapter>=7?2:1):0;
  const dropCols=mirror?[5,2]:[2,5];
  if(dropCount){
    layout.holes=layout.holes.filter(i=>!dropCols.slice(0,dropCount).includes(i%8));
    banned.clear();layout.holes.forEach(i=>banned.add(i));
    layout.drops=dropCols.slice(0,dropCount).map(c=>chapter===7?c+8:c);layout.drops.forEach(i=>banned.add(i));
  }
  const central=[18,19,20,21,26,29,34,37,42,43,44,45];
  const edge=[9,10,13,14,17,22,25,30,33,38,41,46,49,50,53,54];
  const ordered=(arch==='edge'?edge:arch==='asymmetric'?[17,18,25,26,33,34,41,42,19,27,35,43]:central).map(tr);
  const candidates=ordered.concat(shuffled(INTERIOR,id*97)).filter((x,i,a)=>a.indexOf(x)===i);
  function take(key,n,protectedCols=false){
    for(const i of candidates){
      if(n<=0)break;
      if(banned.has(i))continue;
      if(protectedCols&&dropCols.slice(0,dropCount).includes(i%8))continue;
      // Avoid closed 2x2 blocks of boxes; matchable lanes remain available.
      if(key.startsWith('crate')&&[i-1,i+1].some(j=>layout.crates.includes(j)||layout.crates2.includes(j))&&rng()<.7)continue;
      layout[key].push(i);banned.add(i);n--;
    }
  }
  const depth=Math.min(4,Math.floor((chapter-2)/2));
  if(focus==='ice'||focus==='mixed'){take('ice2',chapter>=4?2+(boss?2:0):0,true);take('ice',6+depth+(spike?2:0),true);take('crates',2+(boss?2:0),true);}
  else if(focus==='crate'){take('crates2',chapter>=6?2:0,true);take('crates',5+depth+(boss?1:0),true);take('chains',chapter>=6?3:0,true);}
  else if(focus==='chain'){take('chains',5+(boss?2:0),true);take('crates',3+depth,true);take('ice',2,true);}
  else {take('ice',4+depth,true);take('crates',3+(boss?2:0),true);if(chapter>=7)take('chains',2,true);}
  const goals=[];
  const ice=layout.ice.length+layout.ice2.length,wood=layout.crates.length+layout.crates2.length,chains=layout.chains.length;
  if(focus==='drop')goals.push({kind:'drop',target:dropCount});
  else if(focus==='crate')goals.push({kind:'crate',target:wood});
  else if(focus==='chain')goals.push({kind:'chain',target:chains});
  else goals.push({kind:'ice',target:ice});
  if(boss||focus==='mixed'){
    if(!goals.some(g=>g.kind==='crate')&&wood)goals.push({kind:'crate',target:wood});
    if(dropCount&&!goals.some(g=>g.kind==='drop'))goals.push({kind:'drop',target:dropCount});
  }
  if(goals.length<3)goals.push({kind:'collect',type:(id+chapter)%6,target:14+depth*2+(boss?4:0)+(spike?2:0)});
  const obstacleHP=ice+layout.ice2.length+wood+layout.crates2.length+chains;
  const calibration={"11":-5,"12":-5,"13":-3,"14":-5,"15":-3,"16":-5,"17":-3,"18":-3,"19":-5,"20":-3,"21":-5,"22":-5,"23":-5,"24":-5,"25":-5,"26":-5,"27":-5,"28":-5,"29":-5,"30":-3,"31":-5,"32":-3,"34":-5,"36":-3,"37":-5,"38":-3,"39":-3,"51":-5,"52":-5,"53":-5,"54":-5,"55":-3,"56":-5,"57":-5,"58":-5,"59":-5,"61":2,"62":2,"63":2,"64":2,"65":2,"66":2,"67":2,"68":2,"69":2,"70":2,"71":-3,"73":-3,"78":-3,"79":-3,"93":2,"96":2,"99":2};
  const moves=Math.max(16,Math.min(36,Math.round(20+obstacleHP*.45+dropCount*2-(boss?3:spike?2:0))+(calibration[id]||0)));
  return {id,title:CHAPTER_TITLES[chapter-1][step-1],moves,goals,layout,archetype:arch,difficulty:boss?'master':spike?'hard':'puzzle',seed:0x4712+id*104729};
}


  function withStarThresholds(level){
 const star2Moves=Math.max(2,Math.ceil(level.moves*.14)),star3Moves=Math.max(star2Moves+2,Math.ceil(level.moves*.28));
 return {...level,star2Moves,star3Moves};
}

  function buildCampaignLevels(){
 const budgets=[16,25,16,28,18,23,20,30,31,31];
 const levels=BASE_LEVELS.map((l,i)=>withStarThresholds({...l,moves:budgets[i],layout:structuredClone(l.layout||{}),archetype:i<3?'intro':'classic',difficulty:i===9?'master':i===4?'hard':'puzzle'}));
 for(let id=11;id<=100;id++)levels.push(withStarThresholds(buildGeneratedLevel(id)));
 return levels;
}

  const LEVELS=buildCampaignLevels();

  const boardEl=document.getElementById('board');
  const scoreEl=document.getElementById('score');
  const movesEl=document.getElementById('moves');
  const levelNumberEl=document.getElementById('levelNumber');
  const bestComboEl=document.getElementById('bestCombo');
  const comboText=document.getElementById('comboText');
  const toastEl=document.getElementById('toast');
  
  const goalsPanel=document.getElementById('goalsPanel');
  const levelOverlay=document.getElementById('levelOverlay');
  const resultIcon=document.getElementById('resultIcon');
  const resultTitle=document.getElementById('resultTitle');
  const resultText=document.getElementById('resultText');
  const resultGoals=document.getElementById('resultGoals');
  const primaryOverlayBtn=document.getElementById('primaryOverlayBtn');
  const secondaryOverlayBtn=document.getElementById('secondaryOverlayBtn');
  const sideLevelTitle=document.getElementById('sideLevelTitle');
  const sideLevelText=document.getElementById('sideLevelText');
  const sideObjectives=document.getElementById('sideObjectives');
  const levelSelect=document.getElementById('levelSelect');
  const unlockText=document.getElementById('unlockText');
  const resultStars=document.getElementById('resultStars');
  const totalStarsSide=document.getElementById('totalStarsSide');
  const campaignStars=document.getElementById('campaignStars');
  const campaignCleared=document.getElementById('campaignCleared');
  const chapterStrip=document.getElementById('chapterStrip');
  const levelMapGrid=document.getElementById('levelMapGrid');
  const campaignChapterKicker=document.getElementById('campaignChapterKicker');
  const campaignChapterTitle=document.getElementById('campaignChapterTitle');
  const campaignChapterStats=document.getElementById('campaignChapterStats');
  const gameView=document.getElementById('gameView');
  const estateView=document.getElementById('estateView');
  const gameTab=document.getElementById('gameTab');
  const estateTab=document.getElementById('estateTab');
  const gameActions=document.getElementById('gameActions');
  const estateScene=document.getElementById('estateScene');
  const estateTasksEl=document.getElementById('estateTasks');
  const estateProgressText=document.getElementById('estateProgressText');
  const estateProgressFill=document.getElementById('estateProgressFill');
  const estateStageTitle=document.getElementById('estateStageTitle');
  const estateHint=document.getElementById('estateHint');

  const zoneMap=document.getElementById('zoneMap');
  const estateGlobalText=document.getElementById('estateGlobalText');
  const estateZoneStatus=document.getElementById('estateZoneStatus');
  const estateZoneRange=document.getElementById('estateZoneRange');
  const estateZoneTitle=document.getElementById('estateZoneTitle');
  const estateZoneDesc=document.getElementById('estateZoneDesc');
  const estateProgressLabel=document.getElementById('estateProgressLabel');
  const estateCaption=document.getElementById('estateCaption');
  const estateTaskChapter=document.getElementById('estateTaskChapter');
  const estateTaskTitle=document.getElementById('estateTaskTitle');
  const estateTaskText=document.getElementById('estateTaskText');
  const zonePrevBtn=document.getElementById('zonePrevBtn');
  const zoneNextBtn=document.getElementById('zoneNextBtn');
  
  
  
  
  
  const designModal=document.getElementById('designModal');
  const designTitle=document.getElementById('designTitle');
  const designCopy=document.getElementById('designCopy');
  const designOptions=document.getElementById('designOptions');
  const designCostText=document.getElementById('designCostText');
  const designConfirm=document.getElementById('designConfirm');
  const designClose=document.getElementById('designClose');
  const boosterStatus=document.getElementById('boosterStatus');
  const boosterOwnedSide=document.getElementById('boosterOwnedSide');
  const shopModal=document.getElementById('shopModal');
  const shopClose=document.getElementById('shopClose');
  const shopItems=document.getElementById('shopItems');
  const shopCoins=document.getElementById('shopCoins');
  const dailyBtn=document.getElementById('dailyBtn');
  const dailySideBtn=document.getElementById('dailySideBtn');
  
  const dailyMiniTitle=document.getElementById('dailyMiniTitle');
  const dailyMiniText=document.getElementById('dailyMiniText');
  const dailyModal=document.getElementById('dailyModal');
  const dailyClose=document.getElementById('dailyClose');
  const dailyGrid=document.getElementById('dailyGrid');
  const dailyStreakText=document.getElementById('dailyStreakText');
  const dailyStatusText=document.getElementById('dailyStatusText');
  const dailyClaimBtn=document.getElementById('dailyClaimBtn');
  const musicToggle=document.getElementById('musicToggle');
  const soundToggle=document.getElementById('soundToggle');
  
  
  
  
  
  
  

  let board=[], tiles=[], selected=null, busy=false, score=0, moves=0, bestCombo=1, toastTimer=0, comboTimer=0, pointerStart=null;
  let currentLevelIndex=0, unlockedLevel=1, collected=Array(TYPES).fill(0), cleared={ice:0,crate:0,chain:0,drop:0}, gameState='briefing';
  let renovationTokens=0, rewardedLevels=[], estateDone=[], estateStyles={}, currentView='game', selectedEstateZone=1;
  let levelStars={},bestScores={},selectedCampaignChapter=1;
  let coins=400,inventory={...STARTER_INVENTORY},activeBooster=null;
  let dailyLastClaim='',dailyStreak=0,dailyTotalClaims=0,estateLightsOn=true;
  let musicEnabled=true,soundEnabled=true;
  let designTaskId=null, designChoice=1, designBuildMode=false;

  const sleep=ms=>new Promise(resolve=>{let left=reducedQuery.matches?Math.min(ms,45):ms,last=performance.now();function tick(){const now=performance.now();if(!gameplaySuspended())left-=Math.min(80,now-last);last=now;if(left<=0)resolve();else setTimeout(tick,25);}tick();});
  const idx=(r,c)=>r*SIZE+c;
  const rc=i=>[Math.floor(i/SIZE),i%SIZE];
  const randType=()=>Math.floor(boardRandom()*TYPES);
  const makeGem=(type=randType(),special=null)=>({kind:'gem',type,special});
  const makeDrop=()=>({kind:'drop',type:null,special:null});
  const isGem=g=>!!g&&g.kind!=='drop';
  const isDrop=g=>!!g&&g.kind==='drop';
  const isAdjacent=(a,b)=>{const[ar,ac]=rc(a),[br,bc]=rc(b);return Math.abs(ar-br)+Math.abs(ac-bc)===1};
  const isRainbow=g=>isGem(g)&&g.special===SPECIAL.RAINBOW;
  const isPower=g=>isGem(g)&&!!g.special;
  const isTapPower=g=>isPower(g)&&!isRainbow(g);
  const tileAt=i=>tiles[i]||{hole:false,ice:0,crate:0,chain:0};
  const isPlayableCell=i=>i>=0&&i<SIZE*SIZE&&!tileAt(i).hole&&!tileAt(i).crate;
  const canSwapCell=i=>isPlayableCell(i)&&isGem(board[i])&&!tileAt(i).chain&&!tileAt(i).ice;
  const canAnchor=i=>isPlayableCell(i)&&isGem(board[i])&&!tileAt(i).chain&&!tileAt(i).ice;
  const currentLevel=()=>tutorial?.active?tutorial.level:LEVELS[currentLevelIndex];
  const boosterStock=()=>tutorial?.active?tutorial.inventory:inventory;

  function normalizeLevelStars(raw){
    const out={};
    if(raw&&typeof raw==='object')for(const [key,value] of Object.entries(raw)){
      const id=Math.floor(Number(key)),stars=Math.floor(Number(value));
      if(id>=1&&id<=LEVELS.length&&stars>=1&&stars<=3)out[id]=stars;
    }
    return out;
  }
  let audioCtx=null,audioMaster=null,audioMusic=null,audioSfx=null,musicTimer=0,musicStep=0,audioUnlocked=false,systemAudioPaused=false;
  const activeAudioNodes=new Set();
  function ensureAudio(){
 if(audioCtx)return audioCtx;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
 try{audioCtx=new AC();audioMaster=audioCtx.createGain();audioMusic=audioCtx.createGain();audioSfx=audioCtx.createGain();
 audioMaster.gain.value=1;audioMusic.gain.value=musicEnabled?.32:0;audioSfx.gain.value=soundEnabled?.65:0;
 const limiter=audioCtx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.knee.value=14;limiter.ratio.value=5;audioMusic.connect(audioMaster);audioSfx.connect(audioMaster);audioMaster.connect(limiter);limiter.connect(audioCtx.destination);return audioCtx;
 }catch(_){return null;}
}
  function registerNode(node){
    if(!node)return node;activeAudioNodes.add(node);
    node.addEventListener?.('ended',()=>activeAudioNodes.delete(node),{once:true});
    return node;
  }
  function stopActiveAudio(){
    for(const node of [...activeAudioNodes]){try{node.stop?.()}catch(_){ }activeAudioNodes.delete(node)}
  }
  function tone(freq=440,dur=.09,type='sine',volume=.08,delay=0,destination='sfx',endFreq=null){
 const ctx=ensureAudio();if(!ctx||systemAudioPaused||activeAudioNodes.size>=48)return;
 if(destination==='sfx'&&!soundEnabled||destination==='music'&&!musicEnabled)return;
 const now=ctx.currentTime+Math.max(0,delay),osc=registerNode(ctx.createOscillator()),gain=ctx.createGain(),target=destination==='music'?audioMusic:audioSfx;
 osc.__gardenLane=destination;osc.type=type;osc.frequency.setValueAtTime(Math.max(40,freq),now);if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(40,endFreq),now+dur);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,volume),now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+dur);
 osc.connect(gain);gain.connect(target);osc.addEventListener('ended',()=>{osc.disconnect();gain.disconnect();},{once:true});osc.start(now);osc.stop(now+dur+.025);
}
  function noise(dur=.11,volume=.055,delay=0){
 const ctx=ensureAudio();if(!ctx||systemAudioPaused||!soundEnabled||activeAudioNodes.size>=48)return;
 const len=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),data=buf.getChannelData(0);for(let i=0;i<len;i++){const v=Math.sin(i*127.1)*43758.5453;data[i]=((v-Math.floor(v))*2-1)*(1-i/len);}
 const src=registerNode(ctx.createBufferSource()),g=ctx.createGain(),f=ctx.createBiquadFilter();src.buffer=buf;f.type='lowpass';f.frequency.value=1700;const now=ctx.currentTime+delay;g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.0001,now+dur);src.connect(f);f.connect(g);g.connect(audioSfx);src.addEventListener('ended',()=>{src.disconnect();f.disconnect();g.disconnect();},{once:true});src.start(now);src.stop(now+dur+.02);
}
  function sfx(name,detail=1){
 if(!soundEnabled||systemAudioPaused||!audioUnlocked)return;const now=performance.now();if(now-(lastSfxAt[name]||-999)<65)return;lastSfxAt[name]=now;
 const d=Math.min(6,detail),arp=(notes,dur=.18,vol=.12)=>notes.forEach((f,i)=>tone(f,dur,'sine',vol,i*.055));
 switch(name){
  case'tap':tone(690,.035,'sine',.045);break;
  case'touch':tone(880,.045,'sine',.055,0,'sfx',1100);break;
  case'land':tone(230,.035,'sine',.025);break;
  case'collect':tone(1100,.075,'sine',.045);break;
  case'goal':arp([1047,1318,1568],.16,.075);break;
  case'star':arp([784,1047,1568],.24,.085);break;
  case'swap':tone(420,.09,'sine',.10,0,'sfx',660);break;
  case'invalid':tone(225,.11,'triangle',.10,0,'sfx',160);break;
  case'match':arp([740,1110],.13,.105);break;
  case'combo':arp([523,659,784,1047].map(f=>f*Math.pow(1.055,d)),.18,.10);break;
  case'created':arp([784,1047,1568],.22,.10);break;
  case'hammerCharge':tone(330,.22,'sine',.045,0,'sfx',600);break;
  case'rocketCharge':tone(220,.23,'sine',.055,0,'sfx',530);break;
  case'bombCharge':noise(.14,.035);tone(170,.28,'sine',.05,0,'sfx',260);break;
  case'rainbowCharge':arp([659,880,1047],.23,.045);break;
  case'rocket':noise(.38,.09);tone(580,.38,'sine',.13,0,'sfx',140);break;
  case'bomb':noise(.25,.18);tone(110,.30,'sine',.3,0,'sfx',42);break;
  case'rainbow':arp([523,659,784,1047,1318,1568],.24,.1);break;
  case'special':noise(.16,.1);arp([330,660,990],.19,.15);break;
  case'ice':arp([1600,2200],.075,.1);noise(.07,.04);break;
  case'wood':noise(.095,.15);tone(155,.09,'triangle',.1);break;
  case'chain':arp([880,1320],.07,.10);break;
  case'coin':arp([1200,1600],.14,.11);break;
  case'reward':arp([523,659,784,1047],.26,.13);break;
  case'win':arp([392,523,659,784,1047],.32,.14);break;
  case'lose':arp([392,330,262],.30,.12);break;
  case'build':noise(.14,.07);arp([330,440,660,880],.24,.12);break;
  case'booster':arp([440,880,1320],.17,.12);break;
  case'key':arp([740,990,1480],.16,.13);break;
  case'fountain':tone(460,.3,'sine',.08,0,'sfx',1000);noise(.16,.035);break;
  case'rustle':noise(.16,.05);break;
 }
}
  function desiredMusicMode(){if(systemAudioPaused||!musicEnabled||!audioUnlocked)return null;return currentView==='estate'?'estate':currentView==='game'&&gameState==='playing'?'game':'map';}
  function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null;}musicStep=0;for(const n of [...activeAudioNodes])if(n.__gardenLane==='music'){try{n.stop();}catch(_){}activeAudioNodes.delete(n);}}
  function musicTick(){
 const mode=desiredMusicMode();if(!mode){stopMusic();return;}
 const scales={game:[60,64,67,71,62,65,69,72],estate:[57,60,64,67,59,62,65,69],map:[60,62,67,69,64,67,71,74]};
 const chords={game:[[48,52,55],[45,48,52],[53,57,60],[43,47,50]],estate:[[45,48,52],[41,45,48],[48,52,55],[43,47,50]],map:[[48,52,55],[53,57,60],[45,48,52],[43,47,50]]};
 const hz=n=>440*Math.pow(2,(n-69)/12),bar=Math.floor(musicStep/8)%4,step=musicStep%8;
 if(step===0)for(const n of chords[mode][bar])tone(hz(n),2.4,'sine',.075,0,'music');
 const pattern=[0,2,1,4,3,5,2,6],note=scales[mode][(pattern[step]+bar)%8];
 if(step!==7||bar%2===0){tone(hz(note+12),.44,'sine',.095,0,'music');tone(hz(note+24),.20,'triangle',.014,.014,'music');}
 if(step%4===0)tone(hz(chords[mode][bar][0]-12),.68,'sine',.14,0,'music');musicStep++;
}
  function syncMusic(){const mode=desiredMusicMode();if(!mode){stopMusic();return;}if(musicMode!==mode){stopMusic();musicMode=mode;}if(!musicTimer){musicTick();musicTimer=setInterval(musicTick,mode==='game'?380:460);}}
  function updateAudioControls(){
    if(musicToggle){musicToggle.classList.toggle('off',!musicEnabled);musicToggle.classList.toggle('system-paused',systemAudioPaused);musicToggle.setAttribute('aria-pressed',String(musicEnabled));musicToggle.title=musicEnabled?'Музыка включена':'Музыка выключена';musicToggle.querySelector('span').textContent=musicEnabled?'🎵':'🎵';}
    if(soundToggle){soundToggle.classList.toggle('off',!soundEnabled);soundToggle.classList.toggle('system-paused',systemAudioPaused);soundToggle.setAttribute('aria-pressed',String(soundEnabled));soundToggle.title=soundEnabled?'Звуки включены':'Звуки выключены';soundToggle.querySelector('span').textContent=soundEnabled?'🔊':'🔇';}
  }
  async function unlockAudio(){
    const ctx=ensureAudio();if(!ctx)return false;audioUnlocked=true;
    if(!systemAudioPaused&&ctx.state==='suspended')try{await ctx.resume()}catch(_){ }
    syncMusic();return true;
  }
  function applyAudioSettings(save=true){updateAudioControls();if(audioMusic)audioMusic.gain.setTargetAtTime(musicEnabled?.32:0,audioCtx.currentTime,.05);if(audioSfx)audioSfx.gain.setTargetAtTime(soundEnabled?.65:0,audioCtx.currentTime,.02);if(!musicEnabled)stopMusic();else syncMusic();if(save)saveProgress();}
  function toggleMusic(){musicEnabled=!musicEnabled;unlockAudio();applyAudioSettings();showToast(musicEnabled?'🎵 Музыка включена':'🎵 Музыка выключена')}
  function toggleSound(){soundEnabled=!soundEnabled;unlockAudio();applyAudioSettings();if(soundEnabled)sfx('tap');showToast(soundEnabled?'🔊 Звуки включены':'🔇 Звуки выключены')}
  function setSystemAudioPaused(paused){
 paused=!!paused;if(systemAudioPaused===paused)return;systemAudioPaused=paused;updateAudioControls();
 if(paused){stopMusic();stopActiveAudio();if(audioMaster&&audioCtx)audioMaster.gain.setValueAtTime(0,audioCtx.currentTime);if(audioCtx&&typeof audioCtx.suspend==='function')audioCtx.suspend().catch(()=>{});}
 else if(audioUnlocked){const ctx=ensureAudio();if(ctx&&audioMaster){audioMaster.gain.setValueAtTime(1,ctx.currentTime);ctx.resume().then(syncMusic).catch(()=>{});}}
}
  window.gemGardenSystemPause=()=>{platformPaused=true;refreshPause();};
  window.gemGardenSystemResume=()=>{platformPaused=false;refreshPause();};

  function normalizeBestScores(raw){
    const out={};
    if(raw&&typeof raw==='object')for(const [key,value] of Object.entries(raw)){
      const id=Math.floor(Number(key)),valueNum=Math.floor(Number(value));
      if(id>=1&&id<=LEVELS.length&&valueNum>=0)out[id]=valueNum;
    }
    return out;
  }
  function normalizeInventory(raw){const out={...STARTER_INVENTORY};if(raw&&typeof raw==='object')for(const k of Object.keys(BOOSTER_DEFS)){const n=Number(raw[k]);if(Number.isFinite(n))out[k]=Math.max(0,Math.min(999,Math.floor(n)));}return out;}
  const starsForLevel=id=>Math.max(0,Math.min(3,Number(levelStars[id])||0));
  const totalStars=()=>Object.keys(levelStars).reduce((sum,key)=>sum+starsForLevel(Number(key)),0);
  const clearedLevelsCount=()=>LEVELS.reduce((sum,level)=>sum+(starsForLevel(level.id)>0?1:0),0);
  const chapterOfLevel=id=>Math.floor((id-1)/10)+1;
  const chapterLevels=chapter=>LEVELS.slice((chapter-1)*10,chapter*10);
  const chapterStars=chapter=>chapterLevels(chapter).reduce((sum,level)=>sum+starsForLevel(level.id),0);
  const chapterCleared=chapter=>chapterLevels(chapter).filter(level=>starsForLevel(level.id)>0).length;
  const calculateStars=(level,movesLeft)=>movesLeft>=level.star3Moves?3:(movesLeft>=level.star2Moves?2:1);
  const starText=stars=>'★'.repeat(stars)+'☆'.repeat(3-stars);

  function normalizeEstateStyles(raw){
    const out={};
    if(raw&&typeof raw==='object'){
      for(const task of ESTATE_TASKS){
        if(!task.styles)continue;
        const value=Math.floor(Number(raw[task.id]));
        if(value>=1&&value<=task.styles.length)out[task.id]=value;
      }
    }
    for(const id of estateDone){
      const task=ESTATE_TASKS.find(t=>t.id===id);
      if(task?.styles&&!out[id])out[id]=1;
    }
    return out;
  }
  function applyLoadedProgress(data){
    if(!data||typeof data!=='object')return;
    if(Number.isInteger(data.unlockedLevel))unlockedLevel=Math.max(1,Math.min(LEVELS.length,data.unlockedLevel));
    if(Number.isFinite(data.renovationTokens))renovationTokens=Math.max(0,Math.min(100,Math.floor(data.renovationTokens)));
    if(Array.isArray(data.rewardedLevels))rewardedLevels=[...new Set(data.rewardedLevels.filter(n=>Number.isInteger(n)&&n>=1&&n<=LEVELS.length))];
    if(Array.isArray(data.estateDone))estateDone=[...new Set(data.estateDone.filter(id=>ESTATE_TASKS.some(t=>t.id===id)))];
    estateStyles=normalizeEstateStyles(data.estateStyles);
    levelStars=normalizeLevelStars(data.levelStars);
    bestScores=normalizeBestScores(data.bestScores);
    if(Number.isFinite(data.coins))coins=Math.max(0,Math.min(9999999,Math.floor(data.coins)));
    if(data.inventory&&typeof data.inventory==='object')inventory=normalizeInventory(data.inventory);
    if(typeof data.dailyLastClaim==='string')dailyLastClaim=Number.isFinite(dateOrdinal(data.dailyLastClaim))?data.dailyLastClaim:'';
    if(Number.isFinite(data.dailyStreak))dailyStreak=Math.max(0,Math.min(7,Math.floor(data.dailyStreak)));
    if(Number.isFinite(data.dailyTotalClaims))dailyTotalClaims=Math.max(0,Math.floor(data.dailyTotalClaims));
    if(typeof data.estateLightsOn==='boolean')estateLightsOn=data.estateLightsOn;
    if(typeof data.musicEnabled==='boolean')musicEnabled=data.musicEnabled;
    if(typeof data.soundEnabled==='boolean')soundEnabled=data.soundEnabled;
    if(Number.isInteger(data.selectedEstateZone))selectedEstateZone=Math.max(1,Math.min(ESTATE_ZONES.length,data.selectedEstateZone));
    if(Number.isInteger(data.selectedCampaignChapter))selectedCampaignChapter=Math.max(1,Math.min(ESTATE_ZONES.length,data.selectedCampaignChapter));
    for(const id of rewardedLevels)if(!levelStars[id])levelStars[id]=1;
    if(data.tutorial&&typeof data.tutorial==='object'&&['new','active','done','skipped'].includes(data.tutorial.status))tutorialProgress={version:1,status:data.tutorial.status,step:Math.max(0,Math.min(16,Math.floor(Number(data.tutorial.step)||0)))};
    else if(unlockedLevel>1||rewardedLevels.length||Object.keys(levelStars).length)tutorialProgress={version:1,status:'done',step:16};
  }
  function loadProgress(){
 for(const key of [SAVE_KEY,SAVE_KEY+'Backup',...LEGACY_SAVE_KEYS]){
  try{const raw=localStorage.getItem(key);if(!raw)continue;const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))continue;applyLoadedProgress(data);saveRevision=Number(data.updatedAt)||0;
  if(['auto','high','medium','low'].includes(data.quality))quality=data.quality;document.body.dataset.quality=effectiveQuality();return;
  }catch(_){continue;}
 }
}
  function saveProgress(){
 saveRevision=Date.now();const serialized=JSON.stringify(progressSnapshot());
 try{const previous=localStorage.getItem(SAVE_KEY);if(previous){try{JSON.parse(previous);localStorage.setItem(SAVE_KEY+'Backup',previous);}catch(_){ }}localStorage.setItem(SAVE_KEY,serialized);}
 catch(_){if(!saveWarningShown){saveWarningShown=true;showToast('\u0425\u0440\u0430\u043d\u0438\u043b\u0438\u0449\u0435 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u043e. \u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441 \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u044d\u0442\u043e\u0439 \u0441\u0435\u0441\u0441\u0438\u0438.','bad');}}
 window.GardenPlatform?.save(serialized);
}

  function updateStarProgressUI(){
    const total=totalStars(),cleared=clearedLevelsCount();
    if(totalStarsSide)totalStarsSide.textContent=`${total} / 300`;
    if(campaignStars)campaignStars.textContent=`${total} / 300 ★`;
    if(campaignCleared)campaignCleared.textContent=`Пройдено ${cleared} / 100`;
  }


  function updateTokenUI(){document.querySelectorAll('[data-renovation-tokens]').forEach(el=>el.textContent=String(renovationTokens))}
  function awardRenovationToken(levelId){
    if(rewardedLevels.includes(levelId))return false;
    rewardedLevels.push(levelId);
    renovationTokens++;
    saveProgress();updateTokenUI();updateEstateUI();
    return true;
  }

  function inventoryTotal(){return Object.keys(BOOSTER_DEFS).reduce((sum,key)=>sum+(Number(inventory[key])||0),0)}
  function updateEconomyUI(){
    const stock=boosterStock();
    document.querySelectorAll('[data-coins]').forEach(el=>el.textContent=coins.toLocaleString('ru-RU'));
    if(shopCoins)shopCoins.textContent=coins.toLocaleString('ru-RU');
    if(boosterOwnedSide)boosterOwnedSide.textContent=String(inventoryTotal());
    document.querySelectorAll('[data-booster-count]').forEach(el=>{const key=el.dataset.boosterCount;el.textContent=String(stock[key]||0)});
    document.querySelectorAll('[data-booster]').forEach(btn=>{
      const key=btn.dataset.booster,has=(stock[key]||0)>0;
      btn.classList.toggle('active',activeBooster===key);
      btn.disabled=!has||gameState!=='playing'||busy||(tutorial?.active&&(document.body.dataset.tutorialKind!=='booster'||key!=='hammer'||!tutorial.accepting));
      btn.setAttribute('aria-pressed',String(activeBooster===key));
    });
    const shuffleSide=document.getElementById('shuffleBtn');
    if(shuffleSide){shuffleSide.disabled=(inventory.shuffle||0)<=0||gameState!=='playing'||busy;shuffleSide.textContent=`🔀 Перемешивание · ${inventory.shuffle||0}`;}
    if(boosterStatus){
      boosterStatus.classList.toggle('active',!!activeBooster);
      boosterStatus.textContent=activeBooster?`${BOOSTER_DEFS[activeBooster].icon} Выбери клетку на поле`:'Выбери усилитель при необходимости';
    }
    boardEl.classList.toggle('booster-target',!!activeBooster);
    if(!shopModal.hidden)renderShop();
  }
  function renderShop(){
    shopItems.replaceChildren();
    for(const [key,def] of Object.entries(BOOSTER_DEFS)){
      const item=document.createElement('article');item.className='shop-item';
      const icon=document.createElement('div');icon.className='si-icon art-shop-icon';icon.appendChild(artImg(def.asset,'',''));
      const title=document.createElement('h4');title.textContent=def.name;
      const desc=document.createElement('p');desc.textContent=def.desc;
      const owned=document.createElement('div');owned.className='shop-owned';owned.append(document.createTextNode('В запасе: '));const ownedNumber=document.createElement('b');ownedNumber.textContent=String(inventory[key]||0);owned.append(ownedNumber);
      const buy=document.createElement('button');buy.type='button';buy.className='shop-buy';buy.dataset.buyBooster=key;buy.textContent=`Купить · ${def.price} 🪙`;buy.disabled=coins<def.price;
      buy.addEventListener('click',()=>buyBooster(key));
      item.append(icon,title,desc,owned,buy);shopItems.appendChild(item);
    }
    shopCoins.textContent=coins.toLocaleString('ru-RU');
  }
  function openShop(){
    if(tutorial?.active)return;
    activeBooster=null;updateEconomyUI();renderShop();shopModal.hidden=false;shopModal.setAttribute('aria-hidden','false');
  ;refreshPause();}
  function closeShop(){shopModal.hidden=true;shopModal.setAttribute('aria-hidden','true');refreshPause();}
  function buyBooster(key){
 const def=BOOSTER_DEFS[key],now=performance.now();if(!def||now-lastShopPurchase<300||coins<def.price||(inventory[key]||0)>=999)return;
 lastShopPurchase=now;coins-=def.price;inventory[key]=(inventory[key]||0)+1;saveProgress();updateEconomyUI();renderShop();sfx('coin');showToast(def.name+' \u043a\u0443\u043f\u043b\u0435\u043d','good');
}
  function rewardCoins(level,stars,first){const reward=first?45+stars*10+Math.floor(level.id/10)*3:Math.max(3,stars*3);coins=Math.min(9999999,coins+reward);return reward;}
  function consumeBooster(key){
    if(tutorial?.active){const stock=boosterStock();if((stock[key]||0)<=0)return false;stock[key]--;activeBooster=null;updateEconomyUI();return true;}
    if((inventory[key]||0)<=0)return false;
    inventory[key]--;activeBooster=null;saveProgress();updateEconomyUI();return true;
  }

  function localDateKey(date=new Date()){
    const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  function dateOrdinal(key){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return NaN;const[y,m,d]=key.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return NaN;return Math.floor(date.getTime()/86400000);
}
  function dailyState(){
    const today=localDateKey();
    if(!dailyLastClaim)return{today,available:true,day:1,claimedToday:false,broken:false};
    const diff=dateOrdinal(today)-dateOrdinal(dailyLastClaim);
    if(diff===0)return{today,available:false,day:dailyStreak||1,claimedToday:true,broken:false};
    if(diff===1)return{today,available:true,day:dailyStreak>=7?1:Math.max(1,dailyStreak+1),claimedToday:false,broken:false};
    if(diff>1)return{today,available:true,day:1,claimedToday:false,broken:true};
    return{today,available:false,day:dailyStreak||1,claimedToday:true,broken:false,clockBack:true};
  }
  function rewardDescription(def){
    const parts=[];
    if(def.reward.coins)parts.push(`+${def.reward.coins} 🪙`);
    if(def.reward.boosters)for(const [key,count] of Object.entries(def.reward.boosters))parts.push(`${BOOSTER_DEFS[key]?.icon||'⚡'} ×${count}`);
    return parts.join(' · ');
  }
  function updateDailyUI(){
    const st=dailyState(),def=DAILY_REWARDS[st.day-1];
    dailyBtn.classList.toggle('ready',st.available);
    document.querySelector('.daily-mini')?.classList.toggle('ready',st.available);
    dailyMiniTitle.textContent=st.available?`День ${st.day} из 7`:`Серия: ${dailyStreak} / 7`;
    dailyMiniText.textContent=st.available?`${def.icon} ${def.title} ждёт тебя.`:(st.clockBack?'Проверь дату на устройстве.':'Сегодняшняя награда уже получена.');
    dailySideBtn.textContent=st.available?'Забрать подарок':'Посмотреть серию';
    dailyStreakText.textContent=`${dailyStreak} / 7 · всего получено: ${dailyTotalClaims}`;
    dailyStatusText.textContent=st.available
      ?(st.broken?'Серия была прервана. Сегодня начинается новый день 1.':`Сегодня доступен день ${st.day}: ${rewardDescription(def)}.`)
      :(st.clockBack?'Дата устройства раньше последней сохранённой даты. Награда временно недоступна.':'Сегодня награда уже получена. Следующий подарок — завтра.');
    dailyClaimBtn.disabled=!st.available;
    dailyClaimBtn.textContent=st.available?`Забрать: ${def.icon} ${def.title}`:'Получено сегодня';
    renderDailyGrid(st);
  }
  function renderDailyGrid(st=dailyState()){
    dailyGrid.replaceChildren();
    DAILY_REWARDS.forEach(def=>{
      const card=document.createElement('div');
      const claimedThisCycle=st.claimedToday?def.day<=dailyStreak:def.day<st.day&&dailyStreak>0&&!st.broken;
      card.className='daily-day'+(def.day===st.day?' current':'')+(claimedThisCycle?' claimed':'');
      const num=document.createElement('span');num.className='dd-num';num.textContent=`День ${def.day}`;
      const icon=document.createElement('span');icon.className='dd-icon art-daily-icon';icon.appendChild(artImg(def.asset,'',''));
      const title=document.createElement('b');title.textContent=def.title;
      const note=document.createElement('small');note.textContent=def.note;
      card.append(num,icon,title,note);
      if(claimedThisCycle){const check=document.createElement('span');check.className='dd-check';check.textContent='✓';card.appendChild(check)}
      dailyGrid.appendChild(card);
    });
  }
  function openDailyRewards(){if(tutorial?.active)return;updateDailyUI();dailyModal.hidden=false;dailyModal.setAttribute('aria-hidden','false');setTimeout(()=>dailyClaimBtn.focus(),0);refreshPause();}
  function closeDailyRewards(){dailyModal.hidden=true;dailyModal.setAttribute('aria-hidden','true');refreshPause();}
  function claimDailyReward(){
    const st=dailyState();if(!st.available)return false;
    const def=DAILY_REWARDS[st.day-1];
    if(st.broken||st.day===1)dailyStreak=1;else dailyStreak=st.day;
    dailyLastClaim=st.today;dailyTotalClaims++;
    if(def.reward.coins)coins+=def.reward.coins;
    if(def.reward.boosters)for(const [key,count] of Object.entries(def.reward.boosters))inventory[key]=Math.min(999,(inventory[key]||0)+count);
    saveProgress();updateEconomyUI();updateDailyUI();sfx('reward');spawnArtFx('fx/reward_glow.png',null,130);
    showToast(`🎁 День ${def.day}: ${rewardDescription(def)}`,'good');
    return true;
  }

  
  
  
  
  
  
  
  

  function showToast(text,kind=''){
    if(tutorial?.active){tutorial.notify(text,kind);return;}
    clearTimeout(toastTimer);
    toastEl.textContent=text;
    toastEl.className='toast show'+(kind?' '+kind:'');
    toastTimer=setTimeout(()=>toastEl.className='toast',1500);
  }
  function setBusy(v){
 busy=!!v;boardEl.classList.toggle('busy',busy);updateEconomyUI();
 levelSelect.disabled=!!tutorial?.active||busy&&gameState==='playing';
 for(const id of ['gameTab','estateTab','mapTab','restartTop']){const b=document.getElementById(id);if(b)b.disabled=!!tutorial?.active||busy&&gameState==='playing';}
 for(const id of ['shopBtn','shopSideBtn','dailyBtn','dailySideBtn','settingsShop','settingsDaily','settingsTutorial'])document.getElementById(id).disabled=!!tutorial?.active;
 document.getElementById('settingsTutorial').disabled=busy&&gameState==='playing';document.getElementById('settingsTutorial').textContent=tutorial?.active?'Повторить задание':'Пройти обучение';
 tutorial?.syncControls();
}
  function updateHud(){
 scoreEl.textContent=score.toLocaleString('ru-RU');movesEl.textContent=moves;levelNumberEl.textContent=currentLevel().id;bestComboEl.textContent='\u00d7'+bestCombo;
 document.getElementById('levelName').textContent=currentLevel().title;movesEl.closest('.stat').classList.toggle('low-moves',moves<=5&&gameState==='playing'&&!tutorial?.active);updateGoalsUI();
 if(tutorial?.active)levelNumberEl.textContent=tutorial.lesson;
}

  function goalProgress(goal){
    if(goal.kind==='score')return score;
    if(goal.kind==='collect')return collected[goal.type]||0;
    if(goal.kind==='ice')return cleared.ice;
    if(goal.kind==='crate')return cleared.crate;
    if(goal.kind==='chain')return cleared.chain;
    if(goal.kind==='drop')return cleared.drop;
    return 0;
  }
  function goalDone(goal){return goalProgress(goal)>=goal.target}
  function goalsComplete(){return currentLevel().goals.every(goalDone)}
  
  function goalLabel(goal,short=false){
    if(goal.kind==='score')return short?'Счёт':'Набрать очки';
    if(goal.kind==='ice')return short?'Лёд':'Очистить клетки ото льда';
    if(goal.kind==='crate')return short?'Ящики':'Разбить деревянные ящики';
    if(goal.kind==='chain')return short?'Цепи':'Разбить цепи';
    if(goal.kind==='drop')return short?'Ключи':'Опустить ключи вниз';
    return short?['Рубин','Сапфир','Изумруд','Топаз','Аметист','Аквамарин'][goal.type]:'Собрать '+['рубины','сапфиры','изумруды','топазы','аметисты','аквамарины'][goal.type];
  }
  function goalDescription(goal){
    if(goal.kind==='score')return `Набрать ${goal.target.toLocaleString('ru-RU')} очков`;
    if(goal.kind==='ice')return `Очистить лёд: ${goal.target}`;
    if(goal.kind==='crate')return `Разбить ящики: ${goal.target}`;
    if(goal.kind==='chain')return `Разбить цепи: ${goal.target}`;
    if(goal.kind==='drop')return `Опустить ключи: ${goal.target}`;
    return `Собрать ${goal.target} ${GEM_NAMES[goal.type]}`;
  }
  function makeGoalRow(goal,showProgress=true){
    const progress=Math.min(goal.target,goalProgress(goal));
    const row=document.createElement('div');
    row.className='result-goal';
    const left=document.createElement('span');left.className='result-goal-left';
    left.append(artImg(goalAsset(goal),'result-goal-art',''),document.createTextNode(goalDescription(goal)));
    const right=document.createElement('b');
    right.textContent=showProgress?`${progress}/${goal.target}`:`${goal.target}`;
    row.append(left,right);
    return row;
  }
  function updateGoalsUI(){
    goalsPanel.replaceChildren();
    sideObjectives.replaceChildren();
    const level=currentLevel();
    for(const goal of level.goals){
      const progress=goalProgress(goal), pct=Math.max(0,Math.min(100,progress/goal.target*100));
      const chip=document.createElement('div');
      chip.className='goal-chip'+(goalDone(goal)?' done':'');
      const top=document.createElement('div'); top.className='goal-top';
      const label=document.createElement('span');label.className='goal-label-wrap';label.append(artImg(goalAsset(goal),'goal-art-icon',''),document.createTextNode(goalLabel(goal,true)));
      const value=document.createElement('span');value.className='goal-value';value.textContent=`${Math.min(progress,goal.target)}/${goal.target}`;
      const bar=document.createElement('div');bar.className='goal-bar';
      const fill=document.createElement('div');fill.className='goal-fill';fill.style.width=pct+'%';
      top.append(label,value);bar.appendChild(fill);chip.append(top,bar);goalsPanel.appendChild(chip);

      const obj=document.createElement('div');obj.className='objective-row';
      const icon=document.createElement('span');icon.className='objective-icon art';icon.appendChild(artImg(goalAsset(goal),'objective-art-icon',''));
      const text=document.createElement('span');text.textContent=goalDescription(goal);
      obj.append(icon,text);sideObjectives.appendChild(obj);
    }
    sideLevelTitle.textContent=`Уровень ${level.id} — ${level.title}`;
    const best=starsForLevel(level.id);
    sideLevelText.textContent=`Выполни ${level.goals.length===1?'цель':'все цели'} за ${level.moves} ходов. Лучший результат: ${starText(best)}. 2★ — оставить ${level.star2Moves}+ ходов, 3★ — ${level.star3Moves}+.`;
    unlockText.textContent=`Открыто: ${unlockedLevel} / ${LEVELS.length} · ★ ${totalStars()} / 300`;
  }

  function populateLevelSelect(){
    const selectedId=currentLevel().id;
    levelSelect.replaceChildren();
    LEVELS.forEach((level,i)=>{
      const opt=document.createElement('option');
      const stars=starsForLevel(level.id);
      opt.value=String(i);
      opt.textContent=`${level.id}. ${level.title}${stars?` · ${starText(stars)}`:''}${level.id>unlockedLevel?' 🔒':''}`;
      opt.disabled=level.id>unlockedLevel;
      opt.selected=level.id===selectedId;
      levelSelect.appendChild(opt);
    });
  }

  function selectCampaignChapter(chapter,scroll=false){
    selectedCampaignChapter=Math.max(1,Math.min(10,Math.floor(Number(chapter))||1));
    saveProgress();
    renderCampaignMap();
    if(scroll)document.querySelector('.campaign-card')?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function renderCampaignMap(){
    updateStarProgressUI();
    if(!chapterStrip||!levelMapGrid)return;
    chapterStrip.replaceChildren();
    ESTATE_ZONES.forEach(zone=>{
      const unlocked=unlockedLevel>=zone.unlockLevel,cleared=chapterCleared(zone.id),stars=chapterStars(zone.id);
      const btn=document.createElement('button');btn.type='button';
      btn.className='chapter-btn'+(selectedCampaignChapter===zone.id?' active':'')+(unlocked?'':' locked')+(cleared===10?' complete':'');
      btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(selectedCampaignChapter===zone.id));
      btn.setAttribute('aria-label',`Глава ${zone.id}. ${zone.title}. ${stars} из 30 звёзд`);
      const icon=document.createElement('span');icon.className='ci';icon.textContent=unlocked?zone.icon:'🔒';
      const name=document.createElement('b');name.textContent=String(zone.id);
      const stat=document.createElement('small');stat.textContent=unlocked?`${stars}/30 ★`:`ур. ${zone.unlockLevel}`;
      btn.append(icon,name,stat);btn.addEventListener('click',()=>selectCampaignChapter(zone.id));chapterStrip.appendChild(btn);
    });
    const zone=ESTATE_ZONES[selectedCampaignChapter-1];
    campaignChapterKicker.textContent=`Глава ${zone.id} · уровни ${zone.levels}`;
    campaignChapterTitle.textContent=zone.title;
    campaignChapterStats.textContent=`${chapterStars(zone.id)} / 30 ★ · ${chapterCleared(zone.id)} / 10 пройдено`;
    levelMapGrid.replaceChildren();
    chapterLevels(zone.id).forEach(level=>{
      const stars=starsForLevel(level.id),locked=level.id>unlockedLevel;
      const btn=document.createElement('button');btn.type='button';btn.disabled=locked;
      btn.className='level-node'+(level.id%10===0?' milestone':level.id%5===0?' challenge':'')+(stars?' cleared':'')+(currentLevel().id===level.id?' current':'');
      btn.setAttribute('aria-label',locked?`Уровень ${level.id} закрыт`:`Уровень ${level.id}. ${level.title}. ${stars} звёзд из 3`);
      const num=document.createElement('span');num.className='ln';num.textContent=String(level.id);
      const mark=document.createElement('span');mark.className=locked?'lockmark art-lock':'ls art-stars';
      if(locked)mark.style.backgroundImage=`url("${asset('match3/ui/badge_locked.png')}")`;
      else mark.style.backgroundImage=`url("${asset(stars===1?'match3/ui/star_badge_1.png':stars===2?'match3/ui/star_badge_2.png':stars===3?'match3/ui/star_badge_3.png':'match3/ui/star_badge_empty.png')}")`;
      btn.append(num,mark);
      if(!locked)btn.addEventListener('click',()=>{currentLevelIndex=level.id-1;selectedCampaignChapter=zone.id;saveProgress();showBriefing();});
      levelMapGrid.appendChild(btn);
    });
  }

  function typeAt(b,i){const g=b[i];return !isGem(g)||isRainbow(g)?null:g.type}
  function makeTiles(level){
    const t=Array.from({length:SIZE*SIZE},()=>({hole:false,ice:0,iceMax:0,crate:0,crateMax:0,chain:0}));
    const layout=level.layout||{};
    for(const i of layout.holes||[])if(t[i])t[i].hole=true;
    for(const i of layout.ice||[])if(t[i]&&!t[i].hole){t[i].ice=Math.max(t[i].ice,1);t[i].iceMax=Math.max(t[i].iceMax,1)}
    for(const i of layout.ice2||[])if(t[i]&&!t[i].hole){t[i].ice=Math.max(t[i].ice,2);t[i].iceMax=Math.max(t[i].iceMax,2)}
    for(const i of layout.crates||[])if(t[i]&&!t[i].hole){t[i].crate=Math.max(t[i].crate,1);t[i].crateMax=Math.max(t[i].crateMax,1)}
    for(const i of layout.crates2||[])if(t[i]&&!t[i].hole){t[i].crate=Math.max(t[i].crate,2);t[i].crateMax=Math.max(t[i].crateMax,2)}
    for(const i of layout.chains||[])if(t[i]&&!t[i].hole&&!t[i].crate)t[i].chain=1;
    return t;
  }
  function buildBoardForLevel(){
    const level=currentLevel();
    for(let attempt=0;attempt<700;attempt++){
      tiles=makeTiles(level);
      const b=new Array(SIZE*SIZE).fill(null);
      for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
        const i=idx(r,c),t=tiles[i];
        if(t.hole||t.crate)continue;
        let color,guard=0;
        do{
          color=randType();guard++;
        }while(guard<60&&(
          (c>=2&&typeAt(b,idx(r,c-1))===color&&typeAt(b,idx(r,c-2))===color)||
          (r>=2&&typeAt(b,idx(r-1,c))===color&&typeAt(b,idx(r-2,c))===color)
        ));
        b[i]=makeGem(color);
      }
      for(const i of level.layout?.drops||[]){
        if(i>=0&&i<b.length&&!tiles[i].hole&&!tiles[i].crate&&!tiles[i].chain)b[i]=makeDrop();
      }
      board=b;
      if(!findMatchGroups(board).length&&hasPossibleMove(board))return b;
    }
    throw new Error('Не удалось создать игровое поле уровня');
  }

  function findMatchGroups(b=board){
    const groups=[];
    for(let r=0;r<SIZE;r++){
      let start=0;
      for(let c=1;c<=SIZE;c++){
        const base=start<SIZE?typeAt(b,idx(r,start)):null;
        const same=c<SIZE&&base!==null&&typeAt(b,idx(r,c))===base;
        if(!same){
          if(base!==null&&c-start>=3)groups.push({orientation:'h',type:base,indices:Array.from({length:c-start},(_,k)=>idx(r,start+k))});
          start=c;
        }
      }
    }
    for(let c=0;c<SIZE;c++){
      let start=0;
      for(let r=1;r<=SIZE;r++){
        const base=start<SIZE?typeAt(b,idx(start,c)):null;
        const same=r<SIZE&&base!==null&&typeAt(b,idx(r,c))===base;
        if(!same){
          if(base!==null&&r-start>=3)groups.push({orientation:'v',type:base,indices:Array.from({length:r-start},(_,k)=>idx(start+k,c))});
          start=r;
        }
      }
    }
    return groups;
  }
  function matchIndices(groups){const s=new Set();groups.forEach(g=>g.indices.forEach(i=>s.add(i)));return s}

  function wouldMakeMatch(b,a,bx){
    if(!canSwapCell(a)||!canSwapCell(bx))return false;
    const copy=b.map(g=>g?{...g}:null);
    [copy[a],copy[bx]]=[copy[bx],copy[a]];
    return findMatchGroups(copy).length>0;
  }
  function isDirectCombo(g1,g2){return isGem(g1)&&isGem(g2)&&((isRainbow(g1)&&!!g2)||(isRainbow(g2)&&!!g1)||(isPower(g1)&&isPower(g2)))}
  function hasPossibleMove(b=board){
    if(b.some((g,i)=>isTapPower(g)&&canSwapCell(i)))return true;
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const a=idx(r,c);if(!canSwapCell(a))continue;
      for(const bx of [c<SIZE-1?idx(r,c+1):-1,r<SIZE-1?idx(r+1,c):-1]){
        if(bx>=0&&canSwapCell(bx)&&(isDirectCombo(b[a],b[bx])||wouldMakeMatch(b,a,bx)))return true;
      }
    }
    return false;
  }
  function getHint(){
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
      const a=idx(r,c);if(!canSwapCell(a))continue;
      for(const bx of [c<SIZE-1?idx(r,c+1):-1,r<SIZE-1?idx(r+1,c):-1]){
        if(bx>=0&&canSwapCell(bx)&&(isDirectCombo(board[a],board[bx])||wouldMakeMatch(board,a,bx)))return[a,bx];
      }
    }
    const power=board.findIndex((g,i)=>isTapPower(g)&&canSwapCell(i));
    return power>=0?[power]:null;
  }

  function gemLabel(g,i){
    const t=tileAt(i);
    if(t.hole)return'Заблокированная клетка';
    if(t.crate)return t.crate>1?'Усиленный деревянный ящик':'Деревянный ящик';
    const extras=[];
    if(t.ice)extras.push(t.ice>1?'двойной лёд':'лёд');
    if(t.chain)extras.push('цепь');
    if(isDrop(g))return `Садовый ключ${extras.length?', '+extras.join(', '):''}`;
    let name='Пустая клетка';
    if(g){
      if(g.special===SPECIAL.RAINBOW)name='Радужный самоцвет';
      else if(g.special===SPECIAL.ROCKET_H)name='Горизонтальная ракета';
      else if(g.special===SPECIAL.ROCKET_V)name='Вертикальная ракета';
      else if(g.special===SPECIAL.BOMB)name='Бомба';
      else name=['Рубин','Сапфир','Изумруд','Топаз','Аметист','Аквамарин'][g.type]||'Самоцвет';
    }
    return name+(extras.length?', '+extras.join(', '):'')+(isTapPower(g)?'. Повторное нажатие активирует за один ход.':'');
  }
function render({dropIndices=[]}={}){
 const existing=[...boardEl.querySelectorAll('.cell')],frag=document.createDocumentFragment();
 for(let i=0;i<board.length;i++){
  const t=tileAt(i),g=board[i],cell=existing[i]||document.createElement('button');
  if(!existing[i]){cell.type='button';cell.dataset.index=i;cell.setAttribute('role','gridcell');frag.append(cell);}
  cell.className='cell';
  if(t.hole)cell.classList.add('hole','blocked-select');
  if(t.crate)cell.classList.add('crate-cell','blocked-select');
  if(t.chain||t.ice||isDrop(g))cell.classList.add('blocked-select');
  cell.setAttribute('aria-label',gemLabel(g,i));
  cell.setAttribute('aria-disabled',String(t.hole||!!t.crate));
  cell.dataset.tapPower=String(isTapPower(g));
  if(selected===i)cell.classList.add('selected');
  const tileKey=[t.hole,t.ice,t.crate,t.chain,t.iceMax,t.crateMax].join(':');
  if(cell.__gardenGem===g&&cell.__gardenTile===tileKey)continue;
  cell.__gardenGem=g;cell.__gardenTile=tileKey;cell.replaceChildren();
  const obstacle=(cls,p)=>{const el=document.createElement('span');el.className='obstacle '+cls+' art-obstacle';el.style.backgroundImage=`url("${asset(p)}")`;cell.append(el);};
  if(t.ice)obstacle('ice-layer'+(t.ice>1?' double':''),t.ice>1?'match3/obstacles/ice_double.png':t.iceMax>1?'match3/obstacles/ice_reinforced_cracked.png':'match3/obstacles/ice.png');
  if(t.crate)obstacle('crate-layer'+(t.crate>1?' strong':''),t.crate>1?'match3/obstacles/crate_reinforced.png':t.crateMax>1?'match3/obstacles/crate_reinforced_damaged.png':'match3/obstacles/crate.png');
  else if(isDrop(g)){
   const el=document.createElement('span');el.className='drop-item art-drop';el.style.backgroundImage=`url("${asset('match3/obstacles/key.png')}")`;cell.append(el);
  }else if(g){
   const gem=document.createElement('span');gem.className='gem art-gem';
   if(Number.isInteger(g.type))gem.dataset.type=g.type;
   let normal=GEM_ASSETS[g.type]||GEM_ASSETS[0],glow=normal;
   if(g.special){gem.classList.add('special',g.special);const pair=SPECIAL_ASSETS[g.special];if(pair)[normal,glow]=pair;}
   gem.style.setProperty('--asset-normal',`url("${asset(normal)}")`);gem.style.setProperty('--asset-glow',`url("${asset(glow||normal)}")`);
   cell.append(gem);
  }
  if(t.chain)obstacle('chain-layer','match3/obstacles/chain_lock.png');
 }
 boardEl.append(frag);updateHud();
 if(!tutorial?.active)for(const c of boardEl.querySelectorAll('.cell')){c.tabIndex=0;delete c.dataset.lessonMarker;c.removeAttribute('aria-describedby');}
 tutorial?.decorate();
 if(dropIndices.length&&!reducedQuery.matches)for(const i of dropIndices){
  playMotion(boardEl.querySelector('.cell[data-index="'+i+'"] .gem'),[{transform:'translateY(-10px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:240,delay:(i%SIZE)*12});
 }
}
function selectCell(i){
 selected=i;
 boardEl.querySelectorAll('.cell').forEach(c=>c.classList.toggle('selected',Number(c.dataset.index)===i));
 if(i!==null){
  const p=cellPoint(i),cell=boardEl.querySelector('.cell[data-index="'+i+'"]'),size=cell?.offsetWidth||40;
  sfx('touch');
  const n=emitFX('selection-glint',p.x-size*.15,p.y-size*.3,10,320);
  playMotion(n,[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(1.2) rotate(30deg)',opacity:1,offset:.4},{transform:'translate(-50%,-50%) scale(.5) rotate(70deg)',opacity:0}],{duration:320});
 }
 tutorial?.decorate();
}


  function chooseAnchor(indices,preferred=[],used=new Set()){
    for(const p of preferred)if(indices.includes(p)&&!used.has(p)&&canAnchor(p)&&!board[p].special)return p;
    const normal=indices.filter(i=>!used.has(i)&&canAnchor(i)&&!board[i].special);
    if(!normal.length)return null;
    return normal[Math.floor((normal.length-1)/2)];
  }
  function planSpecialCreations(groups,preferred=[]){
    const creations=[],used=new Set(),consumedGroups=new Set();
    const sorted5=groups.map((g,i)=>({g,i})).filter(x=>x.g.indices.length>=5).sort((a,b)=>b.g.indices.length-a.g.indices.length);
    for(const {g,i} of sorted5){
      const anchor=chooseAnchor(g.indices,preferred,used);
      if(anchor!==null){
        creations.push({index:anchor,type:null,special:SPECIAL.RAINBOW});
        used.add(anchor);consumedGroups.add(i);
      }
    }

    const memberships=new Map();
    groups.forEach((g,gi)=>g.indices.forEach(i=>{
      if(!memberships.has(i))memberships.set(i,[]);
      memberships.get(i).push(gi);
    }));
    for(const [cell,gis] of memberships){
      if(gis.some(i=>consumedGroups.has(i)))continue;
      const hs=gis.filter(i=>groups[i].orientation==='h'),vs=gis.filter(i=>groups[i].orientation==='v');
      if(!hs.length||!vs.length)continue;
      const gh=groups[hs[0]],gv=groups[vs[0]];
      if(gh.type!==gv.type)continue;
      const union=[...new Set([...gh.indices,...gv.indices])];
      const anchor=(!used.has(cell)&&canAnchor(cell)&&!board[cell].special)?cell:chooseAnchor(union,preferred,used);
      if(anchor!==null){
        creations.push({index:anchor,type:gh.type,special:SPECIAL.BOMB});
        used.add(anchor);gis.forEach(i=>consumedGroups.add(i));
      }
    }

    groups.forEach((g,i)=>{
      if(consumedGroups.has(i)||g.indices.length!==4)return;
      const anchor=chooseAnchor(g.indices,preferred,used);
      if(anchor===null)return;
      creations.push({index:anchor,type:g.type,special:g.orientation==='h'?SPECIAL.ROCKET_H:SPECIAL.ROCKET_V});
      used.add(anchor);
    });
    return creations;
  }

  function mostCommonType(exclude=null){
    const counts=Array(TYPES).fill(0);
    board.forEach(g=>{if(g&&g.type!==null&&g.type!==exclude)counts[g.type]++});
    let best=0;
    for(let i=1;i<TYPES;i++)if(counts[i]>counts[best])best=i;
    return best;
  }

  function collectClear(initial,protectedSet=new Set()){
    const queue=[...new Set(initial)],clearSet=new Set(),activated=new Set(),beams=[],crateHits=new Set();
    while(queue.length){
      const i=queue.shift();
      if(i<0||i>=board.length)continue;
      const t=tileAt(i);
      if(t.hole)continue;
      if(t.crate){crateHits.add(i);continue}
      if(protectedSet.has(i)||clearSet.has(i)||!board[i]||isDrop(board[i]))continue;
      clearSet.add(i);
      const g=board[i];
      if(!g.special||activated.has(i))continue;
      activated.add(i);
      const[r,c]=rc(i);
      if(g.special===SPECIAL.ROCKET_H){
        beams.push({kind:'h',r,c});
        for(let x=0;x<SIZE;x++)queue.push(idx(r,x));
      }else if(g.special===SPECIAL.ROCKET_V){
        beams.push({kind:'v',r,c});
        for(let y=0;y<SIZE;y++)queue.push(idx(y,c));
      }else if(g.special===SPECIAL.BOMB){
        for(let y=Math.max(0,r-1);y<=Math.min(SIZE-1,r+1);y++)
          for(let x=Math.max(0,c-1);x<=Math.min(SIZE-1,c+1);x++)queue.push(idx(y,x));
      }else if(g.special===SPECIAL.RAINBOW){
        const color=mostCommonType();
        for(let x=0;x<board.length;x++)if(isGem(board[x])&&board[x].type===color)queue.push(x);
      }
    }
    for(const i of clearSet){
      const[r,c]=rc(i);
      for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nr=r+dr,nc=c+dc;
        if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE){const n=idx(nr,nc);if(tileAt(n).crate)crateHits.add(n)}
      }
    }
    return{clear:clearSet,activated,beams,crateHits};
  }

function specialFeedback(fx,indices,chain,context,initial,handlers){
 const pitch=boardEl.querySelector('.cell:not(.hole)')?.offsetWidth||40;
 const plan=GardenFX.createPlan({size:SIZE,width:boardEl.clientWidth,height:boardEl.clientHeight,pitch,
  centers:Array.from({length:board.length},(_,i)=>cellPoint(i)),board:board.map(g=>g?{...g}:null),tiles,
  initial:[...initial],cleared:indices,crateHits:[...fx.crateHits],activated:[...fx.activated],context,chain,commonType:mostCommonType()});
 boardEl.dataset.fxKind=plan.kind;
 return GardenFX.play(boardEl,plan,{url:asset,tier:effectiveQuality,...handlers,
  onCue:(name,cue)=>{sfx(name,chain);if(cue.strong)v11Impact(true);}}).finally(()=>delete boardEl.dataset.fxKind);
}

  function damageObstacles(fx){
    let bonus=0;
    for(const i of fx.clear){
      const t=tileAt(i);
      if(t.ice>0){
        t.ice--;
        bonus+=15;
        if(t.ice===0)cleared.ice++;
      }
      if(t.chain>0){
        t.chain--;
        bonus+=20;
        if(t.chain===0)cleared.chain++;
      }
    }
    for(const i of fx.crateHits){
      const t=tileAt(i);
      if(t.crate>0){
        t.crate--;
        bonus+=25;
        if(t.crate===0){cleared.crate++;board[i]=null;bonus+=25}
      }
    }
    return bonus;
  }


function spawnArtFx(path,index=null,size=92,duration=700){
 const p=index===null?{x:boardEl.clientWidth/2,y:boardEl.clientHeight/2}:cellPoint(index);
 const n=emitFX('sprite-impact',p.x,p.y,Math.min(size,boardEl.clientWidth*.7),duration);if(!n)return;
 n.style.backgroundImage='url("'+asset(path)+'")';
 playMotion(n,[{transform:'translate(-50%,-50%) scale(.25)',opacity:0},
  {transform:'translate(-50%,-50%) scale(.8)',opacity:.82,offset:.2},
  {transform:'translate(-50%,-50%) scale(1.12)',opacity:0}],{duration});
}


  function setResultArt(kind){
    resultIcon.classList.add('art-result-banner');const p=kind==='win'?'ui/banners/victory_ru.png':kind==='lose'?'ui/banners/defeat_ru.png':kind==='complete'?'ui/banners/level_complete_ru.png':'branding/logo_gem_garden_ru.png';resultIcon.style.backgroundImage=`url("${asset(p)}")`;resultIcon.textContent='';
  }
  function v11Impact(strong=false){if(!strong||reducedQuery.matches||effectiveQuality()==='low')return;playMotion(boardEl,[{transform:'translate(0,0)'},{transform:'translate(-2px,1px)'},{transform:'translate(2px,-1px)'},{transform:'translate(0,0)'}],{duration:160});}

  function spawnCelebration(count=34){
 if(reducedQuery.matches||document.hidden)return;
 const cap=effectiveQuality()==='high'?42:effectiveQuality()==='medium'?18:6;
 const colors=['#ffd85f','#7de7aa','#75baff','#ff7f98','#b58bff','#5be4df'];
 for(let i=0;i<Math.min(count,cap);i++){
  const x=innerWidth*(.12+(i*.618%1)*.76),dx=((i*73)%130)-65,duration=1200+(i*37)%500;
  const n=emitFX('celebration-piece',x,-12,i%2?6:8,duration,document.body);if(!n)break;
  n.style.backgroundColor=colors[i%colors.length];n.style.height=(i%2?9:5)+'px';
  playMotion(n,[{transform:'translate(-50%,-50%) rotate(0)',opacity:1},
   {transform:`translate(calc(-50% + ${dx}px),${innerHeight*.72}px) rotate(${i*53}deg)`,opacity:.85,offset:.8},
   {transform:`translate(calc(-50% + ${dx*1.2}px),${innerHeight}px) rotate(${i*79}deg)`,opacity:0}],{duration,easing:'cubic-bezier(.3,.15,.6,.8)'});
 }
}

async function animateAndRemove(initial,chain=1,protectedSet=new Set(),label='',context=null){
 const initialIndices=[...initial],fx=collectClear(initialIndices,protectedSet);if(!fx.clear.size&&!fx.crateHits.size)return 0;
 const generation=motionGeneration,before=currentLevel().goals.map(goalProgress),indices=[...fx.clear],cells=boardEl.querySelectorAll('.cell');
 const special=!!context||fx.activated.size>0,seen=new Set(),obstacleCues=new Set(),expectedCount=new Set([...fx.clear,...fx.crateHits]).size;let committed=false;
 function showSpecial(i,g){
  const el=cells[i]?.querySelector('.gem'),pair=SPECIAL_ASSETS[g?.special];if(!el||!pair)return;
  el.classList.add('special',g.special);el.style.setProperty('--asset-normal',`url("${asset(pair[0])}")`);el.style.setProperty('--asset-glow',`url("${asset(pair[1])}")`);
 }
 function commit(){
  if(committed||generation!==motionGeneration)return;committed=true;
  for(const i of indices){const g=board[i];if(isGem(g)&&Number.isInteger(g.type))collected[g.type]++;}
  const bonus=damageObstacles(fx);bestCombo=Math.max(bestCombo,chain);
  score+=fx.clear.size*10*chain+fx.activated.size*35*chain+bonus*chain;updateHud();
  if(label)showComboText(label);else if(chain>1)showCombo(chain);
  boardEl.dataset.cascade=String(Math.min(4,chain));goalFeedback(indices,before);
 }
 function onHit(i){
  if(seen.has(i)||generation!==motionGeneration)return;seen.add(i);
  const cell=cells[i],t=tileAt(i);cell?.classList.add('matching');cell?.classList.remove('fx-charging');
  const el=cell?.querySelector('.gem');
  if(fx.clear.has(i)){
   const frames=special?[{transform:'scale(1)',opacity:1,filter:'brightness(1)'},{transform:'scale(1.16)',opacity:1,filter:'brightness(1.45)',offset:.27},{transform:'scale(.38) rotate(7deg)',opacity:0,filter:'brightness(1.1)'}]:
    [{transform:'scale(1)',opacity:1,filter:'brightness(1)'},{transform:'scale(1.14)',opacity:1,filter:'brightness(1.35)',offset:.25},{transform:'scale(1.03)',opacity:.9,filter:'brightness(1.16)',offset:.56},{transform:'scale(.3) rotate(7deg)',opacity:0,filter:'brightness(1.05)'}];
   playMotion(el,frames,{duration:special?270:chain===1?380:chain===2?340:300,easing:special?'cubic-bezier(.18,.65,.55,1)':'linear'});
  }
  for(const layer of cell?.querySelectorAll('.obstacle')||[]){
   const ice=layer.classList.contains('ice-layer'),crate=layer.classList.contains('crate-layer'),intact=ice?t.ice>1:crate?t.crate>1:false;
   const sound=ice?'ice':crate?'wood':'chain';if(!obstacleCues.has(sound)){obstacleCues.add(sound);sfx(sound);}
   playMotion(layer,[{transform:'scale(1)'},{transform:'translate(-2px,0) scale(1.07)',offset:.2},{transform:'translate(2px,0)',offset:.4},{transform:'scale(1)',opacity:intact?1:0}],{duration:340});
  }
  if(seen.size===expectedCount)commit();
 }
 if(special){
  if(['booster-bomb','booster-rocket'].includes(context?.kind)){const i=context.pieces[0].i;playMotion(cells[i]?.querySelector('.gem'),[{opacity:1,transform:'scale(1)'},{opacity:.25,transform:'scale(.82)'}],{duration:220});}
  const roots=[...(context?.pieces||[]),...initialIndices.filter(i=>fx.activated.has(i)).map(i=>({i,g:board[i]}))],charged=new Set();
  for(const {i,g}of roots){if(!g?.special||charged.has(i))continue;charged.add(i);showSpecial(i,g);cells[i]?.classList.add('fx-charging');
   playMotion(cells[i]?.querySelector('.gem'),[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.07)',filter:'brightness(1.13)',offset:.4},{transform:'scale(.96)',filter:'brightness(1.3)',offset:.7},{transform:'scale(1.1)',filter:'brightness(1.18)'}],{duration:g.special===SPECIAL.ROCKET_H||g.special===SPECIAL.ROCKET_V?250:330});
  }
  await specialFeedback(fx,indices,chain,context,initialIndices,{onHit,onTransform:i=>{
   if(generation!==motionGeneration)return;const g=board[i];showSpecial(i,g);cells[i]?.classList.add('fx-charging');
   playMotion(cells[i]?.querySelector('.gem'),[{transform:'scale(.58)',filter:'brightness(1.6)',opacity:.4},{transform:'scale(1.15)',filter:'brightness(1.2)',opacity:1,offset:.55},{transform:'scale(1)',filter:'brightness(1)',opacity:1}],{duration:210});
  }});
 }else{
  const duration=chain===1?235:chain===2?185:135;
  for(const i of indices){cells[i]?.classList.add('matching');playMotion(cells[i]?.querySelector('.gem'),[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.105)',filter:'brightness(1.28)'}],{duration});}
  await specialFeedback(fx,indices,chain,null,initialIndices,{onHit});
 }
 if(generation!==motionGeneration)return 0;
 commit();for(const i of indices)if(!isDrop(board[i]))board[i]=null;
 for(const i of new Set([...fx.clear,...fx.crateHits]))cells[i]?.classList.remove('matching','fx-charging');
 return fx.clear.size+fx.crateHits.size;
}

async function revealCreatedPowers(creations){
 const items=creations.map(x=>({i:board.indexOf(x.piece),g:x.piece})).filter(x=>x.i>=0);if(!items.length)return;
 const pitch=boardEl.querySelector('.cell:not(.hole)')?.offsetWidth||40;
 const effects=items.map(({i},k)=>({...cellPoint(i),type:'creation',index:i,start:k*35,peak:210+k*35,travelEnd:500+k*35,end:810+k*35,seed:i+1}));
 for(const {i}of items)playMotion(boardEl.querySelector('.cell[data-index="'+i+'"] .gem'),[{transform:'scale(.55)',filter:'brightness(1.65)',opacity:.65},{transform:'scale(1.15)',filter:'brightness(1.2)',opacity:1,offset:.5},{transform:'scale(1)',filter:'brightness(1)',opacity:1}],{duration:760});
 sfx('created');await GardenFX.play(boardEl,{kind:'creation',width:boardEl.clientWidth,height:boardEl.clientHeight,pitch,duration:Math.min(1000,810+items.length*35),effects,hits:[],transforms:[],cues:[]},{url:asset,tier:effectiveQuality});
}

  function compactSegment(segment){
    if(!segment.length)return;
    const items=segment.map(i=>board[i]).filter(Boolean);
    segment.forEach(i=>board[i]=null);
    let write=segment.length-1;
    for(let k=items.length-1;k>=0;k--)board[segment[write--]]=items[k];
  }
  function collapse(){
    for(let c=0;c<SIZE;c++){
      let segment=[];
      const flush=()=>{compactSegment(segment);segment=[]};
      for(let r=SIZE-1;r>=0;r--){
        const i=idx(r,c),t=tileAt(i);
        if(t.crate){flush();continue}
        if(t.hole)continue;
        if(t.chain||t.ice){flush();continue}
        segment.unshift(i);
      }
      flush();
    }
  }
  function collectExitedDrops(){
    let n=0;
    for(let c=0;c<SIZE;c++){
      const i=idx(SIZE-1,c);
      if(!tileAt(i).hole&&!tileAt(i).crate&&isDrop(board[i])){
        board[i]=null;cleared.drop++;score+=100;n++;
      }
    }
    if(n){sfx('key');showComboText(n>1?'КЛЮЧИ ДОСТАВЛЕНЫ!':'КЛЮЧ ДОСТАВЛЕН!');updateHud()}
    return n;
  }
  function refill(){
    const drops=[];
    for(let i=0;i<board.length;i++){
      const t=tileAt(i);
      if(!t.hole&&!t.crate&&board[i]===null){
        board[i]=makeGem();
        if(tutorial?.active){const start=board[i].type;for(let k=0;k<TYPES;k++){board[i]=makeGem((start+k)%TYPES);if(!findMatchGroups().some(g=>g.indices.includes(i)))break;}}
        drops.push(i);
      }
    }
    return drops;
  }
async function settleAfterClear(){
 const generation=motionGeneration;
 const old=new Map();board.forEach((g,i)=>{if(g)old.set(g,i);});collapse();
 let guard=0;while(collectExitedDrops()&&guard++<8)collapse();refill();render();
 let longest=0;const cell=boardEl.querySelector('.cell:not(.hole)'),pitch=(cell?.offsetHeight||40)+(parseFloat(getComputedStyle(boardEl).rowGap)||0);
 board.forEach((g,i)=>{
  if(!g)return;const prior=old.get(g),r=Math.floor(i/SIZE),c=i%SIZE;
  const delta=prior===undefined?-Math.min(6,r+2):Math.floor(prior/SIZE)-r;if(!delta)return;
  const el=boardEl.querySelector('.cell[data-index="'+i+'"] .gem,.cell[data-index="'+i+'"] .drop-item');
  const duration=Math.min(390,145+Math.sqrt(Math.abs(delta))*70),delay=c*6+(prior===undefined?12:0);
  longest=Math.max(longest,duration+delay);
  playMotion(el,[
   {transform:`translateY(${delta*pitch}px) scale(.985,1.015)`,opacity:prior===undefined?.65:1,easing:'cubic-bezier(.45,.03,.72,.62)'},
   {transform:'translateY(0) scale(1.075,.92)',opacity:1,offset:.76,easing:'ease-out'},
   {transform:'translateY(-2px) scale(.985,1.02)',opacity:1,offset:.88},
   {transform:'translateY(0) scale(1)',opacity:1}
  ],{duration,delay,easing:'ease-out'});
 });
 await sleep(longest||45);if(generation!==motionGeneration)return;boardEl.dataset.cascade='1';sfx('land');
}


  async function resolveMatches(groups,chainStart=1,preferred=[]){
 let chain=chainStart,first=true;const generation=motionGeneration;
 while(groups.length){
  if(chain>90)throw Error('Cascade safety limit');
  const creations=planSpecialCreations(groups,first?preferred:[]),protectedSet=new Set(creations.map(x=>x.index));await animateAndRemove(matchIndices(groups),chain,protectedSet);
  if(generation!==motionGeneration)return;
  creations.forEach(x=>{x.piece=makeGem(x.type,x.special);board[x.index]=x.piece;});await settleAfterClear();if(generation!==motionGeneration)return;
  await revealCreatedPowers(creations);
  if(generation!==motionGeneration)return;
  groups=findMatchGroups();chain++;first=false;
 }
}

  function allIndices(){return Array.from({length:board.length},(_,i)=>i)}
  function cellsOfType(t){const out=[];for(let i=0;i<board.length;i++)if(isGem(board[i])&&board[i].type===t)out.push(i);return out}
  function rowsAround(r,radius){const s=[];for(let y=Math.max(0,r-radius);y<=Math.min(SIZE-1,r+radius);y++)for(let c=0;c<SIZE;c++)s.push(idx(y,c));return s}
  function colsAround(c,radius){const s=[];for(let x=Math.max(0,c-radius);x<=Math.min(SIZE-1,c+radius);x++)for(let r=0;r<SIZE;r++)s.push(idx(r,x));return s}
  function squareAround(i,radius){const[r,c]=rc(i),s=[];for(let y=Math.max(0,r-radius);y<=Math.min(SIZE-1,r+radius);y++)for(let x=Math.max(0,c-radius);x<=Math.min(SIZE-1,c+radius);x++)s.push(idx(y,x));return s}

  async function resolveDirectCombo(a,b){
    const generation=motionGeneration;
    const ga=board[a],gb=board[b];
    const presentation={pieces:[{i:a,g:{...ga}},{i:b,g:{...gb}}],kind:isRainbow(ga)&&isRainbow(gb)?'rainbow-pair':isRainbow(ga)||isRainbow(gb)?'rainbow-link':ga.special===SPECIAL.BOMB&&gb.special===SPECIAL.BOMB?'bomb-pair':ga.special===SPECIAL.BOMB||gb.special===SPECIAL.BOMB?'rocket-bomb':'rocket-pair'};
    let initial=[],label='СУПЕРКОМБО!';
    if(isRainbow(ga)&&isRainbow(gb)){
      initial=allIndices();label='РАДУЖНЫЙ ВЗРЫВ!';
    }else if(isRainbow(ga)||isRainbow(gb)){
      const rainbowIndex=isRainbow(ga)?a:b;
      const otherIndex=rainbowIndex===a?b:a;
      const other=board[otherIndex];
      const target=other.type;
      if(other.special===SPECIAL.ROCKET_H||other.special===SPECIAL.ROCKET_V){
        const targets=cellsOfType(target);
        targets.forEach((i,k)=>{if(i!==rainbowIndex)board[i]=makeGem(target,k%2?SPECIAL.ROCKET_V:SPECIAL.ROCKET_H)});
        initial=[rainbowIndex,...targets];label='РАДУГА + РАКЕТЫ!';
      }else if(other.special===SPECIAL.BOMB){
        const targets=cellsOfType(target);
        targets.forEach(i=>{if(i!==rainbowIndex)board[i]=makeGem(target,SPECIAL.BOMB)});
        initial=[rainbowIndex,...targets];label='РАДУГА + БОМБЫ!';
      }else{
        initial=[rainbowIndex,...cellsOfType(target)];label='ЦВЕТ УНИЧТОЖЕН!';
      }
    }else{
      const sa=ga.special,sb=gb.special,[r,c]=rc(b);
      const rockets=[SPECIAL.ROCKET_H,SPECIAL.ROCKET_V];
      if(rockets.includes(sa)&&rockets.includes(sb)){
        const[ra,ca]=rc(a),[rb,cb]=rc(b);
        initial=[...rowsAround(ra,0),...colsAround(ca,0),...rowsAround(rb,0),...colsAround(cb,0)];
        label='ДВОЙНАЯ РАКЕТА!';
      }else if(sa===SPECIAL.BOMB&&sb===SPECIAL.BOMB){
        initial=squareAround(b,2);label='МЕГАБОМБА!';
      }else if((sa===SPECIAL.BOMB&&rockets.includes(sb))||(sb===SPECIAL.BOMB&&rockets.includes(sa))){
        initial=[...rowsAround(r,1),...colsAround(c,1)];label='РАКЕТА + БОМБА!';
      }else initial=[a,b];
    }

    if(isRainbow(board[a]))board[a]={type:null,special:null};
    if(isRainbow(board[b]))board[b]={type:null,special:null};
    await animateAndRemove(initial,1,new Set(),label,presentation);
    if(generation!==motionGeneration)return;
    await settleAfterClear();
    if(generation!==motionGeneration)return;
    const groups=findMatchGroups();
    if(groups.length)await resolveMatches(groups,2,[]);
  }

  async function handleCell(i){
    if(tutorial?.active&&!tutorial.allowCell(i))return;
    if(!canInput())return;
    if(!canSwapCell(i)){
      const t=tileAt(i);
      if(t.hole)showToast('Эта клетка недоступна','bad');
      else if(t.crate)showToast('Сначала разбей ящик','bad');
      else if(t.chain)showToast('Самоцвет скован цепью','bad');
      else if(t.ice)showToast('Самоцвет заморожен — сначала разбей лёд','bad');
      else if(isDrop(board[i]))showToast('Ключ опускается сам — освобождай путь под ним');
      return;
    }
    if(selected===null){selectCell(i);if(isTapPower(board[i])&&!tutorial?.active)showToast('Нажми ещё раз: активировать за 1 ход');return}
    if(selected===i){if(isTapPower(board[i]))await activateBoardPower(i);else{selected=null;selectCell(null);}return}
    if(!isAdjacent(selected,i)){selectCell(i);return}
    const a=selected,b=i;
    selected=null;selectCell(null);
    await trySwap(a,b);
  }

  async function activateBoardPower(i){
    if(!canInput()||!canSwapCell(i)||!isTapPower(board[i]))return;
    if(tutorial?.active&&!tutorial.allowPower(i))return;
    const backup=snapshotTurn(),generation=motionGeneration;
    selected=null;selectCell(null);setBusy(true);
    try{
      const label=board[i].special===SPECIAL.BOMB?'БОМБА!':'РАКЕТА!';
      moves--;updateHud();
      await animateAndRemove([i],1,new Set(),label);
      if(generation!==motionGeneration)return;
      await settleAfterClear();
      if(generation!==motionGeneration)return;
      const groups=findMatchGroups();if(groups.length)await resolveMatches(groups,2,[]);
      if(generation!==motionGeneration)return;
      if(tutorial?.active){tutorial.afterAction();return;}
      if(goalsComplete()){await sleep(150);finishLevel(true);}else if(moves<=0)finishLevel(false);else await ensurePlayable();
    }catch(e){if(generation===motionGeneration){restoreTurn(backup);setBusy(gameState!=='playing');showToast('Ход восстановлен. Попробуй ещё раз.','bad');}}
    finally{if(generation===motionGeneration)setBusy(gameState!=='playing');}
  }

  async function trySwap(a,b){
 if(!canInput()||!isAdjacent(a,b)||!canSwapCell(a)||!canSwapCell(b))return;
 if(tutorial?.active&&!tutorial.allowSwap(a,b))return;
 setBusy(true);const backup=snapshotTurn(),generation=motionGeneration;
 try{
  const direct=isDirectCombo(board[a],board[b]);[board[a],board[b]]=[board[b],board[a]];sfx('swap');await animateSwap(a,b);
  if(generation!==motionGeneration)return;
  const groups=findMatchGroups();if(!groups.length&&!direct){sfx('invalid');[board[a],board[b]]=[board[b],board[a]];await animateSwap(a,b,true);for(const i of [a,b])playMotion(boardEl.querySelector('.cell[data-index="'+i+'"] .gem'),[{transform:'translateX(0)'},{transform:'translateX(-2px)',offset:.25},{transform:'translateX(2px)',offset:.65},{transform:'translateX(0)'}],{duration:120});return;}
  moves--;updateHud();if(direct)await resolveDirectCombo(a,b);else await resolveMatches(groups,1,[b,a]);
  if(generation!==motionGeneration)return;
  if(tutorial?.active){tutorial.afterAction();return;}
  if(goalsComplete()){await sleep(150);finishLevel(true);}else if(moves<=0)finishLevel(false);else await ensurePlayable();
 }catch(e){if(generation===motionGeneration){restoreTurn(backup);setBusy(gameState!=='playing');showToast('\u0425\u043e\u0434 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437.','bad');}}
 finally{if(generation===motionGeneration)setBusy(gameState!=='playing');}
}

  async function ensurePlayable(){
    if(tutorial?.active)return;
    if(hasPossibleMove())return;
    showToast('Ходов на поле нет — перемешиваем');
    await sleep(400);
    await reshuffleGems(false);
    await sleep(250);
  }

  function showCombo(n){showComboText(n>=4?'НЕВЕРОЯТНЫЙ КАСКАД ×'+n:'КАСКАД ×'+n)}
  function showComboText(text){
    clearTimeout(comboTimer);comboText.textContent=text;comboText.classList.add('show','asset-combo');
    const motion=playMotion(comboText,[{opacity:0},{opacity:1,offset:.08},{opacity:1,offset:.82},{opacity:0}],{duration:1400,easing:'linear'});
    if(motion)motion.finished.then(()=>comboText.classList.remove('show','asset-combo')).catch(()=>{});
    else comboTimer=setTimeout(()=>comboText.classList.remove('show','asset-combo'),1400);
  }

  function randomShuffle(arr){
    for(let i=arr.length-1;i>0;i--){const j=Math.floor(boardRandom()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}
    return arr;
  }
  async function reshuffleGems(manual=true){
 const indices=board.map((_,i)=>i).filter(canSwapCell),original=indices.map(i=>({...board[i]})),center={x:boardEl.clientWidth/2,y:boardEl.clientHeight/2};
 for(const i of indices){const p=cellPoint(i);playMotion(boardEl.querySelector('.cell[data-index="'+i+'"] .gem'),[{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${center.x-p.x}px,${center.y-p.y}px) scale(.25) rotate(24deg)`,opacity:.55}],{duration:280,easing:'cubic-bezier(.4,.05,.6,.9)'});}
 await sleep(280);
 for(let attempt=0;attempt<1800;attempt++){
  const pool=randomShuffle(original.map(g=>({...g})));
  // Recovery recolours normal gems only; powers, blockers and keys keep their rules.
  if(attempt>=600)pool.forEach(g=>{if(!g.special)g.type=randType();});
  indices.forEach((i,k)=>board[i]=pool[k]);
  if(!findMatchGroups().length&&hasPossibleMove()){
   selected=null;render();spawnArtFx('fx/energy_ring.png',null,Math.min(200,boardEl.clientWidth*.55),660);
   for(const i of indices){const p=cellPoint(i);playMotion(boardEl.querySelector('.cell[data-index="'+i+'"] .gem'),[{transform:`translate(${center.x-p.x}px,${center.y-p.y}px) scale(.25) rotate(-15deg)`,opacity:.6},{transform:'translate(0,0) scale(1.07)',opacity:1,offset:.8},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:570,delay:i%8*12});}
   await sleep(680);return true;
  }
 }
 indices.forEach((i,k)=>board[i]=original[k]);render();throw Error('No safe reshuffle');
}
  async function shuffleBoard(manual=true){
    if(!canInput())return;
    setBusy(true);
    await reshuffleGems(manual);
    setBusy(false);
  }

  function activateBooster(key){
    const def=BOOSTER_DEFS[key];
    if(!def||!canInput())return;
    if(tutorial?.active&&!tutorial.allowBooster(key))return;
    if((boosterStock()[key]||0)<=0){showToast('Усилитель закончился — загляни в магазин','bad');openShop();return}
    if(activeBooster===key){activeBooster=null;updateEconomyUI();showToast('Усилитель отменён');return}
    if(key==='shuffle'){useImmediateBooster('shuffle');return}
    if(key==='moves'){useImmediateBooster('moves');return}
    activeBooster=key;selected=null;selectCell(null);updateEconomyUI();if(tutorial?.active)tutorial.syncControls();else showToast(`${def.icon} Выбери клетку на поле`);
  }
  async function useImmediateBooster(key){
 if(tutorial?.active)return;
 if(!canInput()||(inventory[key]||0)<=0||!['moves','shuffle'].includes(key))return;
 const backup=snapshotTurn(),count=inventory[key];setBusy(true);
 try{if(!consumeBooster(key))return;
  if(key==='moves'){moves+=5;extraMovesAdded+=5;updateHud();showComboText('+5 \u0425\u041e\u0414\u041e\u0412');playMotion(document.querySelector('.stat.moves'),[{transform:'scale(1)'},{transform:'scale(1.08)',offset:.4},{transform:'scale(1)'}],{duration:800});await sleep(800);}
  else{await reshuffleGems(false);showComboText('\u041f\u0415\u0420\u0415\u041c\u0415\u0428\u0418\u0412\u0410\u041d\u0418\u0415');}
  sfx('booster');
 }catch(_){restoreTurn(backup);inventory[key]=count;saveProgress();showToast('\u0423\u0441\u0438\u043b\u0438\u0442\u0435\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0451\u043d.','bad');}
 finally{setBusy(gameState!=='playing');}
}
  async function useTargetBooster(i){
 const key=activeBooster,stock=boosterStock();if(!canInput()||!['hammer','rocket','bomb'].includes(key)||(stock[key]||0)<=0)return;
 if(tutorial?.active&&!tutorial.allowTarget(i))return;
 if(i<0||i>=board.length||tileAt(i).hole||isDrop(board[i])&&key==='hammer')return;
 const backup=snapshotTurn(),count=stock[key];setBusy(true);
 try{
  if(!consumeBooster(key))return;let targets=key==='hammer'?[i]:key==='rocket'?rowsAround(rc(i)[0],0):squareAround(i,1);
  sfx('booster');await animateAndRemove(targets,1,new Set(),BOOSTER_DEFS[key].name.toUpperCase(),{kind:'booster-'+key,pieces:[{i,g:null}]});await settleAfterClear();
  const groups=findMatchGroups();if(groups.length)await resolveMatches(groups,2,[]);
  if(tutorial?.active){tutorial.afterAction();return;}
  if(goalsComplete())finishLevel(true);else if(moves<=0)finishLevel(false);else await ensurePlayable();
 }catch(_){restoreTurn(backup);stock[key]=count;saveProgress();showToast('\u0423\u0441\u0438\u043b\u0438\u0442\u0435\u043b\u044c \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0451\u043d.','bad');}
 finally{setBusy(gameState!=='playing');}
}

  function showView(view){
 if(tutorial?.active&&view!=='game')return;
 currentView=['estate','map'].includes(view)?view:'game';if(currentView!=='game')cleanFX();
 gameView.classList.toggle('active',currentView==='game');estateView.classList.toggle('active',currentView==='estate');document.getElementById('mapView').classList.toggle('active',currentView==='map');
 for(const [id,v]of [['gameTab','game'],['estateTab','estate'],['mapTab','map']]){const el=document.getElementById(id);el.classList.toggle('active',view===v);el.setAttribute('aria-selected',String(view===v));}
 document.body.dataset.view=currentView;gameActions.hidden=currentView!=='game';
 if(currentView==='estate')updateEstateUI();if(currentView==='map')renderCampaignMap();refreshPause();syncMusic();fitBoard();
}
  function estateStageName(n){return n===10?'\u0417\u043e\u043d\u0430 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430':n===0?'\u041d\u043e\u0432\u0430\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f':n<5?'\u041f\u0435\u0440\u0432\u044b\u0435 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u044b':'\u0421\u0430\u0434 \u043e\u0436\u0438\u0432\u0430\u0435\u0442';}
  function zoneById(id){return ESTATE_ZONES.find(z=>z.id===id)||ESTATE_ZONES[0]}
  function zoneUnlocked(zone){return unlockedLevel>=zone.unlockLevel}
  function zoneProgress(zone){return zoneTasks(zone.id).filter(t=>estateDone.includes(t.id)).length;}
  function zoneComplete(zone){return zoneProgress(zone)===10;}
  function zoneStatusText(zone){return zoneComplete(zone)?'\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430':zoneUnlocked(zone)?'\u041e\u0442\u043a\u0440\u044b\u0442\u0430':'\u0423\u0440\u043e\u0432\u0435\u043d\u044c '+zone.unlockLevel;}
  function renderZoneMap(){
    zoneMap.replaceChildren();
    ESTATE_ZONES.forEach(zone=>{
      const unlocked=zoneUnlocked(zone),complete=zoneComplete(zone),active=zone.id===selectedEstateZone;
      const btn=document.createElement('button');
      btn.type='button';btn.className='zone-card'+(active?' active':'')+(complete?' complete':(!unlocked?' locked':''));
      btn.setAttribute('role','tab');btn.setAttribute('aria-selected',String(active));btn.setAttribute('aria-label',`Глава ${zone.id}. ${zone.title}. ${zoneStatusText(zone)}`);
      const icon=document.createElement('div');icon.className='zone-icon'+((complete||!unlocked)?' art-zone-status '+(complete?'complete':'locked'):'');icon.textContent='';if(!complete&&unlocked)icon.append(artImg(ZONE_ICON_ASSETS[zone.id-1],'',''));
      const copy=document.createElement('div');copy.className='zone-copy';
      const title=document.createElement('b');title.textContent=`${zone.id}. ${zone.title}`;
      const range=document.createElement('small');range.textContent=`Уровни ${zone.levels}`;copy.append(title,range);
      const state=document.createElement('div');state.className='zone-state';
      const s1=document.createElement('span');s1.textContent=zoneStatusText(zone);
      const s2=document.createElement('span');s2.textContent=`★ ${chapterStars(zone.id)}/30`;
      state.append(s1,s2);btn.append(icon,copy,state);
      btn.addEventListener('click',()=>selectEstateZone(zone.id));zoneMap.appendChild(btn);
    });
    zoneMap.querySelector('.zone-card.active')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function selectEstateZone(id){
    const zone=zoneById(Math.max(1,Math.min(ESTATE_ZONES.length,Number(id)||1)));
    selectedEstateZone=zone.id;saveProgress();updateEstateUI();
  }
  
  

  function selectedStyleName(task){
    if(!task.styles)return '';
    const i=(estateStyles[task.id]||1)-1;
    return task.styles[i]?.name||task.styles[0].name;
  }
  function updateEstateUI(){
 if(!estateTasksEl)return;updateTokenUI();const zone=zoneById(selectedEstateZone),done=zoneProgress(zone),unlocked=zoneUnlocked(zone),tasks=zoneTasks(zone.id);
 estateZoneTitle.textContent=zone.title;estateZoneDesc.textContent=zone.desc;estateZoneRange.textContent='\u0423\u0440\u043e\u0432\u043d\u0438 '+zone.levels;estateZoneStatus.textContent=zoneStatusText(zone);
 estateZoneStatus.className='zone-status-chip '+(done===10?'complete':unlocked?'open':'locked');estateTaskChapter.textContent='\u0417\u043e\u043d\u0430 '+zone.id+' / 10';
 estateGlobalText.textContent=estateDone.length+' / 100 \u0440\u0430\u0431\u043e\u0442';estateProgressLabel.textContent='\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u0435';estateProgressText.textContent=done+' / 10';estateProgressFill.style.width=(done*10)+'%';estateStageTitle.textContent=estateStageName(done);
 estateCaption.textContent=zone.title;estateTaskTitle.textContent='\u0414\u0438\u0437\u0430\u0439\u043d \u0442\u0432\u043e\u0435\u0433\u043e \u0441\u0430\u0434\u0430';estateTaskText.textContent='\u041e\u0434\u0438\u043d \u0436\u0435\u0442\u043e\u043d \u2014 \u043e\u0434\u043d\u043e \u043f\u0440\u0435\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435. \u041f\u043e\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u044b\u0439 \u0434\u0438\u0437\u0430\u0439\u043d \u043c\u043e\u0436\u043d\u043e \u043c\u0435\u043d\u044f\u0442\u044c.';
 zonePrevBtn.disabled=zone.id===1;zoneNextBtn.disabled=zone.id===10;renderZoneMap();renderEstateScene(zone);estateTasksEl.replaceChildren();
 if(!unlocked){const p=document.createElement('p');p.className='locked-copy';p.textContent='\u041f\u0440\u043e\u0439\u0434\u0438 \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0443\u044e \u0433\u043b\u0430\u0432\u0443, \u0447\u0442\u043e\u0431\u044b \u043e\u0442\u043a\u0440\u044b\u0442\u044c \u044d\u0442\u0443 \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044e.';estateTasksEl.append(p);estateHint.textContent='\u0423\u0440\u043e\u0432\u0435\u043d\u044c '+zone.unlockLevel;return;}
 const next=tasks.find(t=>!estateDone.includes(t.id));
 for(const task of tasks){const built=estateDone.includes(task.id),available=task===next;
  const row=document.createElement('div');row.dataset.task=task.id;row.className='estate-task'+(built?' done':available?' available':' locked');const icon=artImg(built?'match3/ui/check.png':task.art[0],'task-image','');
  const copy=document.createElement('div');copy.className='task-copy';const title=document.createElement('b');title.textContent=task.title;const desc=document.createElement('small');desc.textContent=built?(task.styles?selectedStyleName(task):'\u0413\u043e\u0442\u043e\u0432\u043e'):task.desc;copy.append(title,desc);
  const btn=document.createElement('button');btn.type='button';btn.className='task-action';
  if(built&&task.styles){btn.textContent='\u0421\u0442\u0438\u043b\u044c';btn.addEventListener('click',()=>openDesignPicker(task,false));}
  else if(built){btn.textContent='\u2713';btn.disabled=true;}
  else{btn.textContent=available?'1 \u2726':'\u2022';btn.disabled=!available||renovationTokens<1;btn.setAttribute('aria-label',task.title);btn.addEventListener('click',()=>task.styles?openDesignPicker(task,true):renovateTask(task));}
  row.append(icon,copy,btn);estateTasksEl.append(row);
 }
 estateHint.textContent=done===10?'\u0412\u0441\u0435 \u0440\u0430\u0431\u043e\u0442\u044b \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u044b':renovationTokens?'\u0412\u044b\u0431\u0435\u0440\u0438 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435 \u0443\u043b\u0443\u0447\u0448\u0435\u043d\u0438\u0435':'\u041f\u0435\u0440\u0432\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430 \u043d\u0430 \u0443\u0440\u043e\u0432\u043d\u0435 \u0434\u0430\u0441\u0442 \u0436\u0435\u0442\u043e\u043d';
}

  function pulseEstate(){
 const task=ESTATE_TASKS.find(t=>t.id===estateRevealId);GardenEstate.reveal(estateScene,task);estateRevealId=null;
}
  function renovateTask(task,choice=1){
 const tasks=zoneTasks(task.zone),next=tasks.find(t=>!estateDone.includes(t.id));if(!zoneUnlocked(zoneById(task.zone))||next?.id!==task.id||renovationTokens<task.cost)return false;
 renovationTokens-=task.cost;estateDone.push(task.id);if(task.styles)estateStyles[task.id]=Math.max(1,Math.min(task.styles.length,choice));estateRevealId=task.id;
 saveProgress();updateEstateUI();pulseEstate();sfx('build');if(['clean_fountain','pond'].includes(task.role))sfx('fountain');if(['revive_trees','revive_garden','bush'].includes(task.role))sfx('rustle');if(zoneComplete(zoneById(task.zone)))sfx('reward');showToast(task.title+' \u2014 \u0433\u043e\u0442\u043e\u0432\u043e!','good');return true;
}
  function openDesignPicker(task,buildMode){
    if(!task?.styles)return;
    if(buildMode&&renovationTokens<task.cost){showToast('Нужен жетон благоустройства','bad');return}
    designTaskId=task.id;designBuildMode=!!buildMode;designChoice=estateStyles[task.id]||1;
    designTitle.textContent=buildMode?task.title:`Изменить: ${task.title}`;
    designCopy.textContent=buildMode?'Посмотри, как каждый вариант впишется в твою усадьбу. После строительства стиль можно менять бесплатно.':'Выбери дизайн прямо в сцене. Смена уже построенного стиля бесплатна.';
    designCostText.textContent=buildMode?`Стоимость строительства: ${task.cost} 🛠`:'Смена стиля: бесплатно';
    designConfirm.textContent=buildMode?'Выбрать и построить':'Применить стиль';
    renderDesignOptions(task);
    designModal.hidden=false;designModal.setAttribute('aria-hidden','false');
    setTimeout(()=>designOptions.querySelector('.design-option.selected')?.focus(),0);
  ;refreshPause();}
  function renderDesignOptions(task){
    const focusChoice=document.activeElement?.closest('.design-option')?.dataset.choice;
    designOptions.replaceChildren();
    task.styles.forEach((style,i)=>{
      const choice=i+1,btn=document.createElement('button');btn.type='button';btn.dataset.choice=choice;
      btn.className='design-option'+(choice===designChoice?' selected':'');btn.setAttribute('aria-pressed',String(choice===designChoice));
      const preview=document.createElement('div');preview.className='design-preview';
      const scene=document.createElement('div');preview.append(scene);
      GardenEstate.render(scene,{zone:zoneById(task.zone),tasks:zoneTasks(task.zone),done:[...new Set([...estateDone,task.id])],styles:{...estateStyles,[task.id]:choice},preview:true});
      const check=document.createElement('span');check.className='design-check';check.textContent='ВЫБРАНО';preview.append(check);
      const name=document.createElement('b');name.textContent=style.name;const note=document.createElement('small');note.textContent=style.note;
      btn.append(preview,name,note);btn.addEventListener('click',()=>{designChoice=choice;renderDesignOptions(task);});designOptions.append(btn);
    });
    if(focusChoice)designOptions.querySelector('[data-choice="'+designChoice+'"]')?.focus({preventScroll:true});
  }
  function closeDesignPicker(){
    designModal.hidden=true;designModal.setAttribute('aria-hidden','true');designTaskId=null;
  ;refreshPause();}
  function confirmDesignChoice(){
    const task=ESTATE_TASKS.find(t=>t.id===designTaskId);
    if(!task?.styles)return closeDesignPicker();
    if(designBuildMode){
      if(!renovateTask(task,designChoice))return;
    }else{
      if(!estateDone.includes(task.id))return closeDesignPicker();
      estateStyles[task.id]=designChoice;estateRevealId=task.id;saveProgress();updateEstateUI();pulseEstate();
      showToast(`🎨 ${task.styles[designChoice-1].name} — применено`,'good');
    }
    closeDesignPicker();
  }

  function resetLevelState(){
    motionGeneration++;GardenFX.cancel();
    clearTimeout(comboTimer);comboText.getAnimations().forEach(a=>a.cancel());comboText.classList.remove('show','asset-combo');
    cleanFX();userPaused=false;pointerStart=null;extraMovesAdded=0;
    const level=currentLevel();gameSeed=(Date.now()^(level.id*104729)^Math.floor(Math.random()*0xffffffff))>>>0;boardRandom=seededRandom(gameSeed);
    score=0;
    moves=level.moves;
    bestCombo=1;
    collected=Array(TYPES).fill(0);
    cleared={ice:0,crate:0,chain:0,drop:0};
    selected=null;
    activeBooster=null;
    busy=false;
    buildBoardForLevel();
    render({dropIndices:allIndices()});
    populateLevelSelect();
    selectedCampaignChapter=chapterOfLevel(level.id);
    renderCampaignMap();
  }

  function showBriefing(){
    if(tutorial?.active)return;
    showView('game');const level=currentLevel();
    gameState='briefing';
    resetLevelState();
    setBusy(true);
    setResultArt('brief');
    resultTitle.textContent=`Уровень ${level.id}`;
    resultStars.hidden=true;
    resultText.textContent=`${level.title}. Выполни ${level.goals.length===1?'цель':'все цели'} за ${level.moves} ходов. Для 2★ оставь ${level.star2Moves}+ ходов, для 3★ — ${level.star3Moves}+.`;
    resultGoals.replaceChildren();
    level.goals.forEach(g=>resultGoals.appendChild(makeGoalRow(g,false)));
    primaryOverlayBtn.textContent='Начать уровень';
    primaryOverlayBtn.dataset.action='start';
    secondaryOverlayBtn.hidden=true;
    levelOverlay.classList.add('show');fitBoard();
  }

  function startLevel(){
    gameState='playing';
    levelOverlay.classList.remove('show');
    setBusy(false);unlockAudio();syncMusic();
    showToast(`Уровень ${currentLevel().id} начался`,'good');
  }

  function restartLevel(){
    if(tutorial?.active){tutorial.retry();return;}
    if(busy&&gameState==='playing')return;
    gameState='playing';
    resetLevelState();
    levelOverlay.classList.remove('show');
    setBusy(false);unlockAudio();syncMusic();
    showToast('Уровень начат заново');
  }

  function finishLevel(won){
    if(tutorial?.active){tutorial.afterAction();return;}
    if(gameState==='result')return;
    gameState='result';
    setBusy(true);
    const level=currentLevel();

    stopMusic();
    if(won){
      sfx('win');
      spawnCelebration(level.id===LEVELS.length?70:34);
      const earnedStars=calculateStars(level,Math.max(0,moves-extraMovesAdded));
      const previousStars=starsForLevel(level.id);
      const firstClear=previousStars===0;
      const improved=earnedStars>previousStars;
      levelStars[level.id]=Math.max(previousStars,earnedStars);
      bestScores[level.id]=Math.max(Number(bestScores[level.id])||0,score);
      const firstReward=awardRenovationToken(level.id);
      const coinReward=rewardCoins(level,earnedStars,firstClear);
      if(level.id<LEVELS.length)unlockedLevel=Math.max(unlockedLevel,level.id+1);
      saveProgress();updateEconomyUI();
      resultStars.hidden=false;
      resultStars.replaceChildren();resultStars.setAttribute('aria-label',earnedStars+' из 3 звёзд');
      for(let i=0;i<3;i++)resultStars.append(artImg('match3/currency/star.png','result-star-image'+(i<earnedStars?'':' empty'),''));
      setTimeout(()=>{if(gameState==='result'&&!isSuspended())sfx('star');},190);
      setResultArt(level.id===LEVELS.length?'complete':'win');
      resultTitle.textContent=level.id===LEVELS.length?'Кампания пройдена!':'Уровень пройден!';
      const rewardLine=firstReward?' Получен +1 жетон для усадьбы.':' Жетон за этот уровень уже был получен.';
      const coinLine=` Получено +${coinReward} монет.`;
      const starLine=improved?` Новый лучший результат: ${starText(earnedStars)}.`:` Лучший результат: ${starText(levelStars[level.id])}.`;
      resultText.textContent=level.id===LEVELS.length
        ?`Все 100 уровней завершены. Счёт: ${score.toLocaleString('ru-RU')}.${starLine}${rewardLine}${coinLine}`
        :`Счёт: ${score.toLocaleString('ru-RU')}. Осталось ходов: ${moves}.${starLine}${rewardLine}${coinLine}`;
      primaryOverlayBtn.textContent=level.id===LEVELS.length?'Играть уровень ещё раз':'Следующий уровень';
      primaryOverlayBtn.dataset.action=level.id===LEVELS.length?'replay':'next';
      secondaryOverlayBtn.hidden=false;
      secondaryOverlayBtn.textContent='Карта уровней';
      showToast(`Победа — ${'★'.repeat(earnedStars)}`,'good');
    }else{
      sfx('lose');
      resultStars.hidden=true;
      setResultArt('lose');
      resultTitle.textContent='Ходы закончились';
      resultText.textContent=`Не все цели выполнены. Счёт: ${score.toLocaleString('ru-RU')}.`;
      primaryOverlayBtn.textContent='Повторить уровень';
      primaryOverlayBtn.dataset.action='retry';
      secondaryOverlayBtn.hidden=false;
      secondaryOverlayBtn.textContent='Карта уровней';
      showToast('Попробуй ещё раз','bad');
    }

    resultGoals.replaceChildren();
    level.goals.forEach(g=>resultGoals.appendChild(makeGoalRow(g,true)));
    populateLevelSelect();
    updateGoalsUI();
    renderCampaignMap();
    updateEstateUI();
    levelOverlay.classList.add('show');
  }

  function nextLevel(){
    if(currentLevelIndex<LEVELS.length-1)currentLevelIndex++;
    selectedCampaignChapter=chapterOfLevel(currentLevel().id);
    showBriefing();
  }

  function replayCurrent(){showBriefing()}

  function showLevelPicker(){if(busy&&gameState==='playing')return;selectedCampaignChapter=chapterOfLevel(currentLevel().id);showView('map');}

  function showHint(){
    if(tutorial?.active)return;
    if(!canInput())return;
    const hint=getHint();
    if(!hint)return shuffleBoard(false);
    boardEl.querySelectorAll('.cell').forEach(c=>c.classList.remove('hint'));
    hint.forEach(i=>boardEl.querySelector(`.cell[data-index="${i}"]`)?.classList.add('hint'));
    showToast(hint.length===1?'Подсвечен бонус — нажми на него дважды':'Подсвечен возможный ход');
    setTimeout(()=>boardEl.querySelectorAll('.cell').forEach(c=>c.classList.remove('hint')),1800);
  }

  boardEl.addEventListener('click',e=>{
    if(performance.now()<suppressClickUntil||!canInput())return;
    const c=e.target.closest('.cell');if(!c)return;const i=Number(c.dataset.index);
    if(activeBooster)useTargetBooster(i);else handleCell(i);
  });
  boardEl.addEventListener('pointerdown',e=>{
    if(!canInput()||activeBooster)return;const c=e.target.closest('.cell');if(!c)return;
    const i=Number(c.dataset.index);if(!canSwapCell(i))return;
    if(tutorial?.active&&!tutorial.allowCell(i))return;
    c.classList.add('pressed');sfx('touch');pointerStart={i,x:e.clientX,y:e.clientY,id:e.pointerId};c.setPointerCapture?.(e.pointerId);
  });
  boardEl.addEventListener('pointerup',e=>{
    boardEl.querySelectorAll('.pressed').forEach(c=>c.classList.remove('pressed'));if(!pointerStart)return;const p=pointerStart;pointerStart=null;
    try{e.target.releasePointerCapture?.(e.pointerId);}catch(_){}
    if(!canInput())return;const dx=e.clientX-p.x,dy=e.clientY-p.y;
    if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
    suppressClickUntil=performance.now()+300;const [r,c]=rc(p.i);let nr=r,nc=c;
    if(Math.abs(dx)>Math.abs(dy))nc+=dx>0?1:-1;else nr+=dy>0?1:-1;
    if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE){selected=null;selectCell(null);trySwap(p.i,idx(nr,nc));}
  });
  boardEl.addEventListener('pointercancel',()=>{pointerStart=null;boardEl.querySelectorAll('.pressed').forEach(c=>c.classList.remove('pressed'));});
  boardEl.addEventListener('lostpointercapture',()=>{pointerStart=null;boardEl.querySelectorAll('.pressed').forEach(c=>c.classList.remove('pressed'));});

  document.getElementById('hintBtn').addEventListener('click',showHint);
  document.getElementById('restartTop').addEventListener('click',restartLevel);
  document.getElementById('restartBtn').addEventListener('click',restartLevel);
  document.getElementById('shuffleBtn').addEventListener('click',()=>activateBooster('shuffle'));
  document.querySelectorAll('[data-booster]').forEach(btn=>btn.addEventListener('click',()=>activateBooster(btn.dataset.booster)));
  document.getElementById('shopBtn').addEventListener('click',openShop);
  document.getElementById('shopSideBtn').addEventListener('click',openShop);
  shopClose.addEventListener('click',closeShop);
  shopModal.addEventListener('click',e=>{if(e.target===shopModal)closeShop()});
  dailyBtn.addEventListener('click',openDailyRewards);
  dailySideBtn.addEventListener('click',openDailyRewards);
  dailyClose.addEventListener('click',closeDailyRewards);
  dailyClaimBtn.addEventListener('click',claimDailyReward);
  dailyModal.addEventListener('click',e=>{if(e.target===dailyModal)closeDailyRewards()});
  primaryOverlayBtn.addEventListener('click',()=>{
    const action=primaryOverlayBtn.dataset.action;
    if(action==='start')startLevel();
    else if(action==='next')nextLevel();
    else if(action==='retry')showBriefing();
    else if(action==='replay')replayCurrent();
  });
  secondaryOverlayBtn.addEventListener('click',showLevelPicker);

  levelSelect.addEventListener('change',()=>{
    if(busy&&gameState==='playing'){populateLevelSelect();return;}
    const i=Number(levelSelect.value);
    if(!Number.isInteger(i)||i<0||i>=LEVELS.length||LEVELS[i].id>unlockedLevel){
      populateLevelSelect();
      return;
    }
    currentLevelIndex=i;
    showBriefing();
  });

  gameTab.addEventListener('click',()=>showView('game'));
  estateTab.addEventListener('click',()=>showView('estate'));
  document.getElementById('goPlayBtn').addEventListener('click',()=>showView('game'));
  zonePrevBtn.addEventListener('click',()=>selectEstateZone(selectedEstateZone-1));
  zoneNextBtn.addEventListener('click',()=>selectEstateZone(selectedEstateZone+1));
  designClose.addEventListener('click',closeDesignPicker);
  designConfirm.addEventListener('click',confirmDesignChoice);
  designModal.addEventListener('click',e=>{if(e.target===designModal)closeDesignPicker()});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!dailyModal.hidden)closeDailyRewards();
    else if(!shopModal.hidden)closeShop();
    else if(!designModal.hidden)closeDesignPicker();
    else if(activeBooster){activeBooster=null;updateEconomyUI();showToast('Усилитель отменён')}
  });

  musicToggle.addEventListener('click',toggleMusic);
  soundToggle.addEventListener('click',toggleSound);
  document.addEventListener('pointerdown',()=>unlockAudio(),{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')unlockAudio()});
  document.addEventListener('click',e=>{const btn=e.target.closest?.('button');if(btn&&btn!==musicToggle&&btn!==soundToggle&&!btn.disabled)sfx('tap')});
  document.addEventListener('visibilitychange',()=>{pointerStart=null;refreshPause();});
  window.addEventListener('pagehide',()=>{if(layoutFrame){cancelAnimationFrame(layoutFrame);layoutFrame=0;}platformPaused=true;refreshPause();saveProgress();});
  window.addEventListener('pageshow',()=>{platformPaused=false;refreshPause();scheduleFit();});
  document.getElementById('mapTab').addEventListener('click',showLevelPicker);
  document.getElementById('settingsBtn').addEventListener('click',openSettings);
  document.getElementById('settingsClose').addEventListener('click',closeSettings);
  document.getElementById('settingsModal').addEventListener('click',e=>{if(e.target.id==='settingsModal')closeSettings();});
  document.getElementById('qualitySelect').addEventListener('change',e=>setQuality(e.target.value));
  document.getElementById('pauseBtn').addEventListener('click',()=>{userPaused=!userPaused;refreshPause();});
  document.getElementById('resumeBtn').addEventListener('click',()=>{userPaused=false;refreshPause();});
  document.getElementById('settingsShop').addEventListener('click',()=>{closeSettings();openShop();});
  document.getElementById('settingsDaily').addEventListener('click',()=>{closeSettings();openDailyRewards();});
  document.getElementById('settingsTutorial').addEventListener('click',()=>{if(busy&&gameState==='playing')return;closeSettings();if(tutorial.active)tutorial.retry();else tutorial.start(true);});
  document.getElementById('settingsRules').addEventListener('click',()=>{closeSettings();tutorial.openHelp();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSettings();userPaused=false;refreshPause();}if(e.key==='Tab')trapFocus(e);});
  window.addEventListener('resize',()=>{scheduleFit();document.body.dataset.quality=effectiveQuality();});
  window.visualViewport?.addEventListener('resize',scheduleFit);
  reducedQuery.addEventListener?.('change',()=>{cleanFX();if(reducedQuery.matches)document.getAnimations().filter(a=>a.__gardenMotion).forEach(a=>a.cancel());document.body.dataset.quality=effectiveQuality();refreshPause();});
  window.addEventListener('garden-platform-pause',e=>{platformPaused=!!e.detail;refreshPause();});

  tutorial=GardenTutorial.create({
   asset,campaignId:()=>LEVELS[currentLevelIndex].id,state:()=>({board,tiles,moves,score,bestCombo,collected,cleared,selected,activeBooster}),
   idle:()=>!busy&&!gameplaySuspended(),canStart:()=>!(busy&&gameState==='playing')&&!isSuspended()&&shopModal.hidden&&dailyModal.hidden&&designModal.hidden,progress:()=>tutorialProgress,
   save:value=>{tutorialProgress=value;saveProgress();},fit:scheduleFit,pause:refreshPause,
   capture:()=>({turn:snapshotTurn(),currentLevelIndex,extraMovesAdded,gameSeed,boardRandom,gameState,currentView,selected,activeBooster,
    overlayShown:levelOverlay.classList.contains('show'),overlay:['resultIcon','resultTitle','resultText','resultStars','resultGoals','primaryOverlayBtn','secondaryOverlayBtn'].map(id=>{
     const el=document.getElementById(id);return{id,nodes:[...el.childNodes].map(node=>node.cloneNode(true)),style:el.style.cssText,className:el.className,hidden:el.hidden,action:el.dataset.action,label:el.getAttribute('aria-label')};
    })}),
   install:layout=>{
    motionGeneration++;GardenFX.cancel();cleanFX();clearTimeout(comboTimer);clearTimeout(toastTimer);
    toastEl.className='toast';comboText.getAnimations().forEach(a=>a.cancel());comboText.classList.remove('show','asset-combo');
    userPaused=false;pointerStart=null;selected=null;activeBooster=null;extraMovesAdded=0;
    if(layout){board=layout.board;tiles=layout.tiles;boardRandom=seededRandom(layout.seed);score=0;moves=3;bestCombo=1;collected=Array(TYPES).fill(0);cleared={ice:0,crate:0,chain:0,drop:0};}
    gameState='playing';levelOverlay.classList.remove('show');render();setBusy(false);showView('game');
   },
   leave:backup=>{
    motionGeneration++;GardenFX.cancel();cleanFX();selected=null;activeBooster=null;pointerStart=null;
    if(backup){
     currentLevelIndex=backup.currentLevelIndex;extraMovesAdded=backup.extraMovesAdded;gameSeed=backup.gameSeed;boardRandom=backup.boardRandom;gameState=backup.gameState;
     restoreTurn(backup.turn);selected=backup.selected;activeBooster=backup.activeBooster;render();
     for(const item of backup.overlay){const el=document.getElementById(item.id);el.replaceChildren(...item.nodes.map(node=>node.cloneNode(true)));el.style.cssText=item.style;el.className=item.className;el.hidden=item.hidden;if(item.action)el.dataset.action=item.action;if(item.label)el.setAttribute('aria-label',item.label);}
     levelOverlay.classList.toggle('show',backup.overlayShown);setBusy(gameState!=='playing');showView(backup.currentView);
    }else{showBriefing();startLevel();}
    updateEconomyUI();syncMusic();document.getElementById('settingsBtn').focus({preventScroll:true});
   }
  });
  loadProgress();
  updateAudioControls();
  applyAudioSettings(false);
  updateTokenUI();
  updateEconomyUI();
  updateDailyUI();
  updateEstateUI();
  showView('game');
  currentLevelIndex=Math.max(0,unlockedLevel-1);
  if(['new','active'].includes(tutorialProgress.status))tutorial.start();else showBriefing();
  document.body.dataset.quality=effectiveQuality();document.getElementById("qualitySelect").value=quality;

  preloadArt();scheduleFit();
})();
