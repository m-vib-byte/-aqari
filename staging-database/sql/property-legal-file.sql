-- AQARI V267 Preview/Staging only: property-centered legal file.
-- Additive and fail-closed. Legal history is append-only; case edits retain before/after snapshots.
begin;

create table if not exists private.aqari_property_legal_cases(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 lease_id uuid,
 tenant_id uuid,
 case_no text not null default '' check(length(case_no)<=120),
 title text not null check(length(btrim(title)) between 1 and 300),
 category text not null check(category in('notice','case','claim','eviction','collection','other')),
 lawyer_name text not null default '' check(length(lawyer_name)<=200),
 lawyer_phone text not null default '' check(length(lawyer_phone)<=80),
 court text not null default '' check(length(court)<=200),
 status text not null check(status in('draft','open','hearing','judgment','closed','cancelled')),
 filed_on date,
 next_hearing_on date,
 judgment_on date,
 amount numeric(18,3) check(amount is null or amount>=0),
 notes text not null default '' check(length(notes)<=8000),
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create unique index if not exists aqari_property_legal_case_no_uq on private.aqari_property_legal_cases(workspace_id,lower(case_no)) where length(btrim(case_no))>0;
create index if not exists aqari_property_legal_cases_scope on private.aqari_property_legal_cases(workspace_id,property_id,status,updated_at desc,id);

create table if not exists private.aqari_property_legal_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 case_id uuid not null references private.aqari_property_legal_cases(id),
 kind text not null check(kind in('change','notice','hearing','action','judgment','cost','closure','cancellation','document')),
 happened_on date not null,
 title text not null check(length(btrim(title)) between 1 and 300),
 details text not null default '' check(length(details)<=8000),
 amount numeric(18,3) check(amount is null or amount>=0),
 document_id uuid,
 before_value jsonb,
 after_value jsonb,
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_legal_events add column if not exists before_value jsonb;
alter table private.aqari_property_legal_events add column if not exists after_value jsonb;
create index if not exists aqari_property_legal_events_scope on private.aqari_property_legal_events(workspace_id,property_id,case_id,happened_on desc,id desc);

alter table private.aqari_property_legal_cases enable row level security;
alter table private.aqari_property_legal_events enable row level security;
revoke all on private.aqari_property_legal_cases,private.aqari_property_legal_events from public,anon,authenticated,service_role;

create or replace function private.aqari_property_legal_reject_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='PROPERTY_LEGAL_DELETE_FORBIDDEN';
end $$;
revoke all on function private.aqari_property_legal_reject_delete() from public,anon,authenticated,service_role;

create or replace function private.aqari_property_legal_event_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='PROPERTY_LEGAL_EVENT_IMMUTABLE';
end $$;
revoke all on function private.aqari_property_legal_event_immutable() from public,anon,authenticated,service_role;

drop trigger if exists aqari_property_legal_cases_no_delete on private.aqari_property_legal_cases;
create trigger aqari_property_legal_cases_no_delete before delete on private.aqari_property_legal_cases for each row execute function private.aqari_property_legal_reject_delete();
drop trigger if exists aqari_property_legal_events_immutable on private.aqari_property_legal_events;
create trigger aqari_property_legal_events_immutable before update or delete on private.aqari_property_legal_events for each row execute function private.aqari_property_legal_event_immutable();

create or replace function public.aqari_property_legal_file(p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;p uuid:=p_property_id;d jsonb:=coalesce(p_data,'{}'::jsonb);ident uuid;expected bigint;next_revision bigint;why text;actor text;
 before_row jsonb;after_row jsonb;lease_value uuid;tenant_value uuid;status_value text;category_value text;document_value uuid;event_case uuid;event_kind text;
 can_read boolean;can_write boolean;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_read:=private.aqari_can_property(w,p,'properties','read') and private.aqari_can(w,'contracts','read');
 if not can_read then raise insufficient_privilege using message='PROPERTY_LEGAL_ACCESS_DENIED';end if;
 if p_action='context' then
  return jsonb_build_object(
   'workspace_id',w,'propertyId',p,'user_id',auth.uid(),
   'canWrite',private.aqari_can_property(w,p,'properties','write') and private.aqari_can(w,'contracts','write'),
   'cases',coalesce((select jsonb_agg(jsonb_build_object(
     'id',c.id,'caseNo',c.case_no,'title',c.title,'category',c.category,'status',c.status,'leaseId',c.lease_id,'tenantId',c.tenant_id,
     'lawyerName',c.lawyer_name,'lawyerPhone',c.lawyer_phone,'court',c.court,'filedOn',c.filed_on,'nextHearingOn',c.next_hearing_on,'judgmentOn',c.judgment_on,
     'amount',c.amount,'notes',c.notes,'revision',c.revision,'createdAt',c.created_at,'updatedAt',c.updated_at
    ) order by c.updated_at desc,c.id) from private.aqari_property_legal_cases c where c.workspace_id=w and c.property_id=p),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object(
     'id',e.id,'caseId',e.case_id,'kind',e.kind,'happenedOn',e.happened_on,'title',e.title,'details',e.details,'amount',e.amount,'documentId',e.document_id,
     'beforeValue',e.before_value,'afterValue',e.after_value,'actor',e.actor_name,'createdAt',e.created_at
    ) order by e.happened_on desc,e.id desc) from private.aqari_property_legal_events e where e.workspace_id=w and e.property_id=p),'[]'::jsonb),
   'contracts',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'contractNo',l.contract_no,'tenantId',l.tenant_id,'unitId',l.unit_id,'status',l.status) order by l.start_date desc,l.contract_no)
     from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
     where l.workspace_id=w and u.property_id=p),'[]'::jsonb),
   'tenants',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.full_name) order by t.full_name,t.id)
     from public.aqari_tenants t where t.workspace_id=w and exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.tenant_id=t.id and u.property_id=p)),'[]'::jsonb)
  );
 end if;
 can_write:=private.aqari_can_property(w,p,'properties','write') and private.aqari_can(w,'contracts','write');
 if not can_write then raise insufficient_privilege using message='PROPERTY_LEGAL_WRITE_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 1000 then raise invalid_parameter_value using message='LEGAL_REASON_REQUIRED';end if;

 if p_action='save_case' then
  ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());expected:=coalesce((d->>'revision')::bigint,0);
  lease_value:=nullif(d->>'leaseId','')::uuid;tenant_value:=nullif(d->>'tenantId','')::uuid;status_value:=d->>'status';category_value:=d->>'category';
  if length(btrim(coalesce(d->>'title',''))) not between 1 and 300 or category_value not in('notice','case','claim','eviction','collection','other') or status_value not in('draft','open','hearing','judgment','closed','cancelled') then raise invalid_parameter_value using message='INVALID_LEGAL_CASE';end if;
  if lease_value is not null and not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=lease_value and u.property_id=p and (tenant_value is null or l.tenant_id=tenant_value)) then raise insufficient_privilege using message='LEGAL_CASE_SCOPE_MISMATCH';end if;
  if tenant_value is not null and not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.tenant_id=tenant_value and u.property_id=p) then raise insufficient_privilege using message='LEGAL_TENANT_SCOPE_MISMATCH';end if;
  select to_jsonb(c) into before_row from private.aqari_property_legal_cases c where c.workspace_id=w and c.property_id=p and c.id=ident for update;
  if before_row is null then
   if expected<>0 then raise serialization_failure using message='LEGAL_CASE_REVISION_CONFLICT';end if;next_revision:=1;
   insert into private.aqari_property_legal_cases(id,workspace_id,property_id,lease_id,tenant_id,case_no,title,category,lawyer_name,lawyer_phone,court,status,filed_on,next_hearing_on,judgment_on,amount,notes,revision,created_by,updated_by)
   values(ident,w,p,lease_value,tenant_value,btrim(coalesce(d->>'caseNo','')),btrim(d->>'title'),category_value,btrim(coalesce(d->>'lawyerName','')),btrim(coalesce(d->>'lawyerPhone','')),btrim(coalesce(d->>'court','')),status_value,nullif(d->>'filedOn','')::date,nullif(d->>'nextHearingOn','')::date,nullif(d->>'judgmentOn','')::date,nullif(d->>'amount','')::numeric,btrim(coalesce(d->>'notes','')),1,auth.uid(),auth.uid());
  else
   if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='LEGAL_CASE_REVISION_CONFLICT';end if;next_revision:=expected+1;
   update private.aqari_property_legal_cases set lease_id=lease_value,tenant_id=tenant_value,case_no=btrim(coalesce(d->>'caseNo','')),title=btrim(d->>'title'),category=category_value,lawyer_name=btrim(coalesce(d->>'lawyerName','')),lawyer_phone=btrim(coalesce(d->>'lawyerPhone','')),court=btrim(coalesce(d->>'court','')),status=status_value,filed_on=nullif(d->>'filedOn','')::date,next_hearing_on=nullif(d->>'nextHearingOn','')::date,judgment_on=nullif(d->>'judgmentOn','')::date,amount=nullif(d->>'amount','')::numeric,notes=btrim(coalesce(d->>'notes','')),revision=next_revision,updated_by=auth.uid(),updated_at=now() where workspace_id=w and property_id=p and id=ident;
  end if;
  select to_jsonb(c) into after_row from private.aqari_property_legal_cases c where c.workspace_id=w and c.property_id=p and c.id=ident;
  insert into private.aqari_property_legal_events(workspace_id,property_id,case_id,kind,happened_on,title,details,before_value,after_value,actor_id,actor_name)
  values(w,p,ident,'change',current_date,case when before_row is null then 'إنشاء ملف قانوني' else 'تحديث ملف قانوني' end,why,before_row,after_row,auth.uid(),actor);
  return jsonb_build_object('workspace_id',w,'propertyId',p,'user_id',auth.uid(),'record',after_row);
 end if;

 if p_action='add_event' then
  event_case:=(d->>'caseId')::uuid;event_kind:=d->>'kind';document_value:=nullif(d->>'documentId','')::uuid;
  if event_kind not in('notice','hearing','action','judgment','cost','closure','cancellation','document') or length(btrim(coalesce(d->>'title',''))) not between 1 and 300 then raise invalid_parameter_value using message='INVALID_LEGAL_EVENT';end if;
  if not exists(select 1 from private.aqari_property_legal_cases c where c.workspace_id=w and c.property_id=p and c.id=event_case) then raise insufficient_privilege using message='LEGAL_EVENT_SCOPE_MISMATCH';end if;
  if document_value is not null and not exists(
   select 1 from public.aqari_documents x join public.aqari_properties q on q.workspace_id=x.workspace_id and q.id=p
   join private.aqari_property_legal_cases c on c.workspace_id=x.workspace_id and c.property_id=q.id and c.id=event_case
   where x.workspace_id=w and x.id=document_value and x.status<>'cancelled'
   and x.entity_ref in(q.id::text,q.external_ref,coalesce(c.lease_id::text,''),coalesce(c.tenant_id::text,''))
  ) then raise invalid_parameter_value using message='LEGAL_DOCUMENT_SCOPE_MISMATCH';end if;
  insert into private.aqari_property_legal_events(workspace_id,property_id,case_id,kind,happened_on,title,details,amount,document_id,actor_id,actor_name)
  values(w,p,event_case,event_kind,coalesce(nullif(d->>'happenedOn','')::date,current_date),btrim(d->>'title'),btrim(coalesce(d->>'details','')),nullif(d->>'amount','')::numeric,document_value,auth.uid(),actor);
  return jsonb_build_object('workspace_id',w,'propertyId',p,'user_id',auth.uid(),'caseId',event_case,'ok',true);
 end if;
 raise invalid_parameter_value using message='UNKNOWN_PROPERTY_LEGAL_ACTION';
end $$;
revoke all on function public.aqari_property_legal_file(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_legal_file(uuid,uuid,text,jsonb) to authenticated;
commit;