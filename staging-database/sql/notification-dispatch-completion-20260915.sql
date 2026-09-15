-- AQARI V267 Preview/Staging: complete provider dispatch for payment thanks and operational alerts.
-- Additive to notification-dispatch-bridge-20260915.sql: rent reminders and collection events keep their existing path.
begin;

create or replace function private.aqari_payment_thanks_dispatch_payload(w uuid,nid uuid)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 n public.aqari_notification_outbox%rowtype;
 l public.aqari_leases%rowtype;
 u public.aqari_units%rowtype;
 p public.aqari_properties%rowtype;
 t public.aqari_tenants%rowtype;
 d private.aqari_rent_due_periods%rowtype;
 recipient text; last_receipt text; last_paid date; paid_total numeric;
begin
 select * into n from public.aqari_notification_outbox q where q.workspace_id=w and q.id=nid;
 if not found or n.kind<>'payment_thanks' or n.status='cancelled' then return null;end if;
 select * into l from public.aqari_leases x where x.workspace_id=w and x.id=n.lease_id;
 if not found then return null;end if;
 select * into u from public.aqari_units x where x.workspace_id=w and x.id=l.unit_id;
 select * into p from public.aqari_properties x where x.workspace_id=w and x.id=u.property_id;
 select * into t from public.aqari_tenants x where x.workspace_id=w and x.id=l.tenant_id;
 if u.id is null or p.id is null or t.id is null then return null;end if;
 if not private.aqari_contact_channel_allowed(t.profile,n.channel) then return null;end if;
 recipient:=case n.channel when 'email' then nullif(btrim(t.email),'') when 'whatsapp' then nullif(btrim(t.phone),'') else null end;
 if recipient is null then return null;end if;
 perform private.aqari_refresh_rent_due_schedule(w,l.id);
 select * into d from private.aqari_rent_due_periods x where x.workspace_id=w and x.lease_id=l.id and x.period=n.period;
 if not found or d.balance>0 or d.paid_amount<=0 then return null;end if;
 select rp.reference,rp.paid_at,coalesce(sum(rp.amount) over(),0)
 into last_receipt,last_paid,paid_total
 from public.aqari_rent_payments rp
 where rp.workspace_id=w and rp.lease_id=l.id and rp.period=n.period
  and lower(coalesce(rp.status,'')) not in('cancelled','canceled','ملغى')
  and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=rp.workspace_id and c.payment_id=rp.id)
 order by rp.paid_at desc,rp.created_at desc,rp.id desc limit 1;
 if last_receipt is null then return null;end if;
 return jsonb_build_object(
  'channel',n.channel,'recipientReference',recipient,'template','payment_thanks','purpose','payment_thanks',
  'variables',jsonb_build_object('tenantName',t.full_name,'propertyName',p.name,'unitNo',u.unit_no,'contractNo',l.contract_no,
   'period',to_char(n.period,'YYYY-MM'),'paidAmount',d.paid_amount,'remainingBalance',d.balance,
   'lastReceiptReference',last_receipt,'lastPaidAt',last_paid,'confirmedPeriodPayments',paid_total)
 );
