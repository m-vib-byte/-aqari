import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=readFileSync(new URL('../staging-database/sql/vacating-settlement.sql',import.meta.url),'utf8');
const hardening=readFileSync(new URL('../staging-database/sql/vacating-settlement-hardening.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/vacating-settlement.js',import.meta.url),'utf8');
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

test('workspace exposes the feature only through the contracts permission boundary',()=>{
 assert.match(workspace,/aq267-vacating-settlement/);
 assert.match(workspace,/vacating\.hidden=access\?\.permissions\?\.contracts\?\.read!==true/);
 assert.match(workspace,/import\('\.\/pages\/vacating-settlement\.js'\)/);
});

test('UI saves then renders the canonical server response and prints saved snapshots',()=>{
 assert.match(page,/rpc\('save'/);
 assert.match(page,/fill\(result\.settlement\)/);
 assert.match(page,/rpc\('finalize'/);
 assert.match(page,/rpc\('clearance'/);
 assert.match(page,/record\.clearance_snapshot:record\.settlement_snapshot/);
 assert.match(page,/snapshot\.clearance_balances:snapshot\.final_balances/);
 assert.match(page,/window\.open\('','_blank'\)/);
 assert.match(page,/w\.opener=null/);
 assert.doesNotMatch(page,/window\.open\('','_blank','noopener/);
});
