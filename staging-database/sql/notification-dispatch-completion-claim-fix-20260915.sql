-- AQARI V267 Preview/Staging: disambiguate completion dispatch payload variable from outbox.payload.
begin;
create or replace function public.aqari_integration_dispatch_completion_claim(p_limit integer default 5)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 r private.aqari_integration_outbox%rowtype;c private.aqari_integration_configs%rowtype;dispatch_payload jsonb;source_id uuid;items jsonb:='[]'::jsonb;claimed integer:=0;purpose_value text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>20 then raise invalid_parameter_value using message='INVALID_DISPATCH_LIMIT';end if;
 update private.aqari_integration_outbox set status='failed',last_error='DELIVERY_LEASE_EXPIRED',available_at=now() where event_type in('notification.payment_thanks','notification.operational') and status='sending' and available_at<=now() and delivered_at is null and attempts<20;
 update private.aqari_integration_outbox set status='dead_letter',last_error='DELIVERY_ATTEMPTS_EXHAUSTED' where event_type in('notification.payment_thanks','notification.operational') and status in('sending','failed') and attempts>=20 and delivered_at is null;
 for r in select * from private.aqari_integration_outbox o where o.event_type in('notification.payment_thanks','notification.operational') and o.status in('pending','failed') and o.available_at<=now() and o.attempts<20 order by o.available_at,o.created_at,o.id for update skip locked limit p_limit loop
  begin source_id:=r.aggregate_id::uuid;exception when invalid_text_representation then update private.aqari_integration_outbox set status='dead_letter',last_error='SOURCE_ID_INVALID' where id=r.id;continue;end;
  if r.event_type='notification.payment_thanks' then
   dispatch_payload:=private.aqari_payment_thanks_dispatch_payload(r.workspace_id,source_id);
   if dispatch_payload is null then update public.aqari_notification_outbox set status='cancelled' where workspace_id=r.workspace_id and id=source_id and status<>'sent';update private.aqari_integration_outbox set status='dead_letter',last_error='PAYMENT_THANKS_NOT_DELIVERABLE' where id=r.id;continue;end if;
  else
   dispatch_payload:=private.aqari_operational_dispatch_payload(r.workspace_id,source_id);
   if dispatch_payload is null then update private.aqari_notification_deliveries set status='cancelled',last_error='SOURCE_NOT_DELIVERABLE' where workspace_id=r.workspace_id and id=source_id and status not in('delivered','read');update private.aqari_integration_outbox set status='dead_letter',last_error='OPERATIONAL_NOTIFICATION_NOT_DELIVERABLE' where id=r.id;continue;end if;
  end if;
  purpose_value:=dispatch_payload->>'purpose';
  select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=dispatch_payload->>'channel' and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
  if not found then
   update private.aqari_integration_outbox set status='failed',last_error='PROVIDER_CONFIGURATION_MISSING',available_at=now()+interval '15 minutes' where id=r.id;
   if r.event_type='notification.payment_thanks' then update public.aqari_notification_outbox set status='awaiting_configuration' where workspace_id=r.workspace_id and id=source_id;
   else update private.aqari_notification_deliveries set status='queued',last_error='PROVIDER_CONFIGURATION_MISSING' where workspace_id=r.workspace_id and id=source_id;end if;
   continue;
  end if;
  update private.aqari_integration_outbox o set payload=dispatch_payload,status='sending',attempts=o.attempts+1,available_at=now()+interval '5 minutes',last_error=null where o.id=r.id;
  if r.event_type='notification.payment_thanks' then update public.aqari_notification_outbox set status='sending' where workspace_id=r.workspace_id and id=source_id;
  else update private.aqari_notification_deliveries set status='sending',attempts=attempts+1,last_error=null where workspace_id=r.workspace_id and id=source_id;end if;
  claimed:=claimed+1;
  items:=items||jsonb_build_array(jsonb_build_object('eventId',r.id,'workspaceId',r.workspace_id,'eventType',r.event_type,'idempotencyKey',r.idempotency_key,'attempt',r.attempts+1,'provider',c.provider,'mode',c.mode,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'channel',dispatch_payload->>'channel','recipientReference',dispatch_payload->>'recipientReference','template',dispatch_payload->>'template','variables',dispatch_payload->'variables','locale','ar'));
 end loop;
 return items;
end $$;
revoke all on function public.aqari_integration_dispatch_completion_claim(integer) from public,anon,authenticated;
grant execute on function public.aqari_integration_dispatch_completion_claim(integer) to service_role;
commit;