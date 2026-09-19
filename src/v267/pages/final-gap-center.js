import {message as visibleMessage} from '../components/locale.js';
import {t as translateStatic} from '../components/locale.js';
import {createDialog,node,field} from '../components/dialog.js';
import {createFinancialRecordBrowser} from '../components/financial-record-browser.js';
import {createCollectionAccountManager} from '../components/collection-account-manager.js';

const option=(value,text)=>Object.assign(node('option',text),{value});
const actions={preference:'تفضيل تواصل المستأجر',account:'حساب بنك أو صندوق للعقار',post_payment:'ترحيل التحصيل للحساب',reserve:'حجز أو فك احتياطي',tenant_entry:'حركة ذمة مستأجر / رصيد افتتاحي',allocate_credit:'تخصيص رصيد دائن',cancel_receipt:'إلغاء وصل موثق',channel:'قناة تواصل للعقار',rate:'تقييم ونجوم سنوية'};
const labels={tenant_id:'المستأجر',property_id:'العقار',lease_id:'العقد',preferred_channel:'وسيلة التواصل',kind:'النوع',name:'اسم الحساب',masked_reference:'مرجع الحساب المحجوب',payment_id:'وصل الإيجار',account_id:'الحساب أو الصندوق',reason:'السبب',direction:'اتجاه الحركة',amount:'المبلغ بالدينار',occurred_on:'تاريخ الحركة',credit_entry_id:'الرصيد الدائن',period:'شهر الاستحقاق',public_url:'رابط التواصل',management_reference:'مرجع الإدارة دون كلمات مرور',tenant_visible:'يظهر للمستأجر',year:'سنة التقييم'};
const forms={preference:['tenant_id','preferred_channel'],account:['property_id','kind','name','masked_reference'],post_payment:['payment_id','account_id','reason'],reserve:['property_id','direction','amount','reason'],tenant_entry:['tenant_id','lease_id','direction','kind','amount','occurred_on','reason'],allocate_credit:['credit_entry_id','lease_id','period','amount','reason'],cancel_receipt:['payment_id','reason'],channel:['property_id','kind','public_url','management_reference','tenant_visible'],rate:['tenant_id','year']};
const numeric=new Set(['amount','year']);

