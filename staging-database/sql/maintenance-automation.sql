-- AQARI V267 recurring maintenance and operational alert engine.
-- CODE ONLY: apply to isolated Staging after operations-completion and MFA enforcement.
begin;
create table private.aqari_maintenance_plans(
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,vendor_contract_id uuid,
 asset_kind text not null check(asset_kind in ('elevator','air_conditioning','fire_system','water_tank','generator','plumbing','electrical','other')),
 title text not null check(length(btrim(title)) between 3 and 200),frequency_days integer not null check(frequency_days between 1 and 730),
 next_due_on date not null,warning_days integer[] not null default array[90,60,30],
 is_active boolean not null default true,revision integer not null default 1,created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,vendor_contract_id) references private.aqari_vendor_contracts(workspace_id,id),
 unique(workspace_id,id),check(warning_days<@array[90,60,30,14,7,1] and cardinality(warning_days)>0)
);
create index aqari_maintenance_plans_due on private.aqari_maintenance_plans(workspace_id,next_due_on) where is_active;

create table private.aqari_property_maintenance_tasks(
 id uuid primary key,workspace_id uuid not null,plan_id uuid not null,property_id uuid not null,due_on date not null,
 task_no text not null,status text not null default 'scheduled' check(status in ('scheduled','assigned','in_progress','completed','cancelled')),
 assigned_vendor_id uuid,description text not null default '',cost numeric(15,3) not null default 0 check(cost>=0),
 photo_document_ids jsonb not null default '[]' check(jsonb_typeof(photo_document_ids)='array'),
 completion_document_id uuid references public.aqari_documents(id),completed_by uuid,completed_at timestamptz,
 created_at timestamptz not null default now(),revision integer not null default 1,
 foreign key(workspace_id,plan_id) references private.aqari_maintenance_plans(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,assigned_vendor_id) references private.aqari_vendors(workspace_id,id),
 unique(workspace_id,id),unique(workspace_id,plan_id,due_on),unique(workspace_id,task_no),
 check(status<>'completed' or (completed_by is not null and completed_at is not null and completion_document_id is not null))
);

create table private.aqari_alert_preparation_runs(
 id uuid primary key,workspace_id uuid not null,as_of date not null,prepared_by uuid not null,
 maintenance_count integer not null,lease_count integer not null,vendor_contract_count integer not null,
 created_at timestamptz not null default now(),unique(workspace_id,as_of)
);
alter table private.aqari_maintenance_plans enable row level security;
alter table private.aqari_property_maintenance_tasks enable row level security;
alter table private.aqari_alert_preparation_runs enable row level security;
revoke all on private.aqari_maintenance_plans,private.aqari_property_maintenance_tasks,private.aqari_alert_preparation_runs from public,anon,authenticated;

create trigger aqari_alert_runs_immutable before update or delete on private.aqari_alert_preparation_runs for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_alert_uuid(k text) returns uuid language sql immutable set search_path='' as $$
 select (substr(md5(k),1,8)||'-'||substr(md5(k),9,4)||'-4'||substr(md5(k),14,3)||'-8'||substr(md5(k),18,3)||'-'||substr(md5(k),21,12))::uuid
$$;
revoke all on function private.aqari_alert_uuid(text) from public,anon,authenticated;

