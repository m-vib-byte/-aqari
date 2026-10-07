-- Preview candidate only. No automatic Production migration or scheduler activation.
begin;
create table if not exists private.aqari_maintenance_report_details(
 workspace_id uuid not null, property_id uuid not null, task_id uuid not null,
 revision integer not null check(revision>0), task_revision integer not null,
 inspection_kind text check(inspection_kind in('fire_system','elevator','air_conditioning','water_tank','sprinklers','other')),
 technician_name text not null default '' check(length(technician_name)<=200),
 inspected_on date, invoice_number text not null default '' check(length(invoice_number)<=100),
 invoice_document_id uuid references public.aqari_documents(id),
 result_details text not null default '' check(length(result_details)<=4000),
 responsible_user_id uuid, planned_close_on date, urgent boolean not null default false,
 verified_by uuid, verified_at timestamptz,
 recorded_by uuid not null, recorded_at timestamptz not null default statement_timestamp(),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 primary key(workspace_id,task_id,revision),
 foreign key(workspace_id,task_id) references private.aqari_property_maintenance_tasks(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check((verified_by is null)=(verified_at is null))
);
alter table private.aqari_maintenance_report_details enable row level security;
revoke all on private.aqari_maintenance_report_details from public,anon,authenticated;
create or replace trigger aqari_maintenance_details_immutable before update or delete
 on private.aqari_maintenance_report_details for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_monthly_responsible(w uuid,p uuid,u uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=u and m.is_active
  and (m.role='general_manager' or exists(select 1 from private.aqari_staff_assignments a
   where a.workspace_id=w and a.user_id=u and a.is_active and p=any(a.property_ids))))
$$;
revoke all on function private.aqari_monthly_responsible(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_monthly_details_context(w uuid,p uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('details',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object(
  'responsible_name',nullif(pr.display_name,''),'verified_name',nullif(vr.display_name,'')) order by d.task_id)
  from (select distinct on(task_id) * from private.aqari_maintenance_report_details
   where workspace_id=w and property_id=p order by task_id,revision desc) d
  left join public.aqari_profiles pr on pr.user_id=d.responsible_user_id
  left join public.aqari_profiles vr on vr.user_id=d.verified_by),'[]'::jsonb),
 'responsibles',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(pr.display_name,''),m.user_id::text)) order by pr.display_name,m.user_id)
  from public.aqari_memberships m left join public.aqari_profiles pr on pr.user_id=m.user_id
  where m.workspace_id=w and private.aqari_monthly_responsible(w,p,m.user_id)),'[]'::jsonb))
