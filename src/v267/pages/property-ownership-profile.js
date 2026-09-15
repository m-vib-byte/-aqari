import {createDialog,node,field} from '../components/dialog.js';
const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const money=v=>Number(v||0).toFixed(3);
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}

export function openPropertyOwnershipProfile(propertyId){
 const d=createDialog('ملكية العقار ومساحات الملاك / الورثة');if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_ownership_profile',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:action,p_data:data}));
 let state=null;
 async function load(){const result=await rpc('context',{});d.session.check();if(result?.workspace_id!==d.session.bound.workspace||result?.property_id!==propertyId)throw Error('تعذر تأكيد نطاق ملف الملكية.');state=result;return result;}
 async function render(){
  await load();d.body.replaceChildren();
  d.body.append(node('p','النسب والصفات تأتي من Property Master كمصدر واحد. هذه الشاشة تحفظ المساحة الرسمية والمستند المؤيد لكل مالك أو وارث، والمساحة المقابلة لكل حصة تُحسب خادميًا من النسبة.'));
  d.body.append(node('p',`Revision الملكية: ${Number(state.revision||0)}`));
  const form=node('form'),official=input('text',state.officialAreaSqm??''),reason=node('textarea');official.inputMode='decimal';official.required=true;reason.required=true;reason.minLength=3;reason.value=Number(state.revision||0)?'تحديث مساحة وملكية العقار':'تسجيل المساحة الرسمية وملكية العقار';form.append(field('إجمالي المساحة الرسمية م²',official));
  const rows=[];for(const owner of state.owners||[]){const box=node('fieldset'),doc=select([['','اختر مستندًا مؤيدًا'],...(state.documents||[]).map(x=>[x.id,`${x.documentNo} · ${x.title}`])],owner.documentId||'');doc.required=true;box.append(node('strong',`${owner.role||'مالك'} · ${owner.name}`),node('p',`النسبة ${(Number(owner.bps||0)/100).toFixed(2)}% · المساحة الحالية ${owner.areaSqm==null?'غير محفوظة':money(owner.areaSqm)+' م²'}`),field('المستند المؤيد — إلزامي',doc));form.append(box);rows.push({owner,doc});}
  if(!rows.length)form.append(node('p','لا توجد حصص ملاك محفوظة في ملف العقار. أضف الملاك ونسبهم أولًا.'));
  form.append(field('سبب التعديل',reason));const save=node('button','حفظ وإعادة القراءة');save.type='submit';save.disabled=!rows.length;form.append(save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const raw=String(official.value||'').trim();if(!/^\d{1,12}(\.\d{1,3})?$/.test(raw)||Number(raw)<=0)throw Error('أدخل مساحة رسمية صحيحة حتى ثلاث منازل عشرية.');if(rows.some(x=>!x.doc.value))throw Error('المستند المؤيد مطلوب لكل مالك أو وارث.');const result=await rpc('save',{revision:Number(state.revision||0),officialAreaSqm:raw,owners:rows.map(x=>({ownerId:x.owner.id,documentId:x.doc.value})),reason:String(reason.value||'').trim()});if(result?.property_id!==propertyId||Number(result.revision)!==Number(state.revision||0)+1||result.complete!==true)throw Error('لم تتأكد إعادة قراءة ملف الملكية الكامل مع المستندات المؤيدة.');state=result;await render();d.status.textContent=`تم حفظ المساحة الرسمية ${money(result.officialAreaSqm)} م² وإعادة قراءة حصص ${result.owners.length} مالك/وارث مع مستنداتهم المؤيدة.`;});};
 }
 d.run(render);return true;
}
