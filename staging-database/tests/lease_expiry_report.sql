-- Synthetic identities and source records in two separate workspaces; rollback all.
begin;
set local statement_timeout='30s';set local lock_timeout='3s';set local timezone='Pacific/Kiritimati';
insert into public.aqari_workspaces(id,slug,name) values('9cb20000-0000-4000-8000-000000000001','aqari-expiry-acceptance','اختبار انتهاء العقود'),('9cb20000-0000-4000-8000-000000000002','aqari-expiry-foreign','مساحة رفض التقرير');
insert into public.aqari_app_state(workspace_id,payload) values('9cb20000-0000-4000-8000-000000000001','{}'),('9cb20000-0000-4000-8000-000000000002','{}');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('expiry-manager@example.invalid','مدير اختبار','general_manager','aqari-expiry-acceptance'),('expiry-staff@example.invalid','محاسب اختبار','accountant','aqari-expiry-acceptance'),('expiry-viewer@example.invalid','مشاهد اختبار','viewer','aqari-expiry-acceptance'),('expiry-foreign@example.invalid','مدير آخر','general_manager','aqari-expiry-foreign');
insert into auth.users(id,email,email_confirmed_at) values
 ('9cb20000-0000-4000-8000-000000000011','expiry-manager@example.invalid',now()),('9cb20000-0000-4000-8000-000000000012','expiry-staff@example.invalid',now()),('9cb20000-0000-4000-8000-000000000013','expiry-viewer@example.invalid',now()),('9cb20000-0000-4000-8000-000000000014','expiry-foreign@example.invalid',now());
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
 ('9cb20000-0000-4000-8000-000000000101','9cb20000-0000-4000-8000-000000000001','EXP-P-1','عقار مسموح','{}'),('9cb20000-0000-4000-8000-000000000102','9cb20000-0000-4000-8000-000000000001','EXP-P-2','عقار محجوب','{}'),('9cb20000-0000-4000-8000-000000000103','9cb20000-0000-4000-8000-000000000002','EXP-P-3','عقار خارجي','{}');
do $$declare n integer;w uuid;p uuid;u uuid;t uuid;today date:=(now() at time zone 'Asia/Kuwait')::date;days integer;status text;begin
 for n in 1..69 loop
  w:=case when n=12 then '9cb20000-0000-4000-8000-000000000002'::uuid else '9cb20000-0000-4000-8000-000000000001'::uuid end;
  p:=case when n=11 then '9cb20000-0000-4000-8000-000000000102'::uuid when n=12 then '9cb20000-0000-4000-8000-000000000103'::uuid else '9cb20000-0000-4000-8000-000000000101'::uuid end;
  u:=md5('expiry-test-unit-'||n)::uuid;t:=md5('expiry-test-tenant-'||n)::uuid;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no)values(u,w,p,case n when 1 then '401' else n::text end);
  insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by)values(md5('expiry-test-inspection-'||n)::uuid,w,u,1,'ready',today,'محضر اصطناعي','جاهزية اختبار فقط','9cb20000-0000-4000-8000-000000000011');
  insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)values(t,w,'EXP-T-'||n,case n when 1 then 'أَحمد للاختبار' else 'مستأجر اختبار '||n end,lpad(n::text,12,'0'),lpad(n::text,8,'0'),'{}');
  days:=case n when 1 then 0 when 2 then 30 when 3 then 31 when 4 then 60 when 5 then 61 when 6 then 90 when 7 then 91 when 8 then -1 when 14 then -10 else 20 end;
  status:=case n when 9 then 'draft' when 10 then 'cancelled' when 14 then 'expired' when 15 then 'signing' when 16 then 'ready' when 17 then 'approved' else 'signed' end;
  insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,start_date,end_date,monthly_rent,deposit,status,snapshot)
   values(md5('expiry-test-lease-'||n)::uuid,w,'EXP-L-'||n,t,u,'EXP-'||n,case when n=13 then today+1 else today-100 end,today+days,125.750,50,status,'{}');
 end loop;
