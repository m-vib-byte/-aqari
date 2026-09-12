-- V267 recurring maintenance workflow completion. Apply after maintenance-automation.sql.
-- Additive/repeatable SQL; no production connection or fixture business data.
begin;
alter table private.aqari_property_maintenance_tasks
 add column if not exists assigned_by uuid,
 add column if not exists assigned_at timestamptz,
 add column if not exists started_at timestamptz,
 add column if not exists cancelled_by uuid,
 add column if not exists cancelled_at timestamptz,
 add column if not exists cancellation_reason text not null default '';
create or replace function private.aqari_maintenance_workflow(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;ident uuid;expected integer;plan private.aqari_maintenance_plans;task private.aqari_property_maintenance_tasks;before_row jsonb;after_row jsonb;prop uuid;doc uuid;actor text;why text;as_of_date date;next_date date;vendor_id uuid;contract private.aqari_vendor_contracts;photo jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'maintenance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>16000 then raise exception 'INVALID_MAINTENANCE_PLAN_DATA' using errcode='22023';end if;
 if p_action='list' then
  return jsonb_build_object(
   'workflow_version',2,'can_complete',private.aqari_can(w,'maintenance','write') and private.aqari_can(w,'documents','read'),'manager',private.aqari_manager(w),'can_write',private.aqari_can(w,'maintenance','write'),
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=w and private.aqari_can_property(w,p.id,'maintenance','read')),
   'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name) order by v.name),'[]') from private.aqari_vendors v where v.workspace_id=w and v.status='active'),
   'contracts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'contract_no',c.contract_no,'property_id',c.property_id,'vendor_id',c.vendor_id,'starts_on',c.starts_on,'ends_on',c.ends_on,'service_kind',c.service_kind) order by c.ends_on),'[]') from private.aqari_vendor_contracts c join private.aqari_vendors v on v.workspace_id=c.workspace_id and v.id=c.vendor_id where c.workspace_id=w and c.status in('approved','active') and v.status='active' and (c.property_id is null or private.aqari_can_property(w,c.property_id,'maintenance','read'))),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'title',doc.title,'document_no',doc.document_no,'property_id',p.id,'mime_type',doc.mime_type) order by doc.created_at desc),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded' and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,doc.entity_type,doc.entity_ref,'read') and private.aqari_can_property(w,p.id,'maintenance','read')),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by p.next_due_on,p.id),'[]') from private.aqari_maintenance_plans p where p.workspace_id=w and private.aqari_can_property(w,p.property_id,'maintenance','read')),
   'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.due_on desc,t.id),'[]') from private.aqari_property_maintenance_tasks t where t.workspace_id=w and private.aqari_can_property(w,t.property_id,'maintenance','read')),
   'alerts',(select coalesce(jsonb_agg(to_jsonb(n) order by n.scheduled_for desc,n.id),'[]') from (select * from private.aqari_notification_deliveries n where n.workspace_id=w and n.kind in('maintenance_due','lease_expiry','vendor_contract_expiry') and (private.aqari_manager(w) or (n.kind='maintenance_due' and exists(select 1 from private.aqari_maintenance_plans p where p.workspace_id=w and p.id::text=n.aggregate_id and private.aqari_can_property(w,p.property_id,'maintenance','read')))) order by n.scheduled_for desc limit 100)n),
   'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.as_of desc),'[]') from (select * from private.aqari_alert_preparation_runs r where r.workspace_id=w and private.aqari_manager(w) order by r.as_of desc limit 30)r)
  );
 end if;
 if not private.aqari_can(w,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 if p_action='prepare_alerts' then
  if not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  as_of_date:=coalesce(nullif(d->>'as_of','')::date,(now() at time zone 'Asia/Kuwait')::date);
  return private.aqari_prepare_operational_alerts(w,as_of_date);
 end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise exception 'PLAN_OR_TASK_ID_REQUIRED' using errcode='22023';end if;
 if p_action='save' then
  prop:=nullif(d->>'property_id','')::uuid;if not private.aqari_can_property(w,prop,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select * into plan from private.aqari_maintenance_plans p where p.workspace_id=w and p.id=ident for update;
  if plan.id is not null and not private.aqari_can_property(w,plan.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if plan.id is not null and prop is distinct from plan.property_id then raise exception 'PLAN_PROPERTY_IMMUTABLE' using errcode='23514';end if;
  expected:=coalesce((d->>'revision')::integer,0);if coalesce(plan.revision,0) is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if d->>'asset_kind' not in('elevator','air_conditioning','fire_system','water_tank','generator','plumbing','electrical','other') or length(btrim(coalesce(d->>'title',''))) not between 3 and 200 or (d->>'frequency_days')::integer not between 1 and 730 then raise exception 'INVALID_MAINTENANCE_PLAN' using errcode='22023';end if;
  if plan.id is not null and exists(select 1 from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.plan_id=plan.id and t.status not in('completed','cancelled'))
   and (plan.next_due_on is distinct from (d->>'next_due_on')::date or plan.frequency_days is distinct from (d->>'frequency_days')::integer or plan.vendor_contract_id is distinct from nullif(d->>'vendor_contract_id','')::uuid or plan.asset_kind is distinct from d->>'asset_kind') then raise exception 'OPEN_TASK_SCHEDULE_LOCKED' using errcode='23514';end if;
  if coalesce((d->>'is_active')::boolean,true) and nullif(d->>'vendor_contract_id','') is not null then
   select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=(d->>'vendor_contract_id')::uuid;
   if not found or contract.property_id is not null and contract.property_id<>prop or contract.status not in('approved','active') or (d->>'next_due_on')::date not between contract.starts_on and contract.ends_on
    or not exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=contract.vendor_id and v.status='active') then raise exception 'VENDOR_CONTRACT_NOT_VALID_FOR_PLAN' using errcode='23514';end if;
  end if;
  before_row:=case when plan.id is null then null else to_jsonb(plan) end;
  if plan.id is null then insert into private.aqari_maintenance_plans(id,workspace_id,property_id,vendor_contract_id,asset_kind,title,frequency_days,next_due_on,warning_days,is_active,created_by)
   values(ident,w,prop,nullif(d->>'vendor_contract_id','')::uuid,d->>'asset_kind',btrim(d->>'title'),(d->>'frequency_days')::integer,(d->>'next_due_on')::date,case when jsonb_typeof(d->'warning_days')='array' and jsonb_array_length(d->'warning_days')>0 then array(select jsonb_array_elements_text(d->'warning_days')::integer) else array[90,60,30] end,coalesce((d->>'is_active')::boolean,true),auth.uid()) returning * into plan;
  else update private.aqari_maintenance_plans p set property_id=prop,vendor_contract_id=nullif(d->>'vendor_contract_id','')::uuid,asset_kind=d->>'asset_kind',title=btrim(d->>'title'),frequency_days=(d->>'frequency_days')::integer,next_due_on=(d->>'next_due_on')::date,warning_days=case when jsonb_typeof(d->'warning_days')='array' and jsonb_array_length(d->'warning_days')>0 then array(select jsonb_array_elements_text(d->'warning_days')::integer) else p.warning_days end,is_active=coalesce((d->>'is_active')::boolean,p.is_active),revision=p.revision+1,updated_at=now() where p.id=ident returning * into plan;end if;
  after_row:=to_jsonb(plan);
 elsif p_action='generate_task' then
  select * into plan from private.aqari_maintenance_plans p where p.workspace_id=w and p.id=ident and p.is_active for update;
  if not found or not private.aqari_can_property(w,plan.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if exists(select 1 from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.plan_id=plan.id and t.due_on=plan.next_due_on) then raise exception 'DUPLICATE_DUE_TASK' using errcode='23505';end if;
  vendor_id:=nullif(d->>'vendor_id','')::uuid;
  if plan.vendor_contract_id is not null then
   select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=plan.vendor_contract_id;
   if not found or contract.property_id is not null and contract.property_id<>plan.property_id or contract.status not in('approved','active') or plan.next_due_on not between contract.starts_on and contract.ends_on then raise exception 'VENDOR_CONTRACT_NOT_VALID_FOR_PLAN' using errcode='23514';end if;
   if vendor_id is not null and vendor_id<>contract.vendor_id then raise exception 'VENDOR_CONTRACT_MISMATCH' using errcode='23514';end if;
   vendor_id:=contract.vendor_id;
  end if;
  if vendor_id is not null and not exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=vendor_id and v.status='active') then raise exception 'ACTIVE_VENDOR_REQUIRED' using errcode='23514';end if;
  task.id:=nullif(d->>'task_id','')::uuid;
  if task.id is null or length(btrim(coalesce(d->>'task_no',''))) not between 3 and 80 then raise exception 'TASK_REFERENCE_REQUIRED' using errcode='22023';end if;
  insert into private.aqari_property_maintenance_tasks(id,workspace_id,plan_id,property_id,due_on,task_no,assigned_vendor_id,description,status,assigned_by,assigned_at)
   values(task.id,w,plan.id,plan.property_id,plan.next_due_on,btrim(d->>'task_no'),vendor_id,btrim(coalesce(d->>'description',plan.title)),case when vendor_id is null then 'scheduled' else 'assigned' end,case when vendor_id is not null then auth.uid() end,case when vendor_id is not null then now() end) returning * into task;
  after_row:=to_jsonb(task);
 elsif p_action in('assign_task','start_task','cancel_task') then
  -- Lock the plan before the task, matching generation/completion and preventing concurrent schedule drift.
  select p.* into plan from private.aqari_maintenance_plans p join private.aqari_property_maintenance_tasks t on t.workspace_id=p.workspace_id and t.plan_id=p.id where t.workspace_id=w and t.id=ident for update of p;
  select * into task from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.id=ident for update;
  if not found or plan.id is null or plan.property_id is distinct from task.property_id or not private.aqari_can_property(w,task.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if task.revision is distinct from (d->>'revision')::integer or task.status in('completed','cancelled') then raise serialization_failure using message='REVISION_CONFLICT';end if;
  before_row:=to_jsonb(task);why:=btrim(coalesce(d->>'reason',''));
  if length(why) not between 3 and 1000 then raise exception 'MAINTENANCE_REASON_REQUIRED' using errcode='22023';end if;
  if p_action='assign_task' then
   if task.status not in('scheduled','assigned') then raise exception 'TASK_ASSIGNMENT_CLOSED' using errcode='23514';end if;
   vendor_id:=nullif(d->>'vendor_id','')::uuid;
   if not exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=vendor_id and v.status='active') then raise exception 'ACTIVE_VENDOR_REQUIRED' using errcode='23514';end if;
   if plan.vendor_contract_id is not null then
    select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=plan.vendor_contract_id;
    if contract.property_id is not null and contract.property_id<>task.property_id or contract.vendor_id is distinct from vendor_id or contract.status not in('approved','active') or task.due_on not between contract.starts_on and contract.ends_on then raise exception 'VENDOR_CONTRACT_MISMATCH' using errcode='23514';end if;
   end if;
   update private.aqari_property_maintenance_tasks set status='assigned',assigned_vendor_id=vendor_id,assigned_by=auth.uid(),assigned_at=now(),revision=revision+1 where id=ident returning * into task;
  elsif p_action='start_task' then
   if task.status<>'assigned' or not exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=task.assigned_vendor_id and v.status='active') then raise exception 'TASK_ASSIGNMENT_REQUIRED' using errcode='23514';end if;
   if plan.vendor_contract_id is not null then
    select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=plan.vendor_contract_id;
    if not found or contract.property_id is not null and contract.property_id<>task.property_id or contract.vendor_id is distinct from task.assigned_vendor_id or contract.status not in('approved','active') or task.due_on not between contract.starts_on and contract.ends_on then raise exception 'VENDOR_CONTRACT_MISMATCH' using errcode='23514';end if;
   end if;
   update private.aqari_property_maintenance_tasks set status='in_progress',started_at=now(),revision=revision+1 where id=ident returning * into task;
  else
   update private.aqari_property_maintenance_tasks set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=why,revision=revision+1 where id=ident returning * into task;
  end if;
  after_row:=to_jsonb(task);
 elsif p_action='complete_task' then
  select p.* into plan from private.aqari_maintenance_plans p join private.aqari_property_maintenance_tasks t on t.workspace_id=p.workspace_id and t.plan_id=p.id where t.workspace_id=w and t.id=ident for update of p;
  select * into task from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.id=ident for update;
  if not found or plan.id is null or plan.property_id is distinct from task.property_id or not private.aqari_can_property(w,task.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  expected:=(d->>'revision')::integer;if task.revision is distinct from expected or task.status not in('scheduled','assigned','in_progress') then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if task.status<>'in_progress' then raise exception 'TASK_EXECUTION_REQUIRED' using errcode='23514';end if;
  if not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  doc:=nullif(d->>'completion_document_id','')::uuid;
  if not private.aqari_operations_document(w,task.property_id,doc) then raise exception 'COMPLETION_DOCUMENT_REQUIRED' using errcode='23514';end if;
  if jsonb_typeof(d->'photo_document_ids') is distinct from 'array' or jsonb_array_length(d->'photo_document_ids') not between 1 and 20 then raise exception 'COMPLETION_PHOTOS_REQUIRED' using errcode='23514';end if;
  for photo in select value from jsonb_array_elements(d->'photo_document_ids') loop
   if jsonb_typeof(photo)<>'string' or not exists(select 1 from public.aqari_documents x where x.workspace_id=w and x.id=(photo#>>'{}')::uuid and x.mime_type in('image/jpeg','image/png','image/webp','image/heic','image/heif') and private.aqari_document_entity(w,x.entity_type,x.entity_ref,'read')) or not private.aqari_operations_document(w,task.property_id,(photo#>>'{}')::uuid) then raise exception 'COMPLETION_PHOTO_NOT_VERIFIED' using errcode='23514';end if;
  end loop;
  before_row:=to_jsonb(task);why:=btrim(coalesce(d->>'reason',''));if length(why)<3 then raise exception 'COMPLETION_REASON_REQUIRED' using errcode='22023';end if;
  update private.aqari_property_maintenance_tasks t set status='completed',cost=private.aqari_hr_money(d->'cost'),photo_document_ids=coalesce(d->'photo_document_ids','[]'),completion_document_id=doc,completed_by=auth.uid(),completed_at=now(),revision=t.revision+1 where t.id=ident returning * into task;
  select task.due_on+p.frequency_days into next_date from private.aqari_maintenance_plans p where p.id=task.plan_id for update;
  update private.aqari_maintenance_plans p set next_due_on=next_date,revision=p.revision+1,updated_at=now() where p.id=task.plan_id;
  after_row:=to_jsonb(task)||jsonb_build_object('next_due_on',next_date);
 else raise exception 'INVALID_MAINTENANCE_PLAN_ACTION' using errcode='22023';end if;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,'maintenance_plans',ident,p_action,auth.uid(),actor,coalesce(why,''),before_row,after_row);
 return after_row;
end $$;
revoke all on function private.aqari_maintenance_workflow(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_workflow(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_maintenance_plans(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.aqari_maintenance_workflow(p_workspace_id,p_action,p_data)
$$;
revoke all on function public.aqari_maintenance_plans(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_plans(uuid,text,jsonb) to authenticated;
commit;
