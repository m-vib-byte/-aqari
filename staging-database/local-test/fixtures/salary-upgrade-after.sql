do $$
declare b record;
begin
 select * into b from salary_upgrade_before;
 if pg_get_functiondef('public.aqari_hr(uuid,text,jsonb)'::regprocedure)<>replace(b.source,$old$(case when p.slip_details->>'template'='dhahawi-v1' then 'DT-' else 'AQ-' end)||to_char(now() at time zone 'Asia/Kuwait','YYYYMMDD')||'-'||lpad(nextval('private.aqari_hr_voucher_seq')::text,6,'0')$old$,$new$(select lpad(v.n,greatest(4,length(v.n)),'0') from (select nextval('private.aqari_hr_voucher_seq')::text as n) v)$new$) then raise exception 'UNRELATED_FUNCTION_CHANGE';end if;
 if (select proacl::text from pg_proc where oid='public.aqari_hr(uuid,text,jsonb)'::regprocedure) is distinct from b.acl then raise exception 'FUNCTION_ACL_CHANGED';end if;
 if (select jsonb_agg(to_jsonb(p) order by p.id) from private.aqari_hr_payroll p) is distinct from b.rows then raise exception 'HISTORICAL_PAYROLL_CHANGED';end if;
 if (select jsonb_build_object('last_value',last_value,'is_called',is_called) from private.aqari_hr_voucher_seq) is distinct from b.counter then raise exception 'COUNTER_CHANGED';end if;
end $$;