$$;
revoke all on function private.aqari_monthly_details_context(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_maintenance_report_details(w uuid,p uuid,a text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare task private.aqari_property_maintenance_tasks; previous private.aqari_maintenance_report_details;
 row_value private.aqari_maintenance_report_details; result jsonb; doc uuid; responsible uuid; inspected date; planned date;
 verify_result boolean; why text; actor text; day_now date:=(statement_timestamp() at time zone 'Asia/Kuwait')::date;
begin
 if auth.uid() is null or not private.aqari_can_property(w,p,'maintenance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>16000 then raise invalid_parameter_value using message='INVALID_MONTHLY_DETAILS';end if;
 if a='context' then
  result:=private.aqari_monthly_details_context(w,p);
  -- A document hidden from this reader must not validate an invoice.
  return result||jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,'user_id',auth.uid(),
   'canWrite',private.aqari_can_property(w,p,'maintenance','write'),'canVerify',private.aqari_manager(w),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'number',x.document_no,'title',x.title,'mimeType',x.mime_type,'storagePath',x.storage_path,'entityRef',x.entity_ref) order by x.created_at desc)
    from public.aqari_documents x where x.workspace_id=w and private.aqari_can(w,'documents','read')
     and private.aqari_operations_document(w,p,x.id) and private.aqari_document_entity(w,x.entity_type,x.entity_ref,'read')),'[]'::jsonb));
 end if;
 if a<>'save' then raise invalid_parameter_value using message='UNKNOWN_MONTHLY_DETAILS_ACTION';end if;
 if not private.aqari_can_property(w,p,'maintenance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 -- Serialize writers on the existing task without changing it or its operational status.
 select * into task from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.property_id=p and t.id=(d->>'task_id')::uuid for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if task.revision is distinct from (d->>'task_revision')::integer then raise serialization_failure using message='REVISION_CONFLICT';end if;
 select * into previous from private.aqari_maintenance_report_details x where x.workspace_id=w and x.task_id=task.id order by x.revision desc limit 1;
 if coalesce(previous.revision,0) is distinct from (d->>'revision')::integer then raise serialization_failure using message='REVISION_CONFLICT';end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in('task_id','task_revision','revision','inspection_kind','technician_name','inspected_on','invoice_number','invoice_document_id','result_details','responsible_user_id','planned_close_on','urgent','verify_result','reason')) then raise invalid_parameter_value using message='INVALID_MONTHLY_DETAILS';end if;
 why:=btrim(coalesce(d->>'reason',''));doc:=nullif(d->>'invoice_document_id','')::uuid;responsible:=nullif(d->>'responsible_user_id','')::uuid;
 inspected:=nullif(d->>'inspected_on','')::date;planned:=nullif(d->>'planned_close_on','')::date;verify_result:=coalesce((d->>'verify_result')::boolean,false);
 if verify_result and not private.aqari_manager(w) then raise insufficient_privilege using message='MONTHLY_RESULT_MANAGER_REQUIRED';end if;
 if length(why) not between 3 and 1000 or length(btrim(coalesce(d->>'technician_name','')))>200
  or length(btrim(coalesce(d->>'invoice_number','')))>100 or length(btrim(coalesce(d->>'result_details','')))>4000
  or nullif(d->>'inspection_kind','') not in('fire_system','elevator','air_conditioning','water_tank','sprinklers','other')
  or inspected>day_now then raise invalid_parameter_value using message='INVALID_MONTHLY_DETAILS';end if;
 if responsible is not null and not private.aqari_monthly_responsible(w,p,responsible) then raise check_violation using message='INVALID_MONTHLY_RESPONSIBLE';end if;
 if doc is not null and (not private.aqari_can(w,'documents','read') or not private.aqari_operations_document(w,p,doc)
  or not exists(select 1 from public.aqari_documents x where x.workspace_id=w and x.id=doc and private.aqari_document_entity(w,x.entity_type,x.entity_ref,'read')))
 then raise check_violation using message='INVALID_MONTHLY_INVOICE_DOCUMENT';end if;
 if verify_result then
  if not private.aqari_manager(w) then raise insufficient_privilege using message='MONTHLY_RESULT_MANAGER_REQUIRED';end if;
  if task.status<>'completed' or task.completed_by is null or task.assigned_at is null or task.started_at is null or task.completed_at is null
   or task.started_at<task.assigned_at or task.completed_at<task.started_at or task.completed_at>statement_timestamp()
   or not private.aqari_operations_document(w,p,task.completion_document_id)
   or nullif(btrim(d->>'technician_name'),'') is null or inspected is null or doc is null
   or nullif(btrim(d->>'invoice_number'),'') is null or length(btrim(coalesce(d->>'result_details','')))<3
   or responsible is null or planned is null or nullif(d->>'inspection_kind','') is null
   or not exists(select 1 from private.aqari_maintenance_evidence e where e.workspace_id=w and e.property_id=p and e.task_id=task.id and e.stage='before' and private.aqari_operations_document(w,p,e.document_id))
   or not exists(select 1 from private.aqari_maintenance_evidence e where e.workspace_id=w and e.property_id=p and e.task_id=task.id and e.stage='after' and task.photo_document_ids ? e.document_id::text and private.aqari_operations_document(w,p,e.document_id))
  then raise check_violation using message='MONTHLY_RESULT_EVIDENCE_REQUIRED';end if;
 end if;
 insert into private.aqari_maintenance_report_details(workspace_id,property_id,task_id,revision,task_revision,inspection_kind,technician_name,inspected_on,invoice_number,invoice_document_id,result_details,responsible_user_id,planned_close_on,urgent,verified_by,verified_at,recorded_by,reason)
 values(w,p,task.id,coalesce(previous.revision,0)+1,task.revision,nullif(d->>'inspection_kind',''),btrim(coalesce(d->>'technician_name','')),inspected,btrim(coalesce(d->>'invoice_number','')),doc,btrim(coalesce(d->>'result_details','')),responsible,planned,coalesce((d->>'urgent')::boolean,false),case when verify_result then auth.uid() end,case when verify_result then statement_timestamp() end,auth.uid(),why)
 returning * into row_value;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,'maintenance',task.id,'monthly_details',auth.uid(),coalesce(actor,auth.uid()::text),why,case when previous.revision is null then null else to_jsonb(previous) end,to_jsonb(row_value));
 return jsonb_build_object('version',1,'workspace_id',w,'propertyId',p,'user_id',auth.uid(),'record',to_jsonb(row_value));
end $$;
revoke all on function private.aqari_maintenance_report_details(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_report_details(uuid,uuid,text,jsonb) to authenticated;
create or replace function public.aqari_maintenance_report_details(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_maintenance_report_details(p_workspace_id,p_property_id,p_action,p_data)$$;
revoke all on function public.aqari_maintenance_report_details(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_maintenance_report_details(uuid,uuid,text,jsonb) to authenticated;
commit;
