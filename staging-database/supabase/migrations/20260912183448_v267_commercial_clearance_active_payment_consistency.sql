-- Vacating clearance counts only active, confirmed, non-cancelled payment allocations.
create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_payment_allocations a
  join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id
  join public.aqari_rent_payments p on p.id=a.payment_id
  where a.workspace_id=w and a.lease_id=lid and (s.lease_id<>lid or p.workspace_id<>w or p.lease_id<>lid or a.amount<=0)) then
  raise check_violation using message='تخصيصات سداد نسبة المبيعات تحتاج مراجعة مصدرية.',detail='COMMERCIAL_PAYMENT_ALLOCATION_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_sales s
  where s.workspace_id=w and s.lease_id=lid and s.amount>0
   and not exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=s.id)
   and s.amount>coalesce((select sum(v.amount) from private.aqari_commercial_active_allocations v where v.workspace_id=w and v.sale_id=s.id),0)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير مسددة بالكامل. خصص سداداً مؤكداً أو اعكس الاستحقاق بمساره الموثق قبل الإخلاء.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
