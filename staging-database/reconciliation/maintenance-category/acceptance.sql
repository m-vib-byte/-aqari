-- LOCAL MEMORY ONLY. Tests retain current RLS, functions and every trigger.
begin;
do $$begin
 if not exists(select 1 from public.aqari_maintenance_requests r,category_historical_before b where r.id='77880000-0000-4000-8000-000000000501' and to_jsonb(r)-'category_code'=b.payload and category_code='legacy_unclassified') then raise exception 'HISTORICAL_REQUEST_CHANGED';end if;
 if not exists(select 1 from category_security_before b where b.acl=(select relacl::text from pg_class where oid='public.aqari_maintenance_requests'::regclass) and b.policies=(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='aqari_maintenance_requests')) then raise exception 'SECURITY_BASELINE_CHANGED';end if;
 if not (select relrowsecurity from pg_class where oid='public.aqari_maintenance_requests'::regclass) then raise exception 'RLS_REMOVED';end if;
 if has_function_privilege('anon','private.aqari_require_explicit_maintenance_category()','execute') or has_function_privilege('authenticated','private.aqari_require_explicit_maintenance_category()','execute') then raise exception 'TRIGGER_HELPER_EXPOSED';end if;
end $$;
set local role authenticated;
do $$declare w uuid:=current_setting('category.test.workspace')::uuid;code text;ident uuid;rev bigint;begin
 foreach code in array array['electrical','plumbing','air_conditioning','elevator','doors_windows','cleaning','other'] loop
  ident:=gen_random_uuid();
  insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,category_code) values(ident,w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Synthetic category acceptance '||code,code);
  if not exists(select 1 from public.aqari_maintenance_requests where id=ident and category_code=code and status='received' and cost=0 and created_by=auth.uid()) then raise exception 'CATEGORY_READBACK_FAILED';end if;
 end loop;
 foreach code in array array['','unknown','legacy_unclassified'] loop
  begin insert into public.aqari_maintenance_requests(workspace_id,lease_id,tenant_id,description,category_code) values(w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Invalid synthetic category',code);raise exception 'INVALID_CATEGORY_ACCEPTED';exception when check_violation then null;end;
 end loop;
 begin insert into public.aqari_maintenance_requests(workspace_id,lease_id,tenant_id,description) values(w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Omitted category');raise exception 'OMITTED_CATEGORY_ACCEPTED';exception when check_violation then if sqlerrm<>'MAINTENANCE_CATEGORY_REQUIRED' then raise;end if;end;
 begin insert into public.aqari_maintenance_requests(workspace_id,lease_id,tenant_id,description,category_code) values(w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Null category',null);raise exception 'NULL_CATEGORY_ACCEPTED';exception when not_null_violation then null;end;
 update public.aqari_maintenance_requests set status='assigned',cost=7.125 where id='77880000-0000-4000-8000-000000000501' and revision=1 returning revision into rev;
 if rev<>2 or not exists(select 1 from public.aqari_maintenance_requests where id='77880000-0000-4000-8000-000000000501' and category_code='legacy_unclassified' and cost=7.125) then raise exception 'HISTORICAL_CAS_UPDATE_FAILED';end if;
end $$;
select set_config('request.jwt.claim.sub','77880000-0000-4000-8000-000000000011',true);
do $$declare w uuid:=current_setting('category.test.workspace')::uuid;ident uuid:=gen_random_uuid();snap jsonb;begin
 insert into public.aqari_maintenance_requests(id,workspace_id,lease_id,tenant_id,description,category_code) values(ident,w,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Tenant synthetic plumbing request','plumbing');
 snap:=public.aqari_tenant_portal_snapshot();
 if not exists(select 1 from jsonb_array_elements(snap->'maintenance') r where r->>'id'=ident::text and r->>'category_code'='plumbing') then raise exception 'TENANT_SNAPSHOT_CATEGORY_MISSING';end if;
 begin insert into public.aqari_maintenance_requests(workspace_id,lease_id,tenant_id,description,category_code) values(w,'77880000-0000-4000-8000-000000000402','77880000-0000-4000-8000-000000000302','Foreign tenant category request','plumbing');raise exception 'FOREIGN_TENANT_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','77880000-0000-4000-8000-000000000002',true);
do $$begin
 begin insert into public.aqari_maintenance_requests(workspace_id,lease_id,tenant_id,description,category_code) values(current_setting('category.test.workspace')::uuid,'77880000-0000-4000-8000-000000000401','77880000-0000-4000-8000-000000000301','Viewer category request','plumbing');raise exception 'VIEWER_WRITE_ALLOWED';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$begin begin perform category_code from public.aqari_maintenance_requests;raise exception 'ANONYMOUS_READ_ALLOWED';exception when insufficient_privilege then null;end;end $$;
reset role;
rollback;
select 'PASS: historical bytes preserved; 7 categories saved/read; invalid, blank, null and omitted categories rejected; historical CAS retained; real RLS tenant snapshot; foreign tenant/viewer/anonymous rejected; policies and grants unchanged.' as result;
