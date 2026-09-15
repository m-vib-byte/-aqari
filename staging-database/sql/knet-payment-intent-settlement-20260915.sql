-- AQARI V267 Preview/Staging: provider-neutral KNET payment intents and atomic settlement.
-- A real provider adapter must map its native protocol into the canonical AQARI request/webhook contract.
begin;

alter table private.aqari_rent_receipt_serial_reservations alter column reserved_by drop not null;
alter table private.aqari_rent_receipt_serial_reservations add column if not exists reservation_actor_kind text not null default 'user';
do $guard$ begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_rent_receipt_serial_reservations'::regclass and conname='aqari_receipt_reservation_actor_check') then
  alter table private.aqari_rent_receipt_serial_reservations add constraint aqari_receipt_reservation_actor_check
   check((reservation_actor_kind='user' and reserved_by is not null) or (reservation_actor_kind='system' and reserved_by is null));
 end if;
end $guard$;

create table if not exists private.aqari_knet_payment_intents(
 id uuid primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null,
 period date not null check(period=date_trunc('month',period)::date),
 amount numeric(18,3) not null check(amount>0 and amount=round(amount,3)),
 currency text not null default 'KWD' check(currency='KWD'),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9:_-]{8,200}$'),
 status text not null default 'pending' check(status in('awaiting_configuration','pending','link_ready','paid','failed','expired','cancelled')),
 expires_at timestamptz not null,
 provider_reference text,
 payment_url text,
 payment_id uuid references public.aqari_rent_payments(id),
 receipt_no text references private.aqari_rent_receipt_serial_reservations(receipt_no),
 contract_sequence integer,
 webhook_receipt_id uuid,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,webhook_receipt_id) references private.aqari_webhook_receipts(workspace_id,id),
 unique(workspace_id,idempotency_key),
 check((receipt_no is null and contract_sequence is null) or (receipt_no is not null and contract_sequence>0)),
 check(payment_url is null or (length(payment_url) between 9 and 2048 and payment_url like 'https://%' and payment_url !~ '[[:space:][:cntrl:]]')),
 check(provider_reference is null or (length(provider_reference) between 1 and 300 and provider_reference !~ '[[:cntrl:]]'))
);
create unique index if not exists aqari_knet_intent_payment_uq on private.aqari_knet_payment_intents(workspace_id,payment_id) where payment_id is not null;
create unique index if not exists aqari_knet_intent_provider_uq on private.aqari_knet_payment_intents(workspace_id,provider_reference) where provider_reference is not null;
create index if not exists aqari_knet_intent_scope on private.aqari_knet_payment_intents(workspace_id,lease_id,period,status,created_at desc);
alter table private.aqari_knet_payment_intents enable row level security;
revoke all on private.aqari_knet_payment_intents from public,anon,authenticated,service_role;

drop trigger if exists aqari_knet_intent_no_delete on private.aqari_knet_payment_intents;
create trigger aqari_knet_intent_no_delete before delete on private.aqari_knet_payment_intents for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_knet_payment_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 intent_id uuid not null references private.aqari_knet_payment_intents(id),
 action text not null check(action in('create','link_ready','link_failed','webhook_paid','webhook_replay','cancel','expire')),
 actor_kind text not null check(actor_kind in('authenticated','system')),
 actor_id uuid,
 reason text not null check(length(btrim(reason)) between 1 and 1000),
 details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'),
 created_at timestamptz not null default now()
);
create index if not exists aqari_knet_payment_events_scope on private.aqari_knet_payment_events(workspace_id,intent_id,id desc);
alter table private.aqari_knet_payment_events enable row level security;
revoke all on private.aqari_knet_payment_events from public,anon,authenticated,service_role;
drop trigger if exists aqari_knet_payment_events_immutable on private.aqari_knet_payment_events;
create trigger aqari_knet_payment_events_immutable before update or delete on private.aqari_knet_payment_events for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_webhook_processing_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 webhook_receipt_id uuid not null,
 provider text not null,
 outcome text not null check(outcome in('processed','replayed','rejected')),
 entity_type text not null,
 entity_id text,
 reason text not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,webhook_receipt_id) references private.aqari_webhook_receipts(workspace_id,id)
);
create index if not exists aqari_webhook_processing_scope on private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,id desc);
alter table private.aqari_webhook_processing_events enable row level security;
revoke all on private.aqari_webhook_processing_events from public,anon,authenticated,service_role;
drop trigger if exists aqari_webhook_processing_immutable on private.aqari_webhook_processing_events;
create trigger aqari_webhook_processing_immutable before update or delete on private.aqari_webhook_processing_events for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_knet_intent_snapshot(r private.aqari_knet_payment_intents)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object(
  'id',r.id,'workspace_id',r.workspace_id,'lease_id',r.lease_id,'period',r.period,'amount',r.amount,'currency',r.currency,
  'idempotencyKey',r.idempotency_key,'status',r.status,'expiresAt',r.expires_at,'paymentUrl',r.payment_url,
  'providerReference',r.provider_reference,'paymentId',r.payment_id,'receiptNo',r.receipt_no,'contractReceiptSequence',r.contract_sequence,
  'createdAt',r.created_at,'updatedAt',r.updated_at
 ))
