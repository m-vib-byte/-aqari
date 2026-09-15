import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPartnerSession} from '../src/v267/api/partner-session.js';

const sql=fs.readFileSync('staging-database/sql/partner-owner-visible-property-fields.sql','utf8');
const portal=fs.readFileSync('v267-partner-portal.js','utf8');

function fixture(data){
 let notify;
 const client={
  auth:{
   onAuthStateChange(fn){notify=fn;return {data:{subscription:{unsubscribe(){}}}};},
   getSession(){return Promise.resolve({data:{session:{user:{id:'owner-user'}}}});}
  },
  rpc(name,args){
   assert.equal(name,'aqari_partner_owner_fields');
   assert.deepEqual(args,{p_property_id:'property-a'});
   return {abortSignal(){return Promise.resolve({data});}};
  }
 };
 const session=createPartnerSession(client);
 return {session,notify};
}
const selection={propertyId:'property-a',workspaceId:'workspace-a',kind:'owner_fields'};
const valid={
 user_id:'owner-user',workspace_id:'workspace-a',property_id:'property-a',
 items:[
  {label_ar:'نسبة المالك',label_en:'Owner share',type:'percentage',value:'80.880'},
  {label_ar:'ملاحظة المالك',label_en:'Owner note',type:'text',value:'معتمد'},
  {label_ar:'وثيقة الملكية',label_en:'Ownership document',type:'document',value:true}
 ]
};

test('owner-visible projection is fail-closed and excludes internal field metadata/document ids',()=>{
 assert.match(sql,/OWNER_VISIBLE_PROPERTY_FIELDS_PREREQUISITE_MISSING/);
 assert.match(sql,/f\.visibility in\('owner','both'\)/);
 assert.match(sql,/f\.is_active/);
 assert.match(sql,/property=any\(f\.property_ids\)/);
 assert.match(sql,/not exists\([\s\S]*public\.aqari_memberships/);
 assert.match(sql,/case when f\.field_type='document' then to_jsonb\(v\.value is not null\) else v\.value end/);
 assert.doesNotMatch(sql,/field_key[^_]/);
 assert.doesNotMatch(sql,/revision'/);
});

test('partner portal requests the dedicated owner-field projection and renders only text nodes',()=>{
 assert.match(portal,/kind:'owner_fields'/);
 assert.match(portal,/بيانات العقار المخصصة/);
 assert.match(portal,/row\.type==='document'\)return value\?'مستند مؤرشف مرتبط'/);
 assert.match(portal,/dd\.textContent=ownerFieldValue\(row\)/);
 assert.doesNotMatch(portal,/\.innerHTML\s*=/);
});

test('partner session accepts a scoped owner-field response and rechecks auth',async()=>{
 const f=fixture(valid);
 assert.deepEqual(await f.session.read(selection),valid);
 f.session.close();
});

test('partner session rejects foreign scope and malformed owner-visible values',async()=>{
 const invalid=[
  {...valid,workspace_id:'foreign'},
  {...valid,property_id:'foreign'},
  {...valid,items:{}},
  {...valid,items:[{label_ar:'حقل',label_en:'Field',type:'html',value:'<b>x</b>'}]},
  {...valid,items:[{label_ar:'وثيقة',label_en:'Document',type:'document',value:'00000000-0000-0000-0000-000000000000'}]},
  {...valid,items:[{label_ar:'نسبة',label_en:'Share',type:'percentage',value:'101'}]},
  {...valid,items:[{label_ar:'حقل',label_en:'Field',type:'text',value:'ok',internal:true}]}
 ];
 for(const data of invalid){
  const f=fixture(data);
  await assert.rejects(f.session.read(selection),/SCOPE_MISMATCH|OWNER_FIELDS_INVALID/);
  f.session.close();
 }
});
