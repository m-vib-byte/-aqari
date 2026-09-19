-- AQARI V267 Preview/Staging: bridge authoritative rent reminders into the unified provider outbox.
-- The balance/contact/configuration is rechecked before bridge and again immediately before claim.
begin;

create or replace function public.aqari_notification_dispatch_bridge(p_limit integer default 50)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare o public.aqari_notification_outbox%rowtype;due private.aqari_rent_due_periods%rowtype;l public.aqari_leases%rowtype;u public.aqari_units%rowtype;p public.aqari_properties%rowtype;t public.aqari_tenants%rowtype;c private.aqari_integration_configs%rowtype;recipient text;variables jsonb;bridged integer:=0;cancelled integer:=0;waiting integer:=0;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>200 then raise invalid_parameter_value using message='INVALID_NOTIFICATION_BRIDGE_LIMIT';end if;
 for o in select * from public.aqari_notification_outbox q where q.kind='rent_reminder' and q.status in('awaiting_configuration','queued','failed') and q.scheduled_at<=now() order by q.scheduled_at,q.id for update skip locked limit p_limit loop
  perform private.aqari_refresh_rent_due_schedule(o.workspace_id,o.lease_id);
  select * into due from private.aqari_rent_due_periods d where d.workspace_id=o.workspace_id and d.lease_id=o.lease_id and d.period=o.period;
  if not found or due.balance<=0 then update public.aqari_notification_outbox set status='cancelled' where id=o.id;cancelled:=cancelled+1;continue;end if;
  select * into l from public.aqari_leases where workspace_id=o.workspace_id and id=o.lease_id;
  select * into u from public.aqari_units where workspace_id=l.workspace_id and id=l.unit_id;
  select * into p from public.aqari_properties where workspace_id=u.workspace_id and id=u.property_id;
  select * into t from public.aqari_tenants where workspace_id=l.workspace_id and id=l.tenant_id;
  if l.id is null or u.id is null or p.id is null or t.id is null or not private.aqari_contact_channel_allowed(t.profile,o.channel) then update public.aqari_notification_outbox set status='cancelled' where id=o.id;cancelled:=cancelled+1;continue;end if;
  recipient:=case o.channel when 'email' then nullif(btrim(t.email),'') when 'whatsapp' then nullif(btrim(t.phone),'') else null end;
  if recipient is null then update public.aqari_notification_outbox set status='cancelled' where id=o.id;cancelled:=cancelled+1;continue;end if;
  select * into c from private.aqari_integration_configs x where x.workspace_id=o.workspace_id and x.provider=o.channel and x.purpose in('rent_reminder','notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when 'rent_reminder' then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
  if not found then update public.aqari_notification_outbox set status='awaiting_configuration' where id=o.id;waiting:=waiting+1;continue;end if;
  variables:=jsonb_build_object('tenantName',t.full_name,'propertyName',p.name,'unitNo',u.unit_no,'contractNo',l.contract_no,'period',to_char(o.period,'YYYY-MM'),'dueAmount',due.due_amount,'paidAmount',due.paid_amount,'remainingBalance',due.balance,'scheduledAt',o.scheduled_at);
  insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
   values(gen_random_uuid(),o.workspace_id,'notification.rent_reminder',o.id::text,1,jsonb_build_object('notificationId',o.id,'leaseId',o.lease_id,'propertyId',p.id,'tenantId',t.id,'channel',o.channel,'recipientReference',recipient,'template','rent_reminder','variables',variables),'notification:'||o.id::text,'pending',0,greatest(o.scheduled_at,now()))
   on conflict(workspace_id,idempotency_key) do nothing;
  if exists(select 1 from private.aqari_integration_outbox x where x.workspace_id=o.workspace_id and x.idempotency_key='notification:'||o.id::text and x.status='sent') then update public.aqari_notification_outbox set status='sent' where id=o.id;
  elsif exists(select 1 from private.aqari_integration_outbox x where x.workspace_id=o.workspace_id and x.idempotency_key='notification:'||o.id::text and x.status='dead_letter') then update public.aqari_notification_outbox set status='failed' where id=o.id;
  else update public.aqari_notification_outbox set status='queued' where id=o.id;end if;
  bridged:=bridged+1;
 end loop;
 return jsonb_build_object('bridged',bridged,'cancelled',cancelled,'awaitingConfiguration',waiting);
end $$;
revoke all on function public.aqari_notification_dispatch_bridge(integer) from public,anon,authenticated;
grant execute on function public.aqari_notification_dispatch_bridge(integer) to service_role;

create or replace function public.aqari_integration_dispatch_claim(p_limit integer default 5)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 r private.aqari_integration_outbox%rowtype;c private.aqari_integration_configs%rowtype;notification public.aqari_notification_outbox%rowtype;due private.aqari_rent_due_periods%rowtype;
 channel text;purpose_value text;recipient text;template_value text;variables jsonb;attachment jsonb;receipt_source jsonb;items jsonb:='[]'::jsonb;
 tenant_name text;tenant_email text;tenant_phone text;property_name text;unit_no text;contract_no text;payment_reference text;payment_id uuid;artifact private.aqari_rent_receipt_pdf_artifacts%rowtype;claimed integer:=0;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>20 then raise invalid_parameter_value using message='INVALID_DISPATCH_LIMIT';end if;
 update private.aqari_integration_outbox set status='failed',last_error='DELIVERY_LEASE_EXPIRED',available_at=now() where status='sending' and available_at<=now() and delivered_at is null and attempts<20;
 update private.aqari_integration_outbox set status='dead_letter',last_error='DELIVERY_ATTEMPTS_EXHAUSTED' where status in('sending','failed') and attempts>=20 and delivered_at is null;
 for r in select * from private.aqari_integration_outbox o where o.status in('pending','failed') and o.available_at<=now() and o.attempts<20 order by o.available_at,o.created_at,o.id for update skip locked limit p_limit*8 loop
  exit when claimed>=p_limit;c:=null;channel:=null;purpose_value:=null;recipient:=null;template_value:=null;variables:='{}'::jsonb;attachment:=null;receipt_source:=null;
  if r.event_type='integration.test' then
   if coalesce(r.payload->>'config_id','') !~ '^[0-9a-fA-F-]{36}$' then continue;end if;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.id=(r.payload->>'config_id')::uuid and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null;
   if not found then continue;end if;channel:=c.provider;recipient:=nullif(btrim(c.public_metadata->>'testRecipientReference'),'');if recipient is null or channel not in('email','whatsapp','sms','push') then continue;end if;template_value:='integration_test';variables:=jsonb_build_object('probe',true,'configId',c.id);
  elsif r.event_type='notification.rent_reminder' then
   if r.aggregate_id !~ '^[0-9a-fA-F-]{36}$' then update private.aqari_integration_outbox set status='dead_letter',last_error='REMINDER_ID_INVALID' where id=r.id;continue;end if;
   select * into notification from public.aqari_notification_outbox n where n.workspace_id=r.workspace_id and n.id=r.aggregate_id::uuid for update;
   if not found or notification.kind<>'rent_reminder' or notification.status='cancelled' then update private.aqari_integration_outbox set status='dead_letter',last_error='REMINDER_CANCELLED_BEFORE_DELIVERY' where id=r.id;continue;end if;
   perform private.aqari_refresh_rent_due_schedule(notification.workspace_id,notification.lease_id);
   select * into due from private.aqari_rent_due_periods d where d.workspace_id=notification.workspace_id and d.lease_id=notification.lease_id and d.period=notification.period;
   if not found or due.balance<=0 then update public.aqari_notification_outbox set status='cancelled' where id=notification.id;update private.aqari_integration_outbox set status='dead_letter',last_error='REMINDER_SETTLED_BEFORE_DELIVERY' where id=r.id;continue;end if;
   channel:=nullif(btrim(r.payload->>'channel'),'');recipient:=nullif(btrim(r.payload->>'recipientReference'),'');if channel not in('email','whatsapp') or recipient is null then update public.aqari_notification_outbox set status='failed' where id=notification.id;update private.aqari_integration_outbox set status='dead_letter',last_error='REMINDER_RECIPIENT_INVALID' where id=r.id;continue;end if;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=channel and x.purpose in('rent_reminder','notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when 'rent_reminder' then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
   if not found then update public.aqari_notification_outbox set status='awaiting_configuration' where id=notification.id;continue;end if;
   template_value:='rent_reminder';variables:=coalesce(r.payload->'variables','{}'::jsonb)||jsonb_build_object('remainingBalance',due.balance,'paidAmount',due.paid_amount,'dueAmount',due.due_amount);update public.aqari_notification_outbox set status='sending' where id=notification.id;
  elsif r.event_type in('collection.receipt','collection.owner_whatsapp_summary') then
   channel:=nullif(btrim(r.payload->>'channel'),'');if channel not in('email','whatsapp','sms','push') then continue;end if;purpose_value:=case r.event_type when 'collection.receipt' then 'collection_receipt' else 'collection_owner_summary' end;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=channel and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;if not found then continue;end if;
   if r.event_type='collection.receipt' then
    if r.aggregate_id !~ '^[0-9a-fA-F-]{36}$' then continue;end if;payment_id:=r.aggregate_id::uuid;begin receipt_source:=private.aqari_rent_receipt_pdf_system_source(r.workspace_id,payment_id);exception when others then continue;end;
    select t.full_name,t.email,t.phone,p.name,u.unit_no,l.contract_no,rp.reference into tenant_name,tenant_email,tenant_phone,property_name,unit_no,contract_no,payment_reference from public.aqari_rent_payments rp join public.aqari_leases l on l.workspace_id=rp.workspace_id and l.id=rp.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id where rp.workspace_id=r.workspace_id and rp.id=payment_id;if not found then continue;end if;recipient:=case channel when 'email' then nullif(btrim(tenant_email),'') when 'whatsapp' then nullif(btrim(tenant_phone),'') when 'sms' then nullif(btrim(tenant_phone),'') else null end;if recipient is null then continue;end if;
    select * into artifact from private.aqari_rent_receipt_pdf_artifacts a where a.workspace_id=r.workspace_id and a.payment_id=payment_id;if found then attachment:=jsonb_build_object('filename','rent-receipt.pdf','content_type','application/pdf','base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'sha256',artifact.pdf_sha256);end if;template_value:='collection_receipt';variables:=jsonb_build_object('tenantName',tenant_name,'propertyName',property_name,'unitNo',unit_no,'contractNo',contract_no,'amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',payment_reference);
   else recipient:=nullif(btrim(r.payload->>'ownerWhatsapp'),'');if recipient is null then continue;end if;template_value:='collection_owner_summary';variables:=jsonb_build_object('ownerName',r.payload->>'ownerName','tenantName',r.payload->>'tenantName','propertyName',r.payload->>'propertyName','unitNo',r.payload->>'unitNo','amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',r.payload->>'receiptReference');end if;
  else continue;end if;
  update private.aqari_integration_outbox set status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes',last_error=null where workspace_id=r.workspace_id and id=r.id;claimed:=claimed+1;
  items:=items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('eventId',r.id,'workspaceId',r.workspace_id,'eventType',r.event_type,'idempotencyKey',r.idempotency_key,'attempt',r.attempts+1,'provider',c.provider,'mode',c.mode,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'channel',channel,'recipientReference',recipient,'template',template_value,'variables',variables,'locale','ar','attachment',attachment,'receiptSource',case when attachment is null then receipt_source else null end)));
 end loop;return items;
end $$;
revoke all on function public.aqari_integration_dispatch_claim(integer) from public,anon,authenticated;grant execute on function public.aqari_integration_dispatch_claim(integer) to service_role;

create or replace function public.aqari_integration_dispatch_result(p_event_id uuid,p_ok boolean,p_retryable boolean default true,p_provider_reference text default null,p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare r private.aqari_integration_outbox%rowtype;next_status text;err text;ref text;delay_minutes integer;notification_id uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into r from private.aqari_integration_outbox where id=p_event_id for update;if not found then raise no_data_found using message='OUTBOX_EVENT_NOT_FOUND';end if;
 if r.status='sent' then return jsonb_build_object('id',r.id,'status',r.status,'attempts',r.attempts,'replayed',true);end if;if r.status<>'sending' then raise serialization_failure using message='OUTBOX_EVENT_NOT_CLAIMED';end if;
 ref:=nullif(left(regexp_replace(coalesce(p_provider_reference,''),'[[:cntrl:]]','','g'),300),'');err:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),1000),'');
 if p_ok then next_status:='sent';update private.aqari_integration_outbox set status='sent',provider_reference=ref,last_error=null,delivered_at=now(),available_at=now() where id=r.id;insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,'sent',ref,null);
 else if coalesce(p_retryable,true) and r.attempts<20 then next_status:='failed';else next_status:='dead_letter';end if;delay_minutes:=least(60,greatest(1,power(2,least(r.attempts,6)-1)::integer));update private.aqari_integration_outbox set status=next_status,last_error=coalesce(err,'PROVIDER_DELIVERY_FAILED'),available_at=case when next_status='failed' then now()+make_interval(mins=>delay_minutes) else now() end where id=r.id;insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,next_status,ref,coalesce(err,'PROVIDER_DELIVERY_FAILED'));end if;
 if r.event_type='notification.rent_reminder' and r.aggregate_id~'^[0-9a-fA-F-]{36}$' then notification_id:=r.aggregate_id::uuid;update public.aqari_notification_outbox set status=case when next_status='sent' then 'sent' else 'failed' end where workspace_id=r.workspace_id and id=notification_id and status<>'cancelled';end if;
 return jsonb_build_object('id',r.id,'status',next_status,'attempts',r.attempts,'replayed',false);
end $$;
revoke all on function public.aqari_integration_dispatch_result(uuid,boolean,boolean,text,text) from public,anon,authenticated;grant execute on function public.aqari_integration_dispatch_result(uuid,boolean,boolean,text,text) to service_role;

commit;
