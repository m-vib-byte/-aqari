-- Additive, repeatable source guard after the three settlement guards and the
-- official-document source binding. Never rewrites old snapshots or PDFs.
begin;

-- Utility writes and the public settlement/document RPCs must serialize on
-- the same workspace row. No new privilege or utility mutation is granted.
create or replace function private.aqari_utility_source_serialization_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare prior_workspace uuid;next_workspace uuid;w uuid;
begin
 if tg_op<>'INSERT' then prior_workspace:=old.workspace_id;end if;
 if tg_op<>'DELETE' then next_workspace:=new.workspace_id;end if;
 -- A trusted cross-workspace correction, when existing controls allow it,
 -- locks both workspaces in UUID order rather than just the destination.
 for w in select distinct x.id from (values(prior_workspace),(next_workspace))x(id) where x.id is not null order by x.id loop
  perform 1 from public.aqari_app_state where workspace_id=w for update;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.aqari_utility_source_serialization_guard() from public,anon,authenticated;
drop trigger if exists aqari_utility_source_serialization on public.aqari_utility_entries;
create trigger aqari_utility_source_serialization before insert or update or delete on public.aqari_utility_entries
 for each row execute function private.aqari_utility_source_serialization_guard();

create or replace function private.aqari_vacating_has_open_utility(w uuid,lid uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 -- Use the conservative property-bill scope of aqari_vacating_release.
 -- payment_status is currently NOT NULL; IS DISTINCT FROM keeps a future
 -- unknown status unresolved as well, without relaxing the existing rule.
 select exists(select 1 from public.aqari_utility_entries e
  join public.aqari_leases l on l.workspace_id=w and l.id=lid
  join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
  where e.workspace_id=w and e.property_id=u.property_id and e.entry_type='bill'
   and (e.amount_due is null or e.amount_paid is null or e.amount_due>e.amount_paid or e.payment_status is distinct from 'paid'))
$$;
revoke all on function private.aqari_vacating_has_open_utility(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_vacating_supplemental_snapshot_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status='draft' and new.status='finalized' and new.settlement_snapshot is not null then
  -- These fields belong to this transition's source review, not client input
  -- or a prior snapshot. An unrelated later update must not recapture them.
  new.settlement_snapshot:=new.settlement_snapshot-array['utility_balance','legal_balance','supplemental_review','supplemental_reviewed_at'];
  if not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=new.workspace_id and a.lease_id=new.lease_id)
   and not exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=new.workspace_id and e.lease_id=new.lease_id)
   and not exists(select 1 from private.aqari_legal_cases c where c.workspace_id=new.workspace_id and c.lease_id=new.lease_id and c.status<>'closed')
   and not private.aqari_vacating_has_open_utility(new.workspace_id,new.lease_id) then
   new.settlement_snapshot:=new.settlement_snapshot||jsonb_build_object(
    'utility_balance','0.000','legal_balance','0.000',
    'supplemental_review','no supplemental lease ledger entries, open legal case or unresolved property bill at finalization',
    'supplemental_reviewed_at',now());
  end if;
 end if;
 return new;
end $$;
revoke all on function private.aqari_vacating_supplemental_snapshot_guard() from public,anon,authenticated;
drop trigger if exists aqari_vacating_supplemental_snapshot on private.aqari_vacating_settlements;
create trigger aqari_vacating_supplemental_snapshot before update on private.aqari_vacating_settlements
 for each row execute function private.aqari_vacating_supplemental_snapshot_guard();

create or replace function private.aqari_official_final_settlement_source_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare series private.aqari_official_document_series;s private.aqari_vacating_settlements;credit_text text;
begin
 select * into strict series from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if series.kind<>'final_settlement' then return new;end if;
 perform private.aqari_require_sensitive_aal2(new.workspace_id);
 -- The public issue RPC already holds this lock before its source reads.
 -- Repeat it here so a future trusted writer cannot omit the ordering. The
 -- VOLATILE source query below observes committed bills after waiting.
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise check_violation using message='DOCUMENT_WORKSPACE_UNAVAILABLE';end if;
 select * into s from private.aqari_vacating_settlements where workspace_id=series.workspace_id and lease_id=series.entity_id;
 if not found or s.status not in('finalized','cleared','released') or s.settlement_snapshot is null then
  raise check_violation using message='DOCUMENT_APPROVED_SETTLEMENT_REQUIRED';end if;
 -- Recheck live sources even when an old snapshot already says zero. Existing
 -- archived document GET/download and the clearance exception are unchanged.
 if private.aqari_vacating_has_open_utility(series.workspace_id,series.entity_id) then
  raise check_violation using message='DOCUMENT_OPEN_UTILITIES_REVIEW_REQUIRED';end if;
 if exists(select 1 from private.aqari_legal_cases c where c.workspace_id=series.workspace_id and c.lease_id=series.entity_id and c.status<>'closed') then
  raise check_violation using message='DOCUMENT_OPEN_LEGAL_REVIEW_REQUIRED';end if;
 credit_text:=s.settlement_snapshot#>>'{final_balances,tenant_credit}';
 if credit_text is null or credit_text!~'^-?[0-9]{1,15}(\.[0-9]{1,3})?$' then
  raise check_violation using message='DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED';end if;
 if credit_text::numeric<>0 then raise check_violation using message='DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_official_final_settlement_source_guard() from public,anon,authenticated;
drop trigger if exists aqari_official_final_settlement_source_guard on private.aqari_official_document_versions;
create trigger aqari_official_final_settlement_source_guard before insert on private.aqari_official_document_versions
 for each row execute function private.aqari_official_final_settlement_source_guard();
commit;
