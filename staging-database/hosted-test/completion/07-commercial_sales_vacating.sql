-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.
-- Source: staging-database/tests/commercial_sales_vacating.sql
-- Primary workspace: 76f10000-0000-4000-8000-000000000007 / hosted-completion-commercial-sales-vacating
-- Run this entire file as one query; never extract setup statements.
-- Synthetic in-memory PostgreSQL acceptance only. Every fixture rolls back.
begin;
select set_config('hosted.test.workspace','76f10000-0000-4000-8000-000000000007',true);
insert into public.aqari_workspaces(id,slug,name) values('76f10000-0000-4000-8000-000000000007','hosted-completion-commercial-sales-vacating','Synthetic rollback acceptance: commercial_sales_vacating');
insert into public.aqari_app_state(workspace_id,payload) values('76f10000-0000-4000-8000-000000000007','{}');

insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('commercial-vacating-manager@example.invalid','مدير اختبار المبيعات','general_manager','hosted-completion-commercial-sales-vacating'),
 ('commercial-vacating-accountant@example.invalid','محاسب اختبار المبيعات','accountant','hosted-completion-commercial-sales-vacating');
insert into auth.users(id,email,email_confirmed_at) values
 ('76560000-0000-4000-8000-000000000001','commercial-vacating-manager@example.invalid',now()),
 ('76560000-0000-4000-8000-000000000002','commercial-vacating-accountant@example.invalid',now());
