import {createDialog,node,field} from '../components/dialog.js';
const input=(type='text')=>Object.assign(node('input'),{type});const option=(value,text)=>Object.assign(node('option',text),{value});const uuid=()=>crypto.randomUUID();
const providers={knet:'K-Net — محول بانتظار مواصفات المزود',email:'البريد الإلكتروني',whatsapp:'WhatsApp',sms:'SMS',push:'Push',quickbooks:'QuickBooks',zoho_books:'Zoho Books',xero:'Xero',generic_webhook:'Webhook عام'};
export function openIntegrationCenter(){
 const d=createDialog('مركز التكاملات الخارجية');if(!d)return;let data={configs:[],outbox:[],webhooks:[]},pending=false;
 const warning=node('p','هذه الشاشة تجهز الربط الآمن فقط. وضع Live لا يعمل قبل إضافة سر المزود في بيئة الخادم والتحقق من مواصفاته.'),form=node('form'),provider=node('select'),purpose=input(),mode=node('select'),origin=input('url'),secretRef=input(),metadata=node('textarea'),list=node('section');
 for(const [value,label] of Object.entries(providers))provider.append(option(value,label));mode.append(option('disabled','متوقف'),option('sandbox','Sandbox'),option('live','Live'));purpose.required=true;metadata.value='{}';metadata.rows=4;
 form.append(field('المزود',provider),field('الغرض',purpose),field('الوضع',mode),field('Origin HTTPS فقط',origin),field('مرجع السر بالخادم — ليس السر نفسه',secretRef),field('بيانات عامة JSON',metadata),Object.assign(node('button','حفظ الإعداد'),{type:'submit'}));d.body.append(warning,form,list);
 const rpc=(action,payload={})=>d.session.request(d.session.client.rpc('aqari_external_integrations',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload}));
 async function load(proof){const result=await rpc('list');if(!Array.isArray(result?.configs)||!Array.isArray(result?.outbox)||!Array.isArray(result?.webhooks))throw Error('تعذر استرجاع حالة التكاملات.');data=result;render();if(proof&&!proof(data))throw Error('تعذر إثبات الحفظ بإعادة القراءة؛ لا تكرر العملية.');}
 async function write(action,payload,proof){if(pending)return;pending=true;try{await rpc(action,payload);await load(proof);d.status.textContent='تم الحفظ والتحقق بإعادة القراءة.';}finally{pending=false;}}
 form.onsubmit=e=>{e.preventDefault();d.run(async()=>{let publicMetadata;try{publicMetadata=JSON.parse(metadata.value||'{}');}catch{throw Error('البيانات العامة ليست JSON صحيحاً.');}const id=uuid();await write('save',{id,revision:0,provider:provider.value,purpose:purpose.value.trim(),mode:mode.value,endpoint_origin:origin.value.trim(),secret_reference:secretRef.value.trim(),public_metadata:publicMetadata},x=>x.configs.some(c=>c.id===id&&c.mode===mode.value));});};
 function render(){list.replaceChildren(node('h3','حالة الربط والطوابير'));
  for(const c of data.configs){const card=node('article');card.append(node('h4',`${providers[c.provider]||c.provider} — ${c.purpose}`),node('p',`الوضع: ${c.mode} • الإصدار ${c.revision} • ${c.secret_reference?'مرجع السر مسجل':'لا يوجد مرجع سر'}`));const probe=node('button','إنشاء حدث اختبار داخلي');probe.type='button';probe.onclick=()=>d.run(()=>write('enqueue_test',{id:uuid(),config_id:c.id,idempotency_key:`probe:${c.id}:${c.revision}`},x=>x.outbox.some(o=>o.idempotency_key===`probe:${c.id}:${c.revision}`)));card.append(probe);list.append(card);}
  list.append(node('p',`أحداث Outbox: ${data.outbox.length} • Webhooks موثقة: ${data.webhooks.length}`));
  for(const x of data.outbox.slice(0,20))list.append(node('p',`${x.event_type} • ${x.status} • المحاولات ${x.attempts}`));
  for(const x of data.webhooks.slice(0,20))list.append(node('p',`${x.provider} • ${x.event_type} • ${x.status} • ${x.provider_event_id}`));
 }
 d.onDispose(()=>{data={configs:[],outbox:[],webhooks:[]};});d.run(load);
}
