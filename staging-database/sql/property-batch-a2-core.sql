-- AQARI V267 isolated trial — Batch A2 property master, unit detail, tenant-visible channels and completeness.
-- Additive only. Existing master save callers remain compatible and omitted new fields are preserved.
begin;

alter table private.aqari_property_master add column if not exists description text not null default '';
alter table private.aqari_property_master add column if not exists location_url text not null default '';
alter table private.aqari_property_master add column if not exists property_automatic_ref text not null default '';
alter table private.aqari_property_master add column if not exists tenant_visibility jsonb not null default '{}'::jsonb;
alter table private.aqari_property_master add column if not exists tenant_public_info jsonb not null default '{}'::jsonb;
create unique index if not exists aqari_property_master_automatic_ref_uq
 on private.aqari_property_master(workspace_id,lower(btrim(property_automatic_ref)))
 where btrim(property_automatic_ref)<>'';

alter table private.aqari_unit_master add column if not exists area_sqm numeric(12,3);
alter table private.aqari_unit_master add column if not exists internal_serial text not null default '';
alter table private.aqari_unit_master add column if not exists parking text not null default '';
alter table private.aqari_unit_master add column if not exists storage_details text not null default '';
alter table private.aqari_unit_master add column if not exists services jsonb not null default '{}'::jsonb;
create unique index if not exists aqari_unit_master_internal_serial_uq
 on private.aqari_unit_master(workspace_id,property_id,lower(btrim(internal_serial)))
 where btrim(internal_serial)<>'';
create unique index if not exists aqari_unit_master_automatic_ref_uq
 on private.aqari_unit_master(workspace_id,lower(btrim(automatic_ref)))
 where btrim(automatic_ref)<>'';

alter table private.aqari_property_channels drop constraint if exists aqari_property_channels_kind_check;
alter table private.aqari_property_channels add constraint aqari_property_channels_kind_check
 check(kind in('website','instagram','tiktok','snapchat','x','facebook','youtube','whatsapp','email','phone','other'));
alter table private.aqari_property_channels drop constraint if exists aqari_property_channels_public_url_check;
alter table private.aqari_property_channels add constraint aqari_property_channels_public_url_check
 check(public_url ~ '^(https://|mailto:|tel:)');
alter table private.aqari_property_channels add column if not exists display_label text not null default '';
alter table private.aqari_property_channels add column if not exists sort_order integer not null default 100 check(sort_order between 0 and 10000);
alter table private.aqari_property_channels add column if not exists revision bigint not null default 1 check(revision>0);
alter table private.aqari_property_channels add column if not exists updated_by uuid;
alter table private.aqari_property_channels add column if not exists updated_at timestamptz not null default now();
update private.aqari_property_channels set updated_by=created_by where updated_by is null;
alter table private.aqari_property_channels alter column updated_by set not null;

create or replace function private.aqari_property_channel_no_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin raise check_violation using message='PROPERTY_CHANNEL_DELETE_FORBIDDEN';end $$;
revoke all on function private.aqari_property_channel_no_delete() from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_channel_no_delete on private.aqari_property_channels;
create trigger aqari_property_channel_no_delete before delete on private.aqari_property_channels
 for each row execute function private.aqari_property_channel_no_delete();

