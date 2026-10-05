-- Current payment/workspace fixtures; original assertions preserved.
-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Synthetic isolated PostgreSQL acceptance. No existing workspace is used.
-- Auth/storage metadata fixtures are synthetic; the entire test rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name)values('76790000-0000-4000-8000-000000000098','commercial-collections-isolated','اختبار تحصيل تجاري معزول');
insert into public.aqari_app_state(workspace_id,payload)values('76790000-0000-4000-8000-000000000098','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('cc-manager@example.invalid','مدير اختبار المبيعات','general_manager','commercial-collections-isolated'),
 ('cc-accountant@example.invalid','محاسب اختبار المبيعات','accountant','commercial-collections-isolated');
insert into auth.users(id,email,email_confirmed_at) values
 ('76790000-0000-4000-8000-000000000001','cc-manager@example.invalid',now()),
 ('76790000-0000-4000-8000-000000000002','cc-accountant@example.invalid',now());
select set_config('aqari.test.sales.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76790000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76790000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('76790000-0000-4000-8000-000000000099','commercial-collections-foreign-fixture','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('commercial-collections-foreign-manager@example.invalid','مدير مساحة الرفض الاصطناعية','general_manager','commercial-collections-foreign-fixture');
insert into auth.users(id,email,email_confirmed_at)values('76790000-0000-4000-8000-000000000003','commercial-collections-foreign-manager@example.invalid',now());
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;l uuid;doc uuid;actor uuid:=auth.uid();readiness jsonb;begin
 for n in 1..3 loop
  w:=case n when 3 then '76790000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.sales.workspace')::uuid end;
  p:=('76790000-0000-4000-8000-00000000010'||n)::uuid;u:=('76790000-0000-4000-8000-00000000020'||n)::uuid;
  t:=('76790000-0000-4000-8000-00000000030'||n)::uuid;l:=('76790000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_app_state(workspace_id,payload) values(w,'{}') on conflict(workspace_id) do nothing;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'COLLECTIONS-P-'||n,'Synthetic sales property '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,'UNIT-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   if n=3 then perform set_config('request.jwt.claim.sub','76790000-0000-4000-8000-000000000003',true);end if;
   readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','UNIT-'||n,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار مبيعات اصطناعي','reason','جاهزية اختبار فقط'));
   if readiness->>'unit_id'<>u::text or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_READINESS_RPC_FAILED';end if;
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'COLLECTIONS-T-'||n,'Synthetic tenant '||n,'76790000000'||n,'7655000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'COLLECTIONS-L-'||n,t,u,'COLLECTIONS-L-'||n,'2026-01-15','2026-12-31',100,50,'signed','{}');
  insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
   values(l,w,7.5,'تجارة اصطناعية','LICENSE-TEST',auth.uid(),now(),'مصدر اصطناعي معتمد للاختبار');
  if n<3 then
   doc:=('76790000-0000-4000-8000-00000000050'||n)::uuid;
   insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
    values(doc,w,'COLLECTIONS-DOC-'||n,'property_document','property','COLLECTIONS-P-'||n,'Synthetic sales report '||n,'test.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
   insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
-- Independent saved collection evidence and verified handover evidence.
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;doc uuid:='76790000-0000-4000-8000-000000000510';begin
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by,metadata)
 values(doc,w,'CC-HANDOVER','mobile_scan','lease','COLLECTIONS-L-1','محضر تسليم تحصيل تجاري اصطناعي','handover.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid(),'{"document_category":"vacating_inspection","purpose":"vacating_handover"}');
 insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('c',64));
