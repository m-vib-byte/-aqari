-- AQARI V267 Preview/Staging only: prevent temporary QA identities from gaining
-- broader live permissions after Auth binding. Preparation/binding may create the
-- exact pre-authorized rows; every later active mutation remains pinned to the
-- audited QA registry scope until expiry/disable.

create or replace function private.aqari_qa_guard_membership_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype;
begin
 select x.* into q
 from private.aqari_qa_accounts x
 where x.auth_user_id=new.user_id
    or (x.auth_user_id is null and exists(
      select 1 from auth.users u where u.id=new.user_id and lower(u.email)=x.email
    ))
 order by (x.auth_user_id is not null) desc,x.created_at desc limit 1;
 if not found or not coalesce(new.is_active,false) then return new;end if;
 if new.workspace_id is distinct from q.workspace_id then raise insufficient_privilege using message='QA_WORKSPACE_SCOPE_VIOLATION';end if;
 if q.base_role is null or new.role is distinct from q.base_role then raise insufficient_privilege using message='QA_MEMBERSHIP_SCOPE_VIOLATION';end if;
 if q.status='prepared' and q.auth_user_id is null and q.expires_at>now() then return new;end if;
 if q.status<>'active' or q.auth_user_id is distinct from new.user_id or q.expires_at<=now() then raise insufficient_privilege using message='QA_ACCOUNT_NOT_ACTIVE';end if;
 return new;
end $$;
revoke all on function private.aqari_qa_guard_membership_scope() from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_membership_scope_guard on public.aqari_memberships;
create trigger aqari_qa_membership_scope_guard
 before insert or update of workspace_id,user_id,role,is_active on public.aqari_memberships
 for each row execute function private.aqari_qa_guard_membership_scope();

create or replace function private.aqari_qa_guard_staff_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype;
begin
 select x.* into q
 from private.aqari_qa_accounts x
 where x.auth_user_id=new.user_id
    or (x.auth_user_id is null and exists(
      select 1 from auth.users u where u.id=new.user_id and lower(u.email)=x.email
    ))
 order by (x.auth_user_id is not null) desc,x.created_at desc limit 1;
 if not found or not coalesce(new.is_active,false) then return new;end if;
 if new.workspace_id is distinct from q.workspace_id then raise insufficient_privilege using message='QA_WORKSPACE_SCOPE_VIOLATION';end if;
 if q.base_role is null or q.operational_role is null or new.operational_role is distinct from q.operational_role
    or cardinality(new.property_ids)<1 or not (new.property_ids <@ q.property_ids) then
  raise insufficient_privilege using message='QA_PROPERTY_SCOPE_VIOLATION';
 end if;
 if q.status='prepared' and q.auth_user_id is null and q.expires_at>now() then return new;end if;
 if q.status<>'active' or q.auth_user_id is distinct from new.user_id or q.expires_at<=now() then raise insufficient_privilege using message='QA_ACCOUNT_NOT_ACTIVE';end if;
 return new;
end $$;
revoke all on function private.aqari_qa_guard_staff_scope() from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_staff_scope_guard on private.aqari_staff_assignments;
create trigger aqari_qa_staff_scope_guard
 before insert or update of workspace_id,user_id,operational_role,property_ids,is_active on private.aqari_staff_assignments
 for each row execute function private.aqari_qa_guard_staff_scope();

create or replace function private.aqari_qa_guard_partner_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype;
begin
 select x.* into q
 from private.aqari_qa_accounts x
 where x.qa_role='partner' and (x.auth_user_id=new.user_id or x.email=lower(btrim(new.email)))
 order by (x.auth_user_id is not null) desc,x.created_at desc limit 1;
 if not found or not coalesce(new.is_active,false) then return new;end if;
 if new.workspace_id is distinct from q.workspace_id or lower(btrim(new.email)) is distinct from q.email
    or not (new.property_id=any(q.property_ids)) then
  raise insufficient_privilege using message='QA_PARTNER_SCOPE_VIOLATION';
 end if;
 if q.status='prepared' and q.auth_user_id is null and q.expires_at>now() then return new;end if;
 if q.status<>'active' or q.auth_user_id is distinct from new.user_id or q.expires_at<=now() then raise insufficient_privilege using message='QA_ACCOUNT_NOT_ACTIVE';end if;
 return new;
end $$;
revoke all on function private.aqari_qa_guard_partner_scope() from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_partner_scope_guard on private.aqari_partner_access;
create trigger aqari_qa_partner_scope_guard
 before insert or update of workspace_id,email,property_id,user_id,is_active on private.aqari_partner_access
 for each row execute function private.aqari_qa_guard_partner_scope();

create or replace function private.aqari_qa_guard_tenant_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype;
begin
 select x.* into q
 from private.aqari_qa_accounts x
 where x.qa_role='tenant' and (
   x.auth_user_id=new.user_id
   or (x.auth_user_id is null and exists(
     select 1 from auth.users u where u.id=new.user_id and lower(u.email)=x.email
   ))
 )
 order by (x.auth_user_id is not null) desc,x.created_at desc limit 1;
 if not found or not coalesce(new.is_active,false) then return new;end if;
 if new.workspace_id is distinct from q.workspace_id or new.tenant_id is distinct from q.tenant_id then
  raise insufficient_privilege using message='QA_TENANT_SCOPE_VIOLATION';
 end if;
 if q.status='prepared' and q.auth_user_id is null and q.expires_at>now() then return new;end if;
 if q.status<>'active' or q.auth_user_id is distinct from new.user_id or q.expires_at<=now() then raise insufficient_privilege using message='QA_ACCOUNT_NOT_ACTIVE';end if;
 return new;
end $$;
revoke all on function private.aqari_qa_guard_tenant_scope() from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_tenant_scope_guard on public.aqari_portal_accounts;
create trigger aqari_qa_tenant_scope_guard
 before insert or update of workspace_id,user_id,tenant_id,is_active on public.aqari_portal_accounts
 for each row execute function private.aqari_qa_guard_tenant_scope();
