-- Additive, manager-owned preparation for a NEW staff email only.
-- No Auth account, email, operational assignment or existing row is created here.
begin;

create table if not exists private.aqari_staff_account_preparations(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 email text not null unique check(email=lower(btrim(email))),
 display_name text not null check(length(btrim(display_name)) between 1 and 120),
 role public.aqari_role not null check(role::text in('viewer','accountant','property_manager')),
 status text not null default 'prepared' check(status in('prepared','registered','cancelled')),
 revision bigint not null default 1 check(revision>0),
 request_id uuid not null,
 created_by uuid not null,
 registered_user_id uuid,
 allowlist_fingerprint text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status='registered')=(registered_user_id is not null))
);
create index if not exists aqari_staff_preparation_workspace on private.aqari_staff_account_preparations(workspace_id,created_at desc,id);
create table if not exists private.aqari_staff_preparation_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 preparation_id uuid not null references private.aqari_staff_account_preparations(id),
 action text not null check(action in('prepare','cancel','registered')),
 actor_id uuid not null,
 request_id uuid unique,
 request_payload jsonb,
 reason text not null,
 before_snapshot jsonb,
 after_snapshot jsonb not null,
 result jsonb,
 recorded_at timestamptz not null default now()
);
create index if not exists aqari_staff_preparation_audit_workspace on private.aqari_staff_preparation_audit(workspace_id,recorded_at desc,id);
alter table private.aqari_staff_account_preparations enable row level security;
alter table private.aqari_staff_preparation_audit enable row level security;
revoke all on private.aqari_staff_account_preparations,private.aqari_staff_preparation_audit from public,anon,authenticated,service_role;
revoke all on sequence private.aqari_staff_preparation_audit_id_seq from public,anon,authenticated,service_role;

create or replace function private.aqari_staff_preparation_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise exception 'STAFF_PREPARATION_HISTORY_IMMUTABLE' using errcode='55000';end$$;
drop trigger if exists aqari_staff_preparation_no_delete on private.aqari_staff_account_preparations;
create trigger aqari_staff_preparation_no_delete before delete on private.aqari_staff_account_preparations for each row execute function private.aqari_staff_preparation_immutable();
drop trigger if exists aqari_staff_preparation_audit_immutable on private.aqari_staff_preparation_audit;
create trigger aqari_staff_preparation_audit_immutable before update or delete on private.aqari_staff_preparation_audit for each row execute function private.aqari_staff_preparation_immutable();

create or replace function private.aqari_staff_preparation_snapshot(r private.aqari_staff_account_preparations)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'email',r.email,'display_name',r.display_name,'role',r.role,
  'revision',r.revision,'status',r.status,'request_id',r.request_id,'created_at',r.created_at,'updated_at',r.updated_at,
  'can_cancel',r.status='prepared' and r.created_by=auth.uid())
$$;

-- The same transaction lock is used by prepare/cancel and identity writers.
-- This only reserves NEW prepared emails; original signup triggers are unchanged.
create or replace function private.aqari_staff_preparation_email_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_email text:=lower(btrim(coalesce(new.email,'')));
begin
 if target_email='' then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('aqari-staff-preparation:'||target_email,0));
 if tg_table_schema='auth' and tg_op='INSERT' then return new;end if;
 if tg_table_schema='auth' and lower(btrim(coalesce(old.email,'')))=target_email then return new;end if;
 if exists(select 1 from private.aqari_staff_account_preparations p where p.email=target_email and p.status='prepared') then
  raise exception 'STAFF_EMAIL_UNAVAILABLE' using errcode='23505';
 end if;
 return new;
end $$;
drop trigger if exists aqari_staff_preparation_email_lock on auth.users;
create trigger aqari_staff_preparation_email_lock before insert or update of email on auth.users for each row execute function private.aqari_staff_preparation_email_guard();
drop trigger if exists aqari_staff_preparation_email_lock on public.aqari_tenants;
create trigger aqari_staff_preparation_email_lock before insert or update of email on public.aqari_tenants for each row execute function private.aqari_staff_preparation_email_guard();
drop trigger if exists aqari_staff_preparation_email_lock on private.aqari_partner_access;
create trigger aqari_staff_preparation_email_lock before insert or update of email on private.aqari_partner_access for each row execute function private.aqari_staff_preparation_email_guard();

