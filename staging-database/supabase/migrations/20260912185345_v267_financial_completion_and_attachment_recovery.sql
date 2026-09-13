-- V267 isolated preview completion. Reviewed source preflight; no business backfill.
begin;
do $aqari_completion_preflight$
declare actual jsonb;
begin
 if (select max(version) from supabase_migrations.schema_migrations where name is distinct from 'v267_financial_completion_and_attachment_recovery') is distinct from '20260912184456' then raise exception 'COMPLETION_MIGRATION_SOURCE_CHANGED';end if;
 select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) order by p.oid::regprocedure::text),'[]'::jsonb) into actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f' and n.nspname||'.'||p.proname in ('private.aqari_assert_commercial_collections','private.aqari_capture_partner_period','private.aqari_clearance_balances_compatible','private.aqari_commercial_balance','private.aqari_commercial_collection_integrity_guard','private.aqari_commercial_collection_json','private.aqari_commercial_collection_write_guard','private.aqari_commercial_collections_register','private.aqari_commercial_legacy_history','private.aqari_commercial_legacy_mode_guard','private.aqari_commercial_sale_collection_guard','private.aqari_independent_commercial_clearance','private.aqari_legacy_allocation_clearance','private.aqari_legacy_allocation_vacating_balances','private.aqari_maintenance_attachment_immutable','private.aqari_maintenance_attachment_storage','private.aqari_maintenance_attachments','private.aqari_official_final_settlement_source_guard','private.aqari_opening_balance_reconciliation','private.aqari_opening_balance_statement','private.aqari_opening_source_preserved','private.aqari_opening_source_valid','private.aqari_partner_allocate','private.aqari_partner_commercial_evidence','private.aqari_partner_distribution_register','private.aqari_partner_distribution_statement','private.aqari_partner_document_guard','private.aqari_partner_hash','private.aqari_partner_legacy_distribution_guard','private.aqari_partner_source_date_guard','private.aqari_require_commercial_clearance','private.aqari_utility_source_serialization_guard','private.aqari_vacating_balances','private.aqari_vacating_has_open_utility','private.aqari_vacating_supplemental_snapshot_guard','public.aqari_commercial_collections','public.aqari_opening_balance_reconciliation','public.aqari_opening_balance_statement','public.aqari_partner_distribution_register','public.aqari_partner_distribution_statement','public.aqari_vacating_release','public.aqari_workspace_access');
 if actual is distinct from '[{"md5":"9c5205f643a570d08d3bed6c5d3811f3","signature":"aqari_opening_balance_statement(uuid,uuid)"},{"md5":"5bd81e077eca2fd9cf0bcd1ef4495f3c","signature":"aqari_vacating_release(uuid,uuid,bigint)"},{"md5":"c2c3f0a4d0e9715f83fac95c592d834a","signature":"aqari_workspace_access(uuid)"},{"md5":"69f3f935e6ff04ae8558b5ab744e74b0","signature":"private.aqari_maintenance_attachment_storage(text,boolean)"},{"md5":"24d68e6a98b894955f4d075d5f9da48c","signature":"private.aqari_maintenance_attachments(uuid,uuid,text,jsonb)"},{"md5":"db46cf4a416f00e367aa742c96d0eb70","signature":"private.aqari_opening_balance_statement(uuid,uuid)"},{"md5":"fe80583ced7b756f47401f7d0b23eac7","signature":"private.aqari_require_commercial_clearance(uuid,uuid)"},{"md5":"896f9e1dcbd073326072605b0ad6e558","signature":"private.aqari_vacating_balances(uuid,uuid,date)"},{"md5":"4fc81148158317331e96e8565895ba13","signature":"private.aqari_vacating_supplemental_snapshot_guard()"}]'::jsonb then raise exception 'COMPLETION_FUNCTION_SOURCE_CHANGED';end if;
end $aqari_completion_preflight$;

-- SOURCE: staging-database/sql/maintenance-attachments-cancellation.sql
-- Upgrade the installed private attachment schema without deleting any original.
-- Apply after maintenance-attachments.sql and mfa-enforcement.sql.

-- Preserve both historical spellings. New cancellations use the latest deployed
-- cancelled state and its audit columns; no historical row is rewritten.
alter table private.aqari_maintenance_attachments
 add column if not exists cancelled_at timestamptz,
 add column if not exists cancelled_by uuid,
 add column if not exists cancel_reason text,
 add column if not exists abandoned_at timestamptz,
 add column if not exists abandoned_by uuid,
 add column if not exists abandon_reason text;
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_status_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_status_check check(status in('reserved','uploaded','cancelled','abandoned'));
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_abandonment_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_abandonment_check check(
 (status='abandoned' and abandoned_at is not null and abandoned_by is not null
  and abandon_reason is not null and length(btrim(abandon_reason)) between 6 and 240)
 or (status<>'abandoned' and abandoned_at is null and abandoned_by is null and abandon_reason is null));
alter table private.aqari_maintenance_attachments drop constraint if exists aqari_maintenance_attachments_cancellation_check;
alter table private.aqari_maintenance_attachments add constraint aqari_maintenance_attachments_cancellation_check check(
 (status='cancelled' and cancelled_at is not null and
  ((cancelled_by is null and cancel_reason is null)
   or (cancelled_by is not null and cancel_reason is not null and length(btrim(cancel_reason)) between 6 and 240)))
 or (status<>'cancelled' and cancelled_at is null and cancelled_by is null and cancel_reason is null));

create or replace function private.aqari_maintenance_attachment_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise check_violation using message='ATTACHMENT_HISTORY_IMMUTABLE';end if;
 if old.status<>'reserved' or
  (to_jsonb(new)-array['status','uploaded_at','cancelled_at','cancelled_by','cancel_reason']) is distinct from
  (to_jsonb(old)-array['status','uploaded_at','cancelled_at','cancelled_by','cancel_reason']) then
  raise check_violation using message='ATTACHMENT_HISTORY_IMMUTABLE';
 end if;
 if new.status='cancelled' and (new.cancelled_by is distinct from auth.uid() or new.cancel_reason is null
  or length(btrim(new.cancel_reason)) not between 6 and 240 or new.cancelled_at is null or new.uploaded_at is not null) then
  raise check_violation using message='CANCELLATION_AUDIT_REQUIRED';
 end if;
 return new;
end $$;
revoke all on function private.aqari_maintenance_attachment_immutable() from public,anon,authenticated;
drop trigger if exists aqari_maintenance_attachment_immutable on private.aqari_maintenance_attachments;
create trigger aqari_maintenance_attachment_immutable before update or delete on private.aqari_maintenance_attachments
 for each row execute function private.aqari_maintenance_attachment_immutable();

create or replace function private.aqari_maintenance_attachments(w uuid,r uuid,action text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.aqari_maintenance_attachments;ident uuid;can_write boolean;why text;pending_rows jsonb;
begin
 if auth.uid() is null or not private.aqari_maintenance_attachment_access(w,r,false) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 can_write:=private.aqari_maintenance_attachment_access(w,r,true);
 if action='abandon' then action:='cancel';end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('can_abandon',can_write) order by a.created_at,a.id),'[]'::jsonb)
   into pending_rows from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='reserved' and a.created_by=auth.uid();
  return jsonb_build_object('can_upload',can_write,
   'attachments',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at,a.id) from private.aqari_maintenance_attachments a where a.workspace_id=w and a.request_id=r and a.status='uploaded'),'[]'::jsonb),
   'pending',pending_rows,'pending_reservations',pending_rows,
   'abandoned_count',(select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('abandoned','cancelled') and created_by=auth.uid()),
   'cancelled',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('audit_incomplete',a.status='cancelled' and (a.cancelled_by is null or a.cancel_reason is null)) order by coalesce(a.abandoned_at,a.cancelled_at) desc,a.id) from (select * from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('abandoned','cancelled') and created_by=auth.uid() order by coalesce(abandoned_at,cancelled_at) desc,id limit 50)a),'[]'::jsonb));
 end if;
 if coalesce(action,'') not in('reserve','finalize','cancel','inspect') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
 if action='inspect' then
  select * into doc from private.aqari_maintenance_attachments where id=ident and workspace_id=w and request_id=r and created_by=auth.uid();
  if doc.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return to_jsonb(doc)||case when doc.status='cancelled' and (doc.cancelled_by is null or doc.cancel_reason is null) then jsonb_build_object('audit_incomplete',true) else '{}'::jsonb end;
 end if;
 -- Cancellation, quota reservation, finalization and request completion serialize
 -- on the same parent. No cancelled UUID can be revived by a competing writer.
 perform 1 from public.aqari_maintenance_requests where workspace_id=w and id=r for update;
 select * into doc from private.aqari_maintenance_attachments where id=ident for update;
 if doc.id is not null and (doc.workspace_id<>w or doc.request_id<>r or doc.created_by<>auth.uid()) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='cancel' then
  why:=btrim(d->>'reason');
  if why is null or length(why) not between 6 and 240 or why~'[[:cntrl:]]'
   or exists(select 1 from jsonb_object_keys(d) k where k not in('id','reason')) then raise invalid_parameter_value using message='INVALID_CANCELLATION_REASON';end if;
  if doc.id is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  -- A confirmed cancellation can be reread after closure without changing its
  -- actor, reason or time. A different reason is a conflict, never a new event.
  if doc.status in('abandoned','cancelled') then
   if doc.status='cancelled' and doc.cancel_reason is null then raise invalid_parameter_value using message='ATTACHMENT_CANCELLED';end if;
   if (case doc.status when 'abandoned' then doc.abandon_reason else doc.cancel_reason end) is distinct from why then raise invalid_parameter_value using message='CANCELLATION_CONFLICT';end if;
   return to_jsonb(doc);
  end if;
  if not private.aqari_maintenance_attachment_access(w,r,true) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(w);
  if doc.status<>'reserved' then raise invalid_parameter_value using message='UPLOADED_ATTACHMENT_IMMUTABLE';end if;
  update private.aqari_maintenance_attachments set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),cancel_reason=why
   where workspace_id=w and request_id=r and id=ident returning * into doc;
  return to_jsonb(doc);
 end if;
 if doc.status in('abandoned','cancelled') then raise invalid_parameter_value using message='ATTACHMENT_CANCELLED';end if;
 if not private.aqari_maintenance_attachment_access(w,r,true) and not(action='finalize' and coalesce(doc.status='uploaded',false)) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if action='reserve' then
  if coalesce(d->>'mime_type','') not in ('image/jpeg','image/png','image/webp','application/pdf')
   or coalesce(d->>'size_bytes','')!~'^[0-9]{1,8}$' or (d->>'size_bytes')::integer not between 1 and 10485760
   or length(btrim(coalesce(d->>'filename',''))) not between 1 and 180
   or d->>'filename' ~ '[[:cntrl:]/\\]' or coalesce(d->>'checksum_sha256','')!~'^[a-f0-9]{64}$' then raise invalid_parameter_value using message='INVALID_ATTACHMENT';end if;
  if doc.id is not null then
   if doc.filename<>d->>'filename' or doc.mime_type<>d->>'mime_type' or doc.size_bytes<>(d->>'size_bytes')::integer or doc.checksum_sha256<>d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_RESERVATION_CONFLICT';end if;
   return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);
  end if;
  select * into doc from private.aqari_maintenance_attachments a
   where a.workspace_id=w and a.request_id=r and a.created_by=auth.uid() and a.status in('reserved','uploaded')
    and a.filename=d->>'filename' and a.mime_type=d->>'mime_type'
    and a.size_bytes=(d->>'size_bytes')::integer and a.checksum_sha256=d->>'checksum_sha256'
   order by a.created_at,a.id limit 1 for update;
  if doc.id is not null then return to_jsonb(doc)||jsonb_build_object('reservation_reused',true);end if;
  if (select count(*) from private.aqari_maintenance_attachments where workspace_id=w and request_id=r and status in('reserved','uploaded'))>=8 then raise invalid_parameter_value using message='ATTACHMENT_LIMIT_REACHED';end if;
  insert into private.aqari_maintenance_attachments(id,workspace_id,request_id,filename,mime_type,size_bytes,checksum_sha256,storage_path,created_by)
   values(ident,w,r,d->>'filename',d->>'mime_type',(d->>'size_bytes')::integer,d->>'checksum_sha256',w::text||'/'||r::text||'/'||ident::text,auth.uid()) returning * into doc;
  return to_jsonb(doc)||jsonb_build_object('reservation_reused',false);
 end if;
 if doc.id is null or doc.checksum_sha256 is distinct from d->>'checksum_sha256' then raise invalid_parameter_value using message='ATTACHMENT_NOT_CONFIRMED';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
  and o.metadata->>'size'=doc.size_bytes::text and o.metadata->>'mimetype'=doc.mime_type) then raise invalid_parameter_value using message='STORED_FILE_NOT_CONFIRMED';end if;
 if doc.status='reserved' then update private.aqari_maintenance_attachments set status='uploaded',uploaded_at=now() where workspace_id=w and request_id=r and id=ident returning * into doc;end if;
 return to_jsonb(doc);
end $$;

create or replace function private.aqari_maintenance_attachment_storage(path text,write_file boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare w uuid;r uuid;
begin
 if auth.uid() is null then return false;end if;
 if write_file then
  select a.workspace_id,a.request_id into w,r from private.aqari_maintenance_attachments a
   where a.storage_path=path and a.status='reserved' and a.created_by=auth.uid()
    and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,true);
  if w is null then return false;end if;
  -- Storage insertion and cancellation use the same parent lock. Recheck the
  -- current reservation after waiting; an in-flight INSERT cannot revive it.
  perform 1 from public.aqari_maintenance_requests m where m.workspace_id=w and m.id=r for update;
 end if;
 return exists(select 1 from private.aqari_maintenance_attachments a
  where a.storage_path=path and a.status in('reserved','uploaded') and private.aqari_maintenance_attachment_access(a.workspace_id,a.request_id,write_file)
   and case when write_file then a.status='reserved' and a.created_by=auth.uid()
    else a.status='uploaded' or a.created_by=auth.uid() end);
