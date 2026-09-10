import {createDialog,node,field} from '../components/dialog.js';
import {createPrivateUrls} from '../components/private-urls.js';

const money=value=>{const raw=String(value??'');if(!/^\d{1,15}(?:\.\d{1,3})?$/.test(raw))throw Error('المبلغ المحفوظ غير مكتمل؛ حدّث السجل.');const [whole,fraction='']=raw.split('.');return whole+'.'+fraction.padEnd(3,'0');};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function printable(currentRecord,kind){
 if(!currentRecord||!['clearance','settlement'].includes(kind))throw Error('اختر مستنداً محفوظاً.');
 const clearance=kind==='clearance',snapshot=clearance?currentRecord.clearance_snapshot:currentRecord.settlement_snapshot;
 if(!snapshot)throw Error(clearance?'لا توجد براءة ذمة محفوظة للطباعة.':'لا توجد تسوية نهائية محفوظة للطباعة.');
 if(snapshot.lease_id!==currentRecord.lease_id)throw Error('هوية المستند المحفوظ لا تطابق العقد.');
 const record={...snapshot,settlement_no:currentRecord.settlement_no,clearance_no:currentRecord.clearance_no};
 const balances=clearance?snapshot.clearance_balances:snapshot.final_balances;
 const number=clearance?record.clearance_no:record.settlement_no;
 if(!number)throw Error('رقم المستند المحفوظ مفقود.');
 const title=clearance?'براءة ذمة وإخلاء طرف':'تسوية إخلاء نهائية';
 const rows=[['الرقم',number],['رقم العقد',record.contract_no],['المستأجر',record.tenant_name],['العقار',record.property_name],['الوحدة',record.unit_no],['تاريخ الإخلاء',record.vacate_date],['الإيجار المستحق حتى الإخلاء',money(balances?.rent_due_total)],['إجمالي المسدد',money(balances?.rent_paid_total)],['المتبقي على المستأجر',money(balances?.rent_balance)],['الرصيد الدائن للمستأجر',money(balances?.tenant_credit)],['رصيد التأمين غير المسوّى',money(balances?.deposit_balance)],['الأضرار المثبتة',money(record.damage_amount)],['مرجع تسوية الأضرار',record.charges_reference||'—'],['المفاتيح مستلمة',record.keys_returned?'نعم':'لا'],['فحص الوحدة مكتمل',record.inspection_completed?'نعم':'لا'],['قراءات العدادات مثبتة',record.meters_recorded?'نعم':'لا']];
 if(clearance)rows.push(['الاستثناء الإداري',record.exception_reason||'لا يوجد']);
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+escape(title)+' '+escape(number)+'</title><style>body{font-family:Arial,sans-serif;color:#26231d;margin:0;padding:24px;line-height:1.7}main{max-width:800px;margin:auto;border:1px solid #b69a55;padding:28px}h1{font-size:25px;color:#695528}dl{display:grid;grid-template-columns:minmax(180px,1fr) 2fr;gap:8px 20px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}.note{border-top:1px solid #d6c9ab;padding-top:16px;margin-top:24px}@media(max-width:520px){body,main{padding:12px}dl{display:block}dd{margin-bottom:12px}}@media print{body{padding:0}main{border:0;padding:12mm;max-width:none}}</style></head><body><main><p>AQARI</p><h1>'+escape(title)+'</h1><dl>'+rows.map(([k,v])=>'<dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd>').join('')+'</dl><p class="note">'+escape(clearance?'صدرت هذه البراءة من سجل التسوية المحفوظ. أي استثناء ظاهر أعلاه موثق ضمن سجل الاعتماد.':'هذه نسخة من التسوية المحفوظة وقت الاعتماد ولا تعتمد على قيم واجهة غير محفوظة.')+'</p></main></body></html>';
}

