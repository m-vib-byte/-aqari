import {createDialog,node,field} from '../components/dialog.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {createVerifiedUpload} from '../components/verified-upload.js';
import {checksum} from '../components/scan-image.js';
import {t,getLocale,direction} from '../components/locale.js';
import {depositToday,isDepositDenied} from '../domain/deposit-ledger.js';
import {createVacatingWriter,vacatingValues,clearanceHTML,stableJSON} from '../domain/vacating.js';
const messages={VACATING_INVALID_DATE:'راجع العقد وتاريخ الإخلاء.',VACATING_INVALID_DATA:'راجع بيانات العملية.',VACATING_INVALID_OBLIGATION:'راجع الالتزامات والمستندات.',
 VACATING_HANDOVER_REQUIRED:'أكمل محضر حالة الوحدة والمفاتيح.',VACATING_DOCUMENT_REQUIRED:'اربط محضر التسليم المحفوظ قبل الإصدار.',VACATING_DRAFT_REQUIRED:'احفظ مسودة الإخلاء أولاً.',
 VACATING_OPEN_OBLIGATIONS:'توجد التزامات مفتوحة. أكمل التسوية أو وثّق استثناء معتمدًا.',VACATING_REFUND_REQUIRED:'أكمل رد التأمين ومعالجة دفعات الفترات اللاحقة قبل الإصدار.',
 VACATING_STALE_REVISION:'تغيّرت البيانات؛ حدّث السجل قبل الحفظ.',VACATING_REVIEW_CHANGED:'تغيّر بيان التسوية؛ أعد قراءته ومراجعته قبل الإصدار.',VACATING_IMMUTABLE:'الإصدار المحفوظ ثابت ولا يقبل التعديل.',
 VACATING_REQUEST_CONFLICT:'تعذر مطابقة العملية المحفوظة.',VACATING_SOURCE_REVIEW_REQUIRED:'العقد المستورد يحتاج مطابقة مستقلة للسجل السابق قبل براءة الذمة.',VACATING_SOURCE_UNLINKED:'تعذر مطابقة العقد بسجله الأصلي.',VACATING_ACTIVE_CONTRACT_REQUIRED:'اختر عقداً محفوظاً.'};
