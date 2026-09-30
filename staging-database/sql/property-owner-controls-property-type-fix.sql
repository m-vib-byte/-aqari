-- Must run after property-owner-controls.sql.
-- Property Master stores the type in property_type, not a legacy type column.
begin;
do $patch$
declare controls text:=pg_get_functiondef('public.aqari_property_controls(uuid,text,jsonb)'::regprocedure); guard text:=pg_get_functiondef('private.aqari_property_template_scope_guard()'::regprocedure);
begin
 if (strpos(controls,'m.type')=0 and strpos(controls,'m.property_type')=0)
  or (strpos(guard,'m.type')=0 and strpos(guard,'m.property_type')=0) then raise exception 'PROPERTY_TYPE_FIX_ANCHOR_CHANGED';end if;
 controls:=replace(controls,'m.type','m.property_type');
 guard:=replace(guard,'m.type','m.property_type');
 if strpos(controls,'m.type')>0 or strpos(guard,'m.type')>0 then raise exception 'PROPERTY_TYPE_FIX_INCOMPLETE';end if;
 execute controls;execute guard;
end $patch$;
commit;
