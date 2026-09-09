-- Apply only to AQARI-V267-Staging. Does not approve or alter any existing record.
create table public.aqari_source_lease_reviews (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 lease_id uuid not null, document_id uuid not null references public.aqari_documents(id),
 action text not null check(action in ('approve','sign')), reviewer_id uuid not null references auth.users,
 note text not null check(length(btrim(note)) between 10 and 2000),
 before_snapshot jsonb not null, after_snapshot jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 unique(workspace_id,lease_id,action)
);
alter table public.aqari_source_lease_reviews enable row level security;
revoke all on public.aqari_source_lease_reviews from public,anon,authenticated;
grant select on public.aqari_source_lease_reviews to authenticated;
create policy source_review_read on public.aqari_source_lease_reviews for select to authenticated
using(private.aqari_can(workspace_id,'contracts','read') and private.aqari_can(workspace_id,'documents','read'));

create function private.aqari_review_source_lease(p_workspace_id uuid,p_lease_id uuid,p_document_id uuid,p_action text,p_deposit numeric,p_note text,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.aqari_leases%rowtype; t public.aqari_tenants%rowtype; doc public.aqari_documents%rowtype;
 saved public.aqari_app_state%rowtype; d jsonb; next_snapshot jsonb; next_status text; review_id uuid; revision_after bigint;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id)
 or not private.aqari_can(p_workspace_id,'contracts','write') or not private.aqari_can(p_workspace_id,'documents','read')
 then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if p_action is null or p_action not in ('approve','sign') or p_note is null or length(btrim(p_note)) not between 10 and 2000 then raise exception 'REVIEW_DETAILS_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,0));
 select * into strict saved from public.aqari_app_state where workspace_id=p_workspace_id for update;
 if saved.revision is distinct from p_expected_revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 select * into strict l from public.aqari_leases where workspace_id=p_workspace_id and id=p_lease_id for update;
 if l.import_source is null then raise exception 'SOURCE_LEASE_REQUIRED';end if;
 if (p_action='approve' and l.status<>'draft') or (p_action='sign' and l.status<>'approved') then raise exception 'INVALID_REVIEW_TRANSITION';end if;
 select * into strict t from public.aqari_tenants where workspace_id=p_workspace_id and id=l.tenant_id;
 if nullif(btrim(t.full_name),'') is null or l.start_date is null or l.end_date is null or l.end_date<l.start_date
 or jsonb_array_length(coalesce(l.snapshot->'pending','[]'))>0 then raise exception 'SOURCE_FIELDS_PENDING';end if;
 if p_deposit is null or p_deposit<0 or p_deposit>999999999999.999 or p_deposit<>round(p_deposit,3) then raise exception 'DOCUMENTED_DEPOSIT_REQUIRED';end if;
 select * into strict doc from public.aqari_documents where workspace_id=p_workspace_id and id=p_document_id;
 if doc.status<>'uploaded' or doc.document_type<>'signed_contract' or doc.entity_type<>'lease' or doc.entity_ref<>l.external_ref
 or doc.checksum_sha256 is null or doc.size_bytes<=0 or not exists(select 1 from storage.objects where bucket_id=doc.storage_bucket and name=doc.storage_path)
 then raise exception 'VERIFIED_LEASE_DOCUMENT_REQUIRED';end if;
 if p_action='sign' and (p_deposit is distinct from l.deposit or not exists(select 1 from public.aqari_source_lease_reviews where workspace_id=p_workspace_id and lease_id=p_lease_id and action='approve' and document_id=p_document_id)) then raise exception 'APPROVED_DOCUMENT_REQUIRED';end if;
 next_status:=case p_action when 'approve' then 'approved' else 'signed' end;
 review_id:=gen_random_uuid();
 next_snapshot:=l.snapshot||jsonb_build_object('status',next_status,'deposit',p_deposit,'tenant',t.full_name,'tenantProfile',t.profile,
 'importStatus','reviewed','operationalReview',jsonb_build_object('id',review_id,'documentId',doc.id,'documentSha256',doc.checksum_sha256,'reviewedBy',auth.uid(),'reviewedAt',now(),'note',btrim(p_note),'action',p_action));
 -- Imported sourceValues/sourceReference remain intact; the dedicated audit retains before and after.
 update public.aqari_leases set status=next_status,deposit=p_deposit,snapshot=next_snapshot where workspace_id=p_workspace_id and id=p_lease_id;
 d:=private.aqari_unwrap(saved.payload);
 if (select count(*) from jsonb_array_elements(d->'contractsV202') x where x->>'id'=l.external_ref)<>1 then raise exception 'SOURCE_STATE_LINK_REQUIRED';end if;
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when value->>'id'=l.external_ref then next_snapshot else value end order by ordinality) from jsonb_array_elements(d->'contractsV202') with ordinality));
 -- Same locked transaction: projection verifies the reviewed snapshot against the lease row.
 update public.aqari_app_state set payload=d where workspace_id=p_workspace_id;
 select revision into revision_after from public.aqari_app_state where workspace_id=p_workspace_id;
 insert into public.aqari_source_lease_reviews(id,workspace_id,lease_id,document_id,action,reviewer_id,note,before_snapshot,after_snapshot)
 values(review_id,p_workspace_id,p_lease_id,p_document_id,p_action,auth.uid(),btrim(p_note),l.snapshot,next_snapshot);
 insert into public.aqari_operation_audit(workspace_id,user_id,action,revision) values(p_workspace_id,auth.uid(),'source_lease_'||p_action||':'||review_id::text,revision_after);
 return jsonb_build_object('lease_id',p_lease_id,'status',next_status,'review_id',review_id,'revision',revision_after);
end $$;
revoke all on function private.aqari_review_source_lease(uuid,uuid,uuid,text,numeric,text,bigint) from public,anon;
grant execute on function private.aqari_review_source_lease(uuid,uuid,uuid,text,numeric,text,bigint) to authenticated;
create function public.aqari_review_source_lease(p_workspace_id uuid,p_lease_id uuid,p_document_id uuid,p_action text,p_deposit numeric,p_note text,p_expected_revision bigint)
returns jsonb language sql security invoker set search_path='' as $$
 select private.aqari_review_source_lease(p_workspace_id,p_lease_id,p_document_id,p_action,p_deposit,p_note,p_expected_revision);
$$;
revoke all on function public.aqari_review_source_lease(uuid,uuid,uuid,text,numeric,text,bigint) from public,anon;
grant execute on function public.aqari_review_source_lease(uuid,uuid,uuid,text,numeric,text,bigint) to authenticated;
