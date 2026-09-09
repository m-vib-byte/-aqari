import {createDialog,node,field} from '../components/dialog.js';

const roles={collector:'موظف تحصيل',accountant:'محاسب',maintenance:'مسؤول صيانة',property_manager:'مدير عقار',viewer:'عرض فقط'};
const roleCeilings={accountant:['collector','accountant','viewer'],property_manager:['collector','maintenance','property_manager','viewer'],viewer:['viewer']};
const limits={
 collector:'التحصيل ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى حسابات الملاك أو الشركاء أو الموظفين.',
 accountant:'القيود والتقارير المالية ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا تعديل للعقود أو العقارات أو المستأجرين، ولا وصول إلى بيانات الشركاء.',
 maintenance:'الصيانة وبيانات التشغيل اللازمة ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى العقود أو التحصيل أو حسابات الملاك أو الشركاء أو الموظفين.',
 property_manager:'إدارة العمليات ضمن العقارات المحددة وصلاحيات القسم المعتمدة. لا وصول إلى حسابات الملاك أو الشركاء أو الموظفين.',
 viewer:'عرض بيانات التشغيل المصرح بها للعقارات المحددة فقط. لا إضافة أو تعديل أو اعتماد، ولا وصول إلى البيانات المالية الخاصة بالملاك.'
};
const timestamp=value=>value?new Date(value).toLocaleString('ar-KW',{timeZone:'Asia/Kuwait'}):'غير مسجل';
const sameProperties=(a,b)=>{if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;const sorted=[...b].sort();return [...a].sort().every((value,index)=>value===sorted[index]);};
const matches=(record,values)=>record?.user_id===values.user_id&&record.operational_role===values.operational_role&&record.is_active===values.is_active&&record.revision===values.revision+1&&sameProperties(record.property_ids,values.property_ids);