end $$;
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values
('76790000-0000-4000-8000-000000000901',current_setting('aqari.test.sales.workspace')::uuid,'76790000-0000-4000-8000-000000000401','CC-BASE-RENT',900,'2026-09-01','2026-09-03','paid','cash',('{}')::jsonb||jsonb_build_object('transactionNo',('CC-BASE-RENT'),'method',('cash'),'paymentProvider',case when ('cash') in ('cash','نقدي') then '' when ('cash') in ('KNET','knet','كي نت') then 'KNET' else 'Synthetic Bank' end),('{}')::jsonb||jsonb_build_object('transactionNo',('CC-BASE-RENT'),'record',jsonb_build_array(null,null,null,null,null,null,null,null,null,('cash'))));

-- Transaction-local request fixtures; no temporary function or DDL is needed.
do $$declare base jsonb:='{"lease_id":"76790000-0000-4000-8000-000000000401","account_id":"76790000-0000-4000-8000-000000000801","account_revision":1,"method":"cash","source_document_id":"76790000-0000-4000-8000-000000000501"}';begin
 perform set_config('cc.request.r1',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+1)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(1)::text,'amount','20.000','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','20.000'))))::text,true);
 perform set_config('cc.request.r2',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+1)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(1)::text,'amount','20.000','occurred_on','2026-08-30','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','20.000'))))::text,true);
 perform set_config('cc.request.r3',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+1)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(1)::text,'amount','41.668','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','41.668'))))::text,true);
 perform set_config('cc.request.r4',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+1)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(1)::text,'amount','19.000','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','19.000'))))::text,true);
 perform set_config('cc.request.r5',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+2)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(2)::text,'amount','21.667','occurred_on','2026-09-02','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','21.667'))))::text,true);
 perform set_config('cc.request.r6',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+3)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(3)::text,'amount','0.001','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','0.001'))))::text,true);
 perform set_config('cc.request.r7',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+3)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(3)::text,'amount','21.667','occurred_on','2026-09-02','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','21.667'))))::text,true);
 perform set_config('cc.request.r8',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+3)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(3)::text,'amount','21.667','occurred_on','2026-09-03','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','21.667'))))::text,true);
 perform set_config('cc.request.r9',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+4)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(4)::text,'amount','0.001','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','0.001'))))::text,true);
 perform set_config('cc.request.r10',(base||jsonb_build_object('id',('76790000-0000-4000-8000-'||lpad((700+5)::text,12,'0'))::uuid,'reference','CC-RECEIPT-'||(5)::text,'amount','20.000','occurred_on','2026-09-01','allocations',jsonb_build_array(jsonb_build_object('sale_id','76790000-0000-4000-8000-000000000601','amount','20.000'))))::text,true);
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;n integer;r jsonb;begin
 for n in 1..3 loop
  perform public.aqari_final_gap_register(w,'account',jsonb_build_object('id',('76790000-0000-4000-8000-00000000080'||n)::uuid,'property_id',case n when 3 then '76790000-0000-4000-8000-000000000102' else '76790000-0000-4000-8000-000000000101' end,'kind',case n when 2 then 'bank' else 'cashbox' end,'name','حساب تحصيل اصطناعي '||n,'masked_reference','****1234'));
 end loop;
 perform public.aqari_staff_access(w,'save',jsonb_build_object('user_id','76790000-0000-4000-8000-000000000002','operational_role','accountant','property_ids',jsonb_build_array('76790000-0000-4000-8000-000000000101'),'is_active',true,'revision',0,'reason','نطاق محاسب اختبار التحصيل'));
 perform public.aqari_commercial_sales(w,'record','{"id":"76790000-0000-4000-8000-000000000601","lease_id":"76790000-0000-4000-8000-000000000401","month":"2026-08","gross_sales":"555.555","terms_revision":1,"source_document_id":"76790000-0000-4000-8000-000000000501","source_reference":"تقرير مبيعات اصطناعي","calculation_basis":"additional_to_base_rent"}');
 perform public.aqari_vacating_settlement(w,'save','{"lease_id":"76790000-0000-4000-8000-000000000401","vacate_date":"2026-09-03","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"CC-REVIEW","revision":0}');
 declare detail_value text;begin begin perform public.aqari_vacating_settlement(w,'finalize','{"lease_id":"76790000-0000-4000-8000-000000000401","revision":1}');raise exception 'COMMERCIAL_UNPAID_FINALIZED';exception when check_violation then get stacked diagnostics detail_value=PG_EXCEPTION_DETAIL;if detail_value<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;end;end;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401"}');
 if r#>>'{statement,balance}'<>'41.667' or not(r->>'can_manage')::boolean or jsonb_array_length(r->'accounts')<>2 then raise exception 'CC_INITIAL_BALANCE_OR_ACCOUNT_SCOPE_FAILED:%',r;end if;
 if public.aqari_commercial_collections(w,'get','{"id":"76790000-0000-4000-8000-000000009999"}')->'collection'<>'null'::jsonb then raise exception 'CC_MISSING_READBACK_INVALID';end if;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"amount":"20.0001"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'INVALID_COMMERCIAL_COLLECTION_REQUEST' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"direction":"credit"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'INVALID_COMMERCIAL_COLLECTION_REQUEST' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"amount":"21.000"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_ALLOCATION_TOTAL_MISMATCH' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"account_id":"76790000-0000-4000-8000-000000000803"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"account_id":"76790000-0000-4000-8000-000000000802"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"account_revision":2}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ACCOUNT_CHANGED' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"source_document_id":"76790000-0000-4000-8000-000000000502"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_DOCUMENT_UNVERIFIED' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb||'{"lease_id":"76790000-0000-4000-8000-000000000403"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r2')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_BEFORE_CHARGE' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r3')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE' then raise;end if;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 r:=public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb);
 if r#>>'{collection,amount}'<>'20.000' or r#>>'{collection,source_checksum}'<>repeat('a',64) or r#>>'{collection,account_snapshot,revision}'<>'1' then raise exception 'CC_SAVED_PROOF_FAILED';end if;
 if public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb) is distinct from r or public.aqari_commercial_collections(w,'get','{"id":"76790000-0000-4000-8000-000000000701"}') is distinct from r then raise exception 'CC_RETRY_OR_GET_MISMATCH';end if;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r4')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_RETRY_CONFLICT' then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401","as_of":"2026-08-31"}');
 if r#>>'{statement,balance}'<>'41.667' or r#>>'{sales,0,outstanding}'<>'41.667' then raise exception 'CC_FUTURE_COLLECTION_COUNTED_EARLY';end if;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401"}');
 if r#>>'{statement,balance}'<>'21.667' or r#>>'{sales,0,outstanding}'<>'21.667' then raise exception 'CC_PARTIAL_BALANCE_FAILED';end if;
 declare detail_value text;begin begin perform public.aqari_vacating_settlement(w,'finalize','{"lease_id":"76790000-0000-4000-8000-000000000401","revision":1}');raise exception 'COMMERCIAL_UNPAID_FINALIZED';exception when check_violation then get stacked diagnostics detail_value=PG_EXCEPTION_DETAIL;if detail_value<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;end;end;
 r:=public.aqari_commercial_collections(w,'record',current_setting('cc.request.r5')::jsonb||'{"account_id":"76790000-0000-4000-8000-000000000802","method":"bank_transfer"}');
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401"}');
 if r#>>'{statement,balance}'<>'0.000' or r#>>'{statement,collected_total}'<>'41.667' then raise exception 'CC_FULL_SETTLEMENT_DOUBLE_COUNTED:%',r->'statement';end if;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r6')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_ALLOCATION_EXCEEDS_BALANCE' then raise;end if;end;
 begin perform public.aqari_commercial_sales(w,'reverse','{"id":"76790000-0000-4000-8000-000000000690","sale_id":"76790000-0000-4000-8000-000000000601","month":"2026-08","occurred_on":"2026-09-03","reason":"محاولة عكس استحقاق له قبض"}');raise exception 'COLLECTED_SALE_REVERSED';exception when check_violation then if sqlerrm<>'COMMERCIAL_SALE_HAS_COLLECTION' then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000711","collection_id":"76790000-0000-4000-8000-000000000702","occurred_on":"2026-09-03","reason":"تصحيح تسجيل قبض اصطناعي"}');
 if r#>>'{reversal,amount}'<>'21.667' then raise exception 'CC_REVERSAL_NOT_ORIGINAL_AMOUNT';end if;
 if public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000711","collection_id":"76790000-0000-4000-8000-000000000702","occurred_on":"2026-09-03","reason":"تصحيح تسجيل قبض اصطناعي"}') is distinct from r then raise exception 'CC_REVERSAL_RETRY_MISMATCH';end if;
 begin perform public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000712","collection_id":"76790000-0000-4000-8000-000000000702","occurred_on":"2026-09-03","reason":"تصحيح تسجيل قبض اصطناعي"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ALREADY_REVERSED' then raise;end if;end;
 declare detail_value text;begin begin perform public.aqari_vacating_settlement(w,'finalize','{"lease_id":"76790000-0000-4000-8000-000000000401","revision":1}');raise exception 'COMMERCIAL_UNPAID_FINALIZED';exception when check_violation then get stacked diagnostics detail_value=PG_EXCEPTION_DETAIL;if detail_value<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;end;end;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401","as_of":"2026-09-02"}');
 if r#>>'{statement,balance}'<>'0.000' or r#>>'{sales,0,outstanding}'<>'0.000' or r#>'{collections,0,reversal}'<>'null'::jsonb then raise exception 'CC_LATER_REVERSAL_CHANGED_PRIOR_BALANCE';end if;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r7')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_LEDGER_MISMATCH' then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'record',current_setting('cc.request.r8')::jsonb);
 perform public.aqari_collection_account_manage(w,'edit','{"id":"76790000-0000-4000-8000-000000000801","operation_id":"76790000-0000-4000-8000-000000000821","revision":1,"name":"اسم صندوق جديد","masked_reference":"****4321","reason":"تحديث وصف الحساب الاصطناعي"}');
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r9')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ACCOUNT_CHANGED' then raise;end if;end;
 perform public.aqari_collection_account_manage(w,'archive','{"id":"76790000-0000-4000-8000-000000000801","operation_id":"76790000-0000-4000-8000-000000000822","revision":2,"reason":"أرشفة صندوق اصطناعي"}');
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r9')::jsonb||'{"account_revision":3}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_ACCOUNT_MISMATCH' then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb);
 if r#>>'{collection,account_snapshot,name}'<>'حساب تحصيل اصطناعي 1' then raise exception 'CC_ACCOUNT_SNAPSHOT_REWRITTEN';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;begin
 if (select sum(amount) from public.aqari_rent_payments where workspace_id=w)<>900
  or (select count(*) from private.aqari_collection_postings where workspace_id=w)<>0
  or (select sum(amount) from private.aqari_tenant_adjustments where workspace_id=w)<>41.667 then raise exception 'CC_RENT_OR_ADJUSTMENTS_DOUBLE_POSTED';end if;
 if (select count(*) from private.aqari_commercial_collections where workspace_id=w)<>3 or (select count(*) from private.aqari_commercial_collection_reversals where workspace_id=w)<>1 then raise exception 'CC_RETRIES_OR_DENIALS_LEFT_ROWS';end if;
 begin update private.aqari_commercial_collections set amount=1 where workspace_id=w;raise exception 'CC_MUTABLE_RECEIPT';exception when check_violation then null;end;
 begin delete from private.aqari_commercial_collection_allocations where workspace_id=w;raise exception 'CC_MUTABLE_ALLOCATION';exception when check_violation then null;end;
