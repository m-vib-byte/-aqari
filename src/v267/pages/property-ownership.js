import {t as visibleText,message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createOriginalDocumentUpload} from '../components/original-document-upload.js';

// Localized form hints keep their original persisted default until the user edits them.
const formDefaults=new WeakMap();
function setFormDefault(control,source,suffix=''){const display=visibleText(source)+suffix;control.value=display;formDefaults.set(control,{display,canonical:source+suffix});return control;}
function formValue(control){const initial=formDefaults.get(control);return initial&&control.value===initial.display?initial.canonical:control.value;}

const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const clean=v=>String(v??'').normalize('NFKC').trim();
const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
const moneyArea=v=>v==null?'—':Number(v).toFixed(3)+visibleText(' م²');
function select(rows,value=''){const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=v;x.append(o);}x.value=value??'';return x;}
function section(title){const s=node('section');s.append(node('h3',title));return s;}

export function ownershipShareBasisPoints(value){
 const text=String(value??'').normalize('NFKC').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace('٫','.').replace(/^\./,'0.');
 const match=/^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text);
 const bps=match?Number(match[1])*100+Number((match[2]||'').padEnd(2,'0')):0;
 if(!match||bps<1||bps>10000)throw Error('أدخل النسبة بين 0.01 و100 وبمنزلتين عشريتين كحد أقصى، دون تقريب.');
 return bps;
}

export function ownershipReadbackMatches(actual,expected){
 const area=value=>{const m=/^(\d{1,12})(?:\.(\d{1,3}))?$/.exec(String(value??''));return m?BigInt(m[1])*1000n+BigInt((m[2]||'').padEnd(3,'0')):null;};
 if(area(expected.area)===null||area(actual?.property?.totalAreaSqm)!==area(expected.area)
  ||Number(actual?.masterRevision)!==Number(expected.masterRevision)||Number(actual?.ownershipRevision)!==Number(expected.ownershipRevision)
  ||!Array.isArray(actual?.owners)||actual.owners.length!==expected.owners.length)return false;
 const owners=new Map(actual.owners.map(owner=>[owner?.id,owner]));
 if(owners.size!==actual.owners.length||new Set(expected.owners.map(owner=>owner.id)).size!==expected.owners.length)return false;
 return expected.owners.every(owner=>{
  const saved=owners.get(owner.id);
  return !!owner.id&&!!saved&&Number.isInteger(saved.bps)&&saved.bps===owner.bps
   &&['name','role','email','phone','whatsapp','supportingDocumentId'].every(key=>String(saved[key]??'')===String(owner[key]??''));
 });
}

