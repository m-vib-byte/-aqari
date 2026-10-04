create temp table salary_upgrade_before as select
 pg_get_functiondef('public.aqari_hr(uuid,text,jsonb)'::regprocedure) as source,
 (select proacl::text from pg_proc where oid='public.aqari_hr(uuid,text,jsonb)'::regprocedure) as acl,
 (select jsonb_agg(to_jsonb(p) order by p.id) from private.aqari_hr_payroll p) as rows,
 (select jsonb_build_object('last_value',last_value,'is_called',is_called) from private.aqari_hr_voucher_seq) as counter;
