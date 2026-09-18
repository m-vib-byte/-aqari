-- Positive synthetic MFA fixture: include a current supported second-factor event.
-- Negative AAL1/expired-MFA cases and all production guards remain unchanged.
-- Isolated synthetic PostgreSQL acceptance. Every fixture write rolls back.
-- Apply after tenant-rating-quarter-hardening.sql (also run twice for retry).
begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('rating-manager@example.invalid','مدير اختبار التقييم','general_manager','aqari-v267-staging'),
 ('rating-accountant@example.invalid','محاسب اختبار التقييم','accountant','aqari-v267-staging'),
 ('rating-tenant@example.invalid','مستأجر اختبار التقييم','viewer','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values
 ('76520000-0000-4000-8000-000000000001','rating-manager@example.invalid',now()),
 ('76520000-0000-4000-8000-000000000002','rating-accountant@example.invalid',now()),
 ('76520000-0000-4000-8000-000000000003','rating-tenant@example.invalid',now());
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('rating.w',(select workspace_id::text from public.aqari_memberships where user_id=auth.uid() and is_active),true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('76520000-0000-4000-8000-000000000010',current_setting('rating.w')::uuid,'rating-property','عقار اختبار التقييم','{}');

create function pg_temp.rating_fixture(label text,starts date,ends date,terms jsonb default '{}',vacated date default null,lease_status text default 'signed',tenant_label text default null)
returns void language plpgsql as $$
declare w uuid:=current_setting('rating.w')::uuid;t uuid:=md5('rating-tenant-'||coalesce(tenant_label,label))::uuid;
 u uuid:=md5('rating-unit-'||label)::uuid;l uuid:=md5('rating-lease-'||label)::uuid;lease_row public.aqari_leases;
begin
 insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(u,w,'76520000-0000-4000-8000-000000000010','RATING-'||label);
 if to_regprocedure('public.aqari_unit_readiness_register(uuid,text,jsonb)') is not null then
  perform public.aqari_unit_readiness_register(w,'record',jsonb_build_object('id',md5('rating-ready-'||label)::uuid,
   'property_id','76520000-0000-4000-8000-000000000010','unit_no','RATING-'||label,'expected_revision',0,
   'state','ready','inspected_on',current_date::text,'source_ref','محضر جاهزية اصطناعي للتقييم','reason','تكوين عقد اختبار التقييم'));
 end if;
 insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)
 values(t,w,'rating-tenant-'||coalesce(tenant_label,label),'Synthetic '||coalesce(tenant_label,label),
  lpad((('x'||left(md5(t::text),8))::bit(32)::bigint)::text,12,'0'),
  lpad((('x'||left(md5(t::text),8))::bit(32)::bigint)::text,10,'0'),'{}') on conflict(id)do nothing;
 insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot,vacated_on)
 values(l,w,'rating-lease-'||label,t,u,'RATING-'||label,starts,ends,100,0,lease_status,terms,null);
 if vacated is not null then
  if to_regprocedure('private.aqari_vacating_lease_guard()') is not null then
   -- This is a historical synthetic rating input, not acceptance of an issued
   -- clearance workflow. The real guard must first reject an unsupported date.
   begin
    update public.aqari_leases set vacated_on=vacated where workspace_id=w and id=l;
    raise exception 'RATING_VACATING_DATE_WITHOUT_HISTORY_ACCEPTED';
   exception when check_violation then if sqlerrm<>'VACATING_ISSUE_REQUIRED' then raise;end if;end;
   select * into strict lease_row from public.aqari_leases where workspace_id=w and id=l;
   insert into private.aqari_vacating(id,workspace_id,lease_id,revision,state,vacated_on,keys_received,
    inspection,obligations,document_ids,reason,created_by,updated_by,issued_by,issued_name,issued_at,certificate_no,snapshot)
   values(md5('rating-vacating-'||label)::uuid,w,l,2,'issued',vacated,true,
    'تاريخ اصطناعي لاختبار حساب النجوم؛ ليس محضر تسليم فعلي','[]','{}',
    'حالة إخلاء تاريخية اصطناعية لاختبار استبعاد الأشهر اللاحقة',auth.uid(),auth.uid(),auth.uid(),
    'مدير اختبار التقييم',now(),'TEST-RATING-'||label,
    jsonb_build_object('lease',to_jsonb(lease_row)-'import_source'-'snapshot','contract_snapshot',lease_row.snapshot,
     'test_fixture','historical_rating_only_not_clearance_acceptance'));
  end if;
  update public.aqari_leases set status='expired',vacated_on=vacated where workspace_id=w and id=l;
  if not exists(select 1 from public.aqari_leases where workspace_id=w and id=l and vacated_on=vacated
   and status='expired' and end_date=ends and snapshot=terms) then raise exception 'RATING_VACATING_HISTORY_MISMATCH';end if;
 end if;
