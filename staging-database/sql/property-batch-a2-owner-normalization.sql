-- Runs after property-batch-a2-core.sql. Strip the UI-only owner percentage helper before validation/persistence.
begin;
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure);
 anchor:='owners:=coalesce(p_data->''owners'',''[]''::jsonb);if not private.aqari_property_owners_valid(owners) then';
 replacement:='owners:=coalesce(p_data->''owners'',''[]''::jsonb);select coalesce(jsonb_agg(x.value-''share''),''[]''::jsonb) into owners from jsonb_array_elements(owners)x(value);if not private.aqari_property_owners_valid(owners) then';
 if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'PROPERTY_OWNER_NORMALIZATION_ANCHOR_MISMATCH';end if;
 execute replace(s,anchor,replacement);
end $patch$;
commit;
