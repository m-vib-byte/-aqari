-- AQARI V267 Preview/Staging: make authenticated B QA reruns repeatable without losing audit history.
-- Terminal QA registry rows remain historical; only non-terminal identities are unique by workspace/email.
-- Auth users are still created/deleted only through Supabase Auth Admin.

alter table private.aqari_qa_accounts
  drop constraint if exists aqari_qa_accounts_workspace_id_email_key;

drop index if exists private.aqari_qa_accounts_active_email_unique;
create unique index aqari_qa_accounts_active_email_unique
  on private.aqari_qa_accounts(workspace_id,email)
  where status in('prepared','active','disable_pending');

alter table private.aqari_qa_accounts
  drop constraint if exists aqari_qa_accounts_auth_user_id_fkey;
alter table private.aqari_qa_accounts
  add constraint aqari_qa_accounts_auth_user_id_fkey
  foreign key(auth_user_id) references auth.users(id) on delete set null;

create or replace function public.aqari_qa_account(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 d jsonb:=coalesce(p_data,'{}'::jsonb); q private.aqari_qa_accounts%rowtype; wslug text;
 target_email text; target_name text; target_role text; base public.aqari_role; op text; props uuid[]:='{}'; tenant uuid;
 expiry timestamptz; why text; actor_name text; old_assignment private.aqari_staff_assignments%rowtype;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='list' then
  return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object(
   'id',x.id,'email',x.email,'display_name',x.display_name,'qa_role',x.qa_role,'property_ids',x.property_ids,
   'tenant_id',x.tenant_id,'status',x.status,'auth_user_id',x.auth_user_id,'expires_at',x.expires_at,
   'created_at',x.created_at,'updated_at',x.updated_at,'disabled_at',x.disabled_at,'last_error',x.last_error
  ) order by x.created_at desc) from private.aqari_qa_accounts x where x.workspace_id=p_workspace_id),'[]'::jsonb));
 end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 select slug into wslug from public.aqari_workspaces where id=p_workspace_id;
 if wslug is distinct from 'aqari-v267-staging' then raise insufficient_privilege using message='QA_STAGING_ONLY';end if;
 select display_name into actor_name from public.aqari_profiles where user_id=auth.uid();actor_name:=coalesce(actor_name,auth.uid()::text);

 if p_action='cleanup' then
  return jsonb_build_object('accounts',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'auth_user_id',x.auth_user_id) order by x.created_at,x.id)
   from private.aqari_qa_accounts x
   where x.workspace_id=p_workspace_id and x.status in('disabled','expired') and x.auth_user_id is not null),'[]'::jsonb));
 end if;

 if p_action='prepare' then
  if jsonb_typeof(d)<>'object' or exists(select 1 from jsonb_object_keys(d) k where k not in('email','display_name','qa_role','property_ids','tenant_id','expires_at','reason')) then raise invalid_parameter_value using message='INVALID_QA_REQUEST';end if;
  target_email:=lower(btrim(coalesce(d->>'email','')));target_name:=btrim(coalesce(d->>'display_name',''));target_role:=d->>'qa_role';why:=btrim(coalesce(d->>'reason',''));
  begin expiry:=(d->>'expires_at')::timestamptz;exception when others then raise invalid_parameter_value using message='INVALID_QA_EXPIRY';end;
  if target_email!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(target_email)>254 or length(target_name) not between 1 and 120
   or target_role not in('collector','accountant','maintenance','property_manager','viewer','partner','tenant')
   or expiry<now()+interval '15 minutes' or expiry>now()+interval '48 hours' or length(why) not between 3 and 500 then raise invalid_parameter_value using message='INVALID_QA_REQUEST';end if;
  if jsonb_typeof(coalesce(d->'property_ids','[]'::jsonb))<>'array' then raise invalid_parameter_value using message='INVALID_QA_PROPERTIES';end if;
  begin select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into props from jsonb_array_elements_text(coalesce(d->'property_ids','[]'::jsonb)) x;exception when others then raise invalid_parameter_value using message='INVALID_QA_PROPERTIES';end;
  if cardinality(props)<1 or exists(select 1 from unnest(props) pid where not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=pid and (p.name like 'اختبار %' or lower(p.name) like 'qa %' or lower(p.name) like 'test %'))) then raise insufficient_privilege using message='QA_TEST_PROPERTY_REQUIRED';end if;
  if target_role='tenant' then
   if cardinality(props)<>1 then raise invalid_parameter_value using message='QA_TENANT_PROPERTY_REQUIRED';end if;
   begin tenant:=(d->>'tenant_id')::uuid;exception when others then tenant:=null;end;
   if tenant is null or not exists(select 1 from public.aqari_tenants t join public.aqari_leases l on l.workspace_id=t.workspace_id and l.tenant_id=t.id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where t.workspace_id=p_workspace_id and t.id=tenant and t.is_active and lower(t.email)=target_email and l.status='signed' and u.property_id=props[1]) then raise check_violation using message='QA_TENANT_IDENTITY_MISMATCH';end if;
  elsif nullif(d->>'tenant_id','') is not null then raise invalid_parameter_value using message='QA_TENANT_ID_FORBIDDEN';end if;
  if exists(select 1 from auth.users u where lower(u.email)=target_email) then raise unique_violation using message='QA_AUTH_EMAIL_ALREADY_EXISTS';end if;
  if exists(select 1 from private.aqari_qa_accounts x where x.workspace_id=p_workspace_id and x.email=target_email and x.status in('prepared','active','disable_pending')) then raise unique_violation using message='QA_EMAIL_ALREADY_REGISTERED';end if;
  base:=private.aqari_qa_base_role(target_role);op:=case when target_role in('collector','accountant','maintenance','property_manager','viewer') then target_role end;
  if base is not null then
   if exists(select 1 from private.aqari_allowed_users a where a.email=target_email) then raise unique_violation using message='QA_EMAIL_PREAUTHORIZED_ELSEWHERE';end if;
   insert into private.aqari_allowed_users(email,display_name,role,workspace_slug,is_active) values(target_email,target_name,base,wslug,true);
  elsif target_role='partner' then
   if exists(select 1 from private.aqari_allowed_users a where a.email=target_email) or exists(select 1 from private.aqari_partner_access a where a.workspace_id=p_workspace_id and a.email=target_email and a.is_active) then raise unique_violation using message='QA_PARTNER_EMAIL_CONFLICT';end if;
   insert into private.aqari_partner_access(workspace_id,email,property_id,user_id,display_name,is_active,revision,updated_by)
    select p_workspace_id,target_email,pid,null,target_name,true,1,auth.uid() from unnest(props) pid;
  end if;
  insert into private.aqari_qa_accounts(workspace_id,email,display_name,qa_role,base_role,operational_role,property_ids,tenant_id,status,expires_at,created_by,reason)
   values(p_workspace_id,target_email,target_name,target_role,base,op,props,tenant,'prepared',expiry,auth.uid(),why) returning * into q;
  insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,actor_id,reason,details)
   values(p_workspace_id,q.id,'prepare','manager',auth.uid(),why,jsonb_build_object('qa_role',target_role,'property_ids',props,'expires_at',expiry));
  return jsonb_build_object('id',q.id,'email',q.email,'qa_role',q.qa_role,'status',q.status,'expires_at',q.expires_at,'property_ids',q.property_ids,'tenant_id',q.tenant_id);
 end if;

 if p_action='disable' then
  begin select * into q from private.aqari_qa_accounts x where x.workspace_id=p_workspace_id and x.id=(d->>'id')::uuid for update;exception when others then raise invalid_parameter_value using message='QA_ACCOUNT_ID_REQUIRED';end;
  if not found then raise no_data_found using message='QA_ACCOUNT_NOT_FOUND';end if;
  why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 500 then raise invalid_parameter_value using message='QA_DISABLE_REASON_REQUIRED';end if;
  if q.status in('disabled','expired') then return jsonb_build_object('id',q.id,'status',q.status,'auth_user_id',q.auth_user_id,'replayed',true);end if;
  if q.base_role is not null then
   update private.aqari_allowed_users set is_active=false where email=q.email and workspace_slug=wslug;
   update public.aqari_memberships set is_active=false where workspace_id=p_workspace_id and user_id=q.auth_user_id;
   if q.auth_user_id is not null then
    select * into old_assignment from private.aqari_staff_assignments where workspace_id=p_workspace_id and user_id=q.auth_user_id for update;
    if found and old_assignment.is_active then
     update private.aqari_staff_assignments set is_active=false,revision=revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=p_workspace_id and user_id=q.auth_user_id;
     insert into private.aqari_staff_assignment_audit(workspace_id,user_id,actor_id,actor_name,reason,before_snapshot,after_snapshot)
      select p_workspace_id,q.auth_user_id,auth.uid(),actor_name,why,to_jsonb(old_assignment),to_jsonb(a) from private.aqari_staff_assignments a where a.workspace_id=p_workspace_id and a.user_id=q.auth_user_id;
    end if;
   end if;
  elsif q.qa_role='partner' then update private.aqari_partner_access set is_active=false,revision=revision+1,updated_by=auth.uid(),updated_at=now() where workspace_id=p_workspace_id and email=q.email;
  elsif q.qa_role='tenant' and q.auth_user_id is not null then update public.aqari_portal_accounts set is_active=false where workspace_id=p_workspace_id and user_id=q.auth_user_id;
  end if;
  update private.aqari_qa_accounts set status=case when q.auth_user_id is null then 'disabled' else 'disable_pending' end,disabled_by=auth.uid(),disabled_at=case when q.auth_user_id is null then now() end,updated_at=now(),last_error=null where id=q.id returning * into q;
  insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,actor_id,reason,details) values(p_workspace_id,q.id,'disable_requested','manager',auth.uid(),why,jsonb_build_object('auth_user_id',q.auth_user_id));
  return jsonb_build_object('id',q.id,'status',q.status,'auth_user_id',q.auth_user_id,'replayed',false);
 end if;
 raise invalid_parameter_value using message='INVALID_QA_ACTION';