$$;
revoke all on function private.aqari_knet_intent_snapshot(private.aqari_knet_payment_intents) from public,anon,authenticated,service_role;

create or replace function public.aqari_knet_payment_intent(p_workspace_id uuid,p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);ident uuid;lid uuid;mon date;amount_value numeric;expires timestamptz;idem text;
 l public.aqari_leases%rowtype;property_ref uuid;due private.aqari_rent_due_periods%rowtype;existing private.aqari_knet_payment_intents%rowtype;initial_status text;
begin
 if auth.uid() is null or jsonb_typeof(d)<>'object' or not private.aqari_can(w,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='get' then
  begin ident:=(d->>'id')::uuid;exception when others then raise invalid_parameter_value using message='KNET_INTENT_ID_REQUIRED';end;
  select * into existing from private.aqari_knet_payment_intents x where x.workspace_id=w and x.id=ident;
  if not found then raise no_data_found using message='KNET_INTENT_NOT_FOUND';end if;
  select u.property_id into property_ref from public.aqari_leases z join public.aqari_units u on u.workspace_id=z.workspace_id and u.id=z.unit_id where z.workspace_id=w and z.id=existing.lease_id;
  if property_ref is null or not private.aqari_can_property(w,property_ref,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return private.aqari_knet_intent_snapshot(existing)||jsonb_build_object('user_id',auth.uid());
 end if;
 if p_action<>'create' or not private.aqari_can(w,'collections','write') then raise insufficient_privilege using message='KNET_INTENT_WRITE_DENIED';end if;
 if exists(select 1 from jsonb_object_keys(d) k where k not in('id','idempotencyKey','leaseId','period','amount','expiresAt')) then raise invalid_parameter_value using message='INVALID_KNET_INTENT_FIELDS';end if;
 begin ident:=(d->>'id')::uuid;lid:=(d->>'leaseId')::uuid;mon:=(d->>'period')::date;amount_value:=(d->>'amount')::numeric;expires:=(d->>'expiresAt')::timestamptz;exception when others then raise invalid_parameter_value using message='INVALID_KNET_INTENT_FIELDS';end;
 idem:=btrim(coalesce(d->>'idempotencyKey',''));
 if ident is null or lid is null or mon<>date_trunc('month',mon)::date or amount_value<=0 or amount_value<>round(amount_value,3) or idem!~'^[A-Za-z0-9:_-]{8,200}$' or expires<=now() or expires>now()+interval '24 hours' then raise invalid_parameter_value using message='INVALID_KNET_INTENT_FIELDS';end if;
 select * into l from public.aqari_leases x where x.workspace_id=w and x.id=lid and x.status='signed';if not found then raise check_violation using message='SIGNED_LEASE_REQUIRED';end if;
 select u.property_id into property_ref from public.aqari_units u where u.workspace_id=w and u.id=l.unit_id;
 if property_ref is null or not private.aqari_can_property(w,property_ref,'properties','read') then raise insufficient_privilege using message='KNET_PROPERTY_ACCESS_DENIED';end if;
 perform private.aqari_refresh_rent_due_schedule(w,lid);
 select * into due from private.aqari_rent_due_periods x where x.workspace_id=w and x.lease_id=lid and x.period=mon;
 if not found or due.balance<=0 or amount_value>due.balance then raise check_violation using message='KNET_AMOUNT_EXCEEDS_CURRENT_BALANCE';end if;
 select * into existing from private.aqari_knet_payment_intents x where x.workspace_id=w and x.idempotency_key=idem for update;
 if found then
  if existing.id<>ident or existing.lease_id<>lid or existing.period<>mon or existing.amount<>amount_value or existing.expires_at<>expires then raise unique_violation using message='KNET_IDEMPOTENCY_CONFLICT';end if;
  return private.aqari_knet_intent_snapshot(existing)||jsonb_build_object('user_id',auth.uid(),'replayed',true);
 end if;
 initial_status:=case when exists(select 1 from private.aqari_integration_configs c where c.workspace_id=w and c.provider='knet' and c.purpose in('rent_payment','payments','default') and c.mode in('sandbox','live') and c.endpoint_origin is not null and c.secret_reference is not null) then 'pending' else 'awaiting_configuration' end;
 insert into private.aqari_knet_payment_intents(id,workspace_id,lease_id,period,amount,idempotency_key,status,expires_at,created_by) values(ident,w,lid,mon,amount_value,idem,initial_status,expires,auth.uid()) returning * into existing;
 insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,actor_id,reason,details) values(w,ident,'create','authenticated',auth.uid(),'إنشاء رابط دفع KNET',jsonb_build_object('leaseId',lid,'period',mon,'amount',amount_value,'expiresAt',expires));
 insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key,status,attempts,available_at)
 values(extensions.gen_random_uuid(),w,'knet.payment_link',ident::text,1,jsonb_build_object('intentId',ident),'knet-link:'||ident::text,'pending',0,now()) on conflict(workspace_id,idempotency_key) do nothing;
 return private.aqari_knet_intent_snapshot(existing)||jsonb_build_object('user_id',auth.uid(),'replayed',false);
