-- AQARI V267 Preview/Staging only: explicit bank-transfer reconciliation queue.
-- Unknown transfers are never auto-attached to a tenant, lease, property, or payment.
-- Reconciliation requires an explicit existing authoritative bank payment, documented reason,
-- general-manager authority, finance write permission, recent MFA, and revision readback.
begin;

create table if not exists private.aqari_bank_transfer_queue(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 bank_source text not null check(length(btrim(bank_source)) between 2 and 120),
 external_id text not null check(length(btrim(external_id)) between 1 and 200),
 transfer_date date not null,
 amount numeric(18,3) not null check(amount>0 and amount=round(amount,3)),
 currency text not null default 'KWD' check(currency='KWD'),
 bank_reference text not null default '' check(length(bank_reference)<=300),
 sender_name text not null default '' check(length(sender_name)<=300),
 sender_account_hint text not null default '' check(length(sender_account_hint)<=120),
 memo text not null default '' check(length(memo)<=2000),
 state text not null default 'unmatched' check(state in('unmatched','reconciled')),
 payment_id uuid references public.aqari_rent_payments(id),
 revision bigint not null default 1 check(revision>0),
 imported_by uuid not null references auth.users(id),
 reconciled_by uuid references auth.users(id),
 reconciled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,bank_source,external_id),
 check((state='unmatched' and payment_id is null and reconciled_by is null and reconciled_at is null)
    or (state='reconciled' and payment_id is not null and reconciled_by is not null and reconciled_at is not null))
);
create unique index if not exists aqari_bank_transfer_payment_uq on private.aqari_bank_transfer_queue(workspace_id,payment_id) where payment_id is not null;
create index if not exists aqari_bank_transfer_queue_scope on private.aqari_bank_transfer_queue(workspace_id,state,transfer_date desc,created_at desc);

create table if not exists private.aqari_bank_transfer_events(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 transfer_id uuid not null references private.aqari_bank_transfer_queue(id),
 action text not null check(action in('ingest','reconcile','reopen')),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 before_value jsonb,
 after_value jsonb not null,
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now()
);
create index if not exists aqari_bank_transfer_events_scope on private.aqari_bank_transfer_events(workspace_id,transfer_id,id desc);

alter table private.aqari_bank_transfer_queue enable row level security;
alter table private.aqari_bank_transfer_events enable row level security;
revoke all on private.aqari_bank_transfer_queue,private.aqari_bank_transfer_events from public,anon,authenticated,service_role;

create or replace function private.aqari_bank_reconciliation_reject_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='BANK_RECONCILIATION_DELETE_FORBIDDEN';
end $$;
revoke all on function private.aqari_bank_reconciliation_reject_delete() from public,anon,authenticated,service_role;

create or replace function private.aqari_bank_reconciliation_event_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='BANK_RECONCILIATION_EVENT_IMMUTABLE';
end $$;
revoke all on function private.aqari_bank_reconciliation_event_immutable() from public,anon,authenticated,service_role;

drop trigger if exists aqari_bank_transfer_no_delete on private.aqari_bank_transfer_queue;
create trigger aqari_bank_transfer_no_delete before delete on private.aqari_bank_transfer_queue for each row execute function private.aqari_bank_reconciliation_reject_delete();
drop trigger if exists aqari_bank_transfer_event_immutable on private.aqari_bank_transfer_events;
create trigger aqari_bank_transfer_event_immutable before update or delete on private.aqari_bank_transfer_events for each row execute function private.aqari_bank_reconciliation_event_immutable();

