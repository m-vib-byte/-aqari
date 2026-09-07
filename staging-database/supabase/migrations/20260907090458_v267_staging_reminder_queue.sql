-- Staging queue planning only: no outbound provider calls and no scheduled production jobs.
create function private.aqari_v267_prepare_reminders(w uuid,as_of date,grace_day integer) returns integer language plpgsql security definer set search_path='' as $$
declare period_start date;window_start date;window_end date;inserted integer;
begin
 if auth.uid() is null or not exists(select 1 from public.aqari_memberships where user_id=auth.uid() and workspace_id=w and is_active and role in ('general_manager','property_manager','accountant')) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if grace_day is null or grace_day<1 or grace_day>27 or as_of is null then raise exception 'INVALID_REMINDER_WINDOW';end if;
 -- The same lock as payment state writes serializes planning with collection confirmation.
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise exception 'WORKSPACE_REQUIRED';end if;
 period_start:=date_trunc('month',as_of)::date;
 if extract(day from as_of)>=28 then period_start:=(period_start+interval '1 month')::date;end if;
 window_start:=(period_start-interval '1 month')::date+27;
 window_end:=period_start+grace_day-1;
 if as_of<window_start or as_of>window_end or (as_of-window_start)%2<>0 then return 0;end if;
 insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,status,scheduled_at,idempotency_key)
 select w,l.id,period_start,'rent_reminder',ch.channel,'awaiting_configuration',(as_of::timestamp at time zone 'Asia/Kuwait'),'reminder:'||l.id::text||':'||period_start::text||':'||as_of::text||':'||ch.channel
 from public.aqari_leases l join public.aqari_tenants t on t.id=l.tenant_id
 cross join (values('email'::text),('whatsapp'::text)) ch(channel)
 where l.workspace_id=w and l.status='signed' and t.is_active and l.start_date<=(period_start+interval '1 month - 1 day')::date and l.end_date>=period_start
 and (ch.channel='email' and nullif(t.email,'') is not null or ch.channel='whatsapp' and nullif(t.phone,'') is not null)
 and l.monthly_rent>coalesce((select sum(p.amount) from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=l.id and p.period=period_start),0)
 on conflict(workspace_id,idempotency_key) do nothing;
 get diagnostics inserted=row_count;return inserted;
end $$;
revoke all on function private.aqari_v267_prepare_reminders(uuid,date,integer) from public,anon;
grant execute on function private.aqari_v267_prepare_reminders(uuid,date,integer) to authenticated;
create function public.aqari_prepare_rent_reminders(p_workspace_id uuid,p_as_of date,p_grace_day integer) returns integer language sql security invoker set search_path='' as $$ select private.aqari_v267_prepare_reminders(p_workspace_id,p_as_of,p_grace_day) $$;
revoke all on function public.aqari_prepare_rent_reminders(uuid,date,integer) from public,anon;
grant execute on function public.aqari_prepare_rent_reminders(uuid,date,integer) to authenticated;