-- Runs after aqari_auth_user_created, so the original Auth trigger owns signup.
create or replace function private.aqari_staff_preparation_registered() returns trigger
language plpgsql security definer set search_path='' as $$
declare r private.aqari_staff_account_preparations;old_snapshot jsonb;bound_workspace uuid;allowed private.aqari_allowed_users;
begin
 select * into r from private.aqari_staff_account_preparations p where p.email=lower(btrim(coalesce(new.email,''))) and p.status='prepared' for update;
 if not found then return new;end if;
 select * into allowed from private.aqari_allowed_users where email=r.email;
 select id into bound_workspace from public.aqari_workspaces where slug=allowed.workspace_slug;
 if bound_workspace is distinct from r.workspace_id or md5(to_jsonb(allowed)::text) is distinct from r.allowlist_fingerprint
  or not exists(select 1 from public.aqari_memberships m where m.workspace_id=r.workspace_id and m.user_id=new.id and m.is_active and m.role=r.role)
  or exists(select 1 from public.aqari_portal_accounts a where a.user_id=new.id)
  or exists(select 1 from private.aqari_partner_access a where a.user_id=new.id)
  then raise exception 'STAFF_PREPARATION_BIND_FAILED' using errcode='42501';end if;
 old_snapshot:=to_jsonb(r);
 update private.aqari_staff_account_preparations set status='registered',registered_user_id=new.id,revision=revision+1,updated_at=now() where id=r.id returning * into r;
 insert into private.aqari_staff_preparation_audit(workspace_id,preparation_id,action,actor_id,reason,before_snapshot,after_snapshot)
 values(r.workspace_id,r.id,'registered',new.id,'Existing Auth signup completed for the prepared staff email.',old_snapshot,to_jsonb(r));
 return new;
end $$;
drop trigger if exists zz_aqari_staff_preparation_registered on auth.users;
create trigger zz_aqari_staff_preparation_registered after insert on auth.users for each row execute function private.aqari_staff_preparation_registered();

