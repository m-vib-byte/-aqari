-- AQARI V267 Preview/Staging: fail closed on webhook idempotency-key conflicts and make WhatsApp maintenance message-reference retries deterministic.

create or replace function public.aqari_record_verified_webhook(p_workspace_id uuid,p_receipt jsonb)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 r private.aqari_webhook_receipts;
 incoming_body_sha text:=coalesce(p_receipt->>'body_sha256','');
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or incoming_body_sha!~'^[a-f0-9]{64}$' or p_receipt->>'signature_sha256'!~'^[a-f0-9]{64}$' then raise exception 'INVALID_VERIFIED_WEBHOOK' using errcode='22023';end if;
 insert into private.aqari_webhook_receipts(id,workspace_id,provider,provider_event_id,event_type,body_sha256,signature_sha256,occurred_at,status,normalized_payload)
 values((p_receipt->>'id')::uuid,p_workspace_id,p_receipt->>'provider',p_receipt->>'provider_event_id',p_receipt->>'event_type',incoming_body_sha,p_receipt->>'signature_sha256',(p_receipt->>'occurred_at')::timestamptz,'received',p_receipt->'normalized_payload')
 on conflict(workspace_id,provider,provider_event_id) do nothing returning * into r;
 if found then return jsonb_build_object('duplicate',false,'id',r.id,'status',r.status);end if;
 select * into r from private.aqari_webhook_receipts x where x.workspace_id=p_workspace_id and x.provider=p_receipt->>'provider' and x.provider_event_id=p_receipt->>'provider_event_id';
 if not found then raise exception 'WEBHOOK_DUPLICATE_READBACK_FAILED';end if;
 if r.body_sha256 is distinct from incoming_body_sha then raise check_violation using message='WEBHOOK_IDEMPOTENCY_CONFLICT';end if;
 return jsonb_build_object('duplicate',true,'id',r.id,'status',r.status);
end $$;
revoke all on function public.aqari_record_verified_webhook(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_record_verified_webhook(uuid,jsonb) to service_role;

create or replace function public.aqari_process_whatsapp_maintenance_webhook(p_receipt_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 wr private.aqari_webhook_receipts;
 existing private.aqari_maintenance_message_events;
 request_row public.aqari_maintenance_requests;
 tenant_phone text;
 payload jsonb;
 request_value bigint;
 sender text;
 sender_digits text;
 reference text;
 body text;
 stored_digits text;
 existing_sender_digits text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into wr from private.aqari_webhook_receipts x where x.id=p_receipt_id for update;
 if not found then raise no_data_found using message='WEBHOOK_NOT_FOUND';end if;
 select * into existing from private.aqari_maintenance_message_events x where x.webhook_receipt_id=wr.id;
 if found then
  insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason)
  values(wr.workspace_id,wr.id,wr.provider,'replayed','maintenance_request',existing.request_id::text,'MAINTENANCE_MESSAGE_REPLAY');
  return jsonb_build_object('status','processed','requestId',existing.request_id,'messageReference',existing.provider_message_reference,'replayed',true);
 end if;
 if wr.provider<>'whatsapp' or wr.event_type<>'maintenance.message' then raise invalid_parameter_value using message='MAINTENANCE_MESSAGE_WEBHOOK_REQUIRED';end if;
 payload:=wr.normalized_payload;
 begin request_value:=(payload->>'maintenance_request_no')::bigint;exception when others then request_value:=null;end;
 sender:=coalesce(payload->>'sender_reference','');reference:=coalesce(payload->>'message_reference','');body:=coalesce(payload->>'message_text','');sender_digits:=regexp_replace(sender,'[^0-9]','','g');
 if request_value is null or length(sender_digits) not between 3 and 20 or length(reference) not between 1 and 200 or length(body) not between 1 and 4000 then
  update private.aqari_webhook_receipts set status='rejected',rejection_reason='INVALID_MAINTENANCE_MESSAGE' where id=wr.id;
  insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason) values(wr.workspace_id,wr.id,wr.provider,'rejected','maintenance_request',null,'INVALID_MAINTENANCE_MESSAGE');
  return jsonb_build_object('status','rejected','reason','INVALID_MAINTENANCE_MESSAGE');
 end if;
 select m.* into request_row from public.aqari_maintenance_requests m join public.aqari_leases l on l.workspace_id=m.workspace_id and l.id=m.lease_id and l.tenant_id=m.tenant_id where m.workspace_id=wr.workspace_id and m.request_no=request_value;
 if request_row.id is not null then select t.phone into tenant_phone from public.aqari_tenants t where t.workspace_id=wr.workspace_id and t.id=request_row.tenant_id;end if;
 stored_digits:=regexp_replace(coalesce(tenant_phone,''),'[^0-9]','','g');
 if request_row.id is null or stored_digits='' or sender_digits<>stored_digits then
  update private.aqari_webhook_receipts set status='rejected',rejection_reason='MAINTENANCE_REQUEST_OR_SENDER_MISMATCH' where id=wr.id;
  insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason) values(wr.workspace_id,wr.id,wr.provider,'rejected','maintenance_request',null,'MAINTENANCE_REQUEST_OR_SENDER_MISMATCH');
  return jsonb_build_object('status','rejected','reason','MAINTENANCE_REQUEST_OR_SENDER_MISMATCH');
 end if;

 select * into existing from private.aqari_maintenance_message_events x where x.workspace_id=wr.workspace_id and x.provider_message_reference=reference;
 if found then
  existing_sender_digits:=regexp_replace(existing.sender_reference,'[^0-9]','','g');
  if existing.request_id=request_row.id and existing_sender_digits=sender_digits and existing.message_text=body and existing.occurred_at=wr.occurred_at then
   update private.aqari_webhook_receipts set status='processed',rejection_reason=null where id=wr.id;
   insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason)
   values(wr.workspace_id,wr.id,wr.provider,'replayed','maintenance_request',existing.request_id::text,'MAINTENANCE_MESSAGE_REFERENCE_REPLAY');
   return jsonb_build_object('status','processed','requestId',existing.request_id,'messageReference',reference,'replayed',true);
  end if;
  update private.aqari_webhook_receipts set status='rejected',rejection_reason='MAINTENANCE_MESSAGE_REFERENCE_CONFLICT' where id=wr.id;
  insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason)
  values(wr.workspace_id,wr.id,wr.provider,'rejected','maintenance_request',request_row.id::text,'MAINTENANCE_MESSAGE_REFERENCE_CONFLICT');
  return jsonb_build_object('status','rejected','reason','MAINTENANCE_MESSAGE_REFERENCE_CONFLICT');
 end if;

 insert into private.aqari_maintenance_message_events(workspace_id,request_id,webhook_receipt_id,provider_message_reference,sender_reference,message_text,occurred_at)
 values(wr.workspace_id,request_row.id,wr.id,reference,sender,body,wr.occurred_at) returning * into existing;
 update private.aqari_webhook_receipts set status='processed',rejection_reason=null where id=wr.id;
 insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason)
 values(wr.workspace_id,wr.id,wr.provider,'processed','maintenance_request',request_row.id::text,'MAINTENANCE_MESSAGE_LINKED');
 return jsonb_build_object('status','processed','requestId',request_row.id,'requestNo',request_row.request_no,'messageReference',reference,'replayed',false);
end $$;
revoke all on function public.aqari_process_whatsapp_maintenance_webhook(uuid) from public,anon,authenticated;
grant execute on function public.aqari_process_whatsapp_maintenance_webhook(uuid) to service_role;
