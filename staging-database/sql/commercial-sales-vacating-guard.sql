-- Additive, repeatable guard after commercial-sales.sql and vacating-release.sql.
-- No payment allocation proves settlement of percentage rent yet. Only the
-- original charge plus its exact archived reversal can close that obligation.
begin;
create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- Reject incomplete or unrelated financial source links instead of allowing a
 -- generic credit or a rent payment to erase a separately evidenced obligation.
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.amount>0
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجعها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد؛ دفعة الإيجار وحدها لا تسدد هذا الاستحقاق.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_commercial_vacating_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if new.status in ('finalized','cleared','released') then
  -- Every sales/reversal write and the supported settlement/release RPCs use
  -- this same serialization point. A concurrent posting cannot pass the guard.
  perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
  perform private.aqari_require_commercial_clearance(new.workspace_id,new.lease_id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_vacating_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_vacating_guard on private.aqari_vacating_settlements;
create trigger aqari_commercial_vacating_guard before insert or update on private.aqari_vacating_settlements
 for each row execute function private.aqari_commercial_vacating_guard();

create or replace function private.aqari_commercial_lease_release_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 if new.vacated_on is not null and new.vacated_on is distinct from old.vacated_on then
  perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
  perform private.aqari_require_commercial_clearance(new.workspace_id,new.id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_lease_release_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_lease_release_guard on public.aqari_leases;
create trigger aqari_commercial_lease_release_guard before update of vacated_on on public.aqari_leases
 for each row execute function private.aqari_commercial_lease_release_guard();

create or replace function private.aqari_commercial_post_clearance_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_vacating_settlements v where v.workspace_id=new.workspace_id and v.lease_id=new.lease_id and v.status in ('cleared','released'))
  or exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=new.lease_id and l.vacated_on is not null) then
  raise check_violation using message='لا يمكن إضافة استحقاق مبيعات بعد براءة الذمة أو إنهاء العقد. يلزم مسار مراجعة تسوية معتمد يحافظ على البراءة السابقة.',detail='SALES_AFTER_CLEARANCE_REVIEW_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_post_clearance_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_post_clearance_guard on private.aqari_commercial_sales;
create trigger aqari_commercial_post_clearance_guard before insert on private.aqari_commercial_sales
 for each row execute function private.aqari_commercial_post_clearance_guard();
commit;