end
$$;
-- Existing public invoker wrapper and exact bucket SELECT/INSERT policies remain
-- the only public entry points. There is no object DELETE/UPDATE permission.
revoke all on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) from public,anon,authenticated;
grant execute on function private.aqari_maintenance_attachments(uuid,uuid,text,jsonb),private.aqari_maintenance_attachment_storage(text,boolean) to authenticated;


-- SOURCE: staging-database/sql/vacating-supplemental-source-hardening.sql
-- Additive, repeatable source guard after the three settlement guards and the
-- official-document source binding. Never rewrites old snapshots or PDFs.

-- Utility writes and the public settlement/document RPCs must serialize on
-- the same workspace row. No new privilege or utility mutation is granted.
create or replace function private.aqari_utility_source_serialization_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare prior_workspace uuid;next_workspace uuid;w uuid;
begin
 if tg_op<>'INSERT' then prior_workspace:=old.workspace_id;end if;
 if tg_op<>'DELETE' then next_workspace:=new.workspace_id;end if;
 -- A trusted cross-workspace correction, when existing controls allow it,
 -- locks both workspaces in UUID order rather than just the destination.
 for w in select distinct x.id from (values(prior_workspace),(next_workspace))x(id) where x.id is not null order by x.id loop
  perform 1 from public.aqari_app_state where workspace_id=w for update;
 end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.aqari_utility_source_serialization_guard() from public,anon,authenticated;
drop trigger if exists aqari_utility_source_serialization on public.aqari_utility_entries;
create trigger aqari_utility_source_serialization before insert or update or delete on public.aqari_utility_entries
 for each row execute function private.aqari_utility_source_serialization_guard();