create function private.aqari_prepare_operational_alerts(w uuid,as_of_date date) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare m_count integer:=0;l_count integer:=0;v_count integer:=0;affected integer:=0;manager_id uuid;key text;row_data record;days_left integer;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if as_of_date is null or as_of_date>(now() at time zone 'Asia/Kuwait')::date+1 then raise exception 'INVALID_ALERT_DATE' using errcode='22023';end if;
 select m.user_id into manager_id from public.aqari_memberships m where m.workspace_id=w and m.is_active and m.role::text in('owner','general_manager') order by case when m.user_id=auth.uid() then 0 else 1 end limit 1;
 if manager_id is null then raise exception 'ALERT_MANAGER_REQUIRED' using errcode='23514';end if;

 for row_data in select p.id,p.title,p.next_due_on,p.warning_days from private.aqari_maintenance_plans p where p.workspace_id=w and p.is_active loop
  days_left:=row_data.next_due_on-as_of_date;
  if days_left=0 or days_left=any(row_data.warning_days) then
   key:='maintenance:'||row_data.id||':'||row_data.next_due_on||':'||days_left;
   insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key)
    values(private.aqari_alert_uuid(key),w,'maintenance_due',row_data.id::text,manager_id,'push',(as_of_date::timestamp at time zone 'Asia/Kuwait'),key)
    on conflict(workspace_id,idempotency_key) do nothing;
   get diagnostics affected=row_count;m_count:=m_count+affected;
  end if;
 end loop;

 for row_data in
  select l.id,l.end_date from public.aqari_leases l where l.workspace_id=w and l.status='signed'
 loop
  days_left:=row_data.end_date-as_of_date;
  if days_left in (90,60,30) then
   key:='lease-expiry:'||row_data.id||':'||row_data.end_date||':'||days_left;
   insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key)
    values(private.aqari_alert_uuid(key),w,'lease_expiry',row_data.id::text,manager_id,'email',(as_of_date::timestamp at time zone 'Asia/Kuwait'),key)
    on conflict(workspace_id,idempotency_key) do nothing;
   get diagnostics affected=row_count;l_count:=l_count+affected;
  end if;
 end loop;

 for row_data in
  select c.id,c.ends_on from private.aqari_vendor_contracts c where c.workspace_id=w and c.status in('approved','active')
 loop
  days_left:=row_data.ends_on-as_of_date;
  if days_left in (90,60,30) then
   key:='vendor-contract-expiry:'||row_data.id||':'||row_data.ends_on||':'||days_left;
   insert into private.aqari_notification_deliveries(id,workspace_id,kind,aggregate_id,recipient_id,channel,scheduled_for,idempotency_key)
    values(private.aqari_alert_uuid(key),w,'vendor_contract_expiry',row_data.id::text,manager_id,'email',(as_of_date::timestamp at time zone 'Asia/Kuwait'),key)
    on conflict(workspace_id,idempotency_key) do nothing;
   get diagnostics affected=row_count;v_count:=v_count+affected;
  end if;
 end loop;

 insert into private.aqari_alert_preparation_runs(id,workspace_id,as_of,prepared_by,maintenance_count,lease_count,vendor_contract_count)
 values(private.aqari_alert_uuid('alert-run:'||w||':'||as_of_date),w,as_of_date,auth.uid(),m_count,l_count,v_count)
 on conflict(workspace_id,as_of) do nothing;
 return jsonb_build_object('as_of',as_of_date,'maintenance',m_count,'leases',l_count,'vendor_contracts',v_count);
end $$;
revoke all on function private.aqari_prepare_operational_alerts(uuid,date) from public,anon,authenticated;

