-- In-memory runner ONLY: boundary tests deliberately advance its disposable sequence.
begin;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$
declare
 w uuid; eid uuid:='f2670000-0000-4000-8000-000000000021';
 old_rows jsonb; r jsonb; p jsonb; n bigint; current_number bigint; i int:=0;
 numbers bigint[]:=array[1,2,9999,10000,1000000,9223372036854775806]::bigint[];
begin
 select workspace_id into w from private.aqari_hr_employees where id=eid;
 if w is null then raise exception 'LEGACY_FIXTURE_MISSING';end if;
 select jsonb_agg(to_jsonb(x) order by x.id) into old_rows from private.aqari_hr_payroll x where employee_id=eid;
 if old_rows->0->>'voucher_no' !~ '^DT-' then raise exception 'LEGACY_NUMBER_MISSING';end if;
 foreach n in array numbers loop
  i:=i+1;
  perform setval('private.aqari_hr_voucher_seq',n,false);
  r:=public.aqari_hr(w,'prepare',jsonb_build_object('employee_id',eid,'month',make_date(2026,i+1,1)));
  select to_jsonb(x) into p from private.aqari_hr_payroll x where employee_id=eid and month=make_date(2026,i+1,1);
  r:=public.aqari_hr(w,'issue',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',p->>'revision'));
  if (select voucher_no from private.aqari_hr_payroll where id=(p->>'id')::uuid)<>lpad(n::text,greatest(4,length(n::text)),'0') then raise exception 'NUMBER_BOUNDARY_FAILED: %',n;end if;
  select last_value into current_number from private.aqari_hr_voucher_seq;
  if current_number<>n then raise exception 'SEQUENCE_CONSUMED_MORE_THAN_ONCE';end if;
  begin
   perform public.aqari_hr(w,'issue',jsonb_build_object('employee_id',eid,'payroll_id',p->>'id','revision',p->>'revision'));
   raise exception 'REPLAY_ACCEPTED';
  exception when serialization_failure then null;end;
  select last_value into current_number from private.aqari_hr_voucher_seq;
  if current_number<>n then raise exception 'REPLAY_ADVANCED_SEQUENCE';end if;
 end loop;
 if (select jsonb_agg(to_jsonb(x) order by x.id) from private.aqari_hr_payroll x where employee_id=eid and month='2026-09-01') is distinct from old_rows then raise exception 'OLD_SALARY_CHANGED';end if;
 if has_sequence_privilege('authenticated','private.aqari_hr_voucher_seq','USAGE') or has_sequence_privilege('anon','private.aqari_hr_voucher_seq','USAGE') then raise exception 'COUNTER_PRIVILEGE_LEAK';end if;
end $$;
rollback;
