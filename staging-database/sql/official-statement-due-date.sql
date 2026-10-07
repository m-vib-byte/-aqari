-- Preview candidate. Requires the reviewed commercial-aware statement already installed.
-- Production is missing that prerequisite: do not apply this as a bootstrap migration.
begin;
do $upgrade$
declare signature regprocedure:=to_regprocedure('private.aqari_official_statement(uuid,uuid,date,date)');
 definition text;anchor text:='greatest(p::date,l.start_date) on_date';
 replacement text:='private.aqari_rent_due_on(l.snapshot,l.start_date,p::date) on_date';
begin
 if signature is null then raise exception 'STATEMENT_PREREQUISITE_MISSING';end if;
 if to_regprocedure('private.aqari_rent_due_on(jsonb,date,date)') is null then raise exception 'ENTITLEMENT_PREREQUISITE_MISSING';end if;
 definition:=pg_get_functiondef(signature);
 -- Allow a replay only when reversing this exact patch restores the reviewed source.
 if md5(replace(definition,replacement,anchor))<>'fce7e04632046654b790a3b44e9430c2' then
  raise exception 'STATEMENT_REVIEWED_SOURCE_CHANGED';
 end if;
 if position(replacement in definition)>0 then return;end if;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'STATEMENT_DUE_DATE_ANCHOR_CHANGED';
 end if;
 execute replace(definition,anchor,replacement);
 -- CREATE OR REPLACE preserves existing ACLs; no grants or role changes.
end $upgrade$;
commit;
