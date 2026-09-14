-- AQARI V267 Preview/Staging only: per-property maintenance SLA and automatic management escalation.
-- Additive/repeatable. No Production connection or business fixture data.
begin;

create table if not exists private.aqari_property_maintenance_sla(
 workspace_id uuid not null,
 property_id uuid not null,
 response_minutes integer not null default 60 check(response_minutes between 5 and 10080),
 resolution_minutes integer not null default 1440 check(resolution_minutes between 5 and 43200),
 escalation_channel text not null default 'push' check(escalation_channel in('push','email')),
 is_active boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);

create table if not exists private.aqari_maintenance_sla_escalations(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 property_id uuid not null,
 task_id uuid not null,
 task_revision integer not null,
 stage text not null check(stage in('response','resolution')),
 threshold_minutes integer not null check(threshold_minutes>0),
 breached_at timestamptz not null,
 prepared_at timestamptz not null default now(),
 recipient_id uuid not null references auth.users(id),
 notification_id uuid,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,task_id) references private.aqari_property_maintenance_tasks(workspace_id,id),
 unique(workspace_id,task_id,stage,task_revision)
);
create index if not exists aqari_maintenance_sla_escalation_scope on private.aqari_maintenance_sla_escalations(workspace_id,property_id,prepared_at desc,id);

alter table private.aqari_property_maintenance_sla enable row level security;
alter table private.aqari_maintenance_sla_escalations enable row level security;
revoke all on private.aqari_property_maintenance_sla,private.aqari_maintenance_sla_escalations from public,anon,authenticated,service_role;

drop trigger if exists aqari_maintenance_sla_no_delete on private.aqari_property_maintenance_sla;
create trigger aqari_maintenance_sla_no_delete before delete on private.aqari_property_maintenance_sla
 for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_maintenance_sla_escalations_immutable on private.aqari_maintenance_sla_escalations;
create trigger aqari_maintenance_sla_escalations_immutable before update or delete on private.aqari_maintenance_sla_escalations
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_run_maintenance_sla_escalations(p_now timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r record; manager_id uuid; key text; notification_id uuid; inserted_count integer:=0; response_count integer:=0; resolution_count integer:=0; breach timestamptz; stage_value text; threshold_value integer; snap jsonb;
begin
 if p_now is null then raise invalid_parameter_value using message='INVALID_SLA_CLOCK';end if;
 for r in
  select t.*,s.response_minutes,s.resolution_minutes,s.escalation_channel
  from private.aqari_property_maintenance_tasks t
  join private.aqari_property_maintenance_sla s on s.workspace_id=t.workspace_id and s.property_id=t.property_id and s.is_active
  where (t.status='assigned' and t.assigned_at is not null and t.started_at is null and p_now>=t.assigned_at+make_interval(mins=>s.response_minutes))
     or (t.status='in_progress' and t.started_at is not null and t.completed_at is null and p_now>=t.started_at+make_interval(mins=>s.resolution_minutes))
 loop
  if r.status='assigned' then stage_value:='response';threshold_value:=r.response_minutes;breach:=r.assigned_at+make_interval(mins=>r.response_minutes);
  else stage_value:='resolution';threshold_value:=r.resolution_minutes;breach:=r.started_at+make_interval(mins=>r.resolution_minutes);end if;
  if exists(select 1 from private.aqari_maintenance_sla_escalations e where e.workspace_id=r.workspace_id and e.task_id=r.id and e.stage=stage_value and e.task_revision=r.revision) then continue;end if;
  select m.user_id into manager_id from public.aqari_memberships m
   where m.workspace_id=r.workspace_id and m.is_active and m.role::text in('owner','general_manager')
   order by case when m.role::text='general_manager' then 0 else 1 end,m.created_at limit 1;
  if manager_id is null then continue;end if;
  key:='maintenance-sla:'||r.id||':'||stage_value||':'||r.revision;
  notification_id:=gen_random_uuid();
  insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key)
   values(notification_id,r.workspace_id,'maintenance_sla_escalation',r.id::text,manager_id,r.escalation_channel,p_now,key)
   on conflict(workspace_id,idempotency_key) do nothing;
  select n.id into notification_id from private.aqari_notification_deliveries n where n.workspace_id=r.workspace_id and n.idempotency_key=key;
  snap:=jsonb_build_object('taskNo',r.task_no,'status',r.status,'assignedAt',r.assigned_at,'startedAt',r.started_at,'dueOn',r.due_on,'stage',stage_value,'thresholdMinutes',threshold_value,'breachedAt',breach,'revision',r.revision);
  insert into private.aqari_maintenance_sla_escalations(workspace_id,property_id,task_id,task_revision,stage,threshold_minutes,breached_at,recipient_id,notification_id,snapshot)
   values(r.workspace_id,r.property_id,r.id,r.revision,stage_value,threshold_value,breach,manager_id,notification_id,snap)
   on conflict(workspace_id,task_id,stage,task_revision) do nothing;
  if found then inserted_count:=inserted_count+1;if stage_value='response' then response_count:=response_count+1;else resolution_count:=resolution_count+1;end if;end if;
 end loop;
 return jsonb_build_object('preparedAt',p_now,'inserted',inserted_count,'response',response_count,'resolution',resolution_count);
end $$;
revoke all on function private.aqari_run_maintenance_sla_escalations(timestamptz) from public,anon,authenticated,service_role;

