-- Synthetic in-memory PostgreSQL acceptance only. Every fixture rolls back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
values('commercial-allocation-manager@example.invalid','مدير اختبار تخصيص المبيعات','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at)
values('76610000-0000-4000-8000-000000000001','commercial-allocation-manager@example.invalid',now());
select set_config('aqari.test.commercial.allocation.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76610000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76610000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2","email":"commercial-allocation-manager@example.invalid"}',true);

do $$declare w uuid:=current_setting('aqari.test.commercial.allocation.workspace')::uuid; readiness jsonb; doc uuid:='76610000-0000-4000-8000-000000000501';begin
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 values('76610000-0000-4000-8000-000000000101',w,'COMMERCIAL-ALLOC-P-1','Synthetic allocation property','{}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 values('76610000-0000-4000-8000-000000000201',w,'76610000-0000-4000-8000-000000000101','ALLOC-1');
 if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
  readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id','76610000-0000-4000-8000-000000000211','property_id','76610000-0000-4000-8000-000000000101','unit_no','ALLOC-1','expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','Synthetic commercial allocation fixture','reason','Unit ready for isolated payment allocation test'));
  if readiness->>'unit_id'<>'76610000-0000-4000-8000-000000000201' or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_ALLOCATION_READINESS_FAILED';end if;
 end if;
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)
 values('76610000-0000-4000-8000-000000000301',w,'COMMERCIAL-ALLOC-T-1','Synthetic allocation tenant','766100000001','76610001','{}');
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values('76610000-0000-4000-8000-000000000401',w,'COMMERCIAL-ALLOC-L-1','76610000-0000-4000-8000-000000000301','76610000-0000-4000-8000-000000000201','COMMERCIAL-ALLOC-L-1','2026-01-01','2026-12-31',100,50,'signed','{}');
 insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
 values('76610000-0000-4000-8000-000000000401',w,7.5,'تجارة اصطناعية','ALLOC-LICENSE',auth.uid(),now(),'Synthetic compliance evidence');
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
 values(doc,w,'COMMERCIAL-ALLOC-DOC','property_document','property','COMMERCIAL-ALLOC-P-1','Synthetic sales source','sales.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
end $$;

insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
values
 ('76610000-0000-4000-8000-000000000901',current_setting('aqari.test.commercial.allocation.workspace')::uuid,'76610000-0000-4000-8000-000000000401','COMMERCIAL-ALLOC-PAY-1',100,'2026-08-01','2026-08-31','paid','cash','{}','{}'),
 ('76610000-0000-4000-8000-000000000902',current_setting('aqari.test.commercial.allocation.workspace')::uuid,'76610000-0000-4000-8000-000000000401','COMMERCIAL-ALLOC-PAY-2',100,'2026-07-01','2026-07-31','paid','cash','{}','{}');

set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.commercial.allocation.workspace')::uuid;reply jsonb;statement jsonb;detail text;row_data private.aqari_rent_due_periods;begin
 -- 400 * 7.5% = 30.000; second charge 2000 * 7.5% = 150.000.
 perform public.aqari_commercial_sales(w,'record',jsonb_build_object(
  'id','76610000-0000-4000-8000-000000000601','lease_id','76610000-0000-4000-8000-000000000401','month','2026-08','gross_sales','400.000','terms_revision',1,
  'source_document_id','76610000-0000-4000-8000-000000000501','source_reference','Synthetic August sales','calculation_basis','additional_to_base_rent'));
 perform public.aqari_commercial_sales(w,'record',jsonb_build_object(
  'id','76610000-0000-4000-8000-000000000602','lease_id','76610000-0000-4000-8000-000000000401','month','2026-07','gross_sales','2000.000','terms_revision',1,
  'source_document_id','76610000-0000-4000-8000-000000000501','source_reference','Synthetic July sales','calculation_basis','additional_to_base_rent'));
 reply:=public.aqari_commercial_payment_allocations(w,'allocate',jsonb_build_object(
  'id','76610000-0000-4000-8000-000000000701','sale_id','76610000-0000-4000-8000-000000000601','payment_id','76610000-0000-4000-8000-000000000901','amount','30.000'));
 if reply->>'amount'<>'30.000' or reply->>'payment_id'<>'76610000-0000-4000-8000-000000000901' then raise exception 'COMMERCIAL_ALLOCATION_SAVE_FAILED';end if;
 select * into row_data from private.aqari_rent_due_periods where workspace_id=w and lease_id='76610000-0000-4000-8000-000000000401' and period='2026-08-01';
 if row_data.paid_amount<>70.000 then raise exception 'COMMERCIAL_PAYMENT_DOUBLE_COUNTED_AS_RENT: %',row_data.paid_amount;end if;
 statement:=public.aqari_commercial_statement(w,'76610000-0000-4000-8000-000000000401','2026-08-01','2026-08-31');
 if statement->>'commercial_due_total'<>'30.000' or statement->>'commercial_paid_total'<>'30.000' or statement->>'commercial_balance'<>'0.000' then raise exception 'COMMERCIAL_STATEMENT_ALLOCATION_FAILED: %',statement;end if;
 begin
  perform public.aqari_commercial_payment_allocations(w,'allocate',jsonb_build_object(
   'id','76610000-0000-4000-8000-000000000702','sale_id','76610000-0000-4000-8000-000000000602','payment_id','76610000-0000-4000-8000-000000000901','amount','80.000'));
  raise exception 'COMMERCIAL_PAYMENT_OVERALLOCATION_ALLOWED';
 exception when check_violation then if sqlerrm<>'COMMERCIAL_PAYMENT_OVERALLOCATED' then raise;end if;end;
 begin
  perform public.aqari_commercial_sales(w,'reverse',jsonb_build_object(
   'id','76610000-0000-4000-8000-000000000801','sale_id','76610000-0000-4000-8000-000000000601','month','2026-08','occurred_on','2026-09-01','reason','Synthetic reversal must wait for allocation reversal'));
  raise exception 'COMMERCIAL_SALE_REVERSED_WITH_ACTIVE_ALLOCATION';
 exception when check_violation then get stacked diagnostics detail=pg_exception_detail;if detail<>'COMMERCIAL_SALES_ALLOCATION_REVERSAL_REQUIRED' then raise;end if;end;
 reply:=public.aqari_commercial_payment_allocations(w,'reverse',jsonb_build_object(
  'id','76610000-0000-4000-8000-000000000711','allocation_id','76610000-0000-4000-8000-000000000701','occurred_on','2026-09-01','reason','Synthetic immutable allocation correction'));
 if reply->>'allocation_id'<>'76610000-0000-4000-8000-000000000701' then raise exception 'COMMERCIAL_ALLOCATION_REVERSAL_FAILED';end if;
 select * into row_data from private.aqari_rent_due_periods where workspace_id=w and lease_id='76610000-0000-4000-8000-000000000401' and period='2026-08-01';
 if row_data.paid_amount<>100.000 then raise exception 'REVERSED_ALLOCATION_NOT_RETURNED_TO_RENT: %',row_data.paid_amount;end if;
end $$;
reset role;

-- Allocate again, then prove receipt cancellation removes both rent and commercial value.
set local role authenticated;
select public.aqari_commercial_payment_allocations(current_setting('aqari.test.commercial.allocation.workspace')::uuid,'allocate',jsonb_build_object(
 'id','76610000-0000-4000-8000-000000000703','sale_id','76610000-0000-4000-8000-000000000601','payment_id','76610000-0000-4000-8000-000000000901','amount','30.000'));
reset role;
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,snapshot)
values('76610000-0000-4000-8000-000000000911',current_setting('aqari.test.commercial.allocation.workspace')::uuid,'76610000-0000-4000-8000-000000000901','Synthetic receipt cancellation invalidates allocation','76610000-0000-4000-8000-000000000001','Synthetic manager','{}');

do $$declare w uuid:=current_setting('aqari.test.commercial.allocation.workspace')::uuid;row_data private.aqari_rent_due_periods;statement jsonb;detail text;begin
 select * into row_data from private.aqari_rent_due_periods where workspace_id=w and lease_id='76610000-0000-4000-8000-000000000401' and period='2026-08-01';
 if row_data.paid_amount<>0.000 then raise exception 'CANCELLED_PAYMENT_STILL_COUNTS_AS_RENT: %',row_data.paid_amount;end if;
 statement:=private.aqari_commercial_statement_data(w,'76610000-0000-4000-8000-000000000401','2026-08-01','2026-08-31');
 if statement->>'commercial_paid_total'<>'0.000' or statement->>'commercial_balance'<>'30.000' then raise exception 'CANCELLED_PAYMENT_STILL_COUNTS_AS_COMMERCIAL: %',statement;end if;
 if exists(select 1 from private.aqari_commercial_active_allocations where workspace_id=w and allocation_id='76610000-0000-4000-8000-000000000703') then raise exception 'CANCELLED_PAYMENT_ALLOCATION_STILL_ACTIVE';end if;
 begin perform private.aqari_require_commercial_clearance(w,'76610000-0000-4000-8000-000000000401');raise exception 'CANCELLED_PAYMENT_ALLOWED_CLEARANCE';
 exception when check_violation then get stacked diagnostics detail=pg_exception_detail;if detail<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;end;
end $$;

rollback;
select 'PASS: commercial payment allocation is append-only, bounded by the payment, excluded from rent, reversible in order, and cancelled receipts reopen both rent and commercial balances';