const releaseErrors={
 VACATING_HANDOVER_REQUIRED:'لا يمكن إنهاء العقد قبل إرفاق محضر تسليم أو فحص إخلاء محفوظ ومتحقق منه.',
 VACATING_OPEN_MAINTENANCE:'لا يمكن تحرير الوحدة مع وجود طلب صيانة مفتوح على العقد.',
 VACATING_OPEN_UTILITIES:'لا يمكن تحرير الوحدة مع وجود فاتورة خدمات غير محسومة مرتبطة بالعقار.',
 VACATING_FUTURE_PAYMENT_REVIEW_REQUIRED:'توجد دفعة مستقبلية مؤكدة تحتاج مراجعة قبل إنهاء العقد.',
 VACATING_UNCERTAIN_PAYMENT:'توجد حركة دفع غير محسومة تحتاج مراجعة قبل إنهاء العقد.',
 VACATING_DEPOSIT_HISTORY_REQUIRED:'سجل التأمين غير مكتمل ولا يسمح بإنهاء العقد.',
 VACATING_SOURCE_REVIEW_REQUIRED:'العقد المستورد يحتاج مراجعة مصدر موثقة قبل إنهائه.',
 VACATING_RELEASE_BALANCE_CHANGED:'تغيرت الأرصدة بعد إصدار براءة الذمة. حدّث التسوية قبل إنهاء العقد.',
 VACATING_CLEARANCE_REQUIRED:'يجب إصدار براءة الذمة أولاً قبل إنهاء العقد وإطلاق الوحدة.'
};
const checkbox=()=>{const input=node('input');input.type='checkbox';return input;};
export function openVacatingSettlement(){
 const d=createDialog('تسوية الإخلاء وبراءة الذمة');if(!d)return;
 const lease=node('select'),vacate=node('input'),keys=checkbox(),inspection=checkbox(),meters=checkbox(),damage=node('input'),damageNotes=node('textarea'),resolved=checkbox(),reference=node('input'),exception=node('textarea');
 vacate.type='date';damage.type='text';damage.inputMode='decimal';damage.value='0.000';damageNotes.maxLength=1000;reference.maxLength=160;exception.maxLength=1000;
 const refresh=node('button','تحديث التسوية من السجل');
 const summary=node('section'),save=node('button','حفظ مسودة الإخلاء'),finalize=node('button','اعتماد التسوية النهائية'),clearance=node('button','إصدار براءة الذمة'),releaseUnit=node('button','إنهاء العقد وإطلاق الوحدة'),printSettlement=node('button','طباعة التسوية المحفوظة'),printClearance=node('button','طباعة براءة الذمة');
 const urls=createPrivateUrls(d),printOutput=node('div');
 let current=null,isManager=false,leases=[];
 const run=async task=>{await d.run(task);if(!d.closed)draw();};
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_vacating_settlement',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 const releaseRpc=(leaseId,revision)=>d.session.request(d.session.client.rpc('aqari_vacating_release',{p_workspace_id:d.session.bound.workspace,p_lease_id:leaseId,p_revision:revision}));
 function draw(){
  summary.replaceChildren();
  if(!current){summary.append(node('p','لا توجد مسودة محفوظة لهذا العقد.'));for(const x of [vacate,keys,inspection,meters,damage,damageNotes,resolved,reference])x.disabled=!lease.value;save.disabled=!lease.value;for(const x of [finalize,clearance,releaseUnit,printSettlement,printClearance])x.disabled=true;return;}
  const b=current.balances||{};summary.append(node('h3','حالة التسوية: '+current.status),node('p','المتبقي على المستأجر: '+money(b.rent_balance)+' د.ك · الرصيد الدائن: '+money(b.tenant_credit)+' د.ك · التأمين غير المسوّى: '+money(b.deposit_balance)+' د.ك'));
  if(current.settlement_no)summary.append(node('p','رقم التسوية: '+current.settlement_no));if(current.clearance_no)summary.append(node('p','رقم براءة الذمة: '+current.clearance_no));if(current.exception_reason)summary.append(node('p','استثناء موثق: '+current.exception_reason));
  if(current.status==='released')summary.append(node('p','تم إنهاء الإشغال تشغيلياً وتحرير الوحدة مع بقاء نهاية العقد الأصلية محفوظة في السجل.'));
  const locked=current.status!=='draft';for(const x of [vacate,keys,inspection,meters,damage,damageNotes,resolved,reference])x.disabled=locked;
  save.disabled=locked;finalize.disabled=locked||!isManager;clearance.disabled=current.status!=='finalized'||!isManager;releaseUnit.disabled=current.status!=='cleared'||!isManager;printSettlement.disabled=!current.settlement_snapshot;printClearance.disabled=!current.clearance_snapshot;
 }
 function fill(record){if(record&&record.lease_id!==lease.value)throw Error('بيانات التسوية لا تطابق العقد المحدد.');urls.clear();printOutput.replaceChildren();current=record;if(!record){vacate.value='';keys.checked=inspection.checked=meters.checked=resolved.checked=false;damage.value='0.000';damageNotes.value=reference.value=exception.value='';draw();return;}vacate.value=record.vacate_date||'';keys.checked=record.keys_returned===true;inspection.checked=record.inspection_completed===true;meters.checked=record.meters_recorded===true;damage.value=money(record.damage_amount);damageNotes.value=record.damage_notes||'';resolved.checked=record.charges_resolved===true;reference.value=record.charges_reference||'';exception.value=record.exception_reason||'';draw();}
 async function load(){const id=lease.value;fill(null);if(!id)return;const result=await rpc('get',{lease_id:id});d.session.check();if(!result||!Object.hasOwn(result,'settlement'))throw Error('تعذر قراءة التسوية المحفوظة.');fill(result.settlement);}
 async function confirm(result){const saved=result?.settlement;if(!saved||saved.lease_id!==lease.value)throw Error('تعذر التحقق من الحفظ.');await load();if(!current||current.revision!==saved.revision||current.status!==saved.status)throw Error('تغيرت التسوية أثناء التحقق. راجع النسخة الحالية قبل إجراء جديد.');}
 lease.onchange=()=>run(load);refresh.onclick=()=>run(load);
 save.onclick=()=>run(async()=>{const result=await rpc('save',{lease_id:lease.value,vacate_date:vacate.value,keys_returned:keys.checked,inspection_completed:inspection.checked,meters_recorded:meters.checked,damage_amount:String(damage.value).trim(),damage_notes:damageNotes.value,charges_resolved:resolved.checked,charges_reference:reference.value,revision:current?.revision||0});await confirm(result);d.status.textContent='حُفظت مسودة الإخلاء وأعيدت قراءتها من قاعدة البيانات.';});
 finalize.onclick=()=>run(async()=>{if(!current)throw Error('احفظ المسودة أولاً.');const result=await rpc('finalize',{lease_id:lease.value,revision:current.revision});await confirm(result);d.status.textContent='اعتمدت التسوية النهائية وحُفظت نسخة ثابتة للطباعة.';});
 clearance.onclick=()=>run(async()=>{if(!current)throw Error('اعتمد التسوية أولاً.');const result=await rpc('clearance',{lease_id:lease.value,revision:current.revision,exception_reason:exception.value.trim()});await confirm(result);d.status.textContent='صدرت براءة الذمة من السجل المحفوظ.';});
 releaseUnit.onclick=()=>run(async()=>{
  if(!current||current.status!=='cleared')throw Error('يجب إصدار براءة الذمة أولاً قبل إنهاء العقد وإطلاق الوحدة.');
  try{
   const result=await releaseRpc(lease.value,current.revision);d.session.check();await confirm(result);
   if(current?.status!=='released')throw Error('تعذر التحقق من إنهاء العقد من السجل.');
   d.status.textContent='تم إنهاء العقد تشغيلياً وإطلاق الوحدة بعد إعادة التحقق من المستندات والالتزامات والأرصدة.';
  }catch(error){if(releaseErrors[error?.message])throw Error(releaseErrors[error.message]);throw error;}
 });
 async function preparePrint(kind){
  const id=lease.value,result=await rpc('get',{lease_id:id});d.session.check();
  if(result?.settlement?.lease_id!==id)throw Error('تعذر التحقق من المستند المحفوظ.');
  const html=printable(result.settlement,kind);urls.clear();printOutput.replaceChildren();
  const link=node('a','فتح المستند المحفوظ للطباعة أو الحفظ');link.href=urls.create(new Blob([html],{type:'text/html;charset=utf-8'}));link.target='_blank';link.rel='noopener';printOutput.append(link);
 }
 printSettlement.onclick=()=>run(()=>preparePrint('settlement'));printClearance.onclick=()=>run(()=>preparePrint('clearance'));
 d.onDispose(()=>{current=null;leases=[];printOutput.replaceChildren();});
 d.body.append(field('العقد',lease),refresh,field('تاريخ الإخلاء',vacate),field('استلام جميع المفاتيح',keys),field('اكتمال فحص الوحدة',inspection),field('تثبيت قراءات الكهرباء والماء',meters),field('قيمة الأضرار — د.ك',damage),field('وصف الأضرار',damageNotes),field('تمت تسوية الأضرار/المبالغ الأخرى',resolved),field('مرجع تسوية الأضرار',reference),field('استثناء إداري موثق عند وجود رصيد مفتوح',exception),summary,save,finalize,clearance,releaseUnit,printSettlement,printClearance,printOutput);
 return run(async()=>{const result=await rpc('list');isManager=result.manager===true;leases=result.leases||[];for(const x of leases){const option=node('option',[x.contract_no,x.tenant_name,x.property_name,x.unit_no].filter(Boolean).join(' — '));option.value=x.id;lease.append(option);}if(leases.length)await load();else{d.status.textContent='لا توجد عقود متاحة ضمن صلاحية الحساب.';draw();}});
}
