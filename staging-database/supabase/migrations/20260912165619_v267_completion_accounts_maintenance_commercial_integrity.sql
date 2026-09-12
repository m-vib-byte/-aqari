-- V267 completion batch. Independently verified preview only.
-- Commercial charges and vacating guard activate atomically.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Source: staging-database/sql/maintenance-workflow.sql
-- V267 recurring maintenance workflow completion. Apply after maintenance-automation.sql.
-- Additive/repeatable SQL; no production connection or fixture business data.

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

-- Source: staging-database/sql/maintenance-attachments.sql
-- Independent preview only, after staff-property-scope.sql. Append-only private
-- request attachments; tenant identity never confers staff/document permissions.

create table if not exists private.aqari_maintenance_attachments(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),
 request_id uuid not null references public.aqari_maintenance_requests(id),
 filename text not null check(length(btrim(filename)) between 1 and 180),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes integer not null check(size_bytes between 1 and 10485760),
 checksum_sha256 text not null check(checksum_sha256~'^[a-f0-9]{64}$'),
 storage_bucket text not null default 'aqari-maintenance-private' check(storage_bucket='aqari-maintenance-private'),
 storage_path text not null unique,status text not null default 'reserved' check(status in('reserved','uploaded')),
 created_by uuid not null,created_at timestamptz not null default now(),uploaded_at timestamptz,
 check(storage_path=workspace_id::text||'/'||request_id::text||'/'||id::text)
);
create index if not exists aqari_maintenance_attachments_request on private.aqari_maintenance_attachments(workspace_id,request_id,created_at,id);
alter table private.aqari_maintenance_attachments enable row level security;
revoke all on private.aqari_maintenance_attachments from public,anon,authenticated;

create or replace function private.aqari_maintenance_attachment_access(w uuid,r uuid,write_file boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.aqari_maintenance_requests m
  where m.workspace_id=w and m.id=r
   and (not write_file or m.status in('received','assigned','in_progress'))
   and (private.aqari_can_lease(w,m.lease_id,'maintenance',case when write_file then 'write' else 'read' end)
    or (private.aqari_owns_tenant(w,m.tenant_id) and (not write_file or m.created_by=auth.uid()))))
$$;
create or replace function private.aqari_maintenance_attachments(w uuid,r uuid,action text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.aqari_maintenance_attachments;ident uuid;can_write boolean;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(w,r,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_write:=private.aqari_maintenance_attachment_access(w,r,true);
 if action='list' then return jsonb_build_object('can_upload',can_write,'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='uploaded'),'[]'::jsonb));end if;
 if coalesce(action,'') not in('reserve','finalize') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 -- Serialize reservations/count and request completion against the same request.
 perform 1 from public.aqari_maintenance_requests where workspace_id=w and id=r for update;
 select * into doc from private.aqari_maintenance_attachments where id=ident for update;
 if doc.id is not null and (doc.workspace_id<>w or doc.request_id<>r or doc.created_by<>auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 -- A lost finalize reply can be confirmed after the request is completed. This
 -- returns the existing immutable original; it never permits a new upload.
 if not private.aqari_maintenance_attachment_access(w,r,true) and not(action='finalize' and coalesce(doc.status='uploaded',false)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='reserve' then
  if coalesce(d->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce(d->>'size_bytes','')!~'^[0-9]{1,8}$' or (d->>'size_bytes')::integer not between 1 and 10485760
   or length(btrim(coalesce(d->>'filename',''))) not between 1 and 180
   or d->>'filename' ~ '[[:cntrl:]/\\]' or coalesce(d->>'checksum_sha256','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
  if doc.id is not null then
   if doc.filename<>d->>'filename' or doc.mime_type<>d->>'mime_type' or doc.size_bytes<>(d->>'size_bytes')::integer or doc.checksum_sha256<>d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_CONFLICT';end if;
   return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);
  end if;
  -- A browser reload or newly selected File loses its in-memory UUID. Recover
  -- only this authenticated uploader's exact content reservation under the
  -- request lock, before counting the limit. Uploaded originals are reused too
  -- when the earlier confirmation reply was lost; they are never overwritten.
  select * into doc from private.aqari_maintenance_attachments a
   where a.workspace_id=w and a.request_id=r and a.created_by=auth.uid()
    and a.filename=d->>'filename' and a.mime_type=d->>'mime_type'
    and a.size_bytes=(d->>'size_bytes')::integer and a.checksum_sha256=d->>'checksum_sha256'
   order by a.created_at,a.id limit 1 for update;
  if doc.id is not null then return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);end if;
  if (select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id=r)>=8 then raise invalid_parameter_value using message='ATTACHMENT_LIMIT_REACHED';end if;
  insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,created_by)
   values(ident,w,r,d->>'filename',d->>'mime_type',(d->>'size_bytes')::integer,d->>'checksum_sha256',w::text||'/'||r::text||'/'||ident::text,auth.uid()) returning * into doc;
  return to_jsonb(doc)||jsonb_build_object('reservation_reused',false);
 end if;
 if doc.id is null or doc.checksum_sha256 is distinct from d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  and o.metadata->>'size'=doc.size_bytes::text and o.metadata->>'mimetype'=doc.mime_type) then raise invalid_parameter_value using message='STORED_FILE_NOT_CONFIRMED';end if;
 if doc.status='reserved' then update private.aqari_maintenance_attachments set status='uploaded',uploaded_at=now() where id=ident returning * into doc;end if;
 return to_jsonb(doc);
end $$;

create or replace function public.aqari_maintenance_attachments(p_workspace_id uuid,p_request_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.aqari_maintenance_attachments(p_workspace_id,p_request_id,p_action,p_data)
$$;
create or replace function private.aqari_maintenance_attachment_storage(path text,write_file boolean)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.aqari_maintenance_attachments a
  where a.storage_path=path and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,write_file)
   and case when write_file then a.status='reserved' and a.created_by=auth.uid()
    else a.status='uploaded' or a.created_by=auth.uid() end)
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('aqari-maintenance-private','aqari-maintenance-private',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists aqari_maintenance_attachment_read on storage.objects;
drop policy if exists aqari_maintenance_attachment_insert on storage.objects;
create policy aqari_maintenance_attachment_read on storage.objects for select to authenticated
 using(bucket_id='aqari-maintenance-private' and private.aqari_maintenance_attachment_storage(name,false));
create policy aqari_maintenance_attachment_insert on storage.objects for insert to authenticated
 with check(bucket_id='aqari-maintenance-private' and private.aqari_maintenance_attachment_storage(name,true));
-- No UPDATE or DELETE policy: neither tenant nor staff can replace an original.
revoke all on function private.aqari_maintenance_attachment_access(uuid,uuid,boolean),private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean),public.aqari_maintenance_attachments(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean),public.aqari_maintenance_attachments(uuid,uuid,text,jsonb) to authenticated;

-- Source: staging-database/sql/tenant-rating-quarter-hardening.sql
-- Non-destructive V267 upgrade, after final-gap-readback-hardening.sql and
-- vacating-release.sql. Uses the existing contract terms and day-five cutoff.
-- No lease, receipt, archived year, balance, or stored rating changes on install.

do $$begin
 if to_regprocedure('private.aqari_contract_due(jsonb,text)') is null
  or to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is null
  or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='aqari_leases' and column_name='vacated_on') then
  raise exception 'TENANT_RATING_PREREQUISITES_REQUIRED';
 end if;
end $$;

create or replace function private.aqari_tenant_rating_evidence(w uuid,tenant uuid,rating_year integer)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;as_of date:=(now() at time zone 'Asia/Kuwait')::date;
begin
 if auth.uid() is null or not private.aqari_manager(w) then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if rating_year is null or rating_year not between 2000 and 2200 then
  raise exception 'INVALID_RATING_YEAR' using errcode='22023';
 end if;
 if tenant is null or not exists(select 1 from public.aqari_tenants t where t.workspace_id=w and t.id=tenant) then
  raise insufficient_privilege using message='TENANT_NOT_AVAILABLE';
 end if;
 with lease_months as (
  select l.id lease_id,g::date period,extract(quarter from g)::integer quarter,
   case when l.snapshot->>'rentalTermsVersion'='1'
    then coalesce(private.aqari_contract_due(l.snapshot,to_char(g,'YYYY-MM')),l.monthly_rent)
    else l.monthly_rent end due
  from public.aqari_leases l
  cross join lateral generate_series(
   date_trunc('month',greatest(l.start_date,make_date(rating_year,1,1)))::date,
   date_trunc('month',least(l.end_date,coalesce(l.vacated_on,l.end_date),make_date(rating_year,12,31),as_of))::date,
   interval '1 month')g
  where l.workspace_id=w and l.tenant_id=tenant and l.status in ('signed','expired')
   and l.start_date is not null and l.end_date is not null
 ), paid as (
  select m.*,coalesce(p.amount,0) paid_early,coalesce(p.receipt_ids,'[]'::jsonb) receipt_ids
  from lease_months m left join lateral (
   select sum(p.amount) amount,jsonb_agg(p.id order by p.id) receipt_ids
   from public.aqari_rent_payments p
   where p.workspace_id=w and p.lease_id=m.lease_id and p.period=m.period
    and p.paid_at<=least(m.period+4,as_of) and p.status in ('paid','partial','مدفوع','جزئي')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  )p on true
 ), calendar_months as (
  -- Parallel contracts do not turn one calendar month into three months.
  -- Every payable contract in that month must be settled independently.
  select quarter,period,bool_and(due>=0 and (due=0 or paid_early>=due)) settled,
   bool_and(due=0) zero_due,
   jsonb_agg(jsonb_build_object('lease_id',lease_id,'due',due,'paid_early',paid_early,
    'receipt_ids',receipt_ids,'zero_due',due=0,'settled',due>=0 and (due=0 or paid_early>=due)) order by lease_id) leases
  from paid group by quarter,period
 ), evidence as (
  select quarter,count(*) due_months,count(*)filter(where settled and not zero_due) paid_early_months,
   count(*)filter(where zero_due) zero_due_months,count(*)filter(where settled) settled_months,
   -- A prepaid future quarter cannot create a star before its three months end.
   (make_date(rating_year,quarter*3,1)+interval '1 month'-interval '1 day')::date<=as_of quarter_complete,
   jsonb_agg(jsonb_build_object('period',period,'settled',settled,'zero_due',zero_due,'leases',leases) order by period) months
  from calendar_months group by quarter
 ), summary as (
  select count(*)filter(where due_months=3 and settled_months=3 and quarter_complete)::integer stars,
   coalesce(jsonb_agg(jsonb_build_object('quarter',quarter,'due_months',due_months,
    'paid_early_months',paid_early_months,'zero_due_months',zero_due_months,'settled_months',settled_months,
    'quarter_complete',quarter_complete,'eligible',due_months=3 and settled_months=3 and quarter_complete,
    'policy','calendar-quarter-v2','months',months) order by quarter),'[]'::jsonb) proof
  from evidence
 )select jsonb_build_object('stars',least(4,stars),'proof',proof) into result from summary;
 return result;
end $$;
revoke all on function private.aqari_tenant_rating_evidence(uuid,uuid,integer) from public,anon,authenticated;

-- Replace only the known rating branch. Preserve unrelated concurrent fixes,
-- ownership, manager/AAL2 checks, financial locks and the existing RPC grants.
do $patch$
declare source text;before_branch text;after_branch text;first_pos integer;last_pos integer;
begin
 source:=pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure);
 if position('private.aqari_tenant_rating_evidence(w,tenant,(d->>''year'')::integer)' in source)>0 then return;end if;
 first_pos:=position(' if p_action=''rate'' then tenant:=(d->>''tenant_id'')::uuid;' in source);
 last_pos:=position(' return public.aqari_final_gap_register(w,''list'');' in source);
 if first_pos=0 or last_pos<=first_pos then raise exception 'TENANT_RATING_SOURCE_CHANGED';end if;
 before_branch:=substring(source from first_pos for last_pos-first_pos);
 -- Exact known branch fingerprint: stop if another revision changed its policy.
 if md5(before_branch)<>'8c43768373c60d76ea7a9ed4ba95ab6a' then raise exception 'TENANT_RATING_SOURCE_CHANGED';end if;
 if position('due_months>0 and due_months=paid_early_months' in before_branch)=0
  or position('p.status<>''cancelled''' in before_branch)=0
  or position('private.aqari_receipt_cancellations' in before_branch)=0
  or position('on conflict(workspace_id,tenant_id,rating_year)' in before_branch)=0 then
  raise exception 'TENANT_RATING_SOURCE_CHANGED';
 end if;
 after_branch:=$branch$ if p_action='rate' then tenant:=(d->>'tenant_id')::uuid;
  with summary as(select private.aqari_tenant_rating_evidence(w,tenant,(d->>'year')::integer) result)
  insert into private.aqari_tenant_year_ratings(workspace_id,tenant_id,rating_year,stars,rating,quarter_evidence,calculated_at,source_revision)
  select w,tenant,(d->>'year')::integer,(s.result->>'stars')::integer,
   case when (s.result->>'stars')::integer=4 then 'ممتاز' when (s.result->>'stars')::integer>=2 then 'ملتزم' else 'بحاجة إلى متابعة'end,
   s.result->'proof',now(),md5(w::text||tenant::text||(d->>'year')||(s.result->'proof')::text)
  from summary s
  on conflict(workspace_id,tenant_id,rating_year)do update set stars=excluded.stars,rating=excluded.rating,
   quarter_evidence=excluded.quarter_evidence,calculated_at=now(),source_revision=excluded.source_revision;
 end if;