end $$;
create function pg_temp.rating_payment(label text,period_date date,amount numeric default 100,payment_day integer default 5,payment_status text default 'paid',suffix text default '')
returns void language sql as $$
 insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt)
 values(md5('rating-payment-'||label||period_date::text||suffix)::uuid,current_setting('rating.w')::uuid,md5('rating-lease-'||label)::uuid,
 'RATING-'||label||period_date::text||suffix,amount,period_date,period_date+payment_day-1,payment_status,'bank','{}','{}')
$$;

-- One month, discounted rent, approved free month, actual early termination,
-- native and recorded cancellation, partial/late payments and annual cap.
select pg_temp.rating_fixture('one-month','2024-01-01','2024-01-31');
select pg_temp.rating_payment('one-month','2024-01-01');
select pg_temp.rating_fixture('discount','2024-01-01','2024-03-31','{"rentalTermsVersion":"1","rent":100,"rentAdjustments":[{"effectiveMonth":"2024-02","rent":80}]}');
select pg_temp.rating_payment('discount','2024-01-01');
select pg_temp.rating_payment('discount','2024-02-01',80);
select pg_temp.rating_payment('discount','2024-03-01',80);
select pg_temp.rating_fixture('free','2024-01-01','2024-03-31','{"rentalTermsVersion":"1","rent":100,"freeMonthApproved":true,"freeMonthPeriod":"2024-02"}');
select pg_temp.rating_payment('free','2024-01-01');
select pg_temp.rating_payment('free','2024-03-01');
select pg_temp.rating_fixture('unapproved-free','2024-01-01','2024-03-31','{"rentalTermsVersion":"1","rent":100,"freeMonthApproved":false,"freeMonthPeriod":"2024-02"}');
select pg_temp.rating_payment('unapproved-free','2024-01-01');
select pg_temp.rating_payment('unapproved-free','2024-03-01');
select pg_temp.rating_fixture('vacated','2024-01-01','2024-12-31','{}','2024-02-10','expired');
select pg_temp.rating_payment('vacated',p::date) from generate_series('2024-01-01'::date,'2024-12-01'::date,'1 month')p;
select pg_temp.rating_fixture(x,'2024-01-01','2024-03-31') from unnest(array['native-cancel','registered-cancel','partial','late','underpaid'])x;
select pg_temp.rating_payment(x,p::date) from unnest(array['native-cancel','registered-cancel','partial','late','underpaid'])x cross join generate_series('2024-01-01'::date,'2024-02-01'::date,'1 month')p;
select pg_temp.rating_payment('native-cancel','2024-03-01',100,5,'cancelled');
select pg_temp.rating_payment('registered-cancel','2024-03-01');
select pg_temp.rating_payment('partial','2024-03-01',40,3,'partial','-first');
select pg_temp.rating_payment('partial','2024-03-01',60,5,'partial','-second');
select pg_temp.rating_payment('late','2024-03-01',100,6);
select pg_temp.rating_payment('underpaid','2024-03-01',99.999);
select pg_temp.rating_fixture('unconfirmed-'||x,'2024-01-01','2024-03-31') from unnest(array['pending','voided','ملغى'])x;
select pg_temp.rating_payment('unconfirmed-'||x,p::date) from unnest(array['pending','voided','ملغى'])x cross join generate_series('2024-01-01'::date,'2024-02-01'::date,'1 month')p;
select pg_temp.rating_payment('unconfirmed-'||x,'2024-03-01',100,5,x) from unnest(array['pending','voided','ملغى'])x;
insert into private.aqari_receipt_cancellations(id,workspace_id,payment_id,reason,approved_by,approved_by_name,cancelled_at,snapshot)
 select '76520000-0000-4000-8000-000000000020',workspace_id,id,'إلغاء اصطناعي للتقييم',auth.uid(),'مدير اختبار',now(),to_jsonb(p)
 from public.aqari_rent_payments p where reference='RATING-registered-cancel2024-03-01';
