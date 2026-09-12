import {t,getLocale,direction} from './locale.js';
import {createSession,safeError} from '../api/session.js';
export const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
let fieldId=0;
export function field(labelText,control){
 const group=node('div'),label=node('label',labelText);control.id||='aq267-field-'+(++fieldId);
 label.htmlFor=control.id;group.className='aq267-field';group.append(label,control);return group;
}
let active;
export function createDialog(title,{localized=false}={}){
 if(active)return null;
 const session=createSession(),el=node('dialog'),close=node('button',localized?t('إغلاق'):'إغلاق'),status=node('p'),body=node('div');let busy=false,closed=false;
 el.className='aq267-dialog';el.dir=localized?direction():'rtl';el.lang=localized?getLocale():'ar';el.setAttribute('aria-label',title);close.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 close.onclick=closeDialog;el.append(close,node('h2',title),status,body);
 const trigger=document.activeElement,cleanups=new Set();
 function onDispose(cleanup){if(closed){cleanup();return ()=>{};}cleanups.add(cleanup);return ()=>cleanups.delete(cleanup);}
 function dispose(){if(closed)return;closed=true;session.close();for(const cleanup of cleanups){try{cleanup();}catch{}}cleanups.clear();window.removeEventListener('aqari:auth-boundary',boundary);el.remove();active=null;if(trigger?.isConnected)trigger.focus();}
 function closeDialog(){el.close();dispose();}
 const boundary=()=>{try{session.check();}catch{closeDialog();}};
 window.addEventListener('aqari:auth-boundary',boundary);
 // Native close events are queued. Remove private data synchronously at an auth boundary.
 el.addEventListener('close',dispose,{once:true});
 el.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
 document.body.append(el);el.showModal();active=el;
 async function run(task){if(busy||closed)return;busy=true;const loadingMessage=localized?t('جارٍ الاتصال…'):'جارٍ الاتصال…';status.textContent=loadingMessage;el.setAttribute('aria-busy','true');const controls=[...el.querySelectorAll('button,input,select,textarea')].filter(x=>x!==close);const disabled=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);
  try{session.check();await session.connect();await task();
   // A completed request must not keep announcing that it is still connecting.
   // Preserve explicit success/readback text set by the page itself.
   if(!closed&&status.textContent===loadingMessage)status.textContent='';
  }catch(e){if(!closed){
   // Server scope revocation can arrive before the local membership changes.
   // Dispose cached records, drafts and download URLs at that boundary as well.
   if([401,403].includes(e?.status)||e?.code==='42501'||e?.message==='ACCESS_DENIED')closeDialog();
   else status.textContent=localized?t(safeError(e)):safeError(e);
  }}finally{busy=false;if(!closed){el.setAttribute('aria-busy','false');controls.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i];});}}}
 return {el,body,status,session,run,onDispose,close:closeDialog,get closed(){return closed;}};
}
