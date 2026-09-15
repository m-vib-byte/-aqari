import {createDialog,node,field} from '../components/dialog.js';
import {createOriginalDocumentUpload} from '../components/original-document-upload.js';

const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const clean=v=>String(v??'').normalize('NFKC').trim();
const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
const moneyArea=v=>v==null?'—':Number(v).toFixed(3)+' م²';
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function section(title){const s=node('section');s.append(node('h3',title));return s;}

export function openPropertyOwnership(propertyId){
 const d=createDialog('الملكية والمساحات والورثة');if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_ownership',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{propertyId,...data}}));
 let state=null;
 async function load(){const r=await rpc('context',{});d.session.check();if(r?.workspace_id!==d.session.bound.workspace||r?.property_id!==propertyId||r?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق ملكية العقار.');state=r;return r;}
 async function uploadEvidence(){
  await load();if(!state.manager)throw Error('رفع مستندات الملكية من هذه الشاشة متاح للمدير العام فقط.');
  d.body.replaceChildren(node('h3','رفع مستند مؤيد للملكية أو الإرث'),button('رجوع',()=>d.run(render)));
  const form=node('form'),fileInput=input('file'),title=input('text'),reason=input('text','مستند مؤيد للملكية / الإرث'),save=node('button','رفع وأرشفة المستند');fileInput.required=title.required=reason.required=true;fileInput.accept='application/pdf,image/jpeg,image/png,image/webp';title.maxLength=180;reason.minLength=3;save.type='submit';form.append(field('الملف',fileInput),field('العنوان',title),field('الوصف/المرجع',reason),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const upload=createOriginalDocumentUpload(d.session),row=await upload(fileInput.files[0],{type:'property',ref:state.property.externalRef,category:'property_other',title:clean(title.value)});d.session.check();await load();if(!(state.documents||[]).some(x=>x.id===row.id))throw Error('تمت الأرشفة لكن المستند لم يظهر في ملف العقار بعد إعادة القراءة.');await edit();d.status.textContent='تم أرشفة المستند. اختره الآن كمستند مؤيد للمالك/الوارث.';});};
 }
 function ownerEditor(target,owners,totalArea){
  const rows=[];const docs=(state.documents||[]).map(x=>[x.id,`${x.no||''} · ${x.title||x.id}`]);
  const draw=(owner={})=>{const wrap=node('fieldset'),id=owner.id||crypto.randomUUID(),name=input('text',owner.name||''),role=input('text',owner.role||'مالك'),share=input('number',Number(owner.bps||0)/100),email=input('email',owner.email||''),phone=input('tel',owner.phone||''),whatsapp=input('tel',owner.whatsapp||''),doc=select([['','اختر المستند المؤيد'],...docs],owner.supportingDocumentId||''),area=node('strong'),remove=button('إزالة الصف',()=>{const i=rows.findIndex(x=>x.wrap===wrap);if(i>=0)rows.splice(i,1);wrap.remove();refresh();});name.required=role.required=share.required=doc.required=true;share.min='0.01';share.max='100';share.step='0.01';
   const refresh=()=>{const t=Number(totalArea.value||0),pct=Number(share.value||0);area.textContent=t>0&&pct>0?`المساحة المقابلة: ${(t*pct/100).toFixed(3)} م²`:'المساحة المقابلة: —';};share.oninput=refresh;totalArea.addEventListener('input',refresh);refresh();wrap.append(field('الاسم',name),field('الصفة — مالك / وارث / شريك',role),field('النسبة %',share),area,field('المستند المؤيد',doc),field('البريد',email),field('الهاتف',phone),field('واتساب',whatsapp),remove);target.append(wrap);rows.push({wrap,id,name,role,share,email,phone,whatsapp,doc,refresh});};
  for(const owner of owners||[])draw(owner);if(!owners?.length)draw();target.append(button('+ إضافة مالك / وارث',()=>draw()));
  return ()=>rows.map(r=>({id:r.id,name:clean(r.name.value),role:clean(r.role.value)||'مالك',bps:Math.round(Number(r.share.value)*100),email:clean(r.email.value).toLowerCase(),phone:clean(r.phone.value),whatsapp:clean(r.whatsapp.value),supportingDocumentId:r.doc.value})).filter(r=>r.name||r.bps);
 }
 async function edit(){
  await load();if(!state.manager)throw Error('تعديل الملكية والمساحات متاح للمدير العام فقط.');
  d.body.replaceChildren(node('h3','تعديل الملكية والمساحة الرسمية'),button('رجوع',()=>d.run(render)));
  const form=node('form'),totalArea=input('text',state.property.totalAreaSqm??''),ownersBox=section('الملاك / الورثة والحصص'),reason=node('textarea'),save=node('button','حفظ الملكية وإعادة القراءة');totalArea.required=true;totalArea.inputMode='decimal';reason.required=true;reason.minLength=3;reason.value='تحديث الملكية والمساحة الرسمية';save.type='submit';const readOwners=ownerEditor(ownersBox,state.owners||[],totalArea);form.append(field('إجمالي المساحة الرسمية م²',totalArea),ownersBox,button('رفع مستند مؤيد جديد',()=>d.run(uploadEvidence)),field('سبب التعديل',reason),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const area=clean(totalArea.value);if(!/^\d{1,12}(\.\d{1,3})?$/.test(area)||Number(area)<=0)throw Error('راجع إجمالي المساحة الرسمية.');const owners=readOwners();if(!owners.length||owners.some(o=>!o.name||!o.supportingDocumentId||o.bps<1||o.bps>10000)||owners.reduce((s,o)=>s+o.bps,0)!==10000)throw Error('أكمل الملاك/الورثة والمستند المؤيد وتأكد أن مجموع الحصص 100%.');const saved=await rpc('save',{expectedMasterRevision:Number(state.masterRevision||0),expectedOwnershipRevision:Number(state.ownershipRevision||0),totalAreaSqm:area,owners,reason:clean(reason.value)});d.session.check();if(Number(saved?.ownershipRevision)!==Number(state.ownershipRevision||0)+1||Number(saved?.masterRevision)!==Number(state.masterRevision||0)+1)throw Error('لم تتأكد Revision الملكية بعد الحفظ.');const verify=await load();if(Number(verify.property?.totalAreaSqm)!==Number(area)||verify.owners.length!==owners.length)throw Error('فشل Readback للملكية والمساحة.');await render();d.status.textContent='تم حفظ الملكية والمساحة وحصص الملاك/الورثة وإعادة قراءتها من الخادم.';});};
 }
 async function render(){
  await load();d.body.replaceChildren();const p=state.property||{},head=section(p.name||'العقار');head.append(node('p','إجمالي المساحة الرسمية: '+moneyArea(p.totalAreaSqm)),node('p',`Revision الملكية: ${state.ownershipRevision||0}`));if(state.manager)head.append(button('تعديل الملكية والمساحات',()=>d.run(edit)),button('رفع مستند مؤيد',()=>d.run(uploadEvidence)));d.body.append(head);
  const owners=section('الملاك / الورثة');for(const o of state.owners||[]){const card=node('article'),doc=o.supportingDocument;card.append(node('strong',`${o.role||'مالك'} · ${o.name||'—'}`),node('p',`النسبة ${(Number(o.bps||0)/100).toFixed(2)}% · المساحة ${moneyArea(o.areaSqm)}`),node('p',doc?`المستند المؤيد: ${doc.no||''} · ${doc.title||doc.id}`:'لا يوجد مستند مؤيد'));owners.append(card);}if(!(state.owners||[]).length)owners.append(node('p','لا توجد حصص ملكية محفوظة بعد.'));d.body.append(owners);
  const history=section('تاريخ الملكية والمساحة');for(const h of state.history||[])history.append(node('p',`Revision ${h.revision} · ${moneyArea(h.totalAreaSqm)} · ${h.actor} · ${h.reason} · ${h.at}`));if(!(state.history||[]).length)history.append(node('p','لا يوجد تاريخ ملكية محفوظ بعد.'));d.body.append(history);d.status.textContent='المساحة المقابلة لكل حصة محسوبة من المساحة الرسمية × نسبة الملكية، ولا تُخزن كرقم مستقل قابل للتعارض.';
 }
 d.run(render);return true;
}