$branch$;
 execute replace(source,before_branch,after_branch);
end $patch$;

-- Source: staging-database/sql/tenant-contact-unification.sql
-- Isolated V267 upgrade: one recorded contact preference for both editors and queued rent messages.
-- No provider is called. Legacy profile preferences remain a fallback; no consent is invented or backfilled.

alter table private.aqari_tenant_preferences drop constraint if exists aqari_tenant_preferences_preferred_channel_check;
alter table private.aqari_tenant_preferences add constraint aqari_tenant_preferences_preferred_channel_check
 check(preferred_channel in ('both','email','whatsapp','phone','none','sms','push'));
alter table private.aqari_tenant_preferences alter column consent_at drop not null;

create table if not exists private.aqari_contact_preference_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null,tenant_id uuid not null,actor_id uuid not null,
 source_route text not null check(source_route in ('financial_register','imported_editor')),
 before_snapshot jsonb not null,after_snapshot jsonb not null,
 recorded_at timestamptz not null default now(),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id)
);
alter table private.aqari_contact_preference_audit enable row level security;
revoke all on private.aqari_contact_preference_audit from public,anon,authenticated;
create index if not exists aqari_contact_preference_audit_tenant on private.aqari_contact_preference_audit(workspace_id,tenant_id,id desc);
create or replace function private.aqari_contact_audit_immutable() returns trigger
 language plpgsql set search_path='' as $$begin raise exception 'CONTACT_AUDIT_IMMUTABLE' using errcode='23514';end$$;
revoke all on function private.aqari_contact_audit_immutable() from public,anon,authenticated;
drop trigger if exists aqari_contact_audit_immutable on private.aqari_contact_preference_audit;
create trigger aqari_contact_audit_immutable before update or delete on private.aqari_contact_preference_audit
 for each row execute function private.aqari_contact_audit_immutable();

-- Internal only: callers already enforce tenant/workspace access. Explicit canonical rows win over legacy copies.
create or replace function private.aqari_effective_contact_profile(w uuid,t uuid,fallback_profile jsonb) returns jsonb
 language sql stable security definer set search_path='' as $$
 select coalesce(fallback_profile,'{}'::jsonb)||coalesce((select jsonb_build_object('preferredContact',p.preferred_channel)
  from private.aqari_tenant_preferences p where p.workspace_id=w and p.tenant_id=t),'{}'::jsonb)
$$;
revoke all on function private.aqari_effective_contact_profile(uuid,uuid,jsonb) from public,anon,authenticated;

-- Cancellation is terminal; sent/sending/failed history is retained and no channel is substituted silently.
create or replace function private.aqari_reconcile_contact_queue(w uuid,t uuid default null) returns integer
 language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.aqari_notification_outbox o set status='cancelled'
 where o.workspace_id=w and o.kind in ('rent_reminder','payment_thanks') and o.status in ('awaiting_configuration','queued')
 and exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=o.lease_id and (t is null or l.tenant_id=t))
 and not exists(select 1 from public.aqari_leases l join public.aqari_tenants q on q.workspace_id=w and q.id=l.tenant_id
  where l.workspace_id=w and l.id=o.lease_id and q.is_active
  and private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,q.id,q.profile),o.channel)
  and ((o.channel='email' and nullif(btrim(q.email),'') is not null) or (o.channel='whatsapp' and nullif(btrim(q.phone),'') is not null)));
 get diagnostics changed=row_count;return changed;
