-- AQARI V267 isolated trial only: manager-defined property controls, technician assignment and template scope.
-- Additive and fail-closed. No physical delete path is exposed; every manager mutation is audited.
begin;

create table if not exists private.aqari_property_custom_fields(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 field_key text not null check(field_key ~ '^[a-z][a-z0-9_.-]{0,49}$'),
 label_ar text not null check(length(btrim(label_ar)) between 1 and 200),
 label_en text not null default '' check(length(label_en)<=200),
 field_type text not null check(field_type in('boolean','percentage','money','text','document')),
 visibility text not null check(visibility in('internal','owner','both')),
 property_ids uuid[] not null check(cardinality(property_ids)>0),
 is_active boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,field_key)
);
create index if not exists aqari_property_custom_fields_scope on private.aqari_property_custom_fields(workspace_id,is_active);

create table if not exists private.aqari_property_custom_values(
 workspace_id uuid not null,
 property_id uuid not null,
 field_id uuid not null references private.aqari_property_custom_fields(id),
 value jsonb not null,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id,field_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);

create table if not exists private.aqari_property_feature_settings(
 workspace_id uuid not null,
 property_id uuid not null,
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object'),
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);

create table if not exists private.aqari_property_technicians(
 workspace_id uuid not null,
 property_id uuid not null,
 employee_id uuid not null references private.aqari_hr_employees(id),
 public_to_tenant boolean not null default false,
 phone text not null default '',
 whatsapp text not null default '',
 is_active boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id,employee_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create index if not exists aqari_property_technicians_public on private.aqari_property_technicians(workspace_id,property_id,is_active,public_to_tenant);

create table if not exists private.aqari_property_template_scopes(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.aqari_workspaces(id),
 template_id uuid not null references private.aqari_rental_template_versions(id),
 kind text not null check(kind in('apartment','house','shop','commercial_investment')),
 scope_kind text not null check(scope_kind in('property','property_type')),
 property_id uuid,
 property_type text,
 is_active boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 check((scope_kind='property' and property_id is not null and property_type is null) or (scope_kind='property_type' and property_id is null and length(btrim(property_type)) between 1 and 200)),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
create unique index if not exists aqari_property_template_scope_property_uq on private.aqari_property_template_scopes(workspace_id,template_id,property_id) where scope_kind='property';
create unique index if not exists aqari_property_template_scope_type_uq on private.aqari_property_template_scopes(workspace_id,template_id,lower(property_type)) where scope_kind='property_type';
create index if not exists aqari_property_template_scope_lookup on private.aqari_property_template_scopes(workspace_id,kind,is_active);

create table if not exists private.aqari_property_control_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid,
 entity text not null,
 entity_id text not null,
 action text not null,
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 reason text not null,
 before_value jsonb,
 after_value jsonb,
 recorded_at timestamptz not null default now()
);
create index if not exists aqari_property_control_audit_scope on private.aqari_property_control_audit(workspace_id,property_id,recorded_at desc,id desc);

alter table private.aqari_property_custom_fields enable row level security;
alter table private.aqari_property_custom_values enable row level security;
alter table private.aqari_property_feature_settings enable row level security;
alter table private.aqari_property_technicians enable row level security;
alter table private.aqari_property_template_scopes enable row level security;
alter table private.aqari_property_control_audit enable row level security;
revoke all on private.aqari_property_custom_fields,private.aqari_property_custom_values,private.aqari_property_feature_settings,private.aqari_property_technicians,private.aqari_property_template_scopes,private.aqari_property_control_audit from public,anon,authenticated,service_role;

create or replace function private.aqari_property_control_reject_delete()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='PROPERTY_CONTROL_DELETE_FORBIDDEN';
end $$;
revoke all on function private.aqari_property_control_reject_delete() from public,anon,authenticated,service_role;

create or replace function private.aqari_property_control_audit_immutable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 raise check_violation using message='PROPERTY_CONTROL_AUDIT_IMMUTABLE';
end $$;
revoke all on function private.aqari_property_control_audit_immutable() from public,anon,authenticated,service_role;

drop trigger if exists aqari_property_custom_fields_no_delete on private.aqari_property_custom_fields;
create trigger aqari_property_custom_fields_no_delete before delete on private.aqari_property_custom_fields for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_property_custom_values_no_delete on private.aqari_property_custom_values;
create trigger aqari_property_custom_values_no_delete before delete on private.aqari_property_custom_values for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_property_feature_settings_no_delete on private.aqari_property_feature_settings;
create trigger aqari_property_feature_settings_no_delete before delete on private.aqari_property_feature_settings for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_property_technicians_no_delete on private.aqari_property_technicians;
create trigger aqari_property_technicians_no_delete before delete on private.aqari_property_technicians for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_property_template_scopes_no_delete on private.aqari_property_template_scopes;
create trigger aqari_property_template_scopes_no_delete before delete on private.aqari_property_template_scopes for each row execute function private.aqari_property_control_reject_delete();
drop trigger if exists aqari_property_control_audit_immutable on private.aqari_property_control_audit;
create trigger aqari_property_control_audit_immutable before update or delete on private.aqari_property_control_audit for each row execute function private.aqari_property_control_audit_immutable();

create or replace function public.aqari_property_controls(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
 w uuid:=p_workspace_id; d jsonb:=coalesce(p_data,'{}'::jsonb); manager boolean; actor text; ident uuid; prop uuid; employee uuid; template uuid;
 expected bigint; next_rev bigint; why text; before_row jsonb; after_row jsonb; row_record record; props uuid[]; ftype text; val jsonb; settings jsonb;
 scope_kind text; property_type_value text; field_key_value text; label_ar_value text; label_en_value text; visibility_value text; active_value boolean;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'properties','write');
 if p_action='context' then
  if not manager then raise insufficient_privilege using message='PROPERTY_CONTROLS_MANAGER_ONLY';end if;
  return jsonb_build_object(
   'workspace_id',w,'user_id',auth.uid(),'manager',true,
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'type',coalesce(m.type,'')) order by p.name,p.id) from public.aqari_properties p left join private.aqari_property_master m on m.workspace_id=p.workspace_id and m.property_id=p.id where p.workspace_id=w),'[]'::jsonb),
   'fields',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'key',f.field_key,'labelAr',f.label_ar,'labelEn',f.label_en,'type',f.field_type,'visibility',f.visibility,'propertyIds',to_jsonb(f.property_ids),'active',f.is_active,'revision',f.revision) order by f.label_ar,f.id) from private.aqari_property_custom_fields f where f.workspace_id=w),'[]'::jsonb),
   'values',coalesce((select jsonb_agg(jsonb_build_object('propertyId',v.property_id,'fieldId',v.field_id,'value',v.value,'revision',v.revision) order by v.property_id,v.field_id) from private.aqari_property_custom_values v where v.workspace_id=w),'[]'::jsonb),
   'features',coalesce((select jsonb_agg(jsonb_build_object('propertyId',s.property_id,'settings',s.settings,'revision',s.revision) order by s.property_id) from private.aqari_property_feature_settings s where s.workspace_id=w),'[]'::jsonb),
   'technicians',coalesce((select jsonb_agg(jsonb_build_object('propertyId',t.property_id,'employeeId',t.employee_id,'publicToTenant',t.public_to_tenant,'phone',t.phone,'whatsapp',t.whatsapp,'active',t.is_active,'revision',t.revision,'profile',e.profile) order by t.property_id,t.employee_id) from private.aqari_property_technicians t join private.aqari_hr_employees e on e.id=t.employee_id and e.workspace_id=t.workspace_id where t.workspace_id=w),'[]'::jsonb),
   'employees',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'profile',e.profile,'propertyIds',to_jsonb(e.property_ids),'status',e.status) order by coalesce(e.profile->>'name_ar',e.profile->>'name_en',e.id::text)) from private.aqari_hr_employees e where e.workspace_id=w and e.status<>'inactive'),'[]'::jsonb),
   'templateScopes',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'templateId',s.template_id,'kind',s.kind,'scopeKind',s.scope_kind,'propertyId',s.property_id,'propertyType',s.property_type,'active',s.is_active,'revision',s.revision) order by s.kind,s.id) from private.aqari_property_template_scopes s where s.workspace_id=w),'[]'::jsonb),
   'templates',coalesce((select jsonb_agg(private.aqari_rental_template_snapshot(v) order by v.kind,v.version desc) from private.aqari_rental_template_versions v where v.workspace_id=w),'[]'::jsonb),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'entityRef',x.entity_ref,'title',x.title,'documentNo',x.document_no,'status',x.status,'category',coalesce(x.metadata->>'category',x.metadata->>'document_category','')) order by x.created_at desc,x.id desc) from public.aqari_documents x where x.workspace_id=w and x.entity_type='property' and x.status='uploaded'),'[]'::jsonb)
  );
 end if;
 if not manager then raise insufficient_privilege using message='PROPERTY_CONTROLS_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 why:=btrim(coalesce(d->>'reason',''));
 if length(why) not between 3 and 1000 then raise invalid_parameter_value using message='CONTROL_REASON_REQUIRED';end if;

 if p_action='save_field' then
  ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());expected:=coalesce((d->>'revision')::bigint,0);
  field_key_value:=lower(btrim(coalesce(d->>'key','')));label_ar_value:=btrim(coalesce(d->>'labelAr',''));label_en_value:=btrim(coalesce(d->>'labelEn',''));ftype:=d->>'type';visibility_value:=d->>'visibility';active_value:=coalesce((d->>'active')::boolean,true);
  if field_key_value !~ '^[a-z][a-z0-9_.-]{0,49}$' or length(label_ar_value) not between 1 and 200 or length(label_en_value)>200 or ftype not in('boolean','percentage','money','text','document') or visibility_value not in('internal','owner','both') or jsonb_typeof(d->'propertyIds') is distinct from 'array' or jsonb_array_length(d->'propertyIds') not between 1 and 100 then raise invalid_parameter_value using message='INVALID_OWNER_FIELD';end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into props from jsonb_array_elements_text(d->'propertyIds') q(x);
  if cardinality(props)<>jsonb_array_length(d->'propertyIds') or exists(select 1 from unnest(props) p where not exists(select 1 from public.aqari_properties x where x.workspace_id=w and x.id=p)) then raise insufficient_privilege using message='INVALID_OWNER_FIELD_SCOPE';end if;
  select to_jsonb(f) into before_row from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident for update;
  if before_row is null then if expected<>0 then raise serialization_failure using message='OWNER_FIELD_REVISION_CONFLICT';end if;next_rev:=1;
   insert into private.aqari_property_custom_fields(id,workspace_id,field_key,label_ar,label_en,field_type,visibility,property_ids,is_active,revision,created_by,updated_by) values(ident,w,field_key_value,label_ar_value,label_en_value,ftype,visibility_value,props,active_value,next_rev,auth.uid(),auth.uid());
  else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='OWNER_FIELD_REVISION_CONFLICT';end if;next_rev:=expected+1;
   update private.aqari_property_custom_fields set field_key=field_key_value,label_ar=label_ar_value,label_en=label_en_value,field_type=ftype,visibility=visibility_value,property_ids=props,is_active=active_value,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and id=ident;
  end if;
  select to_jsonb(f) into after_row from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident;
  insert into private.aqari_property_control_audit(workspace_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,'owner_field_definition',ident::text,'save',auth.uid(),actor,why,before_row,after_row);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;

 if p_action='save_value' then
  prop:=(d->>'propertyId')::uuid;ident:=(d->>'fieldId')::uuid;expected:=coalesce((d->>'revision')::bigint,0);val:=d->'value';
  select f.field_type into ftype from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident and f.is_active and prop=any(f.property_ids);
  if ftype is null or not exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.id=prop) then raise insufficient_privilege using message='OWNER_FIELD_NOT_AVAILABLE';end if;
  if ftype='boolean' and jsonb_typeof(val)<>'boolean' then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_VALUE';
  elsif ftype='percentage' and (jsonb_typeof(val) not in('number','string') or (val#>>'{}') !~ '^\d{1,3}(\.\d{1,3})?$' or (val#>>'{}')::numeric<0 or (val#>>'{}')::numeric>100) then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_VALUE';
  elsif ftype='money' and (jsonb_typeof(val) not in('number','string') or (val#>>'{}') !~ '^\d{1,12}(\.\d{1,3})?$' or (val#>>'{}')::numeric<0) then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_VALUE';
  elsif ftype='text' and (jsonb_typeof(val)<>'string' or length(val#>>'{}')>5000) then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_VALUE';
  elsif ftype='document' then
   if jsonb_typeof(val)<>'string' or (val#>>'{}') !~ '^[0-9a-f-]{36}$' or not exists(select 1 from public.aqari_documents doc join public.aqari_properties p on p.workspace_id=doc.workspace_id and p.external_ref=doc.entity_ref where doc.workspace_id=w and doc.id=(val#>>'{}')::uuid and doc.entity_type='property' and doc.status='uploaded' and p.id=prop) then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_DOCUMENT';end if;
  end if;
  select to_jsonb(v) into before_row from private.aqari_property_custom_values v where v.workspace_id=w and v.property_id=prop and v.field_id=ident for update;
  if before_row is null then if expected<>0 then raise serialization_failure using message='OWNER_VALUE_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_custom_values(workspace_id,property_id,field_id,value,revision,updated_by) values(w,prop,ident,val,next_rev,auth.uid());
  else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='OWNER_VALUE_REVISION_CONFLICT';end if;next_rev:=expected+1;update private.aqari_property_custom_values set value=val,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and property_id=prop and field_id=ident;end if;
  select to_jsonb(v) into after_row from private.aqari_property_custom_values v where v.workspace_id=w and v.property_id=prop and v.field_id=ident;
  insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,prop,'owner_field_value',ident::text,'save',auth.uid(),actor,why,before_row,after_row);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;

 if p_action='save_features' then
  prop:=(d->>'propertyId')::uuid;expected:=coalesce((d->>'revision')::bigint,0);settings:=coalesce(d->'settings','{}'::jsonb);
  if not exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.id=prop) or jsonb_typeof(settings)<>'object' or (select count(*) from jsonb_object_keys(settings))>50 or exists(select 1 from jsonb_each(settings) e where e.key !~ '^[a-z][a-z0-9_.-]{0,49}$' or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value using message='INVALID_PROPERTY_FEATURE_SETTINGS';end if;
  select to_jsonb(s) into before_row from private.aqari_property_feature_settings s where s.workspace_id=w and s.property_id=prop for update;
  if before_row is null then if expected<>0 then raise serialization_failure using message='PROPERTY_FEATURE_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_feature_settings(workspace_id,property_id,settings,revision,updated_by) values(w,prop,settings,next_rev,auth.uid());
  else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='PROPERTY_FEATURE_REVISION_CONFLICT';end if;next_rev:=expected+1;update private.aqari_property_feature_settings set settings=settings,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and property_id=prop;end if;
  select to_jsonb(s) into after_row from private.aqari_property_feature_settings s where s.workspace_id=w and s.property_id=prop;
  insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,prop,'property_features',prop::text,'save',auth.uid(),actor,why,before_row,after_row);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;

 if p_action='copy_features' then
  prop:=(d->>'sourcePropertyId')::uuid;
  select s.settings into settings from private.aqari_property_feature_settings s where s.workspace_id=w and s.property_id=prop;
  settings:=coalesce(settings,'{}'::jsonb);
  if jsonb_typeof(d->'targetPropertyIds') is distinct from 'array' or jsonb_array_length(d->'targetPropertyIds') not between 1 and 100 then raise invalid_parameter_value using message='COPY_TARGET_REQUIRED';end if;
  for row_record in select (x#>>'{}')::uuid target_id from jsonb_array_elements(d->'targetPropertyIds') x loop
   if row_record.target_id=prop or not exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.id=row_record.target_id) then raise invalid_parameter_value using message='INVALID_COPY_TARGET';end if;
   select to_jsonb(s) into before_row from private.aqari_property_feature_settings s where s.workspace_id=w and s.property_id=row_record.target_id for update;
   if before_row is null then next_rev:=1;insert into private.aqari_property_feature_settings(workspace_id,property_id,settings,revision,updated_by) values(w,row_record.target_id,settings,next_rev,auth.uid());
   else next_rev:=(before_row->>'revision')::bigint+1;update private.aqari_property_feature_settings s set settings=settings,revision=next_rev,updated_by=auth.uid(),updated_at=now() where s.workspace_id=w and s.property_id=row_record.target_id;end if;
   select to_jsonb(s) into after_row from private.aqari_property_feature_settings s where s.workspace_id=w and s.property_id=row_record.target_id;
   insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,row_record.target_id,'property_features',row_record.target_id::text,'copy',auth.uid(),actor,why,before_row,after_row);
  end loop;
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'copied',jsonb_array_length(d->'targetPropertyIds'));
 end if;

 if p_action='save_technician' then
  prop:=(d->>'propertyId')::uuid;employee:=(d->>'employeeId')::uuid;expected:=coalesce((d->>'revision')::bigint,0);active_value:=coalesce((d->>'active')::boolean,true);
  if not exists(select 1 from private.aqari_hr_employees e where e.workspace_id=w and e.id=employee and e.status<>'inactive' and prop=any(e.property_ids)) then raise invalid_parameter_value using message='TECHNICIAN_NOT_ASSIGNED_TO_PROPERTY';end if;
  field_key_value:=regexp_replace(coalesce(d->>'phone',''),'[ ()-]','','g');label_ar_value:=regexp_replace(coalesce(d->>'whatsapp',''),'[ ()-]','','g');
  if field_key_value<>'' and field_key_value !~ '^\+?[0-9]{8,15}$' or label_ar_value<>'' and label_ar_value !~ '^\+?[0-9]{8,15}$' then raise invalid_parameter_value using message='INVALID_TECHNICIAN_CONTACT';end if;
  if coalesce((d->>'publicToTenant')::boolean,false) and field_key_value='' and label_ar_value='' then select regexp_replace(coalesce(e.profile->>'phone',''),'[ ()-]','','g') into field_key_value from private.aqari_hr_employees e where e.id=employee;label_ar_value:=field_key_value;end if;
  if coalesce((d->>'publicToTenant')::boolean,false) and field_key_value='' and label_ar_value='' then raise invalid_parameter_value using message='PUBLIC_TECHNICIAN_CONTACT_REQUIRED';end if;
  select to_jsonb(t) into before_row from private.aqari_property_technicians t where t.workspace_id=w and t.property_id=prop and t.employee_id=employee for update;
  if before_row is null then if expected<>0 then raise serialization_failure using message='TECHNICIAN_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_technicians(workspace_id,property_id,employee_id,public_to_tenant,phone,whatsapp,is_active,revision,updated_by) values(w,prop,employee,coalesce((d->>'publicToTenant')::boolean,false),field_key_value,label_ar_value,active_value,next_rev,auth.uid());
  else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='TECHNICIAN_REVISION_CONFLICT';end if;next_rev:=expected+1;update private.aqari_property_technicians set public_to_tenant=coalesce((d->>'publicToTenant')::boolean,false),phone=field_key_value,whatsapp=label_ar_value,is_active=active_value,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and property_id=prop and employee_id=employee;end if;
  select to_jsonb(t) into after_row from private.aqari_property_technicians t where t.workspace_id=w and t.property_id=prop and t.employee_id=employee;
  insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,prop,'property_technician',employee::text,'save',auth.uid(),actor,why,before_row,after_row);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;

 if p_action='save_template_scope' then
  ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());template:=(d->>'templateId')::uuid;scope_kind:=d->>'scopeKind';prop:=nullif(d->>'propertyId','')::uuid;property_type_value:=nullif(btrim(coalesce(d->>'propertyType','')),'');expected:=coalesce((d->>'revision')::bigint,0);active_value:=coalesce((d->>'active')::boolean,true);
  select v.kind into ftype from private.aqari_rental_template_versions v where v.workspace_id=w and v.id=template;
  if ftype is null or scope_kind not in('property','property_type') or (scope_kind='property' and (prop is null or property_type_value is not null or not exists(select 1 from public.aqari_properties p where p.workspace_id=w and p.id=prop))) or (scope_kind='property_type' and (prop is not null or property_type_value is null or length(property_type_value)>200)) then raise invalid_parameter_value using message='INVALID_TEMPLATE_SCOPE';end if;
  select to_jsonb(s) into before_row from private.aqari_property_template_scopes s where s.workspace_id=w and s.id=ident for update;
  if before_row is null then if expected<>0 then raise serialization_failure using message='TEMPLATE_SCOPE_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_template_scopes(id,workspace_id,template_id,kind,scope_kind,property_id,property_type,is_active,revision,updated_by) values(ident,w,template,ftype,scope_kind,prop,property_type_value,active_value,next_rev,auth.uid());
  else
   if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='TEMPLATE_SCOPE_REVISION_CONFLICT';end if;
   if (before_row->>'template_id')::uuid<>template or before_row->>'scope_kind'<>scope_kind or coalesce(before_row->>'property_id','')<>coalesce(prop::text,'') or coalesce(before_row->>'property_type','')<>coalesce(property_type_value,'') then raise check_violation using message='TEMPLATE_SCOPE_IDENTITY_IMMUTABLE';end if;
   next_rev:=expected+1;update private.aqari_property_template_scopes set is_active=active_value,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and id=ident;
  end if;
  select to_jsonb(s) into after_row from private.aqari_property_template_scopes s where s.workspace_id=w and s.id=ident;
  insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,prop,'template_scope',ident::text,'save',auth.uid(),actor,why,before_row,after_row);
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;
 raise invalid_parameter_value using message='INVALID_PROPERTY_CONTROL_ACTION';
