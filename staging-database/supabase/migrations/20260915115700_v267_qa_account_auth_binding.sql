-- AQARI V267 Preview/Staging: bind official Supabase Auth invites to prepared QA scope and expire them safely.

create or replace function private.aqari_qa_bind_after_auth() returns trigger
language plpgsql security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; m public.aqari_memberships%rowtype; a private.aqari_staff_assignments%rowtype;
begin
 select * into q from private.aqari_qa_accounts x where x.email=lower(btrim(coalesce(new.email,''))) and x.status='prepared' and x.expires_at>now() order by x.created_at desc limit 1 for update;
 if not found then return new;end if;
 if q.base_role is not null then
  select * into m from public.aqari_memberships x where x.workspace_id=q.workspace_id and x.user_id=new.id;
  if not found or not m.is_active or m.role is distinct from q.base_role then raise exception 'QA_MEMBERSHIP_BIND_FAILED';end if;
  if q.operational_role is not null then
   insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,revision,updated_by)
    values(q.workspace_id,new.id,q.operational_role,q.property_ids,true,1,q.created_by) returning * into a;
   insert into private.aqari_staff_assignment_audit(workspace_id,user_id,actor_id,actor_name,reason,before_snapshot,after_snapshot)
    values(q.workspace_id,new.id,q.created_by,'QA provisioning',q.reason,null,to_jsonb(a));
  end if;
 elsif q.qa_role='partner' then
  if exists(select 1 from public.aqari_memberships x where x.workspace_id=q.workspace_id and x.user_id=new.id) or not exists(select 1 from private.aqari_partner_access x where x.workspace_id=q.workspace_id and x.email=q.email and x.user_id=new.id and x.is_active) then raise exception 'QA_PARTNER_BIND_FAILED';end if;
 elsif q.qa_role='tenant' then
  if not exists(select 1 from public.aqari_portal_accounts x where x.workspace_id=q.workspace_id and x.user_id=new.id and x.tenant_id=q.tenant_id and x.is_active) then raise exception 'QA_TENANT_BIND_FAILED';end if;
 else raise exception 'QA_ROLE_BIND_FAILED';end if;
 update private.aqari_qa_accounts set auth_user_id=new.id,status='active',updated_at=now(),last_error=null where id=q.id;
 insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details)
  values(q.workspace_id,q.id,'auth_bound','system','Supabase Auth invite bound to prepared QA scope',jsonb_build_object('user_id',new.id,'qa_role',q.qa_role));
 return new;
end $$;
revoke all on function private.aqari_qa_bind_after_auth() from public,anon,authenticated,service_role;
drop trigger if exists zzz_aqari_qa_auth_bound on auth.users;
create trigger zzz_aqari_qa_auth_bound after insert on auth.users for each row execute function private.aqari_qa_bind_after_auth();

create or replace function public.aqari_qa_account_server_result(p_account_id uuid,p_action text,p_user_id uuid default null,p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; err text:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),500),'');
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into q from private.aqari_qa_accounts where id=p_account_id for update;if not found then raise no_data_found using message='QA_ACCOUNT_NOT_FOUND';end if;
 if p_action='invite' then
  if err is not null then
   if q.status<>'active' then update private.aqari_qa_accounts set status='invite_failed',last_error=err,updated_at=now() where id=q.id;end if;
   insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details) values(q.workspace_id,q.id,'invite_failed','system',err,'{}');
  else
   if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id and lower(u.email)=q.email) then raise check_violation using message='QA_AUTH_INVITE_NOT_CONFIRMED';end if;
   select * into q from private.aqari_qa_accounts where id=q.id;
   if q.status<>'active' or q.auth_user_id is distinct from p_user_id then raise check_violation using message='QA_AUTH_BIND_NOT_CONFIRMED';end if;
  end if;
 elsif p_action='disable' then
  if err is null then
   update private.aqari_qa_accounts set status='disabled',disabled_at=coalesce(disabled_at,now()),updated_at=now(),last_error=null where id=q.id returning * into q;
   insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details) values(q.workspace_id,q.id,'disabled','system','QA Auth account banned after application access revocation','{}');
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

create or replace function public.aqari_qa_expire_accounts()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; result jsonb:='[]'::jsonb; wslug text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 for q in select * from private.aqari_qa_accounts x where x.status in('prepared','active','invite_failed','disable_pending') and x.expires_at<=now() order by x.expires_at,x.id for update skip locked loop
  select slug into wslug from public.aqari_workspaces where id=q.workspace_id;
  if q.base_role is not null then
   update private.aqari_allowed_users set is_active=false where email=q.email and workspace_slug=wslug;
   if q.auth_user_id is not null then update public.aqari_memberships set is_active=false where workspace_id=q.workspace_id and user_id=q.auth_user_id;update private.aqari_staff_assignments set is_active=false,revision=revision+1,updated_by=q.created_by,updated_at=now() where workspace_id=q.workspace_id and user_id=q.auth_user_id and is_active;end if;
  elsif q.qa_role='partner' then update private.aqari_partner_access set is_active=false,revision=revision+1,updated_by=q.created_by,updated_at=now() where workspace_id=q.workspace_id and email=q.email and is_active;
  elsif q.qa_role='tenant' and q.auth_user_id is not null then update public.aqari_portal_accounts set is_active=false where workspace_id=q.workspace_id and user_id=q.auth_user_id and is_active;
  end if;
  update private.aqari_qa_accounts set status='expired',disabled_at=coalesce(disabled_at,now()),updated_at=now() where id=q.id;
  insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details) values(q.workspace_id,q.id,'expired','system','QA account expired; application access revoked before Auth ban',jsonb_build_object('user_id',q.auth_user_id));
  result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'userId',q.auth_user_id));
 end loop;
 return result;
end $$;
revoke all on function public.aqari_qa_expire_accounts() from public,anon,authenticated;
grant execute on function public.aqari_qa_expire_accounts() to service_role;
