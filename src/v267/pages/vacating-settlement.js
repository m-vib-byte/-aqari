import {createDialog,node,field} from '../components/dialog.js';

const money=value=>Number(value||0).toFixed(3);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function printable(record,kind){
 const clearance=kind==='clearance',snapshot=clearance?record.clearance_snapshot:record.settlement_snapshot;
 if(!snapshot)throw Error(clearance?'لا توجد براءة ذمة محفوظة للطباعة.':'لا توجد تسوية نهائية محفوظة للطباعة.');
 const balances=clearance?snapshot.clearance_balances:snapshot.final_balances;
 record=snapshot;
 const number=clearance?record.clearance_no:record.settlement_no;
 const title=clearance?'براءة ذمة وإخلاء طرف':'تسوية إخلاء نهائية';
 const rows=[['الرقم',number],['رقم العقد',record.contract_no],['المستأجر',record.tenant_name],['العقار',record.property_name],['الوحدة',record.unit_no],['تاريخ الإخلاء',record.vacate_date],['الإيجار المستحق حتى الإخلاء',money(balances?.rent_due_total)],['إجمالي المسدد',money(balances?.rent_paid_total)],['المتبقي على المستأجر',money(balances?.rent_balance)],['الرصيد الدائن للمستأجر',money(balances?.tenant_credit)],['رصيد التأمين غير المسوّى',money(balances?.deposit_balance)],['الأضرار المثبتة',money(record.damage_amount)],['مرجع تسوية الأضرار',record.charges_reference||'—'],['المفاتيح مستلمة',record.keys_returned?'نعم':'لا'],['فحص الوحدة مكتمل',record.inspection_completed?'نعم':'لا'],['قراءات العدادات مثبتة',record.meters_recorded?'نعم':'لا']];
 if(clearance)rows.push(['الاستثناء الإداري',record.exception_reason||'لا يوجد']);
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>'+escape(title)+' '+escape(number)+'</title><style>body{font-family:Arial,sans-serif;color:#26231d;margin:0;padding:24px;line-height:1.7}main{max-width:800px;margin:auto;border:1px solid #b69a55;padding:28px}h1{font-size:25px;color:#695528}dl{display:grid;grid-template-columns:minmax(180px,1fr) 2fr;gap:8px 20px}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}.note{border-top:1px solid #d6c9ab;padding-top:16px;margin-top:24px}@media(max-width:520px){body,main{padding:12px}dl{display:block}dd{margin-bottom:12px}}@media print{body{padding:0}main{border:0;padding:12mm;max-width:none}}</style></head><body><main><p>AQARI</p><h1>'+escape(title)+'</h1><dl>'+rows.map(([k,v])=>'<dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd>').join('')+'</dl><p class="note">'+escape(clearance?'صدرت هذه البراءة من سجل التسوية المحفوظ. أي استثناء ظاهر أعلاه موثق ضمن سجل الاعتماد.':'هذه نسخة من التسوية المحفوظة وقت الاعتماد ولا تعتمد على قيم واجهة غير محفوظة.')+'</p></main></body></html>';
}
function openPrint(html){const w=window.open('','_blank');if(!w)throw Error('اسمح بفتح نافذة الطباعة ثم أعد المحاولة.');try{w.opener=null;}catch{}w.document.open();w.document.write(html);w.document.close();w.focus();w.print();}
const checkbox=()=>{const input=node('input');input.type='checkbox';return input;};
export function openVacatingSettlement(){
 const d=createDialog('تسوية الإخلاء وبراءة الذمة');if(!d)return;
 const lease=node('select'),vacate=node('input'),keys=checkbox(),inspection=checkbox(),meters=checkbox(),damage=node('input'),damageNotes=node('textarea'),resolved=checkbox(),reference=node('input'),exception=node('textarea');
 vacate.type='date';damage.type='text';damage.inputMode='decimal';damage.value='0.000';damageNotes.maxLength=1000;reference.maxLength=160;exception.maxLength=1000;
 const summary=node('section'),save=node('button','حفظ مسودة الإخلاء'),finalize=node('button','اعتماد التسوية النهائية'),clearance=node('button','إصدار براءة الذمة'),printSettlement=node('button','طباعة التسوية المحفوظة'),printClearance=node('button','طباعة براءة الذمة');
 let current=null,isManager=false,leases=[];
 const rpc=(action,data={})=>d.session.request(d.session.client.rpc('aqari_vacating_settlement',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));
 function draw(){
  summary.replaceChildren();
  if(!current){summary.append(node('p','لا توجد مسودة محفوظة لهذا العقد.'));return;}
  const b=current.balances||{};summary.append(node('h3','حالة التسوية: '+current.status),node('p','المتبقي على المستأجر: '+money(b.rent_balance)+' د.ك · الرصيد الدائن: '+money(b.tenant_credit)+' د.ك · التأمين غير المسوّى: '+money(b.deposit_balance)+' د.ك'));
  if(current.settlement_no)summary.append(node('p','رقم التسوية: '+current.settlement_no));if(current.clearance_no)summary.append(node('p','رقم براءة الذمة: '+current.clearance_no));if(current.exception_reason)summary.append(node('p','استثناء موثق: '+current.exception_reason));
  const locked=current.status!=='draft';for(const x of [vacate,keys,inspection,meters,damage,damageNotes,resolved,reference])x.disabled=locked;
  save.disabled=locked;finalize.disabled=locked||!isManager;clearance.disabled=current.status!=='finalized'||!isManager;printSettlement.disabled=!current.settlement_snapshot;printClearance.disabled=!current.clearance_snapshot;
 }
 function fill(record){current=record;if(!record){vacate.value='';keys.checked=inspection.checked=meters.checked=resolved.checked=false;damage.value='0.000';damageNotes.value=reference.value=exception.value='';draw();return;}vacate.value=record.vacate_date||'';keys.checked=record.keys_returned===true;inspection.checked=record.inspection_completed===true;meters.checked=record.meters_recorded===true;damage.value=money(record.damage_amount);damageNotes.value=record.damage_notes||'';resolved.checked=record.charges_resolved===true;reference.value=record.charges_reference||'';exception.value=record.exception_reason||'';draw();}
 async function load(){if(!lease.value){fill(null);return;}const result=await rpc('get',{lease_id:lease.value});fill(result.settlement);}
 lease.onchange=()=>d.run(load);
 save.onclick=()=>d.run(async()=>{const result=await rpc('save',{lease_id:lease.value,vacate_date:vacate.value,keys_returned:keys.checked,inspection_completed:inspection.checked,meters_recorded:meters.checked,damage_amount:String(damage.value).trim(),damage_notes:damageNotes.value,charges_resolved:resolved.checked,charges_reference:reference.value,revision:current?.revision||0});fill(result.settlement);d.status.textContent='حُفظت مسودة الإخلاء وأعيدت قراءتها من قاعدة البيانات.';});
 finalize.onclick=()=>d.run(async()=>{if(!current)throw Error('احفظ المسودة أولاً.');const result=await rpc('finalize',{lease_id:lease.value,revision:current.revision});fill(result.settlement);d.status.textContent='اعتمدت التسوية النهائية وحُفظت نسخة ثابتة للطباعة.';});
 clearance.onclick=()=>d.run(async()=>{if(!current)throw Error('اعتمد التسوية أولاً.');const result=await rpc('clearance',{lease_id:lease.value,revision:current.revision,exception_reason:exception.value.trim()});fill(result.settlement);d.status.textContent='صدرت براءة الذمة من السجل المحفوظ.';});
 printSettlement.onclick=()=>{try{openPrint(printable(current,'settlement'));}catch(e){d.status.textContent=e.message;}};printClearance.onclick=()=>{try{openPrint(printable(current,'clearance'));}catch(e){d.status.textContent=e.message;}};
 d.body.append(field('العقد',lease),field('تاريخ الإخلاء',vacate),field('استلام جميع المفاتيح',keys),field('اكتمال فحص الوحدة',inspection),field('تثبيت قراءات الكهرباء والماء',meters),field('قيمة الأضرار — د.ك',damage),field('وصف الأضرار',damageNotes),field('تمت تسوية الأضرار/المبالغ الأخرى',resolved),field('مرجع تسوية الأضرار',reference),field('استثناء إداري موثق عند وجود رصيد مفتوح',exception),summary,save,finalize,clearance,printSettlement,printClearance);
 d.run(async()=>{const result=await rpc('list');isManager=result.manager===true;leases=result.leases||[];for(const x of leases){const option=node('option',[x.contract_no,x.tenant_name,x.property_name,x.unit_no].filter(Boolean).join(' — '));option.value=x.id;lease.append(option);}if(leases.length)await load();else{d.status.textContent='لا توجد عقود متاحة ضمن صلاحية الحساب.';draw();}});
}
