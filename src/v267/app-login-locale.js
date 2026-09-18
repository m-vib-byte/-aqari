import {LANGUAGES,getLocale,direction,t} from './components/locale.js';
import {restorePortalLocale,savePortalLocale} from './components/portal-locale.js';
import {createLiveTextTranslator} from './components/live-locale-text.js';

// Presentation only: preserve the existing gate, form, controls and auth handlers.
// Never inspect or modify the value of an email/password or other account field.
export function mountAppLoginLocale(doc=document){
 let queued=false,initialized=false;
 const translateText=createLiveTextTranslator(source=>t(source));
 const attributeOwners=new WeakMap();
 const translateAttribute=(element,name)=>{
  const current=element.getAttribute(name);if(current===null)return;
  let owners=attributeOwners.get(element);if(!owners){owners={};attributeOwners.set(element,owners);}
  const owner=owners[name]||(owners[name]={});const next=translateText(owner,current);
  if(next!==current)element.setAttribute(name,next);
 };
 function render(){
  const gate=doc.getElementById('aqariCloudGateV168');
  if(!gate||!gate.querySelector('#cloudEmailV168')||!gate.querySelector('#cloudPasswordV168'))return;
  // A dormant login gate remains in the authenticated document. Its anonymous
  // preference must never overwrite the verified account/workspace preference.
  if(!gate.classList.contains('on')||gate.hidden||doc.documentElement.classList.contains('aqari-auth-unlocked'))return;
  if(!initialized){restorePortalLocale();initialized=true;}
  let picker=gate.querySelector('[data-app-login-language]');
  if(!picker){
   const control=doc.createElement('label'),caption=doc.createElement('span');picker=doc.createElement('select');
   control.dataset.appLoginLanguageControl='';control.style.cssText='display:grid;gap:6px;margin-block:12px;';
   caption.dataset.appLoginLanguageCaption='';picker.dataset.appLoginLanguage='';picker.id='aqariAppLoginLanguage';control.htmlFor=picker.id;
   picker.style.cssText='width:100%;min-height:44px;font:inherit;color:inherit;background:#fffaf1;border:1px solid #cdb994;border-radius:10px;padding:8px;';
   for(const [value,label]of Object.entries(LANGUAGES)){const option=doc.createElement('option');option.value=value;option.textContent=label;picker.append(option);}
   picker.addEventListener('change',()=>{savePortalLocale(picker.value);render();});
   control.append(caption,picker);(gate.querySelector('.aq-v168-login')||gate).prepend(control);
  }
  picker.value=getLocale();const caption=gate.querySelector('[data-app-login-language-caption]');
  const label=t('لغة الواجهة');if(caption.textContent!==label)caption.textContent=label;
  if(picker.getAttribute('aria-label')!==label)picker.setAttribute('aria-label',label);
  const dir=direction();if(gate.getAttribute('dir')!==dir)gate.setAttribute('dir',dir);
  if(gate.getAttribute('lang')!==getLocale())gate.setAttribute('lang',getLocale());
  if(gate.classList.contains('on')&&!gate.hidden&&!doc.documentElement.classList.contains('aqari-auth-unlocked')){
   doc.documentElement.lang=getLocale();doc.documentElement.dir=dir;
  }
  const walker=doc.createTreeWalker(gate,4);let text;
  while((text=walker.nextNode())){
   if(text.parentElement?.closest('script,style,input,textarea,option,[data-app-login-language-control],[data-aq-record],[translate="no"]'))continue;
   const current=text.nodeValue,next=translateText(text,current);if(next!==current)text.nodeValue=next;
  }
  for(const element of [gate,...gate.querySelectorAll('[aria-label],[title],[placeholder]')]){
   if(element.closest('[data-app-login-language-control],[data-aq-record],[translate="no"]'))continue;
   for(const name of ['aria-label','title','placeholder'])translateAttribute(element,name);
  }
 }
 const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});};
 const observer=new MutationObserver(schedule);
 observer.observe(doc.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','hidden','class']});
 render();return {refresh:render,dispose:()=>observer.disconnect()};
}
