-- AQARI V267 Preview/Staging: automatically render/archive the official receipt before outbound delivery.
-- System automation is represented explicitly; it never impersonates a human actor.
begin;

alter table private.aqari_rent_receipt_pdf_artifacts alter column archived_by drop not null;
alter table private.aqari_rent_receipt_pdf_artifacts add column if not exists archive_actor_kind text not null default 'user';
do $constraint$ begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_rent_receipt_pdf_artifacts'::regclass and conname='aqari_rent_receipt_pdf_archive_actor_check') then
  alter table private.aqari_rent_receipt_pdf_artifacts add constraint aqari_rent_receipt_pdf_archive_actor_check
   check((archive_actor_kind='user' and archived_by is not null) or (archive_actor_kind='system' and archived_by is null));
 end if;
end $constraint$;

create table if not exists private.aqari_rent_receipt_pdf_automation_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 payment_id uuid not null references public.aqari_rent_payments(id),
 receipt_no text not null,
 snapshot_sha256 text not null check(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 pdf_sha256 text not null check(pdf_sha256 ~ '^[a-f0-9]{64}$'),
 action text not null check(action='system_auto_archive'),
 created_at timestamptz not null default now()
);
create index if not exists aqari_rent_receipt_pdf_automation_scope on private.aqari_rent_receipt_pdf_automation_events(workspace_id,payment_id,id desc);
alter table private.aqari_rent_receipt_pdf_automation_events enable row level security;
revoke all on private.aqari_rent_receipt_pdf_automation_events from public,anon,authenticated,service_role;
drop trigger if exists aqari_rent_receipt_pdf_automation_immutable on private.aqari_rent_receipt_pdf_automation_events;
create trigger aqari_rent_receipt_pdf_automation_immutable before update or delete on private.aqari_rent_receipt_pdf_automation_events for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_rent_receipt_pdf_system_source(p_workspace_id uuid,p_payment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
 rp public.aqari_rent_payments%rowtype;l public.aqari_leases%rowtype;u public.aqari_units%rowtype;p public.aqari_properties%rowtype;t public.aqari_tenants%rowtype;
 saved jsonb;row_value jsonb;contract jsonb;ledger jsonb;amount_value numeric;
begin
 select * into rp from public.aqari_rent_payments where workspace_id=p_workspace_id and id=p_payment_id;
 if not found or lower(coalesce(rp.status,'')) in('cancelled','canceled','ملغى') or exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=rp.workspace_id and c.payment_id=rp.id) then raise check_violation using message='RECEIPT_PAYMENT_NOT_DELIVERABLE';end if;
 select * into l from public.aqari_leases where workspace_id=rp.workspace_id and id=rp.lease_id;
 if not found then raise check_violation using message='RECEIPT_LEASE_MISSING';end if;
 select * into u from public.aqari_units where workspace_id=l.workspace_id and id=l.unit_id;
 select * into p from public.aqari_properties where workspace_id=u.workspace_id and id=u.property_id;
 select * into t from public.aqari_tenants where workspace_id=l.workspace_id and id=l.tenant_id;
 if u.id is null or p.id is null or t.id is null then raise check_violation using message='RECEIPT_SCOPE_MISSING';end if;
 saved:=rp.receipt;ledger:=rp.record;row_value:=saved->'record';contract:=saved->'contract';
 if jsonb_typeof(saved)<>'object' or saved->>'template'<>'rent-voucher-v267-1' or saved->>'id'<>rp.reference
  or jsonb_typeof(row_value)<>'array' or jsonb_array_length(row_value)<>10 or jsonb_typeof(contract)<>'object' or jsonb_typeof(ledger)<>'object'
  or row_value->>0<>rp.reference or row_value->>1<>t.full_name or row_value->>4<>p.name or row_value->>6<>u.unit_no
  or row_value->>5<>rp.paid_at::text or row_value->>8<>to_char(rp.period,'YYYY-MM') or row_value->>9<>rp.payment_method
  or contract->>'id' is distinct from l.external_ref or contract->>'contract_no' is distinct from l.contract_no or contract->>'status'<>'signed'
  or contract->>'tenant'<>t.full_name or contract->>'property'<>p.name or contract->>'unit'<>u.unit_no
  or coalesce(ledger->>'receiptNo',ledger->>'voucherNo','')<>rp.reference
  or ledger->>'contractId' is distinct from l.external_ref or ledger->>'contractNo' is distinct from l.contract_no
  or ledger->>'tenant'<>t.full_name or ledger->>'property'<>p.name or ledger->>'unit'<>u.unit_no or ledger->>'period'<>to_char(rp.period,'YYYY-MM')
  or ledger->>'paidAt'<>rp.paid_at::text or ledger->>'status'<>row_value->>3 or ledger->>'method'<>rp.payment_method
 then raise check_violation using message='RECEIPT_SNAPSHOT_MISMATCH';end if;
 begin amount_value:=(row_value->>2)::numeric;exception when others then raise check_violation using message='RECEIPT_AMOUNT_INVALID';end;
 if amount_value<>rp.amount or coalesce((ledger->>'paid')::numeric,-1)<>rp.amount then raise check_violation using message='RECEIPT_AMOUNT_MISMATCH';end if;
 return jsonb_build_object('workspaceId',rp.workspace_id,'paymentId',rp.id,'receiptNo',rp.reference,'snapshotSha256',encode(sha256(convert_to(saved::text,'UTF8')),'hex'),'receipt',saved);
