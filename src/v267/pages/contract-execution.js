import {assertContractExecutionService} from '../components/contract-execution-readiness.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {executionMethods,executionDue,rentReceiptArtifacts,executionManifest} from '../domain/contract-execution.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
const money=value=>Number(value||0).toFixed(3)+translateStatic(' د.ك');
function select(rows,value=''){const el=node('select');for(const [key,label]of rows){const option=node('option',label);option.value=key;el.append(option);}el.value=value??'';return el;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}

export async function readContractExecutionPdf(session,path,body){
 session.check();
 if(!['/api/official-document','/api/rent-receipt'].includes(path)||body?.workspaceId!==session.bound.workspace)throw Error('تعذر تأكيد نطاق المستند.');
 const result=await session.operation(async signal=>{
  const auth=await session.client.auth.getSession();session.check();
  const current=auth?.data?.session;if(auth?.error||!current?.access_token||current.user?.id!==session.bound.user)throw Error('تعذر تأكيد جلسة الدخول.');
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+current.access_token},body:JSON.stringify(body),signal,credentials:'same-origin',cache:'no-store',redirect:'error'});session.check();
  if(!response.ok)throw Object.assign(Error('تعذر تأكيد ملف PDF المؤرشف.'),{status:response.status});
  const blob=await response.blob();session.check();
  if(blob.type!=='application/pdf'||blob.size<5||blob.size>2097152)throw Error('استجابة المستند ليست PDF موثوقًا.');
  const signature=await blob.slice(0,5).text();session.check();if(signature!=='%PDF-')throw Error('استجابة المستند ليست PDF موثوقًا.');
  const archivedHash=response.headers.get('X-Aqari-Archived-SHA256')||'';
  if(!/^[a-f0-9]{64}$/i.test(archivedHash))throw Error('لم يتأكد أرشيف PDF من الخادم.');
  const bytes=await blob.arrayBuffer();session.check();
  const digest=await crypto.subtle.digest('SHA-256',bytes);session.check();
  const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(actual!==archivedHash.toLowerCase())throw Error('لم تتطابق بصمة الملف مع الأرشيف. لم يتم التنزيل.');
  const latest=await session.client.auth.getSession();session.check();
  if(latest?.error||!latest?.data?.session?.access_token||latest.data.session.user?.id!==session.bound.user)throw Error('تغيرت جلسة الدخول. لم يتم تنزيل الملف.');
  return {blob,archivedHash:actual};
 });
 session.check();return result;
}

