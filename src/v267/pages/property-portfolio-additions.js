import {createDialog,node,field} from '../components/dialog.js';

const text=value=>String(value??'').trim();
const money=value=>`${Number(value||0).toFixed(3)} د.ك`;
const monthNow=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuwait',year:'numeric',month:'2-digit'}).format(new Date())+'-01';
const button=(label,work)=>{const item=node('button',label);item.type='button';item.onclick=work;return item;};
const info=(label,value)=>{const row=node('p');row.append(node('strong',label+': '),document.createTextNode(text(value)||'—'));return row;};

async function scanner(initial){
 const page=await import('./document-scanner.js');
 return page.openDocumentScanner(initial);
}

export function openPropertyResponsible(propertyId){
 const d=createDialog('المسؤول عن العقار');if(!d)return false;
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_property_responsible',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_action:action,p_data:data}));
 async function render(){
  const response=await rpc('context'),record=response?.record;if(record?.propertyId!==propertyId)throw Error('تعذر تأكيد نطاق مسؤول العقار.');
  d.body.replaceChildren();const name=node('input'),title=node('input'),reason=node('textarea');name.value=record.name||'';title.value=record.title||'';reason.value='تحديث مسؤول العقار';name.maxLength=200;title.maxLength=120;reason.maxLength=1000;
  const form=node('form');form.append(field('اسم المسؤول عن هذا العقار',name),field('صفة المسؤول أو المسمى الوظيفي',title),field('سبب التعديل',reason));const save=node('button','حفظ المسؤول والتحقق');save.type='submit';form.append(save);d.body.append(node('p','يُحفظ المسؤول لهذا العقار فقط ولا ينتقل إلى أي عقار آخر.'),form);
  form.onsubmit=event=>{event.preventDefault();d.run(async()=>{
   const expected=Number(record.revision||0),wanted={name:text(name.value),title:text(title.value),revision:expected,reason:text(reason.value)};
   const saved=await rpc('save',wanted);d.session.check();const confirmed=await rpc('context');d.session.check();
   if(saved?.record?.propertyId!==propertyId||confirmed?.record?.revision!==expected+1||confirmed.record.name!==wanted.name||confirmed.record.title!==wanted.title)throw Error('لم يتأكد حفظ مسؤول العقار بعد إعادة القراءة.');
   await render();d.status.textContent='تم حفظ مسؤول العقار وبقي ظاهرًا بعد إعادة القراءة.';
  });};
 }
 d.run(render);return true;
}

function documentCategory(row){return row?.metadata?.document_category||row?.documentType||'مستند';}

export function openTenantCompleteFile(propertyId,tenantId){
 const d=createDialog('ملف المستأجر الكامل');if(!d)return false;
 const read=()=>d.session.request(d.session.client.rpc('aqari_tenant_complete_file',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_tenant_id:tenantId}));
 async function render(){
  const file=await read();d.session.check();if(file?.propertyId!==propertyId||file?.tenant?.id!==tenantId)throw Error('تعذر تأكيد نطاق ملف المستأجر.');
  const tenant=file.tenant,profile=tenant.profile||{},family=file.family||{};d.body.replaceChildren();
  const identity=node('section');identity.className='aq267-property-master-section';identity.append(node('h3','البيانات الشخصية'),info('الاسم',profile.nameAr||tenant.name),info('الاسم بالإنجليزية',profile.nameEn),info('الهاتف',tenant.phone),info('الإيميل',tenant.email),info('الجنسية',profile.nationality),info('الرقم المدني',tenant.civilId),info('انتهاء البطاقة المدنية',family.civilIdExpiresOn),info('رقم الجواز',profile.passportNo),info('الزوج',family.husbandName),info('الزوجة',family.wifeName));
  const edit=node('details'),summary=node('summary','تعديل انتهاء البطاقة وبيانات الزوج/الزوجة'),form=node('form'),expiry=node('input'),husband=node('input'),wife=node('input'),reason=node('textarea');expiry.type='date';expiry.value=family.civilIdExpiresOn||'';husband.value=family.husbandName||'';wife.value=family.wifeName||'';reason.value='تحديث بيانات ملف المستأجر';husband.maxLength=wife.maxLength=200;form.append(field('تاريخ انتهاء البطاقة المدنية',expiry),field('اسم الزوج',husband),field('اسم الزوجة',wife),field('سبب التعديل',reason));const save=node('button','حفظ وإعادة القراءة');save.type='submit';form.append(save);edit.append(summary,form);identity.append(edit);
  form.onsubmit=event=>{event.preventDefault();d.run(async()=>{const wanted={civilIdExpiresOn:expiry.value,husbandName:text(husband.value),wifeName:text(wife.value)};const saved=await d.session.request(d.session.client.rpc('aqari_tenant_family_save',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_tenant_id:tenantId,p_expected_revision:Number(family.revision||0),p_data:wanted,p_reason:text(reason.value)}));d.session.check();if(saved?.tenant?.id!==tenantId||Number(saved?.family?.revision)!==Number(family.revision||0)+1)throw Error('لم يتأكد حفظ ملف المستأجر.');await render();d.status.textContent='تم حفظ بيانات المستأجر وإعادة قراءتها.';});};
  const leases=node('section');leases.className='aq267-property-master-section';leases.append(node('h3','العقود والوحدات المرتبطة بهذا العقار'));
  for(const lease of file.leases||[]){const card=node('article');card.append(info('العقد',lease.contractNo),info('الوحدة',lease.unitNo),info('الفترة',`${lease.startDate} — ${lease.endDate}`),info('الإيجار',money(lease.monthlyRent)),info('الحالة',lease.status),button('رفع عقد قديم للأرشفة فقط',()=>{d.close();scanner({type:'lease',ref:lease.id,category:'lease_contract',title:`عقد قديم — ${lease.contractNo}`});}),button('مسح/تصوير مستند',()=>{d.close();scanner({type:'lease',ref:lease.id});}),button('رفع ملف',()=>{d.close();scanner({type:'lease',ref:lease.id});}));leases.append(card);}
  if(!(file.leases||[]).length)leases.append(node('p','لا توجد عقود لهذا المستأجر داخل العقار المحدد.'));
  const docs=node('section');docs.className='aq267-property-master-section';docs.append(node('h3','الجوازات وعقد الزواج والاستلام والإخلاء وبقية المستندات'));
  for(const documentRow of file.documents||[]){docs.append(info(documentCategory(documentRow),`${documentRow.title} · ${documentRow.documentNo} · ${documentRow.status}`));}
  if(file.documents===null)docs.append(node('p','المستندات غير متاحة لصلاحية هذا الحساب.'));else if(!(file.documents||[]).length)docs.append(node('p','لا توجد مستندات محفوظة لهذا المستأجر وعقوده في هذا العقار.'));
  if(file.documents!==null)docs.append(button('مسح/تصوير مستند للمستأجر',()=>{d.close();scanner({type:'tenant',ref:tenantId});}),button('رفع ملف للمستأجر',()=>{d.close();scanner({type:'tenant',ref:tenantId});}));
  d.body.append(identity,leases,docs);d.status.textContent='هذا الملف مقصور على العقار المحدد، ولا يعرض عقود أو وحدات عقار آخر.';
 }
 d.run(render);return true;
}

