-- Wire the additive property portfolio records to the live tenant and property screens.
-- DDL only: no existing property, tenant, lease, payment or document row is changed.
begin;

create or replace function public.aqari_tenant_portfolio_context(p_workspace_id uuid,p_tenant_ref text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant_row public.aqari_tenants%rowtype;properties jsonb;
begin
 if auth.uid() is null or not private.aqari_can(p_workspace_id,'tenants','read') or not private.aqari_can(p_workspace_id,'contracts','read') then
  raise insufficient_privilege using message='ACCESS_DENIED';
 end if;
 select * into tenant_row from public.aqari_tenants
  where workspace_id=p_workspace_id and external_ref=p_tenant_ref;
 if not found then raise no_data_found using message='TENANT_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',scope.id,'name',scope.name,
   'leaseCount',(select count(*) from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=tenant_row.id and u.property_id=scope.id),
   'receiptCount',(select count(*) from public.aqari_rent_payments pay join public.aqari_leases l on l.workspace_id=pay.workspace_id and l.id=pay.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where pay.workspace_id=p_workspace_id and l.tenant_id=tenant_row.id and u.property_id=scope.id)
  ) order by scope.name),'[]'::jsonb) into properties
 from (
  select distinct p.id,p.name from public.aqari_leases l
  join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  join public.aqari_properties p on p.workspace_id=u.workspace_id and p.id=u.property_id
  where l.workspace_id=p_workspace_id and l.tenant_id=tenant_row.id
   and private.aqari_can_property(p_workspace_id,p.id,'properties','read')
 ) scope;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'tenantId',tenant_row.id,'tenantRef',tenant_row.external_ref,'properties',properties);
end $$;
revoke all on function public.aqari_tenant_portfolio_context(uuid,text) from public,anon;
grant execute on function public.aqari_tenant_portfolio_context(uuid,text) to authenticated;

create or replace function public.aqari_tenant_complete_file(p_workspace_id uuid,p_property_id uuid,p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant_row public.aqari_tenants%rowtype;family jsonb;leases jsonb;documents jsonb;receipts jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'tenants','read') or not private.aqari_can(p_workspace_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id) then raise insufficient_privilege using message='TENANT_PROPERTY_SCOPE_MISMATCH';end if;
 select * into strict tenant_row from public.aqari_tenants where workspace_id=p_workspace_id and id=p_tenant_id;
 select jsonb_build_object('civilIdExpiresOn',f.civil_id_expires_on,'husbandName',coalesce(f.husband_name,''),'wifeName',coalesce(f.wife_name,''),'revision',coalesce(f.revision,0),'updatedAt',f.updated_at) into family from (select 1) seed left join private.aqari_tenant_family_details f on f.workspace_id=p_workspace_id and f.tenant_id=p_tenant_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'externalRef',l.external_ref,'contractNo',l.contract_no,'unitId',l.unit_id,'unitNo',u.unit_no,'status',l.status,'startDate',l.start_date,'endDate',l.end_date,'monthlyRent',l.monthly_rent) order by l.start_date desc,l.contract_no),'[]') into leases from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id;
 if private.aqari_can(p_workspace_id,'collections','read') then
  select coalesce(jsonb_agg(jsonb_build_object('id',pay.id,'leaseId',pay.lease_id,'reference',pay.reference,'amount',pay.amount,'period',pay.period,'paidAt',pay.paid_at,'status',pay.status,'paymentMethod',pay.payment_method,'createdAt',pay.created_at) order by pay.paid_at desc,pay.created_at desc),'[]') into receipts
  from public.aqari_rent_payments pay join public.aqari_leases l on l.workspace_id=pay.workspace_id and l.id=pay.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
  where pay.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id;
 else receipts:=null;end if;
 if private.aqari_can(p_workspace_id,'documents','read') then
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'documentNo',d.document_no,'entityType',d.entity_type,'entityRef',d.entity_ref,'documentType',d.document_type,'title',d.title,'mimeType',d.mime_type,'status',d.status,'metadata',d.metadata,'createdAt',d.created_at) order by d.created_at desc) filter(where d.id is not null),'[]') into documents from public.aqari_documents d where d.workspace_id=p_workspace_id and d.status<>'cancelled' and ((d.entity_type='tenant' and d.entity_ref in(p_tenant_id::text,tenant_row.external_ref)) or (d.entity_type='lease' and d.entity_ref in(select x->>'id' from jsonb_array_elements(leases)x union select x->>'externalRef' from jsonb_array_elements(leases)x)));
 else documents:=null;end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'propertyId',p_property_id,'tenant',jsonb_build_object('id',tenant_row.id,'externalRef',tenant_row.external_ref,'name',tenant_row.full_name,'civilId',tenant_row.civil_id,'phone',tenant_row.phone,'email',tenant_row.email,'profile',tenant_row.profile),'family',family,'leases',leases,'receipts',receipts,'documents',documents);
end $$;
revoke all on function public.aqari_tenant_complete_file(uuid,uuid,uuid) from public,anon;
grant execute on function public.aqari_tenant_complete_file(uuid,uuid,uuid) to authenticated;

commit;
