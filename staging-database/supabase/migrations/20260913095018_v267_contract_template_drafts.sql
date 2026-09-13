-- Additive Preview/Staging schema only. Never used by the official issuing path.
-- Do not apply this migration to Production before the owner's exact-SHA release approval.
create table public.aqari_contract_template_drafts (
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 template_key text not null check (template_key in ('house','apartment','shop','vacating_undertaking','unit_handover')),
 revision integer not null check (revision > 0),
 title text not null check (char_length(btrim(title)) between 1 and 200),
 body text not null check (char_length(btrim(body)) between 1 and 30000),
 status text not null default 'draft' check (status = 'draft'),
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 unique (workspace_id,template_key,revision)
);
alter table public.aqari_contract_template_drafts enable row level security;
revoke all on public.aqari_contract_template_drafts from public,anon,authenticated;
grant select,insert on public.aqari_contract_template_drafts to authenticated;
create policy contract_template_drafts_read on public.aqari_contract_template_drafts
 for select to authenticated using (
 private.aqari_manager(workspace_id)
 and private.aqari_can(workspace_id,'administration','read')
 );
create policy contract_template_drafts_append on public.aqari_contract_template_drafts
 for insert to authenticated with check (
 private.aqari_manager(workspace_id)
 and private.aqari_can(workspace_id,'administration','write')
 and private.aqari_can(workspace_id,'contracts','write')
 and created_by=(select auth.uid()) and status='draft'
 );
comment on table public.aqari_contract_template_drafts is 'Append-only editable wording drafts. Not approved legal templates or issued leases. Existing signed documents remain unchanged.';