create or replace function private.aqari_document_category_valid(category text, entity text, kind text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce((case category
  when 'owner_identity' then entity='property'
  when 'landlord_identity' then entity in ('property','lease')
  when 'tenant_identity' then entity in ('tenant','lease')
  when 'company_registration' then entity in ('property','tenant','lease')
  when 'power_of_attorney' then entity in ('property','tenant','lease')
  when 'title_deed' then entity='property'
  when 'site_plan' then entity='property'
  when 'property_logo' then entity='property'
  when 'property_main_photo' then entity='property'
  when 'property_photo' then entity='property'
  when 'property_license' then entity='property'
  when 'property_certificate' then entity='property'
  when 'property_insurance' then entity='property'
  when 'property_other' then entity='property'
  when 'electricity_service' then entity in ('property','lease')
  when 'water_service' then entity in ('property','lease')
  when 'gas_service' then entity in ('property','lease')
  when 'internet_service' then entity in ('property','lease')
  when 'signed_lease' then entity='lease'
  when 'lease_addendum' then entity='lease'
  when 'payment_receipt' then entity='lease'
  when 'cheque' then entity='lease'
  when 'bank_transfer' then entity='lease'
  when 'exit_inspection' then entity='lease'
  when 'utility_clearance' then entity='lease'
  when 'exit_notice' then entity='lease'
  when 'amicable_settlement' then entity='lease'
  when 'damage_invoice' then entity='lease'
  else false end)
  and kind=case category when 'signed_lease' then 'signed_contract' else 'supporting_document' end,false)
$$;
revoke all on function private.aqari_document_category_valid(text,text,text) from public,anon,authenticated,service_role;

create or replace function private.aqari_document_category_allowed(entity text, category text)
returns boolean language sql immutable set search_path='' as $$
 select case entity
  when 'property' then category = any(array['owner_identity','ownership_deed','survey_plan','utility_bill','property_logo','property_main_photo','property_photo','property_license','property_certificate','property_insurance','property_other','title_deed','site_plan'])
  when 'tenant' then category = any(array['tenant_identity','commercial_registration','power_of_attorney'])
  when 'lease' then category = any(array['lease_contract','contract_addendum','receipt','cheque','bank_transfer','vacating_inspection','utility_clearance','vacating_notice','amicable_settlement','damage_invoice'])
  else false end
$$;
revoke all on function private.aqari_document_category_allowed(text,text) from public,anon,authenticated,service_role;

create or replace function private.aqari_property_master_snapshot(w uuid,p uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',x.id,'externalRef',x.external_ref,'name',x.name,
  'address',coalesce(m.address,x.metadata->>'location',''),
  'description',coalesce(m.description,''),
  'locationUrl',coalesce(m.location_url,''),
  'propertyAutomaticRef',coalesce(m.property_automatic_ref,''),
  'type',coalesce(nullif(m.property_type,''),x.metadata->>'propertyType',''),
  'status',coalesce(nullif(m.status,''),x.metadata->>'propertyStatus','active'),
  'statedIncome',coalesce(m.stated_income,nullif(x.metadata->>'propertyMonthlyIncome','')::numeric),
  'owners',coalesce(m.owners,'[]'::jsonb),
  'email',coalesce(m.contact_email,''),'phone',coalesce(m.contact_phone,''),'whatsapp',coalesce(m.contact_whatsapp,''),
  'assets',coalesce(m.assets,'{"logo":null,"mainPhoto":null,"photos":[],"titleDeed":null,"plans":[],"licenses":[],"certificates":[],"insurances":[],"documents":[]}'::jsonb),
  'tenantVisibility',coalesce(m.tenant_visibility,'{}'::jsonb),
  'tenantInfo',coalesce(m.tenant_public_info,'{}'::jsonb),
  'revision',coalesce(m.revision,0),'updatedAt',m.updated_at
 )
 from public.aqari_properties x left join private.aqari_property_master m
  on m.workspace_id=x.workspace_id and m.property_id=x.id
 where x.workspace_id=w and x.id=p
$$;
revoke all on function private.aqari_property_master_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.aqari_unit_master_snapshot(w uuid,u uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'id',x.id,'propertyId',x.property_id,'unitNo',x.unit_no,
  'floor',coalesce(m.floor,''),'type',coalesce(m.unit_type,''),'status',coalesce(nullif(m.status,''),'available'),
  'areaSqm',m.area_sqm,'statedRent',m.stated_rent,
  'automaticRef',coalesce(m.automatic_ref,''),'leasedAssetAutomaticRef',coalesce(m.automatic_ref,''),
  'internalSerial',coalesce(m.internal_serial,''),'parking',coalesce(m.parking,''),'storage',coalesce(m.storage_details,''),
  'services',coalesce(m.services,'{}'::jsonb),
  'propertyAutomaticRef',coalesce(pm.property_automatic_ref,''),
  'revision',coalesce(m.revision,0),'updatedAt',m.updated_at
 )
 from public.aqari_units x
 left join private.aqari_unit_master m on m.workspace_id=x.workspace_id and m.unit_id=x.id
 left join private.aqari_property_master pm on pm.workspace_id=x.workspace_id and pm.property_id=x.property_id
 where x.workspace_id=w and x.id=u
$$;
revoke all on function private.aqari_unit_master_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_master_save(p_workspace_id uuid,p_property_id uuid,p_expected_revision bigint,p_data jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row private.aqari_property_master%rowtype;new_snapshot jsonb;old_snapshot jsonb;actor text;nm text;owners jsonb;income numeric;rev bigint;
 description_value text;location_value text;automatic_value text;visibility_value jsonb;tenant_info_value jsonb;assets_value jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('name','address','description','locationUrl','propertyAutomaticRef','type','status','statedIncome','owners','email','phone','whatsapp','assets','tenantVisibility','tenantInfo')) then raise invalid_parameter_value using message='PROPERTY_MASTER_INVALID';end if;
 nm:=btrim(coalesce(p_data->>'name',''));if length(nm) not between 1 and 200 then raise invalid_parameter_value using message='PROPERTY_NAME_REQUIRED';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
 owners:=coalesce(p_data->'owners','[]'::jsonb);if not private.aqari_property_owners_valid(owners) then raise invalid_parameter_value using message='PROPERTY_OWNERS_INVALID_OR_NOT_100_PERCENT';end if;
 begin income:=nullif(p_data->>'statedIncome','')::numeric;exception when others then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end;
 if income is not null and (income<0 or round(income,3)<>income) then raise invalid_parameter_value using message='PROPERTY_INCOME_INVALID';end if;
 if length(coalesce(p_data->>'address',''))>1000 or length(coalesce(p_data->>'type',''))>120 or length(coalesce(p_data->>'status','')) not between 1 and 80 or length(coalesce(p_data->>'email',''))>320 or length(coalesce(p_data->>'phone',''))>40 or length(coalesce(p_data->>'whatsapp',''))>40 then raise invalid_parameter_value using message='PROPERTY_MASTER_FIELD_INVALID';end if;
 if coalesce(p_data->>'email','')<>'' and coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise invalid_parameter_value using message='PROPERTY_EMAIL_INVALID';end if;
 perform 1 from public.aqari_properties where workspace_id=p_workspace_id and id=p_property_id for update;if not found then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 old_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 select * into old_row from private.aqari_property_master where workspace_id=p_workspace_id and property_id=p_property_id for update;
 rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception 'PROPERTY_MASTER_REVISION_CONFLICT' using errcode='40001';end if;
 description_value:=case when p_data?'description' then btrim(coalesce(p_data->>'description','')) else coalesce(old_row.description,'') end;
 location_value:=case when p_data?'locationUrl' then btrim(coalesce(p_data->>'locationUrl','')) else coalesce(old_row.location_url,'') end;
 automatic_value:=case when p_data?'propertyAutomaticRef' then btrim(coalesce(p_data->>'propertyAutomaticRef','')) else coalesce(old_row.property_automatic_ref,'') end;
 visibility_value:=case when p_data?'tenantVisibility' then coalesce(p_data->'tenantVisibility','{}'::jsonb) else coalesce(old_row.tenant_visibility,'{}'::jsonb) end;
 tenant_info_value:=case when p_data?'tenantInfo' then coalesce(p_data->'tenantInfo','{}'::jsonb) else coalesce(old_row.tenant_public_info,'{}'::jsonb) end;
 assets_value:=case when p_data?'assets' then coalesce(p_data->'assets','{}'::jsonb) else coalesce(old_row.assets,'{}'::jsonb) end;
 if length(description_value)>5000 or length(location_value)>2000 or length(automatic_value)>200 then raise invalid_parameter_value using message='PROPERTY_EXTENDED_FIELD_INVALID';end if;
 if location_value<>'' and location_value !~ '^https://' then raise invalid_parameter_value using message='PROPERTY_LOCATION_URL_INVALID';end if;
 if automatic_value<>'' and exists(select 1 from private.aqari_property_master q where q.workspace_id=p_workspace_id and q.property_id<>p_property_id and lower(btrim(q.property_automatic_ref))=lower(automatic_value)) then raise unique_violation using message='PROPERTY_AUTOMATIC_REF_ALREADY_EXISTS';end if;
 if jsonb_typeof(assets_value)<>'object' or octet_length(assets_value::text)>300000 then raise invalid_parameter_value using message='PROPERTY_ASSETS_INVALID';end if;
 if jsonb_typeof(visibility_value)<>'object' or octet_length(visibility_value::text)>10000 or exists(select 1 from jsonb_each(visibility_value) e where e.key !~ '^[a-z][a-z0-9_.-]{0,49}$' or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_INVALID';end if;
 if jsonb_typeof(tenant_info_value)<>'object' or octet_length(tenant_info_value::text)>30000 or tenant_info_value ?| array['password','secret','token','civil_id','civilId'] then raise invalid_parameter_value using message='PROPERTY_TENANT_INFO_INVALID';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_properties set name=nm where workspace_id=p_workspace_id and id=p_property_id;
 insert into private.aqari_property_master(workspace_id,property_id,address,description,location_url,property_automatic_ref,property_type,status,stated_income,owners,contact_email,contact_phone,contact_whatsapp,assets,tenant_visibility,tenant_public_info,revision,updated_by,updated_at)
 values(p_workspace_id,p_property_id,btrim(coalesce(p_data->>'address','')),description_value,location_value,automatic_value,btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','active')),income,owners,lower(btrim(coalesce(p_data->>'email',''))),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'whatsapp','')),assets_value,visibility_value,tenant_info_value,rev+1,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set address=excluded.address,description=excluded.description,location_url=excluded.location_url,property_automatic_ref=excluded.property_automatic_ref,property_type=excluded.property_type,status=excluded.status,stated_income=excluded.stated_income,owners=excluded.owners,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,contact_whatsapp=excluded.contact_whatsapp,assets=excluded.assets,tenant_visibility=excluded.tenant_visibility,tenant_public_info=excluded.tenant_public_info,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 new_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,'property','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'property',new_snapshot);
end $$;
revoke all on function public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text) to authenticated;

create or replace function public.aqari_unit_master_save(p_workspace_id uuid,p_property_id uuid,p_unit_id uuid,p_expected_revision bigint,p_data jsonb,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row private.aqari_unit_master%rowtype;old_snapshot jsonb;new_snapshot jsonb;actor text;n text;rent numeric;area numeric;rev bigint;actual_property uuid;
 internal_value text;parking_value text;storage_value text;services_value jsonb;auto_value text;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('unitNo','floor','type','status','areaSqm','statedRent','automaticRef','leasedAssetAutomaticRef','internalSerial','parking','storage','services')) then raise invalid_parameter_value using message='UNIT_MASTER_INVALID';end if;
 n:=btrim(coalesce(p_data->>'unitNo',''));if length(n) not between 1 and 120 then raise invalid_parameter_value using message='UNIT_NUMBER_REQUIRED';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='CHANGE_REASON_REQUIRED';end if;
 begin rent:=nullif(p_data->>'statedRent','')::numeric;exception when others then raise invalid_parameter_value using message='UNIT_RENT_INVALID';end;
 begin area:=nullif(p_data->>'areaSqm','')::numeric;exception when others then raise invalid_parameter_value using message='UNIT_AREA_INVALID';end;
 if rent is not null and (rent<0 or round(rent,3)<>rent) then raise invalid_parameter_value using message='UNIT_RENT_INVALID';end if;
 if area is not null and (area<=0 or area>100000000 or round(area,3)<>area) then raise invalid_parameter_value using message='UNIT_AREA_INVALID';end if;
 if length(coalesce(p_data->>'floor',''))>100 or length(coalesce(p_data->>'type',''))>120 or length(coalesce(p_data->>'status','')) not between 1 and 80 then raise invalid_parameter_value using message='UNIT_MASTER_FIELD_INVALID';end if;
 select property_id into actual_property from public.aqari_units where workspace_id=p_workspace_id and id=p_unit_id for update;
 if actual_property is null or actual_property<>p_property_id then raise exception 'UNIT_PROPERTY_BINDING_MISMATCH' using errcode='23514';end if;
 if exists(select 1 from public.aqari_units where workspace_id=p_workspace_id and property_id=p_property_id and id<>p_unit_id and lower(btrim(unit_no))=lower(n)) then raise unique_violation using message='UNIT_NUMBER_ALREADY_EXISTS';end if;
 old_snapshot:=private.aqari_unit_master_snapshot(p_workspace_id,p_unit_id);
 select * into old_row from private.aqari_unit_master where workspace_id=p_workspace_id and unit_id=p_unit_id for update;
 rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception 'UNIT_MASTER_REVISION_CONFLICT' using errcode='40001';end if;
 auto_value:=case when p_data?'leasedAssetAutomaticRef' then btrim(coalesce(p_data->>'leasedAssetAutomaticRef','')) when p_data?'automaticRef' then btrim(coalesce(p_data->>'automaticRef','')) else coalesce(old_row.automatic_ref,'') end;
 internal_value:=case when p_data?'internalSerial' then btrim(coalesce(p_data->>'internalSerial','')) else coalesce(old_row.internal_serial,'') end;
 parking_value:=case when p_data?'parking' then btrim(coalesce(p_data->>'parking','')) else coalesce(old_row.parking,'') end;
 storage_value:=case when p_data?'storage' then btrim(coalesce(p_data->>'storage','')) else coalesce(old_row.storage_details,'') end;
 services_value:=case when p_data?'services' then coalesce(p_data->'services','{}'::jsonb) else coalesce(old_row.services,'{}'::jsonb) end;
 if length(auto_value)>200 or length(internal_value)>120 or length(parking_value)>300 or length(storage_value)>500 then raise invalid_parameter_value using message='UNIT_EXTENDED_FIELD_INVALID';end if;
 if jsonb_typeof(services_value)<>'object' or octet_length(services_value::text)>20000 or exists(select 1 from jsonb_each(services_value)e where e.key !~ '^[a-z][a-z0-9_.-]{0,49}$' or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value using message='UNIT_SERVICES_INVALID';end if;
 if auto_value<>'' and exists(select 1 from private.aqari_unit_master q where q.workspace_id=p_workspace_id and q.unit_id<>p_unit_id and lower(btrim(q.automatic_ref))=lower(auto_value)) then raise unique_violation using message='LEASED_ASSET_AUTOMATIC_REF_ALREADY_EXISTS';end if;
 if internal_value<>'' and exists(select 1 from private.aqari_unit_master q where q.workspace_id=p_workspace_id and q.property_id=p_property_id and q.unit_id<>p_unit_id and lower(btrim(q.internal_serial))=lower(internal_value)) then raise unique_violation using message='UNIT_INTERNAL_SERIAL_ALREADY_EXISTS';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_units set unit_no=n where workspace_id=p_workspace_id and id=p_unit_id;
 insert into private.aqari_unit_master(workspace_id,unit_id,property_id,floor,unit_type,status,area_sqm,stated_rent,automatic_ref,internal_serial,parking,storage_details,services,revision,updated_by,updated_at)
 values(p_workspace_id,p_unit_id,p_property_id,btrim(coalesce(p_data->>'floor','')),btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','available')),area,rent,auto_value,internal_value,parking_value,storage_value,services_value,rev+1,auth.uid(),now())
 on conflict(workspace_id,unit_id) do update set property_id=excluded.property_id,floor=excluded.floor,unit_type=excluded.unit_type,status=excluded.status,area_sqm=excluded.area_sqm,stated_rent=excluded.stated_rent,automatic_ref=excluded.automatic_ref,internal_serial=excluded.internal_serial,parking=excluded.parking,storage_details=excluded.storage_details,services=excluded.services,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 new_snapshot:=private.aqari_unit_master_snapshot(p_workspace_id,p_unit_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,unit_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,p_unit_id,'unit','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'unit',new_snapshot);
end $$;
revoke all on function public.aqari_unit_master_save(uuid,uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.aqari_unit_master_save(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;

create or replace function public.aqari_property_channel_settings(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);prop uuid;ident uuid;expected bigint;why text;actor text;manager boolean;before_row jsonb;after_row jsonb;kind_value text;url_value text;label_value text;reference_value text;status_value text;visible_value boolean;sort_value integer;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 prop:=nullif(d->>'propertyId','')::uuid;
 if prop is null or not private.aqari_can_property(w,prop,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can_property(w,prop,'properties','write');
 if p_action='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'propertyId',prop,'manager',manager,
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'url',c.public_url,'label',c.display_label,'managementReference',case when manager then c.management_reference else '' end,'tenantVisible',c.tenant_visible,'status',c.status,'sortOrder',c.sort_order,'revision',c.revision) order by c.sort_order,c.kind,c.created_at) from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and (manager or (c.tenant_visible and c.status='active'))),'[]'::jsonb));
 end if;
 if p_action<>'save' or not manager then raise insufficient_privilege using message='PROPERTY_CHANNEL_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());expected:=coalesce((d->>'revision')::bigint,0);why:=btrim(coalesce(d->>'reason',''));
 kind_value:=lower(btrim(coalesce(d->>'kind','')));url_value:=btrim(coalesce(d->>'url',''));label_value:=btrim(coalesce(d->>'label',''));reference_value:=btrim(coalesce(d->>'managementReference',''));status_value:=coalesce(nullif(d->>'status',''),'active');visible_value:=coalesce((d->>'tenantVisible')::boolean,false);sort_value:=coalesce((d->>'sortOrder')::integer,100);
 if length(why) not between 3 and 1000 or kind_value not in('website','instagram','tiktok','snapchat','x','facebook','youtube','whatsapp','email','phone','other') or length(label_value)>200 or length(reference_value)>1000 or status_value not in('active','hidden','archived') or sort_value not between 0 and 10000 then raise invalid_parameter_value using message='PROPERTY_CHANNEL_INVALID';end if;
 if kind_value='email' and url_value !~ '^mailto:[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';
 elsif kind_value='phone' and url_value !~ '^tel:[+]?[0-9]{8,15}$' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';
 elsif kind_value not in('email','phone') and url_value !~ '^https://' then raise invalid_parameter_value using message='PROPERTY_CHANNEL_URL_INVALID';end if;
 if status_value<>'active' then visible_value:=false;end if;
 select to_jsonb(c) into before_row from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and c.id=ident for update;
 if before_row is null then
  if expected<>0 then raise serialization_failure using message='PROPERTY_CHANNEL_REVISION_CONFLICT';end if;
  insert into private.aqari_property_channels(id,workspace_id,property_id,kind,public_url,management_reference,tenant_visible,status,display_label,sort_order,revision,created_by,updated_by,updated_at)
  values(ident,w,prop,kind_value,url_value,reference_value,visible_value,status_value,label_value,sort_value,1,auth.uid(),auth.uid(),now());
 else
  if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='PROPERTY_CHANNEL_REVISION_CONFLICT';end if;
  update private.aqari_property_channels set kind=kind_value,public_url=url_value,management_reference=reference_value,tenant_visible=visible_value,status=status_value,display_label=label_value,sort_order=sort_value,revision=expected+1,updated_by=auth.uid(),updated_at=now()
   where workspace_id=w and property_id=prop and id=ident;
 end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 select to_jsonb(c) into after_row from private.aqari_property_channels c where c.workspace_id=w and c.property_id=prop and c.id=ident;
 insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value)
 values(w,prop,'property_channel',ident::text,'save',auth.uid(),actor,why,before_row,after_row);
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
end $$;
revoke all on function public.aqari_property_channel_settings(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_channel_settings(uuid,text,jsonb) to authenticated;

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

create or replace function public.aqari_property_dashboard_header(p_workspace_id uuid,p_property_id uuid,p_as_of date default (now() at time zone 'Asia/Kuwait')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare total_units int;occupied_units int;vacant_units int;month_collection numeric:=null;arrears numeric:=null;financial jsonb:=null;complete jsonb;
begin
 if p_as_of is null or not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select count(*)::int into total_units from public.aqari_units u where u.workspace_id=p_workspace_id and u.property_id=p_property_id;
 select count(distinct u.id)::int into occupied_units from public.aqari_units u join public.aqari_leases l on l.workspace_id=u.workspace_id and l.unit_id=u.id
  where u.workspace_id=p_workspace_id and u.property_id=p_property_id and l.status in('approved','signing','signed','active') and coalesce(l.start_date,p_as_of)<=p_as_of and coalesce(l.end_date,p_as_of)>=p_as_of;
 vacant_units:=greatest(total_units-coalesce(occupied_units,0),0);
 if private.aqari_can(p_workspace_id,'collections','read') then
  select coalesce(sum(r.amount),0) into month_collection from public.aqari_rent_payments r join public.aqari_leases l on l.workspace_id=r.workspace_id and l.id=r.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   where r.workspace_id=p_workspace_id and u.property_id=p_property_id and r.status not in('cancelled','ملغى') and date_trunc('month',r.paid_at)=date_trunc('month',p_as_of) and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=r.workspace_id and c.payment_id=r.id);
  if private.aqari_can(p_workspace_id,'contracts','read') then
   select coalesce(sum(greatest(d.balance,0)),0) into arrears from private.aqari_rent_due_periods d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where d.workspace_id=p_workspace_id and u.property_id=p_property_id and d.period<=date_trunc('month',p_as_of)::date and d.balance>0;
  end if;
 end if;
 if private.aqari_can(p_workspace_id,'collections','read') and private.aqari_can(p_workspace_id,'finance','read') then financial:=public.aqari_property_financial_summary(p_workspace_id,p_property_id,p_as_of);end if;
 complete:=public.aqari_property_completeness(p_workspace_id,p_property_id);
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'asOf',p_as_of,'units',jsonb_build_object('total',total_units,'occupied',coalesce(occupied_units,0),'vacant',vacant_units),'monthCollection',month_collection,'arrears',arrears,'financial',financial,'completeness',complete);
end $$;
revoke all on function public.aqari_property_dashboard_header(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_dashboard_header(uuid,uuid,date) to authenticated;

create or replace function public.aqari_property_tenant_profile(p_workspace_id uuid,p_property_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean:=false;p jsonb;v jsonb;info jsonb;channels jsonb;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 allowed:=private.aqari_can_property(p_workspace_id,p_property_id,'properties','read');
 if not allowed then
  allowed:=exists(select 1 from public.aqari_portal_accounts a join public.aqari_leases l on l.workspace_id=a.workspace_id and l.tenant_id=a.tenant_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where a.user_id=auth.uid() and a.workspace_id=p_workspace_id and a.is_active and l.status not in('cancelled','expired') and u.property_id=p_property_id);
 end if;
 if not allowed then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);if p is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;v:=coalesce(p->'tenantVisibility','{}'::jsonb);info:=coalesce(p->'tenantInfo','{}'::jsonb);
 select coalesce(jsonb_agg(jsonb_build_object('kind',c.kind,'label',c.display_label,'url',c.public_url) order by c.sort_order,c.kind),'[]'::jsonb) into channels from private.aqari_property_channels c where c.workspace_id=p_workspace_id and c.property_id=p_property_id and c.status='active' and c.tenant_visible;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,
  'name',case when coalesce((v->>'name')::boolean,true) then p->>'name' else null end,
  'logo',case when coalesce((v->>'logo')::boolean,false) then p#>>'{assets,logo}' else null end,
  'phone',case when coalesce((v->>'phone')::boolean,false) then p->>'phone' else null end,
  'whatsapp',case when coalesce((v->>'whatsapp')::boolean,false) then p->>'whatsapp' else null end,
  'email',case when coalesce((v->>'email')::boolean,false) then p->>'email' else null end,
  'locationUrl',case when coalesce((v->>'location')::boolean,false) then p->>'locationUrl' else null end,
  'instructions',case when coalesce((v->>'instructions')::boolean,false) then info->>'instructions' else null end,
  'officeHours',case when coalesce((v->>'officeHours')::boolean,false) then info->>'officeHours' else null end,
  'emergency',case when coalesce((v->>'emergency')::boolean,false) then info->>'emergency' else null end,
  'services',case when coalesce((v->>'services')::boolean,false) then info->'services' else null end,
  'channels',channels);
end $$;
revoke all on function public.aqari_property_tenant_profile(uuid,uuid) from public,anon;
grant execute on function public.aqari_property_tenant_profile(uuid,uuid) to authenticated;

commit;