select pg_temp.rating_fixture('parallel-'||n,'2024-01-01','2024-01-31','{}',null,'signed','parallel') from generate_series(1,3)n;
select pg_temp.rating_payment('parallel-'||n,'2024-01-01') from generate_series(1,3)n;
select pg_temp.rating_fixture('parallel-full-'||n,'2024-01-01','2024-03-31','{}',null,'signed','parallel-full') from generate_series(1,2)n;
select pg_temp.rating_payment('parallel-full-'||n,p::date) from generate_series(1,2)n cross join generate_series('2024-01-01'::date,'2024-03-01'::date,'1 month')p;
select pg_temp.rating_fixture('parallel-surplus-'||n,'2024-01-01','2024-03-31','{}',null,'signed','parallel-surplus') from generate_series(1,2)n;
select pg_temp.rating_payment('parallel-surplus-1',p::date,200) from generate_series('2024-01-01'::date,'2024-03-01'::date,'1 month')p;
select pg_temp.rating_fixture('revoked','2024-01-01','2024-03-31');
select pg_temp.rating_payment('revoked',p::date) from generate_series('2024-01-01'::date,'2024-03-01'::date,'1 month')p;
select pg_temp.rating_fixture('annual','2024-01-01','2024-12-31');
select pg_temp.rating_payment('annual',p::date) from generate_series('2024-01-01'::date,'2024-12-01'::date,'1 month')p;
select pg_temp.rating_fixture('year-boundary','2024-12-01','2025-02-28');
select pg_temp.rating_payment('year-boundary',p::date) from generate_series('2024-12-01'::date,'2025-02-01'::date,'1 month')p;
select pg_temp.rating_fixture('cancelled-lease','2024-01-01','2024-03-31','{}',null,'cancelled');
select pg_temp.rating_payment('cancelled-lease',p::date) from generate_series('2024-01-01'::date,'2024-03-01'::date,'1 month')p;
select pg_temp.rating_fixture('draft-lease','2024-01-01','2024-03-31','{}',null,'draft');
select pg_temp.rating_payment('draft-lease',p::date) from generate_series('2024-01-01'::date,'2024-03-01'::date,'1 month')p;
select pg_temp.rating_fixture('future','2199-01-01','2199-03-31');
select pg_temp.rating_payment('future',p::date) from generate_series('2199-01-01'::date,'2199-03-01'::date,'1 month')p;
insert into public.aqari_portal_accounts(user_id,workspace_id,tenant_id,is_active) values
 ('76520000-0000-4000-8000-000000000003',current_setting('rating.w')::uuid,md5('rating-tenant-discount')::uuid,true);
insert into public.aqari_workspaces(id,slug,name) values('76520000-0000-4000-8000-000000000099','rating-foreign-fixture','Foreign synthetic ratings');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values
 ('76520000-0000-4000-8000-000000000098','76520000-0000-4000-8000-000000000099','rating-foreign-tenant','Foreign synthetic tenant','765200000098','76520098','{}');

create function pg_temp.rating_assert(label text,expected integer,rating_year integer default 2024)
returns jsonb language plpgsql as $$
declare w uuid:=current_setting('rating.w')::uuid;t uuid:=md5('rating-tenant-'||label)::uuid;r jsonb;
begin
 select x into r from jsonb_array_elements(public.aqari_final_gap_register(w,'rate',jsonb_build_object('tenant_id',t,'year',rating_year))->'ratings')x
 where x->>'tenant_id'=t::text and (x->>'rating_year')::integer=rating_year;
 if (r->>'stars')::integer is distinct from expected then raise exception 'RATING_%: expected % got %',label,expected,r;end if;
 return r;
