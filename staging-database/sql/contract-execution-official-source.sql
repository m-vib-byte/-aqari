-- Reconciled from the Preview implementation on 2026-10-06.
-- Install only after contract-execution-package-atomic.sql.
-- Retains number reservations and validates rental documents against the
-- immutable, actor-bound PDF package, signed lease, and transaction manifest.
-- This source module is not a Production rollout migration.
begin;

-- Do not overwrite an unknown/newer source guard during reconciliation.
do $$ begin
 if coalesce(md5(pg_get_functiondef(to_regprocedure('private.aqari_official_source_guard()'))),'')
  not in ('66f94d6201d715919ec416ce83f1d29d','473f54fe0309dc3e4182f66837911174')
 then raise exception 'EXECUTION_OFFICIAL_SOURCE_GUARD_DRIFT';end if;
end $$;

CREATE OR REPLACE FUNCTION private.aqari_validate_execution_document(s private.aqari_official_document_series, v private.aqari_official_document_versions)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 package private.aqari_contract_execution_packages;
 lease public.aqari_leases;
 source jsonb; expected jsonb; manifest jsonb; c jsonb; settlement_id uuid;
 copy_role text; clauses text; title text; body text; payload jsonb; hash text;
 document_no text; template_version integer;
begin
 if auth.uid() is null or not private.aqari_manager(s.workspace_id)
  or not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write')
  or s.entity_type is distinct from 'lease' or s.status is distinct from 'issued'
  or s.current_version is distinct from 1 or v.version is distinct from 1
  or s.created_by is distinct from auth.uid() or v.issued_by is distinct from auth.uid()
 then raise exception 'EXECUTION_DOCUMENT_ACCESS_DENIED' using errcode='42501';end if;
 select * into package from private.aqari_contract_execution_packages p
 where p.workspace_id=s.workspace_id and p.settlement_id::text=v.payload->>'executionSettlementId' for update;
 if not found or package.actor_id is distinct from auth.uid() or package.expires_at<=now()
  or exists(select 1 from private.aqari_contract_execution_package_consumptions z where z.package_id=package.id)
 then raise exception 'EXECUTION_DOCUMENT_PACKAGE_UNAVAILABLE' using errcode='23514';end if;
 source:=package.source;settlement_id:=package.settlement_id;c:=source->'signed_contract_snapshot';
 select * into lease from public.aqari_leases l where l.workspace_id=s.workspace_id and l.id=s.entity_id;
 if not found or lease.status is distinct from 'signed' or lease.snapshot is distinct from c
  or lease.id::text is distinct from source->>'lease_id' or lease.external_ref is distinct from package.contract_ref
  or lease.contract_no is distinct from package.contract_no
 then raise exception 'EXECUTION_DOCUMENT_LEASE_MISMATCH' using errcode='23514';end if;
 select e into manifest from public.aqari_app_state a
 cross join lateral jsonb_array_elements(coalesce(private.aqari_unwrap(a.payload)->'contractExecutionSettlementsV267','[]')) e
 where a.workspace_id=s.workspace_id and e->>'id'=settlement_id::text;
 if manifest is null or manifest->>'executionPackageId' is distinct from package.id::text
  or manifest->>'contractDocumentId' is distinct from source->>'contract_document_id'
  or manifest->>'contractId' is distinct from package.contract_ref
 then raise exception 'EXECUTION_DOCUMENT_MANIFEST_MISMATCH' using errcode='23514';end if;
 copy_role:=v.payload->>'copyRole';
 if copy_role is null then
  if s.id::text is distinct from source->>'contract_document_id'
   then raise exception 'EXECUTION_DOCUMENT_CANONICAL_ID_MISMATCH' using errcode='23514';end if;
  clauses:=(select string_agg(btrim(coalesce(x.value->>'title',''))||E'\n'||btrim(coalesce(x.value->>'text','')),E'\n\n' order by x.ordinality) from jsonb_array_elements(coalesce(c->'clauses','[]'::jsonb)) with ordinality x(value,ordinality));
  if coalesce(length(btrim(clauses)),0)<5 then raise exception 'EXECUTION_CONTRACT_CLAUSES_REQUIRED' using errcode='23514';end if;
  title:='عقد إيجار '||(c->>'contract_no');
  body:='عقد إيجار رقم '||(c->>'contract_no')||E'\nالمستأجر: '||coalesce(c->>'tenant','')||E'\nالعقار: '||(c->>'property')||' — الوحدة: '||(c->>'unit')||E'\nمدة العقد: '||(c->>'start_date')||' إلى '||(c->>'end_date')||E'\nالإيجار الأصلي: '||coalesce(c->>'contractRent',c->>'rent')||' د.ك — الخصم: '||coalesce(c->>'discount','0')||' د.ك'||E'\nالتأمين: '||coalesce(c->>'deposit','0')||' د.ك — العربون: '||coalesce(c->>'advance','0')||' د.ك — الرسوم: '||coalesce(c->>'cleaningFee','0')||' د.ك'||E'\n\n'||clauses;
  payload:=jsonb_build_object('contractNo',c->>'contract_no','tenant',c->>'tenant','property',c->>'property','unit',c->>'unit','startDate',c->>'start_date','endDate',c->>'end_date','contractRent',c->>'contractRent','discount',c->>'discount','deposit',c->>'deposit','advance',c->>'advance','fees',c->>'cleaningFee','template',c->'contractTemplate','executionSettlementId',settlement_id,'contractSnapshot',c);
  hash:=pg_catalog.encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex');

  document_no:='CT-'||(c->>'contract_no');
  template_version:=coalesce(nullif(c#>>'{contractTemplate,version}','')::integer,1);
  if hash is distinct from source->>'canonical_content_sha256' then raise exception 'EXECUTION_DOCUMENT_SOURCE_HASH_MISMATCH' using errcode='23514';end if;
 else
  if copy_role not in ('tenant','owner') then raise exception 'EXECUTION_DOCUMENT_COPY_ROLE_INVALID' using errcode='23514';end if;
  expected:=source->(copy_role||'_document');
  if jsonb_typeof(expected) is distinct from 'object' then raise exception 'EXECUTION_DOCUMENT_COPY_REQUIRED' using errcode='23514';end if;
  title:=expected->>'title';body:=expected->>'body';payload:=expected->'payload';
  hash:=expected->>'content_sha256';document_no:=expected->>'document_no';
  template_version:=(expected->>'template_version')::integer;
  if v.issued_at is distinct from (expected->>'issued_at')::timestamptz then raise exception 'EXECUTION_DOCUMENT_ISSUED_AT_MISMATCH' using errcode='23514';end if;
 end if;
 if s.document_no is distinct from document_no or v.title is distinct from title
  or v.body is distinct from body or v.payload is distinct from payload
  or v.content_sha256 is distinct from hash or v.template_version is distinct from template_version
  or v.issued_by_name is distinct from source->>'actor_name'
  or hash is distinct from encode(extensions.digest(title||E'\n'||body||E'\n'||payload::text,'sha256'),'hex')
 then raise exception 'EXECUTION_DOCUMENT_CONTENT_MISMATCH' using errcode='23514';end if;
end $function$;
revoke all on function private.aqari_validate_execution_document(private.aqari_official_document_series,private.aqari_official_document_versions) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.aqari_official_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s private.aqari_official_document_series;defaults jsonb;key text;value jsonb;v_source_key text;
begin
 select * into strict s from private.aqari_official_document_series where workspace_id=new.workspace_id and id=new.series_id;
 if new.version=1 and not exists(select 1 from private.aqari_official_number_reservations r where r.workspace_id=s.workspace_id and r.id=s.id and r.document_no=s.document_no and r.kind=s.kind and r.entity_id=s.entity_id and r.actor_id=auth.uid()) then raise exception 'DOCUMENT_RESERVED_NUMBER_REQUIRED' using errcode='23514';end if;
 if s.kind='rental_contract' then
  perform private.aqari_validate_execution_document(s,new);
  return new;
 end if;
 perform private.aqari_official_validate(s.kind,s.document_no,new.template_version,new.title,new.body,new.payload,new.content_sha256);
 if not private.aqari_official_entity_scope(s.workspace_id,s.entity_type,s.entity_id,'write') then raise insufficient_privilege using message='DOCUMENT_ENTITY_NOT_FOUND';end if;
 -- Serialize mutable work-order state with issuance. Financial mutations also
 -- take the workspace ledger lock held by the public registration RPC.
 if s.kind='work_order' then perform 1 from private.aqari_work_orders where workspace_id=s.workspace_id and id=s.entity_id for share;end if;
 defaults:=private.aqari_official_source(s.workspace_id,s.kind,s.entity_type,s.entity_id,nullif(new.payload->>'sourceId','')::uuid,new.payload);
 for key,value in select * from jsonb_each(defaults) loop
  if new.payload->key is distinct from value then raise exception 'DOCUMENT_SOURCE_MISMATCH: %',key using errcode='23514';end if;
 end loop;
 if s.kind in ('rent_receipt','receipt_voucher','deposit_receipt','deposit_refund','payment_voucher','expense_approval','work_order') then v_source_key:=defaults->>'sourceId';
 elsif s.kind='daily_collection' then v_source_key:=s.entity_id::text||':'||(defaults->>'collectionDate');end if;
 if s.source_key is not null and s.source_key is distinct from v_source_key then raise exception 'DOCUMENT_SOURCE_CANNOT_CHANGE' using errcode='23514';end if;
 if v_source_key is not null then update private.aqari_official_document_series set source_key=v_source_key where workspace_id=s.workspace_id and id=s.id;end if;
 return new;
end $function$;
revoke all on function private.aqari_official_source_guard() from public,anon,authenticated,service_role;
commit;
