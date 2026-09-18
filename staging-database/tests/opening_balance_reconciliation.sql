-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Transactional acceptance after the report upgrade. Every synthetic write rolls back.
begin;
insert into public.aqari_workspaces(id,slug,name)values
 ('9ac124f6-0000-4000-8000-000000000099','aqari-v267-opening-reconciliation-test','Opening balance isolated test'),
 ('9ac124f6-0000-4000-8000-000000000098','opening-reconciliation-other','Other opening workspace');
insert into public.aqari_app_state(workspace_id,payload)values('9ac124f6-0000-4000-8000-000000000099','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('opening-review-manager@example.invalid','مدير اختبار الرصيد الافتتاحي','general_manager','aqari-v267-opening-reconciliation-test'),
 ('opening-review-viewer@example.invalid','مشاهد اختبار الرصيد الافتتاحي','viewer','aqari-v267-opening-reconciliation-test'),
 ('opening-review-accountant@example.invalid','محاسب عقار واحد','accountant','aqari-v267-opening-reconciliation-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('9ac124f6-0000-4000-8000-000000000001','opening-review-manager@example.invalid',now()),
 ('9ac124f6-0000-4000-8000-000000000002','opening-review-viewer@example.invalid',now()),
 ('9ac124f6-0000-4000-8000-000000000003','opening-review-accountant@example.invalid',now());
select set_config('request.jwt.claim.sub','9ac124f6-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('opening.review.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
do $$declare w uuid:=current_setting('opening.review.w')::uuid;n integer;begin
 for n in 1..2 loop
  insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)values(('9ac124f6-0000-4000-8000-00000000010'||n)::uuid,w,'opening-property-'||n,'عقار اختبار الرصيد '||n,'{}');
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(('9ac124f6-0000-4000-8000-00000000020'||n)::uuid,w,('9ac124f6-0000-4000-8000-00000000010'||n)::uuid,'OPEN-'||n);
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',('9ac124f6-0000-4000-8000-00000000090'||n)::uuid,
   'property_id',('9ac124f6-0000-4000-8000-00000000010'||n)::uuid,'unit_no','OPEN-'||n,'expected_revision',0,'state','ready',
   'inspected_on',current_date,'source_ref','Synthetic opening fixture inspection','reason','Unit inspected before the synthetic signed lease'));
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)values
   (('9ac124f6-0000-4000-8000-00000000030'||n)::uuid,w,'opening-review-tenant-'||n,'مستأجر اختبار الرصيد '||n,'76100000000'||n,'7610000'||n,'opening-review-tenant-'||n||'@example.invalid','{}');
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)values
   (('9ac124f6-0000-4000-8000-00000000040'||n)::uuid,w,'opening-lease-'||n,('9ac124f6-0000-4000-8000-00000000030'||n)::uuid,('9ac124f6-0000-4000-8000-00000000020'||n)::uuid,'OPEN-LEASE-'||n,'2026-01-01','2026-12-31',100,0,'signed','{}');
 end loop;
 insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by)values
  (w,'9ac124f6-0000-4000-8000-000000000003','accountant',array['9ac124f6-0000-4000-8000-000000000101']::uuid[],true,auth.uid());
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)values
  ('9ac124f6-0000-4000-8000-000000000303','9ac124f6-0000-4000-8000-000000000098','opening-foreign-tenant','مستأجر مساحة أخرى','761000000003','76100003','{}');
