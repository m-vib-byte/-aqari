-- AQARI V267 commercial terms, common charges and signed inspection register.
-- CODE ONLY: apply to isolated Staging after operations-register.sql.
begin;

create or replace function public.aqari_compliance_register(
 p_workspace_id uuid,p_domain text,p_action text,p_data jsonb default '{}'::jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=coalesce(p_data,'{}'); ident uuid:=nullif(p_data->>'id','')::uuid;
 actor uuid:=auth.uid(); lease_row public.aqari_leases; unit_row public.aqari_units; property_id uuid;
 current_revision integer; expected integer:=coalesce((d->>'revision')::integer,0);
 total numeric(15,3); allocated numeric(15,3); item jsonb; doc_id uuid; result jsonb;
begin
 if actor is null or not private.aqari_manager(w) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if p_domain not in ('commercial','common_charges','inspections') then raise exception 'INVALID_COMPLIANCE_DOMAIN' using errcode='22023'; end if;
 if p_action='list' then
  if not (private.aqari_can(w,'contracts','read') or private.aqari_can(w,'finance','read') or private.aqari_can(w,'maintenance','read')) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  return jsonb_build_object(
   'leases',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'contract_no',l.contract_no,'unit_id',l.unit_id,'property_id',u.property_id) order by l.contract_no),'[]') from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=w),
   'properties',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name),'[]') from public.aqari_properties p where p.workspace_id=w),
   'documents',(select coalesce(jsonb_agg(jsonb_build_object('id',doc.id,'title',doc.title,'property_id',p.id) order by doc.created_at desc),'[]') from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref join storage.objects o on o.bucket_id=doc.storage_bucket and o.name=doc.storage_path where doc.workspace_id=w and doc.entity_type='property' and doc.status='uploaded' and doc.checksum_sha256~'^[a-f0-9]{64}$' and doc.size_bytes>0 and (o.metadata->>'size')::bigint=doc.size_bytes),
   'commercial',(select coalesce(jsonb_agg(to_jsonb(x) order by x.lease_id),'[]') from private.aqari_commercial_terms x where x.workspace_id=w),
   'allocations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') from private.aqari_common_charge_allocations x where x.workspace_id=w),
   'inspections',(select coalesce(jsonb_agg(to_jsonb(x) order by x.inspected_at desc),'[]') from private.aqari_unit_inspections x where x.workspace_id=w)
  );
 end if;
 perform private.aqari_require_sensitive_aal2(w);
 if ident is null then raise exception 'ID_REQUIRED' using errcode='22023'; end if;

 if p_domain='commercial' and p_action='save' then
  select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=ident;
  if not found then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  select u.property_id into property_id from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  if not private.aqari_can_property(w,property_id,'contracts','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if length(btrim(coalesce(d->>'permitted_activity','')))<2 or length(btrim(coalesce(d->>'license_no','')))<2
   or coalesce((d->>'grace_days')::integer,-1) not between 0 and 366
   or coalesce((d->>'sales_percentage')::numeric,-1) not between 0 and 100
   or coalesce((d->>'cam_amount')::numeric,-1)<0
   or length(btrim(coalesce(d->>'compliance_reference','')))<5
  then raise exception 'INVALID_COMMERCIAL_TERMS' using errcode='22023'; end if;
  select revision into current_revision from private.aqari_commercial_terms where workspace_id=w and lease_id=ident for update;
  if found and current_revision<>expected then raise serialization_failure using message='REVISION_CONFLICT'; end if;
  insert into private.aqari_commercial_terms(lease_id,workspace_id,grace_days,sales_percentage,cam_amount,permitted_activity,license_no,license_expires_on,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
  values(ident,w,(d->>'grace_days')::integer,(d->>'sales_percentage')::numeric,(d->>'cam_amount')::numeric,btrim(d->>'permitted_activity'),btrim(d->>'license_no'),nullif(d->>'license_expires_on','')::date,actor,now(),btrim(d->>'compliance_reference'))
  on conflict(lease_id) do update set grace_days=excluded.grace_days,sales_percentage=excluded.sales_percentage,cam_amount=excluded.cam_amount,permitted_activity=excluded.permitted_activity,license_no=excluded.license_no,license_expires_on=excluded.license_expires_on,compliance_reviewed_by=actor,compliance_reviewed_at=now(),compliance_reference=excluded.compliance_reference,revision=aqari_commercial_terms.revision+1
  returning to_jsonb(aqari_commercial_terms) into result;
  insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),btrim(d->>'compliance_reference'),result);
  return result;

 elsif p_domain='common_charges' and p_action='allocate' then
  property_id:=nullif(d->>'property_id','')::uuid; total:=private.aqari_hr_money(d->'total_amount');
  if not private.aqari_can_property(w,property_id,'finance','write') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
  if d->>'basis' not in ('area','consumption') or length(btrim(coalesce(d->>'invoice_reference','')))<3 or jsonb_typeof(d->'allocations')<>'array' or jsonb_array_length(d->'allocations')=0 then raise exception 'INVALID_COMMON_CHARGE' using errcode='22023'; end if;
  if (select count(*)<>count(distinct x->>'unit_id') from jsonb_array_elements(d->'allocations') x) then raise exception 'DUPLICATE_ALLOCATION_UNIT' using errcode='23505'; end if;
  allocated:=0;
  for item in select value from jsonb_array_elements(d->'allocations') loop
   select * into unit_row from public.aqari_units u where u.workspace_id=w and u.id=(item->>'unit_id')::uuid and u.property_id=property_id;
   if not found or private.aqari_hr_money(item->'amount')<=0 then raise exception 'INVALID_ALLOCATION_LINE' using errcode='22023'; end if;
   allocated:=allocated+private.aqari_hr_money(item->'amount');
  end loop;
  if allocated<>total then raise exception 'ALLOCATION_TOTAL_MISMATCH' using errcode='23514'; end if;
  insert into private.aqari_common_charge_allocations(id,workspace_id,property_id,invoice_reference,basis,total_amount,allocations,approved_by,approved_at)
  values(ident,w,property_id,btrim(d->>'invoice_reference'),d->>'basis',total,d->'allocations',actor,now());
  for item in select value from jsonb_array_elements(d->'allocations') loop
   select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.unit_id=(item->>'unit_id')::uuid and l.status='active';
   if not found then raise exception 'ACTIVE_LEASE_REQUIRED_FOR_ALLOCATION' using errcode='23514'; end if;
   insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
   values(gen_random_uuid(),w,lease_row.id,'common_charge','debit',private.aqari_hr_money(item->'amount'),current_date,'common_charge:'||(item->>'unit_id'),ident,'توزيع فاتورة خدمات '||btrim(d->>'invoice_reference'),actor);
  end loop;
  select to_jsonb(x) into result from private.aqari_common_charge_allocations x where x.id=ident; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),btrim(d->>'invoice_reference'),result); return result;

 elsif p_domain='inspections' and p_action='create' then
  select l.* into lease_row from public.aqari_leases l where l.workspace_id=w and l.id=(d->>'lease_id')::uuid;
  select u.* into unit_row from public.aqari_units u where u.workspace_id=w and u.id=lease_row.unit_id;
  property_id:=unit_row.property_id;
  if not private.aqari_can_property(w,property_id,'maintenance','write') or d->>'kind' not in ('move_in','periodic','renewal','move_out') or jsonb_typeof(d->'checklist')<>'array' or jsonb_array_length(d->'checklist')=0 then raise exception 'INVALID_INSPECTION' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(coalesce(d->'photo_document_ids','[]')) loop
   if not private.aqari_operations_document(w,property_id,trim(both '"' from item::text)::uuid) then raise exception 'INSPECTION_PHOTO_UNVERIFIED' using errcode='23514'; end if;
  end loop;
  insert into private.aqari_unit_inspections(id,workspace_id,lease_id,unit_id,kind,inspected_at,checklist,photo_document_ids)
  values(ident,w,lease_row.id,unit_row.id,d->>'kind',coalesce(nullif(d->>'inspected_at','')::timestamptz,now()),d->'checklist',coalesce(d->'photo_document_ids','[]')) returning to_jsonb(aqari_unit_inspections) into result; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),'inspection draft',result); return result;

 elsif p_domain='inspections' and p_action='sign' then
  select i.revision,u.property_id into current_revision,property_id from private.aqari_unit_inspections i join public.aqari_units u on u.workspace_id=i.workspace_id and u.id=i.unit_id where i.workspace_id=w and i.id=ident and i.status='draft' for update of i;
  if not found or current_revision<>expected then raise serialization_failure using message='INSPECTION_REVISION_CONFLICT'; end if;
  doc_id:=nullif(d->>'tenant_signature_document_id','')::uuid;
  if not private.aqari_operations_document(w,property_id,doc_id) or not private.aqari_operations_document(w,property_id,nullif(d->>'inspector_signature_document_id','')::uuid) then raise exception 'SIGNATURE_DOCUMENT_UNVERIFIED' using errcode='23514'; end if;
  update private.aqari_unit_inspections set status='signed',tenant_signature_document_id=doc_id,inspector_signature_document_id=(d->>'inspector_signature_document_id')::uuid,signed_by=actor,signed_at=now(),revision=revision+1 where id=ident returning to_jsonb(aqari_unit_inspections) into result; insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value) values(w,p_domain,ident,p_action,actor,coalesce(auth.jwt()->>'email',actor::text),'inspection signed',result); return result;
 else raise exception 'INVALID_COMPLIANCE_ACTION' using errcode='22023'; end if;
end $$;

revoke all on function public.aqari_compliance_register(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_compliance_register(uuid,text,text,jsonb) to authenticated;
commit;
