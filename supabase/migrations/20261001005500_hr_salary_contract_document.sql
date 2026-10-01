-- Add an independent employee salary-contract document type.
-- This is not a monthly signed salary voucher and never requires payroll_id.
begin;

do $constraint$
declare c record;
begin
 for c in
  select conname from pg_constraint
  where conrelid='private.aqari_hr_documents'::regclass
    and contype='c'
    and pg_get_constraintdef(oid) ilike '%kind%'
 loop
  if c.conname='aqari_hr_documents_kind_check' then
   execute format('alter table private.aqari_hr_documents drop constraint %I',c.conname);
  end if;
 end loop;
end $constraint$;

alter table private.aqari_hr_documents
 add constraint aqari_hr_documents_kind_check
 check(kind in ('document','employment_contract','salary_contract','signed_salary'));

do $patch$
declare definition text;
declare anchor text:='''document'',''employment_contract'',''signed_salary''';
declare replacement text:='''document'',''employment_contract'',''salary_contract'',''signed_salary''';
begin
 definition:=pg_get_functiondef('public.aqari_hr(uuid,text,jsonb)'::regprocedure);
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'HR_SALARY_CONTRACT_ANCHOR_MISMATCH';
 end if;
 definition:=replace(definition,anchor,replacement);
 execute definition;
end $patch$;

notify pgrst,'reload schema';
commit;
