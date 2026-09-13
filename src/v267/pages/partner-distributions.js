import {createDialog,node,field} from '../components/dialog.js';

const option=(value,label)=>{const el=node('option',label);el.value=value;return el;};
const input=(type='text')=>{const el=node('input');el.type=type;return el;};
const previousMonth=()=>{const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,7);};
// Format server fils, or encode the manager's explicit reconciliation amount.
// Distribution amounts and shares are never calculated by this page.
export function partnerFils(value){
 const s=String(value).trim().replace(/[٠-٩]/g,n=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(n))).replace(/٫/g,'.');
 if(!/^-?\d{1,12}(?:\.\d{1,3})?$/.test(s))throw Error('أدخل مبلغ المطابقة بالدينار حتى ثلاثة منازل عشرية؛ أدخل صفرًا صراحة عند عدم وجود مبلغ.');
 const negative=s.startsWith('-'),[whole,fraction='']=s.replace(/^-/,'').split('.');
 return ((BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0')))*(negative?-1n:1n)).toString();
}
export function partnerMoney(fils){
 if(!/^-?\d+$/.test(String(fils)))throw Error('تعذر التحقق من مبلغ السجل.');
 const n=BigInt(fils),a=n<0n?-n:n;return (n<0n?'-':'')+(a/1000n)+'.'+String(a%1000n).padStart(3,'0')+' د.ك';
}
const canonical=value=>JSON.stringify(value&&typeof value==='object'?(Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]))):value);
const messages={
 PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED:'يتضمن وصل في هذا العقار تخصيصًا تجاريًا. يحتاج مصدره مطابقة منفصلة؛ لم يحتسب كتوزيع إيجاري.',
 PARTNER_PERIOD_ALREADY_DISTRIBUTED:'سبق توزيع العقار في هذا الشهر؛ لا يمكن تكراره حتى بعد عكسه.',
 PARTNER_ALREADY_REVERSED:'سبق عكس هذا التوزيع؛ أعد قراءة السجل.',
 PARTNER_SOURCE_REVIEW_REQUIRED:'هذا الشهر يحتاج إقفالًا مفصلًا ومطابقًا من السجل المالي. الإقفال القديم أو غير المتطابق لا يسمح بالتوزيع.',
 PARTNER_SHARES_REVIEW_REQUIRED:'فعّل سجل الحصص وحدد حصصًا موثقة مجموعها 100% أولًا.',
 PARTNER_LEGACY_FINANCE_REVIEW_REQUIRED:'لهذا العقار توزيعات أو مدفوعات قديمة تحتاج مطابقة منفصلة قبل استخدام الدفتر الجديد.',
 PARTNER_REVIEW_STALE:'تغيرت المراجعة أو الحصص؛ أعد عرض المصدر وراجع القيم قبل الاعتماد.',
 PARTNER_SHARES_CHANGED_AFTER_REVIEW:'تغيرت الحصص بعد المراجعة. اعتمد مراجعة جديدة موثقة قبل التوزيع.',
 PARTNER_EXPLICIT_RECONCILIATION_REQUIRED:'مبالغ المطابقة المدخلة لا تطابق المصدر. راجع المستند وأدخل المقبوض والمصروف والاحتياطي، بما فيها الصفر.',
 PARTNER_DOCUMENT_UNVERIFIED:'اختر مستند مطابقة مرفوعًا ومتحققًا منه للعقار نفسه.',
 PARTNER_RECIPIENT_ACCESS_REQUIRED:'أحد حسابات الشركاء غير فعال أو غير مؤكد لهذا العقار؛ راجع صلاحياته.',
 PARTNER_PROPERTY_SHARES_BINDING_CONFLICT:'سجل الحصص مرتبط بعقار آخر؛ راجع ربط الحصص.',
 PARTNER_DISTRIBUTED_SOURCE_IMMUTABLE:'سبق توزيع هذا المصدر. تبقى مراجعته ثابتة، والتصحيح بعكس مستقل.',
 PARTNER_RETRY_CONFLICT:'معرف المحاولة مرتبط ببيانات مختلفة. أعد التحقق من العملية السابقة.'
};

