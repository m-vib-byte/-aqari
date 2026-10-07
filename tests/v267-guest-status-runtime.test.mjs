import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Execute the shipped function, without booting or rewriting the login UI.
const source=readFileSync(new URL('../src/v267/login-owner-reference.js',import.meta.url),'utf8');
const start=source.indexOf('async function guestEnabled(){');
const end=source.indexOf('\nfunction roleCard(',start);
assert.ok(start>=0&&end>start);
const config={releaseStage:'preview',supabaseUrl:'https://fixture.supabase.co',supabasePublishableKey:'sb_publishable_fixture'};
async function check(cfg,response={ok:true,json:async()=>({enabled:true,data_access:false})}){
 const calls=[];
 const context=vm.createContext({window:{AQARI_PUBLIC_CONFIG:cfg},fetch:async(...args)=>{calls.push(args);if(response instanceof Error)throw response;return response;}});
 const enabled=await vm.runInContext(source.slice(start,end)+'\nguestEnabled()',context);
 return {enabled,calls};
}
test('production guest stays disabled without making a database request',async()=>{
 const result=await check({...config,releaseStage:'production'});
 assert.equal(result.enabled,false);assert.equal(result.calls.length,0);
});
test('missing or invalid public configuration fails closed before network',async()=>{
 for(const cfg of [undefined,{}, {...config,supabaseUrl:'https://example.com'},{...config,supabasePublishableKey:'invalid'}]){
  const result=await check(cfg);assert.equal(result.enabled,false);assert.equal(result.calls.length,0);
 }
});
test('preview only enables an explicit data-free guest response',async()=>{
 const result=await check(config);assert.equal(result.enabled,true);assert.equal(result.calls.length,1);
 const [url,options]=result.calls[0];assert.equal(url,config.supabaseUrl+'/rest/v1/rpc/aqari_guest_mode_status');
 assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
 assert.equal(options.body,'{}');assert.equal(options.headers.Authorization,undefined);
});
test('disabled, malformed and data-bearing guest responses fail closed',async()=>{
 for(const data of [null,{}, {enabled:false,data_access:false},{enabled:true},{enabled:true,data_access:true},{enabled:'true',data_access:false},{enabled:true,data_access:'false'}]){
  assert.equal((await check(config,{ok:true,json:async()=>data})).enabled,false);
 }
});
test('missing RPC and denied responses keep guest disabled',async()=>{
 for(const status of [401,403,404,500])assert.equal((await check(config,{ok:false,status,json:async()=>{throw Error('must not read failed body');}})).enabled,false);
});
test('network and JSON failures keep guest disabled',async()=>{
 assert.equal((await check(config,new Error('offline'))).enabled,false);
 assert.equal((await check(config,{ok:true,json:async()=>{throw Error('invalid JSON');}})).enabled,false);
});
