import {createSession,currentScope,safeError} from './api/session.js';
import {node,field} from './components/dialog.js';
import {LANGUAGES,ROUTES,label} from './components/catalog.js';
let installed=false,access=null,locale='ar',loading=null,session,notice;
function updateLabels(){
 if(!access)return;
 // Rename navigation only: dashboard action cards also carry routing attributes
 // and their final span may be a financial number, not a label.
 for(const el of document.querySelectorAll('.v199-nav-button[data-v199-go],.v199-bottom-button[data-v199-go],#v199MoreMenu .v199-menu-action[data-v199-go],[data-v205-section][data-v199-go],[data-aq267-label],.v199-bottom-button[data-v199-action="more"]')){
  const key=el.dataset.aq267Label||ROUTES[el.dataset.v199Go||el.dataset.v205Route]||(el.dataset.v199Action==='more'?'more':null);if(!key)continue;
  const text=label(key,locale,access.labels),span=el.querySelector(':scope > span:last-child');
  if(span&&!span.querySelector('svg'))span.textContent=text;
  else if(el.dataset.aq267Label)el.textContent=text;
  else{const texts=[...el.childNodes].filter(n=>n.nodeType===3);if(texts.length)texts.at(-1).textContent=' '+text;}
  el.setAttribute('aria-label',text);
 }
}
async function refresh(){
 if(loading)return loading;
 loading=(async()=>{session?.close();session=createSession();await session.connect();const data=await session.request(session.client.rpc('aqari_workspace_access',{p_workspace_id:session.bound.workspace}));
 if(data.user_id!==session.bound.user||data.workspace_id!==session.bound.workspace||data.role!==session.bound.role)throw Error('تغيرت صلاحية الحساب. حدّث الصفحة.');
 access=data;updateLabels();if(notice)notice.textContent='';return data;})().catch(e=>{access=null;if(notice)notice.textContent=safeError(e);return null;}).finally(()=>{loading=null;});return loading;
}
export function install(){
 if(installed)return;currentScope();installed=true;
 if(!document.getElementById('aq267-workspace-css')){const css=node('link');css.id='aq267-workspace-css';css.rel='stylesheet';css.href='/src/v267/styles/workspace.css?release=V267';document.head.append(css);}
 const menu=document.getElementById('v199MoreMenu');if(!menu){installed=false;return;}
 const tools=node('section'),control=node('button',label('control_center')),scan=node('button',label('scan_document')),language=node('select');tools.className='aq267-tools';tools.id='aq267-workspace-tools';notice=node('p');notice.setAttribute('role','status');
 for(const [value,text]of Object.entries(LANGUAGES)){const option=node('option',text);option.value=value;language.append(option);}
 control.dataset.aq267Label='control_center';scan.dataset.aq267Label='scan_document';
 control.hidden=currentScope().role!=='general_manager';
 control.onclick=()=>import('./pages/control-center.js').then(m=>m.openControlCenter()).catch(e=>notice.textContent=safeError(e));
 scan.onclick=()=>import('./pages/document-scanner.js').then(m=>m.openDocumentScanner()).catch(e=>notice.textContent=safeError(e));
 language.onchange=()=>{locale=language.value;updateLabels();};
 tools.append(control,scan,field('لغة المسميات',language),notice);menu.append(tools);
 // No polling or page observers. Refresh only on explicit navigation/menu actions.
 document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-v199-action="more"]')){refresh();return;}
  const target=event.target.closest?.('[data-v199-go],[data-v205-route]');if(!target)return;
  const key=ROUTES[target.dataset.v199Go||target.dataset.v205Route];if(!key)return;
  try{currentScope();}catch{access=null;return;}
  if(!access){event.preventDefault();event.stopImmediatePropagation();refresh().then(data=>{if(data)window.alert('تم التحقق من الصلاحيات. اختر القسم المطلوب.');});return;}
  if(access.sections[key]===false||access.permissions[key]?.read!==true){event.preventDefault();event.stopImmediatePropagation();window.alert('هذا القسم متوقف أو غير متاح لصلاحية حسابك.');return;}
  queueMicrotask(updateLabels);
 },true);
 window.addEventListener('aqari:v267-controls-changed',refresh);
 window.addEventListener('aqari:auth-boundary',()=>{try{const c=currentScope();if(access&&(c.user!==access.user_id||c.workspace!==access.workspace_id)){access=null;session?.close();}}catch{access=null;session?.close();}});
 refresh();
}
