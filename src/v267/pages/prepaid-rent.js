import {createDialog,node,field} from '../components/dialog.js';
import {executionMethods} from '../domain/contract-execution.js';
import {paymentCycleMonths,paymentCycleLabel} from '../domain/payment-cycle.js';
import {allocatePrepaidAmount,prepaidReceiptArtifacts,prepaidBatchManifest} from '../domain/prepaid-rent.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const input=(type='text',value='')=>{const x=node('input');x.type=type;x.value=value??'';return x;};
const select=(rows,value='')=>{const x=node('select');for(const [v,label]of rows){const o=node('option',label);o.value=String(v);x.append(o);}x.value=String(value??'');return x;};
const money=value=>Number(value||0).toFixed(3)+' د.ك';

export function openPrepaidRent(contractId){
 const d=createDialog('دفعة إيجار مقدمة — توزيع على عدة أشهر');if(!d)return false;
 const api=window.AQARI_RENTAL_RECORDS;if(!api)throw Error('تعذر تحميل محرك الإيجارات.');
 const scope=()=>({userId:d.session.bound.user,workspaceId:d.session.bound.workspace});
 const rpc=(name,args)=>d.session.request(d.session.client.rpc(name,args));
 let cloud,state,contract,profile,lease,schedule,installments,pending=null;
 async function load(){
  cloud=await window.AQARI_SUPABASE.loadAppState(scope());d.session.check();state=api.primary(cloud.payload);contract=(state.contractsV202||[]).find(x=>String(x.id)===String(contractId));
  if(!contract||contract.status!=='signed')throw Error('الدفع المقدم متاح للعقد الموقّع فقط.');profile=(state.tenantProfilesV267||[]).find(x=>x.id===contract.tenantId);if(!profile)throw Error('ملف المستأجر غير موجود.');
  lease=await d.session.request(d.session.client.from('aqari_leases').select('id,external_ref,contract_no,status').eq('workspace_id',d.session.bound.workspace).eq('external_ref',String(contract.id)).single());d.session.check();
  if(!lease?.id||lease.status!=='signed'||lease.contract_no!==contract.contract_no)throw Error('تعذر تأكيد العقد الموقّع من السجل الخادمي.');
  schedule=await rpc('aqari_rent_due_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});installments=await rpc('aqari_rent_installment_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});d.session.check();
  if(!Array.isArray(schedule?.periods)||installments?.lease_id!==lease.id||!Array.isArray(installments?.periods))throw Error('تعذر تأكيد جداول الاستحقاق ودورة السداد.');
 }
 function eligible(){return schedule.periods.filter(x=>Number(x.balance)>0).sort((a,b)=>String(a.period).localeCompare(String(b.period)));}
 function render(){
  d.body.replaceChildren();const cycle=paymentCycleMonths(contract.paymentCycleMonths,{historical:true});
  d.body.append(node('p',`العقد ${contract.contract_no} · ${contract.tenant} · ${contract.property} / ${contract.unit}`),node('p','دورة السداد: '+paymentCycleLabel(cycle,{historical:true})+'. الاستحقاق الشهري يبقى المصدر المحاسبي، وهذه الشاشة توزع قبضًا واحدًا على الفترات المختارة دون تجاوز رصيد أي شهر.'));
  const installmentBox=node('section');installmentBox.append(node('h3','جدول الأقساط حسب دورة العقد'));for(const row of installments.periods)installmentBox.append(node('p',`قسط ${row.installmentNo}: ${row.coverageStart} → ${row.coverageEnd} · المستحق ${money(row.due_amount)} · المسدد/المخصص ${money(Number(row.paid_amount)+Number(row.credit_amount))} · الرصيد ${money(row.balance)}`));d.body.append(installmentBox);
  const periods=eligible();if(!periods.length){d.body.append(node('p','لا توجد فترات برصيد مستحق.'));return;}
  const form=node('form'),start=select(periods.map(x=>[x.period,`${x.period} · الرصيد ${money(x.balance)}`]),periods[0].period),count=input('number',Math.min(cycle,periods.length)),amount=input('text'),method=select(executionMethods,'knet'),tx=input('text'),paidAt=input('date',api.kuwaitDate()),preview=node('section'),submit=node('button','حفظ الدفعة وتوزيعها ذريًا');count.min='1';count.max=String(Math.min(24,periods.length));count.step='1';count.required=amount.required=method.required=tx.required=paidAt.required=true;amount.inputMode='decimal';tx.maxLength=150;submit.type='submit';
  function selectedPeriods(){const at=periods.findIndex(x=>x.period===start.value);return at<0?[]:periods.slice(at,at+Number(count.value||0));}
  function suggested(){const rows=selectedPeriods();amount.value=rows.reduce((s,x)=>s+Number(x.balance),0).toFixed(3);draw();}
  function draw(){preview.replaceChildren();try{const rows=allocatePrepaidAmount(selectedPeriods(),amount.value,{maxPeriods:Number(count.value)});preview.append(node('h3','معاينة التوزيع'));for(const r of rows)preview.append(node('p',`${r.period}: ${money(r.amount)} من رصيد ${money(r.balanceBefore)}`));preview.append(node('strong','إجمالي القبض: '+money(rows.reduce((s,x)=>s+x.amount,0)));}catch(error){preview.append(node('p',error.message));}}
  start.onchange=count.oninput=suggested;amount.oninput=draw;suggested();
  form.append(field('أول شهر للتغطية',start),field('أقصى عدد أشهر في هذه الدفعة',count),field('مبلغ القبض الفعلي',amount),field('طريقة الدفع',method),field('رقم العملية / مرجع السند',tx),field('تاريخ القبض',paidAt),preview,submit);d.body.append(form);
  form.onsubmit=e=>{e.preventDefault();d.run(async()=>{
   const total=api.amount(amount.value);if(total<=0)throw Error('أدخل مبلغ قبض موجبًا.');
   await load();const freshEligible=eligible(),startAt=freshEligible.findIndex(x=>x.period===start.value),freshSelected=startAt<0?[]:freshEligible.slice(startAt,startAt+Number(count.value));const planned=allocatePrepaidAmount(freshSelected,total,{maxPeriods:Number(count.value)});
   if(!pending||pending.total!==total||pending.start!==start.value||pending.count!==Number(count.value)||pending.method!==method.value||pending.tx!==tx.value.trim()||pending.paidAt!==paidAt.value){pending={id:crypto.randomUUID(),total,start:start.value,count:Number(count.value),method:method.value,tx:tx.value.trim(),paidAt:paidAt.value,allocations:planned.map(row=>({...row,operationRef:crypto.randomUUID()}))};}
   if(planned.length!==pending.allocations.length||planned.some((row,i)=>row.period!==pending.allocations[i].period||Math.round(row.amount*1000)!==Math.round(pending.allocations[i].amount*1000)))throw Error('تغير رصيد الاستحقاقات منذ المعاينة. حدّث الشاشة قبل إعادة الدفع.');
   const year=Number(api.kuwaitDate().slice(0,4));
   for(const a of pending.allocations){if(a.receiptNo)continue;const reserved=await rpc('aqari_reserve_rent_receipt_serial',{p_workspace_id:d.session.bound.workspace,p_contract_ref:String(contract.id),p_operation_ref:a.operationRef,p_year:year});d.session.check();if(!reserved?.receipt_no||!Number.isSafeInteger(Number(reserved.contract_sequence)))throw Error('تعذر حجز رقم وصل رسمي.');a.receiptNo=reserved.receipt_no;a.contractReceiptSequence=Number(reserved.contract_sequence);}
   const payload=clone(cloud.payload),data=api.primary(payload),records=[];
   for(const a of pending.allocations){const row=schedule.periods.find(x=>String(x.period)===String(a.period));if(!row)throw Error('فترة التوزيع لم تعد موجودة.');const artifacts=prepaidReceiptArtifacts({api,contract,profile,periodRow:row,allocation:a,receiptNo:a.receiptNo,contractReceiptSequence:a.contractReceiptSequence,paidAt:pending.paidAt,method:pending.method,transactionNo:pending.tx,batchId:pending.id});records.push({...a,...artifacts});}
   const manifest=prepaidBatchManifest({id:pending.id,contract,leaseId:lease.id,method:pending.method,transactionNo:pending.tx,paidAt:pending.paidAt,total:pending.total,allocations:pending.allocations.map(a=>({operationRef:a.operationRef,receiptNo:a.receiptNo,contractReceiptSequence:a.contractReceiptSequence,period:a.period,amount:a.amount}))});
   data.prepaidRentBatchesV267=[...(data.prepaidRentBatchesV267||[]),manifest];data.collections=[...(data.collections||[]),...records.map(x=>x.artifacts.record)];data.rentLedgerV202=[...(data.rentLedgerV202||[]),...records.map(x=>x.artifacts.ledger)];data.rentReceiptsV267=[...(data.rentReceiptsV267||[]),...records.map(x=>x.artifacts.receipt)];data.audit=[...(data.audit||[]),[d.session.bound.user,'دفعة إيجار مقدمة موزعة على عدة فترات',pending.id,new Date().toISOString()]];
   await window.AQARI_SUPABASE.saveAppState(payload,Number(cloud.revision),scope());d.session.check();
   const reread=await window.AQARI_SUPABASE.loadAppState(scope());d.session.check();const saved=api.primary(reread.payload);if(!(saved.prepaidRentBatchesV267||[]).some(x=>same(x,manifest)))throw Error('لم تتأكد إعادة قراءة سجل الدفعة المقدمة.');
   const verified=await rpc('aqari_rent_due_schedule',{p_workspace_id:d.session.bound.workspace,p_lease_id:lease.id});for(const a of pending.allocations){const before=schedule.periods.find(x=>x.period===a.period),after=verified.periods.find(x=>x.period===a.period);if(!after||Math.round(Number(after.balance)*1000)!==Math.round((Number(before.balance)-a.amount)*1000))throw Error('لم يتأكد تحديث رصيد '+a.period+' بعد الحفظ.');}
   pending=null;await load();render();d.status.textContent='تم حفظ الدفعة المقدمة ذريًا، وتوزيعها على الفترات، وإصدار أرقام الوصولات الرسمية وإعادة قراءة الأرصدة.';
  });};
 }
 d.run(async()=>{await load();render();});return true;
}
