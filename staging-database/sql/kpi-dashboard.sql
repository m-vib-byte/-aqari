-- AQARI V267 KPI projection from normalized, persisted records only.
-- CODE ONLY: read-only RPC; no cached or invented metrics.
begin;
create function public.aqari_kpi_dashboard(p_workspace_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w uuid:=p_workspace_id;from_date date:=p_from;to_date date:=p_to;units_count integer;occupied_count integer;expected numeric;collected numeric;expenses numeric;lag numeric;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if from_date is null or to_date is null or from_date>to_date or to_date-from_date>366 then raise exception 'INVALID_KPI_PERIOD' using errcode='22023';end if;
 select count(*) into units_count from public.aqari_units u where u.workspace_id=w;
 select count(distinct l.unit_id),coalesce(sum(l.monthly_rent),0) into occupied_count,expected from public.aqari_leases l
  where l.workspace_id=w and l.status='signed' and l.start_date<=to_date and l.end_date>=from_date;
 select coalesce(sum(p.amount),0),avg(greatest(0,p.paid_at::date-p.period::date)) into collected,lag from public.aqari_rent_payments p
  where p.workspace_id=w and p.status<>'cancelled' and p.paid_at::date between from_date and to_date;
 select coalesce(sum(e.amount),0) into expenses from private.aqari_financial_expenses e
  where e.workspace_id=w and e.state='approved' and e.expense_date between from_date and to_date;
 return jsonb_build_object(
  'period',jsonb_build_object('from',from_date,'to',to_date),
  'units',jsonb_build_object('total',units_count,'occupied',occupied_count,'vacant',greatest(units_count-occupied_count,0),
   'vacancy_rate',case when units_count=0 then null else round((greatest(units_count-occupied_count,0)::numeric/units_count)*100,2) end),
  'collections',jsonb_build_object('expected_monthly_snapshot',expected::text,'actual',collected::text,
   'rate',case when expected=0 then null else round((collected/expected)*100,2) end,
   'average_days',case when lag is null then null else round(lag,2) end),
  'profit',jsonb_build_object('actual_income',collected::text,'approved_expenses',expenses::text,'actual_net',(collected-expenses)::text,
   'projected_net',(expected-expenses)::text,'projection_basis','active_contract_monthly_rent_minus_period_approved_expenses'),
  'sources',jsonb_build_array('public.aqari_units','public.aqari_leases','public.aqari_rent_payments','private.aqari_financial_expenses'),
  'generated_at',now()
 );
end $$;
revoke all on function public.aqari_kpi_dashboard(uuid,date,date) from public,anon,authenticated;
grant execute on function public.aqari_kpi_dashboard(uuid,date,date) to authenticated;
commit;
