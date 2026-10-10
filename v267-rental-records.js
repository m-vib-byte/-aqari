(function(root){
'use strict';
// The legacy shell and module pages share one runtime and one guarded store.
if(root.AQARI_RENTAL_RECORDS){
 if(typeof module!=='undefined'&&module.exports)module.exports=root.AQARI_RENTAL_RECORDS;
 return;
}
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=message=>{throw new Error(message)};
const text=x=>String(x??'').normalize('NFKC').trim();
const digits=x=>text(x).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const key=x=>digits(x).toLowerCase();
// JSONB can reorder object keys. Confirm every value while retaining array order.
function same(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>same(value,b[index]));
 const keys=Object.keys(a);
 return keys.length===Object.keys(b).length&&keys.every(k=>Object.prototype.hasOwnProperty.call(b,k)&&same(a[k],b[k]));
}
function date(value){const s=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('أدخل تاريخاً صحيحاً.');return s}
function amount(value){const s=digits(value).replace('٫','.');if(!/^\d+(\.\d{1,3})?$/.test(s)||!Number.isSafeInteger(Math.round(Number(s)*1000)))fail('أدخل مبلغاً صحيحاً بدقة ثلاثة منازل كحد أقصى.');return Number(s)}
function sharedPhoneWarning(input,others=[]){
 const phone=digits(input.phone).replace(/[ ()-]/g,'');
 return phone&&others.some(p=>p.id!==input.id&&digits(p.phone).replace(/[ ()-]/g,'')===phone)?'الهاتف مستخدم في ملف مستأجر آخر. يمكن الحفظ بعد مراجعة الرقم المدني.':'';
}
function profile(input,others=[]){
 const p={};for(const field of ['id','nameAr','nameEn','civilId','passportNo','phone','email','nationality','address'])p[field]=text(input[field]);
 p.civilId=digits(p.civilId);p.phone=digits(p.phone).replace(/[ ()-]/g,'');
 if(!p.id||!p.nameAr||!p.nameEn||!p.nationality||!/^\d{12}$/.test(p.civilId)||!/^\+?\d{8,15}$/.test(p.phone))fail('أكمل الاسم العربي والإنجليزي والجنسية والرقم المدني من ١٢ رقماً والهاتف.');
 if(Object.values(p).some(v=>v.length>300)||p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))fail('راجع أطوال البيانات والبريد الإلكتروني.');
 if(others.some(x=>x.id!==p.id&&digits(x.civilId)===p.civilId))fail('الرقم المدني مسجل لمستأجر آخر. افتح الملف الموجود.');
 p.attachments=copy(input.attachments||[]);return p;
}
// A saved preparation draft is deliberately not a tenant, lease or payment.
function tenantDraft(input){
 const p={};for(const field of ['id','nameAr','nameEn','civilId','passportNo','phone','email','nationality','address'])p[field]=text(input[field]);
 if(!p.id||Object.values(p).some(v=>v.length>300))fail('راجع طول بيانات المسودة.');
 if(!p.nameAr&&!p.nameEn)fail('أدخل اسماً لتمييز المسودة؛ يمكن استكمال بقية البيانات لاحقاً.');
 p.civilId=digits(p.civilId);p.phone=digits(p.phone).replace(/[ ()-]/g,'');
 return p;
}
function lease(input,existing,profiles,properties){
 const c=copy(input);c.contract_no=text(c.contract_no);c.property=text(c.property);c.unit=digits(c.unit);c.start_date=date(c.start_date);c.end_date=date(c.end_date);c.rent=amount(c.rent);c.deposit=amount(c.rentalTermsVersion===1?(text(c.deposit)||0):c.deposit);
 const tenant=profiles.find(p=>p.id===c.tenantId);if(!tenant)fail('احفظ ملف المستأجر الكامل أولاً.');profile(tenant,profiles);
 if(!text(tenant.passportNo))fail('أكمل رقم الجواز في ملف المستأجر قبل كتابة العقد.');
 c.floor=text(c.floor);c.accountant=text(c.accountant);c.advance=amount(c.rentalTermsVersion===1?(text(c.advance)||0):c.advance);c.cleaningFee=amount(c.rentalTermsVersion===1?(text(c.cleaningFee)||0):c.cleaningFee);c.discount=amount(c.discount);
 c.contractRent=amount(c.contractRent??c.rent);c.rent=Number(((Math.round(c.contractRent*1000)-Math.round(c.discount*1000))/1000).toFixed(3));
 if(c.rentalTermsVersion===1){
  if(!['مستلم','لم يستلم'].includes(c.contractReceived))fail('اختر حالة استلام العقد.');
  c.receivedAt=c.contractReceived==='مستلم'?receivedAt(c.receivedAt):'';
  c.depositReceivedOn=text(c.depositReceivedOn);if(c.depositReceivedOn){date(c.depositReceivedOn);if(c.deposit<=0||c.depositReceivedOn>kuwaitDate())fail('تاريخ استلام التأمين يحتاج مبلغاً موجباً ولا يكون في المستقبل.');}
  if(typeof c.freeMonthApproved!=='boolean')fail('حدد اعتماد الشهر المجاني.');
  c.freeMonthPeriod=text(c.freeMonthPeriod);if(c.freeMonthApproved){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.freeMonthPeriod)||c.freeMonthPeriod<c.start_date.slice(0,7)||c.freeMonthPeriod>c.end_date.slice(0,7))fail('حدد الشهر المجاني ضمن مدة العقد.');}else c.freeMonthPeriod='';
  c.rentAdjustments=copy(c.rentAdjustments||[]);let last='';for(const a of c.rentAdjustments){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(a.effectiveMonth)||a.effectiveMonth<=last||a.effectiveMonth<c.start_date.slice(0,7)||a.effectiveMonth>c.end_date.slice(0,7)||!text(a.reason))fail('راجع شهر سريان التعديل وسببه.');a.discount=amount(a.discount);a.rent=Number(((Math.round(c.contractRent*1000)-Math.round(a.discount*1000))/1000).toFixed(3));if(a.rent<=0)fail('الخصم يجب أن يكون أقل من إيجار العقد.');last=a.effectiveMonth;}
 }else{c.receivedAt=receivedAt(c.receivedAt);c.contractReceived='مستلم';}
 c.evictionNotice=text(c.evictionNotice);
 c.writtenOn=date(c.writtenOn);c.detailsVersion=2;
 if(!c.floor||!c.accountant||c.floor.length>100||c.accountant.length>300||!['لم يُبلّغ','تم التبليغ','غير محدد'].includes(c.evictionNotice))fail('أكمل الدور واسم المحاسب وحالة تبليغ الإخلاء.');
 const prior=existing.find(x=>String(x.id)===String(c.id));
 if(c.rentalTermsVersion===1&&!prior&&!Object.prototype.hasOwnProperty.call(c,'rentEntitlement'))fail('حدد بداية الاستحقاق وسياسة أول فترة صراحة قبل حفظ العقد.');
 if(Object.prototype.hasOwnProperty.call(c,'rentEntitlement'))c.rentEntitlement=entitlement(c);
 if(prior?.rentEntitlement&&!Object.prototype.hasOwnProperty.call(c,'rentEntitlement'))fail('لا يمكن إزالة شروط الاستحقاق المحفوظة.');
 if(prior?.rentEntitlement&&(!same(prior.rentEntitlement,c.rentEntitlement)||prior.start_date!==c.start_date||prior.end_date!==c.end_date)&&(!['draft','ready'].includes(prior.status)||!['draft','ready'].includes(c.status)))fail('بداية الاستحقاق وسياسة أول فترة وتواريخ العقد ثابتة بعد اعتماد العقد.');
 if(prior?.detailsVersion===2&&(Number(prior.contractRent)!==c.contractRent||prior.writtenOn!==c.writtenOn))fail('إيجار العقد عند الكتابة وتاريخ تحريره محفوظان ولا يتغيران بتغيير الخصم.');
 if(!c.id||!c.contract_no||!c.unit||!properties.some(p=>key(p[0])===key(c.property))||c.rent<=0||c.end_date<c.start_date)fail('راجع العقار والوحدة ورقم العقد والإيجار وفترة العقد.');
 if(!['draft','ready','approved','signing','signed','cancelled','expired'].includes(c.status))fail('حالة عقد غير صالحة.');
 for(const old of existing){
  if(String(old.id??old.contractId)===String(c.id))continue;
  if(key(old.contract_no??old.contractNo)===key(c.contract_no))fail('رقم العقد مسجل مسبقاً.');
  if(c.status==='cancelled'||old.status==='cancelled'||key(old.property??old.propertyName)!==key(c.property)||key(old.unit??old.unitName)!==key(c.unit))continue;
  const start=old.start_date??old.startDate,end=old.end_date??old.endDate;
  // An incomplete legacy date must not silently permit a second lease.
  if(!start||!end||c.start_date<=end&&c.end_date>=start)fail('يوجد عقد متعارض لهذه الوحدة. راجع العقد الحالي قبل إنشاء عقد آخر.');
 }
 c.tenant=c.rentalTermsVersion===1&&prior?prior.tenant:tenant.nameAr;c.tenantProfile=copy(c.rentalTermsVersion===1&&prior?prior.tenantProfile:tenant);c.source='v267-cloud';return c;
}
function receivedAt(value){
 const s=digits(value);const match=/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?:\+03:00)?$/.exec(s);
 if(!match)fail('أدخل تاريخ ووقت استلام العقد بتوقيت الكويت.');date(match[1]);
 const result=match[1]+'T'+match[2]+':'+match[3]+':'+(match[4]||'00')+'+03:00';
 if(Date.parse(result)>Date.now())fail('وقت استلام العقد لا يمكن أن يكون في المستقبل.');return result;
}
function kuwaitDate(now=new Date()){return new Date(now.getTime()+3*60*60*1000).toISOString().slice(0,10)}
function entitlement(c){
 const e=c.rentEntitlement;
 if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='firstPeriodPolicy,manualFirstPeriodAmount,startDate,version'||e.version!==1||!['full_month','daily_prorated','manual_first_period'].includes(e.firstPeriodPolicy))fail('حدد بداية الاستحقاق وسياسة أول فترة صراحة قبل حفظ العقد.');
 const start=date(e.startDate);if(start<c.start_date||start>c.end_date)fail('بداية الاستحقاق يجب أن تقع ضمن مدة العقد.');
 const manual=e.firstPeriodPolicy==='manual_first_period'?amount(e.manualFirstPeriodAmount):null;
 if(e.firstPeriodPolicy!=='manual_first_period'&&e.manualFirstPeriodAmount!==null||manual>999999999.999)fail('راجع صافي أول فترة؛ المبلغ اليدوي يخص السياسة اليدوية فقط.');
 return {version:1,startDate:start,firstPeriodPolicy:e.firstPeriodPolicy,manualFirstPeriodAmount:manual};
}
function entitlementDueOn(c,period){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))fail('حدد شهر الاستحقاق.');
 const start=c.rentEntitlement?entitlement(c).startDate:c.start_date;
 if(c.rentEntitlement&&(period<start.slice(0,7)||period>c.end_date.slice(0,7)))return null;
 return start>period+'-01'?start:period+'-01';
}
function effectiveRent(c,period,includeFree=true){
 let due=amount(c.rent);if(c.rentalTermsVersion===1){if(includeFree&&c.freeMonthApproved&&c.freeMonthPeriod===period)return 0;const a=(c.rentAdjustments||[]).filter(a=>a.effectiveMonth<=period).at(-1);if(a)due=amount(a.rent);}
 if(!includeFree||!Object.prototype.hasOwnProperty.call(c,'rentEntitlement'))return due;
 const e=entitlement(c);if(!entitlementDueOn(c,period))return 0;if(period!==e.startDate.slice(0,7))return due;
 if(e.firstPeriodPolicy==='manual_first_period')return e.manualFirstPeriodAmount;
 if(e.firstPeriodPolicy==='daily_prorated'){
  const [year,month]=period.split('-').map(Number),last=new Date(Date.UTC(year,month,0)),end=c.end_date<last.toISOString().slice(0,10)?new Date(c.end_date+'T00:00:00Z'):last;
  const days=BigInt(Math.round((end-new Date(e.startDate+'T00:00:00Z'))/86400000)+1),divisor=BigInt(last.getUTCDate()),fils=BigInt(Math.round(due*1000));
  return Number((fils*days*2n+divisor)/(divisor*2n))/1000;
 }
 return due;
}
function entitlementBreakdown(c,period){
 const e=c.rentEntitlement?entitlement(c):null,net=effectiveRent(c,period),manual=!!e&&e.firstPeriodPolicy==='manual_first_period'&&period===e.startDate.slice(0,7),freeMonth=c.rentalTermsVersion===1&&c.freeMonthApproved&&c.freeMonthPeriod===period;
 if(manual)return {gross:null,discount:null,net,manual:true,freeMonth,policy:e.firstPeriodPolicy};
 const gross=effectiveRent({...c,rent:c.contractRent??c.rent,freeMonthApproved:false,rentAdjustments:[]},period);
 return {gross,discount:(Math.round(gross*1000)-Math.round(net*1000))/1000,net,manual:false,freeMonth,policy:e?(period===e.startDate.slice(0,7)?e.firstPeriodPolicy:'full_month'):null};
}
function directoryFields(c,p){return {tenant:p.nameAr,nameAr:p.nameAr,nameEn:p.nameEn,phone:p.phone,nationality:p.nationality,civilId:p.civilId,passportNo:p.passportNo,email:p.email,floor:c.floor,contractStartRaw:c.start_date,contractEndRaw:c.end_date,insurance:c.deposit,insuranceDateRaw:c.depositReceivedOn||'',freeMonth:c.rentalTermsVersion===1?(c.freeMonthApproved?'نعم — '+c.freeMonthPeriod:'لا'):'',advance:c.advance,cleaningFee:c.cleaningFee,currentRent:effectiveRent(c,kuwaitDate().slice(0,7),false),contractReceived:c.contractReceived,receivedAt:c.receivedAt,accountant:c.accountant,evictionNotice:c.evictionNotice};}
function primary(payload){
 const p=payload?.format==='aqari-cloud-state-v1'?payload.snapshot?.values?.aqari_v30:payload?.schema==='aqari-local-snapshot-v1'?payload.values?.aqari_v30:payload;
 if(!p||typeof p!=='object'||Array.isArray(p))fail('تعذرت قراءة بيانات مساحة العمل.');return p;
}
function createStore(options){
 let busy=false,uncertain=false;
 return {
 adoptConfirmed(keys,before,confirmed,bound){
  // Synchronize only this writer's confirmed sections. Never discard local
  // edits, cross-account data, or an unresolved in-flight store operation.
  if(busy||uncertain||!bound||!same(bound,options.scope())||!Array.isArray(keys))return false;
  const local=options.local();
  if(keys.some(k=>!Object.prototype.hasOwnProperty.call(confirmed,k)||
   (!same(local[k]||[],before[k]||[])&&!same(local[k]||[],confirmed[k]||[]))))return false;
  for(const k of keys)local[k]=copy(confirmed[k]);
  try{options.cache()}catch(_){}return true;
 },
 async change(keys,mutate,verify,{compare=keys}={}){
  if(busy||uncertain)fail(uncertain?'تحديث الصفحة مطلوب للتحقق من نتيجة الحفظ السابقة.':'انتظر اكتمال الحفظ الحالي.');
  const scope=options.scope();if(!scope)fail('صلاحية الكتابة غير متاحة.');
  const check=()=>{if(!same(scope,options.scope()))fail('تغيّرت جلسة الدخول. لم يتم عرض بيانات الحساب السابق.');};
  let sent=false;busy=true;
  try{
   const cloud=await options.load(scope);check();const payload=copy(cloud.payload),data=primary(payload),local=options.local();
   for(const k of compare)if(!same(data[k]||[],local[k]||[]))fail('تغيّرت البيانات أو توجد تعديلات محلية. حدّث الصفحة قبل الحفظ.');
   const expected=mutate(data);check();sent=true;
   await options.save(payload,Number(cloud.revision),scope);check();
   const confirmed=primary((await options.load(scope)).payload);check();
   if(!verify(confirmed,expected))fail('لم تؤكد إعادة القراءة وجود السجل.');
   for(const k of keys)local[k]=copy(confirmed[k]||[]);
   try{options.cache()}catch(_){}return expected;
  }catch(e){if(sent){uncertain=true;throw new Error('لم يكتمل تأكيد الحفظ؛ قد يكون السجل وصل. حدّث الصفحة وتحقق قبل إعادة الإضافة.')}throw e}
  finally{busy=false}
 },get busy(){return busy}};
}
const api={sharedPhoneWarning,profile,tenantDraft,lease,primary,createStore,date,amount,key,receivedAt,kuwaitDate,directoryFields,effectiveRent,entitlement,entitlementDueOn,entitlementBreakdown};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.AQARI_RENTAL_RECORDS=api;
if(!root.document)return;
const data=()=>typeof db!=='undefined'?db:{};
function scope(){
 const c=root.AQARI_SUPABASE?.context,u=c?.user?.id,w=c?.workspace?.id,m=c?.membership;
 const s={userId:u,workspaceId:w};
 const matches=g=>g?.userId===u&&g?.workspaceId===w;
 if(!u||!w||m?.is_active!==true||m.user_id!==u||m.workspace_id!==w||!['general_manager','property_manager','accountant'].includes(m.role)||!document.documentElement.classList.contains('aqari-auth-unlocked')||!matches(root.AQARI_DATA_GATE?.scope)||!matches(root.AQARI_EARLY_STORAGE_GATE?.scope))return null;
 return s;
}
async function bounded(task){let timer;try{return await Promise.race([task(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('انتهت مهلة الاتصال.')),20000)})])}finally{clearTimeout(timer)}}
const store=createStore({scope,local:data,load:s=>bounded(()=>root.AQARI_SUPABASE.loadAppState(s)),save:(p,r,s)=>bounded(()=>root.AQARI_SUPABASE.saveAppState(p,r,s)),cache:()=>{if(typeof persist==='function')persist()}});
api.adoptConfirmedWrite=(keys,before,confirmed,bound)=>store.adoptConfirmed(keys,before,confirmed,bound);
const esc=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=id=>document.getElementById(id);
const profileRef=row=>Array.isArray(row)?row.find(x=>x&&typeof x==='object'&&x.aqariTenantProfileV267)?.aqariTenantProfileV267||row[4]:null;
const draftNotice='<p class="v267-draft-notice" style="border:2px solid currentColor;padding:12px;font-weight:700;text-align:center">مسودة للمراجعة — غير صالحة للتوقيع<br>DRAFT — NOT FOR SIGNATURE</p>';
function contractMarkup(c,count){return renderContract(c,count,false);}
function renderContract(c,count,official,firstCopy=1,total=count){
 // Contract copies show original terms; collection discounts remain in the receipt and audit records.
 if(![1,2].includes(count))fail('اختر نسخة واحدة أو نسختين.');
 const p=c.tenantProfile||{};
 const rows=[['حالة العقد',c.status],['العقار',c.property],['رقم الوحدة',c.unit],['الدور',c.floor],['الاسم بالعربي',p.nameAr||c.tenant],['الاسم بالإنجليزي',p.nameEn],['البريد الإلكتروني',p.email],['الجنسية',p.nationality],['الرقم المدني',p.civilId],['رقم الجواز',p.passportNo],['الهاتف',p.phone],['بداية العقد',c.start_date],['نهاية العقد',c.end_date],['الإيجار عند كتابة العقد',c.contractRent??c.rent],['التأمين',c.deposit],['تاريخ استلام التأمين',c.depositReceivedOn||'لم يستلم / غير مدون'],['شهر مجاني معتمد',c.rentalTermsVersion===1?(c.freeMonthApproved?'نعم — '+c.freeMonthPeriod:'لا'):'غير مدون'],['العربون',c.advance],['رسوم النظافة',c.cleaningFee],['حالة استلام العقد',c.contractReceived],['تاريخ ووقت استلام العقد — الكويت',c.receivedAt],['حالة تبليغ الإخلاء',c.evictionNotice],['المحاسب المسؤول',c.accountant]];
 if(c.rentEntitlement)rows.push(['بداية استحقاق الإيجار',c.rentEntitlement.startDate]);
 return Array.from({length:count},(_,i)=>'<article class="v267-contract-copy" data-contract-print="'+(official?'approved':'draft')+'">'+(official?'':draftNotice)+'<p>حُرر هذا العقد في دولة الكويت بتاريخ '+esc(c.writtenOn||'غير مدون')+'</p><p>AQARI V267 • نسخة '+(i+firstCopy)+' من '+total+'</p><h2>عقد إيجار '+esc(c.contract_no)+'</h2>'+rows.map(([label,value])=>'<p><b>'+esc(label)+':</b> <bdi dir="'+(label.includes('تاريخ ووقت')?'ltr':'auto')+'">'+esc(value??'غير مدون')+'</bdi></p>').join('')+(c.clauses||[]).map((x,n)=>'<p><b>'+(n+1)+'. '+esc(x.title)+'</b><br>'+esc(x.text)+'</p>').join('')+(official?'<p>توقيع المؤجر: ____________________</p><p>توقيع المستأجر: ____________________</p>':draftNotice)+'</article>').join('');
}
function contractAnnexMarkup(c){return renderAnnex(c,false);}
function renderAnnex(c,official){
 const p=c.tenantProfile||{};const rows=[['رقم العقد / Contract',c.contract_no],['اسم المستأجر بالعربي',p.nameAr||c.tenant],['Tenant full name in English',p.nameEn],['العقار / Property',c.property],['الوحدة / Unit',c.unit],['الدور / Floor',c.floor],['الإيجار الأصلي / Original rent',c.contractRent??c.rent],['الشهر المجاني المعتمد / Approved free month',c.freeMonthApproved?'نعم — '+c.freeMonthPeriod:'لا']];
 return '<article class="v267-contract-copy" data-contract-print="'+(official?'approved':'draft')+'">'+(official?'':draftNotice)+'<h2>ملحق بيانات عقد الإيجار / Rental contract annex</h2>'+rows.map(([k,v])=>'<p><b>'+esc(k)+':</b> <bdi>'+esc(v??'غير مدون')+'</bdi></p>').join('')+(official?'<p>توقيع المؤجر / Lessor: ____________________</p><p>توقيع المستأجر / Tenant: ____________________</p>':draftNotice)+'</article>';
}
async function prepareContractPrint(id,count=1,mode='official'){
 if(![1,2].includes(count)||!['official','draft'].includes(mode)||!text(id))fail('طلب طباعة غير صالح.');
 const bound=scope(),role=root.AQARI_SUPABASE?.context?.membership?.role;
 if(!bound)fail('صلاحية قراءة العقد غير متاحة.');
 const saved=await bounded(()=>root.AQARI_SUPABASE.loadAppState({...bound,role}));
 if(!same(bound,scope())||role!==root.AQARI_SUPABASE?.context?.membership?.role)fail('تغيّرت جلسة الدخول. أعد فتح العقد.');
 if(saved?.workspace_id!==bound.workspaceId)fail('تعذرت قراءة العقد من مساحة العمل الحالية.');
 const matches=(primary(saved.payload).contractsV202||[]).filter(c=>String(c.id)===String(id));
 if(matches.length!==1||matches[0].source!=='v267-cloud')fail('العقد المحفوظ غير متاح للطباعة.');
 const c=copy(matches[0]),official=mode==='official';
 if(official&&!['approved','signing','signed'].includes(c.status))fail('اعتماد المدير العام مطلوب قبل الطباعة الرسمية. استخدم مسودة المراجعة.');
 const markup=Array.from({length:count},(_,i)=>'<section data-contract-set="'+(i+1)+'">'+renderContract(c,1,official,i+1,count)+renderAnnex(c,official)+'</section>').join('');
 const title=(official?'عقد إيجار معتمد ':'مسودة عقد إيجار ')+c.contract_no;
 const html='<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>body{font:15px/1.7 system-ui;margin:22px;overflow-wrap:anywhere}.v267-contract-copy{break-after:page}section:last-child article:last-child{break-after:auto}.v267-draft-notice{break-inside:avoid}</style></head><body>'+markup+'</body></html>';
 return {title,html,mode,count,contractId:String(c.id),revision:saved.revision};
}
function preview(c){
 if(!scope())return false;
 const target=byId('contractPreviewV55');if(!target)return false;
 if(c.source==='statement-import'&&c.status!=='signed'){
  target.replaceChildren();
  for(const value of ['ملف عقد محفوظ من كشف الإيجار — للمراجعة', 'العقد: '+c.contract_no, 'العقار: '+c.property+' — الوحدة: '+c.unit, 'المستأجر: '+(c.tenant||'غير مدون'), 'إيجار العقد: '+c.rent+' د.ك', 'الإيجار الحالي بالمصدر: '+c.currentRent+' د.ك', 'البداية: '+(c.start_date||'معلّقة حسب المصدر'), 'النهاية: '+(c.end_date||'معلّقة حسب المصدر'), 'التأمين: معلّق. لم يتم اعتماد التوقيع أو ترحيل دفعة من هذا الكشف.']){
   const p=document.createElement('p');p.textContent=value;target.appendChild(p);
  }
  return true;
 }
 target.innerHTML=contractMarkup(c,1);
 for(const [count,mode,label]of [[1,'draft','مسودة للمراجعة فقط'],[1,'official','طباعة نسخة معتمدة'],[2,'official','طباعة نسختين معتمدتين مع الملاحق']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{
   if(button.disabled)return;button.disabled=true;
   try{await root.AQARI_V202?.showContractCopies(c.id,count,mode);}catch(_){if(scope())root.alert('تعذر فتح الطباعة. أعد فتح العقد وحاول مجدداً.');}finally{button.disabled=false;}
  };target.appendChild(button);
 }
 if(c.status==='draft'){const b=document.createElement('button');b.type='button';b.textContent='جاهز للمراجعة';b.onclick=()=>status(c.id,'ready');target.appendChild(b)}
 return true;
}
const fields=[['nameAr','الاسم الكامل بالعربي','text'],['nameEn','الاسم بالإنجليزي','text'],['civilId','الرقم المدني','text'],['phone','الهاتف','tel'],['email','البريد الإلكتروني — إن وجد','email'],['passportNo','رقم الجواز — إلزامي للعقد','text'],['nationality','الجنسية','text'],['address','العنوان — اختياري','text']];
const attachmentKinds=[['civilFront','البطاقة المدنية — الوجه'],['civilBack','البطاقة المدنية — الخلف'],['marriage','عقد الزواج'],['extra','مرفقات إضافية']];

function openTenant(index,draftId){
 if(!scope())return false;
 let row=Number.isInteger(index)?data().tenants?.[index]:null;
 const existing=(data().tenantProfilesV267||[]).find(p=>p.id===profileRef(row));
 const savedDraft=(data().tenantPreparationDraftsV267||[]).find(x=>x.id===(existing?.id||draftId));
 const p={...copy(existing||{id:crypto.randomUUID(),nameAr:row?.[0]||'',attachments:[]}),...copy(savedDraft||{})};
 if(existing?.source==='statement-import'){
  import('./src/v267/pages/imported-tenant.js').then(m=>m.openImportedTenant({ref:p.id,draft:savedDraft,phoneWarning:values=>sharedPhoneWarning(values,data().tenantProfilesV267||[]),
   onDraft:async values=>{const pending=tenantDraft(values);await store.change(['tenantPreparationDraftsV267','audit'],cloud=>{cloud.tenantPreparationDraftsV267=(cloud.tenantPreparationDraftsV267||[]).filter(x=>x.id!==pending.id).concat([pending]);cloud.audit=(cloud.audit||[]).concat([[scope().userId,'حفظ مسودة بيانات مستأجر',pending.id,new Date().toISOString()]]);return pending;},(cloud,saved)=>(cloud.tenantPreparationDraftsV267||[]).some(x=>same(x,saved)));},
   onSaved:async()=>{const bound=scope();if(!bound)fail('انتهت الجلسة.');const cloud=await bounded(()=>root.AQARI_SUPABASE.loadAppState(bound));if(!same(bound,scope()))fail('تغيّرت الجلسة.');const confirmed=primary(cloud.payload);for(const key of ['tenants','tenantProfilesV267','tenantDirectoryV202','tenantPreparationDraftsV267'])data()[key]=copy(confirmed[key]||[]);if(typeof render==='function')render();}
  })).catch(()=>window.alert('تعذر فتح ملف المستأجر المستورد. حدّث الصفحة وأعد المحاولة.'));
  return true;
 }
 const modal=byId('modal');byId('mt').textContent='ملف المستأجر • AQARI V267';
 byId('fields').innerHTML='<div class="v267-tenant-form">'+fields.map(([k,label,type])=>'<label>'+label+'<input id="v267Tenant_'+k+'" type="'+type+'" value="'+esc(p[k])+'" '+(k==='civilId'?'inputmode="numeric" maxlength="12"':'')+' autocomplete="off"></label>').join('')+attachmentKinds.map(([k,label])=>'<label>'+label+'<input id="v267File_'+k+'" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" '+(k==='extra'?'multiple':'')+'></label>').join('')+'<div id="v267TenantAttachments"></div><p id="v267TenantPhoneWarning" role="status" aria-live="polite"></p><p id="v267TenantStatus" role="status" aria-live="polite"></p></div>';
 const updatePhoneWarning=()=>{byId('v267TenantPhoneWarning').textContent=sharedPhoneWarning({id:p.id,phone:byId('v267Tenant_phone').value},data().tenantProfilesV267||[]);};
 byId('v267Tenant_phone').oninput=updatePhoneWarning;updatePhoneWarning();
 const list=byId('v267TenantAttachments');
 for(const a of p.attachments){const b=document.createElement('button');b.type='button';b.textContent='عرض '+a.name;b.onclick=async()=>{try{const s=scope();if(!s||!a.path.startsWith(s.workspaceId+'/'))return;const client=await root.AQARI_SUPABASE.getClient();const r=await bounded(()=>client.storage.from(a.bucket).createSignedUrl(a.path,60));if(r.error)throw r.error;if(same(s,scope())&&r.data?.signedUrl){const link=document.createElement('a');link.href=r.data.signedUrl;link.target='_blank';link.rel='noopener';link.textContent='فتح '+a.name;byId('v267TenantStatus').replaceChildren(link)}}catch(_){byId('v267TenantStatus').textContent='تعذر فتح المرفق.'}};list.appendChild(b)}
 let saving=false,uploadAttachment;const uploadedFiles=new WeakMap();
 if(root.AQARI_SUPABASE?.context?.membership?.role==='general_manager'){
  const note=document.createElement('p');note.textContent='يمكن حفظ مسودة ناقصة واستكمالها لاحقاً. المسودة لا تصدر عقداً أو وصلاً، ولا تحفظ المرفقات حتى اكتمال الملف.';
  const draftButton=document.createElement('button');draftButton.type='button';draftButton.textContent='حفظ مسودة واستكمال لاحقاً';
  draftButton.onclick=async()=>{
   if(saving)return;saving=true;draftButton.disabled=true;byId('saveBtn').disabled=true;
   const status=byId('v267TenantStatus');
   try{
    if(root.AQARI_SUPABASE?.context?.membership?.role!=='general_manager')fail('صلاحية المدير مطلوبة.');
    const values={id:p.id};for(const [k]of fields)values[k]=byId('v267Tenant_'+k).value;
    const pending=tenantDraft(values);status.textContent='جاري حفظ المسودة والتحقق منها…';
    await store.change(['tenantPreparationDraftsV267','audit'],cloud=>{
     cloud.tenantPreparationDraftsV267=(cloud.tenantPreparationDraftsV267||[]).filter(x=>x.id!==pending.id).concat([pending]);
     cloud.audit=(cloud.audit||[]).concat([[scope().userId,'حفظ مسودة بيانات مستأجر',pending.id,new Date().toISOString()]]);return pending;
    },(cloud,saved)=>(cloud.tenantPreparationDraftsV267||[]).some(x=>same(x,saved)));
    status.textContent='تم حفظ المسودة في السحابة. يمكنك إغلاقها والعودة لاستكمالها. المرفقات المختارة لم تُرفع.';
   }catch(e){status.textContent=e.message||'تعذر تأكيد حفظ المسودة.'}finally{saving=false;draftButton.disabled=false;byId('saveBtn').disabled=false;}
  };
  byId('fields').append(note,draftButton);
  if(!row){
   const drafts=data().tenantPreparationDraftsV267||[];
   if(drafts.length){const select=document.createElement('select');select.setAttribute('aria-label','استكمال مسودة مستأجر');const empty=document.createElement('option');empty.value='';empty.textContent='استكمال مسودة محفوظة…';select.append(empty);
    for(const draft of drafts){if((data().tenantProfilesV267||[]).some(x=>x.id===draft.id))continue;const option=document.createElement('option');option.value=draft.id;option.textContent=draft.nameAr||draft.nameEn;select.append(option);}
    select.onchange=()=>{if(!saving&&select.value)openTenant(undefined,select.value);};byId('fields').prepend(select);
   }
  }
 }

 byId('saveBtn').onclick=async()=>{
  if(saving)return;saving=true;const button=byId('saveBtn'),status=byId('v267TenantStatus'),bound=scope();button.disabled=true;
  try{
   for(const [k]of fields)p[k]=byId('v267Tenant_'+k).value;
   profile(p,data().tenantProfilesV267||[]);
   const uploads=attachmentKinds.flatMap(([kind])=>Array.from(byId('v267File_'+kind).files||[]).map(file=>({kind,file})));
   if(uploads.length>12)fail('يمكن رفع ١٢ مرفقاً في العملية الواحدة.');
   status.textContent='جاري حفظ ملف المستأجر والتحقق منه قبل رفع المرفقات…';
   if(!same(bound,scope()))fail('تغيّرت جلسة الدخول. أعد فتح الملف.');
   await store.change(['tenants','tenantProfilesV267','tenantDirectoryV202','audit',...(root.AQARI_SUPABASE?.context?.membership?.role==='general_manager'?['tenantPreparationDraftsV267']:[])],cloud=>{
    const profiles=cloud.tenantProfilesV267||[];const next=profile(p,profiles),at=profiles.findIndex(x=>x.id===p.id);
    if((cloud.tenantDirectoryV202||[]).some(x=>digits(x.civilId)===next.civilId&&key(x.tenant)!==key(next.nameAr)))fail('الرقم المدني مرتبط باسم مستأجر آخر في سجل الوحدات. راجع الملف الموجود.');
    if(at<0)profiles.push(next);else profiles[at]=next;cloud.tenantProfilesV267=profiles;
    cloud.tenantDirectoryV202=(cloud.tenantDirectoryV202||[]).map(x=>x.tenantProfileId===next.id?{...x,nameAr:next.nameAr,nameEn:next.nameEn,phone:next.phone,email:next.email,passportNo:next.passportNo,civilId:next.civilId,nationality:next.nationality}:x);
    if(root.AQARI_SUPABASE?.context?.membership?.role==='general_manager')cloud.tenantPreparationDraftsV267=(cloud.tenantPreparationDraftsV267||[]).filter(x=>x.id!==p.id);
    const rows=cloud.tenants||[];const original=Number.isInteger(index)?rows[index]:null;
    if(row&&!same(row,original))fail('تغيّر سجل المستأجر. حدّث الصفحة.');
    if(original){const updated=copy(original);updated[0]=next.nameAr;if(!updated[4])updated[4]=next.id;else if(profileRef(updated)!==next.id)updated.push({aqariTenantProfileV267:next.id});rows[index]=updated;}else rows.push([next.nameAr,'','','نشط',next.id]);cloud.tenants=rows;
    cloud.audit=(cloud.audit||[]).concat([['المدير','حفظ ملف مستأجر',next.id,new Date().toISOString()]]);return next;
   },(cloud,saved)=>(cloud.tenantProfilesV267||[]).some(x=>same(x,saved))&&(cloud.tenants||[]).some(x=>profileRef(x)===saved.id));
   index=(data().tenants||[]).findIndex(x=>profileRef(x)===p.id);row=copy(data().tenants[index]);
   status.textContent='تم حفظ المستأجر. جاري رفع المرفقات إلى ملفه المحفوظ…';
   if(uploads.length&&!uploadAttachment){
    const {createTenantAttachmentUploader}=await import('./src/v267/components/tenant-attachment-upload.js');
    const check=()=>{if(!same(bound,scope()))fail('تغيّرت جلسة الدخول أثناء الرفع.');};check();
    uploadAttachment=createTenantAttachmentUploader({getClient:()=>root.AQARI_SUPABASE.getClient(),check,bounded,workspaceId:bound.workspaceId,userId:bound.userId});
   }
   for(const {kind,file}of uploads){
    let kinds=uploadedFiles.get(file);if(kinds?.has(kind))continue;
    const attachment=await uploadAttachment(file,kind,p.id);p.attachments.push(attachment);
    if(!kinds){kinds=new Set();uploadedFiles.set(file,kinds);}kinds.add(kind);
   }
   if(uploads.length)await store.change(['tenantProfilesV267'],cloud=>{
    const saved=(cloud.tenantProfilesV267||[]).find(x=>x.id===p.id);if(!saved)fail('تعذر العثور على ملف المستأجر المحفوظ.');
    const known=new Set((saved.attachments||[]).map(x=>x.id));
    saved.attachments=(saved.attachments||[]).concat(p.attachments.filter(x=>!known.has(x.id)));return copy(saved);
   },(cloud,saved)=>(cloud.tenantProfilesV267||[]).some(x=>same(x,saved)));
   for(const [kind]of attachmentKinds)byId('v267File_'+kind).value='';
   modal.classList.remove('on');if(typeof render==='function')render();
  }catch(e){status.textContent=e.message||'تعذر حفظ ملف المستأجر.'}finally{button.disabled=false;saving=false}
 };
 modal.classList.add('on');return true;
}
const recordModules=new Set(['properties','employees','payroll','maintenance','expenses','services']);
async function openRecord(module,index){
 if(!scope()||!recordModules.has(module)||typeof mods==='undefined'||!mods[module])return false;
 const bound=scope(),existing=Number.isInteger(index)?copy(data()[module]?.[index]):null,labels=mods[module][1];
 let propertyForm,propertyFields;
 if(module==='properties'){
  const experience=root.AQARI_PROPERTY_EXPERIENCE;
  if(experience?.canWrite()===false){root.alert('إضافة العقارات وتعديلها غير متاح لصلاحية حسابك.');return false;}
  try{
   if(existing){
    if(typeof experience?.openCompleteFileByName==='function')return experience.openCompleteFileByName(existing[0],{section:'edit'});
    const bridge=root.AQARI_SUPABASE,workspace=bridge?.context?.workspace?.id,client=await bridge?.getClient?.();
    if(!workspace||!client||!same(bound,scope()))throw Error('الجلسة غير جاهزة. أعد فتح صفحة العقارات.');
    const response=await client.from('aqari_properties').select('id,name').eq('workspace_id',workspace).eq('name',existing[0]).limit(2);
    if(response.error)throw response.error;if(!Array.isArray(response.data)||response.data.length!==1)throw Error(response.data?.length?'اسم العقار غير فريد.':'لم يتم ربط هذا العقار بالسجل الخادمي بعد.');
    const page=await import('./src/v267/pages/property-hub.js');if(!same(bound,scope()))throw Error('تغيرت جلسة الدخول.');return page.openPropertyHub(response.data[0].id,{section:'edit'});
   }
   if(typeof experience?.openOnboarding==='function')return experience.openOnboarding();
   const page=await import('./src/v267/pages/property-onboarding.js');if(!same(bound,scope()))throw Error('تغيرت جلسة الدخول.');return page.openPropertyOnboarding();
  }catch(error){root.alert(error?.message||'تعذر فتح حفظ العقار.');return false;}
  ({propertyFields}=await import('./src/v267/components/property-form.js'));
  if(!same(bound,scope())||experience?.canWrite()!==true)return false;
 }
 const modal=byId('modal');byId('mt').textContent=(existing?'تعديل ':'إضافة ')+mods[module][0];
 if(propertyFields){
  propertyForm=propertyFields(byId('fields'),existing,{check:()=>{if(!same(bound,scope())||root.AQARI_PROPERTY_EXPERIENCE?.canWrite()!==true)fail('تغيرت صلاحية الحساب. أعد فتح العقار.');}});
  const status=document.createElement('p');status.id='v267RecordStatus';status.setAttribute('role','status');byId('fields').append(status);
 }else byId('fields').innerHTML='<div class="v267-tenant-form">'+labels.map((label,i)=>'<label>'+esc(label)+'<input id="v267Record_'+i+'" value="'+esc(existing?.[i]||'')+'" autocomplete="off"></label>').join('')+'<p id="v267RecordStatus" role="status"></p></div>';
 let saving=false;
 byId('saveBtn').onclick=async()=>{
  if(saving)return;saving=true;const button=byId('saveBtn'),status=byId('v267RecordStatus');button.disabled=true;
  try{
   if(!same(bound,scope()))fail('تغيرت جلسة الدخول.');
   const row=propertyForm?propertyForm.read():labels.map((_,i)=>text(byId('v267Record_'+i).value));if(!row[0]||row.some(v=>typeof v==='string'&&v.length>2000))fail('أكمل بيانات السجل.');
   status.textContent='جاري الحفظ والتحقق من السحابة…';
   await store.change([module,'audit'],cloud=>{
    const rows=cloud[module]||[];
    if(existing&&!same(rows[index],existing))fail('تغير السجل؛ حدّث الصفحة.');
    if(module==='properties'&&rows.some((r,i)=>i!==index&&key(r[0])===key(row[0])))fail('اسم العقار مسجل مسبقاً.');
    if(module==='properties'&&existing&&existing[0]!==row[0])fail('اسم العقار مرتبط بسجلاته؛ تعديل الاسم يحتاج إجراء مخصص.');
    const saved=propertyForm?row:existing?existing.map((v,i)=>i<row.length?row[i]:v):row;
    if(existing)rows[index]=saved;else rows.push(saved);cloud[module]=rows;
    cloud.audit=(cloud.audit||[]).concat([[bound.userId,existing?'تعديل سجل':'إضافة سجل',module,new Date().toISOString()]]);return {row:saved,index:existing?index:rows.length-1};
   },(cloud,saved)=>same(cloud[module]?.[saved.index],saved.row),module==='properties'?{compare:[]}:{compare:[module,'audit']});
   modal.classList.remove('on');if(typeof render==='function')render();
   if(propertyForm){propertyForm.dispose();root.dispatchEvent(new CustomEvent('aqari:property-saved',{detail:{name:row[0]}}));}
  }catch(e){status.textContent=e.message||'تعذر تأكيد الحفظ.'}finally{button.disabled=false;saving=false;}
 };
 modal.classList.add('on');propertyForm?.focus();return true;
}
async function saveLease(input){
 if(root.AQARI_V202?.canCreateContract(input.property)!==true)fail('هذا العقار غير متاح للكتابة في هذه المعاينة.');
 // Validate profiles and properties from the fresh cloud payload; only lock collections changed below.
 const keys=['contractsV202','tenantDirectoryV202','leases','audit'];
 const saved=await store.change(keys,cloud=>{
  const old=cloud.contractsV202||[],profiles=cloud.tenantProfilesV267||[];
  const legacy=typeof localContractsV55==='function'?localContractsV55():[];
  const c=lease(input,old.concat(legacy),profiles,cloud.properties||[]),i=old.findIndex(x=>String(x.id)===String(c.id));
  if(i<0)old.push(c);else old[i]=c;cloud.contractsV202=old;
  const p=profiles.find(x=>x.id===c.tenantId);
  const directory=(cloud.tenantDirectoryV202||[]).filter(x=>x.contractNo!==c.contract_no);
  directory.push({property:c.property,unit:c.unit,...directoryFields(c,p),contractNo:c.contract_no,source:'v267-cloud',verified:c.status==='signed',tenantProfileId:p.id});cloud.tenantDirectoryV202=directory;
  const leases=(cloud.leases||[]).filter(x=>x[4]!==c.id);leases.push([c.tenant,c.unit,c.rent,c.end_date,c.id]);cloud.leases=leases;
  cloud.audit=(cloud.audit||[]).concat([[scope().userId,'حفظ عقد '+c.status,c.contract_no,new Date().toISOString()]]);return c;
 },(cloud,c)=>(cloud.contractsV202||[]).some(x=>same(x,c)));
 if(typeof loadContractsV55==='function')loadContractsV55();if(typeof renderWorkflowV56==='function')renderWorkflowV56();return saved;
}
async function generate(){
 const notice=byId('contractNotesV55');try{
  if(!scope())fail('صلاحية إنشاء العقد غير متاحة.');
  const page=await import('./src/v267/pages/rental-contracts.js');
  if(!scope())fail('تغيّرت جلسة الدخول.');
  page.openRentalContracts({create:true});
  if(notice)notice.textContent='اختر نوع العقد ونسخة قالب منشورة في نموذج العقد.';
 }catch(e){if(notice)notice.textContent=e.message;else root.alert?.(e.message);}
}

async function status(id,next){
 const notice=byId('contractNotesV55');try{
  const c=(data().contractsV202||[]).find(x=>String(x.id)===String(id));if(!c||c.source!=='v267-cloud')fail('هذا العقد ليس من مسار V267 المحفوظ. يلزم مراجعته قبل تغيير حالته.');
  const allowed={draft:['ready','cancelled'],ready:['approved','cancelled'],approved:['signing','cancelled'],signing:['signed','cancelled']};
  if(!allowed[c.status]?.includes(next))fail('انتقال حالة العقد غير مسموح.');
  const saved=await saveLease({...c,status:next});root.previewContractV55(saved);notice.textContent='تم حفظ حالة العقد والتحقق منها.';
 }catch(e){if(notice)notice.textContent=e.message;else window.alert(e.message)}
}
function installContractFields(){
 const tenant=byId('contractTenantV55'),form=tenant?.parentElement;if(!form||byId('contractNumberV267'))return;
 for(const [id,label]of [['contractTenantV55','المستأجر'],['contractPropertyV55','العقار'],['contractUnitV55','رقم الوحدة'],['contractRentV55','قيمة الإيجار عند كتابة العقد'],['contractDepositV55','مبلغ التأمين'],['contractStartV55','بداية العقد'],['contractEndV55','نهاية العقد']]){const input=byId(id);if(!input)continue;input.required=true;input.setAttribute('aria-label',label);const wrap=document.createElement('label');wrap.textContent=label;input.before(wrap);wrap.append(input);}
 for(const [id,label,type]of [['contractNumberV267','رقم العقد','text'],['contractFloorV267','الدور','text'],['contractAdvanceV267','العربون — أدخل صفر إن لم يوجد','text'],['contractCleaningV267','رسوم النظافة — أدخل صفر إن لم توجد','text'],['contractDiscountV267','الخصم — أدخل صفر إن لم يوجد','text'],['contractReceivedV267','تاريخ ووقت استلام المستأجر للعقد — توقيت الكويت','datetime-local'],['contractAccountantV267','اسم المحاسب المسؤول','text']]){const wrap=document.createElement('label'),input=document.createElement('input');wrap.textContent=label;input.id=id;input.type=type;input.required=true;input.setAttribute('aria-label',label);input.maxLength=300;wrap.append(input);form.append(wrap);}
 const label=document.createElement('label');label.textContent='حالة تبليغ الإخلاء';const eviction=document.createElement('select');eviction.id='contractEvictionV267';eviction.setAttribute('aria-label',label.textContent);for(const value of ['غير محدد','لم يُبلّغ','تم التبليغ']){const option=document.createElement('option');option.textContent=option.value=value;eviction.append(option);}label.append(eviction);form.append(label);
 const summary=document.createElement('div');summary.id='contractTenantDetailsV267';summary.setAttribute('role','status');form.after(summary);
 const update=()=>{if(!scope()){summary.replaceChildren();return;}const index=Number(tenant.value),row=data().tenants?.[index],p=(data().tenantProfilesV267||[]).find(x=>x.id===profileRef(row));summary.replaceChildren();const textNode=document.createElement('p');textNode.textContent=p?fields.map(([k,label])=>label+': '+(p[k]||'غير مكتمل')).join(' • '):'اختر ملف مستأجر محفوظاً.';summary.append(textNode);if(p){const button=document.createElement('button');button.type='button';button.textContent='استكمال بيانات المستأجر';button.onclick=()=>openTenant(index);summary.append(button);}};
 tenant.addEventListener('change',update);root.addEventListener('aqari:auth-boundary',()=>{if(!scope()){summary.replaceChildren();for(const input of form.querySelectorAll('input'))input.value='';}});update();
}
function loadSavedContracts(){
 installContractFields();
 const body=byId('contractRowsV55');if(!body)return;
 body.replaceChildren();if(!scope())return;
 const contracts=data().contractsV202||[];
 for(const [id,statusValue]of [['contractDraftCountV55','draft'],['contractReadyCountV55','ready'],['contractSignedCountV55','signed'],['contractExpiredCountV55','expired']]){
  const count=byId(id);if(count)count.textContent=String(contracts.filter(c=>c.status===statusValue).length);
 }
 for(const c of contracts){
  const row=document.createElement('tr');
  for(const value of [c.contract_no,c.tenant||'غير مدون',c.unit,c.rent,c.source==='statement-import'&&c.status==='draft'?'محفوظ من الكشف — للمراجعة':c.status]){const td=document.createElement('td');td.textContent=String(value??'غير مدون');row.appendChild(td);}
  const cell=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='فتح الملف';button.onclick=()=>preview(c);cell.appendChild(button);row.appendChild(cell);body.appendChild(row);
 }
}
const legacyLoadContracts=root.loadContractsV55;
root.loadContractsV55=function(){
 if(root.AQARI_PUBLIC_CONFIG?.supabaseUrl==='https://ofgmcsmxmdswlovsckqs.supabase.co')return loadSavedContracts();
 return legacyLoadContracts?.apply(this,arguments);
};
Object.assign(api,{defaultClauses:()=>typeof defaultClausesV55!=='undefined'?copy(defaultClausesV55):[],contractMarkup,contractAnnexMarkup,prepareContractPrint,openTenant,openRecord,generate,status,saveLease,preview,loadSavedContracts});
})(typeof window!=='undefined'?window:globalThis);
