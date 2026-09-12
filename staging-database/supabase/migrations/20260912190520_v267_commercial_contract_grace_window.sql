-- AQARI V267 Staging: commercial reminder grace follows the approved contract terms.
-- Residential/non-commercial leases keep the caller's existing grace window.
create or replace function private.aqari_effective_grace_days(w uuid,lid uuid,fallback integer) returns integer
language sql stable security definer set search_path='' as $$
 select greatest(1,least(366,coalesce((select t.grace_days from private.aqari_commercial_terms t where t.workspace_id=w and t.lease_id=lid),fallback,1)))
$$;
revoke all on function private.aqari_effective_grace_days(uuid,uuid,integer) from public,anon,authenticated;

create or replace function private.aqari_v267_prepare_reminders(w uuid,as_of date,grace_day integer) returns integer
language plpgsql security definer set search_path='' as $$
declare period_start date;window_start date;window_end date;inserted integer;max_grace integer;
begin
 if auth.uid() is null or not private.aqari_can(w,'notifications','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if grace_day is null or grace_day<1 or grace_day>27 or as_of is null then raise exception 'INVALID_REMINDER_WINDOW';end if;
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 perform private.aqari_reconcile_reminder_queue(w);
 period_start:=date_trunc('month',as_of)::date;
 if extract(day from as_of)>=28 then period_start:=(period_start+interval '1 month')::date;end if;
 window_start:=(period_start-interval '1 month')::date+27;
 select greatest(grace_day,coalesce(max(t.grace_days),grace_day)) into max_grace from private.aqari_commercial_terms t where t.workspace_id=w;
 window_end:=period_start+max_grace-1;
 if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then return 0;end if;
 insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,scheduled_at,idempotency_key)
 select w,l.id,period_start,'rent_reminder',ch.channel,'awaiting_configuration',(as_of::timestamp at time zone 'Asia/Kuwait'),'reminder:'||l.id::text||':'||period_start::text||':'||as_of::text||':'||ch.channel
 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id and t.workspace_id=w
 cross join (values('email'::text),('whatsapp'::text)) ch(channel)
 where l.workspace_id=w and l.status='signed' and t.is_active and l.start_date<=(period_start+interval '1 month - 1 day')::date and l.end_date>=period_start
 and as_of<=period_start+private.aqari_effective_grace_days(w,l.id,grace_day)-1
 and ((ch.channel='email' and nullif(btrim(t.email),'') is not null) or (ch.channel='whatsapp' and nullif(btrim(t.phone),'') is not null))
 and private.aqari_reminder_due(l.snapshot,l.monthly_rent,period_start)>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=period_start),0)
 on conflict(workspace_id,idempotency_key) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
revoke all on function private.aqari_v267_prepare_reminders(uuid,date,integer) from public,anon,authenticated;
