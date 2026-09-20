-- Additive contract administration. No backfill, financial write, or delivery.
begin;
-- Existing scope guard referenced a removed column; preserve every scope check.
do $repair$
declare definition text;
begin
 if to_regprocedure('private.aqari_property_template_scope_guard()') is not null then
  definition:=pg_get_functiondef('private.aqari_property_template_scope_guard()'::regprocedure);
  if position('coalesce(m.type,' in definition)>0 then
   execute replace(definition,'coalesce(m.type,','coalesce(m.property_type,');
  end if;
 end if;
end $repair$;

create table if not exists private.aqari_contract_archives (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 tenant_id uuid not null, property_id uuid not null, unit_id uuid not null,
 document_id uuid not null references public.aqari_documents(id), reference text not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(workspace_id,document_id),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id)
);
create table if not exists private.aqari_contract_change_requests (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 lease_id uuid not null, proposed_change text not null check(length(proposed_change) between 3 and 4000),
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 decided_by uuid references auth.users(id), decided_at timestamptz, decision_reason text,
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id)
);
create table if not exists private.aqari_contract_signature_reviews (
 id uuid primary key, workspace_id uuid not null references public.aqari_workspaces(id),
 document_id uuid not null references public.aqari_documents(id),
 required_signers jsonb not null, signed_by jsonb not null, contract_sha256 text,
 reviewed_by uuid not null references auth.users(id), reviewed_at timestamptz not null default now(),
 status text not null check(status in('missing_signature','complete'))
);
create index if not exists aqari_contract_archives_lookup on private.aqari_contract_archives(workspace_id,property_id,tenant_id);
create index if not exists aqari_contract_requests_lookup on private.aqari_contract_change_requests(workspace_id,lease_id,status);
create index if not exists aqari_contract_signatures_lookup on private.aqari_contract_signature_reviews(workspace_id,document_id,reviewed_at desc);
alter table private.aqari_contract_archives enable row level security;
alter table private.aqari_contract_change_requests enable row level security;
alter table private.aqari_contract_signature_reviews enable row level security;
revoke all on private.aqari_contract_archives,private.aqari_contract_change_requests,private.aqari_contract_signature_reviews from public,anon,authenticated;

