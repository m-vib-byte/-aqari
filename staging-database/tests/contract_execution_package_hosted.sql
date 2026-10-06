-- Preview/isolated database only. Synthetic identities, no real sessions or data.
-- All fixture rows and package commits are rolled back. This is SQL acceptance,
-- not authenticated browser/API or production acceptance.
-- Run twice, with SET LOCAL aqari.execution_package_test_rent = '0' or '100'
-- immediately after BEGIN (default: zero). PDF bytes below are SQL-only fixtures.
begin;
set local statement_timeout='20s';
select set_config('aqari.execution_package_test',jsonb_build_object(
 'workspace',gen_random_uuid(),'manager',gen_random_uuid(),'viewer',gen_random_uuid(),
 'property',gen_random_uuid(),'unit',gen_random_uuid(),'tenant',gen_random_uuid(),
 'lease',gen_random_uuid(),'settlement',gen_random_uuid(),'document',gen_random_uuid(),
 'package',gen_random_uuid(),'prepared',now(),'rent',coalesce(nullif(current_setting('aqari.execution_package_test_rent',true),''),'0')::numeric)::text,true);
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb; w uuid:=(t->>'workspace')::uuid; c jsonb; role_name text; u uuid;
begin
 insert into public.aqari_workspaces(id,slug,name) values(w,'package-test-'||w::text,'Synthetic execution package test');
 foreach role_name in array array['manager','viewer'] loop
  u:=(t->>role_name)::uuid;
  insert into private.aqari_allowed_users(email,display_name,role,workspace_slug)
  values('package-test-'||u::text||'@example.invalid','Synthetic package '||role_name,
   (case role_name when 'manager' then 'general_manager' else 'viewer' end)::public.aqari_role,'package-test-'||w::text);
  insert into auth.users(id,email,email_confirmed_at) values(u,'package-test-'||u::text||'@example.invalid',now());
 end loop;
 perform set_config('request.jwt.claim.sub',t->>'manager',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',t->>'manager','role','authenticated')::text,true);
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata)
 values((t->>'property')::uuid,w,'package-property','Synthetic package property','{}');
 insert into public.aqari_units(id,workspace_id,property_id,unit_no)
 values((t->>'unit')::uuid,w,(t->>'property')::uuid,'PACKAGE-TEST');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile)
 values((t->>'tenant')::uuid,w,'package-tenant','Synthetic package tenant','123456789019','55559002','package-tenant@example.invalid','{}');
 insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by)
 values(gen_random_uuid(),w,(t->>'unit')::uuid,1,'ready',current_date,'synthetic','Rollback fixture only',(t->>'manager')::uuid);
 c:=jsonb_build_object('id','package-lease','source','v267-cloud','status','signing','contract_no','PACKAGE-TEST',
 'tenant','Synthetic package tenant','property','Synthetic package property','unit','PACKAGE-TEST',
 'tenantId','package-tenant','start_date','2026-10-01','end_date','2027-09-30',
 'rentalTermsVersion',1,'rentAdjustments','[]'::jsonb,'freeMonthApproved',false,'rent',100,'contractRent',100,'discount',0,'deposit',0,'advance',0,'cleaningFee',0,
 'rentEntitlement',jsonb_build_object('version',1,'startDate','2026-10-01','firstPeriodPolicy','manual_first_period','manualFirstPeriodAmount',(t->>'rent')::numeric),
 'clauses',jsonb_build_array(jsonb_build_object('title','Synthetic clause','text','Synthetic contract for rollback acceptance only')));
 insert into public.aqari_app_state(workspace_id,payload) values(w,jsonb_build_object('contractsV202',jsonb_build_array(c)));
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
 values((t->>'lease')::uuid,w,'package-lease',(t->>'tenant')::uuid,(t->>'unit')::uuid,'PACKAGE-TEST','2026-10-01','2027-09-30',100,0,'signing',c);
end $$;
do $$declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;begin
 if exists(select 1 from private.aqari_rent_due_periods where workspace_id=(t->>'workspace')::uuid) then raise exception 'TEST_SIGNING_MUST_NOT_POST_DUES';end if;
