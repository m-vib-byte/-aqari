-- AQARI V267 opening balances: keep legacy opening positions separate from live collections.
begin;

-- Reject new contradictory entries without rewriting immutable historical rows.
-- Historical contradictions are rejected explicitly by the report below.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_tenant_ledger_entries'::regclass and conname='aqari_opening_entry_direction') then
  alter table private.aqari_tenant_ledger_entries add constraint aqari_opening_entry_direction
   check((kind<>'opening_debit' or direction='debit') and (kind<>'opening_credit' or direction='credit')) not valid;
 end if;
end $$;

create or replace function private.aqari_opening_balance_statement(
  p_workspace_id uuid,
  p_tenant_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  w uuid := p_workspace_id;
  t uuid := p_tenant_id;
  opening_debit numeric(15,3);
  opening_credit numeric(15,3);
  non_opening_debit numeric(15,3);
  non_opening_credit numeric(15,3);
  actual_collections numeric(15,3);
begin
  if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  if t is not null and not exists(
    select 1 from public.aqari_tenants x where x.workspace_id=w and x.id=t
  ) then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  if exists(select 1 from private.aqari_tenant_ledger_entries e
    where e.workspace_id=w and (t is null or e.tenant_id=t)
      and ((e.kind='opening_debit' and e.direction<>'debit') or (e.kind='opening_credit' and e.direction<>'credit'))) then
    raise check_violation using message='OPENING_ENTRY_DIRECTION_CONFLICT';
  end if;

  select
    coalesce(sum(e.amount) filter(where e.kind in('opening_debit','opening_balance') and e.direction='debit'),0),
    coalesce(sum(e.amount) filter(where e.kind in('opening_credit','opening_balance') and e.direction='credit'),0),
    coalesce(sum(e.amount) filter(where e.kind not in('opening_debit','opening_credit','opening_balance') and e.direction='debit'),0),
    coalesce(sum(e.amount) filter(where e.kind not in('opening_debit','opening_credit','opening_balance') and e.direction='credit'),0)
  into opening_debit,opening_credit,non_opening_debit,non_opening_credit
  from private.aqari_tenant_ledger_entries e
  where e.workspace_id=w and (t is null or e.tenant_id=t);

  select coalesce(sum(p.amount),0)
  into actual_collections
  from public.aqari_rent_payments p
  join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id
  where p.workspace_id=w
    and (t is null or l.tenant_id=t)
    and p.status in('paid','partial','مدفوع','جزئي')
    and p.amount>0
    and not exists(
      select 1 from private.aqari_receipt_cancellations c
      where c.workspace_id=w and c.payment_id=p.id
    );

  return jsonb_build_object(
    'tenant_id',t,
    'opening_entries',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',e.id,
        'tenant_id',e.tenant_id,
        'tenant_name',tn.full_name,
        'lease_id',e.lease_id,
        'contract_no',l.contract_no,
        'direction',e.direction,
        'kind',e.kind,
        'amount',e.amount,
        'cutoff_date',e.occurred_on,
        'occurred_on',e.occurred_on,
        'date_meaning','ledger_entry_date_not_reviewed_cutoff',
        'reason',e.reason,
        'source_type',e.source_type,
        'source_id',e.source_id,
        'created_at',e.created_at
      ) order by e.occurred_on,e.created_at,e.id),'[]'::jsonb)
      from private.aqari_tenant_ledger_entries e
      join public.aqari_tenants tn on tn.workspace_id=e.workspace_id and tn.id=e.tenant_id
      left join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id
      where e.workspace_id=w
        and e.kind in('opening_debit','opening_credit','opening_balance')
        and (t is null or e.tenant_id=t)
    ),
    'totals',jsonb_build_object(
      'opening_debit',opening_debit,
      'opening_credit',opening_credit,
      'opening_net',opening_debit-opening_credit,
      'non_opening_debit',non_opening_debit,
      'non_opening_credit',non_opening_credit,
      'non_opening_net',non_opening_debit-non_opening_credit,
      'actual_collections',actual_collections
    ),
    'separation_rule','opening balances are ledger-only and never counted as rent payments or live collections',
    'scope','all_saved_entries_without_cutoff_reconciliation',
    'generated_at',now()
  );
end $$;

revoke all on function private.aqari_opening_balance_statement(uuid,uuid) from public,anon;
grant execute on function private.aqari_opening_balance_statement(uuid,uuid) to authenticated;
create or replace function public.aqari_opening_balance_statement(p_workspace_id uuid,p_tenant_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.aqari_opening_balance_statement(p_workspace_id,p_tenant_id)
$$;
revoke all on function public.aqari_opening_balance_statement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_opening_balance_statement(uuid,uuid) to authenticated;

commit;
