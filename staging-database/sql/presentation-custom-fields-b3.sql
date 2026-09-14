-- AQARI V267 isolated trial — GM-only presentation preferences + custom field v2.
-- Presentation settings change display metadata only; technical keys, database columns, accounting and integrations are never renamed.
begin;

alter table private.aqari_property_custom_fields add column if not exists options jsonb not null default '[]'::jsonb;
alter table private.aqari_property_custom_fields drop constraint if exists aqari_property_custom_fields_field_type_check;
alter table private.aqari_property_custom_fields add constraint aqari_property_custom_fields_field_type_check
 check(field_type in('boolean','percentage','money','text','date','select','document'));
alter table private.aqari_property_custom_fields drop constraint if exists aqari_property_custom_fields_visibility_check;
alter table private.aqari_property_custom_fields add constraint aqari_property_custom_fields_visibility_check
 check(visibility in('internal','owner','both','tenant','owner_tenant'));
alter table private.aqari_property_custom_fields drop constraint if exists aqari_property_custom_fields_options_check;
alter table private.aqari_property_custom_fields add constraint aqari_property_custom_fields_options_check
 check(jsonb_typeof(options)='array' and octet_length(options::text)<=50000);

create table if not exists private.aqari_ui_presentations(
 workspace_id uuid not null references public.aqari_workspaces(id),
 surface text not null check(surface in('property_hub')),
 item_key text not null check(item_key ~ '^[a-z][a-z0-9_.-]{0,49}$'),
 label_ar text not null default '' check(length(label_ar)<=100),
 label_en text not null default '' check(length(label_en)<=100),
 icon text not null default '' check(length(icon)<=16 and icon !~ '[<>&]'),
 sort_order integer not null default 100 check(sort_order between 0 and 10000),
 is_visible boolean not null default true,
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,surface,item_key)
);
alter table private.aqari_ui_presentations enable row level security;
revoke all on private.aqari_ui_presentations from public,anon,authenticated,service_role;
drop trigger if exists aqari_ui_presentations_no_delete on private.aqari_ui_presentations;
create trigger aqari_ui_presentations_no_delete before delete on private.aqari_ui_presentations for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_property_hub_defaults()
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_array(
  jsonb_build_object('key','summary','labelAr','ملخص العقار','labelEn','Property summary','icon','⌂','sortOrder',10,'visible',true),
  jsonb_build_object('key','property','labelAr','بيانات العقار','labelEn','Property details','icon','▦','sortOrder',20,'visible',true),
  jsonb_build_object('key','owners','labelAr','الملاك','labelEn','Owners','icon','♙','sortOrder',30,'visible',true),
  jsonb_build_object('key','channels','labelAr','التواصل والسوشال ميديا','labelEn','Communication','icon','◉','sortOrder',40,'visible',true),
  jsonb_build_object('key','units','labelAr','الوحدات والأدوار','labelEn','Units & floors','icon','▤','sortOrder',50,'visible',true),
  jsonb_build_object('key','contracts','labelAr','العقود','labelEn','Contracts','icon','▣','sortOrder',60,'visible',true),
  jsonb_build_object('key','collections','labelAr','التحصيل والمتأخرات','labelEn','Collections & arrears','icon','◈','sortOrder',70,'visible',true),
  jsonb_build_object('key','expenses','labelAr','المصروفات','labelEn','Expenses','icon','◇','sortOrder',80,'visible',true),
  jsonb_build_object('key','documents','labelAr','المستندات والصور والمخططات','labelEn','Documents','icon','▧','sortOrder',90,'visible',true),
  jsonb_build_object('key','operations','labelAr','الصيانة والموظفون والتنبيهات','labelEn','Operations','icon','⚙','sortOrder',100,'visible',true),
  jsonb_build_object('key','audit','labelAr','سجل التعديلات','labelEn','Audit trail','icon','◷','sortOrder',110,'visible',true)
 )
$$;
revoke all on function private.aqari_property_hub_defaults() from public,anon,authenticated,service_role;