export function openContractExecution(contractId,{onDone}={}){
 const d=createDialog(translateStatic('اعتماد دفعة الإبرام وإصدار المستندات'));if(!d)return false;
 const api=window.AQARI_RENTAL_RECORDS;if(!api)throw Error('تعذر تحميل محرك العقود.');
 const scope=()=>({userId:d.session.bound.user,workspaceId:d.session.bound.workspace});
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 const urls=new Set();d.onDispose(()=>{for(const url of urls)URL.revokeObjectURL(url);urls.clear();});
 let currentContract=null,currentProfile=null,currentDue=null;

 async function load(){
  const cloud=await window.AQARI_SUPABASE.loadAppState(scope());d.session.check();
  const db=api.primary(cloud.payload),contract=(db.contractsV202||[]).find(row=>String(row.id)===String(contractId));
  if(!contract)throw Error('العقد غير موجود.');if(contract.status!=='signing')throw Error('يجب أن يكون العقد في حالة بانتظار التوقيع قبل اعتماد الإبرام.');
  if(d.session.bound.role!=='general_manager')throw Error('اعتماد الإبرام النهائي متاح للمدير العام فقط.');
  const profile=(db.tenantProfilesV267||[]).find(row=>row.id===contract.tenantId);if(!profile)throw Error('ملف المستأجر غير موجود.');
  currentContract=contract;currentProfile=profile;currentDue=executionDue(api,contract);return {cloud,db};
 }

 const pdf=(path,body)=>readContractExecutionPdf(d.session,path,body);
 function downloadLink(label,blob,name){d.session.check();const url=URL.createObjectURL(blob);urls.add(url);const a=node('a',label);a.href=url;a.download=name;a.rel='noopener';a.className='is-primary';return a;}

 async function finalize({method,transactionNo,onDate,zeroReason}){
  const bound=scope(),cloud=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();
  const payload=copy(cloud.payload),db=api.primary(payload),contract=(db.contractsV202||[]).find(row=>String(row.id)===String(contractId));
  if(!contract||contract.status!=='signing')throw Error('تغيرت حالة العقد. حدّث السجل قبل المتابعة.');
  const profile=(db.tenantProfilesV267||[]).find(row=>row.id===contract.tenantId);if(!profile)throw Error('ملف المستأجر غير موجود.');
  await assertContractExecutionService(d.session,contractId);d.session.check();
  const due=executionDue(api,contract),signed={...contract,status:'signed',changeReason:'اعتماد تسوية الإبرام وإتمام توقيع العقد'};
  const ids={settlement:crypto.randomUUID(),document:crypto.randomUUID(),version:crypto.randomUUID(),event:crypto.randomUUID()};
  let receiptNo='',contractReceiptSequence=null;
  if(due.rent>0){
   const reservation=await rpc('aqari_reserve_rent_receipt_serial',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(contract.id),p_operation_ref:ids.settlement,p_year:Number(api.kuwaitDate().slice(0,4))});d.session.check();
   receiptNo=String(reservation?.receipt_no||'');contractReceiptSequence=Number(reservation?.contract_sequence);
   if(!/^AQ-R-\d{4}-\d{8,}$/.test(receiptNo)||!Number.isSafeInteger(contractReceiptSequence)||contractReceiptSequence<1)throw Error('تعذر تأكيد الرقم الرسمي المتسلسل لوصل الإيجار من الخادم.');
  }
  let receiptArtifacts=null;
  if(due.rent>0)receiptArtifacts=rentReceiptArtifacts({contract:signed,profile,due,receiptNo,contractReceiptSequence,onDate,method,transactionNo});
  const manifest=executionManifest({contract:signed,due,onDate,method,transactionNo,receiptNo,contractReceiptSequence,zeroReason,ids});
  const index=(db.contractsV202||[]).findIndex(row=>String(row.id)===String(contractId));db.contractsV202[index]=signed;
  db.contractExecutionSettlementsV267=(db.contractExecutionSettlementsV267||[]).concat([manifest]);
  if(receiptArtifacts){db.collections=(db.collections||[]).concat([receiptArtifacts.record]);db.rentLedgerV202=(db.rentLedgerV202||[]).concat([receiptArtifacts.ledger]);db.rentReceiptsV267=(db.rentReceiptsV267||[]).concat([receiptArtifacts.receipt]);}
  const directory=(db.tenantDirectoryV202||[]),directoryIndex=directory.findIndex(row=>row.contractNo===signed.contract_no||String(row.tenantProfileId||'')===String(signed.tenantId)&&String(row.property||'')===String(signed.property)&&String(row.unit||'')===String(signed.unit));
  const directoryRow={...(directoryIndex>=0?directory[directoryIndex]:{}),property:signed.property,unit:signed.unit,...api.directoryFields(signed,profile),nationalityEn:profile.nationalityEn||'',contractNo:signed.contract_no,source:'v267-cloud',verified:true,tenantProfileId:profile.id};
  if(directoryIndex>=0)directory[directoryIndex]=directoryRow;else directory.push(directoryRow);db.tenantDirectoryV202=directory;
  db.audit=(db.audit||[]).concat([[d.session.bound.user,'اعتماد تسوية إبرام العقد',signed.contract_no,new Date().toISOString()]]);
  await window.AQARI_SUPABASE.saveAppState(payload,Number(cloud.revision),bound);d.session.check();

  const verified=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();const confirmed=api.primary(verified.payload);
  const confirmedContract=(confirmed.contractsV202||[]).find(row=>String(row.id)===String(contractId)),confirmedManifest=(confirmed.contractExecutionSettlementsV267||[]).find(row=>row.id===manifest.id);
  if(!confirmedContract||confirmedContract.status!=='signed'||!confirmedManifest||!same(confirmedManifest,manifest))throw Error('لم تؤكد إعادة القراءة إتمام الإبرام. لا تعِد العملية قبل التحقق.');
  if(receiptArtifacts&&(!(confirmed.rentLedgerV202||[]).some(row=>same(row,receiptArtifacts.ledger))||!(confirmed.rentReceiptsV267||[]).some(row=>same(row,receiptArtifacts.receipt))))throw Error('العقد محفوظ لكن لم تتأكد قراءة الوصل. لا تعِد الدفع.');

  const officialArtifacts=await rpc('aqari_contract_execution_artifacts',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(contractId)});d.session.check();
  if(officialArtifacts?.settlement_id!==manifest.id||officialArtifacts?.contract_no!==signed.contract_no||!officialArtifacts?.tenant_document_id||!officialArtifacts?.owner_document_id||String(officialArtifacts?.rent_receipt_no||'')!==receiptNo||(receiptNo&&Number(officialArtifacts?.contract_receipt_sequence)!==contractReceiptSequence))throw Error('لم تتأكد إعادة قراءة نسختي العقد الرسميتين وربط الوصل.');

  const lease=await d.session.request(d.session.client.from('aqari_leases').select('id,external_ref,contract_no,status').eq('workspace_id',d.session.bound.workspace).eq('external_ref',String(contractId)).single());d.session.check();
  if(lease?.contract_no!==signed.contract_no||lease?.status!=='signed')throw Error('لم تتأكد حالة العقد التشغيلية بعد الإبرام.');
  const schedule=await rpc('aqari_rent_due_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});d.session.check();
  if(!Array.isArray(schedule?.periods))throw Error('لم يتأكد تحديث جدول الاستحقاقات بعد الإبرام.');
  if(due.rent>0){const first=schedule.periods.find(row=>String(row.period).slice(0,7)===due.period);if(!first||Number(first.balance)!==0)throw Error('دفعة الإبرام لم تغلق رصيد أول استحقاق كما هو متوقع.');}
  return {contract:confirmedContract,manifest,receiptNo,contractReceiptSequence,officialArtifacts,schedule};
 }

 async function start(){
  await load();d.body.replaceChildren(node('p',translateStatic('هذه الخطوة نهائية: تثبت العقد كتوقيع معتمد وتسوية الإبرام في عملية واحدة غير قابلة للحذف. رقم الوصل، عند وجود إيجار فعلي، يُحجز من الخادم وله رقم عام وتسلسل داخل العقد.')));
  const summary=node('section');summary.append(node('h3',translateStatic('المستحق عند الإبرام')),node('p',translateStatic('العقد: ')+currentContract.contract_no),node('p',translateStatic('المستأجر: ')+currentProfile.nameAr+' / '+currentProfile.nameEn),node('p',translateStatic('العقار / الوحدة: ')+currentContract.property+' / '+currentContract.unit),node('p',translateStatic('إيجار أول فترة: ')+money(currentDue.rent)),node('p',translateStatic('التأمين: ')+money(currentDue.deposit)),node('p',translateStatic('العربون: ')+money(currentDue.advance)),node('p',translateStatic('الرسوم: ')+money(currentDue.fees)),node('strong',translateStatic('الإجمالي: ')+money(currentDue.total)));d.body.append(summary);
  const form=node('form'),onDate=input('date',api.kuwaitDate()),method=currentDue.total>0?select([['',translateStatic('اختر طريقة الدفع')],...executionMethods.map(([key,label])=>[key,translateStatic(label)])]):select([['none',translateStatic('لا توجد دفعة')]], 'none'),transaction=input('text'),zeroReason=node('textarea'),confirm=input('checkbox'),submit=node('button',translateStatic('اعتماد الإبرام وإصدار المستندات'));
  const canonicalZeroReason=currentDue.breakdown.freeMonth?'لا توجد دفعة عند الإبرام بسبب الفترة المجانية المعتمدة.':'صافي المستحق عند الإبرام يساوي صفراً حسب شروط العقد المعتمدة.';
  onDate.required=true;method.required=true;transaction.maxLength=150;zeroReason.maxLength=500;confirm.type='checkbox';confirm.required=true;submit.type='submit';
  if(currentDue.total>0){transaction.required=true;form.append(field(translateStatic('طريقة الدفع'),method),field(translateStatic('رقم العملية / المرجع — إلزامي لكل طرق الدفع'),transaction));}
  else{zeroReason.required=true;zeroReason.minLength=3;zeroReason.value=translateStatic(canonicalZeroReason);form.append(field(translateStatic('توثيق سبب عدم وجود دفعة — لن يصدر وصل إيجار وهمي'),zeroReason));}
  form.append(field(translateStatic('تاريخ العملية'),onDate),field(translateStatic('راجعت المبلغ وهو يطابق الدفعة الفعلية، وأعتمد إتمام العقد'),confirm),submit);d.body.append(form);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;d.run(async()=>{
   submit.disabled=true;d.status.textContent=translateStatic('جاري تثبيت العقد والتسوية والتحقق من السجل والاستحقاقات…');
   const result=await finalize({method:currentDue.total>0?method.value:'none',transactionNo:currentDue.total>0?transaction.value.trim():'',onDate:onDate.value,zeroReason:currentDue.total===0?(zeroReason.value.trim()===translateStatic(canonicalZeroReason)?canonicalZeroReason:zeroReason.value.trim()):''});
   d.body.replaceChildren(node('h3',translateStatic('تم إبرام العقد وتأكيد السجل')),node('p',translateStatic('العقد ')+result.contract.contract_no+translateStatic(' أصبح موقّعًا، وتسوية الإبرام محفوظة وغير قابلة للحذف.')));
   if(result.receiptNo)d.body.append(node('p',translateStatic('وصل الإيجار الرسمي: ')+result.receiptNo+translateStatic(' · تسلسله داخل هذا العقد: ')+result.contractReceiptSequence));
   const documentBox=node('section');documentBox.append(node('h3',translateStatic('المستندات الرسمية')));d.body.append(documentBox);let documentErrors=[];
   try{const tenantPdf=await pdf('/api/official-document',{workspaceId:d.session.bound.workspace,documentId:result.officialArtifacts.tenant_document_id,version:1});documentBox.append(downloadLink(translateStatic('نسخة المستأجر — PDF رسمي مؤرشف'),tenantPdf.blob,'contract-'+result.contract.contract_no+'-tenant.pdf'));}catch(error){d.session.check();documentErrors.push(translateStatic('نسخة المستأجر PDF'));documentBox.append(node('p',translateStatic('تم إنشاء سجل نسخة المستأجر، لكن لم يتأكد أرشيف PDF في هذه الجلسة.')));}
   try{const ownerPdf=await pdf('/api/official-document',{workspaceId:d.session.bound.workspace,documentId:result.officialArtifacts.owner_document_id,version:1});documentBox.append(downloadLink(translateStatic('نسخة المالك / الإدارة — PDF رسمي مؤرشف'),ownerPdf.blob,'contract-'+result.contract.contract_no+'-owner.pdf'));}catch(error){d.session.check();documentErrors.push(translateStatic('نسخة المالك PDF'));documentBox.append(node('p',translateStatic('تم إنشاء سجل نسخة المالك / الإدارة، لكن لم يتأكد أرشيف PDF في هذه الجلسة.')));}
   if(result.receiptNo){try{const receiptPdf=await pdf('/api/rent-receipt',{workspaceId:d.session.bound.workspace,receiptNo:result.receiptNo});documentBox.append(downloadLink(translateStatic('وصل الإيجار الرسمي رقم ')+result.receiptNo,receiptPdf.blob,'rent-receipt-'+result.receiptNo+'.pdf'));}catch(error){d.session.check();documentErrors.push(translateStatic('وصل الإيجار PDF'));documentBox.append(node('p',translateStatic('وصل الإيجار محفوظ ومربوط بالحركة، لكن لم يتأكد تصدير PDF في هذه الجلسة.')));}}
   else documentBox.append(node('p',translateStatic('لا يوجد وصل إيجار لأن مبلغ الإيجار عند الإبرام صفر؛ لم يُنشأ أي وصل أو دفعة وهمية.')));
   d.status.textContent=documentErrors.length?translateStatic('تم الإبرام وتحديث الاستحقاقات، وبقي التحقق المستضاف من: ')+documentErrors.join(translateStatic(' و ')):translateStatic('تم الإبرام، وتأكد تحديث الاستحقاقات ونسختا العقد الرسميتان والوصل عند وجوده.');
   const done=node('button',translateStatic('العودة إلى العقد'));done.type='button';done.onclick=()=>{d.close();if(typeof onDone==='function')onDone(result.contract);};d.body.append(done);
  });};
 }
 d.run(start);return true;
}
