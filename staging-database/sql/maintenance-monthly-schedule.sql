-- Preview candidate. Creates capability only; no enabled property or cron job is inserted.
begin;
create table if not exists private.aqari_maintenance_report_schedules(
 workspace_id uuid not null,property_id uuid not null,enabled boolean not null default false,
 revision integer not null default 1,updated_by uuid not null,updated_at timestamptz not null default statement_timestamp(),
 primary key(workspace_id,property_id),foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create table if not exists private.aqari_maintenance_monthly_snapshots(
 workspace_id uuid not null,property_id uuid not null,due_month date not null check(extract(day from due_month)=1),
 issued_at timestamptz not null,payload jsonb not null,primary key(workspace_id,property_id,due_month),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create table if not exists private.aqari_maintenance_monthly_failures(
 id bigint generated always as identity primary key,workspace_id uuid not null,property_id uuid not null,
 attempted_at timestamptz not null,error_code text not null
);
alter table private.aqari_maintenance_report_schedules enable row level security;
alter table private.aqari_maintenance_monthly_snapshots enable row level security;
alter table private.aqari_maintenance_monthly_failures enable row level security;
revoke all on private.aqari_maintenance_report_schedules,private.aqari_maintenance_monthly_snapshots,private.aqari_maintenance_monthly_failures from public,anon,authenticated;
create or replace trigger aqari_maintenance_monthly_snapshot_immutable before update or delete on private.aqari_maintenance_monthly_snapshots for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_monthly_report_payload(w uuid,p uuid,m date) returns jsonb
language sql stable security invoker set search_path='' as $$
 with documents as (
  select x.* from public.aqari_documents x where x.workspace_id=w and private.aqari_operations_document(w,p,x.id)
 ), tasks as (
  select t.* from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.property_id=p
   and t.due_on<(m+interval '1 month')::date and (t.due_on>=m or t.status not in('completed','cancelled'))
 )
 select jsonb_build_object('schemaVersion',1,'dueMonth',to_char(m,'YYYY-MM'),
 'data',jsonb_build_object(
  'properties',(select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.aqari_properties where workspace_id=w and id=p),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('cost',t.cost::text)) from tasks t),'[]'::jsonb),
  'plans',coalesce((select jsonb_agg(to_jsonb(x)) from private.aqari_maintenance_plans x where x.workspace_id=w and x.property_id=p),'[]'::jsonb),
  'contracts',coalesce((select jsonb_agg(to_jsonb(x)) from private.aqari_vendor_contracts x where x.workspace_id=w and x.status in('active','approved') and exists(select 1 from private.aqari_vendors v where v.workspace_id=w and v.id=x.vendor_id and v.status='active') and x.id in(select vendor_contract_id from private.aqari_maintenance_plans where workspace_id=w and property_id=p)),'[]'::jsonb),
  'vendors',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name)) from private.aqari_vendors v where v.workspace_id=w and v.id in(select assigned_vendor_id from tasks)),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'property_id',p,'document_no',x.document_no,'title',x.title,'mime_type',x.mime_type)) from documents x),'[]'::jsonb)
 ),'context',jsonb_build_object('workspace_id',w,'propertyId',p,
  'evidence',coalesce((select jsonb_agg(jsonb_build_object('taskId',e.task_id,'documentId',e.document_id,'stage',e.stage)) from private.aqari_maintenance_evidence e where e.workspace_id=w and e.property_id=p and e.task_id in(select id from tasks)),'[]'::jsonb),
  'imageDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'mimeType',x.mime_type)) from documents x where x.mime_type in('image/jpeg','image/png','image/webp','image/heic','image/heif')),'[]'::jsonb),
  'reportDetails',private.aqari_monthly_details_context(w,p)||jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,
    'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'number',x.document_no,'title',x.title,'mimeType',x.mime_type,'storagePath',x.storage_path,'entityRef',x.entity_ref)) from documents x),'[]'::jsonb)))
 )
$$;
revoke all on function private.aqari_monthly_report_payload(uuid,uuid,date) from public,anon,authenticated;

-- Internal runner only. Clock injection is for SQL acceptance; clients cannot call it.
create or replace function private.aqari_prepare_monthly_maintenance(p_now timestamptz default statement_timestamp()) returns jsonb
language plpgsql volatile security invoker set search_path='' as $$
declare local_now timestamp:=p_now at time zone 'Asia/Kuwait';r record;m date;payload jsonb;added integer:=0;affected integer;failures integer:=0;
begin
 if extract(day from local_now)<>25 or local_now::time<time '08:00' then return jsonb_build_object('created',0,'failed',0,'outsideWindow',true);end if;
 m:=date_trunc('month',local_now)::date;
 for r in select s.* from private.aqari_maintenance_report_schedules s
  join public.aqari_memberships actor on actor.workspace_id=s.workspace_id and actor.user_id=s.updated_by and actor.is_active and actor.role='general_manager'
  where s.enabled order by s.workspace_id,s.property_id
 loop
  begin
   if not exists(select 1 from private.aqari_maintenance_monthly_snapshots x where x.workspace_id=r.workspace_id and x.property_id=r.property_id and x.due_month=m) then
    payload:=private.aqari_monthly_report_payload(r.workspace_id,r.property_id,m);
    if payload is null or payload#>'{data,properties}' is null then raise exception 'MONTHLY_SOURCE_UNAVAILABLE';end if;
    insert into private.aqari_maintenance_monthly_snapshots(workspace_id,property_id,due_month,issued_at,payload)
    values(r.workspace_id,r.property_id,m,p_now,payload) on conflict do nothing;
    get diagnostics affected=row_count;added:=added+affected;
   end if;
  exception when others then
   insert into private.aqari_maintenance_monthly_failures(workspace_id,property_id,attempted_at,error_code)values(r.workspace_id,r.property_id,p_now,sqlstate);
   failures:=failures+1;
  end;
 end loop;
 return jsonb_build_object('created',added,'failed',failures,'dueMonth',to_char(m,'YYYY-MM'));
