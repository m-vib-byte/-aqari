import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../staging-database/sql/maintenance-evidence-sla.sql',import.meta.url),'utf8');
const hotfix=readFileSync(new URL('../staging-database/sql/maintenance-evidence-returning-fix.sql',import.meta.url),'utf8');
const hosted=readFileSync(new URL('../staging-database/tests/maintenance_evidence_hosted_acceptance.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/maintenance-evidence.js',import.meta.url),'utf8');
const hub=readFileSync(new URL('../src/v267/pages/property-hub.js',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build-vercel.mjs',import.meta.url),'utf8');
const verify=readFileSync(new URL('../scripts/verify-staging-runtime.mjs',import.meta.url),'utf8');

test('before and after evidence is private immutable and separately classified',()=>{
 assert.match(sql,/private\.aqari_maintenance_evidence/);
 assert.match(sql,/stage text not null check\(stage in\('before','after'\)\)/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on private\.aqari_maintenance_evidence from public,anon,authenticated,service_role/);
 assert.match(sql,/aqari_maintenance_evidence_immutable/);
 assert.match(sql,/private\.aqari_reject_immutable_change\(\)/);
});

test('new tasks cannot start without before evidence or complete without after evidence',()=>{
 assert.match(sql,/evidence_policy_version set default 1/);
 assert.match(sql,/MAINTENANCE_BEFORE_EVIDENCE_REQUIRED/);
 assert.match(sql,/MAINTENANCE_AFTER_EVIDENCE_REQUIRED/);
 assert.match(sql,/before update of status on private\.aqari_property_maintenance_tasks/);
 assert.match(sql,/new\.status='in_progress'/);
 assert.match(sql,/new\.status='completed'/);
});

test('legacy tasks are distinguished instead of fabricating missing historical before evidence',()=>{
 assert.match(sql,/set evidence_policy_version=0 where evidence_policy_version is null/);
 assert.match(page,/مهمة قديمة/);
 assert.match(page,/policyVersion/);
});

test('evidence write is property scoped, image only, MFA protected and audited',()=>{
 assert.match(sql,/private\.aqari_can_property\(w,p,'maintenance','write'\)/);
 assert.match(sql,/private\.aqari_require_sensitive_aal2\(w\)/);
 assert.match(sql,/private\.aqari_operations_document\(w,p,document_id\)/);
 assert.match(sql,/image\/jpeg','image\/png','image\/webp','image\/heic','image\/heif/);
 assert.match(sql,/MAINTENANCE_EVIDENCE_IMAGE_NOT_VERIFIED/);
 assert.match(sql,/insert into private\.aqari_operations_audit/);
 assert.match(sql,/evidence_'\|\|stage_value/);
});

test('hosted write return is table-qualified so PL/pgSQL variables cannot shadow columns',()=>{
 assert.match(hotfix,/insert into private\.aqari_maintenance_evidence as evidence_row/);
 assert.match(hotfix,/'task_id',evidence_row\.task_id/);
 assert.match(hotfix,/'document_id',evidence_row\.document_id/);
 assert.match(hotfix,/'captured_at',evidence_row\.captured_at/);
 assert.match(hotfix,/grant execute on function public\.aqari_maintenance_evidence\(uuid,uuid,text,jsonb\) to authenticated/);
});

test('rollback-only hosted probe covers guards, real RPC, audit, timing and cleanup',()=>{
 assert.match(hosted,/^begin;/m);
 assert.match(hosted,/public\.aqari_maintenance_evidence/);
 assert.match(hosted,/EXPECTED_BEFORE_EVIDENCE_GUARD_DID_NOT_FIRE/);
 assert.match(hosted,/EXPECTED_AFTER_EVIDENCE_GUARD_DID_NOT_FIRE/);
 assert.match(hosted,/EVIDENCE_AUDIT_INVALID/);
 assert.match(hosted,/CONTEXT_TIMING_READBACK_INVALID/);
 assert.match(hosted,/EXPECTED_IMMUTABILITY_GUARD_DID_NOT_FIRE/);
 assert.match(hosted,/^rollback;/m);
 assert.match(hosted,/fixture_tasks_remaining/);
 assert.match(hosted,/fixture_documents_remaining/);
});

test('context exposes measured aging without inventing an SLA target',()=>{
 assert.match(sql,/'overdueDays'/);
 assert.match(sql,/'needsEscalation'/);
 assert.match(sql,/'responseMinutes'/);
 assert.match(sql,/'resolutionMinutes'/);
 assert.match(page,/لا تُفترض أهداف SLA غير مهيأة/);
});

test('UI rechecks bound session and never uses HTML injection',()=>{
 assert.match(page,/aqari_maintenance_evidence/);
 assert.match(page,/ctx\?\.workspace_id!==d\.session\.bound\.workspace/);
 assert.match(page,/ctx\?\.propertyId!==propertyId/);
 assert.match(page,/ctx\?\.user_id!==d\.session\.bound\.user/);
 assert.match(page,/p_action:'add'/);
 assert.match(page,/صورة قبل التنفيذ/);
 assert.match(page,/صورة بعد التنفيذ/);
 assert.doesNotMatch(page,/innerHTML/);
});

test('Property Hub exposes the evidence view and Preview build validates it',()=>{
 assert.match(hub,/maintenance-evidence\.js/);
 assert.match(hub,/openMaintenanceEvidence\(propertyId\)/);
 assert.match(hub,/أدلة الصيانة/);
 assert.match(verify,/src\/v267\/pages\/maintenance-evidence\.js/);
 assert.match(build,/tests\/v267-maintenance-evidence-sla\.test\.mjs/);
});
