import {node,field} from './dialog.js';
import {t} from './locale.js';
import {createUnitMeterPhoto} from './unit-meter-photo.js';
import {createPrivateUrls} from './private-urls.js';
const phases={entry:'عند دخول المستأجر',periodic:'قراءة دورية',exit:'عند الإخلاء'};
const option=(value,label)=>Object.assign(node('option',label),{value});
export function mountUnitMeterReadings(d){
 const section=node('section'),loadButton=node('button',t('تحميل قراءات دخول وإخلاء الوحدات')),form=node('form'),history=node('section');
 const lease=node('select'),meter=node('select'),phase=node('select'),correction=node('select'),reading=node('input'),date=node('input'),source=node('input'),reason=node('input'),photo=node('input'),save=node('button',t('حفظ قراءة الوحدة والتحقق منها'));
 let data,requestId=crypto.randomUUID(),pending,loaded=false;
 const upload=createUnitMeterPhoto(d.session),urls=createPrivateUrls(d);
 reading.inputMode='decimal';date.type='date';photo.type='file';photo.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';photo.setAttribute('capture','environment');save.type='submit';
 reading.required=date.required=source.required=reason.required=true;source.maxLength=reason.maxLength=500;
 for(const [v,label]of Object.entries(phases))phase.append(option(v,t(label)));phase.value='entry';
 form.append(field(t('عقد الوحدة وموعد بدايته'),lease),field(t('عداد الوحدة'),meter),field(t('مرحلة القراءة'),phase),field(t('تصحيح قراءة سابقة'),correction),field(t('قيمة قراءة العداد'),reading),field(t('تاريخ المعاينة'),date),field(t('مرجع محضر القراءة'),source),field(t('سبب التسجيل أو التصحيح'),reason),field(t('صورة العداد'),photo),save);form.hidden=true;
 section.append(node('h3',t('قراءات الوحدات عند الدخول والإخلاء')),node('p',t('تُحفظ القراءة بتاريخها وعقدها. التصحيح يحفظ الأصل في السجل، ولا تُفترض قراءة مفقودة.')),loadButton,form,history);d.body.append(section);
 const call=(action,p={})=>d.session.request(d.session.client.rpc('aqari_unit_meter_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:p}));
 function options(control,rows,label,old=control.value){control.replaceChildren(...rows.map(x=>option(x.id,label(x))));control.value=rows.some(x=>x.id===old)?old:rows[0]?.id||'';}
 function filters(){
  const l=data?.leases.find(x=>x.id===lease.value);
  options(meter,(data?.meters||[]).filter(x=>x.property_id===l?.property_id&&x.unit_no===l?.unit_no),x=>(x.kind==='water'?t('ماء'):t('كهرباء'))+' — '+(x.serial_no||t('رقم غير مثبت')));
  const rows=(data?.readings||[]).filter(x=>x.lease_id===lease.value&&x.meter_id===meter.value&&!x.superseded);
  correction.replaceChildren(option('',t('قراءة جديدة')),...rows.map(x=>option(x.id,t(phases[x.phase])+' — '+x.observed_on+' — '+x.reading)));correction.value='';
  history.replaceChildren();urls.clear();
  for(const r of (data?.readings||[]).filter(x=>x.lease_id===lease.value&&x.meter_id===meter.value)){
   const card=node('article');card.append(node('p',t(phases[r.phase])+' — '+r.observed_on+' — '+r.reading+' '+(r.reading_unit==='m3'?t('متر مكعب'):t('كيلوواط ساعة'))),node('p',r.source_ref),node('p',r.reason),node('p',r.superseded?t('نسخة سابقة محفوظة بعد التصحيح'):t('قراءة معتمدة في السجل')));
   if(r.photo_document_id){const show=node('button',t('عرض صورة العداد المحفوظة'));show.type='button';show.onclick=()=>d.run(async()=>{const doc=await d.session.request(d.session.client.from('aqari_documents').select('id,storage_path,mime_type').eq('workspace_id',d.session.bound.workspace).eq('id',r.photo_document_id).single());if(!['image/jpeg','image/png','image/webp'].includes(doc?.mime_type))throw Error('صورة العداد غير متاحة.');const blob=await d.session.storage('GET',doc.storage_path),img=node('img');img.src=urls.create(blob);img.alt=t('صورة قراءة العداد المحفوظة');img.style.maxWidth='100%';card.append(img);});card.append(show);}
   history.append(card);
  }
 }
 async function load(){const fresh=await call('list');if(!Array.isArray(fresh?.leases)||!Array.isArray(fresh?.meters)||!Array.isArray(fresh?.readings))throw Error('تعذر تحميل سجل عدادات الوحدات.');data=fresh;loaded=true;form.hidden=false;options(lease,data.leases,x=>x.property_name+' — '+x.unit_no+' — '+(x.start_date||t('تاريخ البداية غير مثبت')));filters();}
 lease.onchange=meter.onchange=()=>{if(!pending)filters();};
 correction.onchange=()=>{const r=data?.readings.find(x=>x.id===correction.value);if(r){phase.value=r.phase;reading.value=String(r.reading);date.value=r.observed_on;source.value=r.source_ref;}reason.value='';};
 loadButton.type='button';loadButton.onclick=()=>d.run(load);
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  if(!loaded)throw Error('حمّل عدادات الوحدات أولاً.');
  if(!pending){
   const l=data.leases.find(x=>x.id===lease.value),m=data.meters.find(x=>x.id===meter.value);
   if(!l?.can_write||!m||m.property_id!==l.property_id||m.unit_no!==l.unit_no)throw Error('اختر عقداً وعداداً تابعاً لوحدته ضمن صلاحيتك.');
   const value=reading.value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace('٫','.');
   if(!/^\d{1,15}(\.\d{1,3})?$/.test(value)||!/^\d{4}-\d{2}-\d{2}$/.test(date.value)||source.value.trim().length<3||reason.value.trim().length<3)throw Error('أكمل القراءة والتاريخ ومرجع المحضر والسبب.');
   const p={id:requestId,lease_id:l.id,meter_id:m.id,phase:phase.value,reading:value,observed_on:date.value,source_ref:source.value.trim(),reason:reason.value.trim(),supersedes_id:correction.value||null,photo_document_id:null};
   if(photo.files?.[0])p.photo_document_id=await upload(photo.files[0],{propertyRef:l.property_ref,readingId:requestId,meterId:m.id,leaseId:l.id});
   pending=p;
  }
  const p=pending;
  try{await call('record',p);}catch(error){if(['22023','23514','23505','22007','22008'].includes(error?.code)){pending=null;requestId=crypto.randomUUID();}throw error;}
  await load();
  const r=data.readings.find(x=>x.id===p.id);
  if(!r||Object.entries(p).some(([k,v])=>k==='reading'?Number(r[k])!==Number(v):(r[k]??null)!==v))throw Error('لم تتأكد مطابقة القراءة المحفوظة. أعد المحاولة للتحقق من العملية نفسها.');
  pending=null;requestId=crypto.randomUUID();reading.value=source.value=reason.value=photo.value='';correction.value='';d.status.textContent=t('تم حفظ قراءة الوحدة وإعادة قراءتها من قاعدة البيانات.');
 });};
 return {section};
}
