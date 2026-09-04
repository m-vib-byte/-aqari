(function(){
  'use strict';

  const DESIGN='V211.0.1-action-epoch-hotfix';
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const ACTIONS=new Set(['statement','contract','receipt','payment']);
  let actionEpoch=0;

  function text(value){return String(value==null?'':value).trim()}
  function norm(value){
    return text(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'').replace(/\s+/g,' ').toLocaleLowerCase('ar');
  }
  function identity(value){
    if(typeof value!=='string'||value!==value.trim()||/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value))return '';
    return value;
  }
  function accessScope(){
    try{
      const context=window.AQARI_SUPABASE?.context;
      const userId=identity(context?.user?.id);
      const workspaceId=identity(context?.workspace?.id);
      const membership=context?.membership;
      const role=identity(membership?.role);
      if(!userId||!workspaceId||!role||membership?.is_active!==true||
         identity(membership?.user_id)!==userId||identity(membership?.workspace_id)!==workspaceId)return null;
      const dataScope=window.AQARI_DATA_GATE?.scope;
      const storageScope=window.AQARI_EARLY_STORAGE_GATE?.scope;
      if(identity(dataScope?.userId)!==userId||identity(dataScope?.workspaceId)!==workspaceId||
         identity(storageScope?.userId)!==userId||identity(storageScope?.workspaceId)!==workspaceId)return null;
      return Object.freeze({userId:userId,workspaceId:workspaceId,role:role,key:userId+'\u0000'+workspaceId+'\u0000'+role});
    }catch(_){return null}
  }

  function parseVisibleSelection(button){
    const access=accessScope();
    const row=button?.closest?.('.v211-row');
    const panel=button?.closest?.('#v211FollowUpCenter');
    const period=text(panel?.querySelector?.('#v211Period')?.value);
    const property=text(row?.querySelector?.('.v211-person > span')?.textContent);
    const tenant=text(row?.querySelector?.('.v211-person > strong')?.textContent);
    const detail=text(row?.querySelector?.('.v211-person > small')?.textContent);
    if(!access||!row||!panel||!PERIOD.test(period)||!property||!tenant||!detail.startsWith('وحدة '))return null;
    const parts=detail.slice('وحدة '.length).split(' • ');
    if(parts.length!==2)return null;
    const unit=text(parts[0]);
    const contractLabel=text(parts[1]);
    const contractNo=contractLabel==='بدون رقم عقد'?'':contractLabel;
    if(!unit)return null;
    return {access:access,scope:access.key,period:period,property:property,tenant:tenant,unit:unit,contractNo:contractNo};
  }

  function liveRecord(selection){
    const access=accessScope();
    if(!selection||!access||access.key!==selection.scope||typeof window.AQARI_V202?.rentOfficeData!=='function')return null;
    let data=null;
    try{data=window.AQARI_V202.rentOfficeData(selection.property,selection.period)}catch(_){data=null}
    if(!data||norm(data.property)!==norm(selection.property)||text(data.period)!==selection.period||!Array.isArray(data.records))return null;
    const matches=data.records.filter(function(record){
      return text(record?.tenant)===selection.tenant&&
        text(record?.unit)===selection.unit&&
        text(record?.contractNo)===selection.contractNo&&
        text(record?.key);
    });
    if(matches.length!==1)return null;
    return {data:data,record:matches[0]};
  }

  function executeAction(selection,action,trigger){
    const access=accessScope();
    if(!selection||!access||access.key!==selection.scope||!ACTIONS.has(action)||
       typeof window.AQARI_V202?.openProperty!=='function'||typeof window.AQARI_V202?.rentOfficeAction!=='function')return false;
    if(!liveRecord(selection))return false;
    const token=++actionEpoch;
    let opened=false;
    try{opened=window.AQARI_V202.openProperty(selection.property,selection.period)!==false}catch(_){opened=false}
    if(!opened)return false;
    let attempts=0;
    const follow=function(){
      const currentAccess=accessScope();
      if(token!==actionEpoch||!currentAccess||currentAccess.key!==selection.scope)return;
      attempts+=1;
      const current=liveRecord(selection);
      if(!current)return;
      const workspace=document.getElementById('v202PropertyWorkspace');
      const title=document.getElementById('v202PropertyTitle');
      if(workspace?.classList.contains('on')&&(!title||norm(title.textContent)===norm(selection.property))){
        let ok=false;
        try{ok=window.AQARI_V202.rentOfficeAction(selection.property,current.record.key,selection.period,action,trigger)===true}catch(_){ok=false}
        if(ok===true)window.AQARI_V211?.close?.();
        return;
      }
      if(attempts<14)setTimeout(follow,70);
    };
    setTimeout(follow,70);
    return true;
  }

  function installGuard(){
    document.addEventListener('click',function(event){
      const button=event.target?.closest?.('#v211FollowUpCenter [data-v211-action]');
      if(!button)return;
      const action=text(button.getAttribute('data-v211-action'));
      if(action==='reminder')return;
      if(!ACTIONS.has(action))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const selection=parseVisibleSelection(button);
      if(selection)executeAction(selection,action,button);
    },true);
  }

  function loadCore(){
    if(document.getElementById('aqari-v211-follow-up-center-core-js'))return;
    const script=document.createElement('script');
    script.id='aqari-v211-follow-up-center-core-js';
    script.src='/v211-follow-up-center-core.js?v=211.0.1';
    script.async=false;
    document.body.appendChild(script);
  }

  installGuard();
  loadCore();
  window.AQARI_V211_HOTFIX=Object.freeze({version:DESIGN});
})();