end $$;
revoke all on function public.aqari_knet_payment_intent(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_knet_payment_intent(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_knet_payment_link_claim(p_limit integer default 3)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_integration_outbox%rowtype;i private.aqari_knet_payment_intents%rowtype;c private.aqari_integration_configs%rowtype;l public.aqari_leases%rowtype;due private.aqari_rent_due_periods%rowtype;items jsonb:='[]'::jsonb;claimed integer:=0;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_limit is null or p_limit<1 or p_limit>10 then raise invalid_parameter_value using message='INVALID_KNET_CLAIM_LIMIT';end if;
 update private.aqari_integration_outbox set status='failed',last_error='KNET_LINK_LEASE_EXPIRED',available_at=now() where event_type='knet.payment_link' and status='sending' and available_at<=now() and delivered_at is null and attempts<20;
 for r in select * from private.aqari_integration_outbox o where o.event_type='knet.payment_link' and o.status in('pending','failed') and o.available_at<=now() and o.attempts<20 order by o.available_at,o.created_at,o.id for update skip locked limit p_limit*5 loop
  exit when claimed>=p_limit;
  begin select * into i from private.aqari_knet_payment_intents x where x.workspace_id=r.workspace_id and x.id=r.aggregate_id::uuid for update;exception when invalid_text_representation then i:=null;end;
  if i.id is null then update private.aqari_integration_outbox set status='dead_letter',last_error='KNET_INTENT_NOT_FOUND' where id=r.id;continue;end if;
  if i.status in('paid','cancelled','expired') then update private.aqari_integration_outbox set status='dead_letter',last_error='KNET_INTENT_CLOSED' where id=r.id;continue;end if;
  if i.expires_at<=now() then update private.aqari_knet_payment_intents set status='expired',updated_at=now() where id=i.id;update private.aqari_integration_outbox set status='dead_letter',last_error='KNET_INTENT_EXPIRED' where id=r.id;insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason) values(i.workspace_id,i.id,'expire','system','انتهت صلاحية رابط الدفع قبل إرساله');continue;end if;
  perform private.aqari_refresh_rent_due_schedule(i.workspace_id,i.lease_id);select * into due from private.aqari_rent_due_periods d where d.workspace_id=i.workspace_id and d.lease_id=i.lease_id and d.period=i.period;
  if not found or due.balance<i.amount then update private.aqari_knet_payment_intents set status='cancelled',updated_at=now() where id=i.id;update private.aqari_integration_outbox set status='dead_letter',last_error='KNET_BALANCE_CHANGED' where id=r.id;insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason) values(i.workspace_id,i.id,'cancel','system','تغير الرصيد قبل توليد رابط الدفع');continue;end if;
  select * into l from public.aqari_leases z where z.workspace_id=i.workspace_id and z.id=i.lease_id and z.status='signed';if not found then update private.aqari_integration_outbox set status='dead_letter',last_error='KNET_SIGNED_LEASE_REQUIRED' where id=r.id;continue;end if;
  select * into c from private.aqari_integration_configs x where x.workspace_id=i.workspace_id and x.provider='knet' and x.purpose in('rent_payment','payments','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when 'rent_payment' then 0 when 'payments' then 1 else 2 end,x.updated_at desc limit 1;
  if not found then update private.aqari_knet_payment_intents set status='awaiting_configuration',updated_at=now() where id=i.id;update private.aqari_integration_outbox set status='failed',last_error='KNET_PROVIDER_CONFIGURATION_MISSING',available_at=now()+interval '15 minutes' where id=r.id;continue;end if;
  update private.aqari_knet_payment_intents set status='pending',updated_at=now() where id=i.id;update private.aqari_integration_outbox o set status='sending',attempts=o.attempts+1,available_at=now()+interval '5 minutes',last_error=null where o.id=r.id;
  claimed:=claimed+1;items:=items||jsonb_build_array(jsonb_build_object('eventId',r.id,'workspaceId',i.workspace_id,'eventType','knet.payment_link','intentId',i.id,'idempotencyKey',i.idempotency_key,'leaseId',i.lease_id,'contractNo',l.contract_no,'amount',i.amount,'currency',i.currency,'expiresAt',i.expires_at,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'callbackPath','/api/provider-webhook?workspace='||i.workspace_id::text||'&provider=knet','returnPath','/app?release=V267&knet_intent='||i.id::text));
 end loop;return items;
end $$;
revoke all on function public.aqari_knet_payment_link_claim(integer) from public,anon,authenticated;
grant execute on function public.aqari_knet_payment_link_claim(integer) to service_role;

create or replace function public.aqari_knet_payment_link_result(p_event_id uuid,p_ok boolean,p_retryable boolean default true,p_provider_reference text default null,p_payment_url text default null,p_error text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_integration_outbox%rowtype;i private.aqari_knet_payment_intents%rowtype;next_status text;err text;ref text;url_value text;delay_minutes integer;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into r from private.aqari_integration_outbox where id=p_event_id and event_type='knet.payment_link' for update;if not found then raise no_data_found using message='KNET_LINK_EVENT_NOT_FOUND';end if;
 select * into i from private.aqari_knet_payment_intents where workspace_id=r.workspace_id and id=r.aggregate_id::uuid for update;if not found then raise no_data_found using message='KNET_INTENT_NOT_FOUND';end if;
 if r.status='sent' and i.status='link_ready' then return private.aqari_knet_intent_snapshot(i)||jsonb_build_object('replayed',true);end if;
 if r.status<>'sending' then raise serialization_failure using message='KNET_LINK_EVENT_NOT_CLAIMED';end if;
 ref:=nullif(left(regexp_replace(coalesce(p_provider_reference,''),'[[:cntrl:]]','','g'),300),'');url_value:=nullif(btrim(coalesce(p_payment_url,'')),'');err:=nullif(left(regexp_replace(coalesce(p_error,''),'[[:cntrl:]]','','g'),1000),'');
 if p_ok then
  if ref is null or url_value is null or length(url_value)>2048 or url_value not like 'https://%' or url_value~'[[:space:][:cntrl:]]' then raise check_violation using message='INVALID_KNET_PROVIDER_RESULT';end if;
  update private.aqari_knet_payment_intents set status='link_ready',provider_reference=ref,payment_url=url_value,updated_at=now() where id=i.id returning * into i;
  update private.aqari_integration_outbox set status='sent',provider_reference=ref,last_error=null,delivered_at=now(),available_at=now() where id=r.id;
  insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,provider_reference) values(r.workspace_id,r.id,r.attempts,'sent',ref);
  insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason,details) values(i.workspace_id,i.id,'link_ready','system','تم توليد رابط دفع KNET',jsonb_build_object('providerReference',ref));
 else
  if coalesce(p_retryable,true) and r.attempts<20 then next_status:='failed';else next_status:='dead_letter';end if;delay_minutes:=least(60,greatest(1,power(2,least(r.attempts,6)-1)::integer));
  update private.aqari_integration_outbox set status=next_status,last_error=coalesce(err,'KNET_PROVIDER_LINK_FAILED'),available_at=case when next_status='failed' then now()+make_interval(mins=>delay_minutes) else now() end where id=r.id;
  update private.aqari_knet_payment_intents set status=case when next_status='dead_letter' then 'failed' else 'pending' end,updated_at=now() where id=i.id returning * into i;
  insert into private.aqari_integration_delivery_events(workspace_id,event_id,attempt,outcome,error_code) values(r.workspace_id,r.id,r.attempts,next_status,coalesce(err,'KNET_PROVIDER_LINK_FAILED'));
  insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason,details) values(i.workspace_id,i.id,'link_failed','system',coalesce(err,'فشل توليد رابط دفع KNET'),jsonb_build_object('retryable',coalesce(p_retryable,true)));
 end if;
 return private.aqari_knet_intent_snapshot(i)||jsonb_build_object('replayed',false);
