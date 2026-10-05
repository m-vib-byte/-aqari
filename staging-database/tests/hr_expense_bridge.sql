-- Appended to the real signed-salary/dual-approval fixture, before its rollback.
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;r jsonb;period text:=to_char(now() at time zone 'Asia/Kuwait','YYYY-MM');begin
 r:=public.aqari_financial_register(w,'list',jsonb_build_object('month',period));
 if jsonb_array_length(r->'salary_expenses')<>1 or (r#>>'{summary,salary_disbursements}')::numeric<>582 or (r#>>'{summary,salary_payment_count}')::int<>1 then raise exception 'SALARY_EXPENSE_NOT_LINKED';end if;
 if r#>>'{salary_expenses,0,hr_document_id}'<>'f2670000-0000-4000-8000-000000000041' or r#>>'{salary_expenses,0,payroll_id}'<>current_setting('hr.test.payroll') then raise exception 'SALARY_SOURCE_LOST';end if;
 if (r#>>'{summary,approved_expenses}')::numeric<>0 or exists(select 1 from jsonb_array_elements(r->'expenses') x where x->>'state'<>'cancelled') then raise exception 'MANUAL_EXPENSE_DUPLICATED';end if;
 if r<>public.aqari_financial_register(w,'list',jsonb_build_object('month',period)) then raise exception 'REPEAT_READ_CHANGED_LEDGER';end if;
 begin perform 1 from private.aqari_hr_expense_links;raise exception 'PRIVATE_LINK_EXPOSED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_salary_expense_rows(w,current_date);raise exception 'PRIVATE_HELPER_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000003',true);
do $$declare r jsonb;begin
 r:=public.aqari_financial_register(current_setting('aqari.test.hr.workspace')::uuid,'list',jsonb_build_object('month',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM')));
 if jsonb_array_length(r->'salary_expenses')<>0 or (r#>>'{summary,salary_disbursements}')::numeric<>0 then raise exception 'SALARY_PROPERTY_LEAK';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;begin
 begin update private.aqari_hr_expense_links set amount=1 where workspace_id=w;raise exception 'LINK_MUTABLE';exception when raise_exception then if sqlerrm<>'HR_EXPENSE_LINK_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_hr_expense_links where workspace_id=w;raise exception 'LINK_DELETABLE';exception when raise_exception then if sqlerrm<>'HR_EXPENSE_LINK_IMMUTABLE' then raise;end if;end;
 -- Trigger must reject before missing-document constraints, including padding.
 begin insert into private.aqari_financial_expenses(id,workspace_id,property_id,expense_date,category,payee,amount,method,reference,state,created_by)
 values(gen_random_uuid(),w,'f2670000-0000-4000-8000-000000000011',current_date,'test','test',582,'bank',' TEST-REF ','approved',auth.uid());
 raise exception 'PAID_SALARY_DUPLICATED_AS_EXPENSE';exception when raise_exception then if sqlerrm<>'مرجع الصرف مستخدم في راتب مصروف أو مصروف معتمد؛ راجع الأصل لتجنب التكرار.' then raise;end if;end;
end $$;
-- A separate two-property fixture uses one payment reference and exact fils.
insert into private.aqari_hr_employees(id,workspace_id,profile,property_ids,basic,allowances,hired_on,status)
values('f2670000-0000-4000-8000-000000000022',current_setting('aqari.test.hr.workspace')::uuid,'{"name_ar":"Synthetic multi-property"}',array['f2670000-0000-4000-8000-000000000011','f2670000-0000-4000-8000-000000000012']::uuid[],10.001,0,'2026-01-01','active');
insert into private.aqari_hr_cost_allocations(workspace_id,employee_id,property_id,share)
values(current_setting('aqari.test.hr.workspace')::uuid,'f2670000-0000-4000-8000-000000000022','f2670000-0000-4000-8000-000000000011',40),
(current_setting('aqari.test.hr.workspace')::uuid,'f2670000-0000-4000-8000-000000000022','f2670000-0000-4000-8000-000000000012',60);
select set_config('request.jwt.claim.sub','f2670000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;r jsonb;p jsonb;begin
 r:=public.aqari_hr(w,'prepare','{"employee_id":"f2670000-0000-4000-8000-000000000022","month":"2026-08-01"}');p:=r#>'{payroll,0}';
 perform set_config('hr.bridge.multi',p->>'id',true);
 r:=public.aqari_hr(w,'save_payroll',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000022','payroll_id',p->>'id','revision',p->>'revision','overtime','0','deductions','0','advance_repayment','0','method','transfer','reference','MULTI-ONE-PAYMENT'));
 p:=r#>'{payroll,0}';
 perform public.aqari_hr(w,'issue',jsonb_build_object('employee_id','f2670000-0000-4000-8000-000000000022','payroll_id',p->>'id','revision',p->>'revision'));
end $$;
reset role;
-- Synthetic ready document metadata only. The primary salary above used real RPC finalization.
insert into private.aqari_hr_documents(id,workspace_id,employee_id,payroll_id,kind,filename,mime_type,size_bytes,storage_path,status,attestations,created_by,uploaded_at)
values('f2670000-0000-4000-8000-000000000042',current_setting('aqari.test.hr.workspace')::uuid,'f2670000-0000-4000-8000-000000000022',current_setting('hr.bridge.multi')::uuid,'signed_salary','synthetic.pdf','application/pdf',12,'synthetic-bridge-multi','ready','{"signature":true,"fingerprint":true,"stamp":true}',auth.uid(),now());
update private.aqari_hr_payroll set state='paid',paid_at='2026-08-31T22:00:00Z' where id=current_setting('hr.bridge.multi')::uuid;
-- Kuwait payment date is September 1, despite August salary month and UTC date.
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.hr.workspace')::uuid;r jsonb;begin
 r:=public.aqari_financial_register(w,'list','{"month":"2026-09"}');
 if jsonb_array_length(r->'salary_expenses')<>2 or (r#>>'{summary,salary_disbursements}')::numeric<>10.001 or (r#>>'{summary,salary_payment_count}')::int<>1 then raise exception 'MULTI_PROPERTY_DOUBLE_COUNT';end if;
 if (select sum((x->>'amount')::numeric) from jsonb_array_elements(r->'salary_expenses') x)<>10.001 then raise exception 'FILS_LOST';end if;
 if exists(select 1 from jsonb_array_elements(r->'salary_expenses') x where x->>'expense_date'<>'2026-09-01') then raise exception 'KUWAIT_PAYMENT_DATE_WRONG';end if;
 if exists(select 1 from jsonb_array_elements(r->'salary_expenses') x where x->>'reference'<>'MULTI-ONE-PAYMENT') then raise exception 'MULTI_REFERENCE_CHANGED';end if;
 perform public.aqari_financial_register(w,'close_period','{"month":"2026-09","reason":"Synthetic salary bridge close"}');
 r:=public.aqari_financial_register(w,'list','{"month":"2026-09"}');
 if (r#>>'{period,snapshot,salary_disbursements}')::numeric<>10.001 or (r#>>'{period,snapshot,salary_payment_count}')::int<>1 then raise exception 'CLOSE_LOST_SALARY';end if;
end $$;
reset role;
select 'PASS: real paid RPC, signed source, replay, no manual duplicate, property isolation, private ACL, immutable link, two-property exact-fils, Kuwait payment date, closed snapshot' as result;
