-- Local PGlite only. Seed operational rows to isolate the real settlement and
-- artifact projectors; this is NOT acceptance of the upstream app-state projector.
-- Static INSERT snapshots stand in for its output; no triggers are disabled.
-- PDF sentinel bytes exercise storage/hash linkage, not renderer validity.
begin;
create temporary table execution_probe(workspace_id uuid,payload jsonb);
create trigger execution_settlement after update on execution_probe for each row execute function private.aqari_project_contract_execution();
create trigger execution_z_artifacts after update on execution_probe for each row execute function private.aqari_project_contract_execution_artifacts();

do $$
declare
 w uuid:='70000000-0000-4000-8000-000000000001'; actor uuid:=gen_random_uuid();
 p uuid:=gen_random_uuid(); tenant uuid:=gen_random_uuid(); u uuid; l uuid;
 sid uuid; did uuid; rid uuid; rno text; ref text; c jsonb; e jsonb; before_data jsonb; after_data jsonb; actual jsonb;
 rent numeric; deposit numeric; credit numeric; balance numeric; expected_no text; n integer; before_count integer;
 pid uuid; credit_id uuid; package_source jsonb; signed_c jsonb; ledger jsonb; receipt jsonb; test_pdf bytea:=convert_to('%PDF-1.4 synthetic local fixture','UTF8');