end $$;
revoke all on function public.aqari_qa_account(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_qa_account(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_qa_account_server_cleanup(p_account_id uuid,p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; wslug text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into q from private.aqari_qa_accounts where id=p_account_id for update;
 if not found then raise no_data_found using message='QA_ACCOUNT_NOT_FOUND';end if;
 if q.status not in('disabled','expired') or q.auth_user_id is distinct from p_user_id then raise check_violation using message='QA_CLEANUP_NOT_READY';end if;
 if not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=q.email and coalesce(u.raw_user_meta_data->>'aqari_qa','')='true') then raise check_violation using message='QA_AUTH_CLEANUP_NOT_CONFIRMED';end if;
 select slug into wslug from public.aqari_workspaces where id=q.workspace_id;
 delete from public.aqari_portal_accounts where workspace_id=q.workspace_id and user_id=p_user_id;
 delete from private.aqari_partner_access where workspace_id=q.workspace_id and user_id=p_user_id and email=q.email;
 delete from private.aqari_staff_assignments where workspace_id=q.workspace_id and user_id=p_user_id;
 delete from public.aqari_memberships where workspace_id=q.workspace_id and user_id=p_user_id;
 if q.base_role is not null then delete from private.aqari_allowed_users where email=q.email and workspace_slug=wslug;end if;
 return jsonb_build_object('ok',true,'id',q.id,'user_id',p_user_id);
end $$;
revoke all on function public.aqari_qa_account_server_cleanup(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_qa_account_server_cleanup(uuid,uuid) to service_role;

create or replace function public.aqari_qa_account_server_result(p_account_id uuid,p_action text,p_user_id uuid default null,p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; err text:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),500),'');
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into q from private.aqari_qa_accounts where id=p_account_id for update;if not found then raise no_data_found using message='QA_ACCOUNT_NOT_FOUND';end if;
 if p_action='provision' then
  if err is not null then
   if q.status<>'active' then update private.aqari_qa_accounts set status='provision_failed',last_error=err,updated_at=now() where id=q.id;end if;
   insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details) values(q.workspace_id,q.id,'provision_failed','system',err,'{}');
  else
   if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=q.email) then raise check_violation using message='QA_AUTH_PROVISION_NOT_CONFIRMED';end if;
   select * into q from private.aqari_qa_accounts where id=q.id;
   if q.status<>'active' or q.auth_user_id is distinct from p_user_id then raise check_violation using message='QA_AUTH_BIND_NOT_CONFIRMED';end if;
  end if;
 elsif p_action='disable' then
  if err is null then
   update private.aqari_qa_accounts set status='disabled',disabled_at=coalesce(disabled_at,now()),updated_at=now(),last_error=null where id=q.id returning * into q;
   insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details)
    values(q.workspace_id,q.id,'disabled','system','QA application access revoked; Auth cleanup requested',jsonb_build_object('user_id',q.auth_user_id));
  else
   update private.aqari_qa_accounts set last_error=err,updated_at=now() where id=q.id returning * into q;
   insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details) values(q.workspace_id,q.id,'ban_failed','system',err,'{}');
  end if;
 else raise invalid_parameter_value using message='INVALID_QA_SERVER_ACTION';end if;
 select * into q from private.aqari_qa_accounts where id=p_account_id;
 return jsonb_build_object('id',q.id,'status',q.status,'auth_user_id',q.auth_user_id,'expires_at',q.expires_at);
end $$;
revoke all on function public.aqari_qa_account_server_result(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.aqari_qa_account_server_result(uuid,text,uuid,text) to service_role;