export function openFinalGapCenter(){
 const d=createDialog(translateStatic('السجلات المالية وتواصل المستأجر'));if(!d)return;
 let data=null,pending=false,draftId=crypto.randomUUID(),controls={};
 const action=node('select'),form=node('form'),fields=node('section'),result=node('section'),saveButton=Object.assign(node('button',translateStatic('حفظ والتحقق')),{type:'submit'});
 for(const [value,text]of Object.entries(actions))action.append(option(value,translateStatic(text)));action.value='preference';
 const archive=createFinancialRecordBrowser(),accountManager=createCollectionAccountManager(d,{onChanged:async()=>{await load();}}),refresh=Object.assign(node('button',translateStatic('تحديث السجلات المحفوظة')),{type:'button'});
 form.append(field(translateStatic('العملية'),action),fields,saveButton);d.body.append(node('p',translateStatic('اختر السجلات المحفوظة وأدخل تفاصيل العملية. يحتفظ النظام بالسجل المالي وتاريخ التعديلات.')),form,refresh,result,archive.el,accountManager.el);
 const rpc=(a,p={})=>d.session.request(d.session.client.rpc('aqari_final_gap_register',{p_workspace_id:d.session.bound.workspace,p_action:a,p_data:p}));
 const openingRpc=()=>d.session.request(d.session.client.rpc('aqari_opening_balance_statement',{p_workspace_id:d.session.bound.workspace,p_tenant_id:null}));
 const rows=name=>data?.[name]||[];
 function choices(key){
  if(key==='tenant_id')return rows('tenants').map(x=>[x.id,x.name]);
  if(key==='property_id')return rows('properties').map(x=>[x.id,x.name]);
  if(key==='lease_id'){
   const tenant=action.value==='allocate_credit'?rows('ledger').find(x=>x.id===controls.credit_entry_id?.value)?.tenant_id:controls.tenant_id?.value;
   const leases=rows('leases').filter(x=>tenant&&x.tenant_id===tenant).map(x=>[x.id,x.contract_no]);
   return action.value==='tenant_entry'?[['',translateStatic('رصيد المستأجر العام دون عقد محدد')],...leases]:leases;
  }
  if(key==='credit_entry_id')return rows('ledger').filter(x=>x.direction==='credit').map(x=>[x.id,visibleMessage("{p0} — {p1} د.ك — {p2}",{p0:(rows('tenants').find(t=>t.id===x.tenant_id)?.name||translateStatic('مستأجر')),p1:(x.amount),p2:(x.reason)})]);
  if(key==='payment_id')return rows('payments').map(x=>[x.id,visibleMessage("{p0} — {p1} د.ك",{p0:(x.reference),p1:(x.amount)})]);
  if(key==='account_id')return rows('accounts').filter(x=>x.status==='active').map(x=>[x.id,`${x.name} — ${x.masked_reference}`]);
  if(key==='preferred_channel')return [['email',translateStatic('البريد الإلكتروني')],['whatsapp',translateStatic('واتساب')],['both',translateStatic('واتساب والبريد الإلكتروني')],['sms',translateStatic('رسالة نصية')],['push',translateStatic('إشعار التطبيق')],['phone',translateStatic('اتصال هاتفي فقط')],['none',translateStatic('عدم إرسال رسائل')]];
  if(key==='direction')return action.value==='reserve'?[['hold',translateStatic('حجز احتياطي')],['release',translateStatic('فك احتياطي')]]:[['credit',translateStatic('رصيد دائن')],['debit',translateStatic('رصيد مدين')]];
  if(key==='kind')return action.value==='account'?[['bank',translateStatic('حساب بنكي')],['cashbox',translateStatic('صندوق نقدي')]]:action.value==='channel'?[['whatsapp',translateStatic('واتساب')],['instagram',translateStatic('إنستغرام')],['facebook',translateStatic('فيسبوك')],['website',translateStatic('موقع إلكتروني')]]:[controls.direction?.value==='debit'?['opening_debit',translateStatic('رصيد افتتاحي مدين')]:['opening_credit',translateStatic('رصيد افتتاحي دائن')],['adjustment',translateStatic('تسوية موثقة')]];
  return null;
 }
 function populate(key,control){const previous=key==='preferred_channel'?rows('preferences').find(x=>x.tenant_id===controls.tenant_id?.value)?.preferred_channel:control.value,values=choices(key)||[];control.replaceChildren(...values.map(([v,t])=>option(v,t)));control.value=values.some(([v])=>v===previous)?previous:values[0]?.[0]||'';}
 function build(){
  fields.replaceChildren();controls={};
  for(const key of forms[action.value]){
   const values=choices(key),control=values?node('select'):Object.assign(node('input'),{type:key==='tenant_visible'?'checkbox':key==='period'?'month':key==='occurred_on'?'date':key==='public_url'?'url':numeric.has(key)?'number':'text'});
   controls[key]=control;control.required=!['tenant_visible','management_reference'].includes(key)&&!(key==='lease_id'&&action.value==='tenant_entry');
   if(values)populate(key,control);
   if(key==='amount'){control.min='0.001';control.step='0.001';}
   if(key==='year'){control.min='2000';control.max=String(new Date().getFullYear());control.value=control.max;}
   if(['tenant_id','credit_entry_id'].includes(key))control.onchange=()=>{if(controls.lease_id)populate('lease_id',controls.lease_id);if(controls.preferred_channel)populate('preferred_channel',controls.preferred_channel);};
   if(key==='direction'&&action.value==='tenant_entry')control.onchange=()=>populate('kind',controls.kind);
   fields.append(field(translateStatic(labels[key]),control));
  }
 }
 async function load(){
  const x=await rpc('list');
  for(const key of ['tenants','properties','leases','payments','preferences','accounts','reserves','ledger','postings','credit_allocations','cancellations','channels','ratings','collector_performance'])if(!Array.isArray(x?.[key]))throw Error('تعذر استرجاع السجلات المالية كاملة.');
  if(x.accounts.some(a=>Number.isInteger(a.revision))){const history=await d.session.request(d.session.client.rpc('aqari_collection_account_manage',{p_workspace_id:d.session.bound.workspace,p_action:'list',p_data:{}}));if(!Array.isArray(history?.posting_accounts))throw Error('تعذر استرجاع بيانات حسابات الترحيل المحفوظة.');x.posting_accounts=history.posting_accounts;}
  let opening=null;
  try{const report=await openingRpc();if(Array.isArray(report?.opening_entries)&&['opening_debit','opening_credit','opening_net','actual_collections'].every(k=>['string','number'].includes(typeof report?.totals?.[k])&&String(report.totals[k]).trim()!==''&&Number.isFinite(Number(report.totals[k]))))opening=report;}catch{opening=null;}
  data={...x,opening};render();archive.update(data);accountManager.update(data);
 }
 function confirmed(a,p){
  if(a==='preference')return rows('preferences').some(x=>x.tenant_id===p.tenant_id&&x.preferred_channel===p.preferred_channel);
  if(a==='rate')return rows('ratings').some(x=>x.tenant_id===p.tenant_id&&Number(x.rating_year)===p.year);
  const collection={account:'accounts',post_payment:'postings',reserve:'reserves',tenant_entry:'ledger',allocate_credit:'credit_allocations',cancel_receipt:'cancellations',channel:'channels'}[a];
  const saved=rows(collection).find(x=>x.id===p.id);if(!saved)return false;
  const expectedKeys={account:['property_id','kind','name','masked_reference'],post_payment:['payment_id','account_id'],reserve:['property_id','direction','amount','reason'],tenant_entry:['tenant_id','lease_id','direction','kind','amount','occurred_on','reason','source_type','source_id'],allocate_credit:['credit_entry_id','lease_id','period','amount'],cancel_receipt:['payment_id','reason'],channel:['property_id','kind','public_url','management_reference','tenant_visible']}[a];
  return expectedKeys.every(k=>Object.hasOwn(saved,k)&&(numeric.has(k)?Number(saved[k])===Number(p[k]):k==='lease_id'&&!p[k]?saved[k]===null:saved[k]===p[k]));
 }
 async function save(a,p){if(pending)return;pending=true;try{await rpc(a,p);await load();if(!confirmed(a,p))throw Error('تعذر تأكيد العملية المحفوظة؛ حدّث السجلات قبل إعادة المحاولة.');d.status.textContent=translateStatic('تم الحفظ وإعادة القراءة من قاعدة البيانات.');draftId=crypto.randomUUID();build();}finally{pending=false;}}
 action.onchange=()=>{draftId=crypto.randomUUID();build();};
 form.onsubmit=e=>{e.preventDefault();return d.run(async()=>{
  if(!data)throw Error('انتظر استرجاع السجلات المحفوظة قبل الحفظ.');
  const p={};for(const [key,control]of Object.entries(controls))p[key]=control.type==='checkbox'?control.checked:numeric.has(key)?Number(control.value):control.value.trim();
  if('amount'in p&&(!Number.isFinite(p.amount)||p.amount<=0))throw Error('أدخل مبلغاً موجباً صحيحاً.');
  if(p.period)p.period+='-01';
  if(!['preference','rate'].includes(action.value))p.id=draftId;
  if(action.value==='tenant_entry'){p.source_type='manual';p.source_id=draftId;}
  await save(action.value,p);
 });};
 function render(){
  const o=data.opening?.totals;
  result.replaceChildren(node('h3',translateStatic('السجلات المحفوظة')),node('p',visibleMessage("الحسابات: {p0} • حركات الذمم: {p1} • تخصيصات الرصيد: {p2}",{p0:(data.accounts.length),p1:(data.ledger.length),p2:(data.credit_allocations.length)})),node('h4',translateStatic('الأرصدة الافتتاحية منفصلة عن التحصيل')));
  result.append(node('p',o?visibleMessage("افتتاحي مدين: {p0} د.ك • افتتاحي دائن: {p1} د.ك • صافي الافتتاح: {p2} د.ك • التحصيل الفعلي — جميع الفترات: {p3} د.ك",{p0:(Number(o.opening_debit).toFixed(3)),p1:(Number(o.opening_credit).toFixed(3)),p2:(Number(o.opening_net).toFixed(3)),p3:(Number(o.actual_collections).toFixed(3))}):translateStatic('تعذر استرجاع فصل الأرصدة الافتتاحية؛ لا تعتمد على إجمالي قبل تحديث السجلات.')));
  result.append(node('h4',translateStatic('أداء المحصلين — جميع الفترات')));for(const x of data.collector_performance)result.append(node('p',visibleMessage("{p0}: {p1} عملية — {p2} د.ك",{p0:(x.collector),p1:(x.operations),p2:(Number(x.amount).toFixed(3))})));
 }
 refresh.onclick=()=>d.run(async()=>{await load();d.status.textContent=translateStatic('تم تحديث السجلات من قاعدة البيانات.');});
 build();d.onDispose(()=>{data=null;controls={};fields.replaceChildren();result.replaceChildren();archive.clear();accountManager.clear();});d.run(async()=>{await load();build();});
}

