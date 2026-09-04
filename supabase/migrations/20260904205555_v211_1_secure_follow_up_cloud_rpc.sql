create schema if not exists aqari_internal;

revoke all on schema aqari_internal from public, anon, authenticated, service_role;
grant usage on schema aqari_internal to authenticated;

create or replace function aqari_internal.aqari_record_follow_up_event(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_action_kind text,
  p_state text,
  p_expected_revision bigint
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_id bigint;
  v_created_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.aqari_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = v_user_id
      and m.is_active is true
      and m.role in (
        'general_manager'::public.aqari_role,
        'property_manager'::public.aqari_role,
        'accountant'::public.aqari_role
      )
  ) then
    raise exception using errcode = '42501', message = 'follow_up_write_forbidden';
  end if;

  if p_record_hash is null or p_record_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_record_hash';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;
  if p_action_kind is null or p_action_kind not in (
    'reminder_copied','statement_opened','contract_opened',
    'receipt_opened','collection_opened','reviewed'
  ) then
    raise exception using errcode = '22023', message = 'invalid_action_kind';
  end if;
  if p_state is null or p_state not in ('due','pending','readonly','unlinked','resolved') then
    raise exception using errcode = '22023', message = 'invalid_state';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid_expected_revision';
  end if;

  select s.revision
    into v_revision
  from public.aqari_app_state s
  where s.workspace_id = p_workspace_id
  for share;

  if v_revision is null then
    raise exception using errcode = '42501', message = 'workspace_state_unavailable';
  end if;
  if v_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'revision_conflict';
  end if;

  insert into public.aqari_access_audit (
    id, workspace_id, user_id, actor_type, event_type,
    resource_type, resource_ref, metadata
  ) values (
    nextval('public.aqari_access_audit_id_seq'::regclass),
    p_workspace_id,
    v_user_id,
    'employee',
    'follow_up_' || p_action_kind,
    'rent_follow_up',
    p_record_hash,
    jsonb_build_object(
      'record_hash', p_record_hash,
      'period', p_period,
      'action_kind', p_action_kind,
      'state', p_state,
      'app_state_revision', v_revision
    )
  )
  returning id, created_at into v_id, v_created_at;

  return jsonb_build_object(
    'id', v_id,
    'record_hash', p_record_hash,
    'period', p_period,
    'action_kind', p_action_kind,
    'state', p_state,
    'app_state_revision', v_revision,
    'created_at', v_created_at
  );
end
$function$;

create or replace function aqari_internal.aqari_list_follow_up_events(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_limit integer default 20
) returns table (
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
as $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.aqari_memberships m
    where m.workspace_id = p_workspace_id
      and m.user_id = v_user_id
      and m.is_active is true
  ) then
    raise exception using errcode = '42501', message = 'follow_up_read_forbidden';
  end if;

  if p_record_hash is null or p_record_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_record_hash';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception using errcode = '22023', message = 'invalid_period';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  return query
  select
    a.id,
    a.metadata->>'action_kind',
    a.metadata->>'state',
    a.metadata->>'period',
    case
      when (a.metadata->>'app_state_revision') ~ '^[0-9]+$'
      then (a.metadata->>'app_state_revision')::bigint
      else null
    end,
    a.created_at
  from public.aqari_access_audit a
  where a.workspace_id = p_workspace_id
    and a.resource_type = 'rent_follow_up'
    and a.resource_ref = p_record_hash
    and a.metadata->>'record_hash' = p_record_hash
    and a.metadata->>'period' = p_period
    and a.metadata->>'action_kind' in (
      'reminder_copied','statement_opened','contract_opened',
      'receipt_opened','collection_opened','reviewed'
    )
    and a.metadata->>'state' in ('due','pending','readonly','unlinked','resolved')
  order by a.created_at desc, a.id desc
  limit v_limit;
end
$function$;

create or replace function public.aqari_record_follow_up_event(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_action_kind text,
  p_state text,
  p_expected_revision bigint
) returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select aqari_internal.aqari_record_follow_up_event($1,$2,$3,$4,$5,$6)
$function$;

create or replace function public.aqari_list_follow_up_events(
  p_workspace_id uuid,
  p_record_hash text,
  p_period text,
  p_limit integer default 20
) returns table (
  event_id bigint,
  action_kind text,
  state text,
  period text,
  app_state_revision bigint,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from aqari_internal.aqari_list_follow_up_events($1,$2,$3,$4)
$function$;

revoke all on function aqari_internal.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) from public, anon, authenticated, service_role;
revoke all on function aqari_internal.aqari_list_follow_up_events(uuid,text,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) from public, anon, authenticated, service_role;
revoke all on function public.aqari_list_follow_up_events(uuid,text,text,integer) from public, anon, authenticated, service_role;

grant execute on function aqari_internal.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function aqari_internal.aqari_list_follow_up_events(uuid,text,text,integer) to authenticated;
grant execute on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.aqari_list_follow_up_events(uuid,text,text,integer) to authenticated;

comment on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint)
  is 'V211.1 authenticated RPC wrapper; stores opaque follow-up metadata only.';
comment on function public.aqari_list_follow_up_events(uuid,text,text,integer)
  is 'V211.1 authenticated RPC wrapper; returns a bounded safe follow-up timeline.';
