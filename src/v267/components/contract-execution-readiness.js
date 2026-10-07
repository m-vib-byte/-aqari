// Probe the authorized read endpoint before any reservation or settlement write.
// Only the explicit absence of artifacts means this signing flow may proceed.
export async function assertContractExecutionService(session, contractRef) {
 session.check();
 try {
  await session.request(session.client.rpc('aqari_contract_execution_artifacts',{
   p_workspace_id:session.bound.workspace,p_contract_ref:String(contractRef)
  }));
  session.check();
 } catch(error) {
  session.check();
  if(error?.code==='P0002'&&error?.message==='CONTRACT_EXECUTION_ARTIFACTS_NOT_FOUND')return;
  throw error;
 }
 throw Error('سبق إنشاء مستندات إبرام هذا العقد. حدّث السجل قبل المتابعة.');
}
