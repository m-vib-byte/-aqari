-- Runs after property-batch-a2-core.sql. Canonicalize the UI camelCase office-hours flag
-- to the lowercase persisted key required by the property visibility policy.
begin;
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure);
 anchor:='tenant_info_value:=case when p_data?''tenantInfo'' then coalesce(p_data->''tenantInfo'',''{}''::jsonb) else coalesce(old_row.tenant_public_info,''{}''::jsonb) end;';
 replacement:=anchor||'if visibility_value?''officeHours'' then if visibility_value?''office_hours'' and visibility_value->''office_hours'' is distinct from visibility_value->''officeHours'' then raise invalid_parameter_value using message=''PROPERTY_TENANT_VISIBILITY_CONFLICT'';end if;visibility_value:=(visibility_value-''officeHours'')||jsonb_build_object(''office_hours'',visibility_value->''officeHours'');end if;';
 if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'PROPERTY_TENANT_VISIBILITY_SAVE_ANCHOR_MISMATCH';end if;
 execute replace(s,anchor,replacement);

 s:=pg_get_functiondef('private.aqari_property_master_snapshot(uuid,uuid)'::regprocedure);
 anchor:='''tenantVisibility'', COALESCE(m.tenant_visibility, ''{}''::jsonb)';
 if position(anchor in s)=0 then
  anchor:='''tenantVisibility'',coalesce(m.tenant_visibility,''{}''::jsonb)';
 end if;
 replacement:='''tenantVisibility'',coalesce(m.tenant_visibility,''{}''::jsonb)||case when coalesce(m.tenant_visibility,''{}''::jsonb)?''office_hours'' then jsonb_build_object(''officeHours'',m.tenant_visibility->''office_hours'') else ''{}''::jsonb end';
 if position(anchor in s)=0 then raise exception 'PROPERTY_TENANT_VISIBILITY_SNAPSHOT_ANCHOR_MISMATCH';end if;
 execute replace(s,anchor,replacement);

 s:=pg_get_functiondef('public.aqari_property_tenant_profile(uuid,uuid)'::regprocedure);
 if position('v ->> ''officeHours''::text' in s)>0 then
  s:=replace(s,'v ->> ''officeHours''::text','COALESCE(v ->> ''office_hours''::text, v ->> ''officeHours''::text)');
 elsif position('v->>''officeHours''' in s)>0 then
  s:=replace(s,'v->>''officeHours''','coalesce(v->>''office_hours'',v->>''officeHours'')');
 else
  raise exception 'PROPERTY_TENANT_PROFILE_OFFICE_HOURS_ANCHOR_MISMATCH';
 end if;
 execute s;
end $patch$;
commit;
