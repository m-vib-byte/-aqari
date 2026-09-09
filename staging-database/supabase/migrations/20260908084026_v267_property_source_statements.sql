-- Staging only. Reviewed source registers are separate from posted rent payments.
begin;
create table public.aqari_property_statements (
 workspace_id uuid not null references public.aqari_workspaces,
 property_id uuid not null,
 period date not null check(extract(day from period)=1),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 content jsonb not null check(jsonb_typeof(content)='object' and jsonb_typeof(content->'rows')='array'),
 imported_at timestamptz not null default now(),
 imported_by text not null,
 primary key(workspace_id,property_id,period),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table public.aqari_property_statements enable row level security;
revoke all on public.aqari_property_statements from public,anon,authenticated;
grant select on public.aqari_property_statements to authenticated;
create policy statement_manager_read on public.aqari_property_statements for select to authenticated
 using(private.aqari_manager(workspace_id) and private.aqari_can(workspace_id,'properties','read') and private.aqari_can(workspace_id,'collections','read'));
comment on table public.aqari_property_statements is 'Immutable source registers imported by an authorized administrator. Not posted income or proof of an active signed lease. No client writes.';
commit;
