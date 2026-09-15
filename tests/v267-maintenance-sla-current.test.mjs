import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const evidenceFix=readFileSync(new URL('../staging-database/sql/maintenance-evidence-returning-fix.sql',import.meta.url),'utf8');
const prereq=readFileSync(new URL('../staging-database/sql/maintenance-sla-escalation-prerequisite.sql',import.meta.url),'utf8');
const sla=readFileSync(new URL('../staging-database/sql/maintenance-sla-escalation.sql',import.meta.url),'utf8');
const lifecycle=readFileSync(new URL('../staging-database/sql/maintenance-sla-lifecycle-hotfix.sql',import.meta.url),'utf8');
const page=readFileSync(new URL('../src/v267/pages/maintenance-evidence.js',import.meta.url),'utf8');
const installer=readFileSync(new URL('../scripts/install-v267-maintenance-evidence.mjs',import.meta.url),'utf8');

test('hosted evidence return is qualified and keeps before/after window guards',()=>{
 assert.match(evidenceFix,/insert into private\.aqari_maintenance_evidence as evidence_row/);
 assert.match(evidenceFix,/'task_id',evidence_row\.task_id/);
 assert.match(evidenceFix,/MAINTENANCE_BEFORE_EVIDENCE_WINDOW_CLOSED/);
 assert.match(evidenceFix,/MAINTENANCE_AFTER_EVIDENCE_REQUIRES_IN_PROGRESS/);
 assert.match(evidenceFix,/MAINTENANCE_EVIDENCE_IMAGE_NOT_VERIFIED/);
 assert.match(evidenceFix,/private\.aqari_require_sensitive_aal2/);
});

test('SLA is private, manager/MFA guarded, revisioned and automatically scheduled',()=>{
 assert.match(prereq,/aqari_property_control_reject_delete/);
 assert.match(sla,/private\.aqari_property_maintenance_sla/);
 assert.match(sla,/private\.aqari_maintenance_sla_escalations/);
 assert.match(sla,/MAINTENANCE_SLA_MANAGER_ONLY/);
 assert.match(sla,/private\.aqari_require_sensitive_aal2/);
 assert.match(sla,/MAINTENANCE_SLA_REVISION_CONFLICT/);
 assert.match(sla,/cron\.schedule\('aqari_v267_maintenance_sla_escalation','\*\/15 \* \* \* \*'/);
 assert.match(sla,/maintenance_sla_escalation/);
});

test('lifecycle hotfix preserves late response and completion breaches once per task stage',()=>{
 assert.match(lifecycle,/aqari_maintenance_sla_escalations_task_stage_uq/);
 assert.match(lifecycle,/t\.started_at>=t\.assigned_at\+make_interval\(mins=>s\.response_minutes\)/);
 assert.match(lifecycle,/t\.completed_at>=t\.started_at\+make_interval\(mins=>s\.resolution_minutes\)/);
 assert.match(lifecycle,/on conflict\(workspace_id,task_id,stage\) do nothing/);
 assert.match(lifecycle,/'revisionAtDetection'/);
});

test('maintenance UI reads evidence and SLA under same session and exposes before/after and escalation',()=>{
 assert.match(page,/aqari_maintenance_evidence/);
 assert.match(page,/aqari_maintenance_sla/);
 assert.match(page,/ctx\?\.user_id!==d\.session\.bound\.user/);
 assert.match(page,/slaCtx\?\.user_id!==d\.session\.bound\.user/);
 assert.match(page,/إضافة صورة قبل التنفيذ/);
 assert.match(page,/إضافة صورة بعد التنفيذ/);
 assert.match(page,/إعداد سياسة SLA/);
 assert.match(page,/الفحص الآلي: كل 15 دقيقة/);
 assert.doesNotMatch(page,/innerHTML/);
});

test('current Property Hub installer is bounded to ownership and operations anchors',()=>{
 assert.match(installer,/ownershipProfile/);
 assert.match(installer,/أدلة الصيانة قبل\/بعد ومؤشرات الزمن/);
 assert.match(installer,/access\?\.permissions\?\.maintenance\?\.read===true/);
 assert.match(installer,/MAINTENANCE_EVIDENCE_INSTALL_FAILED/);
});
