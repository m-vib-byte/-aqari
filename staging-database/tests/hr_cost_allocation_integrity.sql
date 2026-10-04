-- Injected into the synthetic HR lifecycle before its first payment; transaction rolls back.
reset role;
update private.aqari_hr_payroll set basic=0.001,allowances=0,overtime=0 where id=current_setting('aqari.test.cycle.payroll')::uuid;
update private.aqari_hr_cost_allocations set share=50 where employee_id='c2670000-0000-4000-8000-000000000021';
set local role authenticated;
select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';a uuid:='c2670000-0000-4000-8000-000000000011';b uuid:='c2670000-0000-4000-8000-000000000012';r jsonb;s jsonb;bad jsonb;
begin
 r:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id',a));
 s:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id',b));
 if (r#>>'{rows,0,allocated_net}')::numeric<>0.001 or (s#>>'{rows,0,allocated_net}')::numeric<>0 then raise exception 'FILS_ROUNDING_DUPLICATED';end if;
 r:=public.aqari_hr_cycle(w,'annual_report',jsonb_build_object('employee_id',e,'year',2026));
 if (select sum((x->>'allocated_cost')::numeric) from jsonb_array_elements(r->'rows') x)<>0.001 then raise exception 'ANNUAL_FILS_TOTAL_MISMATCH';end if;
 s:=public.aqari_hr_cycle(w,'cost_report',jsonb_build_object('employee_id',e,'year',2026,'property_id',b));
 if jsonb_array_length(s->'rows')<>1 or (s#>>'{rows,0,allocated_cost}')::numeric<>0 then raise exception 'FILTER_CHANGED_ROUNDING';end if;
 for bad in select value from jsonb_array_elements('[null,"NaN","Infinity","",0,-1,100.01,40.005,"1e2",{}]'::jsonb) loop
  begin
   perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id',a,'share',bad),jsonb_build_object('property_id',b,'share',60))));
   raise exception 'INVALID_SHARE_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'INVALID_ALLOCATION_SHARE' then raise;end if;end;
 end loop;
 begin
  perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id',a,'share',40.005),jsonb_build_object('property_id',b,'share',59.995))));raise exception 'SHARE_PRECISION_LOST';
 exception when raise_exception then if sqlerrm<>'INVALID_ALLOCATION_SHARE' then raise;end if;end;
 begin
  perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id',a,'share',50),jsonb_build_object('property_id',a,'share',50))));raise exception 'DUPLICATE_SHARE_ACCEPTED';
 exception when raise_exception then if sqlerrm<>'ALLOCATIONS_MUST_TOTAL_100' then raise;end if;end;
end $$;
reset role;
-- Many exact-fils amounts, including zero, ties and an uneven ratio.
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';amount numeric;allocated numeric;
begin
 foreach amount in array array[0,0.001,0.002,0.003,1.001,537.501,999999999.999] loop
  select sum(allocated_net) into allocated from private.aqari_hr_cost_split(w,e,amount);
  if allocated<>amount then raise exception 'EXACT_FILS_SUM_FAILED';end if;
 end loop;
 update private.aqari_hr_cost_allocations set share=case when property_id='c2670000-0000-4000-8000-000000000011' then 33.33 else 66.67 end where employee_id=e;
 foreach amount in array array[0,0.001,0.002,0.003,1.001,537.501,999999999.999] loop
  select sum(allocated_net) into allocated from private.aqari_hr_cost_split(w,e,amount);
  if allocated<>amount then raise exception 'UNEVEN_FILS_SUM_FAILED';end if;
 end loop;
end $$;
update private.aqari_hr_cost_allocations set active=false where employee_id='c2670000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';a uuid:='c2670000-0000-4000-8000-000000000011';action text;
begin
 foreach action in array array['month_report','annual_report','cost_report','month_action'] loop
  begin
   perform public.aqari_hr_cycle(w,action,jsonb_build_object('employee_id',e,'month','2026-09-01','year',2026,'property_id',a,'state','reviewed','reason','Synthetic missing allocation','revision',0));
   raise exception 'MISSING_ALLOCATION_ACCEPTED';
  exception when raise_exception then if sqlerrm<>'HR_COST_ALLOCATION_REQUIRED' then raise;end if;end;
 end loop;
 begin perform private.aqari_hr_cost_split(w,e,1);raise exception 'PRIVATE_HELPER_EXPOSED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000002',true);
 begin perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id',a,'share',100))));raise exception 'SELF_ALLOCATION_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id',a));raise exception 'SELF_COST_REPORT_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
end $$;
reset role;
-- Single-property default, and a corrupt legacy sum must not silently report zero or >100%.
update private.aqari_hr_employees set property_ids=array['c2670000-0000-4000-8000-000000000011']::uuid[] where id='c2670000-0000-4000-8000-000000000021';
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';r record;
begin
 select * into r from private.aqari_hr_cost_split(w,e,1.001);
 if r.share<>100 or r.allocated_net<>1.001 then raise exception 'SINGLE_PROPERTY_DEFAULT_FAILED';end if;
end $$;
update private.aqari_hr_employees set property_ids=array['c2670000-0000-4000-8000-000000000011','c2670000-0000-4000-8000-000000000012']::uuid[] where id='c2670000-0000-4000-8000-000000000021';
update private.aqari_hr_cost_allocations set active=true,share=case when property_id='c2670000-0000-4000-8000-000000000011' then 40.01 else 60 end where employee_id='c2670000-0000-4000-8000-000000000021';
do $$ begin
 begin perform private.aqari_hr_cost_split(current_setting('aqari.test.cycle.workspace')::uuid,'c2670000-0000-4000-8000-000000000021',1);raise exception 'LEGACY_INVALID_SUM_ACCEPTED';exception when raise_exception then if sqlerrm<>'HR_COST_ALLOCATION_REQUIRED' then raise;end if;end;
end $$;
-- Restore fixture inputs so the pre-existing complete lifecycle still passes.
update private.aqari_hr_cost_allocations set share=case when property_id='c2670000-0000-4000-8000-000000000011' then 40 else 60 end where employee_id='c2670000-0000-4000-8000-000000000021';
update private.aqari_hr_payroll set basic=500,allowances=25,overtime=12.5 where id=current_setting('aqari.test.cycle.payroll')::uuid;
set local role authenticated;
