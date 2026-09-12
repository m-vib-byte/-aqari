-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/commercial_sales.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000006 / hosted-completion-commercial-sales
-- Run this entire file as one query; never extract setup statements.
-- Synthetic in-memory PostgreSQL acceptance only. Every fixture rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000006',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000006','hosted-completion-commercial-sales','Synthetic rollback acceptance: commercial_sales');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000006','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('commercial-manager@example.invalid','مدير اختبار المبيعات','general_manager','hosted-completion-commercial-sales'),
 ('commercial-accountant@example.invalid','محاسب اختبار المبيعات','accountant','hosted-completion-commercial-sales');
insert into auth.users(id,email,email_confirmed_at) values
 ('76550000-0000-4000-8000-000000000001','commercial-manager@example.invalid',now()),
 ('76550000-0000-4000-8000-000000000002','commercial-accountant@example.invalid',now());
select set_config('aqari.test.sales.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76550000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76550000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
insert into public.aqari_workspaces(id,slug,name) values('76550000-0000-4000-8000-000000000099','commercial-foreign-fixture','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('commercial-foreign-manager@example.invalid','مدير مساحة الرفض الاصطناعية','general_manager','commercial-foreign-fixture');
insert into auth.users(id,email,email_confirmed_at)values('76550000-0000-4000-8000-000000000003','commercial-foreign-manager@example.invalid',now());
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;l uuid;doc uuid;actor uuid:=auth.uid();readiness jsonb;begin
 for n in 1..3 loop
  w:=case n when 3 then '76550000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.sales.workspace')::uuid end;
  p:=('76550000-0000-4000-8000-00000000010'||n)::uuid;u:=('76550000-0000-4000-8000-00000000020'||n)::uuid;
  t:=('76550000-0000-4000-8000-00000000030'||n)::uuid;l:=('76550000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'SALES-P-'||n,'Synthetic sales property '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,'UNIT-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   if n=3 then perform set_config('request.jwt.claim.sub','76550000-0000-4000-8000-000000000003',true);end if;
   readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','UNIT-'||n,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار مبيعات اصطناعي','reason','جاهزية اختبار فقط'));
   if readiness->>'unit_id'<>u::text or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_READINESS_RPC_FAILED';end if;
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'SALES-T-'||n,'Synthetic tenant '||n,'76550000000'||n,'7655000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'SALES-L-'||n,t,u,'SALES-L-'||n,'2026-01-15','2026-12-31',100,50,'signed','{}');
  insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
   values(l,w,7.5,'تجارة اصطناعية','LICENSE-TEST',auth.uid(),now(),'مصدر اصطناعي معتمد للاختبار');
  if n<3 then
   doc:=('76550000-0000-4000-8000-00000000050'||n)::uuid;
   insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
    values(doc,w,'SALES-DOC-'||n,'property_document','property','SALES-P-'||n,'Synthetic sales report '||n,'test.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
   insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;

set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;req jsonb:=(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(1))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent'));r jsonb;begin
 r:=public.aqari_commercial_sales(w,'list','{"month":"2026-08"}');
 if jsonb_array_length(r->'leases')<>2 or jsonb_array_length(r->'documents')<>2 or jsonb_array_length(r->'entries')<>0 then raise exception 'SALES_INITIAL_SCOPE_FAILED: %',r;end if;
 begin perform public.aqari_commercial_sales(w,null,req);raise exception 'NULL_ACTION_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"amount":1}');raise exception 'CLIENT_AMOUNT_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"gross_sales":"1.0001"}');raise exception 'EXCESS_PRECISION_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"calculation_basis":"replace_base"}');raise exception 'UNAPPROVED_BASIS_ALLOWED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"source_document_id":"76550000-0000-4000-8000-000000000502"}');raise exception 'OTHER_PROPERTY_DOCUMENT_ALLOWED';exception when check_violation then if sqlerrm<>'SALES_SOURCE_DOCUMENT_UNVERIFIED' then raise;end if;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"month":"2099-01"}');raise exception 'FUTURE_SALES_ALLOWED';exception when check_violation then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"month":"2025-12"}');raise exception 'PRE_LEASE_SALES_ALLOWED';exception when check_violation then null;end;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"lease_id":"76550000-0000-4000-8000-000000000403"}');raise exception 'OTHER_WORKSPACE_LEASE_ALLOWED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_commercial_sales('76550000-0000-4000-8000-000000000099','list','{"month":"2026-08"}');raise exception 'OTHER_WORKSPACE_ALLOWED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_commercial_sales(w,'record',req);raise exception 'MFA_BYPASS';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
 perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
 r:=public.aqari_commercial_sales(w,'record',req);
 if (r->>'amount')::numeric<>41.667 or r->>'period_end'<>'2026-08-31' or r->>'source_checksum'<>repeat('a',64) then raise exception 'SALES_EXACT_CALCULATION_FAILED: %',r;end if;
 if public.aqari_commercial_sales(w,'record',req) is distinct from r then raise exception 'SALES_IDEMPOTENCY_FAILED';end if;
 r:=public.aqari_commercial_sales(w,'list','{"month":"2026-08"}');
 if jsonb_array_length(r->'entries')<>1 or (r#>>'{entries,0,amount}')::numeric<>41.667 then raise exception 'SALES_READBACK_FAILED';end if;
 begin perform public.aqari_commercial_sales(w,'record',req||'{"gross_sales":"1.000"}');raise exception 'REUSED_ID_CHANGE_ALLOWED';exception when unique_violation then if sqlerrm<>'SALES_RETRY_CONFLICT' then raise;end if;end;
 begin perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(2))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')));raise exception 'DUPLICATE_MONTH_ALLOWED';exception when unique_violation then if sqlerrm<>'SALES_MONTH_ALREADY_POSTED' then raise;end if;end;
 r:=public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(3))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-01'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent'))||'{"gross_sales":"0.000"}');
 if (r->>'amount')::numeric<>0 or r->>'period_start'<>'2026-01-15' then raise exception 'ZERO_SALES_OR_PARTIAL_MONTH_FAILED';end if;
 begin perform 1 from private.aqari_commercial_sales;raise exception 'DIRECT_SALES_READ_ALLOWED';exception when insufficient_privilege then null;end;
 begin update private.aqari_commercial_sales set amount=1 where workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'DIRECT_SALES_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
 begin delete from private.aqari_commercial_sales_reversals  where workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'DIRECT_REVERSAL_DELETE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;begin
 if (select count(*) from private.aqari_tenant_adjustments where workspace_id=w and source_type='commercial_sales')<>1 then raise exception 'SALES_DUPLICATE_OR_ZERO_DEBIT';end if;
 if not exists(select 1 from private.aqari_tenant_adjustments where workspace_id=w and lease_id='76550000-0000-4000-8000-000000000401' and amount=41.667 and direction='debit' and occurred_on='2026-08-31') then raise exception 'SALES_LEDGER_LINK_FAILED';end if;
 update private.aqari_commercial_terms set sales_percentage=8,revision=2 where workspace_id=w and lease_id='76550000-0000-4000-8000-000000000401' and workspace_id=current_setting('hosted.test.workspace')::uuid;
 begin update private.aqari_commercial_sales set amount=1 where workspace_id=w and workspace_id=current_setting('hosted.test.workspace')::uuid;raise exception 'IMMUTABLE_SALES_CHANGED';exception when others then if sqlerrm='IMMUTABLE_SALES_CHANGED' then raise;end if;end;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;req jsonb:=(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(1))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent'));rev jsonb;r jsonb;begin
 if (public.aqari_commercial_sales(w,'record',req)->>'sales_percentage')::numeric<>7.5 then raise exception 'RETRY_REPRICED_HISTORY';end if;
 begin perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(4))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-07'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')));raise exception 'STALE_TERMS_ALLOWED';exception when serialization_failure then null;end;
 rev:=jsonb_build_object('id','76550000-0000-4000-8000-000000000701','sale_id',req->>'id','month','2026-08','occurred_on','2026-09-01','reason','تصحيح تقرير مبيعات اصطناعي');
 r:=public.aqari_commercial_sales(w,'reverse',rev);
 if public.aqari_commercial_sales(w,'reverse',rev) is distinct from r then raise exception 'REVERSAL_IDEMPOTENCY_FAILED';end if;
 begin perform public.aqari_commercial_sales(w,'reverse',rev||'{"id":"76550000-0000-4000-8000-000000000702"}');raise exception 'DUPLICATE_REVERSAL_ALLOWED';exception when unique_violation then null;end;
 r:=public.aqari_commercial_sales(w,'list','{"month":"2026-08"}');
 if r#>>'{entries,0,reversal,id}'<>'76550000-0000-4000-8000-000000000701' then raise exception 'REVERSAL_READBACK_FAILED';end if;
 r:=public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(5))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent'))||'{"terms_revision":2,"gross_sales":"500.000","source_reference":"Corrected synthetic report"}');
 if (r->>'amount')::numeric<>40 then raise exception 'CORRECTED_MONTH_REPOST_FAILED';end if;
