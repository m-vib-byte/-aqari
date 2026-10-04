-- Per-account/workspace report choices only; no report results or business data.
begin;
create table if not exists public.aqari_saved_report_filters (
 workspace_id uuid not null references public.aqari_workspaces(id),
 user_id uuid not null references auth.users(id),
 report_key text not null check(report_key in ('property_statements','owner_report','hr_monthly','hr_annual')),
 filters jsonb not null check(jsonb_typeof(filters)='object' and octet_length(filters::text)<=1024),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id,report_key)
);
alter table public.aqari_saved_report_filters enable row level security;
revoke all on public.aqari_saved_report_filters from public,anon,authenticated;
grant select,insert,update,delete on public.aqari_saved_report_filters to authenticated;
create index if not exists aqari_saved_report_filters_user_idx on public.aqari_saved_report_filters(user_id);
drop policy if exists aqari_saved_report_filters_own on public.aqari_saved_report_filters;
create policy aqari_saved_report_filters_own on public.aqari_saved_report_filters for all to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.aqari_memberships m where m.workspace_id=aqari_saved_report_filters.workspace_id and m.user_id=(select auth.uid()) and m.is_active))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.aqari_memberships m where m.workspace_id=aqari_saved_report_filters.workspace_id and m.user_id=(select auth.uid()) and m.is_active));
create or replace function public.aqari_report_filters(p_workspace_id uuid,p_report_key text,p_action text,p_filters jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare payload jsonb;property uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.aqari_memberships m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.is_active) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_report_key is null or p_report_key not in ('property_statements','owner_report','hr_monthly','hr_annual') then raise exception 'INVALID_REPORT_FILTERS';end if;
 if p_action='get' then
  return coalesce((select filters from public.aqari_saved_report_filters where workspace_id=p_workspace_id and user_id=auth.uid() and report_key=p_report_key),'{}'::jsonb);
 elsif p_action='clear' then
  delete from public.aqari_saved_report_filters where workspace_id=p_workspace_id and user_id=auth.uid() and report_key=p_report_key;return '{}'::jsonb;
 elsif p_action is distinct from 'save' then raise exception 'INVALID_REPORT_FILTERS';end if;
 if p_filters is null or jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>1024 then raise exception 'INVALID_REPORT_FILTERS';end if;
 if p_report_key='owner_report' then
  if p_filters-array['from','to']<>'{}'::jsonb or jsonb_typeof(p_filters->'from') is distinct from 'string' or jsonb_typeof(p_filters->'to') is distinct from 'string'
   or p_filters->>'from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_filters->>'to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'INVALID_REPORT_FILTERS';end if;
  begin
   if (p_filters->>'from')::date>(p_filters->>'to')::date then raise exception 'INVALID_REPORT_FILTERS';end if;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'INVALID_REPORT_FILTERS';end;
 else
  if jsonb_typeof(p_filters->'property_id') is distinct from 'string' then raise exception 'INVALID_REPORT_FILTERS';end if;
  if p_report_key='hr_annual' then
   if p_filters-array['property_id','year']<>'{}'::jsonb or jsonb_typeof(p_filters->'year') is distinct from 'string' or p_filters->>'year' !~ '^[1-9][0-9]{3}$' then raise exception 'INVALID_REPORT_FILTERS';end if;
  else
   if p_filters-array['property_id','month']<>'{}'::jsonb or jsonb_typeof(p_filters->'month') is distinct from 'string' or p_filters->>'month' !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' then raise exception 'INVALID_REPORT_FILTERS';end if;
  end if;
  if p_filters->>'property_id'='' and p_report_key<>'hr_annual' then raise exception 'INVALID_REPORT_FILTERS';end if;
  begin property:=nullif(p_filters->>'property_id','')::uuid;exception when invalid_text_representation then raise exception 'INVALID_REPORT_FILTERS';end;
  if property is not null and not exists(select 1 from public.aqari_properties q where q.id=property and q.workspace_id=p_workspace_id) then raise exception 'INVALID_REPORT_FILTERS';end if;
 end if;
 insert into public.aqari_saved_report_filters(workspace_id,user_id,report_key,filters)
 values(p_workspace_id,auth.uid(),p_report_key,p_filters)
 on conflict(workspace_id,user_id,report_key) do update set filters=excluded.filters,updated_at=now()
 returning filters into payload;
 return payload;
end $$;
revoke all on function public.aqari_report_filters(uuid,text,text,jsonb) from public,anon;
grant execute on function public.aqari_report_filters(uuid,text,text,jsonb) to authenticated;
commit;
