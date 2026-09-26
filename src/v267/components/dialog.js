import {t,getLocale,direction} from './locale.js';
import {createSession,safeError} from '../api/session.js';

function ensureCss(id,href){
 if(typeof document==='undefined'||document.getElementById(id))return;
 const css=document.createElement('link');css.id=id;css.rel='stylesheet';css.href=href;document.head.append(css);
}
ensureCss('aq267-semantic-colors-css','/src/v267/styles/semantic-colors.css?release=V267');
ensureCss('aq267-ultra-luxury-css','/src/v267/styles/ultra-luxury.css?release=V267');

export const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
let fieldId=0;
export function field(labelText,control){
 const group=node('div'),label=node('label',labelText);control.id||='aq267-field-'+(++fieldId);
 label.htmlFor=control.id;group.className='aq267-field';group.append(label,control);return group;
}
let active;
export function createDialog(title,{localized=true,page=false}={}){
 if(active)return null;
 const session=createSession(),el=node(page?'main':'dialog'),close=node('button',localized?t(page?'العودة للمنصة':'إغلاق'):(page?'العودة للمنصة':'إغلاق')),heading=node(page?'h1':'h2',title),status=node('p'),body=node('div');let busy=false,closed=false,pendingNavigation=null,beforeClose=null,leaving=false;
 el.className='aq267-dialog';el.dir=localized?direction():'rtl';el.lang=localized?getLocale():'ar';el.setAttribute('aria-label',title);close.type='button';close.className='aq267-close';close.setAttribute('aria-label',localized?t('إغلاق'):'إغلاق');close.title=localized?t('إغلاق'):'إغلاق';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 if(page){el.classList.add('aq267-page');el.setAttribute('tabindex','-1');close.classList.add('aq267-page-back');close.setAttribute('aria-label',localized?t('العودة للمنصة'):'العودة للمنصة');close.title=close.textContent;ensureCss('aq267-contract-pages-css','/src/v267/styles/contract-pages.css?release=V267');}
 heading.className='aq267-dialog-title';body.className='aq267-dialog-body';
 close.onclick=()=>requestClose();el.append(close,heading,status,body);
 const trigger=document.activeElement,cleanups=new Set();
 function onDispose(cleanup){if(closed){cleanup();return ()=>{};}cleanups.add(cleanup);return ()=>cleanups.delete(cleanup);}
 function dispose(){if(closed)return;closed=true;pendingNavigation=null;session.close();for(const cleanup of cleanups){try{cleanup();}catch{}}cleanups.clear();window.removeEventListener('aqari:auth-boundary',boundary);el.remove();if(page)document.body.classList.remove('aq267-page-open');active=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});}
 function closeDialog(){if(!page)el.close();dispose();}
 async function requestClose(){if(closed||leaving)return;leaving=true;try{if(beforeClose&&await beforeClose()===false)return;if(!closed)closeDialog();}catch(e){if(!closed)status.textContent=localized?t(safeError(e)):safeError(e);}finally{leaving=false;}}
 const boundary=()=>{try{session.check();}catch{closeDialog();}};
 window.addEventListener('aqari:auth-boundary',boundary);
 const escape=event=>{if(!page&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();requestClose();}};
 document.addEventListener('keydown',escape,true);
 onDispose(()=>document.removeEventListener('keydown',escape,true));
 el.addEventListener('close',dispose,{once:true});
 el.addEventListener('cancel',event=>{event.preventDefault();requestClose();});
 document.body.append(el);if(page){document.body.classList.add('aq267-page-open');el.focus?.({preventScroll:true});}else el.showModal();active=el;
 function navigate(task){if(closed)return;if(busy){pendingNavigation=task;return;}return run(task);}
 // Lock interaction, not each control's business/validation state. Inert also
 // covers controls created while loading and leaves FormData values intact.
 async function run(task){if(busy||closed)return;busy=true;const loadingMessage=localized?t('جارٍ الاتصال…'):'جارٍ الاتصال…';status.textContent=loadingMessage;el.setAttribute('aria-busy','true');body.inert=true;
  try{session.check();await session.connect();await task();if(!closed&&status.textContent===loadingMessage)status.textContent='';}
  catch(e){if(!closed){if([401,403].includes(e?.status)||e?.code==='42501'||e?.message==='ACCESS_DENIED')closeDialog();else status.textContent=localized?t(safeError(e)):safeError(e);}}
  finally{busy=false;if(!closed){el.setAttribute('aria-busy','false');body.inert=false;if(pendingNavigation){const next=pendingNavigation;pendingNavigation=null;await run(next);}}}}
 return {el,body,status,session,run,navigate,onDispose,close:closeDialog,requestClose,setBeforeClose(check){beforeClose=check;return ()=>{if(beforeClose===check)beforeClose=null;};},get closed(){return closed;}};
}
