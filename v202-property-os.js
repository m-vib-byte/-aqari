(function(){
  'use strict';

  const V202_DESIGN='V202-preview';
  const V202_IMPORT_SOURCE='protected-rent-import-v202';
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
    printer:'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>'
  };

  let activeProperty='';
  let propertyTrigger=null;
  let paymentTrigger=null;
  let documentTrigger=null;
  let documentFallbackSelector='';
  let backgroundInertState=null;
  let activeTab='overview';
  let enhanceTimer=0;
  let hydratePromise=null;
  let hydrateListenerInstalled=false;

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
    const fils=Math.round(amount*1000);
    return Number.isFinite(amount)&&Number.isSafeInteger(fils)?fils/1000:Number.NaN;
  }

  function moneyFils(value){
    const amount=Number(value);
    if(!Number.isFinite(amount))return Number.NaN;
    const fils=Math.round(amount*1000);
    return Number.isSafeInteger(fils)?fils:Number.NaN;
  }

  function round3(value){
    const fils=moneyFils(value);
    return Number.isFinite(fils)?fils/1000:Number.NaN;
  }

  function addMoney(left,right){
    const leftFils=moneyFils(left);
    const rightFils=moneyFils(right);
    if(!Number.isFinite(leftFils)||!Number.isFinite(rightFils)||!Number.isSafeInteger(leftFils+rightFils))return Number.NaN;
    return (leftFils+rightFils)/1000;
  }

  function subtractMoney(left,right){
    const leftFils=moneyFils(left);
    const rightFils=moneyFils(right);
    if(!Number.isFinite(leftFils)||!Number.isFinite(rightFils)||!Number.isSafeInteger(leftFils-rightFils))return Number.NaN;
    return (leftFils-rightFils)/1000;
  }

  function sumMoney(values){
    return (Array.isArray(values)?values:[]).reduce(function(total,value){return addMoney(total,value)},0);
  }

  function compareMoney(left,right){
    const leftFils=moneyFils(left);
    const rightFils=moneyFils(right);
    if(!Number.isFinite(leftFils)||!Number.isFinite(rightFils))return Number.NaN;
    return leftFils===rightFils?0:(leftFils<rightFils?-1:1);
  }

  function nonNegativeMoney(value){
    return compareMoney(value,0)>0?round3(value):0;
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

  function rows(key){const value=appData()[key];return Array.isArray(value)?value:[]}

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
      else if(field==='propertyDetails'&&value&&typeof value==='object'&&!Array.isArray(value)){
        const details=pickedRecord(value,['name','owner','address','phone','email','paciNumber','buildingNo','block','street','area']);
        if(Object.keys(details).length)picked[field]=details;
      }
    });
    return picked;
  }

  function importIdentity(key,record){
    if(!record||typeof record!=='object'||Array.isArray(record))return '';
    if(key==='contractsV202'){
      const id=normalized(record.id||record.contractId||record.contract_id);
      if(id)return 'id:'+id;
      const contractNo=normalized(record.contract_no||record.contractNo);
      const property=normalized(record.property||record.propertyName);
      const unit=normalized(record.unit||record.unitName);
      return contractNo&&property&&unit?['no',contractNo,property,unit].join(':'):'';
    }
    if(key==='tenantDirectoryV202'){
      const property=normalized(record.property||record.propertyName);
      const unit=normalized(record.unit||record.unitName);
      const tenant=normalized(record.tenant||record.tenantName);
      return property&&unit&&tenant?['tenant',property,unit,tenant].join(':'):'';
    }
    if(key==='rentLedgerV202'){
      const id=normalized(record.id);
      if(id)return 'id:'+id;
      const receipt=normalized(record.receiptNo);
      const property=normalized(record.property||record.propertyName);
      const unit=normalized(record.unit||record.unitName);
      const period=String(record.period||'');
      return receipt&&property&&unit&&validPeriod(period)?['receipt',receipt,normalized(record.contractId||record.contract_id),unit,period].join(':'):'';
    }
    if(key==='rentStatementsV202'){
      const id=normalized(record.id);
      if(id)return 'id:'+id;
      const property=normalized(record.property||record.propertyName);
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

  async function hydrateDhahawiImport(){
    if(hydratePromise)return hydratePromise;
    hydratePromise=(async function(){
      try{
        const bridge=window.AQARI_SUPABASE;
        if(!bridge?.loadAppState)return false;
        let context=bridge.context;
        if(!context?.user||!context?.membership?.is_active||!context?.workspace?.id){
          if(typeof bridge.refreshContext!=='function')return false;
          context=await bridge.refreshContext();
        }
        if(!context?.user||!context?.membership?.is_active||!context?.workspace?.id)return false;
        const remoteState=await bridge.loadAppState();
        const primary=cloudPrimary(remoteState?.payload);
        if(!primary||typeof primary!=='object'||Array.isArray(primary))return false;
        const data=appData();
        if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.properties))return false;
        const importedPropertyNames=new Set();
        ['contractsV202','rentStatementsV202'].forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          remoteRows.forEach(function(record){
            const property=String(record?.property||record?.propertyName||'').trim();
            if(record&&typeof record==='object'&&!Array.isArray(record)&&normalized(record.source)===V202_IMPORT_SOURCE&&property){
              importedPropertyNames.add(property);
            }
          });
        });
        if(importedPropertyNames.size!==1)return false;
        const definitions={
          contractsV202:['id','contractId','contract_id','contract_no','contractNo','tenant','tenantName','property','propertyName','unit','unitName','rent','monthlyRent','contractRent','deposit','insurance','advance','cleaning','cleaningFees','status','start_date','startDate','end_date','endDate','source'],
          tenantDirectoryV202:['property','propertyName','unit','unitName','tenant','tenantName','contractId','contract_id','contractNo','contract_no','phone','phoneNumber','nationality','civilId','civil_id','email','emailAddress','source','verified'],
          rentLedgerV202:['id','receiptNo','property','propertyName','unit','unitName','tenant','tenantName','contractId','contract_id','contractNo','contract_no','period','due','paid','balance','paidAt','paymentDate','method','paymentMethod','status','note','source','paymentKey','knetOperationNo','knetOperationNumber','knetNo','voucherNo','receiptContract','accountant','insurance','advance','cleaning','cleaningFees'],
          rentStatementsV202:['id','property','propertyName','period','totalRent','totalCollected','totalAdvance','totalInsurance','totalCleaning','sourcePages','unitCount','importedAt','source','owner','address','phone','email','propertyAddress','propertyPhone','propertyEmail','paciNumber','buildingNo','block','street','area','propertyDetails']
        };
        const replacements={};
        let changed=false;
        Object.keys(definitions).forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          if(!remoteRows.some(function(record){return normalized(record?.source)===V202_IMPORT_SOURCE}))return;
          const merged=mergeImportedRows(data[key],remoteRows,key,definitions[key]);
          if(merged.changed){replacements[key]=merged.rows;changed=true}
        });
        const propertyMerge=mergeImportedProperty(data.properties,primary.properties,importedPropertyNames);
        if(propertyMerge.changed){replacements.properties=propertyMerge.rows;changed=true}
        if(!changed)return false;
        const previous={};
        try{
          Object.keys(replacements).forEach(function(key){
            previous[key]={owned:Object.prototype.hasOwnProperty.call(data,key),value:data[key]};
            data[key]=replacements[key];
          });
          if(typeof persist==='function')persist();
          else localStorage.setItem('aqari_v30',JSON.stringify(data));
        }catch(error){
          Object.keys(previous).forEach(function(key){
            try{if(previous[key].owned)data[key]=previous[key].value;else delete data[key]}catch(_){ }
          });
          try{localStorage.setItem('aqari_v30',JSON.stringify(data))}catch(_){ }
          return false;
        }
        try{if(typeof render==='function')render()}catch(_){ }
        if(document.querySelector('#v202PropertyWorkspace.on'))renderWorkspace();
        setPresentation();
        return true;
      }catch(_){return false}
      finally{hydratePromise=null}
    })();
    return hydratePromise;
  }

  function installHydrateListener(){
    const bridge=window.AQARI_SUPABASE;
    if(hydrateListenerInstalled||typeof bridge?.onAuthStateChange!=='function')return;
    hydrateListenerInstalled=true;
    Promise.resolve(bridge.onAuthStateChange(function(event){
      if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='INITIAL_SESSION')setTimeout(hydrateDhahawiImport,0);
    })).catch(function(){hydrateListenerInstalled=false});
  }

  function scheduleImportedHydration(){
    [0,800,2500,8000].forEach(function(delay){
      setTimeout(function(){installHydrateListener();hydrateDhahawiImport()},delay);
    });
  }

  function tenantDirectory(){
    return rows('tenantDirectoryV202').filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)}).map(function(entry){
      return {
        property:String(entry.property||entry.propertyName||''),unit:String(entry.unit||entry.unitName||''),tenant:String(entry.tenant||entry.tenantName||''),
        contractId:String(entry.contractId||entry.contract_id||''),contractNo:String(entry.contractNo||entry.contract_no||''),source:String(entry.source||'')
      };
    });
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
    const status=normalized(value).replace(/[\u064B-\u065F\u0670]/g,'');
    if(/(?:^|\s)(?:غير|ليس)\s+(?:موقع|منتهي|منتهية|ملغي|ملغى|معتمد|جاهز)(?:\s|$)/.test(status)||
      /(?:^|\s)لم\s+(?:يتم\s+)?(?:التوقيع|الاعتماد|الالغاء|الانتهاء|ينته|يلغ|يعتمد|يوقع)(?:\s|$)/.test(status))return status;
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
      contractRent:faceRent==null?'':faceRent,
      deposit:entry.deposit!=null?entry.deposit:(entry.insurance==null?'':entry.insurance),
      advance:entry.advance==null?'':entry.advance,
      cleaning:entry.cleaning!=null?entry.cleaning:(entry.cleaningFees==null?'':entry.cleaningFees),
      status:contractStatus(entry.status),start_date:String(entry.start_date||entry.startDate||'').slice(0,10),
      end_date:String(entry.end_date||entry.endDate||'').slice(0,10),source:String(entry.source||source),_explicitId:Boolean(explicitId),_originLayer:source
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

  function compatibleContractIdentity(previous,next){
    return ['property','unit','tenant','contract_no'].every(function(field){
      const left=normalized(previous?.[field]);
      const right=normalized(next?.[field]);
      return !left||!right||left===right;
    });
  }

  function contracts(){
    let local=[];
    try{
      const loaded=typeof localContractsV55==='function'?localContractsV55():[];
      local=Array.isArray(loaded)?loaded:[];
    }catch(_){local=[]}
    const merged=new Map();
    function addContract(contract){
      if(!contract)return;
      const key=contractMergeKey(contract);
      const group=merged.get(key);
      if(!group){merged.set(key,[contract]);return}
      if(!key.startsWith('id:')){
        group[0]=mergedContract(group[0],contract);
        return;
      }
      if(group.length===1&&group[0]._originLayer!==contract._originLayer&&compatibleContractIdentity(group[0],contract)){
        group[0]=mergedContract(group[0],contract);
        return;
      }
      group.push(contract);
    }
    local.forEach(function(entry,index){
      const contract=normalizeContract(entry,'local-v55',index);
      addContract(contract);
    });
    rows('contractsV202').forEach(function(entry,index){
      const contract=normalizeContract(entry,'db-v202',index);
      addContract(contract);
    });
    return Array.from(merged.entries()).flatMap(function(pair){
      const key=pair[0],group=pair[1];
      if(!key.startsWith('id:')||group.length<2)return group;
      const conflict=Object.freeze(group.map(function(contract){
        return Object.freeze({
          property:String(contract?.property||''),unit:String(contract?.unit||''),tenant:String(contract?.tenant||''),
          contractNo:String(contract?.contract_no||''),source:String(contract?.source||''),originLayer:String(contract?._originLayer||'')
        });
      }));
      return group.map(function(contract){return {...contract,_duplicateExplicitId:contractId(contract),_duplicateExplicitContracts:conflict}});
    });
  }

  function contractId(contract){return String(contract?.id||contract?.contract_no||'').trim()}

  function validPeriod(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value||''))}

  function contractDateIssue(contract){
    const start=String(contract?.start_date||'').slice(0,10);
    const end=String(contract?.end_date||'').slice(0,10);
    if(!start||!end)return 'missing_contract_dates';
    if(!validDate(start)||!validDate(end))return 'invalid_contract_dates';
    return start>end?'reversed_contract_dates':'';
  }

  function contractCoversPeriod(contract,period){
    if(!validPeriod(period)||contractDateIssue(contract))return false;
    const start=String(contract.start_date).slice(0,7);
    const end=String(contract.end_date).slice(0,7);
    return period>=start&&period<=end;
  }

  function signedContract(contract){return contractStatus(contract?.status)==='signed'}

  function billableContractStatus(contract){
    const status=contractStatus(contract?.status);
    return status==='signed'||status==='expired';
  }

  function contractDiagnostic(contract,code,period){
    return {
      code,period:String(period||''),contractId:contractId(contract),contractNo:String(contract?.contract_no||''),
      property:String(contract?.property||''),unit:String(contract?.unit||''),tenant:String(contract?.tenant||''),
      startDate:String(contract?.start_date||''),endDate:String(contract?.end_date||'')
    };
  }

  function selectedContractRentValue(contract){
    const current=contract?.rent;
    return current!=null&&String(current).trim()!==''?current:contract?.contractRent;
  }

  function contractRentIssue(contract){
    const value=selectedContractRentValue(contract);
    if(value==null||String(value).trim()==='')return 'missing_contract_rent';
    const canonical=latinDigits(value).trim().replace(/٫/g,'.').replace(/[,٬]/g,'');
    const decimal=canonical.match(/\.(\d+)$/);
    if(decimal&&decimal[1].length>3)return 'excessive_contract_rent_precision';
    const numeric=Number(canonical);
    if(Number.isFinite(numeric)&&compareMoney(numeric,0)<=0)return 'non_positive_contract_rent';
    const amount=strictMoney(value);
    if(!Number.isFinite(amount))return 'invalid_contract_rent';
    return compareMoney(amount,0)<=0?'non_positive_contract_rent':'';
  }

  function billableContractsForPeriod(sourceContracts,period){
    const diagnostics={conflicts:[],invalidContracts:[],invalidIdentityContracts:[]};
    if(!validPeriod(period))return {contracts:[],diagnostics};
    const byUnit=new Map();
    const reportedDuplicateIds=new Set();
    (Array.isArray(sourceContracts)?sourceContracts:[]).forEach(function(contract){
      if(contract?._duplicateExplicitId){
        const duplicateKey=normalized(contract._duplicateExplicitId);
        if(!reportedDuplicateIds.has(duplicateKey)){
          reportedDuplicateIds.add(duplicateKey);
          diagnostics.invalidIdentityContracts.push({
            code:'duplicate_contract_id',period:String(period),contractId:String(contract._duplicateExplicitId),
            property:String(contract?.property||''),unit:String(contract?.unit||''),tenant:String(contract?.tenant||''),
            conflicts:Array.from(contract._duplicateExplicitContracts||[])
          });
        }
        return;
      }
      if(!billableContractStatus(contract))return;
      const dateIssue=contractDateIssue(contract);
      if(dateIssue){diagnostics.invalidContracts.push(contractDiagnostic(contract,dateIssue,period));return}
      if(!contractCoversPeriod(contract,period))return;
      const rentIssue=contractRentIssue(contract);
      if(rentIssue){diagnostics.invalidContracts.push(contractDiagnostic(contract,rentIssue,period));return}
      if(!contractId(contract)||!normalized(contract?.unit)||!normalized(contract?.tenant)){
        diagnostics.invalidIdentityContracts.push(contractDiagnostic(contract,'incomplete_contract_identity',period));
        return;
      }
      const unitKey=normalized(contract.unit);
      if(!byUnit.has(unitKey))byUnit.set(unitKey,[]);
      byUnit.get(unitKey).push(contract);
    });
    const selected=[];
    byUnit.forEach(function(unitContracts){
      if(unitContracts.length===1){selected.push(unitContracts[0]);return}
      diagnostics.conflicts.push({
        code:'overlapping_contracts',period:String(period),property:String(unitContracts[0]?.property||''),unit:String(unitContracts[0]?.unit||''),
        contractIds:unitContracts.map(contractId),contractNumbers:unitContracts.map(function(contract){return String(contract?.contract_no||'')}),
        tenants:unitContracts.map(function(contract){return String(contract?.tenant||'')})
      });
    });
    return {contracts:selected,diagnostics};
  }

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

  function collectionAmountInput(value){
    return String(value==null?'':value).replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g,'').trim().replace(/\s*د\s*\.\s*ك\s*$/,'').trim();
  }

  function ledgerCandidates(){
    const buckets=collectionRowsByReceipt();
    return rawLedgerRecords().map(function(entry){
      if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
      const normalizedEntry={
        ...entry,property:String(entry.property||entry.propertyName||''),unit:String(entry.unit||entry.unitName||''),
        tenant:String(entry.tenant||entry.tenantName||''),contractId:String(entry.contractId||entry.contract_id||''),
        contractNo:String(entry.contractNo||entry.contract_no||''),paidAt:String(entry.paidAt||entry.paymentDate||''),
        method:String(entry.method||entry.paymentMethod||'')
      };
      const receiptKey=normalized(normalizedEntry.receiptNo);
      const matches=receiptKey?buckets.get(receiptKey):null;
      if(matches?.length===1){
        const row=matches[0];
        if(normalized(row?.[1])!==normalized(normalizedEntry.tenant))return null;
        const ledgerAmount=normalizedEntry.paid!=null&&String(normalizedEntry.paid).trim()!==''?normalizedEntry.paid:collectionAmountInput(row?.[2]);
        return {...normalizedEntry,receiptNo:String(row?.[0]||normalizedEntry.receiptNo||''),tenant:String(row?.[1]||normalizedEntry.tenant||''),paid:ledgerAmount,status:String(row?.[3]||normalizedEntry.status||'')};
      }
      return importedLedger(normalizedEntry)?normalizedEntry:null;
    }).filter(Boolean);
  }

  function paymentAmountIssue(entry){
    const raw=entry?.paid;
    if(raw==null||String(raw).trim()==='')return 'missing_payment_amount';
    const canonical=latinDigits(raw).trim().replace(/٫/g,'.');
    const decimal=canonical.replace(/[,٬]/g,'').match(/\.(\d+)$/);
    if(decimal&&decimal[1].length>3)return 'excessive_payment_precision';
    const numeric=Number(canonical.replace(/[,٬]/g,''));
    if(Number.isFinite(numeric)&&compareMoney(numeric,0)<=0)return 'non_positive_payment_amount';
    const amount=strictMoney(raw);
    if(!Number.isFinite(amount))return 'invalid_payment_amount';
    return compareMoney(amount,0)>0?'':'non_positive_payment_amount';
  }

  function paymentAmount(entry){
    const amount=strictMoney(entry?.paid);
    return Number.isFinite(amount)?amount:Number.NaN;
  }

  function ledgerEntryInScope(entry,name,period){
    return (!name||normalized(entry?.property||entry?.propertyName)===normalized(name))&&
      (!period||String(entry?.period||'')===String(period));
  }

  function duplicateReceiptDiagnostic(receiptKey,entries,count){
    return {
      code:'duplicate_receipt',receiptNo:String(entries[0]?.receiptNo||receiptKey),count:Number(count)||entries.length,
      ids:entries.map(function(entry){return String(entry?.id||'')}),
      properties:Array.from(new Set(entries.map(function(entry){return String(entry?.property||entry?.propertyName||'')}))).filter(Boolean),
      periods:Array.from(new Set(entries.map(function(entry){return String(entry?.period||'')}))).filter(Boolean)
    };
  }

  function invalidPaymentDiagnostic(entry,code){
    return {
      code,receiptNo:String(entry?.receiptNo||''),contractId:String(entry?.contractId||entry?.contract_id||''),
      property:String(entry?.property||entry?.propertyName||''),unit:String(entry?.unit||entry?.unitName||''),
      tenant:String(entry?.tenant||entry?.tenantName||''),period:String(entry?.period||''),status:String(entry?.status||''),
      rawAmount:String(entry?.paid==null?'':entry.paid)
    };
  }

  function ledgerSelection(name,period){
    const candidates=ledgerCandidates();
    const collectionBuckets=collectionRowsByReceipt();
    const receiptGroups=new Map();
    candidates.forEach(function(entry){
      const key=normalized(entry?.receiptNo);
      if(!key)return;
      if(!receiptGroups.has(key))receiptGroups.set(key,[]);
      receiptGroups.get(key).push(entry);
    });
    const duplicateKeys=new Set();
    const duplicateReceipts=[];
    receiptGroups.forEach(function(entries,key){
      if(entries.length<2)return;
      duplicateKeys.add(key);
      if(entries.some(function(entry){return ledgerEntryInScope(entry,name,period)}))duplicateReceipts.push(duplicateReceiptDiagnostic(key,entries));
    });
    collectionBuckets.forEach(function(collectionRows,key){
      if(collectionRows.length<2)return;
      duplicateKeys.add(key);
      if(duplicateReceipts.some(function(entry){return normalized(entry.receiptNo)===key}))return;
      let entries=rawLedgerRecords().filter(function(entry){return normalized(entry?.receiptNo)===key});
      if(!entries.length){
        entries=collectionRows.map(function(row){
          return {
            receiptNo:String(row?.[0]||''),tenant:String(row?.[1]||''),paid:row?.[2],status:String(row?.[3]||''),
            property:String(row?.[4]||uniquePropertyForTenant(row?.[1])||''),paidAt:String(row?.[5]||''),
            unit:String(row?.[6]||''),period:String(row?.[8]||'')
          };
        });
      }
      if(entries.some(function(entry){return ledgerEntryInScope(entry,name,period)})){
        duplicateReceipts.push(duplicateReceiptDiagnostic(key,entries,collectionRows.length));
      }
    });
    const invalidPayments=[];
    const records=candidates.filter(function(entry){
      if(duplicateKeys.has(normalized(entry?.receiptNo)))return false;
      const issue=paymentAmountIssue(entry);
      if(issue){
        if(ledgerEntryInScope(entry,name,period))invalidPayments.push(invalidPaymentDiagnostic(entry,issue));
        return false;
      }
      return true;
    });
    return {records,diagnostics:{duplicateReceipts,invalidPayments}};
  }

  function ledgerRecords(){
    return ledgerSelection().records;
  }

  function ledgerFor(name){
    const key=normalized(name);
    return ledgerRecords().filter(function(entry){return normalized(entry?.property||entry?.propertyName)===key});
  }

  function ledgerRow(entry){
    return [
      entry?.receiptNo||'—',entry?.tenant||'—',money(entry?.paid),entry?.status||'',
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
    const collectionBuckets=collectionRowsByReceipt();
    const ledgerReceipts=new Set(ledgerCandidates().map(function(entry){return normalized(entry?.receiptNo)}).filter(Boolean));
    const legacy=rows('collections').filter(function(row){
      if((collectionBuckets.get(normalized(row?.[0]))||[]).length>1)return false;
      if(ledgerReceipts.has(normalized(row?.[0])))return false;
      const explicit=normalized(row?.[4]);
      if(explicit)return explicit===key;
      return uniquePropertyForTenant(row?.[1])===key;
    });
    return linkedLedger.map(ledgerRow).concat(legacy);
  }

  function paymentState(status){
    const value=normalized(status).replace(/[\u064B-\u065F\u0670]/g,'');
    const settlementStem=/(?:دفع|مدفوع|سداد|سدد|قبض|مقبوض|تحصيل|محصل|اعتماد|اعتمد|استلام|مستلم)/;
    if(['غير مدفوع','غير مسدد','لم يسدد','لم يتم السداد','غير مقبوض','لم يقبض','غير محصل','لم يحصل','لم يتم التحصيل','غير معتمد','لم يعتمد'].includes(value)||
      /^(?:غير|ليس)\s+(?:مدفوع|مسدد|مقبوض|محصل|معتمد)/.test(value)||
      (/^(?:غير|ليس|لم)(?:\s|$)/.test(value)&&settlementStem.test(value))||
      (/^(?:قيد|بانتظار|(?:في\s+)?انتظار|عدم|تحت)(?:\s|$)/.test(value)&&settlementStem.test(value)))return 'pending';
    if(['rejected','cancelled','canceled','void','voided','refunded','reversed','مرفوض','ملغي','ملغى','مسترد','مرتجع'].includes(value)||
      value.includes('مرفوض')||value.includes('ملغ')||value.includes('مسترد')||value.includes('مرتجع'))return 'ignored';
    if(['paid','partial','settled','received','approved','مدفوع','جزئي','جزئيا','مستلم','معتمد','تم الدفع','تم السداد','تم القبض','تم الاستلام','مسدد','مقبوض','تم التحصيل','محصل'].includes(value)||
      value.includes('مدفوع جزئ')||value.includes('تم الدفع')||value.includes('تم السداد')||value.includes('مسدد')||value.includes('تم القبض')||value.includes('مقبوض')||value.includes('تم الاستلام')||value.includes('تم التحصيل')||
      value.includes('معتمد')||/^(?:تم|جرى)\s+(?:ال)?اعتماد(?:\s|$)/.test(value))return 'settled';
    return 'pending';
  }

  function settledPayment(status){return paymentState(status)==='settled'}

  function receiptAvailableForStatus(status){return paymentState(status)==='settled'}

  function paymentStatusAllowedForSave(status){return paymentState(status)==='settled'}

  function rentStatements(){
    return rows('rentStatementsV202').filter(function(entry){return entry&&typeof entry==='object'&&!Array.isArray(entry)});
  }

  function officialStatementFor(property,period){
    return rentStatements().find(function(entry){
      return normalized(entry.property||entry.propertyName)===normalized(property)&&String(entry.period||'')===String(period||'');
    })||null;
  }

  function latestOfficialPeriod(property){
    const periods=rentStatements().filter(function(entry){
      return normalized(entry.property||entry.propertyName)===normalized(property)&&validPeriod(entry.period);
    }).map(function(entry){return String(entry.period)}).sort();
    return periods.length?periods[periods.length-1]:'';
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
    const billing=billableContractsForPeriod(propertyContracts,period);
    const activeContracts=billing.contracts;
    const tenantNames=new Set(activeContracts.map(function(contract){return normalized(contract?.tenant)}).filter(Boolean));
    const linkedTenants=rows('tenants').filter(function(row){return tenantNames.has(normalized(row?.[0]))});
    const propertyLedger=ledgerFor(name);
    const propertyCollections=collectionsFor(name);
    const expenses=rows('expenses').filter(function(row){return normalized(row?.[0])===normalized(name)});
    const maintenance=maintenanceFor(name);
    const units=numberFrom(property?.[2]);
    const occupiedUnits=new Set(activeContracts.map(function(contract){return normalized(contract?.unit)}).filter(Boolean)).size;
    const income=round3(numberFrom(property?.[3]));
    const settledCollections=propertyCollections.filter(function(row){return settledPayment(row?.[3])});
    const collected=sumMoney(settledCollections.map(function(row){return round3(numberFrom(row?.[2]))}));
    const expenseTotal=sumMoney(expenses.map(function(row){return round3(numberFrom(row?.[2]))}));
    const official=officialStatementFor(name,period);
    const due=sumMoney(activeContracts.map(function(contract){return remainingForPeriod(name,contract,period)}));
    const openMaintenance=maintenance.filter(function(row){
      const status=normalized(row?.[3]);
      return !status.includes('مكتمل')&&!status.includes('مغلق')&&!status.includes('منجز');
    });
    return {
      property,propertyContracts,activeContracts,billingDiagnostics:billing.diagnostics,linkedTenants,propertyLedger,propertyCollections,settledCollections,expenses,maintenance,official,
      openMaintenance,units,occupiedUnits,income,collected,expenseTotal,due,net:subtractMoney(income,expenseTotal)
    };
  }

  function statusLabel(value){return STATUS_LABELS[value]||value||'غير محدد'}

  function healthFor(context){
    if(!context.activeContracts.length)return {tone:'link',label:'يحتاج ربط عقد',detail:'ابدأ بعقد لربط المستأجر والتحصيل بالعقار'};
    if(compareMoney(context.due,0)>0)return {tone:'attention',label:'يحتاج تحصيل',detail:'يوجد إيجار مستحق مرتبط بالعقار'};
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
    return '<div class="v202-overview-grid">'+
      '<section class="v202-overview-main">'+
        '<div class="v202-section-head"><div><p>رحلة العقار</p><h3>من العقد إلى الكشف</h3></div><span class="v202-health is-'+health.tone+'">'+health.label+'</span></div>'+journey(context)+
        '<div class="v202-next-action"><div><span>الإجراء التالي</span><strong>'+escapeHtml(health.detail)+'</strong></div><button type="button" data-v202-action="'+(context.activeContracts.length?'payment':'contract')+'">'+(context.activeContracts.length?'تسجيل إيجار':'إبرام عقد')+' '+icon('arrow')+'</button></div>'+
      '</section>'+
      '<aside class="v202-property-facts"><h3>ملخص العقار</h3><dl><div><dt>المالك</dt><dd>'+escapeHtml(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير محدد')+'</dd></div><div><dt>الوحدات المشغولة</dt><dd>'+escapeHtml(occupied)+'</dd></div><div><dt>عقود مرتبطة</dt><dd>'+context.propertyContracts.length+'</dd></div><div><dt>طلبات مفتوحة</dt><dd>'+context.openMaintenance.length+'</dd></div></dl></aside>'+
    '</div>';
  }

  function contractsPanel(context){
    if(!context.propertyContracts.length)return emptyState('لا توجد عقود مرتبطة','إبرام عقد من هنا يربطه بالعقار تلقائياً.','contract','إبرام عقد');
    return '<div class="v202-card-list">'+context.propertyContracts.map(function(contract){
      return '<article class="v202-contract-card"><div class="v202-contract-icon">'+icon('contract')+'</div><div><span>'+escapeHtml(contract.contract_no||'عقد بدون رقم')+'</span><strong>'+escapeHtml(contract.tenant||'مستأجر غير محدد')+'</strong><small>'+escapeHtml(contract.unit||'وحدة غير محددة')+' • '+escapeHtml(contract.rent||'إيجار غير محدد')+'</small></div><em class="is-'+escapeHtml(contract.status||'draft')+'">'+escapeHtml(statusLabel(contract.status))+'</em></article>';
    }).join('')+'</div><div class="v202-panel-footer"><button type="button" data-v202-action="contract">عقد جديد '+icon('arrow')+'</button></div>';
  }

  function collectionsPanel(context){
    if(!context.propertyCollections.length)return emptyState('لا توجد عمليات تحصيل مرتبطة','سجّل إيجاراً من ملف العقار ليظهر هنا وفي الكشف.','payment','تسجيل إيجار');
    return '<div class="v202-ledger" role="region" aria-label="تحصيلات العقار"><table><thead><tr><th>الإيصال</th><th>المستأجر</th><th>المبلغ</th><th>الحالة</th><th>التاريخ</th><th>إجراء</th></tr></thead><tbody>'+context.propertyCollections.map(function(row,index){
      const receiptAction=receiptAvailableForStatus(row?.[3])?'<button type="button" data-v202-receipt-index="'+index+'">فتح الوصل</button>':'<span>بانتظار الاعتماد</span>';
      return '<tr><td data-label="الإيصال">'+escapeHtml(row?.[0]||'—')+'</td><td data-label="المستأجر">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ">'+escapeHtml(row?.[2]||'—')+'</td><td data-label="الحالة"><span class="v202-status">'+escapeHtml(row?.[3]||'—')+'</span></td><td data-label="التاريخ">'+localDate(row?.[5])+'</td><td data-label="إجراء">'+receiptAction+'</td></tr>';
    }).join('')+'</tbody></table></div><div class="v202-panel-footer"><button type="button" data-v202-action="payment">تسجيل إيجار '+icon('arrow')+'</button></div>';
  }

  function expensesPanel(context){
    if(!context.expenses.length)return emptyState('لا توجد مصروفات مرتبطة','المصروفات التي تسجّل باسم العقار ستظهر هنا وفي كشف الإيجار.','','');
    return '<div class="v202-ledger" role="region" aria-label="مصروفات العقار"><table><thead><tr><th>الفئة</th><th>المبلغ</th><th>المورد</th></tr></thead><tbody>'+context.expenses.map(function(row){
      return '<tr><td data-label="الفئة">'+escapeHtml(row?.[1]||'—')+'</td><td data-label="المبلغ">'+escapeHtml(row?.[2]||'—')+'</td><td data-label="المورد">'+escapeHtml(row?.[3]||'—')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }

  function workspaceMarkup(context){
    const health=healthFor(context);
    return '<section class="v202-workspace" role="dialog" aria-modal="true" aria-labelledby="v202PropertyTitle" aria-describedby="v202PropertyDescription">'+
      '<header class="v202-workspace-head"><div class="v202-property-identity"><span class="v202-property-mark">'+icon('building')+'</span><div><p>ملف العقار التشغيلي</p><h2 id="v202PropertyTitle">'+escapeHtml(activeProperty)+'</h2><span id="v202PropertyDescription">العقد والتحصيل والوصولات والكشف في مكان واحد.</span></div></div><div class="v202-head-side"><span class="v202-health is-'+health.tone+'">'+health.label+'</span><button type="button" class="v202-icon-button" data-v202-close aria-label="إغلاق ملف العقار">'+icon('close')+'</button></div></header>'+
      '<div class="v202-property-kpis">'+
        kpi('الوحدات',String(context.units),'المسجلة في العقار')+
        kpi('الإيراد المسجل',money(context.income),'حسب بيانات العقار','gold')+
        kpi('المقبوضات المرتبطة',money(context.collected),context.settledCollections.length+' دفعة معتمدة','good')+
        kpi('الإيجار المستحق',money(context.due),compareMoney(context.due,0)>0?'يحتاج متابعة':'لا يوجد مستحق مرتبط',compareMoney(context.due,0)>0?'attention':'')+
        kpi('المصروفات',money(context.expenseTotal),context.expenses.length+' بند مسجل')+
        kpi('الصافي التشغيلي',money(context.net),'الإيراد ناقص المصروفات','gold')+
      '</div>'+
      '<nav class="v202-actions" aria-label="إجراءات العقار">'+
        '<button type="button" data-v202-action="contract">'+icon('contract')+'<span><strong>إبرام عقد</strong><small>إنشاء وربط العقد</small></span></button>'+
        '<button type="button" data-v202-action="payment">'+icon('wallet')+'<span><strong>تسجيل إيجار</strong><small>تحصيل وإصدار وصل</small></span></button>'+
        '<button type="button" data-v202-action="statement">'+icon('chart')+'<span><strong>كشف الإيجار</strong><small>كشف تفصيلي PDF</small></span></button>'+
        '<button type="button" data-v202-action="profile">'+icon('building')+'<span><strong>الملف الكامل</strong><small>العقار 360°</small></span></button>'+
      '</nav>'+
      '<div class="v202-tabs" role="tablist" aria-label="تفاصيل العقار">'+
        '<button type="button" id="v202TabOverview" role="tab" aria-controls="v202Panel" data-v202-tab="overview">نظرة عامة</button>'+
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
    if(activeTab==='contracts')panel.innerHTML=contractsPanel(context);
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
    try{document.dispatchEvent(new CustomEvent('aqari:v202:workspace-rendered',{detail:{property:activeProperty}}))}catch(_){ }
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
    try{sessionStorage.setItem('aqari_v202_property',activeProperty)}catch(_){ }
    renderWorkspace();
    const overlay=document.getElementById('v202PropertyWorkspace');
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    syncLayerState();
    requestAnimationFrame(function(){overlay.querySelector('[data-v203-action],[data-v202-action]')?.focus()});
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
    if(action==='payment')return openPayment(trigger);
    if(action==='statement'){
      if(typeof window.AQARI_DHAHAWI?.open==='function')return window.AQARI_DHAHAWI.open({property:activeProperty,period:currentPeriod(),trigger:trigger});
      return openStatementDocument(undefined,trigger);
    }
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
    const amount=strictMoney(selectedContractRentValue(contract));
    return Number.isFinite(amount)?amount:0;
  }

  function legacyPaymentKey(property,contractOrId,unit,period){
    const id=typeof contractOrId==='object'?contractId(contractOrId):String(contractOrId||'');
    const resolvedUnit=typeof contractOrId==='object'?contractOrId?.unit:unit;
    return [normalized(property),'contract:'+normalized(id),'unit:'+normalized(resolvedUnit),String(period||'')].join('|');
  }

  function paymentKey(property,contractOrId,unit,period,tenant){
    const id=typeof contractOrId==='object'?contractId(contractOrId):String(contractOrId||'');
    const resolvedUnit=typeof contractOrId==='object'?contractOrId?.unit:unit;
    const resolvedTenant=typeof contractOrId==='object'?contractOrId?.tenant:tenant;
    return [normalized(property),'contract:'+normalized(id),'unit:'+normalized(resolvedUnit),'tenant:'+normalized(resolvedTenant),String(period||'')].join('|');
  }

  function paymentContracts(context,period){
    return context?billableContractsForPeriod(context.propertyContracts,validPeriod(period)?period:currentPeriod()).contracts:[];
  }

  function paymentContractOptions(contracts){
    return '<option value="">اختر العقد والوحدة</option>'+(Array.isArray(contracts)?contracts:[]).map(function(contract){
      return '<option value="'+escapeHtml(contractId(contract))+'">'+escapeHtml(contract.tenant)+' — '+escapeHtml(contract.unit)+' — '+escapeHtml(contract.contract_no||contractId(contract))+'</option>';
    }).join('');
  }

  function selectedPaymentContract(period){
    const selected=document.getElementById('v202PaymentContract')?.value||'';
    const context=contextFor(activeProperty);
    const selectedPeriod=validPeriod(period)?period:(document.getElementById('v202PaymentPeriod')?.value||currentPeriod());
    return context?paymentContracts(context,selectedPeriod).find(function(contract){return contractId(contract)===selected}):null;
  }

  function rebuildPaymentContracts(period,preferredId){
    const select=document.getElementById('v202PaymentContract');
    const context=contextFor(activeProperty);
    if(!select||!context)return [];
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const available=paymentContracts(context,selectedPeriod);
    const wanted=String(preferredId==null?select.value:preferredId);
    select.innerHTML=paymentContractOptions(available);
    select.disabled=!available.length;
    select.value=available.some(function(contract){return contractId(contract)===wanted})?wanted:'';
    const warning=document.getElementById('v202PaymentContractWarning');
    if(warning){
      warning.hidden=Boolean(available.length);
      warning.textContent=available.length?'':'لا يوجد عقد قابل للتحصيل في الشهر المحدد. راجع حالة العقد ومدته وبياناته.';
    }
    return available;
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

  function paymentMatchesContract(entry,contract,property,period){
    if(!entry||!contract||!validPeriod(period))return false;
    const expected={
      property:normalized(property),period:String(period),contractId:normalized(contractId(contract)),
      unit:normalized(contract?.unit),tenant:normalized(contract?.tenant)
    };
    if(!expected.property||!expected.contractId||!expected.unit||!expected.tenant)return false;
    const actual={
      property:normalized(entry.property||entry.propertyName),period:String(entry.period||''),
      contractId:normalized(entry.contractId||entry.contract_id),unit:normalized(entry.unit||entry.unitName),
      tenant:normalized(entry.tenant||entry.tenantName)
    };
    const exactTuple=actual.property===expected.property&&actual.period===expected.period&&actual.contractId===expected.contractId&&
      actual.unit===expected.unit&&actual.tenant===expected.tenant;
    const suppliedKey=String(entry.paymentKey||'').trim();
    if(!suppliedKey)return exactTuple;
    const canonical=paymentKey(property,contract,contract?.unit,period);
    if(suppliedKey===canonical){
      return Object.keys(actual).every(function(field){return !actual[field]||actual[field]===expected[field]});
    }
    return suppliedKey===legacyPaymentKey(property,contract,contract?.unit,period)&&exactTuple;
  }

  function paidForPeriod(property,contract,period){
    return sumMoney(ledgerRecords().filter(function(entry){
      return paymentMatchesContract(entry,contract,property,period)&&paymentState(entry?.status)==='settled';
    }).map(paymentAmount));
  }

  function remainingForPeriod(property,contract,period){
    const due=contractRent(contract);
    if(compareMoney(due,0)<=0)return 0;
    return nonNegativeMoney(subtractMoney(due,paidForPeriod(property,contract,period)));
  }

  function paymentDialogMarkup(context,period){
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const available=paymentContracts(context,selectedPeriod);
    return '<section class="v202-dialog v202-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="v202PaymentTitle" aria-describedby="v202PaymentDescription">'+
      '<header><div><p>تحصيل العقار</p><h2 id="v202PaymentTitle">تسجيل إيجار</h2><span id="v202PaymentDescription">'+escapeHtml(activeProperty)+' — وبعد الحفظ يجهز الوصل مباشرة.</span></div><button type="button" class="v202-icon-button" data-v202-payment-close aria-label="إغلاق">'+icon('close')+'</button></header>'+
      '<div id="v202PaymentContractWarning" class="v202-inline-note is-warning" '+(available.length?'hidden':'')+'>'+(!available.length?icon('alert')+' لا يوجد عقد قابل للتحصيل في الشهر المحدد. راجع حالة العقد ومدته وبياناته.':'')+'</div>'+
      '<form class="v202-form" id="v202PaymentForm">'+
        '<label><span>العقار</span><input value="'+escapeHtml(activeProperty)+'" disabled></label>'+
        '<label><span>العقد / الوحدة</span><select id="v202PaymentContract" required '+(available.length?'':'disabled')+'>'+paymentContractOptions(available)+'</select></label>'+
        '<label><span>رقم الوصل</span><input id="v202PaymentNumber" value="'+nextReceiptNumber()+'" required></label>'+
        '<label><span>المبلغ (د.ك)</span><input id="v202PaymentAmount" inputmode="decimal" autocomplete="off" placeholder="0.000" required></label>'+
        '<label><span>شهر الإيجار</span><input id="v202PaymentPeriod" type="month" value="'+escapeHtml(selectedPeriod)+'" required></label>'+
        '<label><span>تاريخ السداد</span><input id="v202PaymentDate" type="date" value="'+todayValue()+'" required></label>'+
        '<label><span>طريقة السداد</span><select id="v202PaymentMethod"><option>كي نت</option><option>تحويل بنكي</option><option>نقدي</option><option>أخرى</option></select></label>'+
        '<label><span>حالة السداد</span><select id="v202PaymentStatus"><option>مدفوع</option><option>جزئي</option></select></label>'+
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

  function openPayment(trigger,period,preferredId){
    const context=contextFor(activeProperty);
    if(!context)return false;
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    ensurePaymentDialog();
    paymentTrigger=trigger||document.activeElement;
    const overlay=document.getElementById('v202PaymentDialog');
    overlay.innerHTML=paymentDialogMarkup(context,selectedPeriod);
    rebuildPaymentContracts(selectedPeriod,preferredId);
    overlay.classList.add('on');
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden','false');
    suspendLayer('v202PropertyWorkspace',true);
    syncLayerState();
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
  }

  function updatePaymentBalance(){
    const period=document.getElementById('v202PaymentPeriod')?.value||currentPeriod();
    const contract=selectedPaymentContract(period);
    const due=contractRent(contract);
    const paid=contract?paidForPeriod(activeProperty,contract,period):0;
    const remaining=compareMoney(due,0)>0?nonNegativeMoney(subtractMoney(due,paid)):0;
    const amount=document.getElementById('v202PaymentAmount');
    const balance=document.getElementById('v202PaymentBalance');
    const covered=Boolean(contract&&contractCoversPeriod(contract,period));
    if(amount&&contract&&!covered)amount.value='';
    else if(amount&&contract&&!amount.value&&compareMoney(remaining,0)>0)amount.value=String(remaining);
    if(balance){
      balance.textContent=!contract?'اختر العقد والوحدة لحساب المتبقي.':compareMoney(due,0)>0?
        (covered?'المستحق '+money(due)+' • المدفوع '+money(paid)+' • المتبقي '+money(remaining):'الشهر المحدد خارج مدة هذا العقد.'):
        'قيمة الإيجار غير محددة في العقد؛ لا يمكن إصدار وصل قبل تصحيحها.';
      balance.classList.toggle('is-settled',Boolean(contract&&covered&&compareMoney(due,0)>0&&compareMoney(remaining,0)===0));
    }
    return {contract,due,paid,remaining};
  }

  function savePayment(event){
    event.preventDefault();
    const period=document.getElementById('v202PaymentPeriod')?.value||currentPeriod();
    const contract=selectedPaymentContract(period);
    const tenant=String(contract?.tenant||'').trim();
    const receipt=document.getElementById('v202PaymentNumber')?.value.trim();
    const amount=strictMoney(document.getElementById('v202PaymentAmount')?.value);
    const status=document.getElementById('v202PaymentStatus')?.value||'مدفوع';
    const date=document.getElementById('v202PaymentDate')?.value||todayValue();
    const method=document.getElementById('v202PaymentMethod')?.value||'غير محدد';
    const note=document.getElementById('v202PaymentNote')?.value.trim()||'';
    const error=document.getElementById('v202PaymentError');
    const context=contextFor(activeProperty);
    const exactContract=Boolean(context&&contract&&paymentContracts(context,period).some(function(candidate){
      return contractId(candidate)===contractId(contract)&&normalized(candidate.unit)===normalized(contract.unit)&&normalized(candidate.tenant)===normalized(contract.tenant);
    }));
    if(!exactContract||!contract||!tenant||!contract.unit){
      if(error)error.textContent='اختر عقداً موقّعاً سارياً مربوطاً بمستأجر ووحدة.';
      return;
    }
    if(!receipt||!Number.isFinite(amount)||compareMoney(amount,0)<=0){
      if(error)error.textContent='أدخل رقم الوصل ومبلغاً صحيحاً أكبر من صفر وبحد أقصى 3 منازل عشرية.';
      return;
    }
    if(!paymentStatusAllowedForSave(status)){
      if(error)error.textContent='لا يمكن إصدار وصل لحالة غير معتمدة. اعتمد الدفعة أولاً.';
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
    if(compareMoney(due,0)<=0){
      if(error)error.textContent='قيمة الإيجار غير محددة في العقد. صحح العقد أولاً.';
      return;
    }
    const balance=remainingForPeriod(activeProperty,contract,period);
    if(compareMoney(balance,0)>0&&compareMoney(amount,balance)>0){
      if(error)error.textContent='المبلغ أكبر من المتبقي '+money(balance)+'. راجع المبلغ.';
      return;
    }
    if(compareMoney(balance,0)===0){
      if(error)error.textContent='إيجار هذا الشهر مسدد بالكامل لهذا المستأجر.';
      return;
    }
    const finalStatus=compareMoney(amount,balance)<0?'جزئي':'مدفوع';
    const record=[receipt,tenant,money(amount),finalStatus,activeProperty,date,contract.unit,note,period,method];
    const data=appData();
    const previous={};
    ['collections','rentLedgerV202','audit'].forEach(function(key){
      previous[key]={owned:Object.prototype.hasOwnProperty.call(data,key),value:data[key]};
    });
    const ledgerEntry={
      id:'rent-'+receipt,receiptNo:receipt,property:activeProperty,unit:contract.unit,tenant,
      contractId:contractId(contract),contractNo:contract.contract_no||'',period,due,paid:amount,
      balance:settledPayment(finalStatus)?nonNegativeMoney(subtractMoney(balance,amount)):balance,paidAt:date,
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
    if(receiptAvailableForStatus(finalStatus))openReceiptDocument(record,returnTrigger);
    else if(returnTrigger instanceof HTMLElement&&returnTrigger.isConnected)returnTrigger.focus();
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

  function paymentDiagnostic(entry,code){
    const amount=paymentAmount(entry);
    return {
      code,receiptNo:String(entry?.receiptNo||''),contractId:String(entry?.contractId||entry?.contract_id||''),
      property:String(entry?.property||entry?.propertyName||''),unit:String(entry?.unit||entry?.unitName||''),
      tenant:String(entry?.tenant||entry?.tenantName||''),period:String(entry?.period||''),status:String(entry?.status||''),
      amount:Number.isFinite(amount)?amount:null
    };
  }

  function rentStatementProjection(context,period){
    const selection=billableContractsForPeriod(context?.propertyContracts,period);
    const ledgerDiagnostics=ledgerSelection(context?.property?.[0],period).diagnostics;
    const diagnostics={
      conflicts:selection.diagnostics.conflicts.slice(),invalidContracts:selection.diagnostics.invalidContracts.slice(),
      invalidIdentityContracts:selection.diagnostics.invalidIdentityContracts.slice(),unmatchedPayments:[],ignoredPayments:[],
      duplicateReceipts:ledgerDiagnostics.duplicateReceipts.slice(),invalidPayments:ledgerDiagnostics.invalidPayments.slice(),overpayments:[]
    };
    const items=new Map();
    selection.contracts.forEach(function(contract){
      const id=contractId(contract);
      const key=[normalized(id),normalized(contract?.unit),normalized(contract?.tenant)].join('|');
      items.set(key,{_contract:contract,contractId:id,tenant:contract.tenant,unit:contract.unit,due:nonNegativeMoney(contractRent(contract)),paid:0,pending:0,ignored:0,receipts:[],pendingReceipts:[],status:statusLabel(contract?.status)});
    });
    context.propertyLedger.filter(function(entry){return String(entry?.period||'')===period}).forEach(function(entry){
      const matches=Array.from(items.entries()).filter(function(pair){
        return paymentMatchesContract(entry,pair[1]._contract,context.property?.[0],period);
      });
      if(matches.length!==1){diagnostics.unmatchedPayments.push(paymentDiagnostic(entry,'unmatched_payment_identity'));return}
      const key=matches[0][0];
      const item=items.get(key);
      const state=paymentState(entry?.status);
      const amount=paymentAmount(entry);
      if(!Number.isFinite(amount)){
        diagnostics.invalidPayments.push(invalidPaymentDiagnostic(entry,paymentAmountIssue(entry)||'invalid_payment_amount'));
        return;
      }
      if(state==='settled'){
        item.paid=addMoney(item.paid,amount);
        if(entry?.receiptNo)item.receipts.push(entry.receiptNo);
      }else if(state==='pending'){
        item.pending=addMoney(item.pending,amount);
        if(entry?.receiptNo)item.pendingReceipts.push(entry.receiptNo);
      }else{
        item.ignored=addMoney(item.ignored,amount);
        diagnostics.ignoredPayments.push(paymentDiagnostic(entry,'ignored_payment_status'));
      }
      items.set(key,item);
    });
    const projected=Array.from(items.values()).map(function(item){
      const difference=subtractMoney(item.due,item.paid);
      item.balance=nonNegativeMoney(difference);
      if(compareMoney(item.paid,item.due)>0){
        diagnostics.overpayments.push({
          code:'overpayment',contractId:item.contractId,property:String(context?.property?.[0]||''),unit:String(item.unit||''),
          tenant:String(item.tenant||''),period:String(period||''),amount:subtractMoney(item.paid,item.due)
        });
      }
      item.paymentStatus=compareMoney(item.due,0)>0&&compareMoney(item.balance,0)===0?'مسدد':
        compareMoney(item.paid,0)>0?'جزئي':compareMoney(item.pending,0)>0?'قيد المراجعة':'مستحق';
      return item;
    });
    return {items:projected,diagnostics};
  }

  function rentStatementItems(context,period){
    return rentStatementProjection(context,period).items;
  }

  function statementValue(record,key,fallback){return hasField(record,key)?round3(numberFrom(record[key])):fallback}

  function statementExtra(record,key){return hasField(record,key)?money(round3(numberFrom(record[key]))):'غير مسجل'}

  function statementDocument(context,period){
    const selectedPeriod=validPeriod(period)?period:currentPeriod();
    const projection=rentStatementProjection(context,selectedPeriod);
    const items=projection.items;
    const official=officialStatementFor(activeProperty,selectedPeriod);
    const computedDue=sumMoney(items.map(function(item){return item.due}));
    const computedPaid=sumMoney(items.map(function(item){return item.paid}));
    const dueTotal=computedDue;
    const paidTotal=computedPaid;
    const balanceTotal=sumMoney(items.map(function(item){return item.balance}));
    const rate=compareMoney(dueTotal,0)>0?Math.min(100,paidTotal/dueTotal*100):0;
    const unitCount=new Set(items.map(function(item){return normalized(item.unit)}).filter(Boolean)).size;
    const ledgerRows=items.map(function(item){
      return '<tr><td>'+escapeHtml(item.unit)+'</td><td>'+escapeHtml(item.tenant)+'</td><td>'+escapeHtml(money(item.due))+'</td><td>'+escapeHtml(money(item.paid))+'</td><td>'+escapeHtml(money(item.balance))+'</td><td>'+escapeHtml(item.paymentStatus)+'</td><td>'+escapeHtml(item.receipts.join('، ')||'—')+'</td></tr>';
    }).join('');
    const unperiodized=context.propertyCollections.filter(function(row){return !row?.[8]}).length;
    const officialDue=official&&hasField(official,'totalRent')?round3(numberFrom(official.totalRent)):null;
    const officialPaid=official&&hasField(official,'totalCollected')?round3(numberFrom(official.totalCollected)):null;
    const officialCopy='الإجماليات محسوبة من العقود الموقّعة السارية والدفعات المعتمدة. '+(official?
      'الكشف الرسمي محفوظ كمرجع للمقارنة'+(hasField(official,'sourcePages')?' (الصفحات: '+escapeHtml(official.sourcePages)+')':'')+
      (officialDue==null&&officialPaid==null?'. ':'. فرق المستحق '+escapeHtml(money(subtractMoney(officialDue==null?computedDue:officialDue,computedDue)))+'، وفرق المحصّل '+escapeHtml(money(subtractMoney(officialPaid==null?computedPaid:officialPaid,computedPaid)))+'. '):'');
    const conflictCopy=projection.diagnostics.conflicts.length?'تم استبعاد '+projection.diagnostics.conflicts.length+' وحدة ذات عقود متداخلة من الحساب حتى معالجة التعارض. ':'';
    const integrityCopy=(projection.diagnostics.duplicateReceipts.length?'تم استبعاد '+projection.diagnostics.duplicateReceipts.length+' رقم وصل مكرر. ':'')+
      (projection.diagnostics.invalidPayments.length?'تم استبعاد '+projection.diagnostics.invalidPayments.length+' دفعة بمبلغ غير صالح. ':'')+
      (projection.diagnostics.overpayments.length?'يوجد '+projection.diagnostics.overpayments.length+' عقد بدفعة زائدة؛ لم تُخصم الزيادة من أرصدة العقود الأخرى. ':'');
    return '<div class="v202-document-period"><label for="v202StatementPeriod">شهر الكشف</label><input id="v202StatementPeriod" type="month" value="'+escapeHtml(selectedPeriod)+'"></div>'+
      '<article class="v202-document v202-statement"><div class="v202-document-brand"><div><strong>عقاري</strong><span>إدارة الأملاك</span></div><b>كشف إيجار العقار</b></div>'+
      '<div class="v202-statement-title"><div><span>العقار</span><h2>'+escapeHtml(activeProperty)+'</h2><p>المالك: '+escapeHtml(context.property?.[1]&&context.property[1]!=='—'?context.property[1]:'غير محدد')+'</p></div><div><span>فترة الكشف</span><strong>'+escapeHtml(periodLabel(selectedPeriod))+'</strong><small>أصدر في '+new Date().toLocaleDateString('ar-KW')+'</small></div></div>'+
      '<div class="v202-statement-totals">'+kpi('المستحق',money(dueTotal),unitCount+' وحدة/عقد','gold')+kpi('المحصّل',money(paidTotal),rate.toFixed(0)+'٪ نسبة التحصيل','good')+kpi('المتبقي',money(balanceTotal),compareMoney(balanceTotal,0)>0?'يحتاج متابعة':'مكتمل',compareMoney(balanceTotal,0)>0?'attention':'good')+'</div>'+
      '<div class="v202-statement-totals v202-statement-extras">'+kpi('العربون',statementExtra(official,'totalAdvance'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+kpi('التأمين',statementExtra(official,'totalInsurance'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+kpi('النظافة',statementExtra(official,'totalCleaning'),official?'حسب الكشف المخزن':'لا يوجد إجمالي رسمي')+'</div>'+
      '<section class="v202-document-section"><h3>تفاصيل الإيجار</h3><table><thead><tr><th>الوحدة</th><th>المستأجر</th><th>المستحق</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الوصولات</th></tr></thead><tbody>'+rowOrEmpty(ledgerRows,7)+'</tbody></table></section>'+
      '<div class="v202-collection-rate"><div><span>نسبة التحصيل</span><strong>'+rate.toFixed(0)+'٪</strong></div><div role="progressbar" aria-label="نسبة التحصيل '+rate.toFixed(0)+' بالمئة" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+rate.toFixed(0)+'"><span style="width:'+rate.toFixed(2)+'%"></span></div></div>'+
      '<div class="v202-document-note"><strong>نطاق الكشف</strong><p>'+officialCopy+conflictCopy+integrityCopy+(unperiodized?'يوجد '+unperiodized+' تحصيل قديم مرتبط بلا شهر محدد ولم يدخل في إجمالي هذه الفترة.':'لا توجد تحصيلات مرتبطة بلا فترة.')+'</p></div>'+
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
    if(context)openDocument('كشف إيجار العقار',statementDocument(context,period||currentPeriod()),trigger,'#v202PropertyWorkspace [data-v202-action="statement"]');
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
      return !node.hidden&&node.getAttribute('aria-hidden')!=='true';
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

  function setPresentation(){
    document.body.classList.add('aq-v202');
    let meta=document.querySelector('meta[name="aqari-design"]');
    if(!meta){meta=document.createElement('meta');meta.name='aqari-design';document.head.appendChild(meta)}
    if(meta.content!==V202_DESIGN)meta.content=V202_DESIGN;
    enhancePropertyTriggers();
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
      const action=target.closest('[data-v202-action]');
      if(action){event.preventDefault();event.stopImmediatePropagation();return routeAction(action.getAttribute('data-v202-action'),action)}
      const receipt=target.closest('[data-v202-receipt-index]');
      if(receipt){
        event.preventDefault();event.stopImmediatePropagation();
        const context=contextFor(activeProperty);
        const record=context?.propertyCollections?.[Number(receipt.getAttribute('data-v202-receipt-index'))];
        if(record&&receiptAvailableForStatus(record?.[3]))return openReceiptDocument(record,receipt);
        return;
      }
      if(target.closest('[data-v202-payment-close]')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
      if(target.closest('[data-v202-document-close]')){event.preventDefault();event.stopImmediatePropagation();return closeDocument()}
      if(target.closest('[data-v202-print]')){event.preventDefault();event.stopImmediatePropagation();return printDocument()}
      if(target===document.getElementById('v202PropertyWorkspace')){event.preventDefault();event.stopImmediatePropagation();return closeWorkspace(true)}
      if(target===document.getElementById('v202PaymentDialog')){event.preventDefault();event.stopImmediatePropagation();return closePayment()}
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
      if(target.id==='v202PaymentPeriod')rebuildPaymentContracts(target.value||currentPeriod());
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

  function snapshotTenantDetails(property,unit,contractNo,tenant,contractIdValue){
    const matches=rows('tenantDirectoryV202').filter(function(entry){
      return entry&&typeof entry==='object'&&!Array.isArray(entry)&&
        normalized(entry.property||entry.propertyName)===normalized(property)&&normalized(entry.unit||entry.unitName)===normalized(unit)&&
        (!normalized(entry.tenant||entry.tenantName)||normalized(entry.tenant||entry.tenantName)===normalized(tenant));
    });
    let selected=null;
    if(normalized(contractIdValue)){
      const exact=matches.filter(function(entry){return normalized(entry.contractId||entry.contract_id)===normalized(contractIdValue)});
      if(exact.length===1)selected=exact[0];
    }
    if(!selected&&normalized(contractNo)){
      const exact=matches.filter(function(entry){return normalized(entry.contractNo||entry.contract_no)===normalized(contractNo)});
      if(exact.length===1)selected=exact[0];
    }else if(!selected&&matches.length===1)selected=matches[0];
    return Object.freeze({
      phone:selected?String(selected.phone||selected.phoneNumber||''):'',email:selected?String(selected.email||selected.emailAddress||''):'',
      civilId:selected?String(selected.civilId||selected.civil_id||''):'',nationality:selected?String(selected.nationality||''):'',
      verified:Boolean(selected&&selected.verified)
    });
  }

  function snapshotPropertyDetails(context,official){
    const embedded=official&&official.propertyDetails&&typeof official.propertyDetails==='object'&&!Array.isArray(official.propertyDetails)?official.propertyDetails:{};
    function value(names,fallback){
      for(let index=0;index<names.length;index+=1){
        const key=names[index];
        if(embedded[key]!=null&&String(embedded[key]).trim()!=='')return embedded[key];
        if(official&&official[key]!=null&&String(official[key]).trim()!=='')return official[key];
      }
      return fallback==null?'':fallback;
    }
    const property=context?.property||[];
    return Object.freeze({
      name:String(value(['name'],property?.[0]||'')),owner:String(value(['owner'],property?.[1]||'')),
      address:String(value(['address','propertyAddress'],property?.[4]||'')),phone:String(value(['phone','propertyPhone'],property?.[5]||'')),
      email:String(value(['email','propertyEmail'],property?.[6]||'')),paciNumber:String(value(['paciNumber'],property?.[7]||'')),
      buildingNo:String(value(['buildingNo'],property?.[8]||'')),block:String(value(['block'],property?.[9]||'')),
      street:String(value(['street'],property?.[10]||'')),area:String(value(['area'],property?.[11]||'')),
      units:numberFrom(property?.[2]),income:round3(numberFrom(property?.[3]))
    });
  }

  function snapshotPayment(entry){
    const state=paymentState(entry?.status);
    return Object.freeze({
      receiptNo:String(entry?.receiptNo||''),paid:paymentAmount(entry),paidAt:String(entry?.paidAt||entry?.paymentDate||''),
      method:String(entry?.method||entry?.paymentMethod||''),status:String(entry?.status||''),state,settled:state==='settled',pending:state==='pending',ignored:state==='ignored',
      knetOperationNo:String(entry?.knetOperationNo||entry?.knetOperationNumber||entry?.knetNo||''),voucherNo:String(entry?.voucherNo||''),
      receiptContract:String(entry?.receiptContract||''),accountant:String(entry?.accountant||''),note:String(entry?.note||'')
    });
  }

  function rentSnapshot(name,period){
    const context=contextFor(name);
    const selected=validPeriod(period)?period:currentPeriod();
    if(!context)return null;
    const projection=rentStatementProjection(context,selected);
    const statementItems=projection.items;
    const official=officialStatementFor(name,selected);
    const items=statementItems.map(function(item){
      const id=normalized(item.contractId);
      const contract=id?context.propertyContracts.find(function(candidate){
        return normalized(contractId(candidate))===id&&normalized(candidate.tenant)===normalized(item.tenant)&&normalized(candidate.unit)===normalized(item.unit);
      }):null;
      const payments=context.propertyLedger.filter(function(entry){
        return paymentMatchesContract(entry,contract,name,selected);
      }).map(snapshotPayment);
      const settledPayments=payments.filter(function(payment){return payment.state==='settled'});
      const pendingPayments=payments.filter(function(payment){return payment.state==='pending'});
      const ignoredPayments=payments.filter(function(payment){return payment.state==='ignored'});
      const contractNo=String(contract?.contract_no||'');
      const tenantDetails=snapshotTenantDetails(name,item.unit,contractNo,item.tenant,item.contractId);
      return Object.freeze({
        contractId:String(item.contractId||''),contractNo:contractNo,tenant:String(item.tenant||''),unit:String(item.unit||''),
        rent:contractRent(contract),contractRent:round3(numberFrom(contract?.contractRent)),currentRent:contractRent(contract),
        due:item.due,paid:item.paid,pending:item.pending,ignored:item.ignored,balance:item.balance,status:String(item.paymentStatus||''),
        owner:String(context.property?.[1]||''),insurance:contract&&String(contract.deposit||'').trim()!==''?round3(numberFrom(contract.deposit)):null,
        advance:contract&&String(contract.advance||'').trim()!==''?round3(numberFrom(contract.advance)):null,
        cleaning:contract&&String(contract.cleaning||'').trim()!==''?round3(numberFrom(contract.cleaning)):null,
        contractStatus:String(contract?.status||''),receipts:Object.freeze(settledPayments.map(function(payment){return payment.receiptNo}).filter(Boolean)),
        payments:Object.freeze(payments),settledPayments:Object.freeze(settledPayments),pendingPayments:Object.freeze(pendingPayments),ignoredPayments:Object.freeze(ignoredPayments),
        phone:tenantDetails.phone,email:tenantDetails.email,civilId:tenantDetails.civilId,nationality:tenantDetails.nationality,
        tenantVerified:tenantDetails.verified,tenantDetails:tenantDetails
      });
    });
    const computedDue=sumMoney(items.map(function(item){return item.due}));
    const computedPaid=sumMoney(items.map(function(item){return item.paid}));
    const computedPending=sumMoney(items.map(function(item){return item.pending}));
    const computedIgnored=sumMoney(items.map(function(item){return item.ignored}));
    const computedBalance=sumMoney(items.map(function(item){return item.balance}));
    const officialDue=official&&hasField(official,'totalRent')?round3(numberFrom(official.totalRent)):null;
    const officialPaid=official&&hasField(official,'totalCollected')?round3(numberFrom(official.totalCollected)):null;
    const deltas=Object.freeze({
      due:officialDue==null?null:subtractMoney(officialDue,computedDue),
      paid:officialPaid==null?null:subtractMoney(officialPaid,computedPaid)
    });
    const officialTotals=official?Object.freeze({
      due:officialDue,paid:officialPaid,
      advance:hasField(official,'totalAdvance')?round3(numberFrom(official.totalAdvance)):null,
      insurance:hasField(official,'totalInsurance')?round3(numberFrom(official.totalInsurance)):null,
      cleaning:hasField(official,'totalCleaning')?round3(numberFrom(official.totalCleaning)):null,
      unitCount:hasField(official,'unitCount')?numberFrom(official.unitCount):null,
      sourcePages:hasField(official,'sourcePages')?String(official.sourcePages):'',delta:deltas
    }):null;
    const totals=Object.freeze({
      computedDue:computedDue,computedExpected:computedDue,computedPaid:computedPaid,computedCollected:computedPaid,
      due:computedDue,expected:computedDue,paid:computedPaid,collected:computedPaid,pending:computedPending,ignored:computedIgnored,
      balance:computedBalance,
      delta:officialPaid==null?0:subtractMoney(officialPaid,computedPaid),deltas:deltas
    });
    const receipts=Array.from(new Set(items.flatMap(function(item){return item.receipts}))).filter(Boolean);
    const diagnostics=Object.freeze({
      conflicts:Object.freeze(projection.diagnostics.conflicts.map(function(entry){return Object.freeze({...entry})})),
      invalidContracts:Object.freeze(projection.diagnostics.invalidContracts.map(function(entry){return Object.freeze({...entry})})),
      invalidIdentityContracts:Object.freeze(projection.diagnostics.invalidIdentityContracts.map(function(entry){return Object.freeze({...entry})})),
      unmatchedPayments:Object.freeze(projection.diagnostics.unmatchedPayments.map(function(entry){return Object.freeze({...entry})})),
      ignoredPayments:Object.freeze(projection.diagnostics.ignoredPayments.map(function(entry){return Object.freeze({...entry})})),
      duplicateReceipts:Object.freeze(projection.diagnostics.duplicateReceipts.map(function(entry){return Object.freeze({...entry})})),
      invalidPayments:Object.freeze(projection.diagnostics.invalidPayments.map(function(entry){return Object.freeze({...entry})})),
      overpayments:Object.freeze(projection.diagnostics.overpayments.map(function(entry){return Object.freeze({...entry})}))
    });
    return Object.freeze({
      property:String(context.property?.[0]||name||''),owner:String(context.property?.[1]||''),period:selected,contracts:items.length,
      paidUnits:items.filter(function(item){return compareMoney(item.paid,0)>0}).length,items:Object.freeze(items),
      dueContracts:Object.freeze(items.filter(function(item){return compareMoney(item.balance,0)>0})),totals:totals,
      official:officialTotals,propertyDetails:snapshotPropertyDetails(context,official),diagnostics:diagnostics,
      receipts:Object.freeze(receipts),receiptCount:receipts.length,latestReceiptIndex:receipts.length?receipts.length-1:-1
    });
  }

  function openPublicPayment(options){
    const settings=options&&typeof options==='object'?options:{};
    const context=contextFor(activeProperty);
    if(!context)return false;
    const period=validPeriod(settings.period)?settings.period:currentPeriod();
    const id=String(settings.contractId||'');
    if(id&&!paymentContracts(context,period).some(function(contract){return contractId(contract)===id}))return false;
    if(!openPayment(settings.trigger,period,id))return false;
    const contractSelect=document.getElementById('v202PaymentContract');
    updatePaymentBalance();
    if(contractSelect&&id)contractSelect.focus();
    return true;
  }

  function latestSettledReceipt(context){
    if(!context)return null;
    const property=String(context.property?.[0]||'');
    const entries=Array.from(context.propertyLedger||[]).map(function(candidate,index){return {candidate,index}}).filter(function(record){
      const candidate=record.candidate;
      const period=String(candidate?.period||'');
      if(!String(candidate?.receiptNo||'').trim()||paymentState(candidate?.status)!=='settled'||!validPeriod(period))return false;
      const contracts=billableContractsForPeriod(context.propertyContracts,period).contracts;
      return contracts.some(function(contract){return paymentMatchesContract(candidate,contract,property,period)});
    });
    entries.sort(function(left,right){
      function rank(record){
        const entry=record.candidate;
        const explicit=Date.parse(String(entry?.paidAt||entry?.paymentDate||''));
        const period=Date.parse(String(entry?.period||'')+'-01T00:00:00Z');
        return [Number.isFinite(explicit)?explicit:(Number.isFinite(period)?period:0),record.index];
      }
      const a=rank(left),b=rank(right);
      return a[0]-b[0]||a[1]-b[1];
    });
    const entry=entries[entries.length-1]?.candidate;
    return entry?ledgerRow(entry):null;
  }

  function openPublicLatestReceipt(options){
    const settings=options&&typeof options==='object'?options:{};
    const context=contextFor(activeProperty);
    if(!context)return false;
    const record=latestSettledReceipt(context);
    if(!record)return false;
    openReceiptDocument(record,settings.trigger);
    return true;
  }

  function openPublicStatement(options){
    const settings=options&&typeof options==='object'?options:{};
    if(!contextFor(activeProperty))return false;
    openStatementDocument(validPeriod(settings.period)?settings.period:currentPeriod(),settings.trigger);
    return true;
  }

  function openPublicDocument(options){
    const settings=options&&typeof options==='object'?options:{};
    if(!String(settings.markup||'').trim())return false;
    openDocument(String(settings.title||'مستند عقاري'),String(settings.markup),settings.trigger,settings.fallbackSelector||'#v202PropertyWorkspace [data-v202-action="statement"]');
    return true;
  }

  function runPublicAction(action,options){
    const settings=options&&typeof options==='object'?options:{};
    if(action==='payment')return openPublicPayment(settings);
    if(action==='receipt')return openPublicLatestReceipt(settings);
    if(action==='statement'){
      if(typeof window.AQARI_DHAHAWI?.open==='function')return window.AQARI_DHAHAWI.open({property:activeProperty,period:validPeriod(settings.period)?settings.period:currentPeriod(),trigger:settings.trigger});
      return openPublicStatement(settings);
    }
    if(action==='contract'||action==='profile'){routeAction(action,settings.trigger);return true}
    return false;
  }

  function boot(){
    if(document.body.getAttribute('data-v202-ready')==='true'&&window.AQARI_V202?.version===V202_DESIGN)return;
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
      currentProperty:function(){return activeProperty},
      currentPeriod:currentPeriod,
      latestOfficialPeriod:function(name){return latestOfficialPeriod(name||activeProperty)},
      rentSnapshot:rentSnapshot,
      runAction:runPublicAction,
      openPayment:openPublicPayment,
      openLatestReceipt:openPublicLatestReceipt,
      openStatement:openPublicStatement,
      openDocument:openPublicDocument,
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
        paymentState:function(status){return paymentState(status)},
        isSettledStatus:function(status){return settledPayment(status)},
        contractCoversPeriod:function(contract,period){return contractCoversPeriod(contract,period)},
        isBillableContract:function(contract,period){return billableContractStatus(contract)&&contractCoversPeriod(contract,period)},
        paymentKey:function(property,contractIdValue,unit,period,tenant){return paymentKey(property,contractIdValue,unit,period,tenant)},
        statementItems:function(name,period){
          const context=contextFor(name);
          if(!context||!validPeriod(period))return Object.freeze([]);
          return Object.freeze(rentStatementItems(context,period).map(function(item){
            return Object.freeze({contractId:String(item.contractId||''),unit:String(item.unit||''),due:item.due,paid:item.paid,pending:item.pending,ignored:item.ignored,balance:item.balance,status:item.paymentStatus});
          }));
        },
        statementDiagnostics:function(name,period){
          const context=contextFor(name);
          if(!context||!validPeriod(period))return Object.freeze({
            conflicts:Object.freeze([]),invalidContracts:Object.freeze([]),invalidIdentityContracts:Object.freeze([]),
            unmatchedPayments:Object.freeze([]),ignoredPayments:Object.freeze([]),duplicateReceipts:Object.freeze([]),
            invalidPayments:Object.freeze([]),overpayments:Object.freeze([])
          });
          const diagnostics=rentStatementProjection(context,period).diagnostics;
          return Object.freeze({
            conflicts:Object.freeze(diagnostics.conflicts),invalidContracts:Object.freeze(diagnostics.invalidContracts),
            invalidIdentityContracts:Object.freeze(diagnostics.invalidIdentityContracts),unmatchedPayments:Object.freeze(diagnostics.unmatchedPayments),
            ignoredPayments:Object.freeze(diagnostics.ignoredPayments),duplicateReceipts:Object.freeze(diagnostics.duplicateReceipts),
            invalidPayments:Object.freeze(diagnostics.invalidPayments),overpayments:Object.freeze(diagnostics.overpayments)
          });
        },
        latestSettledReceipt:function(name){return latestSettledReceipt(contextFor(name))},
        testContext:function(name,period){
          const context=contextFor(name);
          if(!context)return null;
          const selected=validPeriod(period)?period:currentPeriod();
          const projection=rentStatementProjection(context,selected);
          const items=projection.items;
          const official=officialStatementFor(name,selected);
          const computedRent=sumMoney(items.map(function(item){return item.due}));
          const computedCollected=sumMoney(items.map(function(item){return item.paid}));
          return Object.freeze({
            activeSignedContracts:context.activeContracts.length,billableContracts:items.length,
            settledPaid:computedCollected,pending:sumMoney(items.map(function(item){return item.pending})),
            ignored:sumMoney(items.map(function(item){return item.ignored})),conflicts:projection.diagnostics.conflicts.length,
            official:Boolean(official),totalRent:computedRent,totalCollected:computedCollected,
            officialRent:official&&hasField(official,'totalRent')?round3(numberFrom(official.totalRent)):null,
            officialCollected:official&&hasField(official,'totalCollected')?round3(numberFrom(official.totalCollected)):null
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
