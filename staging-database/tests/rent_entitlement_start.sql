-- Synthetic SQL acceptance, fully rolled back. No email, DDL or policy bypass.
begin;
do $$
declare c jsonb:='{"rentalTermsVersion":1,"rent":90,"contractRent":100,"start_date":"2025-09-01","end_date":"2026-12-31","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[],"rentEntitlement":{"version":1,"startDate":"2025-09-20","firstPeriodPolicy":"daily_prorated","manualFirstPeriodAmount":null}}';v jsonb;proof jsonb;
begin
 if private.aqari_contract_due(c,'2025-08')<>0 or private.aqari_contract_due(c,'2025-09')<>33 or private.aqari_contract_due(c,'2025-10')<>90 then raise exception 'ENTITLEMENT_CALENDAR_DUE';end if;
 proof:=private.aqari_rent_period_breakdown(c,'2025-09');
 if (proof->>'gross')::numeric<>36.667 or (proof->>'discount')::numeric<>3.667 or (proof->>'net')::numeric<>33 or proof->>'dueOn'<>'2025-09-20' then raise exception 'ENTITLEMENT_EXACT_FILS_BREAKDOWN:%',proof;end if;
 v:=jsonb_set(c,'{rentEntitlement,firstPeriodPolicy}','"full_month"');if private.aqari_contract_due(v,'2025-09')<>90 then raise exception 'FULL_MONTH_POLICY';end if;
 v:=jsonb_set(c,'{rentEntitlement}', '{"version":1,"startDate":"2025-09-20","firstPeriodPolicy":"manual_first_period","manualFirstPeriodAmount":17.125}');
 if private.aqari_contract_due(v,'2025-09')<>17.125 or private.aqari_contract_due(v,'2025-10')<>90 or private.aqari_rent_period_breakdown(v,'2025-09')->'gross'<>'null'::jsonb then raise exception 'MANUAL_NET_DISCOUNTED_TWICE';end if;
 if private.aqari_contract_due(v||'{"freeMonthApproved":true,"freeMonthPeriod":"2025-09"}','2025-09')<>0 then raise exception 'FREE_MONTH_NOT_APPLIED';end if;
 v:=c||'{"start_date":"2024-02-01","end_date":"2024-12-31","rentEntitlement":{"version":1,"startDate":"2024-02-20","firstPeriodPolicy":"daily_prorated","manualFirstPeriodAmount":null}}';
 if private.aqari_contract_due(v,'2024-02')<>31.034 then raise exception 'LEAP_MONTH_PRORATION';end if;
 v:=jsonb_set(v,'{end_date}','"2024-02-21"');if private.aqari_contract_due(v,'2024-02')<>6.207 then raise exception 'SHORT_FIRST_PERIOD_PRORATION';end if;
 if private.aqari_contract_due(c-'rentEntitlement','2025-08')<>90 then raise exception 'LEGACY_DUE_CHANGED';end if;
 begin perform private.aqari_validate_rent_entitlement(jsonb_set(c,'{rentEntitlement,startDate}','"2027-01-01"'));raise exception 'OUTSIDE_DATES_ALLOWED';exception when raise_exception then if sqlerrm='OUTSIDE_DATES_ALLOWED' then raise;end if;end;
 begin perform private.aqari_validate_rent_entitlement(jsonb_set(c,'{rentEntitlement,manualFirstPeriodAmount}','5'));raise exception 'UNSELECTED_MANUAL_ALLOWED';exception when raise_exception then if sqlerrm='UNSELECTED_MANUAL_ALLOWED' then raise;end if;end;