end $$;
set local role authenticated;
select pg_temp.rating_assert('one-month',0);
select pg_temp.rating_assert('discount',1);
select pg_temp.rating_assert('free',1);
select pg_temp.rating_assert('unapproved-free',0);
select pg_temp.rating_assert('vacated',0);
select pg_temp.rating_assert('native-cancel',0);
select pg_temp.rating_assert('registered-cancel',0);
select pg_temp.rating_assert('partial',1);
select pg_temp.rating_assert('late',0);
select pg_temp.rating_assert('underpaid',0);
select pg_temp.rating_assert('unconfirmed-'||x,0) from unnest(array['pending','voided','ملغى'])x;
select pg_temp.rating_assert('parallel',0);
select pg_temp.rating_assert('parallel-full',1);
select pg_temp.rating_assert('parallel-surplus',0);
select pg_temp.rating_assert('annual',4);
select pg_temp.rating_assert('year-boundary',0,2024);
select pg_temp.rating_assert('year-boundary',0,2025);
select pg_temp.rating_assert('cancelled-lease',0);
select pg_temp.rating_assert('draft-lease',0);
select pg_temp.rating_assert('future',0,2199);
do $$declare w uuid:=current_setting('rating.w')::uuid;r jsonb;again jsonb;begin
 r:=pg_temp.rating_assert('discount',1);again:=pg_temp.rating_assert('discount',1);
 if r->'source_revision' is distinct from again->'source_revision' or r->'quarter_evidence' is distinct from again->'quarter_evidence' then raise exception 'RATING_RETRY_CHANGED_EVIDENCE';end if;
 r:=pg_temp.rating_assert('revoked',1);
 perform public.aqari_final_gap_register(w,'cancel_receipt',jsonb_build_object('id','76520000-0000-4000-8000-000000000021',
  'payment_id',md5('rating-payment-revoked2024-03-01')::uuid,'reason','إلغاء اصطناعي بعد التقييم'));
 again:=pg_temp.rating_assert('revoked',0);
 if r->'source_revision'=again->'source_revision' then raise exception 'RATING_CANCELLATION_REVISION_UNCHANGED';end if;
 r:=pg_temp.rating_assert('free',1);
 if r#>>'{quarter_evidence,0,paid_early_months}'<>'2' or r#>>'{quarter_evidence,0,zero_due_months}'<>'1'
  or r#>>'{quarter_evidence,0,months,1,leases,0,due}'<>'0' or r#>>'{quarter_evidence,0,months,1,leases,0,paid_early}'<>'0' then raise exception 'FREE_MONTH_FABRICATED_PAYMENT';end if;
 r:=pg_temp.rating_assert('vacated',0);
 if r#>>'{quarter_evidence,0,due_months}'<>'2' or jsonb_array_length(r->'quarter_evidence')<>1 then raise exception 'POST_VACATING_MONTHS_COUNTED';end if;
 r:=public.aqari_final_gap_register(w,'list');
 if (select count(*) from jsonb_array_elements(r->'ratings')x where x->>'tenant_id'=md5('rating-tenant-year-boundary')::uuid::text)<>2 then raise exception 'PREVIOUS_YEAR_REMOVED';end if;
 begin perform public.aqari_final_gap_register(w,'rate','{"tenant_id":"76520000-0000-4000-8000-000000000098","year":2024}');raise exception 'FOREIGN_TENANT_RATED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_final_gap_register('76520000-0000-4000-8000-000000000099','rate','{"tenant_id":"76520000-0000-4000-8000-000000000098","year":2024}');raise exception 'FOREIGN_WORKSPACE_RATED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_final_gap_register(w,'rate',jsonb_build_object('tenant_id',md5('rating-tenant-discount')::uuid,'year',1999));raise exception 'INVALID_YEAR_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_final_gap_register(w,'rate',jsonb_build_object('tenant_id',md5('rating-tenant-discount')::uuid));raise exception 'MISSING_YEAR_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform private.aqari_tenant_rating_evidence(w,md5('rating-tenant-discount')::uuid,2024);raise exception 'PRIVATE_RATING_HELPER_EXPOSED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$begin
 begin perform public.aqari_final_gap_register(current_setting('rating.w')::uuid,'rate',jsonb_build_object('tenant_id',md5('rating-tenant-discount')::uuid,'year',2024));raise exception 'RATING_WITHOUT_MFA';exception when insufficient_privilege then if sqlerrm<>'MFA_REQUIRED' then raise;end if;end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',floor(extract(epoch from statement_timestamp()))::bigint)))::text,true);
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000002',true);
do $$begin
 begin perform public.aqari_final_gap_register(current_setting('rating.w')::uuid,'rate',jsonb_build_object('tenant_id',md5('rating-tenant-discount')::uuid,'year',2024));raise exception 'ACCOUNTANT_RATED_TENANT';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','76520000-0000-4000-8000-000000000003',true);
do $$declare r jsonb:=public.aqari_tenant_engagement_feed();begin
 if jsonb_array_length(r->'ratings')<>1 or r#>>'{ratings,0,stars}'<>'1' then raise exception 'TENANT_RATING_FEED_SCOPE_FAILED';end if;
 begin perform public.aqari_final_gap_register(current_setting('rating.w')::uuid,'list');raise exception 'TENANT_READ_ADMIN_RATINGS';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.aqari_final_gap_register(uuid,text,jsonb)','execute')
  or has_function_privilege('authenticated','private.aqari_tenant_rating_evidence(uuid,uuid,integer)','execute') then raise exception 'RATING_PRIVILEGES_EXPOSED';end if;
 if (select count(*) from private.aqari_receipt_cancellations where workspace_id=current_setting('rating.w')::uuid)<>2 then raise exception 'CANCELLATION_EVIDENCE_CHANGED';end if;
 if not exists(select 1 from public.aqari_rent_payments where id=md5('rating-payment-revoked2024-03-01')::uuid and amount=100) then raise exception 'CANCELLED_RATING_RECEIPT_REMOVED';end if;
end $$;
rollback;
select 'PASS: quarter length, approved discount/free, effective vacancy, both cancellation paths, partial/late, calendar deduplication, annual cap/history, future exclusion, MFA and workspace/tenant isolation';
