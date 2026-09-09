-- V267 Staging only. Reconcile planned messages with current approved contract terms.
-- This migration does not configure or invoke any external sender.
begin;
create function private.aqari_reminder_due(c jsonb,fallback numeric,period date) returns numeric language sql immutable set search_path='' as $$
 select case when c->>'rentalTermsVersion'='1' then private.aqari_contract_due(c,to_char(period,'YYYY-MM')) else fallback end
$$;
revoke all on function private.aqari_reminder_due(jsonb,numeric,date) from public,anon,authenticated;
-- Preserve the existing projection and its guards; replace its single amount lookup.
-- Fail closed if the upstream function no longer has the reviewed anchor.
do $migration$
declare definition text:=pg_get_functiondef('private.aqari_v267_project_state()'::regprocedure);
 anchor text:='  select snapshot into v_contract from public.aqari_leases where workspace_id=new.workspace_id and id=lease_ref;';
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then raise exception 'PROJECTION_ANCHOR_CHANGED';end if;
 execute replace(definition,anchor,anchor||E'\n  rent_value:=private.aqari_reminder_due(v_contract,rent_value,((r->>''period'')||''-01'')::date);');
end $migration$;
create function private.aqari_reconcile_reminder_queue(w uuid) returns integer language plpgsql security definer set search_path='' as $$
declare cancelled integer;
begin
 update public.aqari_notification_outbox o set status='cancelled'
 where o.workspace_id=w and o.kind='rent_reminder' and o.status in ('awaiting_configuration','queued')
 and not exists(select 1 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id and t.workspace_id=w
  where l.id=o.lease_id and l.workspace_id=w and l.status='signed' and t.is_active
  and l.start_date<=(o.period+interval '1 month - 1 day')::date and l.end_date>=o.period
  and ((o.channel='email' and nullif(btrim(t.email),'') is not null) or (o.channel='whatsapp' and nullif(btrim(t.phone),'') is not null))
  and private.aqari_reminder_due(l.snapshot,l.monthly_rent,o.period)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=o.period),0));
 get diagnostics cancelled=row_count;return cancelled;
end $$;
revoke all on function private.aqari_reconcile_reminder_queue(uuid) from public,anon,authenticated;
create or replace function private.aqari_v267_prepare_reminders(w uuid,as_of date,grace_day integer) returns integer language plpgsql security definer set search_path='' as $$
declare period_start date;window_start date;window_end date;inserted integer;
begin
 if auth.uid() is null or not private.aqari_can(w,'notifications','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if grace_day is null or grace_day<1 or grace_day>27 or as_of is null then raise exception 'INVALID_REMINDER_WINDOW';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 perform private.aqari_reconcile_reminder_queue(w);
 period_start:=date_trunc('month',as_of)::date;
 if extract(day from as_of)>=28 then period_start:=(period_start+interval '1 month')::date;end if;
 window_start:=(period_start-interval '1 month')::date+27;
 window_end:=period_start+grace_day-1;
 if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then return 0;end if;
 insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,scheduled_at,idempotency_key)
 select w,l.id,period_start,'rent_reminder',ch.channel,'awaiting_configuration',(as_of::timestamp at time zone 'Asia/Kuwait'),'reminder:'||l.id::text||':'||period_start::text||':'||as_of::text||':'||ch.channel
 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id and t.workspace_id=w
 cross join (values('email'::text),('whatsapp'::text)) ch(channel)
 where l.workspace_id=w and l.status='signed' and t.is_active and l.start_date<=(period_start+interval '1 month - 1 day')::date and l.end_date>=period_start
 and ((ch.channel='email' and nullif(btrim(t.email),'') is not null) or (ch.channel='whatsapp' and nullif(btrim(t.phone),'') is not null))
 and private.aqari_reminder_due(l.snapshot,l.monthly_rent,period_start)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=period_start),0)
 on conflict(workspace_id,idempotency_key) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
create function private.aqari_reconcile_reminders_after_state() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.aqari_reconcile_reminder_queue(new.workspace_id);return new;
end $$;
revoke all on function private.aqari_reconcile_reminders_after_state() from public,anon,authenticated;
-- Run after projection triggers; payment writes and contract approval share the app-state lock.
create trigger zz_v267_reconcile_reminders after update of payload on public.aqari_app_state for each row execute function private.aqari_reconcile_reminders_after_state();
commit;
