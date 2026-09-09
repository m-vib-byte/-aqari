-- Run only in an independently verified development target, after staff-property-scope.sql
-- and financial-register.sql. Does not create accounts, assignments or business records.
begin;
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
   'vacating_register',r='general_manager' and to_regprocedure('public.aqari_vacating_register(uuid,text,jsonb)') is not null,
   'staff_access',r='general_manager' and to_regprocedure('public.aqari_staff_access(uuid,text,jsonb)') is not null,
   'financial_register',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_register(uuid,text,jsonb)') is not null,
   'deposit_register',private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_deposit_register(uuid,text,jsonb)') is not null));
end $$;
revoke all on function public.aqari_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.aqari_workspace_access(uuid) to authenticated;
commit;