export function mountPartnerDistributions(d,container){
 let state=null,preview=null,pending=null,disposed=false;
 const month=input('month'),loadButton=node('button','عرض دفتر الشهر'),retry=node('button','إعادة محاولة الحفظ والتحقق'),content=node('div');
 month.value=previousMonth();loadButton.type=retry.type='button';retry.hidden=true;
 container.append(node('p','استحقاقات من المقبوض الإيجاري المؤكد، والمصروف المعتمد، وحركة الاحتياطي فقط. لا يشمل هذا المصدر التحصيل التجاري أو الافتتاح أو الودائع، ولا ينفذ تحويل أموال.'),field('شهر المصدر المقفل',month),loadButton,retry,content);
 const call=async(action,data)=>{d.session.check();const response=await d.session.request(d.session.client.rpc('aqari_partner_distribution_register',{p_workspace_id:d.session.bound.workspace,p_action:action,p_data:data}));d.session.check();return response;};
 const execute=task=>d.run(task).then(()=>{if(!disposed){month.disabled=loadButton.disabled=!!pending;retry.hidden=!pending;}});
 async function read(period){
  const value=await call('list',{month:period});
  if(value?.workspace_id!==d.session.bound.workspace||value.month!==period||value.currency!=='KWD'||!['properties','sources','approvals','entries','partners','documents'].every(k=>Array.isArray(value[k]))||!value.shares||typeof value.shares!=='object')throw Error('تعذر التحقق من نطاق دفتر الشركاء.');
  return value;
 }
 async function load(){if(pending)throw Error('أكمل التحقق من محاولة الحفظ السابقة أولًا.');state=await read(month.value);preview=null;render();}
 function proposal(action,payload){if(pending)throw Error('أكمل التحقق من محاولة الحفظ السابقة أولًا.');pending={action,payload:{...payload,id:crypto.randomUUID()},month:state.month,expectedOwners:action==='approve_source'?preview?.owners:null};retry.hidden=false;}
 async function submit(){
  if(disposed||!pending)return;
  const attempt=pending;let saved;
  try{saved=await call(attempt.action,attempt.payload);}catch(error){
   if(/^(22|23|40)/.test(error?.code||'')){pending=null;preview=null;render();}
   if(error?.code==='42501')throw error;
   throw Error(messages[error?.message]||error?.message||'تعذر التحقق من الحفظ.');
  }
  const fresh=await read(attempt.month),collection=attempt.action==='approve_source'?fresh.approvals:fresh.entries,row=collection.find(x=>x.id===attempt.payload.id);
  if(!row||saved?.id!==attempt.payload.id||canonical(saved)!==canonical(row)||row.workspace_id!==d.session.bound.workspace||row.month!==attempt.month+'-01')throw Error('لم تتطابق إعادة القراءة مع العملية؛ أعد محاولة التحقق.');
  if(attempt.action==='approve_source'){
   const p=attempt.payload;
   if(row.property_id!==p.property_id||row.source_hash!==p.source_hash||row.shares_key!==p.shares_key||String(row.shares_version)!==String(p.shares_version)||String(row.review_revision)!==String(Number(p.expected_review_revision)+1)||row.document_id!==p.document_id||canonical(row.recipients)!==canonical(p.recipients)||String(row.income_fils)!==p.expected_income_fils||String(row.expense_fils)!==p.expected_expense_fils||String(row.reserve_fils)!==p.expected_reserve_fils||row.reason!==p.reason||canonical(row.owners)!==canonical(attempt.expectedOwners)||BigInt(row.net_fils)!==BigInt(row.income_fils)-BigInt(row.expense_fils)-BigInt(row.reserve_fils))throw Error('لم تتطابق مراجعة المصدر المحفوظة؛ أعد التحقق.');
  }else{
   const original=attempt.action==='post'?fresh.approvals.find(x=>x.id===attempt.payload.source_id):fresh.entries.find(x=>x.id===attempt.payload.distribution_id);
   if(!original||row.kind!==(attempt.action==='post'?'distribution':'reversal')||row.property_id!==original.property_id||row.source_id!==(attempt.action==='post'?original.id:original.source_id)||BigInt(row.net_fils)!==BigInt(original.net_fils)*(attempt.action==='post'?1n:-1n)||row.reason!==attempt.payload.reason||!Array.isArray(row.allocations)||row.allocations.reduce((sum,x)=>sum+BigInt(x.amount_fils),0n)!==BigInt(row.net_fils))throw Error('لم تتطابق حصص القيد المحفوظ؛ أعد التحقق.');
  }
  state=fresh;pending=preview=null;render();d.status.textContent='تم حفظ العملية والتحقق من المصدر والسجل بإعادة القراءة.';
 }
 function render(){
  content.replaceChildren();if(!state)return;
  if(!state.sources.length)content.append(node('p','لا يوجد مصدر مفصل لهذا الشهر. أكمل إقفاله من السجل المالي؛ الإقفالات القديمة تبقى محفوظة للمراجعة.'));
  const property=node('select'),shares=node('select'),show=node('button','عرض المصدر والحصص للمراجعة'),reviewArea=node('div');show.type='button';
  property.append(option('','اختر العقار'));for(const p of state.properties)property.append(option(p.id,p.name));
  shares.append(option('','اختر سجل الحصص المرتبط بالعقار'));for(const [key,s] of Object.entries(state.shares))if(s?.enabled===true&&Array.isArray(s.owners))shares.append(option(key,key+' — '+s.owners.map(x=>x.name).join('، ')));
  property.onchange=shares.onchange=()=>{preview=null;reviewArea.replaceChildren();};
  show.onclick=()=>execute(async()=>{
   if(pending)throw Error('أكمل التحقق من محاولة الحفظ السابقة أولًا.');
   if(!property.value||!shares.value)throw Error('اختر العقار وسجل حصصه.');
   try{preview=await call('preview',{property_id:property.value,shares_key:shares.value,month:state.month});}catch(e){throw Error(messages[e?.message]||e?.message);}
   if(preview.workspace_id!==d.session.bound.workspace||preview.property_id!==property.value||preview.month!==state.month||preview.shares_key!==shares.value||!Array.isArray(preview.owners)||!Array.isArray(preview.allocations))throw Error('لم تتطابق هوية المصدر والحصص.');
   renderReview(reviewArea,preview);
  });
  content.append(field('العقار',property),field('سجل الحصص',shares),show,reviewArea,node('h3','المراجعات والتوزيعات المحفوظة'));
  for(const a of state.approvals){
   const card=node('article'),p=state.properties.find(x=>x.id===a.property_id),newer=state.approvals.some(x=>x.property_id===a.property_id&&Number(x.review_revision)>Number(a.review_revision)),posted=state.entries.some(x=>x.source_id===a.id&&x.kind==='distribution');
   card.append(node('h4',(p?.name||a.property_id)+' — مراجعة '+a.review_revision),node('p','الصافي المحدود: '+partnerMoney(a.net_fils)+' — '+a.reason),node('p','نسخة الحصص '+a.shares_version+' — '+a.owners.map(x=>x.name+' '+(x.bps/100).toFixed(2)+'%').join('، ')));
   if(newer)card.append(node('p','مراجعة سابقة محفوظة؛ توجد مراجعة أحدث.'));
   else if(!posted&&!state.entries.some(x=>x.property_id===a.property_id&&x.kind==='distribution')){
    const reason=input(),post=node('button','اعتماد التوزيع من هذه المراجعة');post.type='button';reason.maxLength=500;
    post.onclick=()=>execute(async()=>{if(pending)return submit();if(reason.value.trim().length<5)throw Error('أدخل سبب اعتماد التوزيع بخمسة أحرف على الأقل.');proposal('post',{source_id:a.id,review_hash:a.review_hash,reason:reason.value.trim()});await submit();});
    card.append(field('سبب اعتماد التوزيع',reason),post);
   }
   content.append(card);
  }
  for(const entry of state.entries){
   const card=node('article'),reversed=state.entries.some(x=>x.reverses_id===entry.id);
   card.append(node('h4',(entry.kind==='reversal'?'قيد عكسي':'توزيع معتمد')+' — '+partnerMoney(entry.net_fils)),node('p',entry.occurred_on+' — '+entry.reason));
   for(const row of entry.allocations)card.append(node('p',row.name+' — '+partnerMoney(row.amount_fils)));
   if(entry.kind==='distribution'&&!reversed){const reason=input(),reverse=node('button','عكس التوزيع بقيد مستقل');reverse.type='button';reason.maxLength=500;
    reverse.onclick=()=>execute(async()=>{if(pending)return submit();if(reason.value.trim().length<5)throw Error('أدخل سبب العكس بخمسة أحرف على الأقل.');proposal('reverse',{distribution_id:entry.id,reason:reason.value.trim()});await submit();});card.append(field('سبب العكس',reason),reverse);}
   content.append(card);
  }
 }
 function renderReview(area,v){
  area.replaceChildren();const form=node('form'),income=input(),expense=input(),reserve=input(),document=node('select'),reason=input(),recipients=[];
  for(const el of [income,expense,reserve]){el.required=true;el.inputMode='decimal';}
  document.required=true;document.append(option('','اختر مستند المطابقة المحفوظ'));for(const x of state.documents.filter(x=>x.property_id===v.property_id))document.append(option(x.id,x.title));
  reason.required=true;reason.minLength=5;reason.maxLength=500;
  form.append(node('p','المقبوض: '+partnerMoney(v.income_fils)+'؛ المصروف: '+partnerMoney(v.expense_fils)+'؛ صافي حجز الاحتياطي: '+partnerMoney(v.reserve_fils)+'؛ صافي المصدر: '+partnerMoney(v.net_fils)),node('p','توزيع الفلس: أكبر باقي كسر أولًا، ثم معرف الشريك بترتيب ثابت. الخسارة توزع بالإشارة السالبة نفسها.'));
  for(const row of v.allocations)form.append(node('p',row.name+' — '+partnerMoney(row.amount_fils)));
  form.append(field('المقبوض المطابق للمستند د.ك',income),field('المصروف المطابق للمستند د.ك، أدخل 0 إن لم يوجد',expense),field('صافي الاحتياطي المطابق د.ك، أدخل 0 إن لم يوجد',reserve),field('مستند مطابقة العقار',document));
  for(const owner of v.owners){const recipient=node('select');recipient.required=true;recipient.append(option('','حدد حساب الشريك أو عدم وجود حساب'),option('offline','بدون حساب إلكتروني — لا يمنح أحدًا صلاحية'));
   for(const p of state.partners.filter(p=>p.property_id===v.property_id))recipient.append(option(p.user_id,p.name+' — '+p.email));
   recipients.push({owner,recipient});form.append(field('حساب '+owner.name,recipient));}
  form.append(node('p','اعتماد هذه المراجعة يثبت مطابقة الحصص لهذه الفترة وفق المستند. تبقى كل مراجعة محفوظة. إذا تغيرت الحصص قبل التوزيع، اعتمد مراجعة جديدة.'),field('سبب المطابقة واعتماد الحصص للفترة',reason),node('button','حفظ مراجعة المصدر الموثقة'));
  form.onsubmit=e=>{e.preventDefault();return execute(async()=>{if(pending)return submit();if(!document.value||reason.value.trim().length<5||recipients.some(x=>!x.recipient.value))throw Error('أكمل المستند والسبب وتحديد حساب كل شريك.');
   proposal('approve_source',{property_id:v.property_id,month:v.month,shares_key:v.shares_key,shares_version:v.shares_version,expected_review_revision:v.review_revision,source_hash:v.source_hash,expected_income_fils:partnerFils(income.value),expected_expense_fils:partnerFils(expense.value),expected_reserve_fils:partnerFils(reserve.value),document_id:document.value,recipients:Object.fromEntries(recipients.map(x=>[x.owner.id,x.recipient.value==='offline'?null:x.recipient.value])),reason:reason.value.trim()});await submit();});};
  area.append(form);
 }
 month.onchange=()=>{if(pending){month.value=pending.month;return;}state=preview=null;content.replaceChildren();};
 loadButton.onclick=()=>execute(load);retry.onclick=()=>execute(submit);
 d.onDispose(()=>{disposed=true;state=preview=pending=null;container.replaceChildren();});
 return {load:()=>execute(load)};
}
export async function openPartnerDistributions(){const d=createDialog('دفتر استحقاقات الشركاء');if(!d)return;await mountPartnerDistributions(d,d.body).load();}
