/* Lumina R18.3. Offline-tolerant cloud snapshots with a deduplicated economy journal.
   VK StorageGet/Set has no atomic compare-and-swap: simultaneous last-millisecond
   writes cannot be made strictly transactional without a backend. Never silently
   equate "more levels" with "newer purchases". */
(()=>{
 'use strict';
 const MAX_CHUNK=3000,MAX_CHUNKS=20;
 const BOOSTERS=['hammer','rocket','bomb','shuffle','moves'];
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,Math.floor(Number(n)||0)));
 function checksum(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
 function encode(raw){
  if(typeof raw!=='string'||raw.length>48000)throw Error('Save exceeds safety cap');
  const bytes=new TextEncoder().encode(raw);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const content=btoa(binary),chunks=content.match(/.{1,3000}/g)||[];
  if(!chunks.length||chunks.length>MAX_CHUNKS)throw Error('Too many cloud chunks');
  return {chunks,hash:checksum(content),length:content.length};
 }
 function decode(chunks,meta){
  if(!meta||meta.version!==1||!Number.isInteger(meta.count)||meta.count<1||meta.count>MAX_CHUNKS||!Array.isArray(chunks)||chunks.length!==meta.count)return null;
  if(chunks.some(s=>typeof s!=='string'||!s||s.length>MAX_CHUNK))return null;
  const data=chunks.join('');if(data.length!==meta.length||checksum(data)!==meta.hash)return null;
  try{const binary=atob(data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return valid(obj)?obj:null;}catch(_){return null;}
 }
 function valid(obj){return !!obj&&typeof obj==='object'&&!Array.isArray(obj)&&Number.isInteger(obj.unlockedLevel)&&obj.unlockedLevel>=1&&obj.unlockedLevel<=100&&(!obj.estateDone||Array.isArray(obj.estateDone))&&(!obj.rewardedLevels||Array.isArray(obj.rewardedLevels));}
 const ints=xs=>new Set(Array.isArray(xs)?xs.filter(x=>Number.isInteger(x)&&x>=1&&x<=100):[]);
 const strings=xs=>new Set(Array.isArray(xs)?xs.filter(x=>typeof x==='string'&&x.length<=90):[]);
 function inventory(x){const result={};for(const k of BOOSTERS)result[k]=clamp(x?.[k],0,999);return result;}
 function validOp(op){return !!op&&typeof op.id==='string'&&op.id.length>0&&op.id.length<=120&&Number.isSafeInteger(op.c)&&Math.abs(op.c)<=9999999&&Number.isFinite(op.t)&&op.t>=0&&op.t<=9999999999999999&&(!op.items||Object.entries(op.items).every(([k,n])=>BOOSTERS.includes(k)&&Number.isInteger(n)&&Math.abs(n)<=999))&&(!op.cancel||(typeof op.cancel==='string'&&op.cancel.length<=120&&op.c===0&&!op.items));}
 function validEconomy(e){return !!e&&e.v===1&&typeof e.origin==='string'&&/^[a-f0-9]{8}$/.test(e.origin)&&Number.isInteger(e.bc)&&e.bc>=0&&e.bc<=9999999&&e.bi&&typeof e.bi==='object'&&Array.isArray(e.ops)&&e.ops.length<=1200&&e.ops.every(validOp);}
 function startEconomy(snapshot){
  if(validEconomy(snapshot?.economy))return snapshot.economy;
  const bc=clamp(snapshot?.coins??400,0,9999999),bi=inventory(snapshot?.inventory||{hammer:1,rocket:1,bomb:1,shuffle:1,moves:1});
  const origin=checksum(JSON.stringify([snapshot?.updatedAt||0,bc,bi,snapshot?.dailyLastClaim||'',snapshot?.dailyTotalClaims||0]));
  return {v:1,origin,bc,bi,ops:[]};
 }
 function normalizeOp(op){return {id:op.id,t:op.t,c:op.c,...(op.items?{items:op.items}:{}),...(op.cancel?{cancel:op.cancel}:{})};}
 function opValue(op){return op.c+Object.entries(op.items||{}).reduce((sum,[k,n])=>sum+n*({hammer:120,rocket:180,bomb:220,shuffle:100,moves:250}[k]||0),0);}
 function preferOp(a,b){
  // Same-day and first-win rewards have stable IDs across devices. Grant ONCE.
  if(a.id.startsWith('level:')||a.id.startsWith('daily:'))return opValue(a)>opValue(b)?a:opValue(b)>opValue(a)?b:JSON.stringify(a)<=JSON.stringify(b)?a:b;
  return JSON.stringify(a)<=JSON.stringify(b)?a:b;
 }
 function evaluate(e){
  if(!validEconomy(e))return null;
  const byId=new Map();for(const op of e.ops){const old=byId.get(op.id);byId.set(op.id,old?preferOp(old,op):op);}
  const cancelled=new Set([...byId.values()].filter(o=>o.cancel).map(o=>o.cancel));
  const ops=[...byId.values()].filter(o=>!o.cancel&&!cancelled.has(o.id));
  // Independent offline credits are applied before spending. Debits are then
  // replayed in a deterministic order, never creating negative funds or stock.
  const credit=o=>o.c>=0&&Object.values(o.items||{}).every(n=>n>=0);
  ops.sort((a,b)=>Number(credit(b))-Number(credit(a))||a.t-b.t||a.id.localeCompare(b.id));
  let coins=e.bc;const stock=inventory(e.bi),skipped=[];
  for(const op of ops){
   const newCoins=coins+op.c,needs=op.items||{};
   if(newCoins<0||Object.entries(needs).some(([k,n])=>stock[k]+n<0)){
    skipped.push(op.id);continue;
   }
   coins=clamp(newCoins,0,9999999);
   for(const [k,n] of Object.entries(needs))stock[k]=clamp(stock[k]+n,0,999);
  }
  const rejected=[...byId.values()].filter(o=>o.cancel&&o.id.startsWith('reject:')).map(o=>o.cancel);
  return {coins,inventory:stock,skipped,rejected};
 }
 function appendOperation(e,op){
  if(!validEconomy(e)||!validOp(op))throw Error('Invalid economy operation');
  if(e.ops.some(x=>x.id===op.id))return {economy:e,result:evaluate(e),added:false};
  if(e.ops.length>=1200)throw Error('Economy journal full; reconnect to sync');
  const economy={...e,ops:[...e.ops,normalizeOp(op)]},result=evaluate(economy);
  if(result.skipped.includes(op.id))return {economy:e,result:evaluate(e),added:false};
  return {economy,result,added:true};
 }
 function mergeEconomy(a,b){
  if(!validEconomy(a)||!validEconomy(b)||a.origin!==b.origin||a.bc!==b.bc||JSON.stringify(inventory(a.bi))!==JSON.stringify(inventory(b.bi)))return null;
  const ops=new Map();for(const op of [...a.ops,...b.ops]){const old=ops.get(op.id);ops.set(op.id,old?preferOp(old,op):op);}
  if(ops.size>1200)return null;
  const economy={v:1,origin:a.origin,bc:a.bc,bi:inventory(a.bi),ops:[...ops.values()].sort((x,y)=>x.id.localeCompare(y.id))};
  return validEconomy(economy)?economy:null;
 }
 function freezeConflicts(economy){
  const result=evaluate(economy);if(!result?.skipped.length)return economy;
  const existing=new Set(economy.ops.map(o=>o.id));
  const rejected=result.skipped.map(id=>{const original=economy.ops.find(o=>o.id===id);return{id:'reject:'+id,c:0,t:Math.min(9999999999999999,(original?.t||0)+1),cancel:id};}).filter(o=>o.id.length<=120&&!existing.has(o.id));
  if(economy.ops.length+rejected.length>1200)return economy;
  return {...economy,ops:[...economy.ops,...rejected].sort((x,y)=>x.id.localeCompare(y.id))};
 }
 function reconcile(local,cloud){
  if(!valid(cloud))return valid(local)?local:null;
  if(!valid(local))return cloud;
  const aTime=Number(local.updatedAt)||0,bTime=Number(cloud.updatedAt)||0;
  const newer=aTime>=bTime?local:cloud,older=newer===local?cloud:local;
  const out={...newer};
  out.unlockedLevel=Math.max(local.unlockedLevel,cloud.unlockedLevel);
  out.rewardedLevels=[...new Set([...ints(local.rewardedLevels),...ints(cloud.rewardedLevels)])].sort((a,b)=>a-b);
  out.estateDone=[...new Set([...strings(local.estateDone),...strings(cloud.estateDone)])];
  out.levelStars={};out.bestScores={};
  for(const obj of [local,cloud])for(const [key,n] of Object.entries(obj.levelStars||{}))if(/^(100|[1-9]\d?)$/.test(key))out.levelStars[key]=Math.max(out.levelStars[key]||0,clamp(n,0,3));
  for(const obj of [local,cloud])for(const [key,n] of Object.entries(obj.bestScores||{}))if(/^(100|[1-9]\d?)$/.test(key))out.bestScores[key]=Math.max(out.bestScores[key]||0,clamp(n,0,999999999));
  out.estateStyles={...(older.estateStyles||{}),...(newer.estateStyles||{})};
  out.renovationTokens=Math.max(0,Math.min(100,out.rewardedLevels.length-out.estateDone.length));
  out.dailyTotalClaims=Math.max(clamp(local.dailyTotalClaims,0,1000000),clamp(cloud.dailyTotalClaims,0,1000000));
  if((cloud.dailyLastClaim||'')>(local.dailyLastClaim||'')){out.dailyLastClaim=cloud.dailyLastClaim;out.dailyStreak=cloud.dailyStreak;}
  else if((local.dailyLastClaim||'')>(cloud.dailyLastClaim||'')){out.dailyLastClaim=local.dailyLastClaim;out.dailyStreak=local.dailyStreak;}
  out.updatedAt=Math.max(aTime,bTime);out.schema=Math.max(Number(local.schema)||0,Number(cloud.schema)||0,19);
  const both=mergeEconomy(local.economy,cloud.economy);
  if(both){out.economy=freezeConflicts(both);const result=evaluate(out.economy);out.coins=result.coins;out.inventory=result.inventory;out.economyConflictCount=result.skipped.length+result.rejected.length;}
  else if(validEconomy(newer.economy)){
   out.economy=newer.economy;const result=evaluate(newer.economy);out.coins=result.coins;out.inventory=result.inventory;
   out.economyConflictCount=result.skipped.length+result.rejected.length+(validEconomy(older.economy)?1:0);
  }else if(validEconomy(older.economy)&&!validEconomy(newer.economy)){
   // The journal records purchases that a legacy snapshot cannot represent;
   // choose the newer legacy balance, but expose a conflict instead of silently
   // inventing spendable money or crediting the older inventory twice.
   out.economy=startEconomy(newer);out.coins=clamp(newer.coins,0,9999999);out.inventory=inventory(newer.inventory);out.economyConflictCount=1;
  }else{
   // R18.2 and older snapshots have no operation history. A lossless merge
   // is impossible: prefer latest economic timestamp, NOT achievement count.
   delete out.economy;out.coins=clamp(newer.coins,0,9999999);out.inventory=inventory(newer.inventory);
   out.economyConflictCount=(local.coins!==cloud.coins||JSON.stringify(inventory(local.inventory))!==JSON.stringify(inventory(cloud.inventory)))?1:0;
  }
  return out;
 }
 window.GardenSyncCore=Object.freeze({encode,decode,checksum,valid,reconcile,MAX_CHUNK,MAX_CHUNKS,validEconomy,startEconomy,evaluate,appendOperation,mergeEconomy});
})();