end $$;
revoke all on function private.aqari_payment_thanks_dispatch_payload(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_operational_dispatch_payload(w uuid,nid uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
 n private.aqari_notification_deliveries%rowtype;
 recipient text; vars jsonb; purpose_value text; template_value text;
 manager_email text; plan private.aqari_maintenance_plans%rowtype; lease_row public.aqari_leases%rowtype;
 unit_row public.aqari_units%rowtype; property_row public.aqari_properties%rowtype; tenant_row public.aqari_tenants%rowtype;
 vendor_contract private.aqari_vendor_contracts%rowtype; vendor_row private.aqari_vendors%rowtype; cheque_row private.aqari_cheques%rowtype;
 escalation private.aqari_maintenance_sla_escalations%rowtype; task_row private.aqari_property_maintenance_tasks%rowtype;
begin
 select * into n from private.aqari_notification_deliveries x where x.workspace_id=w and x.id=nid;
 if not found or n.status in('cancelled','delivered','read') then return null;end if;
 if n.kind not in('maintenance_due','maintenance_sla_escalation','lease_expiry','vendor_contract_expiry','cheque_returned') then return null;end if;
 purpose_value:=n.kind;template_value:=n.kind;

 if n.kind='cheque_returned' then
  begin select * into cheque_row from private.aqari_cheques c where c.workspace_id=w and c.id=n.aggregate_id::uuid;exception when invalid_text_representation then return null;end;
  if cheque_row.id is null then return null;end if;
  select * into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=cheque_row.lease_id;
  select * into unit_row from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  select * into property_row from public.aqari_properties p where p.workspace_id=w and p.id=unit_row.property_id;
  select * into tenant_row from public.aqari_tenants t where t.workspace_id=w and t.id=lease_row.tenant_id;
  if tenant_row.id is null or tenant_row.id<>n.recipient_id or not private.aqari_contact_channel_allowed(tenant_row.profile,n.channel) then return null;end if;
  recipient:=case n.channel when 'email' then nullif(btrim(tenant_row.email),'') when 'whatsapp' then nullif(btrim(tenant_row.phone),'') else null end;
  if recipient is null then return null;end if;
  vars:=jsonb_build_object('tenantName',tenant_row.full_name,'propertyName',property_row.name,'unitNo',unit_row.unit_no,'contractNo',lease_row.contract_no,
   'chequeNo',cheque_row.cheque_no,'bankName',cheque_row.bank_name,'amount',cheque_row.amount,'dueOn',cheque_row.due_on,'state',cheque_row.state);
  return jsonb_build_object('channel',n.channel,'recipientReference',recipient,'template',template_value,'purpose',purpose_value,'variables',vars);
 end if;

 if n.channel='email' then select email into manager_email from auth.users where id=n.recipient_id;recipient:=nullif(btrim(manager_email),'');
 elsif n.channel='push' then recipient:=n.recipient_id::text;
 else return null;end if;
 if recipient is null then return null;end if;

 if n.kind='maintenance_due' then
  begin select * into plan from private.aqari_maintenance_plans x where x.workspace_id=w and x.id=n.aggregate_id::uuid;exception when invalid_text_representation then return null;end;
  if plan.id is null or not plan.is_active then return null;end if;
  select * into property_row from public.aqari_properties p where p.workspace_id=w and p.id=plan.property_id;
  vars:=jsonb_build_object('propertyName',property_row.name,'title',plan.title,'assetKind',plan.asset_kind,'nextDueOn',plan.next_due_on,'frequencyDays',plan.frequency_days);
 elsif n.kind='maintenance_sla_escalation' then
  select * into escalation from private.aqari_maintenance_sla_escalations e where e.workspace_id=w and e.notification_id=n.id order by e.prepared_at desc limit 1;
  if escalation.id is null then return null;end if;
  select * into task_row from private.aqari_property_maintenance_tasks t where t.workspace_id=w and t.id=escalation.task_id;
  select * into property_row from public.aqari_properties p where p.workspace_id=w and p.id=escalation.property_id;
  vars:=jsonb_build_object('propertyName',property_row.name,'taskNo',task_row.task_no,'stage',escalation.stage,'thresholdMinutes',escalation.threshold_minutes,'breachedAt',escalation.breached_at,'taskStatus',task_row.status);
 elsif n.kind='lease_expiry' then
  begin select * into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=n.aggregate_id::uuid;exception when invalid_text_representation then return null;end;
  if lease_row.id is null or lease_row.status<>'signed' then return null;end if;
  select * into unit_row from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  select * into property_row from public.aqari_properties p where p.workspace_id=w and p.id=unit_row.property_id;
  select * into tenant_row from public.aqari_tenants t where t.workspace_id=w and t.id=lease_row.tenant_id;
  vars:=jsonb_build_object('propertyName',property_row.name,'unitNo',unit_row.unit_no,'tenantName',tenant_row.full_name,'contractNo',lease_row.contract_no,'endsOn',lease_row.end_date,'daysRemaining',lease_row.end_date-current_date);
 elsif n.kind='vendor_contract_expiry' then
  begin select * into vendor_contract from private.aqari_vendor_contracts c where c.workspace_id=w and c.id=n.aggregate_id::uuid;exception when invalid_text_representation then return null;end;
  if vendor_contract.id is null or vendor_contract.status not in('approved','active') then return null;end if;
  select * into vendor_row from private.aqari_vendors v where v.workspace_id=w and v.id=vendor_contract.vendor_id;
  if vendor_contract.property_id is not null then select * into property_row from public.aqari_properties p where p.workspace_id=w and p.id=vendor_contract.property_id;end if;
  vars:=jsonb_build_object('propertyName',coalesce(property_row.name,''),'vendorName',vendor_row.name,'contractNo',vendor_contract.contract_no,'serviceKind',vendor_contract.service_kind,'endsOn',vendor_contract.ends_on,'daysRemaining',vendor_contract.ends_on-current_date);
 end if;
 return jsonb_build_object('channel',n.channel,'recipientReference',recipient,'template',template_value,'purpose',purpose_value,'variables',coalesce(vars,'{}'::jsonb));
end $$;
revoke all on function private.aqari_operational_dispatch_payload(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_notification_dispatch_completion_bridge(p_limit integer default 100)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 q public.aqari_notification_outbox%rowtype;n private.aqari_notification_deliveries%rowtype;c private.aqari_integration_configs%rowtype;
 payload jsonb;purpose_value text;bridged_thanks integer:=0;bridged_operational integer:=0;cancelled_count integer:=0;waiting integer:=0;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>500 then raise invalid_parameter_value using message='INVALID_COMPLETION_BRIDGE_LIMIT';end if;

 for q in select * from public.aqari_notification_outbox x where x.kind='payment_thanks' and x.status in('awaiting_configuration','queued','failed') and x.scheduled_at<=now() order by x.scheduled_at,x.id for update skip locked limit p_limit loop
  payload:=private.aqari_payment_thanks_dispatch_payload(q.workspace_id,q.id);
  if payload is null then update public.aqari_notification_outbox set status='cancelled' where id=q.id;cancelled_count:=cancelled_count+1;continue;end if;
  purpose_value:=payload->>'purpose';
  select * into c from private.aqari_integration_configs x where x.workspace_id=q.workspace_id and x.provider=payload->>'channel' and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
  if not found then update public.aqari_notification_outbox set status='awaiting_configuration' where id=q.id;waiting:=waiting+1;continue;end if;
  insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
  values(gen_random_uuid(),q.workspace_id,'notification.payment_thanks',q.id::text,1,payload,'notification:'||q.id::text,'pending',0,greatest(q.scheduled_at,now()))
  on conflict(workspace_id,idempotency_key) do nothing;
  if exists(select 1 from private.aqari_integration_outbox o where o.workspace_id=q.workspace_id and o.idempotency_key='notification:'||q.id::text and o.status='sent') then update public.aqari_notification_outbox set status='sent' where id=q.id;
  elsif exists(select 1 from private.aqari_integration_outbox o where o.workspace_id=q.workspace_id and o.idempotency_key='notification:'||q.id::text and o.status='dead_letter') then update public.aqari_notification_outbox set status='failed' where id=q.id;
  else update public.aqari_notification_outbox set status='queued' where id=q.id;end if;
  bridged_thanks:=bridged_thanks+1;
 end loop;

 for n in select * from private.aqari_notification_deliveries x where x.kind in('maintenance_due','maintenance_sla_escalation','lease_expiry','vendor_contract_expiry','cheque_returned') and x.status in('queued','failed') and x.scheduled_for<=now() order by x.scheduled_for,x.id for update skip locked limit p_limit loop
  payload:=private.aqari_operational_dispatch_payload(n.workspace_id,n.id);
  if payload is null then update private.aqari_notification_deliveries set status='cancelled',last_error='SOURCE_NOT_DELIVERABLE' where id=n.id;cancelled_count:=cancelled_count+1;continue;end if;
  purpose_value:=payload->>'purpose';
  select * into c from private.aqari_integration_configs x where x.workspace_id=n.workspace_id and x.provider=payload->>'channel' and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
  if not found then waiting:=waiting+1;continue;end if;
  insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
  values(gen_random_uuid(),n.workspace_id,'notification.operational',n.id::text,1,payload,'operational:'||n.id::text,'pending',0,greatest(n.scheduled_for,now()))
  on conflict(workspace_id,idempotency_key) do nothing;
  if exists(select 1 from private.aqari_integration_outbox o where o.workspace_id=n.workspace_id and o.idempotency_key='operational:'||n.id::text and o.status='sent') then update private.aqari_notification_deliveries set status='delivered',provider_reference=(select provider_reference from private.aqari_integration_outbox o where o.workspace_id=n.workspace_id and o.idempotency_key='operational:'||n.id::text),delivered_at=coalesce(delivered_at,now()) where id=n.id;
  elsif exists(select 1 from private.aqari_integration_outbox o where o.workspace_id=n.workspace_id and o.idempotency_key='operational:'||n.id::text and o.status='dead_letter') then update private.aqari_notification_deliveries set status='failed',last_error='PROVIDER_DELIVERY_FAILED' where id=n.id;
  else update private.aqari_notification_deliveries set status='queued' where id=n.id;end if;
  bridged_operational:=bridged_operational+1;
 end loop;
 return jsonb_build_object('paymentThanks',bridged_thanks,'operational',bridged_operational,'cancelled',cancelled_count,'awaitingConfiguration',waiting);
end $$;
revoke all on function public.aqari_notification_dispatch_completion_bridge(integer) from public,anon,authenticated;
grant execute on function public.aqari_notification_dispatch_completion_bridge(integer) to service_role;

create or replace function public.aqari_integration_dispatch_completion_claim(p_limit integer default 5)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare
 r private.aqari_integration_outbox%rowtype;c private.aqari_integration_configs%rowtype;payload jsonb;source_id uuid;items jsonb:='[]'::jsonb;claimed integer:=0;purpose_value text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>20 then raise invalid_parameter_value using message='INVALID_DISPATCH_LIMIT';end if;
 update private.aqari_integration_outbox set status='failed',last_error='DELIVERY_LEASE_EXPIRED',available_at=now() where event_type in('notification.payment_thanks','notification.operational') and status='sending' and available_at<=now() and delivered_at is null and attempts<20;
 update private.aqari_integration_outbox set status='dead_letter',last_error='DELIVERY_ATTEMPTS_EXHAUSTED' where event_type in('notification.payment_thanks','notification.operational') and status in('sending','failed') and attempts>=20 and delivered_at is null;
 for r in select * from private.aqari_integration_outbox o where o.event_type in('notification.payment_thanks','notification.operational') and o.status in('pending','failed') and o.available_at<=now() and o.attempts<20 order by o.available_at,o.created_at,o.id for update skip locked limit p_limit loop
  begin source_id:=r.aggregate_id::uuid;exception when invalid_text_representation then update private.aqari_integration_outbox set status='dead_letter',last_error='SOURCE_ID_INVALID' where id=r.id;continue;end;
  if r.event_type='notification.payment_thanks' then
   payload:=private.aqari_payment_thanks_dispatch_payload(r.workspace_id,source_id);
   if payload is null then update public.aqari_notification_outbox set status='cancelled' where workspace_id=r.workspace_id and id=source_id and status<>'sent';update private.aqari_integration_outbox set status='dead_letter',last_error='PAYMENT_THANKS_NOT_DELIVERABLE' where id=r.id;continue;end if;
  else
   payload:=private.aqari_operational_dispatch_payload(r.workspace_id,source_id);
   if payload is null then update private.aqari_notification_deliveries set status='cancelled',last_error='SOURCE_NOT_DELIVERABLE' where workspace_id=r.workspace_id and id=source_id and status not in('delivered','read');update private.aqari_integration_outbox set status='dead_letter',last_error='OPERATIONAL_NOTIFICATION_NOT_DELIVERABLE' where id=r.id;continue;end if;
  end if;
  purpose_value:=payload->>'purpose';
  select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=payload->>'channel' and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;
  if not found then
   update private.aqari_integration_outbox set status='failed',last_error='PROVIDER_CONFIGURATION_MISSING',available_at=now()+interval '15 minutes' where id=r.id;
   if r.event_type='notification.payment_thanks' then update public.aqari_notification_outbox set status='awaiting_configuration' where workspace_id=r.workspace_id and id=source_id;
   else update private.aqari_notification_deliveries set status='queued',last_error='PROVIDER_CONFIGURATION_MISSING' where workspace_id=r.workspace_id and id=source_id;end if;
   continue;
  end if;
  update private.aqari_integration_outbox set payload=payload,status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes',last_error=null where id=r.id;
  if r.event_type='notification.payment_thanks' then update public.aqari_notification_outbox set status='sending' where workspace_id=r.workspace_id and id=source_id;
  else update private.aqari_notification_deliveries set status='sending',attempts=attempts+1,last_error=null where workspace_id=r.workspace_id and id=source_id;end if;
  claimed:=claimed+1;
  items:=items||jsonb_build_array(jsonb_build_object('eventId',r.id,'workspaceId',r.workspace_id,'eventType',r.event_type,'idempotencyKey',r.idempotency_key,'attempt',r.attempts+1,'provider',c.provider,'mode',c.mode,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'channel',payload->>'channel','recipientReference',payload->>'recipientReference','template',payload->>'template','variables',payload->'variables','locale','ar'));
 end loop;
 return items;
end $$;
revoke all on function public.aqari_integration_dispatch_completion_claim(integer) from public,anon,authenticated;
grant execute on function public.aqari_integration_dispatch_completion_claim(integer) to service_role;

create or replace function public.aqari_integration_dispatch_completion_result(p_event_id uuid,p_ok boolean,p_retryable boolean default true,p_provider_reference text default null,p_error text default null)
returns jsonb
language plpgsql volatile security definer set search_path=''
as $$
declare r private.aqari_integration_outbox%rowtype;next_status text;err text;ref text;delay_minutes integer;source_id uuid;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into r from private.aqari_integration_outbox where id=p_event_id for update;if not found then raise no_data_found using message='OUTBOX_EVENT_NOT_FOUND';end if;
 if r.event_type not in('notification.payment_thanks','notification.operational') then raise invalid_parameter_value using message='COMPLETION_EVENT_REQUIRED';end if;
 if r.status='sent' then return jsonb_build_object('id',r.id,'status',r.status,'attempts',r.attempts,'replayed',true);end if;
 if r.status<>'sending' then raise serialization_failure using message='OUTBOX_EVENT_NOT_CLAIMED';end if;
 begin source_id:=r.aggregate_id::uuid;exception when invalid_text_representation then raise check_violation using message='SOURCE_ID_INVALID';end;
 ref:=nullif(left(regexp_replace(coalesce(p_provider_reference,''),'[[:cntrl:]]','','g'),300),'');err:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),1000),'');
 if p_ok then
  next_status:='sent';update private.aqari_integration_outbox set status='sent',provider_reference=ref,last_error=null,delivered_at=now(),available_at=now() where id=r.id;
  insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,'sent',ref,null);
 else
  if coalesce(p_retryable,true) and r.attempts<20 then next_status:='failed';else next_status:='dead_letter';end if;
  delay_minutes:=least(60,greatest(1,power(2,least(r.attempts,6)-1)::integer));
  update private.aqari_integration_outbox set status=next_status,last_error=coalesce(err,'PROVIDER_DELIVERY_FAILED'),available_at=case when next_status='failed' then now()+make_interval(mins=>delay_minutes) else now() end where id=r.id;
  insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference,error_code) values(r.workspace_id,r.id,r.attempts,next_status,ref,coalesce(err,'PROVIDER_DELIVERY_FAILED'));
 end if;
 if r.event_type='notification.payment_thanks' then
  update public.aqari_notification_outbox set status=case when next_status='sent' then 'sent' else 'failed' end where workspace_id=r.workspace_id and id=source_id and status<>'cancelled';
 else
  update private.aqari_notification_deliveries set status=case when next_status='sent' then 'delivered' else 'failed' end,provider_reference=case when next_status='sent' then ref else provider_reference end,last_error=case when next_status='sent' then null else coalesce(err,'PROVIDER_DELIVERY_FAILED') end,delivered_at=case when next_status='sent' then now() else delivered_at end where workspace_id=r.workspace_id and id=source_id and status not in('cancelled','read');
 end if;
 return jsonb_build_object('id',r.id,'status',next_status,'attempts',r.attempts,'replayed',false);
end $$;
revoke all on function public.aqari_integration_dispatch_completion_result(uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.aqari_integration_dispatch_completion_result(uuid,boolean,boolean,text,text) to service_role;

commit;