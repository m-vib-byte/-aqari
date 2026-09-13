-- AQARI V267 Preview/Staging only.
-- G07-06/G07-07: authoritative monthly property collection statement and rate.
-- Apply after rent-due-schedule.sql and rent-entitlement-start.sql.

begin;

create or replace function public.aqari_monthly_collection_report(
  p_workspace_id uuid,
  p_period date,
  p_property_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  w uuid:=p_workspace_id;
  result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if p_period is null or p_period<>date_trunc('month',p_period)::date then
    raise exception 'COLLECTION_MONTH_REQUIRED' using errcode='22023';
  end if;
  if not private.aqari_can(w,'collections','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  if p_property_id is not null and not private.aqari_can_property(w,p_property_id,'collections','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  with lines as (
    select
      p.id property_id,
      p.name property_name,
      l.id lease_id,
      l.contract_no,
      u.unit_no,
      d.period,
      case
        when coalesce(l.snapshot->>'contractRent','') ~ '^[0-9]+([.][0-9]{1,3})?$'
          then (l.snapshot->>'contractRent')::numeric(15,3)
        else l.monthly_rent::numeric(15,3)
      end gross_contract_rent,
      d.due_amount::numeric(15,3) due_amount,
      greatest((case
        when coalesce(l.snapshot->>'contractRent','') ~ '^[0-9]+([.][0-9]{1,3})?$'
          then (l.snapshot->>'contractRent')::numeric(15,3)
        else l.monthly_rent::numeric(15,3)
      end)-d.due_amount,0)::numeric(15,3) discount_amount,
      d.paid_amount::numeric(15,3) paid_total,
      least(d.paid_amount,d.due_amount)::numeric(15,3) allocated_paid,
      greatest(d.paid_amount-d.due_amount,0)::numeric(15,3) overpayment,
      greatest(d.due_amount-d.paid_amount,0)::numeric(15,3) remaining,
      d.status,
      d.source_hash
    from private.aqari_rent_due_periods d
    join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
    join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
    join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    where d.workspace_id=w and d.period=p_period
      and (p_property_id is null or p.id=p_property_id)
      and private.aqari_can_property(w,p.id,'collections','read')
  ), summaries as (
    select property_id,property_name,
      count(*)::integer lease_periods,
      count(*) filter(where due_amount=0)::integer waived_periods,
      sum(gross_contract_rent)::numeric(15,3) gross_contract_rent,
      sum(discount_amount)::numeric(15,3) discounts,
      sum(due_amount)::numeric(15,3) due,
      sum(paid_total)::numeric(15,3) paid_total,
      sum(allocated_paid)::numeric(15,3) allocated_paid,
      sum(overpayment)::numeric(15,3) overpayment,
      sum(remaining)::numeric(15,3) remaining,
      case when sum(due_amount)>0
        then round((sum(allocated_paid)/sum(due_amount))*100,2)
        else null end collection_rate_pct
    from lines group by property_id,property_name
  )
  select jsonb_build_object(
    'period',p_period,
    'properties',coalesce((select jsonb_agg(jsonb_build_object(
      'property_id',s.property_id,'property_name',s.property_name,
      'lease_periods',s.lease_periods,'waived_periods',s.waived_periods,
      'gross_contract_rent',s.gross_contract_rent,'discounts',s.discounts,
      'due',s.due,'paid_total',s.paid_total,'allocated_paid',s.allocated_paid,
      'overpayment',s.overpayment,'remaining',s.remaining,
      'collection_rate_pct',s.collection_rate_pct,
      'rate_numerator',s.allocated_paid,'rate_denominator',s.due
    ) order by s.property_name,s.property_id) from summaries s),'[]'::jsonb),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'property_id',x.property_id,'property_name',x.property_name,
      'lease_id',x.lease_id,'contract_no',x.contract_no,'unit_no',x.unit_no,
      'period',x.period,'gross_contract_rent',x.gross_contract_rent,
      'discount',x.discount_amount,'due',x.due_amount,'paid_total',x.paid_total,
      'allocated_paid',x.allocated_paid,'overpayment',x.overpayment,
      'remaining',x.remaining,'status',x.status,'source_hash',x.source_hash
    ) order by x.property_name,x.unit_no,x.contract_no,x.lease_id) from lines x),'[]'::jsonb),
    'rate_policy',jsonb_build_object(
      'numerator','allocated_paid_capped_at_due',
      'denominator','authoritative_due_after_contract_discounts',
      'cancelled_receipts_excluded',true,
      'overpayment_excluded_from_rate_numerator',true,
      'waived_zero_due_adds_zero_to_denominator',true
    ),
    'generated_from','private.aqari_rent_due_periods + signed lease property/unit links'
  ) into result;
  return result;
end $$;

revoke all on function public.aqari_monthly_collection_report(uuid,date,uuid) from public,anon;
grant execute on function public.aqari_monthly_collection_report(uuid,date,uuid) to authenticated;

commit;
