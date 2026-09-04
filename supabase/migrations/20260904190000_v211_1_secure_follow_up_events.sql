-- AQARI V211.1 secure, append-only follow-up journal.
-- Deliberately contains no tenant name, phone, email, civil id, or free-form note.
create table if not exists public.aqari_follow_up_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.aqari_workspaces(id) on delete cascade,
  -- Opaque SHA-256 digest only; the protected V202 record key never reaches Postgres.
  record_key text not null check (record_key ~ '^[0-9a-f]{64}$'),
  property text not null check (
    property = btrim(property)
    and char_length(property) between 1 and 160
    and property !~ '[[:cntrl:]]'
  ),
  period text not null check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  action_kind text not null check (action_kind in (
    'reminder_copied',
    'statement_opened',
    'contract_opened',
    'receipt_opened',
    'collection_opened',
    'reviewed'
  )),
  state text not null check (state in ('due', 'pending', 'readonly', 'unlinked', 'resolved')),
  app_state_revision bigint not null check (app_state_revision > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists aqari_follow_up_events_timeline_idx
  on public.aqari_follow_up_events (workspace_id, period, record_key, created_at desc);

create or replace function private.aqari_prepare_follow_up_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  live_revision bigint;
begin
  new.workspace_id := nullif(btrim(new.workspace_id::text), '')::uuid;
  new.created_by := auth.uid();

  if new.created_by is null then
    raise exception using errcode = '42501', message = 'AQARI_AUTH_REQUIRED';
  end if;

  select s.revision
    into live_revision
    from public.aqari_app_state as s
   where s.workspace_id = new.workspace_id;

  if live_revision is null or live_revision <> new.app_state_revision then
    raise exception using
      errcode = '40001',
      message = 'AQARI_REVISION_CONFLICT',
      detail = coalesce(live_revision::text, 'null');
  end if;

  return new;
end;
$$;

revoke all on function private.aqari_prepare_follow_up_event() from public, anon, authenticated;

drop trigger if exists aqari_follow_up_events_prepare on public.aqari_follow_up_events;
create trigger aqari_follow_up_events_prepare
before insert on public.aqari_follow_up_events
for each row execute function private.aqari_prepare_follow_up_event();

alter table public.aqari_follow_up_events enable row level security;
alter table public.aqari_follow_up_events force row level security;

drop policy if exists aqari_follow_up_events_select_member on public.aqari_follow_up_events;
create policy aqari_follow_up_events_select_member
on public.aqari_follow_up_events
for select
to authenticated
using (
  exists (
    select 1
      from public.aqari_memberships as m
     where m.workspace_id = aqari_follow_up_events.workspace_id
       and m.user_id = auth.uid()
       and m.is_active = true
  )
);

drop policy if exists aqari_follow_up_events_insert_operator on public.aqari_follow_up_events;
create policy aqari_follow_up_events_insert_operator
on public.aqari_follow_up_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
      from public.aqari_memberships as m
     where m.workspace_id = aqari_follow_up_events.workspace_id
       and m.user_id = auth.uid()
       and m.is_active = true
       and m.role in ('general_manager', 'property_manager', 'accountant')
  )
);

revoke all on table public.aqari_follow_up_events from public, anon, authenticated;
grant select (
  id, workspace_id, record_key, property, period, action_kind, state,
  app_state_revision, created_by, created_at
) on table public.aqari_follow_up_events to authenticated;
grant insert (
  workspace_id, record_key, property, period, action_kind, state, app_state_revision
) on table public.aqari_follow_up_events to authenticated;
grant all on table public.aqari_follow_up_events to service_role;