export function openPropertyMonthlyRent(propertyId){
 const d=createDialog('كشف الإيجار الشهري');if(!d)return false;
 let period=monthNow();
 async function render(){
  const report=await d.session.request(d.session.client.rpc('aqari_property_monthly_rent',{p_workspace_id:d.session.bound.workspace,p_property_id:propertyId,p_period:period}));d.session.check();if(report?.propertyId!==propertyId||report?.period!==period)throw Error('تعذر تأكيد نطاق كشف الإيجار.');
  d.body.replaceChildren();const picker=node('input');picker.type='month';picker.value=period.slice(0,7);picker.onchange=()=>{if(/^\d{4}-\d{2}$/.test(picker.value)){period=picker.value+'-01';d.run(render);}};d.body.append(field('الشهر',picker));
  const summary=node('section');summary.className='aq267-property-master-section';summary.append(node('h3','ملخص الشهر'),info('المستحق',money(report.summary?.due)),info('المدفوع',money(report.summary?.paid)),info('غير المدفوع',money(report.summary?.unpaid)),info('إجمالي الخصم',money(report.summary?.discount)));d.body.append(summary);
  const lines=node('section');lines.className='aq267-property-master-section';lines.append(node('h3','تفاصيل الوحدات'));
  for(const row of report.lines||[]){const status=Number(row.due_amount)===0?'معفى/شهر مجاني':Number(row.balance)<=0?'مدفوع':Number(row.paid_amount)>0?'مدفوع جزئيًا':'غير مدفوع';const card=node('article');card.append(info('المستأجر',row.tenant_name),info('الوحدة والعقد',`${row.unit_no} · ${row.contract_no}`),info('الحالة',status),info('المستحق',money(row.due_amount)),info('المدفوع',money(row.paid_amount)),info('المتبقي',money(Math.max(Number(row.balance||0),0))),info('الخصم',money(row.discount)),info('سبب الخصم',row.discount_reason));lines.append(card);}
  if(!(report.lines||[]).length)lines.append(node('p','لا توجد استحقاقات إيجار محفوظة لهذا العقار في الشهر المحدد.'));d.body.append(lines);d.status.textContent='الأرقام من جدول الاستحقاقات والتحصيلات المحفوظ، والخصم وسببه يظهران داخل الشهر نفسه.';
 }
 d.run(render);return true;
}

export async function mountPropertyPortfolioAdditions(dialog,propertyId,file,access){
 const response=await dialog.session.request(dialog.session.client.rpc('aqari_property_responsible',{p_workspace_id:dialog.session.bound.workspace,p_property_id:propertyId,p_action:'context',p_data:{}}));dialog.session.check();if(response?.record?.propertyId!==propertyId)throw Error('تعذر تأكيد مسؤول العقار.');
 const box=node('section');box.className='aq267-property-master-section';box.dataset.presentationKey='portfolio_additions';box.append(node('h3','المسؤول وملفات المستأجرين وكشف الإيجار'),info('المسؤول عن العقار',response.record.name),info('الصفة',response.record.title));
 if(access?.permissions?.properties?.write===true)box.append(button('حفظ/تعديل مسؤول العقار',()=>{dialog.close();openPropertyResponsible(propertyId);}));
 if(file.permissions?.collections!==false)box.append(button('كشف الإيجار الشهري — مدفوع وغير مدفوع وخصم',()=>{dialog.close();openPropertyMonthlyRent(propertyId);}));
 if(file.permissions?.contracts!==false){for(const lease of file.contracts||[]){const row=node('article');row.append(info('العقد',lease.contractNo),button('ملف المستأجر الكامل',()=>{dialog.close();openTenantCompleteFile(propertyId,lease.tenantId);}),button('رفع عقد قديم للأرشفة فقط',()=>{dialog.close();scanner({type:'lease',ref:lease.id,category:'lease_contract',title:`عقد قديم — ${lease.contractNo}`});}),button('مسح/تصوير مستند',()=>{dialog.close();scanner({type:'lease',ref:lease.id});}),button('رفع ملف',()=>{dialog.close();scanner({type:'lease',ref:lease.id});}));box.append(row);}}
 dialog.body.append(box);return box;
}