end $$;
revoke all on function public.aqari_knet_payment_link_result(uuid,boolean,boolean,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_knet_payment_link_result(uuid,boolean,boolean,text,text,text) to service_role;

create or replace function private.aqari_system_rent_receipt_serial(w uuid,contract_ref text,operation_ref uuid,p_year integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare row_data private.aqari_rent_receipt_serial_reservations%rowtype;seq bigint;within_contract integer;result_no text;
begin
 if current_setting('role',true) is distinct from 'service_role' or operation_ref is null or btrim(coalesce(contract_ref,''))='' or p_year not between 2000 and 2200 then raise insufficient_privilege using message='SERVER_RECEIPT_SERIAL_DENIED';end if;
 select * into row_data from private.aqari_rent_receipt_serial_reservations r where r.operation_ref=operation_ref;
 if found then if row_data.workspace_id<>w or row_data.contract_ref<>contract_ref then raise check_violation using message='RECEIPT_SERIAL_SCOPE_MISMATCH';end if;return jsonb_build_object('receipt_no',row_data.receipt_no,'contract_sequence',row_data.contract_sequence);end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||':rent-receipt:'||contract_ref,0));
 select coalesce(max(r.contract_sequence),0)+1 into within_contract from private.aqari_rent_receipt_serial_reservations r where r.workspace_id=w and r.contract_ref=contract_ref;
 insert into private.aqari_global_serial_counters(kind,year,last_value) values('rent_receipt',p_year,0) on conflict(kind,year) do nothing;
 update private.aqari_global_serial_counters set last_value=last_value+1 where kind='rent_receipt' and year=p_year returning last_value into seq;
 if seq is null then raise exception 'RECEIPT_SERIAL_UNAVAILABLE';end if;result_no:='AQ-R-'||p_year::text||'-'||lpad(seq::text,8,'0');
 insert into private.aqari_rent_receipt_serial_reservations(receipt_no,workspace_id,contract_ref,operation_ref,year,global_serial,contract_sequence,reserved_by,reservation_actor_kind) values(result_no,w,contract_ref,operation_ref,p_year,seq,within_contract,null,'system') returning * into row_data;
 return jsonb_build_object('receipt_no',row_data.receipt_no,'contract_sequence',row_data.contract_sequence);
