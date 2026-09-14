import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const guard=readFileSync(new URL('../staging-database/sql/maintenance-task-lifecycle-guard.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../staging-database/sql/maintenance-workflow.sql',import.meta.url),'utf8');

test('periodic maintenance task identity cannot drift after creation',()=>{
 for(const field of ['workspace_id','id','plan_id','property_id','due_on','task_no']){
  assert.match(guard,new RegExp(`new\\.${field} is distinct from old\\.${field}`));
 }
 assert.match(guard,/MAINTENANCE_TASK_IDENTITY_IMMUTABLE/);
});

test('server guard permits only the documented forward lifecycle',()=>{
 assert.match(guard,/old\.status='scheduled' and new\.status in\('assigned','cancelled'\)/);
 assert.match(guard,/old\.status='assigned' and new\.status in\('in_progress','cancelled'\)/);
 assert.match(guard,/old\.status='in_progress' and new\.status in\('completed','cancelled'\)/);
 assert.match(guard,/INVALID_MAINTENANCE_TASK_TRANSITION/);
 assert.match(guard,/new\.status not in\('scheduled','assigned'\)/);
});

test('assignment and execution timestamps are required and ordered',()=>{
 assert.match(guard,/new\.assigned_vendor_id is null or new\.assigned_by is null or new\.assigned_at is null/);
 assert.match(guard,/new\.started_at is null/);
 assert.match(guard,/new\.started_at < new\.assigned_at/);
 assert.match(guard,/new\.completed_at < new\.started_at/);
 assert.match(guard,/MAINTENANCE_TASK_START_IMMUTABLE/);
});

test('completion requires archived evidence and cannot be rewritten later',()=>{
 assert.match(guard,/new\.completion_document_id is null/);
 assert.match(guard,/jsonb_array_length\(new\.photo_document_ids\)<1/);
 assert.match(guard,/COMPLETED_MAINTENANCE_TASK_IMMUTABLE/);
 assert.match(workflow,/p_action='complete_task'/);
 assert.match(workflow,/COMPLETION_DOCUMENT_REQUIRED/);
 assert.match(workflow,/COMPLETION_PHOTOS_REQUIRED/);
});

test('cancellation requires a recorded actor, timestamp and reason and is immutable',()=>{
 assert.match(guard,/new\.cancelled_by is null or new\.cancelled_at is null or length\(btrim\(new\.cancellation_reason\)\)<3/);
 assert.match(guard,/CANCELLED_MAINTENANCE_TASK_IMMUTABLE/);
 assert.match(workflow,/p_action in\('assign_task','start_task','cancel_task'\)/);
});

test('workflow still advances recurrence from the persisted due date after verified completion',()=>{
 assert.match(workflow,/select task\.due_on\+p\.frequency_days into next_date/);
 assert.match(workflow,/set next_due_on=next_date,revision=p\.revision\+1/);
});
