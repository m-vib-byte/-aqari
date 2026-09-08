create or replace function public.aqari_read_state_v267(p_workspace_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row_data public.aqari_app_state%rowtype;d jsonb;filtered jsonb;source_properties jsonb;
begin
 if not private.aqari_staff(p_workspace_id) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 select * into row_data from public.aqari_app_state where workspace_id=p_workspace_id;
 if not found then return null;end if;
 d:=private.aqari_unwrap(row_data.payload);
 -- Expose independently imported properties only to the manager with property-read access.
 -- Existing property rows and every other state key are preserved.
 if private.aqari_manager(p_workspace_id) and private.aqari_can(p_workspace_id,'properties','read') then
  select coalesce(jsonb_agg(jsonb_build_array(p.name,'غير مدون',(select count(*) from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id),(select sum((r->>'current_rent_kd')::numeric) from jsonb_array_elements(s.content->'rows') r))),'[]') into source_properties
  from public.aqari_properties p join lateral(select st.content from public.aqari_property_statements st where st.workspace_id=p.workspace_id and st.property_id=p.id order by st.period desc limit 1)s on true
  where p.workspace_id=p_workspace_id and not exists(select 1 from jsonb_array_elements(coalesce(d->'properties','[]')) r where r->>0=p.name);
  d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||source_properties);
 end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into filtered from jsonb_each(d) where private.aqari_can(p_workspace_id,private.aqari_state_section(key),'read');
 return jsonb_build_object('workspace_id',row_data.workspace_id,'payload',filtered,'revision',row_data.revision,'updated_by',row_data.updated_by,'updated_at',row_data.updated_at);
end $$;
