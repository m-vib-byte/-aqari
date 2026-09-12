-- Verified isolated target only. Staff circulars and capability discovery.
begin;
-- Internal staff circulars. No outbound message, copied account or existing-data rewrite.
-- Requires workspace controls, staff-property-scope.sql and mfa-enforcement.sql; apply to the verified test branch.
create table private.aqari_staff_circulars(
 id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),
 title text not null check(length(btrim(title)) between 1 and 200),
 body text not null check(length(btrim(body)) between 1 and 10000),
 recipient_ids uuid[] not null check(cardinality(recipient_ids) between 1 and 200),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 revision integer not null default 1 check(revision>0),published_revision integer,
 published_at timestamptz,expires_at timestamptz,
 created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),check(status<>'published' or (published_at is not null and published_revision=revision))
);
create table private.aqari_staff_circular_versions(
 circular_id uuid not null references private.aqari_staff_circulars(id),revision integer not null,
 action text not null check(action in ('save','publish','archive')),actor_id uuid not null,actor_name text not null,
 recorded_at timestamptz not null default now(),reason text not null default '',before_snapshot jsonb,after_snapshot jsonb not null,
 primary key(circular_id,revision)
);
create table private.aqari_staff_circular_recipients(
 circular_id uuid not null,notice_revision integer not null,user_id uuid not null,user_name text not null,
 primary key(circular_id,notice_revision,user_id),
 foreign key(circular_id,notice_revision) references private.aqari_staff_circular_versions(circular_id,revision)
);
create table private.aqari_staff_circular_acknowledgements(
 circular_id uuid not null,notice_revision integer not null,user_id uuid not null,
 acknowledged_at timestamptz not null default now(),
 primary key(circular_id,notice_revision,user_id),
 foreign key(circular_id,notice_revision,user_id) references private.aqari_staff_circular_recipients(circular_id,notice_revision,user_id)
);
create index aqari_staff_circular_feed on private.aqari_staff_circulars(workspace_id,status,published_at desc);
create index aqari_staff_circular_recipient_feed on private.aqari_staff_circular_recipients(user_id,circular_id,notice_revision);
alter table private.aqari_staff_circulars enable row level security;
alter table private.aqari_staff_circular_versions enable row level security;
alter table private.aqari_staff_circular_recipients enable row level security;
alter table private.aqari_staff_circular_acknowledgements enable row level security;
revoke all on private.aqari_staff_circulars,private.aqari_staff_circular_versions,private.aqari_staff_circular_recipients,private.aqari_staff_circular_acknowledgements from public,anon,authenticated;

create function private.aqari_staff_circular_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise check_violation using message='CIRCULAR_HISTORY_IMMUTABLE';end$$;
revoke all on function private.aqari_staff_circular_immutable() from public,anon,authenticated;
create trigger aqari_staff_circular_versions_immutable before update or delete on private.aqari_staff_circular_versions for each row execute function private.aqari_staff_circular_immutable();
create trigger aqari_staff_circular_recipients_immutable before update or delete on private.aqari_staff_circular_recipients for each row execute function private.aqari_staff_circular_immutable();
create trigger aqari_staff_circular_ack_immutable before update or delete on private.aqari_staff_circular_acknowledgements for each row execute function private.aqari_staff_circular_immutable();
create function private.aqari_staff_circular_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise check_violation using message='CIRCULAR_HISTORY_IMMUTABLE';end if;
 if new.id<>old.id or new.workspace_id<>old.workspace_id or new.created_by<>old.created_by or new.created_at<>old.created_at or new.revision<>old.revision+1 then raise check_violation using message='INVALID_CIRCULAR_CHANGE';end if;
 if old.status<>'draft' and (old.status='archived' or new.status<>'archived' or (to_jsonb(new)-array['status','revision','updated_at']) is distinct from (to_jsonb(old)-array['status','revision','updated_at'])) then raise check_violation using message='PUBLISHED_CIRCULAR_IMMUTABLE';end if;
 return new;
end$$;
revoke all on function private.aqari_staff_circular_guard() from public,anon,authenticated;
create trigger aqari_staff_circular_guard before update or delete on private.aqari_staff_circulars for each row execute function private.aqari_staff_circular_guard();

