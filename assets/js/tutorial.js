/* Guided practice runs the game's swaps, damage, gravity and effects. */
(() => {
 'use strict';
 const GEM_PATHS=['gem_red','gem_blue','gem_green','gem_yellow','gem_purple','gem_cyan'];
 const COLORS=['красный','синий','зелёный','жёлтый','фиолетовый','голубой'];
 const match=(title,text,success,extra={})=>({title,text,success,kind:'swap',pair:[52,44],fixed:{42:0,43:0,44:1,52:0},matches:[[42,43,44]],...extra});
 const combo=(title,a,b,text,success)=>({
  title,phase:'Сочетания',kind:'swap',pair:[43,44],fixed:{},
  powers:{43:{type:0,special:a},44:{type:1,special:b}},focus:[43,44],
  text,success,goal:{kind:'score',target:70},check:s=>s.moves===2
 });
 const lessons=[
  match('Собери 3 самоцвета','Собери 3 одинаковых самоцвета в ряд или столбец. Нажми «1», затем «2», или проведи от «1» к «2».','Три красных исчезли. После падения совпали синие: каскад не расходует дополнительный ход.',{pair:[59,51],fixed:{27:1,35:0,43:0,50:1,51:5,52:1,59:0},matches:[[35,43,51]],goal:{kind:'score',target:90},check:s=>s.bestCombo>=2&&s.moves===2}),
  match('Разбей обычный лёд','Лёд удерживает фишку. Поменяй «1» и «2»: совпадение с голубой фишкой снимет слой льда.','Лёд разбит, клетка освободилась.',{fixed:{42:5,43:5,44:4,52:5},obstacles:{42:{ice:1}},focus:[42],goal:{kind:'ice',target:1},check:s=>s.cleared.ice===1&&s.tiles[42].ice===0}),
  match('Двойной лёд: первый удар','Двойной лёд выдерживает два удара. Выполни подсвеченное совпадение.','Первый слой снят, лёд ещё не уничтожен.',{fixed:{42:5,43:5,44:4,52:5},obstacles:{42:{ice:2}},focus:[42],goal:{kind:'ice',target:1},check:s=>s.tiles[42].ice===1&&s.cleared.ice===0}),
  match('Двойной лёд: второй удар','Сними оставшийся слой льда новым совпадением.','Лёд исчез и цель засчитана.',{fixed:{42:5,43:5,44:4,52:5},obstacles:{42:{ice:1,iceMax:2}},focus:[42],goal:{kind:'ice',target:1},check:s=>s.tiles[42].ice===0&&s.cleared.ice===1}),
  match('Ящик: первый удар','Ящик нельзя двигать. Совпадение рядом наносит ему один удар.','Усиленный ящик повреждён, но ещё стоит на поле.',{obstacles:{35:{crate:2}},focus:[35],goal:{kind:'crate',target:1},check:s=>s.tiles[35].crate===1&&s.cleared.crate===0}),
  match('Ящик: второй удар','Собери новое совпадение рядом с повреждённым ящиком.','Ящик разбит; освободившаяся клетка вновь доступна.',{obstacles:{35:{crate:1,crateMax:2}},focus:[35],goal:{kind:'crate',target:1},check:s=>s.tiles[35].crate===0&&s.cleared.crate===1}),
  match('Сними цепь','Фишка в цепи не двигается, но участвует в совпадениях. Убери цепь совпадением фиолетовых.','Цепь снята. Бонусы тоже могут разрушать цепи.',{fixed:{42:4,43:4,44:1,52:4},obstacles:{42:{chain:1}},focus:[42],goal:{kind:'chain',target:1},check:s=>s.cleared.chain===1}),
  match('Опусти ключ вниз','Ключ не двигается вручную. Собери совпадение под ним, чтобы он опустился к нижнему краю.','Ключ достиг выхода и засчитан.',{pair:[52,60],fixed:{58:0,59:0,60:1,52:0},drops:[51],matches:[[58,59,60]],focus:[51,59],goal:{kind:'drop',target:1},check:s=>s.cleared.drop===1}),

  match('Создай горизонтальную ракету','Четыре одинаковых самоцвета по горизонтали превращаются в горизонтальную ракету.','Ракета создана! Она поразит целый ряд.',{phase:'Создание бонусов',pair:[51,43],fixed:{41:0,42:0,43:1,44:0,51:0},matches:[[41,42,43,44]],focus:[41,42,43,44],goal:{kind:'score',target:30},check:s=>s.board.some(g=>g?.special==='rocketH')}),
  {title:'Запусти горизонтальную ракету',phase:'Создание бонусов',kind:'power',carry:true,special:'rocketH',text:'Нажми ракету дважды: сначала выбери, затем запусти. Она очищает ряд и стоит один ход.',success:'Горизонтальная ракета пролетела через весь ряд.'},
  match('Создай вертикальную ракету','Четыре одинаковых самоцвета по вертикали создают вертикальную ракету.','Вертикальная ракета готова: она очищает столбец.',{phase:'Создание бонусов',pair:[43,44],fixed:{27:0,35:0,43:1,44:0,51:0},matches:[[27,35,43,51]],focus:[27,35,43,51],goal:{kind:'score',target:30},check:s=>s.board.some(g=>g?.special==='rocketV')}),
  {title:'Запусти вертикальную ракету',phase:'Создание бонусов',kind:'power',carry:true,special:'rocketV',text:'Дважды нажми на вертикальную ракету и проследи за ударом по столбцу.',success:'Вертикальная ракета прошла по всему столбцу.'},
  match('Создай бомбу квадратом 2×2','Новая схема: четыре одинаковых самоцвета квадратом 2×2 создают бомбу. Поменяй «1» и «2» и собери квадрат.','Квадрат 2×2 создал бомбу! Её одиночный взрыв охватывает 3×3.',{phase:'Создание бонусов',pair:[51,59],fixed:{42:0,43:0,50:0,51:1,59:0},matches:[],squares:[[42,43,50,51]],focus:[42,43,50,51],goal:{kind:'score',target:30},check:s=>s.board.some(g=>g?.special==='bomb')}),
  {title:'Взорви бомбу 3×3',phase:'Создание бонусов',kind:'power',carry:true,special:'bomb',text:'Дважды нажми на бомбу. Она взорвёт область 3×3 и нанесёт удары препятствиям.',success:'Бомба взорвалась с настоящей анимацией 3×3.'},
  match('Создай радужный шар','Пять одинаковых самоцветов в одной прямой создают радужный шар.','Радуга создана. Она выбирает цвет соседнего самоцвета.',{phase:'Создание бонусов',pair:[51,43],fixed:{41:0,42:0,43:1,44:0,45:0,51:0},matches:[[41,42,43,44,45]],focus:[41,42,43,44,45],goal:{kind:'score',target:40},check:s=>s.board.some(g=>g?.special==='rainbow')}),
  {title:'Радуга + обычный самоцвет',phase:'Создание бонусов',kind:'rainbow',carry:true,text:'Поменяй радужный шар «1» с соседним самоцветом «2»: исчезнут все самоцветы этого цвета.',success:'Радуга удалила выбранный цвет. Это одно игровое действие.'},
  match('Создай Светлячка буквой Т','Новая схема: пять одинаковых самоцветов в форме буквы Т создают Светлячка, а не бомбу.','Светлячок появился в центре Т-образного совпадения.',{phase:'Создание бонусов',pair:[51,43],fixed:{27:0,35:0,42:0,43:1,44:0,51:0},matches:[[42,43,44],[27,35,43]],focus:[27,35,42,43,44],goal:{kind:'score',target:40},check:s=>s.board.some(g=>g?.special==='firefly')}),
  match('Создай Светлячка буквой L','Пять одинаковых самоцветов в форме буквы L тоже создают Светлячка. Дополни угол подсвеченным обменом.','Светлячок создан второй формой: буквой L.',{phase:'Создание бонусов',pair:[51,43],fixed:{27:0,35:0,41:0,42:0,43:1,51:0},matches:[[41,42,43],[27,35,43]],focus:[27,35,41,42,43],goal:{kind:'score',target:40},check:s=>s.board.some(g=>g?.special==='firefly')}),
  {title:'Отправь Светлячка к цели',phase:'Создание бонусов',kind:'power',carry:true,special:'firefly',text:'Дважды нажми на Светлячка. Он летит к полезной цели и поражает её.',success:'Светлячок полетел к полезной цели.'},

  combo('Две горизонтальные ракеты','rocketH','rocketH','Соедини соседние горизонтальные ракеты. Получатся два параллельных горизонтальных залпа.','Две горизонтальные ракеты очистили два ряда.'),
  combo('Две вертикальные ракеты','rocketV','rocketV','Соедини две вертикальные ракеты — они отправят два параллельных залпа вдоль столбцов.','Две вертикальные ракеты очистили два столбца.'),
  combo('Горизонтальная + вертикальная','rocketH','rocketV','Скрести ракеты разных направлений. Получится ракетный крест.','Ракеты ударили крест-накрест.'),
  combo('Ракета + бомба','rocketH','bomb','Соедини ракету и бомбу. Комбинация очищает три строки и три столбца.','Сработал большой ракетно-бомбовый удар.'),
  combo('Вертикальная ракета + бомба','rocketV','bomb','Проверь бомбу с вертикальной ракетой: удар тоже охватывает три строки и три столбца.','Ракетно-бомбовый удар работает в обоих направлениях.'),
  combo('Бомба + бомба','bomb','bomb','Сдвинь две бомбы друг к другу. Вместо одиночного 3×3 получится взрыв 5×5.','Две бомбы уничтожили область 5×5.'),
  combo('Радуга + горизонтальная ракета','rainbow','rocketH','Цвет ракеты размножится в виде ракет по полю. Посмотри на цепную реакцию.','Радуга превратила самоцветы выбранного цвета в ракеты.'),
  combo('Радуга + вертикальная ракета','rainbow','rocketV','Проверь радугу с вертикальной ракетой: выбранный цвет тоже превратится в ракеты.','Радуга запустила несколько ракет.'),
  combo('Радуга + бомба','rainbow','bomb','Самоцветы цвета бомбы станут мини-бомбами 3×3 и взорвутся.', 'Радуга создала и запустила множество бомб.'),
  combo('Два радужных шара','rainbow','rainbow','Соедини две радуги. Мощнейшее сочетание очищает всё игровое поле.','Две радуги уничтожили все доступные клетки.'),
  combo('Светлячок + ракета','firefly','rocketH','Светлячок наведёт ракету на полезную цель. Проследи за полётом.','Светлячок запустил прицельную ракету.'),
  combo('Светлячок + вертикальная ракета','firefly','rocketV','Теперь направь Светлячка вместе с вертикальной ракетой.','Прицельная ракета поразила столбец цели.'),
  combo('Светлячок + бомба','firefly','bomb','Светлячок доставит взрыв 3×3 к полезной цели.','Светлячок доставил прицельную бомбу.'),
  combo('Светлячок + радуга','firefly','rainbow','Светлячок и радуга создают роевой удар по нескольким целям.','Радужный рой поразил сразу несколько целей.'),
  combo('Два Светлячка','firefly','firefly','Соедини двух Светлячков, чтобы одновременно отправить их к нескольким целям.','Рой Светлячков отправился к важным клеткам.'),

  {title:'Попробуй молоток',phase:'Инструменты',kind:'booster',booster:'hammer',target:43,fixed:{},obstacles:{43:{crate:1}},focus:[43],text:'Нажми «Молоток», затем подсвеченный ящик. Учебный молоток бесплатный и не тратит обычный ход.',success:'Молоток разбил ящик, число ходов не изменилось.',goal:{kind:'crate',target:1},check:s=>s.cleared.crate===1&&s.moves===3},
  {title:'Теперь можно играть!',phase:'Финиш',kind:'summary',carry:true,text:'Ты попробовал все виды специальных самоцветов и все 15 пар бонусов. Проходи уровни, получай звёзды и жетоны для усадьбы.',success:'Первое прохождение каждого уровня даёт жетон. Из настроек можно повторить всё обучение или открыть правила.'}
 ];
 const helpSections=[
  ['Управление и ходы',[
   'Поменяй местами двух соседей по горизонтали или вертикали: двумя нажатиями либо свайпом. Совпадение — это минимум 3 самоцвета одного цвета в прямой линии.',
   'Успешный обмен или активация бонуса на поле тратит 1 ход. Обмен без совпадения и без комбинации бонусов возвращается назад и ход не тратит.',
   'После удаления фишки падают, пустые места заполняются. Новые совпадения — каскады: они происходят автоматически, не тратят дополнительные ходы и увеличивают очки.',
   'Кнопка с лампочкой показывает возможный ход. Пауза останавливает текущие действия.'
  ]],
  ['Лёд, ящики, цепи и ключи',[
   'Лёд: замороженную фишку нельзя двигать. Собери совпадение с фишкой подо льдом или попади по клетке бонусом. Один удар снимает один слой. Двойному льду нужно два удара. В цель засчитывается полностью очищенная клетка.',
   'Ящик: занимает клетку и не двигается. Собери совпадение непосредственно слева, справа, сверху или снизу от ящика либо попади по нему бонусом. Обычный ящик выдерживает один удар, усиленный — два.',
   'Цепь: фишку нельзя двигать, но она участвует в совпадении своего цвета. Такое совпадение или попадание бонусом снимает цепь.',
   'Ключ: не меняется местами с самоцветом. Убирай фишки под ним и препятствия на пути. Ключ падает сам; для сбора он должен достичь нижнего края поля.'
  ]],
  ['Как создать и применить бонус',[
   '4 одного цвета в ряд или столбец — ракета. Она очищает линию вдоль своего направления.',
   '5 одного цвета в прямой линии — радуга. Обменивай её с соседним самоцветом: все фишки выбранного цвета удалятся.',
   'Квадрат 2 × 2 одного цвета, созданный обменом, — бомба. Обычная бомба очищает область 3 × 3; две бомбы вместе — 5 × 5.',
   'Пересечение рядов одного цвета в форме буквы Т или L — Светлячок. Он летит к полезной цели на поле.',
   'Чтобы запустить бомбу или ракету на поле, нажми её дважды: выбрать, затем активировать. Это стоит 1 ход. С обычной фишкой их также можно обменять, если получается совпадение. Замороженный или скованный бонус сначала нужно освободить.'
  ]],
  ['Сочетания бонусов',[
   'Две ракеты одного направления — два параллельных залпа. Горизонтальная + вертикальная — крест. Две бомбы — взрыв 5 × 5. Бомба + ракета — три ряда и три столбца.',
   'Радуга + ракета или бомба — самоцветы цвета второго бонуса превращаются в такие бонусы. Две радуги очищают всё поле.',
   'Светлячок создаётся из Т- или L-образной комбинации одинаковых самоцветов. Двойное нажатие отправляет его к важной цели. Соедини Светлячка с бомбой, ракетой, радугой или другим Светлячком для особых эффектов.',
   'Для комбинации обменивай соседние бонусы. Цвета могут отличаться. Весь обмен стоит 1 ход. Препятствия получают удары; прочные слои могут остаться.'
  ]],
  ['Пять бустеров под полем',[
   'Молоток: выбери кнопку, затем клетку. Удаляет один самоцвет или наносит один удар по препятствию.',
   'Ракета: выбери кнопку, затем клетку. Очищает её горизонтальный ряд.',
   'Бомба: выбери кнопку, затем клетку. Очищает область 3 × 3 вокруг неё.',
   'Миксер: перемешивает доступные самоцветы. Препятствия остаются на своих местах.',
   '+5 ходов: сразу прибавляет пять ходов. Добавленные ходы не учитываются при расчёте звёзд за эффективность.',
   'Каждое применение расходует 1 бустер из запаса, а обычный ход не тратится. Запас виден на кнопках. Бустеры можно купить за игровые монеты в магазине. Выбор молотка, ракеты или бомбы можно отменить повторным нажатием кнопки.'
  ]],
  ['Цели, награды и усадьба',[
   'Смотри на цели над полем: очки, самоцветы нужного цвета, лёд, ящики, цепи или ключи. Для победы выполни каждую цель до окончания ходов.',
   'Победа даёт монеты и от 1 до 3 звёзд. Для дополнительных звёзд сохраняй больше обычных ходов. Порог показан перед уровнем. Следующий уровень открывается после победы.',
   'Первая победа на каждом уровне даёт 1 жетон благоустройства. Повторное прохождение не выдаёт этот жетон снова.',
   'Во вкладке «Усадьба» трать жетоны на работы по порядку, выбирай оформление. Уже построенный стиль можно менять бесплатно.'
  ]]
 ];
 function groups(types){
  const found=[];
  for(let axis=0;axis<2;axis++)for(let r=0;r<8;r++){
   let run=[];
   for(let c=0;c<=8;c++){
    const i=axis?c*8+r:r*8+c;
    if(c<8&&types[i]!==null&&(!run.length||types[i]===types[run[0]]))run.push(i);
    else{if(run.length>=3)found.push(run);run=c<8&&types[i]!==null?[i]:[];}
   }
  }
  return found;
 }
 function squares(types){
  const out=[];
  for(let r=3;r<7;r++)for(let c=1;c<5;c++){
   const at=[r*8+c,r*8+c+1,(r+1)*8+c,(r+1)*8+c+1],color=types[at[0]];
   if(color!==null&&at.every(i=>types[i]===color))out.push(at);
  }
  return out;
 }
 function scenario(step,n){
  const types=Array(64).fill(null),tiles=Array.from({length:64},()=>({hole:true,ice:0,crate:0,chain:0}));
  let seed=90137+n*173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const active=[];
  for(let r=3;r<8;r++)for(let c=1;c<=5;c++){const i=r*8+c;active.push(i);tiles[i].hole=false;}
  for(const [key,obstacle]of Object.entries(step.obstacles||{})){
   const t=tiles[+key];Object.assign(t,obstacle);t.iceMax=t.iceMax||t.ice;t.crateMax=t.crateMax||t.crate;
  }
  for(let attempt=0;attempt<1000;attempt++){
   types.fill(null);
   for(const i of active){
    if(tiles[i].crate||(step.drops||[]).includes(i))continue;
    types[i]=step.powers?.[i]?.type??step.fixed?.[i]??Math.floor(random()*6);
   }
   if(groups(types).length)continue;
   if(step.pair){
    const copy=[...types],[a,b]=step.pair;[copy[a],copy[b]]=[copy[b],copy[a]];
    if(step.matches){
     const expected=step.matches.map(g=>g.join(',')).sort().join('|'),actual=groups(copy).map(g=>g.join(',')).sort().join('|');
     if(expected!==actual)continue;
    }
    if(step.matches||step.squares){
     const beforeSquares=new Set(squares(types).map(g=>g.join(',')));
     const newlyCreated=squares(copy).filter(g=>!beforeSquares.has(g.join(','))).map(g=>g.join(',')).sort();
     const expectedSquares=(step.squares||[]).map(g=>g.join(',')).sort();
     if(newlyCreated.join('|')!==expectedSquares.join('|'))continue;
    }
   }
   return {board:types.map((type,i)=>tiles[i].crate||tiles[i].hole?null:(step.drops||[]).includes(i)?{kind:'drop',type:null,special:null}:{kind:'gem',type,special:step.powers?.[i]?.special||null}),tiles,seed:seed||1};
  }
  throw Error('Lesson layout could not be built: '+n);
 }
 function create(engine){
  let active=false,helpOpen=false,index=0,done=false,current=null,backup=null,level=null,focused=[],allowed=[],demoStock={hammer:1};
  const panel=document.getElementById('tutorialPanel'),footer=document.getElementById('tutorialFooter'),next=document.getElementById('tutorialNext'),skip=document.getElementById('tutorialSkip');
  const title=document.getElementById('tutorialTitle'),copy=document.getElementById('tutorialCopy'),action=document.getElementById('tutorialAction'),feedback=document.getElementById('tutorialFeedback'),count=document.getElementById('tutorialCount');
  const help=document.getElementById('tutorialHelp'),helpBody=document.getElementById('tutorialHelpBody');let helpOpener=null;
  for(const [heading,lines]of helpSections){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=heading;details.append(summary);for(const text of lines){const p=document.createElement('p');p.textContent=text;details.append(p);}helpBody.append(details);}
  const idle=()=>engine.idle();
  function persist(status='active'){engine.save({version:2,status,step:index});}
  function sprite(path,label){const box=document.createElement('span'),im=document.createElement('img');box.className='tutorial-example';im.src=engine.asset(path);im.alt='';box.append(im,document.createTextNode(label));return box;}
  function pathFor(i){const s=engine.state(),g=s.board[i],t=s.tiles[i];return t?.crate?'match3/obstacles/crate.png':g?.special?'match3/specials/'+({rocketH:'rocket_horizontal',rocketV:'rocket_vertical',bomb:'bomb',rainbow:'rainbow',firefly:'firefly'}[g.special])+'.png':'match3/gems/'+GEM_PATHS[g?.type||0]+'.png';}
  function paintAction(){
   action.replaceChildren();
   if(current.kind==='summary'){action.append(sprite('match3/currency/improvement_token.png','Жетоны → усадьба'));return;}
   const arrow=document.createElement('span');arrow.className='tutorial-example-arrow';arrow.textContent='→';arrow.setAttribute('aria-hidden','true');
   if(current.kind==='booster')action.append(sprite('match3/boosters/hammer.png','1. Молоток'),arrow,sprite(pathFor(current.target),'2. Ящик'));
   else if(current.kind==='power')action.append(sprite(pathFor(allowed[0]),'1. Выбрать'),arrow,sprite(pathFor(allowed[0]),'2. Запустить'));
   else action.append(sprite(pathFor(allowed[0]),'1. Нажать'),arrow,sprite(pathFor(allowed[1]),'2. Нажать'));
  }
  function decorate(){
   if(!active)return;
   const s=engine.state();
   for(const cellEl of document.querySelectorAll('#board .cell')){
    const i=+cellEl.dataset.index,permit=!done&&allowed.includes(i),focus=focused.includes(i);
    cellEl.classList.toggle('tutorial-target',permit);cellEl.classList.toggle('tutorial-focus',focus);cellEl.classList.toggle('tutorial-muted',!permit&&!focus);
    cellEl.dataset.lessonMarker=permit?String(current.kind==='power'?(s.selected===i?2:1):current.kind==='booster'?2:allowed.indexOf(i)+1):'';
    cellEl.tabIndex=permit?0:-1;cellEl.setAttribute('aria-disabled',String(!permit));
    if(permit)cellEl.setAttribute('aria-describedby','tutorialCopy');else cellEl.removeAttribute('aria-describedby');
   }
   document.querySelector('[data-booster="hammer"]').classList.toggle('tutorial-booster-target',current.kind==='booster'&&!done&&!s.activeBooster);
  }
  function syncControls(){
   if(!active)return;
   const ready=idle();next.disabled=!ready||(!done&&current.kind!=='summary');skip.disabled=!ready;
   next.textContent=current.kind==='summary'?(backup?'Вернуться в игру':'Начать уровень '+engine.campaignId()):'Далее →';
   decorate();
  }
  function install(n){
   index=n;current={...lessons[index],lesson:index+1};done=false;demoStock={hammer:1};
   allowed=current.pair?[...current.pair]:current.kind==='booster'?[current.target]:[];focused=[...(current.focus||[])];
   if(current.carry){
    const s=engine.state();
    if(current.kind==='power'){const i=s.board.findIndex(g=>g?.special===current.special);if(i<0){install(index-1);return;}allowed=[i];}
    if(current.kind==='rainbow'){
     const i=s.board.findIndex(g=>g?.special==='rainbow'),[r,c]=[Math.floor(i/8),i%8];
     const neighbor=[c<7?i+1:-1,c>0?i-1:-1,r>0?i-8:-1,r<7?i+8:-1].find(j=>j>=0&&!s.tiles[j].hole&&!s.tiles[j].crate&&!s.tiles[j].ice&&!s.tiles[j].chain&&s.board[j]?.kind==='gem'&&!s.board[j].special);
     if(i<0||neighbor===undefined){install(index-1);return;}allowed=[i,neighbor];current.text='Поменяй радугу «1» с фишкой «2». Она уберёт весь '+COLORS[s.board[neighbor].type]+' цвет на поле. Повторное нажатие радугу не запускает.';
    }
    level={id:0,title:'Учебный матч',moves:3,star2Moves:0,star3Moves:0,goals:[{kind:'score',target:s.score+(current.kind==='summary'?0:45)}]};
   }else level={id:0,title:'Учебный матч',moves:3,star2Moves:0,star3Moves:0,goals:[current.goal||{kind:'score',target:30}]};
   document.body.dataset.tutorial='true';document.body.dataset.tutorialKind=current.kind;
   panel.hidden=false;footer.hidden=false;document.getElementById('board').setAttribute('aria-label','Учебное поле 5 на 5');
   engine.install(current.carry?null:scenario(current,index));
   count.textContent='Шаг '+current.lesson+' / '+lessons.length+' · '+(current.phase||'Основы');title.textContent=current.title;copy.textContent=current.text;copy.hidden=false;action.hidden=false;
   feedback.textContent=current.kind==='summary'?current.success:'Твой запас не расходуется.';
   feedback.className='tutorial-feedback';paintAction();persist();syncControls();engine.fit();panel.focus({preventScroll:true});
  }
  function start(replay=false){
   if(active||!engine.canStart())return false;
   backup=replay?engine.capture():null;active=true;
   let n=replay?0:Math.max(0,Math.min(lessons.length-1,engine.progress().step||0));
   if(lessons[n].carry&&lessons[n].kind!=='summary')n--;
   if(lessons[n].kind==='summary')n=lessons.length-2;
   install(n);return true;
  }
  function leave(status){
   if(!active||!idle())return;
   persist(status);active=false;done=false;panel.hidden=true;footer.hidden=true;
   delete document.body.dataset.tutorial;delete document.body.dataset.tutorialKind;
   document.getElementById('board').setAttribute('aria-label','Игровое поле 8 на 8');
   document.querySelector('[data-booster="hammer"]').classList.remove('tutorial-booster-target');
   const restore=backup;backup=null;engine.leave(restore);engine.fit();
  }
  function notify(text,kind=''){
   if(!active)return;feedback.textContent=text;feedback.className='tutorial-feedback'+(kind==='bad'?' needs-action':'');engine.fit();
  }
  function reject(){notify(current.kind==='power'?'Нажми только подсвеченный бонус: сначала выбери, затем запусти.':current.kind==='booster'?'Нажми «Молоток» под полем, затем подсвеченный ящик.':'Используй две клетки с номерами «1» и «2». Их можно нажать в любом порядке.');return false;}
  const allowCell=i=>active&&!done&&allowed.includes(i)||reject();
  const allowSwap=(a,b)=>active&&!done&&['swap','rainbow'].includes(current.kind)&&allowed.length===2&&allowed.includes(a)&&allowed.includes(b)&&a!==b||reject();
  const allowPower=i=>active&&!done&&current.kind==='power'&&allowed[0]===i||reject();
  const allowBooster=key=>active&&!done&&current.kind==='booster'&&current.booster===key||reject();
  const allowTarget=i=>active&&!done&&current.kind==='booster'&&current.target===i||reject();
  function afterAction(){
   if(!active||done)return;
   const s=engine.state(),okay=current.check?current.check(s):current.kind==='power'?s.board.every(g=>g?.special!==current.special):current.kind==='rainbow'?s.board.every(g=>g?.special!=='rainbow'):true;
   if(!okay){notify('Повтори показанное действие. Цель этого задания ещё не выполнена.','bad');return;}
   done=true;copy.hidden=true;action.hidden=true;feedback.textContent='Верно! '+current.success;feedback.className='tutorial-feedback success';decorate();engine.fit();
  }
  function openHelp(){if(helpOpen)return;helpOpener=document.activeElement;helpOpen=true;help.hidden=false;engine.pause();document.getElementById('tutorialHelpClose').focus();}
  function closeHelp(){if(!helpOpen)return;helpOpen=false;help.hidden=true;engine.pause();if(helpOpener?.isConnected)helpOpener.focus({preventScroll:true});}
  next.addEventListener('click',()=>{if(!idle())return;if(current.kind==='summary')leave('done');else if(done)install(index+1);});
  skip.addEventListener('click',()=>leave('skipped'));
  document.getElementById('tutorialRules').addEventListener('click',openHelp);
  document.getElementById('tutorialHelpClose').addEventListener('click',closeHelp);
  help.addEventListener('click',e=>{if(e.target===help)closeHelp();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&helpOpen){e.preventDefault();closeHelp();}});
  return Object.freeze({get active(){return active;},get helpOpen(){return helpOpen;},get accepting(){return active&&!done&&current.kind!=='summary';},get level(){return level;},get lesson(){return current?.lesson||0;},get inventory(){return demoStock;},start,openHelp,closeHelp,allowCell,allowSwap,allowPower,allowBooster,allowTarget,afterAction,decorate,syncControls,notify,retry(){if(active&&idle())install(current.carry?index-1:index);}});
 }
 window.GardenTutorial=Object.freeze({create,totalSteps:lessons.length});
})();
