-- Synthetic actors, source contracts and documents only. Everything rolls back.
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('vacating-manager@example.invalid','مدير اختبار الإخلاء','general_manager','aqari-v267-staging'),
 ('vacating-viewer@example.invalid','مشاهد اختبار الإخلاء','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('f267e000-0000-4000-8000-000000000001','vacating-manager@example.invalid',now()),
 ('f267e000-0000-4000-8000-000000000002','vacating-viewer@example.invalid',now());
select set_config('request.jwt.claim.sub','f267e000-0000-4000-8000-000000000001',true);
select set_config('vacating.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
set local role authenticated;
do $$
declare w uuid:=current_setting('vacating.w')::uuid;s jsonb;d jsonb;t jsonb;c jsonb;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 t:='{"id":"vacating-test-tenant","nameAr":"مستأجر اختبار الإخلاء","nameEn":"Vacating Test Tenant","civilId":"987654321234","passportNo":"TEST-VACATING","phone":"55559991","nationality":"اختبار","email":"vacating-tenant@example.invalid","attachments":[]}'::jsonb;
 c:='{"id":"vacating-test-contract","contract_no":"TEST-VC-1","source":"v267-cloud","detailsVersion":2,"rentalTermsVersion":1,"tenantId":"vacating-test-tenant","tenant":"مستأجر اختبار الإخلاء","property":"عقار اختبار الإخلاء","unit":"VC-01","floor":"الأول","contractRent":100,"discount":0,"rent":100,"deposit":50,"advance":0,"cleaningFee":0,"start_date":"2026-01-01","end_date":"2026-12-31","status":"draft","accountant":"محاسب اختبار","contractReceived":"لم يستلم","receivedAt":"","evictionNotice":"لم يُبلّغ","depositReceivedOn":"","freeMonthApproved":false,"freeMonthPeriod":"","rentAdjustments":[]}'::jsonb||jsonb_build_object('tenantProfile',t,'writtenOn',to_char(now() at time zone 'Asia/Kuwait','YYYY-MM-DD'));
 d:=jsonb_set(d,'{properties}',coalesce(d->'properties','[]')||'[["عقار اختبار الإخلاء"]]');
 d:=jsonb_set(d,'{tenantProfilesV267}',coalesce(d->'tenantProfilesV267','[]')||jsonb_build_array(t));
 d:=jsonb_set(d,'{contractsV202}',coalesce(d->'contractsV202','[]')||jsonb_build_array(c));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
end $$;
reset role;
select set_config('vacating.lease',(select id::text from public.aqari_leases where workspace_id=current_setting('vacating.w')::uuid and external_ref='vacating-test-contract'),true);
-- Metadata-only synthetic proof: this SQL test does not attest a real signature/upload.
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_bucket,storage_path,status,size_bytes,created_by,checksum_sha256,metadata)
 values('f267e100-0000-4000-8000-000000000001',current_setting('vacating.w')::uuid,'VC-TEST-DOC','signed_contract','lease','vacating-test-contract','محضر اصطناعي للفحص','fixture.pdf','application/pdf','aqari-documents',current_setting('vacating.w')||'/f267e100-0000-4000-8000-000000000001.pdf','draft',null,auth.uid(),null,'{"purpose":"vacating_handover"}');
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('vacating.w')||'/f267e100-0000-4000-8000-000000000001.pdf','{"size":12,"mimetype":"application/pdf"}');
update public.aqari_documents set status='uploaded',size_bytes=12,checksum_sha256=repeat('a',64) where id='f267e100-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare s jsonb;d jsonb;w uuid:=current_setting('vacating.w')::uuid;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'='vacating-test-contract' then x||'{"status":"signed","changeReason":"اعتماد عقد الاختبار"}' else x end) from jsonb_array_elements(d->'contractsV202')x));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
end $$;
reset role;
create function pg_temp.vacating_expect(a text,d jsonb,msg text) returns void language plpgsql security invoker as $$
begin
 begin perform public.aqari_vacating_register(current_setting('vacating.w')::uuid,a,d);raise exception 'UNEXPECTED_SUCCESS:%',msg;
 exception when others then if sqlerrm<>msg then raise;end if;end;