end $$;
insert into auth.users(id,email,email_confirmed_at)values('9ac124f6-0000-4000-8000-000000000004','opening-review-tenant-1@example.invalid',now());
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)values('opening-review-second-manager@example.invalid','Second review manager','general_manager','aqari-v267-opening-reconciliation-test');
insert into auth.users(id,email,email_confirmed_at)values('9ac124f6-0000-4000-8000-000000000005','opening-review-second-manager@example.invalid',now());
-- Synthetic metadata fixtures exercise the database guards; no storage HTTP upload or provider message occurs.
do $$declare w uuid:=current_setting('opening.review.w')::uuid;doc record;n integer;begin
 for n in 1..6 loop
  select * into doc from public.aqari_reserve_document(w,case when n in(3,6) then 'signed_contract' when n=4 then 'property_document' else 'tenant_attachment' end,
   case when n in(3,6) then 'lease' when n=4 then 'property' else 'tenant' end,
   case n when 2 then 'opening-review-tenant-2' when 3 then 'opening-lease-1' when 4 then 'opening-property-1' when 6 then 'opening-lease-2' else 'opening-review-tenant-1' end,
   'Synthetic opening source '||n,'opening-source.pdf','application/pdf','{"fixture":"rollback-only"}');
  perform set_config('opening.review.doc'||n,doc.document_id::text,true);
  if n<>5 then
   insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',doc.storage_path,'{"size":100,"mimetype":"application/pdf"}');
   perform public.aqari_finalize_document(doc.document_id,100,'application/pdf',repeat(chr(96+n),64));
  end if;
 end loop;
end $$;
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)values
 ('9ac124f6-0000-4000-8000-000000000501',current_setting('opening.review.w')::uuid,'9ac124f6-0000-4000-8000-000000000401','OPEN-REVIEW-PAID',100,'2026-01-01','2026-01-02','paid','bank','{}','{}'),
 ('9ac124f6-0000-4000-8000-000000000502',current_setting('opening.review.w')::uuid,'9ac124f6-0000-4000-8000-000000000401','OPEN-REVIEW-PENDING',500,'2026-01-01','2026-01-02','pending','bank','{}','{}');
