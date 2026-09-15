-- AQARI V267 Preview/Staging: revoke expired QA application access inside the isolated database.
-- Auth ban remains a server-side cleanup step; app authorization is removed first and independently.

create or replace function private.aqari_qa_revoke_expired()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare q private.aqari_qa_accounts%rowtype; result jsonb:='[]'::jsonb; wslug text;
begin
 for q in select * from private.aqari_qa_accounts x where x.status in('prepared','active','provision_failed','disable_pending') and x.expires_at<=now() order by x.expires_at,x.id for update skip locked loop
  select slug into wslug from public.aqari_workspaces where id=q.workspace_id;
  if q.base_role is not null then
   update private.aqari_allowed_users set is_active=false where email=q.email and workspace_slug=wslug;
   if q.auth_user_id is not null then
    update public.aqari_memberships set is_active=false where workspace_id=q.workspace_id and user_id=q.auth_user_id;
    update private.aqari_staff_assignments set is_active=false,revision=revision+1,updated_by=q.created_by,updated_at=now() where workspace_id=q.workspace_id and user_id=q.auth_user_id and is_active;
   end if;
  elsif q.qa_role='partner' then
   update private.aqari_partner_access set is_active=false,revision=revision+1,updated_by=q.created_by,updated_at=now() where workspace_id=q.workspace_id and email=q.email and is_active;
  elsif q.qa_role='tenant' and q.auth_user_id is not null then
   update public.aqari_portal_accounts set is_active=false where workspace_id=q.workspace_id and user_id=q.auth_user_id and is_active;
  end if;
  update private.aqari_qa_accounts set status='expired',disabled_at=coalesce(disabled_at,now()),updated_at=now() where id=q.id;
  insert into private.aqari_qa_account_events(workspace_id,qa_account_id,action,actor_kind,reason,details)
   values(q.workspace_id,q.id,'expired','system','QA account expired; application access revoked by Staging database schedule',jsonb_build_object('user_id',q.auth_user_id));
  result:=result||jsonb_build_array(jsonb_build_object('id',q.id,'userId',q.auth_user_id));
 end loop;
 return result;
end $$;
revoke all on function private.aqari_qa_revoke_expired() from public,anon,authenticated,service_role;

create or replace function public.aqari_qa_expire_accounts()
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 return private.aqari_qa_revoke_expired();
end $$;
revoke all on function public.aqari_qa_expire_accounts() from public,anon,authenticated;
grant execute on function public.aqari_qa_expire_accounts() to service_role;

do $schedule$
declare jid bigint;
begin
 for jid in select jobid from cron.job where jobname='aqari-v267-qa-expiry' loop perform cron.unschedule(jid);end loop;
 perform cron.schedule('aqari-v267-qa-expiry','*/5 * * * *','select private.aqari_qa_revoke_expired();');
end $schedule$;
