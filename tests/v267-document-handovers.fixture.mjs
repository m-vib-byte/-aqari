// Visual-only transport fixture. It never imports a credential or calls a hosted service.
import {node} from '../src/v267/components/dialog.js';
import {mountDocumentHandovers} from '../src/v267/components/document-handovers.js';
const entries=[],cleanups=[];const dialog=node('dialog'),status=node('p'),host=node('article'),close=node('button','إغلاق اختبار الواجهة');
dialog.className='aq267-dialog';status.setAttribute('role','status');dialog.append(close,node('h2','مستند أصلي اصطناعي — DOC-TEST'),status,host);document.body.append(dialog);
let busy=false;
const d={status,onDispose:fn=>cleanups.push(fn),session:{bound:{workspace:'visual-workspace',user:'visual-user'},check(){if(!dialog.open)throw Error('أعد فتح الواجهة.');},request:async result=>result,client:{async rpc(name,args){
 if(name!=='aqari_document_handover_register')throw Error('Unexpected visual request');const p=args.p_data;
 if(args.p_action==='list')return {can_write:true,entries:structuredClone(entries),evidence:[{id:'proof',document_no:'PROOF-TEST',title:'إثبات تسليم اصطناعي'}]};
 if(args.p_action==='record'){
  const old=entries.find(e=>e.id===p.id);if(old)return structuredClone(old);
  const {id,evidence_document_id,...details}=p;const entry={id,evidence_document_id,details,document_id:'source',workspace_id:'visual-workspace',actor_id:'visual-user',actor_name:'مسجل الاختبار',recorded_at:new Date().toISOString(),evidence_snapshot:{document_no:'PROOF-TEST',title:'إثبات تسليم اصطناعي'}};entries.unshift(entry);return structuredClone(entry);
 }
 if(args.p_action==='void'){const entry=entries.find(e=>e.id===p.handover_id);entry.cancellation={...p,actor_id:'visual-user',actor_name:'مسجل الاختبار',recorded_at:new Date().toISOString()};return structuredClone(entry.cancellation);}
 throw Error('Unexpected visual action');
}}},async run(task){if(busy)return;busy=true;const controls=[...dialog.querySelectorAll('input,select,button')].filter(x=>x!==close),disabled=controls.map(x=>x.disabled);controls.forEach(x=>x.disabled=true);status.textContent='جارٍ التحقق…';try{await task();if(status.textContent==='جارٍ التحقق…')status.textContent='';}catch(e){status.textContent=e.message;}finally{busy=false;controls.forEach((x,i)=>{if(x.isConnected)x.disabled=disabled[i];});}}};
function open(){host.replaceChildren();dialog.showModal();mountDocumentHandovers(d,host,'source');}
close.onclick=()=>{cleanups.splice(0).forEach(fn=>fn());dialog.close();};document.querySelector('#open').onclick=open;
document.querySelector('#phone').onclick=()=>{dialog.style.width='390px';};document.querySelector('#tablet').onclick=()=>{dialog.style.width='820px';};
open();