end$$;
insert into private.aqari_staff_assignments(workspace_id,user_id,operational_role,property_ids,is_active,updated_by)values('9cb20000-0000-4000-8000-000000000001','9cb20000-0000-4000-8000-000000000012','accountant',array['9cb20000-0000-4000-8000-000000000101']::uuid[],true,'9cb20000-0000-4000-8000-000000000011');
select set_config('request.jwt.claim.sub','9cb20000-0000-4000-8000-000000000011',true);select set_config('request.jwt.claims','{"aal":"aal1"}',true);
set local role authenticated;
-- Bound an individual real report request, independently of the longer suite.
set local statement_timeout='2s';
select public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001')->>'total' as manager_report_count;
set local statement_timeout='30s';
do $$declare w uuid:='9cb20000-0000-4000-8000-000000000001';r jsonb;s jsonb;begin
 r:=public.aqari_lease_expiry_report(w);s:=public.aqari_lease_expiry_report(w,'upcoming',30,null,'',50);
 if r->>'as_of' is distinct from (now() at time zone 'Asia/Kuwait')::date::text or r->>'timezone'<>'Asia/Kuwait' then raise exception 'KUWAIT_DATE_FAILED';end if;
 if r->>'total'<>'55' or jsonb_array_length(r->'rows')<>50 or jsonb_array_length(s->'rows')<>5 then raise exception 'PAGINATION_OR_ELIGIBILITY_FAILED: %',r->>'total';end if;
 if exists(select 1 from jsonb_array_elements(r->'rows')a join jsonb_array_elements(s->'rows')b on a->>'id'=b->>'id') then raise exception 'DUPLICATE_PAGE';end if;
 if public.aqari_lease_expiry_report(w,'upcoming',60)->>'total'<>'57' or public.aqari_lease_expiry_report(w,'upcoming',90)->>'total'<>'59' then raise exception 'INCLUSIVE_DAY_BOUNDARIES_FAILED';end if;
 r:=public.aqari_lease_expiry_report(w,'expired');if r->>'total'<>'2' or exists(select 1 from jsonb_array_elements(r->'rows')x where (x->>'days_remaining')::integer>=0) then raise exception 'EXPIRED_BOUNDARY_FAILED';end if;
 r:=public.aqari_lease_expiry_report(w,'upcoming',30,null,'احمد');if r->>'total'<>'1' or r#>>'{rows,0,tenant_name}'<>'أَحمد للاختبار' or r#>>'{rows,0,monthly_rent}'<>'125.750' then raise exception 'SEARCH_OR_SAVED_VALUES_FAILED';end if;
 if public.aqari_lease_expiry_report(w,'upcoming',30,null,'۴۰۱')->>'total'<>'1' or public.aqari_lease_expiry_report(w,'upcoming',30,null,'%')->>'total'<>'0' then raise exception 'LITERAL_OR_DIGIT_SEARCH_FAILED';end if;
 if public.aqari_lease_expiry_report(w,'upcoming',30,'9cb20000-0000-4000-8000-000000000102')->>'total'<>'1' then raise exception 'PROPERTY_FILTER_FAILED';end if;
 if jsonb_array_length(public.aqari_lease_expiry_report(w,'upcoming',30,null,'',100)->'rows')<>0 then raise exception 'EMPTY_PAGE_FAILED';end if;
 begin perform public.aqari_lease_expiry_report(w,'draft');raise exception 'INVALID_STATUS_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_lease_expiry_report(w,'upcoming',31);raise exception 'INVALID_DAYS_ACCEPTED';exception when invalid_parameter_value then null;end;
 begin perform public.aqari_lease_expiry_report(w,'upcoming',30,null,'',-1);raise exception 'INVALID_PAGE_ACCEPTED';exception when invalid_parameter_value then null;end;
end$$;
select set_config('request.jwt.claim.sub','9cb20000-0000-4000-8000-000000000012',true);
set local statement_timeout='2s';
select public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001')->>'total' as scoped_report_count;
set local statement_timeout='30s';
do $$declare w uuid:='9cb20000-0000-4000-8000-000000000001';r jsonb;begin
 r:=public.aqari_lease_expiry_report(w);if r->>'total'<>'54' or jsonb_array_length(r->'properties')<>1 or r#>>'{properties,0,name}'<>'عقار مسموح' then raise exception 'PROPERTY_SCOPE_LEAK';end if;
 begin perform public.aqari_lease_expiry_report(w,'upcoming',30,'9cb20000-0000-4000-8000-000000000102');raise exception 'FOREIGN_PROPERTY_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000002');raise exception 'FOREIGN_WORKSPACE_ACCEPTED';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','9cb20000-0000-4000-8000-000000000013',true);
do $$begin begin perform public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001');raise exception 'VIEWER_REPORT_ALLOWED';exception when insufficient_privilege then null;end;begin perform private.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001');raise exception 'PRIVATE_VIEWER_REPORT_ALLOWED';exception when insufficient_privilege then null;end;end$$;
reset role;
update public.aqari_memberships set is_active=false where workspace_id='9cb20000-0000-4000-8000-000000000001' and user_id='9cb20000-0000-4000-8000-000000000012';
select set_config('request.jwt.claim.sub','9cb20000-0000-4000-8000-000000000012',true);
set local role authenticated;
do $$begin begin perform public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001');raise exception 'REVOKED_MEMBER_READ';exception when insufficient_privilege then null;end;end$$;
reset role;set local role anon;
do $$begin begin perform public.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001');raise exception 'ANONYMOUS_REPORT';exception when insufficient_privilege then null;end;begin perform private.aqari_lease_expiry_report('9cb20000-0000-4000-8000-000000000001');raise exception 'ANONYMOUS_PRIVATE_REPORT';exception when insufficient_privilege then null;end;end$$;
reset role;rollback;
select 'PASS: expiry report date boundaries, draft/future/cancelled exclusion, pagination, saved values, Arabic search, property/workspace/role/revocation/anonymous isolation; fixtures rolled back';