create or replace function public.aqari_ui_presentation_settings(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);surface_value text;key_value text;expected bigint;label_ar_value text;label_en_value text;icon_value text;order_value integer;visible_value boolean;why text;before_row jsonb;after_row jsonb;manager boolean;actor text;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' or not private.aqari_can(w,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 surface_value:=coalesce(nullif(d->>'surface',''),'property_hub');if surface_value<>'property_hub' then raise invalid_parameter_value using message='INVALID_PRESENTATION_SURFACE';end if;
 manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write');
 if p_action='context' then
  return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'manager',manager,'surface',surface_value,
   'items',(select jsonb_agg(jsonb_build_object('key',x->>'key','labelAr',coalesce(nullif(p.label_ar,''),x->>'labelAr'),'labelEn',coalesce(nullif(p.label_en,''),x->>'labelEn'),'icon',coalesce(nullif(p.icon,''),x->>'icon'),'sortOrder',coalesce(p.sort_order,(x->>'sortOrder')::int),'visible',coalesce(p.is_visible,(x->>'visible')::boolean),'revision',coalesce(p.revision,0)) order by coalesce(p.sort_order,(x->>'sortOrder')::int),x->>'key') from jsonb_array_elements(private.aqari_property_hub_defaults())x left join private.aqari_ui_presentations p on p.workspace_id=w and p.surface=surface_value and p.item_key=x->>'key'));
 end if;
 if p_action<>'save' or not manager then raise insufficient_privilege using message='PRESENTATION_MANAGER_ONLY';end if;perform private.aqari_require_sensitive_aal2(w);
 if exists(select 1 from jsonb_object_keys(d)k where k not in('surface','key','revision','labelAr','labelEn','icon','sortOrder','visible','reason')) then raise invalid_parameter_value using message='INVALID_PRESENTATION_FIELD';end if;
 key_value:=d->>'key';if not exists(select 1 from jsonb_array_elements(private.aqari_property_hub_defaults())x where x->>'key'=key_value) then raise invalid_parameter_value using message='INVALID_PRESENTATION_KEY';end if;
 expected:=coalesce((d->>'revision')::bigint,0);label_ar_value:=btrim(coalesce(d->>'labelAr',''));label_en_value:=btrim(coalesce(d->>'labelEn',''));icon_value:=btrim(coalesce(d->>'icon',''));order_value:=coalesce((d->>'sortOrder')::int,100);visible_value:=coalesce((d->>'visible')::boolean,true);why:=btrim(coalesce(d->>'reason',''));
 if length(label_ar_value)>100 or length(label_en_value)>100 or length(icon_value)>16 or icon_value~'[<>&]' or order_value not between 0 and 10000 or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='INVALID_PRESENTATION_VALUE';end if;
 select to_jsonb(p) into before_row from private.aqari_ui_presentations p where p.workspace_id=w and p.surface=surface_value and p.item_key=key_value for update;
 if before_row is null then if expected<>0 then raise serialization_failure using message='PRESENTATION_REVISION_CONFLICT';end if;insert into private.aqari_ui_presentations(workspace_id,surface,item_key,label_ar,label_en,icon,sort_order,is_visible,revision,updated_by) values(w,surface_value,key_value,label_ar_value,label_en_value,icon_value,order_value,visible_value,1,auth.uid());
 else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='PRESENTATION_REVISION_CONFLICT';end if;update private.aqari_ui_presentations set label_ar=label_ar_value,label_en=label_en_value,icon=icon_value,sort_order=order_value,is_visible=visible_value,revision=expected+1,updated_by=auth.uid(),updated_at=now() where workspace_id=w and surface=surface_value and item_key=key_value;end if;
 select to_jsonb(p) into after_row from private.aqari_ui_presentations p where p.workspace_id=w and p.surface=surface_value and p.item_key=key_value;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_property_control_audit(workspace_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,'ui_presentation',surface_value||':'||key_value,'save',auth.uid(),actor,why,before_row,after_row);
 return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
