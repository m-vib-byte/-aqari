-- One internal source of truth for commercial allocations that still carry value.
create or replace view private.aqari_commercial_active_allocations as
select a.id allocation_id,a.workspace_id,a.lease_id,a.sale_id,a.payment_id,a.amount,a.allocated_on,a.recorded_at,
 s.period_end sale_period_end,p.period payment_period,p.paid_at,p.status payment_status
from private.aqari_commercial_payment_allocations a
join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id and s.lease_id=a.lease_id
join public.aqari_rent_payments p on p.id=a.payment_id and p.workspace_id=a.workspace_id and p.lease_id=a.lease_id
where p.status in ('مدفوع','جزئي','paid','partial')
 and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=a.workspace_id and c.payment_id=a.payment_id)
 and not exists(select 1 from private.aqari_commercial_payment_allocation_reversals ar where ar.workspace_id=a.workspace_id and ar.allocation_id=a.id)
 and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=a.workspace_id and sr.sale_id=a.sale_id);
revoke all on private.aqari_commercial_active_allocations from public,anon,authenticated;
