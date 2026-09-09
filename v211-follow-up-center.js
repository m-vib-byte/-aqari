(function(){
  'use strict';

  const DESIGN='V211.0.1-action-epoch-hotfix+V211.1-follow-up-cloud';
  const CORE_DESIGN='V211-follow-up-center';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const ACTIONS=new Set(['statement','contract','receipt','payment']);
  const EVENT_ACTION=Object.freeze({statement:'statement_opened',contract:'contract_opened',receipt:'receipt_opened',payment:'collection_opened'});
  const TIMELINE_LABEL=Object.freeze({reminder_copied:'نُسخ تذكير',statement_opened:'فُتح الكشف',contract_opened:'فُتح العقد',receipt_opened:'فُتح الوصل',collection_opened:'فُتح التحصيل',reviewed:'تمت المراجعة'});
  let actionEpoch=0;
  let timelineEpoch=0;

  function text(value){return String(value==null?'':value).trim()}
  function number(value){const result=Number(value);return Number.isFinite(result)?result:0}
  function norm(value){return text(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('ar')}
  function identity(value){if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';return value}
  function money(value){try{return number(value).toLocaleString('ar-KW',{maximumFractionDigits:3})+' د.ك'}catch(_){return String(number(value))+' د.ك'}}
  function periodLabel(value,locale){try{return new Intl.DateTimeFormat(locale||'ar-KW',{month:'long',year:'numeric'}).format(new Date(value+'-01T12:00:00'))}catch(_){return value}}
  function coreShouldSkip(action){if(action==='reminder')return true;return false}

  function accessScope(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=identity(context?.user?.id),workspaceId=identity(context?.workspace?.id),membership=context?.membership,role=identity(membership?.role);
      if(!userId||!workspaceId||!role||membership?.is_active!==true||identity(membership?.user_id)!==userId||identity(membership?.workspace_id)!==workspaceId)return null;
      const dataScope=window.AQARI_DATA_GATE?.scope,storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
      if(identity(dataScope?.userId)!==userId||identity(dataScope?.workspaceId)!==workspaceId||identity(storageScope?.userId)!==userId||identity(storageScope?.workspaceId)!==workspaceId)return null;
      return Object.freeze({userId,workspaceId,role,key:userId+'\u0000'+workspaceId+'\u0000'+role});
    }catch(_){return null}
  }
  function parseVisibleSelection(button){
    const access=accessScope(),row=button?.closest?.('.v211-row'),panel=button?.closest?.('#v211FollowUpCenter');
    const period=text(panel?.querySelector?.('#v211Period')?.value),property=text(row?.querySelector?.('.v211-person > span')?.textContent),tenant=text(row?.querySelector?.('.v211-person > strong')?.textContent),detail=text(row?.querySelector?.('.v211-person > small')?.textContent);
    if(!access||!row||!panel||!PERIOD.test(period)||!property||!tenant||!detail.startsWith('وحدة '))return null;
    const parts=detail.slice('وحدة '.length).split(' • ');if(parts.length!==2)return null;
    const unit=text(parts[0]),contractLabel=text(parts[1]),contractNo=contractLabel==='بدون رقم عقد'?'':contractLabel;if(!unit)return null;
    return {access,scope:access.key,period,property,tenant,unit,contractNo,row};
  }
  function liveRecord(selection){
    const access=accessScope();if(!selection||!access||access.key!==selection.scope||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    let data=null;try{data=window.AQARI_V202.rentOfficeData(selection.property,selection.period)}catch(_){data=null}
    if(!data||norm(data.property)!==norm(selection.property)||text(data.period)!==selection.period||!Array.isArray(data.records))return null;
    const matches=data.records.filter(record=>text(record?.tenant)===selection.tenant&&text(record?.unit)===selection.unit&&text(record?.contractNo)===selection.contractNo&&text(record?.key));
    if(matches.length!==1)return null;return {data,record:matches[0]};
  }
  function statusOf(live){
    const record=live?.record,data=live?.data;if(!record||!data)return 'readonly';
    if(number(record.pending)>0||['قيد المراجعة','يحتاج مراجعة'].includes(text(record.paymentStatus)))return 'pending';
    if(record.hasContract!==true)return 'unlinked';
    if(number(record.balance)>0&&record.billable===true&&record.collectible===true&&data.canRecordPayment===true)return 'due';
    if(number(record.balance)>0)return 'readonly';return 'resolved';
  }
  function cloudAppend(selection,current,actionKind){
    const access=accessScope();if(!access||access.key!==selection.scope||typeof window.AQARI_FOLLOW_UP_CLOUD?.append!=='function')return Promise.resolve(false);
    return Promise.resolve(window.AQARI_FOLLOW_UP_CLOUD.append({recordKey:text(current?.record?.key),period:selection.period,actionKind,state:statusOf(current)},access)).then(()=>true).catch(()=>false);
  }
  function reminderText(selection,current){
    const balance=Math.max(0,number(current?.record?.balance));
    return ['السلام عليكم،','نذكّركم بمراجعة إيجار '+periodLabel(selection.period,'ar-KW')+' للعقار '+selection.property+' – الوحدة '+selection.unit+'.','المبلغ المتبقي حسب السجل الحالي: '+money(balance)+'.','يرجى مراجعة السداد أو التواصل مع إدارة العقار إذا تم السداد.','','Hello,','This is a reminder to review the '+periodLabel(selection.period,'en-GB')+' rent for '+selection.property+' – unit '+selection.unit+'.','Current outstanding balance shown in the property record: '+money(balance)+'.','Please review the payment or contact property management if it has already been paid.'].join('\n');
  }
  async function executeReminder(selection,button){
    const current=liveRecord(selection);if(!current||number(current.record?.balance)<=0||typeof navigator?.clipboard?.writeText!=='function')return false;
    try{await navigator.clipboard.writeText(reminderText(selection,current));await cloudAppend(selection,current,'reminder_copied');const old=button.textContent;button.textContent='تم النسخ';setTimeout(()=>{if(button?.isConnected)button.textContent=old},1400);hydrateTimeline(selection.row,selection,current);return true}catch(_){return false}
  }
  function executeAction(selection,action,trigger){
    const access=accessScope();if(!selection||!access||access.key!==selection.scope||!ACTIONS.has(action)||typeof window.AQARI_V202?.openProperty!=='function'||typeof window.AQARI_V202?.rentOfficeAction!=='function')return false;
    if(!liveRecord(selection))return false;
    const token=++actionEpoch;let opened=false;try{opened=window.AQARI_V202.openProperty(selection.property,selection.period)!==false}catch(_){opened=false}if(!opened)return false;
    let attempts=0;
    const follow=function(){
      const currentAccess=accessScope();if(token!==actionEpoch||!currentAccess||currentAccess.key!==selection.scope)return;
      attempts+=1;const current=liveRecord(selection);if(!current)return;
      const workspace=document.getElementById('v202PropertyWorkspace'),title=document.getElementById('v202PropertyTitle');
      if(workspace?.classList.contains('on')&&(!title||norm(title.textContent)===norm(selection.property))){
        let ok=false;try{ok=window.AQARI_V202.rentOfficeAction(selection.property,current.record.key,selection.period,action,trigger)===true}catch(_){ok=false}
        if(ok===true)cloudAppend(selection,current,EVENT_ACTION[action]);
        if(ok===true)window.AQARI_V211?.close?.();
        return;
      }
      if(attempts<14)setTimeout(follow,70);
    };
    setTimeout(follow,70);return true;
  }
  async function hydrateTimeline(row,selection,current){
    const token=timelineEpoch,access=accessScope();if(!row?.isConnected||!selection||!current||!access||access.key!==selection.scope||typeof window.AQARI_FOLLOW_UP_CLOUD?.list!=='function')return false;
    let events=[];try{events=await window.AQARI_FOLLOW_UP_CLOUD.list({recordKey:text(current.record?.key),period:selection.period,limit:1},access)}catch(_){events=[]}
    if(token!==timelineEpoch||!row.isConnected||accessScope()?.key!==selection.scope)return false;
    let target=row.querySelector('[data-v211-cloud-timeline]');if(!target){target=document.createElement('small');target.setAttribute('data-v211-cloud-timeline','');target.style.display='block';target.style.marginTop='4px';target.style.opacity='.7';row.querySelector('.v211-state')?.appendChild(target)}
    const event=Array.isArray(events)?events[0]:null;if(!event){target.textContent='لا توجد متابعة سحابية مسجلة';return true}
    const stamp=new Date(event.createdAt);target.textContent=(TIMELINE_LABEL[event.actionKind]||'متابعة مسجلة')+(Number.isNaN(stamp.getTime())?'':' • '+stamp.toLocaleString('ar-KW',{dateStyle:'short',timeStyle:'short'}));return true;
  }
  function hydrateVisibleTimelines(){
    timelineEpoch+=1;const panel=document.getElementById('v211FollowUpCenter');if(!panel)return;
    Array.from(panel.querySelectorAll('.v211-row')).slice(0,40).forEach(row=>{const button=row.querySelector('[data-v211-action]');const selection=parseVisibleSelection(button);const current=selection&&liveRecord(selection);if(selection&&current)hydrateTimeline(row,selection,current)});
  }
  let timelineTimer=0;
  function scheduleTimelines(records){
    const panel=document.getElementById('v211FollowUpCenter');
    if(!panel||!document.body.classList.contains('v211-open'))return;
    const relevant=records.some(record=>{
      if(record.target?.closest?.('[data-v211-cloud-timeline]'))return false;
      const nodes=[...record.addedNodes,...record.removedNodes];
      if(nodes.length&&nodes.every(node=>node.nodeType===1&&node.matches?.('[data-v211-cloud-timeline]')))return false;
      return panel.contains(record.target)||nodes.some(node=>node===panel||node.contains?.(panel));
    });
    if(!relevant)return;
    clearTimeout(timelineTimer);
    timelineTimer=setTimeout(hydrateVisibleTimelines,100);
  }
  function installGuard(){
    document.addEventListener('click',function(event){
      const button=event.target?.closest?.('#v211FollowUpCenter [data-v211-action]');if(!button)return;
      const action=text(button.getAttribute('data-v211-action'));if(!coreShouldSkip(action)&&!ACTIONS.has(action))return;
      event.preventDefault();event.stopImmediatePropagation();const selection=parseVisibleSelection(button);if(!selection)return;
      if(action==='reminder')return void executeReminder(selection,button);
      executeAction(selection,action,button);
    },true);
    const observer=new MutationObserver(scheduleTimelines);observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('aqari:auth-change',()=>{actionEpoch+=1;timelineEpoch+=1;clearTimeout(timelineTimer)},{passive:true});
  }
  function loadCore(){if(document.getElementById('aqari-v211-follow-up-center-core-js'))return;const script=document.createElement('script');script.id='aqari-v211-follow-up-center-core-js';script.src='/v211-follow-up-center-core.js?v=211.0.1';script.async=false;script.addEventListener('load',hydrateVisibleTimelines,{once:true});document.body.appendChild(script)}
  function loadCloudThenCore(){
    if(window.AQARI_FOLLOW_UP_CLOUD?.version==='V211.1-follow-up-cloud-contract')return loadCore();
    let script=document.getElementById('aqari-v211-follow-up-cloud-js');
    if(!script){script=document.createElement('script');script.id='aqari-v211-follow-up-cloud-js';script.src='/v211-follow-up-cloud.js?v=211.1';script.async=false;script.addEventListener('load',loadCore,{once:true});script.addEventListener('error',loadCore,{once:true});document.body.appendChild(script);return}
    script.addEventListener('load',loadCore,{once:true});
  }
  installGuard();loadCloudThenCore();window.AQARI_V211_HOTFIX=Object.freeze({version:DESIGN,core:CORE_DESIGN});
})();