create or replace function private.aqari_vacating_has_open_utility(w uuid,lid uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 -- Use the conservative property-bill scope of aqari_vacating_release.
 -- payment_status is currently NOT NULL; IS DISTINCT FROM keeps a future
 -- unknown status unresolved as well, without relaxing the existing rule.
 select exists(select 1 from public.aqari_utility_entries e
  join public.aqari_leases l on l.workspace_id=w and l.id=lid
  join public.aqari_units u on u.workspace_id=w and u.id=l.unit_id
  where e.workspace_id=w and e.property_id=u.property_id and e.entry_type='bill'
   and (e.amount_due is null or e.amount_paid is null or e.amount_due>e.amount_paid or e.payment_status is distinct from 'paid'))
$$;
revoke all on function private.aqari_vacating_has_open_utility(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_vacating_supplemental_snapshot_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and old.status='draft' and new.status='finalized' and new.settlement_snapshot is not null then
  -- These fields belong to this transition's source review, not client input
  -- or a prior snapshot. An unrelated later update must not recapture them.
  new.settlement_snapshot:=new.settlement_snapshot-array['utility_balance','legal_balance','supplemental_review','supplemental_reviewed_at'];
  if not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=new.workspace_id and a.lease_id=new.lease_id)
   and not exists(select 1 from private.aqari_tenant_ledger_entries e where e.workspace_id=new.workspace_id and e.lease_id=new.lease_id)
   and not exists(select 1 from private.aqari_legal_cases c where c.workspace_id=new.workspace_id and c.lease_id=new.lease_id and c.status<>'closed')
   and not private.aqari_vacating_has_open_utility(new.workspace_id,new.lease_id) then
   new.settlement_snapshot:=new.settlement_snapshot||jsonb_build_object(
    'utility_balance','0.000','legal_balance','0.000',
    'supplemental_review','no supplemental lease ledger entries, open legal case or unresolved property bill at finalization',
    'supplemental_reviewed_at',now());
  end if;
 end if;
 return new;
end $$;
revoke all on function private.aqari_vacating_supplemental_snapshot_guard() from public,anon,authenticated;
drop trigger if exists aqari_vacating_supplemental_snapshot on private.aqari_vacating_settlements;
create trigger aqari_vacating_supplemental_snapshot before update on private.aqari_vacating_settlements
 for each row execute function private.aqari_vacating_supplemental_snapshot_guard();

create or replace function private.aqari_official_final_settlement_source_guard()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare series private.aqari_official_document_series;s private.aqari_vacating_settlements;credit_text text;
begin
 select * into strict series from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if series.kind<>'final_settlement' then return new;end if;
 perform private.aqari_require_sensitive_aal2(new.workspace_id);
 -- The public issue RPC already holds this lock before its source reads.
 -- Repeat it here so a future trusted writer cannot omit the ordering. The
 -- VOLATILE source query below observes committed bills after waiting.
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if not found then raise check_violation using message='DOCUMENT_WORKSPACE_UNAVAILABLE';end if;
 select * into s from private.aqari_vacating_settlements where workspace_id=series.workspace_id and lease_id=series.entity_id;
 if not found or s.status not in('finalized','cleared','released') or s.settlement_snapshot is null then
  raise check_violation using message='DOCUMENT_APPROVED_SETTLEMENT_REQUIRED';end if;
 -- Recheck live sources even when an old snapshot already says zero. Existing
 -- archived document GET/download and the clearance exception are unchanged.
 if private.aqari_vacating_has_open_utility(series.workspace_id,series.entity_id) then
  raise check_violation using message='DOCUMENT_OPEN_UTILITIES_REVIEW_REQUIRED';end if;
 if exists(select 1 from private.aqari_legal_cases c where c.workspace_id=series.workspace_id and c.lease_id=series.entity_id and c.status<>'closed') then
  raise check_violation using message='DOCUMENT_OPEN_LEGAL_REVIEW_REQUIRED';end if;
 credit_text:=s.settlement_snapshot#>>'{final_balances,tenant_credit}';
 if credit_text is null or credit_text!~'^-?[0-9]{1,15}(\.[0-9]{1,3})?$' then
  raise check_violation using message='DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED';end if;
 if credit_text::numeric<>0 then raise check_violation using message='DOCUMENT_TENANT_CREDIT_REVIEW_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_official_final_settlement_source_guard() from public,anon,authenticated;
drop trigger if exists aqari_official_final_settlement_source_guard on private.aqari_official_document_versions;
create trigger aqari_official_final_settlement_source_guard before insert on private.aqari_official_document_versions
 for each row execute function private.aqari_official_final_settlement_source_guard();


-- SOURCE: staging-database/sql/commercial-collections.sql
-- Verified administrative recording of commercial receipts, never a bank action.
-- Apply after commercial-sales.sql, commercial-sales-vacating-guard.sql and
-- collection-account-management.sql. All amounts are KWD, independent of rent.

-- An existing rent-payment allocation is a different receipt source. A lease
-- keeps that mode for its entire history, including reversed allocations.
create or replace function private.aqari_commercial_legacy_history(w uuid,lid uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare found_history boolean:=false;begin
 if to_regclass('private.aqari_commercial_payment_allocations') is not null then
  execute 'select exists(select 1 from private.aqari_commercial_payment_allocations where workspace_id=$1 and lease_id=$2)' into found_history using w,lid;
 end if;
 return found_history;
end $$;
revoke all on function private.aqari_commercial_legacy_history(uuid,uuid) from public,anon,authenticated;
create table if not exists private.aqari_commercial_collections(
 id uuid primary key,workspace_id uuid not null,lease_id uuid not null,account_id uuid not null,
 account_snapshot jsonb not null,method text not null check(method in('cash','bank_transfer')),
 occurred_on date not null,amount numeric(15,3) not null check(amount>0),
 reference text not null check(length(btrim(reference)) between 3 and 160),
 source_document_id uuid not null references public.aqari_documents(id),source_checksum text not null check(source_checksum~'^[a-f0-9]{64}$'),
 request_data jsonb not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(workspace_id,account_id,reference),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(workspace_id,account_id) references private.aqari_collection_accounts(workspace_id,id)
);
create table if not exists private.aqari_commercial_collection_allocations(
 workspace_id uuid not null,collection_id uuid not null,sale_id uuid not null,amount numeric(15,3) not null check(amount>0),
 primary key(workspace_id,collection_id,sale_id),
 foreign key(workspace_id,collection_id) references private.aqari_commercial_collections(workspace_id,id),
 foreign key(workspace_id,sale_id) references private.aqari_commercial_sales(workspace_id,id)
);
create index if not exists aqari_commercial_allocations_sale on private.aqari_commercial_collection_allocations(workspace_id,sale_id);
create index if not exists aqari_commercial_collections_lease_date on private.aqari_commercial_collections(workspace_id,lease_id,occurred_on,id);
create table if not exists private.aqari_commercial_collection_reversals(
 id uuid primary key,workspace_id uuid not null,collection_id uuid not null,amount numeric(15,3) not null check(amount>0),
 occurred_on date not null,reason text not null check(length(btrim(reason)) between 5 and 500),
 request_data jsonb not null,recorded_by uuid not null,recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(workspace_id,collection_id),
 foreign key(workspace_id,collection_id) references private.aqari_commercial_collections(workspace_id,id)
);
do $$declare n text;begin
 foreach n in array array['aqari_commercial_collections','aqari_commercial_collection_allocations','aqari_commercial_collection_reversals'] loop
  execute format('alter table private.%I enable row level security',n);
  execute format('revoke all on private.%I from public,anon,authenticated',n);
  execute format('drop trigger if exists %I on private.%I',n||'_immutable',n);
  execute format('create trigger %I before update or delete on private.%I for each row execute function private.aqari_reject_immutable_change()',n||'_immutable',n);
 end loop;
end $$;

-- Internal integrity check. No role can execute this helper directly. Its
-- public read/write callers check identity and property scope before entering.
create or replace function private.aqari_assert_commercial_collections(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if private.aqari_commercial_legacy_history(w,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if exists(select 1 from private.aqari_commercial_collections c
  where c.workspace_id=w and c.lease_id=lid and (
   c.amount<>(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.collection_id=c.id)
   or c.account_snapshot->>'id' is distinct from c.account_id::text
   or c.account_snapshot->>'currency' is distinct from 'KWD'
   or c.account_snapshot->>'property_id' is distinct from (select u.property_id::text from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w and l.id=lid)
   or c.account_snapshot->>'kind' is distinct from case c.method when 'cash' then 'cashbox' else 'bank' end
   or exists(select 1 from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=c.id and (r.amount<>c.amount or r.occurred_on<c.occurred_on))
  )) or exists(
   select 1 from private.aqari_commercial_collection_allocations a
   join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
   join private.aqari_commercial_sales s on s.workspace_id=a.workspace_id and s.id=a.sale_id
   left join private.aqari_commercial_sales_reversals sr on sr.workspace_id=s.workspace_id and sr.sale_id=s.id
   left join private.aqari_commercial_collection_reversals cr on cr.workspace_id=c.workspace_id and cr.collection_id=c.id
   where a.workspace_id=w and (c.lease_id=lid or s.lease_id=lid) and (
    c.lease_id<>s.lease_id or a.amount>s.amount or c.occurred_on<s.period_end
    or (sr.id is not null and (cr.id is null or cr.occurred_on>sr.occurred_on))
   )
  ) or exists(
   select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and
   s.amount<(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a
    where a.workspace_id=w and a.sale_id=s.id and not exists(select 1 from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=a.collection_id))
  ) or exists(
   -- A later reversal must not make a backdated replacement receipt appear
   -- valid while it overpays the original charge at an earlier cutoff date.
   select 1 from (
    select e.sale_id,e.on_date,sum(sum(e.delta)) over(partition by e.sale_id order by e.on_date) paid
    from (
     select a.sale_id,c.occurred_on on_date,a.amount delta from private.aqari_commercial_collection_allocations a
      join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id where c.workspace_id=w and c.lease_id=lid
     union all
     select a.sale_id,r.occurred_on,-a.amount from private.aqari_commercial_collection_allocations a
      join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
      join private.aqari_commercial_collection_reversals r on r.workspace_id=c.workspace_id and r.collection_id=c.id where c.workspace_id=w and c.lease_id=lid
    )e group by e.sale_id,e.on_date
   )history join private.aqari_commercial_sales s on s.workspace_id=w and s.id=history.sale_id where history.paid<0 or history.paid>s.amount
  ) then raise check_violation using message='COMMERCIAL_COLLECTION_LEDGER_MISMATCH';end if;
end $$;
revoke all on function private.aqari_assert_commercial_collections(uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_commercial_balance(w uuid,lid uuid,as_of date) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare charges numeric:=0;charge_reversals numeric:=0;receipts numeric:=0;receipt_reversals numeric:=0;rows jsonb;
begin
 if auth.uid() is null or not private.aqari_can(w,'finance','read') or not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if as_of is null or as_of>(now() at time zone 'Asia/Kuwait')::date then raise invalid_parameter_value using message='INVALID_COMMERCIAL_AS_OF';end if;
 -- Keep the totals and event lines on one serialized financial history even
 -- when this helper is called independently by another statement/report RPC.
 perform 1 from public.aqari_app_state where workspace_id=w for share;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_assert_commercial_collections(w,lid);
 select coalesce(sum(s.amount),0) into charges from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end<=as_of;
 select coalesce(sum(s.amount),0) into charge_reversals from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.occurred_on<=as_of;
 select coalesce(sum(c.amount),0) into receipts from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=as_of;
 select coalesce(sum(r.amount),0) into receipt_reversals from private.aqari_commercial_collection_reversals r join private.aqari_commercial_collections c on c.workspace_id=r.workspace_id and c.id=r.collection_id where r.workspace_id=w and c.lease_id=lid and r.occurred_on<=as_of;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'source_type',x.source_type,'occurred_on',x.occurred_on,'amount',to_char(x.amount,'FM999999999999990.000'),'direction',x.direction,'sale_id',x.sale_id,'collection_id',x.collection_id,'reference',x.reference) order by x.occurred_on,x.source_type,x.id),'[]') into rows from (
  select s.id,'commercial_sales'::text source_type,s.period_end occurred_on,s.amount,'debit'::text direction,s.id sale_id,null::uuid collection_id,s.source_reference reference from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.period_end<=as_of
  union all select r.id,'commercial_sales_reversal',r.occurred_on,s.amount,'credit',s.id,null,r.reason from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.occurred_on<=as_of
  union all select c.id,'commercial_collection',c.occurred_on,c.amount,'credit',null,c.id,c.reference from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid and c.occurred_on<=as_of
  union all select r.id,'commercial_collection_reversal',r.occurred_on,r.amount,'debit',null,c.id,r.reason from private.aqari_commercial_collection_reversals r join private.aqari_commercial_collections c on c.workspace_id=r.workspace_id and c.id=r.collection_id where r.workspace_id=w and c.lease_id=lid and r.occurred_on<=as_of
 )x;
 return jsonb_build_object('lease_id',lid,'as_of',as_of,'charge_total',to_char(charges,'FM999999999999990.000'),'reversed_charge_total',to_char(charge_reversals,'FM999999999999990.000'),'collected_total',to_char(receipts,'FM999999999999990.000'),'collection_reversed_total',to_char(receipt_reversals,'FM999999999999990.000'),'balance',to_char(charges-charge_reversals-receipts+receipt_reversals,'FM999999999999990.000'),'lines',rows);
end $$;
revoke all on function private.aqari_commercial_balance(uuid,uuid,date) from public,anon,authenticated;

create or replace function private.aqari_commercial_collection_json(w uuid,ident uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('collection',to_jsonb(c)||jsonb_build_object('amount',to_char(c.amount,'FM999999999999990.000')),
  'allocations',(select coalesce(jsonb_agg(jsonb_build_object('sale_id',a.sale_id,'amount',to_char(a.amount,'FM999999999999990.000')) order by a.sale_id),'[]') from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.collection_id=c.id),
  'reversal',(select to_jsonb(r)||jsonb_build_object('amount',to_char(r.amount,'FM999999999999990.000')) from private.aqari_commercial_collection_reversals r where r.workspace_id=w and r.collection_id=c.id))
 from private.aqari_commercial_collections c where c.workspace_id=w and c.id=ident
$$;
revoke all on function private.aqari_commercial_collection_json(uuid,uuid) from public,anon,authenticated;

-- Deferred constraints reject a partial header, changed source or over-allocation
-- even if a future trusted writer forgets the explicit RPC verification.
create or replace function private.aqari_commercial_collection_integrity_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;begin
 if tg_table_name='aqari_commercial_collections' then lid:=new.lease_id;
 else select c.lease_id into strict lid from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.id=new.collection_id;end if;
 perform private.aqari_assert_commercial_collections(new.workspace_id,lid);return new;
end $$;
revoke all on function private.aqari_commercial_collection_integrity_guard() from public,anon,authenticated;
do $$declare n text;begin
 foreach n in array array['aqari_commercial_collections','aqari_commercial_collection_allocations','aqari_commercial_collection_reversals'] loop
  execute format('drop trigger if exists %I on private.%I',n||'_integrity',n);
  execute format('create constraint trigger %I after insert on private.%I deferrable initially deferred for each row execute function private.aqari_commercial_collection_integrity_guard()',n||'_integrity',n);
 end loop;
end $$;

create or replace function private.aqari_commercial_collection_write_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare lid uuid;begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if tg_table_name='aqari_commercial_collections' then lid:=new.lease_id;
 else select c.lease_id into strict lid from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.id=new.collection_id;end if;
 perform private.aqari_financial_open(new.workspace_id,new.occurred_on);
 if private.aqari_commercial_legacy_history(new.workspace_id,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 if exists(select 1 from public.aqari_leases l where l.workspace_id=new.workspace_id and l.id=lid and l.vacated_on is not null)
  or exists(select 1 from private.aqari_vacating_settlements s where s.workspace_id=new.workspace_id and s.lease_id=lid and s.status in('cleared','released')) then raise check_violation using message='COMMERCIAL_COLLECTION_AFTER_CLEARANCE';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_collection_write_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_collection_write_guard on private.aqari_commercial_collections;
create trigger aqari_commercial_collection_write_guard before insert on private.aqari_commercial_collections for each row execute function private.aqari_commercial_collection_write_guard();
drop trigger if exists aqari_commercial_collection_reversal_write_guard on private.aqari_commercial_collection_reversals;
create trigger aqari_commercial_collection_reversal_write_guard before insert on private.aqari_commercial_collection_reversals for each row execute function private.aqari_commercial_collection_write_guard();

create or replace function private.aqari_commercial_sale_collection_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_commercial_collection_allocations a
  join private.aqari_commercial_collections c on c.workspace_id=a.workspace_id and c.id=a.collection_id
  left join private.aqari_commercial_collection_reversals r on r.workspace_id=c.workspace_id and r.collection_id=c.id
  where a.workspace_id=new.workspace_id and a.sale_id=new.sale_id and (r.id is null or r.occurred_on>new.occurred_on)) then
  raise check_violation using message='COMMERCIAL_SALE_HAS_COLLECTION';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_sale_collection_guard() from public,anon,authenticated;
drop trigger if exists aqari_commercial_sale_collection_guard on private.aqari_commercial_sales_reversals;
create trigger aqari_commercial_sale_collection_guard before insert on private.aqari_commercial_sales_reversals for each row execute function private.aqari_commercial_sale_collection_guard();

create or replace function private.aqari_commercial_collections_register(w uuid,action text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare actor uuid:=auth.uid();lid uuid;ident uuid;account_ident uuid;posted date;as_of date;today date:=(now() at time zone 'Asia/Kuwait')::date;
 l public.aqari_leases;p public.aqari_properties;account private.aqari_collection_accounts;doc public.aqari_documents;
 c private.aqari_commercial_collections;r private.aqari_commercial_collection_reversals;s private.aqari_commercial_sales;
 item jsonb;request jsonb;allocations jsonb;amount_value numeric(15,3);allocated numeric(15,3);paid numeric;total numeric:=0;result jsonb;
begin
 if actor is null or not private.aqari_can(w,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>24000 or action is null or action not in('list','get','record','reverse') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_ACTION';end if;
 if action='list' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('lease_id','as_of')) then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  perform 1 from public.aqari_app_state where workspace_id=w for share;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  as_of:=coalesce(nullif(d->>'as_of','')::date,today);lid:=nullif(d->>'lease_id','')::uuid;
  if as_of>today then raise invalid_parameter_value using message='INVALID_COMMERCIAL_AS_OF';end if;
  if lid is not null then
   if not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   select q.* into strict l from public.aqari_leases q where q.workspace_id=w and q.id=lid;
   select z.* into strict p from public.aqari_properties z join public.aqari_units u on u.workspace_id=z.workspace_id and u.property_id=z.id where u.workspace_id=w and u.id=l.unit_id;
  end if;
  if lid is not null and private.aqari_commercial_legacy_history(w,lid) then
   return jsonb_build_object('as_of',as_of,'mode','legacy_payment_allocation','unavailable_reason','COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED','can_manage',false,
    'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'contract_no',q.contract_no,'external_ref',q.external_ref,'property_id',z.id,'property_ref',z.external_ref,'property_name',z.name,'collection_mode',case when private.aqari_commercial_legacy_history(w,q.id) then 'legacy_payment_allocation' else 'independent_collection' end) order by q.contract_no,q.id),'[]')
     from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id join public.aqari_properties z on z.workspace_id=u.workspace_id and z.id=u.property_id
     where q.workspace_id=w and private.aqari_can_lease(w,q.id,'finance','read') and exists(select 1 from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=q.id)),
    'accounts','[]'::jsonb,'documents','[]'::jsonb,'statement',null,'sales','[]'::jsonb,'collections','[]'::jsonb);
  end if;
  return jsonb_build_object('as_of',as_of,'mode','independent_collection','unavailable_reason',null,'can_manage',private.aqari_manager(w) and private.aqari_can(w,'finance','write') and (lid is null or private.aqari_can_lease(w,lid,'finance','write')),'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'contract_no',q.contract_no,'external_ref',q.external_ref,'property_id',z.id,'property_ref',z.external_ref,'property_name',z.name,'collection_mode',case when private.aqari_commercial_legacy_history(w,q.id) then 'legacy_payment_allocation' else 'independent_collection' end) order by q.contract_no,q.id),'[]')
   from public.aqari_leases q join public.aqari_units u on u.workspace_id=q.workspace_id and u.id=q.unit_id join public.aqari_properties z on z.workspace_id=u.workspace_id and z.id=u.property_id
   where q.workspace_id=w and private.aqari_can_lease(w,q.id,'finance','read') and exists(select 1 from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=q.id)),
   'accounts',(select coalesce(jsonb_agg(to_jsonb(a)-'created_by' order by a.name,a.id),'[]') from private.aqari_collection_accounts a where a.workspace_id=w and a.property_id=p.id and a.status='active'),
   'documents',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]') from (
    select dd.id,dd.title,dd.entity_type,dd.entity_ref,dd.created_at from public.aqari_documents dd join storage.objects o on o.bucket_id=dd.storage_bucket and o.name=dd.storage_path
    where dd.workspace_id=w and dd.status='uploaded' and ((dd.entity_type='lease' and dd.entity_ref=l.external_ref) or(dd.entity_type='property' and dd.entity_ref=p.external_ref))
     and dd.size_bytes>0 and dd.checksum_sha256~'^[a-f0-9]{64}$' and (o.metadata->>'size')::bigint=dd.size_bytes and o.metadata->>'mimetype'=dd.mime_type
     and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,dd.entity_type,dd.entity_ref,'read') limit 200)x),
   'statement',case when lid is null then null else private.aqari_commercial_balance(w,lid,as_of) end,
   'sales',(select coalesce(jsonb_agg(jsonb_build_object('id',ss.id,'month',ss.month,'amount',to_char(ss.amount,'FM999999999999990.000'),'period_end',ss.period_end,'reference',ss.source_reference,'reversed',exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=ss.id and sr.occurred_on<=as_of),
     'outstanding',to_char(case when exists(select 1 from private.aqari_commercial_sales_reversals sr where sr.workspace_id=w and sr.sale_id=ss.id and sr.occurred_on<=as_of) then 0 else ss.amount-(select coalesce(sum(a.amount),0) from private.aqari_commercial_collection_allocations a join private.aqari_commercial_collections cc on cc.workspace_id=a.workspace_id and cc.id=a.collection_id where a.workspace_id=w and a.sale_id=ss.id and cc.occurred_on<=as_of and not exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=a.collection_id and rr.occurred_on<=as_of)) end,'FM999999999999990.000')) order by ss.month,ss.id),'[]') from private.aqari_commercial_sales ss where ss.workspace_id=w and ss.lease_id=lid and ss.period_end<=as_of),
   'collections',(select coalesce(jsonb_agg(case when (proof#>>'{reversal,occurred_on}')::date>as_of then proof||'{"reversal":null}'::jsonb else proof end order by cc.occurred_on desc,cc.id),'[]') from private.aqari_commercial_collections cc cross join lateral(select private.aqari_commercial_collection_json(w,cc.id) proof)x where cc.workspace_id=w and cc.lease_id=lid and cc.occurred_on<=as_of));
 end if;
 ident:=nullif(d->>'id','')::uuid;if ident is null then raise invalid_parameter_value using message='COMMERCIAL_COLLECTION_ID_REQUIRED';end if;
 if action='get' then
  if exists(select 1 from jsonb_object_keys(d)k where k<>'id') then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=ident;
  if not found then return jsonb_build_object('collection',null,'allocations','[]'::jsonb,'reversal',null);end if;
  if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  return private.aqari_commercial_collection_json(w,ident);
 end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 perform 1 from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if coalesce(d->>'occurred_on','') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
 posted:=(d->>'occurred_on')::date;if posted>today then raise check_violation using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
 if action='record' then
  if exists(select 1 from jsonb_object_keys(d)k where k not in('id','lease_id','account_id','account_revision','method','occurred_on','reference','source_document_id','amount','allocations'))
   or coalesce(d->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' or (d->>'amount')::numeric<=0
   or d->>'method' not in('cash','bank_transfer') or nullif(d->>'method','') is null
   or coalesce(d->>'account_revision','') !~ '^[1-9][0-9]{0,8}$'
   or length(btrim(coalesce(d->>'reference',''))) not between 3 and 160
   or jsonb_typeof(d->'allocations') is distinct from 'array' then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REQUEST';end if;
  if jsonb_array_length(d->'allocations') not between 1 and 60 then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATIONS';end if;
  amount_value:=(d->>'amount')::numeric;allocations:='[]';
  for item in select value from jsonb_array_elements(d->'allocations') loop
   if jsonb_typeof(item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(item)k where k not in('sale_id','amount')) or coalesce(item->>'amount','') !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' or (item->>'amount')::numeric<=0 or nullif(item->>'sale_id','') is null then raise invalid_parameter_value using message='INVALID_COMMERCIAL_ALLOCATIONS';end if;
   allocations:=allocations||jsonb_build_array(jsonb_build_object('sale_id',(item->>'sale_id')::uuid,'amount',to_char((item->>'amount')::numeric,'FM999999999999990.000')));total:=total+(item->>'amount')::numeric;
  end loop;
  if total<>amount_value or (select count(distinct x->>'sale_id') from jsonb_array_elements(allocations)x)<>jsonb_array_length(allocations) then raise check_violation using message='COMMERCIAL_ALLOCATION_TOTAL_MISMATCH';end if;
  select jsonb_agg(x order by x->>'sale_id') into allocations from jsonb_array_elements(allocations)x;
  request:=d||jsonb_build_object('amount',to_char(amount_value,'FM999999999999990.000'),'reference',btrim(d->>'reference'),'allocations',allocations);
  select * into c from private.aqari_commercial_collections x where x.id=ident;
  if found then
   if c.workspace_id<>w or c.request_data is distinct from request or c.recorded_by<>actor then raise unique_violation using message='COMMERCIAL_COLLECTION_RETRY_CONFLICT';end if;
   if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   return private.aqari_commercial_collection_json(w,ident);
  end if;
  lid:=nullif(d->>'lease_id','')::uuid;account_ident:=nullif(d->>'account_id','')::uuid;
 else
  if exists(select 1 from jsonb_object_keys(d)k where k not in('id','collection_id','occurred_on','reason')) or length(btrim(coalesce(d->>'reason',''))) not between 5 and 500 then raise invalid_parameter_value using message='INVALID_COMMERCIAL_COLLECTION_REVERSAL';end if;
  request:=d||jsonb_build_object('reason',btrim(d->>'reason'));
  select * into r from private.aqari_commercial_collection_reversals x where x.id=ident;
  if found then
   if r.workspace_id<>w or r.request_data is distinct from request or r.recorded_by<>actor then raise unique_violation using message='COMMERCIAL_COLLECTION_RETRY_CONFLICT';end if;
   select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=r.collection_id;
   if not private.aqari_can_lease(w,c.lease_id,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   return private.aqari_commercial_collection_json(w,c.id);
  end if;
  select * into c from private.aqari_commercial_collections x where x.workspace_id=w and x.id=nullif(d->>'collection_id','')::uuid;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  lid:=c.lease_id;account_ident:=c.account_id;
 end if;
 if not private.aqari_can_lease(w,lid,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into l from public.aqari_leases q where q.workspace_id=w and q.id=lid for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if private.aqari_commercial_legacy_history(w,lid) then raise check_violation using message='COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED';end if;
 select z.* into strict p from public.aqari_properties z join public.aqari_units u on u.workspace_id=z.workspace_id and u.property_id=z.id where u.workspace_id=w and u.id=l.unit_id;
 perform private.aqari_financial_open(w,posted);
 if action='record' then
  if l.status not in('signed','expired') then raise check_violation using message='COMMERCIAL_COLLECTION_CONTRACT_REQUIRED';end if;
  select * into account from private.aqari_collection_accounts a where a.workspace_id=w and a.id=account_ident for update;
  if not found or account.property_id<>p.id or account.status<>'active' or account.currency<>'KWD' or account.kind<>(case d->>'method' when 'cash' then 'cashbox' else 'bank' end) then raise check_violation using message='COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH';end if;
  if account.revision<>(d->>'account_revision')::integer then raise serialization_failure using message='COMMERCIAL_COLLECTION_ACCOUNT_CHANGED';end if;
  select dd.* into doc from public.aqari_documents dd join storage.objects o on o.bucket_id=dd.storage_bucket and o.name=dd.storage_path
   where dd.workspace_id=w and dd.id=nullif(d->>'source_document_id','')::uuid and dd.status='uploaded'
    and ((dd.entity_type='lease' and dd.entity_ref=l.external_ref) or(dd.entity_type='property' and dd.entity_ref=p.external_ref))
    and dd.size_bytes>0 and dd.checksum_sha256~'^[a-f0-9]{64}$' and (o.metadata->>'size')::bigint=dd.size_bytes and o.metadata->>'mimetype'=dd.mime_type
    and private.aqari_can(w,'documents','read') and private.aqari_document_entity(w,dd.entity_type,dd.entity_ref,'read');
  if not found then raise check_violation using message='COMMERCIAL_COLLECTION_DOCUMENT_UNVERIFIED';end if;
  perform private.aqari_assert_commercial_collections(w,lid);
  for item in select value from jsonb_array_elements(allocations) loop
   select * into s from private.aqari_commercial_sales x where x.workspace_id=w and x.lease_id=lid and x.id=(item->>'sale_id')::uuid for share;
   if not found or s.amount<=0 or exists(select 1 from private.aqari_commercial_sales_reversals rr where rr.workspace_id=w and rr.sale_id=s.id) then raise check_violation using message='COMMERCIAL_ALLOCATION_SOURCE_INVALID';end if;
   if posted<s.period_end then raise check_violation using message='COMMERCIAL_COLLECTION_BEFORE_CHARGE';end if;
   select coalesce(sum(a.amount),0) into paid from private.aqari_commercial_collection_allocations a where a.workspace_id=w and a.sale_id=s.id and not exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=a.collection_id);
   if paid+(item->>'amount')::numeric>s.amount then raise check_violation using message='COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE';end if;
  end loop;
  insert into private.aqari_commercial_collections(id,workspace_id,lease_id,account_id,account_snapshot,method,occurred_on,amount,reference,source_document_id,source_checksum,request_data,recorded_by)
   values(ident,w,lid,account.id,jsonb_build_object('id',account.id,'property_id',account.property_id,'kind',account.kind,'name',account.name,'masked_reference',account.masked_reference,'currency',account.currency,'revision',account.revision),d->>'method',posted,amount_value,btrim(d->>'reference'),doc.id,doc.checksum_sha256,request,actor);
  insert into private.aqari_commercial_collection_allocations(workspace_id,collection_id,sale_id,amount) select w,ident,(x->>'sale_id')::uuid,(x->>'amount')::numeric from jsonb_array_elements(allocations)x;
  result:=private.aqari_commercial_collection_json(w,ident);
 else
  if posted<c.occurred_on then raise check_violation using message='INVALID_COMMERCIAL_COLLECTION_DATE';end if;
  if exists(select 1 from private.aqari_commercial_collection_reversals rr where rr.workspace_id=w and rr.collection_id=c.id) then raise unique_violation using message='COMMERCIAL_COLLECTION_ALREADY_REVERSED';end if;
  insert into private.aqari_commercial_collection_reversals(id,workspace_id,collection_id,amount,occurred_on,reason,request_data,recorded_by) values(ident,w,c.id,c.amount,posted,btrim(d->>'reason'),request,actor);
  result:=private.aqari_commercial_collection_json(w,c.id);
 end if;
 perform private.aqari_assert_commercial_collections(w,lid);
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
  values(w,'commercial_collections',ident,action,actor,coalesce(auth.jwt()->>'email',actor::text),coalesce(request->>'reference',request->>'reason'),result);
 return result;
end $$;
revoke all on function private.aqari_commercial_collections_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_commercial_collections_register(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_commercial_collections(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_commercial_collections_register(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_commercial_collections(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_commercial_collections(uuid,text,jsonb) to authenticated;

-- The independent mode has its own source checks and cutoff boundary.
create or replace function private.aqari_independent_commercial_clearance(w uuid,lid uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 -- Reject incomplete or unrelated financial source links instead of allowing a
 -- generic credit or a rent payment to erase a separately evidenced obligation.
 if exists(
  select 1 from private.aqari_commercial_sales s
  left join private.aqari_commercial_sales_reversals r on r.workspace_id=s.workspace_id and r.sale_id=s.id
  where s.workspace_id=w and s.lease_id=lid and s.amount>0 and (
   not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales' and a.source_id=s.id and a.direction='debit' and a.amount=s.amount)
   or (r.id is not null and not exists(select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid
    and a.kind='commercial_sales' and a.source_type='commercial_sales_reversal' and a.source_id=r.id and a.direction='credit' and a.amount=s.amount))
  )
 ) or exists(
  select 1 from private.aqari_tenant_adjustments a where a.workspace_id=w and a.lease_id=lid and a.kind='commercial_sales' and not (
   (a.direction='debit' and a.source_type='commercial_sales' and exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.id=a.source_id and s.amount=a.amount))
   or (a.direction='credit' and a.source_type='commercial_sales_reversal' and exists(select 1 from private.aqari_commercial_sales_reversals r join private.aqari_commercial_sales s on s.workspace_id=r.workspace_id and s.id=r.sale_id where r.workspace_id=w and s.lease_id=lid and r.id=a.source_id and s.amount=a.amount))
  )
 ) then
  raise check_violation using message='قيود نسبة المبيعات تحتاج مطابقة مصادرها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='COMMERCIAL_SALES_LEDGER_REVIEW_REQUIRED';
 end if;
 if to_regprocedure('private.aqari_commercial_balance(uuid,uuid,date)') is not null then
  if (private.aqari_commercial_balance(w,lid,(now() at time zone 'Asia/Kuwait')::date)->>'balance')::numeric<>0 then
   raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجع تسجيل التحصيل الموثق وتخصيصه قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
  end if;
  if exists(select 1 from private.aqari_vacating_settlements v where v.workspace_id=w and v.lease_id=lid and (private.aqari_commercial_balance(w,lid,v.vacate_date)->>'balance')::numeric<>0) then
   raise check_violation using message='COMMERCIAL_COLLECTION_CUTOFF_REVIEW_REQUIRED';
  end if;
  return;
 end if;
 if exists(select 1 from private.aqari_commercial_sales s where s.workspace_id=w and s.lease_id=lid and s.amount>0
  and not exists(select 1 from private.aqari_commercial_sales_reversals r where r.workspace_id=w and r.sale_id=s.id)) then
  raise check_violation using message='توجد مستحقات نسبة مبيعات غير محسومة. راجعها قبل اعتماد التسوية أو براءة الذمة أو إنهاء العقد؛ دفعة الإيجار وحدها لا تسدد هذا الاستحقاق.',detail='VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED';
 end if;
end $$;
revoke all on function private.aqari_independent_commercial_clearance(uuid,uuid) from public,anon,authenticated;

-- A legacy allocation can never be introduced after this lease starts the
-- independent receipt ledger, even when every independent receipt was reversed.
create or replace function private.aqari_commercial_legacy_mode_guard() returns trigger
language plpgsql volatile security definer set search_path='' as $$
begin
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 if exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=new.workspace_id and c.lease_id=new.lease_id) then
  raise check_violation using message='COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED';end if;
 return new;
end $$;
revoke all on function private.aqari_commercial_legacy_mode_guard() from public,anon,authenticated;

-- Preserve the currently installed allocation rules once, never a prior wrapper.
-- A subsequent unrelated rewrite fails closed instead of silently replacing it.
do $compat$
declare guard_source text;balance_source text;guard_saved boolean;balance_saved boolean;
begin
 if to_regclass('private.aqari_commercial_payment_allocations') is null then
  execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
   language plpgsql volatile security definer set search_path='' as $fn$begin perform private.aqari_independent_commercial_clearance(w,lid);end $fn$;$install$;
  revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
  return;
 end if;
 if to_regclass('private.aqari_commercial_active_allocations') is null then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 guard_source:=pg_get_functiondef('private.aqari_require_commercial_clearance(uuid,uuid)'::regprocedure);
 balance_source:=pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure);
 guard_saved:=to_regprocedure('private.aqari_legacy_allocation_clearance(uuid,uuid)') is not null;
 balance_saved:=to_regprocedure('private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)') is not null;
 if guard_saved<>balance_saved then raise exception 'COMMERCIAL_COMPAT_SOURCE_INCOMPLETE';end if;
 if not guard_saved then
  if position('aqari_commercial_active_allocations' in guard_source)=0 or position('aqari_commercial_active_allocations' in balance_source)=0
   or position('aqari_legacy_allocation_clearance' in guard_source)>0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)>0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
  execute replace(guard_source,'CREATE OR REPLACE FUNCTION private.aqari_require_commercial_clearance(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_clearance(');
  execute replace(balance_source,'CREATE OR REPLACE FUNCTION private.aqari_vacating_balances(','CREATE OR REPLACE FUNCTION private.aqari_legacy_allocation_vacating_balances(');
 else
  if position('aqari_legacy_allocation_clearance' in guard_source)=0 or position('aqari_legacy_allocation_vacating_balances' in balance_source)=0 then raise exception 'COMMERCIAL_COMPAT_SOURCE_CHANGED';end if;
 end if;
 revoke all on function private.aqari_legacy_allocation_clearance(uuid,uuid),private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date) from public,anon,authenticated;
 execute $install$create or replace function private.aqari_require_commercial_clearance(w uuid,lid uuid) returns void
  language plpgsql volatile security definer set search_path='' as $fn$
  begin
   perform 1 from public.aqari_app_state where workspace_id=w for update;
   if exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then
    perform private.aqari_independent_commercial_clearance(w,lid);
   else
    perform private.aqari_legacy_allocation_clearance(w,lid);
   end if;
  end $fn$;$install$;
 execute $install$create or replace function private.aqari_vacating_balances(w uuid,lid uuid,vdate date) returns jsonb
  language plpgsql volatile security definer set search_path='' as $fn$
  declare original jsonb;commercial jsonb;due_value numeric;paid_value numeric;balance_value numeric;
  begin
   if auth.uid() is null or not private.aqari_can_lease(w,lid,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
   perform 1 from public.aqari_app_state where workspace_id=w for share;
   original:=private.aqari_legacy_allocation_vacating_balances(w,lid,vdate);
   if not exists(select 1 from private.aqari_commercial_collections c where c.workspace_id=w and c.lease_id=lid) then return original;end if;
   commercial:=private.aqari_commercial_balance(w,lid,vdate);
   due_value:=(commercial->>'charge_total')::numeric-(commercial->>'reversed_charge_total')::numeric;
   paid_value:=(commercial->>'collected_total')::numeric-(commercial->>'collection_reversed_total')::numeric;
   balance_value:=(commercial->>'balance')::numeric;
   return original||jsonb_build_object(
    'commercial_collection_mode','independent_collection',
    'commercial_sales_due_total',due_value::numeric(18,3)::text,
    'commercial_sales_paid_total',paid_value::numeric(18,3)::text,
    'commercial_sales_balance',balance_value::numeric(18,3)::text,
    'unified_due_balance',((original->>'rent_balance')::numeric+balance_value)::numeric(18,3)::text);
  end $fn$;$install$;
 revoke all on function private.aqari_require_commercial_clearance(uuid,uuid) from public,anon,authenticated;
 execute 'drop trigger if exists aqari_commercial_legacy_mode_guard on private.aqari_commercial_payment_allocations';
 execute 'create trigger aqari_commercial_legacy_mode_guard before insert on private.aqari_commercial_payment_allocations for each row execute function private.aqari_commercial_legacy_mode_guard()';
end $compat$;
-- Accept only the known five-field clearance shape when every added source
-- amount is genuinely zero. Existing snapshots and release authorizations stay
-- unchanged; a new obligation or unknown field still requires fresh review.
create or replace function private.aqari_clearance_balances_compatible(w uuid,lid uuid,expected jsonb,actual jsonb) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare old_keys text[]:=array['rent_due_total','rent_paid_total','rent_balance','tenant_credit','deposit_balance'];
 allowed_keys text[]:=array['rent_due_total','rent_paid_total','rent_balance','tenant_credit','deposit_balance','rent_payment_total','commercial_allocated_from_payments','commercial_sales_due_total','commercial_sales_paid_total','commercial_sales_balance','unified_due_balance','commercial_collection_mode'];
begin
 if expected is null or actual is null or jsonb_typeof(expected)<>'object' or jsonb_typeof(actual)<>'object' then return false;end if;
 perform private.aqari_require_commercial_clearance(w,lid);
 if expected=actual then return true;end if;
 if (select count(*) from jsonb_object_keys(expected))<>5 or exists(select 1 from jsonb_object_keys(expected)k where not(k=any(old_keys)))
  or exists(select 1 from jsonb_object_keys(actual)k where not(k=any(allowed_keys))) then return false;end if;
 if exists(select 1 from unnest(old_keys)k where expected->k is distinct from actual->k) then return false;end if;
 if actual->>'commercial_collection_mode' is not null and actual->>'commercial_collection_mode'<>'independent_collection' then return false;end if;
 return actual->>'commercial_allocated_from_payments'='0.000'
  and actual->>'commercial_sales_due_total'='0.000' and actual->>'commercial_sales_paid_total'='0.000' and actual->>'commercial_sales_balance'='0.000'
  and actual->'rent_payment_total'=actual->'rent_paid_total'
  and actual->'unified_due_balance'=actual->'rent_balance';
end $$;
revoke all on function private.aqari_clearance_balances_compatible(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
do $release_comparison$
declare source text:=pg_get_functiondef('public.aqari_vacating_release(uuid,uuid,bigint)'::regprocedure);
 anchor text:='if clearance_balances is null or balances is distinct from clearance_balances then';
begin
 if position('private.aqari_clearance_balances_compatible' in source)=0 then
  if (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 then raise exception 'COMMERCIAL_RELEASE_COMPARISON_SOURCE_CHANGED';end if;
  execute replace(source,anchor,'if not coalesce(private.aqari_clearance_balances_compatible(w,lid,clearance_balances,balances),false) then');
 end if;
end $release_comparison$;


-- SOURCE: staging-database/sql/opening-balance-statement.sql
-- AQARI V267 opening balances: keep legacy opening positions separate from live collections.

-- Reject new contradictory entries without rewriting immutable historical rows.
-- Historical contradictions are rejected explicitly by the report below.
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='private.aqari_tenant_ledger_entries'::regclass and conname='aqari_opening_entry_direction') then
  alter table private.aqari_tenant_ledger_entries add constraint aqari_opening_entry_direction
   check((kind<>'opening_debit' or direction='debit') and (kind<>'opening_credit' or direction='credit')) not valid;
 end if;
end $$;

create or replace function private.aqari_opening_balance_statement(
  p_workspace_id uuid,
  p_tenant_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  w uuid := p_workspace_id;
  t uuid := p_tenant_id;
  opening_debit numeric(15,3);
  opening_credit numeric(15,3);
  non_opening_debit numeric(15,3);
  non_opening_credit numeric(15,3);
  actual_collections numeric(15,3);
begin
  if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  if t is not null and not exists(
    select 1 from public.aqari_tenants x where x.workspace_id=w and x.id=t
  ) then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;

  if exists(select 1 from private.aqari_tenant_ledger_entries e
    where e.workspace_id=w and (t is null or e.tenant_id=t)
      and ((e.kind='opening_debit' and e.direction<>'debit') or (e.kind='opening_credit' and e.direction<>'credit'))) then
    raise check_violation using message='OPENING_ENTRY_DIRECTION_CONFLICT';
  end if;

  select
    coalesce(sum(e.amount) filter(where e.kind in('opening_debit','opening_balance') and e.direction='debit'),0),
    coalesce(sum(e.amount) filter(where e.kind in('opening_credit','opening_balance') and e.direction='credit'),0),
    coalesce(sum(e.amount) filter(where e.kind not in('opening_debit','opening_credit','opening_balance') and e.direction='debit'),0),
    coalesce(sum(e.amount) filter(where e.kind not in('opening_debit','opening_credit','opening_balance') and e.direction='credit'),0)
  into opening_debit,opening_credit,non_opening_debit,non_opening_credit
  from private.aqari_tenant_ledger_entries e
  where e.workspace_id=w and (t is null or e.tenant_id=t);

  select coalesce(sum(p.amount),0)
  into actual_collections
  from public.aqari_rent_payments p
  join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id
  where p.workspace_id=w
    and (t is null or l.tenant_id=t)
    and p.status in('paid','partial','مدفوع','جزئي')
    and p.amount>0
    and not exists(
      select 1 from private.aqari_receipt_cancellations c
      where c.workspace_id=w and c.payment_id=p.id
    );

  return jsonb_build_object(
    'tenant_id',t,
    'opening_entries',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',e.id,
        'tenant_id',e.tenant_id,
        'tenant_name',tn.full_name,
        'lease_id',e.lease_id,
        'contract_no',l.contract_no,
        'direction',e.direction,
        'kind',e.kind,
        'amount',e.amount,
        'cutoff_date',e.occurred_on,
        'occurred_on',e.occurred_on,
        'date_meaning','ledger_entry_date_not_reviewed_cutoff',
        'reason',e.reason,
        'source_type',e.source_type,
        'source_id',e.source_id,
        'created_at',e.created_at
      ) order by e.occurred_on,e.created_at,e.id),'[]'::jsonb)
      from private.aqari_tenant_ledger_entries e
      join public.aqari_tenants tn on tn.workspace_id=e.workspace_id and tn.id=e.tenant_id
      left join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id
      where e.workspace_id=w
        and e.kind in('opening_debit','opening_credit','opening_balance')
        and (t is null or e.tenant_id=t)
    ),
    'totals',jsonb_build_object(
      'opening_debit',opening_debit,
      'opening_credit',opening_credit,
      'opening_net',opening_debit-opening_credit,
      'non_opening_debit',non_opening_debit,
      'non_opening_credit',non_opening_credit,
      'non_opening_net',non_opening_debit-non_opening_credit,
      'actual_collections',actual_collections
    ),
    'separation_rule','opening balances are ledger-only and never counted as rent payments or live collections',
    'scope','all_saved_entries_without_cutoff_reconciliation',
    'generated_at',now()
  );
end $$;

revoke all on function private.aqari_opening_balance_statement(uuid,uuid) from public,anon;
grant execute on function private.aqari_opening_balance_statement(uuid,uuid) to authenticated;
create or replace function public.aqari_opening_balance_statement(p_workspace_id uuid,p_tenant_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.aqari_opening_balance_statement(p_workspace_id,p_tenant_id)
$$;
revoke all on function public.aqari_opening_balance_statement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.aqari_opening_balance_statement(uuid,uuid) to authenticated;



-- SOURCE: staging-database/sql/opening-balance-reconciliation.sql
-- Independent, source-attested matching of selected opening lines. No posting or statement override.
-- Apply after opening-balance-statement.sql. Repeatable; no historical rows are rewritten.

create table if not exists private.aqari_opening_balance_reviews(
 id uuid primary key, workspace_id uuid not null, tenant_id uuid not null,
 cutoff_date date not null, cutoff_boundary text not null default 'end_of_day' check(cutoff_boundary='end_of_day'),
 revision integer not null check(revision>0), previous_review_id uuid references private.aqari_opening_balance_reviews(id),
 correction_reason text, review_fingerprint text not null check(review_fingerprint ~ '^[a-f0-9]{64}$'),
 source_document_id uuid not null references public.aqari_documents(id),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_reference text not null check(length(btrim(source_reference)) between 3 and 500),
 source_coverage text not null check(length(btrim(source_coverage)) between 3 and 2000),
 source_debit numeric(15,3) not null check(source_debit>=0), source_credit numeric(15,3) not null check(source_credit>=0),
 entry_ids uuid[] not null check(cardinality(entry_ids) between 1 and 1000),
 entries_snapshot jsonb not null, document_snapshot jsonb not null, request_snapshot jsonb not null,
 source_attestation boolean not null check(source_attestation), bytes_verified boolean not null check(bytes_verified),
 reviewed_by uuid not null, reviewed_by_name text not null, reviewed_at timestamptz not null default now(),
 unique(workspace_id,tenant_id,cutoff_date,revision),
 unique(workspace_id,review_fingerprint),
 check((revision=1 and previous_review_id is null and correction_reason is null) or (revision>1 and previous_review_id is not null and length(btrim(correction_reason)) between 3 and 1000)),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id)
);
alter table private.aqari_opening_balance_reviews enable row level security;
create index if not exists aqari_opening_review_source on private.aqari_opening_balance_reviews(source_document_id);
revoke all on private.aqari_opening_balance_reviews from public,anon,authenticated;
drop trigger if exists aqari_opening_reviews_immutable on private.aqari_opening_balance_reviews;
create trigger aqari_opening_reviews_immutable before update or delete on private.aqari_opening_balance_reviews
 for each row execute function private.aqari_reject_immutable_change();

-- Source identity and archived metadata cannot be rewritten after attestation.
create or replace function private.aqari_opening_source_preserved() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.aqari_opening_balance_reviews r where r.source_document_id=old.id)
  and (tg_op='DELETE' or row(new.workspace_id,new.entity_type,new.entity_ref,new.storage_bucket,new.storage_path,new.status,new.checksum_sha256,new.size_bytes,new.mime_type)
   is distinct from row(old.workspace_id,old.entity_type,old.entity_ref,old.storage_bucket,old.storage_path,old.status,old.checksum_sha256,old.size_bytes,old.mime_type)) then
  raise check_violation using message='OPENING_SOURCE_IMMUTABLE';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.aqari_opening_source_preserved() from public,anon,authenticated;
drop trigger if exists aqari_opening_source_preserved on public.aqari_documents;
create trigger aqari_opening_source_preserved before update or delete on public.aqari_documents
 for each row execute function private.aqari_opening_source_preserved();

-- Managed Storage schema and its existing insert/read-only user policies stay unchanged.
-- Approval locks and rechecks object metadata; source bytes are verified in the client.
create or replace function private.aqari_opening_source_valid(w uuid,t uuid,doc_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aqari_documents d
  join storage.objects o on o.bucket_id=d.storage_bucket and o.name=d.storage_path
  where d.id=doc_id and d.workspace_id=w and d.storage_bucket='aqari-documents'
   and d.storage_path like w::text||'/%' and d.status='uploaded' and d.checksum_sha256 ~ '^[a-f0-9]{64}$'
   and d.size_bytes between 1 and 26214400 and o.metadata->>'size'=d.size_bytes::text and o.metadata->>'mimetype'=d.mime_type
   and (exists(select 1 from public.aqari_tenants x where x.workspace_id=w and x.id=t and d.entity_type='tenant' and d.entity_ref=x.external_ref)
    or exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.tenant_id=t and d.entity_type='lease' and d.entity_ref=l.external_ref)
    or exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
     join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
     where l.workspace_id=w and l.tenant_id=t and d.entity_type='property' and d.entity_ref=p.external_ref))
 )
$$;
revoke all on function private.aqari_opening_source_valid(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function private.aqari_opening_balance_reconciliation(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=p_data; t uuid; cutoff date; ident uuid; ids uuid[]; expected integer;
 source_doc public.aqari_documents; saved private.aqari_opening_balance_reviews; snapshot jsonb;
 debit numeric(15,3); credit numeric(15,3); actual_debit numeric(15,3); actual_credit numeric(15,3); latest integer; actor text; previous uuid; fingerprint text; correction text;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'finance','read') or not private.aqari_can(w,'documents','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>100000 then raise invalid_parameter_value using message='INVALID_OPENING_REVIEW';end if;
 if p_action not in('context','get','review') or p_action is null then raise invalid_parameter_value using message='INVALID_OPENING_ACTION';end if;
 if exists(select 1 from jsonb_object_keys(d) k where not(k=any(case p_action
  when 'context' then array['tenant_id','cutoff_date'] when 'get' then array['id']
  else array['id','tenant_id','cutoff_date','cutoff_boundary','expected_revision','source_document_id','source_sha256','source_reference','source_coverage','source_debit','source_credit','entry_ids','source_attestation','bytes_verified','previous_review_id','correction_reason'] end))) then
  raise invalid_parameter_value using message='INVALID_OPENING_REVIEW';end if;
 if p_action='get' then
  select * into saved from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.id=(d->>'id')::uuid;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'review',case when saved.id is null then null else to_jsonb(saved) end);
 end if;
 t:=nullif(d->>'tenant_id','')::uuid;
 if t is not null and not exists(select 1 from public.aqari_tenants x where x.workspace_id=w and x.id=t) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if nullif(d->>'cutoff_date','') is not null then
  if (d->>'cutoff_date') !~ '^\d{4}-\d{2}-\d{2}$' then raise invalid_parameter_value using message='OPENING_CUTOFF_REQUIRED';end if;
  cutoff:=(d->>'cutoff_date')::date;
 end if;
 if p_action='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'tenant_id',t,'cutoff_date',cutoff,'cutoff_boundary','end_of_day',
   'scope','selected_opening_lines_source_review_only',
   'tenants',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.full_name) order by x.full_name,x.id),'[]') from public.aqari_tenants x where x.workspace_id=w),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'title',x.title,'document_no',x.document_no,'entity_type',x.entity_type,'entity_ref',x.entity_ref,
    'storage_bucket',x.storage_bucket,'storage_path',x.storage_path,'checksum_sha256',x.checksum_sha256,'size_bytes',x.size_bytes,'mime_type',x.mime_type,'original_filename',x.original_filename) order by x.created_at desc,x.id),'[]')
    from public.aqari_documents x where t is not null and x.workspace_id=w and private.aqari_opening_source_valid(w,t,x.id)),
   'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'tenant_id',e.tenant_id,'lease_id',e.lease_id,'contract_no',l.contract_no,'kind',e.kind,'direction',e.direction,'amount',e.amount::text,
    'occurred_on',e.occurred_on,'reason',e.reason,'side',case when cutoff is null then 'unspecified' when e.occurred_on<=cutoff then 'through_cutoff' else 'after_cutoff' end) order by e.occurred_on,e.created_at,e.id),'[]')
    from private.aqari_tenant_ledger_entries e left join public.aqari_leases l on l.workspace_id=e.workspace_id and l.id=e.lease_id where e.workspace_id=w and e.tenant_id=t),
   'reviews',(select coalesce(jsonb_agg(to_jsonb(r) order by r.cutoff_date desc,r.revision desc),'[]') from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.tenant_id=t),
   'latest_revision',(select coalesce(max(r.revision),0) from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.tenant_id=t and r.cutoff_date=cutoff),
   'actual_collections',case when t is null then null else public.aqari_opening_balance_statement(w,t)#>>'{totals,actual_collections}' end);
 end if;
 if not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if t is null or cutoff is null or d->>'cutoff_boundary' is distinct from 'end_of_day' then raise check_violation using message='OPENING_CUTOFF_REQUIRED';end if;
 if d->'source_attestation' is distinct from 'true'::jsonb or d->'bytes_verified' is distinct from 'true'::jsonb then raise check_violation using message='OPENING_SOURCE_ATTESTATION_REQUIRED';end if;
 if coalesce(d->>'source_debit','') !~ '^\d{1,12}(\.\d{1,3})?$' or coalesce(d->>'source_credit','') !~ '^\d{1,12}(\.\d{1,3})?$'
  or coalesce(d->>'expected_revision','') !~ '^\d{1,9}$' or coalesce(d->>'source_sha256','') !~ '^[a-f0-9]{64}$'
  or length(btrim(coalesce(d->>'source_reference',''))) not between 3 and 500 or length(btrim(coalesce(d->>'source_coverage',''))) not between 3 and 2000
  or jsonb_typeof(d->'entry_ids') is distinct from 'array' then raise check_violation using message='INVALID_OPENING_REVIEW';end if;
 ident:=(d->>'id')::uuid;expected:=(d->>'expected_revision')::integer;debit:=(d->>'source_debit')::numeric;credit:=(d->>'source_credit')::numeric;
 if ident is null then raise check_violation using message='INVALID_OPENING_REVIEW';end if;
 select array_agg(x::uuid order by x::uuid) into ids from jsonb_array_elements_text(d->'entry_ids') x;
 if coalesce(cardinality(ids),0) not between 1 and 1000 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise check_violation using message='OPENING_ENTRIES_REQUIRED';end if;
 -- Serialize tenant review revisions, including competing identifiers and source reuse.
 perform 1 from public.aqari_tenants x where x.workspace_id=w and x.id=t for update;
 select * into saved from private.aqari_opening_balance_reviews r where r.id=ident;
 if saved.id is not null then
  if saved.workspace_id<>w or saved.reviewed_by<>auth.uid() or saved.request_snapshot<>d then raise check_violation using message='OPENING_RETRY_CONFLICT';end if;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'review',to_jsonb(saved));
 end if;
 select coalesce(max(r.revision),0) into latest from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.tenant_id=t and r.cutoff_date=cutoff;
 if latest<>expected then raise serialization_failure using message='OPENING_REVIEW_REVISION_CONFLICT';end if;
 select r.id into previous from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.tenant_id=t and r.cutoff_date=cutoff and r.revision=latest;
 correction:=nullif(btrim(d->>'correction_reason'),'');
 if (latest=0 and (nullif(d->>'previous_review_id','') is not null or correction is not null)) or
  (latest>0 and (nullif(d->>'previous_review_id','')::uuid is distinct from previous or coalesce(length(correction),0) not between 3 and 1000)) then
  raise check_violation using message='OPENING_CORRECTION_REASON_REQUIRED';end if;
 select * into source_doc from public.aqari_documents x where x.workspace_id=w and x.id=(d->>'source_document_id')::uuid for share;
 perform 1 from storage.objects o where o.bucket_id=source_doc.storage_bucket and o.name=source_doc.storage_path for share;
 if source_doc.id is null or not private.aqari_opening_source_valid(w,t,source_doc.id) or source_doc.checksum_sha256<>d->>'source_sha256' then raise check_violation using message='OPENING_SOURCE_UNVERIFIED';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('tenant_id',t,'cutoff_date',cutoff,'cutoff_boundary','end_of_day',
  'source_sha256',source_doc.checksum_sha256,'source_reference',btrim(d->>'source_reference'),'source_coverage',btrim(d->>'source_coverage'),
  'source_debit',debit,'source_credit',credit,'entry_ids',ids)::text,'UTF8')),'hex');
 if exists(select 1 from private.aqari_opening_balance_reviews r where r.workspace_id=w and r.review_fingerprint=fingerprint) then
  raise unique_violation using message='OPENING_SOURCE_ALREADY_REVIEWED';end if;
 if cardinality(ids)<>(select count(*) from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=t and e.id=any(ids)
  and e.kind in('opening_debit','opening_credit','opening_balance') and e.occurred_on<=cutoff
  and (e.kind<>'opening_debit' or e.direction='debit') and (e.kind<>'opening_credit' or e.direction='credit')
  and (e.lease_id is null or exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=e.lease_id and l.tenant_id=t))
  and (source_doc.entity_type='tenant'
   or exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.id=e.lease_id and l.tenant_id=t and source_doc.entity_type='lease' and source_doc.entity_ref=l.external_ref)
   or exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
    where l.workspace_id=w and l.id=e.lease_id and l.tenant_id=t and source_doc.entity_type='property' and source_doc.entity_ref=p.external_ref))) then raise check_violation using message='OPENING_ENTRY_SCOPE_OR_CUTOFF_CONFLICT';end if;
 select coalesce(sum(e.amount) filter(where e.direction='debit'),0),coalesce(sum(e.amount) filter(where e.direction='credit'),0),
  jsonb_agg(to_jsonb(e) order by e.id) into actual_debit,actual_credit,snapshot
  from private.aqari_tenant_ledger_entries e where e.workspace_id=w and e.tenant_id=t and e.id=any(ids);
 if actual_debit<>debit or actual_credit<>credit then raise check_violation using message='OPENING_SOURCE_TOTALS_MISMATCH';end if;
 select coalesce(nullif(p.display_name,''),auth.uid()::text) into actor from public.aqari_profiles p where p.user_id=auth.uid();
 insert into private.aqari_opening_balance_reviews(id,workspace_id,tenant_id,cutoff_date,revision,previous_review_id,correction_reason,review_fingerprint,source_document_id,source_sha256,source_reference,source_coverage,
  source_debit,source_credit,entry_ids,entries_snapshot,document_snapshot,request_snapshot,source_attestation,bytes_verified,reviewed_by,reviewed_by_name)
 values(ident,w,t,cutoff,latest+1,previous,correction,fingerprint,source_doc.id,source_doc.checksum_sha256,btrim(d->>'source_reference'),btrim(d->>'source_coverage'),
  debit,credit,ids,snapshot,to_jsonb(source_doc),d,true,true,auth.uid(),coalesce(actor,auth.uid()::text)) returning * into saved;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'review',to_jsonb(saved));