create or replace function private.aqari_contract_administration(w uuid,act text,d jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare manager boolean; ident uuid; doc public.aqari_documents; lease public.aqari_leases;
 tenant public.aqari_tenants; unit public.aqari_units; archive_row private.aqari_contract_archives;
 req private.aqari_contract_change_requests; sig private.aqari_contract_signature_reviews;
 result jsonb; required jsonb; signed jsonb; fingerprint text;
begin
 if auth.uid() is null or not private.aqari_can(w,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(d) is distinct from 'object' then raise invalid_parameter_value using message='INVALID_REQUEST';end if;
 manager:=private.aqari_manager(w);
 if act in('archive','review_signatures','decide_request') and not private.aqari_can(w,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if act in('archives','archive','review_signatures') and not manager then raise insufficient_privilege using message='MANAGER_REQUIRED';end if;
 if act='archives' then
  select coalesce(jsonb_agg(x order by x.created_at desc),'[]'::jsonb) into result from (
   select a.*,t.full_name tenant_name,p.name property_name,u.unit_no,archive_doc.original_filename,archive_doc.storage_path,archive_doc.status document_status,
    coalesce((select s.status from private.aqari_contract_signature_reviews s where s.workspace_id=w and s.document_id=a.document_id order by s.reviewed_at desc,s.id desc limit 1),'unverified') signature_status
   from private.aqari_contract_archives a join public.aqari_tenants t on t.workspace_id=w and t.id=a.tenant_id
   join public.aqari_properties p on p.workspace_id=w and p.id=a.property_id join public.aqari_units u on u.workspace_id=w and u.id=a.unit_id
   join public.aqari_documents archive_doc on archive_doc.workspace_id=w and archive_doc.id=a.document_id
   where a.workspace_id=w and (nullif(d->>'tenant_id','') is null or a.tenant_id=(d->>'tenant_id')::uuid)
    and (nullif(d->>'property_id','') is null or a.property_id=(d->>'property_id')::uuid)
  )x;
 elsif act='archive' then
  perform private.aqari_require_sensitive_aal2(w);
  if not private.aqari_can(w,'documents','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  ident:=(d->>'id')::uuid;
  if ident is null or coalesce(length(btrim(d->>'reference')),0) not between 1 and 200 then raise invalid_parameter_value using message='ARCHIVE_REFERENCE_REQUIRED';end if;
  select * into tenant from public.aqari_tenants where workspace_id=w and id=(d->>'tenant_id')::uuid;
  select * into unit from public.aqari_units where workspace_id=w and id=(d->>'unit_id')::uuid and property_id=(d->>'property_id')::uuid;
  select * into doc from public.aqari_documents where workspace_id=w and id=(d->>'document_id')::uuid;
  if tenant.id is null or unit.id is null or doc.id is null or doc.status is distinct from 'uploaded'
   or doc.entity_type is distinct from 'tenant' or doc.entity_ref is distinct from tenant.external_ref
   or doc.metadata->>'category' is distinct from 'archived_contract' or doc.checksum_sha256 is null
  then raise invalid_parameter_value using message='ARCHIVE_BINDING_INVALID';end if;
  insert into private.aqari_contract_archives(id,workspace_id,tenant_id,property_id,unit_id,document_id,reference,created_by)
   values(ident,w,tenant.id,unit.property_id,unit.id,doc.id,btrim(d->>'reference'),auth.uid()) on conflict(id) do nothing;
  select * into archive_row from private.aqari_contract_archives where id=ident;
  if archive_row.workspace_id is distinct from w or archive_row.tenant_id is distinct from tenant.id or archive_row.unit_id is distinct from unit.id
   or archive_row.property_id is distinct from unit.property_id or archive_row.document_id is distinct from doc.id or archive_row.reference is distinct from btrim(d->>'reference')
   or archive_row.created_by is distinct from auth.uid() then raise invalid_parameter_value using message='ARCHIVE_REQUEST_CONFLICT';end if;
  result:=to_jsonb(archive_row);
 elsif act='signature_status' then
  select * into doc from public.aqari_documents where workspace_id=w and id=(d->>'document_id')::uuid;
  if doc.id is null or not (manager or doc.entity_type='lease' and exists(select 1 from public.aqari_leases l where l.workspace_id=w and l.external_ref=doc.entity_ref and private.aqari_can_lease(w,l.id,'contracts','read'))) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  select to_jsonb(s) into result from private.aqari_contract_signature_reviews s where workspace_id=w and document_id=doc.id order by reviewed_at desc,id desc limit 1;
  if doc.entity_type='lease' and result is not null then
   select encode(sha256(convert_to((l.snapshot-array['status','changeReason','updatedAt'])::text,'UTF8')),'hex') into fingerprint from public.aqari_leases l where l.workspace_id=w and l.external_ref=doc.entity_ref;
   if result->>'contract_sha256' is distinct from fingerprint then result:=result||jsonb_build_object('status','outdated_copy');end if;
  end if;
  result:=coalesce(result,jsonb_build_object('status','unverified'))||jsonb_build_object('document_status',doc.status);
 elsif act='review_signatures' then
  perform private.aqari_require_sensitive_aal2(w);
  ident:=(d->>'id')::uuid;required:=d->'required_signers';signed:=d->'signed_by';
  if ident is null or jsonb_typeof(required) is distinct from 'array' or jsonb_typeof(signed) is distinct from 'array' then raise invalid_parameter_value using message='SIGNERS_REQUIRED';end if;
  if jsonb_array_length(required) not between 2 and 20 or jsonb_array_length(signed)>20
   or not required @> '["tenant","landlord"]'::jsonb or not required @> signed
   or exists(select 1 from jsonb_array_elements(required||signed)x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 100)
   or (select count(distinct value) from jsonb_array_elements(required))<>jsonb_array_length(required)
   or (select count(distinct value) from jsonb_array_elements(signed))<>jsonb_array_length(signed)
  then raise invalid_parameter_value using message='SIGNERS_INVALID';end if;
  select * into doc from public.aqari_documents where workspace_id=w and id=(d->>'document_id')::uuid for update;
  if doc.id is null or doc.status is distinct from 'uploaded' or doc.checksum_sha256 is null or not (
   doc.entity_type='lease' and doc.document_type='signed_contract' or
   exists(select 1 from private.aqari_contract_archives where workspace_id=w and document_id=doc.id))
  then raise invalid_parameter_value using message='SIGNED_COPY_REQUIRED';end if;
  if doc.entity_type='lease' then
   select encode(sha256(convert_to((l.snapshot-array['status','changeReason','updatedAt'])::text,'UTF8')),'hex') into fingerprint from public.aqari_leases l where l.workspace_id=w and l.external_ref=doc.entity_ref;
   if fingerprint is null then raise invalid_parameter_value using message='CONTRACT_NOT_FOUND';end if;
   if exists(select 1 from private.aqari_contract_signature_reviews s where s.workspace_id=w and s.document_id=doc.id and s.contract_sha256 is distinct from fingerprint) then raise invalid_parameter_value using message='SIGNED_COPY_OUTDATED';end if;
  end if;
  -- The required signer set cannot shrink after a review; incomplete copies stay incomplete.
  if exists(select 1 from private.aqari_contract_signature_reviews s where s.workspace_id=w and s.document_id=doc.id and not required @> s.required_signers)
  then raise invalid_parameter_value using message='REQUIRED_SIGNERS_CANNOT_BE_REMOVED';end if;
  insert into private.aqari_contract_signature_reviews(id,workspace_id,document_id,required_signers,signed_by,reviewed_by,status,contract_sha256)
   values(ident,w,doc.id,required,signed,auth.uid(),case when signed @> required then 'complete' else 'missing_signature' end,fingerprint) on conflict(id) do nothing;
  select * into sig from private.aqari_contract_signature_reviews where id=ident;
  if sig.workspace_id is distinct from w or sig.document_id is distinct from doc.id or sig.required_signers is distinct from required or sig.signed_by is distinct from signed or sig.reviewed_by is distinct from auth.uid()
  then raise invalid_parameter_value using message='SIGNATURE_REQUEST_CONFLICT';end if;
  result:=to_jsonb(sig);
 elsif act='requests' then
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) into result from private.aqari_contract_change_requests r
   where r.workspace_id=w and (manager or r.created_by=auth.uid()) and private.aqari_can_lease(w,r.lease_id,'contracts','read');
 elsif act='request_change' then
  select * into lease from public.aqari_leases where workspace_id=w and external_ref=d->>'contract_ref';
  if lease.id is null or not private.aqari_can_lease(w,lease.id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  ident:=(d->>'id')::uuid;
  if ident is null or coalesce(length(btrim(d->>'proposed_change')),0) not between 3 and 4000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
  insert into private.aqari_contract_change_requests(id,workspace_id,lease_id,proposed_change,created_by)
   values(ident,w,lease.id,btrim(d->>'proposed_change'),auth.uid()) on conflict(id) do nothing;
  select * into req from private.aqari_contract_change_requests where id=ident;
  if req.workspace_id is distinct from w or req.lease_id is distinct from lease.id or req.created_by is distinct from auth.uid() or req.proposed_change is distinct from btrim(d->>'proposed_change')
  then raise invalid_parameter_value using message='CHANGE_REQUEST_CONFLICT';end if;
  result:=to_jsonb(req);
 elsif act='decide_request' then
  if not manager then raise insufficient_privilege using message='MANAGER_REQUIRED';end if;
  perform private.aqari_require_sensitive_aal2(w);
  if coalesce(d->>'status','') not in('approved','rejected') or coalesce(length(btrim(d->>'reason')),0) not between 3 and 500 then raise invalid_parameter_value using message='DECISION_REQUIRED';end if;
  select * into req from private.aqari_contract_change_requests where workspace_id=w and id=(d->>'id')::uuid for update;
  if req.id is null then raise invalid_parameter_value using message='REQUEST_NOT_FOUND';end if;
  if req.status<>'pending' then
   if req.status is distinct from d->>'status' or req.decision_reason is distinct from btrim(d->>'reason') then raise serialization_failure using message='REQUEST_ALREADY_DECIDED';end if;
  else
   update private.aqari_contract_change_requests set status=d->>'status',decided_by=auth.uid(),decided_at=now(),decision_reason=btrim(d->>'reason') where id=req.id returning * into req;
  end if;
  -- Approval never silently rewrites contract terms or triggers a financial event.
  result:=to_jsonb(req);
 else raise invalid_parameter_value using message='UNKNOWN_ACTION';
 end if;
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'result',result);
end $$;
revoke all on function private.aqari_contract_administration(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_contract_administration(uuid,text,jsonb) to authenticated;
create or replace function public.aqari_contract_administration(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select private.aqari_contract_administration(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_contract_administration(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_contract_administration(uuid,text,jsonb) to authenticated;

create or replace function private.aqari_manager_contract_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare next_data jsonb:=private.aqari_unwrap(new.payload); previous_data jsonb:=private.aqari_unwrap(old.payload); c jsonb; old_c jsonb;
begin
 if auth.uid() is not null and not private.aqari_manager(new.workspace_id) then
  if coalesce(next_data->'contractsV202','[]') is distinct from coalesce(previous_data->'contractsV202','[]')
   or coalesce(next_data->'contractPreparationDraftsV267','[]') is distinct from coalesce(previous_data->'contractPreparationDraftsV267','[]')
  then raise insufficient_privilege using message='تعديل العقود وإنشاؤها واعتمادها متاح للمدير العام فقط. قدّم طلب تعديل.';end if;
 end if;
 for c in select value from jsonb_array_elements(coalesce(next_data->'contractsV202','[]')) loop
  select value into old_c from jsonb_array_elements(coalesce(previous_data->'contractsV202','[]')) where value->>'id'=c->>'id';
  if c->>'status'='signed' and old_c->>'status' is distinct from 'signed' and not exists(
   select 1 from public.aqari_documents doc
   cross join lateral (select s.status,s.contract_sha256 from private.aqari_contract_signature_reviews s where s.workspace_id=new.workspace_id and s.document_id=doc.id order by s.reviewed_at desc,s.id desc limit 1) review
   where doc.workspace_id=new.workspace_id and doc.entity_type='lease' and doc.entity_ref=c->>'id' and doc.document_type='signed_contract' and doc.status='uploaded' and review.status='complete' and review.contract_sha256=encode(sha256(convert_to((c-array['status','changeReason','updatedAt'])::text,'UTF8')),'hex')
  ) then raise exception 'ناقص توقيع: ارفع النسخة الموقعة وراجع جميع التواقيع قبل إكمال العقد.';end if;
 end loop;
 return new;
end $$;
revoke all on function private.aqari_manager_contract_guard() from public,anon,authenticated;
drop trigger if exists aqari_00_manager_contract_guard on public.aqari_app_state;
create trigger aqari_00_manager_contract_guard before update of payload on public.aqari_app_state for each row execute function private.aqari_manager_contract_guard();
commit;
