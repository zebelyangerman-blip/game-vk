/* VK / OK Bridge adapter R18.3.
   Two verified cloud slots; offline retry; refresh-and-merge before uploading.
   Client storage has no transactional CAS; do not claim strong simultaneous-write
   guarantees across two disconnected devices. Local changes are always saved first. */
(()=>{
 'use strict';
 const params=new URLSearchParams(location.search);
 const inVK=params.has('vk_app_id')||params.has('vk_platform')||params.has('vk_client')||!!window.AndroidBridge||!!window.webkit?.messageHandlers?.VKWebAppInit;
 const state={environment:inVK?(params.get('vk_client')==='ok'?'ok':'vk'):'standalone',status:'idle',sync:'initializing',version:'3.0.2',error:null};
 const core=window.GardenSyncCore,root='gem_garden_r182_',legacy='gem_garden_v14_backup';
 let initPromise=null,restorePromise=null,timer=null,retryTimer=null,pending=null,writing=false,cloudEnabled=false,activeSlot=null,lastWrite=0,lastHash='',retryCount=0,retryAfter=0,hasRestored=false;
 function queueRetry(){if(!inVK||retryTimer)return;retryTimer=setTimeout(()=>{retryTimer=null;if(!document.hidden)void retry();},Math.max(500,retryAfter-Date.now()));}
 function clearRetry(){if(retryTimer)clearTimeout(retryTimer);retryTimer=null;}
 const limit=(promise,ms)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('VK timeout')),ms);Promise.resolve(promise).then(v=>{clearTimeout(t);resolve(v);},e=>{clearTimeout(t);reject(e);});});
 function change(status,error=null){state.sync=status;state.error=error;window.dispatchEvent(new CustomEvent('garden-cloud-status',{detail:{status,error}}));}
 function pause(value){window.dispatchEvent(new CustomEvent('garden-platform-pause',{detail:value}));if(value)flushSoon();else retry();}
 function loadSDK(){
  if(window.vkBridge)return Promise.resolve(window.vkBridge);
  const sources=['https://unpkg.com/@vkontakte/vk-bridge@3.0.2/dist/browser.min.js','https://cdn.jsdelivr.net/npm/@vkontakte/vk-bridge@3.0.2/dist/browser.min.js'];
  return new Promise((resolve,reject)=>{const attempt=i=>{
   if(window.vkBridge)return resolve(window.vkBridge);
   if(i>=sources.length)return reject(Error('VK SDK unavailable on both CDNs'));
   const tag=document.createElement('script');tag.src=sources[i];tag.async=true;tag.referrerPolicy='no-referrer';
   let closed=false;const watchdog=setTimeout(()=>finish(false),3100);
   function finish(ok){if(closed)return;closed=true;clearTimeout(watchdog);if(ok&&window.vkBridge)resolve(window.vkBridge);else{tag.remove();attempt(i+1);}}
   tag.onload=()=>finish(true);tag.onerror=()=>finish(false);document.head.append(tag);
  };attempt(0);});
 }
 function init(){
  if(initPromise)return initPromise;
  if(!inVK){state.status='standalone';change('standalone');return initPromise=Promise.resolve(false);}
  state.status='loading';
  initPromise=(async()=>{try{
   await limit(loadSDK(),6500);
   window.vkBridge.subscribe?.(e=>{const type=e.detail?.type;if(type==='VKWebAppViewHide')pause(true);else if(type==='VKWebAppViewRestore')pause(false);});
   await limit(window.vkBridge.send('VKWebAppInit'),6500);
   if(window.vkBridge.supports&&!window.vkBridge.supports('VKWebAppStorageGet'))throw Error('VK cloud read unsupported');
   if(window.vkBridge.supports&&!window.vkBridge.supports('VKWebAppStorageSet'))throw Error('VK cloud write unsupported');
   state.status='ready';return true;
  }catch(e){state.status='unavailable';initPromise=null;retryAfter=Date.now()+5000;change('unavailable',String(e.message||e));queueRetry();return false;}})();
  return initPromise;
 }
 async function get(keys){const response=await limit(window.vkBridge.send('VKWebAppStorageGet',{keys}),6500);if(!Array.isArray(response?.keys))throw Error('Malformed cloud response');return Object.fromEntries(response.keys.filter(x=>x&&typeof x.key==='string').map(x=>[x.key,x.value||'']));}
 async function set(key,value){return limit(window.vkBridge.send('VKWebAppStorageSet',{key,value}),6500);}
 const metaKey=slot=>root+slot+'_meta',chunkKey=(slot,i)=>root+slot+'_'+i;
 async function readSlot(slot,meta){
  if(!meta||meta.version!==1||!Number.isInteger(meta.count)||meta.count<1||meta.count>core.MAX_CHUNKS)return null;
  const keys=Array.from({length:meta.count},(_,i)=>chunkKey(slot,i));
  const response=await get(keys),pieces=keys.map(k=>response[k]),data=core.decode(pieces,meta);
  return data?{data,slot}:null;
 }
 async function readCloud(){
  const resp=await get([metaKey('a'),metaKey('b'),legacy]);
  const candidates=[];let damaged=false;
  for(const slot of ['a','b']){
   const raw=resp[metaKey(slot)];if(!raw)continue;
   let meta;try{meta=JSON.parse(raw);}catch(_){meta=null;}
   if(!meta){damaged=true;continue;}
   try{const record=await readSlot(slot,meta);if(record)candidates.push(record);else damaged=true;}catch(_){damaged=true;}
  }
  let record=null;
  if(candidates.length){
   candidates.sort((a,b)=>(Number(b.data.updatedAt)||0)-(Number(a.data.updatedAt)||0));
   record={...candidates[0]};
   if(candidates[1])record.data=core.reconcile(candidates[0].data,candidates[1].data);
  }
  if(!record&&resp[legacy]){try{const old=JSON.parse(resp[legacy]);if(core.valid(old))record={data:old,slot:null};}catch(_){}}
  if(!record&&damaged)throw Error('Cloud save needs recovery; local copy kept');
  return record;
 }
 function restore(){
  if(restorePromise)return restorePromise;
  restorePromise=(async()=>{
   const ready=await init();if(!ready)return {status:state.status,cloud:null};
   try{
    change(hasRestored?'reconnecting':'loading');
    const record=await readCloud();activeSlot=record?.slot||activeSlot;
    cloudEnabled=true;hasRestored=true;retryCount=0;retryAfter=0;clearRetry();change('ready');
    return {status:'ready',cloud:record?.data||null};
   }catch(e){cloudEnabled=false;retryAfter=Date.now()+Math.min(120000,5000*Math.pow(2,Math.min(retryCount++,5)));change('error',String(e.message||e));queueRetry();return {status:'error',cloud:null};}
  })();
  restorePromise.finally(()=>{restorePromise=null;}).catch(()=>{});
  return restorePromise;
 }
 function save(value){
  if(typeof value!=='string')return;
  if(value.length>48000){change('error','Save exceeds safety cap');return;}
  pending=value;if(cloudEnabled)schedule();
 }
 function schedule(delay=1600){
  if(timer)clearTimeout(timer);
  timer=setTimeout(flush,Math.max(delay,Math.min(8000,8000-(Date.now()-lastWrite)),0));
 }
 function notifyCloud(data){if(core.valid(data))window.dispatchEvent(new CustomEvent('garden-cloud-snapshot',{detail:{data}}));}
 async function flush(){
  if(timer){clearTimeout(timer);timer=null;}
  if(writing||!cloudEnabled||!pending)return false;
  writing=true;let value=pending;pending=null;
  try{
   change('saving');
   // Pull the newest validated journal before choosing an inactive write slot.
   // It reduces lost updates if another device finished while this page was open.
   const latest=await readCloud();
   if(latest?.slot)activeSlot=latest.slot;
   let local=JSON.parse(value);
   if(latest?.data)local=core.reconcile(local,latest.data);
   // Gameplay may have changed again during the asynchronous remote read.
   if(pending){local=core.reconcile(JSON.parse(pending),local);pending=null;}
   if(!core.valid(local))throw Error('Invalid progress snapshot');
   value=JSON.stringify(local);
   const encoded=core.encode(value);
   if(encoded.hash===lastHash){notifyCloud(local);change('synced');return true;}
   const slot=activeSlot==='a'?'b':'a';
   for(let i=0;i<encoded.chunks.length;i++)await set(chunkKey(slot,i),encoded.chunks[i]);
   const meta={version:1,count:encoded.chunks.length,length:encoded.length,hash:encoded.hash,updatedAt:Number(local.updatedAt)||Date.now()};
   await set(metaKey(slot),JSON.stringify(meta));
   activeSlot=slot;lastHash=encoded.hash;lastWrite=Date.now();retryCount=0;retryAfter=0;clearRetry();
   notifyCloud(local);change('synced');return true;
  }catch(e){lastWrite=Date.now();pending=pending||value;retryAfter=Date.now()+Math.min(120000,5000*Math.pow(2,Math.min(retryCount++,5)));change('error',String(e.message||e));queueRetry();return false;
  }finally{writing=false;if(pending&&cloudEnabled)schedule(Math.max(2500,retryAfter-Date.now()));}
 }
 function flushSoon(){if(timer){clearTimeout(timer);timer=null;}if(cloudEnabled&&pending){void flush();}}
 async function retry(){
  if(!inVK||writing||document.hidden)return false;
  if(Date.now()<retryAfter){queueRetry();return false;}
  if(!cloudEnabled){const result=await restore();if(result.status!=='ready'){queueRetry();return false;}notifyCloud(result.cloud);}
  else{
   // Refresh even when already online: another device may have changed progress.
   try{const record=await readCloud();if(record){activeSlot=record.slot||activeSlot;notifyCloud(record.data);}retryCount=0;}catch(e){retryAfter=Date.now()+8000;change('error',String(e.message||e));queueRetry();return false;}
  }
  if(pending)flushSoon();return true;
 }
 window.addEventListener('online',()=>{void retry();});
 window.addEventListener('pageshow',()=>{if(hasRestored)void retry();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)flushSoon();else if(hasRestored)void retry();});
 window.addEventListener('pagehide',flushSoon);
 window.GardenPlatform=Object.freeze({init,restore,save,flushSoon,flush,retry,state});
 init();
})();
