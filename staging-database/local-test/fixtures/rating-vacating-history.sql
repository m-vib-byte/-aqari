-- LOCAL MEMORY ONLY. Schema/guard representation read from the existing isolated
-- Staging database on 2026-09-12. Do not deploy this fixture or weaken its guard.
-- Use after vacating-release.sql and before tenant_rating_quarters.sql to reproduce
-- the hosted VACATING_ISSUE_REQUIRED boundary absent from the 2026-09-09 catalog.
do $$begin
 if to_regprocedure('private.aqari_vacating_lease_guard()') is not null then return;end if;
 create table private.aqari_vacating(
  id uuid primary key,workspace_id uuid not null references public.aqari_workspaces(id),lease_id uuid not null,
  revision bigint not null check(revision>0),state text not null default 'draft' check(state in('draft','issued')),
  vacated_on date not null,keys_received boolean not null,inspection text not null,obligations jsonb not null,
  document_ids uuid[] not null,reason text not null,created_by uuid not null,updated_by uuid not null,
  updated_at timestamptz not null default now(),issued_by uuid,issued_name text,issued_at timestamptz,
  certificate_no text unique,snapshot jsonb,unique(workspace_id,id),unique(workspace_id,lease_id),
  foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
 );
 alter table private.aqari_vacating enable row level security;
 revoke all on private.aqari_vacating from public,anon,authenticated;
 execute $definition$
 CREATE OR REPLACE FUNCTION private.aqari_vacating_lease_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v private.aqari_vacating;
begin
 select * into v from private.aqari_vacating where workspace_id=new.workspace_id and lease_id=new.id and state='issued';
 if found then
  if new.snapshot is distinct from v.snapshot->'contract_snapshot' or new.tenant_id::text is distinct from v.snapshot#>>'{lease,tenant_id}'
   or new.unit_id::text is distinct from v.snapshot#>>'{lease,unit_id}' or new.start_date::text is distinct from v.snapshot#>>'{lease,start_date}'
   or new.end_date::text is distinct from v.snapshot#>>'{lease,end_date}' or new.monthly_rent::text is distinct from v.snapshot#>>'{lease,monthly_rent}' then
   raise exception 'VACATING_CONTRACT_IMMUTABLE' using errcode='23514';
  end if;
  new.status:='expired';new.vacated_on:=v.vacated_on;
 elsif new.vacated_on is not null then raise exception 'VACATING_ISSUE_REQUIRED' using errcode='23514';
 end if;return new;
end $function$;
 $definition$;
 revoke all on function private.aqari_vacating_lease_guard() from public,anon,authenticated;
 create trigger zz_vacating_lease_guard before insert or update on public.aqari_leases
  for each row execute function private.aqari_vacating_lease_guard();
 execute $definition$
 CREATE OR REPLACE FUNCTION private.aqari_vacating_immutable()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $function$
begin
 if tg_table_name='aqari_vacating_operations' or tg_op='DELETE' then
  raise exception 'VACATING_IMMUTABLE' using errcode='23514';
 end if;
 if old.state='issued' then
  raise exception 'VACATING_IMMUTABLE' using errcode='23514';
 end if;return new;
end $function$;
 $definition$;
 revoke all on function private.aqari_vacating_immutable() from public,anon,authenticated;
 create trigger vacating_immutable before delete or update on private.aqari_vacating
  for each row execute function private.aqari_vacating_immutable();
end $$;
