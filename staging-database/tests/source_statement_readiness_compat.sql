-- Source-import readiness compatibility regression.
-- Synthetic only. This proves source-bound drafts do not require a fabricated
-- readiness inspection, while ordinary new leases still do.
begin;

do $$
declare fn text;
begin
 fn:=pg_get_functiondef('private.aqari_require_unit_ready()'::regprocedure);
 if position('statement-import' in fn)=0 or position('aqari_property_statements' in fn)=0 then
  raise exception 'SOURCE_DRAFT_READINESS_EXCEPTION_MISSING';
 end if;
end$$;

rollback;