end$$;
revoke all on function private.aqari_reconcile_contact_queue(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_record_contact_preference(w uuid,t uuid,channel text,route text) returns void
 language plpgsql security definer set search_path='' as $$
declare state public.aqari_app_state;tenant public.aqari_tenants;prior private.aqari_tenant_preferences;next_preference private.aqari_tenant_preferences;
 d jsonb;next_data jsonb;next_profile jsonb;before_state jsonb;
begin
 if auth.uid() is null or not private.aqari_manager(w) or route not in ('financial_register','imported_editor') then
  raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if channel is null or channel not in ('both','email','whatsapp','phone','none','sms','push') then
  raise invalid_parameter_value using message='INVALID_CONTACT_PREFERENCE';end if;
 -- Same order as profile, projection, financial-close and reminder writes.
 select * into state from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 select * into tenant from public.aqari_tenants where workspace_id=w and id=t for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into prior from private.aqari_tenant_preferences where workspace_id=w and tenant_id=t for update;
 before_state:=jsonb_build_object('recorded_preference',case when prior.tenant_id is null then null else to_jsonb(prior) end,
  'legacy_preference',tenant.profile->'preferredContact');
 if prior.tenant_id is null then
  insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,revision,updated_by)
   values(w,t,channel,null,1,auth.uid()) returning * into next_preference;
 elsif prior.preferred_channel is distinct from channel then
  update private.aqari_tenant_preferences set preferred_channel=channel,consent_at=null,revision=revision+1,updated_by=auth.uid(),updated_at=now()
   where workspace_id=w and tenant_id=t returning * into next_preference;
 else next_preference:=prior;end if;
 -- An operator's new choice is not recipient consent. Preserve an old timestamp in the immutable before-snapshot only.
 if prior.tenant_id is null or prior.preferred_channel is distinct from channel then
  insert into private.aqari_contact_preference_audit(workspace_id,tenant_id,actor_id,source_route,before_snapshot,after_snapshot)
   values(w,t,auth.uid(),route,before_state,to_jsonb(next_preference));end if;
 next_profile:=coalesce(tenant.profile,'{}'::jsonb)||jsonb_build_object('preferredContact',channel);
 update public.aqari_tenants set profile=next_profile where workspace_id=w and id=t and profile is distinct from next_profile;
 d:=private.aqari_unwrap(state.payload);next_data:=d;
 if jsonb_typeof(d->'tenantProfilesV267')='array' then
  next_data:=jsonb_set(next_data,'{tenantProfilesV267}',coalesce((select jsonb_agg(case when x->>'id'=tenant.external_ref
   then x||jsonb_build_object('preferredContact',channel) else x end order by ord)
   from jsonb_array_elements(d->'tenantProfilesV267') with ordinality a(x,ord)),'[]'::jsonb));end if;
 if jsonb_typeof(d->'tenantDirectoryV202')='array' then
  next_data:=jsonb_set(next_data,'{tenantDirectoryV202}',coalesce((select jsonb_agg(case when x->>'tenantProfileId'=tenant.external_ref
   then x||jsonb_build_object('preferredContact',channel) else x end order by ord)
   from jsonb_array_elements(d->'tenantDirectoryV202') with ordinality a(x,ord)),'[]'::jsonb));end if;
 if next_data is distinct from d then
  update public.aqari_app_state set payload=case when state.payload->>'format'='aqari-cloud-state-v1' then jsonb_set(state.payload,'{snapshot,values,aqari_v30}',next_data)
   when state.payload->>'schema'='aqari-local-snapshot-v1' then jsonb_set(state.payload,'{values,aqari_v30}',next_data) else next_data end,
   revision=state.revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w;end if;
 perform private.aqari_reconcile_contact_queue(w,t);
end$$;
revoke all on function private.aqari_record_contact_preference(uuid,uuid,text,text) from public,anon,authenticated;

-- Patch narrow, reviewed anchors so other upgrades (including annual ratings) remain intact.
do $patch$
declare definition text:=pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure);
 anchor text:='if p_action=''preference'' then insert into private.aqari_tenant_preferences values(w,(d->>''tenant_id'')::uuid,d->>''preferred_channel'',now(),1,auth.uid(),now()) on conflict(workspace_id,tenant_id)do update set preferred_channel=excluded.preferred_channel,consent_at=excluded.consent_at,revision=private.aqari_tenant_preferences.revision+1,updated_by=auth.uid(),updated_at=now();end if;';
begin
 if position('aqari_record_contact_preference' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_REGISTER_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,'if p_action=''preference'' then perform private.aqari_record_contact_preference(w,(d->>''tenant_id'')::uuid,d->>''preferred_channel'',''financial_register'');end if;');
 end if;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text)'::regprocedure);
 anchor text:=' return private.aqari_imported_tenant_read(w,ref);';
 channel_anchor text:='(''both'',''email'',''whatsapp'',''phone'',''none'')';