end $$;
revoke all on function private.aqari_opening_balance_reconciliation(uuid,text,jsonb) from public,anon;
grant execute on function private.aqari_opening_balance_reconciliation(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_opening_balance_reconciliation(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$
 select private.aqari_opening_balance_reconciliation(p_workspace_id,p_action,p_data)
$$;
revoke all on function public.aqari_opening_balance_reconciliation(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_opening_balance_reconciliation(uuid,text,jsonb) to authenticated;


-- SOURCE: staging-database/sql/partner-distribution-register.sql
-- Additive partner entitlements. Apply after financial close/cancellation and partner shares guards.
-- No historical backfill, payments, opening balances or browser-calculated money are imported.

create table if not exists private.aqari_partner_period_sources (
 workspace_id uuid not null,property_id uuid not null,month date not null,
 source jsonb not null,source_hash text not null,period_matches boolean not null,created_at timestamptz not null default now(),
 primary key(workspace_id,property_id,month),
 foreign key(workspace_id,month) references private.aqari_financial_periods(workspace_id,month),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create table if not exists private.aqari_partner_source_approvals (
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,month date not null,
 shares_key text not null,shares_version bigint not null,owners jsonb not null,recipients jsonb not null,
 review_revision bigint not null,source_hash text not null,review_hash text not null,document_id uuid not null references public.aqari_documents(id),document_snapshot jsonb not null,
 income_fils bigint not null,expense_fils bigint not null,reserve_fils bigint not null,net_fils bigint not null,
 reason text not null,approved_by uuid not null,approved_at timestamptz not null default now(),request_hash text not null,
 unique(workspace_id,property_id,month,review_revision),unique(workspace_id,id),
 foreign key(workspace_id,property_id,month) references private.aqari_partner_period_sources(workspace_id,property_id,month),
 check(net_fils=income_fils-expense_fils-reserve_fils)
);
create table if not exists private.aqari_partner_distributions (
 id uuid primary key,workspace_id uuid not null,source_id uuid not null,property_id uuid not null,month date not null,
 kind text not null check(kind in('distribution','reversal')),reverses_id uuid references private.aqari_partner_distributions(id),
 occurred_on date not null,net_fils bigint not null,allocations jsonb not null,review_hash text not null,
 reason text not null,actor_id uuid not null,recorded_at timestamptz not null default now(),request_hash text not null,
 foreign key(workspace_id,source_id) references private.aqari_partner_source_approvals(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check((kind='distribution')=(reverses_id is null))
);
create unique index if not exists aqari_partner_distribution_once on private.aqari_partner_distributions(workspace_id,property_id,month) where kind='distribution';
create unique index if not exists aqari_partner_reversal_once on private.aqari_partner_distributions(reverses_id) where kind='reversal';
create index if not exists aqari_partner_distributions_source_idx on private.aqari_partner_distributions(workspace_id,source_id);
create index if not exists aqari_partner_sources_period_idx on private.aqari_partner_period_sources(workspace_id,month);
create index if not exists aqari_partner_distribution_property_idx on private.aqari_partner_distributions(workspace_id,property_id,month,recorded_at,id);
create index if not exists aqari_partner_approval_document_idx on private.aqari_partner_source_approvals(document_id);
do $$declare n text;begin foreach n in array array['aqari_partner_period_sources','aqari_partner_source_approvals','aqari_partner_distributions'] loop
 execute format('alter table private.%I enable row level security',n);execute format('revoke all on private.%I from public,anon,authenticated',n);
 execute format('drop trigger if exists aqari_partner_append_only on private.%I',n);
 execute format('create trigger aqari_partner_append_only before update or delete on private.%I for each row execute function private.aqari_reject_immutable_change()',n);
end loop;end$$;

create or replace function private.aqari_partner_hash(v jsonb) returns text language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to(v::text,'UTF8')),'hex')
$$;
-- Largest remainder of absolute fils; binary owner ID is the stable tie-break.
-- A negative period uses the exact sign inverse, so losses are never silently dropped.
create or replace function private.aqari_partner_allocate(fils bigint,owners jsonb,recipients jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;begin
 perform private.aqari_validate_partner_owners(owners);
 if fils is null or abs(fils::numeric)>9007199254740991 then raise exception 'PARTNER_AMOUNT_RANGE' using errcode='23514';end if;
 with base as(select x, floor(abs(fils::numeric)*(x->>'bps')::numeric/10000)::bigint part,
 mod(abs(fils::numeric)*(x->>'bps')::numeric,10000) fraction from jsonb_array_elements(owners)x),
 ranked as(select *,row_number()over(order by fraction desc,(x->>'id') collate "C") rank,
 (abs(fils::numeric)-sum(part)over())::bigint remainder from base)
 select jsonb_agg(jsonb_build_object('owner_id',x->>'id','name',x->>'name','role',x->>'role','bps',(x->>'bps')::integer,
 'recipient_user_id',recipients->(x->>'id'),'amount_fils',((part+case when rank<=remainder then 1 else 0 end)*sign(fils::numeric))::bigint::text) order by (x->>'id') collate "C") into result from ranked;
 if (select sum((x->>'amount_fils')::numeric) from jsonb_array_elements(result)x)<>fils then raise exception 'PARTNER_ALLOCATION_MISMATCH' using errcode='23514';end if;
 return result;
end$$;

-- A rent receipt may also fund a separate commercial obligation. This limited
-- register never guesses the rent/commercial split. Preserve evidence and refuse
-- only the affected property's source. A missing compatibility view also fails closed.
create or replace function private.aqari_partner_commercial_evidence(w uuid,payments jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if to_regclass('private.aqari_commercial_active_allocations') is not null then
  execute 'select coalesce(jsonb_agg(to_jsonb(a) order by a.allocation_id),''[]''::jsonb) from private.aqari_commercial_active_allocations a where a.workspace_id=$1 and a.payment_id in(select (x->>''id'')::uuid from jsonb_array_elements($2)x)' into result using w,payments;
  return result;
 end if;
 if to_regclass('private.aqari_commercial_payment_allocations') is not null then return '[{"review_required":"COMMERCIAL_ACTIVE_VIEW_REQUIRED"}]'::jsonb;end if;
 return '[]'::jsonb;
end$$;
revoke all on function private.aqari_partner_commercial_evidence(uuid,jsonb) from public,anon,authenticated;

-- Snapshot detail only for a newly inserted, supported close. Existing rows stay unchanged.
-- A mismatch with the already approved workspace totals keeps the source in REVIEW_REQUIRED.
create or replace function private.aqari_capture_partner_period() returns trigger language plpgsql security definer set search_path='' as $$
declare p record;income numeric:=0;expenses numeric:=0;icount bigint:=0;ecount bigint:=0;v jsonb;payments jsonb;exclusions jsonb;costs jsonb;reserves jsonb;commercial jsonb;matches boolean;
begin
 if new.snapshot->>'scope' is distinct from 'posted_rent_payments_and_approved_expenses_only' then return new;end if;
 perform 1 from public.aqari_app_state where workspace_id=new.workspace_id for update;
 select coalesce(sum(r.amount),0),count(*) into income,icount from public.aqari_rent_payments r
 where r.workspace_id=new.workspace_id and r.paid_at>=new.month and r.paid_at<(new.month+interval '1 month')::date
 and r.status in('paid','partial','مدفوع','جزئي') and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);
 select coalesce(sum(e.amount),0),count(*) into expenses,ecount from private.aqari_financial_expenses e where e.workspace_id=new.workspace_id and e.expense_date>=new.month and e.expense_date<(new.month+interval '1 month')::date and e.state='approved';
 matches:=coalesce((new.snapshot->>'rent_payments')::numeric=income and (new.snapshot->>'approved_expenses')::numeric=expenses
 and (new.snapshot->>'rent_payment_count')::bigint=icount and (new.snapshot->>'approved_expense_count')::bigint=ecount,false);
 for p in select * from public.aqari_properties where workspace_id=new.workspace_id order by id loop
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id)filter(where r.status in('paid','partial','مدفوع','جزئي') and c.id is null),'[]'),
   coalesce(jsonb_agg(jsonb_build_object('payment',to_jsonb(r),'cancellation',to_jsonb(c))order by r.id)filter(where r.status not in('paid','partial','مدفوع','جزئي') or c.id is not null),'[]') into payments,exclusions
  from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  left join private.aqari_receipt_cancellations c on c.workspace_id=r.workspace_id and c.payment_id=r.id
  where r.workspace_id=new.workspace_id and u.property_id=p.id and r.paid_at>=new.month and r.paid_at<(new.month+interval '1 month')::date;
  select coalesce(jsonb_agg(to_jsonb(e)order by e.id),'[]') into costs from private.aqari_financial_expenses e
   where e.workspace_id=new.workspace_id and e.property_id=p.id and e.expense_date>=new.month and e.expense_date<(new.month+interval '1 month')::date and e.state='approved';
  select coalesce(jsonb_agg(to_jsonb(r)order by r.id),'[]') into reserves from private.aqari_reserve_entries r
   where r.workspace_id=new.workspace_id and r.property_id=p.id and (r.created_at at time zone 'Asia/Kuwait')::date>=new.month and (r.created_at at time zone 'Asia/Kuwait')::date<(new.month+interval '1 month')::date;
  commercial:=private.aqari_partner_commercial_evidence(new.workspace_id,payments);
  v:=jsonb_build_object('version',1,'source_scope','posted_confirmed_rent_and_approved_expenses_and_reserve_movements_only','workspace_id',new.workspace_id,'property_id',p.id,'property_name',p.name,'month',new.month,
   'period_hash',private.aqari_partner_hash(new.snapshot),'workspace_period_matches',matches,'period_matches',matches and jsonb_array_length(commercial)=0,'commercial_allocations',commercial,'review_reason',case when jsonb_array_length(commercial)>0 then 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' when not matches then 'PARTNER_CLOSE_TOTAL_MISMATCH' else null end,'payments',payments,'excluded_payments',exclusions,'expenses',costs,'reserves',reserves,
   'reserve_policy','period_hold_minus_release_once','income_fils',(select (coalesce(sum((x->>'amount')::numeric),0)*1000)::bigint::text from jsonb_array_elements(payments)x),
   'expense_fils',(select (coalesce(sum((x->>'amount')::numeric),0)*1000)::bigint::text from jsonb_array_elements(costs)x),
   'reserve_fils',(select (coalesce(sum((x->>'amount')::numeric*case when x->>'direction'='hold' then 1 else -1 end),0)*1000)::bigint::text from jsonb_array_elements(reserves)x));
  insert into private.aqari_partner_period_sources(workspace_id,property_id,month,source,source_hash,period_matches) values(new.workspace_id,p.id,new.month,v,private.aqari_partner_hash(v),matches and jsonb_array_length(commercial)=0);
 end loop;
 -- Independently check the property partition matches the authoritative totals.
 if (select coalesce(sum((s.source->>'income_fils')::numeric),0) from private.aqari_partner_period_sources s where s.workspace_id=new.workspace_id and s.month=new.month)<>income*1000
 or (select coalesce(sum((s.source->>'expense_fils')::numeric),0) from private.aqari_partner_period_sources s where s.workspace_id=new.workspace_id and s.month=new.month)<>expenses*1000 then
  raise exception 'PARTNER_CLOSE_PROPERTY_TOTAL_MISMATCH' using errcode='23514';
 end if;
 return new;
end$$;
drop trigger if exists aqari_partner_capture_period on private.aqari_financial_periods;
create trigger aqari_partner_capture_period after insert on private.aqari_financial_periods for each row execute function private.aqari_capture_partner_period();
drop trigger if exists aqari_partner_period_immutable on private.aqari_financial_periods;
create trigger aqari_partner_period_immutable before update or delete on private.aqari_financial_periods for each row execute function private.aqari_reject_immutable_change();

-- Reserve timing joins the same close lock. An after-close backdated hold/release
-- cannot change the saved net. Receipt cancellations also check the receipt's date.
create or replace function private.aqari_partner_source_date_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d date;begin
 if tg_table_name='aqari_reserve_entries' then d:=(new.created_at at time zone 'Asia/Kuwait')::date;
 else select paid_at into strict d from public.aqari_rent_payments where workspace_id=new.workspace_id and id=new.payment_id;end if;
 perform private.aqari_financial_open(new.workspace_id,d);return new;
end$$;
drop trigger if exists aqari_partner_reserve_period_guard on private.aqari_reserve_entries;
create trigger aqari_partner_reserve_period_guard before insert on private.aqari_reserve_entries for each row execute function private.aqari_partner_source_date_guard();
drop trigger if exists aqari_partner_cancel_period_guard on private.aqari_receipt_cancellations;
create trigger aqari_partner_cancel_period_guard before insert on private.aqari_receipt_cancellations for each row execute function private.aqari_partner_source_date_guard();

create or replace function private.aqari_partner_distribution_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare w uuid:=p_workspace_id;d jsonb:=p_data;k text;allowed text[];m date;p uuid;ident uuid;why text;app jsonb;s jsonb;owners jsonb;recipients jsonb;x jsonb;v jsonb;rh text;doc jsonb;
 src private.aqari_partner_period_sources;a private.aqari_partner_source_approvals;e private.aqari_partner_distributions;original private.aqari_partner_distributions;
begin
 if auth.uid() is null or not private.aqari_manager(w) or not private.aqari_can(w,'partners','read') or not private.aqari_can(w,'finance','read') or not private.aqari_can(w,'documents','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>64000 then raise exception 'INVALID_PARTNER_REQUEST' using errcode='22023';end if;
 allowed:=case p_action when 'list' then array['month'] when 'preview' then array['property_id','month','shares_key']
 when 'approve_source' then array['id','property_id','month','source_hash','shares_key','shares_version','expected_review_revision','expected_income_fils','expected_expense_fils','expected_reserve_fils','document_id','recipients','reason']
 when 'post' then array['id','source_id','review_hash','reason'] when 'reverse' then array['id','distribution_id','reason'] else null end;
 if allowed is null then raise exception 'INVALID_PARTNER_ACTION' using errcode='22023';end if;
 for k in select jsonb_object_keys(d) loop if not k=any(allowed) then raise exception 'INVALID_PARTNER_FIELD' using errcode='22023';end if;end loop;
 if p_action in('list','preview','approve_source') then
  if coalesce(d->>'month','')!~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$' then raise exception 'INVALID_PARTNER_MONTH' using errcode='22023';end if;m:=((d->>'month')||'-01')::date;
 end if;
 if p_action='list' then
  select private.aqari_unwrap(payload) into app from public.aqari_app_state where workspace_id=w;
  return jsonb_build_object('workspace_id',w,'month',d->>'month',
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') from public.aqari_properties p where p.workspace_id=w),
   'shares',coalesce(app->'propertySharesV267','{}'),
   'sources',(select coalesce(jsonb_agg(to_jsonb(s) order by s.property_id),'[]') from private.aqari_partner_period_sources s where s.workspace_id=w and s.month=m),
   'approvals',(select coalesce(jsonb_agg(to_jsonb(a) order by a.property_id),'[]') from private.aqari_partner_source_approvals a where a.workspace_id=w and a.month=m),
   'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.recorded_at,e.id),'[]') from private.aqari_partner_distributions e where e.workspace_id=w and e.month=m),
   'partners',(select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'property_id',a.property_id,'name',a.display_name,'email',a.email) order by a.property_id,a.email),'[]') from private.aqari_partner_access a join auth.users u on u.id=a.user_id and lower(u.email)=a.email where a.workspace_id=w and a.is_active and u.email_confirmed_at is not null),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'property_id',p.id,'title',doc.title) order by doc.created_at desc,doc.id),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded'),
   'rule','largest_remainder_absolute_fils_then_owner_id_C','currency','KWD','external_payments',false);
 end if;
 if p_action<>'preview' then
  if not private.aqari_can(w,'partners','write') or not private.aqari_can(w,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  perform private.aqari_require_sensitive_aal2(w);
 end if;
 select private.aqari_unwrap(payload) into app from public.aqari_app_state where workspace_id=w for update;
 if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action<>'preview' then
  ident:=(d->>'id')::uuid;why:=btrim(d->>'reason');rh:=private.aqari_partner_hash(d);
  if ident is null or why is null or length(why) not between 5 and 500 then raise exception 'PARTNER_REASON_REQUIRED' using errcode='22023';end if;
  if p_action='approve_source' then
   select * into a from private.aqari_partner_source_approvals where id=ident;
   if found then if a.workspace_id<>w then raise insufficient_privilege using message='ACCESS_DENIED';end if;if a.approved_by<>auth.uid() then raise insufficient_privilege using message='ACCESS_DENIED';end if;if a.request_hash<>rh then raise exception 'PARTNER_RETRY_CONFLICT' using errcode='23514';end if;return to_jsonb(a);end if;
  else
   select * into e from private.aqari_partner_distributions where id=ident;
   if found then if e.workspace_id<>w then raise insufficient_privilege using message='ACCESS_DENIED';end if;if e.actor_id<>auth.uid() then raise insufficient_privilege using message='ACCESS_DENIED';end if;if e.request_hash<>rh or e.kind<>(case when p_action='post' then 'distribution' else 'reversal' end) then raise exception 'PARTNER_RETRY_CONFLICT' using errcode='23514';end if;return to_jsonb(e);end if;
  end if;
 end if;
 if p_action in('preview','approve_source') then
  p:=(d->>'property_id')::uuid;
  if p is null or not exists(select 1 from public.aqari_properties where workspace_id=w and id=p) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select * into src from private.aqari_partner_period_sources where workspace_id=w and property_id=p and month=m;
  if found and jsonb_array_length(private.aqari_partner_commercial_evidence(w,src.source->'payments'))>0 then raise exception 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' using errcode='23514';end if;
  if not found or not src.period_matches then raise exception 'PARTNER_SOURCE_REVIEW_REQUIRED' using errcode='23514';end if;
  if src.source_hash<>private.aqari_partner_hash(src.source) then raise exception 'PARTNER_SOURCE_HASH_MISMATCH' using errcode='23514';end if;
  s:=app->'propertySharesV267'->(d->>'shares_key');owners:=s->'owners';
  if s->>'enabled' is distinct from 'true' or jsonb_typeof(s->'version') is distinct from 'number' or jsonb_typeof(s->'events') is distinct from 'array' then raise exception 'PARTNER_SHARES_REVIEW_REQUIRED' using errcode='23514';end if;
  perform private.aqari_validate_partner_owners(owners);
  if exists(select 1 from jsonb_array_elements(s->'events')x where x->>'type' in('distribution','payment')) then raise exception 'PARTNER_LEGACY_FINANCE_REVIEW_REQUIRED' using errcode='23514';end if;
  v:=jsonb_build_object('workspace_id',w,'property_id',p,'month',d->>'month','source_hash',src.source_hash,'shares_key',d->>'shares_key','shares_version',s->'version','owners',owners,
   'income_fils',src.source->>'income_fils','expense_fils',src.source->>'expense_fils','reserve_fils',src.source->>'reserve_fils',
   'review_revision',(select coalesce(max(a.review_revision),0) from private.aqari_partner_source_approvals a where a.workspace_id=w and a.property_id=p and a.month=m),'net_fils',((src.source->>'income_fils')::bigint-(src.source->>'expense_fils')::bigint-(src.source->>'reserve_fils')::bigint)::text);
  if p_action='preview' then return v||jsonb_build_object('allocations',private.aqari_partner_allocate((v->>'net_fils')::bigint,owners,'{}'));end if;
  if d->>'source_hash' is distinct from src.source_hash or d->'shares_version' is distinct from s->'version' or d->'expected_review_revision' is distinct from v->'review_revision' then raise serialization_failure using message='PARTNER_REVIEW_STALE';end if;
  foreach k in array array['income','expense','reserve'] loop
   if jsonb_typeof(d->('expected_'||k||'_fils')) is distinct from 'string' or coalesce(d->>('expected_'||k||'_fils'),'')!~ '^-?(0|[1-9][0-9]{0,15})$'
    or (d->>('expected_'||k||'_fils'))::numeric<>(src.source->>(k||'_fils'))::numeric then raise exception 'PARTNER_EXPLICIT_RECONCILIATION_REQUIRED' using errcode='23514';end if;
  end loop;
  select to_jsonb(doc) into doc from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref
   join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path where doc.id=(d->>'document_id')::uuid and doc.workspace_id=w and doc.entity_type='property' and p.id=src.property_id and doc.status='uploaded'
   and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type for share of doc,o;
  if doc is null then raise exception 'PARTNER_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  recipients:=d->'recipients';
  if jsonb_typeof(recipients) is distinct from 'object' or (select count(*) from jsonb_object_keys(recipients))<>jsonb_array_length(owners) then raise exception 'PARTNER_RECIPIENT_REVIEW_REQUIRED' using errcode='23514';end if;
  for x in select value from jsonb_array_elements(owners) loop
   if not recipients?(x->>'id') then raise exception 'PARTNER_RECIPIENT_REVIEW_REQUIRED' using errcode='23514';end if;
   -- Explicit null keeps an offline owner private; it grants nobody access.
   if recipients->(x->>'id')<>'null'::jsonb and not exists(select 1 from private.aqari_partner_access a join auth.users u on u.id=a.user_id and lower(u.email)=a.email
    where a.workspace_id=w and a.property_id=p and a.is_active and u.email_confirmed_at is not null and a.user_id=(recipients->>(x->>'id'))::uuid
    and not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=a.user_id)) then raise exception 'PARTNER_RECIPIENT_ACCESS_REQUIRED' using errcode='23514';end if;
  end loop;
  if exists(select 1 from jsonb_each_text(recipients) where value is not null group by value having count(*)>1) then raise exception 'PARTNER_RECIPIENT_DUPLICATE' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_source_approvals a where a.workspace_id=w and ((a.property_id=p and a.shares_key<>d->>'shares_key') or (a.shares_key=d->>'shares_key' and a.property_id<>p))) then raise exception 'PARTNER_PROPERTY_SHARES_BINDING_CONFLICT' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_distributions e where e.workspace_id=w and e.property_id=p and e.month=m) then raise exception 'PARTNER_DISTRIBUTED_SOURCE_IMMUTABLE' using errcode='23514';end if;
  insert into private.aqari_partner_source_approvals(id,workspace_id,property_id,month,shares_key,shares_version,owners,recipients,review_revision,source_hash,review_hash,document_id,document_snapshot,income_fils,expense_fils,reserve_fils,net_fils,reason,approved_by,request_hash)
   values(ident,w,p,m,d->>'shares_key',(s->>'version')::bigint,owners,recipients,(v->>'review_revision')::bigint+1,src.source_hash,private.aqari_partner_hash(v||jsonb_build_object('recipients',recipients,'document',doc)),(d->>'document_id')::uuid,doc,(v->>'income_fils')::bigint,(v->>'expense_fils')::bigint,(v->>'reserve_fils')::bigint,(v->>'net_fils')::bigint,why,auth.uid(),rh) returning * into a;
  return to_jsonb(a);
 end if;
 perform private.aqari_financial_open(w,(now() at time zone 'Asia/Kuwait')::date);
 if p_action='post' then
  select * into a from private.aqari_partner_source_approvals where workspace_id=w and id=(d->>'source_id')::uuid;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if a.review_hash is distinct from d->>'review_hash' or exists(select 1 from private.aqari_partner_source_approvals newer where newer.workspace_id=w and newer.property_id=a.property_id and newer.month=a.month and newer.review_revision>a.review_revision) then raise serialization_failure using message='PARTNER_REVIEW_STALE';end if;
  select * into src from private.aqari_partner_period_sources where workspace_id=w and property_id=a.property_id and month=a.month;
  if not found or not src.period_matches or src.source_hash<>a.source_hash then raise exception 'PARTNER_SOURCE_REVIEW_REQUIRED' using errcode='23514';end if;
  if jsonb_array_length(private.aqari_partner_commercial_evidence(w,src.source->'payments'))>0 then raise exception 'PARTNER_COMMERCIAL_ALLOCATION_REVIEW_REQUIRED' using errcode='23514';end if;
  s:=app->'propertySharesV267'->a.shares_key;
  if s->'owners' is distinct from a.owners or (s->>'version')::bigint is distinct from a.shares_version or s->>'enabled' is distinct from 'true' then raise serialization_failure using message='PARTNER_SHARES_CHANGED_AFTER_REVIEW';end if;
  for x in select value from jsonb_array_elements(a.owners) loop
   if a.recipients->(x->>'id')<>'null'::jsonb and not exists(select 1 from private.aqari_partner_access pa join auth.users u on u.id=pa.user_id and lower(u.email)=pa.email
    where pa.workspace_id=w and pa.property_id=a.property_id and pa.is_active and u.email_confirmed_at is not null and pa.user_id=(a.recipients->>(x->>'id'))::uuid
    and not exists(select 1 from public.aqari_memberships m where m.workspace_id=w and m.user_id=pa.user_id)) then raise exception 'PARTNER_RECIPIENT_ACCESS_REQUIRED' using errcode='23514';end if;
  end loop;
  perform 1 from public.aqari_documents doc join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path
   where doc.id=a.document_id and to_jsonb(doc)=a.document_snapshot and doc.status='uploaded' and (o.metadata->>'size')::bigint=doc.size_bytes and o.metadata->>'mimetype'=doc.mime_type for share of doc,o;
  if not found then raise exception 'PARTNER_DOCUMENT_UNVERIFIED' using errcode='23514';end if;
  if exists(select 1 from private.aqari_partner_distributions where workspace_id=w and property_id=a.property_id and month=a.month and kind='distribution') then raise exception 'PARTNER_PERIOD_ALREADY_DISTRIBUTED' using errcode='23514';end if;
  v:=private.aqari_partner_allocate(a.net_fils,a.owners,a.recipients);
  insert into private.aqari_partner_distributions(id,workspace_id,source_id,property_id,month,kind,occurred_on,net_fils,allocations,review_hash,reason,actor_id,request_hash)
  values(ident,w,a.id,a.property_id,a.month,'distribution',(now() at time zone 'Asia/Kuwait')::date,a.net_fils,v,a.review_hash,why,auth.uid(),rh) returning * into e;
 else
  select * into original from private.aqari_partner_distributions where workspace_id=w and id=(d->>'distribution_id')::uuid and kind='distribution';
  if not found then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  if exists(select 1 from private.aqari_partner_distributions where reverses_id=original.id) then raise exception 'PARTNER_ALREADY_REVERSED' using errcode='23514';end if;
  select jsonb_agg(x||jsonb_build_object('amount_fils',(-(x->>'amount_fils')::bigint)::text) order by (x->>'owner_id')collate "C") into v from jsonb_array_elements(original.allocations)x;
  insert into private.aqari_partner_distributions(id,workspace_id,source_id,property_id,month,kind,reverses_id,occurred_on,net_fils,allocations,review_hash,reason,actor_id,request_hash)
   values(ident,w,original.source_id,original.property_id,original.month,'reversal',original.id,(now() at time zone 'Asia/Kuwait')::date,-original.net_fils,v,original.review_hash,why,auth.uid(),rh) returning * into e;
 end if;
 return to_jsonb(e);
