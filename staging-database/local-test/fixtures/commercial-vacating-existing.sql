-- Positive local fixture carries current MFA evidence; production guards remain enabled.
-- IN-MEMORY UPGRADE FIXTURE ONLY. DO NOT RUN ON A HOSTED DATABASE.
-- Creates synthetic pre-upgrade history, intentionally committed in PGlite memory.
-- Run after commercial-sales.sql BEFORE commercial-sales-vacating-guard.sql;
-- verify using commercial_sales_vacating_upgrade.sql. The runner destroys its
-- in-memory database at exit and accepts no database URL or credentials.
begin;
insert into public.aqari_workspaces(id,slug,name)values('76570000-0000-4000-8000-000000000098','commercial-legacy-isolated','اختبار ترقية تجاري معزول');
insert into public.aqari_app_state(workspace_id,payload)values('76570000-0000-4000-8000-000000000098','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('commercial-legacy-manager@example.invalid','مدير اختبار المبيعات','general_manager','commercial-legacy-isolated'),
 ('commercial-legacy-accountant@example.invalid','محاسب اختبار المبيعات','accountant','commercial-legacy-isolated');
insert into auth.users(id,email,email_confirmed_at) values
 ('76570000-0000-4000-8000-000000000001','commercial-legacy-manager@example.invalid',now()),
 ('76570000-0000-4000-8000-000000000002','commercial-legacy-accountant@example.invalid',now());
select set_config('aqari.test.commercial.legacy.workspace',(select workspace_id::text from public.aqari_memberships where user_id='76570000-0000-4000-8000-000000000001' and is_active),true);
select set_config('request.jwt.claim.sub','76570000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
insert into public.aqari_workspaces(id,slug,name) values('76570000-0000-4000-8000-000000000099','commercial-legacy-foreign-fixture','Other synthetic workspace');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('commercial-legacy-foreign-manager@example.invalid','مدير مساحة الرفض الاصطناعية','general_manager','commercial-legacy-foreign-fixture');
insert into auth.users(id,email,email_confirmed_at)values('76570000-0000-4000-8000-000000000003','commercial-legacy-foreign-manager@example.invalid',now());
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;l uuid;doc uuid;actor uuid:=auth.uid();readiness jsonb;begin
 for n in 1..3 loop
  w:=case n when 3 then '76570000-0000-4000-8000-000000000099'::uuid else current_setting('aqari.test.commercial.legacy.workspace')::uuid end;
  p:=('76570000-0000-4000-8000-00000000010'||n)::uuid;u:=('76570000-0000-4000-8000-00000000020'||n)::uuid;
  t:=('76570000-0000-4000-8000-00000000030'||n)::uuid;l:=('76570000-0000-4000-8000-00000000040'||n)::uuid;
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'LEGACY-SALES-P-'||n,'Synthetic sales property '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,'UNIT-'||n);
  if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
   if n=3 then perform set_config('request.jwt.claim.sub','76570000-0000-4000-8000-000000000003',true);end if;
   readiness:=public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',p,'unit_no','UNIT-'||n,'expected_revision',0,'state','ready','inspected_on','2026-01-01','source_ref','اختبار مبيعات اصطناعي','reason','جاهزية اختبار فقط'));
   if readiness->>'unit_id'<>u::text or readiness->>'state'<>'ready' then raise exception 'COMMERCIAL_READINESS_RPC_FAILED';end if;
  end if;
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values(t,w,'LEGACY-SALES-T-'||n,'Synthetic tenant '||n,'76570000000'||n,'7655000'||n,'{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,'LEGACY-SALES-L-'||n,t,u,'LEGACY-SALES-L-'||n,'2026-01-15','2026-12-31',100,50,'signed','{}');
  insert into private.aqari_commercial_terms(lease_id,workspace_id,sales_percentage,permitted_activity,license_no,compliance_reviewed_by,compliance_reviewed_at,compliance_reference)
   values(l,w,7.5,'تجارة اصطناعية','LICENSE-TEST',auth.uid(),now(),'مصدر اصطناعي معتمد للاختبار');
  if n<3 then
   doc:=('76570000-0000-4000-8000-00000000050'||n)::uuid;
   insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by)
    values(doc,w,'LEGACY-SALES-DOC-'||n,'property_document','property','LEGACY-SALES-P-'||n,'Synthetic sales report '||n,'test.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid());
   insert into storage.objects(bucket_id,name,metadata)values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('a',64));
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',actor::text,true);
end $$;
create function pg_temp.sales_request(n integer,period text default '2026-08') returns jsonb language sql as $$
 select jsonb_build_object('id',('76570000-0000-4000-8000-'||lpad((600+n)::text,12,'0'))::uuid,'lease_id','76570000-0000-4000-8000-000000000401','month',period,'gross_sales','555.555','terms_revision',1,'source_document_id','76570000-0000-4000-8000-000000000501','source_reference','Synthetic report 8/2026','calculation_basis','additional_to_base_rent')
$$;
-- The base rent is paid; the separate percentage-rent charge remains due.
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values('76570000-0000-4000-8000-000000000901',current_setting('aqari.test.commercial.legacy.workspace')::uuid,'76570000-0000-4000-8000-000000000401','COMMERCIAL-LEGACY-RENT',800,'2026-08-01','2026-08-31','paid','cash','{}','{}');
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;doc uuid:='76570000-0000-4000-8000-000000000902';begin
 insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_path,created_by,metadata)
  values(doc,w,'COMMERCIAL-LEGACY-HANDOVER','mobile_scan','lease','LEGACY-SALES-L-1','محضر تسليم اصطناعي','handover.pdf','application/pdf',w::text||'/'||doc::text||'.pdf',auth.uid(),'{"document_category":"vacating_inspection","purpose":"vacating_handover"}');
 insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',w::text||'/'||doc::text||'.pdf','{"size":100,"mimetype":"application/pdf"}');
 perform public.aqari_finalize_document(doc,100,'application/pdf',repeat('b',64));
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('aqari.test.commercial.legacy.workspace')::uuid;r jsonb;rev bigint;begin
 perform public.aqari_commercial_sales(w,'record',pg_temp.sales_request(1));
 r:=public.aqari_vacating_settlement(w,'save','{"lease_id":"76570000-0000-4000-8000-000000000401","vacate_date":"2026-08-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"legacy-commercial-review","revision":0}');
 rev:=(r#>>'{settlement,revision}')::bigint;
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','76570000-0000-4000-8000-000000000401','revision',rev));
 rev:=(r#>>'{settlement,revision}')::bigint;
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id','76570000-0000-4000-8000-000000000401','revision',rev,'exception_reason',''));
 if r#>>'{settlement,status}'<>'cleared' then raise exception 'LEGACY_CLEARANCE_NOT_REPRODUCED';end if;
end $$;
reset role;
drop function pg_temp.sales_request(integer,text);
commit;
select 'PRE-UPGRADE FIXTURE: existing cleared lease plus separate unpaid commercial charge; no hosted connection';
