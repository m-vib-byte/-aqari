// Visual fixture only. Production components, explicit in-memory transport.
// Never calls createSession/createDialog, auth, fetch, Storage or a real RPC client.
import {createFinancialRecordBrowser} from '/src/v267/components/financial-record-browser.js';
import {createCollectionAccountManager} from '/src/v267/components/collection-account-manager.js';

const copy=value=>structuredClone(value);
const workspace='fixture-workspace',actor='fixture-manager';
const data={
 properties:[{id:'fixture-property-a',name:'عقار الاختبار أ'},{id:'fixture-property-b',name:'عقار الاختبار ب'}],
 tenants:[{id:'fixture-tenant-a',name:'مستأجر اصطناعي أ'},{id:'fixture-tenant-b',name:'مستأجر اصطناعي ب'}],
 leases:[{id:'fixture-lease-a',contract_no:'TEST-LEASE-A',tenant_id:'fixture-tenant-a'},{id:'fixture-lease-b',contract_no:'TEST-LEASE-B',tenant_id:'fixture-tenant-b'}],
 accounts:[
  {id:'fixture-bank-a',property_id:'fixture-property-a',kind:'bank',name:'حساب البنك — اختبار أ',masked_reference:'****1234',currency:'KWD',status:'active',revision:1,created_at:'2026-09-01'},
  {id:'fixture-cash-a',property_id:'fixture-property-a',kind:'cashbox',name:'الصندوق النقدي — اختبار أ',masked_reference:'CASH-1',currency:'KWD',status:'active',revision:1,created_at:'2026-09-01'},
  {id:'fixture-bank-b',property_id:'fixture-property-b',kind:'bank',name:'حساب سابق — اختبار ب',masked_reference:'****4567',currency:'KWD',status:'archived',revision:2,created_at:'2026-08-01'}
 ],
 payments:[{id:'fixture-payment-a',reference:'TEST-RECEIPT-001',amount:'125.125'},{id:'fixture-payment-b',reference:'TEST-RECEIPT-002',amount:'75.000'}],
 postings:[{id:'fixture-posting-a',payment_id:'fixture-payment-a',account_id:'fixture-bank-a',amount:'125.125',posted_at:'2026-09-10'},{id:'fixture-posting-b',payment_id:'fixture-payment-b',account_id:'fixture-cash-a',amount:'75.000',posted_at:'2026-09-11'}],
 posting_accounts:[{posting_id:'fixture-posting-a',captured_on_post:true,snapshot:{name:'حساب البنك — اختبار أ',masked_reference:'****1234'}},{posting_id:'fixture-posting-b',captured_on_post:true,snapshot:{name:'الصندوق النقدي — اختبار أ',masked_reference:'CASH-1'}}],
 ledger:Array.from({length:22},(_,index)=>({id:'fixture-entry-'+String(index+1).padStart(2,'0'),tenant_id:index%2?'fixture-tenant-b':'fixture-tenant-a',lease_id:index%2?'fixture-lease-b':'fixture-lease-a',direction:index%3?'debit':'credit',kind:'adjustment',amount:((index+1)*2.125).toFixed(3),occurred_on:'2026-09-'+String(1+index).padStart(2,'0'),reason:'حركة اصطناعية لاختبار البحث وعرض السجلات '+(index+1),source_type:'manual',source_id:'TEST-SOURCE-'+(index+1)})),
 reserves:[{id:'fixture-reserve-a',property_id:'fixture-property-a',direction:'hold',amount:'15.250',reason:'احتياطي اصطناعي للعرض',created_at:'2026-09-09'}],
 credit_allocations:[{id:'fixture-credit-a',credit_entry_id:'fixture-entry-01',lease_id:'fixture-lease-a',amount:'1.125',period:'2026-09-01'}],
 cancellations:[{id:'fixture-cancel-a',payment_id:'fixture-cancelled-payment',reason:'إلغاء اصطناعي لاختبار عرض التاريخ',approved_by_name:'مدير الاختبار',cancelled_at:'2026-09-08',snapshot:{reference:'TEST-CANCELLED-003'}}]
};
const events=[];
const status=document.querySelector('#fixture-status'),log=document.querySelector('#fixture-operation-log'),accountsRoot=document.querySelector('#fixture-accounts');
let lostNext=false,failRead=false,runBusy=false,writes=0,reads=0,manager;
function activity(note){log.textContent=`كتابات اصطناعية: ${writes} • قراءات مستقلة: ${reads} • ${note}`;}
function failure(message,code){return Object.assign(Error(message),{code});}
async function fixtureRpc(name,{p_workspace_id:w,p_action:action,p_data:request={}}){
 if(name!=='aqari_collection_account_manage'||w!==workspace)throw Error('مسار خارج نطاق النموذج الاصطناعي.');
 const row=data.accounts.find(account=>account.id===request.id);
 if(action==='read'){
  reads++;activity('طلب إعادة قراءة من ذاكرة النموذج');
  if(failRead)throw Error('تعذر قراءة اصطناعي للاختبار.');
  if(!row)throw failure('ACCESS_DENIED','42501');
  return copy({account:row,events:events.filter(event=>event.account_id===row.id&&(!request.operation_id||event.operation_id===request.operation_id)).slice(-25).reverse()});
 }
 if(!['edit','archive'].includes(action)||!row)throw failure('ACCESS_DENIED','42501');
 const normalized={...copy(request),action},replayed=events.find(event=>event.operation_id===request.operation_id);
 if(replayed){if(JSON.stringify(replayed.request)!==JSON.stringify(normalized))throw failure('ACCOUNT_OPERATION_CONFLICT','23505');return copy({account:row,operation_id:request.operation_id,replayed:true});}
 if(request.revision!==row.revision)throw failure('REVISION_CONFLICT','40001');
 if(row.status!=='active')throw failure('ACCOUNT_ARCHIVED','23514');
 if(!request.operation_id||String(request.reason||'').trim().length<3)throw failure('ACCOUNT_REVISION_AND_REASON_REQUIRED','23514');
 if(action==='edit'&&(String(request.name||'').length<2||(String(request.masked_reference||'').match(/[0-9٠-٩۰-۹]/g)||[]).length>4))throw failure('ACCOUNT_NAME_OR_MASKED_REFERENCE_REQUIRED','23514');
 if(action==='edit'&&row.name===request.name&&row.masked_reference===request.masked_reference)throw failure('ACCOUNT_UNCHANGED','23514');
 const before=copy(row);if(action==='archive')row.status='archived';else {row.name=request.name;row.masked_reference=request.masked_reference;}
 row.revision++;row.updated_at=new Date().toISOString();row.updated_by=actor;writes++;
 events.push({operation_id:request.operation_id,account_id:row.id,action,request:normalized,actor_id:actor,actor_name:'مدير الاختبار الاصطناعي',reason:request.reason,before_value:before,after_value:copy(row),recorded_at:row.updated_at});
 activity('حفظ داخل ذاكرة الصفحة فقط؛ لم تُعدل الوصولات الاصطناعية');
 if(lostNext){lostNext=false;syncScenarioButtons();throw Error('فقد رد اصطناعي بعد حفظ العملية.');}
 return copy({account:row,operation_id:request.operation_id,replayed:false});
}
// Match the shared dialog's busy/disabled restoration behavior while keeping the
// real session factory completely out of this visual, unauthenticated fixture.
const dialog={body:accountsRoot,status,session:{bound:{workspace,user:actor},request:async response=>response,client:{rpc:fixtureRpc}},async run(task){
 if(runBusy)return;runBusy=true;accountsRoot.setAttribute('aria-busy','true');
 const controls=[...accountsRoot.querySelectorAll('button,input,select,textarea')],disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
 try{await task();}catch(error){status.textContent='فحص اصطناعي: '+error.message;}finally{runBusy=false;accountsRoot.setAttribute('aria-busy','false');controls.forEach((control,index)=>{if(control.isConnected)control.disabled=disabled[index];});}
}};
const archive=createFinancialRecordBrowser();document.querySelector('#fixture-records').append(archive.el);
manager=createCollectionAccountManager(dialog,{onChanged:async({account})=>{archive.update(copy(data));status.textContent=`تم حفظ حساب الاختبار وإعادة قراءته مستقلًا — المراجعة ${account.revision}. الحفظ داخل ذاكرة الصفحة فقط.`;}});
accountsRoot.append(manager.el);
function reload(){archive.update(copy(data));manager.update(copy(data));status.textContent='تمت إعادة قراءة البيانات الاصطناعية من ذاكرة الصفحة؛ لم يحدث اتصال بقاعدة بيانات.';}
function selectTab(key){for(const name of ['records','accounts']){const selected=name===key,button=document.querySelector('#fixture-tab-'+name);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;document.querySelector('#fixture-panel-'+name).hidden=!selected;}}
for(const key of ['records','accounts']){
 const button=document.querySelector('#fixture-tab-'+key);button.onclick=()=>selectTab(key);
 button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'records':event.key==='End'?'accounts':key==='records'?'accounts':'records';selectTab(next);document.querySelector('#fixture-tab-'+next).focus();};
}
function syncScenarioButtons(){const lost=document.querySelector('#fixture-lost'),read=document.querySelector('#fixture-read-fail');lost.textContent='فقد رد الحفظ التالي: '+(lostNext?'مفعّل':'متوقف');lost.setAttribute('aria-pressed',String(lostNext));read.textContent='تعذر القراءة: '+(failRead?'مفعّل':'متوقف');read.setAttribute('aria-pressed',String(failRead));}
document.querySelector('#fixture-lost').onclick=()=>{lostNext=!lostNext;syncScenarioButtons();};
document.querySelector('#fixture-read-fail').onclick=()=>{failRead=!failRead;syncScenarioButtons();};
document.querySelector('#fixture-reload').onclick=reload;
window.addEventListener('pagehide',()=>{archive.clear();manager.clear();},{once:true});
reload();status.textContent='واجهة الاختبار جاهزة — السجل وإدارة الحسابات يعملان على بيانات اصطناعية فقط.';
