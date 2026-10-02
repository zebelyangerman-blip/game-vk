/* VK Bridge adapter. SDK: official @vkontakte/vk-bridge 3.0.2 browser build. */
(()=>{
 'use strict';
 const params=new URLSearchParams(location.search);
 const inVK=params.has('vk_app_id')||params.has('vk_platform')||!!window.AndroidBridge||!!window.webkit?.messageHandlers?.VKWebAppInit;
 const state={environment:inVK?'vk':'standalone',status:'idle',version:'3.0.2',error:null};
 let initPromise=null,saveTimer=null,pendingSave=null;
 const limit=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Platform response timeout')),ms);Promise.resolve(promise).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
 const pause=value=>window.dispatchEvent(new CustomEvent('garden-platform-pause',{detail:value}));
 function loadSDK(){
  if(window.vkBridge)return Promise.resolve(window.vkBridge);
  return new Promise((resolve,reject)=>{const tag=document.createElement('script');tag.src='https://unpkg.com/@vkontakte/vk-bridge@3.0.2/dist/browser.min.js';tag.async=true;tag.referrerPolicy='no-referrer';tag.onload=()=>window.vkBridge?resolve(window.vkBridge):reject(Error('SDK did not expose vkBridge'));tag.onerror=()=>reject(Error('SDK could not be loaded'));document.head.append(tag);});
 }
 function init(){
  if(initPromise)return initPromise;
  if(!inVK){state.status='standalone';return initPromise=Promise.resolve(false);}
  state.status='loading';
  initPromise=(async()=>{try{
   await limit(loadSDK(),8000);
   window.vkBridge.subscribe(e=>{const type=e.detail?.type;if(type==='VKWebAppViewHide')pause(true);else if(type==='VKWebAppViewRestore')pause(false);});
   await limit(window.vkBridge.send('VKWebAppInit'),8000);state.status='ready';return true;
  }catch(e){state.status='unavailable';state.error=String(e.message||e);return false;}})();
  return initPromise;
 }
 // Local progress is authoritative. This optional cloud copy never overwrites a newer local session.
 async function flush(){saveTimer=null;const value=pendingSave;if(!value||state.status!=='ready')return;try{if(window.vkBridge.supports&&!window.vkBridge.supports('VKWebAppStorageSet'))return;await limit(window.vkBridge.send('VKWebAppStorageSet',{key:'gem_garden_v14_backup',value}),6000);}catch(_){/* Local save is retained. */}}
 window.GardenPlatform=Object.freeze({init,state,save(value){if(typeof value!=='string'||value.length>14000)return;pendingSave=value;clearTimeout(saveTimer);saveTimer=setTimeout(flush,1200);}});
 init();
})();
