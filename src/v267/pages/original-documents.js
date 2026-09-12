import {createDialog,node,field} from '../components/dialog.js';
import {DOCUMENT_CATEGORIES} from '../components/document-catalog.js';
import {createOriginalDocumentUpload} from '../components/original-document-upload.js';
import {createPrivateUrls} from '../components/private-urls.js';
export function openOriginalDocuments(){
 const d=createDialog('مستندات الأطراف والعقار والعقد والإخلاء');if(!d)return;
 const urls=createPrivateUrls(d),type=node('select'),query=node('input'),records=node('select'),category=node('select'),title=node('input'),file=node('input'),list=node('section');let upload;
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
 for(const [v,label]of [['property','العقار — المالك والمؤجر'],['tenant','المستأجر'],['lease','العقد والإخلاء']]){const o=node('option',label);o.value=v;type.append(o);}type.value='property';
 query.maxLength=100;title.maxLength=180;file.type='file';file.accept='application/pdf,image/jpeg,image/png,image/webp';
 function categories(){category.replaceChildren();for(const [value,s]of Object.entries(DOCUMENT_CATEGORIES))if(s.entities.includes(type.value)){const o=node('option',s.label);o.value=value;category.append(o);}}
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,{p_workspace_id:d.session.bound.workspace,...args}));
 const handoffLabel=value=>({received:'استلام',delivered:'تسليم',returned:'إرجاع'}[value]||value);
 const displayTime=value=>new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'});
 function handoffEditor(documentRow,article){
  const section=node('section'),direction=node('select'),delivered=node('input'),received=node('input'),when=node('input'),note=node('textarea'),history=node('div');
  section.className='aq267-document-handoff';history.className='aq267-document-handoff-history';delivered.maxLength=180;received.maxLength=180;note.maxLength=2000;when.type='datetime-local';when.value=new Date(Date.now()+10800000).toISOString().slice(0,16);
  for(const [value,label]of [['received','استلام ورقة'],['delivered','تسليم ورقة'],['returned','إرجاع ورقة']]){const o=node('option',label);o.value=value;direction.append(o);}
  async function reload(){
   const rows=await rpc('aqari_document_handoff',{p_document_id:documentRow.id,p_action:'list',p_data:{}});d.session.check();history.replaceChildren();
   if(!Array.isArray(rows)||!rows.length){history.append(node('p','لا توجد حركات تسليم أو استلام مسجلة لهذا المستند.'));return;}
   for(const row of rows){const card=node('article');card.append(node('strong',handoffLabel(row.direction)+' • '+displayTime(row.handed_at)),node('p','سلّم: '+row.delivered_by_name+' • استلم: '+row.received_by_name),node('p','سجّلها: '+(row.recorded_by_name||'مستخدم محفوظ')+' • '+displayTime(row.recorded_at)));if(row.note)card.append(node('p',row.note));history.append(card);}
  }
  const save=button('حفظ حركة التسليم/الاستلام',()=>d.run(async()=>{
   const deliveredName=delivered.value.trim(),receivedName=received.value.trim(),local=when.value;
   if(deliveredName.length<2||receivedName.length<2)throw Error('أدخل اسم من سلّم واسم من استلم.');
   if(!local)throw Error('حدد تاريخ ووقت التسليم أو الاستلام.');
   const handedAt=local+':00+03:00';
   const saved=await rpc('aqari_document_handoff',{p_document_id:documentRow.id,p_action:'record',p_data:{direction:direction.value,delivered_by_name:deliveredName,received_by_name:receivedName,handed_at:handedAt,note:note.value.trim()}});d.session.check();
   if(!saved?.id||saved.document_id!==documentRow.id)throw Error('لم يتأكد حفظ حركة التسليم والاستلام.');
   delivered.value='';received.value='';note.value='';when.value=new Date(Date.now()+10800000).toISOString().slice(0,16);await reload();d.status.textContent='تم حفظ حركة التسليم والاستلام وربطها بالمستند الأصلي.';
  }));
  section.append(node('h4','سجل تسليم واستلام الورق'),node('p','السجل إلحاقي: لا تُحذف الحركة ولا تُعدّل بعد حفظها؛ أي تصحيح يُسجل كحركة جديدة موضحة.'),field('نوع الحركة',direction),field('من سلّم',delivered),field('من استلم',received),field('التاريخ والوقت — الكويت',when),field('ملاحظة أو سبب',note),save,button('تحديث سجل التسليم والاستلام',()=>d.run(reload)),history);
  article.append(section);return d.run(reload);
 }
 let page=0;
 async function load(){urls.clear();list.replaceChildren();if(!records.value)return;const rows=await rpc('aqari_document_listing',{p_entity_type:type.value,p_entity_ref:records.value,p_page:page});
  for(const r of rows){const a=node('article');a.append(node('h3',r.title),node('p',r.document_no));if(r.status==='uploaded'){a.append(button('تحميل الملف المحفوظ',()=>d.run(async()=>{const blob=await d.session.storage('GET',r.storage_path);d.session.check();const link=node('a','فتح أو تحميل الملف الأصلي');link.href=urls.create(blob);link.download=r.document_no+(r.mime_type==='application/pdf'?'.pdf':r.mime_type==='image/png'?'.png':r.mime_type==='image/webp'?'.webp':'.jpg');a.append(link);})),button('سجل تسليم واستلام الورق',()=>handoffEditor(r,a)));}list.append(a);}
  if(!rows.length)list.append(node('p','لا توجد مستندات في هذه الصفحة.'));previous.disabled=page===0;next.disabled=rows.length<20;
 }
 async function search(){records.replaceChildren();const o=node('option','اختر السجل');o.value='';records.append(o);const rows=await rpc('aqari_document_entities',{p_type:type.value,p_query:query.value.trim()});for(const r of rows){const o=node('option',r.title);o.value=r.entity_ref;records.append(o);}page=0;await load();}
 type.onchange=()=>d.run(async()=>{categories();await search();});records.onchange=()=>d.run(async()=>{page=0;await load();});
 const previous=button('المستندات الأحدث',()=>d.run(async()=>{if(page>0)page--;await load();})),next=button('المستندات الأقدم',()=>d.run(async()=>{page++;await load();}));
 d.body.append(node('p','يرتبط كل ملف بالسجل المختار، وتحفظ بايتات الملف الأصلي دون ضغط أو استبدال النسخ السابقة. رفع مستند لا يثبت صحة توقيعه أو سداد قيمته تلقائياً. سجل تسليم واستلام الورق يحفظ من سلّم ومن استلم ووقت الحركة والحساب الذي سجلها.'),field('نوع السجل',type),field('بحث بالاسم أو رقم العقد',query),button('بحث السجلات',()=>d.run(search)),field('السجل المرتبط',records),field('تصنيف المستند',category),field('عنوان المستند',title),field('الملف الأصلي — صورة أو PDF',file),button('رفع الملف الأصلي والتحقق منه',()=>d.run(async()=>{
  if(!file.files?.[0])throw Error('اختر الملف الأصلي.');const saved=await upload(file.files[0],{type:type.value,ref:records.value,category:category.value,title:title.value});d.session.check();if(!saved?.id)throw Error('لم يتأكد حفظ المستند.');file.value='';upload=createOriginalDocumentUpload(d.session);await load();d.status.textContent='تم حفظ الأصل والتحقق من الملف وتصنيفه وربطه بالسجل.';
 })),button('تحديث المستندات',()=>d.run(load)),list,previous,next);
 d.onDispose(()=>{file.value='';title.value='';query.value='';records.replaceChildren();list.replaceChildren();upload=null;});
 categories();return d.run(async()=>{upload=createOriginalDocumentUpload(d.session);await search();});
}
