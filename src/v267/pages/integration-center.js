import {createDialog,node,field} from '../components/dialog.js';
const input=(type='text')=>Object.assign(node('input'),{type});const option=(value,text)=>Object.assign(node('option',text),{value});const uuid=()=>crypto.randomUUID();
const providers={knet:'K-Net — محول بانتظار مواصفات المزود',email:'البريد الإلكتروني',whatsapp:'WhatsApp',sms:'SMS',push:'Push',quickbooks:'QuickBooks',zoho_books:'Zoho Books',xero:'Xero',generic_webhook:'Webhook عام'};
const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export function openIntegrationCenter(){
 const d=createDialog('مركز التكاملات الخارجية');if(!d)return;let data={configs:[],outbox:[],webhooks:[]},pending=false,editing=null,draftId=uuid();
 const warning=node('p','هذه الشاشة تجهز الربط الآمن فقط. وضع Live لا يعمل قبل إضافة سر المزود في بيئة الخادم والتحقق من مواصفاته.'),form=node('form'),provider=node('select'),purpose=input(),mode=node('select'),origin=input('url'),secretRef=input(),metadata=node('textarea'),list=node('section');
 for(const [value,label] of Object.entries(providers))provider.append(option(value,label));mode.append(option('disabled','متوقف'),option('sandbox','Sandbox'),option('live','Live'));purpose.required=true;metadata.value='{}';metadata.rows=4;
 const save=Object.assign(node('button','حفظ الإعداد'),{type:'submit'}),cancel=Object.assign(node('button','إلغاء التعديل'),{type:'button',hidden:true}),refresh=Object.assign(node('button','تحديث حالة التكاملات'),{type:'button'});
 form.append(field('المزود',provider),field('الغرض',purpose),field('الوضع',mode),field('Origin HTTPS فقط',origin),field('مرجع السر بالخادم — ليس السر نفسه',secretRef),field('بيانات عامة JSON',metadata),save,cancel);d.body.append(warning,form,refresh,list);
 const rpc=(action,payload={})=>d.session.request(d.session.client.rpc('aqari_external_integrations',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:payload}));
 async function load(proof){const result=await rpc('list');if(!Array.isArray(result?.configs)||!Array.isArray(result?.outbox)||!Array.isArray(result?.webhooks))throw Error('تعذر استرجاع حالة التكاملات.');data=result;render();if(proof&&!proof(data))throw Error('تعذر إثبات الحفظ بإعادة القراءة؛ لا تكرر العملية.');}
 async function write(action,payload,proof){if(pending)return;pending=true;try{
  // A lost write response can still be proved by an exact authoritative reread.
  try{await rpc(action,payload);}catch(error){try{await load(proof);}catch{throw error;}d.status.textContent='تم الحفظ والتحقق بإعادة القراءة.';return;}
  await load(proof);d.status.textContent='تم الحفظ والتحقق بإعادة القراءة.';
 }finally{pending=false;}}
 function reset(){editing=null;draftId=uuid();provider.value='knet';purpose.value='';mode.value='disabled';origin.value='';secretRef.value='';metadata.value='{}';save.textContent='حفظ الإعداد';cancel.hidden=true;}
 function edit(c){if(pending||d.closed)return;editing={id:c.id,revision:c.revision};provider.value=c.provider;purpose.value=c.purpose;mode.value=c.mode;origin.value=c.endpoint_origin||'';secretRef.value=c.secret_reference||'';metadata.value=JSON.stringify(c.public_metadata||{},null,2);save.textContent='حفظ التعديلات';cancel.hidden=false;d.status.textContent='عدّل الإعداد؛ اختر «متوقف» لإيقافه ثم احفظ.';}
 cancel.onclick=()=>{if(!pending)reset();};refresh.onclick=()=>d.run(()=>load());
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{let publicMetadata;try{publicMetadata=JSON.parse(metadata.value||'{}');}catch{throw Error('البيانات العامة ليست JSON صحيحاً.');}
  if(!publicMetadata||Array.isArray(publicMetadata)||typeof publicMetadata!=='object')throw Error('البيانات العامة يجب أن تكون كائن JSON.');
  const payload={id:editing?.id||draftId,revision:editing?.revision||0,provider:provider.value,purpose:purpose.value.trim(),mode:mode.value,endpoint_origin:origin.value.trim(),secret_reference:secretRef.value.trim(),public_metadata:publicMetadata};
  const proof=x=>x.configs.some(c=>c.id===payload.id&&c.revision===payload.revision+1&&c.provider===payload.provider&&c.purpose===payload.purpose&&c.mode===payload.mode&&(c.endpoint_origin||'')===payload.endpoint_origin&&(c.secret_reference||'')===payload.secret_reference&&canonical(c.public_metadata)===canonical(payload.public_metadata));
  await write('save',payload,proof);reset();
 });};
 function render(){list.replaceChildren(node('h3','حالة الربط والطوابير'));
  for(const c of data.configs){const card=node('article');card.append(node('h4',`${providers[c.provider]||c.provider} — ${c.purpose}`),node('p',`الوضع: ${c.mode} • الإصدار ${c.revision} • ${c.secret_reference?'مرجع السر مسجل':'لا يوجد مرجع سر'}`));const change=node('button','تعديل الإعداد أو إيقافه');change.type='button';change.onclick=()=>edit(c);const probe=node('button','إنشاء حدث اختبار داخلي');probe.type='button';probe.onclick=()=>d.run(()=>write('enqueue_test',{id:uuid(),config_id:c.id,idempotency_key:`probe:${c.id}:${c.revision}`},x=>x.outbox.some(o=>o.idempotency_key===`probe:${c.id}:${c.revision}`)));card.append(change,probe);list.append(card);}
  list.append(node('p',`أحداث Outbox: ${data.outbox.length} • Webhooks موثقة: ${data.webhooks.length}`));
  for(const x of data.outbox.slice(0,20))list.append(node('p',`${x.event_type} • ${x.status} • المحاولات ${x.attempts}`));
  for(const x of data.webhooks.slice(0,20))list.append(node('p',`${x.provider} • ${x.event_type} • ${x.status} • ${x.provider_event_id}`));
 }
 d.onDispose(()=>{data={configs:[],outbox:[],webhooks:[]};editing=null;draftId=null;});d.run(load);
}
