# V211.1 Supabase RPC draft — not a migration

This is a review draft only. It must be converted into an official Supabase migration before application. It is **not applied to Production**.

The design reuses `public.aqari_access_audit` through two narrow SECURITY DEFINER RPCs. The browser receives no direct table grants. The cloud record deliberately contains no property name, tenant identity, contact data, free-form note, reminder body, or raw V202 record key.

```sql
create or replace function public.aqari_record_follow_up_event(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_action_kind text,
  p_state text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_id bigint;
  v_created_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.aqari_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role in (
        'general_manager'::public.aqari_role,
        'property_manager'::public.aqari_role,
        'accountant'::public.aqari_role
      )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_record_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid record hash'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid period'; end if;
  if p_action_kind not in ('reminder_copied','statement_opened','contract_opened','receipt_opened','collection_opened','reviewed') then raise exception 'invalid action'; end if;
  if p_state not in ('due','pending','readonly','unlinked','resolved') then raise exception 'invalid state'; end if;

  select s.revision into v_revision
  from public.aqari_app_state s
  where s.workspace_id = p_workspace_id;

  if v_revision is null or p_expected_revision is null or v_revision <> p_expected_revision then
    raise exception 'revision_conflict' using errcode = '40001';
  end if;

  insert into public.aqari_access_audit(
    id,workspace_id,user_id,actor_type,event_type,resource_type,resource_ref,metadata
  ) values (
    nextval('public.aqari_access_audit_id_seq'::regclass),
    p_workspace_id,(select auth.uid()),'employee','follow_up_' || p_action_kind,
    'rent_follow_up',p_record_hash,
    jsonb_build_object(
      'period',p_period,
      'state',p_state,
      'app_state_revision',v_revision
    )
  ) returning id,created_at into v_id,v_created_at;

  return jsonb_build_object(
    'id',v_id,
    'record_hash',p_record_hash,
    'action_kind',p_action_kind,
    'state',p_state,
    'period',p_period,
    'app_state_revision',v_revision,
    'created_at',v_created_at
  );
end;
$$;

revoke all on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint)
from public, anon, authenticated, service_role;
grant execute on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint)
to authenticated;

create or replace function public.aqari_list_follow_up_events(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_limit integer default 20
)
returns table(
  event_id bigint,
  action_kind text,
  state text,
  period text,
  app_state_revision bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.aqari_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_record_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid record hash'; end if;
  if p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid period'; end if;

  return query
  select
    a.id,
    regexp_replace(a.event_type,'^follow_up_',''),
    a.metadata->>'state',
    a.metadata->>'period',
    case when (a.metadata->>'app_state_revision') ~ '^\d+$' then (a.metadata->>'app_state_revision')::bigint else null end,
    a.created_at
  from public.aqari_access_audit a
  where a.workspace_id = p_workspace_id
    and a.resource_type = 'rent_follow_up'
    and a.resource_ref = p_record_hash
    and a.event_type in (
      'follow_up_reminder_copied','follow_up_statement_opened','follow_up_contract_opened',
      'follow_up_receipt_opened','follow_up_collection_opened','follow_up_reviewed'
    )
    and a.metadata->>'state' in ('due','pending','readonly','unlinked','resolved')
    and a.metadata->>'period' = p_period
  order by a.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$$;

revoke all on function public.aqari_list_follow_up_events(uuid,text,text,integer)
from public, anon, authenticated, service_role;
grant execute on function public.aqari_list_follow_up_events(uuid,text,text,integer)
to authenticated;
```

Security properties:
- only a lowercase 64-character SHA-256 record hash is persisted; raw `recordKey` never reaches Postgres;
- no `p_property` exists in the RPC signature and no property name is stored or returned;
- no tenant name, phone, email, civil ID, reminder body, or free-form note is accepted;
- `user_id` always comes from `auth.uid()`;
- writer RPC requires an active workspace membership and the writer-role whitelist;
- app-state revision is rechecked inside the write transaction;
- reader RPC enforces server-side action/state whitelists and returns no raw metadata;
- the audit primary key uses the existing `aqari_access_audit_id_seq` sequence;
- `aqari_access_audit` remains inaccessible directly to browser roles; only these validated RPCs are exposed.
