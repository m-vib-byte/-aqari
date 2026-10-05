do $$ declare difference_count integer; begin
 with actual as (
  select 'terms' as kind,to_jsonb(t)-'sales_rent_basis' as value from private.aqari_commercial_terms t
  union all select 'sales',to_jsonb(t) from private.aqari_commercial_sales t
  union all select 'adjustments',to_jsonb(t) from private.aqari_tenant_adjustments t
 ), differences as (
  (select * from actual except all select * from basis_history)
  union all (select * from basis_history except all select * from actual)
 ) select count(*) into difference_count from differences;
 if difference_count<>0 then raise exception 'SALES_BASIS_HISTORY_CHANGED';end if;
 if exists(select 1 from private.aqari_commercial_terms where sales_rent_basis is distinct from 'additional_to_base_rent') then raise exception 'LEGACY_BASIS_CHANGED';end if;
 if exists(select 1 from basis_acl b join pg_proc p on p.oid=to_regprocedure(b.signature) where p.proacl is distinct from b.proacl) then raise exception 'SALES_BASIS_ACL_CHANGED';end if;
end $$;