end$$;

-- Approval metadata remains immutable. Existing Storage RLS permits upload of
-- draft files only, with no object UPDATE/DELETE policy. Approval and posting
-- read-lock matching object metadata; no managed Storage schema trigger is added.
create or replace function private.aqari_partner_document_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.aqari_partner_source_approvals where document_id=old.id) and (tg_op='DELETE' or to_jsonb(old) is distinct from to_jsonb(new)) then raise exception 'PARTNER_DOCUMENT_IMMUTABLE' using errcode='23514';end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function private.aqari_partner_document_guard() from public,anon,authenticated;
drop trigger if exists aqari_partner_document_immutable on public.aqari_documents;
create trigger aqari_partner_document_immutable before update or delete on public.aqari_documents for each row execute function private.aqari_partner_document_guard();

-- Once a property enters the reviewed server register its legacy financial events
-- cannot be extended. Existing events and every ownership event remain unchanged.
create or replace function private.aqari_partner_legacy_distribution_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare k text;before_state jsonb;after_state jsonb;x jsonb;n integer;
begin
 for k in select distinct a.shares_key from private.aqari_partner_source_approvals a where a.workspace_id=new.workspace_id loop
  before_state:=private.aqari_unwrap(old.payload)->'propertySharesV267'->k;
  after_state:=private.aqari_unwrap(new.payload)->'propertySharesV267'->k;
  if before_state is not distinct from after_state then continue;end if;
  n:=coalesce(jsonb_array_length(before_state->'events'),0);
  for x in select value from jsonb_array_elements(after_state->'events') with ordinality r(value,ord) where ord>n loop
   if x->>'type' in('distribution','payment') then raise exception 'PARTNER_SERVER_REGISTER_REQUIRED' using errcode='23514';end if;
  end loop;
 end loop;return new;
