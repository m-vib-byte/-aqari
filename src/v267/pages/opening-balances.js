import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createPrivateUrls} from '../components/private-urls.js';
import {checksum} from '../components/scan-image.js';

const input=(type='text')=>Object.assign(node('input'),{type});
const option=(value,text)=>Object.assign(node('option',text),{value});
const button=text=>Object.assign(node('button',text),{type:'button'});
const canonical=x=>x&&typeof x==='object'?(Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}'):JSON.stringify(x);
const opening=e=>['opening_debit','opening_credit','opening_balance'].includes(e.kind);
export function openingAmount(value){const text=String(value??'').trim();if(!/^\d{1,12}(?:\.\d{1,3})?$/.test(text))throw Error('أدخل المدين والدائن من المصدر صراحةً، بثلاث منازل عشرية كحد أقصى.');const [a,b='']=text.split('.');return BigInt(a).toString()+'.'+b.padEnd(3,'0');}
const fils=value=>BigInt(openingAmount(value).replace('.',''));
const money=value=>{const s=value.toString().padStart(4,'0');return s.slice(0,-3)+'.'+s.slice(-3);};
const errors={OPENING_REVIEW_REVISION_CONFLICT:'صدرت مراجعة أحدث. حدّث البيانات قبل اعتماد مراجعة جديدة.',OPENING_SOURCE_ALREADY_REVIEWED:'سبق حفظ هذه المطابقة نفسها. راجع السجل المحفوظ.',OPENING_SOURCE_TOTALS_MISMATCH:'المدين أو الدائن المختار لا يطابق المبلغ المثبت بالمصدر.',OPENING_SOURCE_UNVERIFIED:'المصدر غير متاح أو لم تتطابق بصمته المحفوظة.',OPENING_ENTRY_SCOPE_OR_CUTOFF_CONFLICT:'راجع ملكية القيود وتاريخها ونطاق المستند المختار.',OPENING_SOURCE_ATTESTATION_REQUIRED:'تحقق من الملف المحفوظ ثم أقرّ بمراجعة المصدر ومحتواه.'};