const fresh=()=>({vacated_on:depositToday(),keys_received:false,inspection:'',obligations:[],document_ids:[],reason:''});
export function openVacating(){
 const d=createDialog(t('الإخلاء والتسوية وبراءة الذمة'),{localized:true});if(!d)return;
 const urls=createPrivateUrls(d);let writer,leases=[],selected='',record=null,statement=null,draft=fresh(),exception='',output=null,pendingUpload=null;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_vacating_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const txt=(tag,s)=>node(tag,t(s)),say=s=>{if(!d.closed)d.status.textContent=t(s);};
 const button=(label,fn)=>{const b=txt('button',label);b.type='button';b.onclick=()=>work(fn);return b;};
 const work=fn=>d.run(async()=>{try{await fn();d.session.check();}catch(e){if(!isDepositDenied(e))render();if(messages[e.message]){const mapped=Error(t(messages[e.message]));Object.assign(mapped,{code:e.code,status:e.status});throw mapped;}throw e;}});
 function clearOutput(){urls.clear();output=null;}
 async function readSelected(){
  clearOutput();record=selected?await rpc('get',{lease_id:selected}):null;d.session.check();draft=record?{...record,obligations:record.obligations.map(x=>({...x})),document_ids:[...record.document_ids],reason:''}:fresh();
  const lease=leases.find(x=>x.id===selected);if(!record&&lease)draft.vacated_on=[depositToday(),lease.end_date].sort()[0];
  statement=null;exception='';pendingUpload=null;if(selected)await readStatement();else render();
 }
 async function readStatement(){
  clearOutput();statement=await rpc('statement',{lease_id:selected,vacated_on:draft.vacated_on});d.session.check();render();say('تم استرجاع بيان التسوية من السجلات المحفوظة.');
 }
 async function refresh(){
  const result=await writer.reconcile();d.session.check();if(result.state==='saved')selected=result.record.lease_id;
  leases=await rpc('list');d.session.check();if(!Array.isArray(leases))throw Error('تعذر قراءة السجلات.');
  if(selected&&!leases.some(x=>x.id===selected))selected='';await readSelected();
  say(result.state==='saved'?'تم حفظ العملية والتحقق من السجل.':writer.pending?'تحقق من العملية السابقة قبل تسجيل حركة جديدة.':'تم استرجاع بيان التسوية من السجلات المحفوظة.');
 }
 async function save(){
  const data=vacatingValues({...draft,lease_id:selected,revision:record?.revision??0});
  const result=writer.pending?await writer.retry(data):await writer.submit('save',data);record=result.record;await readSelected();say('تم حفظ العملية والتحقق من السجل.');
 }
 async function issue(){
  if(!record||record.state!=='draft'||!statement)throw Error('احفظ مسودة الإخلاء أولاً.');
  if(draft.reason.trim().length<3)throw Error('أدخل سبب العملية.');
  const current=vacatingValues({...draft,lease_id:selected,revision:record.revision,reason:'review'}),saved=vacatingValues({...record,lease_id:selected,reason:'review'});
  if(stableJSON(current)!==stableJSON(saved))throw Error('احفظ تغييرات المسودة قبل الإصدار.');
  const data={lease_id:selected,revision:record.revision,reason:draft.reason.trim(),exception_reason:exception.trim(),review_token:statement.review_token};
  const result=writer.pending?await writer.retry(data):await writer.submit('issue',data);record=result.record;await readSelected();say('تم حفظ العملية والتحقق من السجل.');
  window.dispatchEvent(new Event('aqari:v267-controls-changed'));
 }
 async function upload(file){
  if(!file||!selected||!statement)throw Error('اختر عقداً محفوظاً.');
  if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>26214400)throw Error('اختر صورة أو ملف PDF بحجم لا يتجاوز 25 ميغابايت.');
  const ref=statement.lease.external_ref,hash=await checksum(file);d.session.check();
  if(!pendingUpload||pendingUpload.file!==file||pendingUpload.ref!==ref){
   const rows=await d.session.request(d.session.client.rpc('aqari_reserve_document',{p_workspace_id:d.session.bound.workspace,p_document_type:'mobile_scan',p_entity_type:'lease',p_entity_ref:ref,p_title:t('محضر الإخلاء والتسليم'),p_original_filename:file.name,p_mime_type:file.type,p_metadata:{purpose:'vacating_handover',release:'V267'}}));
   const doc=Array.isArray(rows)?rows[0]:rows;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path.startsWith(d.session.bound.workspace+'/'))throw Error('تعذر حجز نسخة المستند.');
   pendingUpload={file,ref,doc,hash,upload:createVerifiedUpload(d.session,{path:doc.storage_path,blob:file})};
  }
  const p=pendingUpload;await p.upload();await d.session.request(d.session.client.rpc('aqari_finalize_document',{p_document_id:p.doc.document_id,p_size_bytes:file.size,p_mime_type:file.type,p_checksum:p.hash}));
  const check=await d.session.request(d.session.client.from('aqari_documents').select('id,status,entity_type,entity_ref,created_by,checksum_sha256').eq('workspace_id',d.session.bound.workspace).eq('id',p.doc.document_id).single());
  if(check.id!==p.doc.document_id||check.status!=='uploaded'||check.entity_type!=='lease'||check.entity_ref!==ref||check.created_by!==d.session.bound.user||check.checksum_sha256!==p.hash)throw Error('تعذر مطابقة المستند المحفوظ.');
  draft.document_ids=[...new Set([...draft.document_ids,check.id])];pendingUpload=null;await readStatement();say('تم حفظ المستند والتحقق من أصله.');
 }
 function input(label,key,type='text'){
  const x=node(type==='textarea'?'textarea':'input');if(type!=='textarea')x.type=type;x.value=draft[key]??'';x.oninput=()=>{draft[key]=x.value;if(key==='vacated_on'){statement=null;clearOutput();}};return field(t(label),x);
 }
 function render(){
  if(d.closed)return;d.body.replaceChildren();
  const select=node('select'),empty=txt('option','اختر عقداً محفوظاً.');empty.value='';select.append(empty);
  for(const l of leases){const o=node('option',l.contract_no);o.value=l.id;select.append(o);}select.value=selected;
  select.onchange=()=>work(async()=>{selected=select.value;await readSelected();});d.body.append(field(t('العقد المحفوظ'),select),button('تحديث السجل والتحقق من العملية',refresh));
  if(writer?.pending)d.body.append(txt('p','تحقق من العملية السابقة قبل تسجيل حركة جديدة.'));
  if(!selected)return;
  if(record?.state==='issued'){
   d.body.append(node('h3',record.certificate_no),txt('p','الإصدار المحفوظ ثابت ولا يقبل التعديل.'),button('تجهيز المستند المحفوظ للطباعة',async()=>{
    const saved=await rpc('get',{lease_id:selected});d.session.check();clearOutput();output=urls.create(new Blob([clearanceHTML(saved,{translate:t,locale:getLocale(),direction:direction()})],{type:'text/html;charset=utf-8'}));render();
   }));
   if(output){const a=txt('a','فتح المستند للطباعة أو الحفظ');a.href=output;a.target='_blank';a.rel='noopener';d.body.append(a);}return;
  }
  const form=node('form');form.append(txt('p','يحسب البيان الفترات الشهرية المعتمدة دون تجزئة يومية أو خصم تلقائي من التأمين.'),input('تاريخ الإخلاء','vacated_on','date'),input('محضر حالة الوحدة','inspection','textarea'));
  const keys=node('input');keys.type='checkbox';keys.checked=draft.keys_received;keys.onchange=()=>draft.keys_received=keys.checked;form.append(field(t('تم استلام المفاتيح'),keys));
  const obligations=node('section');obligations.append(txt('h3','الالتزامات الإضافية'));
  draft.obligations.forEach((row,index)=>{const box=node('div'),description=node('input'),amount=node('input');description.value=row.description;amount.value=row.amount;amount.inputMode='decimal';description.oninput=()=>row.description=description.value;amount.oninput=()=>row.amount=amount.value;
   const remove=txt('button','إزالة');remove.type='button';remove.onclick=()=>{draft.obligations.splice(index,1);render();};box.append(field(t('الوصف'),description),field(t('المبلغ بالدينار الكويتي'),amount),remove);obligations.append(box);});
  const add=txt('button','إضافة التزام');add.type='button';add.onclick=()=>{draft.obligations.push({description:'',amount:''});render();};obligations.append(add);form.append(obligations);
  if(statement){
   const i=statement.identity;form.append(node('p',[i.tenant_name,i.property_name,i.unit_no].join(' · ')));
   for(const [label,key]of [['الرصيد المتبقي للإيجار','rent_remaining'],['رصيد التأمين','deposit_balance'],['طلبات الصيانة المفتوحة','open_maintenance'],['فواتير العقار غير المسوّاة','unallocated_utility_bills']])form.append(node('p',t(label)+': '+statement[key]));
   if(statement.source_review_required)form.append(txt('p',messages.VACATING_SOURCE_REVIEW_REQUIRED));
   const docs=node('fieldset');docs.append(txt('legend','المستندات المرتبطة'));
   for(const doc of statement.documents){const x=node('input');x.type='checkbox';x.checked=draft.document_ids.includes(doc.id);x.onchange=()=>draft.document_ids=x.checked?[...new Set([...draft.document_ids,doc.id])]:draft.document_ids.filter(id=>id!==doc.id);docs.append(field(doc.title,x));}form.append(docs);
  }
  const file=node('input');file.type='file';file.accept='application/pdf,image/jpeg,image/png,image/webp';form.append(field(t('محضر الإخلاء والتسليم'),file),button('رفع نسخة جديدة والتحقق منها',()=>upload(file.files?.[0])));
  form.append(input('سبب العملية','reason','textarea'));const saveButton=txt('button',writer?.pending?'إعادة نفس العملية دون تكرار':'حفظ مسودة الإخلاء');saveButton.type='submit';form.append(saveButton);form.onsubmit=e=>{e.preventDefault();return work(save);};
  d.body.append(form,button('تحديث بيان التسوية',readStatement));
  if(record?.state==='draft'){
   const why=node('textarea');why.value=exception;why.oninput=()=>exception=why.value;d.body.append(field(t('الاستثناء المعتمد'),why),txt('p','الاستثناء يُحفظ باسم المعتمد ويظهر في المستند؛ لا يُخفي الرصيد المتبقي.'),button('اعتماد الإخلاء وإصدار براءة الذمة',issue));
  }
 }
 d.onDispose(()=>{leases=[];record=null;statement=null;draft=fresh();exception='';pendingUpload=null;writer=null;selected='';output=null;d.body.replaceChildren();});
 return work(async()=>{writer=createVacatingWriter({rpc,scope:d.session.bound,check:d.session.check});await refresh();});
}