end $$;
-- The accountant sees only the assigned lease; another property cannot leak.
select set_config('request.jwt.claim.sub','76790000-0000-4000-8000-000000000002',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;r jsonb;begin
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000401"}');
 if (r->>'can_manage')::boolean or r#>>'{statement,balance}'<>'0.000' then raise exception 'CC_ACCOUNTANT_SCOPE_OR_ROLE_FAILED';end if;
 begin perform public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000402"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.request.r10')::jsonb);raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform 1 from private.aqari_commercial_collections;raise exception 'CC_PRIVATE_READ_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform private.aqari_commercial_balance(w,'76790000-0000-4000-8000-000000000401','2026-09-03');raise exception 'CC_DIRECT_HELPER_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','76790000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;r jsonb;rev bigint;begin
 -- Repointing the draft to an older cutoff cannot turn a later receipt into
 -- historical payment, even when the current commercial balance is zero.
 r:=public.aqari_vacating_settlement(w,'save','{"lease_id":"76790000-0000-4000-8000-000000000401","vacate_date":"2026-08-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"CC-REVIEW","revision":1}');
 begin perform public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','76790000-0000-4000-8000-000000000401','revision',(r#>>'{settlement,revision}')::bigint));raise exception 'CC_LATER_RECEIPT_PAID_OLDER_CLEARANCE';exception when check_violation then if sqlerrm<>'COMMERCIAL_COLLECTION_CUTOFF_REVIEW_REQUIRED' then raise;end if;end;
 r:=public.aqari_vacating_settlement(w,'save',jsonb_build_object('lease_id','76790000-0000-4000-8000-000000000401','vacate_date','2026-09-03','keys_returned',true,'inspection_completed',true,'meters_recorded',true,'damage_amount','0.000','damage_notes','','charges_resolved',true,'charges_reference','CC-REVIEW','revision',(r#>>'{settlement,revision}')::bigint));
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','76790000-0000-4000-8000-000000000401','revision',(r#>>'{settlement,revision}')::bigint));
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id','76790000-0000-4000-8000-000000000401','revision',(r#>>'{settlement,revision}')::bigint,'exception_reason',''));
 rev:=(r#>>'{settlement,revision}')::bigint;
 begin perform public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000712","collection_id":"76790000-0000-4000-8000-000000000701","occurred_on":"2026-09-04","reason":"لا يجوز فتح دين بعد البراءة"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_AFTER_CLEARANCE' then raise;end if;end;
 r:=public.aqari_vacating_release(w,'76790000-0000-4000-8000-000000000401',rev);
 if r#>>'{settlement,status}'<>'released' then raise exception 'CC_ACTUAL_RELEASE_AFTER_COLLECTION_FAILED';end if;
 begin perform public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000712","collection_id":"76790000-0000-4000-8000-000000000701","occurred_on":"2026-09-04","reason":"لا يجوز فتح دين بعد الإفراج"}');raise exception 'UNEXPECTED_COLLECTION_SUCCESS';exception when others then if sqlerrm<>'COMMERCIAL_COLLECTION_AFTER_CLEARANCE' then raise;end if;end;
 if public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb)#>>'{collection,id}'<>'76790000-0000-4000-8000-000000000701' then raise exception 'CC_RELEASED_RETRY_FAILED';end if;
end $$;
reset role;
-- One verified receipt can allocate across several charges of the SAME lease.
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;req jsonb;r jsonb;begin
 perform public.aqari_commercial_sales(w,'record','{"id":"76790000-0000-4000-8000-000000000602","lease_id":"76790000-0000-4000-8000-000000000402","month":"2026-07","gross_sales":"200.000","terms_revision":1,"source_document_id":"76790000-0000-4000-8000-000000000502","source_reference":"مبيعات يوليو اصطناعية","calculation_basis":"additional_to_base_rent"}');
 perform public.aqari_commercial_sales(w,'record','{"id":"76790000-0000-4000-8000-000000000603","lease_id":"76790000-0000-4000-8000-000000000402","month":"2026-08","gross_sales":"400.000","terms_revision":1,"source_document_id":"76790000-0000-4000-8000-000000000502","source_reference":"مبيعات أغسطس اصطناعية","calculation_basis":"additional_to_base_rent"}');
 req:='{"id":"76790000-0000-4000-8000-000000000720","lease_id":"76790000-0000-4000-8000-000000000402","account_id":"76790000-0000-4000-8000-000000000803","account_revision":1,"method":"cash","occurred_on":"2026-09-01","reference":"CC-MULTI-RECEIPT","source_document_id":"76790000-0000-4000-8000-000000000502","amount":"45.000","allocations":[{"sale_id":"76790000-0000-4000-8000-000000000602","amount":"15.000"},{"sale_id":"76790000-0000-4000-8000-000000000603","amount":"30.000"}]}';
 begin perform public.aqari_commercial_collections(w,'record',jsonb_set(req,'{allocations,0,sale_id}','"76790000-0000-4000-8000-000000000601"'));raise exception 'CC_CROSS_LEASE_ALLOCATION_ACCEPTED';exception when check_violation then if sqlerrm<>'COMMERCIAL_ALLOCATION_SOURCE_INVALID' then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'record',jsonb_set(req,'{allocations,0,sale_id}','"76790000-0000-4000-8000-000000000603"'));raise exception 'CC_DUPLICATE_ALLOCATION_ACCEPTED';exception when check_violation then if sqlerrm<>'COMMERCIAL_ALLOCATION_TOTAL_MISMATCH' then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'record',req);
 if jsonb_array_length(r->'allocations')<>2 then raise exception 'CC_MULTI_ALLOCATION_MISSING';end if;
 if public.aqari_commercial_collections(w,'record',jsonb_set(req,'{allocations}','[{"sale_id":"76790000-0000-4000-8000-000000000603","amount":"30"},{"sale_id":"76790000-0000-4000-8000-000000000602","amount":"15.0"}]')) is distinct from r then raise exception 'CC_ALLOCATION_ORDER_RETRY_CONFLICT';end if;
 r:=public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000721","collection_id":"76790000-0000-4000-8000-000000000720","occurred_on":"2026-09-02","reason":"تصحيح تسجيل التحصيل المتعدد"}');
 if r#>>'{reversal,amount}'<>'45.000' then raise exception 'CC_MULTI_REVERSAL_AMOUNT_FAILED';end if;
 perform public.aqari_commercial_sales(w,'reverse','{"id":"76790000-0000-4000-8000-000000000604","sale_id":"76790000-0000-4000-8000-000000000602","month":"2026-07","occurred_on":"2026-09-02","reason":"تصحيح استحقاق يوليو بعد عكس القبض"}');
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000402","as_of":"2026-09-01"}');
 if r#>>'{statement,balance}'<>'0.000' or (r#>>'{sales,0,reversed}')::boolean or r#>>'{sales,0,outstanding}'<>'0.000' then raise exception 'CC_SALES_REVERSAL_LEAKED_INTO_PAST';end if;
 r:=public.aqari_commercial_collections(w,'list','{"lease_id":"76790000-0000-4000-8000-000000000402","as_of":"2026-09-02"}');
 if r#>>'{statement,balance}'<>'30.000' or not(r#>>'{sales,0,reversed}')::boolean or r#>>'{sales,0,outstanding}'<>'0.000' or r#>>'{sales,1,outstanding}'<>'30.000' then raise exception 'CC_SALE_AND_COLLECTION_REVERSALS_DOUBLE_COUNTED:%',r;end if;
 begin perform public.aqari_commercial_collections(w,'record',req||'{"id":"76790000-0000-4000-8000-000000000722","reference":"CC-REVERSED-SOURCE","occurred_on":"2026-09-03"}');raise exception 'CC_REVERSED_SOURCE_RECOLLECTED';exception when check_violation then if sqlerrm<>'COMMERCIAL_ALLOCATION_SOURCE_INVALID' then raise;end if;end;
 perform set_config('cc.multi.next',(req||'{"id":"76790000-0000-4000-8000-000000000722","reference":"CC-REMAINING-SOURCE","occurred_on":"2026-09-03","amount":"30.000","allocations":[{"sale_id":"76790000-0000-4000-8000-000000000603","amount":"30.000"}]}')::text,true);
end $$;
reset role;
-- Closing prevents a fresh receipt/reversal in the closed period, while a lost
-- response to an already saved request is still safely recoverable.
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)
 values(current_setting('aqari.test.sales.workspace')::uuid,'2026-09-01',auth.uid(),'مدير اختبار التحصيل','إقفال فترة اختبار التحصيل','{"synthetic":true}');
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;r jsonb;begin
 begin perform public.aqari_commercial_collections(w,'record',current_setting('cc.multi.next')::jsonb);raise exception 'CC_CLOSED_PERIOD_COLLECTION_ALLOWED';exception when others then if position('الفترة المالية مقفلة' in sqlerrm)=0 then raise;end if;end;
 begin perform public.aqari_commercial_collections(w,'reverse','{"id":"76790000-0000-4000-8000-000000000723","collection_id":"76790000-0000-4000-8000-000000000703","occurred_on":"2026-09-04","reason":"عكس في فترة مقفلة مرفوض"}');raise exception 'CC_CLOSED_PERIOD_REVERSAL_ALLOWED';exception when others then if position('الفترة المالية مقفلة' in sqlerrm)=0 then raise;end if;end;
 r:=public.aqari_commercial_collections(w,'record',current_setting('cc.request.r1')::jsonb);
 if r#>>'{collection,id}'<>'76790000-0000-4000-8000-000000000701' then raise exception 'CC_CLOSED_PERIOD_RETRY_FAILED';end if;
end $$;
reset role;
-- A fabricated generic credit cannot pay a commercial allocation, and invalid
-- source links cannot make the independent commercial statement look correct.
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;r jsonb;begin
 begin
  insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
   values('76790000-0000-4000-8000-000000000951',w,'76790000-0000-4000-8000-000000000402','manual_correction','credit',30,'2026-08-31','test_generic_credit','76790000-0000-4000-8000-000000000950','اختبار لا يمثل قبض المبيعات',auth.uid());
  r:=private.aqari_commercial_balance(w,'76790000-0000-4000-8000-000000000402','2026-09-03');
  if r->>'balance'<>'30.000' then raise exception 'CC_GENERIC_CREDIT_CLOSED_COMMERCIAL_DEBT';end if;
  raise exception 'ROLLBACK_GENERIC_CREDIT_FIXTURE';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_GENERIC_CREDIT_FIXTURE' then raise;end if;end;
 begin
  insert into private.aqari_tenant_adjustments(id,workspace_id,lease_id,kind,direction,amount,occurred_on,source_type,source_id,reason,actor_id)
   values('76790000-0000-4000-8000-000000000952',w,'76790000-0000-4000-8000-000000000402','commercial_sales','credit',30,'2026-08-31','commercial_sales_reversal','76790000-0000-4000-8000-000000000999','مصدر عكس اصطناعي غير موجود',auth.uid());
  perform private.aqari_commercial_balance(w,'76790000-0000-4000-8000-000000000402','2026-09-03');raise exception 'CC_FALSE_SOURCE_STATEMENT_ACCEPTED';
 exception when check_violation then null;end;
end $$;
-- Deferred table integrity constraints also run before the rollback, proving
-- the successful records are complete independently of RPC return values.
set constraints all immediate;
set local role anon;
do $$begin begin perform public.aqari_commercial_collections('76790000-0000-4000-8000-000000000098','list','{}');raise exception 'CC_ANON_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: independent commercial receipts and allocations, exact partial/full balances, as-of reversals, no rent double count, scope/MFA/ACL, account and document proof, immutable retry/history, valid actual release and no debt reopened after clearance';