end$$;
revoke all on function private.aqari_partner_legacy_distribution_guard() from public,anon,authenticated;
drop trigger if exists aqari_zz_partner_distribution_guard on public.aqari_app_state;
create trigger aqari_zz_partner_distribution_guard before update of payload on public.aqari_app_state for each row execute function private.aqari_partner_legacy_distribution_guard();

create or replace function private.aqari_partner_distribution_statement(p_property_id uuid,p_month date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w uuid;email_address text;result jsonb;begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select lower(email) into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select a.workspace_id into w from private.aqari_partner_access a where a.property_id=p_property_id and a.user_id=auth.uid() and a.email=email_address and a.is_active
 and not exists(select 1 from public.aqari_memberships m where m.workspace_id=a.workspace_id and m.user_id=auth.uid());
 if w is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month not between date '2000-01-01' and date '2100-12-01' then raise exception 'INVALID_PARTNER_MONTH' using errcode='22023';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'reverses_id',e.reverses_id,'occurred_on',e.occurred_on,'recorded_at',e.recorded_at,'owner_id',x->>'owner_id','name',x->>'name','bps',x->'bps','amount_fils',x->>'amount_fils') order by e.recorded_at,e.id),'[]') into result
 from private.aqari_partner_distributions e cross join lateral jsonb_array_elements(e.allocations)x
 where e.workspace_id=w and e.property_id=p_property_id and e.month=p_month and x->>'recipient_user_id'=auth.uid()::text;
 return jsonb_build_object('user_id',auth.uid(),'workspace_id',w,'property_id',p_property_id,'month',p_month,'currency','KWD','entries',result,
 'balance_fils',(select coalesce(sum((x->>'amount_fils')::numeric),0)::text from jsonb_array_elements(result)x));
