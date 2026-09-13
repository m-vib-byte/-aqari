import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertSafeIntegrationPublicMetadata} from '../src/v267/components/integration-public-metadata.js';

const sourceSql=readFileSync(new URL('../staging-database/sql/external-integration-register.sql',import.meta.url),'utf8');
const upgradeSql=readFileSync(new URL('../staging-database/sql/external-integration-public-metadata-hardening.sql',import.meta.url),'utf8');
const integrationUi=readFileSync(new URL('../src/v267/pages/integration-center.js',import.meta.url),'utf8');

const forbiddenSamples=[
  {auth:{access_token:'secret'}},
  {transport:[{Authorization:'Bearer secret'}]},
  {provider:{'service-role-key':'secret'}},
  {tenant:{civil_id:'123456789012'}},
  {nested:{items:[{api_key:'secret'}]}},
  {nested:{items:[{'refresh token':'secret'}]}},
  {Password:'secret'}
];

test('public integration metadata accepts non-secret provider configuration',()=>{
  const value={company_id:'company-1',realm_id:'realm-1',mapping:{income_account:'4010'},features:['journals','webhooks']};
  assert.equal(assertSafeIntegrationPublicMetadata(value),value);
});

test('public integration metadata rejects secret-like keys at any nesting level',()=>{
  for(const sample of forbiddenSamples){
    assert.throws(()=>assertSafeIntegrationPublicMetadata(sample),/لا يجوز حفظ/);
  }
});

test('public integration metadata is object-only and depth bounded',()=>{
  assert.throws(()=>assertSafeIntegrationPublicMetadata([]),/كائن JSON/);
  assert.throws(()=>assertSafeIntegrationPublicMetadata('metadata'),/كائن JSON/);
  let value={};let cursor=value;
  for(let index=0;index<18;index+=1){cursor.next={};cursor=cursor.next;}
  assert.throws(()=>assertSafeIntegrationPublicMetadata(value),/متداخلة/);
});

test('database source enforces recursive guard before integration config writes',()=>{
  assert.match(sourceSql,/create or replace function private\.aqari_integration_public_metadata_safe\(p_value jsonb\)/i);
  assert.match(sourceSql,/regexp_replace\(pg_catalog\.lower\(key_name\),'\[_\[:space:\]-\]'\s*,''\s*,'g'\)/i);
  assert.match(sourceSql,/aqari_integration_public_metadata_safe_check[\s\S]*jsonb_typeof\(public_metadata\)='object'[\s\S]*aqari_integration_public_metadata_safe\(public_metadata\)/i);
  const guardIndex=sourceSql.indexOf("PUBLIC_METADATA_SECRET_FORBIDDEN");
  const insertIndex=sourceSql.indexOf('insert into private.aqari_integration_configs');
  assert.ok(guardIndex>0&&insertIndex>guardIndex,'RPC guard must execute before config mutation');
});

test('upgrade aborts on unsafe existing rows instead of deleting or rewriting them',()=>{
  assert.match(upgradeSql,/INTEGRATION_PUBLIC_METADATA_REQUIRES_MANUAL_REMEDIATION/);
  assert.match(upgradeSql,/add constraint aqari_integration_public_metadata_safe_check/);
  assert.doesNotMatch(upgradeSql,/delete\s+from\s+private\.aqari_integration_configs/i);
  assert.doesNotMatch(upgradeSql,/update\s+private\.aqari_integration_configs\s+set\s+public_metadata/i);
  assert.match(upgradeSql,/Do not apply to Production before/i);
});

test('integration UI invokes the public-metadata guard before constructing the save payload',()=>{
  const guardIndex=integrationUi.indexOf('assertSafeIntegrationPublicMetadata(publicMetadata)');
  const payloadIndex=integrationUi.indexOf('const payload={id:editing?.id');
  assert.ok(guardIndex>0&&payloadIndex>guardIndex,'client fail-fast guard must run before RPC payload construction');
  assert.match(integrationUi,/مرجع السر بالخادم — ليس السر نفسه/);
});
