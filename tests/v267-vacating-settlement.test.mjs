import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=readFileSync(new URL('../staging-database/sql/vacating-settlement.sql',import.meta.url),'utf8');
const hardening=readFileSync(new URL('../staging-database/sql/vacating-settlement-hardening.sql',import.meta.url),'utf8');
const releaseSql=readFileSync(new URL('../staging-database/sql/vacating-release.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/vacating-settlement.js',import.meta.url),'utf8');
const documentScanner=readFileSync(new URL('../src/v267/pages/document-scanner.js',import.meta.url),'utf8');
const documentCatalog=readFileSync(new URL('../staging-database/supabase/migrations/20260909225520_v267_document_catalog.sql',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/v267/workspace.js',import.meta.url),'utf8');

test('vacating settlement is private and server-authoritative',()=>{
 assert.match(base,/revoke all on private\.aqari_vacating_settlements from public,anon,authenticated/i);
 assert.match(base,/grant execute on function public\.aqari_vacating_settlement\(uuid,text,jsonb\) to authenticated/i);
 assert.match(base,/private\.aqari_can_lease\(w,lid,'contracts'/i);
 assert.match(base,/if not private\.aqari_manager\(w\) then raise insufficient_privilege/i);
 assert.match(base,/VACATING_REVISION_CONFLICT/);
 assert.match(base,/status='draft'/);
});

test('finalization and clearance enforce the physical and financial checklist',()=>{
 assert.match(base,/not s\.keys_returned or not s\.inspection_completed or not s\.meters_recorded/);
 assert.match(base,/VACATING_CHECKLIST_OPEN/);
 assert.match(base,/s\.damage_amount>0 and not s\.charges_resolved/);
 assert.match(base,/VACATING_DAMAGE_OPEN/);
 assert.match(base,/rent_balance[^\n]+tenant_credit[^\n]+deposit_balance/s);
 assert.match(base,/VACATING_OUTSTANDING_BALANCE/);
 assert.match(base,/length\(why\)<10/);
});

test('vacating balances count only confirmed rental payments',()=>{
 assert.match(hardening,/p\.status in \('مدفوع','جزئي','paid','partial'\)/);
 assert.doesNotMatch(hardening,/where p\.workspace_id=w and p\.lease_id=lid;\s*$/m);
});

test('immutable snapshots are normalized to the committed status and numbers',()=>{
 assert.match(hardening,/aqari_vacating_snapshot_guard/);
 assert.match(hardening,/new\.status='finalized'/);
 assert.match(hardening,/settlement_no',new\.settlement_no/);
 assert.match(hardening,/new\.status='cleared'/);
 assert.match(hardening,/clearance_no',new\.clearance_no/);
 assert.match(hardening,/before update on private\.aqari_vacating_settlements/);
});

test('post-clearance release preserves contract history and reconciles PR71 safety gates',()=>{
 assert.match(releaseSql,/create or replace function public\.aqari_vacating_release/);
 assert.match(releaseSql,/s\.status<>'cleared'/);
 assert.match(releaseSql,/VACATING_CLEARANCE_REQUIRED/);
 assert.match(releaseSql,/VACATING_RELEASE_BALANCE_CHANGED/);
 assert.match(releaseSql,/VACATING_HANDOVER_REQUIRED/);
 assert.match(releaseSql,/VACATING_OPEN_MAINTENANCE/);
 assert.match(releaseSql,/VACATING_OPEN_UTILITIES/);
 assert.match(releaseSql,/VACATING_FUTURE_PAYMENT_REVIEW_REQUIRED/);
 assert.match(releaseSql,/VACATING_UNCERTAIN_PAYMENT/);
 assert.match(releaseSql,/VACATING_DEPOSIT_HISTORY_REQUIRED/);
 assert.match(releaseSql,/VACATING_SOURCE_REVIEW_REQUIRED/);
 assert.match(releaseSql,/update public\.aqari_leases set status='expired',vacated_on=s\.vacate_date/);
 assert.match(releaseSql,/original_contract_end_date/);
 assert.match(releaseSql,/daterange\(start_date,coalesce\(vacated_on,end_date\),'\[\]'\)/);
 assert.match(releaseSql,/aqari_released_lease_guard/);
 assert.match(releaseSql,/VACATING_CONTRACT_IMMUTABLE/);
 assert.match(releaseSql,/kind='rent_reminder'/);
 assert.doesNotMatch(releaseSql,/set end_date=s\.vacate_date/);
});

test('workspace exposes the feature only through the contracts permission boundary',()=>{
 assert.match(workspace,/aq267-vacating-settlement/);
 assert.match(workspace,/vacating\.hidden=.*access\?\.permissions\?\.contracts\?\.read!==true/);
 assert.match(workspace,/vacating\.hidden=.*access\?\.permissions\?\.collections\?\.read!==true/);
 assert.match(workspace,/import\('\.\/pages\/vacating-settlement\.js'\)/);
});

test('UI saves, clears, releases only after clearance, rereads canonical state and prints snapshots',()=>{
 assert.match(page,/rpc\('save'/);
 assert.match(page,/fill\(result\.settlement\)/);
 assert.match(page,/rpc\('finalize'/);
 assert.match(page,/rpc\('clearance'/);
 assert.match(page,/aqari_vacating_release/);
 assert.match(page,/إنهاء العقد وإطلاق الوحدة/);
 assert.match(page,/releaseUnit\.disabled=current\.status!=='cleared'\|\|!isManager/);
 assert.match(page,/await confirm\(result\)/);
 assert.match(page,/current\?\.status!=='released'/);
 assert.match(page,/VACATING_HANDOVER_REQUIRED/);
 assert.match(page,/VACATING_OPEN_MAINTENANCE/);
 assert.match(page,/currentRecord\.clearance_snapshot:currentRecord\.settlement_snapshot/);
 assert.match(page,/snapshot\.clearance_balances:snapshot\.final_balances/);
 assert.match(page,/urls\.create\(new Blob/);
 assert.match(page,/rpc\('get',\{lease_id:id\}\)/);
 assert.match(page,/link\.rel='noopener'/);
 assert.match(page,/createPrivateUrls\(d\)/);
 assert.doesNotMatch(page,/window\.open\('','_blank','noopener/);
});

test('document catalogue covers owner, tenant, property, finance and vacating evidence',()=>{
 for(const key of [
  'owner_identity','ownership_deed','survey_plan','utility_bill',
  'tenant_identity','commercial_registration','power_of_attorney',
  'lease_contract','contract_addendum','receipt','cheque','bank_transfer',
  'vacating_inspection','utility_clearance','vacating_notice','amicable_settlement','damage_invoice'
 ]) assert.match(documentScanner,new RegExp(`['"]${key}['"]`));
 assert.match(documentScanner,/application\/pdf/);
 assert.match(documentScanner,/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
 assert.match(documentScanner,/document_category:target\.category/);
 assert.match(documentScanner,/p_mime_type:target\.mime/);
 assert.match(documentScanner,/p_checksum:hash/);
 assert.match(documentScanner,/verified\.metadata\?\.document_category!==target\.category/);
});

test('document catalogue is constrained server-side by linked entity type',()=>{
 assert.match(documentCatalog,/when 'property' then category = any\(array\['owner_identity','ownership_deed','survey_plan','utility_bill'\]\)/);
 assert.match(documentCatalog,/when 'tenant' then category = any\(array\['tenant_identity','commercial_registration','power_of_attorney'\]\)/);
 assert.match(documentCatalog,/when 'lease' then category = any\(array\['lease_contract','contract_addendum','receipt','cheque','bank_transfer','vacating_inspection','utility_clearance','vacating_notice','amicable_settlement','damage_invoice'\]\)/);
 assert.match(documentCatalog,/p_document_type='signed_contract' and category is not null and category<>'lease_contract'/);
 assert.match(documentCatalog,/d\.metadata,p\.display_name as author_name/);
});

test('printed identity, amounts and HTML escaping remain bound to the saved snapshot after source edits',async()=>{
 const {printable:render}=await import('../src/v267/pages/vacating-settlement.js');const ctx={render};
 const snap={contract_no:'SAVED-CONTRACT',tenant_name:'SAVED-"TENANT"',property_name:'SAVED-PROPERTY',unit_no:'SAVED-UNIT',settlement_no:'SAVED-NUMBER',lease_id:'LEASE',damage_amount:'0.000',keys_returned:true,inspection_completed:true,meters_recorded:true,final_balances:{rent_balance:'1.125',rent_due_total:'1.125',rent_paid_total:'0.000',tenant_credit:'0.000',deposit_balance:'0.000'}};
 const html=ctx.render({tenant_name:'MUTATED-TENANT',contract_no:'MUTATED-CONTRACT',lease_id:'LEASE',settlement_no:'SAVED-NUMBER',settlement_snapshot:snap},'settlement');
 assert.match(html,/SAVED-&quot;TENANT&quot;/);assert.match(html,/SAVED-CONTRACT/);assert.match(html,/1\.125/);assert.doesNotMatch(html,/MUTATED/);
 assert.throws(()=>ctx.render({},'settlement'));
});
