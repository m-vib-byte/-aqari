-- Rent due schedule must count only the residual part of a payment after an
-- active commercial-sales allocation. Allocation/reversal immediately refreshes it.
create or replace function private.aqari_refresh_rent_due_schedule(w uuid,lid uuid)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare l public.aqari_leases;changed integer:=0;
begin
 select * into l from public.aqari_leases where workspace_id=w and id=lid;
 if not found then return 0;end if;
 if l.status<>'signed' then
  delete from private.aqari_rent_due_periods where workspace_id=w and lease_id=lid;
  get diagnostics changed=row_count;return changed;
 end if;
 delete from private.aqari_rent_due_periods d where d.workspace_id=w and d.lease_id=lid
  and (d.period<date_trunc('month',l.start_date)::date or d.period>date_trunc('month',l.end_date)::date);
 insert into private.aqari_rent_due_periods(workspace_id,lease_id,period,due_amount,paid_amount,credit_amount,balance,status,generated_at,source_hash)
 select l.workspace_id,l.id,g.period,due.amount,paid.amount,credit.amount,
  due.amount-paid.amount-credit.amount,
  case when due.amount=0 then 'waived' when paid.amount+credit.amount=0 then 'due'
   when paid.amount+credit.amount<due.amount then 'partial' when paid.amount+credit.amount=due.amount then 'paid' else 'overpaid' end,
  now(),encode(sha256(convert_to(jsonb_build_object('lease',l.id,'period',g.period,'due',due.amount,'paid',paid.amount,'credit',credit.amount,'snapshot',l.snapshot,'monthly_rent',l.monthly_rent)::text,'UTF8')),'hex')
 from lateral (select gs::date period from generate_series(date_trunc('month',l.start_date)::date,date_trunc('month',l.end_date)::date,interval '1 month') gs) g
 cross join lateral (select private.aqari_reminder_due(l.snapshot,l.monthly_rent,g.period)::numeric(15,3) amount) due
 cross join lateral (
  select coalesce(sum(greatest(p.amount-coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.payment_id=p.id),0),0)),0)::numeric(15,3) amount
  from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=g.period
   and lower(coalesce(p.status,'')) not in ('cancelled','ملغى')
   and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
 ) paid
 cross join lateral (select coalesce(sum(a.amount),0)::numeric(15,3) amount from private.aqari_credit_allocations a where a.workspace_id=w and a.lease_id=l.id and a.period=g.period) credit
 on conflict(workspace_id,lease_id,period) do update set due_amount=excluded.due_amount,paid_amount=excluded.paid_amount,credit_amount=excluded.credit_amount,balance=excluded.balance,status=excluded.status,generated_at=excluded.generated_at,source_hash=excluded.source_hash;
 get diagnostics changed=row_count;return changed;
end $$;
create or replace function private.aqari_refresh_rent_due_after_commercial_allocation() returns trigger
language plpgsql security definer set search_path='' as $$begin perform private.aqari_refresh_rent_due_schedule(new.workspace_id,new.lease_id);return new;end $$;
create or replace function private.aqari_refresh_rent_due_after_commercial_allocation_reversal() returns trigger
language plpgsql security definer set search_path='' as $$declare a private.aqari_commercial_payment_allocations;begin select * into a from private.aqari_commercial_payment_allocations where workspace_id=new.workspace_id and id=new.allocation_id;if found then perform private.aqari_refresh_rent_due_schedule(a.workspace_id,a.lease_id);end if;return new;end $$;
revoke all on function private.aqari_refresh_rent_due_after_commercial_allocation(),private.aqari_refresh_rent_due_after_commercial_allocation_reversal() from public,anon,authenticated;
drop trigger if exists aqari_refresh_rent_due_after_commercial_allocation on private.aqari_commercial_payment_allocations;
create trigger aqari_refresh_rent_due_after_commercial_allocation after insert on private.aqari_commercial_payment_allocations for each row execute function private.aqari_refresh_rent_due_after_commercial_allocation();
drop trigger if exists aqari_refresh_rent_due_after_commercial_allocation_reversal on private.aqari_commercial_payment_allocation_reversals;
create trigger aqari_refresh_rent_due_after_commercial_allocation_reversal after insert on private.aqari_commercial_payment_allocation_reversals for each row execute function private.aqari_refresh_rent_due_after_commercial_allocation_reversal();
