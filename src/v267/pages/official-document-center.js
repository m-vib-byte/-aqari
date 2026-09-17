import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {OFFICIAL_FORM_TEMPLATES,renderOfficialForm} from '../components/document-catalog.js';
import {officialFields,validateOfficialValues} from '../components/official-form-fields.js';

const input=(type='text')=>Object.assign(node('input'),{type});
const option=(value,text)=>Object.assign(node('option',text),{value});
const uuid=()=>crypto.randomUUID();
const canonical=value=>value&&typeof value==='object'?(Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}'):JSON.stringify(value);
async function sha256(value){const bytes=new TextEncoder().encode(canonical(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;a.rel='noopener';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function openOfficialDocumentCenter(){
 const d=createDialog(translateStatic('مركز النماذج الرسمية والأرشيف'));if(!d)return;
 let items=[],pending=false,preparing=false,context=null,contextEpoch=0,fields=new Map(),replacement=null,unconfirmed=null,numberRequest=null;
 const intro=node('p',translateStatic('اختر السجل والحركة المحفوظة. الحقول المسترجعة من قاعدة البيانات للقراءة فقط. يحفظ كل تصحيح إصداراً جديداً مع إبقاء الأصل.')),form=node('form'),kind=node('select'),entity=node('select'),source=node('select'),editor=node('section'),reason=input(),list=node('section');
 const submit=Object.assign(node('button',translateStatic('إصدار وحفظ')),{type:'submit'}),retry=Object.assign(node('button',translateStatic('التحقق من الحفظ السابق')),{type:'button',hidden:true}),cancel=Object.assign(node('button',translateStatic('إلغاء التصحيح')),{type:'button',hidden:true});
 for(const [key,spec] of Object.entries(OFFICIAL_FORM_TEMPLATES))kind.append(option(key,spec.title));
 kind.value='rent_receipt';entity.required=true;reason.required=true;reason.maxLength=500;
 form.append(field(translateStatic('نوع النموذج'),kind),field(translateStatic('السجل المرتبط'),entity),field(translateStatic('الحركة المحفوظة'),source),editor,field(translateStatic('سبب الإصدار أو التصحيح'),reason),submit,cancel,retry);d.body.append(intro,form,list);
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_official_document_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const run=task=>d.run(task).finally(()=>{if(!d.closed)controls();});
 const raw=()=>Object.fromEntries([...fields].map(([key,control])=>[key,control.value]));
 function controls(){submit.disabled=pending||preparing||!!unconfirmed||!context||!entity.value||(context.source_required&&!source.value);retry.hidden=!unconfirmed;retry.disabled=pending||preparing;kind.disabled=entity.disabled=pending||preparing||!!unconfirmed||!!replacement;source.disabled=pending||preparing||!!unconfirmed||!!replacement||!context?.source_required;cancel.disabled=pending||preparing||!!unconfirmed;}
 function renderFields(defaults={},retained={}){
  fields=new Map();editor.replaceChildren();
  for(const spec of officialFields(kind.value)){
   const control=spec.multiline?node('textarea'):input(spec.type==='date'?'date':spec.type==='month'?'month':'text');
   control.required=true;control.maxLength=spec.maxLength;control.name=spec.key;
   if(spec.type==='decimal')control.inputMode='decimal';
   const locked=Object.hasOwn(defaults,spec.key)&&!['collectionDate','fromDate','toDate','dueDate'].includes(spec.key);control.readOnly=locked||spec.key==='documentNo';if(spec.key==='documentNo'){control.required=false;control.placeholder=translateStatic('يُرقّم تلقائياً عند الحفظ');}
   control.value=String(locked?defaults[spec.key]??'':retained[spec.key]??defaults[spec.key]??(spec.key==='issuedAt'?today():''));
   fields.set(spec.key,control);editor.append(field(spec.label+(locked?' — من السجل المحفوظ':''),control));
  }
 }
 async function refreshContext({keep=false,keepSource=false,initial=false,archived=null}={}){
  const epoch=++contextEpoch,selectedKind=kind.value,selectedEntity=archived?.entityId||(initial?null:entity.value||null),selectedSource=archived?.sourceId||(keepSource?source.value||null:null),retained=archived?.payload||(keep?raw():{issuedAt:today()});
  const query={p_workspace_id:d.session.bound.workspace,p_kind:selectedKind,p_entity_id:selectedEntity,p_source_id:selectedSource,p_fields:Object.fromEntries(['collectionDate','fromDate','toDate','dueDate'].map(key=>[key,retained[key]||(key==='collectionDate'?today():'')]))};
  context=null;if(!keep)numberRequest=null;controls();
  try{
   const r=await d.session.request(d.session.client.rpc('aqari_official_document_context',query));
   if(epoch!==contextEpoch||d.closed)return;
   if(r?.workspace_id!==d.session.bound.workspace||r.user_id!==d.session.bound.user||r.kind!==selectedKind||r.entity_id!==selectedEntity||r.source_id!==selectedSource||!Array.isArray(r.entities)||!Array.isArray(r.sources)||!r.defaults||typeof r.defaults!=='object'||Array.isArray(r.defaults))throw Error('تعذر تأكيد بيانات النموذج وصلاحيات السجل.');
   context=r;entity.replaceChildren(option('','اختر السجل المحفوظ'),...r.entities.map(x=>option(x.id,x.label)));entity.value=selectedEntity||'';
   source.replaceChildren(option('',r.source_required?'اختر الحركة المعتمدة':'لا يتطلب حركة مالية مستقلة'),...r.sources.map(x=>option(x.id,x.label)));source.value=selectedSource||'';source.required=r.source_required;
   renderFields(r.defaults,retained);for(const key of ['collectionDate','fromDate','toDate','dueDate'])if(fields.has(key))fields.get(key).onchange=()=>run(()=>refreshContext({keep:true,keepSource:true}));
  }finally{if(epoch===contextEpoch)controls();}
 }
 async function load(){const result=await rpc('list');if(!Array.isArray(result?.items))throw Error('تعذر استرجاع أرشيف النماذج.');items=result.items;render();}
 async function confirmWrite(request,{recover=false}={}){
  const result=await rpc('get',{id:request.data.id});
  // The initial request may never have reached the server. Retry that exact
  // reserved identifier and snapshot, never allocate another document number.
  if(recover&&request.action==='issue'&&result&&Object.keys(result).length===0){await rpc(request.action,request.data);return confirmWrite(request);}
  if(result?.series?.id!==request.data.id||result.series.workspace_id!==d.session.bound.workspace||!Array.isArray(result.versions))throw Error('تعذر تأكيد حفظ المستند؛ استخدم التحقق من الحفظ السابق.');
  const version=result.versions.find(v=>v.id===request.data.version_id);
  if(recover&&((request.action==='supersede'&&!version&&result.series.current_version===request.data.expected_version)||(request.action==='void'&&result.series.status==='issued'))){await rpc(request.action,request.data);return confirmWrite(request);}
  const verified=request.action==='void'?result.series.status==='void'&&result.series.void_reason===request.data.reason:
   version&&version.workspace_id===d.session.bound.workspace&&version.series_id===request.data.id&&version.content_sha256===request.data.content_sha256&&version.body===request.data.body&&canonical(version.payload)===canonical(request.data.payload);
  if(!verified)throw Error('تعذر تأكيد حفظ المستند؛ استخدم التحقق من الحفظ السابق.');
  unconfirmed=null;replacement=null;numberRequest=null;cancel.hidden=true;submit.textContent=translateStatic('إصدار وحفظ');await load();d.status.textContent=translateStatic('تم الحفظ والتحقق بإعادة القراءة من قاعدة البيانات.');
 }
 async function write(action,data){
  if(pending)return;pending=true;unconfirmed={action,data};controls();
  try{await rpc(action,data);await confirmWrite(unconfirmed);}catch(error){if(['22023','23514','23505','40001','42501','P0002'].includes(error?.code))unconfirmed=null;throw error;}finally{pending=false;controls();}
 }
 retry.onclick=()=>run(async()=>{if(pending||!unconfirmed)return;pending=true;controls();try{await confirmWrite(unconfirmed,{recover:true});}finally{pending=false;controls();}});
 kind.onchange=()=>run(()=>refreshContext({initial:true}));entity.onchange=()=>run(()=>refreshContext());source.onchange=()=>run(()=>refreshContext({keep:true,keepSource:true}));
 cancel.onclick=()=>run(async()=>{replacement=null;cancel.hidden=true;submit.textContent=translateStatic('إصدار وحفظ');await refreshContext({initial:true});});
 form.onsubmit=e=>{e.preventDefault();if(pending||preparing||unconfirmed||!context)return;return run(async()=>{
  if(pending||preparing||unconfirmed||!context)return;
  if(!entity.value||(context.source_required&&!source.value))throw Error('اختر السجل والحركة المحفوظة أولاً.');
  if(reason.value.trim().length<3)throw Error('أدخل سبب الإصدار أو التصحيح.');
  const values=validateOfficialValues(kind.value,{...raw(),documentNo:replacement?.document_no||'رقم سيصدر آلياً'});
  const payload={...context.defaults,...values};if(source.value)payload.sourceId=source.value;
  preparing=true;controls();try{
  numberRequest||={id:uuid(),kind:kind.value,entityId:entity.value};
  if(!replacement){const r=await d.session.request(d.session.client.rpc('aqari_official_document_number',{p_workspace_id:d.session.bound.workspace,p_request_id:numberRequest.id,p_kind:kind.value,p_entity_id:entity.value}));if(r?.id!==numberRequest.id||r.workspace_id!==d.session.bound.workspace||r.kind!==kind.value||r.entity_id!==entity.value||!/^AQ-\d{8}-\d{8,}$/.test(r.document_no||''))throw Error('تعذر تأكيد رقم المستند المحجوز.');payload.documentNo=r.document_no;fields.get('documentNo').value=r.document_no;}
  const rendered=renderOfficialForm(kind.value,payload),id=replacement?.id||numberRequest.id,versionId=uuid();
  const snapshot={kind:rendered.kind,title:rendered.title,documentNo:rendered.documentNo,version:rendered.version,issuedAt:rendered.issuedAt,body:rendered.body,payload:rendered.snapshot};
  const action=replacement?'supersede':'issue',request={id,version_id:versionId,event_id:uuid(),...(replacement?{expected_version:replacement.current_version}:{}),kind:rendered.kind,document_no:rendered.documentNo,entity_type:context.entity_type,entity_id:entity.value,title:rendered.title,body:rendered.body,payload:rendered.snapshot,template_version:rendered.version,reason:reason.value.trim()};
  request.content_sha256=await sha256(snapshot);d.session.check();await write(action,request);
  }finally{preparing=false;controls();}
 });};
 async function pdf(item){
  const {blob,status}=await d.session.operation(async signal=>{
  const auth=await d.session.client.auth.getSession();d.session.check();const token=auth?.data?.session?.access_token;if(!token||auth?.data?.session?.user?.id!==d.session.bound.user)throw Error('انتهت جلسة الدخول.');
  const response=await fetch('/api/official-document',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal,credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({workspaceId:d.session.bound.workspace,documentId:item.id,version:item.current_version})});
  d.session.check();if(response.status===503)throw Error('أرشيف ملفات PDF يحتاج إكمال إعداد التخزين الآمن. المستند محفوظ ولم يصدر ملف غير مؤرشف.');if(!response.ok){const error=Error('تعذر استرجاع ملف PDF المؤرشف.');error.status=response.status;throw error;}
  const blob=await response.blob();d.session.check();if(blob.type!=='application/pdf'||blob.size>2097152||await blob.slice(0,5).text()!=='%PDF-')throw Error('الملف الناتج ليس PDF موثوقاً.');
  const expected=response.headers.get('X-Aqari-Archived-SHA256'),status=response.headers.get('X-Aqari-Document-Status');
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(!/^[a-f0-9]{64}$/.test(expected||'')||expected!==actual||!['issued','void'].includes(status))throw Error('لم تتطابق بصمة الملف مع الأرشيف. لم يتم التنزيل.');
  const finalAuth=await d.session.client.auth.getSession();d.session.check();if(finalAuth?.data?.session?.user?.id!==d.session.bound.user||!finalAuth?.data?.session?.access_token)throw Error('تغيرت جلسة الدخول. لم يتم تنزيل الملف.');
  return {blob,status};});
  d.session.check();saveBlob(blob,item.document_no+'-v'+item.current_version+(status==='void'?'-ملغى':'')+'.pdf');
  d.status.textContent=status==='void'?'نُزّلت النسخة الأصلية المؤرشفة لمستند ملغى؛ تبقى حالة الإلغاء موثقة في السجل.':'تم تنزيل النسخة المؤرشفة والتحقق من بصمتها. للطباعة افتح الملف ثم اختر طباعة.';
 }
 async function historyOf(item){const r=await rpc('get',{id:item.id});if(r?.series?.id!==item.id||r.series.workspace_id!==d.session.bound.workspace||!Array.isArray(r.versions))throw Error('تعذر تأكيد أرشيف المستند.');return r;}
 function render(){list.replaceChildren(node('h3',translateStatic('الإصدارات المحفوظة')));
  for(const item of items){const card=node('article'),title=node('h4',`${item.document_no} — ${item.version.title}`),meta=node('p',`الإصدار ${item.current_version} • ${item.status==='void'?'ملغى':'صادر'} • ${item.version.issued_by_name}`),download=node('button',translateStatic('تنزيل PDF')),history=node('button',translateStatic('عرض جميع الإصدارات'));download.type=history.type='button';
   const archive=node('section');download.onclick=()=>run(()=>pdf(item));history.onclick=()=>run(async()=>{const result=await historyOf(item);archive.replaceChildren(node('h5',translateStatic('النسخ المؤرشفة')));for(const v of result.versions){const previous=node('button',`تنزيل الإصدار ${v.version}`);previous.type='button';previous.onclick=()=>run(()=>pdf({...item,current_version:v.version}));archive.append(previous);}d.status.textContent=translateStatic('تم استرجاع النسخ المحفوظة.');});card.append(title,meta,download,history,archive);
   if(item.status==='issued'){const replace=node('button',translateStatic('إنشاء إصدار مصحح')),voidButton=node('button',translateStatic('إلغاء موثق'));replace.type=voidButton.type='button';
    replace.onclick=()=>run(async()=>{if(pending||unconfirmed)return;const r=await historyOf(item),v=r.versions.find(x=>x.version===item.current_version);if(!v?.payload)throw Error('تعذر استرجاع محتوى الإصدار.');replacement=item;kind.value=item.kind;await refreshContext({keep:true,archived:{entityId:item.entity_id,sourceId:v.payload.sourceId||null,payload:v.payload}});cancel.hidden=false;submit.textContent=translateStatic('حفظ إصدار مصحح');});
    voidButton.onclick=()=>run(async()=>{if(pending||unconfirmed)return;if(reason.value.trim().length<3)throw Error('أدخل سبب الإلغاء.');await write('void',{id:item.id,event_id:uuid(),reason:reason.value.trim()});});card.append(replace,voidButton);
   }list.append(card);
  }
 }
 d.onDispose(()=>{contextEpoch++;items=[];fields.clear();context=null;unconfirmed=null;});
 renderFields();controls();run(async()=>{await load();await refreshContext({initial:true});});
}

