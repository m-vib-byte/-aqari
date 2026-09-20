-- Keep restored source properties under their canonical IDs and read projection.
-- Do not insert a legacy display row or post the printed statement total as income.
do $patch$
declare definition text; before_text text := $old$if not exists(select 1 from jsonb_array_elements(coalesce(d->'properties','[]')) x where x->>0=st.content->>'property_name') then$old$; after_text text := $new$if not exists(select 1 from public.aqari_properties p where p.workspace_id=p_workspace_id and p.id=p_property_id and p.metadata->>'source_only'='true')
 and not exists(select 1 from jsonb_array_elements(coalesce(d->'properties','[]')) x where x->>0=st.content->>'property_name') then$new$;
begin
 select pg_get_functiondef('public.aqari_link_property_statement(uuid,uuid,date,text)'::regprocedure) into definition;
 if position(after_text in definition)>0 then return;end if;
 if position(before_text in definition)=0 then raise exception 'SOURCE_LINK_ANCHOR_CHANGED';end if;
 execute replace(definition,before_text,after_text);
end $patch$;
