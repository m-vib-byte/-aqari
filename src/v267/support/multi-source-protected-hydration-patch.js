export const MULTI_SOURCE_MARKER='v267MultiSourceProtectedHydration';

export function patchMultiSourceProtectedHydration(source){
  let next=String(source||'');
  if(next.includes(MULTI_SOURCE_MARKER))return next;

  const mergeAnchor=`  function mergeImportedProperty(localRows,remoteRows,allowedNames){
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
`;

  const mergeReplacement=`  // ${MULTI_SOURCE_MARKER}
  function mergeImportedProperty(localRows,remoteRows,allowedNames){
    const result=Array.isArray(localRows)?localRows.slice():[];
    let changed=false;
    const allowed=new Set(Array.from(allowedNames||[]).map(propertyKey).filter(Boolean));
    if(!allowed.size)return {rows:result,changed};
    const remote=Array.isArray(remoteRows)?remoteRows.filter(function(row){
      return Array.isArray(row)&&allowed.has(propertyKey(row[0]));
    }):[];
    const seen=new Set();
    for(const candidateRow of remote){
      const candidate=candidateRow.slice(0,4).map(function(value){
        return value==null||['string','number','boolean'].includes(typeof value)?value:'';
      });
      const key=propertyKey(candidate[0]);
      if(!key||seen.has(key))continue;
      seen.add(key);
      const matches=[];
      result.forEach(function(row,index){if(Array.isArray(row)&&propertyKey(row[0])===key)matches.push(index)});
      if(matches.length===0){result.push(candidate);changed=true;continue}
      if(matches.length!==1)continue;
      const existing=result[matches[0]];
      const replacement=existing.slice();
      candidate.forEach(function(value,index){if(value!=null&&String(value).trim()!=='')replacement[index]=value});
      if(JSON.stringify(replacement)!==JSON.stringify(existing)){result[matches[0]]=replacement;changed=true}
    }
    return {rows:result,changed};
  }
`;

  if(!next.includes(mergeAnchor))throw Error('Multi-source property merge anchor not found');
  next=next.replace(mergeAnchor,mergeReplacement);

  const hydrateAnchor=`        const importedPropertyNames=new Map();
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
`;

  const hydrateReplacement=`        const importedPropertyNames=new Map();
        ['contractsV202','rentStatementsV202'].forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          remoteRows.forEach(function(record){
            if(!record||typeof record!=='object'||Array.isArray(record)||normalized(record.source)!==V202_IMPORT_SOURCE)return;
            const displayName=identityText(record.property);
            const propertyIdentity=propertyKey(record.property);
            if(displayName&&propertyIdentity&&!importedPropertyNames.has(propertyIdentity))importedPropertyNames.set(propertyIdentity,displayName);
          });
        });
        if(!importedPropertyNames.size)return denyProtectedHydration(generation);
        const importedPropertyKeys=new Set(importedPropertyNames.keys());
        const nextCache=Object.create(null);
        Object.keys(PROTECTED_FIELDS).forEach(function(key){
          const remoteRows=Array.isArray(primary[key])?primary[key]:[];
          const scoped=remoteRows.filter(function(record){
            return record&&typeof record==='object'&&!Array.isArray(record)&&
              normalized(record.source)===V202_IMPORT_SOURCE&&importedPropertyKeys.has(propertyKey(record.property));
          });
          if(scoped.length)nextCache[key]=scoped.map(function(record){return pickedRecord(record,PROTECTED_FIELDS[key])});
        });
        nextCache.properties=Array.isArray(primary.properties)?primary.properties.filter(function(row){
          return Array.isArray(row)&&importedPropertyKeys.has(propertyKey(row[0]));
        }).map(function(row){return row.slice(0,4)}):[];
        protectedImportCache=nextCache;
        protectedPropertyNames=importedPropertyKeys;
        protectedImportScope=currentScope;
        protectedImportValidated=true;
`;

  if(!next.includes(hydrateAnchor))throw Error('Multi-source protected hydration anchor not found');
  next=next.replace(hydrateAnchor,hydrateReplacement);
  return next;
}
