import {createDialog,node,field} from '../components/dialog.js';
const check=(value=false)=>{const x=node('input');x.type='checkbox';x.checked=!!value;return x;};

export function openCollectionDeliverySettings(propertyId){
 const d=createDialog('إعدادات رسائل التحصيل');if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_collection_delivery_settings',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:action,p_data:data}));
 let state=null;
 async function load(){const r=await rpc('context',{});d.session.check();if(r?.workspace_id!==d.session.bound.workspace||r?.property_id!==propertyId||r?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق إعدادات الرسائل.');state=r;return r;}
 async function render(){
  await load();d.body.replaceChildren();
  d.body.append(node('p','يُوقف تذكير المطالبة تلقائيًا بعد تغطية رصيد الفترة. هذه الإعدادات تحدد إرسال الوصل للمستأجر وملخص واتساب للملاك المحددين فقط.'));
  const form=node('form'),receipt=check(state.receiptEnabled!==false),ownerEnabled=check(state.ownerWhatsappEnabled===true),reason=node('textarea');reason.required=true;reason.minLength=3;reason.value='تحديث إعدادات رسائل التحصيل';
  form.append(field('إرسال الوصل للمستأجر حسب وسيلة التواصل المفضلة',receipt),field('إرسال ملخص واتساب للمالك بعد التحصيل',ownerEnabled));
  const selected=new Set(state.ownerIds||[]),ownerChecks=[];
  const owners=node('fieldset');owners.append(node('legend','مستلمو ملخص المالك'));
  for(const o of state.owners||[]){const x=check(selected.has(o.id));x.disabled=!o.whatsapp;const label=node('label');label.append(x,node('span',` ${o.role||'مالك'} · ${o.name||'—'} · ${(Number(o.bps||0)/100).toFixed(2)}% · ${o.whatsapp||'لا يوجد واتساب'}`));owners.append(label);ownerChecks.push({owner:o,input:x});}
  if(!(state.owners||[]).length)owners.append(node('p','أضف الملاك/الورثة وحصصهم أولًا من ملف الملكية.'));
  form.append(owners,field('سبب التعديل',reason));const save=node('button','حفظ الإعدادات وإعادة القراءة');save.type='submit';save.disabled=!state.canWrite;form.append(save);d.body.append(form);
  if(!state.canWrite)d.body.append(node('p','التعديل متاح للمدير العام بصلاحية الإدارة والعقار وMFA حديث.'));
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const ids=ownerChecks.filter(x=>x.input.checked&&!x.input.disabled).map(x=>x.owner.id);if(ownerEnabled.checked&&!ids.length)throw Error('حدد مالكًا واحدًا على الأقل لديه رقم واتساب.');const saved=await rpc('save',{expectedRevision:Number(state.revision||0),receiptEnabled:receipt.checked,ownerWhatsappEnabled:ownerEnabled.checked,ownerIds:ids,reason:String(reason.value||'').trim()});d.session.check();if(Number(saved?.revision)!==Number(state.revision||0)+1)throw Error('لم تتأكد إعادة قراءة Revision إعدادات الرسائل.');state=saved;await render();d.status.textContent='تم حفظ إعدادات رسائل التحصيل وإعادة قراءتها من الخادم.';});};
 }
 d.run(render);return true;
}
