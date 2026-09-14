import {createSession} from '../api/session.js';

const allowed=access=>access?.permissions?.contracts?.read===true&&access?.permissions?.contracts?.write===true;
const matches=(access,bound)=>access?.user_id===bound.user&&access?.workspace_id===bound.workspace&&access?.role===bound.role;

export async function openGuardedContractFoundation(intent,openContracts){
 const session=createSession();
 try{
  await session.connect();
  const readAccess=()=>session.request(session.client.rpc('aqari_workspace_access',{p_workspace_id:session.bound.workspace}));
  const before=await readAccess();session.check();
  if(!matches(before,session.bound)||!allowed(before))throw Error('ACCESS_DENIED');
  const module=await import('../pages/contract-foundation.js');session.check();
  const after=await readAccess();session.check();
  if(!matches(after,session.bound)||!allowed(after))throw Error('ACCESS_DENIED');
  return module.openContractFoundation({...intent,openContracts});
 }finally{
  session.close();
 }
}