end $$;
revoke all on function public.aqari_property_controls(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_controls(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_property_public_technicians(p_workspace_id uuid,p_property_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean:=false;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 allowed:=private.aqari_can_property(p_workspace_id,p_property_id,'maintenance','read');
 if not allowed then
  allowed:=exists(select 1 from public.aqari_portal_accounts a join public.aqari_leases l on l.workspace_id=a.workspace_id and l.tenant_id=a.tenant_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where a.user_id=auth.uid() and a.workspace_id=p_workspace_id and a.is_active and l.status not in('cancelled','expired') and u.property_id=p_property_id);
 end if;
 if not allowed then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'items',coalesce((select jsonb_agg(jsonb_build_object('employeeId',t.employee_id,'nameAr',coalesce(e.profile->>'name_ar',''),'nameEn',coalesce(e.profile->>'name_en',''),'jobAr',coalesce(e.profile->>'job_ar',''),'phone',t.phone,'whatsapp',t.whatsapp) order by coalesce(e.profile->>'name_ar',e.profile->>'name_en',e.id::text)) from private.aqari_property_technicians t join private.aqari_hr_employees e on e.id=t.employee_id and e.workspace_id=t.workspace_id where t.workspace_id=p_workspace_id and t.property_id=p_property_id and t.is_active and t.public_to_tenant and e.status<>'inactive'),'[]'::jsonb));
end $$;
revoke all on function public.aqari_property_public_technicians(uuid,uuid) from public,anon;
grant execute on function public.aqari_property_public_technicians(uuid,uuid) to authenticated;

create or replace function private.aqari_property_template_scope_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare prop uuid;ptype text;tid uuid;contract_kind text;scoped boolean;
begin
 if tg_op='UPDATE' and new.unit_id=old.unit_id and coalesce(new.snapshot#>>'{contractTemplate,id}','')=coalesce(old.snapshot#>>'{contractTemplate,id}','') and coalesce(new.snapshot->>'contractKind','')=coalesce(old.snapshot->>'contractKind','') then return new;end if;
 select u.property_id into prop from public.aqari_units u where u.workspace_id=new.workspace_id and u.id=new.unit_id;
 if prop is null then return new;end if;
 select coalesce(m.type,'') into ptype from private.aqari_property_master m where m.workspace_id=new.workspace_id and m.property_id=prop;
 ptype:=coalesce(ptype,'');contract_kind:=coalesce(nullif(new.snapshot->>'contractKind',''),nullif(new.snapshot#>>'{contractTemplate,kind}',''));
 if contract_kind is null then return new;end if;
 select exists(select 1 from private.aqari_property_template_scopes s where s.workspace_id=new.workspace_id and s.kind=contract_kind and s.is_active and ((s.scope_kind='property' and s.property_id=prop) or (s.scope_kind='property_type' and lower(s.property_type)=lower(ptype)))) into scoped;
 if not scoped then return new;end if;
 tid:=nullif(new.snapshot#>>'{contractTemplate,id}','')::uuid;
 if tid is null or not exists(select 1 from private.aqari_property_template_scopes s where s.workspace_id=new.workspace_id and s.template_id=tid and s.kind=contract_kind and s.is_active and ((s.scope_kind='property' and s.property_id=prop) or (s.scope_kind='property_type' and lower(s.property_type)=lower(ptype)))) then raise check_violation using message='CONTRACT_TEMPLATE_NOT_ALLOWED_FOR_PROPERTY';end if;
 return new;
end $$;
revoke all on function private.aqari_property_template_scope_guard() from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_template_scope_guard on public.aqari_leases;
create trigger aqari_property_template_scope_guard before insert or update on public.aqari_leases for each row execute function private.aqari_property_template_scope_guard();

commit;