end $$;
insert into public.aqari_workspaces(id,slug,name) values('76810000-0000-4000-8000-000000000001','entitlement-acceptance','Synthetic entitlement acceptance');
insert into public.aqari_app_state(workspace_id,payload) values('76810000-0000-4000-8000-000000000001','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('entitlement-manager@example.invalid','مدير استحقاق اصطناعي','general_manager','entitlement-acceptance'),
 ('entitlement-staff@example.invalid','موظف استحقاق اصطناعي','property_manager','entitlement-acceptance');
insert into auth.users(id,email,email_confirmed_at) values
 ('76810000-0000-4000-8000-000000000002','entitlement-manager@example.invalid',now()),
 ('76810000-0000-4000-8000-000000000003','entitlement-staff@example.invalid',now());
select set_config('request.jwt.claim.sub','76810000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
set local role authenticated;
do $$
declare w uuid:='76810000-0000-4000-8000-000000000001';s jsonb;d jsonb;t jsonb;c jsonb;r jsonb;prop uuid;
begin
 r:=(public.aqari_rental_templates(w,'publish','{"id":"76810000-0000-4000-8000-000000000010","kind":"apartment","title":"قالب استحقاق اصطناعي","clauses":[{"title":"اختبار","text":"نص اصطناعي لا يستخدم في عقد فعلي."}],"expected_version":0,"reason":"اعتماد قالب لاختبار الاستحقاق","approved":true}'))->'record';
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 t:='{"id":"entitlement-tenant","nameAr":"مستأجر استحقاق اصطناعي","nameEn":"Synthetic Entitlement Tenant","civilId":"768100000001","passportNo":"ENT-TEST","email":"entitlement-tenant@example.invalid","phone":"76810001","nationality":"اختبار","attachments":[]}';
 d:=d||jsonb_build_object('properties','[["عقار اختبار الاستحقاق"]]'::jsonb,'tenantProfilesV267',jsonb_build_array(t));
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 select id into strict prop from public.aqari_properties where workspace_id=w and name='عقار اختبار الاستحقاق';
 perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','76810000-0000-4000-8000-000000000011','property_id',prop,'unit_no','ENT-1','expected_revision',0,'state','ready','inspected_on',current_date::text,'source_ref','فحص وحدة اصطناعي','reason','اجتازت الوحدة فحص الاختبار'));
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76810000-0000-4000-8000-000000000003','operational_role','property_manager','property_ids',jsonb_build_array(prop),'is_active',true,'revision',0,'reason','صلاحية موظف لاختبار مسودة العقد'));
 c:=jsonb_build_object('id','entitlement-contract','contract_no','ENT-TEST-1','source','v267-cloud','detailsVersion',2,'rentalTermsVersion',1,
  'tenantId',t->>'id','tenant',t->>'nameAr','tenantProfile',t,'property','عقار اختبار الاستحقاق','unit','ENT-1','floor','الأول',
  'start_date','2025-09-01','end_date','2026-12-31','writtenOn',(now() at time zone 'Asia/Kuwait')::date::text,'status','draft','contractRent',100,'rent',90,'discount',10,'deposit',0,'advance',0,'cleaningFee',0,
  'accountant','محاسب اختبار','contractReceived','لم يستلم','receivedAt','','depositReceivedOn','','evictionNotice','لم يُبلّغ','freeMonthApproved',false,'freeMonthPeriod','','rentAdjustments','[]'::jsonb,'clauses',r->'clauses','contractTemplate',r,
  'rentEntitlement','{"version":1,"startDate":"2025-09-20","firstPeriodPolicy":"daily_prorated","manualFirstPeriodAmount":null}'::jsonb);
 begin perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',jsonb_build_array(c-'rentEntitlement')),(s->>'revision')::bigint);raise exception 'NEW_CONTRACT_IMPLICIT_POLICY';exception when raise_exception then if sqlerrm='NEW_CONTRACT_IMPLICIT_POLICY' then raise;end if;end;
 perform public.aqari_save_state_v267(w,jsonb_set(d,'{contractsV202}',jsonb_build_array(c)),(s->>'revision')::bigint);
end $$;
select set_config('request.jwt.claim.sub','76810000-0000-4000-8000-000000000003',true);
do $$
declare w uuid:='76810000-0000-4000-8000-000000000001';s jsonb;c jsonb;
begin
 s:=public.aqari_read_state_v267(w);c:=s#>'{payload,contractsV202,0}';
 c:=jsonb_set(c,'{rentEntitlement,startDate}','"2025-09-21"')||'{"changeReason":"مراجعة تاريخ استحقاق المسودة"}';
 s:=public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c),(s->>'revision')::bigint);
 if s#>>'{payload,contractsV202,0,rentEntitlement,startDate}'<>'2025-09-21' then raise exception 'STAFF_DRAFT_EDIT_FAILED';end if;
 begin perform public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c||'{"status":"approved"}'),(s->>'revision')::bigint);raise exception 'STAFF_APPROVED_TERMS';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76810000-0000-4000-8000-000000000002',true);
