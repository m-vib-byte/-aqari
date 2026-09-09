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
      const unit=normalizedIdentity(record.uni