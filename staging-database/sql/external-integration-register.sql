-- AQARI V267 provider-neutral integration control plane.
-- No credentials are stored here. secret_reference points to managed server-side secret storage.
begin;
create table private.aqari_integration_configs(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 provider text not null check(provider in ('knet','email','whatsapp','sms','push','quickbooks','zoho_books','xero','generic_webhook')),
 purpose text not null, mode text not null default 'disabled' check(mode in ('disabled','sandbox','live')),
 endpoint_origin text, secret_reference text, public_metadata jsonb not null default '{}',
 revision integer not null default 1, created_by uuid not null, updated_by uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,id), unique(workspace_id,provider,purpose),
 check(endpoint_origin is null or endpoint_origin ~ '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$'),
 check(secret_reference is null or secret_reference ~ '^[A-Za-z0-9_./:-]{3,200}$'),
 check(not(public_metadata ?| array['password','secret','token','api_key','civil_id','civilId']))
);
create table private.aqari_webhook_receipts(
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 provider text not null, provider_event_id text not null, event_type text not null,
 body_sha256 text not null check(body_sha256 ~ '^[a-f0-9]{64}$'), signature_sha256 text not null check(signature_sha256 ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz not null, received_at timestamptz not null default now(),
 status text not null default 'received' check(status in ('received','processed','rejected','duplicate')),
 normalized_payload jsonb not null check(jsonb_typeof(normalized_payload)='object'), rejection_reason text,
 unique(workspace_id,id), unique(workspace_id,provider,provider_event_id)
);
create index aqari_webhook_receipts_scope on private.aqari_webhook_receipts(workspace_id,received_at desc);
alter table private.aqari_integration_configs enable row level security;
alter table private.aqari_webhook_receipts enable row level security;
revoke all on private.aqari_integration_configs,private.aqari_webhook_receipts from public,anon,authenticated;
create trigger aqari_webhook_receipts_immutable before update or delete on private.aqari_webhook_receipts for each row execute function private.aqari_reject_immutable_change();

create function public.aqari_external_integrations(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;row private.aqari_integration_configs;expected integer;ident uuid;
begin
 if auth.uid() is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action not in ('list','save','enqueue_test') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>32000 then raise exception 'INVALID_INTEGRATION_REQUEST' using errcode='22023';end if;
 if p_action='list' then return jsonb_build_object(
  'configs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'purpose',c.purpose,'mode',c.mode,'endpoint_origin',c.endpoint_origin,'secret_reference',c.secret_reference,'public_metadata',c.public_metadata,'revision',c.revision,'updated_at',c.updated_at) order by c.provider,c.purpose) from private.aqari_integration_configs c where c.workspace_id=w),'[]'::jsonb),
  'outbox',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,event_type,aggregate_id,schema_version,idempotency_key,status,attempts,available_at,provider_reference,last_error,created_at,delivered_at from private.aqari_integration_outbox where workspace_id=w order by created_at desc limit 100)x),'[]'::jsonb),
  'webhooks',coalesce((select jsonb_agg(to_jsonb(x) order by x.received_at desc) from (select id,provider,provider_event_id,event_type,body_sha256,occurred_at,received_at,status,rejection_reason from private.aqari_webhook_receipts where workspace_id=w order by received_at desc limit 100)x),'[]'::jsonb)); end if;
 perform private.aqari_require_sensitive_aal2(w);
 if p_action='save' then
  ident:=(d->>'id')::uuid;expected:=coalesce((d->>'revision')::integer,0);
  if d->>'mode'='live' and nullif(d->>'secret_reference','') is null then raise exception 'LIVE_SECRET_REFERENCE_REQUIRED' using errcode='23514';end if;
  if coalesce(d->>'endpoint_origin','')<>'' and d->>'endpoint_origin'!~'^https://[A-Za-z0-9.-]+(?::[0-9]+)?$' then raise exception 'HTTPS_ORIGIN_REQUIRED' using errcode='23514';end if;
  select * into row from private.aqari_integration_configs where workspace_id=w and id=ident for update;
  if found and row.revision<>expected then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
  insert into private.aqari_integration_configs(id,workspace_id,provider,purpose,mode,endpoint_origin,secret_reference,public_metadata,revision,created_by,updated_by)
  values(ident,w,d->>'provider',d->>'purpose',d->>'mode',nullif(d->>'endpoint_origin',''),nullif(d->>'secret_reference',''),coalesce(d->'public_metadata','{}'),1,auth.uid(),auth.uid())
  on conflict(workspace_id,id) do update set provider=excluded.provider,purpose=excluded.purpose,mode=excluded.mode,endpoint_origin=excluded.endpoint_origin,secret_reference=excluded.secret_reference,public_metadata=excluded.public_metadata,revision=private.aqari_integration_configs.revision+1,updated_by=auth.uid(),updated_at=now() returning * into row;
  return to_jsonb(row)-'created_by'-'updated_by';
 end if;
 if d->>'idempotency_key'!~'^[A-Za-z0-9:_-]{8,200}$' then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='23514';end if;
 insert into private.aqari_integration_outbox(id,workspace_id,event_type,aggregate_id,schema_version,payload,idempotency_key)
 values((d->>'id')::uuid,w,'integration.test',d->>'config_id',1,jsonb_build_object('config_id',d->>'config_id','probe',true),d->>'idempotency_key')
 on conflict(workspace_id,idempotency_key) do nothing;
 return (select to_jsonb(x)-'payload' from private.aqari_integration_outbox x where x.workspace_id=w and x.idempotency_key=d->>'idempotency_key');
end $$;
revoke all on function public.aqari_external_integrations(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_external_integrations(uuid,text,jsonb) to authenticated;

-- Called only by a trusted server adapter after signature/timestamp verification.
create function public.aqari_record_verified_webhook(p_workspace_id uuid,p_receipt jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare r private.aqari_webhook_receipts;
begin
 if current_user not in ('service_role','postgres') then raise insufficient_privilege using message='SERVER_ONLY';end if;
 if p_receipt is null or jsonb_typeof(p_receipt)<>'object' or p_receipt->>'body_sha256'!~'^[a-f0-9]{64}$' or p_receipt->>'signature_sha256'!~'^[a-f0-9]{64}$' then raise exception 'INVALID_VERIFIED_WEBHOOK' using errcode='22023';end if;
 insert into private.aqari_webhook_receipts(id,workspace_id,provider,provider_event_id,event_type,body_sha256,signature_sha256,occurred_at,status,normalized_payload)
 values((p_receipt->>'id')::uuid,p_workspace_id,p_receipt->>'provider',p_receipt->>'provider_event_id',p_receipt->>'event_type',p_receipt->>'body_sha256',p_receipt->>'signature_sha256',(p_receipt->>'occurred_at')::timestamptz,'received',p_receipt->'normalized_payload')
 on conflict(workspace_id,provider,provider_event_id) do nothing returning * into r;
 if not found then return jsonb_build_object('duplicate',true);end if;
 return jsonb_build_object('duplicate',false,'id',r.id,'status',r.status);
end $$;
revoke all on function public.aqari_record_verified_webhook(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_record_verified_webhook(uuid,jsonb) to service_role;
commit;
