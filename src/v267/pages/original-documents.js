import {readStoredOriginal,originalDocumentExtension} from '../components/stored-original.js';
import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {DOCUMENT_CATEGORIES} from '../components/document-catalog.js';
import {createOriginalDocumentUpload} from '../components/original-document-upload.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {mountDocumentHandovers} from '../components/document-handovers.js';
export function openOriginalDocuments(){
 const d=createDialog(translateStatic('مستندات الأطراف والعقار والعقد والإخلاء'));if(!d)return;
 const urls=createPrivateUrls(d),type=node('select'),query=node('input'),records=node('select'),category=node('select'),title=node('input'),file=node('input'),list=node('section');let upload;
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
 for(const [v,label]of [['property',visibleText('العقار — المالك والمؤجر')],['tenant',visibleText('المستأجر')],['lease',visibleText('العقد والإخلاء')]]){const o=node('option',label);o.value=v;type.append(o);}type.value='property';
 query.maxLength=100;title.maxLength=180;file.type='file';file.accept='application/pdf,image/jpeg,image/png,image/webp';
 function categories(){category.replaceChildren();for(const [value,s]of Object.entries(DOCUMENT_CATEGORIES))if(s.entities.includes(type.value)){const o=node('option',s.label);o.value=value;category.append(o);}}
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,{p_workspace_id:d.session.bound.workspace,...args}));
 let page=0;
 async function load(){urls.clear();list.replaceChildren();if(!records.value)return;const rows=await rpc('aqari_document_listing',{p_entity_type:type.value,p_entity_ref:records.value,p_page:page});
  for(const r of rows){const a=node('article');a.append(node('h3',r.title),node('p',r.document_no));if(r.status==='uploaded')a.append(button(visibleText('تحميل الملف المحفوظ'),()=>d.run(async()=>{const {blob,note}=await readStoredOriginal(d.session,{id:r.id,storagePath:r.storage_path,entityType:type.value,entityRef:records.value});d.session.check();const link=node('a',translateStatic('فتح أو تحميل الملف الأصلي'));link.href=urls.create(blob);link.download=r.document_no+originalDocumentExtension(r.mime_type);a.append(link);d.status.textContent=translateStatic(note);})));list.append(a);}
  for(const [i,r] of rows.entries())if(r.status==='uploaded')mountDocumentHandovers(d,list.children[i],r.id);
  if(!rows.length)list.append(node('p',translateStatic('لا توجد مستندات في هذه الصفحة.')));previous.disabled=page===0;next.disabled=rows.length<20;
 }
 async function search(){records.replaceChildren();const o=node('option',translateStatic('اختر السجل'));o.value='';records.append(o);const rows=await rpc('aqari_document_entities',{p_type:type.value,p_query:query.value.trim()});for(const r of rows){const o=node('option',r.title);o.value=r.entity_ref;records.append(o);}page=0;await load();}
 type.onchange=()=>d.run(async()=>{categories();await search();});records.onchange=()=>d.run(async()=>{page=0;await load();});
 const previous=button(visibleText('المستندات الأحدث'),()=>d.run(async()=>{if(page>0)page--;await load();})),next=button(visibleText('المستندات الأقدم'),()=>d.run(async()=>{page++;await load();}));
 d.body.append(node('p',translateStatic('يرتبط كل ملف بالسجل المختار، وتحفظ بايتات الملف الأصلي دون ضغط أو استبدال النسخ السابقة. رفع مستند لا يثبت صحة توقيعه أو سداد قيمته تلقائياً.')),field(translateStatic('نوع السجل'),type),field(translateStatic('بحث بالاسم أو رقم العقد'),query),button(visibleText('بحث السجلات'),()=>d.run(search)),field(translateStatic('السجل المرتبط'),records),field(translateStatic('تصنيف المستند'),category),field(translateStatic('عنوان المستند'),title),field(translateStatic('الملف الأصلي — صورة أو PDF'),file),button(visibleText('رفع الملف الأصلي والتحقق منه'),()=>d.run(async()=>{
  if(!file.files?.[0])throw Error('اختر الملف الأصلي.');const saved=await upload(file.files[0],{type:type.value,ref:records.value,category:category.value,title:title.value});d.session.check();if(!saved?.id)throw Error('لم يتأكد حفظ المستند.');file.value='';upload=createOriginalDocumentUpload(d.session);await load();d.status.textContent=translateStatic('تم حفظ الأصل والتحقق من الملف وتصنيفه وربطه بالسجل.');
 })),button(visibleText('تحديث المستندات'),()=>d.run(load)),list,previous,next);
 d.onDispose(()=>{file.value='';title.value='';query.value='';records.replaceChildren();list.replaceChildren();upload=null;});
 categories();return d.run(async()=>{upload=createOriginalDocumentUpload(d.session);await search();});
}

