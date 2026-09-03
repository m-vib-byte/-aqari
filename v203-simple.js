(function(){
  'use strict';

  function v202(){return window.AQARI_V202||null}
  function activeProperty(){
    const fromApi=String(v202()?.currentProperty?.()||'').trim();
    if(fromApi)return fromApi;
    try{return String(sessionStorage.getItem('aqari_v202_property')||'').trim()}
    catch(_){return ''}
  }
  function validPeriod(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''))}
  function currentPeriod(){
    const fromApi=String(v202()?.currentPeriod?.()||'');
    if(validPeriod(fromApi))return fromApi;
    const now=new Date();
    return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  }
  function snapshot(property,period){
    const api=v202();
    if(typeof api?.rentSnapshot!=='function')return null;
    try{return api.rentSnapshot(property,validPeriod(period)?period:currentPeriod())}
    catch(_){return null}
  }
  function activeContracts(property,period){return snapshot(property,period)?.items||[]}
  function dueContracts(property,period){return snapshot(property,period)?.dueContracts||[]}
  function monthlySummary(property,period){
    const state=snapshot(property,period);
    if(!state)return {contracts:0,paidUnits:0,expected:0,paid:0,pending:0,balance:0};
    return {
      contracts:Number(state.contracts||0),paidUnits:Number(state.paidUnits||0),
      expected:Number(state.totals?.expected??state.totals?.due??0),paid:Number(state.totals?.collected??state.totals?.paid??0),
      pending:Number(state.totals?.pending||0),balance:Number(state.totals?.balance||0)
    };
  }
  function latestReceiptIndex(property,period){return Number(snapshot(property,period)?.latestReceiptIndex??-1)}
  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }
  function money(value){
    try{return Number(value||0).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(value||0)+' د.ك'}
  }
  function periodLabel(period){
    const selected=validPeriod(period)?period:currentPeriod();
    try{return new Intl.DateTimeFormat('ar-KW',{month:'long',year:'numeric'}).format(new Date(selected+'-01T12:00:00'))}
    catch(_){return selected}
  }

  function icon(path){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  }
  const icons={
    contract:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7"/>',
    wallet:'<path d="M3 6h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6M16 11h5v4h-5a2 2 0 0 1 0-4z"/>',
    receipt:'<path d="M5 2v20l3-2 3 2 2-2 3 2 3-2V2l-3 2-3-2-2 2-3-2-3 2zM8 9h8M8 13h6"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    building:'<path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6"/>'
  };
  function actionButton(action,title,copy,iconName,primary){
    return '<button type="button" class="v203-simple-action'+(primary?' is-primary':'')+'" data-v203-action="'+action+'">'+icon(icons[iconName])+'<span><strong>'+title+'</strong><small>'+copy+'</small></span></button>';
  }
  function dueMarkup(state){
    const due=Array.from(state.dueContracts||[]);
    if(!state.contracts)return '';
    const counts=diagnosticCounts(state);
    const unresolved=counts.conflicts+counts.invalid+counts.unmatched+counts.duplicates+counts.invalidPayments+counts.overpayments;
    if(!due.length)return unresolved?
      '<div class="v203-due-box is-review"><div><span>المطلوب الآن</span><strong>لا يوجد متبقٍ محسوب؛ راجع تنبيهات سلامة البيانات</strong></div></div>':
      '<div class="v203-due-box is-clear"><div><span>المطلوب الآن</span><strong>ممتاز — لا يوجد إيجار متبقٍ مسجل لهذا الشهر</strong></div></div>';
    const visible=due.slice(0,6);
    return '<section class="v203-due-box"><div class="v203-due-head"><div><span>المطلوب الآن</span><strong>'+due.length+' مستأجر / وحدة عليها متبقي</strong></div><small>اضغط على الاسم لتسجيل الإيجار مباشرة</small></div><div class="v203-due-list">'+visible.map(function(item){
      return '<button type="button" data-v203-due-contract="'+escapeHtml(item.contractId)+'"><span><strong>'+escapeHtml(item.tenant||'مستأجر غير محدد')+'</strong><small>وحدة '+escapeHtml(item.unit||'—')+(item.contractNo?' • عقد '+escapeHtml(item.contractNo):'')+'</small></span><em>'+money(item.balance)+'</em></button>';
    }).join('')+'</div>'+(due.length>visible.length?'<small class="v203-due-more">+'+(due.length-visible.length)+' أخرى تظهر في كشف الشهر</small>':'')+'</section>';
  }
  function diagnosticCounts(state){
    const diagnostics=state?.diagnostics||{};
    const count=function(name){return Array.isArray(diagnostics[name])?diagnostics[name].length:0};
    return {
      conflicts:count('conflicts'),invalid:count('invalidContracts')+count('invalidIdentityContracts'),
      unmatched:count('unmatchedPayments'),ignored:count('ignoredPayments'),duplicates:count('duplicateReceipts'),
      invalidPayments:count('invalidPayments'),overpayments:count('overpayments')
    };
  }
  function diagnosticMarkup(state){
    const counts=diagnosticCounts(state);
    const notes=[];
    if(counts.conflicts)notes.push(counts.conflicts+' تعارض عقود');
    if(counts.invalid)notes.push(counts.invalid+' عقد ناقص أو غير صالح');
    if(counts.unmatched)notes.push(counts.unmatched+' دفعة غير مطابقة');
    if(counts.ignored)notes.push(counts.ignored+' دفعة مستبعدة');
    if(counts.duplicates)notes.push(counts.duplicates+' رقم وصل مكرر');
    if(counts.invalidPayments)notes.push(counts.invalidPayments+' دفعة بمبلغ غير صالح');
    if(counts.overpayments)notes.push(counts.overpayments+' دفعة زائدة معزولة عن أرصدة الوحدات الأخرى');
    if(!notes.length)return '';
    return '<aside class="v203-data-warning" role="status"><strong>الحساب يحتاج مراجعة</strong><span>'+escapeHtml(notes.join(' • '))+'</span><small>لم تدخل السجلات المستبعدة في الإجماليات حتى لا يظهر تحصيل غير صحيح.</small></aside>';
  }
  function renderKey(state){
    return JSON.stringify({
      property:state.property,period:state.period,contracts:state.contracts,paidUnits:state.paidUnits,
      totals:state.totals,latestReceiptIndex:state.latestReceiptIndex,diagnostics:diagnosticCounts(state),
      due:Array.from(state.dueContracts||[]).map(function(item){return [item.contractId,item.balance,item.paid,item.pending]})
    });
  }
  function install(){
    const workspace=document.querySelector('#v202PropertyWorkspace > .v202-workspace')||document.querySelector('.v202-workspace');
    const property=activeProperty();
    const period=currentPeriod();
    const state=property?snapshot(property,period):null;
    if(!workspace||!state)return false;
    let strip=workspace.querySelector('.v203-simple-strip');
    if(!strip){
      strip=document.createElement('section');
      strip.className='v203-simple-strip';
      strip.setAttribute('aria-label','الإجراءات السريعة');
      const header=workspace.querySelector('.v202-workspace-head');
      if(header?.nextSibling)workspace.insertBefore(strip,header.nextSibling);
      else if(header)header.insertAdjacentElement('afterend',strip);
      else workspace.prepend(strip);
    }
    const key=renderKey(state);
    if(strip.dataset.renderKey===key)return true;
    const hasActive=state.contracts>0;
    const issueCounts=diagnosticCounts(state);
    const hasIssues=Object.values(issueCounts).some(function(count){return count>0});
    const hasBlockingIssues=issueCounts.conflicts+issueCounts.invalid+issueCounts.unmatched+issueCounts.duplicates+issueCounts.invalidPayments+issueCounts.overpayments>0;
    const latest=Number(state.latestReceiptIndex??-1);
    const expected=Number(state.totals?.expected??state.totals?.due??0);
    const paid=Number(state.totals?.collected??state.totals?.paid??0);
    const balance=Number(state.totals?.balance||0);
    const collectionTone=balance<=0&&expected>0?'is-good':paid>0?'is-progress':'is-due';
    const collectionText=expected?money(paid)+' من '+money(expected):(hasBlockingIssues?'معلّق حتى تصحيح البيانات':'لا توجد عقود فعالة');
    const balanceText=hasBlockingIssues&&expected===0?'غير محسوم':money(balance);
    strip.innerHTML=
      '<div class="v203-simple-title"><div><span>'+periodLabel(state.period)+'</span><strong>إدارة '+escapeHtml(state.property)+'</strong></div><small>'+(hasActive?'كل عمليات الشهر أمامك — سجّل الإيجار وافتح الوصل والكشف من نفس المكان':hasBlockingIssues?'صحح تعارضات العقود أو البيانات المستبعدة قبل متابعة التحصيل':'ابدأ بالعقد، وبعدها التحصيل والوصل والكشف يصيرون من نفس الشاشة')+'</small></div>'+
      '<div class="v203-month-glance">'+
        '<div><span>العقود الفعالة</span><strong>'+Number(state.contracts||0)+'</strong></div>'+
        '<div><span>تم تحصيل وحدات</span><strong>'+Number(state.paidUnits||0)+'</strong></div>'+
        '<div class="'+collectionTone+'"><span>تحصيل الشهر</span><strong>'+collectionText+'</strong></div>'+
        '<div class="'+(hasBlockingIssues?'is-review':balance>0?'is-due':'is-good')+'"><span>المتبقي</span><strong>'+balanceText+'</strong></div>'+
      '</div>'+diagnosticMarkup(state)+dueMarkup(state)+
      '<div class="v203-simple-actions">'+
        actionButton('contract','عقد جديد','إنشاء وربط العقد','contract',!hasActive&&!hasBlockingIssues)+
        actionButton('payment','تسجيل إيجار','تحصيل + وصل مباشرة','wallet',hasActive)+
        actionButton('receipt','آخر وصل',latest>=0?'فتح آخر إيصال مسجل':'لا يوجد وصل حتى الآن','receipt',false)+
        actionButton('statement','كشف الشهر','كشف ضحاوي للطباعة','chart',false)+
        actionButton('profile','الملف الكامل','العقار 360°','building',false)+
      '</div>';
    strip.dataset.renderKey=key;
    const original=workspace.querySelector('.v202-actions');
    if(original){original.classList.add('v203-original-actions');original.setAttribute('aria-hidden','true')}
    return true;
  }

  function forward(action,source){
    const api=v202();
    if(!api)return;
    const period=currentPeriod();
    return api.runAction?.(action,{period:period,trigger:source});
  }
  function openDue(contractId,source){
    return v202()?.runAction?.('payment',{contractId:contractId,period:currentPeriod(),trigger:source});
  }

  document.addEventListener('click',function(event){
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const due=target.closest('[data-v203-due-contract]');
    if(due){event.preventDefault();openDue(due.getAttribute('data-v203-due-contract'),due);return}
    const button=target.closest('[data-v203-action]');
    if(button){event.preventDefault();forward(button.getAttribute('data-v203-action'),button)}
  });
  document.addEventListener('aqari:v202:workspace-rendered',install);

  function publishExperienceMeta(){
    let meta=document.querySelector('meta[name="aqari-experience"]');
    if(!meta&&document.head){meta=document.createElement('meta');meta.name='aqari-experience';document.head.appendChild(meta)}
    if(meta)meta.content='V203-simple';
  }
  function boot(){document.body.classList.add('aq-v203-simple');publishExperienceMeta();install()}
  window.AQARI_V203=Object.freeze({
    version:'V203-simple',activeProperty:activeProperty,activeContracts:activeContracts,
    dueContracts:dueContracts,monthlySummary:monthlySummary,latestReceiptIndex:latestReceiptIndex,install:install
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