begin
 if position('aqari_record_contact_preference' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 or
   (length(definition)-length(replace(definition,channel_anchor,'')))/length(channel_anchor)<>1 then raise exception 'CONTACT_IMPORTED_SAVE_ANCHOR_CHANGED';end if;
  definition:=replace(definition,channel_anchor,'(''both'',''email'',''whatsapp'',''phone'',''none'',''sms'',''push'')');
  definition:=replace(definition,anchor,E' if patch ? ''preferredContact'' then perform private.aqari_record_contact_preference(w,tenant.id,next_profile->>''preferredContact'',''imported_editor'');end if;\n'||anchor);
  execute definition;
 end if;
end $patch$;

do $patch$
declare definition text:=pg_get_functiondef('private.aqari_imported_tenant_read(uuid,text)'::regprocedure);
 anchor text:='''profile'',tenant.profile';
begin
 if position('aqari_effective_contact_profile' in definition)=0 then
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_IMPORTED_READ_ANCHOR_CHANGED';end if;
  execute replace(definition,anchor,'''profile'',private.aqari_effective_contact_profile(w,tenant.id,tenant.profile)');
 end if;
end $patch$;

do $patch$
declare signature text;definition text;anchor text;replacement text;
begin
 foreach signature in array array['private.aqari_reconcile_reminder_queue(uuid)','private.aqari_v267_prepare_reminders(uuid,date,integer)','private.aqari_v267_project_state()'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('aqari_effective_contact_profile' in definition)>0 then continue;end if;
  if signature='private.aqari_v267_project_state()' then
   anchor:='private.aqari_preferred_delivery_channel(thanks_tenant.profile,thanks_tenant.email,thanks_tenant.phone)';
   replacement:='private.aqari_preferred_delivery_channel(private.aqari_effective_contact_profile(new.workspace_id,thanks_tenant.id,thanks_tenant.profile),thanks_tenant.email,thanks_tenant.phone)';
  else
   anchor:='private.aqari_contact_channel_allowed(t.profile,';
   replacement:='private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),';
  end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_QUEUE_ANCHOR_CHANGED:%',signature;end if;
  definition:=replace(definition,anchor,replacement);
  if signature='private.aqari_reconcile_reminder_queue(uuid)' then
   anchor:=' get diagnostics cancelled=row_count;return cancelled;';
   if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'CONTACT_RECONCILE_ANCHOR_CHANGED';end if;
   definition:=replace(definition,anchor,' get diagnostics cancelled=row_count;return cancelled+private.aqari_reconcile_contact_queue(w,null);');
  end if;
  execute definition;
 end loop;
end $patch$;

-- Reconcile already waiting messages without choosing a new preference, recording consent, or changing delivered history.
do $$declare w uuid;begin for w in select id from public.aqari_workspaces loop perform private.aqari_reconcile_contact_queue(w,null);end loop;end$$;

-- Source: staging-database/sql/work-order-request-link.sql
-- Additive/repeatable upgrade after operations-register.sql.
-- Link a maintenance request to one work order without modifying the request or its history.

alter table private.aqari_work_orders add column if not exists unit_id uuid,
 add column if not exists request_snapshot jsonb;
-- Reject ambiguous historical links for review instead of guessing or rewriting them.
do $$begin
 if exists(select 1 from private.aqari_work_orders o
  left join public.aqari_maintenance_requests m on m.id=o.maintenance_request_id and m.workspace_id=o.workspace_id
  left join public.aqari_leases l on l.id=m.lease_id and l.workspace_id=m.workspace_id and l.tenant_id=m.tenant_id
  left join public.aqari_units u on u.id=l.unit_id and u.workspace_id=l.workspace_id
  where o.maintenance_request_id is not null and (u.id is null or u.property_id is distinct from o.property_id or (o.unit_id is not null and o.unit_id is distinct from u.id)))
 then raise exception 'WORK_ORDER_EXISTING_LINK_REVIEW_REQUIRED';end if;
end $$;
create unique index if not exists aqari_work_order_request_unique
 on private.aqari_work_orders(workspace_id,maintenance_request_id) where maintenance_request_id is not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_work_orders'::regclass and conname='aqari_work_order_request_fk') then
  alter table private.aqari_work_orders add constraint aqari_work_order_request_fk foreign key(maintenance_request_id) references public.aqari_maintenance_requests(id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_work_orders'::regclass and conname='aqari_work_order_unit_fk') then
  alter table private.aqari_work_orders add constraint aqari_work_order_unit_fk foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id);
 end if;
end $$;

create or replace function private.aqari_work_order_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r record;
begin
 if auth.uid() is null then raise insufficient_privilege using message='AUTH_REQUIRED';end if;
 if tg_op='UPDATE' and (new.workspace_id is distinct from old.workspace_id or new.property_id is distinct from old.property_id
  or new.maintenance_request_id is distinct from old.maintenance_request_id or new.unit_id is distinct from old.unit_id
  or new.request_snapshot is distinct from old.request_snapshot) then raise exception 'WORK_ORDER_LINK_IMMUTABLE' using errcode='23514';end if;
 if tg_op='INSERT' and new.maintenance_request_id is not null then
  select m.id,m.request_no,m.workspace_id,m.status,m.description,m.revision,u.property_id,u.id as unit_id,u.unit_no
   into r from public.aqari_maintenance_requests m
   join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   where m.id=new.maintenance_request_id and m.workspace_id=new.workspace_id for update of m;
  if not found or r.property_id is distinct from new.property_id then raise exception 'REQUEST_PROPERTY_MISMATCH' using errcode='23514';end if;
  if r.status in('completed','cancelled') then raise exception 'MAINTENANCE_REQUEST_CLOSED' using errcode='23514';end if;
  if new.unit_id is not null and new.unit_id is distinct from r.unit_id then raise exception 'REQUEST_UNIT_MISMATCH' using errcode='23514';end if;
  if exists(select 1 from private.aqari_work_orders o where o.workspace_id=new.workspace_id and o.maintenance_request_id=new.maintenance_request_id) then raise exception 'REQUEST_ALREADY_HAS_WORK_ORDER' using errcode='23505';end if;
  new.unit_id:=r.unit_id;
  new.request_snapshot:=jsonb_build_object('id',r.id,'request_no',r.request_no,'revision',r.revision,'description',r.description,'property_id',r.property_id,'unit_id',r.unit_id,'unit_no',r.unit_no);
 end if;
 return new;
end $$;
revoke all on function private.aqari_work_order_request_guard() from public,anon,authenticated;
drop trigger if exists aqari_work_order_request_guard on private.aqari_work_orders;
create trigger aqari_work_order_request_guard before insert or update on private.aqari_work_orders
 for each row execute function private.aqari_work_order_request_guard();

-- Preserve the reviewed base RPC; only the guarded public entry remains callable by clients.
do $$begin
 if to_regprocedure('private.aqari_operations_register_base(uuid,text,text,jsonb)') is null then
  alter function public.aqari_operations_register(uuid,text,text,jsonb) set schema private;
  alter function private.aqari_operations_register(uuid,text,text,jsonb) rename to aqari_operations_register_base;
 end if;
end $$;
revoke all on function private.aqari_operations_register_base(uuid,text,text,jsonb) from public,anon,authenticated;

create or replace function private.aqari_operations_request_link(w uuid,domain text,action text,d jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare result jsonb;request_row record;order_row private.aqari_work_orders;contract private.aqari_vendor_contracts;prop uuid;request_id uuid;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>32000 then raise exception 'INVALID_OPERATION_DATA' using errcode='22023';end if;
 if action<>'list' then perform private.aqari_require_sensitive_aal2(w);end if;
 if domain='work_orders' then
  if action='create' then
   prop:=nullif(d->>'property_id','')::uuid;request_id:=nullif(d->>'maintenance_request_id','')::uuid;
   if not private.aqari_can_property(w,prop,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   if request_id is not null then
    select m.id,m.revision,u.property_id,u.id as unit_id into request_row from public.aqari_maintenance_requests m
     join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
     join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
     where m.workspace_id=w and m.id=request_id for update of m;
    if not found or request_row.property_id is distinct from prop then raise exception 'REQUEST_PROPERTY_MISMATCH' using errcode='23514';end if;
    if nullif(d->>'unit_id','')::uuid is distinct from request_row.unit_id then raise exception 'REQUEST_UNIT_MISMATCH' using errcode='23514';end if;
    if nullif(d->>'request_revision','')::bigint is distinct from request_row.revision then raise serialization_failure using message='REQUEST_REVISION_CONFLICT';end if;
   elsif nullif(d->>'unit_id','') is not null then raise exception 'REQUEST_REQUIRED_FOR_UNIT' using errcode='23514';
   end if;
   if nullif(d->>'vendor_contract_id','') is not null then
    select * into contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=(d->>'vendor_contract_id')::uuid;
    if not found or contract.vendor_id is distinct from (d->>'vendor_id')::uuid or (contract.property_id is not null and contract.property_id is distinct from prop)
     or contract.status not in('approved','active') or (now() at time zone 'Asia/Kuwait')::date not between contract.starts_on and contract.ends_on then raise exception 'VENDOR_CONTRACT_MISMATCH' using errcode='23514';end if;
   end if;
  elsif action<>'list' then
   select * into order_row from private.aqari_work_orders o where o.workspace_id=w and o.id=nullif(d->>'id','')::uuid;
   if not found or not private.aqari_can_property(w,order_row.property_id,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  end if;
 end if;
 result:=private.aqari_operations_register_base(w,domain,action,d);
 if domain='work_orders' and action='list' then
  result:=result||jsonb_build_object('request_link_version',1,'requests',(
   select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'request_no',m.request_no,'description',m.description,'status',m.status,'revision',m.revision,
    'property_id',u.property_id,'unit_id',u.id,'unit_no',u.unit_no,'work_order_id',o.id,'work_order_no',o.order_no) order by m.request_no desc),'[]')
   from public.aqari_maintenance_requests m
   join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   left join private.aqari_work_orders o on o.workspace_id=m.workspace_id and o.maintenance_request_id=m.id
   where m.workspace_id=w and private.aqari_can_property(w,u.property_id,'maintenance','read') and (m.status not in('completed','cancelled') or o.id is not null)
  ));
 end if;
 return result;
end $$;
revoke all on function private.aqari_operations_request_link(uuid,text,text,jsonb) from public,anon;
grant execute on function private.aqari_operations_request_link(uuid,text,text,jsonb) to authenticated;
create or replace function public.aqari_operations_register(p_workspace_id uuid,p_domain text,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_operations_request_link(p_workspace_id,p_domain,p_action,p_data)$$;
revoke all on function public.aqari_operations_register(uuid,text,text,jsonb) from public,anon;
grant execute on function public.aqari_operations_register(uuid,text,text,jsonb) to authenticated;

-- Source: staging-database/sql/compliance-register.sql
-- AQARI V267 commercial terms, common charges and signed inspection register.
-- CODE ONLY: apply to isolated Staging after operations-register.sql.

create or replace function public.aqari_compliance_register(
 p_workspace_id uuid,p_domain text,p_action text,p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=coalesce(p_data,'{}'); ident uuid:=nullif(p_data->>'id','')::uuid;
 actor uuid:=auth.uid(); lease_row public.aqari_leases; unit_row public.aqari_units; target_property_id uuid;
 current_revision integer; expected integer:=coalesce((d->>'revision')::integer,0);
 total numeric(15,3); allocated numeric(15,3); item jsonb; doc_id uuid; result jsonb;
begin
 if actor is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if p_domain not in ('commercial','common_charges','inspections') then raise exception 'INVALID_COMPLIANCE_DOMAIN' using errcode='22023'; end if;
 if p_action='list' then
  if not (private.aqari_can(w,'contracts','read') or private.aqari_can(w,'finance','read') or private.aqari_can(w,'maintenance','read')) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return jsonb_build_object(
   'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'status',l.status,'start_date',l.start_date,'end_date',l.end_date,'unit_id',l.unit_id,'property_id',u.property_id) order by l.contract_no),'[]') from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w),
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=w),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'title',doc.title,'property_id',p.id) order by doc.created_at desc),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded' and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes),
   'commercial',(select coalesce(jsonb_agg(to_jsonb(x) order by x.lease_id),'[]') from private.aqari_commercial_terms x where x.workspace_id=w),
   'allocations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from private.aqari_common_charge_allocations x where x.workspace_id=w),
   'inspections',(select coalesce(jsonb_agg(to_jsonb(x) order by x.inspected_at desc),'[]') from private.aqari_unit_inspections x where x.workspace_id=w)
  );
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if ident is null then raise exception 'ID_REQUIRED' using errcode='22023'; end if;

 if p_domain='commercial' and p_action='save' then
  select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=ident for update;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  select u.property_id into target_property_id from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  if not private.aqari_can_property(w,target_property_id,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if coalesce(d->>'grace_days','') !~ '^[0-9]{1,3}$'
   or coalesce(d->>'sales_percentage','') !~ '^[0-9]{1,3}(\.[0-9]{1,4})?$'
   or coalesce(d->>'cam_amount','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
   or length(btrim(coalesce(d->>'permitted_activity','')))<2 or length(btrim(coalesce(d->>'license_no','')))<2
   or coalesce((d->>'grace_days')::integer,-1) not between 0 and 366
   or coalesce((d->>'sales_percentage')::numeric,-1) not between 0 and 100
   or coalesce((d->>'cam_amount')::numeric,-1)<0
   or length(btrim(coalesce(d->>'compliance_reference','')))<5
  then raise exception 'INVALID_COMMERCIAL_TERMS' using errcode='22023'; end if;
  select revision into current_revision from private.aqari_commercial_terms where workspace_id=w and lease_id=ident for update;
  if (found and current_revision<>expected) or (not found and expected<>0) then raise serialization_failure using message='REVISION_CONFLICT'; end if;
  insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,cam_amount,permitted_activity,license_no,license_expires_on,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
  values(ident,w,(d->>'grace_days')::integer,(d->>'sales_percentage')::numeric,(d->>'cam_amount')::numeric,btrim(d->>'permitted_activity'),btrim(d->>'license_no'),nullif(d->>'license_expires_on','')::date,actor,now(),btrim(d->>'compliance_reference'))
  on conflict(lease_id) do update set grace_days=excluded.grace_days,sales_percentage=excluded.sales_percentage,cam_amount=excluded.cam_amount,permitted_activity=excluded.permitted_activity,license_no=excluded.license_no,license_expires_on=excluded.license_expires_on,compliance_reviewed_by=actor,compliance_reviewed_at=now(),compliance_reference=excluded.compliance_reference,revision=aqari_commercial_terms.revision+1
  returning to_jsonb(aqari_commercial_terms) into result;
  insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),btrim(d->>'compliance_reference'),result);
  return result;

 elsif p_domain='common_charges' and p_action='allocate' then
  target_property_id:=nullif(d->>'property_id','')::uuid; total:=private.aqari_hr_money(d->'total_amount');
  if not private.aqari_can_property(w,target_property_id,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  perform private.aqari_financial_open(w,(now() at time zone 'Asia/Kuwait')::date);
  if d->>'basis' not in ('area','consumption') or length(btrim(coalesce(d->>'invoice_reference','')))<3 or jsonb_typeof(d->'allocations')<>'array' or jsonb_array_length(d->'allocations')=0 then raise exception 'INVALID_COMMON_CHARGE' using errcode='22023'; end if;
  if (select count(*)<>count(distinct x->>'unit_id') from jsonb_array_elements(d->'allocations') x) then raise exception 'DUPLICATE_ALLOCATION_UNIT' using errcode='23505'; end if;
  allocated:=0;
  for item in select value from jsonb_array_elements(d->'allocations') loop
   select * into unit_row from public.aqari_units u where u.workspace_id=w and u.id=(item->>'unit_id')::uuid and u.property_id=target_property_id;
   if not found or private.aqari_hr_money(item->'amount')<=0 then raise exception 'INVALID_ALLOCATION_LINE' using errcode='22023'; end if;
   allocated:=allocated+private.aqari_hr_money(item->'amount');
  end loop;
  if allocated<>total then raise exception 'ALLOCATION_TOTAL_MISMATCH' using errcode='23514'; end if;
  insert into private.aqari_common_charge_allocations(id,workspace_id,property_id,invoice_reference,basis,total_amount,allocations,approved_by,approved_at)
  values(ident,w,target_property_id,btrim(d->>'invoice_reference'),d->>'basis',total,d->'allocations',actor,now());
  for item in select value from jsonb_array_elements(d->'allocations') loop
   select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.unit_id=(item->>'unit_id')::uuid and l.status='signed' and l.start_date<=(now() at time zone 'Asia/Kuwait')::date and l.end_date>=(now() at time zone 'Asia/Kuwait')::date for share;
   if not found then raise exception 'ACTIVE_LEASE_REQUIRED_FOR_ALLOCATION' using errcode='23514'; end if;
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
   values(gen_random_uuid(),w,lease_row.id,'common_charge','debit',private.aqari_hr_money(item->'amount'),(now() at time zone 'Asia/Kuwait')::date,'common_charge:'||(item->>'unit_id'),ident,'توزيع فاتورة خدمات '||btrim(d->>'invoice_reference'),actor);
  end loop;
  select to_jsonb(x) into result from private.aqari_common_charge_allocations x where x.id=ident; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),btrim(d->>'invoice_reference'),result); return result;

 elsif p_domain='inspections' and p_action='create' then
  select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=(d->>'lease_id')::uuid;
  select u.* into unit_row from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  target_property_id:=unit_row.property_id;
  if not private.aqari_can_property(w,target_property_id,'maintenance','write') or d->>'kind' not in ('move_in','periodic','renewal','move_out') or jsonb_typeof(d->'checklist')<>'array' or jsonb_array_length(d->'checklist')=0 then raise exception 'INVALID_INSPECTION' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(coalesce(d->'photo_document_ids','[]')) loop
   if not private.aqari_operations_document(w,target_property_id,trim(both '"' from item::text)::uuid) then raise exception 'INSPECTION_PHOTO_UNVERIFIED' using errcode='23514'; end if;
  end loop;
  insert into private.aqari_unit_inspections(id,workspace_id,lease_id,unit_id,kind,inspected_at,checklist,photo_document_ids)
  values(ident,w,lease_row.id,unit_row.id,d->>'kind',coalesce(nullif(d->>'inspected_at','')::timestamptz,now()),d->'checklist',coalesce(d->'photo_document_ids','[]')) returning to_jsonb(aqari_unit_inspections) into result; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),'inspection draft',result); return result;

 elsif p_domain='inspections' and p_action='sign' then
  select i.revision,u.property_id into current_revision,target_property_id from private.aqari_unit_inspections i join public.aqari_units u on u.workspace_id=i.workspace_id and u.id=i.unit_id where i.workspace_id=w and i.id=ident and i.status='draft' for update of i;
  if not found or current_revision<>expected then raise serialization_failure using message='INSPECTION_REVISION_CONFLICT'; end if;
  doc_id:=nullif(d->>'tenant_signature_document_id','')::uuid;
  if not private.aqari_operations_document(w,target_property_id,doc_id) or not private.aqari_operations_document(w,target_property_id,nullif(d->>'inspector_signature_document_id','')::uuid) then raise exception 'SIGNATURE_DOCUMENT_UNVERIFIED' using errcode='23514'; end if;
  update private.aqari_unit_inspections set status='signed',tenant_signature_document_id=doc_id,inspector_signature_document_id=(d->>'inspector_signature_document_id')::uuid,signed_by=actor,signed_at=now(),revision=revision+1 where id=ident returning to_jsonb(aqari_unit_inspections) into result; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),'inspection signed',result); return result;
 else raise exception 'INVALID_COMPLIANCE_ACTION' using errcode='22023'; end if;
