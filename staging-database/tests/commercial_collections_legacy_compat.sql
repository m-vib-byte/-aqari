-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Dual-mode compatibility after the captured hosted allocation migrations.
-- Synthetic isolated PostgreSQL acceptance. No existing workspace is used.
-- Auth/storage metadata fixtures are synthetic; the entire test rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name)values('767a0000-0000-4000-8000-000000000098','commercial-dual-mode-isolated','اختبار تحصيل تجاري معزول');
insert into public.aqari_app_state(workspace_id,payload)values('767a0000-0000-4000-8000-000000000098','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('cc-dual-manager@example.invalid','مدير اختبار المبيعات','general_manager','commercial-dual-mode-isolated'),
 ('cc-dual-accountant@example.invalid','محاسب اختبار المبيعات','accountant','commercial-dual-mode-isolated');
insert into auth.users(id,email,email_confirmed_at) values
 ('767a0000-0000-4000-8000-000000000001','cc-dual-manager@example.invalid',now()),
 ('767a0000-0000-4000-8000-000000000002','cc-dual-accountant@example.invalid',now());
select set_config('aqari.test.sales.workspace',(select workspace_id::text from public.aqari_memberships where user_id='767a0000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','767a0000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('767a0000-0000-4000-8000-000000000099','commercial-dual-foreign-fixture','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('commercial-dual-foreign-manager@example.invalid','مدير مساحة الرفض الاصطناعية','general_manager','commercial-dual-foreign-fixture');
insert into auth.users(id,email,email_confirmed_at)values('767a0000-0000-4000-8000-000000000003','commercial-dual-foreign-manager@example.invalid',now());
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;l uuid;doc uuid;actor uuid:=auth.uid();readiness jsonb;begin
 for n in 1..3 loop
  w:=case n when 3 then '767a0000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.sales.workspace')::uuid end;
  p:=('767a0000-0000-4000-8000-00000000010'||n)::uuid;u:=('767a0000-0000-4000-8000-00000000020'||n)::uuid;
  t:=('767a0000-0000-4000-8000-00000000030'||n)::uuid;l:=('767a0000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'COLLECTIONS-P-'||n,'Synthetic sales property '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,'UNIT-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   if n=3 then perform set_config('request.jwt.claim.sub','767a0000-0000-4000-8000-000000000003',true);end if;
   readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','UNIT-'||n,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار مبيعات اصطناعي','reason','جاهزية اختبار فقط'));
   if readiness->>'unit_id'<>u::text or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_READINESS_RPC_FAILED';end if;
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'COLLECTIONS-T-'||n,'Synthetic tenant '||n,'76780000000'||n,'7655000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'COLLECTIONS-L-'||n,t,u,'COLLECTIONS-L-'||n,'2026-01-15','2026-12-31',100,50,'signed','{}');
  insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
   values(l,w,7.5,'تجارة اصطناعية','LICENSE-TEST',auth.uid(),now(),'مصدر اصطناعي معتمد للاختبار');
  if n<3 then
   doc:=('767a0000-0000-4000-8000-00000000050'||n)::uuid;
   insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
    values(doc,w,'COLLECTIONS-DOC-'||n,'property_document','property','COLLECTIONS-P-'||n,'Synthetic sales report '||n,'test.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
   insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
-- Independent saved collection evidence and verified handover evidence.
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;doc uuid:='767a0000-0000-4000-8000-000000000510';begin
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by,metadata)
 values(doc,w,'CC-HANDOVER','mobile_scan','lease','COLLECTIONS-L-1','محضر تسليم تحصيل تجاري اصطناعي','handover.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid(),'{"document_category":"vacating_inspection","purpose":"vacating_handover"}');
 insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('c',64));
end $$;
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('767a0000-0000-4000-8000-000000000901',current_setting('aqari.test.sales.workspace')::uuid,'767a0000-0000-4000-8000-000000000401','CC-BASE-RENT',900,'2026-09-01','2026-09-03','paid','cash','{}','{}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('767a0000-0000-4000-8000-000000000902',current_setting('aqari.test.sales.workspace')::uuid,'767a0000-0000-4000-8000-000000000402','CC-OTHER-BASE-RENT',900,'2026-09-01','2026-09-03','paid','cash','{}','{}');
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;n integer;req jsonb;r jsonb;begin
 for n in 1..2 loop
  perform public.aqari_final_gap_register(w,'account',jsonb_build_object('id',('767a0000-0000-4000-8000-00000000080'||n)::uuid,'property_id',('767a0000-0000-4000-8000-00000000010'||n)::uuid,'kind','cashbox','name','حساب اختبار توافق '||n,'masked_reference','****1234'));
  perform public.aqari_commercial_sales(w,'record',jsonb_build_object('id',('767a0000-0000-4000-8000-00000000060'||n)::uuid,'lease_id',('767a0000-0000-4000-8000-00000000040'||n)::uuid,'month','2026-08','gross_sales',case n when 1 then '555.555' else '200.000' end,'terms_revision',1,'source_document_id',('767a0000-0000-4000-8000-00000000050'||n)::uuid,'source_reference','تقرير توافق اصطناعي '||n,'calculation_basis','additional_to_base_rent'));
 end loop;
 r:=public.aqari_commercial_payment_allocations(w,'allocate','{"id":"767a0000-0000-4000-8000-000000000651","sale_id":"767a0000-0000-4000-8000-000000000601","payment_id":"767a0000-0000-4000-8000-000000000901","amount":"41.667"}');
 if (r->>'amount')::numeric<>41.667 then raise exception 'COMPAT_LEGACY_ALLOCATION_FAILED';end if;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"767a0000-0000-4000-8000-000000000401"}');
 if r->>'mode'<>'legacy_payment_allocation' or r->>'unavailable_reason'<>'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED' or (r->>'can_manage')::boolean or r->'statement'<>'null'::jsonb or jsonb_array_length(r->'collections')<>0 then raise exception 'COMPAT_LEGACY_MODE_NOT_EXPLICIT';end if;
 req:='{"id":"767a0000-0000-4000-8000-000000000701","lease_id":"767a0000-0000-4000-8000-000000000401","account_id":"767a0000-0000-4000-8000-000000000801","account_revision":1,"method":"cash","occurred_on":"2026-09-03","reference":"COMPAT-COLLECTION-1","source_document_id":"767a0000-0000-4000-8000-000000000501","amount":"41.667","allocations":[{"sale_id":"767a0000-0000-4000-8000-000000000601","amount":"41.667"}]}';
 begin perform public.aqari_commercial_collections(w,'record',req);raise exception 'COMPAT_LEGACY_THEN_INDEPENDENT_DOUBLE_COLLECTED';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED' then raise;end if;end;
 perform set_config('cc.compat.legacy_request',req::text,true);
 r:=public.aqari_commercial_collections(w,'record','{"id":"767a0000-0000-4000-8000-000000000702","lease_id":"767a0000-0000-4000-8000-000000000402","account_id":"767a0000-0000-4000-8000-000000000802","account_revision":1,"method":"cash","occurred_on":"2026-09-03","reference":"COMPAT-COLLECTION-2","source_document_id":"767a0000-0000-4000-8000-000000000502","amount":"15.000","allocations":[{"sale_id":"767a0000-0000-4000-8000-000000000602","amount":"15.000"}]}');
 begin perform public.aqari_commercial_payment_allocations(w,'allocate','{"id":"767a0000-0000-4000-8000-000000000652","sale_id":"767a0000-0000-4000-8000-000000000602","payment_id":"767a0000-0000-4000-8000-000000000902","amount":"15.000"}');raise exception 'COMPAT_INDEPENDENT_THEN_LEGACY_DOUBLE_COLLECTED';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED' then raise;end if;end;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;original jsonb;actual jsonb;before_value jsonb;begin
 original:=private.aqari_legacy_allocation_vacating_balances(w,'767a0000-0000-4000-8000-000000000401','2026-09-03');
 actual:=private.aqari_vacating_balances(w,'767a0000-0000-4000-8000-000000000401','2026-09-03');
 if actual is distinct from original or actual->>'commercial_sales_paid_total'<>'41.667' or actual->>'rent_paid_total'<>'858.333' or actual->>'rent_balance'<>'41.667' then raise exception 'COMPAT_LEGACY_BALANCE_BEHAVIOR_CHANGED:%',actual;end if;
 perform private.aqari_legacy_allocation_clearance(w,'767a0000-0000-4000-8000-000000000401');
 perform private.aqari_require_commercial_clearance(w,'767a0000-0000-4000-8000-000000000401');
 actual:=private.aqari_vacating_balances(w,'767a0000-0000-4000-8000-000000000402','2026-09-03');
 if actual->>'commercial_collection_mode'<>'independent_collection' or actual->>'commercial_sales_paid_total'<>'15.000' or actual->>'commercial_sales_balance'<>'0.000' or actual->>'rent_paid_total'<>'900.000' or actual->>'commercial_allocated_from_payments'<>'0.000' then raise exception 'COMPAT_INDEPENDENT_BALANCE_DOUBLE_COUNTED:%',actual;end if;
 before_value:=private.aqari_vacating_balances(w,'767a0000-0000-4000-8000-000000000402','2026-08-31');
 if before_value->>'commercial_sales_paid_total'<>'0.000' or before_value->>'commercial_sales_balance'<>'15.000' then raise exception 'COMPAT_LATER_RECEIPT_PAID_OLDER_CUTOFF';end if;
 begin perform private.aqari_commercial_balance(w,'767a0000-0000-4000-8000-000000000401','2026-09-03');raise exception 'COMPAT_SEPARATE_REPORT_HID_LEGACY_PAYMENT';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED' then raise;end if;end;
 if (select sum(amount) from public.aqari_rent_payments where workspace_id=w)<>1800 or (select count(*) from private.aqari_commercial_collections where workspace_id=w)<>1 then raise exception 'COMPAT_FAILED_WRITES_LEFT_DUPLICATE_CASH';end if;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;r jsonb;begin
 perform public.aqari_commercial_payment_allocations(w,'reverse','{"id":"767a0000-0000-4000-8000-000000000661","allocation_id":"767a0000-0000-4000-8000-000000000651","occurred_on":"2026-09-04","reason":"عكس تخصيص قائم للاختبار"}');
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.compat.legacy_request')::jsonb);raise exception 'COMPAT_REVERSED_LEGACY_SWITCHED_MODE';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_LEGACY_MODE_REQUIRED' then raise;end if;end;
 perform public.aqari_commercial_collections(w,'reverse','{"id":"767a0000-0000-4000-8000-000000000712","collection_id":"767a0000-0000-4000-8000-000000000702","occurred_on":"2026-09-04","reason":"عكس تحصيل مستقل للاختبار"}');
 begin perform public.aqari_commercial_payment_allocations(w,'allocate','{"id":"767a0000-0000-4000-8000-000000000652","sale_id":"767a0000-0000-4000-8000-000000000602","payment_id":"767a0000-0000-4000-8000-000000000902","amount":"15.000"}');raise exception 'COMPAT_REVERSED_INDEPENDENT_SWITCHED_MODE';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_INDEPENDENT_MODE_REQUIRED' then raise;end if;end;
end $$;
reset role;
-- Do not rewrite old clearance snapshots: only the exact five-key shape can
-- project over newly added zero commercial fields, never debt or unknown keys.
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;old_shape jsonb;new_shape jsonb;begin
 -- Use the lease in the foreign workspace only for negative scope elsewhere;
 -- for this pure comparison use a known zero-sale local lease after reversing
 -- its original charge through the authenticated source path below.
 perform public.aqari_commercial_sales(w,'reverse','{"id":"767a0000-0000-4000-8000-000000000604","sale_id":"767a0000-0000-4000-8000-000000000601","month":"2026-08","occurred_on":"2026-09-04","reason":"تصحيح تقرير اختبار التوافق"}');
 new_shape:=private.aqari_vacating_balances(w,'767a0000-0000-4000-8000-000000000401','2026-09-03');
 old_shape:=new_shape-array['rent_payment_total','commercial_allocated_from_payments','commercial_sales_due_total','commercial_sales_paid_total','commercial_sales_balance','unified_due_balance'];
 if not private.aqari_clearance_balances_compatible(w,'767a0000-0000-4000-8000-000000000401',old_shape,new_shape) then raise exception 'COMPAT_KNOWN_ZERO_SHAPE_REJECTED';end if;
 if private.aqari_clearance_balances_compatible(w,'767a0000-0000-4000-8000-000000000401',old_shape,new_shape||'{"unknown_new_balance":"0.000"}') then raise exception 'COMPAT_UNKNOWN_FIELD_IGNORED';end if;
 if private.aqari_clearance_balances_compatible(w,'767a0000-0000-4000-8000-000000000401',old_shape,new_shape||'{"commercial_sales_due_total":"0.001"}') then raise exception 'COMPAT_NEW_DEBT_IGNORED';end if;
 if private.aqari_clearance_balances_compatible(w,'767a0000-0000-4000-8000-000000000401',old_shape,new_shape||'{"rent_paid_total":"900.001"}') then raise exception 'COMPAT_OLD_BALANCE_CHANGED';end if;
end $$;
set constraints all immediate;
rollback;
select 'PASS: captured legacy allocation guard/balance preserved; independent receipts never reduce rent; modes cannot mix in either order even after reversal; old cutoff stays unpaid; exact old clearance shape accepts only verified zero additions';
