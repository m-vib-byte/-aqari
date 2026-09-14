-- AQARI V267 Preview/Staging only: immutable before/after maintenance evidence and measured SLA aging.
-- Additive/repeatable. Existing tasks are marked legacy policy=0; newly generated tasks default to policy=1.
begin;

alter table private.aqari_property_maintenance_tasks
 add column if not exists evidence_policy_version smallint;
update private.aqari_property_maintenance_tasks set evidence_policy_version=0 where evidence_policy_version is null;
alter table private.aqari_property_maintenance_tasks alter column evidence_policy_version set default 1;
alter table private.aqari_property_maintenance_tasks alter column evidence_policy_version set not null;
alter table private.aqari_property_maintenance_tasks drop constraint if exists aqari_maintenance_evidence_policy_check;
alter table private.aqari_property_maintenance_tasks add constraint aqari_maintenance_evidence_policy_check check(evidence_policy_version in(0,1));

create table if not exists private.aqari_maintenance_evidence(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 property_id uuid not null,
 task_id uuid not null,
 document_id uuid not null references public.aqari_documents(id),
 stage text not null check(stage in('before','after')),
 note text not null default '' check(length(note)<=1000),
 captured_by uuid not null references auth.users(id),
 captured_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,task_id) references private.aqari_property_maintenance_tasks(workspace_id,id),
 unique(workspace_id,task_id,document_id,stage)
);
create index if not exists aqari_maintenance_evidence_task on private.aqari_maintenance_evidence(workspace_id,property_id,task_id,stage,captured_at,id);
alter table private.aqari_maintenance_evidence enable row level security;
revoke all on private.aqari_maintenance_evidence from public,anon,authenticated,service_role;

drop trigger if exists aqari_maintenance_evidence_immutable on private.aqari_maintenance_evidence;
create trigger aqari_maintenance_evidence_immutable before update or delete on private.aqari_maintenance_evidence
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_maintenance_evidence_status_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
  if new.status='in_progress' and new.evidence_policy_version>=1
   and not exists(select 1 from private.aqari_maintenance_evidence e where e.workspace_id=new.workspace_id and e.task_id=new.id and e.stage='before')
  then raise check_violation using message='MAINTENANCE_BEFORE_EVIDENCE_REQUIRED';end if;
  if new.status='completed' then
   if not exists(select 1 from private.aqari_maintenance_evidence e where e.workspace_id=new.workspace_id and e.task_id=new.id and e.stage='after')
   then raise check_violation using message='MAINTENANCE_AFTER_EVIDENCE_REQUIRED';end if;
   if new.evidence_policy_version>=1
    and not exists(select 1 from private.aqari_maintenance_evidence e where e.workspace_id=new.workspace_id and e.task_id=new.id and e.stage='before')
   then raise check_violation using message='MAINTENANCE_BEFORE_EVIDENCE_REQUIRED';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.aqari_maintenance_evidence_status_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_maintenance_evidence_status_guard on private.aqari_property_maintenance_tasks;
create trigger aqari_maintenance_evidence_status_guard before update of status on private.aqari_property_maintenance_tasks
 for each row execute function private.aqari_maintenance_evidence_status_guard();