select set_config('aqari.test.commercial.vacating.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76560000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76560000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
insert into public.aqari_workspaces(id,slug,name) values('76560000-0000-4000-8000-000000000099','commercial-vacating-foreign-fixture','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('commercial-vacating-foreign-manager@example.invalid','مدير مساحة الرفض الاصطناعية','general_manager','commercial-vacating-foreign-fixture');
insert into auth.users(id,email,email_confirmed_at)values('76560000-0000-4000-8000-000000000003','commercial-vacating-foreign-manager@example.invalid',now());
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;l uuid;doc uuid;actor uuid:=auth.uid();readiness jsonb;begin
 for n in 1..3 loop
  w:=case n when 3 then '76560000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.commercial.vacating.workspace')::uuid end;
  p:=('76560000-0000-4000-8000-00000000010'||n)::uuid;u:=('76560000-0000-4000-8000-00000000020'||n)::uuid;
  t:=('76560000-0000-4000-8000-00000000030'||n)::uuid;l:=('76560000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'VACATING-SALES-P-'||n,'Synthetic sales property '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,'UNIT-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   if n=3 then perform set_config('request.jwt.claim.sub','76560000-0000-4000-8000-000000000003',true);end if;
   readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','UNIT-'||n,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار مبيعات اصطناعي','reason','جاهزية اختبار فقط'));
   if readiness->>'unit_id'<>u::text or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_READINESS_RPC_FAILED';end if;
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'VACATING-SALES-T-'||n,'Synthetic tenant '||n,'76560000000'||n,'7655000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'VACATING-SALES-L-'||n,t,u,'VACATING-SALES-L-'||n,'2026-01-15','2026-12-31',100,50,'signed','{}');
  insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
   values(l,w,7.5,'تجارة اصطناعية','LICENSE-TEST',auth.uid(),now(),'مصدر اصطناعي معتمد للاختبار');
  if n<3 then
   doc:=('76560000-0000-4000-8000-00000000050'||n)::uuid;
   insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
    values(doc,w,'VACATING-SALES-DOC-'||n,'property_document','property','VACATING-SALES-P-'||n,'Synthetic sales report '||n,'test.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
   insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;

-- The base rent is paid; the separate percentage-rent charge remains due.
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('76560000-0000-4000-8000-000000000901',current_setting('aqari.test.commercial.vacating.workspace')::uuid,'76560000-0000-4000-8000-000000000401','COMMERCIAL-VACATING-RENT',800,'2026-08-01','2026-08-31','paid','cash','{}','{}');
do $$declare w uuid:=current_setting('aqari.test.commercial.vacating.workspace')::uuid;doc uuid:='76560000-0000-4000-8000-000000000902';begin
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by,metadata)
  values(doc,w,'COMMERCIAL-VACATING-HANDOVER','mobile_scan','lease','VACATING-SALES-L-1','محضر تسليم اصطناعي','handover.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid(),'{"document_category":"vacating_inspection","purpose":"vacating_handover"}');
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('b',64));
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.commercial.vacating.workspace')::uuid;r jsonb;rev bigint;detail text;begin
 perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76560000-0000-4000-8000-'||lpad((600+(1))::text,12,'0'))::uuid,'lease_id','76560000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76560000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')));
 r:=public.aqari_vacating_settlement(w,'save','{"lease_id":"76560000-0000-4000-8000-000000000401","vacate_date":"2026-08-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"commercial-vacating-review","revision":0}');
 rev:=(r#>>'{settlement,revision}')::bigint;
 begin
  perform public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','76560000-0000-4000-8000-000000000401','revision',rev));
  raise exception 'UNPAID_COMMERCIAL_FINALIZED';
 exception when check_violation then
  get stacked diagnostics detail=pg_exception_detail;
  if detail<>'VACATING_COMMERCIAL_BALANCE_REVIEW_REQUIRED' then raise;end if;
 end;
 r:=public.aqari_vacating_settlement(w,'get','{"lease_id":"76560000-0000-4000-8000-000000000401"}');
 if r#>>'{settlement,status}'<>'draft' then raise exception 'FAILED_COMMERCIAL_FINALIZE_CHANGED_STATUS';end if;
 begin
  perform public.aqari_vacating_release(w,'76560000-0000-4000-8000-000000000401',rev);raise exception 'UNPAID_COMMERCIAL_RELEASED';
 exception when invalid_parameter_value then if sqlerrm<>'VACATING_CLEARANCE_REQUIRED' then raise;end if;end;
 perform public.aqari_commercial_sales(w,'reverse','{"id":"76560000-0000-4000-8000-000000000701","sale_id":"76560000-0000-4000-8000-000000000601","month":"2026-08","occurred_on":"2026-08-31","reason":"إلغاء تقرير المبيعات الاصطناعي الخاطئ"}');
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','76560000-0000-4000-8000-000000000401','revision',rev));
 rev:=(r#>>'{settlement,revision}')::bigint;
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id','76560000-0000-4000-8000-000000000401','revision',rev,'exception_reason',''));
 if r#>>'{settlement,status}'<>'cleared' then raise exception 'REVERSED_COMMERCIAL_CLEARANCE_BLOCKED';end if;
 rev:=(r#>>'{settlement,revision}')::bigint;
 begin
  perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76560000-0000-4000-8000-'||lpad((600+(2))::text,12,'0'))::uuid,'lease_id','76560000-0000-4000-8000-000000000401','month',('2026-07'),'gross_sales','555.555','terms_revision',1,'source_document_id','76560000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')));raise exception 'NEW_DEBT_AFTER_CLEARANCE_ALLOWED';
 exception when check_violation then get stacked diagnostics detail=pg_exception_detail;if detail<>'SALES_AFTER_CLEARANCE_REVIEW_REQUIRED' then raise;end if;end;
 r:=public.aqari_vacating_release(w,'76560000-0000-4000-8000-000000000401',rev);
 if r#>>'{settlement,status}'<>'released' or r#>>'{lease,vacated_on}'<>'2026-08-31' then raise exception 'REVERSED_COMMERCIAL_RELEASE_FAILED';end if;
 if public.aqari_vacating_release(w,'76560000-0000-4000-8000-000000000401',rev)#>>'{lease,vacated_on}'<>'2026-08-31' then raise exception 'COMMERCIAL_RELEASE_RETRY_FAILED';end if;
 begin
  perform public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76560000-0000-4000-8000-'||lpad((600+(2))::text,12,'0'))::uuid,'lease_id','76560000-0000-4000-8000-000000000401','month',('2026-07'),'gross_sales','555.555','terms_revision',1,'source_document_id','76560000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')));raise exception 'BACKDATED_DEBT_AFTER_RELEASE_ALLOWED';
 exception when check_violation then get stacked diagnostics detail=pg_exception_detail;if detail<>'SALES_AFTER_CLEARANCE_REVIEW_REQUIRED' then raise;end if;end;
 if public.aqari_commercial_sales(w,'record',(jsonb_build_object('id',('76560000-0000-4000-8000-'||lpad((600+(1))::text,12,'0'))::uuid,'lease_id','76560000-0000-4000-8000-000000000401','month',('2026-08'),'gross_sales','555.555','terms_revision',1,'source_document_id','76560000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')))->>'id'<>'76560000-0000-4000-8000-000000000601' then raise exception 'ORIGINAL_REQUEST_RECOVERY_BLOCKED';end if;
end $$;
reset role;
do $$declare w uuid:=current_setting('aqari.test.commercial.vacating.workspace')::uuid;begin
 if (select count(*) from private.aqari_commercial_sales where workspace_id=w)<>1 or (select count(*) from private.aqari_commercial_sales_reversals where workspace_id=w)<>1 then raise exception 'COMMERCIAL_RELEASE_HISTORY_CHANGED';end if;
 if (select count(*) from private.aqari_tenant_adjustments where workspace_id=w and kind='commercial_sales')<>2 or (select sum(case direction when 'debit' then amount else -amount end) from private.aqari_tenant_adjustments where workspace_id=w and kind='commercial_sales')<>0 then raise exception 'COMMERCIAL_RELEASE_PHANTOM_DEBT';end if;
 if not exists(select 1 from public.aqari_leases where workspace_id=w and id='76560000-0000-4000-8000-000000000401' and status='expired' and vacated_on='2026-08-31' and end_date='2026-12-31') then raise exception 'COMMERCIAL_RELEASE_LEASE_PROJECTION_FAILED';end if;
end $$;
rollback;
select 'PASS: unpaid percentage rent blocks final settlement and release; exact reversal permits actual clearance/release without phantom debt; post-clearance/backdated post-release charges rejected; history and retry preserved';