create function private.aqari_staff_circulars_api(w uuid,action text,d jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare n private.aqari_staff_circulars%rowtype;before_value jsonb;ident uuid;expected integer;who text;
 manager boolean;keys text[];targets uuid[];expiration timestamptz;why text:='';stamp timestamptz;
begin
 if auth.uid() is null or w is null or not exists(select 1 from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action is null or action not in ('list','save','publish','archive','history','ack') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>65536 then raise invalid_parameter_value using message='INVALID_CIRCULAR_REQUEST';end if;
 keys:=case action when 'save' then array['id','revision','title','body','recipient_ids','expires_at'] when 'archive' then array['id','revision','reason'] when 'history' then array['id'] when 'list' then array[]::text[] else array['id','revision'] end;
 if exists(select 1 from jsonb_object_keys(d) k where not k=any(keys)) then raise invalid_parameter_value using message='INVALID_CIRCULAR_FIELDS';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'notifications','read');
 if action='list' then
  return jsonb_build_object('manager',manager,
   'staff',case when manager then coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',coalesce(nullif(p.display_name,''),'موظف')) order by p.display_name,m.user_id) from public.aqari_memberships m left join public.aqari_profiles p on p.user_id=m.user_id where m.workspace_id=w and m.is_active),'[]') else '[]'::jsonb end,
   'notices',coalesce((select jsonb_agg(q.item order by q.updated_at desc,q.id) from (
    select x.id,x.updated_at,(case when manager then to_jsonb(x) else jsonb_build_object('id',x.id,'title',x.title,'body',x.body,'status',x.status,'revision',x.revision,'published_at',x.published_at,'expires_at',x.expires_at) end)||jsonb_build_object(
     'can_ack',x.status='published' and (x.expires_at is null or x.expires_at>now()) and exists(select 1 from private.aqari_staff_circular_recipients r where r.circular_id=x.id and r.notice_revision=x.published_revision and r.user_id=auth.uid()),
     'acknowledged_at',(select a.acknowledged_at from private.aqari_staff_circular_acknowledgements a where a.circular_id=x.id and a.notice_revision=x.published_revision and a.user_id=auth.uid()),
     'ack_count',case when manager then (select count(*) from private.aqari_staff_circular_acknowledgements a where a.circular_id=x.id and a.notice_revision=x.published_revision) else null end) item
    from private.aqari_staff_circulars x where x.workspace_id=w and (manager or (x.status='published' and x.published_at<=now() and (x.expires_at is null or x.expires_at>now()) and exists(select 1 from private.aqari_staff_circular_recipients r where r.circular_id=x.id and r.notice_revision=x.published_revision and r.user_id=auth.uid()))) order by x.updated_at desc,x.id limit 100
   )q),'[]'));
 end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='CIRCULAR_ID_REQUIRED';end if;
 if action='ack' then
  -- Lock membership and publication for the explicit acknowledgement transaction.
  perform 1 from public.aqari_memberships where workspace_id=w and user_id=auth.uid() and is_active for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select * into n from private.aqari_staff_circulars x where x.workspace_id=w and x.id=ident for share;
  if not found or n.status<>'published' or n.published_at>now() or (n.expires_at is not null and n.expires_at<=now()) or not exists(select 1 from private.aqari_staff_circular_recipients r where r.circular_id=n.id and r.notice_revision=n.published_revision and r.user_id=auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  expected:=nullif(d->>'revision','')::integer;if expected is distinct from n.published_revision then raise serialization_failure using message='REVISION_CONFLICT';end if;
  insert into private.aqari_staff_circular_acknowledgements(circular_id,notice_revision,user_id) values(n.id,n.published_revision,auth.uid()) on conflict do nothing;
  select acknowledged_at into stamp from private.aqari_staff_circular_acknowledgements a where a.circular_id=n.id and a.notice_revision=n.published_revision and a.user_id=auth.uid();
  return jsonb_build_object('acknowledged_at',stamp);
 end if;
 if not manager or (action<>'history' and not private.aqari_can(w,'notifications','write')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action<>'history' then perform private.aqari_require_sensitive_aal2(w);end if;
 -- Serializes draft creation/retry as well as changes, without taking business-table locks.
 perform pg_advisory_xact_lock(hashtextextended('staff-circular:'||w::text||':'||ident::text,0));
 select * into n from private.aqari_staff_circulars x where x.workspace_id=w and x.id=ident for update;
 if action='history' then
  if n.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return jsonb_build_object('versions',coalesce((select jsonb_agg(to_jsonb(v) order by v.revision desc) from private.aqari_staff_circular_versions v where v.circular_id=n.id),'[]'),
   'recipients',coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'user_name',r.user_name,'notice_revision',r.notice_revision,'acknowledged_at',a.acknowledged_at) order by r.user_name,r.user_id) from private.aqari_staff_circular_recipients r left join private.aqari_staff_circular_acknowledgements a using(circular_id,notice_revision,user_id) where r.circular_id=n.id),'[]'));
 end if;
 expected:=nullif(d->>'revision','')::integer;
 if action='save' then
  if jsonb_typeof(d->'title') is distinct from 'string' or jsonb_typeof(d->'body') is distinct from 'string' or length(btrim(d->>'title')) not between 1 and 200 or length(btrim(d->>'body')) not between 1 and 10000 or jsonb_typeof(d->'recipient_ids') is distinct from 'array' then raise check_violation using message='INVALID_CIRCULAR_CONTENT';end if;
  select array_agg(value::uuid order by value::uuid) into targets from jsonb_array_elements_text(d->'recipient_ids');
  if cardinality(targets) is null or cardinality(targets) not between 1 and 200 or array_position(targets,null) is not null or cardinality(targets)<>(select count(distinct x) from unnest(targets)x) or exists(select 1 from unnest(targets)t where not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=t and m.is_active)) then raise check_violation using message='INVALID_CIRCULAR_RECIPIENTS';end if;
  expiration:=nullif(d->>'expires_at','')::timestamptz;
  if n.id is not null and n.status='draft' and n.revision=expected+1 and n.title=btrim(d->>'title') and n.body=btrim(d->>'body') and n.recipient_ids=targets and n.expires_at is not distinct from expiration then return to_jsonb(n);end if;
 elsif action='publish' and n.status='published' and n.revision=expected+1 then return to_jsonb(n);
 elsif action='archive' then
  why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 500 then raise check_violation using message='ARCHIVE_REASON_REQUIRED';end if;
  if n.status='archived' and n.revision=expected+1 and exists(select 1 from private.aqari_staff_circular_versions v where v.circular_id=n.id and v.revision=n.revision and v.action='archive' and v.reason=why) then return to_jsonb(n);end if;
 end if;
 if expected is distinct from coalesce(n.revision,0) then raise serialization_failure using message='REVISION_CONFLICT';end if;
 before_value:=case when n.id is null then null else to_jsonb(n) end;
 select coalesce(nullif(display_name,''),auth.uid()::text) into who from public.aqari_profiles where user_id=auth.uid();who:=coalesce(who,auth.uid()::text);
 if action='save' then
  if n.id is not null and n.status<>'draft' then raise check_violation using message='PUBLISHED_CIRCULAR_IMMUTABLE';end if;
  if n.id is null then insert into private.aqari_staff_circulars(id,workspace_id,title,body,recipient_ids,expires_at,created_by) values(ident,w,btrim(d->>'title'),btrim(d->>'body'),targets,expiration,auth.uid()) returning * into n;
  else update private.aqari_staff_circulars set title=btrim(d->>'title'),body=btrim(d->>'body'),recipient_ids=targets,expires_at=expiration,revision=revision+1,updated_at=now() where id=n.id returning * into n;end if;
 elsif action='publish' then
  if n.id is null or n.status<>'draft' then raise check_violation using message='CIRCULAR_DRAFT_REQUIRED';end if;
  if n.expires_at is not null and n.expires_at<=now() then raise check_violation using message='CIRCULAR_EXPIRED';end if;
  perform 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=any(n.recipient_ids) and m.is_active for share;
  if (select count(*) from public.aqari_memberships m where m.workspace_id=w and m.user_id=any(n.recipient_ids) and m.is_active)<>cardinality(n.recipient_ids) then raise check_violation using message='INVALID_CIRCULAR_RECIPIENTS';end if;
  update private.aqari_staff_circulars set status='published',published_at=now(),published_revision=revision+1,revision=revision+1,updated_at=now() where id=n.id returning * into n;
 else
  if n.id is null or n.status='archived' then raise check_violation using message='CIRCULAR_ARCHIVED';end if;
  update private.aqari_staff_circulars set status='archived',revision=revision+1,updated_at=now() where id=n.id returning * into n;
 end if;
 insert into private.aqari_staff_circular_versions(circular_id,revision,action,actor_id,actor_name,reason,before_snapshot,after_snapshot) values(n.id,n.revision,action,auth.uid(),who,why,before_value,to_jsonb(n));
 if action='publish' then insert into private.aqari_staff_circular_recipients(circular_id,notice_revision,user_id,user_name) select n.id,n.revision,m.user_id,coalesce(nullif(p.display_name,''),'موظف') from public.aqari_memberships m left join public.aqari_profiles p on p.user_id=m.user_id where m.workspace_id=w and m.user_id=any(n.recipient_ids) and m.is_active;end if;
 return to_jsonb(n);
