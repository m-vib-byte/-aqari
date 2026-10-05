// Isolated recovery-provider setup only. Never an application recovery acceptance gate.
export const RECOVERY_URL='https://nlqynpmilcdqztwrrvyu.supabase.co';
export const RECOVERY_OWNER='2178d9cd-8b80-46ed-acd2-fb08ae120b70';
export const RECOVERY_WORKSPACE='c05fcb74-8315-43aa-86b7-0b420c05d2cd';
export function allowedRecoveryHost(host){return /^aqari-[a-z0-9-]+\.vercel\.app$/.test(host);}
function unwrap(result){if(result?.error)throw result.error;return result?.data;}
export function createRecoveryAuth(client){
 let pending=null;
 async function owner(){
  const data=unwrap(await client.auth.getUser());
  if(data?.user?.id!==RECOVERY_OWNER)throw Error('RECOVERY_OWNER_REQUIRED');
  return data.user;
 }
 async function factors(){await owner();return (unwrap(await client.auth.mfa.listFactors())?.totp||[]).filter(f=>f.status==='verified');}
 async function status(){
  const verified=await factors();
  const level=unwrap(await client.auth.mfa.getAuthenticatorAssuranceLevel());
  await owner();
  return {verified,aal2:level?.currentLevel==='aal2'&&verified.length>0};
 }
 async function signIn(email,password){
  unwrap(await client.auth.signInWithPassword({email,password}));
  try{await owner();return await status();}
  catch(e){await client.auth.signOut({scope:'local'});throw e;}
 }
 async function enroll(){
  await owner();if(pending)throw Error('RECOVERY_ENROLLMENT_PENDING');
  if((await factors()).length)throw Error('RECOVERY_FACTOR_EXISTS');
  const data=unwrap(await client.auth.mfa.enroll({factorType:'totp',friendlyName:'MyAqari Recovery',issuer:'MyAqari Recovery'}));
  await owner();
  if(!data?.id||!data?.totp?.qr_code||!data?.totp?.secret)throw Error('RECOVERY_ENROLLMENT_FAILED');
  pending=data.id;return data;
 }
 async function verify(factorId,code){
  if(!/^\d{6}$/.test(code))throw Error('RECOVERY_CODE_INVALID');
  const verified=await factors();
  if(factorId!==pending&&!verified.some(f=>f.id===factorId))throw Error('RECOVERY_FACTOR_REQUIRED');
  const challenge=unwrap(await client.auth.mfa.challenge({factorId}));
  await owner();
  unwrap(await client.auth.mfa.verify({factorId,challengeId:challenge.id,code}));
  await owner();if(pending===factorId)pending=null;
  return status();
 }
 async function cancelEnrollment(){
  await owner();if(!pending)return;
  const id=pending;unwrap(await client.auth.mfa.unenroll({factorId:id}));pending=null;
 }
 async function readCheck(){
  const state=await status();if(!state.aal2)throw Error('RECOVERY_AAL2_REQUIRED');
  const access=unwrap(await client.rpc('aqari_workspace_access',{p_workspace_id:RECOVERY_WORKSPACE}));
  await owner();
  if(access?.user_id!==RECOVERY_OWNER||access?.workspace_id!==RECOVERY_WORKSPACE||access?.role!=='general_manager')throw Error('RECOVERY_ACCESS_MISMATCH');
  return {result:'PASS',scope:'Recovery provider Auth/MFA and existing recovery workspace read only; full restored application not yet verified.',checkedAt:new Date().toISOString()};
 }
 async function signOut(){unwrap(await client.auth.signOut({scope:'local'}));pending=null;}
 return {signIn,status,enroll,verify,cancelEnrollment,readCheck,signOut};
}
