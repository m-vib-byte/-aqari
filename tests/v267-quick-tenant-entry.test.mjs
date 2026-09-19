import test from 'node:test';
import assert from 'node:assert/strict';
import {openQuickTenantEntry} from '../src/v267/components/quick-tenant-entry.js';

function fixture(options={}){
 let identity={user:'u',workspace:'w',role:'general_manager'};
 const calls=[];
 const button={disabled:!!options.disabled,click(){calls.push('open form');}};
 const deps={scope:()=>options.signedOut?null:identity,navigate:async route=>{calls.push(route);if(options.switchIdentity)identity={...identity,...options.switchIdentity};return options.routeFailure?false:true;},ready:()=>!options.staleRoute,page:()=>({querySelector:()=>options.missing?null:button}),visible:()=>!options.hidden};
 return {calls,run:()=>openQuickTenantEntry(deps)};
}
test('opens the existing tenant form after navigation, without creating a record',async()=>{
 const f=fixture();assert.equal(await f.run(),true);assert.deepEqual(f.calls,['tenants','open form']);
});
test('does not navigate or open a form when signed out',async()=>{
 const f=fixture({signedOut:true});assert.equal(await f.run(),false);assert.deepEqual(f.calls,[]);
});
test('does not open after user, workspace or role changes during navigation',async()=>{
 for(const switchIdentity of [{user:'other'},{workspace:'other'},{role:'tenant'}]){const f=fixture({switchIdentity});assert.equal(await f.run(),false);assert.deepEqual(f.calls,['tenants']);}
});
test('failed or superseded navigation cannot open a form on another route',async()=>{
 for(const options of [{routeFailure:true},{staleRoute:true}]){const f=fixture(options);assert.equal(await f.run(),false);assert.deepEqual(f.calls,['tenants']);}
});
test('disabled, hidden or absent native actions stay unavailable',async()=>{
 for(const options of [{disabled:true},{hidden:true},{missing:true}]){const f=fixture(options);assert.equal(await f.run(),false);assert.deepEqual(f.calls,['tenants']);}
});