create or replace function public.aqari_maintenance_sla(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;p uuid:=p_property_id;d jsonb:=coalesce(p_data,'{}'::jsonb);existing private.aqari_property_maintenance_sla;expected bigint;actor text;why text;after_row jsonb;run_result jsonb;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can(w,'maintenance','read') or not private.aqari_can_property(w,p,'maintenance','read') then raise insufficient_privilege using message='MAINTENANCE_SLA_ACCESS_DENIED';end if;
 if p_action='context' then
  return jsonb_build_object(
   'workspace_id',w,'propertyId',p,'user_id',auth.uid(),'manager',private.aqari_manager(w),
   'canWrite',private.aqari_manager(w) and private.aqari_can(w,'maintenance','write') and private.aqari_can_property(w,p,'maintenance','write'),
   'policy',(select jsonb_build_object('responseMinutes',s.response_minutes,'resolutionMinutes',s.resolution_minutes,'channel',s.escalation_channel,'active',s.is_active,'revision',s.revision,'updatedAt',s.updated_at) from private.aqari_property_maintenance_sla s where s.workspace_id=w and s.property_id=p),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'taskNo',t.task_no,'status',t.status,'revision',t.revision,'assignedAt',t.assigned_at,'startedAt',t.started_at,'responseBreached',s.is_active and t.status='assigned' and t.assigned_at is not null and t.started_at is null and now()>=t.assigned_at+make_interval(mins=>s.response_minutes),'resolutionBreached',s.is_active and t.status='in_progress' and t.started_at is not null and t.completed_at is null and now()>=t.started_at+make_interval(mins=>s.resolution_minutes)) order by t.due_on desc,t.id) from private.aqari_property_maintenance_tasks t left join private.aqari_property_maintenance_sla s on s.workspace_id=t.workspace_id and s.property_id=t.property_id where t.workspace_id=w and t.property_id=p),'[]'::jsonb),
   'escalations',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'taskId',e.task_id,'stage',e.stage,'thresholdMinutes',e.threshold_minutes,'breachedAt',e.breached_at,'preparedAt',e.prepared_at,'notificationId',e.notification_id) order by e.prepared_at desc,e.id) from private.aqari_maintenance_sla_escalations e where e.workspace_id=w and e.property_id=p),'[]'::jsonb)
  );
 end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'maintenance','write') or not private.aqari_can_property(w,p,'maintenance','write') then raise insufficient_privilege using message='MAINTENANCE_SLA_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if p_action='prepare' then run_result:=private.aqari_run_maintenance_sla_escalations(now());return jsonb_build_object('workspace_id',w,'propertyId',p,'user_id',auth.uid(),'run',run_result);end if;
 if p_action<>'save' then raise invalid_parameter_value using message='UNKNOWN_MAINTENANCE_SLA_ACTION';end if;
 why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 1000 then raise invalid_parameter_value using message='MAINTENANCE_SLA_REASON_REQUIRED';end if;
 expected:=coalesce((d->>'revision')::bigint,0);
 select * into existing from private.aqari_property_maintenance_sla s where s.workspace_id=w and s.property_id=p for update;
 if found and existing.revision<>expected then raise serialization_failure using message='MAINTENANCE_SLA_REVISION_CONFLICT';end if;
 if not found and expected<>0 then raise serialization_failure using message='MAINTENANCE_SLA_REVISION_CONFLICT';end if;
 if coalesce((d->>'responseMinutes')::integer,0) not between 5 and 10080 or coalesce((d->>'resolutionMinutes')::integer,0) not between 5 and 43200 or d->>'channel' not in('push','email') then raise invalid_parameter_value using message='INVALID_MAINTENANCE_SLA';end if;
 insert into private.aqari_property_maintenance_sla(workspace_id,property_id,response_minutes,resolution_minutes,escalation_channel,is_active,revision,created_by,updated_by)
 values(w,p,(d->>'responseMinutes')::integer,(d->>'resolutionMinutes')::integer,d->>'channel',coalesce((d->>'active')::boolean,true),1,auth.uid(),auth.uid())
 on conflict(workspace_id,property_id) do update set response_minutes=excluded.response_minutes,resolution_minutes=excluded.resolution_minutes,escalation_channel=excluded.escalation_channel,is_active=excluded.is_active,revision=private.aqari_property_maintenance_sla.revision+1,updated_by=auth.uid(),updated_at=now();
 select to_jsonb(s) into after_row from private.aqari_property_maintenance_sla s where s.workspace_id=w and s.property_id=p;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,'maintenance',p,'sla_policy_save',auth.uid(),actor,why,case when existing.property_id is null then null else to_jsonb(existing) end,after_row);
 return jsonb_build_object('workspace_id',w,'propertyId',p,'user_id',auth.uid(),'record',after_row);
end $$;
revoke all on function public.aqari_maintenance_sla(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_maintenance_sla(uuid,uuid,text,jsonb) to authenticated;

-- Supabase Preview uses pg_cron. Recreate one bounded system job so SLA breaches are prepared without a browser session.
do $$
declare j bigint;
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  for j in select jobid from cron.job where jobname='aqari_v267_maintenance_sla_escalation' loop perform cron.unschedule(j);end loop;
  perform cron.schedule('aqari_v267_maintenance_sla_escalation','*/15 * * * *','select private.aqari_run_maintenance_sla_escalations(now());');
 end if;
end $$;

commit;