end $$;
revoke all on function public.aqari_ui_presentation_settings(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_ui_presentation_settings(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_property_custom_fields_v2(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);manager boolean;ident uuid;prop uuid;expected bigint;next_rev bigint;why text;field_type_value text;visibility_value text;options_value jsonb;value_value jsonb;before_row jsonb;after_row jsonb;props uuid[];actor text;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;manager:=private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can(w,'properties','write');
 if p_action='context' then if not manager then raise insufficient_privilege using message='PROPERTY_CONTROLS_MANAGER_ONLY';end if;return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'manager',true,
  'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id) from public.aqari_properties p where p.workspace_id=w),'[]'::jsonb),
  'fields',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'key',f.field_key,'labelAr',f.label_ar,'labelEn',f.label_en,'type',f.field_type,'visibility',f.visibility,'options',f.options,'propertyIds',to_jsonb(f.property_ids),'active',f.is_active,'revision',f.revision) order by f.label_ar,f.id) from private.aqari_property_custom_fields f where f.workspace_id=w),'[]'::jsonb),
  'values',coalesce((select jsonb_agg(jsonb_build_object('propertyId',v.property_id,'fieldId',v.field_id,'value',v.value,'revision',v.revision) order by v.property_id,v.field_id) from private.aqari_property_custom_values v where v.workspace_id=w),'[]'::jsonb));end if;
 if not manager then raise insufficient_privilege using message='PROPERTY_CONTROLS_MANAGER_ONLY';end if;perform private.aqari_require_sensitive_aal2(w);why:=btrim(coalesce(d->>'reason',''));if length(why) not between 3 and 1000 then raise invalid_parameter_value using message='CONTROL_REASON_REQUIRED';end if;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 if p_action='save_field' then
  ident:=coalesce(nullif(d->>'id','')::uuid,gen_random_uuid());expected:=coalesce((d->>'revision')::bigint,0);field_type_value:=d->>'type';visibility_value:=d->>'visibility';options_value:=coalesce(d->'options','[]'::jsonb);
  if coalesce(d->>'key','')!~'^[a-z][a-z0-9_.-]{0,49}$' or length(btrim(coalesce(d->>'labelAr',''))) not between 1 and 200 or length(coalesce(d->>'labelEn',''))>200 or field_type_value not in('boolean','percentage','money','text','date','select','document') or visibility_value not in('internal','owner','both','tenant','owner_tenant') or jsonb_typeof(d->'propertyIds')<>'array' or jsonb_array_length(d->'propertyIds')<1 or octet_length((d->'propertyIds')::text)>200000 then raise invalid_parameter_value using message='INVALID_OWNER_FIELD';end if;
  if field_type_value='select' then if jsonb_typeof(options_value)<>'array' or jsonb_array_length(options_value) not between 1 and 100 or exists(select 1 from jsonb_array_elements(options_value)x where jsonb_typeof(x)<>'string' or length(btrim(x#>>'{}')) not between 1 and 200) or (select count(*) from jsonb_array_elements_text(options_value))<>(select count(distinct x) from jsonb_array_elements_text(options_value)x) then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_OPTIONS';end if;else options_value:='[]'::jsonb;end if;
  select array_agg(distinct x::uuid order by x::uuid) into props from jsonb_array_elements_text(d->'propertyIds')q(x);if cardinality(props)<>jsonb_array_length(d->'propertyIds') or exists(select 1 from unnest(props)p where not exists(select 1 from public.aqari_properties q where q.workspace_id=w and q.id=p)) then raise invalid_parameter_value using message='INVALID_OWNER_FIELD_SCOPE';end if;
  select to_jsonb(f) into before_row from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident for update;if before_row is null then if expected<>0 then raise serialization_failure using message='OWNER_FIELD_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_custom_fields(id,workspace_id,field_key,label_ar,label_en,field_type,visibility,property_ids,is_active,options,revision,created_by,updated_by) values(ident,w,lower(d->>'key'),btrim(d->>'labelAr'),btrim(coalesce(d->>'labelEn','')),field_type_value,visibility_value,props,coalesce((d->>'active')::boolean,true),options_value,next_rev,auth.uid(),auth.uid());else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='OWNER_FIELD_REVISION_CONFLICT';end if;next_rev:=expected+1;update private.aqari_property_custom_fields set field_key=lower(d->>'key'),label_ar=btrim(d->>'labelAr'),label_en=btrim(coalesce(d->>'labelEn','')),field_type=field_type_value,visibility=visibility_value,property_ids=props,is_active=coalesce((d->>'active')::boolean,true),options=options_value,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and id=ident;end if;
  select to_jsonb(f) into after_row from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident;insert into private.aqari_property_control_audit(workspace_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,'custom_field_definition',ident::text,'save',auth.uid(),actor,why,before_row,after_row);return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;
 if p_action='save_value' then
  prop:=(d->>'propertyId')::uuid;ident:=(d->>'fieldId')::uuid;expected:=coalesce((d->>'revision')::bigint,0);value_value:=d->'value';select f.field_type,f.options into field_type_value,options_value from private.aqari_property_custom_fields f where f.workspace_id=w and f.id=ident and f.is_active and prop=any(f.property_ids);if field_type_value is null then raise insufficient_privilege using message='CUSTOM_FIELD_NOT_AVAILABLE';end if;
  if field_type_value='boolean' and jsonb_typeof(value_value)<>'boolean' then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='percentage' and (jsonb_typeof(value_value) not in('number','string') or (value_value#>>'{}')!~'^\d{1,3}(\.\d{1,3})?$' or (value_value#>>'{}')::numeric not between 0 and 100) then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='money' and (jsonb_typeof(value_value) not in('number','string') or (value_value#>>'{}')!~'^\d{1,12}(\.\d{1,3})?$') then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='text' and (jsonb_typeof(value_value)<>'string' or length(value_value#>>'{}')>5000) then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='date' and (jsonb_typeof(value_value)<>'string' or (value_value#>>'{}')!~'^20[0-9]{2}-[0-1][0-9]-[0-3][0-9]$' or to_char((value_value#>>'{}')::date,'YYYY-MM-DD')<>value_value#>>'{}') then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='select' and (jsonb_typeof(value_value)<>'string' or not exists(select 1 from jsonb_array_elements_text(options_value)x where x=value_value#>>'{}')) then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';
  elsif field_type_value='document' and (jsonb_typeof(value_value)<>'string' or (value_value#>>'{}')!~'^[0-9a-f-]{36}$') then raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_VALUE';end if;
  select to_jsonb(v) into before_row from private.aqari_property_custom_values v where v.workspace_id=w and v.property_id=prop and v.field_id=ident for update;if before_row is null then if expected<>0 then raise serialization_failure using message='CUSTOM_VALUE_REVISION_CONFLICT';end if;next_rev:=1;insert into private.aqari_property_custom_values(workspace_id,property_id,field_id,value,revision,updated_by) values(w,prop,ident,value_value,next_rev,auth.uid());else if (before_row->>'revision')::bigint<>expected then raise serialization_failure using message='CUSTOM_VALUE_REVISION_CONFLICT';end if;next_rev:=expected+1;update private.aqari_property_custom_values set value=value_value,revision=next_rev,updated_by=auth.uid(),updated_at=now() where workspace_id=w and property_id=prop and field_id=ident;end if;
  select to_jsonb(v) into after_row from private.aqari_property_custom_values v where v.workspace_id=w and v.property_id=prop and v.field_id=ident;insert into private.aqari_property_control_audit(workspace_id,property_id,entity,entity_id,action,actor_id,actor_name,reason,before_value,after_value) values(w,prop,'custom_field_value',ident::text,'save',auth.uid(),actor,why,before_row,after_row);return jsonb_build_object('workspace_id',w,'user_id',auth.uid(),'record',after_row);
 end if;
 raise invalid_parameter_value using message='INVALID_CUSTOM_FIELD_ACTION';
end $$;
revoke all on function public.aqari_property_custom_fields_v2(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_custom_fields_v2(uuid,text,jsonb) to authenticated;

create or replace function public.aqari_property_tenant_custom_fields(p_workspace_id uuid,p_property_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare allowed boolean:=false;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 allowed:=exists(select 1 from public.aqari_portal_accounts a join public.aqari_leases l on l.workspace_id=a.workspace_id and l.tenant_id=a.tenant_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where a.user_id=auth.uid() and a.workspace_id=p_workspace_id and a.is_active and l.status not in('cancelled','expired') and u.property_id=p_property_id);
 if not allowed then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'property_id',p_property_id,'user_id',auth.uid(),'items',coalesce((select jsonb_agg(jsonb_build_object('key',f.field_key,'labelAr',f.label_ar,'labelEn',f.label_en,'type',f.field_type,'value',v.value) order by f.label_ar,f.id) from private.aqari_property_custom_fields f left join private.aqari_property_custom_values v on v.workspace_id=f.workspace_id and v.property_id=p_property_id and v.field_id=f.id where f.workspace_id=p_workspace_id and f.is_active and p_property_id=any(f.property_ids) and f.visibility in('tenant','owner_tenant') and v.value is not null),'[]'::jsonb));
end $$;
revoke all on function public.aqari_property_tenant_custom_fields(uuid,uuid) from public,anon;
grant execute on function public.aqari_property_tenant_custom_fields(uuid,uuid) to authenticated;

commit;
