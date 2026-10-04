-- Inject before the lifecycle's payment. Only synthetic records; outer ROLLBACK.
select set_config('request.jwt.claim.sub','c2670000-0000-4000-8000-000000000001',true);
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';p uuid:=current_setting('aqari.test.cycle.payroll')::uuid;r jsonb;draft jsonb;
begin
 r:=public.aqari_hr_payroll_cycle(w,'get',jsonb_build_object('employee_id',e,'payroll_id',p));
 perform public.aqari_hr_payroll_cycle(w,'issue',jsonb_build_object('employee_id',e,'payroll_id',p,'revision',r->>'revision'));
 perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id','c2670000-0000-4000-8000-000000000011','share',20),jsonb_build_object('property_id','c2670000-0000-4000-8000-000000000012','share',80))));
 r:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011'));
 if (r#>>'{rows,0,share}')::numeric is distinct from 40 or (r#>>'{rows,0,allocated_net}')::numeric is distinct from 215 then raise exception 'HR_HISTORY_MOVED';end if;
 if r#>>'{rows,0,cost_basis}' is distinct from 'issued_snapshot' then raise exception 'HR_SNAPSHOT_BASIS_MISSING';end if;
 perform public.aqari_hr(w,'prepare',jsonb_build_object('employee_id',e,'month','2026-10-01'));
 r:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-10-01','property_id','c2670000-0000-4000-8000-000000000011'));
 if (r#>>'{rows,0,share}')::numeric is distinct from 20 or r#>>'{rows,0,cost_basis}' is distinct from 'draft_current' then raise exception 'NEW_DRAFT_DID_NOT_USE_CURRENT';end if;
 begin perform private.aqari_hr_payroll_cost_split(w,p);raise exception 'PRIVATE_SNAPSHOT_HELPER_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_hr_payroll_cost_snapshots;raise exception 'PRIVATE_SNAPSHOT_TABLE_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Transfer employee to B after issuance: historical A cost must remain visible.
update private.aqari_hr_employees set property_ids=array['c2670000-0000-4000-8000-000000000012']::uuid[] where id='c2670000-0000-4000-8000-000000000021';
do $$ declare p uuid:=current_setting('aqari.test.cycle.payroll')::uuid;
begin
 begin update private.aqari_hr_payroll_cost_snapshots set share=90 where payroll_id=p;raise exception 'SNAPSHOT_UPDATE_ALLOWED';exception when raise_exception then if sqlerrm<>'HR_COST_SNAPSHOT_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_hr_payroll_cost_snapshots where payroll_id=p;raise exception 'SNAPSHOT_DELETE_ALLOWED';exception when raise_exception then if sqlerrm<>'HR_COST_SNAPSHOT_IMMUTABLE' then raise;end if;end;
 if (select sum(allocated_net) from private.aqari_hr_payroll_cost_snapshots where payroll_id=p)<>537.5 then raise exception 'SNAPSHOT_NET_MISMATCH';end if;
end $$;
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';r jsonb;
begin
 perform public.aqari_hr_cycle(w,'save_allocations',jsonb_build_object('employee_id',e,'allocations',jsonb_build_array(jsonb_build_object('property_id','c2670000-0000-4000-8000-000000000012','share',100))));
 r:=public.aqari_hr_cycle(w,'month_report',jsonb_build_object('employee_id',e,'month','2026-09-01','property_id','c2670000-0000-4000-8000-000000000011'));
 if (r#>>'{rows,0,allocated_net}')::numeric is distinct from 215 then raise exception 'TRANSFER_REMOVED_HISTORICAL_COST';end if;
 r:=public.aqari_hr_cycle(w,'annual_report',jsonb_build_object('employee_id',e,'year',2026));
 if (select count(*) from jsonb_array_elements(r->'rows') x where x->>'month'='2026-09')<>2 or (select sum((x->>'allocated_cost')::numeric) from jsonb_array_elements(r->'rows') x where x->>'month'='2026-09')<>537.5 then raise exception 'TRANSFER_CHANGED_ANNUAL_COST';end if;
 r:=public.aqari_hr_cycle(w,'cost_report',jsonb_build_object('employee_id',e,'year',2026,'property_id','c2670000-0000-4000-8000-000000000011'));
 if jsonb_array_length(r->'rows')<>1 or (r#>>'{rows,0,allocated_cost}')::numeric is distinct from 215 then raise exception 'FILTER_CHANGED_HISTORICAL_COST';end if;
end $$;
-- Original lifecycle now pays, exports, corrects, reviews and closes A despite transfer.
reset role;
update private.aqari_hr_employees set property_ids=array['c2670000-0000-4000-8000-000000000011','c2670000-0000-4000-8000-000000000012']::uuid[] where id='c2670000-0000-4000-8000-000000000021';
update private.aqari_hr_cost_allocations set active=false where employee_id='c2670000-0000-4000-8000-000000000021';
set local role authenticated;
do $$ declare w uuid:=current_setting('aqari.test.cycle.workspace')::uuid;e uuid:='c2670000-0000-4000-8000-000000000021';r jsonb;p jsonb;
begin
 r:=public.aqari_hr(w,'get',jsonb_build_object('employee_id',e));select x into p from jsonb_array_elements(r->'payroll') x where x->>'month'='2026-10-01';
 begin perform public.aqari_hr_payroll_cycle(w,'issue',jsonb_build_object('employee_id',e,'payroll_id',p->>'id','revision',p->>'revision'));raise exception 'MISSING_ALLOCATION_ISSUED';exception when raise_exception then if sqlerrm<>'HR_COST_ALLOCATION_REQUIRED' then raise;end if;end;
 r:=public.aqari_hr_payroll_cycle(w,'get',jsonb_build_object('employee_id',e,'payroll_id',p->>'id'));
 if r->>'state'<>'draft' or r->>'revision'<>p->>'revision' then raise exception 'FAILED_ISSUE_CHANGED_DRAFT';end if;
end $$;
reset role;
update private.aqari_hr_employees set property_ids=array['c2670000-0000-4000-8000-000000000012']::uuid[] where id='c2670000-0000-4000-8000-000000000021';
update private.aqari_hr_cost_allocations set active=true,share=100 where employee_id='c2670000-0000-4000-8000-000000000021' and property_id='c2670000-0000-4000-8000-000000000012';
set local role authenticated;