end $$;

revoke all on function public.aqari_compliance_register(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_compliance_register(uuid,text,text,jsonb) to authenticated;

-- Source: staging-database/sql/commercial-sales.sql
-- AQARI V267: evidenced monthly percentage-rent charges and append-only reversals.
-- Apply after financial-register.sql, operations-register.sql, vacating-release.sql and compliance-register.sql.
-- No hosted deployment is performed by this source file.

create table private.aqari_commercial_sales (
 id uuid primary key, workspace_id uuid not null, lease_id uuid not null,
 month date not null check(extract(day from month)=1), period_start date not null, period_end date not null,
 gross_sales numeric(15,3) not null check(gross_sales>=0), sales_percentage numeric(7,4) not null check(sales_percentage>0 and sales_percentage<=100),
 amount numeric(15,3) not null check(amount>=0), terms_revision integer not null check(terms_revision>0),
 calculation_basis text not null check(calculation_basis='additional_to_base_rent'),
 source_document_id uuid not null, source_checksum text not null check(source_checksum~'^[a-f0-9]{64}$'),
 source_reference text not null check(length(btrim(source_reference)) between 3 and 200),
 request_data jsonb not null, recorded_by uuid not null, recorded_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(source_document_id) references public.aqari_documents(id),
 unique(workspace_id,id), check(period_start<=period_end),
 check(period_start>=month and period_end<(month+interval '1 month')::date)
);
create index aqari_commercial_sales_period on private.aqari_commercial_sales(workspace_id,lease_id,month);
create table private.aqari_commercial_sales_reversals (
 id uuid primary key, workspace_id uuid not null, sale_id uuid not null, occurred_on date not null,
 reason text not null check(length(btrim(reason)) between 5 and 500), request_data jsonb not null,
 recorded_by uuid not null, recorded_at timestamptz not null default now(),
 unique(workspace_id,sale_id), foreign key(workspace_id,sale_id) references private.aqari_commercial_sales(workspace_id,id)
);
alter table private.aqari_commercial_sales enable row level security;
alter table private.aqari_commercial_sales_reversals enable row level security;
revoke all on private.aqari_commercial_sales,private.aqari_commercial_sales_reversals from public,anon,authenticated;
create trigger aqari_commercial_sales_immutable before update or delete on private.aqari_commercial_sales
 for each row execute function private.aqari_reject_immutable_change();
create trigger aqari_commercial_sales_reversal_immutable before update or delete on private.aqari_commercial_sales_reversals
 for each row execute function private.aqari_reject_immutable_change();
alter table private.aqari_tenant_adjustments drop constraint aqari_tenant_adjustments_kind_check;
alter table private.aqari_tenant_adjustments add constraint aqari_tenant_adjustments_kind_check
 check(kind in ('cheque_return','legal_cost','common_charge','manual_correction','commercial_sales'));

-- Private SECURITY DEFINER is needed solely for the revoked, immutable financial
-- tables. Its public invoker wrapper adds no privilege; every action checks the
-- authenticated manager, workspace, property and MFA before writing.
create function private.aqari_commercial_sales_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); ident uuid; lid uuid; mon date; first_day date; last_day date; posted_on date;
 today date:=(now() at time zone 'Asia/Kuwait')::date;
 l public.aqari_leases; prop public.aqari_properties; terms private.aqari_commercial_terms;
 saved private.aqari_commercial_sales; reversed private.aqari_commercial_sales_reversals;
 document_row public.aqari_documents; amount numeric(15,3); sales numeric(15,3); request jsonb; result jsonb;