set local role authenticated;
do $$declare w uuid:=current_setting('opening.review.w')::uuid;d jsonb;r jsonb;bad jsonb;initial jsonb;begin
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000020","tenant_id":"9ac124f6-0000-4000-8000-000000000301","lease_id":"9ac124f6-0000-4000-8000-000000000401","direction":"debit","kind":"opening_debit","amount":"40.125","occurred_on":"2026-01-01","reason":"Synthetic opening debit","source_type":"manual","source_id":"opening-review-debit"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000021","tenant_id":"9ac124f6-0000-4000-8000-000000000301","lease_id":"9ac124f6-0000-4000-8000-000000000401","direction":"credit","kind":"opening_credit","amount":"10.125","occurred_on":"2026-01-31","reason":"Synthetic opening credit on cutoff","source_type":"manual","source_id":"opening-review-credit"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000022","tenant_id":"9ac124f6-0000-4000-8000-000000000301","direction":"credit","kind":"adjustment","amount":"5.000","occurred_on":"2026-02-03","reason":"Synthetic non-opening adjustment","source_type":"manual","source_id":"opening-review-adjustment"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000023","tenant_id":"9ac124f6-0000-4000-8000-000000000301","direction":"debit","kind":"opening_balance","amount":"5.000","occurred_on":"2026-02-01","reason":"Synthetic opening after cutoff","source_type":"manual","source_id":"opening-review-after"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000024","tenant_id":"9ac124f6-0000-4000-8000-000000000302","lease_id":"9ac124f6-0000-4000-8000-000000000402","direction":"debit","kind":"opening_balance","amount":"1.000","occurred_on":"2026-01-01","reason":"Synthetic other tenant opening","source_type":"manual","source_id":"opening-review-other-tenant"}');
 perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000025","tenant_id":"9ac124f6-0000-4000-8000-000000000301","direction":"debit","kind":"opening_balance","amount":"2.000","occurred_on":"2026-01-01","reason":"Synthetic unallocated opening","source_type":"manual","source_id":"opening-review-unallocated"}');
 d:=jsonb_build_object('id','9ac124f6-0000-4000-8000-000000000601','tenant_id','9ac124f6-0000-4000-8000-000000000301','cutoff_date','2026-01-31','cutoff_boundary','end_of_day','expected_revision',0,
  'source_document_id',current_setting('opening.review.doc1'),'source_sha256',repeat('a',64),'source_reference','Page 1 tenant row 1','source_coverage','Rent debt only; fees and deposit excluded by reviewed source',
  'source_debit','40.125','source_credit','10.125','entry_ids',jsonb_build_array('9ac124f6-0000-4000-8000-000000000020','9ac124f6-0000-4000-8000-000000000021'),'source_attestation',true,'bytes_verified',true);
 perform set_config('opening.review.request',d::text,true);
 r:=public.aqari_opening_balance_reconciliation(w,'context','{"tenant_id":"9ac124f6-0000-4000-8000-000000000301"}');
 if r->>'cutoff_date' is not null or r->>'latest_revision'<>'0' or jsonb_array_length(r->'documents')<>3 or (r->>'actual_collections')::numeric<>100 then raise exception 'CONTEXT_DEFAULTED_CUTOFF_OR_WRONG_SCOPE:%',r;end if;
 r:=public.aqari_opening_balance_reconciliation(w,'context',d-'id'-'cutoff_boundary'-'expected_revision'-'source_document_id'-'source_sha256'-'source_reference'-'source_coverage'-'source_debit'-'source_credit'-'entry_ids'-'source_attestation'-'bytes_verified');
 if (select count(*) from jsonb_array_elements(r->'entries')e where e->>'side'='through_cutoff')<>3 or (select count(*) from jsonb_array_elements(r->'entries')e where e->>'side'='after_cutoff')<>2 then raise exception 'END_OF_DAY_GROUPING_FAILED:%',r;end if;
 -- Missing/false attestation, absent or overprecision amounts, same-net different gross amounts,
 -- foreign source/entry/lease, non-opening entries, after-cutoff entries and duplicate IDs all fail.
 for bad in select value from jsonb_array_elements(jsonb_build_array(
  '{"cutoff_date":null}'::jsonb,'{"cutoff_boundary":"start_of_day"}'::jsonb,'{"source_attestation":false}'::jsonb,'{"bytes_verified":false}'::jsonb,
  '{"source_credit":null}'::jsonb,'{"source_debit":"40.1251"}'::jsonb,'{"source_debit":"30.125","source_credit":"0.125"}'::jsonb,'{"source_sha256":"bad"}'::jsonb,
  jsonb_build_object('source_document_id',current_setting('opening.review.doc2'),'source_sha256',repeat('b',64)),
  jsonb_build_object('source_document_id',current_setting('opening.review.doc6'),'source_sha256',repeat('f',64)),
  jsonb_build_object('source_document_id',current_setting('opening.review.doc5')),
  '{"entry_ids":["9ac124f6-0000-4000-8000-000000000024"]}'::jsonb,'{"entry_ids":["9ac124f6-0000-4000-8000-000000000022"]}'::jsonb,
  '{"entry_ids":["9ac124f6-0000-4000-8000-000000000023"]}'::jsonb,'{"entry_ids":[]}'::jsonb,
  '{"entry_ids":["9ac124f6-0000-4000-8000-000000000020","9ac124f6-0000-4000-8000-000000000020"]}'::jsonb,
  jsonb_build_object('source_document_id',current_setting('opening.review.doc4'),'source_sha256',repeat('d',64),'source_debit','2.000','source_credit','0.000','entry_ids',jsonb_build_array('9ac124f6-0000-4000-8000-000000000025'))
 )) loop
  begin perform public.aqari_opening_balance_reconciliation(w,'review',d||bad);raise exception 'INVALID_REVIEW_ACCEPTED:%',bad;exception when check_violation then null;end;
 end loop;
 begin perform public.aqari_opening_balance_reconciliation(w,'review',d||'{"unexpected":"not stored"}');raise exception 'UNKNOWN_KEY_ACCEPTED';exception when invalid_parameter_value then null;end;
 perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
 begin perform public.aqari_opening_balance_reconciliation(w,'review',d);raise exception 'AAL1_ACCEPTED';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
 initial:=public.aqari_opening_balance_reconciliation(w,'review',d);r:=public.aqari_opening_balance_reconciliation(w,'review',d);
 if r<>initial or r#>>'{review,revision}'<>'1' or r#>'{review,request_snapshot}'<>d or r#>>'{review,reviewed_by}'<>auth.uid()::text or jsonb_array_length(r#>'{review,entries_snapshot}')<>2 then raise exception 'REVIEW_OR_EXACT_RETRY_FAILED:%',r;end if;
 if public.aqari_opening_balance_reconciliation(w,'get',jsonb_build_object('id',d->>'id'))<>initial then raise exception 'SAVED_REVIEW_READBACK_FAILED';end if;
 begin perform public.aqari_opening_balance_reconciliation(w,'review',d||'{"source_reference":"Mutated reference"}');raise exception 'CHANGED_RETRY_ACCEPTED';exception when check_violation then null;end;
 perform set_config('request.jwt.claim.sub','9ac124f6-0000-4000-8000-000000000005',true);
 begin perform public.aqari_opening_balance_reconciliation(w,'review',d);raise exception 'OTHER_MANAGER_ADOPTED_RETRY';exception when check_violation then null;end;
 perform set_config('request.jwt.claim.sub','9ac124f6-0000-4000-8000-000000000001',true);
 begin perform public.aqari_opening_balance_reconciliation(w,'review',d||'{"id":"9ac124f6-0000-4000-8000-000000000602"}');raise exception 'STALE_REVISION_ACCEPTED';exception when serialization_failure then null;end;
 bad:=d||'{"id":"9ac124f6-0000-4000-8000-000000000602","expected_revision":1,"previous_review_id":"9ac124f6-0000-4000-8000-000000000601","correction_reason":"Duplicate must still fail"}';
 begin perform public.aqari_opening_balance_reconciliation(w,'review',bad);raise exception 'DUPLICATE_SOURCE_REVIEW_ACCEPTED';exception when unique_violation then null;end;
 begin perform public.aqari_opening_balance_reconciliation(w,'review',bad-'correction_reason'||'{"source_coverage":"Corrected explicit source coverage"}');raise exception 'UNDOCUMENTED_CORRECTION_ACCEPTED';exception when check_violation then null;end;
 r:=public.aqari_opening_balance_reconciliation(w,'review',bad||'{"source_coverage":"Clarified: rent debt only, no deposit or fees","correction_reason":"Clarify scope from same archived source page"}');
 if r#>>'{review,revision}'<>'2' or r#>>'{review,previous_review_id}'<>d->>'id' then raise exception 'CORRECTION_NOT_VERSIONED';end if;
 if public.aqari_opening_balance_reconciliation(w,'get',jsonb_build_object('id',d->>'id'))<>initial then raise exception 'ORIGINAL_REVIEW_REWRITTEN';end if;
 r:=public.aqari_opening_balance_reconciliation(w,'review',d||jsonb_build_object('id','9ac124f6-0000-4000-8000-000000000603','cutoff_date','2026-02-28','source_document_id',current_setting('opening.review.doc3'),'source_sha256',repeat('c',64)));
 if r#>>'{review,source_document_id}'<>current_setting('opening.review.doc3') or r#>>'{review,revision}'<>'1' then raise exception 'MATCHING_LEASE_SOURCE_REJECTED';end if;
 r:=public.aqari_opening_balance_reconciliation(w,'review',d||jsonb_build_object('id','9ac124f6-0000-4000-8000-000000000604','cutoff_date','2026-03-31','source_document_id',current_setting('opening.review.doc4'),'source_sha256',repeat('d',64)));
 if r#>>'{review,source_document_id}'<>current_setting('opening.review.doc4') or r#>>'{review,revision}'<>'1' then raise exception 'MATCHING_PROPERTY_SOURCE_REJECTED';end if;
 if (public.aqari_opening_balance_statement(w,'9ac124f6-0000-4000-8000-000000000301')#>>'{totals,actual_collections}')::numeric<>100 then raise exception 'OPENING_BECAME_COLLECTION';end if;
 begin perform public.aqari_final_gap_register(w,'tenant_entry','{"id":"9ac124f6-0000-4000-8000-000000000026","tenant_id":"9ac124f6-0000-4000-8000-000000000301","direction":"credit","kind":"opening_debit","amount":"1.000","occurred_on":"2026-01-01","reason":"Contradictory opening rejected","source_type":"manual","source_id":"opening-review-invalid-direction"}');raise exception 'OPENING_DIRECTION_CONTRADICTION_ACCEPTED';exception when check_violation then null;end;
 begin perform public.aqari_opening_balance_reconciliation('9ac124f6-0000-4000-8000-000000000098','context','{}');raise exception 'FOREIGN_WORKSPACE_READ';exception when insufficient_privilege then null;end;
 begin perform public.aqari_opening_balance_reconciliation(w,'context','{"tenant_id":"9ac124f6-0000-4000-8000-000000000303"}');raise exception 'FOREIGN_TENANT_READ';exception when insufficient_privilege then null;end;
 begin perform 1 from private.aqari_opening_balance_reviews;raise exception 'DIRECT_REVIEW_ACCESS';exception when insufficient_privilege then null;end;
end $$;
-- Exercise the authenticated user's real Storage grants/RLS. A denied SQL
-- privilege or zero affected rows is expected; this makes no claim about owner/service roles.
do $$declare object_path text;affected integer;begin
 select storage_path into strict object_path from public.aqari_documents where id=current_setting('opening.review.doc1')::uuid;
 if not exists(select 1 from storage.objects where bucket_id='aqari-documents' and name=object_path) then raise exception 'AUTHENTICATED_SOURCE_READ_FIXTURE_MISSING';end if;
 begin
  update storage.objects set metadata='{"size":99,"mimetype":"application/pdf"}' where bucket_id='aqari-documents' and name=object_path;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'AUTHENTICATED_SOURCE_REPLACEMENT_ALLOWED';end if;
 exception when insufficient_privilege then null;end;
 begin
  delete from storage.objects where bucket_id='aqari-documents' and name=object_path;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'AUTHENTICATED_SOURCE_DELETION_ALLOWED';end if;
 exception when insufficient_privilege then null;end;
end $$;
do $$declare uid text;w uuid:=current_setting('opening.review.w')::uuid;begin
 foreach uid in array array['9ac124f6-0000-4000-8000-000000000002','9ac124f6-0000-4000-8000-000000000003','9ac124f6-0000-4000-8000-000000000004',''] loop
  perform set_config('request.jwt.claim.sub',uid,true);
  begin perform public.aqari_opening_balance_reconciliation(w,'context','{}');raise exception 'VIEWER_SCOPED_STAFF_TENANT_OR_UNAUTH_READ';exception when insufficient_privilege then null;end;
  begin perform private.aqari_opening_balance_reconciliation(w,'get','{"id":"9ac124f6-0000-4000-8000-000000000601"}');raise exception 'PRIVATE_HELPER_BYPASS';exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
select set_config('request.jwt.claim.sub','9ac124f6-0000-4000-8000-000000000001',true);
do $$declare w uuid:=current_setting('opening.review.w')::uuid;begin
 if (select count(*) from private.aqari_opening_balance_reviews r where r.workspace_id=w)<>4 or (select count(*) from public.aqari_rent_payments p where p.workspace_id=w)<>2 or (select count(*) from private.aqari_tenant_ledger_entries e where e.workspace_id=w)<>6 then raise exception 'REVIEW_CREATED_UNEXPECTED_FINANCIAL_ROWS';end if;
 begin update private.aqari_opening_balance_reviews set source_debit=999 where workspace_id=w;raise exception 'REVIEW_MUTATED';exception when check_violation then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
 begin update public.aqari_documents set checksum_sha256=repeat('f',64) where id=current_setting('opening.review.doc1')::uuid;raise exception 'ATTESTED_SOURCE_REPLACED';exception when check_violation then null;end;
 if not exists(select 1 from storage.objects where bucket_id='aqari-documents' and name=(select storage_path from public.aqari_documents where id=current_setting('opening.review.doc1')::uuid) and metadata='{"size":100,"mimetype":"application/pdf"}'::jsonb) then raise exception 'AUTHENTICATED_ATTEMPTS_CHANGED_SOURCE';end if;
 if (select prosecdef from pg_proc where oid='public.aqari_opening_balance_reconciliation(uuid,text,jsonb)'::regprocedure) or has_function_privilege('anon','public.aqari_opening_balance_reconciliation(uuid,text,jsonb)','EXECUTE') then raise exception 'PUBLIC_RPC_PRIVILEGES_UNSAFE';end if;
end $$;
rollback;
select 'PASS: independent source-attested opening review; exact debit/credit; end-of-day grouping; immutable revisions/document identity; authenticated Storage replacement/deletion denied; idempotency; scope/AAL2; no financial posting';
