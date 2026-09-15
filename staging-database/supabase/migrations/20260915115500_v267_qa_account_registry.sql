-- AQARI V267 Preview/Staging only: audited temporary QA account registry.
-- Auth users are never inserted by SQL. Supabase Auth Admin is the only creation path.
-- The existing real general-manager account is used for that role; temporary QA identities stay property-scoped.

create table if not exists private.aqari_qa_accounts(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 email text not null check(email=lower(btrim(email)) and length(email) between 3 and 254),
 display_name text not null check(length(btrim(display_name)) between 1 and 120),
 qa_role text not null check(qa_role in('collector','accountant','maintenance','property_manager','viewer','partner','tenant')),
 base_role public.aqari_role,
 operational_role text check(operational_role is null or operational_role in('collector','accountant','maintenance','property_manager','viewer')),
 property_ids uuid[] not null default '{}',
 tenant_id uuid,
 status text not null default 'prepared' check(status in('prepared','active','provision_failed','disable_pending','disabled','expired')),
 auth_user_id uuid references auth.users(id),
 expires_at timestamptz not null,
 created_by uuid not null references auth.users(id),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 disabled_by uuid references auth.users(id),
 disabled_at timestamptz,
 unique(workspace_id,email),
 check(expires_at>created_at),
 check((status in('disabled','expired') and disabled_at is not null) or status not in('disabled','expired'))
);
create index if not exists aqari_qa_accounts_expiry on private.aqari_qa_accounts(status,expires_at);
create index if not exists aqari_qa_accounts_user on private.aqari_qa_accounts(auth_user_id) where auth_user_id is not null;
alter table private.aqari_qa_accounts enable row level security;
revoke all on private.aqari_qa_accounts from public,anon,authenticated,service_role;

create table if not exists private.aqari_qa_account_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 qa_account_id uuid not null references private.aqari_qa_accounts(id),
 action text not null check(action in('prepare','auth_bound','provision_failed','disable_requested','disabled','expired','ban_failed')),
 actor_kind text not null check(actor_kind in('manager','system')),
 actor_id uuid references auth.users(id),
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 created_at timestamptz not null default now()
);
create index if not exists aqari_qa_events_scope on private.aqari_qa_account_events(workspace_id,qa_account_id,id desc);
alter table private.aqari_qa_account_events enable row level security;
revoke all on private.aqari_qa_account_events from public,anon,authenticated,service_role;
drop trigger if exists aqari_qa_events_immutable on private.aqari_qa_account_events;
create trigger aqari_qa_events_immutable before update or delete on private.aqari_qa_account_events for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_qa_base_role(r text) returns public.aqari_role
language sql immutable set search_path='' as $$
 select case r
  when 'collector' then 'accountant'::public.aqari_role
  when 'accountant' then 'accountant'::public.aqari_role
  when 'maintenance' then 'property_manager'::public.aqari_role
  when 'property_manager' then 'property_manager'::public.aqari_role
  when 'viewer' then 'viewer'::public.aqari_role
  else null::public.aqari_role end
$$;
revoke all on function private.aqari_qa_base_role(text) from public,anon,authenticated,service_role;