begin
 if actor is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 if jsonb_typeof(d) is distinct from 'object' or action is null or action not in ('list','record','reverse') then
  raise exception 'INVALID_COMMERCIAL_SALES_ACTION' using errcode='22023';
 end if;
 if coalesce(d->>'month','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then
  raise exception 'INVALID_SALES_MONTH' using errcode='22023';
 end if;
 mon:=(d->>'month'||'-01')::date;
 if action='list' then
  return jsonb_build_object('month',to_char(mon,'YYYY-MM'),
   'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'external_ref',q.external_ref,'contract_no',q.contract_no,'property_ref',p.external_ref,'property_id',p.id,'property_name',p.name,'sales_percentage',t.sales_percentage,'terms_revision',t.revision) order by q.contract_no),'[]')
    from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id
    join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    join private.aqari_commercial_terms t on t.workspace_id=q.workspace_id and t.lease_id=q.id
    where q.workspace_id=w and t.sales_percentage>0 and q.status in ('signed','expired') and private.aqari_can_property(w,p.id,'finance','read')),
   'documents',(select coalesce(jsonb_agg(to_jsonb(z)),'[]') from (
    select doc.id,doc.title,doc.entity_type,doc.entity_ref from public.aqari_documents doc
    join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
    where doc.workspace_id=w and doc.entity_type in ('property','lease') and doc.status='uploaded'
     and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type
     and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,doc.entity_type,doc.entity_ref,'read')
    order by doc.created_at desc,doc.id limit 200)z),
   'entries',(select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('reversal',(select to_jsonb(r) from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) order by s.recorded_at desc,s.id),'[]')
    from private.aqari_commercial_sales s join public.aqari_leases q on q.workspace_id=s.workspace_id and q.id=s.lease_id
    join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id
    where s.workspace_id=w and s.month=mon and private.aqari_can_property(w,u.property_id,'finance','read')));
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 ident:=nullif(d->>'id','')::uuid;
 if ident is null then raise exception 'SALES_ID_REQUIRED' using errcode='22023';end if;
 -- Same lock order as financial closing: workspace first, then lease/terms.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;

 if action='record' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in ('id','lease_id','month','gross_sales','terms_revision','source_document_id','source_reference','calculation_basis'))
   or coalesce(d->>'gross_sales','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
   or coalesce(d->>'terms_revision','') !~ '^[1-9][0-9]{0,8}$'
   or d->>'calculation_basis' is distinct from 'additional_to_base_rent'
   or length(btrim(coalesce(d->>'source_reference',''))) not between 3 and 200 then
   raise exception 'INVALID_COMMERCIAL_SALES' using errcode='22023';
  end if;
  lid:=nullif(d->>'lease_id','')::uuid;sales:=(d->>'gross_sales')::numeric;
  request:=d||jsonb_build_object('gross_sales',to_char(sales,'FM999999999990.000'),'source_reference',btrim(d->>'source_reference'));
  select * into saved from private.aqari_commercial_sales where id=ident;
  if found then
   if saved.workspace_id<>w or saved.request_data is distinct from request then raise exception 'SALES_RETRY_CONFLICT' using errcode='23505';end if;
   return to_jsonb(saved);
  end if;
  select * into l from public.aqari_leases where workspace_id=w and id=lid for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select p.* into prop from public.aqari_properties p join public.aqari_units u on u.workspace_id=p.workspace_id and u.property_id=p.id where u.workspace_id=w and u.id=l.unit_id;
  if not private.aqari_can_property(w,prop.id,'finance','write') or not private.aqari_can_property(w,prop.id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  first_day:=greatest(mon,l.start_date);last_day:=least((mon+interval '1 month - 1 day')::date,l.end_date,coalesce(l.vacated_on,l.end_date));
  if l.status not in ('signed','expired') or l.start_date is null or l.end_date is null or first_day>last_day or first_day<mon or first_day>=(mon+interval '1 month')::date or last_day>today then
   raise exception 'SALES_PERIOD_OUTSIDE_COMPLETED_LEASE_MONTH' using errcode='23514';
  end if;
  perform private.aqari_financial_open(w,last_day);
  select * into terms from private.aqari_commercial_terms where workspace_id=w and lease_id=lid for share;
  if not found or terms.sales_percentage<=0 or terms.compliance_reviewed_at is null then raise exception 'APPROVED_SALES_TERMS_REQUIRED' using errcode='23514';end if;
  if terms.revision<>(d->>'terms_revision')::integer then raise serialization_failure using message='SALES_TERMS_REVISION_CONFLICT';end if;
  if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.month=mon
   and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
   raise exception 'SALES_MONTH_ALREADY_POSTED' using errcode='23505';
  end if;
  select doc.* into document_row from public.aqari_documents doc join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
   where doc.workspace_id=w and doc.id=nullif(d->>'source_document_id','')::uuid and doc.status='uploaded'
    and ((doc.entity_type='property' and doc.entity_ref=prop.external_ref) or (doc.entity_type='lease' and doc.entity_ref=l.external_ref))
    and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type
    and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,doc.entity_type,doc.entity_ref,'read');
  if not found then raise exception 'SALES_SOURCE_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  amount:=round(sales*terms.sales_percentage/100,3);
  insert into private.aqari_commercial_sales(id,workspace_id,lease_id,month,period_start,period_end,gross_sales,sales_percentage,amount,terms_revision,calculation_basis,source_document_id,source_checksum,source_reference,request_data,recorded_by)
   values(ident,w,lid,mon,first_day,last_day,sales,terms.sales_percentage,amount,terms.revision,'additional_to_base_rent',document_row.id,document_row.checksum_sha256,btrim(d->>'source_reference'),request,actor) returning to_jsonb(aqari_commercial_sales) into result;
  if amount>0 then
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
    values(gen_random_uuid(),w,lid,'commercial_sales','debit',amount,last_day,'commercial_sales',ident,'استحقاق نسبة مبيعات '||to_char(mon,'YYYY-MM')||' — '||btrim(d->>'source_reference'),actor);
  end if;
 else
  if exists(select 1 from jsonb_object_keys(d)k where k not in ('id','sale_id','month','occurred_on','reason'))
   or length(btrim(coalesce(d->>'reason',''))) not between 5 and 500
   or coalesce(d->>'occurred_on','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise exception 'INVALID_SALES_REVERSAL' using errcode='22023';end if;
  posted_on:=(d->>'occurred_on')::date;request:=d||jsonb_build_object('reason',btrim(d->>'reason'));
  select * into reversed from private.aqari_commercial_sales_reversals where id=ident;
  if found then
   if reversed.workspace_id<>w or reversed.request_data is distinct from request then raise exception 'SALES_RETRY_CONFLICT' using errcode='23505';end if;
   return to_jsonb(reversed);
  end if;
  select * into saved from private.aqari_commercial_sales where workspace_id=w and id=nullif(d->>'sale_id','')::uuid and month=mon for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select p.* into prop from public.aqari_properties p join public.aqari_units u on u.workspace_id=p.workspace_id and u.property_id=p.id join public.aqari_leases q on q.workspace_id=u.workspace_id and q.unit_id=u.id where q.workspace_id=w and q.id=saved.lease_id;
  if not private.aqari_can_property(w,prop.id,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if posted_on<saved.period_end or posted_on>today then raise exception 'INVALID_SALES_REVERSAL_DATE' using errcode='23514';end if;
  perform private.aqari_financial_open(w,posted_on);
  if exists(select 1 from private.aqari_commercial_sales_reversals where workspace_id=w and sale_id=saved.id) then raise exception 'SALES_ALREADY_REVERSED' using errcode='23505';end if;
  insert into private.aqari_commercial_sales_reversals(id,workspace_id,sale_id,occurred_on,reason,request_data,recorded_by)
   values(ident,w,saved.id,posted_on,btrim(d->>'reason'),request,actor) returning to_jsonb(aqari_commercial_sales_reversals) into result;
  if saved.amount>0 then
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
    values(gen_random_uuid(),w,saved.lease_id,'commercial_sales','credit',saved.amount,posted_on,'commercial_sales_reversal',ident,btrim(d->>'reason'),actor);
  end if;
 end if;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
  values(w,'commercial_sales',ident,action,actor,coalesce(auth.jwt()->>'email',actor::text),coalesce(result->>'source_reference',result->>'reason'),result);
 return result;
end $$;
revoke all on function private.aqari_commercial_sales_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_commercial_sales_register(uuid,text,jsonb) to authenticated;
create function public.aqari_commercial_sales(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select private.aqari_commercial_sales_register(p_workspace_id,p_action,p_data)
$$;
revoke all on function public.aqari_commercial_sales(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_commercial_sales(uuid,text,jsonb) to authenticated;

-- Source: staging-database/sql/commercial-sales-vacating-guard.sql
-- Additive, repeatable guard after commercial-sales.sql and vacating-release.sql.
-- No payment allocation proves settlement of percentage rent yet. Only the
-- original charge plus its exact archived reversal can close that obligation.

create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- Reject incomplete or unrelated financial source links instead of allowing a
 -- generic credit or a rent payment to erase a separately evidenced obligation.
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.amount>0
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجعها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد؛ دفعة الإيجار وحدها لا تسدد هذا الاستحقاق.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_commercial_vacating_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if new.status in ('finalized','cleared','released') then
  -- Every sales/reversal write and the supported settlement/release RPCs use
  -- this same serialization point. A concurrent posting cannot pass the guard.
  perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
  perform private.aqari_require_commercial_clearance(new.workspace_id,new.lease_id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_vacating_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_vacating_guard on private.aqari_vacating_settlements;
create trigger aqari_commercial_vacating_guard before insert or update on private.aqari_vacating_settlements
 for each row execute function private.aqari_commercial_vacating_guard();

create or replace function private.aqari_commercial_lease_release_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if new.vacated_on is not null and new.vacated_on is distinct from old.vacated_on then
  perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
  perform private.aqari_require_commercial_clearance(new.workspace_id,new.id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_lease_release_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_lease_release_guard on public.aqari_leases;
create trigger aqari_commercial_lease_release_guard before update of vacated_on on public.aqari_leases
 for each row execute function private.aqari_commercial_lease_release_guard();

create or replace function private.aqari_commercial_post_clearance_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_vacating_settlements v where v.workspace_id=new.workspace_id and v.lease_id=new.lease_id and v.status in ('cleared','released'))
  or exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=new.lease_id and l.vacated_on is not null) then
  raise check_violation using message='لا يمكن إضافة استحقاق مبيعات بعد براءة الذمة أو إنهاء العقد. يلزم مسار مراجعة تسوية معتمد يحافظ على البراءة السابقة.',detail='SALES_AFTER_CLEARANCE_REVIEW_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_post_clearance_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_post_clearance_guard on private.aqari_commercial_sales;
create trigger aqari_commercial_post_clearance_guard before insert on private.aqari_commercial_sales
 for each row execute function private.aqari_commercial_post_clearance_guard();

-- Source: staging-database/sql/collection-account-management.sql
-- Additive account editing/archive upgrade after final-gap-readback-hardening.sql.
-- Preserves monetary records; apply only to an independently verified isolated target.

alter table private.aqari_collection_accounts
 add column if not exists revision integer not null default 1,
 add column if not exists updated_by uuid,
 add column if not exists updated_at timestamptz;
create table if not exists private.aqari_collection_account_audit(
 operation_id uuid primary key,workspace_id uuid not null,account_id uuid not null,
 action text not null check(action in('edit','archive')),request jsonb not null,
 actor_id uuid not null,actor_name text not null,reason text not null,
 before_value jsonb not null,after_value jsonb not null,recorded_at timestamptz not null default now(),
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
create index if not exists aqari_collection_account_audit_read on private.aqari_collection_account_audit(workspace_id,account_id,recorded_at desc);
-- Separate immutable metadata preserves historical display without updating a posting.
create table if not exists private.aqari_collection_posting_accounts(
 posting_id uuid primary key references private.aqari_collection_postings(id),workspace_id uuid not null,account_id uuid not null,
 snapshot jsonb not null,captured_at timestamptz not null default now(),captured_on_post boolean not null,
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
alter table private.aqari_collection_account_audit enable row level security;
alter table private.aqari_collection_posting_accounts enable row level security;
revoke all on private.aqari_collection_account_audit,private.aqari_collection_posting_accounts from public,anon,authenticated;
drop trigger if exists aqari_collection_account_audit_immutable on private.aqari_collection_account_audit;
create trigger aqari_collection_account_audit_immutable before update or delete on private.aqari_collection_account_audit for each row execute function private.aqari_reject_immutable_change();
drop trigger if exists aqari_collection_posting_accounts_immutable on private.aqari_collection_posting_accounts;
create trigger aqari_collection_posting_accounts_immutable before update or delete on private.aqari_collection_posting_accounts for each row execute function private.aqari_reject_immutable_change();
insert into private.aqari_collection_posting_accounts(posting_id,workspace_id,account_id,snapshot,captured_on_post)
 select p.id,p.workspace_id,p.account_id,jsonb_build_object('id',a.id,'property_id',a.property_id,'kind',a.kind,'name',a.name,'masked_reference',a.masked_reference,'currency',a.currency,'revision',a.revision),false
 from private.aqari_collection_postings p join private.aqari_collection_accounts a on a.workspace_id=p.workspace_id and a.id=p.account_id
 on conflict(posting_id) do nothing;
create or replace function private.aqari_collection_account_posting_guard()returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare a private.aqari_collection_accounts;
begin
 -- Same workspace row lock as final-gap post_payment / financial_open, before account rows.
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into a from private.aqari_collection_accounts where workspace_id=new.workspace_id and id=new.account_id for update;
 if not found or a.status<>'active' then raise exception 'ACCOUNT_ARCHIVED_OR_UNAVAILABLE' using errcode='23514';end if;
 insert into private.aqari_collection_posting_accounts(posting_id,workspace_id,account_id,snapshot,captured_on_post)
 values(new.id,new.workspace_id,new.account_id,jsonb_build_object('id',a.id,'property_id',a.property_id,'kind',a.kind,'name',a.name,'masked_reference',a.masked_reference,'currency',a.currency,'revision',a.revision),true);
 return new;
end $$;
revoke all on function private.aqari_collection_account_posting_guard() from public,anon,authenticated;
drop trigger if exists aqari_collection_account_posting_guard on private.aqari_collection_postings;
create trigger aqari_collection_account_posting_guard after insert on private.aqari_collection_postings for each row execute function private.aqari_collection_account_posting_guard();
create or replace function private.aqari_collection_account_manage(w uuid,action text,d jsonb)returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a private.aqari_collection_accounts;event private.aqari_collection_account_audit;ident uuid;op uuid;request jsonb;before_row jsonb;actor text;reason text;expected integer;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>6000 then raise invalid_parameter_value using message='INVALID_ACCOUNT_REQUEST';end if;
 if action not in('list','read','edit','archive') then raise invalid_parameter_value using message='INVALID_ACCOUNT_ACTION';end if;
 if action='list' then return jsonb_build_object('accounts',(select coalesce(jsonb_agg(to_jsonb(x)-'created_by' order by x.name,x.id),'[]') from private.aqari_collection_accounts x where x.workspace_id=w),
  'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by x.name),'[]')from public.aqari_properties x where x.workspace_id=w),
  'posting_accounts',(select coalesce(jsonb_agg(jsonb_build_object('posting_id',x.posting_id,'snapshot',x.snapshot,'captured_on_post',x.captured_on_post)),'[]')from private.aqari_collection_posting_accounts x where x.workspace_id=w));end if;
 ident:=nullif(d->>'id','')::uuid;op:=nullif(d->>'operation_id','')::uuid;
 if action in('edit','archive') then
  perform private.aqari_require_sensitive_aal2(w);
  perform 1 from public.aqari_app_state where workspace_id=w for update;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 end if;
 if action='read' then select * into a from private.aqari_collection_accounts x where x.workspace_id=w and x.id=ident;
 else select * into a from private.aqari_collection_accounts x where x.workspace_id=w and x.id=ident for update;end if;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='read' then
  return jsonb_build_object('account',to_jsonb(a)-'created_by','events',(select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc,x.operation_id),'[]')from(select * from private.aqari_collection_account_audit x where x.workspace_id=w and x.account_id=ident and (op is null or x.operation_id=op) order by x.recorded_at desc,x.operation_id limit 25)x));
 end if;
 reason:=btrim(coalesce(d->>'reason',''));expected:=(d->>'revision')::integer;
 if op is null or expected is null or expected<1 or length(reason) not between 3 and 1000 then raise check_violation using message='ACCOUNT_REVISION_AND_REASON_REQUIRED';end if;
 if exists(select 1 from jsonb_object_keys(d)k where k not in('id','operation_id','revision','reason','name','masked_reference')) then raise check_violation using message='ACCOUNT_IDENTITY_IMMUTABLE';end if;
 request:=jsonb_build_object('id',ident,'operation_id',op,'revision',expected,'reason',reason,'action',action);
 if action='edit' then
  if length(btrim(coalesce(d->>'name',''))) not between 2 and 160 or length(btrim(coalesce(d->>'masked_reference',''))) not between 1 and 80
   or length(regexp_replace(translate(d->>'masked_reference','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[^0-9]','','g'))>4 then raise check_violation using message='ACCOUNT_NAME_OR_MASKED_REFERENCE_REQUIRED';end if;
  request:=request||jsonb_build_object('name',btrim(d->>'name'),'masked_reference',btrim(d->>'masked_reference'));
 elsif d?'name' or d?'masked_reference' then raise check_violation using message='ARCHIVE_CANNOT_EDIT_ACCOUNT';end if;
 select * into event from private.aqari_collection_account_audit x where x.workspace_id=w and x.operation_id=op;
 if found then
  if event.request is distinct from request or event.actor_id is distinct from auth.uid() then raise unique_violation using message='ACCOUNT_OPERATION_CONFLICT';end if;
  return jsonb_build_object('account',to_jsonb(a)-'created_by','operation_id',event.operation_id,'replayed',true);
 end if;
 if a.revision is distinct from expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
 if a.status<>'active' then raise check_violation using message='ACCOUNT_ARCHIVED';end if;
 before_row:=to_jsonb(a);select coalesce(nullif(display_name,''),auth.uid()::text)into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 if action='edit' then
  if a.name=request->>'name' and a.masked_reference=request->>'masked_reference' then raise check_violation using message='ACCOUNT_UNCHANGED';end if;
  update private.aqari_collection_accounts x set name=request->>'name',masked_reference=request->>'masked_reference',revision=x.revision+1,updated_by=auth.uid(),updated_at=now() where x.id=ident and x.workspace_id=w returning * into a;
 else
  update private.aqari_collection_accounts x set status='archived',revision=x.revision+1,updated_by=auth.uid(),updated_at=now() where x.id=ident and x.workspace_id=w returning * into a;
 end if;
 insert into private.aqari_collection_account_audit(operation_id,workspace_id,account_id,action,request,actor_id,actor_name,reason,before_value,after_value)
 values(op,w,ident,action,request,auth.uid(),actor,reason,before_row,to_jsonb(a));
 return jsonb_build_object('account',to_jsonb(a)-'created_by','operation_id',op,'replayed',false);
end $$;
revoke all on function private.aqari_collection_account_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_collection_account_manage(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_collection_account_manage(p_workspace_id uuid,p_action text,p_data jsonb default '{}')returns jsonb
language sql volatile security invoker set search_path='' as $$ select private.aqari_collection_account_manage(p_workspace_id,p_action,p_data) $$;
revoke all on function public.aqari_collection_account_manage(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_collection_account_manage(uuid,text,jsonb) to authenticated;

-- Source: staging-database/sql/vendor-optional-identity.sql
-- Repeatable upgrade after operations-completion.sql.
-- Vendor identity is optional in the existing form/RPC (default ''). UUID remains the primary key.
-- Keep uniqueness for supplied numbers without changing any existing number or vendor row.

create unique index if not exists aqari_vendor_supplied_identity_unique
 on private.aqari_vendors(workspace_id,civil_or_license_no)
 where btrim(civil_or_license_no)<>'';
alter table private.aqari_vendors drop constraint if exists aqari_vendors_workspace_id_civil_or_license_no_key;

-- Source: staging-database/sql/partner-shares-integrity.sql
-- V267 additive guard on the existing app-state source; no new financial ledger.
-- Existing incomplete ownership is left untouched. Only changed records validate.
-- Apply after workspace controls and staff-property-scope.sql.

create or replace function private.aqari_validate_partner_owners(rows jsonb)
returns void language plpgsql immutable security invoker set search_path='' as $$
declare r jsonb;total numeric:=0;ids text[]:='{}';ident text;
begin
 if jsonb_typeof(rows) is distinct from 'array' then raise exception 'PARTNER_OWNERS_REQUIRED' using errcode='23514';end if;
 if jsonb_array_length(rows) not between 1 and 100 then raise exception 'PARTNER_OWNERS_REQUIRED' using errcode='23514';end if;
 for r in select value from jsonb_array_elements(rows) loop
  ident:=btrim(r->>'id');
  if jsonb_typeof(r) is distinct from 'object' or jsonb_typeof(r->'id') is distinct from 'string'
   or ident is null or length(ident) not between 1 and 150 or ident=any(ids)
   or jsonb_typeof(r->'name') is distinct from 'string' or length(btrim(coalesce(r->>'name',''))) not between 1 and 150
   or jsonb_typeof(r->'role') is distinct from 'string' or length(btrim(coalesce(r->>'role',''))) not between 1 and 80
   or jsonb_typeof(r->'bps') is distinct from 'number' then
   raise exception 'PARTNER_OWNER_INVALID' using errcode='23514';
  end if;
  if (r->>'bps')::numeric not between 1 and 10000 or (r->>'bps')::numeric<>trunc((r->>'bps')::numeric) then
   raise exception 'PARTNER_SHARE_INVALID' using errcode='23514';
  end if;
  ids:=array_append(ids,ident);total:=total+(r->>'bps')::numeric;
 end loop;
 if total<>10000 then raise exception 'PARTNER_SHARES_MUST_TOTAL_100' using errcode='23514';end if;
end $$;
revoke all on function private.aqari_validate_partner_owners(jsonb) from public,anon,authenticated;

create or replace function private.aqari_guard_partner_shares()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_data jsonb;new_data jsonb;old_map jsonb;new_map jsonb;k text;s jsonb;before_state jsonb;
 old_events jsonb;new_events jsonb;e jsonb;old_owners jsonb;old_version numeric;n integer;i integer;
begin
 new_data:=private.aqari_unwrap(new.payload);
 old_data:=case when tg_op='INSERT' then '{}'::jsonb else private.aqari_unwrap(old.payload) end;
 old_map:=old_data->'propertySharesV267';new_map:=new_data->'propertySharesV267';
 if old_map is not distinct from new_map then return new;end if;
 if auth.uid() is null or not private.aqari_manager(new.workspace_id)
  or not private.aqari_can(new.workspace_id,'partners','write') then
  raise insufficient_privilege using message='PARTNER_MANAGER_REQUIRED';
 end if;
 if jsonb_typeof(new_map) is distinct from 'object' then raise exception 'PARTNER_HISTORY_REQUIRED' using errcode='23514';end if;
 if old_map is null then old_map:='{}';end if;
 if jsonb_typeof(old_map) is distinct from 'object' then raise exception 'PARTNER_LEGACY_REVIEW_REQUIRED' using errcode='23514';end if;
 for k in select jsonb_object_keys(old_map||new_map) loop
  before_state:=old_map->k;s:=new_map->k;
  if before_state is not distinct from s then continue;end if;
  if s is null then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  if jsonb_typeof(s) is distinct from 'object' or length(btrim(k)) not between 1 and 300
   or jsonb_typeof(s->'version') is distinct from 'number' or jsonb_typeof(s->'enabled') is distinct from 'boolean'
   or jsonb_typeof(s->'owners') is distinct from 'array' or jsonb_typeof(s->'events') is distinct from 'array' then
   raise exception 'PARTNER_STATE_INVALID' using errcode='23514';
  end if;
  old_version:=case when jsonb_typeof(before_state->'version')='number' then (before_state->>'version')::numeric else 0 end;
  if old_version<0 or old_version<>trunc(old_version) or (s->>'version')::numeric<>old_version+1
   or (s->>'version')::numeric>9007199254740991 then
   raise serialization_failure using message='PARTNER_REVISION_CONFLICT';
  end if;
  old_events:=coalesce(before_state->'events','[]'::jsonb);new_events:=s->'events';
  old_owners:=coalesce(before_state->'owners','[]'::jsonb);
  if jsonb_typeof(old_events) is distinct from 'array' or jsonb_typeof(old_owners) is distinct from 'array' then
   raise exception 'PARTNER_LEGACY_REVIEW_REQUIRED' using errcode='23514';
  end if;
  n:=jsonb_array_length(old_events);
  if jsonb_array_length(new_events)<>n+1 then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  for i in 0..n-1 loop
   if new_events->i is distinct from old_events->i then raise exception 'PARTNER_HISTORY_IMMUTABLE' using errcode='23514';end if;
  end loop;
  e:=new_events->n;
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string'
   or length(btrim(coalesce(e->>'id',''))) not between 1 and 150 or e->>'actor' is distinct from auth.uid()::text
   or jsonb_typeof(e->'at') is distinct from 'string' or length(btrim(coalesce(e->>'at',''))) not between 1 and 80
   or coalesce(e->>'type','') not in('owners','disable','distribution','payment')
   or exists(select 1 from jsonb_array_elements(old_events)x where x->>'id'=e->>'id') then
   raise exception 'PARTNER_EVENT_INVALID' using errcode='23514';
  end if;
  if e->>'type'='owners' then
   perform private.aqari_validate_partner_owners(s->'owners');
   if s->>'enabled'<>'true' or e->'before' is distinct from old_owners or e->'after' is distinct from s->'owners' then
    raise exception 'PARTNER_OWNER_SNAPSHOT_MISMATCH' using errcode='23514';
   end if;
  elsif e->>'type'='disable' then
   -- An old incomplete register can be stopped without altering its source shares.
   if s->>'enabled'<>'false' or s->'owners' is distinct from old_owners then
    raise exception 'PARTNER_DISABLE_CHANGED_OWNERS' using errcode='23514';
   end if;
  else
   perform private.aqari_validate_partner_owners(s->'owners');
   if s->'owners' is distinct from old_owners or s->'enabled' is distinct from before_state->'enabled' then
    raise exception 'PARTNER_OWNERS_CHANGED_WITHOUT_EVENT' using errcode='23514';
   end if;
   if e->>'type'='distribution' and s->>'enabled'<>'true' then
    raise exception 'PARTNER_DISTRIBUTION_DISABLED' using errcode='23514';
   end if;
   if e->>'type'='distribution' then
    perform private.aqari_validate_partner_owners(e->'rows');
    if jsonb_array_length(e->'rows')<>jsonb_array_length(s->'owners') then
     raise exception 'PARTNER_DISTRIBUTION_SHARES_MISMATCH' using errcode='23514';
    end if;
    for i in 0..jsonb_array_length(s->'owners')-1 loop
     if (e->'rows'->i)-array['income','expenses','net','receivable'] is distinct from s->'owners'->i then
      raise exception 'PARTNER_DISTRIBUTION_SHARES_MISMATCH' using errcode='23514';
     end if;
    end loop;
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_guard_partner_shares() from public,anon,authenticated;
-- Reinstalling this named guard is transactional; all original guards remain.
drop trigger if exists aqari_zy_partner_shares_guard on public.aqari_app_state;
create trigger aqari_zy_partner_shares_guard before insert or update of payload on public.aqari_app_state
 for each row execute function private.aqari_guard_partner_shares();

commit;