end $$;
set local role authenticated;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb; s jsonb;r jsonb;
begin
 if (t->>'rent')::numeric>0 then
  r:=public.aqari_reserve_rent_receipt_serial((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,2026);
  t:=t||jsonb_build_object('receipt',r->>'receipt_no','sequence',r->'contract_sequence');
  perform set_config('aqari.execution_package_test',t::text,true);
 end if;
 s:=public.aqari_contract_execution_package_source((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,(t->>'document')::uuid,(t->>'prepared')::timestamptz,coalesce(t->>'receipt',''),(t->>'sequence')::integer);
 if (s#>>'{amounts,rent}')::numeric is distinct from (t->>'rent')::numeric then raise exception 'TEST_RENT_SOURCE_FAILED';end if;
 if s->>'actor_id'<>t->>'manager' or s#>>'{signed_contract_snapshot,status}'<>'signed'
 or s#>>'{tenant_document,payload,copyRole}'<>'tenant' or s#>>'{owner_document,payload,copyRole}'<>'owner' then raise exception 'TEST_CANONICAL_SOURCE_FAILED';end if;
 perform set_config('aqari.execution_package_source',s::text,true);
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,null,'bad','bad','bad','bad');
  raise exception 'TEST_AUTHENTICATED_COMMIT_NOT_DENIED';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',t->>'viewer',true);
 begin
  perform public.aqari_contract_execution_package_source((t->>'workspace')::uuid,'package-lease',(t->>'settlement')::uuid,(t->>'document')::uuid,(t->>'prepared')::timestamptz,coalesce(t->>'receipt',''),(t->>'sequence')::integer);
  raise exception 'TEST_VIEWER_SOURCE_NOT_DENIED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;s jsonb:=current_setting('aqari.execution_package_source')::jsonb;r jsonb;artifacts jsonb;receipt_pdf text;receipt_hash text;
 pdf text:=encode(convert_to('%PDF-synthetic-package-fixture','UTF8'),'base64');
 hash text:=encode(sha256(convert_to('%PDF-synthetic-package-fixture','UTF8')),'hex');
begin
 if (t->>'rent')::numeric>0 then
  artifacts:=jsonb_build_object('record',jsonb_build_array(t->>'receipt','Synthetic package tenant',(t->>'rent')::numeric),
   'ledger',jsonb_build_object('receiptNo',t->>'receipt','contractReceiptSequence',t->'sequence','paid',(t->>'rent')::numeric),
   'receipt',jsonb_build_object('id',t->>'receipt','contractReceiptSequence',t->'sequence','contract',s->'signed_contract_snapshot'));
  receipt_pdf:=pdf;receipt_hash:=hash;
 end if;
 r:=public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
 if r->>'package_id'<>t->>'package' or (r->>'replayed')::boolean then raise exception 'TEST_PACKAGE_COMMIT_FAILED';end if;
 r:=public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
 if not (r->>'replayed')::boolean then raise exception 'TEST_PACKAGE_REPLAY_FAILED';end if;
 begin
  perform public.aqari_contract_execution_package_commit(gen_random_uuid(),(t->>'manager')::uuid,s,artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CONFLICTING_REPLAY_NOT_DENIED';
 exception when unique_violation then if sqlerrm<>'EXECUTION_PACKAGE_REPLAY_CONFLICT' then raise;end if;end;
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,artifacts,pdf,repeat('0',64),pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CORRUPT_PDF_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_INVALID_PDF' then raise;end if;end;
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,jsonb_set(s,'{amounts,rent}','99'),artifacts,pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_CHANGED_SOURCE_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_SOURCE_CHANGED' then raise;end if;end;
 if (t->>'rent')::numeric=0 then
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,'{}',pdf,hash,pdf,hash);
  raise exception 'TEST_FAKE_RECEIPT_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_FAKE_RECEIPT' then raise;end if;end;
 else
 begin
  perform public.aqari_contract_execution_package_commit((t->>'package')::uuid,(t->>'manager')::uuid,s,jsonb_set(artifacts,'{record,2}','101'),pdf,hash,pdf,hash,receipt_pdf,receipt_hash);
  raise exception 'TEST_RECEIPT_AMOUNT_NOT_DENIED';
 exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_RECEIPT_MISMATCH' then raise;end if;end;
 end if;
end $$;
reset role;
do $$
declare t jsonb:=current_setting('aqari.execution_package_test')::jsonb;w uuid:=(t->>'workspace')::uuid;
begin
 if (select count(*) from private.aqari_contract_execution_packages where workspace_id=w)<>1 then raise exception 'TEST_PACKAGE_DUPLICATED';end if;
 if exists(select 1 from private.aqari_contract_execution_package_consumptions where workspace_id=w) then raise exception 'TEST_PREPARATION_CONSUMED_SETTLEMENT';end if;
 if (select status from public.aqari_leases where id=(t->>'lease')::uuid)<>'signing' then raise exception 'TEST_PREPARATION_SIGNED_CONTRACT';end if;
end $$;
select 'PASS: canonical source; viewer rejection; authenticated commit rejection; package commit; idempotent replay; conflicting replay rejection; PDF integrity; source integrity; receipt validation; no settlement or signing' as result, (current_setting('aqari.execution_package_test')::jsonb->>'rent')::numeric as tested_rent;
rollback;