create or replace function public.aqari_maintenance_evidence(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;p uuid:=p_property_id;d jsonb:=coalesce(p_data,'{}'::jsonb);task_id uuid;document_id uuid;stage_value text;why text;actor text;task private.aqari_property_maintenance_tasks;record_json jsonb;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can(w,'maintenance','read') or not private.aqari_can_property(w,p,'maintenance','read') then raise insufficient_privilege using message='MAINTENANCE_EVIDENCE_ACCESS_DENIED';end if;
 if p_action='context' then
  return jsonb_build_object(
   'workspace_id',w,'propertyId',p,'user_id',auth.uid(),
   'canWrite',private.aqari_can(w,'maintenance','write') and private.aqari_can_property(w,p,'maintenance','write') and private.aqari_can(w,'documents','read'),
   'tasks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'taskNo',t.task_no,'description',t.description,'status',t.status,'dueOn',t.due_on,
      'assignedAt',t.assigned_at,'startedAt',t.started_at,'completedAt',t.completed_at,'policyVersion',t.evidence_policy_version,
      'overdueDays',case when t.status in('completed','cancelled') then greatest(0,((coalesce(t.completed_at,t.cancelled_at) at time zone 'Asia/Kuwait')::date-t.due_on)) else greatest(0,((now() at time zone 'Asia/Kuwait')::date-t.due_on)) end,
      'needsEscalation',t.status not in('completed','cancelled') and (now() at time zone 'Asia/Kuwait')::date>t.due_on,
      'responseMinutes',case when t.assigned_at is null then null else greatest(0,floor(extract(epoch from (coalesce(t.started_at,t.completed_at,now())-t.assigned_at))/60)) end,
      'resolutionMinutes',case when t.started_at is null then null else greatest(0,floor(extract(epoch from (coalesce(t.completed_at,now())-t.started_at))/60)) end
    ) order by t.due_on desc,t.task_no) from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.property_id=p),'[]'::jsonb),
   'evidence',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'taskId',e.task_id,'documentId',e.document_id,'stage',e.stage,'note',e.note,'capturedAt',e.captured_at,'capturedBy',coalesce(nullif(pr.display_name,''),e.captured_by::text)) order by e.captured_at,e.id)
      from private.aqari_maintenance_evidence e left join public.aqari_profiles pr on pr.user_id=e.captured_by where e.workspace_id=w and e.property_id=p),'[]'::jsonb),
   'imageDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'documentNo',x.document_no,'mimeType',x.mime_type) order by x.created_at desc,x.id)
      from public.aqari_documents x where x.workspace_id=w and x.status='uploaded' and x.mime_type in('image/jpeg','image/png','image/webp','image/heic','image/heif') and private.aqari_operations_document(w,p,x.id) and private.aqari_document_entity(w,x.entity_type,x.entity_ref,'read')),'[]'::jsonb)
  );
 end if;
 if p_action<>'add' then raise invalid_parameter_value using message='UNKNOWN_MAINTENANCE_EVIDENCE_ACTION';end if;
 if not private.aqari_can(w,'maintenance','write') or not private.aqari_can_property(w,p,'maintenance','write') or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='MAINTENANCE_EVIDENCE_WRITE_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 task_id:=nullif(d->>'taskId','')::uuid;document_id:=nullif(d->>'documentId','')::uuid;stage_value:=d->>'stage';why:=btrim(coalesce(d->>'reason',''));
 if task_id is null or document_id is null or stage_value not in('before','after') or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='INVALID_MAINTENANCE_EVIDENCE';end if;
 select * into task from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.property_id=p and t.id=task_id for update;
 if not found then raise insufficient_privilege using message='MAINTENANCE_TASK_SCOPE_MISMATCH';end if;
 if stage_value='before' and task.status not in('scheduled','assigned') then raise check_violation using message='MAINTENANCE_BEFORE_EVIDENCE_WINDOW_CLOSED';end if;
 if stage_value='after' and task.status<>'in_progress' then raise check_violation using message='MAINTENANCE_AFTER_EVIDENCE_REQUIRES_IN_PROGRESS';end if;
 if not private.aqari_operations_document(w,p,document_id) or not exists(select 1 from public.aqari_documents x where x.workspace_id=w and x.id=document_id and x.status='uploaded' and x.mime_type in('image/jpeg','image/png','image/webp','image/heic','image/heif') and private.aqari_document_entity(w,x.entity_type,x.entity_ref,'read')) then raise check_violation using message='MAINTENANCE_EVIDENCE_IMAGE_NOT_VERIFIED';end if;
 insert into private.aqari_maintenance_evidence(workspace_id,property_id,task_id,document_id,stage,note,captured_by)
 values(w,p,task_id,document_id,stage_value,why,auth.uid())
 returning jsonb_build_object('id',id,'workspace_id',workspace_id,'property_id',property_id,'task_id',task_id,'document_id',document_id,'stage',stage,'note',note,'captured_by',captured_by,'captured_at',captured_at) into record_json;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,'maintenance',task_id,'evidence_'||stage_value,auth.uid(),actor,why,null,record_json);
 return jsonb_build_object('workspace_id',w,'propertyId',p,'user_id',auth.uid(),'record',record_json);
end $$;
revoke all on function public.aqari_maintenance_evidence(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_maintenance_evidence(uuid,uuid,text,jsonb) to authenticated;

commit;