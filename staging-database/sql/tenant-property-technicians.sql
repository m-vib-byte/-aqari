-- AQARI V267 Preview/Staging only: tenant-visible technicians are derived from the
-- authenticated tenant's current signed leases and the property controls configured
-- by General Management. No direct table grant is added.
begin;

create or replace function public.aqari_tenant_property_support()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  account public.aqari_portal_accounts%rowtype;
begin
  if auth.uid() is null then
    raise insufficient_privilege using message='TENANT_ACCESS_DENIED';
  end if;

  select * into account
  from public.aqari_portal_accounts a
  where a.user_id=auth.uid() and a.is_active;

  if not found or not private.aqari_owns_tenant(account.workspace_id,account.tenant_id) then
    raise insufficient_privilege using message='TENANT_ACCESS_DENIED';
  end if;

  return jsonb_build_object(
    'workspaceId',account.workspace_id,
    'tenantId',account.tenant_id,
    'properties',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'propertyId',scope.property_id,
          'propertyName',scope.property_name,
          'techniciansEnabled',scope.technicians_enabled,
          'maintenanceEnabled',scope.maintenance_enabled,
          'technicians',case when scope.technicians_enabled then coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'employeeId',assignment.employee_id,
                'nameAr',coalesce(employee.profile->>'name_ar',''),
                'nameEn',coalesce(employee.profile->>'name_en',''),
                'jobAr',coalesce(employee.profile->>'job_ar',''),
                'phone',assignment.phone,
                'whatsapp',assignment.whatsapp
              )
              order by coalesce(nullif(employee.profile->>'name_ar',''),nullif(employee.profile->>'name_en',''),employee.id::text)
            )
            from private.aqari_property_technicians assignment
            join private.aqari_hr_employees employee
              on employee.workspace_id=assignment.workspace_id
             and employee.id=assignment.employee_id
            where assignment.workspace_id=account.workspace_id
              and assignment.property_id=scope.property_id
              and assignment.is_active
              and assignment.public_to_tenant
              and employee.status<>'inactive'
          ),'[]'::jsonb) else '[]'::jsonb end
        )
        order by scope.property_name,scope.property_id
      )
      from (
        select distinct
          property.id as property_id,
          property.name as property_name,
          case
            when jsonb_typeof(feature.settings->'technicians')='boolean'
              then (feature.settings->>'technicians')::boolean
            else true
          end as technicians_enabled,
          case
            when jsonb_typeof(feature.settings->'maintenance')='boolean'
              then (feature.settings->>'maintenance')::boolean
            else true
          end as maintenance_enabled
        from public.aqari_leases lease
        join public.aqari_units unit
          on unit.workspace_id=lease.workspace_id
         and unit.id=lease.unit_id
        join public.aqari_properties property
          on property.workspace_id=unit.workspace_id
         and property.id=unit.property_id
        left join private.aqari_property_feature_settings feature
          on feature.workspace_id=property.workspace_id
         and feature.property_id=property.id
        where lease.workspace_id=account.workspace_id
          and lease.tenant_id=account.tenant_id
          and lease.status='signed'
          and current_date between lease.start_date and lease.end_date
      ) scope
    ),'[]'::jsonb)
  );
end $$;

revoke all on function public.aqari_tenant_property_support() from public,anon;
grant execute on function public.aqari_tenant_property_support() to authenticated;

commit;
