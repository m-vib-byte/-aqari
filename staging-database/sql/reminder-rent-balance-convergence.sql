-- Isolated V267 only: preserve contract grace and canonical contact preferences,
-- and reconcile reminders with the same exact rent balance as the due schedule.
-- No provider is called, consent is not inferred, and applying this upgrade does
-- not rewrite payments, preferences, signed contracts or existing outbox rows.
begin;

-- Internal calculation only. This mirrors the current authoritative schedule:
-- contract due - non-cancelled receipt residual - allocated tenant credit.
-- A commercial allocation reduces the RENT part of its receipt; it is never
-- counted as a second payment. Unallocated credit does not settle a rent month.
-- VOLATILE obtains a fresh statement snapshot when called after projection writes.
create or replace function private.aqari_reminder_rent_balance(w uuid,lid uuid,mon date)
returns numeric language sql volatile security definer set search_path='' as $$
 select (private.aqari_reminder_due(l.snapshot,l.monthly_rent,mon)
  -coalesce((select sum(greatest(p.amount-coalesce((select sum(v.amount)
    from private.aqari_commercial_active_allocations v
    where v.workspace_id=w and v.payment_id=p.id),0),0))
   from public.aqari_rent_payments p
   where p.workspace_id=w and p.lease_id=l.id and p.period=mon
    and lower(coalesce(p.status,'')) not in ('cancelled','ملغى')
    and not exists(select 1 from private.aqari_receipt_cancellations c
     where c.workspace_id=w and c.payment_id=p.id)),0)
  -coalesce((select sum(a.amount) from private.aqari_credit_allocations a
   where a.workspace_id=w and a.lease_id=l.id and a.period=mon),0))::numeric(15,3)
 from public.aqari_leases l
 where l.workspace_id=w and l.id=lid and l.status='signed'
  and mon=date_trunc('month',mon)::date
  and l.start_date<=(mon+interval '1 month - 1 day')::date and l.end_date>=mon
$$;
revoke all on function private.aqari_reminder_rent_balance(uuid,uuid,date) from public,anon,authenticated;

-- Narrow, checked replacements retain the installed grace-window implementation,
-- identity/permission guards, terminal cancellation, idempotency and queue hooks.
do $upgrade$
declare signature text;definition text;anchor text;replacement text;channel_anchor text;
begin
 foreach signature in array array['private.aqari_v267_prepare_reminders(uuid,date,integer)','private.aqari_reconcile_reminder_queue(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if signature='private.aqari_v267_prepare_reminders(uuid,date,integer)' then
   if position('private.aqari_effective_grace_days(w,l.id,grace_day)' in definition)=0 then
    raise exception 'REMINDER_CONTRACT_GRACE_ANCHOR_CHANGED';end if;
   anchor:='private.aqari_reminder_due(l.snapshot,l.monthly_rent,period_start)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=period_start),0)';
   replacement:='private.aqari_reminder_rent_balance(w,l.id,period_start)>0';
   channel_anchor:=' and ((ch.channel=''email'' and nullif(btrim(t.email),'''') is not null) or (ch.channel=''whatsapp'' and nullif(btrim(t.phone),'''') is not null))';
   if position('private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),ch.channel)' in definition)=0 then
    if position('aqari_contact_channel_allowed' in definition)>0
     or (length(definition)-length(replace(definition,channel_anchor,'')))/length(channel_anchor)<>1 then
     raise exception 'REMINDER_CANONICAL_CONTACT_ANCHOR_CHANGED';end if;
    definition:=replace(definition,channel_anchor,channel_anchor||E'\n and private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),ch.channel)');
   end if;
  else
   if position('private.aqari_contact_channel_allowed(private.aqari_effective_contact_profile(w,t.id,t.profile),o.channel)' in definition)=0
    or position('private.aqari_reconcile_contact_queue(w,null)' in definition)=0 then
    raise exception 'REMINDER_CANONICAL_RECONCILIATION_ANCHOR_CHANGED';end if;
   anchor:='private.aqari_reminder_due(l.snapshot,l.monthly_rent,o.period)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=o.period),0)';
   replacement:='private.aqari_reminder_rent_balance(w,l.id,o.period)>0';
  end if;
  if position(replacement in definition)=0 then
   if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'REMINDER_RENT_BALANCE_ANCHOR_CHANGED:%',signature;end if;
   definition:=replace(definition,anchor,replacement);
  elsif position(anchor in definition)>0 then raise exception 'REMINDER_RENT_BALANCE_AMBIGUOUS:%',signature;
  end if;
  execute definition;
 end loop;
end $upgrade$;
revoke all on function private.aqari_v267_prepare_reminders(uuid,date,integer),private.aqari_reconcile_reminder_queue(uuid) from public,anon,authenticated;
commit;
