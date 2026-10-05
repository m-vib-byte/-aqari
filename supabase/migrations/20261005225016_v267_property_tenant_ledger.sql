-- AQARI V267: permission-scoped tenants and authoritative rent-due ledger for Complete Property File.
-- Read-only activation after authenticated Preview acceptance on 2026-10-05.
-- Requires rent-due-schedule.sql and existing staff/property scope permissions.
-- Does not generate dues, change balances, or alter business records.
begin;

create or replace function public.aqari_property_tenant_ledger(
  p_workspace_id uuid,
  p_property_id uuid,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  can_contracts boolean;
  can_tenants boolean;
  can_collections boolean;
  tenant_rows jsonb := null;
  due_rows jsonb := null;
begin
  if p_as_of is null
     or not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') then
    raise insufficient_privilege using message='ACCESS_DENIED';
  end if;
  if not exists(
    select 1 from public.aqari_properties p
    where p.workspace_id=p_workspace_id and p.id=p_property_id
  ) then
    raise no_data_found using message='PROPERTY_NOT_FOUND';
  end if;

  can_contracts:=private.aqari_can(p_workspace_id,'contracts','read');
  can_tenants:=private.aqari_can(p_workspace_id,'tenants','read');
  can_collections:=private.aqari_can(p_workspace_id,'collections','read');

  if can_contracts and can_tenants then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',t.id,
      'fullName',t.full_name,
      'nameAr',coalesce(nullif(t.profile->>'nameAr',''),t.full_name),
      'nameEn',nullif(t.profile->>'nameEn',''),
      'phone',t.phone,
      'email',t.email,
      'isActive',t.is_active,
      'contracts',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',l2.id,'contractNo',l2.contract_no,'status',l2.status,
          'unitId',l2.unit_id,'unitNo',u2.unit_no,'startDate',l2.start_date,'endDate',l2.end_date
        ) order by l2.start_date desc,l2.contract_no),'[]'::jsonb)
        from public.aqari_leases l2
        join public.aqari_units u2 on u2.workspace_id=l2.workspace_id and u2.id=l2.unit_id
        where l2.workspace_id=p_workspace_id and l2.tenant_id=t.id and u2.property_id=p_property_id
      )
    ) order by t.full_name,t.id),'[]'::jsonb)
    into tenant_rows
    from public.aqari_tenants t
    where t.workspace_id=p_workspace_id
      and exists(
        select 1 from public.aqari_leases l
        join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
        where l.workspace_id=p_workspace_id and l.tenant_id=t.id and u.property_id=p_property_id
      );
  end if;

  if can_contracts and can_collections then
    select coalesce(jsonb_agg(jsonb_build_object(
      'leaseId',d.lease_id,
      'contractNo',l.contract_no,
      'tenantId',l.tenant_id,
      'unitId',l.unit_id,
      'unitNo',u.unit_no,
      'period',d.period,
      'dueAmount',d.due_amount,
      'paidAmount',d.paid_amount,
      'balance',d.balance,
      'status',d.status,
      'sourceHash',d.source_hash
    ) order by d.period desc,l.contract_no,u.unit_no),'[]'::jsonb)
    into due_rows
    from private.aqari_rent_due_periods d
    join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id
    join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
    where d.workspace_id=p_workspace_id and u.property_id=p_property_id;
  end if;

  return jsonb_build_object(
    'available',true,
    'workspace_id',p_workspace_id,
    'property_id',p_property_id,
    'asOf',p_as_of,
    'permissions',jsonb_build_object(
      'contracts',can_contracts,
      'tenants',can_tenants,
      'collections',can_collections
    ),
    'tenants',tenant_rows,
    'rentDues',due_rows
  );
end $$;

revoke all on function public.aqari_property_tenant_ledger(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_tenant_ledger(uuid,uuid,date) to authenticated;

commit;