end $$;
revoke all on function private.aqari_rent_receipt_pdf_system_source(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_rent_receipt_pdf_auto_commit(
 p_workspace_id uuid,p_payment_id uuid,p_snapshot_sha256 text,p_pdf_base64 text,p_pdf_sha256 text,p_renderer_version text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare source jsonb;bytes bytea;existing private.aqari_rent_receipt_pdf_artifacts%rowtype;receipt_no text;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_snapshot_sha256!~'^[a-f0-9]{64}$' or p_pdf_sha256!~'^[a-f0-9]{64}$' or length(coalesce(p_pdf_base64,''))>2796204 or length(coalesce(p_renderer_version,'')) not between 1 and 100 then raise check_violation using message='INVALID_PDF_ARCHIVE';end if;
 perform 1 from public.aqari_rent_payments where workspace_id=p_workspace_id and id=p_payment_id for update;if not found then raise no_data_found using message='RECEIPT_NOT_FOUND';end if;
 source:=private.aqari_rent_receipt_pdf_system_source(p_workspace_id,p_payment_id);receipt_no:=source->>'receiptNo';
 if source->>'snapshotSha256'<>p_snapshot_sha256 then raise check_violation using message='RECEIPT_SOURCE_CHANGED';end if;
 bytes:=decode(p_pdf_base64,'base64');
 if octet_length(bytes) not between 8 and 2097152 or substring(bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or encode(sha256(bytes),'hex')<>p_pdf_sha256 then raise check_violation using message='INVALID_PDF_ARCHIVE';end if;
 select * into existing from private.aqari_rent_receipt_pdf_artifacts where workspace_id=p_workspace_id and receipt_no=receipt_no;
 if found then
  if existing.payment_id<>p_payment_id or existing.snapshot_sha256<>p_snapshot_sha256 or existing.pdf_sha256<>p_pdf_sha256 then raise unique_violation using message='PDF_ARCHIVE_CONFLICT';end if;
  return jsonb_build_object('archived',true,'replayed',true,'receiptNo',receipt_no,'pdfSha256',existing.pdf_sha256,'snapshotSha256',existing.snapshot_sha256);
 end if;
 insert into private.aqari_rent_receipt_pdf_artifacts(workspace_id,receipt_no,payment_id,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,archived_by,archive_actor_kind)
 values(p_workspace_id,receipt_no,p_payment_id,p_snapshot_sha256,bytes,p_pdf_sha256,p_renderer_version,null,'system');
 insert into private.aqari_rent_receipt_pdf_automation_events(workspace_id,payment_id,receipt_no,snapshot_sha256,pdf_sha256,action)
 values(p_workspace_id,p_payment_id,receipt_no,p_snapshot_sha256,p_pdf_sha256,'system_auto_archive');
 return jsonb_build_object('archived',true,'replayed',false,'receiptNo',receipt_no,'pdfSha256',p_pdf_sha256,'snapshotSha256',p_snapshot_sha256);
end $$;
revoke all on function public.aqari_rent_receipt_pdf_auto_commit(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.aqari_rent_receipt_pdf_auto_commit(uuid,uuid,text,text,text,text) to service_role;

-- Claim overlay: a receipt may be claimed before its PDF exists; the trusted worker receives the exact verified source and archives it before network delivery.
create or replace function public.aqari_integration_dispatch_claim(p_limit integer default 5)
returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
 r private.aqari_integration_outbox%rowtype;c private.aqari_integration_configs%rowtype;channel text;purpose_value text;recipient text;template_value text;variables jsonb;attachment jsonb;receipt_source jsonb;items jsonb:='[]'::jsonb;
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
  elsif r.event_type in('collection.receipt','collection.owner_whatsapp_summary') then
   channel:=nullif(btrim(r.payload->>'channel'),'');if channel not in('email','whatsapp','sms','push') then continue;end if;purpose_value:=case r.event_type when 'collection.receipt' then 'collection_receipt' else 'collection_owner_summary' end;
   select * into c from private.aqari_integration_configs x where x.workspace_id=r.workspace_id and x.provider=channel and x.purpose in(purpose_value,'notifications','default') and x.mode in('sandbox','live') and x.endpoint_origin is not null and x.secret_reference is not null order by case x.purpose when purpose_value then 0 when 'notifications' then 1 else 2 end,x.updated_at desc,x.id limit 1;if not found then continue;end if;
   if r.event_type='collection.receipt' then
    if r.aggregate_id !~ '^[0-9a-fA-F-]{36}$' then continue;end if;payment_id:=r.aggregate_id::uuid;
    begin receipt_source:=private.aqari_rent_receipt_pdf_system_source(r.workspace_id,payment_id);exception when others then continue;end;
    select t.full_name,t.email,t.phone,p.name,u.unit_no,l.contract_no,rp.reference into tenant_name,tenant_email,tenant_phone,property_name,unit_no,contract_no,payment_reference from public.aqari_rent_payments rp join public.aqari_leases l on l.workspace_id=rp.workspace_id and l.id=rp.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id where rp.workspace_id=r.workspace_id and rp.id=payment_id;
    if not found then continue;end if;recipient:=case channel when 'email' then nullif(btrim(tenant_email),'') when 'whatsapp' then nullif(btrim(tenant_phone),'') when 'sms' then nullif(btrim(tenant_phone),'') else null end;if recipient is null then continue;end if;
    select * into artifact from private.aqari_rent_receipt_pdf_artifacts a where a.workspace_id=r.workspace_id and a.payment_id=payment_id;
    if found then attachment:=jsonb_build_object('filename','rent-receipt.pdf','content_type','application/pdf','base64',replace(encode(artifact.pdf_bytes,'base64'),E'\n',''),'sha256',artifact.pdf_sha256);end if;
    template_value:='collection_receipt';variables:=jsonb_build_object('tenantName',tenant_name,'propertyName',property_name,'unitNo',unit_no,'contractNo',contract_no,'amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',payment_reference);
   else
    recipient:=nullif(btrim(r.payload->>'ownerWhatsapp'),'');if recipient is null then continue;end if;template_value:='collection_owner_summary';variables:=jsonb_build_object('ownerName',r.payload->>'ownerName','tenantName',r.payload->>'tenantName','propertyName',r.payload->>'propertyName','unitNo',r.payload->>'unitNo','amount',r.payload->>'amount','period',r.payload->>'period','paidAt',r.payload->>'paidAt','paymentMethod',r.payload->>'paymentMethod','receiptReference',r.payload->>'receiptReference');
   end if;
  else continue;end if;
  update private.aqari_integration_outbox set status='sending',attempts=attempts+1,available_at=now()+interval '5 minutes',last_error=null where workspace_id=r.workspace_id and id=r.id;claimed:=claimed+1;
  items:=items||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('eventId',r.id,'workspaceId',r.workspace_id,'eventType',r.event_type,'idempotencyKey',r.idempotency_key,'attempt',r.attempts+1,'provider',c.provider,'mode',c.mode,'endpointOrigin',c.endpoint_origin,'secretReference',c.secret_reference,'channel',channel,'recipientReference',recipient,'template',template_value,'variables',variables,'locale','ar','attachment',attachment,'receiptSource',case when attachment is null then receipt_source else null end)));
 end loop;return items;
end $$;
revoke all on function public.aqari_integration_dispatch_claim(integer) from public,anon,authenticated;grant execute on function public.aqari_integration_dispatch_claim(integer) to service_role;

commit;