do $$
declare w uuid:='76810000-0000-4000-8000-000000000001';s jsonb;c jsonb;doc record;lid uuid;history jsonb;
begin
 s:=public.aqari_read_state_v267(w);c:=jsonb_set(s#>'{payload,contractsV202,0}','{rentEntitlement,startDate}','"2025-09-20"')||'{"changeReason":"مراجعة المدير لتاريخ الاستحقاق"}';
 s:=public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c),(s->>'revision')::bigint);
 history:=public.aqari_contract_history(w,'entitlement-contract');if jsonb_array_length(history)<>3 or history#>>'{0,before_snapshot,rentEntitlement,startDate}'<>'2025-09-21' then raise exception 'ENTITLEMENT_AUDIT_MISSING';end if;
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref=c->>'id';
 -- The subtransaction rolls the synthetic cheque back only after proving that
 -- an uncollected postdated instrument freezes draft billing terms.
 begin
  perform public.aqari_operations_register(w,'cheques','create',jsonb_build_object('id','76810000-0000-4000-8000-000000000020','lease_id',lid,'kind','postdated','cheque_no','ENT-CHEQUE','bank_name','بنك اصطناعي','amount',10,'due_on',current_date::text));
  begin perform public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',jsonb_set(c,'{rentEntitlement,startDate}','"2025-09-22"')),(s->>'revision')::bigint);raise exception 'CHEQUE_BILLING_TERMS_CHANGED';
  exception when raise_exception then if sqlerrm not like 'لا يمكن تغيير الاستحقاق بعد اعتماد سابق أو حركة مالية%' then raise;end if;end;
  raise exception using errcode='ZX001',message='ROLL_BACK_SYNTHETIC_CHEQUE';
 exception when sqlstate 'ZX001' then null;end;
 c:=c||'{"status":"approved","changeReason":"اعتماد شروط الاستحقاق من المدير"}';s:=public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c),(s->>'revision')::bigint);
 begin perform public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',jsonb_set(c,'{rentEntitlement,startDate}','"2025-09-22"')),(s->>'revision')::bigint);raise exception 'APPROVED_ENTITLEMENT_CHANGED';exception when raise_exception then if sqlerrm='APPROVED_ENTITLEMENT_CHANGED' then raise;end if;end;
 select * into doc from public.aqari_reserve_document(w,'signed_contract','lease',c->>'id','عقد اختبار فقط','fixture.jpg','image/jpeg','{"test":"rollback-only"}');
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',doc.storage_path,'{"size":100,"mimetype":"image/jpeg"}');
 perform public.aqari_finalize_document(doc.document_id,100,'image/jpeg',repeat('a',64));
 c:=c||'{"status":"signed","changeReason":"اعتماد بيانات توقيع اصطناعية فقط"}';s:=public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c),(s->>'revision')::bigint);
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref=c->>'id';
 if (select monthly_rent from public.aqari_leases where id=lid)<>90 then raise exception 'MONTHLY_CONTRACT_RATE_REWRITTEN';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_rent_due_schedule(w,lid)->'periods') d where d->>'period'='2025-09-01' and d->>'due_on'='2025-09-20' and (d->>'due_amount')::numeric=33) then raise exception 'DUE_SCHEDULE_FIRST_PERIOD_MISMATCH';end if;