create or replace function private.aqari_staff_account_preparations(w uuid,action text,data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();rid uuid;ident uuid;target_email text;label text;base_role text;why text;expected bigint;
 slug text;r private.aqari_staff_account_preparations;previous private.aqari_staff_preparation_audit;
 allowed private.aqari_allowed_users;before_value jsonb;answer jsonb;
begin
 if actor is null or not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=actor and m.is_active and m.role::text='general_manager') then
  raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(data) is distinct from 'object' or action is null or action not in('list','prepare','cancel') then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
 if action='list' then
  if data<>'{}'::jsonb then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
  return jsonb_build_object('workspace_id',w,'user_id',actor,'items',coalesce((select jsonb_agg(private.aqari_staff_preparation_snapshot(p) order by p.created_at desc,p.id) from private.aqari_staff_account_preparations p where p.workspace_id=w),'[]'::jsonb));
 end if;
 -- Hold the authorizing membership throughout this transaction, including MFA.
 perform 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=actor and m.is_active and m.role::text='general_manager' for share;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if jsonb_typeof(data->'request_id') is distinct from 'string' or jsonb_typeof(data->'reason') is distinct from 'string'
  or length(btrim(data->>'reason')) not between 3 and 500 then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
 begin rid:=(data->>'request_id')::uuid;exception when invalid_text_representation then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end;
 if rid is null then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
 why:=btrim(data->>'reason');
 perform pg_advisory_xact_lock(hashtextextended('aqari-staff-preparation-request:'||rid::text,0));
 select * into previous from private.aqari_staff_preparation_audit a where a.request_id=rid;
 if found then
  if previous.workspace_id<>w or previous.actor_id<>actor or previous.action<>action or previous.request_payload is distinct from data then raise serialization_failure using message='STAFF_PREPARATION_REQUEST_CONFLICT';end if;
  return previous.result;
 end if;
 select x.slug into slug from public.aqari_workspaces x where x.id=w for key share;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='prepare' then
  if exists(select 1 from jsonb_object_keys(data) k where k not in('request_id','email','display_name','role','reason'))
   or jsonb_typeof(data->'email') is distinct from 'string' or jsonb_typeof(data->'display_name') is distinct from 'string' or jsonb_typeof(data->'role') is distinct from 'string' then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
  target_email:=lower(btrim(data->>'email'));label:=btrim(data->>'display_name');base_role:=data->>'role';
  if length(target_email)>254 or target_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
   or length(label) not between 1 and 120 or base_role not in('viewer','accountant','property_manager') then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
  perform pg_advisory_xact_lock(hashtextextended('aqari-staff-preparation:'||target_email,0));
  if exists(select 1 from auth.users u where lower(btrim(u.email))=target_email)
   or exists(select 1 from private.aqari_allowed_users a where a.email=target_email)
   or exists(select 1 from private.aqari_partner_access p where lower(btrim(p.email))=target_email)
   or exists(select 1 from public.aqari_tenants t where lower(btrim(t.email))=target_email)
   or exists(select 1 from private.aqari_staff_account_preparations p where p.email=target_email)
   then raise unique_violation using message='STAFF_EMAIL_UNAVAILABLE';end if;
  begin
   insert into private.aqari_allowed_users(email,display_name,role,workspace_slug,is_active)
   values(target_email,label,base_role::public.aqari_role,slug,true) returning * into allowed;
   insert into private.aqari_staff_account_preparations(workspace_id,email,display_name,role,request_id,created_by,allowlist_fingerprint)
   values(w,target_email,label,base_role::public.aqari_role,rid,actor,md5(to_jsonb(allowed)::text)) returning * into r;
  exception when unique_violation then raise unique_violation using message='STAFF_EMAIL_UNAVAILABLE';end;
 else
  if exists(select 1 from jsonb_object_keys(data) k where k not in('request_id','id','revision','reason'))
   or jsonb_typeof(data->'id') is distinct from 'string' or jsonb_typeof(data->'revision') is distinct from 'number'
   or coalesce(data->>'revision','')!~'^[1-9][0-9]{0,9}$' then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end if;
  begin ident:=(data->>'id')::uuid;exception when invalid_text_representation then raise invalid_parameter_value using message='INVALID_STAFF_PREPARATION';end;
  expected:=(data->>'revision')::bigint;
  select * into r from private.aqari_staff_account_preparations p where p.id=ident and p.workspace_id=w and p.created_by=actor;
  if not found then raise insufficient_privilege using message='STAFF_PREPARATION_NOT_CANCELLABLE';end if;
  perform pg_advisory_xact_lock(hashtextextended('aqari-staff-preparation:'||r.email,0));
  select * into r from private.aqari_staff_account_preparations p where p.id=ident and p.workspace_id=w and p.created_by=actor for update;
  if r.status='registered' or exists(select 1 from auth.users u where lower(btrim(u.email))=r.email) then raise invalid_parameter_value using message='STAFF_PREPARATION_ALREADY_REGISTERED';end if;
  if r.status<>'prepared' then raise invalid_parameter_value using message='STAFF_PREPARATION_NOT_CANCELLABLE';end if;
  if r.revision<>expected then raise serialization_failure using message='STAFF_PREPARATION_REVISION_CONFLICT';end if;
  select * into allowed from private.aqari_allowed_users a where a.email=r.email for update;
  if not found or md5(to_jsonb(allowed)::text) is distinct from r.allowlist_fingerprint then raise serialization_failure using message='STAFF_PREPARATION_ALLOWLIST_CHANGED';end if;
  before_value:=to_jsonb(r);
  update private.aqari_allowed_users set is_active=false where email=r.email;
  update private.aqari_staff_account_preparations set status='cancelled',revision=revision+1,request_id=rid,updated_at=now() where id=r.id returning * into r;
 end if;
 answer:=jsonb_build_object('workspace_id',w,'user_id',actor,'record',private.aqari_staff_preparation_snapshot(r));
 insert into private.aqari_staff_preparation_audit(workspace_id,preparation_id,action,actor_id,request_id,request_payload,reason,before_snapshot,after_snapshot,result)
 values(w,r.id,action,actor,rid,data,why,before_value,to_jsonb(r),answer);
 return answer;
end $$;

create or replace function public.aqari_staff_account_preparations(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.aqari_staff_account_preparations(p_workspace_id,p_action,p_data)$$;
revoke all on function private.aqari_staff_preparation_immutable(),private.aqari_staff_preparation_snapshot(private.aqari_staff_account_preparations),private.aqari_staff_preparation_email_guard(),private.aqari_staff_preparation_registered(),private.aqari_staff_account_preparations(uuid,text,jsonb),public.aqari_staff_account_preparations(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.aqari_staff_account_preparations(uuid,text,jsonb),public.aqari_staff_account_preparations(uuid,text,jsonb) to authenticated;
commit;
