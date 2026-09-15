-- AQARI V267: idempotent receipt + owner-summary integration events.
begin;
create or replace function private.aqari_queue_collection_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
declare property_ref uuid;unit_no text;property_name text;tenant_ref uuid;tenant_name text;tenant_profile jsonb;tenant_email text;tenant_phone text;s private.aqari_collection_delivery_settings%rowtype;channel text;master jsonb;owner jsonb;selected boolean;
begin
 if new.amount<=0 or lower(coalesce(new.status,'')) in('cancelled','canceled','ملغى') then return new;end if;
 select u.property_id,u.unit_no,p.name,l.tenant_id,t.full_name,t.profile,t.email,t.phone
 into property_ref,unit_no,property_name,tenant_ref,tenant_name,tenant_profile,tenant_email,tenant_phone
 from public.aqari_leases l
 join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
 join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
 join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
 where l.workspace_id=new.workspace_id and l.id=new.lease_id;
 if property_ref is null then return new;end if;
 select * into s from private.aqari_collection_delivery_settings where workspace_id=new.workspace_id and property_id=property_ref;
 if not found then s.receipt_enabled:=true;s.owner_whatsapp_enabled:=false;s.owner_ids:='[]'::jsonb;end if;
 if coalesce(s.receipt_enabled,true) then
  channel:=private.aqari_preferred_delivery_channel(coalesce(tenant_profile,'{}'::jsonb),tenant_email,tenant_phone);
  if channel is not null then
   insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
   values(gen_random_uuid(),new.workspace_id,'collection.receipt',new.id::text,1,
    jsonb_build_object('paymentId',new.id,'leaseId',new.lease_id,'propertyId',property_ref,'tenantId',tenant_ref,'channel',channel,'receiptReference',new.reference,'amount',new.amount,'period',new.period,'paidAt',new.paid_at,'paymentMethod',new.payment_method,'unitNo',unit_no),
    'collection:receipt:'||new.id::text,'pending',0,now())
   on conflict(workspace_id,idempotency_key) do nothing;
  end if;
 end if;
 if coalesce(s.owner_whatsapp_enabled,false) then
  master:=private.aqari_property_master_snapshot(new.workspace_id,property_ref);
  for owner in select value from jsonb_array_elements(coalesce(master->'owners','[]'::jsonb)) loop
   selected:=exists(select 1 from jsonb_array_elements_text(coalesce(s.owner_ids,'[]'::jsonb))x(id) where x.id=owner->>'id');
   if selected and nullif(btrim(owner->>'whatsapp'),'') is not null then
    insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
    values(gen_random_uuid(),new.workspace_id,'collection.owner_whatsapp_summary',new.id::text,1,
     jsonb_build_object('paymentId',new.id,'leaseId',new.lease_id,'propertyId',property_ref,'propertyName',property_name,'unitNo',unit_no,'ownerId',owner->>'id','ownerName',owner->>'name','ownerWhatsapp',owner->>'whatsapp','channel','whatsapp','tenantName',tenant_name,'amount',new.amount,'period',new.period,'paidAt',new.paid_at,'paymentMethod',new.payment_method,'receiptReference',new.reference),
     'collection:owner-summary:'||new.id::text||':'||(owner->>'id'),'pending',0,now())
    on conflict(workspace_id,idempotency_key) do nothing;
   end if;
  end loop;
 end if;
 return new;
end $$;
revoke all on function private.aqari_queue_collection_delivery() from public,anon,authenticated,service_role;
drop trigger if exists zzz_aqari_queue_collection_delivery on public.aqari_rent_payments;
create trigger zzz_aqari_queue_collection_delivery after insert or update of status,amount,receipt on public.aqari_rent_payments for each row execute function private.aqari_queue_collection_delivery();

create or replace function private.aqari_cancel_pending_collection_delivery()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.aqari_integration_outbox
 set status='dead_letter',last_error='PAYMENT_CANCELLED_BEFORE_DELIVERY'
 where workspace_id=new.workspace_id and aggregate_id=new.payment_id::text
  and event_type in('collection.receipt','collection.owner_whatsapp_summary')
  and status in('pending','failed');
 return new;
end $$;
revoke all on function private.aqari_cancel_pending_collection_delivery() from public,anon,authenticated,service_role;
drop trigger if exists aqari_cancel_pending_collection_delivery on private.aqari_receipt_cancellations;
create trigger aqari_cancel_pending_collection_delivery after insert on private.aqari_receipt_cancellations for each row execute function private.aqari_cancel_pending_collection_delivery();
commit;
