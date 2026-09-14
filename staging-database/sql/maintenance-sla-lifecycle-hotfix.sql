-- AQARI V267 Preview/Staging only: do not lose an SLA breach when a task advances before the periodic scanner runs.
begin;

alter table private.aqari_maintenance_sla_escalations
 drop constraint if exists aqari_maintenance_sla_escalations_workspace_id_task_id_stage_task_revision_key;
alter table private.aqari_maintenance_sla_escalations
 drop constraint if exists aqari_maintenance_sla_escalations_workspace_id_task_id_stage_key;
create unique index if not exists aqari_maintenance_sla_escalations_task_stage_uq
 on private.aqari_maintenance_sla_escalations(workspace_id,task_id,stage);

create or replace function private.aqari_run_maintenance_sla_escalations(p_now timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r record;manager_id uuid;key text;notification_id uuid;inserted_count integer:=0;response_count integer:=0;resolution_count integer:=0;snap jsonb;
begin
 if p_now is null then raise invalid_parameter_value using message='INVALID_SLA_CLOCK';end if;
 for r in
  select t.*,s.escalation_channel,b.stage,b.threshold_minutes,b.breached_at
  from private.aqari_property_maintenance_tasks t
  join private.aqari_property_maintenance_sla s on s.workspace_id=t.workspace_id and s.property_id=t.property_id and s.is_active
  cross join lateral(
   select 'response'::text as stage,s.response_minutes as threshold_minutes,t.assigned_at+make_interval(mins=>s.response_minutes) as breached_at
   where t.assigned_at is not null
     and ((t.started_at is null and t.status='assigned' and p_now>=t.assigned_at+make_interval(mins=>s.response_minutes))
       or (t.started_at is not null and t.started_at>=t.assigned_at+make_interval(mins=>s.response_minutes)))
   union all
   select 'resolution'::text,s.resolution_minutes,t.started_at+make_interval(mins=>s.resolution_minutes)
   where t.started_at is not null
     and ((t.completed_at is null and t.status='in_progress' and p_now>=t.started_at+make_interval(mins=>s.resolution_minutes))
       or (t.completed_at is not null and t.completed_at>=t.started_at+make_interval(mins=>s.resolution_minutes)))
  ) b
 loop
  if exists(select 1 from private.aqari_maintenance_sla_escalations e where e.workspace_id=r.workspace_id and e.task_id=r.id and e.stage=r.stage) then continue;end if;
  select m.user_id into manager_id from public.aqari_memberships m
   where m.workspace_id=r.workspace_id and m.is_active and m.role::text in('owner','general_manager')
   order by case when m.role::text='general_manager' then 0 else 1 end,m.created_at limit 1;
  if manager_id is null then continue;end if;
  key:='maintenance-sla:'||r.id||':'||r.stage;
  notification_id:=gen_random_uuid();
  insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key)
   values(notification_id,r.workspace_id,'maintenance_sla_escalation',r.id::text,manager_id,r.escalation_channel,p_now,key)
   on conflict(workspace_id,idempotency_key) do nothing;
  select n.id into notification_id from private.aqari_notification_deliveries n where n.workspace_id=r.workspace_id and n.idempotency_key=key;
  snap:=jsonb_build_object('taskNo',r.task_no,'status',r.status,'assignedAt',r.assigned_at,'startedAt',r.started_at,'completedAt',r.completed_at,'dueOn',r.due_on,'stage',r.stage,'thresholdMinutes',r.threshold_minutes,'breachedAt',r.breached_at,'revisionAtDetection',r.revision);
  insert into private.aqari_maintenance_sla_escalations(workspace_id,property_id,task_id,task_revision,stage,threshold_minutes,breached_at,recipient_id,notification_id,snapshot)
   values(r.workspace_id,r.property_id,r.id,r.revision,r.stage,r.threshold_minutes,r.breached_at,manager_id,notification_id,snap)
   on conflict(workspace_id,task_id,stage) do nothing;
  if found then
   inserted_count:=inserted_count+1;
   if r.stage='response' then response_count:=response_count+1;else resolution_count:=resolution_count+1;end if;
  end if;
 end loop;
 return jsonb_build_object('preparedAt',p_now,'inserted',inserted_count,'response',response_count,'resolution',resolution_count);
end $$;
revoke all on function private.aqari_run_maintenance_sla_escalations(timestamptz) from public,anon,authenticated,service_role;

commit;