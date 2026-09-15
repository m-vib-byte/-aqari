-- AQARI V267: direct payment-to-reminder convergence.
begin;
create or replace function private.aqari_cancel_satisfied_rent_reminders(w uuid,lid uuid)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare changed integer:=0;
begin
 perform private.aqari_refresh_rent_due_schedule(w,lid);
 update public.aqari_notification_outbox o set status='cancelled'
 where o.workspace_id=w and o.lease_id=lid and o.kind='rent_reminder'
  and o.status in('awaiting_configuration','queued','failed')
  and exists(select 1 from private.aqari_rent_due_periods d where d.workspace_id=o.workspace_id and d.lease_id=o.lease_id and d.period=o.period and d.balance<=0);
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function private.aqari_cancel_satisfied_rent_reminders(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_stop_reminders_after_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then return old;end if;
 if new.amount>0 and lower(coalesce(new.status,'')) not in('cancelled','canceled','ملغى') then
  perform private.aqari_cancel_satisfied_rent_reminders(new.workspace_id,new.lease_id);
 end if;
 return new;
end $$;
revoke all on function private.aqari_stop_reminders_after_payment() from public,anon,authenticated,service_role;
drop trigger if exists zzy_aqari_stop_reminders_after_payment on public.aqari_rent_payments;
create trigger zzy_aqari_stop_reminders_after_payment
after insert or update of status,amount on public.aqari_rent_payments
for each row execute function private.aqari_stop_reminders_after_payment();
commit;
