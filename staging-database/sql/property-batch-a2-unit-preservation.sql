-- Runs after property-batch-a2-core.sql. Preserve area when older callers omit the Batch A2 field.
begin;
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_unit_master_save(uuid,uuid,uuid,bigint,jsonb,text)'::regprocedure);
 anchor:='rev:=coalesce(old_row.revision,0);if p_expected_revision is distinct from rev then raise exception ''UNIT_MASTER_REVISION_CONFLICT'' using errcode=''40001'';end if;';
 replacement:=anchor||'if not (p_data?''areaSqm'') then area:=old_row.area_sqm;end if;';
 if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'UNIT_AREA_PRESERVATION_ANCHOR_MISMATCH';end if;
 execute replace(s,anchor,replacement);
end $patch$;
commit;
