(function(){
  'use strict';

  const V202_DESIGN='V203-preview';
  const V202_IMPORT_SOURCE='protected-rent-import-v202';
  const PROTECTED_FIELDS=Object.freeze({
    contractsV202:['id','contract_no','tenant','property','unit','rent','contractRent','status','start_date','end_date','source'],
    tenantDirectoryV202:['property','unit','tenant','contractNo','phone','nationality','civilId','email','source','verified','sourcePage','contractStartRaw','contractEndRaw','paymentDateRaw','contractReceipt','accountant','insurance','advance','cleaningFee','freeMonth','evictionNotice','notes'],
    rentLedgerV202:['id','receiptNo','property','unit','tenant','contractId','contractNo','period','due','paid','balance','paidAt','method','status','note','source','paymentKey'],
    rentStatementsV202:['id','property','period','totalRent','totalCollected','totalAdvance','totalInsurance','totalCleaning','sourcePages','unitCount','importedAt','source']
  });
  const STATUS_LABELS={
    draft:'مسودة',ready:'جاهز للاعتماد',approved:'معتمد',signing:'بانتظار التوقيع',
    signed:'موقّع',expired:'منتهي',cancelled:'ملغي'
  };
  const ICONS={
    building:'<path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h6"/>',
    contract:'<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7M9 8h2"/>',
    receipt:'<path d="M4 2v20l3-2 3 2 2-2 3 2 2-2 3 2V2l-3 2-3-2-2 2-3-2-2 2zM8 9h8M8 13h6"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    user:'<path d="M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8"/>',
    wallet:'<path d="M3 6h16a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2V6zm0 0 13-3v3M16 11h5v4h-5a2 2 0 0 1 0-4z"/>',
    tool:'<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 5L5.9 18.1a2.1 2.1 0 1 0 3 3l8.8-8.8a4 4 0 0 0 5-5L20 10l-3-3 2.7-2.7"/>',
    close:'<path d="M18 6 6 18M6 6l12 12"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    alert:'<path d="M12 9v4M12 17h.01M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/>',
    printer:'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>',
    search:'<path d="m21 21-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z"/>'
  };

  let activeProperty='';
  let propertyTrigger=null;
  let paymentTrigger=null;
  let documentTrigger=null;
  let documentFallbackSelector='';
  let backgroundInertState=null;
  let activeTab='overview';
  let unitSearch='';
  let enhanceTimer=0;
  let hydratePromise=null;
  let hydrateListenerInstalled=false;
  let protectedImportCache=Object.create(null);
  let protectedPropertyNames=new Set();
  let protectedImportGeneration=0;
  let protectedImportScope=null;
  let protectedImportValidated=false;

  function icon(name){
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(ICONS[name]||ICONS.building)+'</svg>';
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>'"]/g,function(char){
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char];
    });
  }

  function normalized(value){return String(value==null?'':value).trim().toLocaleLowerCase('ar')}

  function latinDigits(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const persian='۰۱۲۳۴۵۶۷۸۹';
    return String(value==null?'':value)
      .replace(/[٠-٩]/g,function(digit){return arabic.indexOf(digit)})
      .replace(/[۰-۹]/g,function(digit){return persian.indexOf(digit)});
  }

  function numberFrom(value){
    const parsed=parseFloat(latinDigits(value).replace(/٫/g,'.').replace(/[,٬]/g,'').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(parsed)?parsed:0;
  }

  function strictMoney(value){
    const raw=latinDigits(value).trim().replace(/٫/g,'.');
    const plain=/^\d+(?:\.\d{1,3})?$/;
    const grouped=/^\d{1,3}(?:[,٬]\d{3})+(?:\.\d{1,3})?$/;
    if(!plain.test(raw)&&!grouped.test(raw))return Number.NaN;
    const amount=Number(raw.replace(/[,٬]/g,''));
    return Number.isFinite(amount)?amount:Number.NaN;
  }

  function money(value){
    try{return Number(value||0).toLocaleString('ar-KW',{minimumFractionDigits:0,maximumFractionDigits:3})+' د.ك'}
    catch(_){return String(value||0)+' د.ك'}
  }

  function localDate(value){
    if(!value)return 'غير مؤرخ';
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return escapeHtml(value);
    try{return date.toLocaleDateString('ar-KW',{year:'numeric',month:'short',day:'numeric'})}
    catch(_){return date.toLocaleDateString('ar-KW')}
  }

  function appData(){
    try{return typeof db!=='undefined'&&db?db:{}}
    catch(_){return {}}
  }

  function accessScope(context){
    const userId=String(context?.user?.id||'').trim();
    const workspaceId=String(context?.workspace?.id||'').trim();
    const membership=context?.membership;
    if(!userId||!workspaceId||!membership?.is_active)return null;
    if(membership.user_id&&String(membership.user_id)!==userId)return null;
    if(membership.workspace_id&&String(membership.workspace_id)!==workspaceId)return null;
    return {userId:userId,workspaceId:workspaceId};
  }

  function sameAccessScope(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId);
  }

  function activeAccessScope(){
    return accessScope(window.AQARI_SUPABASE?.context);
  }

  function protectedCacheUsable(){
    return Boolean(protectedImportValidated&&sameAccessScope(activeAccessScope(),protectedImportScope));
  }

  function rows(key){
    const value=appData()[key];
    const local=Array.isArray(value)?value:[];
    const remote=protectedCacheUsable()&&Array.isArray(protectedImportCache[key])?protectedImportCache[key]:[];
    if(!remote.length)return local;
    if(key==='properties')return mergeImportedProperty(local,remote,protectedPropertyNames).rows;
    const fields=PROTECTED_FIELDS[key];
    return fields?mergeImportedRows(local,remote,key,fields).rows:local;
  }

  function cloudPrimary(payload){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return null;
    if(payload.format==='aqari-cloud-state-v1')return payload.snapshot?.values?.aqari_v30||null;
    if(payload.schema==='aqari-local-snapshot-v1')return payload.values?.aqari_v30||null;
    if(payload.data&&typeof payload.data==='object'&&!Array.isArray(payload.data))return payload.data;
    if(payload.db&&typeof payload.db==='object'&&!Array.isArray(payload.db))return payload.db;
    return payload;
  }

  function pickedRecord(record,fields){
    const picked={};
    fields.forEach(function(field){
      if(!Object.prototype.hasOwnProperty.call(record,field))return;
      const value=record[field];
      if(value==null||['string','number','boolean'].includes(typeof value))picked[field]=value;
    });
    return picked;
  }

  function importIdentity(key,record){
    if(!record||typeof record!=='object'||Array.isArray(record))return '';
    if(key==='contractsV202'){
      const id=normalized(record.id);
      if(id)return 'id:'+id;
      const contractNo=normalized(record.contract_no);
      const property=normalized(record.property);
      const unit=normalized(record.unit);
      return contractNo&&property&&unit?['no',contractNo,property,unit].join(':'):'';
    }
    if(key==='tenantDirectoryV202'){
      const property=normalized(record.property);
      const unit=normalized(record.unit);
      const tenant=normalized(record.tenant);
      return property&&unit&&tenant?['tenant',property,unit,tenant].join(':'):'';
    }
    if(key==='rentLedgerV202'){
      const id=normalized(record.id);
      if(id)return 'id:'+id;
      const receipt=normalized(record.receiptNo);
      const property=normalized(record.property);
      const unit=normalized(record.unit);
      const period=String(record.period||'');
      return receipt&&property&&unit&&validPeriod(period)?['receipt',receipt,normalized(record.contractId),unit,period].join(':'):'';
    }
    if(key==='rentStatementsV202'){
      const id=normalized(record.id);
      if(id)return 'id:'+id;
      const property=normalized(record.property);
      const period=String(record.period||'');
      return property&&validPeriod(period)?['statement',property,period].join(':'):'';
    }
    return '';
  }

  function mergeImportedRows(localRows,remoteRows,key,fields){
    const result=Array.isArray(localRows)?localRows.slice():[];
    let changed=false;
    const incoming=remoteRows.filter(function(record){
      return record&&typeof record==='object'&&!Array.isArray(record)&&normalized(record.source)===V202_IMPORT_SOURCE;
    });
    incoming.forEach(function(remote){
      const candidate=pickedRecord(remote,fields);
      const identity=importIdentity(key,candidate);
      if(!identity)return;
      const matches=[];
      result.forEach(function(existing,index){if(importIdentity(key,existing)===identity)matches.push(index)});
      const imported=matches.filter(function(index){return normalized(result[index]?.source)===V202_IMPORT_SOURCE});
      if(imported.length===1&&matches.length===1){
        const replacement={...result[imported[0]],...candidate};
        if(JSON.stringify(replacement)!==JSON.stringify(result[imported[0]])){
          result[imported[0]]=replacement;
          changed=true;
        }
      }else if(matches.length===0){
        result.push(candidate);
        changed=true;
      }
    });
    return {rows:result,changed};
  }

  function mergeImportedProperty(localRows,remoteRows,allowedNames){
    const result=Array.isArray(localRows)?localRows.slice():[];
    let changed=false;
    const allowed=new Set(Array.from(allowedNames||[]).map(normalized).filter(Boolean));
    if(allowed.size!==1)return {rows:result,changed};
    const remote=Array.isArray(remoteRows)?remoteRows.filter(function(row){
      return Array.isArray(row)&&allowed.has(normalized(row[0]));
    }):[];
    if(remote.length!==1)return {rows:result,changed};
    const candidate=remote[0].slice(0,4).map(function(value){
      return value==null||['string','number','boolean'].includes(typeof value)?value:'';
    });
    const matches=[];
    result.forEach(function(row,index){if(Array.isArray(row)&&normalized(row[0])===normalized(candidate[0]))matches.push(index)});
    if(matches.length===0){result.push(candidate);changed=true}
    else if(matches.length===1){
      const existing=result[matches[0]];
      const replacement=existing.slice();
      candidate.forEach(function(value,index){if(value!=null&&String(value).trim()!=='')replacement[index]=value});
      if(JSON.stringify(replacement)!==JSON.stringify(existing)){result[matches[0]]=replacement;changed=true}
    }
    return {rows:result,changed};
  }

  function clearProtectedImport(){
    protectedImportGeneration+=1;
    protectedImportCache=Object.create(null);
    protectedPropertyNames=new Set();
    protectedImportScope=null;
    protectedImportValidated=false;
    unitSearch='';
  }

  function suspendProtectedImport(dropCache){
    protectedImportGeneration+=1;
    protectedImportValidated=false;
    if(dropCache){
      protectedImportCache=Object.create(null);
      protectedPropertyNames=new Set();
      protectedImportScope=null;
    }
    unitSearch='';
    clearProtectedDom();
  }

  function denyProtectedHydration(generation){
    if(generation===protectedImportGeneration)suspendProtectedImport(true);
    return false;
  }

  function clearProtectedDom(){
    document.querySelectorAll('.aq-protected-property').forEach(function(node){node.remove()});
    ['v202PropertyWorkspace','v202PaymentDialog','v202DocumentDialog'].forEach(function(id){
      const layer=document.getElementById(id);
      if(layer)layer.remove();
    });
    propertyTrigger=null;
    paymentTrigger=null;
    documentTrigger=null;
    documentFallbackSelector='';
    activeProperty='';
    activeTab='overview';
    syncLayerState();
    document.body.classList.remove('v202-print-document');
  }

  function purgePersistedProtectedRows(){
    const data=appData();
    if(!data||typeof data!=='object'||Array.isArray(data))return false;
    let changed=false;
    Object.keys(PROTECTED_FIELDS).forEach(function(key){
      if(!Array.isArray(data[key]))return;
      const clean=data[key].filter(function(record){
        return normalized(record?.source)!==V202_IMPORT_SOURCE;
      });
      if(clean.length!==data[key].length){data[key]=clean;changed=true}
    });
    if(!changed)return false;
    try{
      if(typeof persist==='function')persist();
      else localStorage.setItem('aqari_v30',JSON.stringify(data));
    }catch(_){ }
    return true;
  }

  async function hydrateProtectedImport(expectedUserId){
    const expected=String(expectedUserId||'').trim();
    const initialScope=activeAccessScope();
    if(protectedImportScope&&(!initialScope||(expected&&initialScope.userId!==expected)||!sameAccessScope(initialScope,protectedImportScope))){
      suspendProtectedImport(true);
    }
    if(protectedCacheUsable()&&(!expected||activeAccessScope()?.userId===expected))return true;
    if(hydratePromise){
      await hydratePromise;
      if(protectedCacheUsable()&&(!expected||activeAccessScope()?.userId===expected))return true;
      return hydrateProtectedImport(expected);
    }
    const generation=protectedImportGeneration;
    hydratePromise=(async function(){
      try{
        const bridge=window.AQARI_SUPABASE;
        if(!bridge?.loadAppState)return denyProtectedHydration(generation);
        let context=bridge.context;
        let requestScope=accessScope(context);
        if((!protectedImportValidated||!requestScope||(expected&&requestScope.userId!==expected))&&typeof bridge.refreshContext==='function'){
          context=await bridge.refreshContext();
          requestScope=accessScope(context);
        }
        if(!requestScope||(expected&&requestScope.userId!==expected)){
          return denyProtectedHydration(generation);
        }
        if(protectedImportScope&&!sameAccessScope(requestScope,protectedImportScope)){
          protectedImportCache=Object.create(null);
          protectedPropertyNames=new Set();
          protectedImportScope=null;
          protectedImportValidated=false;
          clearProtectedDom();
        }
        const remoteState=await bridge.loadAppState();
        const currentScope=accessScope(bridge.context);
        if(generation!==protectedImportGeneration)return false;
        if(!sameAccessScope(currentScope,requestScope)||(expected&&currentScope.userId!==expected)){
          return denyProtectedHydration(generation);
        }
        const primary=cloudPrimary(remoteState?.payload);
        if(!primary||typeof primary!=='object'||Array.isArray(primary))return denyProtectedHydration(generation);
        const data=appData();
        if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.properties))return denyProtectedHydration(generation);
        const importedPropertyNames=new Set();
        ['contractsV202','rentStatementsV202'].forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          remoteRows.forEach(function(record){
            if(record&&typeof record==='object'&&!Array.isArray(record)&&normalized(record.source)===V202_IMPORT_SOURCE&&String(record.property||'').trim()){
              importedPropertyNames.add(String(record.property).trim());
            }
          });
        });
        if(importedPropertyNames.size!==1)return denyProtectedHydration(generation);
        const importedPropertyKey=normalized(Array.from(importedPropertyNames)[0]);
        const nextCache=Object.create(null);
        Object.keys(PROTECTED_FIELDS).forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          if(!remoteRows.some(function(record){return normalized(record?.source)===V202_IMPORT_SOURCE}))return;
          nextCache[key]=remoteRows.filter(function(record){
            return record&&typeof record==='object'&&!Array.isArray(record)&&normalized(record.source)===V202_IMPORT_SOURCE&&normalized(record.property)===importedPropertyKey;
          }).map(function(record){return pickedRecord(record,PROTECTED_FIELDS[key])});
        });
        nextCache.properties=Array.isArray(primary.properties)?primary.properties.filter(function(row){
          return Array.isArray(row)&&importedPropertyNames.has(String(row[0]||'').trim());
        }).map(function(row){return row.slice(0,4)}):[];
        protectedImportCache=nextCache;
        protectedPropertyNames=new Set(Array.from(importedPropertyNames).map(normalized));
        protectedImportScope=currentScope;
        protectedImportValidated=true;
        purgePersistedProtectedRows();
        try{if(typeof render==='function')render()}catch(_){ }
        if(document.querySelector('#v202PropertyWorkspace.on'))renderWorkspace();
        setPresentation();
        return true;
      }catch(_){
        return denyProtectedHydration(generation);
      }
      finally{hydratePromise=null}
    })();
    return hydratePromise;
  }

  function handleProtectedAuthStateChange(event,session){
    if(event==='SIGNED_OUT'){
      clearProtectedImport();
      clearProtectedDom();
      if(document.querySelector('#v202PropertyWorkspace.on'))renderWorkspace();
      return;
    }
    if(!['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION'].includes(event))return;
    const eventUserId=String(session?.user?.id||'').trim();
    const dropCache=!eventUserId||Boolean(protectedImportScope&&protectedImportScope.userId!==eventUserId);
    suspendProtectedImport(dropCache);
    setTimeout(function(){hydrateProtectedImport(eventUserId)},0);
  }

  function installHydrateListener(){
    const bridge=window.AQARI_SUPABASE;
    if(hydrateListenerInstalled||typeof bridge?.onAuthStateChange!=='function')return;
    hydrateListenerInstalled=true;
    Promise.resolve(bridge.onAuthStateChange(handleProtectedAuthStateChange)).catch(function(){hydrateListenerInstalled=false});
  }

  function scheduleImportedHydration(){
    [0,800,2500,8000].forEach(function(delay){
      setTimeout(function(){installHydrateListener();hydrateProtectedImport()},delay);
    });
  }

  function tenantDirectory(){
    return rows('tenantDirectoryV202').filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)}).map(function(entry){
      return {
        property:String(entry.property||''),unit:String(entry.unit||''),tenant:String(entry.tenant||''),
        contractNo:String(entry.contractNo||entry.contract_no||''),phone:String(entry.phone||''),
        nationality:String(entry.nationality||''),civilId:String(entry.civilId||''),email:String(entry.email||''),
        source:String(entry.source||''),verified:Boolean(entry.verified),sourcePage:String(entry.sourcePage||''),
        contractStartRaw:String(entry.contractStartRaw||''),contractEndRaw:String(entry.contractEndRaw||''),
        paymentDateRaw:String(entry.paymentDateRaw||''),contractReceipt:String(entry.contractReceipt||''),
        accountant:String(entry.accountant||''),insurance:entry.insurance,advance:entry.advance,
        cleaningFee:entry.cleaningFee,freeMonth:String(entry.freeMonth||''),
        evictionNotice:String(entry.evictionNotice||''),notes:String(entry.notes||'')
      };
    });
  }

  function protectedAccessReady(){
    return Boolean(activeAccessScope());
  }

  function protectedPropertyActive(name){
    const key=normalized(name);
    return protectedCacheUsable()&&protectedPropertyNames.has(key);
  }

  function maskCivilId(value){
    const raw=String(value||'').trim();
    if(!raw)return 'غير مسجل';
    const compact=raw.replace(/\s+/g,'');
    const tail=compact.slice(-4);
    return tail?'•••• •••• '+tail:'•••• ••••';
  }

  function unitRecordKey(record){
    return [normalized(record?.property),normalized(record?.unit),normalized(record?.contractNo),normalized(record?.tenant)].join('|');
  }

  function unitMatchesSearch(record,query){
    const key=normalized(latinDigits(query));
    if(!key)return true;
    return [record?.unit,record?.tenant,record?.contractNo]
      .some(function(value){return normalized(latinDigits(value)).includes(key)});
  }

  function filterUnitRecords(records,query){
    return (Array.isArray(records)?records:[]).filter(function(record){return unitMatchesSearch(record,query)});
  }

  function maskUnitCard(card,record){
    const reveal=card?.querySelector('[data-v202-civil-reveal]');
    const sensitive=card?.querySelector('.aq-unit-sensitive-value');
    if(!reveal||!record)return;
    reveal.setAttribute('aria-pressed','false');
    reveal.setAttribute('aria-label','إظهار الرقم المدني للوحدة '+record.unit);
    reveal.textContent='إظهار';
    if(sensitive){sensitive.textContent=maskCivilId(record.civilId);sensitive.classList.add('is-masked')}
  }

  function filterUnitCards(value){
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)):[];
    unitSearch=String(value||'');
    let shown=0;
    document.querySelectorAll('#v202Panel [data-v202-unit-index]').forEach(function(card){
      const index=Number(card.getAttribute('data-v202-unit-index'));
      const match=Boolean(records[index]&&unitMatchesSearch(records[index],unitSearch));
      card.hidden=!match;
      if(match)shown+=1;
      const details=card.querySelector('details');
      if(details)details.open=false;
      maskUnitCard(card,records[index]);
    });
    const result=document.getElementById('v202UnitResultCount');
    if(result)result.textContent='عرض '+shown+' من '+records.length+' وحدة';
    const clear=document.querySelector('#v202Panel [data-v202-unit-clear]');
    if(clear)clear.hidden=!unitSearch;
    const empty=document.querySelector('#v202Panel .aq-unit-no-results');
    if(empty)empty.hidden=shown!==0||records.length===0;
    return shown;
  }

  function toggleCivilId(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)):[];
    const index=Number(button?.getAttribute('data-v202-civil-reveal'));
    const record=records[index];
    const value=button?.closest('.aq-unit-sensitive')?.querySelector('.aq-unit-sensitive-value');
    if(!record?.civilId||!value)return false;
    const revealing=button.getAttribute('aria-pressed')!=='true';
    value.textContent=revealing?record.civilId:maskCivilId(record.civilId);
    value.classList.toggle('is-masked',!revealing);
    button.setAttribute('aria-pressed',String(revealing));
    button.setAttribute('aria-label',(revealing?'إخفاء':'إظهار')+' الرقم المدني للوحدة '+record.unit);
    button.textContent=revealing?'إخفاء':'إظهار';
    return true;
  }

  function directoryTenant(property,unit,contractNo){
    const propertyKey=normalized(property);
    const unitKey=normalized(unit);
    const numberKey=normalized(contractNo);
    const directory=tenantDirectory().filter(function(entry){
      return normalized(entry.property)===propertyKey&&normalized(entry.unit)===unitKey;
    });
    if(numberKey){
      const byNumber=directory.filter(function(entry){return normalized(entry.contractNo)===numberKey});
      if(byNumber.length===1)return byNumber[0].tenant;
    }
    return directory.length===1?directory[0].tenant:'';
  }

  function contractStatus(value){
    const status=normalized(value);
    if(status==='signed'||['موقع','موقّع','تم التوقيع','مكتمل التوقيع'].includes(status))return 'signed';
    if(status==='expired'||status.includes('منته'))return 'expired';
    if(status==='cancelled'||status==='canceled'||status.includes('ملغ'))return 'cancelled';
    if(status==='signing'||status.includes('التوقيع'))return 'signing';
    if(status==='approved'||status.includes('معتمد'))return 'approved';
    if(status==='ready'||status.includes('جاهز'))return 'ready';
    return status==='draft'||status.includes('مسود')?'draft':status;
  }

  function normalizeContract(entry,source,index){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
    const contractNo=String(entry.contract_no||entry.contractNo||'').trim();
    const property=String(entry.property||entry.propertyName||'').trim();
    const unit=String(entry.unit||entry.unitName||'').trim();
    const tenant=String(entry.tenant||entry.tenantName||directoryTenant(property,unit,contractNo)||'').trim();
    const explicitId=String(entry.id||entry.contractId||entry.contract_id||'').trim();
    const id=explicitId||['legacy',contractNo||'بدون-رقم',property||'بدون-عقار',unit||'بدون-وحدة'].join('|')||(source+'-'+index);
    const rentValue=entry.rent!=null&&String(entry.rent).trim()!==''?entry.rent:entry.monthlyRent;
    const faceRent=entry.contractRent!=null&&String(entry.contractRent).trim()!==''?entry.contractRent:rentValue;
    if(!property||!id)return null;
    return {
      id,contract_no:contractNo,tenant,property,unit,rent:rentValue==null?'':rentValue,
      contractRent:faceRent==null?'':faceRent,deposit:entry.deposit==null?'':entry.deposit,
      status:contractStatus(entry.status),start_date:String(entry.start_date||entry.startDate||'').slice(0,10),
      end_date:String(entry.end_date||entry.endDate||'').slice(0,10),source:String(entry.source||source),_explicitId:Boolean(explicitId)
    };
  }

  function contractMergeKey(contract){
    if(contract?._explicitId&&normalized(contract.id))return 'id:'+normalized(contract.id);
    if(normalized(contract?.contract_no))return ['no',normalized(contract.contract_no),normalized(contract?.property),normalized(contract?.unit)].join(':');
    return ['row',normalized(contract?.property),normalized(contract?.unit),normalized(contract?.tenant),normalized(contract?.start_date)].join(':');
  }

  function mergedContract(previous,next){
    if(!previous)return next;
    const result={...previous};
    Object.keys(next).forEach(function(key){
      if(next[key]!=null&&String(next[key]).trim()!=='')result[key]=next[key];
    });
    return result;
  }

  function contracts(){
    let local=[];
    try{
      const loaded=typeof localContractsV55==='function'?localContractsV55():[];
      local=Array.isArray(loaded)?loaded:[];
    }catch(_){local=[]}
    const merged=new Map();
    local.forEach(function(entry,index){
      const contract=normalizeContract(entry,'local-v55',index);
      if(contract)merged.set(contractMergeKey(contract),contract);
    });
    rows('contractsV202').forEach(function(entry,index){
      const contract=normalizeContract(entry,'db-v202',index);
      if(!contract)return;
      const key=contractMergeKey(contract);
      merged.set(key,mergedContract(merged.get(key),contract));
    });
    return Array.from(merged.values());
  }

  function contractId(contract){return String(contract?.id||contract?.contract_no||'').trim()}

  function validPeriod(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''))}

  function contractCoversPeriod(contract,period){
    if(!validPeriod(period))return false;
    const start=String(contract?.start_date||'').slice(0,7);
    const end=String(contract?.end_date||'').slice(0,7);
    if(validPeriod(start)&&period<start)return false;
    if(validPeriod(end)&&period>end)return false;
    return true;
  }

  function signedContract(contract){return contractStatus(contract?.status)==='signed'}

  function rawLedgerRecords(){
    const value=appData().rentLedgerV202;
    return Array.isArray(value)?value:[];
  }

  function importedLedger(entry){
    const source=normalized(entry?.source);
    return Boolean(source&&!['v202-entry','local-v202','v202'].includes(source));
  }

  function collectionRowsByReceipt(){
    const buckets=new Map();
    rows('collections').forEach(function(row){
      const key=normalized(row?.[0]);
      if(!key)return;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(row);
    });
    return buckets;
  }

  function ledgerRecords(){
    const buckets=collectionRowsByReceipt();
    return rawLedgerRecords().map(function(entry){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
      const receiptKey=normalized(entry.receiptNo);
      const matches=receiptKey?buckets.get(receiptKey):null;
      if(matches?.length===1){
        const row=matches[0];
        if(normalized(row?.[1])!==normalized(entry.tenant))return null;
        return {...entry,receiptNo:String(row?.[0]||entry.receiptNo||''),tenant:String(row?.[1]||entry.tenant||''),paid:numberFrom(row?.[2]),status:String(row?.[3]||entry.status||'')};
      }
      return importedLedger(entry)?{...entry}:null;
    }).filter(Boolean);
  }

  function ledgerFor(name){
    const key=normalized(name);
    return ledgerRecords().filter(function(entry){return normalized(entry?.property)===key});
  }

  function ledgerRow(entry){
    return [
      entry?.receiptNo||'—',entry?.tenant||'—',money(entry?.paid),entry?.status||'مدفوع',
      entry?.property||'',entry?.paidAt||'',entry?.unit||'—',entry?.note||'',entry?.period||'',entry?.method||''
    ];
  }

  function propertyMatches(name){
    const key=normalized(name);
    return rows('properties').filter(function(row){return normalized(row?.[0])===key});
  }

  function propertyRecord(name){
    const matches=propertyMatches(name);
    return matches.length===1?matches[0]:null;
  }

  function contractsFor(name){
    const key=normalized(name);
    return contracts().filter(function(contract){return normalized(contract?.property)===key});
  }

  function uniquePropertyForTenant(tenant){
    const key=normalized(tenant);
    const found=new Set(contracts().filter(function(contract){
      return normalized(contract?.tenant)===key&&signedContract(contract);
    }).map(function(contract){return normalized(contract?.property)}).filter(Boolean));
    return found.size===1?Array.from(found)[0]:'';
  }

  function uniquePropertyForUnit(unit){
    const key=normalized(unit);
    const found=new Set(contracts().filter(function(contract){
      return normalized(contract?.unit)===key&&signedContract(contract);
    }).map(function(contract){return normalized(contract?.property)}).filter(Boolean));
    return found.size===1?Array.from(found)[0]:'';
  }

  function collectionsFor(name){
    const key=normalized(name);
    const linkedLedger=ledgerFor(name);
    const ledgerReceipts=new Set(ledgerRecords().map(function(entry){return normalized(entry?.receiptNo)}).filter(Boolean));
    const legacy=rows('collections').filter(function(row){
      if(ledgerReceipts.has(normalized(row?.[0])))return false;
      const explicit=normalized(row?.[4]);
      if(explicit)return explicit===key;
      return uniquePropertyForTenant(row?.[1])===key;
    });
    return linkedLedger.map(ledgerRow).concat(legacy);
  }

  function settledPayment(status){
    const value=normalized(status);
    return ['paid','partial','settled','received','مدفوع','جزئي','جزئيا','مستلم'].includes(value)||value.includes('مدفوع جزئ');
  }

  function rentStatements(){
    return rows('rentStatementsV202').filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)});
  }

  function officialStatementFor(property,period){
    return rentStatements().find(function(entry){
      return normalized(entry.property)===normalized(property)&&String(entry.period||'')===String(period||'');
    })||null;
  }

  function statementIncludesContract(contract,period){
    if(!signedContract(contract))return false;
    if(contractCoversPeriod(contract,period))return true;
    return normalized(contract?.source)===V202_IMPORT_SOURCE&&Boolean(officialStatementFor(contract?.property,period));
  }

  function latestOfficialPeriod(property){
    const periods=rentStatements().filter(function(entry){
      return normalized(entry?.property)===normalized(property)&&validPeriod(entry?.period);
    }).map(function(entry){return String(entry.period)}).sort().reverse();
    return periods[0]||currentPeriod();
  }

  function hasField(record,key){return Boolean(record&&Object.prototype.hasOwnProperty.call(record,key)&&record[key]!=null&&String(record[key]).trim()!=='')}

  function maintenanceFor(name){
    const key=normalized(name);
    const workOrders=rows('workOrders').filter(function(row){return normalized(row?.[1])===key});
    const maintenance=rows('maintenance').filter(function(row){
      const explicit=normalized(row?.[4]);
      if(explicit)return explicit===key;
      return uniquePropertyForUnit(row?.[0])===key;
    });
    return workOrders.concat(maintenance);
  }

  function contextFor(name){
    const property=propertyRecord(name);
    if(!property)return null;
    const propertyContracts=contractsFor(name);
    const period=currentPeriod();
    const activeContracts=propertyContracts.filter(function(contract){return signedContract(contract)&&contractCoversPeriod(contract,period)});
    const tenantNames=new Set(activeContracts.map(function(contract){return normalized(contract?.tenant)}).filter(Boolean));
    const linkedTenants=rows('tenants').filter(function(row){return tenantNames.has(normalized(row?.[0]))});
    const propertyLedger=ledgerFor(name);
    const propertyCollections=collectionsFor(name);
    const expenses=rows('expenses').filter(function(row){return normalized(row?.[0])===normalized(name)});
    const maintenance=maintenanceFor(name);
    const units=numberFrom(property?.[2]);
    const occupiedUnits=new Set(activeContracts.map(function(contract){return normalized(contract?.unit)}).filter(Boolean)).size;
    const income=numberFrom(property?.[3]);
    const settledCollections=propertyCollections.filter(function(row){return settledPayment(row?.[3])});
    const collected=settledCollections.reduce(function(total,row){return total+numberFrom(row?.[2])},0);
    const expenseTotal=expenses.reduce(function(total,row){return total+numberFrom(row?.[2])},0);
    const official=officialStatementFor(name,period);
    const due=official&&hasField(official,'totalRent')?
      Math.max(0,numberFrom(official.totalRent)-(hasField(official,'totalCollected')?numberFrom(official.totalCollected):0)):
      activeContracts.reduce(function(total,contract){return total+remainingForPeriod(name,contract,period)},0);
    const openMaintenance=maintenance.filter(function(row){
      const status=normalized(row?.[3]);
      return !status.includes('مكتمل')&&!status.includes('مغلق')&&!status.includes('منجز');
    });
    return {
      property,propertyContracts,activeContracts,linkedTenants,propertyLedger,propertyCollections,settledCollections,expenses,maintenance,official,
      openMaintenance,units,occupiedUnits,income,collected,expenseTotal,due,net:income-expenseTotal
    };
  }

  function directoryEntriesFor(property){
    const key=normalized(property);
    return tenantDirectory().filter(function(entry){return normalized(entry.property)===key});
  }

  function directoryRecordFor(entries,contract){
    const unit=normalized(contract?.unit);
    const contractNo=normalized(contract?.contract_no||contract?.contractNo);
    const tenant=normalized(contract?.tenant);
    const candidates=(Array.isArray(entries)?entries:[]).filter(function(entry){return normalized(entry.unit)===unit});
    if(contractNo){
      const exact=candidates.filter(function(entry){return normalized(entry.contractNo)===contractNo});
      if(exact.length===1)return exact[0];
    }
    if(tenant){
      const byTenant=candidates.filter(function(entry){return normalized(entry.tenant)===tenant});
      if(byTenant.length===1)return byTenant[0];
    }
    return candidates.length===1?candidates[0]:null;
  }

  function contractPriority(contract,period){
    let score=0;
    if(statementIncludesContract(contract,period))score+=1000000000000;
    if(signedContract(contract))score+=100000000000;
    const start=Number(String(contract?.start_date||'').replace(/-/g,''));
    if(Number.isFinite(start))score+=start;
    return score;
  }

  function unitDirectoryRecords(context,periodValue){
    if(!context)return [];
    const property=String(context.property?.[0]||'');
    const period=validPeriod(periodValue)?periodValue:latestOfficialPeriod(property);
    const directory=directoryEntriesFor(property);
    const statement=rentStatementItems(context,period);
    const statementById=new Map(statement.map(function(item){return [normalized(item.contractId),item]}).filter(function(pair){return pair[0]}));
    const map=new Map();

    directory.forEach(function(entry,index){
      const key=normalized(entry.unit)||'directory:'+index;
      if(!map.has(key))map.set(key,{property,unit:entry.unit||'—',tenant:entry.tenant,contractNo:entry.contractNo,directory:entry,contract:null});
    });

    context.propertyContracts.slice().sort(function(left,right){return contractPriority(right,period)-contractPriority(left,period)}).forEach(function(contract,index){
      const idKey=normalized(contractId(contract));
      const key=normalized(contract.unit)||(idKey?'contract:'+idKey:'contract:'+index);
      const current=map.get(key)||{property,unit:contract.unit||'—',tenant:'',contractNo:'',directory:null,contract:null};
      if(!current.contract){
        const matched=directoryRecordFor(directory,contract);
        current.contract=contract;
        current.directory=matched||current.directory;
        current.unit=contract.unit||current.directory?.unit||'—';
        current.tenant=contract.tenant||current.directory?.tenant||'';
        current.contractNo=contract.contract_no||current.directory?.contractNo||'';
      }
      map.set(key,current);
    });

    context.propertyLedger.filter(function(entry){return String(entry?.period||'')===period}).forEach(function(entry,index){
      const key=normalized(entry?.unit)||'ledger:'+index;
      if(!map.has(key))map.set(key,{property,unit:String(entry?.unit||'—'),tenant:String(entry?.tenant||''),contractNo:String(entry?.contractNo||''),directory:null,contract:null});
    });

    return Array.from(map.values()).map(function(base){
      const contract=base.contract;
      const directoryRecord=base.directory||directoryRecordFor(directory,contract)||{};
      const id=normalized(contractId(contract));
      const statementItem=(id&&statementById.get(id))||statement.find(function(item){
        return normalized(item.unit)===normalized(base.unit)&&normalized(item.tenant)===normalized(base.tenant||directoryRecord.tenant);
      })||null;
      const ledger=context.propertyLedger.filter(function(entry){
        if(String(entry?.period||'')!==period||normalized(entry?.unit)!==normalized(base.unit))return false;
        if(id&&normalized(entry?.contractId||entry?.contract_id))return normalized(entry?.contractId||entry?.contract_id)===id;
        return !base.tenant||normalized(entry?.tenant)===normalized(base.tenant);
      });
      const paid=statementItem?numberFrom(statementItem.paid):ledger.filter(function(entry){return settledPayment(entry?.status)}).reduce(function(total,entry){return total+numberFrom(entry?.paid)},0);
      const pending=statementItem?numberFrom(statementItem.pending):ledger.filter(function(entry){return !settledPayment(entry?.status)}).reduce(function(total,entry){return total+numberFrom(entry?.paid)},0);
      const due=statementItem?numberFrom(statementItem.due):contractRent(contract);
      const balance=Math.max(0,due-paid);
      const receipts=ledger.map(function(entry){return String(entry?.receiptNo||'').trim()}).filter(Boolean);
      const paymentDates=ledger.map(function(entry){return String(entry?.paidAt||'').trim()}).filter(Boolean).sort().reverse();
      const methods=Array.from(new Set(ledger.map(function(entry){return String(entry?.method||'').trim()}).filter(Boolean)));
      const paymentStatus=!contract?'يحتاج مراجعة':due>0&&balance===0?'مسدد':paid>0?'جزئي':pending>0?'قيد المراجعة':due>0?'مستحق':'يحتاج مراجعة';
      return {
        key:unitRecordKey({property,unit:base.unit,contractNo:base.contractNo,tenant:base.tenant||directoryRecord.tenant}),
        property,period,unit:String(base.unit||'—'),tenant:String(base.tenant||directoryRecord.tenant||''),
        contractNo:String(base.contractNo||directoryRecord.contractNo||''),contractId:String(contractId(contract)||''),
        contractStatus:contract?statusLabel(contract.status):'غير مربوط',startDate:String(contract?.start_date||directoryRecord.contractStartRaw||''),
        endDate:String(contract?.end_date||directoryRecord.contractEndRaw||''),rent:due,paid,pending,balance,paymentStatus,
        receipts,paidAt:paymentDates[0]||String(directoryRecord.paymentDateRaw||''),methods,
        phone:String(directoryRecord.phone||''),nationality:String(directoryRecord.nationality||''),
        civilId:String(directoryRecord.civilId||''),email:String(directoryRecord.email||''),verified:Boolean(directoryRecord.verified),
        sourcePage:String(directoryRecord.sourcePage||''),contractReceipt:String(directoryRecord.contractReceipt||''),
        accountant:String(directoryRecord.accountant||''),insurance:directoryRecord.insurance,advance:directoryRecord.advance,
        cleaningFee:directoryRecord.cleaningFee,freeMonth:String(directoryRecord.freeMonth||''),
        evictionNotice:String(directoryRecord.evictionNotice||''),notes:String(directoryRecord.notes||''),
        hasContract:Boolean(contract),hasDirectory:Boolean(base.directory||directoryRecordFor(directory,contract))
      };
    }).sort(function(left,right){
      return String(left.unit).localeCompare(String(right.unit),'ar',{numeric:true,sensitivity:'base'});
    });
  }

  function unitDirectoryStats(context,records){
    const list=Array.isArray(records)?records:[];
    const linkedUnits=new Set(list.map(function(record){return normalized(record.unit)}).filter(Boolean)).size;
    return {
      linked:linkedUnits,
      missing:Math.max(0,numberFrom(context?.units)-linkedUnits),
      paid:list.filter(function(record){return record.paymentStatus==='مسدد'}).length,
      due:list.filter(function(record){return record.paymentStatus==='مستحق'||record.paymentStatus==='جزئي'}).length,
      review:list.filter(function(record){return record.paymentStatus==='قيد المراجعة'||record.paymentStatus==='يحتاج مراجعة'||!record.hasContract||!record.hasDirectory}).length
    };
  }

  function unitStatusTone(status){
    if(status==='مسدد')return 'is-paid';
    if(status==='جزئي')return 'is-partial';
    if(status==='مستحق')return 'is-due';
    if(status==='قيد المراجعة'||status==='يحتاج مراجعة')return 'is-attention';
    return 'is-vacant';
  }

  function unitField(label,value,extraClass){
    const shown=value==null||String(value).trim()===''?'غير مسجل':String(value);
    return '<div class="aq-unit-field '+(extraClass||'')+'"><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(shown)+'</dd></div>';
  }

  function unitMoneyField(label,value){
    return unitField(label,value==null||String(value).trim()===''?'غير مسجل':money(numberFrom(value)));
  }

  function unitsPanel(context,periodValue,accessGranted){
    if(accessGranted!==true&&!protectedAccessReady()){
      return '<div class="aq-unit-empty" role="status"><span>'+icon('user')+'</span><div><strong>بيانات الوحدات محمية</strong><p>سجّل الدخول بعضوية فعّالة لعرض المستأجرين والعقود وبيانات السداد.</p></div></div>';
    }
    const period=validPeriod(periodValue)?periodValue:latestOfficialPeriod(context.property?.[0]);
    const records=unitDirectoryRecords(context,period);
    const stats=unitDirectoryStats(context,records);
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const cards=records.map(function(record,index){
      const civil=maskCivilId(record.civilId);
      const notes=[record.freeMonth&&'شهر مجاني: '+record.freeMonth,record.evictionNotice&&'إنذار إخلاء: '+record.evictionNotice,record.notes].filter(Boolean).join(' • ');
      return '<article class="aq-unit-card '+unitStatusTone(record.paymentStatus)+'" data-v202-unit-index="'+index+'" aria-labelledby="v202UnitTitle'+index+'">'+
        '<header class="aq-unit-card-head"><span class="aq-unit-number">'+escapeHtml(record.unit)+'</span><div class="aq-unit-title"><strong id="v202UnitTitle'+index+'">'+escapeHtml(record.tenant||'مستأجر غير مسجل')+'</strong><small>'+escapeHtml(record.contractNo?'عقد '+record.contractNo:'عقد غير مربوط')+'</small></div><span class="aq-unit-status '+unitStatusTone(record.paymentStatus)+'">'+escapeHtml(record.paymentStatus)+'</span></header>'+ 
        '<dl class="aq-unit-summary">'+unitMoneyField('الإيجار',record.rent)+unitMoneyField('المدفوع',record.paid)+unitMoneyField('المتبقي',record.balance)+'</dl>'+ 
        '<details class="aq-unit-details"><summary>عرض كل بيانات الوحدة '+escapeHtml(record.unit)+'</summary><dl class="aq-unit-details-body">'+ 
          unitField('المستأجر',record.tenant)+unitField('رقم العقد',record.contractNo)+unitField('حالة العقد',record.contractStatus)+unitField('بداية العقد',record.startDate?localDate(record.startDate):'غير مسجل')+unitField('نهاية العقد',record.endDate?localDate(record.endDate):'غير مسجل')+unitMoneyField('قيد المراجعة',record.pending)+
          unitField('الوصولات',record.receipts.join('، ')||record.contractReceipt)+unitField('تاريخ آخر دفعة',record.paidAt?localDate(record.paidAt):'غير مسجل')+unitField('طريقة السداد',record.methods.join('، '))+
          unitField('الهاتف',record.phone)+unitField('الجنسية',record.nationality)+unitField('البريد الإلكتروني',record.email)+unitField('المحاسب',record.accountant)+
          unitMoneyField('التأمين',record.insurance)+unitMoneyField('العربون',record.advance)+unitMoneyField('النظافة',record.cleaningFee)+unitField('مرجع الصفحة',record.sourcePage)+unitField('ملاحظات',notes)+
          '<div class="aq-unit-field"><dt>الرقم المدني</dt><dd class="aq-unit-sensitive"><span class="aq-unit-sensitive-value is-masked">'+escapeHtml(civil)+'</span>'+(record.civilId?'<button type="button" class="aq-unit-reveal" data-v202-civil-reveal="'+index+'" aria-pressed="false" aria-label="إظهار الرقم المدني للوحدة '+escapeHtml(record.unit)+'">إظهار</button>':'')+'</dd></div>'+ 
        '</dl></details>'+ 
        '<footer class="aq-unit-actions"><button type="button" data-v202-action="contract">عقود العقار</button>'+(record.receipts.length?'<button type="button" data-v202-unit-receipt="'+index+'">فتح آخر وصل</button>':'')+(protectedOnly?'':'<button type="button" data-v202-unit-payment="'+index+'">تسجيل إيجار للوحدة</button>')+'</footer>'+ 
      '</article>';
    }).join('');
    return '<section class="aq-unit-directory" aria-labelledby="aqUnitDirectoryTitle">'+
      '<header class="aq-unit-toolbar"><div><p>دليل الوحدات المحمي</p><h3 id="aqUnitDirectoryTitle">كل وحدة بملف مستقل</h3><small>'+escapeHtml(periodLabel(period))+'</small></div><div class="aq-unit-search"><span id="v202UnitSearchLabel">بحث بالوحدة أو المستأجر أو رقم العقد</span>'+icon('search')+'<input id="v202UnitSearch" type="search" aria-labelledby="v202UnitSearchLabel" autocomplete="off" value="'+escapeHtml(unitSearch)+'" placeholder="مثال: 12 أو رقم العقد"><button type="button" class="aq-unit-search-clear" data-v202-unit-clear aria-label="مسح البحث" '+(unitSearch?'':'hidden')+'>'+icon('close')+'</button></div></header>'+ 
      '<div class="aq-unit-kpis">'+
        '<div class="aq-unit-kpi"><span>ملفات مرتبطة</span><strong>'+stats.linked+'</strong><small>'+stats.missing+' بلا بيانات تفصيلية</small></div>'+ 
        '<div class="aq-unit-kpi is-paid"><span>مسددة</span><strong>'+stats.paid+'</strong><small>للفترة المختارة</small></div>'+ 
        '<div class="aq-unit-kpi is-due"><span>مستحقة/جزئية</span><strong>'+stats.due+'</strong><small>تحتاج تحصيل</small></div>'+ 
        '<div class="aq-unit-kpi is-attention"><span>تحتاج مراجعة</span><strong>'+stats.review+'</strong><small>ربط أو اعتماد</small></div>'+ 
      '</div>'+ 
      '<div class="aq-unit-result-count" id="v202UnitResultCount" aria-live="polite">عرض '+records.length+' من '+records.length+' وحدة</div>'+ 
      '<div class="aq-unit-list">'+(cards||'<div class="aq-unit-empty"><strong>لا توجد ملفات وحدات مرتبطة</strong><p>اربط عقدًا أو بيانات مستأجر لتظهر هنا.</p></div>')+'</div><div class="aq-unit-empty aq-unit-no-results" role="status" hidden><strong>لا توجد وحدات مطابقة</strong><p>جرّب رقم وحدة أو اسم مستأجر أو رقم عقد مختلف.</p></div>'+ 
    '</section>';
  }

  function statusLabel(value){return STATUS_LABELS[value]||value||'غير محدد'}

  function healthFor(context){
    if(!context.activeContracts.length)return {tone:'link',label:'يحتاج ربط عقد',detail:'ابدأ بعقد لربط المستأجر والتحصيل بالعقار'};
    if(context.due>0)return {tone:'attention',label:'يحتاج تحصيل',detail:'يوجد إيجار مستحق مرتبط بالعقار'};
    if(context.openMaintenance.length)return {tone:'attention',label:'توجد متابعة',detail:'طلبات صيانة تحتاج متابعة'};
    return {tone:'good',label:'الوضع منتظم',detail:'لا توجد متابعة عاجلة في البيانات المسجلة'};
  }

  function emptyState(title,copy,action,label){
    return '<div class="v202-empty"><span>'+icon('building')+'</span><div><strong>'+escapeHtml(title)+'</strong><p>'+escapeHtml(copy)+'</p></div>'+
      (action?'<button type="button" data-v202-action="'+action+'">'+escapeHtml(label||'ابدأ الآن')+'</button>':'')+'</div>';
  }

  function kpi(label,value,meta,tone){
    return '<div class="v202-kpi '+(tone?'is-'+tone:'')+'"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong><small>'+escapeHtml(meta)+'</small></div>';
  }

  function journey(context){
    const steps=[
      {label:'بيانات العقار',done:true,copy:'العقار مسجل'},
      {label:'العقد',done:context.activeContracts.length>0,copy:context.activeContracts.length?context.activeContracts.length+' عقد موقّع سارٍ':'لا يوجد عقد موقّع سارٍ'},
      {label:'التحصيل',done:context.propertyCollections.length>0,copy:context.propertyCollections.length?context.propertyCollections.length+' عملية':'لا يوجد تحصيل'},
      {label:'الكشف',done:context.propertyCollections.length>0||context.expenses.length>0,copy:'جاهز للطباعة'}
    ];
    return '<div class="v202-journey" aria-label="مسار تشغيل العقار">'+steps.map(function(step,index){
      const current=!step.done&&steps.slice(0,index).every(function(previous){return previous.done});
      return '<div class="v202-journey-step '+(step.done?'is-done':current?'is-current':'')+'"><span>'+(step.done?icon('check'):String(index+1))+'</span><div><strong>'+step.label+'</strong><small>'+step.copy+'</small></div></div>';
    }).join('')+'</div>';
  }

  function overviewPanel(context){
    const health=healthFor(context);
    const occupied=context.activeContracts.length?context.occupiedUnits+' من '+context.units:'غير مربوط';
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const nextAction=context.activeContracts.length?'payment':'contract';
    const nextLabel=context.activeContracts.length?(protectedOnly?'عرض التحصيل':'تسجيل إيجار'):(protectedOnly?'عرض العقود':'إبرام عقد');
    return '<div class="v202-overview-grid">'+
      '<section class="v202-overview-main">'+
        '<div class="v202-section-head"><div><p>رحلة العقار</p><h3>من العقد إلى الكشف</h3></div><span class="v202-health is-'+health.tone+'">'+health.label+'</span></div>'+journey(context)+
        '<div class="v202-next-action"><div><span>الإجراء التالي</span><strong>'+escapeHtml(health.detail)+'</strong></div><button type="button" data-v202-action="'+nextAction+'">'+nextLabel+' '+icon('arrow')+'</button></div>'+
      '</section>'+
      '<aside class="v202-property-facts"><h3>ملخص العقار</h3><dl><div><dt>المالك</dt><dd>'+escapeHtml(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير محدد')+'</dd></div><div><dt>الوحدات المشغولة</dt><dd>'+escapeHtml(occupied)+'</dd></div><div><dt>عقود مرتبطة</dt><dd>'+context.propertyContracts.length+'</dd></div><div><dt>طلبات مفتوحة</dt><dd>'+context.openMaintenance.length+'</dd></div></dl></aside>'+
    '</div>';
  }

  function contractsPanel(context){
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    if(!context.propertyContracts.length)return protectedOnly?emptyState('لا توجد عقود مرتبطة','لا توجد عقود محمية مرتبطة بهذا العقار حالياً.','',''):emptyState('لا توجد عقود مرتبطة','إبرام عقد من هنا يربطه بالعقار تلقائياً.','contract','إبرام عقد');
    return '<div class="v202-card-list">'+context.propertyContracts.map(function(contract){
      return '<article class="v202-contract-card"><div class="v202-contract-icon">'+icon('contract')+'</div><div><span>'+escapeHtml(contract.contract_no||'عقد بدون رقم')+'</span><strong>'+escapeHtml(contract.tenant||'مستأجر غير محدد')+'</strong><small>'+escapeHtml(contract.unit||'وحدة غير محددة')+' • '+escapeHtml(contract.rent||'إيجار غير محدد')+'</small></div><em class="is-'+escapeHtml(contract.status||'draft')+'">'+escapeHtml(statusLabel(contract.status))+'</em></article>';
    }).join('')+'</div>'+(protectedOnly?'<div class="v202-document-note"><strong>العقود المحمية</strong><p>تُعرض العقود المرتبطة هنا من الذاكرة الآمنة ولا تُنسخ إلى التخزين المحلي.</p></div>':'<div class="v202-panel-footer"><button type="button" data-v202-action="contract">عقد جديد '+icon('arrow')+'</button></div>');
  }

  function collectionsPanel(context){
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    if(!context.propertyCollections.length)return protectedOnly?emptyState('لا توجد عمليات تحصيل مرتبطة','لا توجد دفعات محمية مرتبطة بهذا العقار حالياً.','',''):emptyState('لا توجد عمليات تحصيل مرتبطة','سجّل إيجاراً من ملف العقار ليظهر هنا وفي الكشف.','payment','تسجيل إيجار');
    return '<div class="v202-ledger" role="region" aria-label="تحصيلات العقار"><table><thead><tr><th>الإيصال</th><th>المستأجر</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>'+context.propertyCollections.map(function(row,index){
      return '<tr><td data-label="الإيصال">'+escapeHtml(row?.[0]||'—')+'</td><td data-label="المستأجر">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ">'+escapeHtml(row?.[2]||'—')+'</td><td data-label="الحالة"><span class="v202-status">'+escapeHtml(row?.[3]||'—')+'</span></td><td data-label="التاريخ">'+localDate(row?.[5])+'</td><td data-label="إجراء"><button type="button" data-v202-receipt-index="'+index+'">فتح الوصل</button></td></tr>';
    }).join('')+'</tbody></table></div>'+(protectedOnly?'':'<div class="v202-panel-footer"><button type="button" data-v202-action="payment">تسجيل إيجار '+icon('arrow')+'</button></div>');
  }

  function expensesPanel(context){
    if(!context.expenses.length)return emptyState('لا توجد مصروفات مرتبطة','المصروفات التي تسجّل باسم العقار ستظهر هنا وفي كشف الإيجار.','','');
    return '<div class="v202-ledger" role="region" aria-label="مصروفات العقار"><table><thead><tr><th>الفئة</th><th>المبلغ</th><th>المورد</th></tr></thead><tbody>'+context.expenses.map(function(row){
      return '<tr><td data-label="الفئة">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ">'+escapeHtml(row?.[2]||'—')+'</td><td data-label="المورد">'+escapeHtml(row?.[3]||'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }

  function workspaceMarkup(context){
    const health=healthFor(context);
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    return '<section class="v202-workspace" role="dialog" aria-modal="true" aria-labelledby="v202PropertyTitle" aria-describedby="v202PropertyDescription">'+
      '<header class="v202-workspace-head"><div class="v202-property-identity"><span class="v202-property-mark">'+icon('building')+'</span><div><p>ملف العقار التشغيلي</p><h2 id="v202PropertyTitle">'+escapeHtml(activeProperty)+'</h2><span id="v202PropertyDescription">العقد والتحصيل والوصولات والكشف في مكان واحد.</span></div></div><div class="v202-head-side"><span class="v202-health is-'+health.tone+'">'+health.label+'</span><button type="button" class="v202-icon-button" data-v202-close aria-label="إغلاق ملف العقار">'+icon('close')+'</button></div></header>'+
      '<div class="v202-property-kpis">'+
        kpi('الوحدات',String(context.units),'المسجلة في العقار')+
        kpi('الإيراد المسجل',money(context.income),'حسب بيانات العقار','gold')+
        kpi('المقبوضات المرتبطة',money(context.collected),context.settledCollections.length+' دفعة معتمدة','good')+
        kpi('الإيجار المستحق',money(context.due),context.due?'يحتاج متابعة':'لا يوجد مستحق مرتبط',context.due?'attention':'')+
        kpi('المصروفات',money(context.expenseTotal),context.expenses.length+' بند مسجل')+
        kpi('الصافي التشغيلي',money(context.net),'الإيراد ناقص المصروفات','gold')+
      '</div>'+
      '<nav class="v202-actions" aria-label="إجراءات العقار">'+
        '<button type="button" data-v202-action="contract">'+icon('contract')+'<span><strong>'+(protectedOnly?'عقود العقار':'إبرام عقد')+'</strong><small>'+(protectedOnly?'عرض العقود المرتبطة':'إنشاء وربط العقد')+'</small></span></button>'+
        '<button type="button" data-v202-action="payment">'+icon('wallet')+'<span><strong>'+(protectedOnly?'التحصيل':'تسجيل إيجار')+'</strong><small>'+(protectedOnly?'عرض الدفعات والوصولات':'تحصيل وإصدار وصل')+'</small></span></button>'+
        '<button type="button" data-v202-action="statement">'+icon('chart')+'<span><strong>كشف الإيجار</strong><small>كشف تفصيلي PDF</small></span></button>'+ 
        '<button type="button" data-v202-action="profile">'+icon('building')+'<span><strong>'+(protectedOnly?'ملخص العقار':'الملف الكامل')+'</strong><small>'+(protectedOnly?'داخل الملف المحمي':'العقار 360°')+'</small></span></button>'+ 
      '</nav>'+ 
      '<div class="v202-tabs" role="tablist" aria-label="تفاصيل العقار">'+
        '<button type="button" id="v202TabOverview" role="tab" aria-controls="v202Panel" data-v202-tab="overview">نظرة عامة</button>'+ 
        '<button type="button" id="v202TabUnits" role="tab" aria-controls="v202Panel" data-v202-tab="units">الوحدات <span>'+unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)).length+'</span></button>'+ 
        '<button type="button" id="v202TabContracts" role="tab" aria-controls="v202Panel" data-v202-tab="contracts">العقود <span>'+context.propertyContracts.length+'</span></button>'+ 
        '<button type="button" id="v202TabCollections" role="tab" aria-controls="v202Panel" data-v202-tab="collections">التحصيل <span>'+context.propertyCollections.length+'</span></button>'+ 
        '<button type="button" id="v202TabExpenses" role="tab" aria-controls="v202Panel" data-v202-tab="expenses">المصروفات <span>'+context.expenses.length+'</span></button>'+ 
      '</div>'+ 
      '<div class="v202-panel" id="v202Panel" role="tabpanel" tabindex="0"></div>'+ 
    '</section>';
  }

  function renderPanel(context){
    const panel=document.getElementById('v202Panel');
    if(!panel)return;
    document.querySelectorAll('#v202PropertyWorkspace [data-v202-tab]').forEach(function(button){
      const selected=button.getAttribute('data-v202-tab')===activeTab;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      if(selected)panel.setAttribute('aria-labelledby',button.id);
    });
    if(activeTab==='units')panel.innerHTML=unitsPanel(context,latestOfficialPeriod(activeProperty));
    else if(activeTab==='contracts')panel.innerHTML=contractsPanel(context);
    else if(activeTab==='collections')panel.innerHTML=collectionsPanel(context);
    else if(activeTab==='expenses')panel.innerHTML=expensesPanel(context);
    else panel.innerHTML=overviewPanel(context);
  }

  function renderWorkspace(){
    const context=contextFor(activeProperty);
    const overlay=document.getElementById('v202PropertyWorkspace');
    if(!overlay||!context)return;
    overlay.innerHTML=workspaceMarkup(context);
    renderPanel(context);
  }

  function ensureWorkspace(){
    if(document.getElementById('v202PropertyWorkspace'))return;
    const overlay=document.createElement('div');
    overlay.id='v202PropertyWorkspace';
    overlay.className='v202-workspace-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    document.body.appendChild(overlay);
  }

  function suspendLayer(id,suspended){
    const layer=document.getElementById(id);
    if(!layer)return;
    if(suspended){layer.setAttribute('inert','');layer.setAttribute('aria-hidden','true')}
    else if(layer.classList.contains('on')){layer.removeAttribute('inert');layer.setAttribute('aria-hidden','false')}
  }

  function syncLayerState(){
    const top=topLayer();
    document.body.classList.toggle('v202-layer-open',Boolean(top));
    if(top&&!backgroundInertState){
      backgroundInertState=new Map(Array.from(document.body.children).map(function(node){return [node,node.hasAttribute('inert')]}));
    }
    if(top&&backgroundInertState){
      Array.from(document.body.children).forEach(function(node){
        if(!backgroundInertState.has(node))backgroundInertState.set(node,node.hasAttribute('inert'));
        if(node===top)node.removeAttribute('inert');
        else node.setAttribute('inert','');
      });
    }else if(!top&&backgroundInertState){
      backgroundInertState.forEach(function(wasInert,node){
        if(!node.isConnected)return;
        if(wasInert)node.setAttribute('inert','');
        else node.removeAttribute('inert');
      });
      backgroundInertState=null;
    }
  }

  function reportPropertyAmbiguity(name){
    const count=propertyMatches(name).length;
    if(count>1)window.alert('يوجد أكثر من عقار بالاسم نفسه. غيّر اسم أحدها لضمان ربط العقود والتحصيل بالعقار الصحيح.');
  }

  function openWorkspace(name,trigger){
    const record=propertyRecord(name);
    if(!record){reportPropertyAmbiguity(name);return}
    ensureWorkspace();
    activeProperty=String(record?.[0]||name);
    propertyTrigger=trigger||document.activeElement;
    activeTab='overview';
    unitSearch='';
    renderWorkspace();
    const overlay=document.getElementById('v202PropertyWorkspace');
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    syncLayerState();
    requestAnimationFrame(function(){overlay.querySelector('[data-v202-action]')?.focus()});
  }

  function closeWorkspace(restore){
    const overlay=document.getElementById('v202PropertyWorkspace');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('inert','');
    overlay.setAttribute('aria-hidden','true');
    syncLayerState();
    if(restore!==false){
      const original=propertyTrigger instanceof HTMLElement&&propertyTrigger.isConnected?propertyTrigger:null;
      const fallback=Array.from(document.querySelectorAll('[data-v201-property]')).find(function(button){
        return normalized(button.getAttribute('data-v201-property'))===normalized(activeProperty);
      });
      const focusTarget=original||fallback;
      if(focusTarget instanceof HTMLElement)setTimeout(function(){focusTarget.focus()},0);
    }
    propertyTrigger=null;
    unitSearch='';
    const panel=document.getElementById('v202Panel');
    if(panel)panel.textContent='';
  }

  function selectPropertyOnPage(selectId,renderName){
    setTimeout(function(){
      const select=document.getElementById(selectId);
      if(!select)return;
      const option=Array.from(select.options).find(function(item){return normalized(item.textContent)===normalized(activeProperty)});
      if(option)select.value=option.value;
      if(typeof window[renderName]==='function')window[renderName]();
      select.focus({preventScroll:true});
    },140);
  }

  function routeAction(action,trigger){
    if(protectedPropertyActive(activeProperty)&&['payment','contract','profile'].includes(action)){
      activeTab=action==='payment'?'collections':(action==='contract'?'contracts':'overview');
      const context=contextFor(activeProperty);
      if(context)renderPanel(context);
      document.getElementById(action==='payment'?'v202TabCollections':(action==='contract'?'v202TabContracts':'v202TabOverview'))?.focus();
      return true;
    }
    if(action==='payment')return openPayment(trigger);
    if(action==='statement')return openStatementDocument(undefined,trigger);
    closeWorkspace(false);
    if(action==='contract'){
      window.go?.('smartContractsPage');
      return selectPropertyOnPage('contractPropertyV55','loadContractsV55');
    }
    if(action==='profile'){
      window.go?.('property360Page');
      return selectPropertyOnPage('property360SelectV58','renderProperty360V58');
    }
  }

  function openUnitReceipt(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-receipt'))];
    const receipt=record?.receipts?.[record.receipts.length-1];
    if(!receipt)return false;
    const matches=context.propertyCollections.filter(function(row){return normalized(row?.[0])===normalized(receipt)});
    if(matches.length!==1)return false;
    openReceiptDocument(matches[0],button);
    return true;
  }

  function openUnitPayment(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-payment'))];
    openPayment(button,record?.contractId||'');
    return Boolean(record);
  }

  function nextReceiptNumber(){
    const year=new Date().getFullYear();
    const used=receiptNumbers();
    const pattern=new RegExp('^AQ-R-'+year+'-(\\d+)$','i');
    let sequence=0;
    used.forEach(function(receipt){
      const match=String(receipt).match(pattern);
      if(match)sequence=Math.max(sequence,Number(match[1])||0);
    });
    sequence+=1;
    let value='';
    do{value='AQ-R-'+year+'-'+String(sequence++).padStart(4,'0')}while(Array.from(used).some(function(item){return normalized(item)===normalized(value)}));
    return value;
  }

  function receiptNumbers(){
    return new Set(rows('collections').map(function(row){return String(row?.[0]||'').trim()}).concat(rawLedgerRecords().map(function(entry){return String(entry?.receiptNo||'').trim()})).filter(Boolean));
  }

  function receiptExists(receipt){
    const key=normalized(receipt);
    return Array.from(receiptNumbers()).some(function(value){return normalized(value)===key});
  }

  function contractRent(contract){
    const current=contract?.rent;
    return numberFrom(current!=null&&String(current).trim()!==''?current:contract?.contractRent);
  }

  function paymentKey(property,contractOrId,unit,period){
    const id=typeof contractOrId==='object'?contractId(contractOrId):String(contractOrId||'');
    const resolvedUnit=typeof contractOrId==='object'?contractOrId?.unit:unit;
    return [normalized(property),'contract:'+normalized(id),'unit:'+normalized(resolvedUnit),String(period||'')].join('|');
  }

  function paymentContracts(context){
    return context.propertyContracts.filter(function(contract){return signedContract(contract)&&Boolean(contractId(contract)&&contract.tenant&&contract.unit)});
  }

  function selectedPaymentContract(){
    const selected=document.getElementById('v202PaymentContract')?.value||'';
    const context=contextFor(activeProperty);
    return context?paymentContracts(context).find(function(contract){return contractId(contract)===selected}):null;
  }

  function dateParts(){
    const date=new Date();
    return {year:date.getFullYear(),month:String(date.getMonth()+1).padStart(2,'0'),day:String(date.getDate()).padStart(2,'0')};
  }

  function currentPeriod(){const part=dateParts();return part.year+'-'+part.month}
  function todayValue(){const part=dateParts();return part.year+'-'+part.month+'-'+part.day}

  function validDate(value){
    const match=String(value||'').match(/^(\d{4})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
    if(!match)return false;
    const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
    return date.getUTCFullYear()===Number(match[1])&&date.getUTCMonth()===Number(match[2])-1&&date.getUTCDate()===Number(match[3]);
  }

  function paymentMatchesContract(entry,contract){
    const entryId=normalized(entry?.contractId||entry?.contract_id);
    const targetId=normalized(contractId(contract));
    if(entryId&&targetId)return entryId===targetId;
    return normalized(entry?.unit)===normalized(contract?.unit)&&normalized(entry?.tenant)===normalized(contract?.tenant);
  }

  function paidForPeriod(property,contract,period){
    const targetKey=paymentKey(property,contract,contract?.unit,period);
    return ledgerRecords().filter(function(entry){
      const exactKey=String(entry?.paymentKey||'');
      const legacyMatch=normalized(entry?.property)===normalized(property)&&paymentMatchesContract(entry,contract)&&String(entry?.period||'')===String(period||'');
      return (exactKey?exactKey===targetKey:legacyMatch)&&settledPayment(entry?.status);
    }).reduce(function(total,entry){return total+numberFrom(entry?.paid)},0);
  }

  function remainingForPeriod(property,contract,period){
    const due=contractRent(contract);
    return due>0?Math.max(0,due-paidForPeriod(property,contract,period)):0;
  }

  function paymentDialogMarkup(context,preferredContractId){
    const available=paymentContracts(context);
    return '<section class="v202-dialog v202-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="v202PaymentTitle" aria-describedby="v202PaymentDescription">'+
      '<header><div><p>تحصيل العقار</p><h2 id="v202PaymentTitle">تسجيل إيجار</h2><span id="v202PaymentDescription">'+escapeHtml(activeProperty)+' — وبعد الحفظ يجهز الوصل مباشرة.</span></div><button type="button" class="v202-icon-button" data-v202-payment-close aria-label="إغلاق">'+icon('close')+'</button></header>'+ 
      (!available.length?'<div class="v202-inline-note is-warning">'+icon('alert')+' لا يوجد عقد موقّع سارٍ مع مستأجر ووحدة محددين. أكمل العقد أولاً.</div>':'')+
      '<form class="v202-form" id="v202PaymentForm">'+
        '<label><span>العقار</span><input value="'+escapeHtml(activeProperty)+'" disabled></label>'+ 
        '<label><span>العقد / الوحدة</span><select id="v202PaymentContract" required '+(available.length?'':'disabled')+'><option value="">اختر العقد والوحدة</option>'+available.map(function(contract){const id=contractId(contract);return '<option value="'+escapeHtml(id)+'" '+(String(id)===String(preferredContractId||'')?'selected':'')+'>'+escapeHtml(contract.tenant)+' — '+escapeHtml(contract.unit)+' — '+escapeHtml(contract.contract_no||id)+'</option>'}).join('')+'</select></label>'+ 
        '<label><span>رقم الوصل</span><input id="v202PaymentNumber" value="'+nextReceiptNumber()+'" required></label>'+ 
        '<label><span>المبلغ (د.ك)</span><input id="v202PaymentAmount" inputmode="decimal" autocomplete="off" placeholder="0.000" required></label>'+ 
        '<label><span>شهر الإيجار</span><input id="v202PaymentPeriod" type="month" value="'+currentPeriod()+'" required></label>'+ 
        '<label><span>تاريخ السداد</span><input id="v202PaymentDate" type="date" value="'+todayValue()+'" required></label>'+ 
        '<label><span>طريقة السداد</span><select id="v202PaymentMethod"><option>كي نت</option><option>تحويل بنكي</option><option>نقدي</option><option>أخرى</option></select></label>'+ 
        '<label><span>حالة السداد</span><select id="v202PaymentStatus"><option>مدفوع</option><option>جزئي</option><option>قيد المراجعة</option></select></label>'+ 
        '<label class="v202-form-wide"><span>ملاحظة اختيارية</span><input id="v202PaymentNote" placeholder="مثال: إيجار شهر سبتمبر"></label>'+ 
        '<div class="v202-payment-balance v202-form-wide" id="v202PaymentBalance" aria-live="polite">اختر العقد والوحدة لحساب المتبقي.</div>'+ 
        '<div class="v202-form-error" id="v202PaymentError" role="alert" aria-live="polite"></div>'+ 
        '<div class="v202-form-actions"><button type="button" data-v202-payment-close>إلغاء</button><button type="submit" class="is-primary">حفظ وإصدار الوصل '+icon('arrow')+'</button></div>'+ 
      '</form>'+ 
    '</section>';
  }

  function ensurePaymentDialog(){
    if(document.getElementById('v202PaymentDialog'))return;
    const overlay=document.createElement('div');
    overlay.id='v202PaymentDialog';
    overlay.className='v202-dialog-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    document.body.appendChild(overlay);
  }

  function openPayment(trigger,preferredContractId){
    const context=contextFor(activeProperty);
    if(!context)return;
    ensurePaymentDialog();
    paymentTrigger=trigger||document.activeElement;
    const overlay=document.getElementById('v202PaymentDialog');
    overlay.innerHTML=paymentDialogMarkup(context,preferredContractId);
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    suspendLayer('v202PropertyWorkspace',true);
    syncLayerState();
    updatePaymentBalance();
    requestAnimationFrame(function(){(document.getElementById('v202PaymentContract')||overlay.querySelector('[data-v202-payment-close]'))?.focus()});
  }

  function closePayment(restore){
    const overlay=document.getElementById('v202PaymentDialog');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('inert','');
    overlay.setAttribute('aria-hidden','true');
    suspendLayer('v202PropertyWorkspace',false);
    syncLayerState();
    if(restore!==false&&paymentTrigger instanceof HTMLElement&&paymentTrigger.isConnected)paymentTrigger.focus();
    paymentTrigger=null;
    overlay.textContent='';
  }

  function updatePaymentBalance(){
    const contract=selectedPaymentContract();
    const period=document.getElementById('v202PaymentPeriod')?.value||currentPeriod();
    const due=contractRent(contract);
    const paid=contract?paidForPeriod(activeProperty,contract,period):0;
    const remaining=due>0?Math.max(0,due-paid):0;
    const amount=document.getElementById('v202PaymentAmount');
    const balance=document.getElementById('v202PaymentBalance');
    const covered=Boolean(contract&&contractCoversPeriod(contract,period));
    if(amount&&contract&&!covered)amount.value='';
    else if(amount&&contract&&!amount.value&&remaining>0)amount.value=String(remaining);
    if(balance){
      balance.textContent=!contract?'اختر العقد والوحدة لحساب المتبقي.':due>0?
        (covered?'المستحق '+money(due)+' • المدفوع '+money(paid)+' • المتبقي '+money(remaining):'الشهر المحدد خارج مدة هذا العقد.'):
        'قيمة الإيجار غير محددة في العقد؛ لا يمكن إصدار وصل قبل تصحيحها.';
      balance.classList.toggle('is-settled',Boolean(contract&&covered&&due>0&&remaining===0));
    }
    return {contract,due,paid,remaining};
  }

  function savePayment(event){
    event.preventDefault();
    const error=document.getElementById('v202PaymentError');
    if(protectedPropertyActive(activeProperty)){
      if(error)error.textContent='الحفظ لهذا الملف المحمي متاح فقط عبر مساحة العمل الآمنة.';
      return false;
    }
    const contract=selectedPaymentContract();
    const tenant=String(contract?.tenant||'').trim();
    const receipt=document.getElementById('v202PaymentNumber')?.value.trim();
    const amount=strictMoney(document.getElementById('v202PaymentAmount')?.value);
    const status=document.getElementById('v202PaymentStatus')?.value||'مدفوع';
    const period=document.getElementById('v202PaymentPeriod')?.value||currentPeriod();
    const date=document.getElementById('v202PaymentDate')?.value||todayValue();
    const method=document.getElementById('v202PaymentMethod')?.value||'غير محدد';
    const note=document.getElementById('v202PaymentNote')?.value.trim()||'';
    if(!contract||!tenant||!contract.unit){
      if(error)error.textContent='اختر عقداً موقّعاً سارياً مربوطاً بمستأجر ووحدة.';
      return;
    }
    if(!receipt||!Number.isFinite(amount)||amount<=0){
      if(error)error.textContent='أدخل رقم الوصل ومبلغاً صحيحاً أكبر من صفر وبحد أقصى 3 منازل عشرية.';
      return;
    }
    if(!validPeriod(period)||!validDate(date)){
      if(error)error.textContent='راجع شهر الإيجار وتاريخ السداد.';
      return;
    }
    if(!contractCoversPeriod(contract,period)){
      if(error)error.textContent='الشهر المحدد خارج مدة هذا العقد.';
      return;
    }
    if(receiptExists(receipt)){
      if(error)error.textContent='رقم الوصل مستخدم. غيّره وحاول مرة ثانية.';
      return;
    }
    const due=contractRent(contract);
    if(due<=0){
      if(error)error.textContent='قيمة الإيجار غير محددة في العقد. صحح العقد أولاً.';
      return;
    }
    const balance=remainingForPeriod(activeProperty,contract,period);
    if(balance>0&&amount>balance){
      if(error)error.textContent='المبلغ أكبر من المتبقي '+money(balance)+'. راجع المبلغ.';
      return;
    }
    if(balance===0){
      if(error)error.textContent='إيجار هذا الشهر مسدد بالكامل لهذا المستأجر.';
      return;
    }
    const finalStatus=status==='قيد المراجعة'?status:(amount<balance?'جزئي':'مدفوع');
    const record=[receipt,tenant,money(amount),finalStatus,activeProperty,date,contract.unit,note,period,method];
    const data=appData();
    const previous={};
    ['collections','rentLedgerV202','audit'].forEach(function(key){
      previous[key]={owned:Object.prototype.hasOwnProperty.call(data,key),value:data[key]};
    });
    const ledgerEntry={
      id:'rent-'+receipt,receiptNo:receipt,property:activeProperty,unit:contract.unit,tenant,
      contractId:contractId(contract),contractNo:contract.contract_no||'',period,due,paid:amount,
      balance:settledPayment(finalStatus)?Math.max(0,balance-amount):balance,paidAt:date,
      method,status:finalStatus,note,source:'v202-entry',paymentKey:paymentKey(activeProperty,contract,contract.unit,period)
    };
    try{
      data.collections=(Array.isArray(previous.collections.value)?previous.collections.value:[]).concat([record.slice(0,4)]);
      data.rentLedgerV202=(Array.isArray(previous.rentLedgerV202.value)?previous.rentLedgerV202.value:[]).concat([ledgerEntry]);
      data.audit=(Array.isArray(previous.audit.value)?previous.audit.value:[]).concat([['المدير','تسجيل إيجار',activeProperty,'تم']]);
      if(typeof persist!=='function')throw new Error('persist unavailable');
      persist();
    }catch(_){
      Object.keys(previous).forEach(function(key){
        try{if(previous[key].owned)data[key]=previous[key].value;else delete data[key]}catch(_){ }
      });
      try{localStorage.setItem('aqari_v30',JSON.stringify(data))}catch(_){ }
      if(error)error.textContent='تعذر حفظ الدفعة. لم يصدر وصل، ولم تتغير الأرقام. حاول مرة أخرى.';
      return;
    }
    try{if(typeof render==='function')render()}catch(_){ }
    const returnTrigger=paymentTrigger;
    closePayment(false);
    renderWorkspace();
    openReceiptDocument(record,returnTrigger);
  }

  function receiptDocument(record){
    return '<article class="v202-document v202-receipt"><div class="v202-document-brand"><div><strong>عقاري</strong><span>إدارة الأملاك</span></div><b>وصل استلام إيجار</b></div>'+ 
      '<div class="v202-document-number"><span>رقم الوصل</span><strong>'+escapeHtml(record?.[0]||'—')+'</strong><small>'+localDate(record?.[5])+'</small></div>'+ 
      '<div class="v202-receipt-value"><span>استلمنا مبلغاً وقدره</span><strong>'+escapeHtml(record?.[2]||'—')+'</strong><small>'+escapeHtml(record?.[3]||'—')+'</small></div>'+ 
      '<dl class="v202-document-details"><div><dt>من السيد/السيدة</dt><dd>'+escapeHtml(record?.[1]||'—')+'</dd></div><div><dt>عن عقار</dt><dd>'+escapeHtml(record?.[4]||activeProperty)+'</dd></div><div><dt>الوحدة</dt><dd>'+escapeHtml(record?.[6]||'—')+'</dd></div><div><dt>شهر الإيجار</dt><dd>'+escapeHtml(record?.[8]?periodLabel(record[8]):'غير محدد')+'</dd></div><div><dt>طريقة السداد</dt><dd>'+escapeHtml(record?.[9]||'غير محدد')+'</dd></div><div><dt>البيان</dt><dd>'+escapeHtml(record?.[7]||'دفعة إيجار')+'</dd></div></dl>'+ 
      '<div class="v202-document-signatures"><div><span>المستلم</span><b>________________</b></div><div><span>الختم / التوقيع</span><b>________________</b></div></div>'+ 
      '<footer>هذا الوصل صادر من منصة عقاري وفق البيانات المسجلة وقت الإصدار.</footer></article>';
  }

  function rowOrEmpty(cells,colspan){return cells||'<tr><td colspan="'+colspan+'">لا توجد بيانات مرتبطة</td></tr>'}

  function periodLabel(period){
    const date=new Date(String(period||currentPeriod())+'-01T12:00:00');
    try{return date.toLocaleDateString('ar-KW',{year:'numeric',month:'long'})}
    catch(_){return String(period||currentPeriod())}
  }

  function rentStatementItems(context,period){
    const items=new Map();
    context.propertyContracts.filter(function(contract){return statementIncludesContract(contract,period)}).forEach(function(contract){
      const id=contractId(contract);
      const fallback=normalized(contract?.tenant)+'|'+normalized(contract?.unit);
      const key=id?'id:'+normalized(id):'party:'+fallback;
      if(!id&&!fallback.replace('|',''))return;
      items.set(key,{contractId:id,tenant:contract?.tenant||'—',unit:contract?.unit||'—',due:contractRent(contract),paid:0,pending:0,receipts:[],status:statusLabel(contract?.status)});
    });
    context.propertyLedger.filter(function(entry){return String(entry?.period||'')===period}).forEach(function(entry){
      const entryId=normalized(entry?.contractId||entry?.contract_id);
      let key=entryId?'id:'+entryId:'';
      if(entryId&&!items.has(key))return;
      if(!key){
        const matches=Array.from(items.entries()).filter(function(pair){
          return normalized(pair[1].tenant)===normalized(entry?.tenant)&&normalized(pair[1].unit)===normalized(entry?.unit);
        });
        if(matches.length===1)key=matches[0][0];
      }
      if(!key||!items.has(key))return;
      const item=items.get(key);
      if(settledPayment(entry?.status))item.paid+=numberFrom(entry?.paid);
      else item.pending+=numberFrom(entry?.paid);
      if(entry?.receiptNo)item.receipts.push(entry.receiptNo);
      items.set(key,item);
    });
    return Array.from(items.values()).map(function(item){
      item.balance=Math.max(0,item.due-item.paid);
      item.paymentStatus=item.due>0&&item.balance===0?'مسدد':item.paid>0?'جزئي':item.pending>0?'قيد المراجعة':'مستحق';
      return item;
    });
  }

  function statementValue(record,key,fallback){return hasField(record,key)?numberFrom(record[key]):fallback}

  function statementExtra(record,key){return hasField(record,key)?money(numberFrom(record[key])):'غير مسجل'}

  function statementDocument(context,period){
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const items=rentStatementItems(context,selectedPeriod);
    const official=officialStatementFor(activeProperty,selectedPeriod);
    const computedDue=items.reduce(function(total,item){return total+item.due},0);
    const computedPaid=items.reduce(function(total,item){return total+item.paid},0);
    const dueTotal=statementValue(official,'totalRent',computedDue);
    const paidTotal=statementValue(official,'totalCollected',computedPaid);
    const balanceTotal=Math.max(0,dueTotal-paidTotal);
    const rate=dueTotal?Math.min(100,paidTotal/dueTotal*100):0;
    const unitCount=official&&hasField(official,'unitCount')?numberFrom(official.unitCount):items.length;
    const ledgerRows=items.map(function(item){
      return '<tr><td>'+escapeHtml(item.unit)+'</td><td>'+escapeHtml(item.tenant)+'</td><td>'+escapeHtml(money(item.due))+'</td><td>'+escapeHtml(money(item.paid))+'</td><td>'+escapeHtml(money(item.balance))+'</td><td>'+escapeHtml(item.paymentStatus)+'</td><td>'+escapeHtml(item.receipts.join('، ')||'—')+'</td></tr>';
    }).join('');
    const unperiodized=context.propertyCollections.filter(function(row){return !row?.[8]}).length;
    const officialCopy=official?'الإجماليات أعلاه مأخوذة من الكشف الرسمي المخزن'+(hasField(official,'sourcePages')?' (مرجع الصفحات: '+escapeHtml(official.sourcePages)+')':'')+'. تفاصيل الوحدات أدناه معروضة للمطابقة. ':'الإجماليات محسوبة من العقود الموقّعة والدفعات المعتمدة. ';
    return '<div class="v202-document-period"><label for="v202StatementPeriod">شهر الكشف</label><input id="v202StatementPeriod" type="month" value="'+escapeHtml(selectedPeriod)+'"></div>'+ 
      '<article class="v202-document v202-statement"><div class="v202-document-brand"><div><strong>عقاري</strong><span>إدارة الأملاك</span></div><b>كشف إيجار العقار</b></div>'+ 
      '<div class="v202-statement-title"><div><span>العقار</span><h2>'+escapeHtml(activeProperty)+'</h2><p>المالك: '+escapeHtml(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير محدد')+'</p></div><div><span>فترة الكشف</span><strong>'+escapeHtml(periodLabel(selectedPeriod))+'</strong><small>أصدر في '+new Date().toLocaleDateString('ar-KW')+'</small></div></div>'+ 
      '<div class="v202-statement-totals">'+kpi('المستحق',money(dueTotal),unitCount+' وحدة/عقد','gold')+kpi('المحصّل',money(paidTotal),rate.toFixed(0)+'٪ نسبة التحصيل','good')+kpi('المتبقي',money(balanceTotal),balanceTotal?'يحتاج متابعة':'مكتمل',balanceTotal?'attention':'good')+'</div>'+ 
      '<div class="v202-statement-totals v202-statement-extras">'+kpi('العربون',statementExtra(official,'totalAdvance'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+kpi('التأمين',statementExtra(official,'totalInsurance'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+kpi('النظافة',statementExtra(official,'totalCleaning'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+'</div>'+ 
      '<section class="v202-document-section"><h3>تفاصيل الإيجار</h3><table><thead><tr><th>الوحدة</th><th>المستأجر</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الوصولات</th></tr></thead><tbody>'+rowOrEmpty(ledgerRows,7)+'</tbody></table></section>'+ 
      '<div class="v202-collection-rate"><div><span>نسبة التحصيل</span><strong>'+rate.toFixed(0)+'٪</strong></div><div role="progressbar" aria-label="نسبة التحصيل '+rate.toFixed(0)+' بالمئة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rate.toFixed(0)+'"><span style="width:'+rate.toFixed(2)+'%"></span></div></div>'+ 
      '<div class="v202-document-note"><strong>نطاق الكشف</strong><p>'+officialCopy+(unperiodized?'يوجد '+unperiodized+' تحصيل قديم مرتبط بلا شهر محدد ولم يدخل في إجمالي هذه الفترة.':'لا توجد تحصيلات مرتبطة بلا فترة.')+'</p></div>'+ 
      '<footer>عقاري • كشف إيجار مبني على البيانات المرتبطة بالعقار حتى وقت الإصدار</footer></article>';
  }

  function ensureDocumentDialog(){
    if(document.getElementById('v202DocumentDialog'))return;
    const overlay=document.createElement('div');
    overlay.id='v202DocumentDialog';
    overlay.className='v202-dialog-overlay v202-document-overlay';
    overlay.setAttribute('aria-hidden','true');
    overlay.setAttribute('inert','');
    overlay.innerHTML='<section class="v202-document-shell" role="dialog" aria-modal="true" aria-labelledby="v202DocumentDialogTitle"><header class="v202-document-toolbar"><button type="button" data-v202-document-close>رجوع</button><h2 id="v202DocumentDialogTitle">مستند عقاري</h2><button type="button" class="is-primary" data-v202-print>'+icon('printer')+' طباعة / PDF</button></header><div id="v202DocumentBody"></div></section>';
    document.body.appendChild(overlay);
  }

  function openDocument(title,markup,trigger,fallbackSelector){
    ensureDocumentDialog();
    documentTrigger=trigger||document.activeElement;
    documentFallbackSelector=fallbackSelector||'';
    const overlay=document.getElementById('v202DocumentDialog');
    const heading=document.getElementById('v202DocumentDialogTitle');
    const body=document.getElementById('v202DocumentBody');
    if(heading)heading.textContent=title;
    if(body)body.innerHTML=markup;
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    suspendLayer('v202PaymentDialog',true);
    suspendLayer('v202PropertyWorkspace',true);
    syncLayerState();
    requestAnimationFrame(function(){overlay.querySelector('[data-v202-document-close]')?.focus()});
  }

  function openReceiptDocument(record,trigger){openDocument('وصل استلام إيجار',receiptDocument(record),trigger,'#v202PropertyWorkspace [data-v202-action="payment"]')}

  function openStatementDocument(period,trigger){
    const context=contextFor(activeProperty);
    if(context)openDocument('كشف إيجار العقار',statementDocument(context,period||latestOfficialPeriod(activeProperty)),trigger,'#v202PropertyWorkspace [data-v202-action="statement"]');
  }

  function closeDocument(){
    const overlay=document.getElementById('v202DocumentDialog');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('inert','');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v202-print-document');
    suspendLayer('v202PaymentDialog',false);
    suspendLayer('v202PropertyWorkspace',false);
    syncLayerState();
    const trigger=documentTrigger;
    const fallback=documentFallbackSelector?document.querySelector(documentFallbackSelector):null;
    documentTrigger=null;
    documentFallbackSelector='';
    const body=document.getElementById('v202DocumentBody');
    if(body)body.textContent='';
    const focusTarget=trigger instanceof HTMLElement&&trigger.isConnected?trigger:fallback;
    if(focusTarget instanceof HTMLElement)setTimeout(function(){focusTarget.focus()},0);
  }

  function printDocument(){
    document.body.classList.add('v202-print-document');
    window.print();
    setTimeout(function(){document.body.classList.remove('v202-print-document')},400);
  }

  function topLayer(){
    return document.querySelector('#v202DocumentDialog.on')||document.querySelector('#v202PaymentDialog.on')||document.querySelector('#v202PropertyWorkspace.on');
  }

  function focusable(container){
    return Array.from(container.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(node){
      return !node.hidden&&!node.closest('[hidden],[inert],[aria-hidden="true"]');
    });
  }

  function handleTabTrap(event){
    const layer=topLayer();
    if(event.key!=='Tab'||!layer)return;
    const items=focusable(layer);
    if(!items.length)return;
    const first=items[0];
    const last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function handleTabNavigation(event,target){
    const tab=target?.closest?.('[data-v202-tab]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return false;
    const tabs=Array.from(tab.parentElement.querySelectorAll('[data-v202-tab]'));
    if(!tabs.length)return false;
    let index=tabs.indexOf(tab);
    if(event.key==='Home')index=0;
    else if(event.key==='End')index=tabs.length-1;
    else{
      const rtl=getComputedStyle(tab.parentElement).direction==='rtl';
      const delta=event.key==='ArrowRight'?(rtl?-1:1):(rtl?1:-1);
      index=(index+delta+tabs.length)%tabs.length;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    tabs[index].focus();
    tabs[index].click();
    return true;
  }

  function enhancePropertyTriggers(){
    document.querySelectorAll('[data-v201-property]').forEach(function(button){
      const name=button.getAttribute('data-v201-property')||'';
      if(button.getAttribute('data-v202-trigger-enhanced')===name)return;
      button.setAttribute('aria-label','فتح ملف العقار '+name);
      button.setAttribute('title','العقد والتحصيل والكشف');
      button.setAttribute('aria-haspopup','dialog');
      button.setAttribute('aria-controls','v202PropertyWorkspace');
      if(button.classList.contains('v201-property-manage')){
        button.innerHTML='فتح ملف العقار '+icon('arrow');
      }
      button.setAttribute('data-v202-trigger-enhanced',name);
    });
  }

  function ensureProtectedPropertyLaunchers(){
    if(!protectedAccessReady())return;
    const container=document.querySelector('#aqariV199Dashboard .v199-properties');
    if(!container)return;
    const existing=new Set(Array.from(document.querySelectorAll('[data-v201-property]')).map(function(button){return normalized(button.getAttribute('data-v201-property'))}));
    (protectedImportCache.properties||[]).forEach(function(record){
      const name=String(record?.[0]||'').trim();
      const key=normalized(name);
      if(!name||existing.has(key))return;
      const row=document.createElement('div');
      row.className='v199-property-row aq-protected-property';
      const mark=document.createElement('span');
      mark.className='v199-property-mark';
      mark.innerHTML=icon('building');
      const copy=document.createElement('span');
      copy.className='v199-property-copy';
      const strong=document.createElement('strong');
      strong.textContent=name;
      const small=document.createElement('small');
      small.textContent=String(record?.[1]||'غير محدد');
      copy.append(strong,small);
      const units=document.createElement('span');
      units.className='v199-property-units';
      units.textContent=numberFrom(record?.[2])+' وحدة';
      const income=document.createElement('span');
      income.className='v199-property-income';
      income.textContent=money(numberFrom(record?.[3]));
      const button=document.createElement('button');
      button.type='button';
      button.className='v201-property-manage';
      button.setAttribute('data-v201-property',name);
      button.setAttribute('aria-label','فتح ملف العقار '+name);
      button.innerHTML='فتح ملف العقار '+icon('arrow');
      row.append(mark,copy,units,income,button);
      container.appendChild(row);
      existing.add(key);
    });
  }

  function setPresentation(){
    document.body.classList.add('aq-v202','aq-v203');
    let meta=document.querySelector('meta[name="aqari-design"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-design';document.head.appendChild(meta)}
    if(meta.content!==V202_DESIGN)meta.content=V202_DESIGN;
    enhancePropertyTriggers();
    ensureProtectedPropertyLaunchers();
  }

  function installPresentationGuard(){
    const meta=document.querySelector('meta[name="aqari-design"]');
    if(meta)new MutationObserver(function(){if(meta.content!==V202_DESIGN)meta.content=V202_DESIGN}).observe(meta,{attributes:true,attributeFilter:['content']});
    new MutationObserver(function(){
      clearTimeout(enhanceTimer);
      enhanceTimer=setTimeout(setPresentation,60);
    }).observe(document.body,{childList:true,subtree:true});
  }

  function installEvents(){
    document.addEventListener('click',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      const property=target.closest('[data-v201-property]');
      if(property){
        event.preventDefault();event.stopImmediatePropagation();
        return openWorkspace(property.getAttribute('data-v201-property'),property);
      }
      const close=target.closest('[data-v202-close]');
      if(close){event.preventDefault();event.stopImmediatePropagation();return closeWorkspace(true)}
      const tab=target.closest('[data-v202-tab]');
      if(tab){
        event.preventDefault();event.stopImmediatePropagation();
        activeTab=tab.getAttribute('data-v202-tab')||'overview';
        const context=contextFor(activeProperty);
        if(context)renderPanel(context);
        return;
      }
      const civil=target.closest('[data-v202-civil-reveal]');
      if(civil){event.preventDefault();event.stopImmediatePropagation();return toggleCivilId(civil)}
      const clearSearch=target.closest('[data-v202-unit-clear]');
      if(clearSearch){
        event.preventDefault();event.stopImmediatePropagation();
        const input=document.getElementById('v202UnitSearch');
        if(input){input.value='';filterUnitCards('');input.focus()}
        return;
      }
      const unitReceipt=target.closest('[data-v202-unit-receipt]');
      if(unitReceipt){event.preventDefault();event.stopImmediatePropagation();return openUnitReceipt(unitReceipt)}
      const unitPayment=target.closest('[data-v202-unit-payment]');
      if(unitPayment){event.preventDefault();event.stopImmediatePropagation();return openUnitPayment(unitPayment)}
      const action=target.closest('[data-v202-action]');
      if(action){event.preventDefault();event.stopImmediatePropagation();return routeAction(action.getAttribute('data-v202-action'),action)}
      const receipt=target.closest('[data-v202-receipt-index]');
      if(receipt){
        event.preventDefault();event.stopImmediatePropagation();
        const context=contextFor(activeProperty);
        const record=context?.propertyCollections?.[Number(receipt.getAttribute('data-v202-receipt-index'))];
        if(record)return openReceiptDocument(record,receipt);
      }
      if(target.closest('[data-v202-payment-close]')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
      if(target.closest('[data-v202-document-close]')){event.preventDefault();event.stopImmediatePropagation();return closeDocument()}
      if(target.closest('[data-v202-print]')){event.preventDefault();event.stopImmediatePropagation();return printDocument()}
      if(target===document.getElementById('v202PropertyWorkspace')){event.preventDefault();event.stopImmediatePropagation();return closeWorkspace(true)}
      if(target===document.getElementById('v202PaymentDialog')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
    },true);

    document.addEventListener('input',function(event){
      const target=event.target instanceof HTMLInputElement?event.target:null;
      if(target?.id==='v202UnitSearch')filterUnitCards(target.value);
    },true);

    document.addEventListener('toggle',function(event){
      const details=event.target instanceof Element&&event.target.matches('details.aq-unit-details')?event.target:null;
      if(!details||details.open)return;
      const card=details.closest('[data-v202-unit-index]');
      const context=contextFor(activeProperty);
      const records=context?unitDirectoryRecords(context,latestOfficialPeriod(activeProperty)):[];
      maskUnitCard(card,records[Number(card?.getAttribute('data-v202-unit-index'))]);
    },true);

    document.addEventListener('submit',function(event){
      const target=event.target instanceof HTMLFormElement?event.target:null;
      if(target?.id==='v202PaymentForm'){event.stopImmediatePropagation();savePayment(event)}
    },true);

    document.addEventListener('change',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      if(target.id==='v202StatementPeriod'){
        const context=contextFor(activeProperty);
        const body=document.getElementById('v202DocumentBody');
        if(context&&body){
          body.innerHTML=statementDocument(context,target.value||currentPeriod());
          requestAnimationFrame(function(){document.getElementById('v202StatementPeriod')?.focus()});
        }
        return;
      }
      if(!['v202PaymentContract','v202PaymentPeriod'].includes(target.id))return;
      const amount=document.getElementById('v202PaymentAmount');
      if(amount)amount.value='';
      updatePaymentBalance();
    },true);

    document.addEventListener('keydown',function(event){
      const target=event.target instanceof Element?event.target:null;
      if(handleTabNavigation(event,target))return;
      if(event.key==='Escape'){
        if(document.querySelector('#v202DocumentDialog.on')){event.preventDefault();event.stopImmediatePropagation();return closeDocument()}
        if(document.querySelector('#v202PaymentDialog.on')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
        if(document.querySelector('#v202PropertyWorkspace.on')){event.preventDefault();event.stopImmediatePropagation();return closeWorkspace(true)}
      }
      handleTabTrap(event);
    },true);
  }

  function boot(){
    if(document.body.getAttribute('data-v202-ready')==='true'&&window.AQARI_V202?.version===V202_DESIGN)return;
    purgePersistedProtectedRows();
    setPresentation();
    ensureWorkspace();
    ensurePaymentDialog();
    ensureDocumentDialog();
    installEvents();
    installPresentationGuard();
    document.body.setAttribute('data-v202-ready','true');
    window.AQARI_V202=Object.freeze({
      version:V202_DESIGN,
      openProperty:function(name){openWorkspace(name,document.activeElement)},
      propertyContext:function(name){
        const context=contextFor(name);
        if(!context)return null;
        return Object.freeze({
          name:String(context.property?.[0]||''),contracts:context.propertyContracts.length,
          collections:context.propertyCollections.length,expenses:context.expenses.length,
          income:context.income,collected:context.collected,expenseTotal:context.expenseTotal,net:context.net
        });
      },
      testing:Object.freeze({
        parseMoneyInput:function(value){return strictMoney(value)},
        isSettledStatus:function(status){return settledPayment(status)},
        contractCoversPeriod:function(contract,period){return contractCoversPeriod(contract,period)},
        isBillableContract:function(contract,period){return signedContract(contract)&&contractCoversPeriod(contract,period)},
        paymentKey:function(property,contractIdValue,unit,period){return paymentKey(property,contractIdValue,unit,period)},
        statementItems:function(name,period){
          const context=contextFor(name);
          if(!context||!validPeriod(period))return Object.freeze([]);
          return Object.freeze(rentStatementItems(context,period).map(function(item){
            return Object.freeze({contractId:String(item.contractId||''),unit:String(item.unit||''),due:item.due,paid:item.paid,pending:item.pending,balance:item.balance,status:item.paymentStatus});
          }));
        },
        testContext:function(name,period){
          const context=contextFor(name);
          if(!context)return null;
          const selected=validPeriod(period)?period:currentPeriod();
          const items=rentStatementItems(context,selected);
          const official=officialStatementFor(name,selected);
          return Object.freeze({
            activeSignedContracts:context.activeContracts.length,billableContracts:context.propertyContracts.filter(function(contract){return statementIncludesContract(contract,selected)}).length,
            settledPaid:items.reduce(function(total,item){return total+item.paid},0),pending:items.reduce(function(total,item){return total+item.pending},0),
            official:Boolean(official),totalRent:statementValue(official,'totalRent',items.reduce(function(total,item){return total+item.due},0)),
            totalCollected:statementValue(official,'totalCollected',items.reduce(function(total,item){return total+item.paid},0))
          });
        }
      })
    });
    scheduleImportedHydration();
    setTimeout(setPresentation,500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