export function openPropertyOwnership(propertyId){
 const d=createDialog(translateStatic('الملكية والمساحات والورثة'));if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_ownership',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:{propertyId,...data}}));
 let state=null;
 async function load(){const r=await rpc('context',{});d.session.check();if(r?.workspace_id!==d.session.bound.workspace||r?.property_id!==propertyId||r?.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق ملكية العقار.');state=r;return r;}
 async function uploadEvidence(){
  await load();if(!state.manager)throw Error('رفع مستندات الملكية من هذه الشاشة متاح للمدير العام فقط.');
  d.body.replaceChildren(node('h3',translateStatic('رفع مستند مؤيد للملكية أو الإرث')),button(visibleText('رجوع'),()=>d.run(render)));
  const form=node('form'),fileInput=input('file'),title=input('text'),reason=input('text',visibleText('مستند مؤيد للملكية / الإرث')),save=node('button',translateStatic('رفع وأرشفة المستند'));fileInput.required=title.required=reason.required=true;fileInput.accept='application/pdf,image/jpeg,image/png,image/webp';title.maxLength=180;reason.minLength=3;save.type='submit';form.append(field(translateStatic('الملف'),fileInput),field(translateStatic('العنوان'),title),field(translateStatic('الوصف/المرجع'),reason),save);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const upload=createOriginalDocumentUpload(d.session),row=await upload(fileInput.files[0],{type:'property',ref:state.property.externalRef,category:'property_other',title:clean(title.value)});d.session.check();await load();if(!(state.documents||[]).some(x=>x.id===row.id))throw Error('تمت الأرشفة لكن المستند لم يظهر في ملف العقار بعد إعادة القراءة.');await edit();d.status.textContent=translateStatic('تم أرشفة المستند. اختره الآن كمستند مؤيد للمالك/الوارث.');});};
 }
 function ownerEditor(target,owners,totalArea){
  const rows=[];const docs=(state.documents||[]).map(x=>[x.id,`${x.no||''} · ${x.title||x.id}`]);
  const draw=(owner={})=>{const wrap=node('fieldset'),id=owner.id||crypto.randomUUID(),name=input('text',owner.name||''),role=owner.role?input('text',owner.role):setFormDefault(input('text'),'مالك'),share=input('text',Number(owner.bps||0)/100),email=input('email',owner.email||''),phone=input('tel',owner.phone||''),whatsapp=input('tel',owner.whatsapp||''),doc=select([['',visibleText('اختر المستند المؤيد')],...docs],owner.supportingDocumentId||''),area=node('strong'),remove=button(visibleText('إزالة الصف'),()=>{const i=rows.findIndex(x=>x.wrap===wrap);if(i>=0)rows.splice(i,1);wrap.remove();refresh();});name.required=role.required=share.required=doc.required=true;share.inputMode='decimal';
   const refresh=()=>{const t=Number(totalArea.value||0);let pct=0;try{pct=ownershipShareBasisPoints(share.value)/100;}catch{}area.textContent=t>0&&pct>0?visibleMessage("المساحة المقابلة: {v0} م²",{v0:((t*pct/100).toFixed(3))}):visibleText('المساحة المقابلة: —');};share.oninput=refresh;totalArea.addEventListener('input',refresh);refresh();wrap.append(field(translateStatic('الاسم'),name),field(translateStatic('الصفة — مالك / وارث / شريك'),role),field(translateStatic('النسبة %'),share),area,field(translateStatic('المستند المؤيد'),doc),field(translateStatic('البريد'),email),field(translateStatic('الهاتف'),phone),field(translateStatic('واتساب'),whatsapp),remove);target.append(wrap);rows.push({wrap,id,name,role,share,email,phone,whatsapp,doc,refresh});};
  for(const owner of owners||[])draw(owner);if(!owners?.length)draw();target.append(button(visibleText('+ إضافة مالك / وارث'),()=>draw()));
  return ()=>rows.map(r=>({id:r.id,name:clean(r.name.value),role:clean(formValue(r.role))||'مالك',bps:ownershipShareBasisPoints(r.share.value),email:clean(r.email.value).toLowerCase(),phone:clean(r.phone.value),whatsapp:clean(r.whatsapp.value),supportingDocumentId:r.doc.value})).filter(r=>r.name||r.bps);
 }
 async function edit(){
  await load();if(!state.manager)throw Error('تعديل الملكية والمساحات متاح للمدير العام فقط.');
  d.body.replaceChildren(node('h3',translateStatic('تعديل الملكية والمساحة الرسمية')),button(visibleText('رجوع'),()=>d.run(render)));
  const form=node('form'),totalArea=input('text',state.property.totalAreaSqm??''),ownersBox=section(visibleText('الملاك / الورثة والحصص')),reason=node('textarea'),save=node('button',translateStatic('حفظ الملكية وإعادة القراءة'));totalArea.required=true;totalArea.inputMode='decimal';reason.required=true;reason.minLength=3;setFormDefault(reason,'تحديث الملكية والمساحة الرسمية');save.type='submit';const readOwners=ownerEditor(ownersBox,state.owners||[],totalArea);form.append(field(translateStatic('إجمالي المساحة الرسمية م²'),totalArea),ownersBox,button(visibleText('رفع مستند مؤيد جديد'),()=>d.run(uploadEvidence)),field(translateStatic('سبب التعديل'),reason),save);d.body.append(form);
  let unconfirmed=false;
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{if(unconfirmed)throw Error('لم يتأكد الحفظ السابق. ارجع إلى سجل الملكية وراجعه قبل إعادة التعديل.');const area=clean(totalArea.value);if(!/^\d{1,12}(\.\d{1,3})?$/.test(area)||Number(area)<=0)throw Error('راجع إجمالي المساحة الرسمية.');const owners=readOwners();if(!owners.length||owners.some(o=>!o.name||!o.supportingDocumentId||o.bps<1||o.bps>10000)||owners.reduce((s,o)=>s+o.bps,0)!==10000)throw Error('أكمل الملاك/الورثة والمستند المؤيد وتأكد أن مجموع الحصص 100%.');unconfirmed=true;const saved=await rpc('save',{expectedMasterRevision:Number(state.masterRevision||0),expectedOwnershipRevision:Number(state.ownershipRevision||0),totalAreaSqm:area,owners,reason:clean(formValue(reason))});d.session.check();if(Number(saved?.ownershipRevision)!==Number(state.ownershipRevision||0)+1||Number(saved?.masterRevision)!==Number(state.masterRevision||0)+1)throw Error('لم تتأكد Revision الملكية بعد الحفظ.');const verify=await load();if(!ownershipReadbackMatches(verify,{area,owners,masterRevision:saved.masterRevision,ownershipRevision:saved.ownershipRevision}))throw Error('فشل Readback للملكية والمساحة.');await render();unconfirmed=false;d.status.textContent=translateStatic('تم حفظ الملكية والمساحة وحصص الملاك/الورثة وإعادة قراءتها من الخادم.');});};
 }
 async function render(){
  await load();d.body.replaceChildren();const p=state.property||{},head=section(p.name||visibleText('العقار'));head.append(node('p',translateStatic('إجمالي المساحة الرسمية: ')+moneyArea(p.totalAreaSqm)),node('p',visibleMessage("Revision الملكية: {v0}",{v0:(state.ownershipRevision||0)})));if(state.manager)head.append(button(visibleText('تعديل الملكية والمساحات'),()=>d.run(edit)),button(visibleText('رفع مستند مؤيد'),()=>d.run(uploadEvidence)));d.body.append(head);
  const owners=section(visibleText('الملاك / الورثة'));for(const o of state.owners||[]){const card=node('article'),doc=o.supportingDocument;card.append(node('strong',`${o.role||visibleText('مالك')} · ${o.name||'—'}`),node('p',visibleMessage("النسبة {v0}% · المساحة {v1}",{v0:((Number(o.bps||0)/100).toFixed(2)),v1:(moneyArea(o.areaSqm))})),node('p',doc?visibleMessage("المستند المؤيد: {v0} · {v1}",{v0:(doc.no||''),v1:(doc.title||doc.id)}):visibleText('لا يوجد مستند مؤيد')));owners.append(card);}if(!(state.owners||[]).length)owners.append(node('p',translateStatic('لا توجد حصص ملكية محفوظة بعد.')));d.body.append(owners);
  const history=section(visibleText('تاريخ الملكية والمساحة'));for(const h of state.history||[])history.append(node('p',`Revision ${h.revision} · ${moneyArea(h.totalAreaSqm)} · ${h.actor} · ${h.reason} · ${h.at}`));if(!(state.history||[]).length)history.append(node('p',translateStatic('لا يوجد تاريخ ملكية محفوظ بعد.')));d.body.append(history);d.status.textContent=translateStatic('المساحة المقابلة لكل حصة محسوبة من المساحة الرسمية × نسبة الملكية، ولا تُخزن كرقم مستقل قابل للتعارض.');
 }
 d.run(render);return true;
}