end $$;
revoke all on function private.aqari_system_rent_receipt_serial(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.aqari_system_rent_receipt_serial(uuid,text,uuid,integer) to service_role;

create or replace function public.aqari_process_knet_webhook(p_receipt_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 wr private.aqari_webhook_receipts%rowtype;i private.aqari_knet_payment_intents%rowtype;l public.aqari_leases%rowtype;u public.aqari_units%rowtype;p public.aqari_properties%rowtype;t public.aqari_tenants%rowtype;due private.aqari_rent_due_periods%rowtype;
 payload jsonb;provider_ref text;account_ref text;status_value text;event_value text;currency_value text;amount_value numeric;occurred timestamptz;paid_day date;serial jsonb;receipt_no text;contract_sequence integer;payment_id uuid;method_value text:='KNET';status_label text;period_text text;row_value jsonb;ledger jsonb;receipt_value jsonb;contract_value jsonb;breakdown jsonb;balance_after numeric;channel text;existing public.aqari_rent_payments%rowtype;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 select * into wr from private.aqari_webhook_receipts x where x.id=p_receipt_id for update;if not found or wr.provider<>'knet' then raise no_data_found using message='KNET_WEBHOOK_NOT_FOUND';end if;
 payload:=wr.normalized_payload;provider_ref=btrim(coalesce(payload->>'payment_reference',''));account_ref=btrim(coalesce(payload->>'account_reference',''));status_value=lower(btrim(coalesce(payload->>'provider_status','')));event_value=lower(btrim(coalesce(wr.event_type,'')));currency_value=upper(btrim(coalesce(payload->>'currency','')));
 if event_value<>'payment.succeeded' or status_value<>'succeeded' or provider_ref='' or account_ref='' or currency_value<>'KWD' or coalesce(payload->>'amount','')!~'^[0-9]{1,14}(\.[0-9]{1,3})?$' then insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,reason) values(wr.workspace_id,wr.id,'knet','rejected','knet_payment_intent','KNET_WEBHOOK_CANONICAL_FIELDS_INVALID');return jsonb_build_object('processed',false,'reason','KNET_WEBHOOK_CANONICAL_FIELDS_INVALID');end if;
 amount_value:=(payload->>'amount')::numeric;begin occurred:=(payload->>'occurred_at')::timestamptz;exception when others then occurred:=null;end;
 if amount_value<=0 or amount_value<>round(amount_value,3) or occurred is null or occurred>now()+interval '5 minutes' then insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,reason) values(wr.workspace_id,wr.id,'knet','rejected','knet_payment_intent','KNET_WEBHOOK_VALUE_INVALID');return jsonb_build_object('processed',false,'reason','KNET_WEBHOOK_VALUE_INVALID');end if;
 select * into i from private.aqari_knet_payment_intents x where x.workspace_id=wr.workspace_id and x.idempotency_key=account_ref for update;
 if not found then insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,reason) values(wr.workspace_id,wr.id,'knet','rejected','knet_payment_intent','KNET_INTENT_NOT_FOUND');return jsonb_build_object('processed',false,'reason','KNET_INTENT_NOT_FOUND');end if;
 if i.status='paid' then
  if i.provider_reference=provider_ref and i.amount=amount_value and i.currency=currency_value and i.payment_id is not null then insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason) values(wr.workspace_id,wr.id,'knet','replayed','knet_payment_intent',i.id::text,'KNET_PAYMENT_ALREADY_POSTED');insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason,details) values(i.workspace_id,i.id,'webhook_replay','system','إعادة Webhook لنفس دفعة KNET',jsonb_build_object('providerReference',provider_ref));return private.aqari_knet_intent_snapshot(i)||jsonb_build_object('processed',true,'replayed',true);end if;
  raise unique_violation using message='KNET_PAID_INTENT_CONFLICT';
 end if;
 if i.status<>'link_ready' or i.expires_at<occurred or i.provider_reference is distinct from provider_ref or i.amount<>amount_value or i.currency<>currency_value then insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason) values(wr.workspace_id,wr.id,'knet','rejected','knet_payment_intent',i.id::text,'KNET_INTENT_WEBHOOK_MISMATCH');return jsonb_build_object('processed',false,'reason','KNET_INTENT_WEBHOOK_MISMATCH');end if;
 select * into l from public.aqari_leases x where x.workspace_id=i.workspace_id and x.id=i.lease_id and x.status='signed' for update;if not found then raise check_violation using message='SIGNED_LEASE_REQUIRED';end if;
 select * into u from public.aqari_units x where x.workspace_id=l.workspace_id and x.id=l.unit_id;select * into p from public.aqari_properties x where x.workspace_id=u.workspace_id and x.id=u.property_id;select * into t from public.aqari_tenants x where x.workspace_id=l.workspace_id and x.id=l.tenant_id;if u.id is null or p.id is null or t.id is null then raise check_violation using message='KNET_PAYMENT_SCOPE_MISSING';end if;
 perform private.aqari_refresh_rent_due_schedule(i.workspace_id,i.lease_id);select * into due from private.aqari_rent_due_periods x where x.workspace_id=i.workspace_id and x.lease_id=i.lease_id and x.period=i.period;
 if not found or due.balance<i.amount then raise check_violation using message='KNET_BALANCE_CHANGED_BEFORE_SETTLEMENT';end if;
 paid_day:=(occurred at time zone 'Asia/Kuwait')::date;period_text:=to_char(i.period,'YYYY-MM');status_label:=case when due.balance=i.amount then 'مدفوع' else 'جزئي' end;
 serial:=private.aqari_system_rent_receipt_serial(i.workspace_id,l.external_ref,i.id,extract(year from paid_day)::integer);receipt_no:=serial->>'receipt_no';contract_sequence:=(serial->>'contract_sequence')::integer;
 payment_id:=md5(i.workspace_id::text||':knet-payment:'||i.id::text)::uuid;contract_value:=l.snapshot||jsonb_build_object('id',l.external_ref,'contract_no',l.contract_no,'status','signed','tenant',t.full_name,'property',p.name,'unit',u.unit_no,'start_date',l.start_date,'end_date',l.end_date);
 row_value:=jsonb_build_array(receipt_no,t.full_name,i.amount,status_label,p.name,paid_day,u.unit_no,'دفع إلكتروني KNET مؤكد عبر Webhook',period_text,method_value);
 ledger:=jsonb_build_object('id','rent-'||receipt_no,'receiptNo',receipt_no,'property',p.name,'unit',u.unit_no,'tenant',t.full_name,'contractId',l.external_ref,'contractNo',l.contract_no,'contractReceiptSequence',contract_sequence,'period',period_text,'due',due.due_amount,'paid',i.amount,'balance',due.balance-i.amount,'paidAt',paid_day,'method',method_value,'transactionNo',provider_ref,'knetTransactionNo',provider_ref,'accountant','النظام / KNET','status',status_label,'note','دفع إلكتروني KNET مؤكد','source','knet-webhook','knetIntentId',i.id);
 breakdown:=case when jsonb_typeof(contract_value->'rentEntitlement')='object' then private.aqari_rent_period_breakdown(contract_value,period_text) else null end;
 receipt_value:=jsonb_strip_nulls(jsonb_build_object('id',receipt_no,'contractReceiptSequence',contract_sequence,'template','rent-voucher-v267-1','record',row_value,'contract',contract_value,'tenantId',t.id,'tenantNameEn',coalesce(t.profile->>'nameEn',''),'brand',jsonb_build_object('ar',p.name,'en','AQARI PROPERTY','website','myaqari.com'),'detailsVersion',2,'accountant','النظام / KNET','transactionNo',provider_ref,'rentPeriodBreakdown',breakdown));
 select * into existing from public.aqari_rent_payments x where x.id=payment_id;if found then raise unique_violation using message='KNET_PAYMENT_ID_CONFLICT';end if;
 insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values(payment_id,i.workspace_id,i.lease_id,receipt_no,i.amount,i.period,paid_day,status_label,method_value,ledger,receipt_value);
 update private.aqari_rent_receipt_serial_reservations set consumed_at=now() where receipt_no=receipt_no and operation_ref=i.id;
 perform private.aqari_refresh_rent_due_schedule(i.workspace_id,i.lease_id);select balance into balance_after from private.aqari_rent_due_periods x where x.workspace_id=i.workspace_id and x.lease_id=i.lease_id and x.period=i.period;
 if balance_after=0 then channel:=private.aqari_preferred_delivery_channel(private.aqari_effective_contact_profile(i.workspace_id,t.id,t.profile),t.email,t.phone);if channel is not null then insert into public.aqari_notification_outbox(workspace_id,lease_id,period,kind,channel,idempotency_key) values(i.workspace_id,i.lease_id,i.period,'payment_thanks',channel,'thanks:'||i.lease_id::text||':'||period_text) on conflict(workspace_id,idempotency_key) do nothing;end if;end if;
 update private.aqari_knet_payment_intents set status='paid',payment_id=payment_id,receipt_no=receipt_no,contract_sequence=contract_sequence,webhook_receipt_id=wr.id,updated_at=now() where id=i.id returning * into i;
 insert into private.aqari_knet_payment_events(workspace_id,intent_id,action,actor_kind,reason,details) values(i.workspace_id,i.id,'webhook_paid','system','ترحيل دفعة KNET مؤكدة',jsonb_build_object('providerReference',provider_ref,'paymentId',payment_id,'receiptNo',receipt_no,'period',i.period,'amount',i.amount));
 insert into private.aqari_webhook_processing_events(workspace_id,webhook_receipt_id,provider,outcome,entity_type,entity_id,reason) values(wr.workspace_id,wr.id,'knet','processed','knet_payment_intent',i.id::text,'KNET_PAYMENT_POSTED');
 return private.aqari_knet_intent_snapshot(i)||jsonb_build_object('processed',true,'replayed',false,'remainingBalance',balance_after);
