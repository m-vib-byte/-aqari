// Keep legacy navigation and property shortcuts on the same guarded V267 contract entry.
export function installContractRoutes(target,open){
 const previous=target.go;
 target.AQARI_V267_OPEN_CONTRACTS=open;
 target.go=function(page,...args){
  if(page==='smartContractsPage')return open({create:true});
  if(page==='leases')return open();
  return previous?.call(this,page,...args);
 };
}
