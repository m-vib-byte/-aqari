-- Preserve existing property IDs and source provenance when projecting cloud state.
-- Validated on the restored historical-property case in a rolled-back transaction.
-- Does not change authorization, grants, RLS, leases, or payment records.
begin;
do $patch$
declare definition text;before_text text:=$old$insert into public.aqari_properties values(prop_id,new.workspace_id,btrim(r->>0),btrim(r->>0),r) on conflict(id) do update set metadata=excluded.metadata;$old$;after_text text:=$new$insert into public.aqari_properties values(prop_id,new.workspace_id,btrim(r->>0),btrim(r->>0),r) on conflict(workspace_id,external_ref) do update set metadata=case when jsonb_typeof(public.aqari_properties.metadata)='object' then public.aqari_properties.metadata||jsonb_build_object('source_record',excluded.metadata) else excluded.metadata end;$new$;
begin
 select pg_get_functiondef('private.aqari_v267_project_state()'::regprocedure) into definition;
 if position(after_text in definition)>0 then return;end if;
 if position(before_text in definition)=0 then raise exception 'PROPERTY_PROJECTOR_ANCHOR_CHANGED';end if;
 execute replace(definition,before_text,after_text);
end $patch$;
commit;
