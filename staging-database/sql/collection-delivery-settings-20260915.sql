-- AQARI V267 Staging: property-scoped receipt and owner-summary settings.
begin;
create table if not exists private.aqari_collection_delivery_settings(
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 receipt_enabled boolean not null default true,
 owner_whatsapp_enabled boolean not null default false,
 owner_ids jsonb not null default '[]'::jsonb,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(jsonb_typeof(owner_ids)='array' and octet_length(owner_ids::text)<=100000)
);
alter table private.aqari_collection_delivery_settings enable row level security;
revoke all on private.aqari_collection_delivery_settings from public,anon,authenticated,service_role;
drop trigger if exists aqari_collection_delivery_settings_no_delete on private.aqari_collection_delivery_settings;
create trigger aqari_collection_delivery_settings_no_delete before delete on private.aqari_collection_delivery_settings for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_collection_delivery_settings_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 before_value jsonb,
 after_value jsonb not null,
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_collection_delivery_settings_audit enable row level security;
revoke all on private.aqari_collection_delivery_settings_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_collection_delivery_settings_audit_immutable on private.aqari_collection_delivery_settings_audit;
create trigger aqari_collection_delivery_settings_audit_immutable before update or delete on private.aqari_collection_delivery_settings_audit for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_preferred_delivery_channel(profile jsonb,email text,phone text)
returns text language sql immutable set search_path='' as $$
 select case lower(coalesce(nullif(btrim(profile->>'preferredContact'),''),'both'))
  when 'email' then case when nullif(btrim(email),'') is not null then 'email' end
  when 'whatsapp' then case when nullif(btrim(phone),'') is not null then 'whatsapp' end
  when 'both' then case when nullif(btrim(email),'') is not null then 'email' when nullif(btrim(phone),'') is not null then 'whatsapp' end
  else null end
$$;
revoke all on function private.aqari_preferred_delivery_channel(jsonb,text,text) from public,anon,authenticated,service_role;
commit;
