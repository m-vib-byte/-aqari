-- Additive V267 staging repair for the V211 follow-up client contract.
-- The legacy migration depends on aqari_access_audit, absent from this schema.
-- Keep follow-up metadata private; never copy tenant/property names or messages.
begin;

create table if not exists private.aqari_follow_up_events (
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 actor_id uuid not null references auth.users(id),
 record_hash text not null check(record_hash ~ '^[0-9a-f]{64}$'),
 period text not null check(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 action_kind text not null check(action_kind in ('reminder_copied','statement_opened','contract_opened','receipt_opened','collection_opened','reviewed')),
 state text not null check(state in ('due','pending','readonly','unlinked','resolved')),
 app_state_revision bigint not null check(app_state_revision>0),
 created_at timestamptz not null default now()
);
create index if not exists aqari_follow_up_events_scope
 on private.aqari_follow_up_events(workspace_id,record_hash,period,created_at desc,id desc);
alter table private.aqari_follow_up_events enable row level security;
revoke all on private.aqari_follow_up_events from public,anon,authenticated,service_role;
revoke all on sequence private.aqari_follow_up_events_id_seq from public,anon,authenticated,service_role;
drop trigger if exists aqari_follow_up_events_immutable on private.aqari_follow_up_events;
create trigger aqari_follow_up_events_immutable before update or delete on private.aqari_follow_up_events
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_record_follow_up_event(
 p_workspace_id uuid,p_record_hash text,p_period text,p_action_kind text,p_state text,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision bigint; saved private.aqari_follow_up_events%rowtype;
begin
 if actor is null then raise insufficient_privilege using message='authentication_required';end if;
 -- Keep the active membership stable until the event is committed.
 perform 1 from public.aqari_memberships m where m.workspace_id=p_workspace_id
  and m.user_id=actor and m.is_active is true
  and m.role::text in ('general_manager','property_manager','accountant') for share;
 if not found then raise insufficient_privilege using message='follow_up_write_forbidden';end if;
 if p_record_hash is null or p_record_hash !~ '^[0-9a-f]{64}$'
  or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  or p_action_kind is null or p_action_kind not in ('reminder_copied','statement_opened','contract_opened','receipt_opened','collection_opened','reviewed')
  or p_state is null or p_state not in ('due','pending','readonly','unlinked','resolved')
  or p_expected_revision is null or p_expected_revision<1 then
  raise invalid_parameter_value using message='invalid_follow_up_event';
 end if;
 select s.revision into current_revision from public.aqari_app_state s
  where s.workspace_id=p_workspace_id for share;
 if current_revision is null then raise insufficient_privilege using message='workspace_state_unavailable';end if;
 if current_revision<>p_expected_revision then raise serialization_failure using message='revision_conflict';end if;
 insert into private.aqari_follow_up_events(workspace_id,actor_id,record_hash,period,action_kind,state,app_state_revision)
  values(p_workspace_id,actor,p_record_hash,p_period,p_action_kind,p_state,current_revision) returning * into saved;
 return jsonb_build_object('id',saved.id,'record_hash',saved.record_hash,'period',saved.period,
  'action_kind',saved.action_kind,'state',saved.state,'app_state_revision',saved.app_state_revision,'created_at',saved.created_at);
end $$;

create or replace function private.aqari_list_follow_up_events(
 p_workspace_id uuid,p_record_hash text,p_period text,p_limit integer default 20
) returns table(event_id bigint,action_kind text,state text,period text,app_state_revision bigint,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.aqari_memberships m
  where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.is_active is true) then
  raise insufficient_privilege using message='follow_up_read_forbidden';
 end if;
 if p_record_hash is null or p_record_hash !~ '^[0-9a-f]{64}$'
  or p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
  raise invalid_parameter_value using message='invalid_follow_up_filter';
 end if;
 return query select e.id,e.action_kind,e.state,e.period,e.app_state_revision,e.created_at
  from private.aqari_follow_up_events e where e.workspace_id=p_workspace_id
   and e.record_hash=p_record_hash and e.period=p_period
  order by e.created_at desc,e.id desc limit least(greatest(coalesce(p_limit,20),1),50);
end $$;

create or replace function public.aqari_record_follow_up_event(
 p_workspace_id uuid,p_record_hash text,p_period text,p_action_kind text,p_state text,p_expected_revision bigint
) returns jsonb language sql security invoker set search_path='' as $$
 select private.aqari_record_follow_up_event($1,$2,$3,$4,$5,$6)
$$;
create or replace function public.aqari_list_follow_up_events(
 p_workspace_id uuid,p_record_hash text,p_period text,p_limit integer default 20
) returns table(event_id bigint,action_kind text,state text,period text,app_state_revision bigint,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select * from private.aqari_list_follow_up_events($1,$2,$3,$4)
$$;
revoke all on function private.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) from public,anon,authenticated,service_role;
revoke all on function private.aqari_list_follow_up_events(uuid,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.aqari_list_follow_up_events(uuid,text,text,integer) from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
grant execute on function private.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function private.aqari_list_follow_up_events(uuid,text,text,integer) to authenticated;
grant execute on function public.aqari_record_follow_up_event(uuid,text,text,text,text,bigint) to authenticated;
grant execute on function public.aqari_list_follow_up_events(uuid,text,text,integer) to authenticated;
commit;