end $$;
reset role;
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)
 values(current_setting('aqari.test.sales.workspace')::uuid,'2026-08-01',auth.uid(),'مدير اصطناعي','إقفال اصطناعي','{"untouched":true}');
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;rev jsonb;begin
 rev:='{"id":"76550000-0000-4000-8000-000000000703","sale_id":"76550000-0000-4000-8000-000000000605","month":"2026-08","occurred_on":"2026-08-31","reason":"تصحيح تقرير الشهر المقفل"}';
 begin perform public.aqari_commercial_sales(w,'reverse',rev);raise exception 'CLOSED_MONTH_REVERSAL_ALLOWED';exception when others then if position('الفترة المالية مقفلة' in sqlerrm)=0 then raise;end if;end;
 perform public.aqari_commercial_sales(w,'reverse',rev||'{"occurred_on":"2026-09-02"}');
 begin perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76550000-0000-4000-8000-'||lpad((600+(6))::text,12,'0'))::uuid,'lease_id','76550000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76550000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent'))||'{"terms_revision":2}');raise exception 'CLOSED_MONTH_POST_ALLOWED';exception when others then if position('الفترة المالية مقفلة' in sqlerrm)=0 then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','76550000-0000-4000-8000-000000000002',true);
do $$begin begin perform public.aqari_commercial_sales(current_setting('aqari.test.sales.workspace')::uuid,'list','{"month":"2026-08"}');raise exception 'NON_MANAGER_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;set local role anon;
do $$begin begin perform public.aqari_commercial_sales(current_setting('aqari.test.sales.workspace')::uuid,'list','{"month":"2026-08"}');raise exception 'ANON_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;begin
 if (select sum(case direction when 'debit' then amount else -amount end) from private.aqari_tenant_adjustments where workspace_id=w and kind='commercial_sales')<>0 then raise exception 'REVERSAL_AMOUNT_NOT_ORIGINAL_SNAPSHOT';end if;
 if (select count(*) from private.aqari_commercial_sales where workspace_id=w)<>3 or (select count(*) from private.aqari_commercial_sales_reversals where workspace_id=w)<>2 then raise exception 'HISTORY_DELETED_OR_DUPLICATED';end if;
 if (select count(*) from private.aqari_operations_audit where workspace_id=w and domain='commercial_sales')<>5 then raise exception 'AUDIT_MISSING_OR_DUPLICATED';end if;
 if not (select snapshot='{"untouched":true}'::jsonb from private.aqari_financial_periods where workspace_id=w and month='2026-08-01') then raise exception 'CLOSED_SNAPSHOT_CHANGED';end if;
 if (select count(*) from pg_class where oid in ('private.aqari_commercial_sales'::regclass,'private.aqari_commercial_sales_reversals'::regclass) and relrowsecurity)<>2 then raise exception 'SALES_RLS_MISSING';end if;