end$$;
revoke all on function private.aqari_staff_circulars_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_staff_circulars_api(uuid,text,jsonb) to authenticated;
create function public.aqari_staff_circulars(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql volatile security invoker set search_path='' as $$select private.aqari_staff_circulars_api(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_staff_circulars(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_staff_circulars(uuid,text,jsonb) to authenticated;

-- Run only in an independently verified development target, after staff-property-scope.sql
-- and financial-register.sql. Does not create accounts, assignments or business records.
create or replace function public.aqari_workspace_access(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;access jsonb:='{}';s text;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 foreach s in array private.aqari_section_keys() loop
  access:=access||jsonb_build_object(s,jsonb_build_object('read',private.aqari_can(p_workspace_id,s,'read'),'write',private.aqari_can(p_workspace_id,s,'write')));
 end loop;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'role',r,
  'sections',coalesce(cfg->'sections','{}'),'permissions',access,'labels',coalesce(cfg->'labels','{}'),
  'features',jsonb_build_object(
   'staff_circulars',to_regprocedure('public.aqari_staff_circulars(uuid,text,jsonb)') is not null,
   'final_gap_register',r='general_manager' and to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is not null,
   'official_documents',r='general_manager' and to_regprocedure('public.aqari_official_document_register(uuid,text,jsonb)') is not null and to_regprocedure('public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb)') is not null,
   'external_integrations',r='general_manager' and to_regprocedure('public.aqari_external_integrations(uuid,text,jsonb)') is not null,
   'financial_archive',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_archive(uuid,text)') is not null,
   'compliance_register',r='general_manager' and to_regprocedure('public.aqari_compliance_register(uuid,text,text,jsonb)') is not null,
   'kpi_dashboard',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_kpi_dashboard(uuid,date,date)') is not null,
   'maintenance_plans',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_maintenance_plans(uuid,text,jsonb)') is not null,
   'operations_register',r='general_manager' and to_regprocedure('public.aqari_operations_register(uuid,text,text,jsonb)') is not null,
   'unit_readiness',private.aqari_can(p_workspace_id,'properties','read') and to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null,
   'unit_meter_readings',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_unit_meter_register(uuid,text,jsonb)') is not null,
   'vacating_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_review(uuid,text,jsonb)') is not null,
   'vacating_settlement',private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_settlement(uuid,text,jsonb)') is not null,
   'exit_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_exit_review(uuid,text,jsonb)') is not null,
   'staff_access',r='general_manager' and to_regprocedure('public.aqari_staff_access(uuid,text,jsonb)') is not null,
   'financial_register',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_register(uuid,text,jsonb)') is not null,
   'deposit_register',private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_deposit_register(uuid,text,jsonb)') is not null));
end $$;
revoke all on function public.aqari_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.aqari_workspace_access(uuid) to authenticated;
commit;