end $$;
revoke all on function private.aqari_prepare_monthly_maintenance(timestamptz) from public,anon,authenticated,service_role;

create or replace function private.aqari_monthly_scheduler_ready() returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare ready boolean:=false;begin
 if to_regclass('cron.job') is not null then execute 'select exists(select 1 from cron.job where jobname=$1 and active and schedule=$2 and command=$3)' into ready using 'aqari-maintenance-monthly-25','0 5 25 * *','select private.aqari_prepare_monthly_maintenance();';end if;
 return ready;
end $$;
revoke all on function private.aqari_monthly_scheduler_ready() from public,anon,authenticated;

create or replace function private.aqari_maintenance_monthly_archive(w uuid,p uuid,a text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare old private.aqari_maintenance_report_schedules;record_value private.aqari_maintenance_report_schedules;snapshot private.aqari_maintenance_monthly_snapshots;actor text;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can_property(w,p,'maintenance','read') or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>2000 then raise invalid_parameter_value using message='INVALID_MONTHLY_ARCHIVE_DATA';end if;
 if a='context' then
  return jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,'user_id',auth.uid(),'schedule',coalesce((select to_jsonb(s) from private.aqari_maintenance_report_schedules s where s.workspace_id=w and s.property_id=p),jsonb_build_object('enabled',false,'revision',0)),
   'timing','25 08:00 Asia/Kuwait','schedulerReady',private.aqari_monthly_scheduler_ready(),'reports',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(x.due_month,'YYYY-MM'),'issuedAt',x.issued_at)) from (select * from private.aqari_maintenance_monthly_snapshots where workspace_id=w and property_id=p order by due_month desc limit 12)x),'[]'::jsonb));
 elsif a='snapshot' then
  if coalesce(d->>'month','')!~'^\d{4}-(0[1-9]|1[0-2])$' then raise invalid_parameter_value using message='INVALID_MONTHLY_ARCHIVE_MONTH';end if;
  select * into snapshot from private.aqari_maintenance_monthly_snapshots x where x.workspace_id=w and x.property_id=p and x.due_month=((d->>'month')||'-01')::date;
  if not found then raise no_data_found using message='MONTHLY_SNAPSHOT_NOT_AVAILABLE';end if;
  return jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,'user_id',auth.uid(),'issuedAt',snapshot.issued_at,'payload',snapshot.payload);
 elsif a='save_schedule' then
  if not private.aqari_can_property(w,p,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(w);
  perform 1 from public.aqari_properties where workspace_id=w and id=p for update;
  select * into old from private.aqari_maintenance_report_schedules s where s.workspace_id=w and s.property_id=p;
  if coalesce(old.revision,0) is distinct from (d->>'revision')::integer then raise serialization_failure using message='REVISION_CONFLICT';end if;
  if jsonb_typeof(d->'enabled') is distinct from 'boolean' then raise invalid_parameter_value using message='INVALID_MONTHLY_ARCHIVE_DATA';end if;
  insert into private.aqari_maintenance_report_schedules as s(workspace_id,property_id,enabled,revision,updated_by)
  values(w,p,(d->>'enabled')::boolean,1,auth.uid()) on conflict(workspace_id,property_id) do update set enabled=excluded.enabled,revision=s.revision+1,updated_by=excluded.updated_by,updated_at=statement_timestamp() returning * into record_value;
  select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
  insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
  values(w,'maintenance',p,'monthly_schedule',auth.uid(),coalesce(actor,auth.uid()::text),'تحديث جدولة تقرير يوم 25',case when old.revision is null then null else to_jsonb(old) end,to_jsonb(record_value));
  return jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,'user_id',auth.uid(),'schedule',to_jsonb(record_value));
 end if;
 raise invalid_parameter_value using message='UNKNOWN_MONTHLY_ARCHIVE_ACTION';
end $$;
revoke all on function private.aqari_maintenance_monthly_archive(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_monthly_archive(uuid,uuid,text,jsonb) to authenticated;
create or replace function public.aqari_maintenance_monthly_archive(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_maintenance_monthly_archive(p_workspace_id,p_property_id,p_action,p_data)$$;
revoke all on function public.aqari_maintenance_monthly_archive(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_monthly_archive(uuid,uuid,text,jsonb) to authenticated;
commit;
