-- AQARI V267 Preview/Staging only. G08-04 work-order assignment/start/completion timing.
-- Historical rows are not backfilled: missing old timestamps remain explicitly unknown.
begin;
alter table private.aqari_work_orders
 add column if not exists assigned_at timestamptz,
 add column if not exists started_at timestamptz;

create or replace function private.aqari_work_order_execution_timestamps_guard()
returns trigger
language plpgsql
set search_path=''
as $$
declare
 server_time timestamptz:=pg_catalog.clock_timestamp();
begin
 if tg_op='INSERT' then
  if new.assigned_at is not null or new.started_at is not null or new.completed_at is not null then
   raise exception 'WORK_ORDER_EXECUTION_TIME_SERVER_MANAGED' using errcode='23514';
  end if;
  return new;
 end if;

 if old.assigned_at is not null and new.assigned_at is distinct from old.assigned_at then
  raise exception 'WORK_ORDER_ASSIGNED_AT_IMMUTABLE' using errcode='23514';
 end if;
 if old.started_at is not null and new.started_at is distinct from old.started_at then
  raise exception 'WORK_ORDER_STARTED_AT_IMMUTABLE' using errcode='23514';
 end if;
 if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
  raise exception 'WORK_ORDER_COMPLETED_AT_IMMUTABLE' using errcode='23514';
 end if;

 if old.assigned_at is null and new.assigned_at is not null
    and not (old.status='approved' and new.status='assigned') then
  raise exception 'WORK_ORDER_ASSIGNED_AT_SERVER_MANAGED' using errcode='23514';
 end if;
 if old.started_at is null and new.started_at is not null
    and not (old.status='assigned' and new.status='in_progress') then
  raise exception 'WORK_ORDER_STARTED_AT_SERVER_MANAGED' using errcode='23514';
 end if;
 if old.completed_at is null and new.completed_at is not null
    and not (old.status='in_progress' and new.status='completed') then
  raise exception 'WORK_ORDER_COMPLETED_AT_SERVER_MANAGED' using errcode='23514';
 end if;

 if old.status='approved' and new.status='assigned' and old.assigned_at is null then
  new.assigned_at:=server_time;
 end if;
 if old.status='assigned' and new.status='in_progress' and old.started_at is null then
  new.started_at:=server_time;
 end if;
 if old.status='in_progress' and new.status='completed' and old.completed_at is null then
  new.completed_at:=server_time;
 end if;

 if new.assigned_at is not null and new.started_at is not null and new.started_at<new.assigned_at then
  raise exception 'WORK_ORDER_EXECUTION_TIME_ORDER_INVALID' using errcode='23514';
 end if;
 if new.started_at is not null and new.completed_at is not null and new.completed_at<new.started_at then
  raise exception 'WORK_ORDER_EXECUTION_TIME_ORDER_INVALID' using errcode='23514';
 end if;
 return new;
end $$;

revoke all on function private.aqari_work_order_execution_timestamps_guard() from public,anon,authenticated;
drop trigger if exists aqari_work_order_execution_timestamps_guard on private.aqari_work_orders;
create trigger aqari_work_order_execution_timestamps_guard
 before insert or update on private.aqari_work_orders
 for each row execute function private.aqari_work_order_execution_timestamps_guard();
commit;