export function openStaffAccess(){
 const d=createDialog('صلاحيات حسابات الموظفين والعقارات');if(!d)return;
 let directory={properties:[],members:[],assignments:[],audit:[]},revision=0,pendingSave=null,selectedUser='',baseline='';
 const reload=node('button','تحديث الصلاحيات من قاعدة البيانات'),form=node('form'),user=node('select'),role=node('select'),active=node('input'),properties=node('fieldset'),reason=node('textarea'),description=node('p'),save=node('button','حفظ الصلاحيات والتحقق منها'),list=node('section'),audit=node('section');
 reload.type='button';save.type='submit';active.type='checkbox';user.required=role.required=reason.required=true;reason.minLength=3;reason.maxLength=500;reason.rows=3;form.hidden=true;
 const discard=node('button','تحميل الصلاحيات المحفوظة وترك التعديلات');discard.type='button';
 form.append(field('حساب الموظف',user),field('الدور الوظيفي',role),description,field('تفعيل الوصول إلى العقارات المحددة',active),properties,field('سبب منح الصلاحيات أو تعديلها أو إيقافها',reason),save);
 form.append(discard);
 d.body.append(node('p','إدارة وصول حسابات الموظفين الموجودة. يتطلب التفعيل اختيار عقار واحد على الأقل. تحدد الأدوار الحد الأعلى للصلاحيات، وتظل قيود الأقسام والاعتمادات الخاصة سارية.'),reload,form,list,audit);
 const values=()=>({user_id:selectedUser,operational_role:role.value,property_ids:[...properties.querySelectorAll('input:checked')].map(control=>control.value),is_active:active.checked,revision,reason:reason.value.trim()});
 const dirty=()=>Boolean(selectedUser)&&JSON.stringify(values())!==baseline;
 const canDiscard=()=>!dirty()||window.confirm('توجد تعديلات صلاحيات غير محفوظة. هل تريد تركها وتحميل السجل المحفوظ؟');
 const allowedRoles=()=>roleCeilings[directory.members.find(member=>member.user_id===selectedUser)?.role]||[];
 function populateRoles(selected=''){
  role.replaceChildren();const empty=node('option','اختر الدور الوظيفي');empty.value='';role.append(empty);
  for(const value of allowedRoles()){const option=node('option',roles[value]);option.value=value;role.append(option);}
  role.value=allowedRoles().includes(selected)?selected:'';
 }
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_staff_access',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 function clear(){directory={properties:[],members:[],assignments:[],audit:[]};revision=0;pendingSave=null;selectedUser='';baseline='';form.hidden=true;user.replaceChildren();properties.replaceChildren();list.replaceChildren();audit.replaceChildren();reason.value='';role.replaceChildren();active.checked=false;description.textContent='';}
 function labelProperties(ids){return (ids||[]).map(id=>directory.properties.find(property=>property.id===id)?.name||'عقار غير متاح حالياً').join('، ')||'لا توجد عقارات محددة';}
 function describeRole(){description.textContent=limits[role.value]||'اختر الدور لعرض حدود الوصول.';}
 function populate(){
  selectedUser=user.value;const assignment=directory.assignments.find(record=>record.user_id===selectedUser);revision=assignment?.revision||0;populateRoles(assignment?.operational_role||'');active.checked=assignment?.is_active===true;reason.value='';
  properties.replaceChildren(node('legend','العقارات المصرح بها — اختيار صريح'));
  for(const property of directory.properties){const check=node('input');check.type='checkbox';check.value=property.id;check.checked=assignment?.property_ids?.includes(property.id)===true;properties.append(field(property.name,check));}
  if(!directory.properties.length)properties.append(node('p','لا توجد عقارات متاحة لإسنادها.'));
  describeRole();baseline=JSON.stringify(values());
 }
 function snapshot(container,heading,value){
  container.append(node('h4',heading));if(!value){container.append(node('p','لا يوجد سجل سابق.'));return;}
  const member=directory.members.find(record=>record.user_id===value.user_id);
  container.append(node('p','الحساب: '+(member?.display_name||'حساب موظف محفوظ')),node('p','الدور: '+(roles[value.operational_role]||'غير محدد')),node('p','العقارات: '+labelProperties(value.property_ids)),node('p','الوصول: '+(value.is_active===true?'مفعل':'موقوف')));
 }
 function render(preserved=null){
  const selected=user.value;user.replaceChildren();const placeholder=node('option','اختر حساب الموظف');placeholder.value='';user.append(placeholder);
  for(const member of directory.members){const option=node('option',(member.display_name||'حساب موظف')+(member.is_active===false?' — حساب غير نشط':''));option.value=member.user_id;option.disabled=member.is_active===false;user.append(option);}
  if(directory.members.some(member=>member.user_id===selected&&member.is_active!==false))user.value=selected;else user.value='';populate();form.hidden=false;
  if(preserved&&selectedUser===preserved.user_id){revision=preserved.revision;role.value=allowedRoles().includes(preserved.operational_role)?preserved.operational_role:'';active.checked=preserved.is_active;reason.value=preserved.reason;for(const input of properties.querySelectorAll('input'))input.checked=preserved.property_ids.includes(input.value);describeRole();}
  list.replaceChildren(node('h3','الصلاحيات المحفوظة'));if(!directory.assignments.length)list.append(node('p','لا توجد صلاحيات تشغيلية مسندة من هذا القسم.'));
  for(const assignment of directory.assignments){const member=directory.members.find(record=>record.user_id===assignment.user_id),card=node('article');card.append(node('h4',member?.display_name||'حساب موظف محفوظ'),node('p',(roles[assignment.operational_role]||'دور غير معروف')+' • '+(assignment.is_active?'الوصول مفعل':'الوصول موقوف')),node('p','العقارات: '+labelProperties(assignment.property_ids)),node('p','آخر تعديل: '+timestamp(assignment.updated_at)));
   if(member&&member.is_active!==false){const edit=node('button','تعديل صلاحيات '+(member.display_name||'الموظف'));edit.type='button';edit.onclick=()=>{user.value=assignment.user_id;chooseUser();user.focus();};card.append(edit);}list.append(card);
  }
  audit.replaceChildren(node('h3','سجل تعديلات الصلاحيات'));if(!directory.audit.length)audit.append(node('p','لا توجد تعديلات مسجلة.'));
  for(const entry of directory.audit){const details=node('details');details.append(node('summary',(entry.actor_name||'مستخدم مسجل')+' • '+timestamp(entry.recorded_at)),node('p','سبب الإجراء: '+(entry.reason||'غير مدون')));snapshot(details,'قبل التعديل',entry.before_snapshot);snapshot(details,'بعد التعديل',entry.after_snapshot);audit.append(details);}
 }
 async function read(){
  const data=await rpc('list');if(data?.manager!==true){clear();throw Error('إدارة صلاحيات الموظفين متاحة للمدير العام المخول فقط.');}
  if(!['properties','members','assignments','audit'].every(key=>Array.isArray(data[key])))throw Error('تعذر التحقق من بيانات الصلاحيات. حدّث السجلات قبل التعديل.');
  return data;
 }
 async function load(){
  const preserved=dirty()?values():null,oldBaseline=baseline;const data=await read();
  const confirmed=pendingSave&&matches(data.assignments.find(record=>record.user_id===pendingSave.user_id),pendingSave);
  directory=data;render(confirmed?null:preserved);if(preserved&&!confirmed&&selectedUser===preserved.user_id)baseline=oldBaseline;
  d.status.textContent=confirmed?'تم التحقق من حفظ العملية السابقة دون تكرارها.':pendingSave?'لم تتأكد مطابقة الصلاحيات المحفوظة. احتُفظ بالتعديلات؛ راجع السجل قبل إعادة الحفظ.':'تم استرجاع الصلاحيات والعقارات وسجل التعديلات من قاعدة البيانات.';
  pendingSave=null;
 }
 function chooseUser(){if(pendingSave){user.value=selectedUser;d.status.textContent='حدّث الصلاحيات للتحقق من العملية السابقة أولاً.';return;}if(!canDiscard()){user.value=selectedUser;return;}populate();}
 user.onchange=chooseUser;role.onchange=describeRole;reload.onclick=()=>d.run(load);
 discard.onclick=()=>{if(pendingSave){d.status.textContent='حدّث الصلاحيات للتحقق من العملية السابقة أولاً.';return;}if(canDiscard())populate();};
 form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
  const values={user_id:user.value,operational_role:role.value,property_ids:[...properties.querySelectorAll('input:checked')].map(control=>control.value),is_active:active.checked,revision,reason:reason.value.trim()};
  if(pendingSave)throw Error('حدّث الصلاحيات للتحقق من العملية السابقة أولاً.');
  if(!directory.members.some(member=>member.user_id===values.user_id&&member.is_active!==false))throw Error('اختر حساب موظف نشطاً من القائمة.');
  if(!Object.hasOwn(roles,values.operational_role))throw Error('اختر الدور الوظيفي.');
  if(!allowedRoles().includes(values.operational_role))throw Error('الدور التشغيلي يتجاوز حدود عضوية الحساب الحالية.');
  if(values.is_active&&!values.property_ids.length)throw Error('اختر عقاراً واحداً على الأقل لتفعيل الوصول.');
  if(values.property_ids.some(id=>!directory.properties.some(property=>property.id===id)))throw Error('تغيرت العقارات المتاحة. حدّث الصلاحيات.');
  if(values.reason.length<3||values.reason.length>500)throw Error('أدخل سبباً موثقاً من ٣ إلى ٥٠٠ حرف.');
  pendingSave=values;await rpc('save',values);const verified=await read();
  if(!matches(verified.assignments.find(record=>record.user_id===values.user_id),values))throw Error('لم تتأكد مطابقة الصلاحيات المحفوظة. حدّث السجلات قبل إعادة المحاولة.');
  pendingSave=null;directory=verified;render();d.status.textContent=values.is_active?'تم حفظ الصلاحيات والتحقق من الدور والعقارات بإعادة القراءة.':'تم إيقاف الوصول والتحقق من حفظ الإيقاف وسجل التعديل.';
 });};
 d.onDispose(clear);d.run(load);
}