end $$;

select set_config('request.jwt.claim.sub','76550000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
delete from private.aqari_commercial_terms where workspace_id=current_setting('aqari.test.sales.workspace')::uuid and lease_id='76550000-0000-4000-8000-000000000402' and workspace_id=current_setting('hosted.test.workspace')::uuid;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;terms jsonb;allocation jsonb;r jsonb;begin
 terms:='{"id":"76550000-0000-4000-8000-000000000402","revision":1,"grace_days":10,"sales_percentage":5,"cam_amount":"0.000","permitted_activity":"تجارة اختبار","license_no":"TEST-LICENSE","compliance_reference":"مرجع اصطناعي معتمد"}';
 begin perform public.aqari_compliance_register(w,'commercial','save',terms);raise exception 'NONEXISTENT_TERMS_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 begin perform public.aqari_compliance_register(w,'commercial','save',terms||'{"revision":0,"cam_amount":"NaN"}');raise exception 'NAN_CAM_ACCEPTED';exception when invalid_parameter_value then null;end;
 r:=public.aqari_compliance_register(w,'commercial','save',terms||'{"revision":0}');
 if (r->>'revision')::integer<>1 then raise exception 'FIRST_TERMS_SAVE_FAILED';end if;
 begin perform public.aqari_compliance_register(w,'commercial','save',terms||'{"revision":0}');raise exception 'STALE_FIRST_SAVE_OVERWROTE_TERMS';exception when serialization_failure then null;end;
 allocation:='{"id":"76550000-0000-4000-8000-000000000801","property_id":"76550000-0000-4000-8000-000000000101","invoice_reference":"COMMON-SYNTHETIC-1","basis":"area","total_amount":"12.345","allocations":[{"unit_id":"76550000-0000-4000-8000-000000000201","amount":"12.345"}]}';
 r:=public.aqari_compliance_register(w,'common_charges','allocate',allocation);
 if (r->>'total_amount')::numeric<>12.345 then raise exception 'SIGNED_LEASE_ALLOCATION_FAILED';end if;
 r:=public.aqari_compliance_register(w,'commercial','list');
 if not exists(select 1 from jsonb_array_elements(r->'allocations')x where x->>'id'=allocation->>'id' and (x->>'total_amount')::numeric=12.345) then raise exception 'COMMON_CHARGE_READBACK_FAILED';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.sales.workspace')::uuid;begin
 if not exists(select 1 from private.aqari_tenant_adjustments where workspace_id=w and source_id='76550000-0000-4000-8000-000000000801' and lease_id='76550000-0000-4000-8000-000000000401' and amount=12.345 and direction='debit') then raise exception 'COMMON_CHARGE_SIGNED_LEASE_DEBIT_FAILED';end if;
end $$;
insert into private.aqari_financial_periods(workspace_id,month,closed_by,closed_by_name,reason,snapshot)
 values(current_setting('aqari.test.sales.workspace')::uuid,date_trunc('month',now() at time zone 'Asia/Kuwait')::date,auth.uid(),'مدير اختبار','إقفال اصطناعي للتحقق من رفض الخدمات','{}');
set local role authenticated;
do $$begin
 begin perform public.aqari_compliance_register(current_setting('aqari.test.sales.workspace')::uuid,'common_charges','allocate','{"id":"76550000-0000-4000-8000-000000000802","property_id":"76550000-0000-4000-8000-000000000101","invoice_reference":"COMMON-SYNTHETIC-CLOSED","basis":"area","total_amount":"12.345","allocations":[{"unit_id":"76550000-0000-4000-8000-000000000201","amount":"12.345"}]}');raise exception 'CLOSED_COMMON_CHARGE_ALLOWED';exception when others then if position('الفترة المالية مقفلة' in sqlerrm)=0 then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: monthly sales exact arithmetic, source binding, MFA/scope/ACL/RLS, snapshot, idempotency, reversal, close protection and preserved history';
