import {createDialog,node,field} from '../components/dialog.js';
import {executionMethods,executionDue,nextRentReceiptSerial,rentReceiptArtifacts,executionManifest} from '../domain/contract-execution.js';

const copy=value=>JSON.parse(JSON.stringify(value));
const input=(type,value='')=>{const el=node('input');el.type=type;el.value=value??'';return el;};
const money=value=>Number(value||0).toFixed(3)+' د.ك';
function select(rows,value=''){const el=node('select');for(const [key,label]of rows){const option=node('option',label);option.value=key;el.append(option);}el.value=value??'';return el;}
function profileRef(row){if(!Array.isArray(row))return null;return row.find(x=>x&&typeof x==='object'&&x.aqariTenantProfileV267)?.aqariTenantProfileV267||row[4]||null;}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}

export function openContractExecution(contractId,{onDone}={}){
 const d=createDialog('اعتماد دفعة الإبرام وإصدار المستندات');if(!d)return false;
 const api=window.AQARI_RENTAL_RECORDS;if(!api)throw Error('تعذر تحميل محرك العقود.');
 const scope=()=>({userId:d.session.bound.user,workspaceId:d.session.bound.workspace});
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

 async function accessToken(){
  const result=await d.session.client.auth.getSession();d.session.check();
  const session=result?.data?.session;if(result?.error||!session?.access_token||session.user?.id!==d.session.bound.user)throw Error('تعذر تأكيد جلسة الدخول.');
  return session.access_token;
 }
 async function pdf(path,body){
  const token=await accessToken(),response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),cache:'no-store',redirect:'error'});d.session.check();
  if(!response.ok)throw Object.assign(Error('تعذر تأكيد ملف PDF.'),{status:response.status});
  const blob=await response.blob();if(blob.type!=='application/pdf')throw Error('استجابة المستند ليست PDF.');return blob;
 }
 function downloadLink(label,blob,name){const url=URL.createObjectURL(blob);urls.add(url);const a=node('a',label);a.href=url;a.download=name;a.rel='noopener';a.className='is-primary';return a;}

 async function finalize({method,transactionNo,onDate,zeroReason}){
  const bound=scope(),cloud=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();
  const payload=copy(cloud.payload),db=api.primary(payload),contract=(db.contractsV202||[]).find(row=>String(row.id)===String(contractId));
  if(!contract||contract.status!=='signing')throw Error('تغيرت حالة العقد. حدّث السجل قبل المتابعة.');
  const profile=(db.tenantProfilesV267||[]).find(row=>row.id===contract.tenantId);if(!profile)throw Error('ملف المستأجر غير موجود.');
  const due=executionDue(api,contract),signed={...contract,status:'signed',changeReason:'اعتماد تسوية الإبرام وإتمام توقيع العقد'};
  const receiptNo=due.rent>0?nextRentReceiptSerial(db,api.kuwaitDate().slice(0,4)):'';
  const ids={settlement:crypto.randomUUID(),document:crypto.randomUUID(),version:crypto.randomUUID(),event:crypto.randomUUID()};
  let artifacts=null;
  if(due.rent>0)artifacts=rentReceiptArtifacts({contract:signed,profile,due,receiptNo,onDate,method,transactionNo});
  const manifest=executionManifest({contract:signed,due,onDate,method,transactionNo,receiptNo,zeroReason,ids});
  const index=(db.contractsV202||[]).findIndex(row=>String(row.id)===String(contractId));db.contractsV202[index]=signed;
  db.contractExecutionSettlementsV267=(db.contractExecutionSettlementsV267||[]).concat([manifest]);
  if(artifacts){db.collections=(db.collections||[]).concat([artifacts.record]);db.rentLedgerV202=(db.rentLedgerV202||[]).concat([artifacts.ledger]);db.rentReceiptsV267=(db.rentReceiptsV267||[]).concat([artifacts.receipt]);}
  const directory=(db.tenantDirectoryV202||[]),directoryIndex=directory.findIndex(row=>row.contractNo===signed.contract_no||String(row.tenantProfileId||'')===String(signed.tenantId)&&String(row.property||'')===String(signed.property)&&String(row.unit||'')===String(signed.unit));
  const directoryRow={...(directoryIndex>=0?directory[directoryIndex]:{}),property:signed.property,unit:signed.unit,...api.directoryFields(signed,profile),nationalityEn:profile.nationalityEn||'',contractNo:signed.contract_no,source:'v267-cloud',verified:true,tenantProfileId:profile.id};
  if(directoryIndex>=0)directory[directoryIndex]=directoryRow;else directory.push(directoryRow);db.tenantDirectoryV202=directory;
  db.audit=(db.audit||[]).concat([[d.session.bound.user,'اعتماد تسوية إبرام العقد',signed.contract_no,new Date().toISOString()]]);
  await window.AQARI_SUPABASE.saveAppState(payload,Number(cloud.revision),bound);d.session.check();
  const verified=await window.AQARI_SUPABASE.loadAppState(bound);d.session.check();const confirmed=api.primary(verified.payload);
  const confirmedContract=(confirmed.contractsV202||[]).find(row=>String(row.id)===String(contractId)),confirmedManifest=(confirmed.contractExecutionSettlementsV267||[]).find(row=>row.id===manifest.id);
  if(!confirmedContract||confirmedContract.status!=='signed'||!confirmedManifest||!same(confirmedManifest,manifest))throw Error('لم تؤكد إعادة القراءة إتمام الإبرام. لا تعِد العملية قبل التحقق.');
  if(artifacts&&(!(confirmed.rentLedgerV202||[]).some(row=>same(row,artifacts.ledger))||!(confirmed.rentReceiptsV267||[]).some(row=>same(row,artifacts.receipt))))throw Error('العقد محفوظ لكن لم تتأكد قراءة الوصل. لا تعِد الدفع.');
  return {contract:confirmedContract,manifest,receiptNo};
 }

 async function start(){
  await load();d.body.replaceChildren(node('p','هذه الخطوة نهائية: تثبت العقد كتوقيع معتمد وتسوية الإبرام في عملية واحدة غير قابلة للحذف.'));
  const summary=node('section');summary.append(node('h3','المستحق عند الإبرام'),node('p','العقد: '+currentContract.contract_no),node('p','المستأجر: '+currentProfile.nameAr+' / '+currentProfile.nameEn),node('p','العقار / الوحدة: '+currentContract.property+' / '+currentContract.unit),node('p','إيجار أول فترة: '+money(currentDue.rent)),node('p','التأمين: '+money(currentDue.deposit)),node('p','العربون: '+money(currentDue.advance)),node('p','الرسوم: '+money(currentDue.fees)),node('strong','الإجمالي: '+money(currentDue.total)));d.body.append(summary);
  const form=node('form'),onDate=input('date',api.kuwaitDate()),method=currentDue.total>0?select([['','اختر طريقة الدفع'],...executionMethods]):select([['none','لا توجد دفعة']], 'none'),transaction=input('text'),zeroReason=node('textarea'),confirm=input('checkbox'),submit=node('button','اعتماد الإبرام وإصدار المستندات');
  onDate.required=true;method.required=true;transaction.maxLength=150;zeroReason.maxLength=500;confirm.type='checkbox';confirm.required=true;submit.type='submit';
  if(currentDue.total>0){transaction.required=true;form.append(field('طريقة الدفع',method),field('رقم العملية / المرجع — إلزامي لكل طرق الدفع',transaction));}
  else{zeroReason.required=true;zeroReason.minLength=3;zeroReason.value=currentDue.breakdown.freeMonth?'لا توجد دفعة عند الإبرام بسبب الفترة المجانية المعتمدة.':'صافي المستحق عند الإبرام يساوي صفراً حسب شروط العقد المعتمدة.';form.append(field('توثيق سبب عدم وجود دفعة — لن يصدر وصل إيجار وهمي',zeroReason));}
  form.append(field('تاريخ العملية',onDate),field('راجعت المبلغ وهو يطابق الدفعة الفعلية، وأعتمد إتمام العقد',confirm),submit);d.body.append(form);
  form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;d.run(async()=>{
   submit.disabled=true;d.status.textContent='جاري تثبيت العقد والتسوية والتحقق من السجل…';
   const result=await finalize({method:currentDue.total>0?method.value:'none',transactionNo:currentDue.total>0?transaction.value.trim():'',onDate:onDate.value,zeroReason:currentDue.total===0?zeroReason.value.trim():''});
   d.body.replaceChildren(node('h3','تم إبرام العقد وتأكيد السجل'),node('p','العقد '+result.contract.contract_no+' أصبح موقّعًا، وتسوية الإبرام محفوظة وغير قابلة للحذف.'));
   const documentBox=node('section');documentBox.append(node('h3','المستندات الرسمية'));d.body.append(documentBox);let documentErrors=[];
   try{const contractPdf=await pdf('/api/official-document',{workspaceId:d.session.bound.workspace,documentId:result.manifest.contractDocumentId,version:1});documentBox.append(downloadLink('عقد PDF الرسمي',contractPdf,'contract-'+result.contract.contract_no+'.pdf'));}catch(error){documentErrors.push('عقد PDF');documentBox.append(node('p','تم إصدار سجل العقد الرسمي، لكن لم يتأكد أرشيف PDF في هذه الجلسة.'));}
   if(result.receiptNo){try{const receiptPdf=await pdf('/api/rent-receipt',{workspaceId:d.session.bound.workspace,receiptNo:result.receiptNo});documentBox.append(downloadLink('وصل الإيجار الرسمي',receiptPdf,'rent-receipt-'+result.receiptNo+'.pdf'));}catch(error){documentErrors.push('وصل الإيجار');documentBox.append(node('p','وصل الإيجار محفوظ ومربوط بالحركة، لكن لم يتأكد تصدير PDF في هذه الجلسة.'));}}
   else documentBox.append(node('p','لا يوجد وصل إيجار لأن مبلغ الإيجار عند الإبرام صفر؛ لم يُنشأ أي وصل أو دفعة وهمية.'));
   d.status.textContent=documentErrors.length?'تم الإبرام، وبقي التحقق المستضاف من: '+documentErrors.join(' و '):'تم الإبرام وتأكد إصدار المستندات الرسمية.';
   const done=node('button','العودة إلى العقد');done.type='button';done.onclick=()=>{d.close();if(typeof onDone==='function')onDone(result.contract);};d.body.append(done);
  });};
 }
 d.run(start);return true;
}