end $$;
reset role;
do $$
declare w uuid:='76810000-0000-4000-8000-000000000001';lid uuid;proof jsonb;s jsonb;c jsonb;r jsonb;receipt jsonb;row_data jsonb;d jsonb;before_receipt jsonb;saved_payment_id uuid;n integer;
begin
 select id into strict lid from public.aqari_leases where workspace_id=w and external_ref='entitlement-contract';
 proof:=private.aqari_official_statement(w,lid,'2025-09-01','2025-09-19');if (proof->>'charges')::numeric<>0 then raise exception 'STATEMENT_CHARGED_BEFORE_DUE_DATE';end if;
 proof:=private.aqari_official_statement(w,lid,'2025-09-01','2025-09-20');if (proof->>'charges')::numeric<>33 then raise exception 'STATEMENT_FIRST_DUE_AMOUNT';end if;
 if (private.aqari_vacating_balances(w,lid,'2025-09-19')->>'rent_due_total')::numeric<>0 or (private.aqari_vacating_balances(w,lid,'2025-09-20')->>'rent_due_total')::numeric<>33 then raise exception 'VACATING_ENTITLEMENT_CUTOFF';end if;
 -- No contact is inferred. Existing explicit saved preference enables this fixture only.
 update public.aqari_tenants set profile=profile||'{"preferredContact":"email"}' where workspace_id=w;
 insert into private.aqari_tenant_preferences(workspace_id,tenant_id,preferred_channel,consent_at,updated_by) select w,tenant_id,'email',null,auth.uid() from public.aqari_leases where id=lid;
 perform private.aqari_v267_prepare_reminders(w,'2025-09-19',5);
 if exists(select 1 from public.aqari_notification_outbox where workspace_id=w and period='2025-09-01' and status<>'cancelled') then raise exception 'REMINDER_BEFORE_FIRST_DUE';end if;
 n:=private.aqari_v267_prepare_reminders(w,'2025-09-21',5);
 if n<>1 or not exists(select 1 from public.aqari_notification_outbox where workspace_id=w and lease_id=lid and period='2025-09-01' and channel='email' and status='awaiting_configuration') then raise exception 'FIRST_DUE_REMINDER_WINDOW_MISSING:%',n;end if;
 if private.aqari_v267_prepare_reminders(w,'2025-09-25',5)<>0 then raise exception 'FIRST_DUE_REMINDER_AFTER_GRACE';end if;
 if private.aqari_v267_prepare_reminders(w,'2025-09-28',5)<>1 then raise exception 'NEXT_MONTH_PRE_DUE_REMINDER_CHANGED';end if;
 -- Receipt creation still permits a recorded advance date under the existing policy.
 s:=public.aqari_read_state_v267(w);d:=s->'payload';c:=d#>'{contractsV202,0}';
 row_data:=jsonb_build_array('ENT-RECEIPT-1',c->>'tenant',33,'مدفوع',c->>'property','2025-09-21',c->>'unit','اختبار','2025-09','نقدي');
 r:=jsonb_build_object('receiptNo','ENT-RECEIPT-1','contractId',c->>'id','contractNo',c->>'contract_no','property',c->>'property','unit',c->>'unit','tenant',c->>'tenant','paid',33,'due',33,'period','2025-09','paidAt','2025-09-21','status','مدفوع','method','نقدي','transactionNo','ENT-TX-1','accountant',c->>'accountant');
 receipt:=jsonb_build_object('id','ENT-RECEIPT-1','template','rent-voucher-v267-1','detailsVersion',2,'record',row_data,'contract',c,'accountant',c->>'accountant','transactionNo','ENT-TX-1','rentPeriodBreakdown',private.aqari_rent_period_breakdown(c,'2025-09'));
 d:=d||jsonb_build_object('collections',jsonb_build_array(row_data),'rentLedgerV202',jsonb_build_array(r),'rentReceiptsV267',jsonb_build_array(receipt));
 begin perform public.aqari_save_state_v267(w,jsonb_set(d,'{rentReceiptsV267,0,rentPeriodBreakdown,net}','90'),(s->>'revision')::bigint);raise exception 'INCORRECT_PERIOD_BREAKDOWN_SAVED';exception when raise_exception then if sqlerrm='INCORRECT_PERIOD_BREAKDOWN_SAVED' then raise;end if;end;
 s:=public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 if not exists(select 1 from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.amount=33 and (p.record->>'due')::numeric=33 and p.receipt->'rentPeriodBreakdown'=private.aqari_rent_period_breakdown(c,'2025-09')) then raise exception 'RECEIPT_PROJECTION_AMOUNT';end if;
 if not exists(select 1 from private.aqari_rent_due_periods where workspace_id=w and lease_id=lid and period='2025-09-01' and due_amount=33 and paid_amount=33 and balance=0) then raise exception 'SCHEDULE_PAYMENT_READBACK';end if;
 select p.id,p.receipt into strict saved_payment_id,before_receipt from public.aqari_rent_payments p where p.workspace_id=w and p.lease_id=lid and p.reference='ENT-RECEIPT-1';
 c:=c||jsonb_build_object('rentAdjustments',jsonb_build_array(jsonb_build_object('effectiveMonth',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM'),'discount',20,'rent',80,'reason','تعديل مستقبلي اصطناعي معتمد')),'changeReason','تعديل خصم مستقبلي مع حفظ نسخة الوصل السابقة');
 s:=public.aqari_save_state_v267(w,jsonb_set(s->'payload','{contractsV202,0}',c),(s->>'revision')::bigint);
 perform public.aqari_final_gap_register(w,'cancel_receipt',jsonb_build_object('id','76810000-0000-4000-8000-000000000030','payment_id',saved_payment_id,'reason','إلغاء رسمي اصطناعي بعد تعديل مستقبلي معتمد'));
 if not exists(select 1 from private.aqari_receipt_cancellations x where x.workspace_id=w and x.payment_id=saved_payment_id and length(x.reason)>=3) then raise exception 'ORIGINAL_RECEIPT_CANCELLATION_MISSING';end if;
 if (select p.receipt from public.aqari_rent_payments p where p.id=saved_payment_id) is distinct from before_receipt then raise exception 'ISSUED_RECEIPT_RECOMPUTED_ON_CANCEL';end if;
 if private.aqari_reminder_rent_balance(w,lid,'2025-09-01')<>33 then raise exception 'CANCELLED_FIRST_RECEIPT_BALANCE';end if;
end $$;
select 'PASS: explicit entitlement policies, exact calendar proration, draft staff entry, manager approval, immutable audit, schedule dates, statement/vacating cutoff and receipt breakdown.' as result;
rollback;