create or replace function public.aqari_bank_reconciliation(p_workspace_id uuid,p_action text default 'list',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);ident uuid;payment uuid;expected bigint;why text;actor text;row_before jsonb;row_after jsonb;
 amount_value numeric;source_value text;external_value text;state_value text;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;

 if p_action='list' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('state')) then raise invalid_parameter_value using message='INVALID_BANK_RECONCILIATION_QUERY';end if;
  state_value:=nullif(d->>'state','');
  if state_value is not null and state_value not in('unmatched','reconciled') then raise invalid_parameter_value using message='INVALID_BANK_RECONCILIATION_STATE';end if;
  return jsonb_build_object(
   'workspace_id',w,'user_id',auth.uid(),
   'canWrite',private.aqari_manager(w) and private.aqari_can(w,'finance','write'),
   'autoMatch',false,
   'transfers',coalesce((select jsonb_agg(jsonb_build_object(
      'id',q.id,'bankSource',q.bank_source,'externalId',q.external_id,'transferDate',q.transfer_date,'amount',q.amount,'currency',q.currency,
      'bankReference',q.bank_reference,'senderName',q.sender_name,'senderAccountHint',q.sender_account_hint,'memo',q.memo,'state',q.state,
      'paymentId',q.payment_id,'revision',q.revision,'createdAt',q.created_at,'reconciledAt',q.reconciled_at
    ) order by (q.state='unmatched') desc,q.transfer_date desc,q.created_at desc,q.id)
    from private.aqari_bank_transfer_queue q where q.workspace_id=w and (state_value is null or q.state=state_value)),'[]'::jsonb),
   'candidates',coalesce((select jsonb_agg(jsonb_build_object(
      'paymentId',r.id,'amount',r.amount,'paidAt',r.paid_at,'reference',r.reference,'method',r.payment_method,
      'leaseId',l.id,'contractNo',l.contract_no,'tenantId',t.id,'tenantName',t.full_name,'propertyId',u.property_id,'propertyName',p.name,'unitId',u.id,'unitNo',u.unit_no
    ) order by r.paid_at desc,r.id)
    from public.aqari_rent_payments r
    join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
    join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
    join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
    where r.workspace_id=w
      and lower(coalesce(r.payment_method,'')) in('bank','bank_transfer','transfer','تحويل بنكي')
      and lower(coalesce(r.status,'')) not in('cancelled','canceled','ملغى')
      and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id)
      and not exists(select 1 from private.aqari_bank_transfer_queue q where q.workspace_id=w and q.payment_id=r.id)
      and private.aqari_can_property(w,u.property_id,'properties','read')
    limit 500),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'transferId',e.transfer_id,'action',e.action,'reason',e.reason,'actor',e.actor_name,'createdAt',e.created_at) order by e.id desc)
     from private.aqari_bank_transfer_events e where e.workspace_id=w),'[]'::jsonb)
  );
 end if;

 if p_action not in('ingest','reconcile','reopen') then raise invalid_parameter_value using message='UNKNOWN_BANK_RECONCILIATION_ACTION';end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='BANK_RECONCILIATION_WRITE_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 1000 then raise invalid_parameter_value using message='BANK_RECONCILIATION_REASON_REQUIRED';end if;

 if p_action='ingest' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('bankSource','externalId','transferDate','amount','bankReference','senderName','senderAccountHint','memo','reason')) then raise invalid_parameter_value using message='INVALID_BANK_TRANSFER_FIELDS';end if;
  source_value:=btrim(coalesce(d->>'bankSource',''));external_value:=btrim(coalesce(d->>'externalId',''));
  if length(source_value) not between 2 and 120 or length(external_value) not between 1 and 200 or coalesce(d->>'transferDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(d->>'amount','') !~ '^\d{1,14}(\.\d{1,3})?$' then raise invalid_parameter_value using message='INVALID_BANK_TRANSFER_FIELDS';end if;
  amount_value:=(d->>'amount')::numeric;if amount_value<=0 then raise invalid_parameter_value using message='INVALID_BANK_TRANSFER_AMOUNT';end if;
  ident:=gen_random_uuid();
  insert into private.aqari_bank_transfer_queue(id,workspace_id,bank_source,external_id,transfer_date,amount,bank_reference,sender_name,sender_account_hint,memo,state,payment_id,revision,imported_by)
  values(ident,w,source_value,external_value,(d->>'transferDate')::date,amount_value,btrim(coalesce(d->>'bankReference','')),btrim(coalesce(d->>'senderName','')),btrim(coalesce(d->>'senderAccountHint','')),btrim(coalesce(d->>'memo','')),'unmatched',null,1,auth.uid());
  select to_jsonb(q) into row_after from private.aqari_bank_transfer_queue q where q.id=ident;
  insert into private.aqari_bank_transfer_events(workspace_id,transfer_id,action,reason,before_value,after_value,actor_id,actor_name)values(w,ident,'ingest',why,null,row_after,auth.uid(),actor);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',row_after,'autoMatched',false);
 end if;

 ident:=nullif(d->>'transferId','')::uuid;expected:=coalesce((d->>'revision')::bigint,-1);
 if ident is null or expected<1 then raise invalid_parameter_value using message='BANK_RECONCILIATION_TARGET_REQUIRED';end if;
 select to_jsonb(q) into row_before from private.aqari_bank_transfer_queue q where q.workspace_id=w and q.id=ident for update;
 if row_before is null then raise no_data_found using message='BANK_TRANSFER_NOT_FOUND';end if;
 if (row_before->>'revision')::bigint<>expected then raise serialization_failure using message='BANK_RECONCILIATION_REVISION_CONFLICT';end if;

 if p_action='reconcile' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('transferId','revision','paymentId','reason')) then raise invalid_parameter_value using message='INVALID_BANK_RECONCILIATION_FIELDS';end if;
  if row_before->>'state'<>'unmatched' then raise check_violation using message='BANK_TRANSFER_ALREADY_RECONCILED';end if;
  payment:=nullif(d->>'paymentId','')::uuid;if payment is null then raise invalid_parameter_value using message='EXPLICIT_PAYMENT_REQUIRED';end if;
  if not exists(
    select 1 from public.aqari_rent_payments r
    join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
    join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
    where r.workspace_id=w and r.id=payment
      and r.amount=(row_before->>'amount')::numeric
      and lower(coalesce(r.payment_method,'')) in('bank','bank_transfer','transfer','تحويل بنكي')
      and lower(coalesce(r.status,'')) not in('cancelled','canceled','ملغى')
      and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id)
      and private.aqari_can_property(w,u.property_id,'properties','read')
  ) then raise check_violation using message='BANK_PAYMENT_EXPLICIT_MATCH_INVALID';end if;
  update private.aqari_bank_transfer_queue set state='reconciled',payment_id=payment,revision=expected+1,reconciled_by=auth.uid(),reconciled_at=now(),updated_at=now() where workspace_id=w and id=ident;
 elsif p_action='reopen' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('transferId','revision','reason')) then raise invalid_parameter_value using message='INVALID_BANK_REOPEN_FIELDS';end if;
  if row_before->>'state'<>'reconciled' then raise check_violation using message='BANK_TRANSFER_NOT_RECONCILED';end if;
  update private.aqari_bank_transfer_queue set state='unmatched',payment_id=null,revision=expected+1,reconciled_by=null,reconciled_at=null,updated_at=now() where workspace_id=w and id=ident;
 end if;
 select to_jsonb(q) into row_after from private.aqari_bank_transfer_queue q where q.workspace_id=w and q.id=ident;
 insert into private.aqari_bank_transfer_events(workspace_id,transfer_id,action,reason,before_value,after_value,actor_id,actor_name)values(w,ident,p_action,why,row_before,row_after,auth.uid(),actor);
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',row_after,'autoMatched',false);
end $$;
revoke all on function public.aqari_bank_reconciliation(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_bank_reconciliation(uuid,text,jsonb) to authenticated;
commit;
