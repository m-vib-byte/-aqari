import {createDialog,node,field} from '../components/dialog.js';

const input=(type,value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const money=value=>value==null?'غير متاح':Number(value).toFixed(3)+' د.ك';
const count=value=>value==null?'غير متاح':String(value);
const text=value=>String(value??'').trim();
function section(title){const x=node('section');x.className='aq267-property-master-section';x.append(node('h3',title));return x;}
function metric(label,value){const x=node('article');x.className='aq267-property-master-metric';x.append(node('span',label),node('strong',value));return x;}
function statusLine(label,value){const p=node('p');p.append(node('strong',label+': '),document.createTextNode(value||'—'));return p;}
function action(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
function percent(value){return (Number(value||0)/100).toFixed(2)+'%';}
function permissionNotice(target){target.append(node('p','غير متاح حسب الصلاحية.'));}

export async function openPropertyMasterFileByName(name){
 const bridge=window.AQARI_SUPABASE,initialUser=bridge?.context?.user?.id,initialWorkspace=bridge?.context?.workspace?.id;
 if(!initialUser||!initialWorkspace||typeof bridge?.getClient!=='function')throw Error('الجلسة غير جاهزة.');
 const assertSameScope=()=>{if(bridge?.context?.user?.id!==initialUser||bridge?.context?.workspace?.id!==initialWorkspace)throw Error('تغيرت الجلسة أو مساحة العمل أثناء فتح ملف العقار. أعد المحاولة.');};
 const client=await bridge.getClient();assertSameScope();
 const {data,error}=await client.from('aqari_properties').select('id,name').eq('workspace_id',initialWorkspace).eq('name',String(name||'').trim()).limit(2);assertSameScope();
 if(error)throw error;if(!Array.isArray(data)||data.length!==1)throw Error(data?.length?'اسم العقار غير فريد. افتح السجل باستخدام معرفه.':'لم يتم ربط هذا العقار بالسجل الخادمي بعد.');
 return openPropertyMasterFile(data[0].id);
}

export function openPropertyMasterFile(propertyId){
 const d=createDialog('الملف الكامل للعقار');if(!d)return false;
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let file=null;
 async function read(){
  const result=await rpc('aqari_property_full_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_as_of:new Date().toISOString().slice(0,10)});d.session.check();
  if(result?.workspace_id!==d.session.bound.workspace||result?.property?.id!==propertyId)throw Error('تعذر تأكيد نطاق ملف العقار.');file=result;return result;
 }
 function ownerEditor(target,owners=[]){
  const rows=node('div');rows.className='aq267-property-owner-rows';const state=[];
  const draw=(owner={name:'',bps:0,role:'مالك',email:'',phone:'',whatsapp:''})=>{const wrap=node('fieldset'),name=input('text',owner.name),share=input('number',Number(owner.bps||0)/100),role=input('text',owner.role||'مالك'),email=input('email',owner.email||''),phone=input('tel',owner.phone||''),whatsapp=input('tel',owner.whatsapp||''),remove=action('إزالة',()=>{const i=state.findIndex(r=>r.wrap===wrap);if(i>=0)state.splice(i,1);wrap.remove();});share.min='0.01';share.max='100';share.step='0.01';name.required=share.required=true;wrap.append(field('اسم المالك / الشريك',name),field('النسبة %',share),field('الصفة',role),field('البريد',email),field('الهاتف',phone),field('واتساب',whatsapp),remove);rows.append(wrap);state.push({wrap,name,share,role,email,phone,whatsapp});};
  for(const owner of owners)draw(owner);if(!owners.length)draw();const add=action('+ إضافة مالك / شريك',()=>draw());target.append(rows,add);
  return ()=>state.map(r=>({name:r.name.value.trim(),bps:Math.round(Number(r.share.value)*100),role:r.role.value.trim(),email:r.email.value.trim(),phone:r.phone.value.trim(),whatsapp:r.whatsapp.value.trim()})).filter(r=>r.name||r.bps);
 }
 async function editProperty(){
  await read();const p=file.property;d.body.replaceChildren(node('h3','تعديل بيانات العقار الرئيسية'));
  const form=node('form'),name=input('text',p.name),address=node('textarea'),type=input('text',p.type),status=input('text',p.status||'active'),income=input('text',p.statedIncome??''),email=input('email',p.email),phone=input('tel',p.phone),whatsapp=input('tel',p.whatsapp),reason=node('textarea');address.value=p.address||'';name.required=status.required=reason.required=true;reason.minLength=3;income.inputMode='decimal';
  for(const [label,control]of [['اسم العقار',name],['العنوان',address],['نوع العقار',type],['حالة العقار',status],['الدخل المعلن — لا يستخدم بدل التحصيل الفعلي',income],['البريد الرسمي للعقار',email],['الهاتف',phone],['واتساب',whatsapp]])form.append(field(label,control));
  const ownersBox=section('الملاك والحصص — يجب أن يكون المجموع 100% عند وجود ملاك');form.append(ownersBox);const owners=ownerEditor(ownersBox,Array.isArray(p.owners)?p.owners:[]);
  form.append(field('سبب التعديل',reason));const save=node('button','حفظ وإعادة القراءة');save.type='submit';form.append(save);d.body.append(form,action('إلغاء',render));
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const ownerRows=owners(),total=ownerRows.reduce((s,r)=>s+r.bps,0);if(ownerRows.length&&total!==10000)throw Error('مجموع حصص الملاك يجب أن يساوي 100%.');const data={name:name.value.trim(),address:address.value.trim(),type:type.value.trim(),status:status.value.trim(),statedIncome:income.value.trim()===''?null:income.value.trim(),owners:ownerRows,email:email.value.trim(),phone:phone.value.trim(),whatsapp:whatsapp.value.trim(),assets:p.assets||{photos:[],documents:[],plans:[]}};const saved=await rpc('aqari_property_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_expected_revision:Number(p.revision||0),p_data:data,p_reason:reason.value.trim()});d.session.check();if(saved?.property?.id!==propertyId||Number(saved.property.revision)!==Number(p.revision||0)+1)throw Error('لم تتأكد إعادة قراءة تعديل العقار.');d.status.textContent='تم حفظ بيانات العقار وتأكيدها من الخادم.';await render();});};
 }
 async function editUnit(unit){
  d.body.replaceChildren(node('h3','بيانات الوحدة '+unit.unitNo));const form=node('form'),unitNo=input('text',unit.unitNo),floorInput=input('text',unit.floor),type=input('text',unit.type),status=input('text',unit.status||'available'),rent=input('text',unit.statedRent??''),automaticRef=input('text',unit.automaticRef),reason=node('textarea');unitNo.required=status.required=reason.required=true;reason.minLength=3;rent.inputMode='decimal';
  for(const [label,control]of [['رقم الوحدة',unitNo],['الدور',floorInput],['نوع الوحدة',type],['الحالة',status],['الإيجار المعلن',rent],['الرقم الآلي / المرجع الحكومي — مستقل عن رقم الوحدة والعقد',automaticRef],['سبب التعديل',reason]])form.append(field(label,control));
  const save=node('button','حفظ الوحدة وإعادة القراءة');save.type='submit';form.append(save);d.body.append(form,action('إلغاء',render));
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{const result=await rpc('aqari_unit_master_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:unit.id,p_expected_revision:Number(unit.revision||0),p_data:{unitNo:unitNo.value.trim(),floor:floorInput.value.trim(),type:type.value.trim(),status:status.value.trim(),statedRent:rent.value.trim()===''?null:rent.value.trim(),automaticRef:automaticRef.value.trim()},p_reason:reason.value.trim()});d.session.check();if(result?.unit?.id!==unit.id||result.unit.propertyId!==propertyId||Number(result.unit.revision)!==Number(unit.revision||0)+1)throw Error('لم تتأكد إعادة قراءة تعديل الوحدة.');d.status.textContent='تم حفظ الوحدة وربطها بالعقار وتأكيدها من الخادم.';await render();});};
 }
 async function newContract(unit){
  const fresh=await rpc('aqari_property_contract_context',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_unit_id:unit.id});d.session.check();
  if(fresh?.property?.id!==propertyId||fresh?.unit?.id!==unit.id||fresh.unit.propertyId!==propertyId)throw Error('تغير ربط الوحدة بالعقار. حدّث الملف.');
  if(fresh.activeLease)throw Error('توجد حاليًا علاقة عقد فعالة على هذه الوحدة: '+String(fresh.activeLease.contract_no||''));
  d.close();const m=await import('./contract-foundation.js');return m.openContractFoundation({propertyId,unitId:unit.id,property:fresh.property.name,unit:fresh.unit.unitNo,floor:fresh.unit.floor,address:fresh.property.address,propertyRevision:fresh.binding?.propertyRevision,unitRevision:fresh.binding?.unitRevision});
 }
 function renderRows(target,rows,empty,mapper){if(!Array.isArray(rows)||!rows.length){target.append(node('p',empty));return;}for(const row of rows.slice(0,100))target.append(mapper(row));}
 function renderPermissionRows(target,permission,rows,empty,mapper){if(permission===false){permissionNotice(target);return;}renderRows(target,rows,empty,mapper);}
 async function render(){
  await read();const p=file.property,finance=file.finance||{},summary=file.summary||{},permissions=file.permissions||{};d.body.replaceChildren();
  const head=section(p.name||'العقار');head.append(statusLine('العنوان',p.address),statusLine('النوع',p.type),statusLine('الحالة',p.status),statusLine('الدخل المعلن',money(p.statedIncome)),action('تعديل بيانات العقار',editProperty));d.body.append(head);
  const contacts=section('التواصل والملاك');contacts.append(statusLine('البريد',p.email),statusLine('الهاتف',p.phone),statusLine('واتساب',p.whatsapp));if(Array.isArray(p.owners)&&p.owners.length)for(const o of p.owners)contacts.append(statusLine(o.role||'مالك',(o.name||'')+' — '+percent(o.bps)));else contacts.append(node('p','لم تُحفظ حصص ملاك بعد.'));d.body.append(contacts);
  const metrics=section('الملخص التشغيلي');const grid=node('div');grid.className='aq267-property-master-metrics';for(const [label,value]of [['الوحدات',count(summary.units)],['العقود',count(summary.contracts)],['المتأخرات',money(summary.arrearsAmount)],['الموظفون المرتبطون',count(summary.employees)],['أعمال الصيانة',count(summary.maintenance)]])grid.append(metric(label,value));metrics.append(grid);d.body.append(metrics);
  const financial=section('الربط المالي الفعلي');if(permissions.collections===false||permissions.finance===false){permissionNotice(financial);}else{const fgrid=node('div');fgrid.className='aq267-property-master-metrics';for(const [label,value]of [['دخل الشهر',money(finance.month?.income)],['مصروف الشهر',money(finance.month?.expenses)],['صافي الشهر',money(finance.month?.net)],['دخل السنة',money(finance.year?.income)],['مصروف السنة',money(finance.year?.expenses)],['صافي السنة',money(finance.year?.net)]])fgrid.append(metric(label,value));financial.append(fgrid,node('p','أساس الصافي: '+(finance.basis||'غير متاح')),node('p','الرواتب المرتبطة: '+money(finance.linkedPayrollPaid)+' — '+(permissions.employees===false?'غير متاح حسب الصلاحية.':'لا تدخل في الصافي حتى توجد حصة عقارية موثقة. لا يتم توزيع رواتب موظف مرتبط بأكثر من عقار بالتخمين.')),node('p','الكهرباء/الماء المدفوع هذا الشهر: '+money(finance.utilityPaidMonth)+' — معروضة تشغيليًا ولا تخصم مرة ثانية من الصافي.'));}d.body.append(financial);
  const units=section('الوحدات');renderRows(units,file.units,'لا توجد وحدات مرتبطة بهذا العقار.',u=>{const box=node('article');box.className='aq267-property-unit-card';box.append(node('strong','الوحدة '+u.unitNo),node('span','الدور: '+(u.floor||'غير محدد')+' · النوع: '+(u.type||'غير محدد')+' · الحالة: '+(u.status||'—')),node('span','الإيجار المعلن: '+money(u.statedRent)),node('span','الرقم الآلي: '+(u.automaticRef||'غير محفوظ')),action('إبرام عقد من هذه الوحدة',()=>d.run(()=>newContract(u))),action('تعديل بيانات الوحدة',()=>d.run(()=>editUnit(u))));return box;});d.body.append(units);
  const contracts=section('العقود');renderPermissionRows(contracts,permissions.contracts,file.contracts,'لا توجد عقود مرتبطة.',r=>node('p',`${r.contractNo} · وحدة ${file.units?.find(u=>u.id===r.unitId)?.unitNo||r.unitId} · ${r.status} · ${money(r.monthlyRent)}`));d.body.append(contracts);
  const collections=section('التحصيلات وكشف الإيجارات');renderPermissionRows(collections,permissions.collections,file.collections,'لا توجد تحصيلات مسجلة.',r=>node('p',`${r.paidAt} · ${r.reference} · ${money(r.amount)} · ${r.method} · ${r.status}`));d.body.append(collections);
  const expenses=section('المصاريف');renderPermissionRows(expenses,permissions.finance,file.expenses,'لا توجد مصروفات مرتبطة.',r=>node('p',`${r.date} · ${r.category} · ${r.payee} · ${money(r.amount)} · ${r.state}`));d.body.append(expenses);
  const docs=section('المستندات والمرفقات');renderPermissionRows(docs,permissions.documents,file.documents,'لا توجد مستندات مرتبطة في كتالوج المستندات.',r=>node('p',`${r.no} · ${r.type} · ${r.title} · ${r.status}`));d.body.append(docs);
  const notices=section('التنبيهات والقنوات');if(permissions.notifications===false)permissionNotice(notices);else{renderRows(notices,file.channels,'لا توجد قنوات تواصل مرتبطة بالعقار.',r=>node('p',`${r.kind} · ${r.publicUrl||r.managementReference||'غير مضبوط'} · ${r.status}`));renderRows(notices,file.notices,'لا توجد إعلانات/تنبيهات عقارية محفوظة.',r=>node('p',`${r.kind} · ${r.title} · ${r.status}`));}d.body.append(notices);
  const audit=section('سجل التعديلات');renderRows(audit,file.audit,'لا توجد تعديلات Master Data بعد.',r=>node('p',`${r.at} · ${r.actor} · ${r.action} · ${r.reason}`));d.body.append(audit);
  d.status.textContent='هذا الملف يعرض المصادر الخادمة الفعلية. القيم غير المتاحة لا تتحول إلى أصفار مفترضة.';
 }
 d.run(render);return true;
}
