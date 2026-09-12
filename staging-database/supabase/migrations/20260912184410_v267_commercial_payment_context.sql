-- Read-only context for the commercial-sales desk. It returns the saved
-- commercial statement plus confirmed lease payments and the remaining amount
-- that can still be allocated to percentage-sales obligations.
create or replace function private.aqari_commercial_payment_context_data(w uuid,lid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare statement jsonb;
begin
 statement:=private.aqari_commercial_statement_data(w,lid,'2000-01-01'::date,'2099-12-31'::date);
 return jsonb_build_object(
  'lease_id',lid,
  'statement',statement,
  'payments',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',p.id,
    'reference',p.reference,
    'amount',p.amount::numeric(18,3)::text,
    'paid_at',p.paid_at,
    'period',p.period,
    'status',p.status,
    'payment_method',p.payment_method,
    'allocated_amount',coalesce(a.allocated,0)::numeric(18,3)::text,
    'available_amount',greatest(p.amount-coalesce(a.allocated,0),0)::numeric(18,3)::text
   ) order by p.paid_at,p.reference,p.id)
   from public.aqari_rent_payments p
   left join lateral (
    select coalesce(sum(v.amount),0) allocated
    from private.aqari_commercial_active_allocations v
    where v.workspace_id=w and v.payment_id=p.id
   ) a on true
   where p.workspace_id=w and p.lease_id=lid
    and p.status in('مدفوع','جزئي','paid','partial')
    and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id)
  ),'[]'::jsonb)
 );
end $$;

create or replace function public.aqari_commercial_payment_context(p_workspace_id uuid,p_lease_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare prop uuid;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) or not private.aqari_can(p_workspace_id,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select u.property_id into prop
 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 where l.workspace_id=p_workspace_id and l.id=p_lease_id;
 if prop is null or not private.aqari_can_property(p_workspace_id,prop,'finance','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 return private.aqari_commercial_payment_context_data(p_workspace_id,p_lease_id);
end $$;
revoke all on function private.aqari_commercial_payment_context_data(uuid,uuid),public.aqari_commercial_payment_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_commercial_payment_context(uuid,uuid) to authenticated;