end $$;
grant execute on function pg_temp.vacating_expect(text,jsonb,text) to authenticated;
set local role authenticated;
do $$
declare w uuid:=current_setting('vacating.w')::uuid;l uuid:=current_setting('vacating.lease')::uuid;d jsonb;s jsonb;r jsonb;issue jsonb;
begin
 s:=public.aqari_vacating_register(w,'statement',jsonb_build_object('lease_id',l,'vacated_on','2026-01-31'));
 if s->>'rent_remaining'<>'100.000' or s->>'deposit_balance'<>'0.000' then raise exception 'UNRECEIVED_MONEY_COUNTED';end if;
 d:=jsonb_build_object('id','f267e200-0000-4000-8000-000000000001','lease_id',l,'revision',0,'vacated_on','2026-01-31','keys_received',false,'inspection','فحص وحدة اصطناعي؛ لا توقيع فعلي','obligations','[]'::jsonb,'document_ids','[]'::jsonb,'reason','إنشاء محضر اختبار');
 r:=public.aqari_vacating_register(w,'save',d);
 if r->>'revision'<>'1' or r->>'state'<>'draft' then raise exception 'DRAFT_SAVE_FAILED';end if;
 if public.aqari_vacating_register(w,'save',d)<>r then raise exception 'SAVE_RETRY_DUPLICATED';end if;
 if public.aqari_vacating_register(w,'get',jsonb_build_object('lease_id',l))<>r then raise exception 'READBACK_CHANGED';end if;
 if public.aqari_vacating_register(w,'operation',jsonb_build_object('id',d->>'id'))->'result'<>r then raise exception 'LOST_REPLY_RECOVERY_FAILED';end if;
 perform pg_temp.vacating_expect('save',d||'{"reason":"طلب مختلف بنفس المعرف"}','VACATING_REQUEST_CONFLICT');
 perform pg_temp.vacating_expect('save',d||'{"id":"f267e200-0000-4000-8000-000000000002"}','VACATING_STALE_REVISION');
 issue:=jsonb_build_object('id','f267e300-0000-4000-8000-000000000001','lease_id',l,'revision',1,'reason','اعتماد محضر اختبار','exception_reason','','review_token',s->>'review_token');
 perform pg_temp.vacating_expect('issue',issue,'VACATING_HANDOVER_REQUIRED');
 d:=d||'{"id":"f267e200-0000-4000-8000-000000000002","revision":1,"keys_received":true,"document_ids":["f267e100-0000-4000-8000-000000000001"]}';
 perform public.aqari_vacating_register(w,'save',d);
 issue:=issue||'{"revision":2}';
 perform pg_temp.vacating_expect('issue',issue,'VACATING_OPEN_OBLIGATIONS');
 perform pg_temp.vacating_expect('issue',issue||'{"review_token":"stale"}','VACATING_REVIEW_CHANGED');
 -- Real ledger movement, synthetic values: an outstanding tenant deposit blocks
 -- even a manager exception. It must be refunded by the separate ledger.
 perform public.aqari_deposit_register(w,'receive',jsonb_build_object('id','f267e400-0000-4000-8000-000000000001','lease_id',l,'amount','50.000','on_date','2026-01-01','method','cash'));
 s:=public.aqari_vacating_register(w,'statement',jsonb_build_object('lease_id',l,'vacated_on','2026-01-31'));
 perform pg_temp.vacating_expect('issue',issue||jsonb_build_object('review_token',s->>'review_token','exception_reason','استثناء اصطناعي موثق للتجربة'),'VACATING_REFUND_REQUIRED');
 perform public.aqari_deposit_register(w,'refund',jsonb_build_object('id','f267e400-0000-4000-8000-000000000002','lease_id',l,'amount','50.000','on_date','2026-01-31','method','cash','reason','رد اصطناعي للفحص'));
 s:=public.aqari_vacating_register(w,'statement',jsonb_build_object('lease_id',l,'vacated_on','2026-01-31'));
 issue:=issue||jsonb_build_object('review_token',s->>'review_token','exception_reason','استثناء اصطناعي موثق: رصيد الإيجار باق ظاهر في البيان');
 r:=public.aqari_vacating_register(w,'issue',issue);
 if r->>'state'<>'issued' or r->>'certificate_no' is null or r->>'issued_by'<>auth.uid()::text or r#>>'{snapshot,rent_remaining}'<>'100.000' then raise exception 'ISSUE_AUDIT_OR_BALANCE_MISSING';end if;
 if public.aqari_vacating_register(w,'issue',issue)<>r then raise exception 'ISSUE_RETRY_CHANGED_CERTIFICATE';end if;
 if (select status from public.aqari_leases where id=l)<>'expired' or (select vacated_on from public.aqari_leases where id=l)<>'2026-01-31' then raise exception 'OCCUPANCY_NOT_ENDED';end if;
 if not exists(select 1 from jsonb_array_elements(public.aqari_read_state_v267(w)#>'{payload,contractsV202}')x where x->>'id'='vacating-test-contract' and x->>'status'='expired') then raise exception 'UI_CANONICAL_STATE_NOT_ENDED';end if;
 perform pg_temp.vacating_expect('save',d||'{"id":"f267e200-0000-4000-8000-000000000003","revision":3}','VACATING_IMMUTABLE');
 perform set_config('vacating.issued',r::text,true);
end $$;
select set_config('request.jwt.claim.sub','f267e000-0000-4000-8000-000000000002',true);
select pg_temp.vacating_expect('list','{}','ACCESS_DENIED');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.vacating_expect('list','{}','ACCESS_DENIED');
reset role;
do $$
begin
 begin update private.aqari_vacating set inspection='changed' where lease_id=current_setting('vacating.lease')::uuid;raise exception 'ISSUED_MUTATED';exception when check_violation then if sqlerrm<>'VACATING_IMMUTABLE' then raise;end if;end;
 begin delete from private.aqari_vacating_operations;raise exception 'AUDIT_DELETED';exception when check_violation then if sqlerrm<>'VACATING_IMMUTABLE' then raise;end if;end;
 begin update public.aqari_leases set end_date='2027-01-01' where id=current_setting('vacating.lease')::uuid;raise exception 'SETTLED_CONTRACT_CHANGED';exception when check_violation then if sqlerrm<>'VACATING_CONTRACT_IMMUTABLE' then raise;end if;end;
end $$;
-- A subsequent tenancy starts the next day on the same unit, while an overlap
-- on the vacating day is still rejected. Both original contracts remain stored.
select set_config('request.jwt.claim.sub','f267e000-0000-4000-8000-000000000001',true);
do $$
declare l public.aqari_leases;
begin
 select * into l from public.aqari_leases where id=current_setting('vacating.lease')::uuid;
 begin
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values('f267e500-0000-4000-8000-000000000001',l.workspace_id,'overlap-test',l.tenant_id,l.unit_id,'OVERLAP-TEST','2026-01-31','2026-02-28',100,0,'signed','{}');
  raise exception 'VACATING_DAY_OVERLAP_ACCEPTED';
 exception when exclusion_violation then null;end;
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('vacating.w')::uuid;s jsonb;d jsonb;c jsonb;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 select x into c from jsonb_array_elements(d->'contractsV202')x where x->>'id'='vacating-test-contract';
 c:=(c-'vacatedOn')||'{"id":"vacating-next-contract","contract_no":"TEST-VC-2","start_date":"2026-02-01","status":"draft","freeMonthApproved":true,"freeMonthPeriod":"2026-02","changeReason":"عقد لاحق بعد الإخلاء"}';
 d:=jsonb_set(d,'{contractsV202}',d->'contractsV202'||jsonb_build_array(c));perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
end $$;
reset role;
insert into public.aqari_documents(id,workspace_id,document_no,document_type,entity_type,entity_ref,title,original_filename,mime_type,storage_bucket,storage_path,status,size_bytes,created_by,metadata)
 values('f267e100-0000-4000-8000-000000000002',current_setting('vacating.w')::uuid,'VC-TEST-DOC-2','signed_contract','lease','vacating-next-contract','محضر اصطناعي ثان','fixture2.pdf','application/pdf','aqari-documents',current_setting('vacating.w')||'/f267e100-0000-4000-8000-000000000002.pdf','draft',null,auth.uid(),'{"purpose":"vacating_handover"}');
insert into storage.objects(bucket_id,name,metadata) values('aqari-documents',current_setting('vacating.w')||'/f267e100-0000-4000-8000-000000000002.pdf','{"size":12,"mimetype":"application/pdf"}');
update public.aqari_documents set status='uploaded',size_bytes=12,checksum_sha256=repeat('b',64) where id='f267e100-0000-4000-8000-000000000002';
set local role authenticated;
do $$
declare w uuid:=current_setting('vacating.w')::uuid;s jsonb;d jsonb;l uuid;r jsonb;statement jsonb;
begin
 s:=public.aqari_read_state_v267(w);d:=s->'payload';
 d:=case when d->>'format'='aqari-cloud-state-v1' then d#>'{snapshot,values,aqari_v30}' when d->>'schema'='aqari-local-snapshot-v1' then d#>'{values,aqari_v30}' else d end;
 d:=jsonb_set(d,'{contractsV202}',(select jsonb_agg(case when x->>'id'='vacating-next-contract' then x||'{"status":"signed","changeReason":"اعتماد العقد اللاحق"}' else x end) from jsonb_array_elements(d->'contractsV202')x));
 perform public.aqari_save_state_v267(w,d,(s->>'revision')::bigint);
 select id into l from public.aqari_leases where workspace_id=w and external_ref='vacating-next-contract';
 statement:=public.aqari_vacating_register(w,'statement',jsonb_build_object('lease_id',l,'vacated_on','2026-02-28'));
 if statement->>'rent_remaining'<>'0.000' then raise exception 'APPROVED_FREE_MONTH_IGNORED';end if;
 d:=jsonb_build_object('id','f267e200-0000-4000-8000-000000000010','lease_id',l,'revision',0,'vacated_on','2026-02-28','keys_received',true,'inspection','محضر إخلاء اصطناعي ثان','obligations','[]'::jsonb,'document_ids','["f267e100-0000-4000-8000-000000000002"]'::jsonb,'reason','إنشاء محضر خال من الالتزامات');
 perform public.aqari_vacating_register(w,'save',d);
 r:=public.aqari_vacating_register(w,'issue',jsonb_build_object('id','f267e300-0000-4000-8000-000000000010','lease_id',l,'revision',1,'reason','إصدار دون استثناء','exception_reason','','review_token',statement->>'review_token'));
 if r#>>'{snapshot,exception_reason}'<>'' or r#>>'{snapshot,rent_remaining}'<>'0.000' or r->>'state'<>'issued' then raise exception 'ORDINARY_CLEARANCE_FAILED';end if;
 if (select count(*) from public.aqari_leases where workspace_id=w and external_ref in('vacating-test-contract','vacating-next-contract'))<>2 then raise exception 'TENANCY_HISTORY_LOST';end if;
end $$;
reset role;
rollback;
select 'PASS: draft/save/readback/CAS/idempotent recovery; manager-only access; keys/documents/deposit/open-obligation guards; explicit exception audit; immutable issue snapshot and canonical expired contract; no fixtures retained' result;
