(function(){
  'use strict';

  const V202_DESIGN='V206-preview';
  const V202_IMPORT_SOURCE='protected-rent-import-v202';
  const LINKED_LEDGER_ROW=Symbol('aqari-linked-ledger-row');
  const RENT_WRITE_ROLES=new Set(['general_manager','property_manager','accountant']);
  const PROTECTED_FIELDS=Object.freeze({
    contractsV202:['id','contract_no','tenant','property','unit','rent','contractRent','status','start_date','end_date','source'],
    tenantDirectoryV202:['tenantProfileId','nameAr','nameEn','passportNo','floor','receivedAt','property','unit','tenant','contractNo','phone','nationality','civilId','email','source','verified','sourcePage','contractStartRaw','contractEndRaw','paymentDateRaw','contractReceipt','contractReceived','accountant','insurance','insuranceDateRaw','advance','advanceDateRaw','cleaningFee','currentRent','freeMonth','evictionNotice','notes'],
    rentLedgerV202:['id','receiptNo','voucherNo','property','unit','tenant','contractId','contract_id','contractNo','contract_no','period','due','paid','balance','paidAt','method','transactionNo','knetTransactionNo','contractReceived','accountant','status','note','source','paymentKey'],
    rentStatementsV202:['id','property','period','totalRent','totalCollected','totalAdvance','totalInsurance','totalCleaning','sourcePages','unitCount','occupiedUnitCount','payerCount','importedAt','source']
  });
  const STATUS_LABELS={
    draft:'مسودة',ready:'جاهز للاعتماد',approved:'معتمد',signing:'بانتظار التوقيع',
    signed:'موقّع',expired:'منتهي',cancelled:'ملغي',paid:'مدفوع',partial:'جزئي',
    pending:'قيد المراجعة',received:'مستلم',settled:'مسدد'
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
  let activePropertyPeriod='';
  let propertyTrigger=null;
  let paymentTrigger=null;
  let documentTrigger=null;
  let documentFallbackSelector='';
  let activeTenantStatementKey='';
  let backgroundInertState=null;
  let activeTab='overview';
  let unitSearch='';
  let enhanceTimer=0;
  let hydratePromise=null;
  let hydrateListenerInstalled=false;
  let hydrateBoundaryListenerInstalled=false;
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

  function validEmail(value){
    const email=String(value==null?'':value).trim();
    if(!email||email.length>254||/[\r\n\s,;،?&#%]/.test(email))return false;
    return /^[^@<>]+@[^@<>.]+(?:\.[^@<>.]+)+$/.test(email);
  }

  function emailAddresses(value){
    const raw=String(value==null?'':value);
    if(/[\r\n]/.test(raw))return [];
    return Array.from(new Set(raw.split(/[;,،\s]+/).map(function(item){return item.trim()}).filter(validEmail)));
  }

  function maskedEmail(value){
    const email=String(value||'');
    const at=email.indexOf('@');
    if(at<1)return email;
    return email.slice(0,1)+'***'+email.slice(at);
  }

  function normalized(value){
    const text=scalarText(value);
    return text?text.toLocaleLowerCase('ar'):'';
  }

  function invalidScalarControls(value){
    return typeof value==='string'&&/(?:\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}|\p{Default_Ignorable_Code_Point})/u.test(value);
  }

  function scalarText(value){
    if(typeof value==='string')return invalidScalarControls(value)?'':value.trim();
    if(typeof value==='number'&&Number.isFinite(value))return String(value);
    return '';
  }

  function normalizedScalar(value){
    const text=scalarText(value);
    return text?normalized(latinDigits(text)):'';
  }

  function signatureScalar(value){
    const text=scalarText(value);
    if(text||value===''||value==null)return normalized(latinDigits(text));
    let encoded='';
    try{encoded=JSON.stringify(value)}catch(_){encoded=Object.prototype.toString.call(value)}
    return '!invalid-type:'+Object.prototype.toString.call(value)+':'+String(encoded);
  }

  function scalarAlias(record,keys,canonicalize){
    const values=[];
    for(const key of keys){
      if(!Object.prototype.hasOwnProperty.call(record||{},key))continue;
      const raw=record[key];
      if(raw==null||raw==='')continue;
      const text=scalarText(raw);
      if(!text)return {value:'',conflict:true};
      values.push(text);
    }
    const normalizeValue=typeof canonicalize==='function'?canonicalize:function(value){return normalized(latinDigits(value))};
    const distinct=new Set(values.map(normalizeValue));
    return {value:values[0]||'',conflict:distinct.size>1};
  }

  function latinDigits(value){
    const arabic='٠١٢٣٤٥٦٧٨٩';
    const persian='۰۱۲۳۴۵۶۷۸۹';
    return String(value==null?'':value)
      .replace(/[٠-٩]/g,function(digit){return arabic.indexOf(digit)})
      .replace(/[۰-۹]/g,function(digit){return persian.indexOf(digit)});
  }

  function referenceText(value){
    let text='';
    if(typeof value==='number')text=Number.isFinite(value)?String(value):'';
    else if(typeof value==='string'&&!invalidScalarControls(value))text=value.trim();
    try{text=text.normalize('NFKC')}catch(_){ }
    if(invalidScalarControls(text))return '';
    if(!text)return '';
    const placeholder=normalized(latinDigits(text));
    return ['—','-','–','n/a','na','none','null','undefined','غير مسجل','لا يوجد'].includes(placeholder)?'':text;
  }

  function invalidReferenceInput(value){
    if(value==null||value==='')return false;
    if(typeof value!=='string'&&typeof value!=='number')return true;
    if(typeof value==='number'&&!Number.isFinite(value))return true;
    if(invalidScalarControls(value))return true;
    let text=String(value).trim();
    try{text=text.normalize('NFKC')}catch(_){ }
    if(invalidScalarControls(text))return true;
    if(!text)return true;
    const placeholder=normalized(latinDigits(text));
    if(['—','-','–','n/a','na','none','null','undefined','غير مسجل','لا يوجد'].includes(placeholder))return false;
    return false;
  }

  function normalizedReference(value){
    const text=referenceText(value);
    return text?normalized(latinDigits(text)):'';
  }

  function identityText(value){return referenceText(value)}
  function normalizedIdentity(value){return normalizedReference(value)}
  function propertyKey(value){return normalizedIdentity(value)}

  function optionalIdentityField(value){
    if(value==null||value==='')return {present:false,value:'',invalid:false};
    const text=scalarText(value);
    const key=normalizedIdentity(text);
    return {present:true,value:key,invalid:Boolean(!text||!key)};
  }

  function identitySignature(value){
    if(value==null||value==='')return '';
    const key=normalizedIdentity(value);
    return key?'identity:'+key:'!invalid-identity:'+signatureScalar(value);
  }

  function ledgerAlias(entry,primary,legacy){
    const currentRaw=entry?.[primary];
    const fallbackRaw=entry?.[legacy];
    const current=normalizedIdentity(entry?.[primary]);
    const fallback=normalizedIdentity(entry?.[legacy]);
    const invalidCurrent=currentRaw!=null&&currentRaw!==''&&!identityText(currentRaw);
    const invalidFallback=fallbackRaw!=null&&fallbackRaw!==''&&!identityText(fallbackRaw);
    return {value:current||fallback,conflict:Boolean(invalidCurrent||invalidFallback||(current&&fallback&&current!==fallback))};
  }

  function numberFrom(value){
    const parsed=parseFloat(latinDigits(value).replace(/٫/g,'.').replace(/[,٬]/g,'').replace(/[^0-9.\-]/g,''));
    return Number.isFinite(parsed)?parsed:0;
  }

  function strictCount(value){
    if(typeof value==='number')return Number.isSafeInteger(value)&&value>=0?value:Number.NaN;
    if(typeof value!=='string'||invalidScalarControls(value))return Number.NaN;
    let raw=value.trim();
    try{raw=raw.normalize('NFKC')}catch(_){ }
    if(invalidScalarControls(raw))return Number.NaN;
    raw=latinDigits(raw);
    if(!/^(?:0|[1-9]\d*)$/.test(raw))return Number.NaN;
    const parsed=Number(raw);
    return Number.isSafeInteger(parsed)?parsed:Number.NaN;
  }

  function strictMoney(value){
    if(typeof value!=='string'&&typeof value!=='number')return Number.NaN;
    if(invalidScalarControls(value))return Number.NaN;
    if(typeof value==='number'&&!Number.isFinite(value))return Number.NaN;
    if(typeof value==='number'){
      if(value>1000000000000)return Number.NaN;
      const minor=value*1000;
      const rounded=Math.round(minor);
      if(value<0||!Number.isSafeInteger(rounded)||rounded/1000!==value)return Number.NaN;
      return rounded/1000;
    }
    const raw=latinDigits(value).trim().replace(/٫/g,'.');
    const plain=/^\d+(?:\.\d{1,3})?$/;
    const westernGrouped=/^\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?$/;
    const arabicGrouped=/^\d{1,3}(?:٬\d{3})+(?:\.\d{1,3})?$/;
    if(!plain.test(raw)&&!westernGrouped.test(raw)&&!arabicGrouped.test(raw))return Number.NaN;
    const canonical=raw.replace(/[,٬]/g,'');
    const parts=canonical.split('.');
    try{
      const minor=BigInt(parts[0])*1000n+BigInt((parts[1]||'').padEnd(3,'0'));
      if(minor>1000000000000000n)return Number.NaN;
      const amount=Number(minor)/1000;
      return BigInt(Math.round(amount*1000))===minor?amount:Number.NaN;
    }catch(_){return Number.NaN}
  }

  function strictCollectionMoney(value){
    if(typeof value!=='string'&&typeof value!=='number')return Number.NaN;
    if(invalidScalarControls(value))return Number.NaN;
    const direct=strictMoney(value);
    if(Number.isFinite(direct))return direct;
    const raw=latinDigits(value).trim().replace(/٫/g,'.');
    const match=raw.match(/^(\d+(?:(?:[,٬]\d{3})+)?(?:\.\d{1,3})?)\s*(?:د\.?\s*ك\.?|k\.?d\.?|kwd)$/i);
    return match?strictMoney(match[1]):Number.NaN;
  }

  function exactMoneySum(values,parser){
    const parse=typeof parser==='function'?parser:strictMoney;
    let minor=0n;
    (Array.isArray(values)?values:[]).forEach(function(value){
      const amount=parse(value);
      if(Number.isFinite(amount))minor+=BigInt(Math.round(amount*1000));
    });
    return Number(minor)/1000;
  }

  function exactMoneyDifference(left,right){
    const leftAmount=strictMoney(left);
    const rightAmount=strictMoney(right);
    if(!Number.isFinite(leftAmount)||!Number.isFinite(rightAmount))return 0;
    const difference=BigInt(Math.round(leftAmount*1000))-BigInt(Math.round(rightAmount*1000));
    return difference>0n?Number(difference)/1000:0;
  }

  function validLedgerPaymentAmount(entry){
    const amount=strictMoney(entry?.paid);
    return Number.isFinite(amount)&&amount>0;
  }

  function ledgerReference(entry){
    return referenceText(entry?.voucherNo)||referenceText(entry?.receiptNo);
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

  function accessIdentity(value){
    if(typeof value!=='string'||invalidScalarControls(value)||value!==value.trim())return '';
    return value;
  }

  function accessScope(context){
    const userId=accessIdentity(context?.user?.id);
    const workspaceId=accessIdentity(context?.workspace?.id);
    const membership=context?.membership;
    if(!userId||!workspaceId||membership?.is_active!==true)return null;
    if(accessIdentity(membership.user_id)!==userId)return null;
    if(accessIdentity(membership.workspace_id)!==workspaceId)return null;
    return {userId:userId,workspaceId:workspaceId};
  }

  function sameAccessScope(left,right){
    return Boolean(left&&right&&left.userId===right.userId&&left.workspaceId===right.workspaceId);
  }

  function activeAccessScope(){
    return accessScope(window.AQARI_SUPABASE?.context);
  }

  function protectedHydrationReady(expectedUserId){
    const expectedProvided=expectedUserId!=null&&expectedUserId!=='';
    const expected=accessIdentity(expectedUserId);
    if(expectedProvided&&!expected)return false;
    const active=activeAccessScope();
    return Boolean(
      document.documentElement?.classList?.contains?.('aqari-auth-unlocked')&&
      active&&(!expected||active.userId===expected)&&
      sameAccessScope(active,window.AQARI_DATA_GATE?.scope)&&
      sameAccessScope(active,window.AQARI_EARLY_STORAGE_GATE?.scope)
    );
  }

  function rentWriteAllowed(){
    if(!activeAccessScope())return false;
    const role=window.AQARI_SUPABASE?.context?.membership?.role;
    return Boolean(typeof role==='string'&&!invalidScalarControls(role)&&role===role.trim()&&RENT_WRITE_ROLES.has(role));
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
      const id=normalizedIdentity(record.id);
      if(id)return 'id:'+id;
      const contractNo=normalizedIdentity(record.contract_no);
      const property=normalizedIdentity(record.property);
      const unit=normalizedIdentity(record.unit);
      return contractNo&&property&&unit?'no:'+JSON.stringify([contractNo,property,unit]):'';
    }
    if(key==='tenantDirectoryV202'){
      const property=normalizedIdentity(record.property);
      const unit=normalizedIdentity(record.unit);
      const tenant=normalizedIdentity(record.tenant);
      return property&&unit&&tenant?'tenant:'+JSON.stringify([property,unit,tenant]):'';
    }
    if(key==='rentLedgerV202'){
      if([record.id,record.receiptNo,record.voucherNo].some(invalidReferenceInput))return '';
      const id=normalizedReference(record.id);
      if(id)return 'id:'+id;
      const receipt=Array.from(new Set([record.voucherNo,record.receiptNo].map(normalizedReference).filter(Boolean))).sort().join(':');
      const property=normalizedIdentity(record.property);
      const unit=normalizedIdentity(record.unit);
      const period=record.period;
      const contract=ledgerAlias(record,'contractId','contract_id');
      if(contract.conflict)return '';
      return receipt&&property&&unit&&validPeriod(period)?'receipt:'+JSON.stringify([receipt,contract.value,unit,period]):'';
    }
    if(key==='rentStatementsV202'){
      const id=normalizedIdentity(record.id);
      if(id)return 'id:'+id;
      const property=normalizedIdentity(record.property);
      const period=record.period;
      return property&&validPeriod(period)?'statement:'+JSON.stringify([property,period]):'';
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
    const allowed=new Set(Array.from(allowedNames||[]).map(propertyKey).filter(Boolean));
    if(allowed.size!==1)return {rows:result,changed};
    const remote=Array.isArray(remoteRows)?remoteRows.filter(function(row){
      return Array.isArray(row)&&allowed.has(propertyKey(row[0]));
    }):[];
    if(remote.length!==1)return {rows:result,changed};
    const candidate=remote[0].slice(0,4).map(function(value){
      return value==null||['string','number','boolean'].includes(typeof value)?value:'';
    });
    const matches=[];
    result.forEach(function(row,index){if(Array.isArray(row)&&propertyKey(row[0])===propertyKey(candidate[0]))matches.push(index)});
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
    cancelReceiptDownload();
    document.querySelectorAll('.aq-protected-property').forEach(function(node){node.remove()});
    ['v202PropertyWorkspace','v202PaymentDialog','v202DocumentDialog'].forEach(function(id){
      const layer=document.getElementById(id);
      if(layer)layer.remove();
    });
    propertyTrigger=null;
    paymentTrigger=null;
    documentTrigger=null;
    documentFallbackSelector='';
    activeTenantStatementKey='';
    activeProperty='';
    activePropertyPeriod='';
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
    const expectedProvided=expectedUserId!=null&&expectedUserId!=='';
    const expected=accessIdentity(expectedUserId);
    if(expectedProvided&&!expected){suspendProtectedImport(true);return false}
    if(!protectedHydrationReady(expected))return false;
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
          const dataScope=window.AQARI_DATA_GATE?.scope;
          const gatedScope=accessIdentity(dataScope?.userId)&&accessIdentity(dataScope?.workspaceId)?{userId:accessIdentity(dataScope.userId),workspaceId:accessIdentity(dataScope.workspaceId)}:null;
          const refreshAccess=requestScope||(gatedScope&&(!expected||gatedScope.userId===expected)?gatedScope:null)||(expected?{userId:expected}:undefined);
          context=await bridge.refreshContext(refreshAccess);
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
        const remoteState=await bridge.loadAppState(requestScope);
        const currentScope=accessScope(bridge.context);
        if(generation!==protectedImportGeneration)return false;
        if(!sameAccessScope(currentScope,requestScope)||(expected&&currentScope.userId!==expected)){
          return denyProtectedHydration(generation);
        }
        const primary=cloudPrimary(remoteState?.payload);
        if(!primary||typeof primary!=='object'||Array.isArray(primary))return denyProtectedHydration(generation);
        const data=appData();
        if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.properties))return denyProtectedHydration(generation);
        const importedPropertyNames=new Map();
        ['contractsV202','rentStatementsV202'].forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          remoteRows.forEach(function(record){
            if(!record||typeof record!=='object'||Array.isArray(record)||normalized(record.source)!==V202_IMPORT_SOURCE)return;
            const displayName=identityText(record.property);
            const key=propertyKey(record.property);
            if(displayName&&key&&!importedPropertyNames.has(key))importedPropertyNames.set(key,displayName);
          });
        });
        if(importedPropertyNames.size!==1)return denyProtectedHydration(generation);
        const importedPropertyKey=Array.from(importedPropertyNames.keys())[0];
        const nextCache=Object.create(null);
        Object.keys(PROTECTED_FIELDS).forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          if(!remoteRows.some(function(record){return normalized(record?.source)===V202_IMPORT_SOURCE}))return;
          nextCache[key]=remoteRows.filter(function(record){
            return record&&typeof record==='object'&&!Array.isArray(record)&&normalized(record.source)===V202_IMPORT_SOURCE&&propertyKey(record.property)===importedPropertyKey;
          }).map(function(record){return pickedRecord(record,PROTECTED_FIELDS[key])});
        });
        nextCache.properties=Array.isArray(primary.properties)?primary.properties.filter(function(row){
          return Array.isArray(row)&&propertyKey(row[0])===importedPropertyKey;
        }).map(function(row){return row.slice(0,4)}):[];
        protectedImportCache=nextCache;
        protectedPropertyNames=new Set([importedPropertyKey]);
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
      return false;
    }
    if(!['SIGNED_IN','TOKEN_REFRESHED','INITIAL_SESSION'].includes(event))return;
    const eventUserId=accessIdentity(session?.user?.id);
    if(!eventUserId){suspendProtectedImport(true);return false}
    const dropCache=!eventUserId||Boolean(protectedImportScope&&protectedImportScope.userId!==eventUserId);
    suspendProtectedImport(dropCache);
    queueProtectedHydration(eventUserId);
  }

  function queueProtectedHydration(expectedUserId){
    const expected=accessIdentity(expectedUserId);
    if(!expected||!protectedHydrationReady(expected))return false;
    setTimeout(function(){
      if(protectedHydrationReady(expected))hydrateProtectedImport(expected);
    },0);
    return true;
  }

  function handleProtectedBoundaryState(event){
    const state=event?.detail?.state;
    if(state==='locked'){
      clearProtectedImport();
      clearProtectedDom();
      return false;
    }
    if(state!=='ready')return false;
    const scope=activeAccessScope();
    return Boolean(scope&&queueProtectedHydration(scope.userId));
  }

  function installHydrateListener(){
    const bridge=window.AQARI_SUPABASE;
    if(hydrateListenerInstalled||typeof bridge?.onAuthStateChange!=='function')return;
    hydrateListenerInstalled=true;
    Promise.resolve(bridge.onAuthStateChange(handleProtectedAuthStateChange)).catch(function(){hydrateListenerInstalled=false});
  }

  function installHydrateBoundaryListener(){
    if(hydrateBoundaryListenerInstalled||typeof window.addEventListener!=='function')return;
    hydrateBoundaryListenerInstalled=true;
    window.addEventListener('aqari:auth-boundary',handleProtectedBoundaryState);
    window.addEventListener('pagehide',cancelReceiptDownload);
  }

  function scheduleImportedHydration(){
    [0,800,2500,8000].forEach(function(delay){
      setTimeout(function(){
        installHydrateListener();
        installHydrateBoundaryListener();
        const scope=activeAccessScope();
        if(scope)queueProtectedHydration(scope.userId);
      },delay);
    });
  }

  function sealProtectedImport(){
    clearProtectedImport();
    clearProtectedDom();
  }

  function tenantDirectory(sourceRows){
    const records=Array.isArray(sourceRows)?sourceRows:rows('tenantDirectoryV202');
    return records.filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)}).map(function(entry){
      const property=scalarAlias(entry,['property']);
      const unit=scalarAlias(entry,['unit']);
      const tenant=scalarAlias(entry,['tenant']);
      const contractNo=scalarAlias(entry,['contractNo','contract_no']);
      const source=scalarAlias(entry,['source']);
      if([property,unit,tenant,contractNo,source].some(function(alias){return alias.conflict}))return null;
      if([property,unit,tenant,contractNo].some(function(alias){return alias.value&&!identityText(alias.value)}))return null;
      function textField(){
        const alias=scalarAlias(entry,Array.from(arguments));
        return alias.conflict?'':alias.value;
      }
      function moneyField(key){
        const value=entry[key];
        return typeof value==='string'||(typeof value==='number'&&Number.isFinite(value))?value:undefined;
      }
      return {
        property:identityText(property.value),unit:identityText(unit.value),tenant:identityText(tenant.value),contractNo:identityText(contractNo.value),phone:textField('phone'),
        nationality:textField('nationality'),civilId:textField('civilId'),email:textField('email'),nameAr:textField('nameAr'),nameEn:textField('nameEn'),passportNo:textField('passportNo'),floor:textField('floor'),receivedAt:textField('receivedAt'),
        source:source.value,verified:entry.verified===true,sourcePage:textField('sourcePage'),
        contractStartRaw:textField('contractStartRaw'),contractEndRaw:textField('contractEndRaw'),
        paymentDateRaw:textField('paymentDateRaw'),contractReceipt:textField('contractReceipt'),
        contractReceived:textField('contractReceived')||textField('contractReceipt'),accountant:textField('accountant'),
        insurance:moneyField('insurance'),insuranceDateRaw:textField('insuranceDateRaw'),
        advance:moneyField('advance'),advanceDateRaw:textField('advanceDateRaw'),
        cleaningFee:moneyField('cleaningFee'),currentRent:moneyField('currentRent'),freeMonth:textField('freeMonth'),
        evictionNotice:textField('evictionNotice'),notes:textField('notes')
      };
    }).filter(Boolean);
  }

  function protectedAccessReady(){
    const active=activeAccessScope();
    return Boolean(
      sameAccessScope(active,window.AQARI_DATA_GATE?.scope)&&
      sameAccessScope(active,window.AQARI_EARLY_STORAGE_GATE?.scope)
    );
  }

  function protectedPropertyActive(name){
    const key=propertyKey(name);
    return Boolean(key&&protectedCacheUsable()&&protectedPropertyNames.has(key));
  }

  function protectedRecordsFor(cacheKey,property){
    if(!protectedPropertyActive(property))return null;
    const identity=propertyKey(property);
    const records=Array.isArray(protectedImportCache[cacheKey])?protectedImportCache[cacheKey]:[];
    return records.filter(function(record){
      return record&&typeof record==='object'&&!Array.isArray(record)&&
        normalized(record.source)===V202_IMPORT_SOURCE&&propertyKey(record.property)===identity;
    });
  }

  function protectedPropertyRows(name){
    if(!protectedPropertyActive(name))return null;
    const key=propertyKey(name);
    const records=Array.isArray(protectedImportCache.properties)?protectedImportCache.properties:[];
    return records.filter(function(row){return Array.isArray(row)&&propertyKey(row[0])===key});
  }

  function maskCivilId(value){
    const raw=String(value||'').trim();
    if(!raw)return 'غير مسجل';
    const compact=raw.replace(/\s+/g,'');
    const tail=compact.slice(-4);
    return tail?'•••• •••• '+tail:'•••• ••••';
  }

  function unitRecordKey(record){
    return JSON.stringify([
      normalizedIdentity(record?.property),normalizedIdentity(record?.contractId),normalizedIdentity(record?.unit),
      normalizedIdentity(record?.contractNo),normalizedIdentity(record?.tenant)
    ]);
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
    if(!protectedAccessReady()){clearProtectedDom();return 0}
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,activePropertyPeriod||latestOfficialPeriod(activeProperty)):[];
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
    const records=context?unitDirectoryRecords(context,activePropertyPeriod||latestOfficialPeriod(activeProperty)):[];
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
    const propertyKey=normalizedIdentity(property);
    const unitKey=normalizedIdentity(unit);
    const numberKey=normalizedIdentity(contractNo);
    const directory=tenantDirectory().filter(function(entry){
      return normalizedIdentity(entry.property)===propertyKey&&normalizedIdentity(entry.unit)===unitKey;
    });
    if(numberKey){
      const byNumber=directory.filter(function(entry){return normalizedIdentity(entry.contractNo)===numberKey});
      if(byNumber.length===1)return byNumber[0].tenant;
    }
    return directory.length===1?directory[0].tenant:'';
  }

  function contractStatus(value){
    const status=normalizedScalar(value);
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
    const contractNoAlias=scalarAlias(entry,['contract_no','contractNo'],normalizedIdentity);
    const propertyAlias=scalarAlias(entry,['property','propertyName'],normalizedIdentity);
    const unitAlias=scalarAlias(entry,['unit','unitName'],normalizedIdentity);
    const tenantAlias=scalarAlias(entry,['tenant','tenantName'],normalizedIdentity);
    const idAlias=scalarAlias(entry,['id','contractId','contract_id'],normalizedIdentity);
    const rentAlias=scalarAlias(entry,['rent','monthlyRent']);
    const faceRentAlias=scalarAlias(entry,['contractRent']);
    const depositAlias=scalarAlias(entry,['deposit']);
    const statusAlias=scalarAlias(entry,['status']);
    const startAlias=scalarAlias(entry,['start_date','startDate']);
    const endAlias=scalarAlias(entry,['end_date','endDate']);
    const sourceAlias=scalarAlias(entry,['source']);
    if([contractNoAlias,propertyAlias,unitAlias,tenantAlias,idAlias,rentAlias,faceRentAlias,depositAlias,statusAlias,startAlias,endAlias,sourceAlias].some(function(alias){return alias.conflict}))return null;
    if([contractNoAlias,propertyAlias,unitAlias,tenantAlias,idAlias].some(function(alias){return alias.value&&!identityText(alias.value)}))return null;
    const contractNo=identityText(contractNoAlias.value);
    const property=identityText(propertyAlias.value);
    const unit=identityText(unitAlias.value);
    const protectedSource=normalized(source)===V202_IMPORT_SOURCE;
    const tenant=identityText(tenantAlias.value)||(protectedSource?'':directoryTenant(property,unit,contractNo));
    const explicitId=identityText(idAlias.value);
    const id=explicitId||'legacy:'+JSON.stringify([contractNo||'بدون-رقم',property||'بدون-عقار',unit||'بدون-وحدة'])||(source+'-'+index);
    const rentRecorded=Boolean(rentAlias.value);
    const faceRentRecorded=Boolean(faceRentAlias.value);
    const rentValue=rentAlias.value;
    const faceRent=faceRentRecorded?faceRentAlias.value:rentValue;
    if(!property||!id)return null;
    return {
      id,contract_no:contractNo,tenant,property,unit,rent:rentValue==null?'':rentValue,
      contractRent:faceRent==null?'':faceRent,deposit:depositAlias.value,
      ...(hasRentEntitlement(entry)?{rentEntitlement:entry.rentEntitlement===undefined?null:JSON.parse(JSON.stringify(entry.rentEntitlement))}:{}),
      rentalTermsVersion:entry.rentalTermsVersion,freeMonthApproved:entry.freeMonthApproved===true,freeMonthPeriod:scalarText(entry.freeMonthPeriod),rentAdjustments:Array.isArray(entry.rentAdjustments)?entry.rentAdjustments.map(a=>({...a})):[],depositReceivedOn:scalarText(entry.depositReceivedOn),floor:scalarText(entry.floor),receivedAt:scalarText(entry.receivedAt),accountant:scalarText(entry.accountant),evictionNotice:scalarText(entry.evictionNotice),contractReceived:scalarText(entry.contractReceived),
      status:contractStatus(statusAlias.value),start_date:startAlias.value,
      end_date:endAlias.value,source:sourceAlias.value||String(source||''),_explicitId:Boolean(explicitId),
      _rentRecorded:Boolean(rentRecorded),_contractRentRecorded:Boolean(faceRentRecorded)
    };
  }

  function contractMergeKey(contract){
    if(contract?._explicitId&&normalizedIdentity(contract.id))return 'id:'+normalizedIdentity(contract.id);
    if(normalizedIdentity(contract?.contract_no))return 'no:'+JSON.stringify([normalizedIdentity(contract.contract_no),normalizedIdentity(contract?.property),normalizedIdentity(contract?.unit)]);
    return 'row:'+JSON.stringify([normalizedIdentity(contract?.property),normalizedIdentity(contract?.unit),normalizedIdentity(contract?.tenant),normalizedScalar(contract?.start_date)]);
  }

  function mergedContract(previous,next){
    if(!previous)return next;
    const result={...previous};
    Object.keys(next).forEach(function(key){
      if(key==='rentEntitlement'||next[key]!=null&&String(next[key]).trim()!=='')result[key]=next[key];
    });
    return result;
  }

  function contractIdentityConflict(left,right){
    const identityConflict=['contract_no','tenant','property','unit','start_date','end_date'].some(function(key){
      const a=normalized(left?.[key]);
      const b=normalized(right?.[key]);
      return Boolean(a&&b&&a!==b);
    });
    if(identityConflict)return true;
    const sameExplicitId=Boolean(
      left?._explicitId&&right?._explicitId&&normalizedIdentity(left.id)&&
      normalizedIdentity(left.id)===normalizedIdentity(right.id)
    );
    if(!sameExplicitId)return false;
    if(hasRentEntitlement(left)&&hasRentEntitlement(right)&&!sameStoredJson(left.rentEntitlement,right.rentEntitlement))return true;
    return [
      ['rent','_rentRecorded',function(value){const amount=strictMoney(value);return Number.isFinite(amount)?String(amount):'!invalid'}],
      ['contractRent','_contractRentRecorded',function(value){const amount=strictMoney(value);return Number.isFinite(amount)?String(amount):'!invalid'}],
      ['deposit',null,normalizedScalar],
      ['status',null,function(value){return contractStatus(value)}]
    ].some(function(definition){
      const key=definition[0];
      const flag=definition[1];
      const normalizeValue=definition[2];
      const leftPresent=flag?Boolean(left?.[flag]):Boolean(scalarText(left?.[key]));
      const rightPresent=flag?Boolean(right?.[flag]):Boolean(scalarText(right?.[key]));
      return leftPresent&&rightPresent&&normalizeValue(left[key])!==normalizeValue(right[key]);
    });
  }

  function mergeContractsSafely(records){
    const grouped=new Map();
    (Array.isArray(records)?records:[]).forEach(function(contract){
      if(!contract)return;
      const key=contractMergeKey(contract);
      const group=grouped.get(key);
      if(!group){grouped.set(key,{contract,conflict:false});return}
      if(contractIdentityConflict(group.contract,contract))group.conflict=true;
      else group.contract=mergedContract(group.contract,contract);
    });
    return Array.from(grouped.values()).filter(function(group){return !group.conflict}).map(function(group){return group.contract});
  }

  function contracts(){
    let local=[];
    try{
      const loaded=typeof localContractsV55==='function'?localContractsV55():[];
      local=Array.isArray(loaded)?loaded:[];
    }catch(_){local=[]}
    const records=[];
    local.forEach(function(entry,index){
      const contract=normalizeContract(entry,'local-v55',index);
      if(contract)records.push(contract);
    });
    rows('contractsV202').forEach(function(entry,index){
      const contract=normalizeContract(entry,'db-v202',index);
      if(contract)records.push(contract);
    });
    return mergeContractsSafely(records);
  }

  function contractId(contract){return referenceText(contract?.id)||referenceText(contract?.contract_no)}

  function validPeriod(value){return typeof value==='string'&&value===value.trim()&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)}

  function validContractDateRange(contract,requireBoth){
    const startValue=contract?.start_date;
    const endValue=contract?.end_date;
    if((startValue!=null&&startValue!==''&&!scalarText(startValue))||(endValue!=null&&endValue!==''&&!scalarText(endValue)))return false;
    const start=latinDigits(scalarText(startValue)).trim();
    const end=latinDigits(scalarText(endValue)).trim();
    if(requireBoth===true&&(!start||!end))return false;
    if((start&&!validDate(start))||(end&&!validDate(end)))return false;
    if(start&&end&&start>end)return false;
    if(contractStatus(contract?.status)==='expired'&&!end)return false;
    return true;
  }

  function validContractTerms(contract){
    if(!contract||typeof contract!=='object'||Array.isArray(contract))return false;
    if(!identityText(contractId(contract))||!identityText(contract?.property)||!identityText(contract?.unit)||!identityText(contract?.tenant))return false;
    if(!validContractDateRange(contract,true))return false;
    const current=contract?.rent;
    const rent=strictMoney(current!=null&&String(current).trim()!==''?current:contract?.contractRent);
    return Number.isFinite(rent)&&rent>0&&(!hasRentEntitlement(contract)||Number.isFinite(contractRent(contract,contract.start_date.slice(0,7))));
  }

  function contractCoversPeriod(contract,period){
    if(!validPeriod(period))return false;
    if(!validContractDateRange(contract,false))return false;
    const rawStart=latinDigits(scalarText(contract?.start_date)).trim();
    const rawEnd=latinDigits(scalarText(contract?.end_date)).trim();
    const start=rawStart.slice(0,7);
    const end=rawEnd.slice(0,7);
    if(start&&period<start)return false;
    if(end&&period>end)return false;
    return true;
  }

  function signedContract(contract){return contractStatus(contract?.status)==='signed'}

  function rawLedgerRecords(){
    return rows('rentLedgerV202');
  }

  function importedLedger(entry){
    const source=normalized(entry?.source);
    return Boolean(source&&!['v202-entry','local-v202','v202'].includes(source));
  }

  function collectionRowSignature(row){
    const amount=strictCollectionMoney(row?.[2]);
    return JSON.stringify([
      row.length,normalizedReference(row?.[0]),identitySignature(row?.[1]),
      Number.isFinite(amount)?String(amount):'!invalid-money:'+signatureScalar(row?.[2]),
      signatureScalar(row?.[3]),identitySignature(row?.[4]),signatureScalar(row?.[5]),
      identitySignature(row?.[6]),signatureScalar(row?.[7]),signatureScalar(row?.[8]),signatureScalar(row?.[9])
    ]);
  }

  function dedupeCollectionRows(records){
    const buckets=[];
    const indexed=new Map();
    (Array.isArray(records)?records:[]).forEach(function(row){
      if(!Array.isArray(row))return;
      const reference=normalizedReference(row?.[0]);
      if(!reference){buckets.push({row,conflict:false});return}
      const signature=collectionRowSignature(row);
      const existing=indexed.get(reference);
      if(!existing){
        const bucket={row,signature,conflict:false};
        indexed.set(reference,bucket);
        buckets.push(bucket);
      }else if(existing.signature!==signature)existing.conflict=true;
    });
    return buckets.filter(function(bucket){return !bucket.conflict}).map(function(bucket){return bucket.row});
  }

  function collectionRowsByReceipt(){
    const buckets=new Map();
    dedupeCollectionRows(rows('collections')).forEach(function(row){
      const key=normalizedReference(row?.[0]);
      if(!key)return;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(row);
    });
    return buckets;
  }

  function conflictedCollectionReferences(records){
    const signatures=new Map();
    (Array.isArray(records)?records:[]).forEach(function(row){
      if(!Array.isArray(row))return;
      const reference=normalizedReference(row?.[0]);
      if(!reference)return;
      if(!signatures.has(reference))signatures.set(reference,new Set());
      signatures.get(reference).add(collectionRowSignature(row));
    });
    return new Set(Array.from(signatures.entries()).filter(function(pair){return pair[1].size>1}).map(function(pair){return pair[0]}));
  }

  function legacyCollectionMatchesEntry(row,entry,receiptOwners){
    if(!Array.isArray(row)||row.length!==4||receiptOwners!==1)return false;
    const amount=strictMoney(entry?.paid);
    if(!Number.isFinite(amount)||amount<=0||!String(entry?.paymentKey||'').trim())return false;
    if(!exactIdentityMatch(row?.[1],entry?.tenant)||!normalizedScalar(row?.[3])||normalizedScalar(row?.[3])!==normalizedScalar(entry?.status))return false;
    if(strictCollectionMoney(row?.[2])!==amount)return false;
    if(!exactIdentityMatch(entry?.property,entry?.property)||!exactIdentityMatch(entry?.unit,entry?.unit)||!validPeriod(entry?.period))return false;
    return paymentEntryKeyMatches(entry,entry.property,entry.contractId||entry.contract_id,entry.unit,entry.period);
  }

  function collectionLedgerConsistent(row,entry){
    const rowAmount=strictCollectionMoney(row?.[2]);
    const entryAmount=strictMoney(entry?.paid);
    if(!Number.isFinite(rowAmount)||!Number.isFinite(entryAmount)||rowAmount!==entryAmount)return false;
    const rowStatus=normalizedScalar(row?.[3]);
    const entryStatus=normalizedScalar(entry?.status);
    if(!rowStatus||!entryStatus||rowStatus!==entryStatus)return false;
    return [[5,'paidAt'],[7,'note'],[9,'method']].every(function(pair){
      const rowValue=normalizedScalar(row?.[pair[0]]);
      const entryValue=normalizedScalar(entry?.[pair[1]]);
      return !rowValue||!entryValue||rowValue===entryValue;
    });
  }

  function ledgerEntrySignature(entry){
    const references=Array.from(new Set([entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean))).sort();
    const invalidReferenceShape=['id','receiptNo','voucherNo'].map(function(key){
      return invalidReferenceInput(entry?.[key])?'!invalid:'+signatureScalar(entry[key]):'';
    });
    const contractIdAlias=ledgerAlias(entry,'contractId','contract_id');
    const contractNoAlias=ledgerAlias(entry,'contractNo','contract_no');
    const fields=PROTECTED_FIELDS.rentLedgerV202.filter(function(key){
      return !['id','receiptNo','voucherNo','contractId','contract_id','contractNo','contract_no'].includes(key);
    }).map(function(key){
      const value=entry?.[key];
      if(['due','paid','balance'].includes(key)){
        const amount=strictMoney(value);
        return Number.isFinite(amount)?String(amount):'!invalid-money:'+signatureScalar(value);
      }
      if(['property','unit','tenant'].includes(key))return identitySignature(value);
      if(key==='paymentKey'||key==='period')return typeof value==='string'?'exact:'+value:'!invalid-key:'+signatureScalar(value);
      return signatureScalar(value);
    });
    return JSON.stringify([
      references,invalidReferenceShape,
      [contractIdAlias.conflict?'!conflict':'',contractIdAlias.value],
      [contractNoAlias.conflict?'!conflict':'',contractNoAlias.value],
      fields
    ]);
  }

  function dedupeLedgerEntries(records){
    const source=Array.isArray(records)?records:[];
    const parent=source.map(function(_,index){return index});
    function root(index){
      while(parent[index]!==index){parent[index]=parent[parent[index]];index=parent[index]}
      return index;
    }
    function join(left,right){
      const leftRoot=root(left);
      const rightRoot=root(right);
      if(leftRoot!==rightRoot)parent[rightRoot]=leftRoot;
    }
    const owners=new Map();
    source.forEach(function(entry,index){
      const tokens=[];
      const id=normalizedReference(entry?.id);
      if(id)tokens.push('id:'+id);
      Array.from(new Set([entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean))).forEach(function(reference){
        tokens.push('reference:'+reference);
      });
      tokens.forEach(function(token){
        if(owners.has(token))join(index,owners.get(token));
        else owners.set(token,index);
      });
    });
    const components=new Map();
    source.forEach(function(_,index){
      const key=root(index);
      if(!components.has(key))components.set(key,[]);
      components.get(key).push(index);
    });
    const accepted=new Set();
    components.forEach(function(indexes){
      const signatures=new Set(indexes.map(function(index){return ledgerEntrySignature(source[index])}));
      if(signatures.size===1)accepted.add(indexes[0]);
    });
    return source.filter(function(_,index){return accepted.has(index)});
  }

  function ledgerRecords(){
    const buckets=collectionRowsByReceipt();
    const collectionConflicts=conflictedCollectionReferences(rows('collections'));
    const raw=dedupeLedgerEntries(rawLedgerRecords()).filter(function(entry){
      return ![entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean).some(function(reference){return collectionConflicts.has(reference)});
    });
    const ownerCounts=new Map();
    raw.forEach(function(entry){
      Array.from(new Set([entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean))).forEach(function(key){
        ownerCounts.set(key,(ownerCounts.get(key)||0)+1);
      });
    });
    const hydrated=raw.map(function(entry){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
      const referenceKeys=Array.from(new Set([entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean)));
      const candidates=referenceKeys.flatMap(function(key){
        return (buckets.get(key)||[]).map(function(row){return {key,row}});
      });
      if(candidates.length){
        const valid=candidates.every(function(candidate){
          const row=candidate.row;
          if(row.length===4)return legacyCollectionMatchesEntry(row,entry,ownerCounts.get(candidate.key)||0);
          return exactIdentityMatch(row?.[1],entry.tenant)&&exactIdentityMatch(row?.[4],entry.property)&&
            exactIdentityMatch(row?.[6],entry.unit)&&validPeriod(row?.[8])&&validPeriod(entry?.period)&&
            scalarText(row?.[8])===scalarText(entry.period)&&collectionLedgerConsistent(row,entry);
        });
        if(!valid)return null;
        return {...entry};
      }
      return importedLedger(entry)?{...entry}:null;
    }).filter(function(entry){return Boolean(entry)&&validLedgerPaymentAmount(entry)});
    return dedupeLedgerEntries(hydrated);
  }

  function ledgerFor(name){
    const key=normalizedIdentity(name);
    const protectedLedger=protectedRecordsFor('rentLedgerV202',name);
    const records=protectedLedger?dedupeLedgerEntries(protectedLedger.map(function(entry){return {...entry}})):ledgerRecords().filter(function(entry){return normalizedIdentity(entry?.property)===key});
    return records.filter(function(entry){
      return exactIdentityMatch(entry?.property,name)&&validLedgerPaymentAmount(entry)&&validLedgerPaymentKey(name,entry);
    });
  }

  function ledgerRow(entry,resolvedContract){
    const recordedStatus=scalarText(entry?.status);
    const row=[
      ledgerReference(entry)||'—',entry?.tenant||'—',money(entry?.paid),resolvedContract&&recordedStatus?recordedStatus:'يحتاج مراجعة',
      entry?.property||'',entry?.paidAt||'',entry?.unit||'—',entry?.note||'',entry?.period||'',entry?.method||''
    ];
    Object.defineProperty(row,LINKED_LEDGER_ROW,{value:Boolean(resolvedContract)});
    return row;
  }

  function propertyMatches(name){
    const key=propertyKey(name);
    if(!key)return [];
    const protectedProperties=protectedPropertyRows(name);
    if(protectedProperties)return protectedProperties;
    return rows('properties').filter(function(row){return propertyKey(row?.[0])===key});
  }

  function propertyRecord(name){
    const matches=propertyMatches(name);
    return matches.length===1?matches[0]:null;
  }

  function contractsFor(name){
    const key=normalizedIdentity(name);
    const protectedContracts=protectedRecordsFor('contractsV202',name);
    if(protectedContracts){
      return mergeContractsSafely(protectedContracts.map(function(entry,index){return normalizeContract(entry,V202_IMPORT_SOURCE,index)}).filter(Boolean));
    }
    return contracts().filter(function(contract){return normalizedIdentity(contract?.property)===key});
  }

  function uniquePropertyForTenant(tenant){
    const key=normalizedIdentity(tenant);
    const found=new Set(contracts().filter(function(contract){
      return normalizedIdentity(contract?.tenant)===key;
    }).map(function(contract){return normalizedIdentity(contract?.property)}).filter(Boolean));
    return found.size===1?Array.from(found)[0]:'';
  }

  function uniquePropertyForUnit(unit){
    const key=normalizedIdentity(unit);
    const found=new Set(contracts().filter(function(contract){
      return normalizedIdentity(contract?.unit)===key&&signedContract(contract);
    }).map(function(contract){return normalizedIdentity(contract?.property)}).filter(Boolean));
    return found.size===1?Array.from(found)[0]:'';
  }

  function collectionContractForRow(name,row){
    if(!Array.isArray(row))return null;
    const tenant=normalizedIdentity(row?.[1]);
    if(!tenant)return null;
    const explicitProperty=normalizedIdentity(row?.[4]);
    const unit=normalizedIdentity(row?.[6]);
    const period=row?.[8];
    if((row?.[4]!=null&&row[4]!==''&&!scalarText(row[4]))||(row?.[6]!=null&&row[6]!==''&&!scalarText(row[6]))||(row?.[8]!=null&&row[8]!==''&&!scalarText(row[8])))return null;
    if(explicitProperty||unit||period){
      if(explicitProperty!==normalizedIdentity(name)||!unit||!validPeriod(period))return null;
      const matches=contractsFor(name).filter(function(contract){
        return statementIncludesContract(contract,period)&&exactIdentityMatch(contract?.unit,row?.[6])&&exactIdentityMatch(contract?.tenant,row?.[1]);
      });
      return matches.length===1?matches[0]:null;
    }
    return null;
  }

  function collectionsFor(name){
    const linkedLedger=ledgerFor(name);
    const linkedRows=linkedLedger.map(function(entry){return ledgerRow(entry,ledgerContractForEntry(name,entry))});
    if(protectedPropertyActive(name))return linkedRows;
    const ledgerReceipts=new Set(ledgerRecords().flatMap(function(entry){return [entry?.receiptNo,entry?.voucherNo]}).map(normalizedReference).filter(Boolean));
    const rawLedgerReceipts=new Set(rawLedgerRecords().flatMap(function(entry){return [entry?.receiptNo,entry?.voucherNo]}).map(normalizedReference).filter(Boolean));
    const legacy=[];
    dedupeCollectionRows(rows('collections')).forEach(function(row){
      if(ledgerReceipts.has(normalizedReference(row?.[0])))return false;
      if(rawLedgerReceipts.has(normalizedReference(row?.[0])))return false;
      if(collectionContractForRow(name,row)&&collectionReceiptEligible(row)){legacy.push(row);return}
      const explicit=optionalIdentityField(row?.[4]);
      if(explicit.invalid)return;
      const reviewProperty=explicit.present?explicit.value:uniquePropertyForTenant(row?.[1]);
      if(reviewProperty!==normalizedIdentity(name))return;
      const review=row.slice(0,10);
      review[3]='يحتاج مراجعة';
      Object.defineProperty(review,LINKED_LEDGER_ROW,{value:false});
      legacy.push(review);
    });
    return linkedRows.concat(legacy);
  }

  function settledPayment(status){
    const value=normalizedScalar(status);
    return ['paid','partial','part paid','partially paid','settled','received','مدفوع','مسدد','جزئي','جزئيا','جزئيًا','مدفوع جزئي','مدفوع جزئيا','مدفوع جزئيًا','مستلم'].includes(value);
  }

  function pendingPayment(status){
    const value=normalizedScalar(status);
    return ['pending','under review','review','قيد المراجعة','معلق','معلّق','بانتظار الاعتماد'].includes(value);
  }

  function collectionFinanciallySettled(record){
    if(!Array.isArray(record))return false;
    const reference=referenceText(record[0]);
    if(!reference||record[LINKED_LEDGER_ROW]===false)return false;
    const amount=strictCollectionMoney(record[2]);
    return Number.isFinite(amount)&&amount>0&&settledPayment(record[3]);
  }

  function collectionReceiptEligible(record){
    return collectionFinanciallySettled(record)&&(record.length<=4||validRecordedDate(record[5]));
  }

  function rentStatements(sourceRows){
    const records=Array.isArray(sourceRows)?sourceRows:rows('rentStatementsV202');
    return records.filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)});
  }

  function validOfficialStatement(entry){
    if(!entry||!identityText(entry.property)||!validPeriod(entry.period))return false;
    const amountFields=['totalRent','totalCollected','totalAdvance','totalInsurance','totalCleaning'];
    const countFields=['unitCount','occupiedUnitCount','payerCount'];
    if(!amountFields.some(function(key){return hasField(entry,key)}))return false;
    if(amountFields.some(function(key){
      if(!hasField(entry,key))return false;
      const value=strictMoney(entry[key]);
      return !Number.isFinite(value)||value<0;
    }))return false;
    if(countFields.some(function(key){
      if(!hasField(entry,key))return false;
      return !Number.isFinite(strictCount(entry[key]));
    }))return false;
    if(hasField(entry,'unitCount')&&hasField(entry,'occupiedUnitCount')&&strictCount(entry.occupiedUnitCount)>strictCount(entry.unitCount))return false;
    return true;
  }

  function officialStatementFor(property,period){
    const protectedStatements=protectedRecordsFor('rentStatementsV202',property);
    const matches=rentStatements(protectedStatements||undefined).filter(function(entry){
      return propertyKey(entry.property)===propertyKey(property)&&String(entry.period||'')===String(period||'');
    });
    return matches.length===1&&validOfficialStatement(matches[0])?matches[0]:null;
  }

  function statementIncludesContract(contract,period){
    const status=contractStatus(contract?.status);
    if(status!=='signed'&&status!=='expired')return false;
    return validContractTerms(contract)&&contractCoversPeriod(contract,period);
  }

  function rentStatementLedgerItems(context,period){
    const property=String(context?.property?.[0]||'');
    const protectedOnly=protectedPropertyActive(property);
    return rentStatementItems(context,period).filter(function(item){
      if(!protectedOnly)return true;
      const itemId=normalizedIdentity(item.contractId);
      const matches=context.propertyContracts.filter(function(contract){
        if(itemId)return normalizedIdentity(contractId(contract))===itemId;
        return normalizedIdentity(contract?.unit)===normalizedIdentity(item.unit)&&normalizedIdentity(contract?.tenant)===normalizedIdentity(item.tenant);
      });
      return matches.length===1&&normalized(matches[0]?.source)===V202_IMPORT_SOURCE;
    });
  }

  function latestOfficialPeriod(property){
    const protectedStatements=protectedRecordsFor('rentStatementsV202',property);
    const periods=Array.from(new Set(rentStatements(protectedStatements||undefined).filter(function(entry){
      return propertyKey(entry?.property)===propertyKey(property)&&validPeriod(entry?.period);
    }).map(function(entry){return String(entry.period)}))).sort().reverse();
    return periods.find(function(period){return Boolean(officialStatementFor(property,period))})||currentPeriod();
  }

  function hasField(record,key){return Boolean(record&&Object.prototype.hasOwnProperty.call(record,key)&&record[key]!=null&&record[key]!=='')}

  function maintenanceFor(name){
    const key=propertyKey(name);
    const workOrders=rows('workOrders').filter(function(row){return propertyKey(row?.[1])===key});
    const maintenance=rows('maintenance').filter(function(row){
      const explicit=optionalIdentityField(row?.[4]);
      if(explicit.invalid)return false;
      if(explicit.present)return explicit.value===key;
      return uniquePropertyForUnit(row?.[0])===key;
    });
    return workOrders.concat(maintenance);
  }

  function contextFor(name){
    const property=propertyRecord(name);
    if(!property)return null;
    const protectedOnly=protectedPropertyActive(name);
    const propertyContracts=contractsFor(name);
    const period=protectedOnly?latestOfficialPeriod(name):currentPeriod();
    const activeContracts=propertyContracts.filter(function(contract){return signedContract(contract)&&validContractTerms(contract)&&contractCoversPeriod(contract,period)});
    const tenantNames=new Set(activeContracts.map(function(contract){return normalized(contract?.tenant)}).filter(Boolean));
    const linkedTenants=protectedOnly?[]:rows('tenants').filter(function(row){return tenantNames.has(normalized(row?.[0]))});
    const propertyLedger=ledgerFor(name);
    const propertyCollections=collectionsFor(name);
    const expenses=protectedOnly?[]:rows('expenses').filter(function(row){return propertyKey(row?.[0])===propertyKey(name)});
    const maintenance=protectedOnly?[]:maintenanceFor(name);
    const recordedUnits=strictCount(property?.[2]);
    const units=Number.isFinite(recordedUnits)?recordedUnits:0;
    const occupiedUnits=new Set(activeContracts.map(function(contract){return normalized(contract?.unit)}).filter(Boolean)).size;
    const recordedIncome=strictCollectionMoney(property?.[3]);
    const income=Number.isFinite(recordedIncome)?recordedIncome:0;
    const settledCollections=propertyCollections.filter(collectionFinanciallySettled);
    const periodSettledCollections=settledCollections.filter(function(row){
      const collectionPeriod=scalarText(row?.[8]);
      return validPeriod(collectionPeriod)&&collectionPeriod===period;
    });
    const expenseTotal=exactMoneySum(expenses.map(function(row){return row?.[2]}),strictCollectionMoney);
    const official=officialStatementFor(name,period);
    const statementItems=rentStatementLedgerItems({property,propertyContracts,propertyLedger},period);
    const detailCollected=official?exactMoneySum(statementItems.map(function(item){return item?.paid})):exactMoneySum(periodSettledCollections.map(function(row){return row?.[2]}),strictCollectionMoney);
    const detailRent=exactMoneySum(statementItems.map(function(item){return item?.due}));
    const paymentCount=periodSettledCollections.length;
    const collected=official&&hasField(official,'totalCollected')?
      strictMoney(official.totalCollected):
      detailCollected;
    const due=official?
      exactMoneyDifference(hasField(official,'totalRent')?official.totalRent:detailRent,collected):
      exactMoneySum(activeContracts.map(function(contract){return remainingForPeriod(name,contract,period)}));
    const openMaintenance=maintenance.filter(function(row){
      const status=normalized(row?.[3]);
      return !status.includes('مكتمل')&&!status.includes('مغلق')&&!status.includes('منجز');
    });
    return {
      property,period,propertyContracts,activeContracts,linkedTenants,propertyLedger,propertyCollections,settledCollections,periodSettledCollections,paymentCount,expenses,maintenance,official,
      openMaintenance,units,occupiedUnits,income,collected,expenseTotal,due,net:expenses.length ? null : exactMoneySum(periodSettledCollections.map(function(row){return row?.[2]}),strictCollectionMoney)
    };
  }

  function directoryEntriesFor(property){
    const key=normalizedIdentity(property);
    const protectedDirectory=protectedRecordsFor('tenantDirectoryV202',property);
    const entries=tenantDirectory(protectedDirectory||undefined).filter(function(entry){return normalizedIdentity(entry.property)===key});
    const groups=new Map();
    entries.forEach(function(entry){
      const identity=unitRecordKey({property:entry.property,unit:entry.unit,contractNo:entry.contractNo,tenant:entry.tenant});
      if(!groups.has(identity))groups.set(identity,[]);
      groups.get(identity).push(entry);
    });
    const safe=[];
    groups.forEach(function(group){
      const signatures=new Set(group.map(function(entry){
        return JSON.stringify(Object.keys(entry).sort().map(function(field){return [field,signatureScalar(entry[field])]}));
      }));
      if(signatures.size===1)safe.push(group[0]);
    });
    return safe;
  }

  function directoryIdentityCompatible(entry,contract){
    const entryUnit=normalizedIdentity(entry?.unit);
    const contractUnit=normalizedIdentity(contract?.unit);
    const entryContractNo=normalizedIdentity(entry?.contractNo);
    const contractNo=normalizedIdentity(contract?.contract_no||contract?.contractNo);
    const entryTenant=normalizedIdentity(entry?.tenant);
    const tenant=normalizedIdentity(contract?.tenant);
    return Boolean(entryUnit&&contractUnit&&entryUnit===contractUnit)&&
      (!entryContractNo||!contractNo||entryContractNo===contractNo)&&(!entryTenant||!tenant||entryTenant===tenant);
  }

  function directoryRecordFor(entries,contract){
    const unit=normalizedIdentity(contract?.unit);
    const contractNo=normalizedIdentity(contract?.contract_no||contract?.contractNo);
    const tenant=normalizedIdentity(contract?.tenant);
    const candidates=(Array.isArray(entries)?entries:[]).filter(function(entry){return normalizedIdentity(entry.unit)===unit});
    const compatible=candidates.filter(function(entry){return directoryIdentityCompatible(entry,contract)});
    if(contractNo){
      const exact=compatible.filter(function(entry){return normalizedIdentity(entry.contractNo)===contractNo});
      if(exact.length===1)return exact[0];
    }
    if(tenant){
      const byTenant=compatible.filter(function(entry){return normalizedIdentity(entry.tenant)===tenant});
      if(byTenant.length===1)return byTenant[0];
    }
    return compatible.length===1?compatible[0]:null;
  }

  function importedContractNeedsVerification(contract,directoryRecord){
    return normalized(contract?.source)===V202_IMPORT_SOURCE&&Boolean(contract)&&
      (!directoryRecord||normalized(directoryRecord.source)!==V202_IMPORT_SOURCE||directoryRecord.verified!==true);
  }

  function contractDisplayStatus(contract,directoryRecord){
    const status=contractStatus(contract?.status);
    if((status==='signed'||status==='expired')&&!validContractTerms(contract))return 'يحتاج تحقق';
    return importedContractNeedsVerification(contract,directoryRecord)?'يحتاج تحقق':statusLabel(contract?.status);
  }

  function contractPriority(contract,period){
    let score=0;
    if(statementIncludesContract(contract,period))score+=1000000000000;
    if(signedContract(contract))score+=100000000000;
    const start=Number(String(contract?.start_date||'').replace(/-/g,''));
    if(Number.isFinite(start))score+=start;
    return score;
  }

  function ledgerTransactionNo(entry){
    const explicit=referenceText(entry?.knetTransactionNo||entry?.transactionNo)||referenceText(entry?.transactionNo);
    if(explicit)return explicit;
    const methodAndNote=String(entry?.method||'')+' '+String(entry?.note||'');
    if(!/(?:k\s*net|knet|كي\s*نت)/i.test(methodAndNote))return '';
    const labeled=String(entry?.note||'').match(/(?:k\s*net|knet|كي\s*نت)(?:\s*(?:operation|transaction|عملية))?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
    return labeled?labeled[1]:'';
  }

  function unitDirectoryRecords(context,periodValue){
    if(!context)return [];
    const property=String(context.property?.[0]||'');
    const period=validPeriod(periodValue)?periodValue:latestOfficialPeriod(property);
    const directory=directoryEntriesFor(property);
    const statement=rentStatementItems(context,period);
    const statementById=new Map(statement.map(function(item){return [normalizedIdentity(item.contractId),item]}).filter(function(pair){return pair[0]}));
    const bases=[];
    const claimedDirectory=new Set();

    context.propertyContracts.slice().sort(function(left,right){return contractPriority(right,period)-contractPriority(left,period)}).forEach(function(contract,index){
      let matched=directoryRecordFor(directory,contract);
      if(matched){
        const possibleOwners=context.propertyContracts.filter(function(candidate){return directoryIdentityCompatible(matched,candidate)});
        if(possibleOwners.length!==1||possibleOwners[0]!==contract)matched=null;
      }
      const matchedIndex=matched?directory.indexOf(matched):-1;
      if(matchedIndex>=0&&claimedDirectory.has(matchedIndex))matched=null;
      else if(matchedIndex>=0)claimedDirectory.add(matchedIndex);
      bases.push({
        property,unit:contract.unit||matched?.unit||'—',tenant:contract.tenant||matched?.tenant||'',
        contractNo:contract.contract_no||matched?.contractNo||'',directory:matched,contract,index
      });
    });

    directory.forEach(function(entry,index){
      if(!claimedDirectory.has(index))bases.push({property,unit:entry.unit||'—',tenant:entry.tenant,contractNo:entry.contractNo,directory:entry,contract:null,index});
    });

    context.propertyLedger.filter(function(entry){return String(entry?.period||'')===period}).forEach(function(entry,index){
      const resolved=ledgerContractForEntry(property,entry);
      const entryId=normalizedIdentity(entry?.contractId||entry?.contract_id);
      const matches=bases.filter(function(base){
        const baseId=normalizedIdentity(contractId(base.contract));
        if(entryId&&baseId){
          return entryId===baseId&&(!resolved||baseId===normalizedIdentity(contractId(resolved)))&&
            exactIdentityMatch(entry?.unit,base.unit)&&exactIdentityMatch(entry?.tenant,base.tenant);
        }
        return Boolean(resolved)&&normalizedIdentity(contractId(resolved))===baseId&&
          exactIdentityMatch(entry?.unit,base.unit)&&exactIdentityMatch(entry?.tenant,base.tenant);
      });
      if(matches.length===0)bases.push({property,unit:String(entry?.unit||'—'),tenant:String(entry?.tenant||''),contractNo:String(entry?.contractNo||''),directory:null,contract:null,index:'ledger-'+index});
    });

    function legacyBaseFor(entry){
      if(normalizedIdentity(entry?.contractId||entry?.contract_id))return null;
      const unit=normalizedIdentity(entry?.unit);
      const tenant=normalizedIdentity(entry?.tenant);
      if(!unit||!tenant)return null;
      const matches=bases.filter(function(candidate){
        if(candidate.contract&&!statementIncludesContract(candidate.contract,period))return false;
        return normalizedIdentity(candidate.unit)===unit&&normalizedIdentity(candidate.tenant||candidate.directory?.tenant)===tenant;
      });
      return matches.length===1?matches[0]:null;
    }

    return bases.map(function(base){
      const contract=base.contract;
      // A directory row may belong to only one contract. Re-matching here would
      // bypass claimedDirectory and could leak one tenant's protected fields to
      // another simultaneous contract on the same unit.
      const directoryRecord=base.directory||{};
      const id=normalizedIdentity(contractId(contract));
      let statementItem=id?(statementById.get(id)||null):null;
      if(statementItem&&(normalizedIdentity(statementItem.unit)!==normalizedIdentity(base.unit)||normalizedIdentity(statementItem.tenant)!==normalizedIdentity(base.tenant||directoryRecord.tenant)))statementItem=null;
      if(!id){
        const statementMatches=statement.filter(function(item){
          return normalizedIdentity(item.unit)===normalizedIdentity(base.unit)&&normalizedIdentity(item.tenant)===normalizedIdentity(base.tenant||directoryRecord.tenant);
        });
        statementItem=statementMatches.length===1?statementMatches[0]:null;
      }
      const ledger=context.propertyLedger.filter(function(entry){
        if(entry?.period!==period||normalizedIdentity(entry?.unit)!==normalizedIdentity(base.unit))return false;
        const resolved=ledgerContractForEntry(property,entry);
        if(!contract||!resolved||normalizedIdentity(contractId(resolved))!==id)return false;
        if(!paymentEntryKeyMatches(entry,property,contract,base.unit,period))return false;
        const expectedTenant=base.tenant||directoryRecord.tenant;
        if(!exactIdentityMatch(entry?.tenant,expectedTenant))return false;
        const entryContract=normalizedIdentity(entry?.contractId||entry?.contract_id);
        if(entryContract)return Boolean(id)&&entryContract===id;
        if(typeof entry?.paymentKey==='string'&&entry.paymentKey.trim())return true;
        return Boolean(normalized(expectedTenant))&&legacyBaseFor(entry)===base;
      });
      const settledLedger=ledger.filter(function(entry){return settledPayment(entry?.status)});
      const paid=statementItem?strictMoney(statementItem.paid):exactMoneySum(settledLedger.map(function(entry){return entry?.paid}));
      const pending=statementItem?strictMoney(statementItem.pending):exactMoneySum(ledger.filter(function(entry){return pendingPayment(entry?.status)}).map(function(entry){return entry?.paid}));
      const due=statementItem?strictMoney(statementItem.due):(contract&&statementIncludesContract(contract,period)?contractRent(contract,period):0);
      const contractFaceRent=contract&&contract.contractRent!=null&&String(contract.contractRent).trim()!==''?numberFrom(contract.contractRent):due;
      const faceRentAmount=strictMoney(contract?.contractRent);
      const directoryCurrentRentAmount=strictMoney(directoryRecord.currentRent);
      const contractCurrentRentAmount=strictMoney(contract?.rent);
      const directoryCurrentRentValid=Number.isFinite(directoryCurrentRentAmount)&&directoryCurrentRentAmount>0;
      const contractCurrentRentValid=Boolean(contract?._rentRecorded&&Number.isFinite(contractCurrentRentAmount)&&contractCurrentRentAmount>0);
      const currentRent=contract?.rentalTermsVersion===1?contractRent(contract,period,false):directoryCurrentRentValid?directoryCurrentRentAmount:(contractCurrentRentValid?contractCurrentRentAmount:0);
      const contractVerified=Boolean(contract&&signedContract(contract)&&validContractTerms(contract)&&!importedContractNeedsVerification(contract,base.directory));
      const billable=Boolean(statementItem)||Boolean(contract&&statementIncludesContract(contract,period));
      const collectible=Boolean(contract&&signedContract(contract)&&statementIncludesContract(contract,currentPeriod()));
      const balance=exactMoneyDifference(due,paid);
      const datedSettledLedger=settledLedger.filter(function(entry){return validRecordedDate(entry?.paidAt)});
      const receipts=datedSettledLedger.map(ledgerReference).filter(Boolean);
      const paymentDates=datedSettledLedger.map(function(entry){return String(entry.paidAt).trim()}).sort(function(left,right){return ledgerPaymentDateKey(right)-ledgerPaymentDateKey(left)});
      const methods=Array.from(new Set(datedSettledLedger.map(function(entry){return String(entry?.method||'').trim()}).filter(Boolean)));
      const knetTransactions=Array.from(new Set(datedSettledLedger.map(ledgerTransactionNo).filter(Boolean)));
      const paymentNotes=Array.from(new Set(datedSettledLedger.map(function(entry){return scalarText(entry?.note)}).filter(Boolean)));
      const contractReceived=String(directoryRecord.contractReceived||directoryRecord.contractReceipt||datedSettledLedger.map(function(entry){return entry?.contractReceived}).find(Boolean)||'');
      const hasInvalidSettledDate=settledLedger.some(function(entry){return !validRecordedDate(entry?.paidAt)});
      const paymentStatus=!contract||hasInvalidSettledDate?'يحتاج مراجعة':!billable?'غير قابل للفوترة':rentEntitlementPaymentStatus(contract,period,due,paid,pending,balance)||(contract?.rentalTermsVersion===1&&contract.freeMonthApproved&&contract.freeMonthPeriod===period?'شهر مجاني':due>0&&balance===0?'مسدد':paid>0?'جزئي':pending>0?'قيد المراجعة':due>0?'مستحق':'يحتاج مراجعة');
      return {
        key:unitRecordKey({property,contractId:contractId(contract),unit:base.unit,contractNo:base.contractNo,tenant:base.tenant||directoryRecord.tenant}),
        property,period,unit:String(base.unit||'—'),tenant:String(base.tenant||directoryRecord.tenant||''),
        contractNo:String(base.contractNo||directoryRecord.contractNo||''),contractId:String(contractId(contract)||''),
        directorySource:String(directoryRecord.source||''),contractSource:String(contract?.source||''),
        contractStatus:contract?contractDisplayStatus(contract,base.directory):'غير مربوط',startDate:String(contract?.start_date||directoryRecord.contractStartRaw||''),
        endDate:String(contract?.end_date||directoryRecord.contractEndRaw||''),legalStartDate:String(contract?.start_date||''),legalEndDate:String(contract?.end_date||''),contractRent:contractFaceRent,currentRent,rent:due,paid,pending,balance,paymentStatus,
        ...(hasRentEntitlement(contract)?{dueOn:contractEntitlementDueOn(contract,period)}:{}),
        receipts,paidAt:paymentDates[0]||(validRecordedDate(directoryRecord.paymentDateRaw)?String(directoryRecord.paymentDateRaw).trim():''),methods,
        phone:String(directoryRecord.phone||''),nationality:String(directoryRecord.nationality||''),
        nameAr:String(directoryRecord.nameAr||''),nameEn:String(directoryRecord.nameEn||''),passportNo:String(directoryRecord.passportNo||''),floor:String(directoryRecord.floor||contract?.floor||''),receivedAt:String(directoryRecord.receivedAt||contract?.receivedAt||''),
        civilId:String(directoryRecord.civilId||''),email:String(directoryRecord.email||''),verified:contractVerified,
        sourcePage:String(directoryRecord.sourcePage||''),contractReceipt:String(directoryRecord.contractReceipt||''),contractReceived,
        accountant:String(directoryRecord.accountant||contract?.accountant||''),insurance:directoryRecord.insurance,insuranceDateRaw:String(directoryRecord.insuranceDateRaw||contract?.depositReceivedOn||''),
        advance:directoryRecord.advance,advanceDateRaw:String(directoryRecord.advanceDateRaw||''),
        cleaningFee:directoryRecord.cleaningFee,freeMonth:contract?.rentalTermsVersion===1?(contract.freeMonthApproved?'نعم — '+contract.freeMonthPeriod:'لا'):String(directoryRecord.freeMonth||''),
        evictionNotice:String(directoryRecord.evictionNotice||''),notes:String(directoryRecord.notes||''),paymentNotes,knetTransactions,
        hasContract:Boolean(contract),hasDirectory:Boolean(base.directory),billable,collectible,
        contractRentRecorded:Boolean(contract?._contractRentRecorded&&Number.isFinite(faceRentAmount)&&faceRentAmount>0),
        currentRentRecorded:Boolean(directoryCurrentRentValid||contractCurrentRentValid),
        insuranceRecorded:Boolean(directoryRecord.insurance!=null&&String(directoryRecord.insurance).trim()!==''),
        advanceRecorded:Boolean(directoryRecord.advance!=null&&String(directoryRecord.advance).trim()!==''),
        cleaningFeeRecorded:Boolean(directoryRecord.cleaningFee!=null&&String(directoryRecord.cleaningFee).trim()!=='')
      };
    }).sort(function(left,right){
      return String(left.unit).localeCompare(String(right.unit),'ar',{numeric:true,sensitivity:'base'});
    });
  }

  function unitDirectoryStats(context,records){
    const list=Array.isArray(records)?records:[];
    const linkedUnits=new Set(list.map(function(record){return normalizedIdentity(record.unit)}).filter(Boolean)).size;
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
    const uiValue=shown==='غير مسجل'||label==='حالة العقد'||label==='طريقة السداد'||['الإيجار','المدفوع','المتبقي','قيد المراجعة','التأمين','العربون','النظافة','بداية العقد','نهاية العقد','تاريخ آخر دفعة'].includes(label);
    return '<div class="aq-unit-field '+(extraClass||'')+'"><dt>'+escapeHtml(label)+'</dt><dd'+(uiValue?'':' data-aq-record')+'>'+escapeHtml(shown)+'</dd></div>';
  }

  function unitMoneyField(label,value){
    return unitField(label,value==null||String(value).trim()===''?'غير مسجل':money(numberFrom(value)));
  }

  function unitEmailField(value){
    const raw=String(value||'').trim();
    const addresses=emailAddresses(raw);
    const shown=raw||'غير مسجل';
    const link=addresses.length?'<a class="aq-unit-email" href="mailto:'+escapeHtml(addresses[0])+'">'+escapeHtml(shown)+'</a>':escapeHtml(shown);
    return '<div class="aq-unit-field"><dt>البريد الإلكتروني / Email</dt><dd'+(raw?' data-aq-record':'')+'>'+link+'</dd></div>';
  }

  function unitsPanel(context,periodValue,accessGranted){
    if(accessGranted!==true&&!protectedAccessReady()){
      return '<div class="aq-unit-empty" role="status"><span>'+icon('user')+'</span><div><strong>بيانات الوحدات محمية</strong><p>سجّل الدخول بعضوية فعّالة لعرض المستأجرين والعقود وبيانات السداد.</p></div></div>';
    }
    const period=validPeriod(periodValue)?periodValue:latestOfficialPeriod(context.property?.[0]);
    const records=unitDirectoryRecords(context,period);
    const stats=unitDirectoryStats(context,records);
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const canWrite=rentWriteAllowed()&&!protectedOnly;
    const cards=records.map(function(record,index){
      const civil=maskCivilId(record.civilId);
      const notes=[record.freeMonth&&'<span>شهر مجاني:</span> <span data-aq-record>'+escapeHtml(record.freeMonth)+'</span>',record.evictionNotice&&'<span>إنذار إخلاء:</span> <span'+(['غير محدد','نعم','لا'].includes(record.evictionNotice)?'':' data-aq-record')+'>'+escapeHtml(record.evictionNotice)+'</span>',record.notes&&'<span data-aq-record>'+escapeHtml(record.notes)+'</span>'].filter(Boolean).join(' • ');
      const hasRentReceipt=tenantLedgerEntries(context,record,period).some(function(entry){return Boolean(resolvedReceiptForRecord(context,record,entry,period))});
      return '<article class="aq-unit-card '+unitStatusTone(record.paymentStatus)+'" data-v202-unit-index="'+index+'" aria-labelledby="v202UnitTitle'+index+'">'+
        '<header class="aq-unit-card-head"><span class="aq-unit-number" data-aq-record>'+escapeHtml(record.unit)+'</span><div class="aq-unit-title"><strong id="v202UnitTitle'+index+'"'+(record.tenant?' data-aq-record':'')+'>'+escapeHtml(record.tenant||'مستأجر غير مسجل')+'</strong><small>'+escapeHtml(record.contractNo?'عقد '+record.contractNo:'عقد غير مربوط')+'</small></div><span class="aq-unit-status '+unitStatusTone(record.paymentStatus)+'">'+escapeHtml(record.paymentStatus)+'</span></header>'+ 
        '<dl class="aq-unit-summary">'+unitMoneyField('الإيجار',record.rent)+unitMoneyField('المدفوع',record.paid)+unitMoneyField('المتبقي',record.balance)+'</dl>'+ 
        '<details class="aq-unit-details"><summary>عرض كل بيانات الوحدة '+escapeHtml(record.unit)+'</summary><dl class="aq-unit-details-body">'+ 
          unitField('المستأجر',record.tenant)+unitField('رقم العقد',record.contractNo)+unitField('حالة العقد',record.contractStatus)+unitField('بداية العقد',record.startDate?localDate(record.startDate):'غير مسجل')+unitField('نهاية العقد',record.endDate?localDate(record.endDate):'غير مسجل')+unitMoneyField('قيد المراجعة',record.pending)+
          unitField('الوصولات',record.receipts.join('، '))+unitField('تاريخ آخر دفعة',record.paidAt?localDate(record.paidAt):'غير مسجل')+unitField('طريقة السداد',record.methods.join('، '))+
          unitField('الهاتف / Phone',record.phone)+unitField('الجنسية / Nationality',record.nationality)+unitEmailField(record.email)+unitField('المحاسب / Accountant',record.accountant)+
          unitMoneyField('التأمين',record.insurance)+unitMoneyField('العربون',record.advance)+unitMoneyField('النظافة',record.cleaningFee)+unitField('مرجع الصفحة',record.sourcePage)+'<div class="aq-unit-field"><dt>ملاحظات</dt><dd>'+(notes||'غير مسجل')+'</dd></div>'+
          '<div class="aq-unit-field"><dt>الرقم المدني</dt><dd class="aq-unit-sensitive"><span class="aq-unit-sensitive-value is-masked" data-aq-record>'+escapeHtml(civil)+'</span>'+(record.civilId?'<button type="button" class="aq-unit-reveal" data-v202-civil-reveal="'+index+'" aria-pressed="false" aria-label="إظهار الرقم المدني للوحدة '+escapeHtml(record.unit)+'">إظهار</button>':'')+'</dd></div>'+ 
        '</dl></details>'+ 
        '<footer class="aq-unit-actions"><button type="button" class="is-primary" data-v202-unit-statement="'+index+'">كشف المستأجر / Tenant Statement</button>'+(record.hasContract?'<button type="button" data-v202-unit-contract="'+index+'">'+(record.verified?'عقد الإيجار / Contract':'مسودة العقد / Draft Contract')+'</button>':'')+(hasRentReceipt?'<button type="button" data-v202-unit-receipt="'+index+'">وصل الإيجار / Receipt</button>':'')+(canWrite&&record.billable&&record.collectible?'<button type="button" data-v202-unit-payment="'+index+'">تسجيل إيجار للوحدة</button>':'')+'</footer>'+ 
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

  function statusLabel(value){
    const status=normalizedScalar(value);
    if(['partial','partially paid','part paid','جزئي','جزئيا','جزئيًا','مدفوع جزئي','مدفوع جزئيا','مدفوع جزئيًا'].includes(status))return 'جزئي';
    if(['paid','مدفوع'].includes(status))return 'مدفوع';
    if(['settled','مسدد'].includes(status))return 'مسدد';
    if(['received','مستلم'].includes(status))return 'مستلم';
    if(pendingPayment(status))return 'قيد المراجعة';
    const contractState=contractStatus(status);
    return STATUS_LABELS[contractState]||scalarText(value)||'غير محدد';
  }

  function healthFor(context){
    if(!context.activeContracts.length)return {tone:'link',label:'يحتاج ربط عقد',detail:'ابدأ بعقد لربط المستأجر والتحصيل بالعقار'};
    if(dueNeedsReview(context))return {tone:'attention',label:'المستحقات تحتاج مراجعة',detail:'توجد بيانات عقود غير معتمدة؛ الإجمالي غير مكتمل'};
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

  function dueNeedsReview(context){
    if(context.official)return false;
    if(!context.activeContracts.length)return true;
    const directory=directoryEntriesFor(context.property?.[0]);
    return context.propertyContracts.some(function(contract){
      if(contractStatus(contract?.status)==='cancelled')return false;
      if(!validContractTerms(contract))return true;
      if(!contractCoversPeriod(contract,context.period))return false;
      return !signedContract(contract)||importedContractNeedsVerification(contract,directoryRecordFor(directory,contract));
    });
  }

  function dueKpi(context){
    if(dueNeedsReview(context))return kpi('الإيجار المستحق','قيد المراجعة','يلزم اكتمال اعتماد عقود الفترة • '+periodLabel(context.period),'attention');
    return kpi('الإيجار المستحق',money(context.due),(context.official?'حسب كشف المصدر':context.due?'مستحق العقود المعتمدة':'لا يوجد متبقٍ على العقود المعتمدة')+' • '+periodLabel(context.period),context.due?'attention':'');
  }

  function journey(context){
    const directory=directoryEntriesFor(context.property?.[0]);
    const verifiedActive=context.activeContracts.filter(function(contract){
      return !importedContractNeedsVerification(contract,directoryRecordFor(directory,contract));
    });
    const needsVerification=context.activeContracts.length-verifiedActive.length;
    const contractCopy=needsVerification?
      needsVerification+' عقد مرتبط يحتاج تحقق':
      (verifiedActive.length?verifiedActive.length+' عقد موقّع سارٍ':'لا يوجد عقد موقّع سارٍ');
    const steps=[
      {label:'بيانات العقار',done:true,copy:'العقار مسجل'},
      {label:'العقد',done:verifiedActive.length>0&&needsVerification===0,copy:contractCopy},
      {label:'التحصيل',done:context.propertyCollections.length>0,copy:context.propertyCollections.length?context.propertyCollections.length+' عملية':'لا يوجد تحصيل'},
      {label:'الكشف',done:Boolean(context.official)||verifiedActive.length>0,copy:context.official?'كشف مصدر محفوظ':verifiedActive.length?'بيانات عقود الفترة متاحة':'يلزم اعتماد بيانات العقود أولاً'}
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
    const canWrite=rentWriteAllowed()&&!protectedOnly;
    const nextAction=context.activeContracts.length?'payment':'contract';
    const nextLabel=context.activeContracts.length?(canWrite?'تسجيل إيجار':'عرض التحصيل'):(protectedOnly?'عرض العقود':'إبرام عقد');
    return '<div class="v202-overview-grid">'+
      '<section class="v202-overview-main">'+
        '<div class="v202-section-head"><div><p>رحلة العقار</p><h3>من العقد إلى الكشف</h3></div><span class="v202-health is-'+health.tone+'">'+health.label+'</span></div>'+journey(context)+
        '<div class="v202-next-action"><div><span>الإجراء التالي</span><strong>'+escapeHtml(health.detail)+'</strong></div><button type="button" data-v202-action="'+nextAction+'">'+nextLabel+' '+icon('arrow')+'</button></div>'+
      '</section>'+
      '<aside class="v202-property-facts"><h3>ملخص العقار</h3><dl><div><dt>المالك</dt><dd data-aq-record>'+escapeHtml(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير محدد')+'</dd></div><div><dt>الوحدات المشغولة</dt><dd>'+escapeHtml(occupied)+'</dd></div><div><dt>عقود مرتبطة</dt><dd>'+context.propertyContracts.length+'</dd></div><div><dt>طلبات مفتوحة</dt><dd>'+context.openMaintenance.length+'</dd></div></dl></aside>'+
    '</div>';
  }

  function contractsPanel(context){
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const directory=directoryEntriesFor(context.property?.[0]);
    if(!context.propertyContracts.length)return protectedOnly?emptyState('لا توجد عقود مرتبطة','لا توجد عقود محمية مرتبطة بهذا العقار حالياً.','',''):emptyState('لا توجد عقود مرتبطة','إبرام عقد من هنا يربطه بالعقار تلقائياً.','contract','إبرام عقد');
    return '<div class="v202-card-list">'+context.propertyContracts.map(function(contract){
      const visibleStatus=contractDisplayStatus(contract,directoryRecordFor(directory,contract));
      const visibleClass=visibleStatus==='يحتاج تحقق'?'draft':(contract.status||'draft');
      return '<article class="v202-contract-card"><div class="v202-contract-icon">'+icon('contract')+'</div><div><span'+(contract.contract_no?' data-aq-record':'')+'>'+escapeHtml(contract.contract_no||'عقد بدون رقم')+'</span><strong'+(contract.tenant?' data-aq-record':'')+'>'+escapeHtml(contract.tenant||'مستأجر غير محدد')+'</strong><small data-aq-record>'+escapeHtml(contract.unit||'وحدة غير محددة')+' • '+escapeHtml(contract.rent||'إيجار غير محدد')+'</small></div><em class="is-'+escapeHtml(visibleClass)+'">'+escapeHtml(visibleStatus)+'</em></article>';
    }).join('')+'</div>'+(protectedOnly?'<div class="v202-document-note"><strong>العقود المحمية</strong><p>تُعرض العقود المرتبطة هنا من الذاكرة الآمنة ولا تُنسخ إلى التخزين المحلي.</p></div>':'<div class="v202-panel-footer"><button type="button" data-v202-action="contract">عقد جديد '+icon('arrow')+'</button></div>');
  }

  function collectionsPanel(context,selectedPeriod){
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const canWrite=rentWriteAllowed()&&!protectedOnly;
    const periodFilter=validPeriod(selectedPeriod)?String(selectedPeriod):'';
    const collections=context.propertyCollections.map(function(row,index){return {row,index}}).filter(function(entry){
      const rowPeriod=scalarText(entry.row?.[8]);
      return !periodFilter||(validPeriod(rowPeriod)&&rowPeriod===periodFilter);
    });
    if(!collections.length){
      const periodCopy=periodFilter?' خلال '+periodLabel(periodFilter):'';
      return !canWrite?emptyState('لا توجد عمليات تحصيل مرتبطة','لا توجد دفعات مرتبطة بهذا العقار'+periodCopy+'.','',''):emptyState('لا توجد عمليات تحصيل مرتبطة','سجّل إيجاراً من ملف العقار ليظهر هنا وفي الكشف.','payment','تسجيل إيجار');
    }
    return '<div class="v202-ledger" role="region" aria-label="تحصيلات العقار"><table><thead><tr><th>الإيصال</th><th>المستأجر</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>'+collections.map(function(entry){
      const row=entry.row;
      const validPaymentDate=validRecordedDate(row?.[5]);
      const resolvedReceipt=validPaymentDate?resolvedTenantReceipt(row):null;
      const reviewCopy=collectionFinanciallySettled(row)?(validPaymentDate?'يحتاج مراجعة الوصل / Receipt review required':'يحتاج تصحيح التاريخ / Date review required'):'بانتظار الاعتماد / Pending approval';
      const action=resolvedReceipt?'<button type="button" data-v202-receipt-index="'+entry.index+'">فتح الوصل / Open receipt</button>':'<span class="v202-status">'+reviewCopy+'</span>';
      const shownDate=validPaymentDate?localDate(row?.[5]):escapeHtml(row?.[5]||'غير مؤرخ');
      return '<tr><td data-label="الإيصال">'+escapeHtml(row?.[0]||'—')+'</td><td data-label="المستأجر">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ"><span>'+escapeHtml(row?.[2]||'—')+'</span></td><td data-label="الحالة"><span class="v202-status">'+escapeHtml(statusLabel(row?.[3]))+'</span></td><td data-label="التاريخ"><span>'+shownDate+'</span></td><td data-label="إجراء">'+action+'</td></tr>';
    }).join('')+'</tbody></table></div>'+(canWrite?'<div class="v202-panel-footer"><button type="button" data-v202-action="payment">تسجيل إيجار '+icon('arrow')+'</button></div>':'');
  }

  function expensesPanel(context){
    if(!context.expenses.length)return emptyState('لا توجد مصروفات مرتبطة','المصروفات التي تسجّل باسم العقار ستظهر هنا وفي كشف الإيجار.','','');
    return '<div class="v202-ledger" role="region" aria-label="مصروفات العقار"><table><thead><tr><th>الفئة</th><th>المبلغ</th><th>المورد</th></tr></thead><tbody>'+context.expenses.map(function(row){
      return '<tr><td data-label="الفئة">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ"><span>'+escapeHtml(row?.[2]||'—')+'</span></td><td data-label="المورد">'+escapeHtml(row?.[3]||'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }

  function workspaceMarkup(context){
    const health=healthFor(context);
    const protectedOnly=protectedPropertyActive(context.property?.[0]);
    const canWrite=rentWriteAllowed()&&!protectedOnly;
    return '<section class="v202-workspace" role="dialog" aria-modal="true" aria-labelledby="v202PropertyTitle" aria-describedby="v202PropertyDescription">'+
      '<header class="v202-workspace-head"><div class="v202-property-identity"><span class="v202-property-mark">'+icon('building')+'</span><div><p>ملف العقار التشغيلي</p><h2 id="v202PropertyTitle" data-aq-record>'+escapeHtml(activeProperty)+'</h2><span id="v202PropertyDescription">العقد والتحصيل والوصولات والكشف في مكان واحد.</span></div></div><div class="v202-head-side"><span class="v202-health is-'+health.tone+'">'+health.label+'</span><button type="button" class="v202-icon-button" data-v202-close aria-label="إغلاق ملف العقار">'+icon('close')+'</button></div></header>'+
      (window.AQARI_PROPERTY_EXPERIENCE?.summaryMarkup?.(context.property)||'')+
      '<details class="aq267-property-finance"><summary>المؤشرات المالية والوحدات</summary>'+
      '<div class="v202-property-kpis">'+
        kpi('الوحدات',String(context.units),'المسجلة في العقار')+
        kpi('إيجار المصدر',money(context.income),'قيمة مرجعية وليست تحصيلاً فعلياً','gold')+
        kpi('المقبوضات المرتبطة',money(context.collected),context.paymentCount+' دفعة معتمدة • '+periodLabel(context.period),'good')+
        dueKpi(context)+
        kpi('المصروفات',money(context.expenseTotal),context.expenses.length+' بند مسجل')+
        kpi('صافي المقبوضات المسجلة',context.net===null?'معلّق':money(context.net),context.net===null?'يلزم توثيق فترة المصروفات وحالة صرفها':'دفعات الفترة المعتمدة؛ ليس ربحاً محاسبياً نهائياً','gold')+
      '</div>'+
      '</details><nav class="v202-actions" aria-label="إجراءات العقار">'+
        '<button type="button" data-v202-action="contract">'+icon('contract')+'<span><strong>'+(protectedOnly?'عقود العقار':'إبرام عقد')+'</strong><small>'+(protectedOnly?'عرض العقود المرتبطة':'إنشاء وربط العقد')+'</small></span></button>'+
        '<button type="button" data-v202-action="payment">'+icon('wallet')+'<span><strong>'+(canWrite?'تسجيل إيجار':'التحصيل')+'</strong><small>'+(canWrite?'تحصيل وإصدار وصل':'عرض الدفعات والوصولات')+'</small></span></button>'+ 
        '<button type="button" data-v202-action="statement">'+icon('chart')+'<span><strong>كشف الإيجار</strong><small>كشف تفصيلي PDF</small></span></button>'+ 
        '<button type="button" data-v202-action="profile">'+icon('building')+'<span><strong>'+(protectedOnly?'ملخص العقار':'الملف الكامل')+'</strong><small>'+(protectedOnly?'داخل الملف المحمي':'العقار 360°')+'</small></span></button>'+ 
        (window.AQARI_PROPERTY_EXPERIENCE?.canManageSender?.()?'<button type="button" data-v202-action="sender-settings">'+icon('building')+'<span><strong>واتساب وبريد العقار</strong><small>إعدادات خاصة بهذا العقار</small></span></button>':'')+
        (window.AQARI_DOCUMENTS?.allowed()?'<button type="button" data-v202-action="documents">'+icon('contract')+'<span><strong>وثائق العقار</strong><small>تصوير ورفع واسترجاع</small></span></button>':'')+
      '</nav>'+ 
      '<div class="v202-tabs" role="tablist" aria-label="تفاصيل العقار">'+
        '<button type="button" id="v202TabOverview" role="tab" aria-controls="v202Panel" data-v202-tab="overview">نظرة عامة</button>'+ 
        '<button type="button" id="v202TabUnits" role="tab" aria-controls="v202Panel" data-v202-tab="units">الوحدات <span>'+unitDirectoryRecords(context,activePropertyPeriod||latestOfficialPeriod(activeProperty)).length+'</span></button>'+ 
        '<button type="button" id="v202TabContracts" role="tab" aria-controls="v202Panel" data-v202-tab="contracts">العقود <span>'+context.propertyContracts.length+'</span></button>'+ 
        '<button type="button" id="v202TabCollections" role="tab" aria-controls="v202Panel" data-v202-tab="collections">التحصيل <span>'+context.propertyCollections.length+'</span></button>'+ 
        '<button type="button" id="v202TabPartners" role="tab" aria-controls="v202Panel" data-v202-tab="partners">الشركاء والحصص</button>'+
        '<button type="button" id="v202TabExpenses" role="tab" aria-controls="v202Panel" data-v202-tab="expenses">المصروفات <span>'+context.expenses.length+'</span></button>'+ 
      '</div>'+ 
      '<div class="v202-panel" id="v202Panel" role="tabpanel" tabindex="0"></div>'+ 
    '</section>';
  }

  function partnersPanel(context){
    const name=activeProperty,scope=activeAccessScope();
    const panel=document.getElementById('v202Panel');
    panel.innerHTML='<section class="v267-partners"><h3>الشركاء والحصص</h3><p role="status">جاري قراءة سجل الشركاء من السحابة…</p></section>';
    const valid=()=>protectedAccessReady()&&sameAccessScope(scope,activeAccessScope())&&activeProperty===name&&activeTab==='partners'&&panel.isConnected;
    let state=null,busy=false;
    const E=window.AQARI_SHARES;
    if(!E){
      let script=document.getElementById('v267PartnersEngine');
      if(!script){script=document.createElement('script');script.id='v267PartnersEngine';script.src='/v267-partners.js?release=V267';document.head.appendChild(script)}
      script.addEventListener('load',()=>{if(valid())partnersPanel(context)},{once:true});
      script.addEventListener('error',()=>{if(valid())panel.innerHTML='<p role="alert">تعذر تحميل الحصص. حدّث الصفحة وحاول مرة أخرى.</p>'},{once:true});
      return;
    }
    const key=propertyKey(name);
    function stateFrom(cloud){
      const primary=window.AQARI_CLOUD_SYNC.decodeCloudPayload(cloud?.payload)?.primary;
      if(!primary)throw new Error('تعذر قراءة بيانات مساحة العمل.');
      return {primary,state:primary.propertySharesV267?.[key]||E.empty()};
    }
    function currentBasis(){
      const c=contextFor(name);
      if(!c)throw new Error('تعذر قراءة الحساب المالي للعقار.');
      const income=exactMoneySum(c.settledCollections.map(r=>r?.[2]),strictCollectionMoney);
      return {income:E.scaled(income.toFixed(3),3),expenses:E.scaled(c.expenseTotal.toFixed(3),3),due:E.scaled(Math.max(0,c.due).toFixed(3),3)};
    }
    const cash=n=>money(n/1000);
    const escape=escapeHtml;
    function render(){
      if(!valid())return;
      const manager=window.AQARI_SUPABASE.context.membership.role==='general_manager';
      const list=state.owners.length?state.owners:[{id:crypto.randomUUID(),name:'',role:'مالك',bps:10000}];
      const historical=new Map(state.owners.map(r=>[r.id,r]));
      state.events.forEach(e=>{(e.rows||e.after||[]).forEach(r=>{if(!historical.has(r.id))historical.set(r.id,r)})});
      const basis=currentBasis();
      const completeBasis=!protectedPropertyActive(name);
      let preview='';
      if(state.enabled&&completeBasis){
        try{
          const draft=E.transition(state,{type:'distribution',basis},scope.userId,new Date().toISOString(),'preview');
          preview='<details open><summary>معاينة التوزيع الجديد</summary>'+draft.events.at(-1).rows.map(r=>'<article class="v267-share-event"><b data-aq-record>'+escape(r.name)+'</b><p>إيرادات: '+cash(r.income)+' · مصروفات: '+cash(r.expenses)+' · صافي: '+cash(r.net)+'</p></article>').join('')+'</details>';
        }catch(_){preview='<p>لا توجد مبالغ جديدة للتوزيع.</p>'}
      }
      panel.innerHTML='<section class="v267-partners"><header><div><p>AQARI V267</p><h3>الشركاء والحصص</h3><p>اختياري للعقارات المشتركة وعقارات الورثة.</p></div><span>'+ (state.enabled?'مفعّل':'غير مفعّل')+'</span></header>'+
      '<details '+(!state.enabled?'open':'')+'><summary>إعداد الشركاء والنسب</summary><form id="v267OwnersForm"><div id="v267OwnersRows">'+list.map(r=>ownerRow(r)).join('')+'</div>'+
      (manager?'<button type="button" data-partners-add>إضافة مالك أو وارث</button><button type="submit">حفظ وتفعيل الحصص</button><button type="button" data-partners-disable>إيقاف التوزيع الجديد</button>':'<p>تعديل الحصص متاح للمدير العام.</p>')+'</form></details>'+
      '<div class="v267-shares-summary"><article><span>إيرادات محصلة مسجلة</span><strong>'+cash(basis.income)+'</strong></article><article><span>مصروفات مسجلة</span><strong>'+cash(basis.expenses)+'</strong></article><article><span>الصافي النقدي</span><strong>'+cash(basis.income-basis.expenses)+'</strong></article></div>'+
      '<p>التوزيع تراكمي من السجلات المتاحة للعقار. تُوزّع الفروق منذ آخر توزيع فقط؛ تغيير الحصص لا يغيّر التوزيعات السابقة. أي نقص في سجلات المصروفات ينعكس على الصافي.</p>'+
      preview+(!completeBasis?'<p role="status">توزيع الأرباح غير متاح لهذا الملف المحمي حتى تتوفر مصادر المصروفات الكاملة؛ لم تُفترض مصروفات صفرية.</p>':'')+
      (manager&&state.enabled&&completeBasis?'<button type="button" data-partners-distribute>تسجيل توزيع المبالغ الجديدة</button>':'')+
      '<h3>كشف حساب كل شريك</h3><div class="v267-partner-statements">'+Array.from(historical.values()).map(r=>'<details><summary><span data-aq-record>'+escape(r.name)+'</span> · '+cash(E.balance(state,r.id))+' مستحق</summary><p>'+escape(r.role)+' · '+(r.bps/100)+'٪ '+(state.owners.some(o=>o.id===r.id)?'':'(شريك سابق)')+'</p>'+
        state.events.filter(e=>e.type==='distribution'&&e.rows.some(row=>row.id===r.id)||e.type==='payment'&&e.partnerId===r.id).map(e=>{
          const row=e.rows?.find(x=>x.id===r.id);
          return '<article class="v267-share-event"><time>'+escape(localDate(e.at))+'</time><p>'+(row?'إيرادات: '+cash(row.income)+' · مصروفات: '+cash(row.expenses)+' · صافي: '+cash(row.net)+'<br>إيجارات غير محصلة وقت التوزيع: '+cash(row.receivable):'صرف: '+cash(e.amount)+' · '+escape(e.reference))+'</p></article>';
        }).join('')+
        (manager&&E.balance(state,r.id)>0?'<form data-partner-payment="'+escape(r.id)+'"><label>المبلغ المصروف (د.ك)<input name="amount" inputmode="decimal" required></label><label>مرجع التحويل أو السند<input name="reference" maxlength="150" required></label><button type="submit">تسجيل صرف للشريك</button></form>':'')+'</details>').join('')+'</div>'+
      '<details><summary>سجل التوزيعات والتعديلات — آخر ٥٠ من ('+state.events.length+')</summary>'+state.events.slice(-50).reverse().map(e=>'<article class="v267-share-event"><b>'+escape({owners:'تعديل الحصص',disable:'إيقاف التوزيع',distribution:'توزيع جديد',payment:'صرف لشريك'}[e.type]||e.type)+'</b><p>'+escape(localDate(e.at))+'</p>'+
      (e.type==='owners'?'<p>قبل: '+e.before.map(r=>escape(r.name)+' '+r.bps/100+'٪').join('، ')+'</p><p>بعد: '+e.after.map(r=>escape(r.name)+' '+r.bps/100+'٪').join('، ')+'</p>':'')+'</article>').join('')+'</details><p id="v267SharesStatus" role="status" aria-live="polite">السجل محفوظ في مساحة العمل السحابية.</p></section>';
      panel.querySelectorAll('input').forEach(input=>{if(!manager)input.disabled=true});
      panel.querySelector('[data-partners-add]')?.addEventListener('click',()=>{
        const container=panel.querySelector('#v267OwnersRows');container.insertAdjacentHTML('beforeend',ownerRow({id:crypto.randomUUID(),name:'',role:'وارث',bps:0}));
      });
      panel.querySelector('#v267OwnersForm')?.addEventListener('submit',event=>{
        event.preventDefault();
        save({type:'owners',rows:Array.from(panel.querySelectorAll('[data-owner-row]')).map(row=>({id:row.dataset.ownerRow,name:row.querySelector('[name=name]').value,role:row.querySelector('[name=role]').value,percent:row.querySelector('[name=percent]').value}))});
      });
      panel.querySelector('#v267OwnersRows')?.addEventListener('click',event=>{const b=event.target.closest('[data-owner-remove]');if(b&&manager)b.closest('[data-owner-row]').remove()});
      panel.querySelector('[data-partners-disable]')?.addEventListener('click',()=>save({type:'disable'}));
      panel.querySelector('[data-partners-distribute]')?.addEventListener('click',()=>save({type:'distribution',basis:currentBasis()}));
      panel.querySelectorAll('[data-partner-payment]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();save({type:'payment',partnerId:form.dataset.partnerPayment,amount:form.elements.amount.value,reference:form.elements.reference.value})}));
    }
    function ownerRow(r){return '<fieldset data-owner-row="'+escape(r.id)+'"><legend>مالك / وارث</legend><label>الاسم<input name="name" value="'+escape(r.name)+'" maxlength="150" required></label><label>الصفة<input name="role" value="'+escape(r.role)+'" maxlength="80" required></label><label>الحصة ٪<input name="percent" inputmode="decimal" value="'+r.bps/100+'" required></label><button type="button" data-owner-remove>إزالة من القائمة</button></fieldset>'}
    async function save(action){
      if(busy||!valid())return;
      const status=panel.querySelector('#v267SharesStatus');
      try{
        if(window.AQARI_SUPABASE.context.membership.role!=='general_manager')throw new Error('التعديل متاح للمدير العام فقط.');
        busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='جاري حفظ التعديل…';
        if(action.type==='distribution'&&protectedPropertyActive(name))throw new Error('مصادر المصروفات الكاملة غير متاحة لهذا العقار.');
        const next=E.transition(state,action,scope.userId,new Date().toISOString(),crypto.randomUUID());
        const cloud=await window.AQARI_SUPABASE.loadAppState(scope);
        if(!valid())return;
        const fresh=stateFrom(cloud);
        if(fresh.state.version!==state.version)throw new Error('تم تعديل الحصص من جهاز آخر. افتح تبويب الحصص مجدداً قبل المحاولة.');
        const payload=JSON.parse(JSON.stringify(cloud.payload));
        const primary=window.AQARI_CLOUD_SYNC.decodeCloudPayload(payload)?.primary;
        primary.propertySharesV267={...primary.propertySharesV267,[key]:next};
        await window.AQARI_SUPABASE.saveAppState(payload,cloud.revision,scope);
        if(!valid())return;
        appData().propertySharesV267={...appData().propertySharesV267,[key]:next};
        state=next;render();panel.querySelector('#v267SharesStatus').textContent='تم الحفظ في السحابة.';
      }catch(error){if(valid())status.textContent=error?.code==='AQARI_REVISION_CONFLICT'?'تغيّرت البيانات من جهاز آخر. أعد فتح الحصص.':String(error.message||'تعذر الحفظ. لم يتم تسجيل التعديل.')}
      finally{busy=false;if(valid())panel.querySelectorAll('button').forEach(b=>b.disabled=false)}
    }
    window.AQARI_SUPABASE.loadAppState(scope).then(cloud=>{if(valid()){state=stateFrom(cloud).state;render()}}).catch(()=>{if(valid())panel.innerHTML='<p role="alert">تعذرت قراءة الحصص من السحابة. أعد فتح هذا التبويب للمحاولة.</p>'});
  }

  function renderPanel(context){
    if(!protectedAccessReady()){clearProtectedDom();return false}
    const panel=document.getElementById('v202Panel');
    if(!panel)return false;
    document.querySelectorAll('#v202PropertyWorkspace [data-v202-tab]').forEach(function(button){
      const selected=button.getAttribute('data-v202-tab')===activeTab;
      button.setAttribute('aria-selected',String(selected));
      button.tabIndex=selected?0:-1;
      if(selected)panel.setAttribute('aria-labelledby',button.id);
    });
    if(activeTab==='partners'){partnersPanel(context);return true}
    if(activeTab==='units')panel.innerHTML=unitsPanel(context,activePropertyPeriod||latestOfficialPeriod(activeProperty));
    else if(activeTab==='contracts')panel.innerHTML=contractsPanel(context);
    else if(activeTab==='collections')panel.innerHTML=collectionsPanel(context,activePropertyPeriod);
    else if(activeTab==='expenses')panel.innerHTML=expensesPanel(context);
    else panel.innerHTML=overviewPanel(context);
    return true;
  }

  function renderWorkspace(){
    if(!protectedAccessReady()){clearProtectedDom();return false}
    const context=contextFor(activeProperty);
    const overlay=document.getElementById('v202PropertyWorkspace');
    if(!overlay||!context)return false;
    overlay.innerHTML=workspaceMarkup(context);
    renderPanel(context);
    return true;
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

  function openWorkspace(name,trigger,selectedPeriod){
    if(!protectedAccessReady())return false;
    const record=propertyRecord(name);
    if(!record){reportPropertyAmbiguity(name);return false}
    ensureWorkspace();
    activeProperty=String(record?.[0]||name);
    activePropertyPeriod=validPeriod(selectedPeriod)?String(selectedPeriod):'';
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
    return true;
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
        return propertyKey(button.getAttribute('data-v201-property'))===propertyKey(activeProperty);
      });
      const focusTarget=original||fallback;
      if(focusTarget instanceof HTMLElement)setTimeout(function(){focusTarget.focus()},0);
    }
    propertyTrigger=null;
    activePropertyPeriod='';
    unitSearch='';
    const panel=document.getElementById('v202Panel');
    if(panel)panel.textContent='';
  }

  function selectPropertyOnPage(selectId,renderName){
    setTimeout(function(){
      const select=document.getElementById(selectId);
      if(!select)return;
      const option=Array.from(select.options).find(function(item){return propertyKey(item.textContent)===propertyKey(activeProperty)});
      if(option)select.value=option.value;
      if(typeof window[renderName]==='function')window[renderName]();
      select.focus({preventScroll:true});
    },140);
  }

  async function openAuthoritativePropertyFile(name){
    if(!protectedAccessReady())return false;
    const bridge=window.AQARI_SUPABASE;
    const workspace=bridge?.context?.workspace?.id;
    const propertyName=String(name||'').trim();
    if(!workspace||!propertyName||typeof bridge?.getClient!=='function')return false;
    const client=await bridge.getClient();
    const {data,error}=await client.from('aqari_properties').select('id,name').eq('workspace_id',workspace).eq('name',propertyName).limit(2);
    if(error)throw error;
    if(!Array.isArray(data)||data.length!==1)throw Error(data?.length?'اسم العقار غير فريد.':'لم يتم ربط العقار بالسجل الخادمي.');
    const page=await import('./src/v267/pages/property-hub.js');
    if(!protectedAccessReady())return false;
    return page.openPropertyHub(data[0].id);
  }

  function routeAction(action,trigger){
    if(!protectedAccessReady())return false;
    if(action==='sender-settings'){
      if(!window.AQARI_PROPERTY_EXPERIENCE?.canManageSender?.())return false;
      return Promise.resolve(window.AQARI_PROPERTY_EXPERIENCE.openSenderSettingsByName(activeProperty)).catch(function(){window.alert('تعذر فتح إعدادات العقار. تحقق من ربط العقار بالسجل وصلاحية المدير.');});
    }
    if(action==='documents'){
      if(!window.AQARI_DOCUMENTS?.allowed())return false;
      const name=activeProperty,period=activePropertyPeriod;
      return import('./src/v267/pages/document-scanner.js').then(function(m){if(!protectedAccessReady()||!window.AQARI_DOCUMENTS?.allowed())return false;closeWorkspace(false);return m.openDocumentScanner({type:'property',ref:name,onBack:function(){if(protectedAccessReady())openWorkspace(name,trigger,period);}});}).catch(function(){window.alert('تعذر فتح وثائق العقار. أعد المحاولة.');});
    }
    const protectedOnly=protectedPropertyActive(activeProperty);
    if((protectedOnly&&['payment','contract','profile'].includes(action))||(!rentWriteAllowed()&&action==='payment')){
      activeTab=action==='payment'?'collections':(action==='contract'?'contracts':'overview');
      const context=contextFor(activeProperty);
      if(context)renderPanel(context);
      document.getElementById(action==='payment'?'v202TabCollections':(action==='contract'?'v202TabContracts':'v202TabOverview'))?.focus();
      return true;
    }
    if(action==='payment')return openPayment(trigger,undefined,activePropertyPeriod);
    if(action==='statement')return openStatementDocument(activePropertyPeriod||undefined,trigger);
    if(action==='contract'){
      closeWorkspace(false);
      window.go?.('smartContractsPage');
      return selectPropertyOnPage('contractPropertyV55','loadContractsV55');
    }
    if(action==='profile'){
      const propertyName=activeProperty;
      const legacyProfile=function(){
        closeWorkspace(false);
        window.go?.('property360Page');
        return selectPropertyOnPage('property360SelectV58','renderProperty360V58');
      };
      const openComplete=window.AQARI_PROPERTY_EXPERIENCE?.openCompleteFileByName||openAuthoritativePropertyFile;
      return Promise.resolve(openComplete(propertyName)).then(function(result){
        if(result===false)return legacyProfile();
        closeWorkspace(false);
        return result;
      }).catch(legacyProfile);
    }
  }

  function openUnitReceipt(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=activePropertyPeriod||latestOfficialPeriod(activeProperty);
    const records=context?unitDirectoryRecords(context,period):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-receipt'))];
    const settled=tenantLedgerEntries(context,record,period).filter(function(entry){return Boolean(resolvedReceiptForRecord(context,record,entry,period))});
    const receipt=ledgerReference(settled[settled.length-1]);
    if(!receipt)return false;
    activeTenantStatementKey=record.key;
    return openTenantReceipt(button,receipt,period);
  }

  function openUnitContract(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=activePropertyPeriod||latestOfficialPeriod(activeProperty);
    const records=context?unitDirectoryRecords(context,period):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-contract'))];
    if(!record?.hasContract)return false;
    activeTenantStatementKey=record.key;
    return openTenantContract(button,record.contractId||record.contractNo,period);
  }

  function openUnitPayment(button){
    if(!protectedAccessReady()||!rentWriteAllowed())return false;
    const context=contextFor(activeProperty);
    const records=context?unitDirectoryRecords(context,activePropertyPeriod||latestOfficialPeriod(activeProperty)):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-payment'))];
    return Boolean(record?.billable&&record.collectible&&openPayment(button,record.contractId||'',activePropertyPeriod));
  }

  function tenantStatementRecord(context,period){
    if(!context||!activeTenantStatementKey)return null;
    return uniqueUnitRecordByKey(unitDirectoryRecords(context,period),activeTenantStatementKey);
  }

  function uniqueUnitRecordByKey(records,key){
    const matches=(Array.isArray(records)?records:[]).filter(function(record){return record?.key===key});
    return matches.length===1?matches[0]:null;
  }

  function openUnitStatement(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=activePropertyPeriod||latestOfficialPeriod(activeProperty);
    const records=context?unitDirectoryRecords(context,period):[];
    const record=records[Number(button?.getAttribute('data-v202-unit-statement'))];
    if(!record)return false;
    activeTenantStatementKey=record.key;
    openDocument('كشف المستأجر / Tenant Statement',tenantStatementDocument(context,record,period),button,'#v202PropertyWorkspace [data-v202-unit-statement]');
    return true;
  }

  function toggleTenantStatementCivil(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=document.getElementById('v202TenantStatementPeriod')?.value||latestOfficialPeriod(activeProperty);
    const record=tenantStatementRecord(context,period);
    const value=button?.closest('.v204-field')?.querySelector('.v204-sensitive-value');
    if(!record?.civilId||!value)return false;
    const revealing=button.getAttribute('aria-pressed')!=='true';
    value.textContent=revealing?record.civilId:maskCivilId(record.civilId);
    value.classList.toggle('is-masked',!revealing);
    button.setAttribute('aria-pressed',String(revealing));
    button.textContent=revealing?'إخفاء / Hide':'إظهار / Show';
    return true;
  }

  async function copyTenantEmail(button){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=document.getElementById('v202TenantStatementPeriod')?.value||latestOfficialPeriod(activeProperty);
    const record=tenantStatementRecord(context,period);
    const email=emailAddresses(record?.email)[0];
    if(!email||typeof navigator==='undefined'||typeof navigator.clipboard?.writeText!=='function')return false;
    try{
      await navigator.clipboard.writeText(email);
      button.textContent='تم النسخ / Copied';
      setTimeout(function(){if(button?.isConnected)button.textContent='نسخ البريد / Copy Email'},1600);
      return true;
    }catch(_){return false}
  }

  function tenantLedgerEntries(context,record,period){
    if(!context||!record)return [];
    const selectedPeriod=validPeriod(period)?period:record.period;
    const unitKey=normalizedIdentity(record.unit);
    const tenantKey=normalizedIdentity(record.tenant);
    const contractKey=normalizedIdentity(record.contractId);
    const legacyContracts=context.propertyContracts.filter(function(contract){
      return statementIncludesContract(contract,selectedPeriod)&&normalizedIdentity(contract?.unit)===unitKey&&normalizedIdentity(contract?.tenant)===tenantKey;
    });
    return context.propertyLedger.filter(function(entry){
      if(entry?.period!==selectedPeriod||normalizedIdentity(entry?.unit)!==unitKey)return false;
      if(!exactIdentityMatch(entry?.tenant,tenantKey))return false;
      const resolved=ledgerContractForEntry(context.property?.[0],entry);
      if(!resolved||!contractKey||normalizedIdentity(contractId(resolved))!==contractKey)return false;
      if(!paymentEntryKeyMatches(entry,context.property?.[0],resolved,resolved.unit,selectedPeriod))return false;
      const entryContract=normalizedIdentity(entry?.contractId||entry?.contract_id);
      if(entryContract)return entryContract===contractKey;
      if(typeof entry?.paymentKey==='string'&&entry.paymentKey.trim())return true;
      return legacyContracts.length===1&&normalizedIdentity(contractId(legacyContracts[0]))===contractKey;
    }).sort(function(left,right){return ledgerPaymentDateKey(left?.paidAt)-ledgerPaymentDateKey(right?.paidAt)});
  }

  function resolvedReceiptForRecord(context,record,entry,period){
    const reference=ledgerReference(entry);
    if(!context||!record||!reference||!settledPayment(entry?.status)||!validRecordedDate(entry?.paidAt))return null;
    const lookup=[
      reference,record.tenant,entry?.paid,entry?.status,record.property||context.property?.[0],
      entry?.paidAt,record.unit,entry?.note||'',period,entry?.method||''
    ];
    const resolved=resolvedTenantReceipt(lookup);
    return resolved&&resolved.record?.key===record.key?resolved:null;
  }

  function openTenantReceipt(button,receiptNo,periodValue){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=validPeriod(periodValue)?periodValue:(document.getElementById('v202TenantStatementPeriod')?.value||latestOfficialPeriod(activeProperty));
    const record=tenantStatementRecord(context,period);
    const requested=referenceText(receiptNo)||referenceText(button?.getAttribute('data-v202-tenant-receipt'));
    const entries=tenantLedgerEntries(context,record,period);
    const matches=entries.filter(function(item){
      return normalizedReference(ledgerReference(item))===normalizedReference(requested)&&Boolean(resolvedReceiptForRecord(context,record,item,period));
    });
    const resolved=matches.length===1?resolvedReceiptForRecord(context,record,matches[0],period):null;
    if(!record||!requested||!resolved)return false;
    openDocument('وصل الإيجار / Rent Receipt',tenantReceiptDocument(resolved.context,resolved.record,resolved.entry,resolved.period),button,'#v202PropertyWorkspace [data-v202-unit-statement]');
    return true;
  }

  function openTenantContract(button,contractValue,periodValue){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    const period=validPeriod(periodValue)?periodValue:(document.getElementById('v202TenantStatementPeriod')?.value||latestOfficialPeriod(activeProperty));
    const record=tenantStatementRecord(context,period);
    const requested=normalizedIdentity(contractValue||button?.getAttribute('data-v202-tenant-contract'));
    const current=normalizedIdentity(record?.contractId||record?.contractNo);
    if(!record?.hasContract||!requested||requested!==current)return false;
    const cloudContract=rows('contractsV202').find(c=>String(c.id)===String(record.contractId)&&c.source==='v267-cloud');
    if(cloudContract)return window.AQARI_V202?.showContractCopies(cloudContract.id,1,['approved','signing','signed'].includes(cloudContract.status)?'official':'draft');
    openDocument(record.verified?'عقد الإيجار / Tenancy Contract':'مسودة عقد غير معتمدة / Unverified Contract Draft',tenantContractDocument(context,record),button,'#v202PropertyWorkspace [data-v202-unit-statement]');
    return true;
  }

  function nextReceiptNumber(){
    const year=new Date().getFullYear();
    const used=receiptNumbers();
    const pattern=new RegExp('^AQ-R-'+year+'-(\\d+)$','i');
    let sequence=0;
    used.forEach(function(receipt){
      const match=latinDigits(receipt).trim().match(pattern);
      if(match)sequence=Math.max(sequence,Number(match[1])||0);
    });
    sequence+=1;
    let value='';
    do{value='AQ-R-'+year+'-'+String(sequence++).padStart(4,'0')}while(Array.from(used).some(function(item){return normalizedReference(item)===normalizedReference(value)}));
    return value;
  }

  function receiptNumbers(){
    const ledgerReferences=rawLedgerRecords().flatMap(function(entry){return [entry?.receiptNo,entry?.voucherNo]}).map(referenceText);
    return new Set(rows('collections').map(function(row){return referenceText(row?.[0])}).concat(ledgerReferences).filter(Boolean));
  }

  function receiptExists(receipt){
    const key=normalizedReference(receipt);
    return Array.from(receiptNumbers()).some(function(value){return normalizedReference(value)===key});
  }

  function hasRentEntitlement(contract){return Boolean(contract&&Object.prototype.hasOwnProperty.call(contract,'rentEntitlement'))}

  function contractRent(contract,period=currentPeriod(),includeFree=true){
    if(hasRentEntitlement(contract)){
      const runtime=window.AQARI_RENTAL_RECORDS;
      if(typeof runtime?.effectiveRent!=='function'||typeof runtime?.entitlement!=='function')return Number.NaN;
      try{runtime.entitlement(contract);return strictMoney(runtime.effectiveRent(contract,period,includeFree));}catch(_){return Number.NaN;}
    }
    if(contract?.rentalTermsVersion===1){
      if(includeFree&&contract.freeMonthApproved&&contract.freeMonthPeriod===period)return 0;
      const change=(contract.rentAdjustments||[]).filter(a=>a.effectiveMonth<=period).at(-1);if(change){const value=strictMoney(change.rent);if(Number.isFinite(value)&&value>0)return value;}
    }
    const current=contract?.rent;
    const amount=strictMoney(current!=null&&String(current).trim()!==''?current:contract?.contractRent);
    return Number.isFinite(amount)?amount:0;
  }

  function contractEntitlementDueOn(contract,period){
    if(!hasRentEntitlement(contract))return null;
    const runtime=window.AQARI_RENTAL_RECORDS;
    if(typeof runtime?.entitlementDueOn!=='function'||typeof runtime?.entitlement!=='function')return undefined;
    try{runtime.entitlement(contract);const dueOn=runtime.entitlementDueOn(contract,period);return dueOn===null?null:validDate(dueOn)&&dueOn.slice(0,7)===period?dueOn:undefined;}catch(_){return undefined;}
  }

  function rentEntitlementPaymentStatus(contract,period,due,paid,pending,balance,asOf=new Date(Date.now()+10800000).toISOString().slice(0,10)){
    if(!hasRentEntitlement(contract))return null;
    const dueOn=contractEntitlementDueOn(contract,period);
    if(!Number.isFinite(due)||dueOn===undefined)return 'يحتاج مراجعة';
    if(contract.rentalTermsVersion===1&&contract.freeMonthApproved&&contract.freeMonthPeriod===period)return 'شهر مجاني';
    if(due===0)return 'لا إيجار للفترة';
    if(balance===0)return 'مسدد';
    if(dueOn>asOf)return 'لم يحن الاستحقاق';
    return paid>0?'جزئي':pending>0?'قيد المراجعة':'مستحق';
  }

  function validRentPeriodBreakdown(value,contract,period,due){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.period!==period||!validPeriod(period))return false;
    if(!validDate(value.dueOn)||value.dueOn.slice(0,7)!==period||value.dueOn<contract.start_date||value.dueOn>contract.end_date)return false;
    if(!['full_month','daily_prorated','manual_first_period'].includes(value.policy)||typeof value.manual!=='boolean'||typeof value.freeMonth!=='boolean')return false;
    if(typeof value.net!=='number'||!Number.isFinite(strictMoney(value.net))||value.net!==strictMoney(due))return false;
    if(value.manual)return value.policy==='manual_first_period'&&value.gross===null&&value.discount===null;
    if(typeof value.gross!=='number'||typeof value.discount!=='number'||!Number.isFinite(strictMoney(value.gross))||!Number.isFinite(strictMoney(value.discount)))return false;
    return Math.round(value.gross*1000)-Math.round(value.discount*1000)===Math.round(value.net*1000);
  }

  function receiptRentPeriodBreakdown(contract,period,due){
    const runtime=window.AQARI_RENTAL_RECORDS;
    if(typeof runtime?.entitlementBreakdown!=='function')throw new Error('تعذر التحقق من تفاصيل استحقاق الفترة. حدّث الصفحة قبل إصدار الوصل.');
    const breakdown={...runtime.entitlementBreakdown(contract,period),version:1,period,dueOn:contractEntitlementDueOn(contract,period)};
    if(!validRentPeriodBreakdown(breakdown,contract,period,due))throw new Error('تفاصيل استحقاق الفترة لا تطابق مبلغ الوصل؛ راجع العقد والتحصيل.');
    return breakdown;
  }

  function paymentKey(property,contractOrId,unit,period){
    const id=typeof contractOrId==='object'?contractId(contractOrId):String(contractOrId||'');
    const resolvedUnit=typeof contractOrId==='object'?contractOrId?.unit:unit;
    return [normalizedIdentity(property),'contract:'+normalizedIdentity(id),'unit:'+normalizedIdentity(resolvedUnit),String(period||'')].join('|');
  }

  function paymentEntryKeyMatches(entry,property,contractOrId,unit,period){
    const raw=entry?.paymentKey;
    if(raw==null||raw==='')return true;
    if(typeof raw!=='string'||invalidScalarControls(raw)||raw!==raw.trim())return false;
    const actual=raw;
    if(!actual)return false;
    const id=typeof contractOrId==='object'?contractId(contractOrId):String(contractOrId||'');
    const resolvedUnit=typeof contractOrId==='object'?contractOrId?.unit:unit;
    if(!normalizedIdentity(property)||!normalizedIdentity(id)||!normalizedIdentity(resolvedUnit)||!validPeriod(period))return false;
    return actual===paymentKey(property,contractOrId,unit,period);
  }

  function validLedgerPaymentKey(property,entry){
    const raw=entry?.paymentKey;
    if(raw==null||raw==='')return true;
    if(typeof raw!=='string'||invalidScalarControls(raw)||!raw||raw!==raw.trim())return false;
    if(!exactIdentityMatch(entry?.property,property)||!validPeriod(entry?.period))return false;
    const entryId=ledgerAlias(entry,'contractId','contract_id');
    const entryNo=ledgerAlias(entry,'contractNo','contract_no');
    if(entryId.conflict||entryNo.conflict)return false;
    const keyOnly=!entryId.value&&!entryNo.value;
    const matches=contractsFor(property).filter(function(contract){
      if(!exactIdentityMatch(entry?.unit,contract?.unit)||!exactIdentityMatch(entry?.tenant,contract?.tenant))return false;
      if(entryId.value&&normalizedIdentity(contractId(contract))!==entryId.value)return false;
      if(entryNo.value&&normalizedIdentity(contract?.contract_no||contract?.contractNo)!==entryNo.value)return false;
      if(!paymentEntryKeyMatches(entry,property,contract,contract.unit,entry.period))return false;
      if(!keyOnly)return true;
      const recordedDue=strictMoney(entry?.due);
      return Number.isFinite(recordedDue)&&recordedDue===contractRent(contract,entry.period);
    });
    return matches.length===1;
  }

  function paymentContracts(context){
    return context.propertyContracts.filter(function(contract){return signedContract(contract)&&statementIncludesContract(contract,currentPeriod())});
  }

  function paymentSearchKey(value){
    return String(value||'').normalize('NFKC').replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).trim().toLocaleLowerCase('ar');
  }
  function searchPaymentContracts(context,query){
    const available=paymentContracts(context),key=paymentSearchKey(query);
    if(!key)return available;
    const exactUnit=available.filter(c=>paymentSearchKey(c.unit)===key);
    if(context.propertyContracts.some(c=>paymentSearchKey(c.unit)===key))return exactUnit;
    if(/^\d+$/.test(key))return available.filter(c=>paymentSearchKey(c.contract_no)===key);
    return available.filter(c=>[c.tenant,c.contract_no,contractId(c),c.unit].some(v=>paymentSearchKey(v).includes(key)));
  }
  function updatePaymentSearch(){
    if(paymentSaving)return;
    const context=contextFor(activeProperty),select=document.getElementById('v202PaymentContract');
    if(!context||!select)return;
    const query=document.getElementById('v267PaymentSearch')?.value||'';
    const matches=searchPaymentContracts(context,query),old=select.value;
    select.innerHTML='<option value="">اختر العقد والوحدة</option>'+matches.map(c=>'<option value="'+escapeHtml(contractId(c))+'">'+escapeHtml(c.tenant)+' — '+escapeHtml(c.unit)+' — '+escapeHtml(c.contract_no||contractId(c))+'</option>').join('');
    select.value=matches.length===1?contractId(matches[0]):matches.some(c=>contractId(c)===old)?old:'';
    const amount=document.getElementById('v202PaymentAmount');if(amount)amount.value='';
    updatePaymentBalance();
    const details=document.getElementById('v267PaymentContractDetails');
    if(details&&!matches.length)details.textContent='لا يوجد عقد فعال لهذه الوحدة';
    else if(details&&!select.value)details.textContent='توجد عدة عقود مطابقة. اختر العقد الصحيح من القائمة.';
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

  function validRecordedDate(value){
    if(typeof value!=='string'||invalidScalarControls(value))return false;
    const raw=latinDigits(value).trim();
    if(validDate(raw))return true;
    const match=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!match)return false;
    const day=Number(match[1]);
    const month=Number(match[2]);
    const year=Number(match[3]);
    const date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  }

  function exactIdentityMatch(actual,expected){
    const actualKey=normalizedIdentity(actual);
    const expectedKey=normalizedIdentity(expected);
    return Boolean(actualKey&&expectedKey&&actualKey===expectedKey);
  }

  function ledgerContractForEntry(property,entry){
    const period=entry?.period;
    if([entry?.id,entry?.receiptNo,entry?.voucherNo].some(invalidReferenceInput))return null;
    if(!ledgerReference(entry))return null;
    if(!exactIdentityMatch(entry?.property,property)||!validPeriod(period))return null;
    const entryIdAlias=ledgerAlias(entry,'contractId','contract_id');
    const entryContractNoAlias=ledgerAlias(entry,'contractNo','contract_no');
    if(entryIdAlias.conflict||entryContractNoAlias.conflict)return null;
    const entryId=entryIdAlias.value;
    const entryContractNo=entryContractNoAlias.value;
    let matches=contractsFor(property).filter(function(contract){
      return statementIncludesContract(contract,period)&&exactIdentityMatch(entry?.unit,contract?.unit)&&exactIdentityMatch(entry?.tenant,contract?.tenant);
    });
    if(entryId)matches=matches.filter(function(contract){return normalizedIdentity(contractId(contract))===entryId});
    if(entryContractNo)matches=matches.filter(function(contract){return normalizedIdentity(contract?.contract_no||contract?.contractNo)===entryContractNo});
    if(entry?.paymentKey!=null&&entry.paymentKey!==''){
      if(typeof entry.paymentKey!=='string'||invalidScalarControls(entry.paymentKey)||!entry.paymentKey||entry.paymentKey!==entry.paymentKey.trim())return null;
      const keyOnly=!entryId&&!entryContractNo;
      matches=matches.filter(function(contract){
        if(!paymentEntryKeyMatches(entry,property,contract,contract.unit,period))return false;
        if(!keyOnly)return true;
        const recordedDue=strictMoney(entry?.due);
        return Number.isFinite(recordedDue)&&recordedDue===contractRent(contract,entry.period);
      });
    }
    if(matches.length!==1)return null;
    return matches[0];
  }

  function paidForPeriod(property,contract,period){
    const targetId=normalizedIdentity(contractId(contract));
    if(!statementIncludesContract(contract,period))return 0;
    const matches=ledgerFor(property).filter(function(entry){
      if(String(entry?.period||'')!==String(period||'')||!settledPayment(entry?.status))return false;
      const resolved=ledgerContractForEntry(property,entry);
      if(!resolved||!exactIdentityMatch(resolved?.unit,contract?.unit)||!exactIdentityMatch(resolved?.tenant,contract?.tenant))return false;
      const resolvedId=normalizedIdentity(contractId(resolved));
      return targetId?resolvedId===targetId:!resolvedId;
    });
    return exactMoneySum(matches.map(function(entry){return entry?.paid}));
  }

  function remainingForPeriod(property,contract,period){
    const due=contractRent(contract,period);
    if(!Number.isFinite(due))return Number.NaN;
    return due>0?exactMoneyDifference(due,paidForPeriod(property,contract,period)):0;
  }

  function paymentDialogMarkup(context,preferredContractId,preferredPeriod){
    const available=paymentContracts(context);
    const selectedPeriod=validPeriod(preferredPeriod)?String(preferredPeriod):(validPeriod(activePropertyPeriod)?activePropertyPeriod:currentPeriod());
    return '<section class="v202-dialog v202-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="v202PaymentTitle" aria-describedby="v202PaymentDescription">'+
      '<header><div><p>تحصيل العقار</p><h2 id="v202PaymentTitle">تسجيل إيجار</h2><span id="v202PaymentDescription">'+escapeHtml(activeProperty)+' — وبعد الحفظ يجهز الوصل مباشرة.</span></div><button type="button" class="v202-icon-button" data-v202-payment-close aria-label="إغلاق">'+icon('close')+'</button></header>'+ 
      (!available.length?'<div class="v202-inline-note is-warning">'+icon('alert')+' لا يوجد عقد موقّع سارٍ مع مستأجر ووحدة محددين. أكمل العقد أولاً.</div>':'')+
      '<form class="v202-form" id="v202PaymentForm">'+
        '<label><span>العقار</span><input value="'+escapeHtml(activeProperty)+'" disabled></label>'+ 
        '<label class="v202-form-wide"><span>ابحث بالاسم أو رقم العقد أو رقم الشقة</span><input id="v267PaymentSearch" type="search" autocomplete="off" placeholder="اسم المستأجر أو رقم العقد أو الشقة"></label>'+
        '<div id="v267PaymentContractDetails" class="v202-form-wide" role="status"></div>'+
        '<label><span>العقد / الوحدة</span><select id="v202PaymentContract" required '+(available.length?'':'disabled')+'><option value="">اختر العقد والوحدة</option>'+available.map(function(contract){const id=contractId(contract);return '<option value="'+escapeHtml(id)+'" '+(String(id)===String(preferredContractId||'')?'selected':'')+'>'+escapeHtml(contract.tenant)+' — '+escapeHtml(contract.unit)+' — '+escapeHtml(contract.contract_no||id)+'</option>'}).join('')+'</select></label>'+ 
        '<label><span>رقم الوصل</span><input id="v202PaymentNumber" value="'+nextReceiptNumber()+'" required></label>'+ 
        '<label><span>المبلغ (د.ك)</span><input id="v202PaymentAmount" inputmode="decimal" autocomplete="off" placeholder="0.000" required></label>'+ 
        '<label><span>شهر الإيجار</span><input id="v202PaymentPeriod" type="month" value="'+selectedPeriod+'" required></label>'+ 
        '<label><span>تاريخ السداد</span><input id="v202PaymentDate" type="date" value="'+todayValue()+'" required></label>'+ 
        '<label><span>طريقة السداد</span><select id="v202PaymentMethod" required><option value="">اختر طريقة الدفع</option><option>كي نت</option><option>تحويل بنكي</option><option>نقدي</option><option>شيك</option><option>أخرى</option></select></label>'+
        '<label><span>مرجع الحركة — مطلوب لجميع طرق الدفع</span><input id="v267PaymentTransaction" maxlength="150" required placeholder="رقم العملية أو سند القبض النقدي"></label>'+
        '<label><span>حالة السداد</span><select id="v202PaymentStatus"><option>مدفوع</option><option>جزئي</option><option>قيد المراجعة</option></select></label>'+ 
        '<label class="v202-form-wide"><span>ملاحظة اختيارية</span><input id="v202PaymentNote" placeholder="مثال: إيجار شهر سبتمبر"></label>'+ 
        '<div class="v202-payment-balance v202-form-wide" id="v202PaymentBalance" aria-live="polite">اختر العقد والوحدة لحساب المتبقي.</div>'+ 
        '<div class="v202-form-error" id="v202PaymentError" role="alert" aria-live="polite"></div>'+ 
        '<div class="v202-form-actions"><button type="button" data-v202-payment-close>إلغاء</button><button id="v267PaymentSubmit" type="submit" class="is-primary" disabled>حفظ وإصدار الوصل '+icon('arrow')+'</button></div>'+
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

  function openPayment(trigger,preferredContractId,preferredPeriod){
    if(!protectedAccessReady()||!rentWriteAllowed())return false;
    const context=contextFor(activeProperty);
    if(!context)return false;
    ensurePaymentDialog();
    paymentTrigger=trigger||document.activeElement;
    const overlay=document.getElementById('v202PaymentDialog');
    overlay.innerHTML=paymentDialogMarkup(context,preferredContractId,preferredPeriod);
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    suspendLayer('v202PropertyWorkspace',true);
    syncLayerState();
    updatePaymentBalance();
    requestAnimationFrame(function(){(document.getElementById('v202PaymentContract')||overlay.querySelector('[data-v202-payment-close]'))?.focus()});
    return true;
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
    const submit=document.getElementById('v267PaymentSubmit');if(submit)submit.disabled=paymentSaving||paymentNeedsReload||!contract;
    const details=document.getElementById('v267PaymentContractDetails');
    if(details)details.textContent=contract?'المستأجر: '+contract.tenant+' • العقار: '+activeProperty+' • الشقة: '+contract.unit+' • العقد: '+(contract.contract_no||contractId(contract)):(document.getElementById('v267PaymentSearch')?.value?'لا يوجد عقد فعال لهذه الوحدة أو لا توجد نتيجة محددة. اختر عقداً من النتائج عند تعددها.':'اختر عقداً فعالاً قبل إصدار الإيصال.');
    const due=contractRent(contract,period);
    const paid=contract?paidForPeriod(activeProperty,contract,period):0;
    const remaining=Number.isFinite(due)?due>0?exactMoneyDifference(due,paid):0:Number.NaN;
    const dueOn=contractEntitlementDueOn(contract,period);
    const amount=document.getElementById('v202PaymentAmount');
    const balance=document.getElementById('v202PaymentBalance');
    const covered=Boolean(contract&&contractCoversPeriod(contract,period));
    if(amount&&contract&&!covered)amount.value='';
    else if(amount&&contract&&!amount.value&&remaining>0)amount.value=String(remaining);
    if(balance){
      balance.textContent=!contract?'اختر العقد والوحدة لحساب المتبقي.':due>0?
        (covered?(hasRentEntitlement(contract)?'صافي الفترة ':'المستحق ')+money(due)+' • المدفوع '+money(paid)+' • المتبقي '+money(remaining)+(dueOn?' • تاريخ الاستحقاق '+dueOn:''):'الشهر المحدد خارج مدة هذا العقد.'):
        hasRentEntitlement(contract)&&Number.isFinite(due)&&due===0?'لا يوجد إيجار للتحصيل عن الفترة المحددة.':'تعذر التحقق من قيمة الإيجار أو بداية الاستحقاق؛ لا يمكن إصدار وصل قبل تصحيحها.';
      balance.classList.toggle('is-settled',Boolean(contract&&covered&&due>0&&remaining===0));
    }
    return {contract,due,paid,remaining};
  }

  function paymentMethodReferenceError(method,transactionNo){
    // Preserve known stored aliases; a new form always starts without a selection.
    if(!['كي نت','KNET','knet','تحويل بنكي','bank','نقدي','cash','شيك','cheque','أخرى','other'].includes(method))return 'اختر طريقة دفع صحيحة قبل إصدار الوصل.';
    if(typeof transactionNo!=='string'||!referenceText(transactionNo)||transactionNo.length>150)return 'أدخل مرجع الحركة من 1 إلى 150 حرفاً، بما فيه سند القبض النقدي.';
    return '';
  }

  function savePayment(event){
    event.preventDefault();
    if(paymentSaving||paymentNeedsReload)return false;
    const error=document.getElementById('v202PaymentError');
    if(!protectedAccessReady()||!rentWriteAllowed()){
      if(error)error.textContent='ليست لديك صلاحية تسجيل دفعة إيجار.';
      return false;
    }
    if(protectedPropertyActive(activeProperty)){
      if(error)error.textContent='الحفظ لهذا الملف المحمي متاح فقط عبر مساحة العمل الآمنة.';
      return false;
    }
    const contract=selectedPaymentContract();
    const tenant=String(contract?.tenant||'').trim();
    const receipt=referenceText(document.getElementById('v202PaymentNumber')?.value);
    const amount=strictMoney(document.getElementById('v202PaymentAmount')?.value);
    const status=document.getElementById('v202PaymentStatus')?.value||'مدفوع';
    const period=document.getElementById('v202PaymentPeriod')?.value||currentPeriod();
    const date=document.getElementById('v202PaymentDate')?.value||todayValue();
    const method=document.getElementById('v202PaymentMethod')?.value||'';
    const note=document.getElementById('v202PaymentNote')?.value.trim()||'';
    const transactionNo=referenceText(document.getElementById('v267PaymentTransaction')?.value);
    const paymentError=paymentMethodReferenceError(method,transactionNo);
    if(paymentError){if(error)error.textContent=paymentError;return false;}
    if(!contract||!tenant||!contract.unit){
      if(error)error.textContent='اختر عقداً موقّعاً سارياً مربوطاً بمستأجر ووحدة.';
      return false;
    }
    if(!receipt||!Number.isFinite(amount)||amount<=0){
      if(error)error.textContent='أدخل رقم الوصل ومبلغاً صحيحاً أكبر من صفر وبحد أقصى 3 منازل عشرية.';
      return false;
    }
    if(!validPeriod(period)||!validDate(date)){
      if(error)error.textContent='راجع شهر الإيجار وتاريخ السداد.';
      return false;
    }
    if(!contractCoversPeriod(contract,period)){
      if(error)error.textContent='الشهر المحدد خارج مدة هذا العقد.';
      return false;
    }
    if(receiptExists(receipt)){
      if(error)error.textContent='رقم الوصل مستخدم. غيّره وحاول مرة ثانية.';
      return false;
    }
    const due=contractRent(contract,period);
    if(!Number.isFinite(due)||due<=0){
      if(error)error.textContent=Number.isFinite(due)&&hasRentEntitlement(contract)&&due===0?'لا يوجد إيجار للتحصيل عن الفترة المحددة.':contract.rentalTermsVersion===1&&contract.freeMonthApproved&&contract.freeMonthPeriod===period?'الشهر المحدد مجاني ومعتمد؛ لا يوجد إيجار للتحصيل.':'تعذر التحقق من قيمة الإيجار أو بداية الاستحقاق. راجع العقد وحدّث الصفحة.';
      return false;
    }
    const balance=remainingForPeriod(activeProperty,contract,period);
    if(balance>0&&amount>balance){
      if(error)error.textContent='المبلغ أكبر من المتبقي '+money(balance)+'. راجع المبلغ.';
      return false;
    }
    if(balance===0){
      if(error)error.textContent='إيجار هذا الشهر مسدد بالكامل لهذا المستأجر.';
      return false;
    }
    const finalStatus=status==='قيد المراجعة'?status:(amount<balance?'جزئي':'مدفوع');
    const record=[receipt,tenant,amount,finalStatus,activeProperty,date,contract.unit,note,period,method];

    const ledgerEntry={
      id:'rent-'+receipt,receiptNo:receipt,property:activeProperty,unit:contract.unit,tenant,
      contractId:contractId(contract),contractNo:contract.contract_no||'',period,due,paid:amount,
      balance:settledPayment(finalStatus)?exactMoneyDifference(balance,amount):balance,paidAt:date,
      method,transactionNo,accountant:contract.accountant||'',status:finalStatus,note,source:'v202-entry',paymentKey:paymentKey(activeProperty,contract,contract.unit,period)
    };
    return commitPayment(record,ledgerEntry);
  }

  let paymentSaving=false;
  let paymentNeedsReload=false;
  async function paymentCloudOperation(operation){
    let timer;
    try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('انتهت مهلة الاتصال بالسحابة.')),20000)})])}
    finally{clearTimeout(timer)}
  }
  // JSONB object key order is not a data change; array order and values are.
  function sameStoredJson(a,b){
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
    if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,index)=>sameStoredJson(value,b[index]));
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameStoredJson(a[key],b[key]));
  }
  async function commitPayment(record,ledgerEntry){
    if(paymentSaving||paymentNeedsReload)return false;
    const scope=activeAccessScope(),name=activeProperty,data=appData();
    const error=document.getElementById('v202PaymentError');
    const form=document.getElementById('v202PaymentForm');
    const controls=Array.from(form?.querySelectorAll('input,select,button')||[]).map(node=>[node,node.disabled]);
    const current=()=>protectedAccessReady()&&rentWriteAllowed()&&sameAccessScope(scope,activeAccessScope())&&activeProperty===name&&!protectedPropertyActive(name);
    let submitted=false;
    paymentSaving=true;controls.forEach(([node])=>node.disabled=true);
    if(error)error.textContent='جاري الحفظ في السحابة والتحقق من السجل…';
    try{
      if(!current()||!window.AQARI_SUPABASE?.saveAppState||!window.AQARI_CLOUD_SYNC?.decodeCloudPayload)throw new Error('تعذر الوصول إلى الحفظ السحابي. لم يتم إصدار إيصال.');
      const cloud=await paymentCloudOperation(()=>window.AQARI_SUPABASE.loadAppState(scope));
      if(!current())return false;
      const payload=JSON.parse(JSON.stringify(cloud?.payload||{}));
      const primary=window.AQARI_CLOUD_SYNC.decodeCloudPayload(payload)?.primary;
      if(!primary)throw new Error('تعذرت قراءة بيانات مساحة العمل.');
      // Compare before appending: never overwrite collections added from another device.
      for(const key of ['collections','rentLedgerV202','contractsV202','rentReceiptsV267']){
        if(!sameStoredJson(primary[key]||[],data[key]||[]))throw new Error('تغيّرت البيانات أو توجد تعديلات محلية غير محفوظة. حدّث الصفحة قبل تسجيل التحصيل.');
      }
      const cloudContract=(primary.contractsV202||[]).map((c,i)=>normalizeContract(c,'db-v202',i)).find(c=>c&&contractId(c)===ledgerEntry.contractId);
      if(!cloudContract||!signedContract(cloudContract)||!contractCoversPeriod(cloudContract,ledgerEntry.period)||normalizedIdentity(cloudContract.property)!==normalizedIdentity(name))throw new Error('العقد غير محفوظ كعقد فعال في السحابة. احفظ العقد أولاً.');
      if(normalizedIdentity(cloudContract.tenant)!==normalizedIdentity(ledgerEntry.tenant)||normalizedIdentity(cloudContract.unit)!==normalizedIdentity(ledgerEntry.unit)||ledgerEntry.contractNo!==cloudContract.contract_no)throw new Error('بيانات التحصيل لا تطابق العقد المحفوظ.');
      if((primary.collections||[]).some(row=>normalizedReference(row[0])===normalizedReference(record[0]))||(primary.rentLedgerV202||[]).some(row=>normalizedReference(ledgerReference(row))===normalizedReference(record[0])))throw new Error('رقم الوصل مسجل مسبقاً.');
      const sourceContract=(primary.contractsV202||[]).find(c=>String(c.id)===ledgerEntry.contractId);
      const receiptSnapshot={id:record[0],template:'rent-voucher-v267-1',record:JSON.parse(JSON.stringify(record)),contract:JSON.parse(JSON.stringify({...cloudContract,...sourceContract,id:cloudContract.id})),tenantId:sourceContract?.tenantId||null,tenantNameEn:sourceContract?.tenantProfile?.nameEn||'',brand:statementBrand(name),detailsVersion:sourceContract?.detailsVersion||1,accountant:sourceContract?.accountant||ledgerEntry.accountant||'',transactionNo:ledgerEntry.transactionNo||''};
      if(hasRentEntitlement(receiptSnapshot.contract))receiptSnapshot.rentPeriodBreakdown=receiptRentPeriodBreakdown(receiptSnapshot.contract,ledgerEntry.period,ledgerEntry.due);
      primary.collections=(primary.collections||[]).concat([record]);
      primary.rentLedgerV202=(primary.rentLedgerV202||[]).concat([ledgerEntry]);
      primary.rentReceiptsV267=(primary.rentReceiptsV267||[]).concat([receiptSnapshot]);
      primary.audit=(primary.audit||[]).concat([['المدير','تسجيل إيجار',name,'تم']]);
      submitted=true;
      await paymentCloudOperation(()=>window.AQARI_SUPABASE.saveAppState(payload,Number(cloud?.revision||0),scope));
      if(!current())return false;
      const verified=await paymentCloudOperation(()=>window.AQARI_SUPABASE.loadAppState(scope));
      if(!current())return false;
      const confirmed=window.AQARI_CLOUD_SYNC.decodeCloudPayload(verified?.payload)?.primary;
      if(!confirmed?.collections?.some(row=>sameStoredJson(row,record))||!confirmed?.rentLedgerV202?.some(row=>sameStoredJson(row,ledgerEntry))||!confirmed?.rentReceiptsV267?.some(row=>sameStoredJson(row,receiptSnapshot)))throw new Error('لم تؤكد إعادة القراءة وجود التحصيل والوصل.');
      // Only publish confirmed server records locally. A local-cache failure must not undo a server payment.
      for(const key of ['collections','rentLedgerV202','rentReceiptsV267','audit'])data[key]=confirmed[key];
      try{if(typeof persist==='function')persist()}catch(_){ }
      const returnTrigger=paymentTrigger;
      activePropertyPeriod=ledgerEntry.period;activeTab='collections';
      closePayment(false);renderWorkspace();
      if(collectionReceiptEligible(record))openReceiptDocument(record,returnTrigger);
      return true;
    }catch(cause){
      if(submitted)paymentNeedsReload=true;
      if(current()&&error)error.textContent=submitted?'لم يكتمل تأكيد الحفظ. قد تكون الدفعة وصلت؛ حدّث الصفحة وابحث برقم الوصل '+record[0]+' قبل إعادة تسجيلها.':String(cause.message||'تعذر الحفظ السحابي. لم يصدر إيصال.');
      return false;
    }finally{
      paymentSaving=false;controls.forEach(([node,disabled])=>node.disabled=disabled);
      if(paymentNeedsReload){const submit=document.getElementById('v267PaymentSubmit');if(submit)submit.disabled=true;}
    }
  }


  function receiptDocument(record){
    const property=String(record?.[4]||activeProperty||'');
    const period=validPeriod(record?.[8])?String(record[8]):currentPeriod();
    const brand=statementBrand(property);
    const paymentStatus=statusLabel(record?.[3]||'مدفوع');
    return '<article class="v202-document v202-receipt v204-tenant-statement v204-rent-receipt" data-v202-generic-rent-receipt>'+ 
        '<div class="v204-brand"><div class="v204-brand-name"><strong>'+escapeHtml(brand.ar)+'</strong><b>'+escapeHtml(brand.en)+'</b></div><div class="v204-brand-contact"><span>'+escapeHtml(brand.addressAr)+'</span><small>'+escapeHtml(brand.addressEn)+'</small><span>'+escapeHtml([brand.phones,brand.email,brand.website,brand.social].filter(Boolean).join(' • '))+'</span></div></div>'+ 
        '<section class="v204-statement-hero"><div><span>وصل استلام إيجار</span><small>RENT RECEIPT</small><h2>'+escapeHtml(record?.[0]||'غير مسجل')+'</h2><p>'+escapeHtml(record?.[1]||'مستأجر غير مسجل')+' • '+escapeHtml(property||'عقار غير مسجل')+' • '+escapeHtml(record?.[6]||'وحدة غير مسجلة')+'</p></div><div class="v204-statement-period"><span>'+escapeHtml(periodLabel(period))+'</span><small>'+escapeHtml(periodLabelEnglish(period))+'</small><b>'+escapeHtml(paymentStatus)+' / '+escapeHtml(statusEnglish(paymentStatus))+'</b></div></section>'+ 
        '<section class="v204-receipt-amount"><span>المبلغ المستلم / AMOUNT RECEIVED</span><strong>'+escapeHtml(bilingualMoney(record?.[2]))+'</strong></section>'+ 
        '<section class="v204-section"><h3><span>بيانات الوصل</span><small>RECEIPT DETAILS</small></h3><dl class="v204-fields">'+ 
          statementField('اسم المستأجر','Tenant Name',record?.[1])+statementField('العقار','Property',property)+statementField('رقم الوحدة','Flat No.',record?.[6])+statementField('رقم الوصل / السند','Receipt / Voucher No.',record?.[0])+statementField('تاريخ الدفع','Payment Date',statementDate(record?.[5]))+statementField('فترة الإيجار','Rent Period',periodLabel(period)+' / '+periodLabelEnglish(period))+statementField('طريقة الدفع','Payment Method',record?.[9])+statementField('حالة الدفع','Payment Status',paymentStatus+' / '+statusEnglish(paymentStatus))+statementField('البيان','Description',record?.[7]||'دفعة إيجار / Rent payment')+ 
        '</dl></section>'+ 
        '<div class="v202-document-signatures"><div><span>المحاسب / Accountant</span><b>________________</b></div><div><span>المستأجر / Tenant</span><b>________________</b></div><div><span>الختم والتوقيع / Stamp & Signature</span><b>________________</b></div></div>'+ 
        '<footer>'+escapeHtml(brand.ar)+' / '+escapeHtml(brand.en)+' • وصل صادر حسب عملية التحصيل المسجلة / Issued from the recorded rent collection</footer>'+ 
      '</article>';
  }

  // Layout transcribed from the supplied blank rent-voucher reference; no signature is synthesized.
  function savedVoucher(record){
    const matches=rows('rentReceiptsV267').filter(r=>r.id===record?.[0]&&[1,3,4,5,6,8,9].every(i=>String(r.record?.[i]??'')===String(record?.[i]??''))&&strictCollectionMoney(r.record?.[2])===strictCollectionMoney(record?.[2]));
    if(matches.length!==1||!collectionReceiptEligible(record))return '';
    const saved=matches[0],c=saved.contract,brand=saved.brand;
    if(!c?.id||!c.contract_no||!c.unit||!c.tenant||!brand)return '';
    const ledger=rawLedgerRecords().filter(x=>normalizedReference(ledgerReference(x))===normalizedReference(saved.id));
    if(ledger.length!==1||String(ledger[0].contractId)!==String(c.id)||!exactIdentityMatch(ledger[0].property,c.property)||!exactIdentityMatch(ledger[0].unit,c.unit)||!exactIdentityMatch(ledger[0].tenant,c.tenant)||strictMoney(ledger[0].paid)!==strictCollectionMoney(record[2]))return '';
    const hasBreakdown=Object.prototype.hasOwnProperty.call(saved,'rentPeriodBreakdown'),breakdown=saved.rentPeriodBreakdown;
    if(hasBreakdown&&!validRentPeriodBreakdown(breakdown,c,record[8],ledger[0].due))return '';
    if(hasRentEntitlement(c)&&!hasBreakdown)return '';
    const e=escapeHtml,amount=strictCollectionMoney(record[2]);if(!Number.isFinite(amount)||amount<=0)return '';
    const fils=Math.round(amount*1000),line=(ar,en,value)=>'<div class="v267-voucher-line"><span>'+e(ar)+'</span><strong>'+e(value)+'</strong><small lang="en">'+e(en)+'</small></div>';
    const rentLines=hasBreakdown?line('إيجار العقد الأصلي','Original contract rent',c.contractRent)+(breakdown.manual?line('صافي أول فترة — مبلغ يدوي، دون خصم إضافي','Manual first-period net; no additional discount',breakdown.net.toFixed(3)):line('إجمالي إيجار الفترة','Period gross rent',breakdown.gross.toFixed(3))+line('خصم الفترة','Period discount',breakdown.discount.toFixed(3))+line('صافي الفترة','Period net due',breakdown.net.toFixed(3)))+line('تاريخ استحقاق الفترة','Period due date',breakdown.dueOn):line('إيجار العقد / بعد الخصم','Original / Current rent',c.contractRent+' / '+c.rent);
    const voucherBand=hasBreakdown?'تاريخ استحقاق إيجار هذه الفترة: '+breakdown.dueOn:'تسديد الإيجارات بحد أقصاها الخامس من كل شهر (التأمين لا يرد)';
    return '<article class="v202-document v267-voucher" data-v267-voucher data-receipt-no="'+e(saved.id)+'"><h1>'+e(brand.ar)+'</h1><header><div><b>وصل إيجار</b><br><span lang="en">Rent Voucher</span></div><div>رقم الوصل / No.<strong>'+e(saved.id)+'</strong><br>التاريخ / Date: '+e(record[5])+'</div><div class="v267-voucher-money"><span>دينار K.D<br><b>'+Math.floor(fils/1000)+'</b></span><span>فلس Fils<br><b>'+String(fils%1000).padStart(3,'0')+'</b></span></div></header>'+
      line('وصلني من السيد / السادة','Received From',c.tenant+(saved.tenantNameEn?' / '+saved.tenantNameEn:''))+line('مبلغ وقدره','Sum Of KD',amount.toFixed(3)+' د.ك')+line('طريقة الدفع / المرجع','Cash / Cheque / K-net No.',record[9]+' / '+(saved.transactionNo||'غير مدون'))+line('وذلك من إيجار شهر','Rent of Month',record[8])+line('وحدة رقم','Room No.',c.unit)+line('العقار / رقم العقد','Property / Contract No.',c.property+' / '+c.contract_no)+
      (saved.detailsVersion===2?line('الدور','Floor',c.floor)+line('البريد الإلكتروني','Email',c.tenantProfile?.email)+line('الهاتف','Phone',c.tenantProfile?.phone)+line('الرقم المدني','Civil ID',c.tenantProfile?.civilId)+line('رقم الجواز','Passport',c.tenantProfile?.passportNo)+line('الجنسية','Nationality',c.tenantProfile?.nationality)+line('بداية ونهاية العقد','Contract term',c.start_date+' — '+c.end_date)+rentLines+(c.rentalTermsVersion===1?line('تاريخ استلام التأمين','Deposit received',c.depositReceivedOn||'لم يستلم')+line('الشهر المجاني المعتمد','Approved free month',c.freeMonthApproved?'نعم — '+c.freeMonthPeriod:'لا'):'')+line('التأمين / العربون / النظافة','Deposit / Advance / Cleaning',c.deposit+' / '+c.advance+' / '+c.cleaningFee)+line('رقم العملية','Transaction',saved.transactionNo||'كاش')+line('حالة ووقت استلام العقد — الكويت','Contract received',c.contractReceived+' '+c.receivedAt)+line('تبليغ الإخلاء','Eviction notice',c.evictionNotice)+line('المحاسب المسؤول','Accountant',saved.accountant):hasBreakdown?rentLines:'')+
      '<section class="v267-voucher-terms"><p>في حالة عدم توقيع العقد وعدم تسلم كامل قيمة الإيجار خلال يومين من تاريخ هذا الإيصال تعتبر الحجز ملغية ويعتبر الحجز لاغياً.</p><p lang="en">If the contract is not signed or full payment is not received within two days of receiving this receipt, this reservation is considered void and the customer shall have no right in potential claim.</p><p>هذا الإيصال لإثبات المبلغ المدفوع فقط، ولا يعكس السعر المتفق عليه للإيجار.</p><p lang="en">This receipt is proof of payment and does not reflect the actual agreed upon rental price.</p><p>يعتبر هذا الإيصال لاغياً في حال عدم تحصيل الشيك.</p><p lang="en">This receipt is considered void in case of failure of processing the cheque.</p></section><p class="v267-voucher-band">'+e(voucherBand)+'</p><div class="v267-voucher-signatures"><p>اسم المستلم / Receiver Name<br>________________<br>توقيع المستلم / Receiver Signature<br>________________</p><p>اسم المحاسب / Accountant Name<br>________________<br>توقيع المحاسب / Accountant Signature<br>________________</p></div><footer>'+e(brand.addressAr)+' • '+e(record[9])+'</footer></article>';
  }

  function rowOrEmpty(cells,colspan){return cells||'<tr><td colspan="'+colspan+'">لا توجد بيانات مرتبطة</td></tr>'}

  function periodLabel(period){
    const date=new Date(String(period||currentPeriod())+'-01T12:00:00');
    try{return date.toLocaleDateString('ar-KW',{year:'numeric',month:'long'})}
    catch(_){return String(period||currentPeriod())}
  }

  function periodLabelEnglish(period){
    const date=new Date(String(period||currentPeriod())+'-01T12:00:00');
    try{return date.toLocaleDateString('en-GB',{year:'numeric',month:'long'})}
    catch(_){return String(period||currentPeriod())}
  }

  function statementDate(value){
    const raw=String(value||'').trim();
    if(!raw)return 'غير مسجل / Not recorded';
    const iso=/^\d{4}-\d{2}-\d{2}$/.test(raw);
    if(iso&&!validRecordedDate(raw))return raw;
    const date=iso?new Date(raw+'T12:00:00'):null;
    if(!date||Number.isNaN(date.getTime()))return raw;
    try{return date.toLocaleDateString('ar-KW',{year:'numeric',month:'2-digit',day:'2-digit'})+' / '+date.toLocaleDateString('en-GB',{year:'numeric',month:'2-digit',day:'2-digit'})}
    catch(_){return raw}
  }

  function bilingualMoney(value){
    if(value==null||String(value).trim()==='')return 'غير مسجل / Not recorded';
    const amount=strictCollectionMoney(value);
    if(!Number.isFinite(amount))return 'غير مسجل / Not recorded';
    let english=String(amount);
    try{english=amount.toLocaleString('en-KW',{minimumFractionDigits:0,maximumFractionDigits:3})}catch(_){ }
    return money(amount)+' / KD '+english;
  }

  function recordedBilingualMoney(value,recorded){
    const present=value!=null&&String(value).trim()!=='';
    const isRecorded=recorded===undefined?present:recorded===true;
    const amount=isRecorded?strictMoney(value):Number.NaN;
    return Number.isFinite(amount)?bilingualMoney(amount):'غير مسجل / Not recorded';
  }

  function statusEnglish(value){
    return ({'مسدد':'Paid','مدفوع':'Paid','مستلم':'Received','جزئي':'Partially paid','مستحق':'Due','لم يحن الاستحقاق':'Not yet due','لا إيجار للفترة':'No rent for this period','شهر مجاني':'Approved free month','قيد المراجعة':'Under review','يحتاج مراجعة':'Needs review','يحتاج تحقق':'Needs verification','غير قابل للفوترة':'Not billable','موقّع':'Signed','منتهي':'Expired','ملغي':'Cancelled','غير مربوط':'Not linked','مسودة':'Draft','جاهز للاعتماد':'Ready for approval','معتمد':'Approved','بانتظار التوقيع':'Awaiting signature'})[String(value||'')]||String(value||'Not recorded');
  }

  function tenantMailto(record,period){
    const addresses=emailAddresses(record?.email);
    if(!addresses.length||!record)return '';
    const selectedPeriod=validPeriod(period)?period:record.period;
    const periodAr=periodLabel(selectedPeriod);
    const periodEn=periodLabelEnglish(selectedPeriod);
    const brand=statementBrand(record.property||activeProperty);
    const dueValue=hasField(record,'rent')?record.rent:record.due;
    const subject='كشف إيجار '+periodAr+' – '+String(record.property||activeProperty||'عقاري')+' – الوحدة '+String(record.unit||'');
    const body=[
      'السيد/السيدة '+String(record.tenant||'المستأجر')+'،',
      'يرجى مراجعة ملخص كشف الإيجار عن '+periodAr+'.',
      'العقار: '+String(record.property||activeProperty||'—'),
      'الوحدة: '+String(record.unit||'—'),
      'رقم العقد: '+String(record.contractNo||'—'),
      'المستحق: '+bilingualMoney(dueValue),
      'المدفوع: '+bilingualMoney(record.paid),
      'المتبقي: '+bilingualMoney(record.balance),
      '',
      'Dear '+String(record.tenant||'Tenant')+',',
      'Please review the rent statement summary for '+periodEn+'.',
      'Property: '+String(record.property||activeProperty||'—'),
      'Unit: '+String(record.unit||'—'),
      'Contract No.: '+String(record.contractNo||'—'),
      'Due: '+bilingualMoney(dueValue),
      'Paid: '+bilingualMoney(record.paid),
      'Balance: '+bilingualMoney(record.balance),
      '',
      [brand.ar,brand.en].filter(Boolean).join(' / '),
      [brand.email,brand.website].filter(Boolean).join(' • ')
    ].join('\n');
    return 'mailto:'+addresses.join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  }

  function statementBrand(property){
    if(/ضحاوي|dhahawi/i.test(String(property||''))){
      return {
        ar:'برج ضحاوي',en:'DHAHAWI TOWER',
        addressAr:'السالمية، قطعة 10، شارع عيسى القتامي، مبنى 28',
        addressEn:'Salmiya, Block 10, Essa Al Qutami St., Building 28',
        phones:'50721277 • 51119040 • 55521007 • 25640025',
        email:'dhahawitower@gmail.com',website:'dhahawikw.com',social:'@DHAHAWITOWER'
      };
    }
    return {ar:String(property||'عقاري'),en:'AQARI PROPERTY',addressAr:'إدارة الأملاك',addressEn:'Property Management',phones:'',email:'',website:'myaqari.com',social:''};
  }

  function statementField(ar,en,value,extraClass){
    const shown=value==null||String(value).trim()===''?'غير مسجل / Not recorded':String(value);
    return '<div class="v204-field '+(extraClass||'')+'"><dt><span>'+escapeHtml(ar)+'</span><small>'+escapeHtml(en)+'</small></dt><dd>'+escapeHtml(shown)+'</dd></div>';
  }

  function statementFieldMarkup(ar,en,markup,extraClass){
    return '<div class="v204-field '+(extraClass||'')+'"><dt><span>'+escapeHtml(ar)+'</span><small>'+escapeHtml(en)+'</small></dt><dd>'+markup+'</dd></div>';
  }

  function tenantReceiptDocument(context,record,entry,period){
    if(!context||!record||!entry)return '';
    const selectedPeriod=validPeriod(period)?period:record.period;
    const receiptNo=ledgerReference(entry);
    if(!validPeriod(selectedPeriod)||!receiptNo||!settledPayment(entry.status)||!validRecordedDate(entry.paidAt)||!validLedgerPaymentAmount(entry))return '';
    const snapshots=rows('rentReceiptsV267').filter(x=>normalizedReference(x.id)===normalizedReference(receiptNo));
    if(snapshots.length){
      if(snapshots.length!==1)return '';
      const s=snapshots[0];
      if(String(s.contract?.id)!==String(entry.contractId)||!exactIdentityMatch(s.contract?.property,record.property||context.property?.[0])||!exactIdentityMatch(s.contract?.unit,record.unit)||!exactIdentityMatch(s.contract?.tenant,record.tenant)||s.record?.[8]!==selectedPeriod||strictCollectionMoney(s.record?.[2])!==strictMoney(entry.paid))return '';
      return savedVoucher(s.record);
    }
    const brand=statementBrand(record.property||context.property?.[0]);
    const paymentStatus=statusLabel(entry.status||record.paymentStatus);
    const transaction=ledgerTransactionNo(entry);
    const note=String(entry.note||'').trim();
    return '<article class="v202-document v202-receipt v204-tenant-statement v204-rent-receipt" data-v202-tenant-rent-receipt>'+ 
        '<div class="v204-brand"><div class="v204-brand-name"><strong>'+escapeHtml(brand.ar)+'</strong><b>'+escapeHtml(brand.en)+'</b></div><div class="v204-brand-contact"><span>'+escapeHtml(brand.addressAr)+'</span><small>'+escapeHtml(brand.addressEn)+'</small><span>'+escapeHtml([brand.phones,brand.email,brand.website,brand.social].filter(Boolean).join(' • '))+'</span></div></div>'+ 
        '<section class="v204-statement-hero"><div><span>وصل استلام إيجار</span><small>RENT RECEIPT</small><h2>'+escapeHtml(receiptNo||'غير مسجل')+'</h2><p>'+escapeHtml(record.tenant||'مستأجر غير مسجل')+' • '+escapeHtml(record.property||activeProperty)+' • '+escapeHtml(record.unit)+'</p></div><div class="v204-statement-period"><span>'+escapeHtml(periodLabel(selectedPeriod))+'</span><small>'+escapeHtml(periodLabelEnglish(selectedPeriod))+'</small><b class="'+unitStatusTone(record.paymentStatus)+'">'+escapeHtml(paymentStatus)+' / '+escapeHtml(statusEnglish(paymentStatus))+'</b></div></section>'+ 
        '<section class="v204-receipt-amount"><span>المبلغ المستلم / AMOUNT RECEIVED</span><strong>'+escapeHtml(bilingualMoney(entry.paid))+'</strong></section>'+ 
        '<section class="v204-section"><h3><span>بيانات الوصل</span><small>RECEIPT DETAILS</small></h3><dl class="v204-fields">'+ 
          statementField('اسم المستأجر','Tenant Name',record.tenant)+statementField('رقم الوحدة','Flat No.',record.unit)+statementField('رقم العقد','Contract No.',record.contractNo)+statementField('رقم الوصل / السند','Receipt / Voucher No.',receiptNo)+statementField('تاريخ الدفع','Payment Date',statementDate(entry.paidAt))+statementField('فترة الإيجار','Rent Period',periodLabel(selectedPeriod)+' / '+periodLabelEnglish(selectedPeriod))+statementField('طريقة الدفع','Payment Method',entry.method||record.methods?.join('، '))+statementField('رقم عملية كي نت','KNET Operation No.',transaction)+statementField('رقم السند','Voucher No.',referenceText(entry.voucherNo)||receiptNo)+statementField('حالة الدفع','Payment Status',paymentStatus+' / '+statusEnglish(paymentStatus))+statementField('المحاسب','Accountant',record.accountant)+ 
        '</dl></section>'+ 
        (note?'<section class="v204-section v204-notes"><h3><span>البيان</span><small>DESCRIPTION</small></h3><p>'+escapeHtml(note)+'</p></section>':'')+ 
        '<div class="v202-document-signatures"><div><span>المحاسب / Accountant</span><b>'+escapeHtml(record.accountant||'________________')+'</b></div><div><span>المستأجر / Tenant</span><b>________________</b></div></div>'+ 
        '<footer>'+escapeHtml(brand.ar)+' / '+escapeHtml(brand.en)+' • وصل صادر حسب عملية التحصيل المسجلة / Issued from the recorded rent collection</footer>'+ 
      '</article>';
  }

  function enforceableContractRecord(record){
    if(!record||!identityText(record.property)||!identityText(record.unit)||!identityText(record.tenant)||!identityText(record.contractId||record.contractNo))return false;
    if(!validRecordedDate(record.startDate)||!validRecordedDate(record.endDate))return false;
    if(!validContractDateRange({status:'signed',start_date:record.legalStartDate||record.startDate,end_date:record.legalEndDate||record.endDate},true))return false;
    const current=record.currentRentRecorded===true?strictMoney(record.currentRent):Number.NaN;
    const face=record.contractRentRecorded===true?strictMoney(record.contractRent):Number.NaN;
    return (Number.isFinite(current)&&current>0)||(Number.isFinite(face)&&face>0);
  }

  function tenantContractDocument(context,record){
    if(!context||!record)return '';
    const brand=statementBrand(record.property||context.property?.[0]);
    const owner=String(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير مسجل / Not recorded');
    const emails=emailAddresses(record.email);
    const emailValue=emails.length?emails.map(function(email){return '<a href="mailto:'+escapeHtml(email)+'">'+escapeHtml(email)+'</a>'}).join('<br>'):escapeHtml(record.email||'غير مسجل / Not recorded');
    const civilMarkup='<span class="v204-sensitive-value is-masked">'+escapeHtml(maskCivilId(record.civilId))+'</span>'+(record.civilId?'<button type="button" class="v204-civil-toggle v202-no-print" data-v202-tenant-civil-reveal aria-pressed="false">إظهار / Show</button>':'');
    const contractState=(record.contractStatus||'غير مسجل')+' / '+statusEnglish(record.contractStatus);
    const enforceable=Boolean(record.hasContract&&record.verified===true&&record.contractStatus==='موقّع'&&enforceableContractRecord(record));
    const documentTitleAr=enforceable?'عقد الإيجار':'مسودة غير متحققة';
    const documentTitleEn=enforceable?'TENANCY CONTRACT':'UNVERIFIED DRAFT / UNVERIFIED TENANCY DRAFT';
    const verificationNotice=enforceable?'':'<section class="v204-section v204-contract-note" data-v202-contract-unverified><h3><span>غير صالحة للتوقيع</span><small>NOT FOR SIGNATURE</small></h3><p>بيانات هذا العقد غير مكتملة أو غير متحققة. راجع حالة العقد ومصدره والقيم المسجلة قبل الاعتماد.<br><span>This draft is incomplete or unverified. It is not an executed contract or proof of signature. Verify its status, source, and recorded terms before approval.</span></p></section>';
    return '<article class="v202-document v202-statement v204-tenant-statement v204-tenancy-contract" data-v202-tenancy-contract data-v202-contract-verified="'+String(enforceable)+'">'+ 
        '<div class="v204-brand"><div class="v204-brand-name"><strong>'+escapeHtml(brand.ar)+'</strong><b>'+escapeHtml(brand.en)+'</b></div><div class="v204-brand-contact"><span>'+escapeHtml(brand.addressAr)+'</span><small>'+escapeHtml(brand.addressEn)+'</small><span>'+escapeHtml([brand.phones,brand.email,brand.website,brand.social].filter(Boolean).join(' • '))+'</span></div></div>'+ 
        '<section class="v204-statement-hero"><div><span>'+escapeHtml(documentTitleAr)+'</span><small>'+escapeHtml(documentTitleEn)+'</small><h2>'+escapeHtml(record.contractNo||'عقد غير مرقم')+'</h2><p>'+escapeHtml(record.property||activeProperty)+' • '+escapeHtml(record.unit)+'</p></div><div class="v204-statement-period"><span>'+escapeHtml(statementDate(record.startDate))+'</span><small>'+escapeHtml(statementDate(record.endDate))+'</small><b>'+escapeHtml(contractState)+'</b></div></section>'+verificationNotice+ 
        '<section class="v204-section"><h3><span>أطراف العقد</span><small>CONTRACT PARTIES</small></h3><dl class="v204-fields">'+ 
          statementField('الطرف الأول / المالك','First Party / Lessor',owner)+statementField('الطرف الثاني / المستأجر','Second Party / Tenant',record.tenant)+statementField('رقم الهاتف','Phone',record.phone)+statementField('الجنسية','Nationality',record.nationality)+statementFieldMarkup('الرقم المدني','Civil ID',civilMarkup)+statementFieldMarkup('البريد الإلكتروني','Email',emailValue)+ 
        '</dl></section>'+ 
        '<section class="v204-section"><h3><span>العقار والمدة</span><small>PROPERTY & TERM</small></h3><dl class="v204-fields">'+ 
          statementField('العقار','Property',record.property||activeProperty)+statementField('رقم الوحدة','Flat No.',record.unit)+statementField('رقم العقد','Contract No.',record.contractNo)+statementField('حالة العقد','Contract Status',contractState)+statementField('بداية العقد','Contract Start',statementDate(record.startDate))+statementField('نهاية العقد','Contract End',statementDate(record.endDate))+statementField('استلام العقد','Contract Received',record.contractReceived)+statementField('تبليغ بالإخلاء','Notice of Eviction',record.evictionNotice)+ 
        '</dl></section>'+ 
        '<section class="v204-section"><h3><span>القيم المالية</span><small>FINANCIAL TERMS</small></h3><dl class="v204-fields v204-financial-fields">'+ 
          statementField('إيجار العقد','Contract Rent',recordedBilingualMoney(record.contractRent,record.contractRentRecorded))+statementField('الإيجار الحالي','Current Rent',recordedBilingualMoney(record.currentRent,record.currentRentRecorded))+statementField('مبلغ التأمين','Insurance Amount',recordedBilingualMoney(record.insurance,record.insuranceRecorded))+statementField('تاريخ التأمين','Insurance Date',statementDate(record.insuranceDateRaw))+statementField('مبلغ العربون','Advance Amount',recordedBilingualMoney(record.advance,record.advanceRecorded))+statementField('تاريخ العربون','Advance Date',statementDate(record.advanceDateRaw))+statementField('رسوم النظافة','Cleaning Fees',recordedBilingualMoney(record.cleaningFee,record.cleaningFeeRecorded))+statementField('عرض شهر مجاني','Free Month Offer',record.freeMonth)+ 
        '</dl></section>'+ 
        '<section class="v204-section v204-contract-note"><h3><span>إقرار المستند</span><small>DOCUMENT NOTICE</small></h3><p>يعرض هذا المستند بيانات عقد الإيجار المسجلة في المنصة. الحقوق والالتزامات النهائية تخضع للعقد الأصلي الموقّع والقانون المعمول به.<br><span>This document presents the tenancy data recorded in the platform. Final rights and obligations remain governed by the signed original contract and applicable law.</span></p></section>'+ 
        (enforceable?'<div class="v202-document-signatures v204-contract-signatures"><div><span>الطرف الأول / First Party</span><b>________________</b></div><div><span>الطرف الثاني / Second Party</span><b>________________</b></div><div><span>شاهد / Witness</span><b>________________</b></div><div><span>الختم / Stamp</span><b>________________</b></div></div>':'')+ 
        '<footer>'+escapeHtml(brand.ar)+' / '+escapeHtml(brand.en)+' • '+(enforceable?'عقد مرتبط بملف المستأجر والوحدة / Contract linked to this tenant and unit':'مسودة للعرض والمراجعة فقط / Draft for review only')+'</footer>'+ 
      '</article>';
  }

  function tenantStatementDocument(context,record,period){
    if(!context||!record)return '';
    const selectedPeriod=validPeriod(period)?period:(validPeriod(record.period)?record.period:currentPeriod());
    const brand=statementBrand(record.property||context.property?.[0]);
    const emails=emailAddresses(record.email);
    const mailto=tenantMailto(record,selectedPeriod);
    const emailValue=emails.length?emails.map(function(email){return '<a href="mailto:'+escapeHtml(email)+'">'+escapeHtml(email)+'</a>'}).join('<br>'):escapeHtml(record.email||'غير مسجل / Not recorded');
    const civilMarkup='<span class="v204-sensitive-value is-masked">'+escapeHtml(maskCivilId(record.civilId))+'</span>'+(record.civilId?'<button type="button" class="v204-civil-toggle v202-no-print" data-v202-tenant-civil-reveal aria-pressed="false">إظهار / Show</button>':'');
    const mailAction=mailto?'<a class="v204-email-action" href="'+escapeHtml(mailto)+'">فتح البريد / Open Email</a><button type="button" data-v202-copy-email>نسخ البريد / Copy Email</button>':'<span class="v204-email-missing">البريد غير مسجل أو غير صالح / Email unavailable</span>';
    const receipts=record.receipts?.join('، ')||'غير مسجل / Not recorded';
    const settledReceipts=tenantLedgerEntries(context,record,selectedPeriod).filter(function(entry){return Boolean(resolvedReceiptForRecord(context,record,entry,selectedPeriod))});
    const latestReceipt=ledgerReference(settledReceipts[settledReceipts.length-1]);
    const contractValue=record.contractId||record.contractNo||'';
    const relatedActions=(record.hasContract&&contractValue?'<button type="button" class="v204-related-primary" data-v202-tenant-contract="'+escapeHtml(contractValue)+'">'+(record.verified?'عقد الإيجار / Tenancy Contract':'مسودة العقد / Draft Contract')+'</button>':'')+(latestReceipt?'<button type="button" data-v202-tenant-receipt="'+escapeHtml(latestReceipt)+'">وصل الإيجار / Rent Receipt</button>':'');
    const methods=record.methods?.join('، ')||'غير مسجل / Not recorded';
    const transactions=record.knetTransactions?.join('، ')||'غير مسجل / Not recorded';
    const internalNotes=[record.paymentNotes?.join(' • '),record.notes].filter(Boolean).join(' • ');
    return '<div class="v202-document-period"><label for="v202TenantStatementPeriod">شهر الكشف / Statement month</label><input id="v202TenantStatementPeriod" type="month" value="'+escapeHtml(selectedPeriod)+'"></div>'+ 
      '<article class="v202-document v202-statement v204-tenant-statement" data-v202-tenant-statement>'+ 
        '<div class="v204-brand"><div class="v204-brand-name"><strong>'+escapeHtml(brand.ar)+'</strong><b>'+escapeHtml(brand.en)+'</b></div><div class="v204-brand-contact"><span>'+escapeHtml(brand.addressAr)+'</span><small>'+escapeHtml(brand.addressEn)+'</small><span>'+escapeHtml([brand.phones,brand.email,brand.website,brand.social].filter(Boolean).join(' • '))+'</span></div></div>'+ 
        '<section class="v204-statement-hero"><div><span>كشف إيجار المستأجر</span><small>TENANT RENT STATEMENT</small><h2>'+escapeHtml(record.tenant||'مستأجر غير مسجل')+'</h2><p>'+escapeHtml(record.property||activeProperty)+' • '+escapeHtml(record.unit)+'</p></div><div class="v204-statement-period"><span>'+escapeHtml(periodLabel(selectedPeriod))+'</span><small>'+escapeHtml(periodLabelEnglish(selectedPeriod))+'</small><b class="'+unitStatusTone(record.paymentStatus)+'">'+escapeHtml(record.paymentStatus)+' / '+escapeHtml(statusEnglish(record.paymentStatus))+'</b></div></section>'+ 
        '<div class="v204-statement-actions v202-no-print">'+relatedActions+mailAction+'<small>'+(emails.length?'سيُفتح تطبيق البريد إلى '+escapeHtml(maskedEmail(emails[0])):'أضف بريدًا صحيحًا إلى ملف المستأجر لتفعيل الإرسال')+'</small></div>'+ 
        '<section class="v204-section"><h3><span>بيانات المستأجر</span><small>TENANT INFORMATION</small></h3><dl class="v204-fields">'+ 
          statementField('اسم المستأجر','Tenant Name',record.tenant)+statementField('رقم الوحدة','Flat No.',record.unit)+statementField('رقم الهاتف','Phone',record.phone)+statementField('الجنسية','Nationality',record.nationality)+statementFieldMarkup('الرقم المدني','Civil ID',civilMarkup)+statementFieldMarkup('البريد الإلكتروني','Email',emailValue)+ 
        '</dl></section>'+ 
        '<section class="v204-section"><h3><span>بيانات العقد</span><small>CONTRACT DETAILS</small></h3><dl class="v204-fields">'+ 
          statementField('رقم العقد','Contract No.',record.contractNo)+statementField('حالة العقد','Contract Status',(record.contractStatus||'غير مسجل')+' / '+statusEnglish(record.contractStatus))+statementField('بداية العقد','Contract Start',statementDate(record.startDate))+statementField('نهاية العقد','Contract End',statementDate(record.endDate))+statementField('استلام العقد','Contract Received',record.contractReceived)+statementField('عرض شهر مجاني','Free Month Offer',record.freeMonth)+statementField('تبليغ بالإخلاء','Notice of Eviction',record.evictionNotice,'is-wide')+ 
        '</dl></section>'+ 
        '<section class="v204-section"><h3><span>الالتزامات المالية</span><small>FINANCIAL DETAILS</small></h3><dl class="v204-fields v204-financial-fields">'+ 
          statementField('إيجار العقد','Contract Rent',bilingualMoney(record.contractRent))+statementField('الإيجار الحالي','Current Rent',bilingualMoney(record.currentRent))+statementField('مبلغ التأمين','Insurance Amount',bilingualMoney(record.insurance))+statementField('تاريخ التأمين','Insurance Date',statementDate(record.insuranceDateRaw))+statementField('مبلغ العربون','Advance Amount',bilingualMoney(record.advance))+statementField('تاريخ العربون','Advance Date',statementDate(record.advanceDateRaw))+statementField('رسوم النظافة','Cleaning Fees',bilingualMoney(record.cleaningFee))+ 
        '</dl></section>'+ 
        '<section class="v204-section v204-payment-section"><h3><span>تحصيل الإيجار</span><small>RENT COLLECTION</small></h3><div class="v204-money-grid"><div><span>المستحق / Due</span><strong>'+escapeHtml(bilingualMoney(record.rent))+'</strong></div><div><span>المدفوع / Paid</span><strong>'+escapeHtml(bilingualMoney(record.paid))+'</strong></div><div><span>قيد المراجعة / Pending</span><strong>'+escapeHtml(bilingualMoney(record.pending))+'</strong></div><div><span>المتبقي / Balance</span><strong>'+escapeHtml(bilingualMoney(record.balance))+'</strong></div></div><dl class="v204-fields">'+ 
          statementField('تاريخ الدفع','Payment Date',statementDate(record.paidAt))+statementField('طريقة الدفع','Payment Method',methods)+statementField('رقم عملية كي نت','KNET Operation No.',transactions)+statementField('رقم الإيصال','Voucher No.',receipts)+statementField('المحاسب','Accountant',record.accountant)+statementField('مرجع الصفحة','Source Page',record.sourcePage)+ 
        '</dl></section>'+ 
        '<section class="v204-section v204-notes"><h3><span>الملاحظات</span><small>NOTES</small></h3><p>'+escapeHtml(internalNotes||'لا توجد ملاحظات / No notes')+'</p></section>'+ 
        '<div class="v202-document-signatures"><div><span>المحاسب / Accountant</span><b>________________</b></div><div><span>الختم والتوقيع / Stamp & Signature</span><b>________________</b></div></div>'+ 
        '<footer>'+escapeHtml(brand.ar)+' / '+escapeHtml(brand.en)+' • كشف صادر من منصة عقاري حسب البيانات المسجلة وقت الإصدار</footer>'+ 
      '</article>';
  }

  function rentStatementItems(context,period){
    const items=new Map();
    context.propertyContracts.filter(function(contract){return statementIncludesContract(contract,period)}).forEach(function(contract){
      const id=contractId(contract);
      const fallback=JSON.stringify([normalizedIdentity(contract?.tenant),normalizedIdentity(contract?.unit)]);
      const key=id?'id:'+normalizedIdentity(id):'party:'+fallback;
      if(!id&&!fallback.replace('|',''))return;
      items.set(key,{contractId:id,tenant:contract?.tenant||'—',unit:contract?.unit||'—',due:contractRent(contract,period),paid:0,pending:0,receipts:[],status:statusLabel(contract?.status),_recordedDues:[],_contract:contract,...(hasRentEntitlement(contract)?{dueOn:contractEntitlementDueOn(contract,period)}:{})});
    });
    context.propertyLedger.filter(function(entry){return String(entry?.period||'')===period}).forEach(function(entry){
      const contract=ledgerContractForEntry(context.property?.[0],entry);
      if(!contract)return;
      const id=contractId(contract);
      const fallback=JSON.stringify([normalizedIdentity(contract?.tenant),normalizedIdentity(contract?.unit)]);
      const key=id?'id:'+normalizedIdentity(id):'party:'+fallback;
      if(!key||!items.has(key))return;
      const item=items.get(key);
      const recordedDue=strictMoney(entry?.due);
      if(Number.isFinite(recordedDue)&&recordedDue>=0&&!item._recordedDues.includes(recordedDue))item._recordedDues.push(recordedDue);
      const amount=strictMoney(entry?.paid);
      if(settledPayment(entry?.status)){
        item.paid=exactMoneySum([item.paid,amount]);
        const reference=ledgerReference(entry);
        if(reference)item.receipts.push(reference);
      }else if(pendingPayment(entry?.status))item.pending=exactMoneySum([item.pending,amount]);
      items.set(key,item);
    });
    return Array.from(items.values()).map(function(item){
      if(item._recordedDues.length===1)item.due=item._recordedDues[0];
      delete item._recordedDues;
      item.balance=exactMoneyDifference(item.due,item.paid);
      item.paymentStatus=rentEntitlementPaymentStatus(item._contract,period,item.due,item.paid,item.pending,item.balance)||(item.due>0&&item.balance===0?'مسدد':item.paid>0?'جزئي':item.pending>0?'قيد المراجعة':'مستحق');
      delete item._contract;
      return item;
    });
  }

  const PROPERTY_RENT_LEDGER_COLUMNS=Object.freeze([
    Object.freeze({key:'unit',ar:'رقم الوحدة',en:'FLAT NO.'}),
    Object.freeze({key:'tenant',ar:'اسم المستأجر',en:'NAME OF THE TENANT'}),
    Object.freeze({key:'contractNo',ar:'رقم العقد',en:'CONTRACT NO.'}),
    Object.freeze({key:'contractRent',ar:'عقد إيجار',en:'RENT CONTRACT',money:true}),
    Object.freeze({key:'insurance',ar:'تأمين',en:'INSURANCE',money:true}),
    Object.freeze({key:'advance',ar:'عربون',en:'ADVANCE',money:true}),
    Object.freeze({key:'cleaningFee',ar:'رسوم النظافة',en:'CLEANING FEES',money:true}),
    Object.freeze({key:'currentRent',ar:'الإيجار الحالي',en:'CURRENT RENT',money:true}),
    Object.freeze({key:'paymentDate',ar:'تاريخ الدفع',en:'PAYMENT DATE'}),
    Object.freeze({key:'paymentMethod',ar:'طريقة الدفع',en:'PAYMENT METHOD'}),
    Object.freeze({key:'knetTransactionNo',ar:'رقم عملية كي نت / مرجع التحويل',en:'KNET OPERATION NUMBER / TRANSFER REFERENCE'}),
    Object.freeze({key:'voucherNo',ar:'رقم الوصل',en:'VOUCHER NO.'}),
    Object.freeze({key:'contractReceived',ar:'استلام العقد',en:'RECEIPT CONTRACT'}),
    Object.freeze({key:'accountant',ar:'المحاسب',en:'ACCOUNTANT'})
  ]);

  const PROPERTY_RENT_LEDGER_DETAILS=Object.freeze([
    ['insuranceDateRaw','تاريخ استلام التأمين','DEPOSIT RECEIVED DATE'],['freeMonth','الشهر المجاني المعتمد','APPROVED FREE MONTH'],['floor','الدور','FLOOR'],['nameAr','الاسم بالعربي','ARABIC NAME'],['nameEn','الاسم بالإنجليزي','ENGLISH NAME'],['phone','الهاتف','PHONE'],['nationality','الجنسية','NATIONALITY'],['civilId','الرقم المدني','CIVIL ID'],['passportNo','رقم الجواز','PASSPORT'],['email','البريد الإلكتروني','EMAIL'],['startDate','بداية العقد','START DATE'],['endDate','نهاية العقد','END DATE'],['receivedAt','وقت استلام العقد — الكويت','RECEIVED AT KUWAIT'],['evictionNotice','حالة تبليغ الإخلاء','EVICTION NOTICE']
  ]);

  function ledgerRecordedAmount(value){
    if(value==null||String(value).trim()==='')return null;
    const amount=strictMoney(value);
    return Number.isFinite(amount)?amount:null;
  }

  function ledgerPaymentDateKey(value){
    const raw=latinDigits(String(value||'')).trim();
    const iso=raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(iso)return Number(iso[1].padStart(4,'0')+iso[2].padStart(2,'0')+iso[3].padStart(2,'0'));
    const local=raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if(local)return Number(local[3]+local[2].padStart(2,'0')+local[1].padStart(2,'0'));
    const timestamp=Date.parse(raw);
    return Number.isFinite(timestamp)?timestamp:0;
  }

  function matchedLedgerDirectoryRecord(records,item){
    const list=Array.isArray(records)?records:[];
    const id=normalizedIdentity(item?.contractId);
    if(id){
      const exact=list.filter(function(record){return normalizedIdentity(record?.contractId)===id});
      if(exact.length===1)return exact[0];
    }
    const party=list.filter(function(record){
      return normalizedIdentity(record?.unit)===normalizedIdentity(item?.unit)&&normalizedIdentity(record?.tenant)===normalizedIdentity(item?.tenant);
    });
    return party.length===1?party[0]:null;
  }

  function scopedLedgerEntries(context,item,record,period,items){
    const scopedRecord=record||{unit:item?.unit,tenant:item?.tenant,contractId:item?.contractId,period};
    const itemId=normalizedIdentity(item?.contractId);
    const protectedOnly=protectedPropertyActive(context?.property?.[0]);
    const sameParty=(Array.isArray(items)?items:[]).filter(function(candidate){
      return normalizedIdentity(candidate?.unit)===normalizedIdentity(item?.unit)&&normalizedIdentity(candidate?.tenant)===normalizedIdentity(item?.tenant);
    });
    return tenantLedgerEntries(context,scopedRecord,period).filter(function(entry){
      if(protectedOnly&&normalized(entry?.source)!==V202_IMPORT_SOURCE)return false;
      const entryId=normalizedIdentity(entry?.contractId||entry?.contract_id);
      if(itemId&&entryId)return itemId===entryId;
      return sameParty.length===1;
    });
  }

  function settledLedgerEntries(context,item,record,period,items){
    return scopedLedgerEntries(context,item,record,period,items).filter(function(entry){
      return settledPayment(entry?.status);
    }).sort(function(left,right){
      return ledgerPaymentDateKey(right?.paidAt)-ledgerPaymentDateKey(left?.paidAt);
    });
  }

  function propertyRentLedgerRows(context,period){
    if(!context)return [];
    const property=String(context.property?.[0]||'');
    const selectedPeriod=validPeriod(period)?period:latestOfficialPeriod(property);
    const protectedOnly=protectedPropertyActive(property);
    const items=rentStatementLedgerItems(context,selectedPeriod);
    const records=unitDirectoryRecords(context,selectedPeriod);
    return items.map(function(item){
      const matchedRecord=matchedLedgerDirectoryRecord(records,item);
      const record=protectedOnly&&normalized(matchedRecord?.directorySource)!==V202_IMPORT_SOURCE?null:matchedRecord;
      const itemId=normalizedIdentity(item.contractId);
      const contract=context.propertyContracts.find(function(candidate){return itemId&&normalizedIdentity(contractId(candidate))===itemId})||null;
      const entries=settledLedgerEntries(context,item,record,selectedPeriod,items);
      const scopedEntries=scopedLedgerEntries(context,item,record,selectedPeriod,items);
      const latestReceipt=entries.find(function(entry){return Boolean(record&&resolvedReceiptForRecord(context,record,entry,selectedPeriod))})||null;
      const latestValid=entries.find(function(entry){return validRecordedDate(entry?.paidAt)})||null;
      const latest=latestReceipt||latestValid;
      const contractRentValue=record?ledgerRecordedAmount(record.contractRent):ledgerRecordedAmount(contract?.contractRent);
      const currentRentValue=record?ledgerRecordedAmount(record.currentRent):ledgerRecordedAmount(contractRent(contract,selectedPeriod,false));
      const paid=exactMoneySum(entries.map(function(entry){return entry?.paid}));
      const pending=exactMoneySum(scopedEntries.filter(function(entry){return pendingPayment(entry?.status)}).map(function(entry){return entry?.paid}));
      const due=strictMoney(item.due);
      const balance=exactMoneyDifference(due,paid);
      const paymentStatus=entries.some(function(entry){return !validRecordedDate(entry?.paidAt)})?'يحتاج مراجعة':rentEntitlementPaymentStatus(contract,selectedPeriod,due,paid,pending,balance)||(contract?.rentalTermsVersion===1&&contract.freeMonthApproved&&contract.freeMonthPeriod===selectedPeriod?'شهر مجاني':due>0&&balance===0?'مسدد':paid>0?'جزئي':pending>0?'قيد المراجعة':'مستحق');
      return {
        property:String(context.property?.[0]||''),period:selectedPeriod,
        unit:String(item.unit||record?.unit||'—'),tenant:String(item.tenant||record?.tenant||'—'),
        contractNo:String(record?.contractNo||contract?.contract_no||''),contractId:String(item.contractId||''),
        recordKey:String(record?.key||''),email:String(record?.email||''),hasContract:Boolean(record?.hasContract||contract),verified:Boolean(record?.verified),billable:Boolean(record?.billable),collectible:Boolean(record?.collectible),
        contractRent:contractRentValue,currentRent:currentRentValue,
        insurance:ledgerRecordedAmount(record?.insurance),advance:ledgerRecordedAmount(record?.advance),cleaningFee:ledgerRecordedAmount(record?.cleaningFee),
        paymentDate:String(latest&&validRecordedDate(latest?.paidAt)?latest.paidAt:''),paymentMethod:String(latest?.method||''),
        knetTransactionNo:String(latest?ledgerTransactionNo(latest):''),voucherNo:ledgerReference(latestReceipt),
        receiptReference:ledgerReference(latestReceipt),
        contractReceived:String(record?.contractReceived||record?.contractReceipt||''),accountant:String(record?.accountant||''),
        insuranceDateRaw:record?.insuranceDateRaw||'',freeMonth:record?.freeMonth||'',nameAr:record?.nameAr||'',nameEn:record?.nameEn||'',floor:record?.floor||'',phone:record?.phone||'',nationality:record?.nationality||'',civilId:record?.civilId||'',passportNo:record?.passportNo||'',startDate:record?.startDate||'',endDate:record?.endDate||'',receivedAt:record?.receivedAt||'',evictionNotice:record?.evictionNotice||'',
        due,paid,pending,balance,paymentStatus,settledPayments:entries.length
      };
    }).sort(function(left,right){
      return String(left.unit).localeCompare(String(right.unit),'ar',{numeric:true,sensitivity:'base'});
    });
  }

  function propertyRentLedgerTotal(rows,key){
    let recorded=0;
    const values=[];
    (Array.isArray(rows)?rows:[]).forEach(function(row){
      const amount=ledgerRecordedAmount(row?.[key]);
      if(amount==null)return;
      recorded+=1;
      values.push(amount);
    });
    return recorded?exactMoneySum(values):null;
  }

  function propertyRentLedgerModel(context,period){
    if(!context)return null;
    const property=String(context.property?.[0]||'');
    const selectedPeriod=validPeriod(period)?period:latestOfficialPeriod(property);
    const ledgerRows=propertyRentLedgerRows(context,selectedPeriod);
    const official=officialStatementFor(property,selectedPeriod);
    const reviewRequired=dueNeedsReview({...context,period:selectedPeriod,official,activeContracts:context.propertyContracts.filter(function(contract){return signedContract(contract)&&validContractTerms(contract)&&contractCoversPeriod(contract,selectedPeriod)})});
    const computedDue=exactMoneySum(ledgerRows.map(function(row){return row.due}));
    const computedPaid=exactMoneySum(ledgerRows.map(function(row){return row.paid}));
    const pending=exactMoneySum(ledgerRows.map(function(row){return row.pending}));
    const due=statementValue(official,'totalRent',computedDue);
    const paid=statementValue(official,'totalCollected',computedPaid);
    const balance=exactMoneyDifference(due,paid);
    const computedInsurance=propertyRentLedgerTotal(ledgerRows,'insurance');
    const computedAdvance=propertyRentLedgerTotal(ledgerRows,'advance');
    const computedCleaning=propertyRentLedgerTotal(ledgerRows,'cleaningFee');
    const computedCurrentRent=propertyRentLedgerTotal(ledgerRows,'currentRent');
    const officialUnitCount=official&&hasField(official,'unitCount')?strictCount(official.unitCount):null;
    const officialOccupiedUnitCount=official&&hasField(official,'occupiedUnitCount')?strictCount(official.occupiedUnitCount):null;
    const unitCount=officialUnitCount==null?Math.max(ledgerRows.length,officialOccupiedUnitCount??0):officialUnitCount;
    const occupiedUnitCount=officialOccupiedUnitCount==null?Math.min(ledgerRows.length,unitCount):officialOccupiedUnitCount;
    return {
      property,owner:String(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:''),period:selectedPeriod,
      brand:statementBrand(property),rows:ledgerRows,official:Boolean(official),reviewRequired,
      unitCount,occupiedUnitCount,vacantUnitCount:Math.max(0,unitCount-occupiedUnitCount),
      sourcePages:official&&hasField(official,'sourcePages')?String(official.sourcePages):'',
      detailTotals:{due:computedDue,paid:computedPaid},
      totals:{
        due,paid,pending,balance,
        contractRent:propertyRentLedgerTotal(ledgerRows,'contractRent'),
        insurance:statementValue(official,'totalInsurance',computedInsurance),
        advance:statementValue(official,'totalAdvance',computedAdvance),
        cleaningFee:statementValue(official,'totalCleaning',computedCleaning),
        currentRent:statementValue(official,'totalRent',computedCurrentRent)
      },
      collectionRate:due?Math.min(100,paid/due*100):0
    };
  }

  function propertyRentLedgerDisplay(value,isMoney){
    if(value==null||String(value).trim()==='')return '—';
    return isMoney?money(numberFrom(value)):String(value);
  }

  function propertyRentLedgerCommandCenter(model){
    const attention=model.rows.filter(function(row){return row.balance>0||row.pending>0}).length;
    const items=model.rows.map(function(row){
      const key=String(row.recordKey||'');
      const mailto=tenantMailto(row,model.period);
      const actions=key?
        '<button type="button" data-v206-ledger-statement-key="'+escapeHtml(key)+'">كشف المستأجر / Statement</button>'+ 
        (row.hasContract?'<button type="button" data-v206-ledger-contract-key="'+escapeHtml(key)+'">'+(row.verified?'العقد / Contract':'مسودة العقد / Draft')+'</button>':'')+
        (row.receiptReference?'<button type="button" data-v206-ledger-receipt-key="'+escapeHtml(key)+'" data-v206-ledger-receipt-reference="'+escapeHtml(row.receiptReference)+'">الوصل / Receipt</button>':'')+
        (mailto?'<a href="'+escapeHtml(mailto)+'">البريد / Email</a>':''):
        '<span class="v206-ledger-command-missing">الملف غير مربوط / File not linked</span>';
      return '<li><div class="v206-ledger-command-person"><bdi dir="ltr">'+escapeHtml(row.unit)+'</bdi><span><strong><bdi dir="auto">'+escapeHtml(row.tenant)+'</bdi></strong><small><bdi dir="ltr">'+escapeHtml(row.contractNo||'—')+'</bdi></small></span><em class="'+unitStatusTone(row.paymentStatus)+'">'+escapeHtml(row.paymentStatus)+' / <span lang="en">'+escapeHtml(statusEnglish(row.paymentStatus))+'</span></em></div><div class="v206-ledger-command-money"><span>المدفوع / Paid <b>'+escapeHtml(money(row.paid))+'</b></span><span>المتبقي / Balance <b>'+escapeHtml(money(row.balance))+'</b></span></div><div class="v206-ledger-command-actions">'+actions+'</div></li>';
    }).join('');
    return '<details class="v206-ledger-command v202-no-print"><summary><span><strong>إدارة المستأجرين مباشرة</strong><small lang="en">TENANT QUICK ACTIONS</small></span><b>'+attention+' تحتاج متابعة / Need follow-up</b></summary><ul>'+items+'</ul></details>';
  }

  function propertyRentLedgerDocument(context,period){
    if(!protectedAccessReady())return '';
    const model=propertyRentLedgerModel(context,period);
    if(!model)return '';
    const headers=PROPERTY_RENT_LEDGER_COLUMNS.map(function(column){
      return '<th scope="col"><strong>'+escapeHtml(column.ar)+'</strong><small lang="en" dir="ltr">'+escapeHtml(column.en)+'</small></th>';
    }).join('');
    const rows=model.rows.map(function(row){
      const cells=PROPERTY_RENT_LEDGER_COLUMNS.map(function(column){
        let value=row[column.key];
        if(column.key==='paymentDate'&&value)value=statementDate(value);
        const empty=value==null||String(value).trim()==='';
        const ltr=column.money||['unit','contractNo','paymentDate','knetTransactionNo','voucherNo'].includes(column.key);
        const className=column.money?' class="is-money"':'';
        let extra='';
        if(column.key==='tenant')extra='<dl class="v267-ledger-details">'+PROPERTY_RENT_LEDGER_DETAILS.filter(([key])=>key!=='receivedAt').map(([key,label])=>'<dt>'+escapeHtml(label)+'</dt><dd><bdi dir="auto">'+escapeHtml(row[key]||'غير مدون')+'</bdi></dd>').join('')+'</dl>';
        if(column.key==='contractReceived')extra='<br><bdi dir="ltr">'+escapeHtml(row.receivedAt||'غير مدون')+'</bdi>';
        const display=escapeHtml(propertyRentLedgerDisplay(value,column.money));
        return '<td'+className+(empty?' data-empty="true"':'')+'><bdi dir="'+(ltr?'ltr':'auto')+'">'+(column.key==='accountant'?'<strong>'+display+'</strong>':display)+'</bdi>'+extra+'</td>';
      }).join('');
      return '<tr data-v206-payment-status="'+escapeHtml(row.paymentStatus)+'">'+cells+'</tr>';
    }).join('');
    const totalMoney=function(key){return propertyRentLedgerDisplay(model.totals[key],true)};
    const totalRow='<tr class="v206-ledger-total"><th scope="row" colspan="3">الإجمالي / <span lang="en">TOTAL</span></th><td class="is-money">'+escapeHtml(totalMoney('contractRent'))+'</td><td class="is-money">'+escapeHtml(totalMoney('insurance'))+'</td><td class="is-money">'+escapeHtml(totalMoney('advance'))+'</td><td class="is-money">'+escapeHtml(totalMoney('cleaningFee'))+'</td><td class="is-money">'+escapeHtml(totalMoney('currentRent'))+'</td><td colspan="6">—</td></tr>';
    const contact=[model.brand.phones,model.brand.email,model.brand.website,model.brand.social].filter(Boolean).join(' • ');
    const occupancyNote=model.official?' يعرض الجدول '+model.occupiedUnitCount+' وحدة مرتبطة/مشغولة'+(model.vacantUnitCount?'، و'+model.vacantUnitCount+' وحدات شاغرة أو بلا عقد تفصيلي':'')+'.':'';
    const officialNote=model.official?'<p class="v206-ledger-source"><strong>مطابق للكشف الرسمي / <span lang="en">OFFICIAL TOTALS</span></strong><span>الإجماليات مأخوذة من الكشف المعتمد، وتفاصيل الوحدات معروضة للمطابقة.'+occupancyNote+(model.sourcePages?' مرجع الصفحات / Source pages: '+escapeHtml(model.sourcePages)+'.':'')+'</span></p>':'';
    return '<article class="v202-document v206-ledger" data-v206-ledger data-v206-ledger-version="V206-preview" data-v206-property="'+escapeHtml(model.property)+'">'+
        '<div class="v206-ledger-tools v202-no-print"><div><label for="v202StatementPeriod">شهر الكشف / Statement month</label><input id="v202StatementPeriod" type="month" value="'+escapeHtml(model.period)+'"></div><button type="button" data-v206-export-csv>تصدير CSV / Export CSV</button><button type="button" data-v267-source-statement>كشف المصدر المحفوظ</button></div>'+ 
        '<header class="v206-ledger-brand"><div class="v206-ledger-brand-name"><strong>'+escapeHtml(model.brand.ar)+'</strong><b>'+escapeHtml(model.brand.en)+'</b><span>'+escapeHtml(model.brand.addressAr)+'</span><small>'+escapeHtml(model.brand.addressEn)+'</small></div><p class="v206-ledger-meta">'+escapeHtml(contact)+'</p></header>'+ 
        '<section class="v206-ledger-header"><div class="v206-ledger-title"><span>كشف إيجار العقار</span><small lang="en">PROPERTY RENT LEDGER</small><h2>'+escapeHtml(model.property||'عقار غير مسجل')+'</h2><p>المالك / <span lang="en">Owner</span>: '+escapeHtml(model.owner||'غير مسجل / Not recorded')+'</p></div><div class="v206-ledger-identity"><strong>'+escapeHtml(periodLabel(model.period))+'</strong><small lang="en">'+escapeHtml(periodLabelEnglish(model.period))+'</small></div></section>'+ 
        '<section class="v206-ledger-summary" aria-label="ملخص التحصيل">'+
          '<div><span>'+(model.official?'الوحدات / UNITS':'الوحدات في الكشف / STATEMENT UNITS')+'</span><strong>'+model.unitCount+'</strong></div>'+ 
          '<div><span>المستحق / DUE</span><strong>'+escapeHtml(model.reviewRequired?'قيد المراجعة / Pending review':money(model.totals.due))+'</strong></div>'+ 
          '<div><span>المحصّل / COLLECTED</span><strong>'+escapeHtml(money(model.totals.paid))+'</strong></div>'+ 
          '<div><span>المتبقي / BALANCE</span><strong>'+escapeHtml(model.reviewRequired?'قيد المراجعة / Pending review':money(model.totals.balance))+'</strong></div>'+ 
        '</section>'+ 
        (model.reviewRequired?'<p class="v206-ledger-source" role="status">بيانات عقود الشهر غير مكتملة أو غير معتمدة. هذا كشف للمراجعة ولا يثبت خلو الوحدة من المستحقات. / Incomplete contract evidence: review statement, not a clearance.</p>':'')+
        officialNote+propertyRentLedgerCommandCenter(model)+
        '<div class="v206-ledger-table-wrap" role="region" aria-label="جدول كشف الإيجار التفصيلي، مرر أفقياً لعرض جميع الأعمدة" tabindex="0"><table class="v206-ledger-table"><caption>كشف الإيجارات التفصيلي / Detailed rent ledger</caption><thead><tr>'+headers+'</tr></thead><tbody>'+rowOrEmpty(rows,14)+'</tbody><tfoot>'+totalRow+'</tfoot></table></div>'+ 
        (model.totals.pending?'<p class="v206-ledger-footnote">دفعات قيد المراجعة بقيمة '+escapeHtml(money(model.totals.pending))+' مستبعدة من المحصّل / Pending payments are excluded from collected totals.</p>':'')+
        '<footer>'+escapeHtml(model.brand.ar)+' / '+escapeHtml(model.brand.en)+' • '+(model.reviewRequired?'كشف للمراجعة؛ اكتمال المستحقات غير مثبت':'كشف صادر من منصة عقاري حسب البيانات المعتمدة وقت الإصدار')+'</footer>'+ 
      '</article>';
  }

  function propertyRentLedgerCsvCell(value){
    let raw=String(value==null?'':value).replace(/[\r\n]+/g,' ');
    if(/^[\s]*[=+\-@]/.test(raw)||/^0\d+$/.test(raw))raw="'"+raw;
    return '"'+raw.replace(/"/g,'""')+'"';
  }

  function propertyRentLedgerCsv(model){
    if(!model||!Array.isArray(model.rows))return '\uFEFF';
    const columns=PROPERTY_RENT_LEDGER_COLUMNS.concat(PROPERTY_RENT_LEDGER_DETAILS.map(([key,ar,en])=>({key,ar,en})));
    const lines=[columns.map(function(column){return column.ar+' / '+column.en})];
    model.rows.forEach(function(row){
      lines.push(columns.map(function(column){
        const value=row[column.key];
        return column.money&&value!=null?numberFrom(value):value;
      }));
    });
    const metadata=[
      ['بيانات الكشف / STATEMENT METADATA',''],
      ['العقار / Property',model.property||''],
      ['الفترة / Period',model.period||''],
      ['إجمالي الوحدات / Total units',model.unitCount??''],
      ['الوحدات المشغولة / Occupied units',model.occupiedUnitCount??''],
      ['الوحدات الشاغرة / Vacant units',model.vacantUnitCount??''],
      ['المستحق الرسمي / Official due',model.reviewRequired?'قيد المراجعة / Pending review':model.totals?.due??''],
      ['المحصّل الرسمي / Official collected',model.totals?.paid??''],
      ['قيد المراجعة / Pending',model.totals?.pending??''],
      ['المتبقي / Balance',model.reviewRequired?'قيد المراجعة / Pending review':model.totals?.balance??''],
      ['إجمالي التأمين / Total insurance',model.totals?.insurance??''],
      ['إجمالي العربون / Total advance',model.totals?.advance??''],
      ['إجمالي رسوم النظافة / Total cleaning',model.totals?.cleaningFee??''],
      ['مرجع الصفحات / Source pages',model.sourcePages||''],
      ['مطابقة التفاصيل / Detail reconciliation',model.reviewRequired?'عقود غير مكتملة؛ ليس إثبات خلو مستحقات / Incomplete contracts; not a clearance':model.official?'الإجماليات الرسمية معتمدة؛ صفوف التفاصيل للمطابقة / Official totals are authoritative; detail rows are for reconciliation':'محسوب من الصفوف / Calculated from rows']
    ];
    lines.push(new Array(columns.length).fill(''));
    metadata.forEach(function(row){lines.push(row.concat(new Array(columns.length-row.length).fill('')))});
    return '\uFEFF'+lines.map(function(line){return line.map(propertyRentLedgerCsvCell).join(',')}).join('\r\n');
  }

  async function openSavedPropertyStatement(button){
    if(!protectedAccessReady()||button.disabled)return false;
    const ledger=button.closest('[data-v206-ledger]');
    const property=String(ledger?.getAttribute('data-v206-property')||'');
    const period=ledger?.querySelector('#v202StatementPeriod')?.value;
    if(!property||propertyKey(property)!==propertyKey(activeProperty)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period||''))return false;
    button.disabled=true;
    try{
      const module=await import('/src/v267/pages/property-statements.js');
      if(!protectedAccessReady()||propertyKey(property)!==propertyKey(activeProperty))return false;
      closeDocument();
      module.openPropertyStatements({propertyName:property,period});
      return true;
    }catch{window.alert('تعذر فتح كشف المصدر المحفوظ. أعد المحاولة.');return false;}
    finally{button.disabled=false;}
  }

  function exportPropertyRentLedgerCsv(){
    if(!protectedAccessReady())return false;
    const ledger=document.querySelector('#v202DocumentBody [data-v206-ledger]');
    const property=String(ledger?.getAttribute('data-v206-property')||'');
    if(!property||propertyKey(property)!==propertyKey(activeProperty))return false;
    const context=contextFor(property);
    const period=ledger?.querySelector('#v202StatementPeriod')?.value||latestOfficialPeriod(property);
    const model=context?propertyRentLedgerModel(context,period):null;
    if(!model||typeof Blob==='undefined'||typeof URL==='undefined'||typeof URL.createObjectURL!=='function')return false;
    const blob=new Blob([propertyRentLedgerCsv(model)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    const propertyName=String(model.property||'property').replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^-+|-+$/g,'')||'property';
    link.href=url;
    link.download='aqari-rent-ledger-'+propertyName+'-'+model.period+'.csv';
    link.hidden=true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},0);
    return true;
  }

  function statementValue(record,key,fallback){
    if(!hasField(record,key))return fallback;
    const amount=strictMoney(record[key]);
    return Number.isFinite(amount)?amount:fallback;
  }

  function statementExtra(record,key){return hasField(record,key)?money(numberFrom(record[key])):'غير مسجل'}

  function statementDocument(context,period){
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const items=rentStatementItems(context,selectedPeriod);
    const official=officialStatementFor(activeProperty,selectedPeriod);
    const computedDue=exactMoneySum(items.map(function(item){return item.due}));
    const computedPaid=exactMoneySum(items.map(function(item){return item.paid}));
    const dueTotal=statementValue(official,'totalRent',computedDue);
    const paidTotal=statementValue(official,'totalCollected',computedPaid);
    const balanceTotal=exactMoneyDifference(dueTotal,paidTotal);
    const rate=dueTotal?Math.min(100,paidTotal/dueTotal*100):0;
    const unitCount=official&&hasField(official,'unitCount')?strictCount(official.unitCount):items.length;
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
    overlay.innerHTML='<section class="v202-document-shell" role="dialog" aria-modal="true" aria-labelledby="v202DocumentDialogTitle"><header class="v202-document-toolbar"><button type="button" data-v202-document-close>رجوع</button><h2 id="v202DocumentDialogTitle">مستند عقاري</h2><button type="button" data-v267-document-download>تحميل نسخة HTML</button><button type="button" data-v267-document-share hidden>تجهيز الوصل للمشاركة</button><button type="button" class="is-primary" data-v202-print>'+icon('printer')+' طباعة / حفظ PDF</button></header><p data-v267-share-status role="status" hidden></p><div id="v202DocumentBody"></div></section>';
    document.body.appendChild(overlay);
  }

  function openDocument(title,markup,trigger,fallbackSelector){
    cancelReceiptDownload();
    ensureDocumentDialog();
    documentTrigger=trigger||document.activeElement;
    documentFallbackSelector=fallbackSelector||'';
    const overlay=document.getElementById('v202DocumentDialog');
    delete overlay.dataset.v202Document;
    const heading=document.getElementById('v202DocumentDialogTitle');
    const body=document.getElementById('v202DocumentBody');
    if(heading)heading.textContent=title;
    if(body)body.innerHTML=markup;
    const download=overlay.querySelector('[data-v267-document-download]');
    if(download){download.hidden=!body?.querySelector('[data-receipt-no]');download.textContent='تحميل وصل إيجار PDF';}
    const share=overlay.querySelector('[data-v267-document-share]'),shareStatus=overlay.querySelector('[data-v267-share-status]');
    if(share){share.hidden=!body?.querySelector('[data-receipt-no]');share.textContent='تجهيز الوصل للمشاركة';share.disabled=false;}
    if(shareStatus){shareStatus.hidden=!body?.querySelector('[data-receipt-no]');shareStatus.textContent='مشاركة يدوية: اختر واتساب أو البريد من هاتف البناية، وتأكد من حساب البرج والمستأجر قبل الإرسال. لا تؤكد المنصة وصول الرسالة.';}
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    suspendLayer('v202PaymentDialog',true);
    suspendLayer('v202PropertyWorkspace',true);
    syncLayerState();
    requestAnimationFrame(function(){overlay.querySelector('[data-v202-document-close]')?.focus()});
  }

  function resolvedTenantReceipt(record){
    if(!Array.isArray(record)||!collectionReceiptEligible(record))return null;
    const property=identityText(record?.[4]||activeProperty||'');
    const reference=normalizedReference(record?.[0]);
    const amount=strictCollectionMoney(record?.[2]);
    const period=validPeriod(record?.[8])?String(record[8]):'';
    if(!property||!reference||!Number.isFinite(amount)||amount<=0)return null;
    if(activeProperty&&propertyKey(activeProperty)!==propertyKey(property))return null;
    const context=contextFor(property);
    if(!context)return null;
    const protectedLedger=protectedRecordsFor('rentLedgerV202',property);
    const provenance=(protectedLedger||rawLedgerRecords()).filter(function(entry){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return false;
      return [entry?.voucherNo,entry?.receiptNo].map(normalizedReference).filter(Boolean).includes(reference);
    });
    if(provenance.length!==1)return null;
    const tenantField=optionalIdentityField(record?.[1]);
    const unitFieldValue=optionalIdentityField(record?.[6]);
    if(tenantField.invalid||unitFieldValue.invalid)return null;
    const matches=context.propertyLedger.filter(function(entry){
      if(!settledPayment(entry?.status)||!validRecordedDate(entry?.paidAt)||normalizedReference(ledgerReference(entry))!==reference)return false;
      if(!exactIdentityMatch(entry?.property,property)||strictMoney(entry?.paid)!==amount)return false;
      if(tenantField.present&&!exactIdentityMatch(entry?.tenant,record[1]))return false;
      if(unitFieldValue.present&&!exactIdentityMatch(entry?.unit,record[6]))return false;
      if(period&&String(entry?.period||'')!==period)return false;
      if(record?.[5]&&normalizedScalar(entry?.paidAt)!==normalizedScalar(record[5]))return false;
      if(record?.[3]&&normalizedScalar(entry?.status)!==normalizedScalar(record[3]))return false;
      return true;
    });
    if(matches.length!==1)return null;
    const entry=matches[0];
    const selectedPeriod=validPeriod(entry?.period)?String(entry.period):period;
    if(!validPeriod(selectedPeriod))return null;
    const contract=ledgerContractForEntry(property,entry);
    if(!contract||!statementIncludesContract(contract,selectedPeriod))return null;
    const directory=unitDirectoryRecords(context,selectedPeriod);
    const tenant=matchedLedgerDirectoryRecord(directory,{
      contractId:contractId(contract),unit:entry?.unit,tenant:entry?.tenant
    });
    if(!tenant?.hasContract||normalizedIdentity(tenant.contractId)!==normalizedIdentity(contractId(contract)))return null;
    return {context,record:tenant,entry,period:selectedPeriod};
  }

  function openReceiptDocument(record,trigger){
    if(!protectedAccessReady())return false;
    activeTenantStatementKey='';
    if(activeProperty&&propertyKey(activeProperty)!==propertyKey(record?.[4]))return false;
    const voucher=savedVoucher(record);
    if(voucher){openDocument('وصل الإيجار / Rent Receipt',voucher,trigger,'#v202PropertyWorkspace [data-v202-action="payment"]');return true;}
    const resolved=resolvedTenantReceipt(record);
    if(!resolved)return false;
    const markup=tenantReceiptDocument(resolved.context,resolved.record,resolved.entry,resolved.period);
    if(!markup)return false;
    openDocument('وصل الإيجار / Rent Receipt',markup,trigger,'#v202PropertyWorkspace [data-v202-action="payment"]');
    return true;
  }

  function openStatementDocument(period,trigger){
    if(!protectedAccessReady())return false;
    const context=contextFor(activeProperty);
    activeTenantStatementKey='';
    if(!context)return false;
    const markup=propertyRentLedgerDocument(context,period||latestOfficialPeriod(activeProperty));
    if(!markup)return false;
    openDocument('كشف إيجار العقار / Property Rent Ledger',markup,trigger,'#v202PropertyWorkspace [data-v202-action="statement"]');
    const dialog=document.getElementById('v202DocumentDialog');
    if(dialog)dialog.dataset.v202Document='rent-office';
    return true;
  }

  function secureRentOfficeProperties(){
    if(!protectedAccessReady())return Object.freeze([]);
    const names=[];
    const seen=new Set();
    rows('properties').forEach(function(row){
      const name=scalarText(row?.[0]);
      const key=propertyKey(name);
      if(!name||!key||seen.has(key)||!propertyRecord(name))return;
      seen.add(key);
      names.push(name);
    });
    return Object.freeze(names);
  }

  function dailyCollectionSummary(name,day){
        if(!protectedAccessReady()||!/^\d{4}-\d{2}-\d{2}$/.test(String(day))||!validRecordedDate(day))return null;
        const context=contextFor(name);
        if(!context)return null;
        const entries=context.propertyLedger.filter(function(entry){return settledPayment(entry.status)&&validLedgerPaymentAmount(entry)});
        const dated=entries.filter(function(entry){return validRecordedDate(entry.paidAt)});
        const today=dated.filter(function(entry){return ledgerPaymentDateKey(entry.paidAt)===ledgerPaymentDateKey(day)});
        return Object.freeze({property:String(context.property[0]),day,paid:exactMoneySum(today.map(function(entry){return entry.paid})),count:today.length,undated:entries.length-dated.length});
      }

  function secureRentOfficeData(name,period){
    if(!protectedAccessReady())return null;
    const property=accessIdentity(name);
    if(!propertyKey(property))return null;
    const context=contextFor(property);
    if(!context||propertyKey(context.property?.[0])!==propertyKey(property))return null;
    const periodOmitted=period==null;
    const suppliedPeriod=periodOmitted?'':accessIdentity(period);
    if(!periodOmitted&&!validPeriod(suppliedPeriod))return null;
    const selectedPeriod=periodOmitted?latestOfficialPeriod(property):suppliedPeriod;
    const model=propertyRentLedgerModel(context,selectedPeriod);
    if(!model||propertyKey(model.property)!==propertyKey(property))return null;
    const records=model.rows.map(function(row){
      const email=emailAddresses(row.email)[0]||'';
      return Object.freeze({
        key:String(row.recordKey||''),unit:String(row.unit||'—'),tenant:String(row.tenant||'—'),
        contractNo:String(row.contractNo||''),contractId:String(row.contractId||''),hasContract:Boolean(row.hasContract),billable:Boolean(row.billable),collectible:Boolean(row.collectible),
        contractRent:row.contractRent,currentRent:row.currentRent,rent:numberFrom(row.due),
        insurance:row.insurance,advance:row.advance,cleaningFee:row.cleaningFee,
        paid:numberFrom(row.paid),pending:numberFrom(row.pending),balance:numberFrom(row.balance),paymentStatus:String(row.paymentStatus||''),
        paidAt:String(row.paymentDate||''),method:String(row.paymentMethod||''),transactionNo:String(row.knetTransactionNo||''),
        insuranceDateRaw:row.insuranceDateRaw,freeMonth:row.freeMonth,nameAr:row.nameAr,nameEn:row.nameEn,floor:row.floor,phone:row.phone,nationality:row.nationality,civilId:row.civilId,passportNo:row.passportNo,startDate:row.startDate,endDate:row.endDate,receivedAt:row.receivedAt,evictionNotice:row.evictionNotice,
        receiptNo:String(row.receiptReference||''),contractReceived:String(row.contractReceived||''),accountant:String(row.accountant||''),email
      });
    });
    return Object.freeze({
      property,period:model.period,latestPeriod:latestOfficialPeriod(property),official:Boolean(model.official),
      obligationsVerified:!context.propertyContracts.some(c=>c.source==='statement-import'&&(c.status!=='signed'||!c.operationalReview||c.pending?.length)),
      sourcePages:String(model.sourcePages||''),unitCount:model.unitCount,
      totalRent:numberFrom(model.totals.due),totalCollected:numberFrom(model.totals.paid),totalBalance:numberFrom(model.totals.balance),
      totalInsurance:numberFrom(model.totals.insurance),totalAdvance:numberFrom(model.totals.advance),totalCleaning:numberFrom(model.totals.cleaningFee),
      canRecordPayment:rentWriteAllowed()&&!protectedPropertyActive(property),records:Object.freeze(records)
    });
  }

  function secureRentOfficeAction(name,key,period,action,trigger){
    if(!protectedAccessReady())return false;
    const property=accessIdentity(name);
    const selectedPeriod=accessIdentity(period);
    const recordKey=accessIdentity(key);
    const requested=accessIdentity(action);
    if(!property||propertyKey(property)!==propertyKey(activeProperty)||!validPeriod(selectedPeriod)||!recordKey||!['statement','contract','receipt','payment'].includes(requested))return false;
    const context=contextFor(property);
    const model=context?propertyRentLedgerModel(context,selectedPeriod):null;
    const safeRows=Array.isArray(model?.rows)?model.rows.filter(function(row){return String(row.recordKey||'')===recordKey}):[];
    const safeRow=safeRows.length===1?safeRows[0]:null;
    const record=context?uniqueUnitRecordByKey(unitDirectoryRecords(context,selectedPeriod),recordKey):null;
    if(!safeRow||!record)return false;
    if(protectedPropertyActive(property)&&normalized(record.directorySource)!==V202_IMPORT_SOURCE)return false;
    if(requested==='statement'){
      const markup=tenantStatementDocument(context,record,selectedPeriod);
      if(!markup)return false;
      activeTenantStatementKey=record.key;
      openDocument('كشف المستأجر / Tenant Statement',markup,trigger,'#v202PropertyWorkspace [data-v202-action="statement"]');
      return true;
    }
    if(requested==='contract'){
      if(!record.hasContract)return false;
      const previousKey=activeTenantStatementKey;
      activeTenantStatementKey=record.key;
      const opened=openTenantContract(trigger,record.contractId||record.contractNo,selectedPeriod);
      if(!opened)activeTenantStatementKey=previousKey;
      return opened;
    }
    if(requested==='receipt'){
      if(!safeRow.receiptReference)return false;
      const previousKey=activeTenantStatementKey;
      activeTenantStatementKey=record.key;
      const opened=openTenantReceipt(trigger,safeRow.receiptReference,selectedPeriod);
      if(!opened)activeTenantStatementKey=previousKey;
      return opened;
    }
    if(requested==='payment'){
      if(record.billable&&record.collectible&&rentWriteAllowed()&&!protectedPropertyActive(property)){
        const previousKey=activeTenantStatementKey;
        closeDocument();
        const opened=Boolean(openPayment(null,record.contractId||'',selectedPeriod));
        if(!opened)activeTenantStatementKey=previousKey;
        return opened;
      }
      closeDocument();
      activeTab='collections';
      renderPanel(context);
      document.getElementById('v202TabCollections')?.focus();
      return true;
    }
  }

  function ledgerTenantSelection(button,keyAttribute){
    if(!protectedAccessReady())return null;
    const ledger=button?.closest?.('[data-v206-ledger]');
    const property=String(ledger?.getAttribute('data-v206-property')||'');
    const recordKey=String(button?.getAttribute(keyAttribute)||'');
    if(!property||!recordKey||propertyKey(property)!==propertyKey(activeProperty))return null;
    const context=contextFor(property);
    const period=ledger?.querySelector('#v202StatementPeriod')?.value||latestOfficialPeriod(property);
    const model=context?propertyRentLedgerModel(context,period):null;
    const safeRows=Array.isArray(model?.rows)?model.rows.filter(function(row){return row.recordKey===recordKey}):[];
    const safeRow=safeRows.length===1?safeRows[0]:null;
    if(!safeRow)return null;
    const record=uniqueUnitRecordByKey(unitDirectoryRecords(context,period),recordKey);
    if(!record)return null;
    if(protectedPropertyActive(property)&&normalized(record.directorySource)!==V202_IMPORT_SOURCE)return null;
    return {context,period,record};
  }

  function openLedgerTenantStatement(button){
    const selected=ledgerTenantSelection(button,'data-v206-ledger-statement-key');
    if(!selected)return false;
    activeTenantStatementKey=selected.record.key;
    openDocument('كشف المستأجر / Tenant Statement',tenantStatementDocument(selected.context,selected.record,selected.period),button,'#v202PropertyWorkspace [data-v202-action="statement"]');
    return true;
  }

  function openLedgerTenantContract(button){
    const selected=ledgerTenantSelection(button,'data-v206-ledger-contract-key');
    if(!selected||!selected.record.hasContract)return false;
    activeTenantStatementKey=selected.record.key;
    return openTenantContract(button,selected.record.contractId||selected.record.contractNo,selected.period);
  }

  function openLedgerTenantReceipt(button){
    const selected=ledgerTenantSelection(button,'data-v206-ledger-receipt-key');
    const reference=String(button?.getAttribute('data-v206-ledger-receipt-reference')||'');
    if(!selected||!reference)return false;
    activeTenantStatementKey=selected.record.key;
    return openTenantReceipt(button,reference,selected.period);
  }

  function closeDocument(){
    cancelReceiptDownload();
    const overlay=document.getElementById('v202DocumentDialog');
    if(!overlay?.classList.contains('on'))return;
    overlay.classList.remove('on');
    overlay.setAttribute('inert','');
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('v202-print-document');
    document.body.classList.remove('v206-print-ledger');
    suspendLayer('v202PaymentDialog',false);
    suspendLayer('v202PropertyWorkspace',false);
    syncLayerState();
    const trigger=documentTrigger;
    const fallback=documentFallbackSelector?document.querySelector(documentFallbackSelector):null;
    documentTrigger=null;
    documentFallbackSelector='';
    activeTenantStatementKey='';
    const body=document.getElementById('v202DocumentBody');
    if(body)body.textContent='';
    const focusTarget=trigger instanceof HTMLElement&&trigger.isConnected?trigger:fallback;
    if(focusTarget instanceof HTMLElement)setTimeout(function(){focusTarget.focus()},0);
  }

  function printDocument(){
    if(!protectedAccessReady())return false;
    document.body.classList.add('v202-print-document');
    document.body.classList.toggle('v206-print-ledger',Boolean(document.querySelector('#v202DocumentBody [data-v206-ledger]')));
    window.addEventListener('afterprint',function(){document.body.classList.remove('v202-print-document','v206-print-ledger')},{once:true});
    window.print();
    return true;
  }

  let receiptDownloadJob=null;
  let receiptShareReady=null;
  const receiptDownloadUrls=new Set();
  function cancelReceiptDownload(){
    receiptShareReady=null;
    const job=receiptDownloadJob;
    if(job){job.cancelled=true;job.controller.abort();receiptDownloadJob=null;if(job.button)job.button.disabled=false;}
    for(const url of receiptDownloadUrls)URL.revokeObjectURL(url);
    receiptDownloadUrls.clear();
  }
  async function downloadDocument(forShare=false){
    if(receiptDownloadJob||!protectedAccessReady())return false;
    const scope=activeAccessScope(),body=document.getElementById('v202DocumentBody');
    const reference=body?.querySelector('[data-receipt-no]')?.dataset.receiptNo;
    if(!reference)return false;
    const button=document.querySelector(forShare?'[data-v267-document-share]':'[data-v267-document-download]');
    const job={controller:new AbortController(),button,cancelled:false};
    receiptDownloadJob=job;if(button)button.disabled=true;
    const current=()=>receiptDownloadJob===job&&!job.controller.signal.aborted&&protectedAccessReady()&&sameAccessScope(scope,activeAccessScope())&&body===document.getElementById('v202DocumentBody')&&body?.querySelector('[data-receipt-no]')?.dataset.receiptNo===reference;
    let timer,rejectAbort;
    const aborted=new Promise((_,reject)=>{rejectAbort=()=>reject(Error('PDF_TIMEOUT'));job.controller.signal.addEventListener('abort',rejectAbort,{once:true});});
    try{
      timer=setTimeout(()=>job.controller.abort(),30000);
      return await Promise.race([aborted,(async()=>{
        const session=await window.AQARI_SUPABASE.getSession();
        if(!current()||session?.user?.id!==scope.userId||!session?.access_token)return false;
        // This same-origin endpoint needs the Preview protection cookie before
        // the server can validate the user's JWT and saved receipt permissions.
        const response=await fetch('/api/rent-receipt',{method:'POST',cache:'no-store',credentials:'same-origin',redirect:'error',signal:job.controller.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token},body:JSON.stringify({workspaceId:scope.workspaceId,receiptNo:reference})});
        if(!current())return false;
        if(!response.ok||response.headers.get('Content-Type')?.split(';')[0]!=='application/pdf')throw Error('PDF_UNAVAILABLE');
        const blob=await response.blob();
        if(!current())return false;
        if(await blob.slice(0,5).text()!=='%PDF-')throw Error('INVALID_PDF');
        if(!current())return false;
        const verified=await window.AQARI_SUPABASE.getSession();
        if(!current()||verified?.user?.id!==scope.userId||!verified?.access_token)return false;
        if(forShare){
          const file=new File([blob],'AQARI-rent-receipt.pdf',{type:'application/pdf'});
          if(typeof navigator.share!=='function'||typeof navigator.canShare!=='function'||!navigator.canShare({files:[file]})){
            receiptShareStatus('المشاركة غير متاحة على هذا الجهاز. حمّل وصل PDF وأرفقه من واتساب أو بريد البناية.');return false;
          }
          receiptShareReady={file,scope,reference,body,expires:Date.now()+60000};
          if(button)button.textContent='مشاركة الوصل عبر الهاتف';
          receiptShareStatus('الملف جاهز. اضغط مشاركة الوصل، واختر تطبيق البناية ثم المستأجر الصحيح.');return true;
        }
        const url=URL.createObjectURL(blob),link=document.createElement('a');receiptDownloadUrls.add(url);
        link.href=url;link.download='AQARI-V267-rent-receipt.pdf';document.body.appendChild(link);link.click();link.remove();
        setTimeout(()=>{if(receiptDownloadUrls.delete(url))URL.revokeObjectURL(url);},60000);return true;
      })()]);
    }catch(error){if(job.cancelled)return false;throw error;}
    finally{
      clearTimeout(timer);job.controller.signal.removeEventListener('abort',rejectAbort);
      if(receiptDownloadJob===job){receiptDownloadJob=null;if(button)button.disabled=false;}
    }
  }

  function receiptShareStatus(message){
    const status=document.querySelector('[data-v267-share-status]');
    if(status){status.hidden=false;status.textContent=message;}
  }
  async function shareDocument(){
    if(!protectedAccessReady()||receiptDownloadJob)return false;
    const ready=receiptShareReady,body=document.getElementById('v202DocumentBody');
    if(!ready||Date.now()>ready.expires||!sameAccessScope(ready.scope,activeAccessScope())||ready.body!==body||body?.querySelector('[data-receipt-no]')?.dataset.receiptNo!==ready.reference){
      receiptShareReady=null;
      receiptShareStatus('جاري تجهيز الوصل المحفوظ…');
      return downloadDocument(true);
    }
    // Invoke synchronously on the second click to preserve native user activation.
    const button=document.querySelector('[data-v267-document-share]');
    if(button)button.disabled=true;
    try{
      await navigator.share({files:[ready.file]});
      if(receiptShareReady===ready)receiptShareStatus('تم فتح المشاركة. تأكد من الإرسال داخل التطبيق؛ وصول الرسالة غير مؤكّد في عقاري.');
      return true;
    }catch(error){
      if(receiptShareReady===ready)receiptShareStatus(error?.name==='AbortError'?'أُغلقت المشاركة دون تأكيد الإرسال.':'تعذرت المشاركة. يمكنك تحميل PDF وإرفاقه من تطبيق البناية.');
      return false;
    }finally{if(receiptShareReady===ready&&button)button.disabled=false;}
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
    const existing=new Set(Array.from(document.querySelectorAll('[data-v201-property]')).map(function(button){return propertyKey(button.getAttribute('data-v201-property'))}));
    (protectedImportCache.properties||[]).forEach(function(record){
      const name=String(record?.[0]||'').trim();
      const key=propertyKey(name);
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
      const protectedUnitCount=strictCount(record?.[2]);
      units.textContent=(Number.isFinite(protectedUnitCount)?protectedUnitCount:0)+' وحدة';
      const income=document.createElement('span');
      income.className='v199-property-income';
      const protectedIncome=strictCollectionMoney(record?.[3]);
      income.textContent=money(Number.isFinite(protectedIncome)?protectedIncome:0);
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
      const unitContract=target.closest('[data-v202-unit-contract]');
      if(unitContract){event.preventDefault();event.stopImmediatePropagation();return openUnitContract(unitContract)}
      const unitStatement=target.closest('[data-v202-unit-statement]');
      if(unitStatement){event.preventDefault();event.stopImmediatePropagation();return openUnitStatement(unitStatement)}
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
      const savedStatement=target.closest('[data-v267-source-statement]');
      if(savedStatement){event.preventDefault();event.stopImmediatePropagation();return openSavedPropertyStatement(savedStatement)}
      if(target.closest('[data-v206-export-csv]')){event.preventDefault();event.stopImmediatePropagation();return exportPropertyRentLedgerCsv()}
      if(target.closest('[data-v202-print]')){event.preventDefault();event.stopImmediatePropagation();return printDocument()}
      if(target.closest('[data-v267-document-share]')){event.preventDefault();event.stopImmediatePropagation();return shareDocument().catch(()=>receiptShareStatus('تعذر تجهيز الوصل. أعد المحاولة أو حمّل PDF.'))}
      if(target.closest('[data-v267-document-download]')){event.preventDefault();event.stopImmediatePropagation();return downloadDocument().catch(()=>window.alert('تعذر تحميل المستند. أعد المحاولة.'))}
      const ledgerStatement=target.closest('[data-v206-ledger-statement-key]');
      if(ledgerStatement){event.preventDefault();event.stopImmediatePropagation();return openLedgerTenantStatement(ledgerStatement)}
      const ledgerContract=target.closest('[data-v206-ledger-contract-key]');
      if(ledgerContract){event.preventDefault();event.stopImmediatePropagation();return openLedgerTenantContract(ledgerContract)}
      const ledgerReceipt=target.closest('[data-v206-ledger-receipt-key]');
      if(ledgerReceipt){event.preventDefault();event.stopImmediatePropagation();return openLedgerTenantReceipt(ledgerReceipt)}
      const tenantReceipt=target.closest('[data-v202-tenant-receipt]');
      if(tenantReceipt){event.preventDefault();event.stopImmediatePropagation();return openTenantReceipt(tenantReceipt)}
      const tenantContract=target.closest('[data-v202-tenant-contract]');
      if(tenantContract){event.preventDefault();event.stopImmediatePropagation();return openTenantContract(tenantContract)}
      const tenantCivil=target.closest('[data-v202-tenant-civil-reveal]');
      if(tenantCivil){event.preventDefault();event.stopImmediatePropagation();return toggleTenantStatementCivil(tenantCivil)}
      const copyEmail=target.closest('[data-v202-copy-email]');
      if(copyEmail){event.preventDefault();event.stopImmediatePropagation();return copyTenantEmail(copyEmail)}
      if(target===document.getElementById('v202PropertyWorkspace')){event.preventDefault();event.stopImmediatePropagation();return closeWorkspace(true)}
      if(target===document.getElementById('v202PaymentDialog')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
    },true);

    document.addEventListener('input',function(event){
      const target=event.target instanceof HTMLInputElement?event.target:null;
      if(target?.id==='v202UnitSearch')filterUnitCards(target.value);
      if(target?.id==='v267PaymentSearch')updatePaymentSearch();
    },true);

    document.addEventListener('toggle',function(event){
      const details=event.target instanceof Element&&event.target.matches('details.aq-unit-details')?event.target:null;
      if(!details||details.open)return;
      const card=details.closest('[data-v202-unit-index]');
      const context=contextFor(activeProperty);
      const records=context?unitDirectoryRecords(context,activePropertyPeriod||latestOfficialPeriod(activeProperty)):[];
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
        if(!protectedAccessReady()){clearProtectedDom();return}
        const ledger=target.closest('[data-v206-ledger]');
        const property=String(ledger?.getAttribute('data-v206-property')||'');
        if(!property||propertyKey(property)!==propertyKey(activeProperty)){clearProtectedDom();return}
        const context=contextFor(property);
        const body=document.getElementById('v202DocumentBody');
        if(context&&body){
          body.innerHTML=propertyRentLedgerDocument(context,target.value||currentPeriod());
          requestAnimationFrame(function(){document.getElementById('v202StatementPeriod')?.focus()});
        }
        return;
      }
      if(target.id==='v202TenantStatementPeriod'){
        if(!protectedAccessReady()){clearProtectedDom();return}
        const context=contextFor(activeProperty);
        const body=document.getElementById('v202DocumentBody');
        const period=validPeriod(target.value)?target.value:latestOfficialPeriod(activeProperty);
        const record=tenantStatementRecord(context,period);
        if(context&&record&&body){
          body.innerHTML=tenantStatementDocument(context,record,period);
          requestAnimationFrame(function(){document.getElementById('v202TenantStatementPeriod')?.focus()});
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
      canCreateContract:function(name){return protectedAccessReady()&&rentWriteAllowed()&&!protectedPropertyActive(name)},
      showContractCopies:async function(id,count,mode='official'){
        if(!protectedAccessReady()||![1,2].includes(count)||!['official','draft'].includes(mode))return false;
        const bound=activeAccessScope(),page=await import('./src/v267/pages/rental-contracts.js');
        if(!protectedAccessReady()||JSON.stringify(bound)!==JSON.stringify(activeAccessScope()))return false;
        return page.openContractPrint(id,count,mode);
      },
      seal:sealProtectedImport,
      openProperty:function(name,period){return protectedAccessReady()?openWorkspace(name,document.activeElement,period):false},
      propertyRecords:function(){
        if(!protectedAccessReady())return [];
        return rows('properties').filter(Array.isArray).map(function(row){
          const metadata=row.find(function(value){return value&&typeof value==='object'&&value.aqariPropertyPresentation===1});
          return row.slice(0,4).concat(metadata?[{aqariPropertyPresentation:1,location:metadata.location,price:metadata.price,purpose:metadata.purpose,phone:metadata.phone,photos:Array.isArray(metadata.photos)?metadata.photos.slice(0,4):[]}]:[]);
        });
      },
      rentOfficeProperties:function(){return secureRentOfficeProperties()},
      rentOfficeData:function(name,period){return secureRentOfficeData(name,period)},
      dailyCollectionSummary:dailyCollectionSummary,
      rentOfficeAction:function(name,key,period,action,trigger){return secureRentOfficeAction(name,key,period,action,trigger)},
      propertyContext:function(name){
        if(!protectedAccessReady())return null;
        const requestedName=scalarText(name);
        if(!propertyKey(requestedName))return null;
        const context=contextFor(requestedName);
        if(!context)return null;
        return Object.freeze({
          name:requestedName,contracts:context.propertyContracts.length,
          collections:context.propertyCollections.length,expenses:context.expenses.length,
          income:context.income,collected:context.collected,expenseTotal:context.expenseTotal,net:context.net
        });
      },
      testing:Object.freeze({
        contractRentForPeriod:function(c,period){return contractRent(c,period)},
        parseMoneyInput:function(value){return strictMoney(value)},
        isSettledStatus:function(status){return settledPayment(status)},
        contractCoversPeriod:function(contract,period){return contractCoversPeriod(contract,period)},
        isBillableContract:function(contract,period){return signedContract(contract)&&contractCoversPeriod(contract,period)},
        paymentKey:function(property,contractIdValue,unit,period){return paymentKey(property,contractIdValue,unit,period)},
        statementItems:function(name,period){
          if(!protectedAccessReady())return Object.freeze([]);
          const context=contextFor(name);
          if(!context||!validPeriod(period))return Object.freeze([]);
          return Object.freeze(rentStatementItems(context,period).map(function(item){
            return Object.freeze({contractId:String(item.contractId||''),unit:String(item.unit||''),due:item.due,paid:item.paid,pending:item.pending,balance:item.balance,status:item.paymentStatus});
          }));
        },
        testContext:function(name,period){
          if(!protectedAccessReady())return null;
          const context=contextFor(name);
          if(!context)return null;
          const selected=validPeriod(period)?period:currentPeriod();
          const items=rentStatementItems(context,selected);
          const official=officialStatementFor(name,selected);
          return Object.freeze({
            activeSignedContracts:context.activeContracts.length,billableContracts:context.propertyContracts.filter(function(contract){return statementIncludesContract(contract,selected)}).length,
            settledPaid:exactMoneySum(items.map(function(item){return item.paid})),pending:exactMoneySum(items.map(function(item){return item.pending})),
            official:Boolean(official),totalRent:statementValue(official,'totalRent',exactMoneySum(items.map(function(item){return item.due}))),
            totalCollected:statementValue(official,'totalCollected',exactMoneySum(items.map(function(item){return item.paid})))
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
