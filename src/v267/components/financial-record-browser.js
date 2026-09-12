import {node,field} from './dialog.js';

export const FINANCIAL_RECORD_TYPES={accounts:'الحسابات والصناديق',ledger:'ذمم المستأجرين',postings:'ترحيل الوصولات',reserves:'الاحتياطي',credit_allocations:'تخصيص الرصيد',cancellations:'الوصولات الملغاة'};
const words={bank:'حساب بنكي',cashbox:'صندوق نقدي',active:'نشط',inactive:'غير نشط',archived:'مؤرشف',debit:'مدين',credit:'دائن',hold:'حجز',release:'فك حجز',opening_debit:'افتتاحي مدين',opening_credit:'افتتاحي دائن',adjustment:'تسوية موثقة',manual:'إدخال موثق',commercial_sales:'استحقاق مبيعات تجارية',commercial_sales_reversal:'عكس استحقاق مبيعات'};
const label=x=>words[x]||x||'غير مدون';
const money=x=>x===null||x===undefined?'غير مدون':Number.isFinite(Number(x))?Number(x).toFixed(3)+' د.ك':'قيمة غير صالحة';
const day=x=>/^\d{4}-\d{2}-\d{2}/.test(String(x||''))?String(x).slice(0,10):'';
const normalize=x=>String(x||'').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').toLocaleLowerCase();

// Only explicit business fields are displayed. Auth IDs and arbitrary metadata
// returned alongside these records never become part of the rendered archive.
export function financialRecordRows(data){
 const rows=key=>Array.isArray(data?.[key])?data[key]:[];
 const named=(key,id,field='name')=>rows(key).find(x=>x.id===id)?.[field]||'غير مدون';
 const tenant=id=>named('tenants',id),lease=id=>id?named('leases',id,'contract_no'):'رصيد عام دون عقد محدد';
 return Object.keys(FINANCIAL_RECORD_TYPES).flatMap(type=>rows(type).map(x=>{
  let title='',details=[],date=day(x.occurred_on||x.posted_at||x.cancelled_at||x.period||x.created_at);
  if(type==='accounts'){title=x.name;details=[['العقار',named('properties',x.property_id)],['نوع الحساب',label(x.kind)],['مرجع الحساب المحجوب',x.masked_reference],['الحالة',label(x.status)]];}
  if(type==='ledger'){title=tenant(x.tenant_id);details=[['المستأجر',title],['العقد',lease(x.lease_id)],['الاتجاه',label(x.direction)],['نوع الحركة',label(x.kind)],['المبلغ',money(x.amount)],['السبب',x.reason],['نوع المصدر',label(x.source_type)],['مرجع المصدر',x.source_id]];}
  if(type==='postings'){const saved=rows('posting_accounts').find(a=>a.posting_id===x.id);title=named('payments',x.payment_id,'reference');details=[['مرجع الوصل',title],[saved?.captured_on_post?'الحساب وقت الترحيل':'الحساب المرتبط',saved?.snapshot?.name||named('accounts',x.account_id)],['مرجع الحساب المحجوب',saved?.snapshot?.masked_reference||named('accounts',x.account_id,'masked_reference')],['المبلغ المرحّل',money(x.amount)]];}
  if(type==='reserves'){title=named('properties',x.property_id);details=[['العقار',title],['الحركة',label(x.direction)],['المبلغ',money(x.amount)],['السبب',x.reason]];}
  if(type==='credit_allocations'){const credit=rows('ledger').find(c=>c.id===x.credit_entry_id);title=lease(x.lease_id);details=[['العقد',title],['المستأجر',tenant(credit?.tenant_id)],['المبلغ المخصص',money(x.amount)],['شهر الاستحقاق',day(x.period)],['مرجع الرصيد',x.credit_entry_id]];}
  if(type==='cancellations'){title=named('payments',x.payment_id,'reference');if(title==='غير مدون')title=x.snapshot?.reference||'وصل ملغى';details=[['مرجع الوصل',title],['السبب',x.reason],['اعتمد الإلغاء',x.approved_by_name],['معرّف الوصل',x.payment_id]];}
  details=[['مرجع الحركة',x.id],['التاريخ',date||'غير مدون'],...details].map(([k,v])=>[k,String(v??'غير مدون')]);
  return {id:x.id,type,title:String(title||FINANCIAL_RECORD_TYPES[type]),date,details,search:normalize(title+' '+details.map(([k,v])=>k+' '+v).join(' '))};
 })).sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)));
}

export function filterFinancialRecords(rows,{type='',query='',from='',to=''}={}){
 const needle=normalize(query.trim());
 if(from&&to&&from>to)return [];
 return rows.filter(x=>(!type||x.type===type)&&(!needle||x.search.includes(needle))&&(!from||(x.date&&x.date>=from))&&(!to||(x.date&&x.date<=to)));
}

export function createFinancialRecordBrowser(){
 const el=node('section'),filters=node('section'),type=node('select'),query=node('input'),from=node('input'),to=node('input'),summary=node('p'),list=node('section'),previous=node('button','السابق'),next=node('button','التالي');
 let records=[],page=0;
 const option=(value,text)=>Object.assign(node('option',text),{value});
 type.append(option('','كل أنواع السجلات'),...Object.entries(FINANCIAL_RECORD_TYPES).map(([k,v])=>option(k,v)));type.value='';query.type='search';query.maxLength=120;from.type=to.type='date';previous.type=next.type='button';summary.setAttribute('aria-live','polite');
 filters.className='aq267-record-filters';list.className='aq267-record-list';
 filters.append(field('نوع السجل المحفوظ',type),field('بحث بالاسم أو العقد أو مرجع الحركة',query),field('من تاريخ الحركة أو الاستحقاق',from),field('إلى تاريخ الحركة أو الاستحقاق',to));
 el.append(node('h3','استعراض السجلات المحفوظة'),filters,summary,list,previous,next);
 function render(){
  const found=filterFinancialRecords(records,{type:type.value,query:query.value,from:from.value,to:to.value});
  page=Math.max(0,Math.min(page,Math.ceil(found.length/20)-1));list.replaceChildren();
  summary.textContent=from.value&&to.value&&from.value>to.value?'تاريخ البداية يجب أن يسبق تاريخ النهاية.':found.length?`${found.length} سجل — الصفحة ${page+1} من ${Math.ceil(found.length/20)}`:'لا توجد سجلات مطابقة. السجلات دون تاريخ لا تظهر عند تحديد فترة.';
  for(const row of found.slice(page*20,page*20+20)){
   const card=node('details'),head=node('summary',`${FINANCIAL_RECORD_TYPES[row.type]} — ${row.title}${row.date?' — '+row.date:''}`),dl=node('dl');
   for(const [key,value]of row.details)dl.append(node('dt',key),node('dd',value));card.append(head,dl);list.append(card);
  }
  previous.disabled=page===0;next.disabled=(page+1)*20>=found.length;
 }
 for(const c of [type,from,to])c.onchange=()=>{page=0;render();};query.oninput=()=>{page=0;render();};
 previous.onclick=()=>{if(page>0){page--;render();}};next.onclick=()=>{page++;render();};
 return {el,update(data){records=financialRecordRows(data);render();},clear(){records=[];page=0;query.value=from.value=to.value='';list.replaceChildren();summary.textContent='';}};
}
