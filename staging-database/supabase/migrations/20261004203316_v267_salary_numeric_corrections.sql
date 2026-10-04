-- Corrected salary vouchers receive a fresh numeric number from the existing salary sequence.
-- Keep the existing sequence, locks, permissions, and all issued records unchanged.
begin;
do $migration$
declare
 source text:=pg_get_functiondef('public.aqari_hr_cycle(uuid,text,jsonb)'::regprocedure);
 old_expression text:=$old$s.voucher_no||'-C'||(s.version+1)$old$;
 new_expression text:=$new$(select lpad(v.n,greatest(4,length(v.n)),'0') from (select nextval('private.aqari_hr_voucher_seq')::text as n) v)$new$;
begin
 if strpos(source,old_expression)>0 then
  if (length(source)-length(replace(source,old_expression,'')))/length(old_expression)<>1 then
   raise exception 'SALARY_CORRECTION_NUMBER_ANCHOR_AMBIGUOUS';
  end if;
  execute replace(source,old_expression,new_expression);
 elsif strpos(source,new_expression)=0 then
  raise exception 'SALARY_CORRECTION_NUMBER_ANCHOR_MISSING';
 end if;
end $migration$;
commit;