begin
 insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values('execution-probe@example.invalid','Synthetic execution manager','general_manager','aqari-v267-staging');
 insert into auth.users(id,email,email_confirmed_at) values(actor,'execution-probe@example.invalid',now());
 insert into public.aqari_profiles(user_id,display_name) values(actor,'Synthetic execution manager') on conflict do nothing;
 insert into public.aqari_memberships(workspace_id,user_id,role) values(w,actor,'general_manager') on conflict(workspace_id,user_id) do update set role='general_manager';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
 insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values(p,w,'execution-local','Synthetic execution property','{}');
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,email,profile) values(tenant,w,'execution-tenant','Synthetic execution tenant','123456789019','55559001','test@example.invalid','{}');
 for n in 1..3 loop
  u:=gen_random_uuid();l:=gen_random_uuid();sid:=gen_random_uuid();did:=gen_random_uuid();rid:=gen_random_uuid();
  rent:=case n when 1 then 0 when 2 then 100 else 75 end;deposit:=case when n=2 then 25 else 0 end;credit:=case when n=3 then 25 else 0 end;
  ref:='execution-local-'||n;expected_no:='TEST-EXEC-'||n;pid:=gen_random_uuid();
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,p,'TEST-'||n);
  insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by) values(gen_random_uuid(),w,u,1,'ready',current_date,'Synthetic local inspection','Local projection test only',actor);
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(l,w,ref,tenant,u,expected_no,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,100,deposit,'signing','{}');
  c:=jsonb_build_object('id',ref,'source','v267-cloud','status','signing','contract_no',expected_no,'tenantId',tenant::text,'tenant','Synthetic tenant','property','Synthetic execution property','unit','TEST-'||n,'start_date',current_date::text,'end_date',(current_date+30)::text,'rent','100','contractRent','100','deposit',deposit::text,'advance','0','cleaningFee','0','rentEntitlement',jsonb_build_object('startDate',current_date::text),'clauses',jsonb_build_array(jsonb_build_object('title','Synthetic clause','text','Local test text only')));
  -- The source now calculates from the signing lease rather than posted dues.
  c:=c||jsonb_build_object('rentalTermsVersion',1,'rentAdjustments','[]'::jsonb,'freeMonthApproved',false,
   'rentEntitlement',jsonb_build_object('version',1,'startDate',current_date::text,'firstPeriodPolicy','manual_first_period','manualFirstPeriodAmount',rent+credit));
  if credit>0 then
   credit_id:=gen_random_uuid();
   insert into private.aqari_tenant_ledger_entries(id,workspace_id,tenant_id,lease_id,direction,kind,amount,occurred_on,reason,source_type,source_id,actor_id)
    values(credit_id,w,tenant,l,'credit','opening_credit',credit,current_date,'Synthetic credit fixture','execution-projection-test',credit_id::text,actor);
   insert into private.aqari_credit_allocations(id,workspace_id,credit_entry_id,lease_id,period,amount,actor_id)
    values(gen_random_uuid(),w,credit_id,l,date_trunc('month',current_date),credit,actor);
  end if;
  rno:='';
  ledger:=jsonb_build_object('transactionNo','TEST-TX-'||n,'method','نقدي');
  receipt:=jsonb_build_object('transactionNo','TEST-TX-'||n,'record',jsonb_build_array('','','','','','','','','','نقدي'));
  if rent>0 then
   actual:=public.aqari_reserve_rent_receipt_serial(w,ref,sid,extract(year from (now() at time zone 'Asia/Kuwait'))::integer);rno:=actual->>'receipt_no';
   insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
    values(rid,w,l,rno,rent,date_trunc('month',current_date),current_date,'paid','نقدي',ledger,receipt);
  end if;
  update public.aqari_leases set snapshot=c where id=l;
  insert into private.aqari_rent_due_periods(workspace_id,lease_id,period,due_amount,paid_amount,balance,status,source_hash,credit_amount)
   values(w,l,date_trunc('month',current_date),rent+credit,rent,0,'paid',repeat('a',64),credit)
   on conflict(workspace_id,lease_id,period) do update set due_amount=excluded.due_amount,paid_amount=excluded.paid_amount,balance=0,status='paid',credit_amount=excluded.credit_amount;
  -- Seed the package builder's signing-state input, preserving all INSERT guards.
  delete from public.aqari_app_state where workspace_id=w;
  insert into public.aqari_app_state(workspace_id,payload) values(w,jsonb_build_object('contractsV202',jsonb_build_array(c)));
  package_source:=public.aqari_contract_execution_package_source(w,ref,sid,did,now(),rno,case when rent>0 then (actual->>'contract_sequence')::integer else null end);
  signed_c:=package_source->'signed_contract_snapshot';
  insert into private.aqari_contract_execution_packages(id,workspace_id,settlement_id,contract_ref,contract_no,actor_id,prepared_at,expires_at,source,receipt_artifacts,tenant_pdf_bytes,tenant_pdf_sha256,owner_pdf_bytes,owner_pdf_sha256,receipt_pdf_bytes,receipt_pdf_sha256,renderer_version)
   values(pid,w,sid,ref,expected_no,actor,now(),now()+interval '15 minutes',package_source,case when rent>0 then jsonb_build_object('receipt',receipt,'ledger',ledger) else null end,test_pdf,encode(sha256(test_pdf),'hex'),test_pdf,encode(sha256(test_pdf),'hex'),case when rent>0 then test_pdf else null end,case when rent>0 then encode(sha256(test_pdf),'hex') else null end,'local-projection-fixture');
  e:=jsonb_build_object('id',sid,'executionPackageId',pid,'contractDocumentId',did,'contractDocumentVersionId',gen_random_uuid(),'contractDocumentEventId',gen_random_uuid(),'contractId',ref,'tenantId',tenant::text,'contractNo',expected_no,'property',c->>'property','unit',c->>'unit','onDate',current_date::text,'components',jsonb_build_object('rent',rent,'deposit',deposit,'advance',0,'fees',0,'total',rent+deposit),'method',case when rent=0 then 'none' else 'cash' end,'transactionNo',case when rent=0 then '' else 'TEST-TX-'||n end,'rentReceiptNo',rno,'zeroReason',case when rent=0 then 'Synthetic free period' else '' end);
  if rent>0 then e:=e||jsonb_build_object('contractReceiptSequence',(actual->>'contract_sequence')::integer);end if;
  before_data:=jsonb_build_object('contractsV202',jsonb_build_array(c),'contractExecutionSettlementsV267','[]'::jsonb);
  after_data:=jsonb_build_object('contractsV202',jsonb_build_array(signed_c),'contractExecutionSettlementsV267',jsonb_build_array(e));
  update public.aqari_leases set status='signed',snapshot=signed_c where id=l;
  insert into private.aqari_rent_due_periods(workspace_id,lease_id,period,due_amount,paid_amount,balance,status,source_hash,credit_amount)
   values(w,l,date_trunc('month',current_date),rent+credit,rent,0,'paid',repeat('a',64),credit)
   on conflict(workspace_id,lease_id,period) do update set due_amount=excluded.due_amount,paid_amount=excluded.paid_amount,balance=0,status='paid',credit_amount=excluded.credit_amount;
  delete from public.aqari_app_state where workspace_id=w;
  insert into public.aqari_app_state(workspace_id,payload) values(w,after_data);
  insert into execution_probe values(w,before_data);
  select count(*) into before_count from private.aqari_official_document_series where workspace_id=w;
  begin
   update execution_probe set payload=jsonb_set(after_data,'{contractExecutionSettlementsV267,0,components,total}','999') where payload=before_data;
   raise exception 'INVALID_TOTAL_ACCEPTED';
  exception when check_violation then if sqlerrm<>'EXECUTION_TOTAL_MISMATCH' then raise;end if;end;
  if exists(select 1 from private.aqari_contract_execution_settlements where id=sid) or (select count(*) from private.aqari_official_document_series where workspace_id=w)<>before_count then raise exception 'FAILED_TRANSACTION_LEFT_WRITES';end if;
  begin
   insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
    values(did,w,'rental_contract','CT-'||expected_no,'lease',l,'issued',1,actor);
   insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name)
    values(gen_random_uuid(),w,did,1,1,'Unreserved','Unreserved','{}',repeat('a',64),actor,'Synthetic execution manager');
   raise exception 'UNRESERVED_DOCUMENT_ACCEPTED';
  exception when check_violation then if sqlerrm<>'DOCUMENT_RESERVED_NUMBER_REQUIRED' then raise;end if;end;
  begin
   insert into private.aqari_official_number_reservations(id,workspace_id,document_no,kind,entity_id,actor_id)
    values(did,w,package_source#>>'{tenant_document,document_no}','rental_contract',l,actor);
   insert into private.aqari_official_document_series(id,workspace_id,kind,document_no,entity_type,entity_id,status,current_version,created_by)
    values(did,w,'rental_contract',package_source#>>'{tenant_document,document_no}','lease',l,'issued',1,actor);
   insert into private.aqari_official_document_versions(id,workspace_id,series_id,version,template_version,title,body,payload,content_sha256,issued_by,issued_by_name,issued_at)
    values(gen_random_uuid(),w,did,1,(package_source#>>'{tenant_document,template_version}')::integer,
     package_source#>>'{tenant_document,title}',(package_source#>>'{tenant_document,body}')||' altered',package_source#>'{tenant_document,payload}',
     package_source#>>'{tenant_document,content_sha256}',actor,package_source#>>'{tenant_document,issued_by_name}',now());
   raise exception 'ALTERED_DOCUMENT_ACCEPTED';
  exception when check_violation then if sqlerrm<>'EXECUTION_DOCUMENT_CONTENT_MISMATCH' then raise;end if;end;
  -- No manager identity means no write, even in the isolated projection.
  begin
   perform set_config('request.jwt.claim.sub','',true);
   update execution_probe set payload=after_data where payload=before_data;
   raise exception 'UNAUTHENTICATED_EXECUTION_ACCEPTED';
  exception when insufficient_privilege then if sqlerrm<>'GENERAL_MANAGER_EXECUTION_APPROVAL_REQUIRED' then raise;end if;end;
  -- A late package mismatch must roll back canonical docs, reservations, and deposit.
  begin
   update execution_probe set payload=jsonb_set(after_data,'{contractExecutionSettlementsV267,0,executionPackageId}',to_jsonb(gen_random_uuid()::text)) where payload=before_data;
   raise exception 'WRONG_PACKAGE_ACCEPTED';
  exception when check_violation then if sqlerrm<>'EXECUTION_PACKAGE_UNAVAILABLE' then raise;end if;end;
  if exists(select 1 from private.aqari_contract_execution_settlements where id=sid) or exists(select 1 from private.aqari_official_number_reservations where id=did) or exists(select 1 from private.aqari_deposit_entries where workspace_id=w and lease_id=l) then raise exception 'LATE_FAILURE_LEFT_WRITES';end if;
  update execution_probe set payload=after_data where payload=before_data;
  actual:=public.aqari_contract_execution_artifacts(w,ref);
  if actual->>'settlement_id'<>sid::text or actual->>'contract_no'<>expected_no or actual->>'rent_receipt_no'<>rno then raise exception 'ARTIFACT_READBACK_MISMATCH';end if;
  if (select count(*) from private.aqari_official_document_series where workspace_id=w)<>before_count+3 then raise exception 'EXPECTED_CANONICAL_AND_TWO_COPIES';end if;
  if (select count(*) from private.aqari_official_document_versions where workspace_id=w and payload->>'canonicalSeriesId'=did::text)<>2 then raise exception 'COPIES_NOT_LINKED';end if;
  if (select count(*) from private.aqari_official_number_reservations where workspace_id=w and entity_id=l and kind='rental_contract')<>3 then raise exception 'THREE_RESERVED_NUMBERS_REQUIRED';end if;
  if (select count(*) from private.aqari_official_pdf_artifacts a join private.aqari_official_document_series s on s.id=a.series_id where s.entity_id=l and a.pdf_bytes=test_pdf)<>2 then raise exception 'TWO_EXACT_PDF_ARCHIVES_REQUIRED';end if;
  if not exists(select 1 from private.aqari_contract_execution_package_consumptions where package_id=pid) then raise exception 'PACKAGE_NOT_CONSUMED';end if;
  if rent>0 and not exists(select 1 from private.aqari_rent_receipt_pdf_artifacts where payment_id=rid and pdf_bytes=test_pdf) then raise exception 'RECEIPT_PDF_NOT_ARCHIVED';end if;
  if (select count(distinct body) from private.aqari_official_document_versions where workspace_id=w and payload->>'canonicalSeriesId'=did::text)<>2 then raise exception 'COPY_LABELS_NOT_DISTINCT';end if;
  update execution_probe set payload=payload where payload=after_data;
  if (select count(*) from private.aqari_official_document_series where workspace_id=w)<>before_count+3 then raise exception 'RETRY_DUPLICATED_DOCUMENTS';end if;
  begin update private.aqari_contract_execution_settlements set zero_reason='changed' where id=sid;raise exception 'SETTLEMENT_MUTABLE';exception when check_violation then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
  begin delete from private.aqari_contract_execution_artifacts where settlement_id=sid;raise exception 'ARTIFACT_DELETABLE';exception when check_violation then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
  begin delete from private.aqari_contract_execution_package_consumptions where package_id=pid;raise exception 'PACKAGE_CONSUMPTION_DELETABLE';exception when check_violation then if sqlerrm<>'IMMUTABLE_LEDGER_ENTRY' then raise;end if;end;
  if rent=0 and exists(select 1 from public.aqari_rent_payments where workspace_id=w and lease_id=l) then raise exception 'FREE_PERIOD_FAKE_RECEIPT';end if;
  if rent>0 and not exists(select 1 from private.aqari_rent_receipt_serial_reservations where receipt_no=rno and consumed_at is not null) then raise exception 'RESERVATION_NOT_CONSUMED';end if;
  raise notice 'PASS projection case %: linked reservations, two PDFs, receipt when due, rollback and idempotency',n;
 end loop;
end $$;
rollback;
