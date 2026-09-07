import {createSession,safeError} from '../api/session.js';
export const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
export function field(labelText,control){const el=node('label',labelText);el.append(control);return el;}
let active;
export function createDialog(title){
 if(active)return null;
 const session=createSession(),el=node('dialog'),close=node('button','إغلاق'),status=node('p'),body=node('div');let busy=false,closed=false;
 el.className='aq267-dialog';el.dir='rtl';el.setAttribute('aria-label',title);close.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 close.onclick=()=>el.close();el.append(close,node('h2',title),status,body);
 const trigger=document.activeElement;
 const boundary=()=>{try{session.check();}catch{el.close();}};
 window.addEventListener('aqari:auth-boundary',boundary);
 el.addEventListener('close',()=>{closed=true;session.close();window.removeEventListener('aqari:auth-boundary',boundary);el.remove();active=null;if(trigger?.isConnected)trigger.focus();},{once:true});
 document.body.append(el);el.showModal();active=el;
 async function run(task){if(busy||closed)return;busy=true;status.textContent='جارٍ الاتصال…';const controls=[...el.querySelectorAll('button,input,select,textarea')].filter(x=>x!==close);const disabled=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);
  try{session.check();await session.connect();await task();}catch(e){if(!closed)status.textContent=safeError(e);}finally{busy=false;if(!closed)controls.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i];});}}
 return {el,body,status,session,run,get closed(){return closed;}};
}
