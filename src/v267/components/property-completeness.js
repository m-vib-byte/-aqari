// Completeness is advisory. Only absence of this exact RPC may be skipped;
// authorization, session, transport and dependency failures remain blocking.
export async function readPropertyCompleteness(session, propertyId) {
 const rpc='aqari_property_completeness';
 session.check();
 try {
  const result=await session.request(session.client.rpc(rpc,{p_workspace_id:session.bound.workspace,p_property_id:propertyId}));
  session.check();
  if(result?.workspace_id!==session.bound.workspace||result?.property_id!==propertyId||
   !Number.isFinite(result?.score)||result.score<0||result.score>100)
   throw Error('تعذر تأكيد نسبة اكتمال ملف العقار.');
  return result;
 } catch(error) {
  session.check();
  if(error?.code==='PGRST202'&&
   /Could not find the function public\.aqari_property_completeness(?:\(|\s|$)/.test(String(error?.message||'')))
   return null;
  throw error;
 }
}
