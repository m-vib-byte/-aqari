import {dateLocale} from '../components/locale.js';
import {t as visibleText} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createStaffAccountPreparations} from '../components/staff-account-preparations.js';

const roles={get collector(){return visibleText('موظف تحصيل');},get accountant(){return visibleText('محاسب');},get maintenance(){return visibleText('مسؤول صيانة');},get property_manager(){return visibleText('مدير عقار');},get viewer(){return visibleText('عرض فقط');}};
const roleCeilings={accountant:['collector','accountant','viewer'],property_manager:['collector','maintenance','property_manager','viewer'],viewer:['viewer']};
const limits={
 get collector(){return visibleText('التحصيل ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى حسابات الملاك أو الشركاء أو الموظفين.');},
 get accountant(){return visibleText('القيود والتقارير المالية ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا تعديل للعقود أو العقارات أو المستأجرين، ولا وصول إلى بيانات الشركاء.');},
 get maintenance(){return visibleText('الصيانة وبيانات التشغيل اللازمة ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى العقود أو التحصيل أو حسابات الملاك أو الشركاء أو الموظفين.');},
 get property_manager(){return visibleText('إدارة العمليات ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى حسابات الملاك أو الشركاء أو الموظفين.');},
 get viewer(){return visibleText('عرض بيانات التشغيل المصرح بها للعقارات المحددة فقط. لا إضافة أو تعديل أو اعتماد، ولا وصول إلى البيانات المالية الخاصة بالملاك.');}
};
const timestamp=value=>value?new Date(value).toLocaleString(dateLocale(),{timeZone:'Asia/Kuwait'}):visibleText('غير مسجل');
const sameProperties=(a,b)=>{if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;const sorted=[...b].sort();return [...a].sort().every((value,index)=>value===sorted[index]);};
const matches=(record,values)=>record?.user_id===values.user_id&&record.operational_role===values.operational_role&&record.is_active===values.is_active&&record.revision===values.revision+1&&sameProperties(record.property_ids,values.property_ids);
const sameDraft=(a,b)=>a.user_id===b.user_id&&a.operational_role===b.operational_role&&a.is_active===b.is_active&&a.reason===b.reason&&sameProperties(a.property_ids,b.property_ids);
const rejectedBeforeSave=error=>[400,404,409,422].includes(Number(error?.status))||['P0001','40001','22023'].includes(error?.code);

