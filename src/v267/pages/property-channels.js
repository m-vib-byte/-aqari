import {createDialog,node,field} from '../components/dialog.js';
import {propertyChannelKinds,propertyContactUrl,confirmPropertyChannel} from '../domain/property-contact-links.js';

export function openPropertyChannels(propertyId){
 const d=createDialog('التواصل والسوشيال ميديا');if(!d)return false;
 let state;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_channel_settings',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{...data,propertyId}}));
 const read=async()=>{const response=await rpc('context');d.session.check();state=confirmPropertyChannel(response,{workspace:d.session.bound.workspace,user:d.session.bound.user,propertyId});return state;};
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=()=>d.run(fn);return b;};
 async function edit(old=null){
  await read();if(state.manager!==true)throw Error('إدارة قنوات العقار متاحة للمدير العام فقط.');
  // Re-resolve by ID before editing; never write a stale record from another property.
  const current=old?state.items.find(x=>x.id===old.id):null;if(old&&!current)throw Error('تغيرت القناة. أعد فتح القائمة.');
  const form=node('form'),kind=node('select'),label=node('input'),url=node('input'),visible=node('input'),status=node('select'),reason=node('input');
  for(const [value,title] of Object.entries(propertyChannelKinds)){const option=node('option',title);option.value=value;kind.append(option);}
  kind.value=current?.kind||'instagram';label.value=current?.label||'';label.maxLength=200;url.value=current?.url||'';url.required=true;url.dir='ltr';url.maxLength=2000;url.placeholder='https://';visible.type='checkbox';visible.checked=current?.tenantVisible===true;
  for(const [value,title] of [['active','مفعّل'],['hidden','مخفي'],['archived','مؤرشف']]){const option=node('option',title);option.value=value;status.append(option);}status.value=current?.status||'active';reason.value=current?'تعديل قناة العقار':'إضافة قناة العقار';reason.required=true;reason.minLength=3;reason.maxLength=1000;
  form.append(field('نوع القناة',kind),field('اسم القناة',label),field('الرابط أو رقم التواصل',url),field('يظهر للمستأجر',visible),field('الحالة',status),field('سبب التعديل',reason));const save=node('button','حفظ القناة');save.type='submit';form.append(save);
  d.body.replaceChildren(button('رجوع',render),form);
  form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
   const wanted={id:current?.id||null,revision:Number(current?.revision||0),kind:kind.value,label:label.value.trim(),url:propertyContactUrl(url.value,kind.value),tenantVisible:visible.checked&&status.value==='active',status:status.value,sortOrder:current?.sortOrder??100,managementReference:current?.managementReference||'',reason:reason.value.trim()};
   const result=await rpc('save',wanted);d.session.check();if(!result?.record?.id)throw Error('لم يتأكد حفظ القناة.');
   await read();const saved=state.items.find(x=>x.id===result.record.id);
   if(!saved||saved.revision!==wanted.revision+1||['kind','label','url','tenantVisible','status'].some(k=>saved[k]!==wanted[k]))throw Error('لم تتطابق القناة بعد إعادة القراءة. لا تكرر الحفظ قبل تحديث القائمة.');
   await render();d.status.textContent='تم حفظ القناة والتحقق منها لهذا العقار.';
  });};
 }
 async function render(){
  await read();d.body.replaceChildren(node('p','قنوات هذا العقار فقط. ظهور القناة للمستأجر يحتاج اختيارك الصريح.'));
  if(state.manager===true)d.body.append(button('إضافة قناة تواصل',()=>edit()));
  for(const item of state.items){const card=node('article');card.className='aq267-property-master-section';card.append(node('h3',item.label||propertyChannelKinds[item.kind]||'قناة'));
   try{const link=node('a','فتح '+(propertyChannelKinds[item.kind]||'القناة'));link.href=propertyContactUrl(item.url,item.kind);link.target='_blank';link.rel='noopener noreferrer';card.append(link);}catch{card.append(node('p','الرابط المحفوظ يحتاج تصحيحًا.'));}
   card.append(node('p',item.status==='active'?(item.tenantVisible?'ظاهر للمستأجر':'داخلي'):'غير منشور'));
   if(state.manager===true)card.append(button('تعديل القناة',()=>edit(item)));d.body.append(card);
  }
  if(!state.items.length)d.body.append(node('p','لا توجد قنوات محفوظة لهذا العقار.'));
 }
 d.run(async()=>{try{await render();}catch(error){if(['PGRST202','42883'].includes(error?.code)&&/aqari_property_channel_settings/.test(error.message||'')){d.body.replaceChildren(node('p','إدارة قنوات العقار غير مفعّلة في قاعدة البيانات الحالية بعد. بيانات العقار الأخرى محفوظة.'));return;}throw error;}});return true;
}
