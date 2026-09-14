// Keep legacy navigation and property shortcuts on the same guarded V267 contract entry.
export function installContractRoutes(target,open){
 const previous=target.go;
 function installExecutionGuard(){
  const records=target.AQARI_RENTAL_RECORDS;
  if(!records?.saveLease||records.__aqariExecutionGuardInstalled)return;
  const original=records.saveLease.bind(records);
  Object.defineProperty(records,'__aqariExecutionGuardInstalled',{value:true,enumerable:false});
  records.saveLease=async function(input,...args){
   if(input?.status==='signed'&&input?.source==='v267-cloud'&&typeof window!=='undefined'&&target===window){
    const module=await import('../pages/contract-execution.js');
    return await new Promise((resolve,reject)=>{
     const opened=module.openContractExecution(input.id,{onDone:resolve,onCancel:reject});
     if(opened===false)reject(Error('تعذر فتح اعتماد تسوية الإبرام.'));
    });
   }
   return original(input,...args);
  };
 }
 async function route(initial={}){
  installExecutionGuard();
  if(initial?.create&&typeof window!=='undefined'&&target===window){
   const module=await import('../pages/contract-foundation.js');
   return module.openContractFoundation({...initial,openContracts:open});
  }
  return open(initial||{});
 }
 installExecutionGuard();
 target.AQARI_V267_OPEN_CONTRACTS=route;
 target.go=function(page,...args){
  installExecutionGuard();
  if(page==='smartContractsPage')return route({create:true});
  if(page==='leases')return route();
  return previous?.call(this,page,...args);
 };
}
