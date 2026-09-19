import {LANGUAGES,getLocale,setLocale,t} from './locale.js';
function defaultStorage(){try{return globalThis.localStorage;}catch{return null;}}
// Anonymous preference only; verified account/workspace preferences remain scoped.
export function restorePortalLocale(storage=defaultStorage()){
 try{const saved=storage?.getItem('aqari_login_language');if(Object.hasOwn(LANGUAGES,saved))setLocale(saved);}catch{}
}
export function savePortalLocale(value,storage=defaultStorage()){
 setLocale(value);try{storage?.setItem('aqari_login_language',value);}catch{}
}
export function refreshPortalLabels(){
 for(const el of document.querySelectorAll('[data-portal-label]'))el.setAttribute('aria-label',t(el.dataset.portalLabel));
 window.dispatchEvent(new CustomEvent('aqari:portal-locale',{detail:{locale:getLocale()}}));
}
