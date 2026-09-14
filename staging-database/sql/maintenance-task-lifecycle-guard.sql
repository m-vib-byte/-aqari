-- AQARI V267 recurring maintenance task lifecycle integrity.
-- PREVIEW/STAGING ONLY. Apply after maintenance-workflow.sql.
-- Additive and repeatable: existing historical rows are not rewritten.
begin;

create or replace function private.aqari_guard_periodic_maintenance_task() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.workspace_id is distinct from old.workspace_id
     or new.id is distinct from old.id
     or new.plan_id is distinct from old.plan_id
     or new.property_id is distinct from old.property_id
     or new.due_on is distinct from old.due_on
     or new.task_no is distinct from old.task_no then
   raise exception 'MAINTENANCE_TASK_IDENTITY_IMMUTABLE' using errcode='23514';
  end if;

  if old.completed_at is not null and (
       new.completed_at is distinct from old.completed_at
       or new.completed_by is distinct from old.completed_by
       or new.completion_document_id is distinct from old.completion_document_id
       or new.photo_document_ids is distinct from old.photo_document_ids
       or new.cost is distinct from old.cost) then
   raise exception 'COMPLETED_MAINTENANCE_TASK_IMMUTABLE' using errcode='23514';
  end if;
  if old.cancelled_at is not null and (
       new.cancelled_at is distinct from old.cancelled_at
       or new.cancelled_by is distinct from old.cancelled_by
       or new.cancellation_reason is distinct from old.cancellation_reason) then
   raise exception 'CANCELLED_MAINTENANCE_TASK_IMMUTABLE' using errcode='23514';
  end if;
  if old.started_at is not null and new.started_at is distinct from old.started_at then
   raise exception 'MAINTENANCE_TASK_START_IMMUTABLE' using errcode='23514';
  end if;

  if new.status is distinct from old.status and not (
    (old.status='scheduled' and new.status in('assigned','cancelled'))
    or (old.status='assigned' and new.status in('in_progress','cancelled'))
    or (old.status='in_progress' and new.status in('completed','cancelled'))
  ) then
   raise exception 'INVALID_MAINTENANCE_TASK_TRANSITION' using errcode='23514';
  end if;
 end if;

 if tg_op='INSERT' and new.status not in('scheduled','assigned') then
  raise exception 'INVALID_INITIAL_MAINTENANCE_TASK_STATUS' using errcode='23514';
 end if;

 if new.status='scheduled' then
  if new.assigned_vendor_id is not null or new.assigned_by is not null or new.assigned_at is not null
     or new.started_at is not null or new.completed_at is not null or new.cancelled_at is not null then
   raise exception 'INVALID_SCHEDULED_MAINTENANCE_TASK' using errcode='23514';
  end if;
 elsif new.status='assigned' then
  if new.assigned_vendor_id is null or new.assigned_by is null or new.assigned_at is null
     or new.started_at is not null or new.completed_at is not null or new.cancelled_at is not null then
   raise exception 'INVALID_ASSIGNED_MAINTENANCE_TASK' using errcode='23514';
  end if;
 elsif new.status='in_progress' then
  if new.assigned_vendor_id is null or new.assigned_by is null or new.assigned_at is null or new.started_at is null
     or new.started_at < new.assigned_at or new.completed_at is not null or new.cancelled_at is not null then
   raise exception 'INVALID_ACTIVE_MAINTENANCE_TASK' using errcode='23514';
  end if;
 elsif new.status='completed' then
  if new.assigned_vendor_id is null or new.assigned_by is null or new.assigned_at is null or new.started_at is null
     or new.completed_by is null or new.completed_at is null or new.completion_document_id is null
     or jsonb_typeof(new.photo_document_ids) is distinct from 'array'
     or jsonb_array_length(new.photo_document_ids)<1
     or new.started_at < new.assigned_at or new.completed_at < new.started_at
     or new.cancelled_at is not null then
   raise exception 'INVALID_COMPLETED_MAINTENANCE_TASK' using errcode='23514';
  end if;
 elsif new.status='cancelled' then
  if new.cancelled_by is null or new.cancelled_at is null or length(btrim(new.cancellation_reason))<3
     or new.completed_at is not null then
   raise exception 'INVALID_CANCELLED_MAINTENANCE_TASK' using errcode='23514';
  end if;
 end if;
 return new;
end $$;

revoke all on function private.aqari_guard_periodic_maintenance_task() from public,anon,authenticated;
drop trigger if exists aqari_periodic_maintenance_task_lifecycle_guard on private.aqari_property_maintenance_tasks;
create trigger aqari_periodic_maintenance_task_lifecycle_guard
before insert or update on private.aqari_property_maintenance_tasks
for each row execute function private.aqari_guard_periodic_maintenance_task();

commit;
