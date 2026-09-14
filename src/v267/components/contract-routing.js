// Keep legacy navigation and property shortcuts on the same guarded V267 contract entry.
export function installContractRoutes(target,open){
 const previous=target.go;
 async function route(initial={}){
  if(initial?.create){
   const module=await import('../pages/contract-foundation.js');
   return module.openContractFoundation({...initial,openContracts:open});
  }
  return open(initial||{});
 }
 target.AQARI_V267_OPEN_CONTRACTS=route;
 target.go=function(page,...args){
  if(page==='smartContractsPage')return route({create:true});
  if(page==='leases')return route();
  return previous?.call(this,page,...args);
 };
}
