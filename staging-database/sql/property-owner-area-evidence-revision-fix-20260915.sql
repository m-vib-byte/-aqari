-- Fix first-save ownership revision when no head row exists yet.
begin;
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_property_ownership_profile(uuid,uuid,text,jsonb)'::regprocedure);
 anchor:='select coalesce(h.current_revision,0) into current_rev from private.aqari_property_ownership_heads h where h.workspace_id=w and h.property_id=p for update;';
 replacement:=anchor||'current_rev:=coalesce(current_rev,0);';
 if strpos(s,replacement)=0 then
  if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'PROPERTY_OWNERSHIP_REVISION_FIX_ANCHOR_MISMATCH';end if;
  execute replace(s,anchor,replacement);
 end if;
end $patch$;
commit;
