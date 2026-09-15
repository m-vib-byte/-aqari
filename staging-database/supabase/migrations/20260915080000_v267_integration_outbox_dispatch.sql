-- AQARI V267 Preview/Staging: server-only integration outbox dispatcher.
-- Claims only configured events, uses a lease for crash-safe retries, and records immutable delivery attempts.
begin;

create table if not exists private.aqari_integration_delivery_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 event_id uuid not null,
 attempt integer not null check(attempt between 1 and 20),
 outcome text not null check(outcome in('sent','failed','dead_letter')),
 provider_reference text,
 error_code text,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,event_id) references private.aqari_integration_outbox(workspace_id,id)
);
create index if not exists aqari_integration_delivery_events_scope on private.aqari_integration_delivery_events(workspace_id,event_id,id desc);
alter table private.aqari_integration_delivery_events enable row level security;
revoke all on private.aqari_integration_delivery_events from public,anon,authenticated,service_role;
drop trigger if exists aqari_integration_delivery_events_immutable on private.aqari_integration_delivery_events;
create trigger aqari_integration_delivery_events_immutable before update or delete on private.aqari_integration_delivery_events for each row execute function private.aqari_reject_immutable_change();

create or replace function public.aqari_integration_dispatch_claim(p_limit integer default 5)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 r private.aqari_integration_outbox%rowtype;c private.aqari_integration_configs%rowtype;
 channel text;purpose_value text;recipient text;template_value text;variables jsonb;attachment jsonb;items jsonb:='[]'::jsonb;
 tenant_name text;tenant_email text;tenant_phone text;property_name text;unit_no text;contract_no text;payment_reference text;payment_id uuid;
 artifact private.aqari_rent_receipt_pdf_artifacts%rowtype;claimed integer:=0;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>20 then raise invalid_parameter_value using message='INVALID_DISPATCH_LIMIT';end if;
 update private.aqari_integration_outbox set status='failed',last_error='DELIVERY_LEASE_EXPIRED',available_at=now() where status='sending' and available_at<=now() and delivered_at is null and attempts<20;
 update private.aqari_integration_outbox set status='dead_letter',last_error='DELIVERY_ATTEMPTS_EXHAUSTED' where status in('sending','failed') and attempts>=20 and delivered_at is null;
 for r in select * from private.aqari_integration_outbox o where o.status in('pending','failed') and o.available_at<=now() and o.attempts<20 order by o.available_at,o.created_at,o.id for update skip locked limit p_limit*8 loop
  exit when claimed>=p_limit;c:=null;channel:=null;purpose_value:=null;recipient:=null;template_value:=null;variables:='{}'::jsonb;attachment:=null;
  if r.event_type='integration.test' then
   if coalesce(r.payload->>'config_id','') !~ '^[0-9a-fA-F-]{36}$' then continue;end if;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.id=(r.payload->>'config_id')::uuid and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null;
   if not found then continue;end if;channel:=c.provider;purpose_value:=c.purpose;recipient:=nullif(btrim(c.public_metadata->>'testRecipientReference'),'');
   if recipient is null or channel not in('email','whatsapp','sms','push') then continue;end if;template_value:='integration_test';variables:=jsonb_build_object('probe',true,'configId',c.id);
  elsif r.event_type in('collection.receipt','collection.owner_whatsapp_summary') then
   channel:=nullif(btrim(r.payload->>'channel'),'');if channel not in('email','whatsapp','sms','push') then continue;end if;
   purpose_value:=case r.event_type when 'collection.receipt' then 'collection_receipt' else 'collection_owner_summary' end;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=channel and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
   if not found then continue;end if;
   if r.event_type='collection.receipt' then
    if r.aggregate_id !~ '^[0-9a-fA-F-]{36}$' then continue;end if;payment_id:=r.aggregate_id::uuid;
    select t.full_name,t.email,t.phone,p.name,u.unit_no,l.contract_no,rp.reference into tenant_name,tenant_email,tenant_phone,property_name,unit_no,contract_no,payment_reference from public.aqari_rent_payments rp join public.aqari_leases l on l.workspace_id=rp.workspace_id and l.id=rp.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id where rp.workspace_id=r.workspace_id and rp.id=payment_id and lower(coalesce(rp.status,'')) not in('cancelled','canceled','ملغى') and not exists(select 1 from private.aqari_receipt_cancellations z where z.workspace_id=rp.workspace_id and z.payment_id=rp.id);
    if not found then continue;end if;recipient:=case channel when 'email' then nullif(btrim(tenant_email),'') when 'whatsapp' then nullif(btrim(tenant_phone),'') when 'sms' then nullif(btrim(tenant_phone),'') else null end;if recipient is null then continue;end if;
    select * into artifact from private.aqari_rent_receipt_pdf_artifacts a where a.workspace_id=r.workspace_id and a.payment_id=payment_id;if not found then continue;end if;
    template_value:='collection_receipt';variables:=jsonb_build_object('tenantName',tenant_name,'propertyName',property_name,'unitNo',unit_no,'contractNo',contract_no,'amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',payment_reference);
    attachment:=jsonb_build_object('filename','rent-receipt.pdf','content_type','application/pdf','base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'sha256',artifact.pdf_sha256);
   else
    recipient:=nullif(btrim(r.payload->>'ownerWhatsapp'),'');if recipient is null then continue;end if;template_value:='collection_owner_summary';variables:=jsonb_build_object('ownerName',r.payload->>'ownerName','tenantName',r.payload->>'tenantName','propertyName',r.payload->>'propertyName','unitNo',r.payload->>'unitNo','amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',r.payload->>'receiptReference');
   end if;
  else continue;end if;
  update private.aqari_integration_outbox set status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes',last_error=null where workspace_id=r.workspace_id and id=r.id;
  claimed:=claimed+1;items:=items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('eventId',r.id,'workspaceId',r.workspace_id,'eventType',r.event_type,'idempotencyKey',r.idempotency_key,'attempt',r.attempts+1,'provider',c.provider,'mode',c.mode,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'channel',channel,'recipientReference',recipient,'template',template_value,'variables',variables,'locale','ar','attachment',attachment)));
 end loop;return items;
