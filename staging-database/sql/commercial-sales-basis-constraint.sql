-- Align the table with the two already approved contract calculation bases.
-- The scoped RPC continues to enforce terms revision, approved basis, MFA,
-- property access, source-document verification and immutable financial entries.
do $$declare existing text;begin
 select pg_get_constraintdef(oid) into existing from pg_constraint
 where conrelid='private.aqari_commercial_sales'::regclass and conname='aqari_commercial_sales_calculation_basis_check';
 if existing = 'CHECK ((calculation_basis = ''additional_to_base_rent''::text))' then
  alter table private.aqari_commercial_sales drop constraint aqari_commercial_sales_calculation_basis_check;
  alter table private.aqari_commercial_sales add constraint aqari_commercial_sales_calculation_basis_check
   check(calculation_basis in ('additional_to_base_rent','greater_of_base_or_percentage'));
 elsif existing is null or existing <> 'CHECK ((calculation_basis = ANY (ARRAY[''additional_to_base_rent''::text, ''greater_of_base_or_percentage''::text])))' then
  raise exception 'COMMERCIAL_BASIS_CONSTRAINT_CHANGED';
 end if;
end $$;
