import {installExperimentalInvestmentApartmentContractShortcut,openExperimentalInvestmentApartmentContract} from './experimental-investment-apartment-contract.js';

// Keep legacy navigation and property shortcuts on the same guarded V267 contract entry.
export function installContractRoutes(target,open){
 const previous=target.go;
 installExperimentalInvestmentApartmentContractShortcut(target);
 function installExecutionGuard(){
  const records=target.AQARI_RENTAL_RECORDS;
  if(!records?.saveLease||records.__aqariExecutionGuardInstalled)return;
  const original=records.saveLease.bind(records);
  Object.defineProperty(records,'__aqariExecutionGuardInstalled',{value:true,enumerable:false});
  records.saveLease=async function(input,...args){
   if(input?.status==='signed'&&input?.source==='v267-cloud'&&typeof window!=='undefined'&&target===window){
    const module=await import('../pages/contract-execution.js');
    const opened=module.openContractExecution(input.id,{onDone:()=>route({id:input.id})});
    if(opened===false)throw Error('تعذر فتح اعتماد تسوية الإبرام.');
    // The signing transition is deliberately not sent here. The execution
    // dialog performs signing + settlement + receipt in one cloud transaction.
    return input;
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
 target.AQARI_V267_OPEN_EXPERIMENTAL_INVESTMENT_APARTMENT_CONTRACT=()=>openExperimentalInvestmentApartmentContract(target);
 target.go=function(page,...args){
  installExecutionGuard();
  if(page==='experimentalInvestmentApartmentContract')return openExperimentalInvestmentApartmentContract(target);
  if(page==='smartContractsPage')return route({create:true});
  if(page==='leases')return route();
  return previous?.call(this,page,...args);
 };
}
