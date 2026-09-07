(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=message=>{throw new Error(message)};
const text=x=>String(x??'').normalize('NFKC').trim();
const digits=x=>text(x).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
const key=x=>digits(x).toLowerCase();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function date(value){const s=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('أدخل تاريخاً صحيحاً.');return s}
function amount(value){const s=digits(value).replace('٫','.');if(!/^\d+(\.\d{1,3})?$/.test(s)||!Number.isSafeInteger(Math.round(Number(s)*1000)))fail('أدخل مبلغاً صحيحاً بدقة ثلاثة منازل كحد أقصى.');return Number(s)}
function profile(input,others=[]){
 const p={};for(const field of ['id','nameAr','nameEn','civilId','phone','email','nationality','address'])p[field]=text(input[field]);
 p.civilId=digits(p.civilId);p.phone=digits(p.phone).replace(/[ ()-]/g,'');
 if(!p.id||!p.nameAr||!p.nameEn||!p.nationality||!/^\d{12}$/.test(p.civilId)||!/^\+?\d{8,15}$/.test(p.phone))fail('أكمل الاسم العربي والإنجليزي والجنسية والرقم المدني من ١٢ رقماً والهاتف.');
 if(Object.values(p).some(v=>v.length>300)||p.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))fail('راجع أطوال البيانات والبريد الإلكتروني.');
 if(others.some(x=>x.id!==p.id&&digits(x.civilId)===p.civilId))fail('الرقم المدني مسجل لمستأجر آخر. افتح الملف الموجود.');
 p.attachments=copy(input.attachments||[]);return p;
}
function lease(input,existing,profiles,properties){
 const c=copy(input);c.contract_no=text(c.contract_no);c.property=text(c.property);c.unit=digits(c.unit);c.start_date=date(c.start_date);c.end_date=date(c.end_date);c.rent=amount(c.rent);c.deposit=amount(c.deposit);
 const tenant=profiles.find(p=>p.id===c.tenantId);if(!tenant)fail('احفظ ملف المستأجر الكامل أولاً.');profile(tenant,profiles);
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
 c.tenant=tenant.nameAr;c.tenantProfile=copy(tenant);c.source='v267-cloud';return c;
}
function primary(payload){
 const p=payload?.format==='aqari-cloud-state-v1'?payload.snapshot?.values?.aqari_v30:payload?.schema==='aqari-local-snapshot-v1'?payload.values?.aqari_v30:payload;
 if(!p||typeof p!=='object'||Array.isArray(p))fail('تعذرت قراءة بيانات مساحة العمل.');return p;
}
function createStore(options){
 let busy=false,uncertain=false;
 return {async change(keys,mutate,verify){
  if(busy||uncertain)fail(uncertain?'تحديث الصفحة مطلوب للتحقق من نتيجة الحفظ السابقة.':'انتظر اكتمال الحفظ الحالي.');
  const scope=options.scope();if(!scope)fail('صلاحية الكتابة غير متاحة.');
  const check=()=>{if(!same(scope,options.scope()))fail('تغيّرت جلسة الدخول. لم يتم عرض بيانات الحساب السابق.');};
  let sent=false;busy=true;
  try{
   const cloud=await options.load(scope);check();const payload=copy(cloud.payload),data=primary(payload),local=options.local();
   for(const k of keys)if(!same(data[k]||[],local[k]||[]))fail('تغيّرت البيانات أو توجد تعديلات محلية. حدّث الصفحة قبل الحفظ.');
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
const api={profile,lease,primary,createStore,date,amount,key};
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
const esc=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const byId=id=>document.getElementById(id);
const profileRef=row=>Array.isArray(row)?row.find(x=>x&&typeof x==='object'&&x.aqariTenantProfileV267)?.aqariTenantProfileV267||row[4]:null;
function contractMarkup(c,count){
 return Array.from({length:count},(_,i)=>'<article class="v267-contract-copy"><p>AQARI V267 • نسخة '+(i+1)+' من '+count+'</p><h2>عقد إيجار '+esc(c.contract_no)+'</h2><p>حالة العقد: '+esc(({draft:'مسودة',ready:'جاهز للمراجعة',approved:'مراجع',signing:'بانتظار التوقيع',signed:'موقّع',cancelled:'ملغى',expired:'منتهي'})[c.status]||c.status)+'</p><h3>'+esc(c.property)+' — الوحدة '+esc(c.unit)+'</h3><p>المستأجر: '+esc(c.tenant)+' / '+esc(c.tenantProfile?.nameEn)+'</p><p>الرقم المدني: '+esc(c.tenantProfile?.civilId)+' • الهاتف: '+esc(c.tenantProfile?.phone)+'</p><p>الجنسية: '+esc(c.tenantProfile?.nationality)+'</p><p>الإيجار الشهري: '+esc(c.rent)+' د.ك • التأمين: '+esc(c.deposit)+' د.ك</p><p>من '+esc(c.start_date)+' إلى '+esc(c.end_date)+'</p>'+(c.clauses||[]).map((x,n)=>'<p><b>'+(n+1)+'. '+esc(x.title)+'</b><br>'+esc(x.text)+'</p>').join('')+'<p>توقيع المؤجر: ____________________</p><p>توقيع المستأجر: ____________________</p></article>').join('');
}
function preview(c){
 if(!scope())return false;
 const target=byId('contractPreviewV55');if(!target)return false;
 target.innerHTML=contractMarkup(c,1);
 for(const [count,label]of [[1,'عرض وطباعة نسخة'],[2,'توليد نسختين من نفس العقد']]){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=()=>{
   const saved=(data().contractsV202||[]).find(x=>String(x.id)===String(c.id));
   if(!scope()||!saved)return window.alert('احفظ العقد في السحابة أولاً.');
   root.AQARI_V202?.showContractCopies(saved.id,count,contractMarkup(saved,count));
  };target.appendChild(button);
 }
 if(c.status==='draft'){const b=document.createElement('button');b.type='button';b.textContent='جاهز للمراجعة';b.onclick=()=>status(c.id,'ready');target.appendChild(b)}
 return true;
}
const fields=[['nameAr','الاسم الكامل بالعربي','text'],['nameEn','الاسم بالإنجليزي','text'],['civilId','الرقم المدني','text'],['phone','الهاتف','tel'],['email','البريد الإلكتروني — اختياري','email'],['nationality','الجنسية','text'],['address','العنوان — اختياري','text']];
const attachmentKinds=[['civilFront','البطاقة المدنية — الوجه'],['civilBack','البطاقة المدنية — الخلف'],['marriage','عقد الزواج'],['extra','مرفقات إضافية']];
async function upload(file,kind,tenantId,bound){
 const types=['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
 if(!types.includes(file.type)||file.size<=0||file.size>25*1024*1024)fail('المرفق يجب أن يكون صورة أو PDF أو Word وألا يتجاوز ٢٥ ميجابايت.');
 const check=()=>{if(!same(bound,scope()))fail('تغيّرت جلسة الدخول أثناء الرفع.');};check();
 const client=await root.AQARI_SUPABASE.getClient();check();
 const reserved=await bounded(()=>client.rpc('aqari_reserve_document',{p_workspace_id:bound.workspaceId,p_document_type:'tenant_attachment',p_entity_type:'other',p_entity_ref:tenantId,p_title:kind,p_original_filename:file.name,p_mime_type:file.type,p_metadata:{release:'V267',tenantProfileId:tenantId,attachmentKind:kind}}));check();if(reserved.error)throw reserved.error;
 const doc=Array.isArray(reserved.data)?reserved.data[0]:reserved.data;if(!doc?.document_id||doc.storage_bucket!=='aqari-documents'||!doc.storage_path.startsWith(bound.workspaceId+'/'))fail('تعذر حجز المرفق.');
 const uploaded=await bounded(()=>client.storage.from(doc.storage_bucket).upload(doc.storage_path,file,{contentType:file.type,upsert:false}));check();if(uploaded.error)throw uploaded.error;
 const finalized=await bounded(()=>client.rpc('aqari_finalize_document',{p_document_id:doc.document_id,p_size_bytes:file.size,p_mime_type:file.type}));check();if(finalized.error)throw finalized.error;
 return {id:doc.document_id,bucket:doc.storage_bucket,path:doc.storage_path,name:file.name,kind,size:file.size};
}
function openTenant(index){
 if(!scope())return false;
 const row=Number.isInteger(index)?data().tenants?.[index]:null;
 const existing=(data().tenantProfilesV267||[]).find(p=>p.id===profileRef(row));
 const p=copy(existing||{id:crypto.randomUUID(),nameAr:row?.[0]||'',attachments:[]});
 const modal=byId('modal');byId('mt').textContent='ملف المستأجر • AQARI V267';
 byId('fields').innerHTML='<div class="v267-tenant-form">'+fields.map(([k,label,type])=>'<label>'+label+'<input id="v267Tenant_'+k+'" type="'+type+'" value="'+esc(p[k])+'" '+(k==='civilId'?'inputmode="numeric" maxlength="12"':'')+' autocomplete="off"></label>').join('')+attachmentKinds.map(([k,label])=>'<label>'+label+'<input id="v267File_'+k+'" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" '+(k==='extra'?'multiple':'')+'></label>').join('')+'<div id="v267TenantAttachments"></div><p id="v267TenantStatus" role="status" aria-live="polite"></p></div>';
 const list=byId('v267TenantAttachments');
 for(const a of p.attachments){const b=document.createElement('button');b.type='button';b.textContent='عرض '+a.name;b.onclick=async()=>{try{const s=scope();if(!s||!a.path.startsWith(s.workspaceId+'/'))return;const client=await root.AQARI_SUPABASE.getClient();const r=await bounded(()=>client.storage.from(a.bucket).createSignedUrl(a.path,60));if(r.error)throw r.error;if(same(s,scope())&&r.data?.signedUrl){const link=document.createElement('a');link.href=r.data.signedUrl;link.target='_blank';link.rel='noopener';link.textContent='فتح '+a.name;byId('v267TenantStatus').replaceChildren(link)}}catch(_){byId('v267TenantStatus').textContent='تعذر فتح المرفق.'}};list.appendChild(b)}
 let saving=false;const uploadedFiles=new Map();
 byId('saveBtn').onclick=async()=>{
  if(saving)return;saving=true;const button=byId('saveBtn'),status=byId('v267TenantStatus'),bound=scope();button.disabled=true;
  try{
   for(const [k]of fields)p[k]=byId('v267Tenant_'+k).value;
   profile(p,data().tenantProfilesV267||[]);
   const uploads=attachmentKinds.flatMap(([kind])=>Array.from(byId('v267File_'+kind).files||[]).map(file=>({kind,file})));
   if(uploads.length>12)fail('يمكن رفع ١٢ مرفقاً في العملية الواحدة.');
   status.textContent='جاري حفظ المرفقات والملف والتحقق منهما…';
   for(const {kind,file}of uploads){if(uploadedFiles.has(file))continue;const attachment=await upload(file,kind,p.id,bound);p.attachments.push(attachment);uploadedFiles.set(file,attachment);}
   for(const [kind]of attachmentKinds)byId('v267File_'+kind).value='';
   if(!same(bound,scope()))fail('تغيّرت جلسة الدخول. أعد فتح الملف.');
   await store.change(['tenants','tenantProfilesV267','tenantDirectoryV202','audit'],cloud=>{
    const profiles=cloud.tenantProfilesV267||[];const next=profile(p,profiles),at=profiles.findIndex(x=>x.id===p.id);
    if((cloud.tenantDirectoryV202||[]).some(x=>digits(x.civilId)===next.civilId&&key(x.tenant)!==key(next.nameAr)))fail('الرقم المدني مرتبط باسم مستأجر آخر في سجل الوحدات. راجع الملف الموجود.');
    if(at<0)profiles.push(next);else profiles[at]=next;cloud.tenantProfilesV267=profiles;
    const rows=cloud.tenants||[];const original=Number.isInteger(index)?rows[index]:null;
    if(row&&!same(row,original))fail('تغيّر سجل المستأجر. حدّث الصفحة.');
    if(original){const updated=copy(original);updated[0]=next.nameAr;if(!updated[4])updated[4]=next.id;else if(profileRef(updated)!==next.id)updated.push({aqariTenantProfileV267:next.id});rows[index]=updated;}else rows.push([next.nameAr,'','','نشط',next.id]);cloud.tenants=rows;
    cloud.audit=(cloud.audit||[]).concat([['المدير','حفظ ملف مستأجر',next.id,new Date().toISOString()]]);return next;
   },(cloud,saved)=>(cloud.tenantProfilesV267||[]).some(x=>same(x,saved))&&(cloud.tenants||[]).some(x=>profileRef(x)===saved.id));
   modal.classList.remove('on');if(typeof render==='function')render();
  }catch(e){status.textContent=e.message||'تعذر حفظ ملف المستأجر.'}finally{button.disabled=false;saving=false}
 };
 modal.classList.add('on');return true;
}
async function saveLease(input){
 if(root.AQARI_V202?.canCreateContract(input.property)!==true)fail('هذا العقار غير متاح للكتابة في هذه المعاينة.');
 const keys=['contractsV202','tenantProfilesV267','tenantDirectoryV202','properties','leases','audit'];
 const saved=await store.change(keys,cloud=>{
  const old=cloud.contractsV202||[],profiles=cloud.tenantProfilesV267||[];
  const legacy=typeof localContractsV55==='function'?localContractsV55():[];
  const c=lease(input,old.concat(legacy),profiles,cloud.properties||[]),i=old.findIndex(x=>String(x.id)===String(c.id));
  if(i<0)old.push(c);else old[i]=c;cloud.contractsV202=old;
  const p=profiles.find(x=>x.id===c.tenantId);
  const directory=(cloud.tenantDirectoryV202||[]).filter(x=>x.contractNo!==c.contract_no);
  directory.push({property:c.property,unit:c.unit,tenant:p.nameAr,contractNo:c.contract_no,phone:p.phone,nationality:p.nationality,civilId:p.civilId,email:p.email,source:'v267-cloud',verified:c.status==='signed',tenantProfileId:p.id});cloud.tenantDirectoryV202=directory;
  const leases=(cloud.leases||[]).filter(x=>x[4]!==c.id);leases.push([c.tenant,c.unit,c.rent,c.end_date,c.id]);cloud.leases=leases;
  cloud.audit=(cloud.audit||[]).concat([['المدير','حفظ عقد '+c.status,c.contract_no,new Date().toISOString()]]);return c;
 },(cloud,c)=>(cloud.contractsV202||[]).some(x=>same(x,c)));
 if(typeof loadContractsV55==='function')loadContractsV55();if(typeof renderWorkflowV56==='function')renderWorkflowV56();return saved;
}
async function generate(){
 const notice=byId('contractNotesV55');try{
  const tenant=data().tenants?.[Number(byId('contractTenantV55').value)],property=data().properties?.[Number(byId('contractPropertyV55').value)];
  if(!tenant||!property)fail('اختر المستأجر والعقار.');
  const id=Date.now()*1024+crypto.getRandomValues(new Uint16Array(1))[0]%1024;
  notice.textContent='جاري حفظ العقد والتحقق منه…';
  const c=await saveLease({id,contract_no:'AQ-LEASE-'+id,tenantId:profileRef(tenant),property:property[0],unit:byId('contractUnitV55').value,rent:byId('contractRentV55').value,deposit:byId('contractDepositV55').value||'0',start_date:byId('contractStartV55').value,end_date:byId('contractEndV55').value,language:byId('contractLangV55').value,status:'draft',clauses:typeof defaultClausesV55!=='undefined'?copy(defaultClausesV55):[]});
  notice.textContent='تم حفظ المسودة والتحقق من وجودها في السحابة. أكمل دورة التوقيع قبل التحصيل.';root.previewContractV55(c);
 }catch(e){notice.textContent=e.message||'تعذر حفظ العقد.'}
}
async function status(id,next){
 const notice=byId('contractNotesV55');try{
  const c=(data().contractsV202||[]).find(x=>String(x.id)===String(id));if(!c||c.source!=='v267-cloud')fail('هذا العقد ليس من مسار V267 المحفوظ. يلزم مراجعته قبل تغيير حالته.');
  const allowed={draft:['ready','cancelled'],ready:['approved','cancelled'],approved:['signing','cancelled'],signing:['signed','cancelled']};
  if(!allowed[c.status]?.includes(next))fail('انتقال حالة العقد غير مسموح.');
  const saved=await saveLease({...c,status:next});root.previewContractV55(saved);notice.textContent='تم حفظ حالة العقد والتحقق منها.';
 }catch(e){if(notice)notice.textContent=e.message;else window.alert(e.message)}
}
Object.assign(api,{openTenant,generate,status,saveLease,preview});
})(typeof window!=='undefined'?window:globalThis);
