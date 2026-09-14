-- AQARI V267 hosted SLA escalation acceptance probe.
-- Run only against isolated Preview/Staging. Creates transaction-scoped QA rows and rolls back completely.
begin;

create temp table v267_sla_probe_ctx on commit drop as
select m.workspace_id,m.user_id,p.id as property_id,
       gen_random_uuid() as plan_id,gen_random_uuid() as response_task_id,gen_random_uuid() as resolution_task_id,
       coalesce((select s.revision from private.aqari_property_maintenance_sla s where s.workspace_id=m.workspace_id and s.property_id=p.id),0) as existing_sla_revision
from public.aqari_memberships m
join public.aqari_properties p on p.workspace_id=m.workspace_id
where m.is_active and m.role::text in('owner','general_manager')
order by case when m.role::text='general_manager' then 0 else 1 end,m.workspace_id,p.id
limit 1;

do $$ begin if not exists(select 1 from v267_sla_probe_ctx) then raise exception 'NO_MANAGER_PROPERTY_FIXTURE';end if;end $$;

select set_config('request.jwt.claim.sub',(select user_id::text from v267_sla_probe_ctx),true);
select set_config('request.jwt.claims',(
 select jsonb_build_object('sub',user_id::text,'role','authenticated','aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text from v267_sla_probe_ctx
),true);

select public.aqari_maintenance_sla(
 (select workspace_id from v267_sla_probe_ctx),(select property_id from v267_sla_probe_ctx),'save',
 jsonb_build_object('responseMinutes',30,'resolutionMinutes',90,'channel','push','active',true,
                    'revision',(select existing_sla_revision from v267_sla_probe_ctx),'reason','rollback-only hosted SLA policy probe')
);

do $$ declare ctx jsonb;
begin
 select public.aqari_maintenance_sla((select workspace_id from v267_sla_probe_ctx),(select property_id from v267_sla_probe_ctx),'context','{}'::jsonb) into ctx;
 if coalesce((ctx->'policy'->>'responseMinutes')::int,0)<>30 or coalesce((ctx->'policy'->>'resolutionMinutes')::int,0)<>90 or ctx->'policy'->>'channel'<>'push' then raise exception 'SLA_POLICY_READBACK_INVALID:%',ctx->'policy';end if;
 if not coalesce((ctx->>'canWrite')::boolean,false) then raise exception 'SLA_MANAGER_WRITE_CONTEXT_INVALID';end if;
end $$;

insert into private.aqari_maintenance_plans(id,workspace_id,property_id,asset_kind,title,frequency_days,next_due_on,created_by)
select plan_id,workspace_id,property_id,'electrical','V267 rollback-only SLA escalation probe',30,(now() at time zone 'Asia/Kuwait')::date,user_id from v267_sla_probe_ctx;

-- The response fixture has already advanced to in_progress after a late start. The scanner must still retain the missed response breach.
insert into private.aqari_property_maintenance_tasks(id,workspace_id,plan_id,property_id,due_on,task_no,status,description,assigned_by,assigned_at,started_at)
select response_task_id,workspace_id,plan_id,property_id,(now() at time zone 'Asia/Kuwait')::date,
       'QA-SLA-RESPONSE','in_progress','rollback-only late-start response SLA probe',user_id,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour'
from v267_sla_probe_ctx
union all
-- Resolution fixture started within the 30-minute response target, then exceeded the 90-minute resolution target.
select resolution_task_id,workspace_id,plan_id,property_id,((now() at time zone 'Asia/Kuwait')::date-1),
       'QA-SLA-RESOLUTION','in_progress','rollback-only resolution SLA probe',user_id,statement_timestamp()-interval '3 hours 15 minutes',statement_timestamp()-interval '3 hours'
from v267_sla_probe_ctx;

do $$ declare r jsonb;
begin
 select public.aqari_maintenance_sla((select workspace_id from v267_sla_probe_ctx),(select property_id from v267_sla_probe_ctx),'prepare','{}'::jsonb)->'run' into r;
 if coalesce((r->>'inserted')::int,0)<>2 or coalesce((r->>'response')::int,0)<>1 or coalesce((r->>'resolution')::int,0)<>1 then raise exception 'SLA_FIRST_RUN_INVALID:%',r;end if;
end $$;

do $$ declare r jsonb;
begin
 select public.aqari_maintenance_sla((select workspace_id from v267_sla_probe_ctx),(select property_id from v267_sla_probe_ctx),'prepare','{}'::jsonb)->'run' into r;
 if coalesce((r->>'inserted')::int,-1)<>0 then raise exception 'SLA_SECOND_RUN_NOT_IDEMPOTENT:%',r;end if;
end $$;

do $$ declare response_count int;resolution_count int;notification_count int;audit_count int;ctx jsonb;response_snapshot jsonb;
begin
 select count(*) filter(where stage='response'),count(*) filter(where stage='resolution') into response_count,resolution_count
 from private.aqari_maintenance_sla_escalations where task_id in((select response_task_id from v267_sla_probe_ctx),(select resolution_task_id from v267_sla_probe_ctx));
 if response_count<>1 or resolution_count<>1 then raise exception 'SLA_ESCALATION_COUNTS_INVALID:%/%',response_count,resolution_count;end if;
 select snapshot into response_snapshot from private.aqari_maintenance_sla_escalations where task_id=(select response_task_id from v267_sla_probe_ctx) and stage='response';
 if response_snapshot->>'status'<>'in_progress' or response_snapshot->>'startedAt' is null then raise exception 'LATE_RESPONSE_BREACH_NOT_PRESERVED:%',response_snapshot;end if;
 select count(*) into notification_count from private.aqari_notification_deliveries
 where kind='maintenance_sla_escalation' and aggregate_id in((select response_task_id::text from v267_sla_probe_ctx),(select resolution_task_id::text from v267_sla_probe_ctx));
 if notification_count<>2 then raise exception 'SLA_NOTIFICATION_COUNT_INVALID:%',notification_count;end if;
 select count(*) into audit_count from private.aqari_operations_audit where entity_id=(select property_id from v267_sla_probe_ctx) and action='sla_policy_save';
 if audit_count<1 then raise exception 'SLA_POLICY_AUDIT_MISSING';end if;
 select public.aqari_maintenance_sla((select workspace_id from v267_sla_probe_ctx),(select property_id from v267_sla_probe_ctx),'context','{}'::jsonb) into ctx;
 if jsonb_array_length(ctx->'escalations')<>2 then raise exception 'SLA_CONTEXT_ESCALATION_READBACK_INVALID';end if;
 if not exists(select 1 from jsonb_array_elements(ctx->'tasks') t where t->>'id'=(select resolution_task_id::text from v267_sla_probe_ctx) and coalesce((t->>'resolutionBreached')::boolean,false)) then raise exception 'SLA_RESOLUTION_BREACH_READBACK_INVALID';end if;
end $$;

do $$
begin
 begin
  update private.aqari_maintenance_sla_escalations set threshold_minutes=999 where task_id=(select response_task_id from v267_sla_probe_ctx);
  raise exception 'EXPECTED_SLA_ESCALATION_IMMUTABILITY_GUARD_DID_NOT_FIRE';
 exception when check_violation then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
 begin
  delete from private.aqari_property_maintenance_sla where workspace_id=(select workspace_id from v267_sla_probe_ctx) and property_id=(select property_id from v267_sla_probe_ctx);
  raise exception 'EXPECTED_SLA_POLICY_DELETE_GUARD_DID_NOT_FIRE';
 exception when check_violation then if sqlerrm<>'PROPERTY_CONTROL_DELETE_FORBIDDEN' then raise;end if;end;
end $$;

rollback;

select
 (select count(*)::int from private.aqari_property_maintenance_tasks where task_no in('QA-SLA-RESPONSE','QA-SLA-RESOLUTION')) as fixture_tasks_remaining,
 (select count(*)::int from private.aqari_maintenance_plans where title='V267 rollback-only SLA escalation probe') as fixture_plans_remaining,
 (select count(*)::int from private.aqari_notification_deliveries where kind='maintenance_sla_escalation' and idempotency_key like 'maintenance-sla:%') as qa_notifications_remaining;