end $$;
revoke all on function public.aqari_process_knet_webhook(uuid) from public,anon,authenticated;
grant execute on function public.aqari_process_knet_webhook(uuid) to service_role;

create or replace function public.aqari_record_verified_webhook(p_workspace_id uuid,p_receipt jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_webhook_receipts;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or p_receipt->>'body_sha256'!~'^[a-f0-9]{64}$' or p_receipt->>'signature_sha256'!~'^[a-f0-9]{64}$' then raise exception 'INVALID_VERIFIED_WEBHOOK' using errcode='22023';end if;
 insert into private.aqari_webhook_receipts(id,workspace_id,provider,provider_event_id,event_type,body_sha256,signature_sha256,occurred_at,status,normalized_payload)
 values((p_receipt->>'id')::uuid,p_workspace_id,p_receipt->>'provider',p_receipt->>'provider_event_id',p_receipt->>'event_type',p_receipt->>'body_sha256',p_receipt->>'signature_sha256',(p_receipt->>'occurred_at')::timestamptz,'received',p_receipt->'normalized_payload')
 on conflict(workspace_id,provider,provider_event_id) do nothing returning * into r;
 if not found then select * into r from private.aqari_webhook_receipts x where x.workspace_id=p_workspace_id and x.provider=p_receipt->>'provider' and x.provider_event_id=p_receipt->>'provider_event_id';return jsonb_build_object('duplicate',true,'id',r.id,'status',r.status);end if;
 return jsonb_build_object('duplicate',false,'id',r.id,'status',r.status);
end $$;
revoke all on function public.aqari_record_verified_webhook(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_record_verified_webhook(uuid,jsonb) to service_role;

commit;