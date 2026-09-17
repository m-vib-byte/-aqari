begin;
create or replace function public.aqari_owner_experience_status(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text;s private.aqari_owner_experience_settings%rowtype;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into s from private.aqari_owner_experience_settings where workspace_id=p_workspace_id;
 return jsonb_build_object('workspace_id',p_workspace_id,'assistant_enabled',coalesce(s.assistant_enabled,true),'report_enabled',coalesce(s.report_enabled,false));
end $$;
revoke all on function public.aqari_owner_experience_status(uuid) from public,anon;
grant execute on function public.aqari_owner_experience_status(uuid) to authenticated;
commit;