end$$;
revoke all on function private.aqari_partner_hash(jsonb),private.aqari_partner_allocate(bigint,jsonb,jsonb),private.aqari_capture_partner_period(),private.aqari_partner_source_date_guard() from public,anon,authenticated;
create or replace function public.aqari_partner_distribution_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.aqari_partner_distribution_register(p_workspace_id,p_action,p_data)$$;
create or replace function public.aqari_partner_distribution_statement(p_property_id uuid,p_month date)
returns jsonb language sql stable security invoker set search_path='' as $$select private.aqari_partner_distribution_statement(p_property_id,p_month)$$;
revoke all on function private.aqari_partner_distribution_register(uuid,text,jsonb),private.aqari_partner_distribution_statement(uuid,date) from public,anon,authenticated;
grant execute on function private.aqari_partner_distribution_register(uuid,text,jsonb),private.aqari_partner_distribution_statement(uuid,date) to authenticated;
revoke all on function public.aqari_partner_distribution_register(uuid,text,jsonb),public.aqari_partner_distribution_statement(uuid,date) from public,anon,authenticated;
grant execute on function public.aqari_partner_distribution_register(uuid,text,jsonb),public.aqari_partner_distribution_statement(uuid,date) to authenticated;


-- SOURCE: staging-database/sql/workspace-feature-discovery.sql
-- Run only in an independently verified development target, after staff-property-scope.sql
-- and financial-register.sql. Does not create accounts, assignments or business records.

