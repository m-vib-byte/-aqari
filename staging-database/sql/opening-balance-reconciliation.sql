-- Independent, source-attested matching of selected opening lines. No posting or statement override.
-- Apply after opening-balance-statement.sql. Repeatable; no historical rows are rewritten.
begin;

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
commit;
