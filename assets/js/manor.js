/* Lumina R16: one persistent architectural identity across all ten estate scenes.
   Completely deterministic: a house stage is derived from completed renovation tasks,
   so older V15.1 saves remain valid without replaying construction. */
(() => {
 'use strict';
 const names=['Каменная классика','Сапфировая резиденция','Викторианское поместье'];
 const stages=['Старое поместье','Первые перемены','Дом возрождён','Роскошный особняк','Сказочная резиденция'];
 const files=['stone','azure','victorian'];
 const facadeIds=['wash_facade','z3_2_wash_facade','z6_3_wash_facade','z10_2_wash_facade'];
 function style(value){const n=Math.floor(Number(value));return n>=1&&n<=3?n:1;}
 function stageFor(ids){
  const done=new Set(ids||[]),total=done.size;
  if(total>=100)return 5;
  if(total>=60)return 4;
  if(total>=30)return 3;
  if(facadeIds.some(id=>done.has(id)))return 2;
  return 1;
 }
 function fromLegacy(stored,styles,done){
  if(Number.isInteger(stored)&&stored>=1&&stored<=3)return stored;
  const completed=new Set(done||[]);
  for(let i=facadeIds.length-1;i>=0;i--){
   const id=facadeIds[i];
   if(completed.has(id)&&styles?.[id])return style(styles[id]);
  }
  return style(styles?.wash_facade||1);
 }
 function path(variant,stage){const s=style(variant),t=Math.max(1,Math.min(5,Math.floor(Number(stage))||1));return `estate/r16/house_${files[s-1]}_stage_${t}.webp`;}
 function description(stage){return stages[Math.max(0,Math.min(4,(Number(stage)||1)-1))];}
 window.GardenManor=Object.freeze({names,stages,facadeIds,style,stageFor,fromLegacy,path,description});
})();
