-- Preserve added columns and any newly saved field values. Restore previous API functions only.
begin;
CREATE OR REPLACE FUNCTION private.aqari_property_master_snapshot(w uuid, p uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
  'id',x.id,'externalRef',x.external_ref,'name',x.name,
  'address',coalesce(m.address,x.metadata->>'location',''),
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
CREATE OR REPLACE FUNCTION public.aqari_property_master_save(p_workspace_id uuid, p_property_id uuid, p_expected_revision bigint, p_data jsonb, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare old_row private.aqari_property_master%rowtype; new_row private.aqari_property_master%rowtype;
 old_snapshot jsonb; new_snapshot jsonb; actor text; nm text; owners jsonb; income numeric; rev bigint; location_value text; automatic_value text;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('name','address','type','status','statedIncome','owners','email','phone','whatsapp','assets','locationUrl','propertyAutomaticRef')) then raise invalid_parameter_value using message='PROPERTY_MASTER_INVALID';end if;
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
 if length(location_value)>2000 or length(automatic_value)>200 then raise invalid_parameter_value using message='PROPERTY_EXTENDED_FIELD_INVALID';end if;
 if location_value<>'' and location_value !~ '^https://[^[:space:]@/?#]+([/?#][^[:space:]]*)?$' then raise invalid_parameter_value using message='PROPERTY_LOCATION_URL_INVALID';end if;
 select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 update public.aqari_properties set name=nm where workspace_id=p_workspace_id and id=p_property_id;
 insert into private.aqari_property_master(workspace_id,property_id,address,property_type,status,stated_income,owners,contact_email,contact_phone,contact_whatsapp,assets,location_url,property_automatic_ref,revision,updated_by,updated_at)
 values(p_workspace_id,p_property_id,btrim(coalesce(p_data->>'address','')),btrim(coalesce(p_data->>'type','')),btrim(coalesce(p_data->>'status','active')),income,owners,lower(btrim(coalesce(p_data->>'email',''))),btrim(coalesce(p_data->>'phone','')),btrim(coalesce(p_data->>'whatsapp','')),coalesce(p_data->'assets','{}'::jsonb),location_value,automatic_value,rev+1,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set address=excluded.address,property_type=excluded.property_type,status=excluded.status,stated_income=excluded.stated_income,owners=excluded.owners,contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,contact_whatsapp=excluded.contact_whatsapp,assets=excluded.assets,location_url=excluded.location_url,property_automatic_ref=excluded.property_automatic_ref,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at
 returning * into new_row;
 new_snapshot:=private.aqari_property_master_snapshot(p_workspace_id,p_property_id);
 insert into private.aqari_property_master_audit(workspace_id,property_id,entity_type,action,reason,actor_id,actor_name,before_value,after_value)
 values(p_workspace_id,p_property_id,'property','save_master',btrim(p_reason),auth.uid(),actor,old_snapshot,new_snapshot);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'property',new_snapshot);
end $function$
;
drop function if exists public.aqari_property_completeness(uuid,uuid);
notify pgrst, 'reload schema';
commit;