end $$;
revoke all on function public.aqari_integration_dispatch_claim(integer) from public,anon,authenticated;grant execute on function public.aqari_integration_dispatch_claim(integer) to service_role;

create or replace function public.aqari_integration_dispatch_result(p_event_id uuid,p_ok boolean,p_retryable boolean default true,p_provider_reference text default null,p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare r private.aqari_integration_outbox%rowtype;next_status text;err text;ref text;delay_minutes integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into r from private.aqari_integration_outbox where id=p_event_id for update;if not found then raise no_data_found using message='OUTBOX_EVENT_NOT_FOUND';end if;
 if r.status='sent' then return jsonb_build_object('id',r.id,'status',r.status,'attempts',r.attempts,'replayed',true);end if;
 if r.status<>'sending' then raise serialization_failure using message='OUTBOX_EVENT_NOT_CLAIMED';end if;
 ref:=nullif(left(regexp_replace(coalesce(p_provider_reference,''),'[[:cntrl:]]','','g'),300),'');err:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),1000),'');
 if p_ok then next_status:='sent';update private.aqari_integration_outbox set status='sent',provider_reference=ref,last_error=null,delivered_at=now(),available_at=now() where id=r.id;insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,'sent',ref,null);
 else if coalesce(p_retryable,true) and r.attempts<20 then next_status:='failed';else next_status:='dead_letter';end if;delay_minutes:=least(60,greatest(1,power(2,least(r.attempts,6)-1)::integer));update private.aqari_integration_outbox set status=next_status,last_error=coalesce(err,'PROVIDER_DELIVERY_FAILED'),available_at=case when next_status='failed' then now()+make_interval(mins=>delay_minutes) else now() end where id=r.id;insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,next_status,ref,coalesce(err,'PROVIDER_DELIVERY_FAILED'));end if;
 return jsonb_build_object('id',r.id,'status',next_status,'attempts',r.attempts,'replayed',false);
end $$;
revoke all on function public.aqari_integration_dispatch_result(uuid,boolean,boolean,text,text) from public,anon,authenticated;grant execute on function public.aqari_integration_dispatch_result(uuid,boolean,boolean,text,text) to service_role;
commit;