export function openStaffAccess(){
 const d=createDialog(translateStatic('صلاحيات حسابات الموظفين والعقارات'));if(!d)return;
 let directory={properties:[],members:[],assignments:[],audit:[]},revision=0,pendingSave=null,selectedUser='',baseline='',accountPreparations=null;
 const reload=node('button',translateStatic('تحديث الصلاحيات من قاعدة البيانات')),form=node('form'),user=node('select'),role=node('select'),active=node('input'),properties=node('fieldset'),reason=node('textarea'),description=node('p'),save=node('button',translateStatic('حفظ الصلاحيات والتحقق منها')),list=node('section'),audit=node('section');
 reload.type='button';save.type='submit';active.type='checkbox';user.required=role.required=reason.required=true;reason.minLength=3;reason.maxLength=500;reason.rows=3;form.hidden=true;
 const prepareAccount=node('button',translateStatic('تجهيز حساب موظف مستقل')),preparationPanel=node('section');prepareAccount.type='button';prepareAccount.hidden=true;
 const discard=node('button',translateStatic('تحميل الصلاحيات المحفوظة وترك التعديلات'));discard.type='button';
 form.append(field(translateStatic('حساب الموظف'),user),field(translateStatic('الدور الوظيفي'),role),description,field(translateStatic('تفعيل الوصول إلى العقارات المحددة'),active),properties,field(translateStatic('سبب منح الصلاحيات أو تعديلها أو إيقافها'),reason),save);
 form.append(discard);
 d.body.append(node('p',translateStatic('إدارة وصول حسابات الموظفين الموجودة. يتطلب التفعيل اختيار عقار واحد على الأقل. تحدد الأدوار الحد الأعلى للصلاحيات، وتظل قيود الأقسام والاعتمادات الخاصة سارية.')),prepareAccount,reload,form,list,audit,preparationPanel);
 const values=()=>({user_id:selectedUser,operational_role:role.value,property_ids:[...properties.querySelectorAll('input:checked')].map(control=>control.value).sort(),is_active:active.checked,revision,reason:reason.value});
 const dirty=()=>Boolean(selectedUser)&&JSON.stringify(values())!==baseline;
 const canDiscard=()=>!dirty()||window.confirm(visibleText('توجد تعديلات صلاحيات غير محفوظة. هل تريد تركها وتحميل السجل المحفوظ؟'));
 const allowedRoles=()=>roleCeilings[directory.members.find(member=>member.user_id===selectedUser)?.role]||[];
 function populateRoles(selected=''){
  role.replaceChildren();const empty=node('option',translateStatic('اختر الدور الوظيفي'));empty.value='';role.append(empty);
  for(const value of allowedRoles()){const option=node('option',roles[value]);option.value=value;role.append(option);}
  role.value=allowedRoles().includes(selected)?selected:'';
 }
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_staff_access',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 function clear(){accountPreparations?.clear();accountPreparations=null;prepareAccount.hidden=true;preparationPanel.replaceChildren();directory={properties:[],members:[],assignments:[],audit:[]};revision=0;pendingSave=null;selectedUser='';baseline='';form.hidden=true;user.replaceChildren();properties.replaceChildren();list.replaceChildren();audit.replaceChildren();reason.value='';role.replaceChildren();active.checked=false;description.textContent='';}
 function labelProperties(ids){return (ids||[]).map(id=>directory.properties.find(property=>property.id===id)?.name||visibleText('عقار غير متاح حالياً')).join('، ')||visibleText('لا توجد عقارات محددة');}
 function describeRole(){description.textContent=limits[role.value]||visibleText('اختر الدور لعرض حدود الوصول.');}
 function populateProperties(ids=[]){
  properties.replaceChildren(node('legend',translateStatic('العقارات المصرح بها — اختيار صريح')));
  for(const property of directory.properties){const check=node('input');check.type='checkbox';check.value=property.id;check.checked=ids.includes(property.id);properties.append(field(property.name,check));}
  for(const id of ids.filter(id=>!directory.properties.some(property=>property.id===id))){const check=node('input');check.type='checkbox';check.value=id;check.checked=true;check.onchange=()=>{if(!check.checked)check.disabled=true;};properties.append(field(translateStatic('عقار غير متاح حالياً — ألغِ اختياره قبل الحفظ'),check));}
  if(!directory.properties.length)properties.append(node('p',translateStatic('لا توجد عقارات متاحة لإسنادها.')));
 }
 function populate(){
  selectedUser=user.value;const assignment=directory.assignments.find(record=>record.user_id===selectedUser);revision=assignment?.revision||0;populateRoles(assignment?.operational_role||'');active.checked=assignment?.is_active===true;reason.value='';
  populateProperties(assignment?.property_ids||[]);
  describeRole();baseline=JSON.stringify(values());
 }
 function snapshot(container,heading,value){
  container.append(node('h4',heading));if(!value){container.append(node('p',translateStatic('لا يوجد سجل سابق.')));return;}
  const member=directory.members.find(record=>record.user_id===value.user_id);
  container.append(node('p',translateStatic('الحساب: ')+(member?.display_name||visibleText('حساب موظف محفوظ'))),node('p',translateStatic('الدور الوظيفي')+': '+(roles[value.operational_role]||visibleText('غير محدد'))),node('p',translateStatic('العقارات: ')+labelProperties(value.property_ids)),node('p',translateStatic('الوصول: ')+(value.is_active===true?visibleText('مفعل'):visibleText('موقوف'))));
 }
 function render(preserved=null){
  const selected=user.value;user.replaceChildren();const placeholder=node('option',translateStatic('اختر حساب الموظف'));placeholder.value='';user.append(placeholder);
  for(const member of directory.members){const option=node('option',(member.display_name||visibleText('حساب موظف'))+(member.is_active===false?visibleText(' — حساب غير نشط'):''));option.value=member.user_id;option.disabled=member.is_active===false;user.append(option);}
  if(directory.members.some(member=>member.user_id===selected&&member.is_active!==false))user.value=selected;else user.value='';populate();form.hidden=false;prepareAccount.hidden=false;
  if(preserved&&selectedUser===preserved.user_id){revision=preserved.revision;role.value=allowedRoles().includes(preserved.operational_role)?preserved.operational_role:'';active.checked=preserved.is_active;reason.value=preserved.reason;populateProperties(preserved.property_ids);describeRole();}
  list.replaceChildren(node('h3',translateStatic('الصلاحيات المحفوظة')));if(!directory.assignments.length)list.append(node('p',translateStatic('لا توجد صلاحيات تشغيلية مسندة من هذا القسم.')));
  for(const assignment of directory.assignments){const member=directory.members.find(record=>record.user_id===assignment.user_id),card=node('article');card.append(node('h4',member?.display_name||visibleText('حساب موظف محفوظ')),node('p',(roles[assignment.operational_role]||visibleText('دور غير معروف'))+' • '+(assignment.is_active?visibleText('الوصول مفعل'):visibleText('الوصول موقوف'))),node('p',translateStatic('العقارات: ')+labelProperties(assignment.property_ids)),node('p',translateStatic('آخر تعديل: ')+timestamp(assignment.updated_at)));
   if(member&&member.is_active!==false){const edit=node('button',translateStatic('تعديل صلاحيات ')+(member.display_name||visibleText('الموظف')));edit.type='button';edit.onclick=()=>{user.value=assignment.user_id;chooseUser();user.focus();};card.append(edit);}list.append(card);
  }
  audit.replaceChildren(node('h3',translateStatic('سجل تعديلات الصلاحيات')));if(!directory.audit.length)audit.append(node('p',translateStatic('لا توجد تعديلات مسجلة.')));
  for(const entry of directory.audit){const details=node('details');details.append(node('summary',(entry.actor_name||visibleText('مستخدم مسجل'))+' • '+timestamp(entry.recorded_at)),node('p',translateStatic('سبب الإجراء: ')+(entry.reason||visibleText('غير مدون'))));snapshot(details,visibleText('قبل التعديل'),entry.before_snapshot);snapshot(details,visibleText('بعد التعديل'),entry.after_snapshot);audit.append(details);}
 }
 async function read(){
  const data=await rpc('list');if(data?.manager!==true){clear();throw Error('إدارة صلاحيات الموظفين متاحة للمدير العام المخول فقط.');}
  if(!['properties','members','assignments','audit'].every(key=>Array.isArray(data[key])))throw Error('تعذر التحقق من بيانات الصلاحيات. حدّث السجلات قبل التعديل.');
  return data;
 }
 async function load(){
  const preserved=selectedUser&&(dirty()||pendingSave)?values():null,oldBaseline=baseline;const data=await read();
  const record=pendingSave&&data.assignments.find(record=>record.user_id===pendingSave.values.user_id),confirmed=pendingSave&&matches(record,pendingSave.values);
  const newer=confirmed&&preserved&&!sameDraft(preserved,pendingSave.draft);
  directory=data;render(confirmed?(newer?{...preserved,revision:record.revision}:null):preserved);if(preserved&&!confirmed&&selectedUser===preserved.user_id)baseline=oldBaseline;
  d.status.textContent=confirmed?visibleText('تم التحقق من حفظ العملية السابقة دون تكرارها.')+(newer?visibleText(' احتُفظ بتعديلاتك الأحدث؛ احفظها عند الانتهاء.'):''):pendingSave?visibleText('لم تتأكد مطابقة الصلاحيات المحفوظة. احتُفظ بالتعديلات؛ راجع السجل قبل إعادة الحفظ.'):visibleText('تم استرجاع الصلاحيات والعقارات وسجل التعديلات من قاعدة البيانات.');
  if(confirmed)pendingSave=null;
 }
 function chooseUser(){if(pendingSave){user.value=selectedUser;d.status.textContent=translateStatic('حدّث الصلاحيات للتحقق من العملية السابقة أولاً.');return;}if(!canDiscard()){user.value=selectedUser;return;}populate();}
 user.onchange=chooseUser;role.onchange=describeRole;reload.onclick=()=>d.run(load);
 discard.onclick=()=>{if(pendingSave){d.status.textContent=translateStatic('حدّث الصلاحيات للتحقق من العملية السابقة أولاً.');return;}if(canDiscard())populate();};
 form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
  const values={user_id:user.value,operational_role:role.value,property_ids:[...properties.querySelectorAll('input:checked')].map(control=>control.value),is_active:active.checked,revision,reason:reason.value.trim()};
  if(pendingSave)throw Error('حدّث الصلاحيات للتحقق من العملية السابقة أولاً.');
  if(!directory.members.some(member=>member.user_id===values.user_id&&member.is_active!==false))throw Error('اختر حساب موظف نشطاً من القائمة.');
  if(!Object.hasOwn(roles,values.operational_role))throw Error('اختر الدور الوظيفي.');
  if(!allowedRoles().includes(values.operational_role))throw Error('الدور التشغيلي يتجاوز حدود عضوية الحساب الحالية.');
  if(values.is_active&&!values.property_ids.length)throw Error('اختر عقاراً واحداً على الأقل لتفعيل الوصول.');
  if(values.property_ids.some(id=>!directory.properties.some(property=>property.id===id)))throw Error('تغيرت العقارات المتاحة. ألغِ اختيار العقارات غير المتاحة أو حدّث الصلاحيات لاسترجاعها.');
  if(values.reason.length<3||values.reason.length>500)throw Error('أدخل سبباً موثقاً من ٣ إلى ٥٠٠ حرف.');
  pendingSave={values,draft:{...values,reason:reason.value}};
  try{await rpc('save',values);}catch(error){if(rejectedBeforeSave(error))pendingSave=null;throw error;}
  const verified=await read();
  if(!matches(verified.assignments.find(record=>record.user_id===values.user_id),values))throw Error('لم تتأكد مطابقة الصلاحيات المحفوظة. حدّث السجلات قبل إعادة المحاولة.');
  pendingSave=null;directory=verified;render();d.status.textContent=values.is_active?visibleText('تم حفظ الصلاحيات والتحقق من الدور والعقارات بإعادة القراءة.'):visibleText('تم إيقاف الوصول والتحقق من حفظ الإيقاف وسجل التعديل.');
 });};
 prepareAccount.onclick=()=>d.run(async()=>{if(!accountPreparations){accountPreparations=createStaffAccountPreparations(d);preparationPanel.append(accountPreparations.el);}await accountPreparations.load();preparationPanel.scrollIntoView?.({block:'start'});});
 d.setBeforeClose?.(()=>pendingSave||accountPreparations?.uncertain?window.confirm(visibleText('لم يتأكد حفظ تعديل الصلاحيات بعد. هل تريد إغلاق النافذة؟ عند العودة حدّث السجل وتحقق من العملية قبل إعادة الحفظ.')):accountPreparations?.dirty?window.confirm(visibleText('توجد بيانات تجهيز حساب غير محفوظة. هل تريد تركها وإغلاق النافذة؟'))&&canDiscard():canDiscard());
 d.onDispose(clear);d.run(load);
}

