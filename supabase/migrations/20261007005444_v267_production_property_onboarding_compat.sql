-- Additive production onboarding compatibility; no business-row updates at installation.
begin;
set local lock_timeout='5s';
do $guard$ begin
 if md5(pg_get_functiondef('private.aqari_property_master_snapshot(uuid,uuid)'::regprocedure))<>'eef52e2bc2617fa640e0a8fe85be9298' or md5(pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure))<>'c01f611d935b0670aaa643a8d5588e06' then raise exception 'PRODUCTION_PROPERTY_SOURCE_CHANGED';end if;
 if to_regprocedure('public.aqari_property_completeness(uuid,uuid)') is not null then raise exception 'PRODUCTION_COMPLETENESS_ALREADY_PRESENT';end if;
end $guard$;
alter table private.aqari_property_master add column description text not null default '';
alter table private.aqari_property_master add column tenant_visibility jsonb not null default '{}'::jsonb;
alter table private.aqari_property_master add column tenant_public_info jsonb not null default '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.aqari_property_master_save(p_workspace_id uuid, p_property_id uuid, p_expected_revision bigint, p_data jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_row private.aqari_property_master%rowtype; new_row private.aqari_property_master%rowtype;
 old_snapshot jsonb; new_snapshot jsonb; actor text; nm text; owners jsonb; income numeric; rev bigint; location_value text; automatic_value text; description_value text; visibility_value jsonb; tenant_info_value jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('name','address','type','status','statedIncome','owners','email','phone','whatsapp','assets','locationUrl','propertyAutomaticRef','description','tenantVisibility','tenantInfo')) then raise invalid_parameter_value using message='PROPERTY_MASTER_INVALID';end if;
 nm:=btrim(coalesce(p_data->>'name',''));if length(nm) not between 1 and 200 then raise invalid_parameter_value using message='PROPERTY_NAME_REQUIRED';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
 owners:=private.aqari_property_owners_normalize(coalesce(p_data->'owners','[]'::jsonb));if not private.aqari_property_owners_valid(owners) then raise invalid_parameter_value using message='PROPERTY_OWNERS_INVALID_OR_NOT_100_PERCENT';end if;
 begin income:=nullif(p_data->>'statedIncome','')::numeric;exception when others then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end;
 if income is not null and (income<0 or round(income,3)<>income) then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end if;
 if length(coalesce(p_data->>'address',''))>1000 or length(coalesce(p_data->>'type',''))>120 or length(coalesce(p_data->>'status','')) not between 1 and 80 or length(coalesce(p_data->>'email',''))>320 or length(coalesce(p_data->>'phone',''))>40 or length(coalesce(p_data->>'whatsapp',''))>40 then raise invalid_parameter_value using message='PROPERTY_MASTER_FIELD_INVALID';end if;
 if coalesce(p_data->>'email','')<>'' and coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise invalid_parameter_value using message='PROPERTY_EMAIL_INVALID';end if;
 if jsonb_typeof(coalesce(p_data->'assets','{}'::jsonb))<>'object' or octet_length(coalesce(p_data->'assets','{}'::jsonb)::text)>200000 then raise invalid_parameter_value using message='PROPERTY_ASSETS_INVALID';end if;
 perform 1 from public.aqari_properties where workspace_id=p_workspace_id and id=p_property_id for update;if not found then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 old_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 select * into old_row from private.aqari_property_master where workspace_id=p_workspace_id and property_id=p_property_id for update;
 rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception 'PROPERTY_MASTER_REVISION_CONFLICT' using errcode='40001';end if;
 location_value:=case when p_data?'locationUrl' then btrim(coalesce(p_data->>'locationUrl','')) else coalesce(old_row.location_url,'') end;
 automatic_value:=case when p_data?'propertyAutomaticRef' then btrim(coalesce(p_data->>'propertyAutomaticRef','')) else coalesce(old_row.property_automatic_ref,'') end;
 description_value:=case when p_data?'description' then btrim(coalesce(p_data->>'description','')) else coalesce(old_row.description,'') end;
 visibility_value:=case when p_data?'tenantVisibility' then p_data->'tenantVisibility' else coalesce(old_row.tenant_visibility,'{}'::jsonb) end;
 tenant_info_value:=case when p_data?'tenantInfo' then p_data->'tenantInfo' else coalesce(old_row.tenant_public_info,'{}'::jsonb) end;
 if length(description_value)>5000 or (p_data?'description' and jsonb_typeof(p_data->'description') not in ('string','null')) then raise invalid_parameter_value using message='PROPERTY_DESCRIPTION_INVALID';end if;
 if jsonb_typeof(visibility_value) is distinct from 'object' or octet_length(visibility_value::text)>10000 then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_INVALID';end if;
 if visibility_value?'officeHours' then
  if visibility_value?'office_hours' and visibility_value->'office_hours' is distinct from visibility_value->'officeHours' then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_CONFLICT';end if;
  visibility_value:=(visibility_value-'officeHours')||jsonb_build_object('office_hours',visibility_value->'officeHours');
 end if;
 if exists(select 1 from jsonb_each(visibility_value) e where e.key !~ '^[a-z][a-z0-9_.-]{0,49}$' or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_INVALID';end if;
 if jsonb_typeof(tenant_info_value) is distinct from 'object' or octet_length(tenant_info_value::text)>30000 then raise invalid_parameter_value using message='PROPERTY_TENANT_INFO_INVALID';end if;
 if exists(select 1 from jsonb_each(tenant_info_value) e where e.key not in ('instructions','officeHours','emergency','services') or jsonb_typeof(e.value)<>'string') then raise invalid_parameter_value using message='PROPERTY_TENANT_INFO_INVALID';end if;
 if length(location_value)>2000 or length(automatic_value)>200 then raise invalid_parameter_value using message='PROPERTY_EXTENDED_FIELD_INVALID';end if;
 if location_value<>'' and location_value !~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$' then raise invalid_parameter_value using message='PROPERTY_LOCATION_URL_INVALID';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_properties set name=nm where workspace_id=p_workspace_id and id=p_property_id;
 insert into private.aqari_property_master(workspace_id,property_id,address,property_type,status,stated_income,owners,contact_email,contact_phone,contact_whatsapp,assets,location_url,property_automatic_ref,description,tenant_visibility,tenant_public_info,revision,updated_by,updated_at)
 values(p_workspace_id,p_property_id,btrim(coalesce(p_data->>'address','')),btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','active')),income,owners,lower(btrim(coalesce(p_data->>'email',''))),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'whatsapp','')),coalesce(p_data->'assets','{}'::jsonb),location_value,automatic_value,description_value,visibility_value,tenant_info_value,rev+1,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set address=excluded.address,property_type=excluded.property_type,status=excluded.status,stated_income=excluded.stated_income,owners=excluded.owners,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,contact_whatsapp=excluded.contact_whatsapp,assets=excluded.assets,location_url=excluded.location_url,property_automatic_ref=excluded.property_automatic_ref,description=excluded.description,tenant_visibility=excluded.tenant_visibility,tenant_public_info=excluded.tenant_public_info,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 returning * into new_row;
 new_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,'property','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'property',new_snapshot);
end $function$
;
CREATE OR REPLACE FUNCTION private.aqari_property_master_snapshot(w uuid, p uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'id',x.id,'externalRef',x.external_ref,'name',x.name,
  'address',coalesce(m.address,x.metadata->>'location',''),
  'description',coalesce(m.description,''),
  'tenantVisibility',coalesce(m.tenant_visibility,'{}'::jsonb)||case when coalesce(m.tenant_visibility,'{}'::jsonb)?'office_hours' then jsonb_build_object('officeHours',m.tenant_visibility->'office_hours') else '{}'::jsonb end,
  'tenantInfo',coalesce(m.tenant_public_info,'{}'::jsonb),
  'type',case when m.property_id is not null then coalesce(m.property_type,'') else coalesce(x.metadata->>'propertyType','') end,
  'status',coalesce(nullif(m.status,''),x.metadata->>'propertyStatus','active'),
  'statedIncome',case when m.property_id is not null then m.stated_income else nullif(x.metadata->>'propertyMonthlyIncome','')::numeric end,
  'owners',coalesce(m.owners,'[]'::jsonb),
  'email',coalesce(m.contact_email,''),'phone',coalesce(m.contact_phone,''),'whatsapp',coalesce(m.contact_whatsapp,''),
  'assets',coalesce(m.assets,'{"photos":[],"documents":[],"plans":[]}'::jsonb),
  'locationUrl',coalesce(m.location_url,''),'propertyAutomaticRef',coalesce(m.property_automatic_ref,''),'revision',coalesce(m.revision,0),'updatedAt',m.updated_at
 )
 from public.aqari_properties x left join private.aqari_property_master m
  on m.workspace_id=x.workspace_id and m.property_id=x.id
 where x.workspace_id=w and x.id=p
$function$
;
create or replace function public.aqari_property_completeness(p_workspace_id uuid,p_property_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p jsonb;units jsonb;completed int:=0;total int:=12;missing jsonb:='[]'::jsonb;has_contact boolean;owners_ok boolean;unit_count int;units_complete boolean;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 select coalesce(jsonb_agg(private.aqari_unit_master_snapshot(p_workspace_id,u.id)),'[]'::jsonb),count(*)::int into units,unit_count from public.aqari_units u where u.workspace_id=p_workspace_id and u.property_id=p_property_id;
 has_contact:=coalesce(p->>'phone','')<>'' or coalesce(p->>'whatsapp','')<>'' or coalesce(p->>'email','')<>'';
 owners_ok:=jsonb_array_length(coalesce(p->'owners','[]'::jsonb))>0 and private.aqari_property_owners_valid(coalesce(p->'owners','[]'::jsonb));
 units_complete:=unit_count>0 and not exists(select 1 from jsonb_array_elements(units)u where btrim(coalesce(u->>'unitNo',''))='' or btrim(coalesce(u->>'floor',''))='' or btrim(coalesce(u->>'type',''))='' or btrim(coalesce(u->>'status',''))='');
 if btrim(coalesce(p->>'name',''))<>'' then completed:=completed+1;else missing:=missing||'"اسم العقار"'::jsonb;end if;
 if btrim(coalesce(p->>'address',''))<>'' then completed:=completed+1;else missing:=missing||'"العنوان"'::jsonb;end if;
 if btrim(coalesce(p->>'type',''))<>'' then completed:=completed+1;else missing:=missing||'"نوع العقار"'::jsonb;end if;
 if btrim(coalesce(p->>'status',''))<>'' then completed:=completed+1;else missing:=missing||'"حالة العقار"'::jsonb;end if;
 if btrim(coalesce(p->>'description',''))<>'' then completed:=completed+1;else missing:=missing||'"الوصف المختصر"'::jsonb;end if;
 if owners_ok then completed:=completed+1;else missing:=missing||'"الملاك والحصص 100%"'::jsonb;end if;
 if has_contact then completed:=completed+1;else missing:=missing||'"وسيلة تواصل واحدة على الأقل"'::jsonb;end if;
 if btrim(coalesce(p->>'locationUrl',''))<>'' then completed:=completed+1;else missing:=missing||'"رابط الموقع"'::jsonb;end if;
 if coalesce(p#>>'{assets,logo}','')<>'' then completed:=completed+1;else missing:=missing||'"الشعار"'::jsonb;end if;
 if coalesce(p#>>'{assets,mainPhoto}','')<>'' or jsonb_array_length(coalesce(p#>'{assets,photos}','[]'::jsonb))>0 then completed:=completed+1;else missing:=missing||'"الصورة الرئيسية/صور العقار"'::jsonb;end if;
 if coalesce(p#>>'{assets,titleDeed}','')<>'' then completed:=completed+1;else missing:=missing||'"الوثيقة"'::jsonb;end if;
 if units_complete then completed:=completed+1;else missing:=missing||case when unit_count=0 then '"وحدة واحدة على الأقل"'::jsonb else '"اكتمال رقم الوحدة والدور والنوع والحالة"'::jsonb end;end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'score',round(completed*100.0/total),'completed',completed,'total',total,'missing',missing,
  'advisory',jsonb_build_array('الرخص والشهادات والتأمينات تُضاف عند انطباقها ولا تُخفض النسبة الأساسية تلقائيًا.'));
end $$;
revoke all on function public.aqari_property_completeness(uuid,uuid) from public,anon;
grant execute on function public.aqari_property_completeness(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
