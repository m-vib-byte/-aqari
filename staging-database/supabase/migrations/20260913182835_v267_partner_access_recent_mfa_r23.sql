-- AQARI V267 partner-access recent-MFA hardening for isolated Preview/Staging.
begin;
create or replace function private.aqari_manage_partner_access(
 w uuid,email_address text,property uuid,partner_name text,enabled boolean,expected bigint,reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_email text:=lower(btrim(email_address));target_user uuid;old_row private.aqari_partner_access%rowtype;saved private.aqari_partner_access%rowtype;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 perform private.aqari_require_sensitive_aal2(w);
 if target_email is null or target_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(target_email)>254 or partner_name is null or length(btrim(partner_name)) not between 1 and 120 or enabled is null or reason is null or length(btrim(reason)) not between 3 and 500 or expected is null or expected<0 then raise exception 'INVALID_PARTNER_ACCESS'; end if;
 perform 1 from public.aqari_workspaces where id=w for update;
 if not exists(select 1 from public.aqari_properties p where p.id=property and p.workspace_id=w) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 select id into target_user from auth.users where lower(email)=target_email for update;
 if exists(select 1 from public.aqari_memberships m where m.user_id=target_user and m.workspace_id=w) or exists(select 1 from private.aqari_allowed_users a join public.aqari_workspaces x on x.slug=a.workspace_slug where a.email=target_email and x.id=w) then raise exception 'PARTNER_STAFF_CONFLICT' using errcode='42501'; end if;
 select * into old_row from private.aqari_partner_access a where a.workspace_id=w and a.email=target_email and a.property_id=property;
 if coalesce(old_row.revision,0) is distinct from expected then raise exception 'REVISION_CONFLICT' using errcode='40001'; end if;
 insert into private.aqari_partner_access(workspace_id,email,property_id,user_id,display_name,is_active,revision,updated_by)
 values(w,target_email,property,target_user,btrim(partner_name),enabled,coalesce(old_row.revision,0)+1,auth.uid())
 on conflict(workspace_id,email,property_id) do update set user_id=excluded.user_id,display_name=excluded.display_name,is_active=excluded.is_active,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now() returning * into saved;
 insert into public.aqari_control_audit(workspace_id,actor_id,action,entity_ref,reason,before_value,after_value) values(w,auth.uid(),'partner.access',property::text,btrim(reason),to_jsonb(old_row),to_jsonb(saved));
 return to_jsonb(saved)-'updated_by';
end $$;
revoke all on function private.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text) from public,anon;
grant execute on function private.aqari_manage_partner_access(uuid,text,uuid,text,boolean,bigint,text) to authenticated;
commit;