create or replace function public.aqari_workspace_access(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb;access jsonb:='{}';s text;r text;
begin
 select role::text into r from public.aqari_memberships where workspace_id=p_workspace_id and user_id=auth.uid() and is_active;
 if r is null then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select settings into cfg from public.aqari_workspace_controls where workspace_id=p_workspace_id;
 foreach s in array private.aqari_section_keys() loop
  access:=access||jsonb_build_object(s,jsonb_build_object('read',private.aqari_can(p_workspace_id,s,'read'),'write',private.aqari_can(p_workspace_id,s,'write')));
 end loop;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'role',r,
  'sections',coalesce(cfg->'sections','{}'),'permissions',access,'labels',coalesce(cfg->'labels','{}'),
  'features',jsonb_build_object(
   'commercial_collections',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_commercial_collections(uuid,text,jsonb)') is not null,
   'opening_balance_reconciliation',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_opening_balance_reconciliation(uuid,text,jsonb)') is not null,
   'partner_distribution_register',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and private.aqari_can(p_workspace_id,'partners','read') and to_regprocedure('public.aqari_partner_distribution_register(uuid,text,jsonb)') is not null,
   'lease_expiry_report',private.aqari_can(p_workspace_id,'reports','read') and private.aqari_can(p_workspace_id,'contracts','read') and to_regprocedure('public.aqari_lease_expiry_report(uuid,text,integer,uuid,text,integer)') is not null,
   'staff_circulars',to_regprocedure('public.aqari_staff_circulars(uuid,text,jsonb)') is not null,
   'final_gap_register',r='general_manager' and to_regprocedure('public.aqari_final_gap_register(uuid,text,jsonb)') is not null,
   'official_documents',r='general_manager' and to_regprocedure('public.aqari_official_document_register(uuid,text,jsonb)') is not null and to_regprocedure('public.aqari_official_document_context(uuid,text,uuid,uuid,jsonb)') is not null,
   'external_integrations',r='general_manager' and to_regprocedure('public.aqari_external_integrations(uuid,text,jsonb)') is not null,
   'financial_archive',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_archive(uuid,text)') is not null,
   'compliance_register',r='general_manager' and to_regprocedure('public.aqari_compliance_register(uuid,text,text,jsonb)') is not null,
   'kpi_dashboard',r='general_manager' and private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_kpi_dashboard(uuid,date,date)') is not null,
   'maintenance_plans',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_maintenance_plans(uuid,text,jsonb)') is not null,
   'operations_register',r='general_manager' and to_regprocedure('public.aqari_operations_register(uuid,text,text,jsonb)') is not null,
   'unit_readiness',private.aqari_can(p_workspace_id,'properties','read') and to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null,
   'unit_meter_readings',private.aqari_can(p_workspace_id,'maintenance','read') and to_regprocedure('public.aqari_unit_meter_register(uuid,text,jsonb)') is not null,
   'vacating_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_review(uuid,text,jsonb)') is not null,
   'vacating_settlement',private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_vacating_settlement(uuid,text,jsonb)') is not null,
   'exit_review',r='general_manager' and private.aqari_can(p_workspace_id,'contracts','read') and private.aqari_can(p_workspace_id,'collections','read') and private.aqari_can(p_workspace_id,'finance','read') and private.aqari_can(p_workspace_id,'documents','read') and to_regprocedure('public.aqari_exit_review(uuid,text,jsonb)') is not null,
   'staff_access',r='general_manager' and to_regprocedure('public.aqari_staff_access(uuid,text,jsonb)') is not null,
   'financial_register',private.aqari_can(p_workspace_id,'finance','read') and to_regprocedure('public.aqari_financial_register(uuid,text,jsonb)') is not null,
   'deposit_register',private.aqari_can(p_workspace_id,'collections','read') and to_regprocedure('public.aqari_deposit_register(uuid,text,jsonb)') is not null));
end $$;
revoke all on function public.aqari_workspace_access(uuid) from public,anon,authenticated;
grant execute on function public.aqari_workspace_access(uuid) to authenticated;


notify pgrst,'reload schema';
commit;
