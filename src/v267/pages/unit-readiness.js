import {t as visibleText} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {t} from '../components/locale.js';

const states={get ready(){return visibleText('جاهزة للتأجير');},get not_ready(){return visibleText('غير جاهزة للتأجير');},get review_required(){return visibleText('تحتاج معاينة');}};
const option=(value,label)=>Object.assign(node('option',label),{value});
const normalize=value=>value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632));

export async function mountAvailableUnitReadiness(d){
 const s=d.session;
 const access=await s.request(s.client.rpc('aqari_workspace_access',{p_workspace_id:s.bound.workspace}));
 if(access?.workspace_id!==s.bound.workspace||access?.user_id!==s.bound.user||access?.role!==s.bound.role)throw Error('تغيرت صلاحية الحساب. حدّث الصفحة.');
 if(access?.features?.unit_readiness!==true||access?.permissions?.properties?.read!==true){d.status.textContent=t('سجل جاهزية الوحدات غير متاح لهذا الحساب حالياً.');return null;}
 return mountUnitReadiness(d);
}

export function mountUnitReadiness(d){
 const property=node('select'),unit=node('select'),number=node('input'),state=node('select'),date=node('input'),source=node('input'),reason=node('textarea');
 const loadButton=node('button',t('تحميل جاهزية الوحدات')),save=node('button',t('حفظ المعاينة والتحقق منها')),form=node('form'),history=node('section');
 let data,pending,requestId=crypto.randomUUID();
 const numberField=field(t('رقم الوحدة الجديدة'),number);
 number.maxLength=80;source.maxLength=reason.maxLength=500;date.type='date';date.required=source.required=reason.required=true;
 for(const [value,label]of Object.entries(states))state.append(option(value,t(label)));state.value='review_required';
 save.type='submit';loadButton.type='button';form.hidden=true;
 form.append(field(t('العقار'),property),field(t('الوحدة'),unit),numberField,field(t('نتيجة المعاينة'),state),field(t('تاريخ المعاينة'),date),field(t('مرجع محضر المعاينة'),source),field(t('سبب اعتماد الجاهزية أو رفضها'),reason),save);
 d.body.append(node('p',t('سجّل نتيجة معاينة موثقة قبل إنشاء عقد جديد. كل تعديل يحفظ المعاينات السابقة، ولا يغيّر العقود القائمة.')),loadButton,form,history);
 const call=(action,p={})=>d.session.request(d.session.client.rpc('aqari_unit_readiness_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:p}));
 const setOptions=(control,items)=>{const old=control.value;control.replaceChildren(...items.map(x=>option(x.id,x.label)));control.value=items.some(x=>x.id===old)?old:items[0]?.id||'';};
 function showUnit(){
  const p=data.properties.find(x=>x.id===property.value),u=data.units.find(x=>x.id===unit.value&&x.property_id===p?.id);
  numberField.hidden=unit.value!=='new';number.required=!numberField.hidden;
  save.disabled=!p?.can_write;state.value=u?.state||'review_required';date.value=source.value=reason.value='';
  history.replaceChildren(node('h3',t('سجل المعاينات المحفوظة')));
  if(u)history.append(node('p',t('الحالة الحالية')+': '+t(states[u.state])+' — '+t('رقم المراجعة')+': '+u.revision));
  for(const r of data.history.filter(x=>x.unit_id===u?.id)){
   const card=node('article');card.append(node('p',t(states[r.state])+' — '+r.inspected_on),node('p',r.source_ref),node('p',r.reason));history.append(card);
  }
 }
 function showProperty(){
  const p=data.properties.find(x=>x.id===property.value);
  const options=data.units.filter(x=>x.property_id===p?.id).map(x=>({id:x.id,label:x.unit_no+' — '+t(states[x.state])}));
  if(p?.can_create)options.push({id:'new',label:t('إضافة وحدة ومعاينتها')});
  setOptions(unit,options);showUnit();
 }
 async function load(){
  const fresh=await call('list');
  if(!Array.isArray(fresh?.properties)||!Array.isArray(fresh?.units)||!Array.isArray(fresh?.history))throw Error('تعذر تحميل سجل جاهزية الوحدات.');
  data=fresh;form.hidden=false;setOptions(property,data.properties.map(x=>({id:x.id,label:x.name})));showProperty();
 }
 loadButton.onclick=()=>d.run(async()=>{await load();if(pending)d.status.textContent=t('لم تتأكد العملية السابقة بعد. اضغط الحفظ للتحقق من العملية نفسها.');});
 property.onchange=()=>{if(!pending)showProperty();};unit.onchange=()=>{if(!pending)showUnit();};
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  if(!data)throw Error('حمّل سجل جاهزية الوحدات أولاً.');
  if(!pending){
   const p=data.properties.find(x=>x.id===property.value),u=data.units.find(x=>x.id===unit.value&&x.property_id===p?.id);
   if(!p?.can_write||(!u&&!(p.can_create&&unit.value==='new')))throw Error('اختر وحدة ضمن العقارات المسموحة لحسابك.');
   const unitNo=u?.unit_no||normalize(number.value);
   if(!unitNo||unitNo.length>80||/[<>\x00-\x1f]/.test(unitNo)||!Object.hasOwn(states,state.value)||!/^\d{4}-\d{2}-\d{2}$/.test(date.value)||source.value.trim().length<3||reason.value.trim().length<3)throw Error('أكمل الوحدة ونتيجة المعاينة وتاريخها ومرجع المحضر والسبب.');
   pending={id:requestId,property_id:p.id,unit_no:unitNo,expected_revision:u?.revision||0,state:state.value,inspected_on:date.value,source_ref:source.value.trim(),reason:reason.value.trim()};
  }
  const p=pending;
  try{await call('record',p);}catch(error){
   if(['22023','23514','23505','22007','22008','40001'].includes(error?.code)){pending=null;requestId=crypto.randomUUID();}
   throw error;
  }
  await load();
  const u=data.units.find(x=>x.property_id===p.property_id&&x.unit_no===p.unit_no),r=data.history.find(x=>x.id===p.id);
  if(!u||!r||r.workspace_id!==d.session.bound.workspace||r.unit_id!==u.id||Number(r.revision)!==Number(p.expected_revision)+1||['state','inspected_on','source_ref','reason'].some(k=>r[k]!==p[k]))throw Error('لم تتأكد مطابقة المعاينة المحفوظة. أعد المحاولة للتحقق من العملية نفسها.');
  pending=null;requestId=crypto.randomUUID();unit.value=u.id;showUnit();
  d.status.textContent=t(Number(u.revision)>Number(r.revision)?'تم حفظ المعاينة وإعادة قراءتها. توجد معاينة أحدث؛ راجع الحالة الحالية.':'تم حفظ المعاينة وإعادة قراءتها من قاعدة البيانات.');
 });};
 return {load};
}

export async function openUnitReadiness(){const d=createDialog(t('جاهزية الوحدات قبل التأجير'));if(!d)return null;await d.run(()=>mountAvailableUnitReadiness(d));return d;}

