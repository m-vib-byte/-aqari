begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('release-manager@example.invalid','مدير اختبار إطلاق الوحدة','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267f000-0000-4000-8000-000000000001','release-manager@example.invalid',now());
select set_config('request.jwt.claim.sub','f267f000-0000-4000-8000-000000000001',true);
select set_config('release.test.workspace',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active limit 1),true);

insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('f267f100-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'release-property','عقار اختبار إطلاق الوحدة','{}');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('f267f200-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'release-tenant-a','مستأجر الإخلاء','999000111441','+96599994441','{}'),
 ('f267f200-0000-4000-8000-000000000002',current_setting('release.test.workspace')::uuid,'release-tenant-b','مستأجر لاحق','999000111442','+96599994442','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
 ('f267f300-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'f267f100-0000-4000-8000-000000000001','501');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267f400-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'release-lease-a','f267f200-0000-4000-8000-000000000001','f267f300-0000-4000-8000-000000000001','TEST-RELEASE-A','2026-01-01','2026-12-31',100,50,'signed','{"rent":100,"rentalTermsVersion":"1","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}');
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('f267f500-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'f267f400-0000-4000-8000-000000000001','RELEASE-RENT',100,'2026-01-01','2026-01-05','paid','cash','{}','{}');

create function pg_temp.release_expect(rev bigint,msg text) returns void language plpgsql security invoker as $$
begin
 begin perform public.aqari_vacating_release(current_setting('release.test.workspace')::uuid,'f267f400-0000-4000-8000-000000000001',rev);raise exception 'UNEXPECTED_SUCCESS:%',msg;
 exception when others then if sqlerrm<>msg then raise;end if;end;
end $$;
grant execute on function pg_temp.release_expect(bigint,text) to authenticated;

set local role authenticated;
do $$
declare w uuid:=current_setting('release.test.workspace')::uuid;r jsonb;rev bigint;
begin
 perform public.aqari_deposit_register(w,'receive','{"id":"f267f600-0000-4000-8000-000000000001","lease_id":"f267f400-0000-4000-8000-000000000001","amount":"50.000","on_date":"2026-01-10","method":"cash","reference":"","reason":""}');
 r:=public.aqari_vacating_settlement(w,'save','{"lease_id":"f267f400-0000-4000-8000-000000000001","vacate_date":"2026-01-31","keys_returned":true,"inspection_completed":true,"meters_recorded":true,"damage_amount":"0.000","damage_notes":"","charges_resolved":true,"charges_reference":"release-review-123","revision":0}');
 rev:=(r#>>'{settlement,revision}')::bigint;
 r:=public.aqari_vacating_settlement(w,'finalize',jsonb_build_object('lease_id','f267f400-0000-4000-8000-000000000001','revision',rev));
 rev:=(r#>>'{settlement,revision}')::bigint;
 perform public.aqari_deposit_register(w,'refund','{"id":"f267f600-0000-4000-8000-000000000002","lease_id":"f267f400-0000-4000-8000-000000000001","amount":"50.000","on_date":"2026-01-31","method":"cash","reference":"","reason":"رد التأمين عند الإخلاء"}');
 r:=public.aqari_vacating_settlement(w,'clearance',jsonb_build_object('lease_id','f267f400-0000-4000-8000-000000000001','revision',rev,'exception_reason',''));
 if r#>>'{settlement,status}'<>'cleared' then raise exception 'CLEARANCE_REQUIRED_BEFORE_RELEASE';end if;
 rev:=(r#>>'{settlement,revision}')::bigint;
 perform set_config('release.test.revision',rev::text,true);
 perform pg_temp.release_expect(rev,'VACATING_HANDOVER_REQUIRED');
end $$;
reset role;

-- Synthetic handover evidence follows the same reserve -> storage -> finalize path as the app.
-- Storage metadata is synthetic here; this test does not claim a real user file upload or device acceptance.
set local role authenticated;
do $$
declare w uuid:=current_setting('release.test.workspace')::uuid;doc record;
begin
 select * into doc from public.aqari_reserve_document(
  w,'mobile_scan','lease','release-lease-a','محضر تسليم اصطناعي','release-fixture.pdf','application/pdf',
  '{"document_category":"vacating_inspection","purpose":"vacating_handover"}'::jsonb);
 perform set_config('release.test.document_id',doc.document_id::text,true);
 perform set_config('release.test.document_path',doc.storage_path,true);
end $$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values(
 'aqari-documents',current_setting('release.test.document_path'),'{"size":12,"mimetype":"application/pdf"}');
set local role authenticated;
select public.aqari_finalize_document(
 current_setting('release.test.document_id')::uuid,12,'application/pdf',repeat('a',64));
reset role;

-- A real open maintenance row must block release even after clearance and handover document evidence.
insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,status,cost,created_by)
 values('f267f800-0000-4000-8000-000000000001',current_setting('release.test.workspace')::uuid,'f267f400-0000-4000-8000-000000000001','f267f200-0000-4000-8000-000000000001','طلب صيانة اصطناعي قبل الإخلاء','open',0,auth.uid());
set local role authenticated;
select pg_temp.release_expect(current_setting('release.test.revision')::bigint,'VACATING_OPEN_MAINTENANCE');
reset role;
update public.aqari_maintenance_requests set status='completed' where id='f267f800-0000-4000-8000-000000000001';

set local role authenticated;
do $$
declare w uuid:=current_setting('release.test.workspace')::uuid;r jsonb;rev bigint:=current_setting('release.test.revision')::bigint;overlap_blocked boolean:=false;
begin
 r:=public.aqari_vacating_release(w,'f267f400-0000-4000-8000-000000000001',rev);
 if r#>>'{settlement,status}'<>'released' or r#>>'{lease,status}'<>'expired' or r#>>'{lease,vacated_on}'<>'2026-01-31' then raise exception 'LEASE_RELEASE_FAILED';end if;
 if r#>>'{lease,contract_end_date}'<>'2026-12-31' then raise exception 'ORIGINAL_END_DATE_CHANGED';end if;
 if jsonb_array_length(coalesce(r->'handover_documents','[]'))<>1 then raise exception 'HANDOVER_EVIDENCE_NOT_SNAPSHOTTED';end if;
 -- Lost-response/idempotence: same completed release remains readable with the pre-release revision.
 r:=public.aqari_vacating_release(w,'f267f400-0000-4000-8000-000000000001',rev);
 if r#>>'{lease,vacated_on}'<>'2026-01-31' then raise exception 'RELEASE_RECOVERY_FAILED';end if;

 -- Unit becomes available the following day; vacate day remains occupied.
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
 ('f267f400-0000-4000-8000-000000000002',w,'release-lease-b','f267f200-0000-4000-8000-000000000002','f267f300-0000-4000-8000-000000000001','TEST-RELEASE-B','2026-02-01','2026-12-31',100,50,'signed','{}');
 begin
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot) values
  ('f267f400-0000-4000-8000-000000000003',w,'release-lease-overlap','f267f200-0000-4000-8000-000000000002','f267f300-0000-4000-8000-000000000001','TEST-RELEASE-OVERLAP','2026-01-31','2026-02-15',100,50,'signed','{}');
 exception when exclusion_violation then overlap_blocked:=true;
 end;
 if not overlap_blocked then raise exception 'VACATE_DAY_OVERLAP_ALLOWED';end if;
end $$;
reset role;

-- Historical contract identity/terms become immutable after release.
do $$
begin
 begin
  update public.aqari_leases set end_date='2027-01-01' where id='f267f400-0000-4000-8000-000000000001';
  raise exception 'RELEASED_CONTRACT_MUTATED';
 exception when check_violation then
  if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;
 end;
end $$;

rollback;
select 'PASS: clearance precedes release; verified handover evidence required; open maintenance blocks; contract end preserved; released lease immutable; unit frees next day; vacate-day overlap blocked; repeated release idempotent' result;