create function public.aqari_maintenance_plans(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;ident uuid;expected integer;plan private.aqari_maintenance_plans;task private.aqari_property_maintenance_tasks;before_row jsonb;after_row jsonb;prop uuid;doc uuid;actor text;why text;as_of_date date;next_date date;
begin
 if auth.uid() is null or not private.aqari_can(w,'maintenance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>16000 then raise exception 'INVALID_MAINTENANCE_PLAN_DATA' using errcode='22023';end if;
 if p_action='list' then
  return jsonb_build_object(
   'manager',private.aqari_manager(w),'can_write',private.aqari_can(w,'maintenance','write'),
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=w and private.aqari_can_property(w,p.id,'maintenance','read')),
   'vendors',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'name',v.name) order by v.name),'[]') from private.aqari_vendors v where v.workspace_id=w and v.status='active'),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'title',doc.title,'document_no',doc.document_no,'property_id',p.id) order by doc.created_at desc),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded' and private.aqari_can_property(w,p.id,'maintenance','read')),
   'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by p.next_due_on,p.id),'[]') from private.aqari_maintenance_plans p where p.workspace_id=w and private.aqari_can_property(w,p.property_id,'maintenance','read')),
   'tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.due_on desc,t.id),'[]') from private.aqari_property_maintenance_tasks t where t.workspace_id=w and private.aqari_can_property(w,t.property_id,'maintenance','read')),
   'alerts',(select coalesce(jsonb_agg(to_jsonb(n) order by n.scheduled_for desc,n.id),'[]') from (select * from private.aqari_notification_deliveries n where n.workspace_id=w and n.kind in('maintenance_due','lease_expiry','vendor_contract_expiry') order by n.scheduled_for desc limit 100)n),
   'runs',(select coalesce(jsonb_agg(to_jsonb(r) order by r.as_of desc),'[]') from (select * from private.aqari_alert_preparation_runs r where r.workspace_id=w order by r.as_of desc limit 30)r)
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
  expected:=coalesce((d->>'revision')::integer,0);if coalesce(plan.revision,0) is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if d->>'asset_kind' not in('elevator','air_conditioning','fire_system','water_tank','generator','plumbing','electrical','other') or length(btrim(coalesce(d->>'title',''))) not between 3 and 200 or (d->>'frequency_days')::integer not between 1 and 730 then raise exception 'INVALID_MAINTENANCE_PLAN' using errcode='22023';end if;
  before_row:=case when plan.id is null then null else to_jsonb(plan) end;
  if plan.id is null then insert into private.aqari_maintenance_plans(id,workspace_id,property_id,vendor_contract_id,asset_kind,title,frequency_days,next_due_on,warning_days,is_active,created_by)
   values(ident,w,prop,nullif(d->>'vendor_contract_id','')::uuid,d->>'asset_kind',btrim(d->>'title'),(d->>'frequency_days')::integer,(d->>'next_due_on')::date,case when jsonb_typeof(d->'warning_days')='array' and jsonb_array_length(d->'warning_days')>0 then array(select jsonb_array_elements_text(d->'warning_days')::integer) else array[90,60,30] end,coalesce((d->>'is_active')::boolean,true),auth.uid()) returning * into plan;
  else update private.aqari_maintenance_plans p set property_id=prop,vendor_contract_id=nullif(d->>'vendor_contract_id','')::uuid,asset_kind=d->>'asset_kind',title=btrim(d->>'title'),frequency_days=(d->>'frequency_days')::integer,next_due_on=(d->>'next_due_on')::date,warning_days=case when jsonb_typeof(d->'warning_days')='array' and jsonb_array_length(d->'warning_days')>0 then array(select jsonb_array_elements_text(d->'warning_days')::integer) else p.warning_days end,is_active=coalesce((d->>'is_active')::boolean,p.is_active),revision=p.revision+1,updated_at=now() where p.id=ident returning * into plan;end if;
  after_row:=to_jsonb(plan);
 elsif p_action='generate_task' then
  select * into plan from private.aqari_maintenance_plans p where p.workspace_id=w and p.id=ident and p.is_active for update;
  if not found or not private.aqari_can_property(w,plan.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  task.id:=nullif(d->>'task_id','')::uuid;
  insert into private.aqari_property_maintenance_tasks(id,workspace_id,plan_id,property_id,due_on,task_no,assigned_vendor_id,description)
   values(task.id,w,plan.id,plan.property_id,plan.next_due_on,btrim(d->>'task_no'),nullif(d->>'vendor_id','')::uuid,btrim(coalesce(d->>'description',plan.title))) returning * into task;
  after_row:=to_jsonb(task);
 elsif p_action='complete_task' then
  select * into task from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.id=ident for update;
  if not found or not private.aqari_can_property(w,task.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  expected:=(d->>'revision')::integer;if task.revision is distinct from expected or task.status not in('scheduled','assigned','in_progress') then raise serialization_failure using message='REVISION_CONFLICT';end if;
  doc:=nullif(d->>'completion_document_id','')::uuid;
  if not private.aqari_operations_document(w,task.property_id,doc) then raise exception 'COMPLETION_DOCUMENT_REQUIRED' using errcode='23514';end if;
  before_row:=to_jsonb(task);why:=btrim(coalesce(d->>'reason',''));if length(why)<3 then raise exception 'COMPLETION_REASON_REQUIRED' using errcode='22023';end if;
  update private.aqari_property_maintenance_tasks t set status='completed',cost=private.aqari_hr_money(d->'cost'),photo_document_ids=coalesce(d->'photo_document_ids','[]'),completion_document_id=doc,completed_by=auth.uid(),completed_at=now(),revision=t.revision+1 where t.id=ident returning * into task;
  select p.next_due_on+p.frequency_days into next_date from private.aqari_maintenance_plans p where p.id=task.plan_id for update;
  update private.aqari_maintenance_plans p set next_due_on=next_date,revision=p.revision+1,updated_at=now() where p.id=task.plan_id;
  after_row:=to_jsonb(task)||jsonb_build_object('next_due_on',next_date);
 else raise exception 'INVALID_MAINTENANCE_PLAN_ACTION' using errcode='22023';end if;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,'maintenance_plans',ident,p_action,auth.uid(),actor,coalesce(why,''),before_row,after_row);
 return after_row;
end $$;
revoke all on function public.aqari_maintenance_plans(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_plans(uuid,text,jsonb) to authenticated;
commit;
