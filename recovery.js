(function(){
  'use strict';
  const api=window.AQARI_SUPABASE;
  const byId=id=>document.getElementById(id);
  const roles=new Set(['general_manager','property_manager','accountant','viewer']);
  let generation=0,flight=0,active=null,primary=null,paused=false,lastVerified=0;

  function text(value){return typeof value==='string'||typeof value==='number'?String(value):'';}
  function access(context){
    const userId=text(context?.user?.id),workspaceId=text(context?.workspace?.id),member=context?.membership;
    if(!userId||!workspaceId||member?.user_id!==userId||member?.workspace_id!==workspaceId||member?.is_active!==true||!roles.has(member?.role)||context?.profile?.user_id!==userId)throw new Error('ACCESS_DENIED');
    return {userId,workspaceId,role:member.role};
  }
  function same(a,b){return Boolean(a&&b&&a.userId===b.userId&&a.workspaceId===b.workspaceId&&a.role===b.role);}
  function setStatus(message,bad){const node=byId('status');node.textContent=message;node.classList.toggle('error',Boolean(bad));}
  function busy(value){byId('loginButton').disabled=value;byId('retryButton').disabled=value;byId('refreshButton').disabled=value;}
  function lock(message,phase='login'){
    generation+=1;active=null;primary=null;
    document.documentElement.classList.remove('aqari-auth-unlocked');
    byId('home').hidden=true;byId('home').setAttribute('aria-hidden','true');
    byId('aqariCloudGateV168').hidden=false;byId('aqariCloudGateV168').setAttribute('data-auth-phase',phase);
    for(const id of ['workspaceName','accountLabel','cloudRevision','summary','propertiesTable','tenantsTable','ledgerTable'])byId(id).replaceChildren();
    byId('propertyFilter').replaceChildren();
    byId('retryButton').hidden=phase!=='error';
    setStatus(message,phase==='error');
    return generation;
  }
  function stage(value,message){byId('aqariCloudGateV168').setAttribute('data-auth-stage',value);setStatus(message,false);}
  function bounded(promise,deadline){
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('RECOVERY_TIMEOUT')),Math.max(0,deadline-Date.now()));});
    return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
  }
  function errorMessage(error){
    if(/invalid login credentials/i.test(error?.message||''))return 'البريد أو كلمة المرور غير صحيحة.';
    if(error?.message==='RECOVERY_TIMEOUT'||error?.code==='AQARI_STARTUP_TIMEOUT')return 'لم يكتمل فتح البيانات خلال المهلة. بقيت البيانات محجوبة؛ يمكنك إعادة المحاولة هنا.';
    if(error?.message==='ACCESS_DENIED'||error?.code==='AQARI_ACCESS_CHANGED')return 'تعذر تأكيد الحساب ومساحة العمل والصلاحية. لم تُعرض أي بيانات.';
    return 'تعذر إكمال الاتصال الآمن. لم تُغيّر أي بيانات؛ يمكنك إعادة فحص الجلسة أو تسجيل الدخول.';
  }
  function decode(payload){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return {};
    if(payload.format==='aqari-cloud-state-v1')return payload.snapshot?.values?.aqari_v30||{};
    if(payload.schema==='aqari-local-snapshot-v1')return payload.values?.aqari_v30||{};
    return payload;
  }
  function rows(key){return Array.isArray(primary?.[key])?primary[key]:[];}
  function table(id,headers,records){
    const root=byId(id);root.replaceChildren();
    if(!records.length){const note=document.createElement('p');note.textContent='لا توجد سجلات في النسخة السحابية لهذا القسم.';root.appendChild(note);return;}
    const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr'),tbody=document.createElement('tbody');
    for(const heading of headers){const th=document.createElement('th');th.scope='col';th.textContent=heading;tr.appendChild(th);}
    thead.appendChild(tr);table.appendChild(thead);
    for(const record of records){const row=document.createElement('tr');for(const value of record){const td=document.createElement('td');td.textContent=text(value)||'—';row.appendChild(td);}tbody.appendChild(row);}
    table.appendChild(tbody);root.appendChild(table);
  }
  function renderTenants(){
    if(!active||!primary)return;
    try{if(!same(active,access(api.context)))throw new Error('ACCESS_DENIED');}catch{lock('تغيّرت الجلسة؛ سجّل الدخول من جديد.','error');return;}
    const selected=byId('propertyFilter').value;
    const directory=rows('tenantDirectoryV202').filter(record=>record&&typeof record==='object'&&!Array.isArray(record));
    if(directory.length){
      table('tenantsTable',['العقار','الوحدة','المستأجر','رقم العقد'],directory.filter(row=>!selected||text(row.property)===selected).slice(0,250).map(row=>[row.property,row.unit,row.tenant,row.contractNo||row.contract_no]));
    }else{
      table('tenantsTable',['المستأجر','العقار','القيمة المسجلة','الحالة المسجلة'],rows('tenants').filter(Array.isArray).filter(row=>!selected||text(row[1])===selected).slice(0,250).map(row=>row.slice(0,4)));
    }
  }
  function render(context,remote){
    primary=decode(remote?.payload);
    if(!primary||typeof primary!=='object'||Array.isArray(primary))throw new Error('INVALID_DATA');
    byId('workspaceName').textContent=text(context.workspace.name)||'مساحة العمل';
    byId('accountLabel').textContent=text(context.profile.display_name)||text(context.user.email)||'حساب مصرح';
    byId('cloudRevision').textContent=remote?'نسخة السحابة: '+text(remote.revision)+' — عرض للقراءة فقط':'لم تُحفظ بيانات سحابية لهذه المساحة بعد.';
    const properties=rows('properties').filter(Array.isArray),directory=rows('tenantDirectoryV202'),ledger=rows('rentLedgerV202');
    const summary=byId('summary');summary.replaceChildren();
    for(const [label,count] of [['سجلات العقارات',properties.length],['سجلات المستأجرين',directory.length||rows('tenants').length],['سجلات الإيجارات',ledger.length]]){
      const card=document.createElement('div'),title=document.createElement('span'),value=document.createElement('strong');card.className='stat';title.textContent=label;value.textContent=String(count);card.append(title,value);summary.appendChild(card);
    }
    table('propertiesTable',['العقار','الموقع المسجل','الوحدات المسجلة','الدخل المسجل'],properties.slice(0,250).map(row=>row.slice(0,4)));
    const filter=byId('propertyFilter'),all=document.createElement('option');filter.replaceChildren();all.value='';all.textContent='جميع العقارات';filter.appendChild(all);
    const names=new Set(properties.map(row=>text(row[0])));
    directory.forEach(row=>{if(row&&typeof row==='object')names.add(text(row.property));});
    for(const name of Array.from(names).filter(Boolean).slice(0,500)){const option=document.createElement('option');option.value=name;option.textContent=name;filter.appendChild(option);}
    renderTenants();
    table('ledgerTable',['العقار','الوحدة','المستأجر','الفترة','المستحق','المدفوع','المتبقي','الوصل','الحالة'],ledger.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)).slice(-120).reverse().map(row=>[row.property,row.unit,row.tenant,row.period,row.due,row.paid,row.balance,row.receiptNo,row.status]));
  }
  async function open(credentials){
    if(flight)return;
    paused=false;
    const ticket=lock('جاري التحقق من الجلسة…','restoring'),deadline=Date.now()+16000;
    flight=ticket;busy(true);
    try{
      if(!api)throw new Error('ADAPTER_UNAVAILABLE');
      if(credentials){
        const client=await bounded(api.getClient(),deadline);
        const result=await bounded(client.auth.signInWithPassword(credentials),deadline);
        if(result.error)throw result.error;
        byId('password').value='';
      }
      const context=await bounded(api.refreshContext(),deadline);
      if(ticket!==generation)return;
      if(!context.user){paused=true;lock('أدخل البريد وكلمة المرور للدخول إلى النسخة السحابية.');return;}
      const expected=access(context);
      stage('data','تم التحقق من الحساب؛ جاري تأكيد الوصول إلى البيانات…');
      const remote=await bounded(api.loadAppState(expected,{reuseVerifiedContext:true}),deadline);
      if(ticket!==generation)return;
      if(!same(expected,access(api.context))||(remote&&remote.workspace_id!==expected.workspaceId))throw new Error('ACCESS_DENIED');
      active=expected;
      render(context,remote);
      if(ticket!==generation||!same(expected,access(api.context)))return;
      lastVerified=Date.now();
      byId('home').hidden=false;byId('home').setAttribute('aria-hidden','false');
      document.documentElement.classList.add('aqari-auth-unlocked');
      byId('aqariCloudGateV168').setAttribute('data-auth-phase','ready');
      byId('aqariCloudGateV168').setAttribute('data-auth-stage','ready');
      byId('aqariCloudGateV168').hidden=true;
    }catch(error){if(ticket===generation){paused=true;lock(errorMessage(error),'error');}}
    finally{if(flight===ticket){flight=0;busy(false);}}
  }
  async function logout(){
    paused=true;flight=0;lock('جاري تسجيل الخروج…');busy(true);
    try{await bounded(api.signOut(),Date.now()+12000);lock('تم تسجيل الخروج.');}
    catch{lock('تعذر إكمال تسجيل الخروج؛ بقيت البيانات محجوبة.','error');}
    finally{busy(false);}
  }
  byId('recoveryForm').addEventListener('submit',event=>{event.preventDefault();if(byId('recoveryForm').reportValidity())open({email:byId('email').value.trim(),password:byId('password').value});});
  byId('retryButton').addEventListener('click',()=>open());
  byId('refreshButton').addEventListener('click',()=>open());
  byId('logoutButton').addEventListener('click',logout);
  byId('propertyFilter').addEventListener('change',renderTenants);
  window.addEventListener('pagehide',()=>{paused=true;flight=0;lock('يلزم إعادة التحقق من الجلسة.');});
  window.addEventListener('pageshow',event=>{if(event.persisted)open();});
  window.addEventListener('focus',()=>{if(active&&!flight&&Date.now()-lastVerified>60000)open();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active&&!flight)open();});
  window.AQARI_RECOVERY=Object.freeze({version:'V266-RECOVERY-1',readOnly:true});
  if(!api){paused=true;lock('تعذر تحميل مكتبة الاتصال الآمن. أعد تحميل هذه الصفحة.','error');return;}
  api.onAuthStateChange((event,session)=>{
    // Defer SDK work: never acquire its auth lock inside its callback.
    setTimeout(()=>{
      if(event==='SIGNED_OUT'){paused=true;flight=0;lock('تم تسجيل الخروج.');busy(false);return;}
      if(active&&!flight&&session?.user){lock('تغيّرت الجلسة؛ جاري إعادة التحقق…');if(!paused)open();}
    },0);
  }).catch(()=>{paused=true;flight=0;lock('تعذر تفعيل مراقبة الجلسة. أعد المحاولة.','error');busy(false);});
  open();
})();