function mount(d){
 const urls=createPrivateUrls(d);let context=null,verified=null,pending=null,epoch=0;const chosen=new Set(),checks=new Map();
 const tenant=node('select'),cutoff=input('date'),source=node('select'),reference=input(),coverage=node('textarea'),debit=input(),credit=input(),attest=input('checkbox'),correction=input();
 tenant.required=cutoff.required=source.required=reference.required=coverage.required=debit.required=credit.required=true;
 reference.maxLength=500;coverage.maxLength=2000;correction.maxLength=1000;debit.inputMode=credit.inputMode='decimal';
 const form=node('form'),entries=node('section'),archive=node('section'),summary=node('p'),download=node('section');
 const verify=button(translateStatic('فتح المصدر المحفوظ والتحقق منه')),refresh=button(translateStatic('تحديث السجلات')),submit=Object.assign(button(translateStatic('اعتماد مطابقة القيود المختارة')),{type:'submit'}),retry=button(translateStatic('التحقق من الحفظ السابق'));
 form.append(field(translateStatic('المستأجر'),tenant),field(translateStatic('تاريخ القطع — نهاية اليوم المحدد'),cutoff),refresh,
  node('p',translateStatic('هذه مراجعة مستقلة للقيود الافتتاحية التي تختارها فقط. لا تصدر كشف حساب نهائيًا، ولا توزع دينًا عامًا على عقد، ولا تغيّر تحصيل الإيجار.')),
  field(translateStatic('المستند المحفوظ'),source),node('p',translateStatic('لإضافة مصدر جديد، ارفعه أولًا في مركز المستندات مربوطًا بالمستأجر أو بعقده أو عقاره، ثم حدّث هذه الصفحة.')),verify,download,
  field(translateStatic('موضع المصدر — رقم الصفحة أو البيان'),reference),field(translateStatic('ما الذي يغطيه المصدر؟ وضّح الإيجار والرسوم والتأمين بحسب المستند'),coverage),
  field(translateStatic('المدين المثبت بالمصدر — د.ك'),debit),field(translateStatic('الدائن المثبت بالمصدر — د.ك'),credit),field(translateStatic('سبب التصحيح — مطلوب عند وجود مراجعة سابقة لنفس تاريخ القطع'),correction),entries,summary,
  field(translateStatic('راجعت الملف المحفوظ وأقر بأن المبالغ والتغطية والقيود المختارة تخص هذا المستأجر حتى نهاية يوم القطع'),attest),submit,retry);
 d.body.append(form,archive);
 const rpc=async(action,data={})=>{try{return await d.session.request(d.session.client.rpc('aqari_opening_balance_reconciliation',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));}catch(e){if(errors[e.message])e.message=errors[e.message];throw e;}};
 const run=task=>d.run(task).finally(()=>{if(!d.closed)controls();});
 function controls(){
  const locked=!!pending;for(const control of [tenant,cutoff,source,reference,coverage,debit,credit,correction,refresh])control.disabled=locked;
  source.disabled=locked||!context?.tenant_id;verify.disabled=locked||!source.value;attest.disabled=locked||!verified;
  for(const c of checks.values())c.disabled=locked;
  submit.disabled=locked||!context?.tenant_id||!context?.cutoff_date||!verified||!attest.checked||!chosen.size;
  retry.hidden=!pending;retry.disabled=!pending;
 }
 function clearSource(){verified=null;attest.checked=false;urls.clear();download.replaceChildren();controls();}
 function total(){let a=0n,b=0n;for(const row of context?.entries||[])if(chosen.has(row.id)){if(row.direction==='debit')a+=fils(row.amount);else b+=fils(row.amount);}
  summary.textContent=visibleMessage("القيود المختارة: {value0} • مدين {value1} د.ك • دائن {value2} د.ك. التحصيل الفعلي لجميع الفترات: {value3}.",{value0:(chosen.size),value1:(money(a)),value2:(money(b)),value3:(context?.actual_collections==null?translateStatic('لم يحدد مستأجر'):openingAmount(context.actual_collections)+translateStatic(' د.ك'))});controls();return {a,b};}
 function renderEntries(){entries.replaceChildren();checks.clear();
  if(!context?.cutoff_date){entries.append(node('p',translateStatic('اختر تاريخ القطع صراحةً لعرض القيود حتى نهايته وما بعدها.')));total();return;}
  for(const [side,title] of [['through_cutoff',translateStatic('القيود حتى نهاية يوم القطع')],['after_cutoff',translateStatic('القيود بعد يوم القطع')]]){
   const table=node('table'),head=node('tr');for(const h of [translateStatic('اختيار'),translateStatic('تاريخ القيد'),translateStatic('النوع'),translateStatic('العقد'),translateStatic('الاتجاه'),translateStatic('المبلغ — د.ك'),translateStatic('البيان')])head.append(node('th',h));table.append(head);
   const rows=context.entries.filter(e=>e.side===side);for(const row of rows){const tr=node('tr'),selection=node('td');
    if(side==='through_cutoff'&&opening(row)){const check=input('checkbox');check.setAttribute('aria-label',translateStatic('اختيار القيد ')+row.id);check.checked=chosen.has(row.id);check.onchange=()=>{if(pending)return;check.checked?chosen.add(row.id):chosen.delete(row.id);attest.checked=false;total();};checks.set(row.id,check);selection.append(check);}
    else selection.textContent='—';
    tr.append(selection,...[row.occurred_on,opening(row)?translateStatic('افتتاحي'):translateStatic('حركة أخرى'),row.contract_no||translateStatic('عام دون تخصيص'),row.direction==='debit'?translateStatic('مدين'):translateStatic('دائن'),openingAmount(row.amount),row.reason].map(v=>node('td',v)));table.append(tr);
   }entries.append(node('h3',title),rows.length?table:node('p',translateStatic('لا توجد قيود في هذه المجموعة.')));
  }total();
 }
 function renderArchive(){archive.replaceChildren(node('h3',translateStatic('المراجعات المحفوظة — لا تستبدل النسخ السابقة')));
  for(const r of context?.reviews||[]){const card=node('details');card.append(node('summary',visibleMessage("مراجعة {value0} • نهاية {value1} • مدين {value2} / دائن {value3} د.ك",{value0:(r.revision),value1:(r.cutoff_date),value2:(openingAmount(r.source_debit)),value3:(openingAmount(r.source_credit))})),
    node('p',`${r.reviewed_by_name} • ${r.reviewed_at}`),node('p',visibleMessage("المصدر: {value0} • {value1}",{value0:(r.document_snapshot.title),value1:(r.source_reference)})),node('p',r.source_coverage),node('p',visibleMessage("بصمة المصدر: {value0}",{value0:(r.source_sha256)})));
   if(r.correction_reason)card.append(node('p',translateStatic('سبب التصحيح: ')+r.correction_reason));
   for(const e of r.entries_snapshot)card.append(node('p',`${e.occurred_on} • ${e.direction==='debit'?translateStatic('مدين'):translateStatic('دائن')} ${openingAmount(e.amount)} • ${e.reason}`));archive.append(card);
  }
 }
 async function load(){const revision=++epoch,selectedTenant=tenant.value||null,selectedCutoff=cutoff.value||null;context=null;chosen.clear();clearSource();
  const r=await rpc('context',{tenant_id:selectedTenant,cutoff_date:selectedCutoff});
  if(d.closed||revision!==epoch)return;
  if(r?.workspace_id!==d.session.bound.workspace||r.user_id!==d.session.bound.user||r.tenant_id!==selectedTenant||r.cutoff_date!==selectedCutoff||r.cutoff_boundary!=='end_of_day'||r.scope!=='selected_opening_lines_source_review_only'||!Array.isArray(r.tenants)||!Array.isArray(r.entries)||!Array.isArray(r.documents)||!Array.isArray(r.reviews)||!Number.isSafeInteger(r.latest_revision)||r.latest_revision<0)throw Error('تعذر تأكيد نطاق المراجعة المحفوظة.');
  for(const e of r.entries){if(e.tenant_id!==selectedTenant||!['debit','credit'].includes(e.direction)||!['unspecified','through_cutoff','after_cutoff'].includes(e.side))throw Error('تعذر تأكيد نطاق القيود.');openingAmount(e.amount);}
  context=r;tenant.replaceChildren(option('',translateStatic('اختر المستأجر')),...r.tenants.map(x=>option(x.id,x.name)));tenant.value=selectedTenant||'';
  source.replaceChildren(option('',translateStatic('اختر مصدرًا محفوظًا')),...r.documents.map(x=>option(x.id,(x.document_no?x.document_no+' — ':'')+x.title)));source.value='';
  reference.value=coverage.value=debit.value=credit.value=correction.value='';correction.required=r.latest_revision>0;renderEntries();renderArchive();controls();
 }
 async function verifySource(){clearSource();const id=source.value,version=epoch,doc=context?.documents.find(x=>x.id===id);if(!doc)throw Error('اختر مستندًا محفوظًا.');
  if(doc.storage_bucket!=='aqari-documents'||!doc.storage_path?.startsWith(d.session.bound.workspace+'/')||!Number.isSafeInteger(doc.size_bytes)||doc.size_bytes<1||doc.size_bytes>26214400||!/^[a-f0-9]{64}$/.test(doc.checksum_sha256||''))throw Error('بيانات المصدر المحفوظ غير مكتملة.');
  const blob=await d.session.storage('GET',doc.storage_path,undefined,doc.storage_bucket),hash=await checksum(blob);d.session.check();
  if(d.closed||epoch!==version||source.value!==id)return;
  if(blob.size!==doc.size_bytes||blob.type!==doc.mime_type||hash!==doc.checksum_sha256)throw Error('بصمة الملف أو حجمه لا يطابق المصدر المحفوظ. لم يتم اعتماده.');
  verified={...doc};const link=node('a',translateStatic('تنزيل المصدر الخاص لقراءته'));link.href=urls.create(blob);link.download=doc.original_filename||'opening-source';link.rel='noopener';download.replaceChildren(node('p',translateStatic('تطابقت بصمة الملف المحفوظ. اقرأه ثم أدخل القيم والتغطية وأقرّ بالمراجعة.')),link);controls();
 }
 function request(){if(!context||!verified||verified.id!==source.value||!attest.checked||!chosen.size||!cutoff.value||cutoff.value!==context.cutoff_date)throw Error('اختر المصدر والقيود وتاريخ القطع، ثم اقرأ المستند وأقرّ بالمراجعة.');
  const sourceDebit=openingAmount(debit.value),sourceCredit=openingAmount(credit.value),totals=total();if(fils(sourceDebit)!==totals.a||fils(sourceCredit)!==totals.b)throw Error('المدين والدائن من المصدر يجب أن يطابقا القيود المختارة كلٌ على حدة.');
  if(reference.value.trim().length<3||coverage.value.trim().length<3)throw Error('أدخل موضع المصدر وما يغطيه صراحةً.');
  const previous=context.reviews.find(r=>r.cutoff_date===context.cutoff_date&&r.revision===context.latest_revision);
  if(context.latest_revision>0&&(!previous||correction.value.trim().length<3))throw Error('أدخل سبب التصحيح مع الحفاظ على المراجعة السابقة.');
  return {id:crypto.randomUUID(),tenant_id:context.tenant_id,cutoff_date:context.cutoff_date,cutoff_boundary:'end_of_day',expected_revision:context.latest_revision,
   source_document_id:verified.id,source_sha256:verified.checksum_sha256,source_reference:reference.value.trim(),source_coverage:coverage.value.trim(),source_debit:sourceDebit,source_credit:sourceCredit,
   entry_ids:[...chosen].sort(),source_attestation:true,bytes_verified:true,...(previous?{previous_review_id:previous.id,correction_reason:correction.value.trim()}:{})};
 }
 async function confirm({recover=false}={}){const attempt=pending;if(!attempt)return;let r=await rpc('get',{id:attempt.data.id});
  if(r?.workspace_id!==d.session.bound.workspace||r.user_id!==d.session.bound.user)throw Error('تعذر تأكيد نطاق نتيجة الحفظ.');
  if(recover&&r.review===null){await rpc('review',attempt.data);return confirm();}
  const saved=r.review,doc=attempt.document;
  if(!saved||saved.id!==attempt.data.id||saved.workspace_id!==d.session.bound.workspace||saved.tenant_id!==attempt.data.tenant_id||saved.reviewed_by!==d.session.bound.user||saved.revision!==attempt.data.expected_revision+1||saved.cutoff_date!==attempt.data.cutoff_date||saved.cutoff_boundary!=='end_of_day'||!saved.reviewed_at||saved.source_attestation!==true||saved.bytes_verified!==true||saved.source_document_id!==doc.id||saved.source_sha256!==doc.checksum_sha256||canonical(saved.request_snapshot)!==canonical(attempt.data)||canonical(saved.entry_ids)!==canonical(attempt.data.entry_ids)||openingAmount(saved.source_debit)!==attempt.data.source_debit||openingAmount(saved.source_credit)!==attempt.data.source_credit||saved.source_reference!==attempt.data.source_reference||saved.source_coverage!==attempt.data.source_coverage||!Array.isArray(saved.entries_snapshot)||saved.entries_snapshot.length!==attempt.entries.length)throw Error('تعذر تأكيد المراجعة كاملةً. استخدم التحقق من الحفظ السابق.');
  for(const key of ['id','storage_bucket','storage_path','checksum_sha256','size_bytes','mime_type'])if(saved.document_snapshot?.[key]!==doc[key])throw Error('تعذر تأكيد نسخة المصدر المحفوظة.');
  if((saved.previous_review_id??null)!==(attempt.data.previous_review_id??null)||(saved.correction_reason??null)!==(attempt.data.correction_reason??null)||!/^[a-f0-9]{64}$/.test(saved.review_fingerprint||''))throw Error('تعذر تأكيد ارتباط المراجعة بالنسخة السابقة وسبب التصحيح.');
  for(const e of attempt.entries){const found=saved.entries_snapshot.find(x=>x.id===e.id);if(!found||found.workspace_id!==d.session.bound.workspace||['tenant_id','lease_id','kind','direction','occurred_on','reason'].some(k=>found[k]!==e[k])||openingAmount(found.amount)!==openingAmount(e.amount))throw Error('تعذر تأكيد خطوط المراجعة المحفوظة.');}
  pending=null;await load();d.status.textContent=translateStatic('تم اعتماد المطابقة والتحقق من المصدر والقيود بإعادة القراءة. لم ينشأ تحصيل أو وصل.');
 }
 form.onsubmit=e=>{e.preventDefault();if(pending)return;return run(async()=>{if(pending)return;pending={data:request(),document:{...verified},entries:context.entries.filter(e=>chosen.has(e.id)).map(e=>({...e}))};controls();try{await rpc('review',pending.data);await confirm();}catch(error){if(['22023','22007','22008','23514','23505','40001','42501'].includes(error?.code))pending=null;throw error;}finally{controls();}});};
 retry.onclick=()=>run(()=>confirm({recover:true}));verify.onclick=()=>run(verifySource);refresh.onclick=()=>run(load);
 tenant.onchange=cutoff.onchange=()=>run(load);source.onchange=()=>{if(!pending)clearSource();};
  attest.onchange=controls;for(const c of [debit,credit,reference,coverage,correction])c.oninput=()=>{attest.checked=false;controls();};
 d.onDispose(()=>{epoch++;pending=context=verified=null;chosen.clear();checks.clear();form.replaceChildren();archive.replaceChildren();});
 controls();return {load};
}

export function openOpeningBalances(){const d=createDialog(translateStatic('مطابقة الرصيد الافتتاحي بالمصدر'));if(!d)return;
 return d.run(async()=>{const access=await d.session.request(d.session.client.rpc('aqari_workspace_access',{p_workspace_id:d.session.bound.workspace}));
  if(access?.user_id!==d.session.bound.user||access?.workspace_id!==d.session.bound.workspace||access?.role!==d.session.bound.role||access.role!=='general_manager'||access?.features?.opening_balance_reconciliation!==true||access?.permissions?.finance?.read!==true||access?.permissions?.documents?.read!==true){d.body.append(node('p',translateStatic('مطابقة الرصيد الافتتاحي غير متاحة لهذا الحساب.')));return;}
  await mount(d).load();
 });
}

