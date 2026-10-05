import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryAuth,allowedRecoveryHost,RECOVERY_OWNER,RECOVERY_WORKSPACE} from '../src/v267/recovery/auth-core.js';
function fixture(){
 const state={id:RECOVERY_OWNER,level:'aal1',verified:[],rpc:0,verify:0,logout:0,challengeHook:null};
 const client={auth:{
  getUser:async()=>({data:{user:{id:state.id}}}),signInWithPassword:async()=>({data:{}}),signOut:async()=>{state.logout++;return {data:{}};},
  mfa:{listFactors:async()=>({data:{totp:state.verified}}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:state.level}}),
   enroll:async()=>({data:{id:'pending-factor',totp:{qr_code:'<svg/>',secret:'SYNTHETIC-ONLY'}}}),
   challenge:async()=>{state.challengeHook?.();return {data:{id:'challenge'}};},
   verify:async()=>{state.verify++;state.level='aal2';state.verified=[{id:'pending-factor',status:'verified'}];return {data:{}};},
   unenroll:async()=>({data:{}})
  }
 },rpc:async()=>{state.rpc++;return {data:{user_id:state.id,workspace_id:RECOVERY_WORKSPACE,role:'general_manager'}};}};
 return {state,core:createRecoveryAuth(client)};
}
test('only the aqari preview hostname pattern permits the recovery page',()=>{
 for(const h of ['myaqari.com','www.myaqari.com','aqari.vercel.app','aqari-safe.vercel.app.attacker.test','localhost'])assert.equal(allowedRecoveryHost(h),false,h);
 assert.equal(allowedRecoveryHost('aqari-test-m-vib-5421.vercel.app'),true);
});
test('wrong account is rejected and its local session signed out',async()=>{
 const {state,core}=fixture();state.id='another-user';await assert.rejects(core.signIn('synthetic@example.invalid','synthetic'),/OWNER_REQUIRED/);assert.equal(state.logout,1);assert.equal(state.rpc,0);
});
test('AAL1 cannot run protected workspace readiness read',async()=>{
 const {state,core}=fixture();await assert.rejects(core.readCheck(),/AAL2_REQUIRED/);assert.equal(state.rpc,0);
});
test('stale AAL2 with no verified factor fails closed',async()=>{
 const {state,core}=fixture();state.level='aal2';await assert.rejects(core.readCheck(),/AAL2_REQUIRED/);assert.equal(state.rpc,0);
});
test('enrollment, verification and guarded read succeed without financial writes',async()=>{
 const {state,core}=fixture();await core.signIn('synthetic@example.invalid','synthetic');const enrolled=await core.enroll();await assert.rejects(core.enroll(),/PENDING/);assert.equal((await core.verify(enrolled.id,'123456')).aal2,true);assert.equal((await core.readCheck()).result,'PASS');assert.equal(state.rpc,1);assert.equal(state.verify,1);
});
test('account change during challenge prevents OTP verification',async()=>{
 const {state,core}=fixture();await core.enroll();state.challengeHook=()=>{state.id='another-user';};await assert.rejects(core.verify('pending-factor','123456'),/OWNER_REQUIRED/);assert.equal(state.verify,0);
});
test('unknown factor and malformed code never reach verification',async()=>{
 const {state,core}=fixture();await assert.rejects(core.verify('other','123456'),/FACTOR_REQUIRED/);await assert.rejects(core.verify('other','12345'),/CODE_INVALID/);assert.equal(state.verify,0);
});
test('cancelled pending factor can be enrolled again without removing existing verified factors',async()=>{
 const {state,core}=fixture();await core.enroll();await core.cancelEnrollment();await core.enroll();await core.cancelEnrollment();state.verified=[{id:'existing',status:'verified'}];await assert.rejects(core.enroll(),/FACTOR_EXISTS/);
});
