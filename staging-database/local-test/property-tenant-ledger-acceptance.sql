begin;
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values ('ledger-check@example.invalid','Synthetic Ledger Manager','general_manager','aqari-v267-staging');
insert into auth.users(id,email,email_confirmed_at) values ('76800000-0000-4000-8000-000000000001','ledger-check@example.invalid',now());
select set_config('request.jwt.claim.sub','76800000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"aal":"aal2"}',true);
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values
('76800000-0000-4000-8000-000000000101','70000000-0000-4000-8000-000000000001','ledger-p1','Synthetic P1','{}'),
('76800000-0000-4000-8000-000000000102','70000000-0000-4000-8000-000000000001','ledger-p2','Synthetic P2','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values
('76800000-0000-4000-8000-000000000201','70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000101','A1'),
('76800000-0000-4000-8000-000000000202','70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000102','B1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,profile,import_source) values
('76800000-0000-4000-8000-000000000301','70000000-0000-4000-8000-000000000001','ledger-tenant','Synthetic Tenant','{}','{"source":"synthetic-local-test"}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,monthly_rent,status,snapshot,import_source,start_date,end_date,deposit) values
('76800000-0000-4000-8000-000000000401','70000000-0000-4000-8000-000000000001','ledger-l1','76800000-0000-4000-8000-000000000301','76800000-0000-4000-8000-000000000201','A-1',100,'expired','{}','{"source":"synthetic-local-test"}','2020-01-01','2020-12-31',0),
('76800000-0000-4000-8000-000000000402','70000000-0000-4000-8000-000000000001','ledger-l2','76800000-0000-4000-8000-000000000301','76800000-0000-4000-8000-000000000202','B-1',200,'expired','{}','{"source":"synthetic-local-test"}','2020-01-01','2020-12-31',0);
set local role authenticated;
do $$declare x jsonb;begin
 x:=public.aqari_property_tenant_ledger('70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000101',current_date);
 if jsonb_array_length(x->'tenants')<>1 or jsonb_array_length(x#>'{tenants,0,contracts}')<>1 or x#>>'{tenants,0,contracts,0,contractNo}'<>'A-1' then raise exception 'PROPERTY_SCOPE_FAILED';end if;
 if x->'rentDues'<>'[]'::jsonb then raise exception 'FABRICATED_DUES';end if;
 perform set_config('request.jwt.claim.sub','76800000-0000-4000-8000-000000000099',true);
 begin perform public.aqari_property_tenant_ledger('70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000101',current_date);raise exception 'UNAUTHORIZED_READ';exception when insufficient_privilege then null;end;
end$$;
reset role;
insert into private.aqari_rent_due_periods(workspace_id,lease_id,period,due_amount,paid_amount,balance,status,source_hash,credit_amount) values
('70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000401','2020-01-01',100,64.5,25.5,'partial','synthetic-a',10),
('70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000402','2020-01-01',200,0,200,'due','synthetic-b',0);
select set_config('request.jwt.claim.sub','76800000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$declare x jsonb;begin
 x:=public.aqari_property_tenant_ledger('70000000-0000-4000-8000-000000000001','76800000-0000-4000-8000-000000000101',current_date);
 if jsonb_array_length(x->'rentDues')<>1 or (x#>>'{rentDues,0,balance}')::numeric<>25.5 or x#>>'{rentDues,0,sourceHash}'<>'synthetic-a' then raise exception 'AUTHORITATIVE_BALANCE_OR_SCOPE_FAILED';end if;
 if has_function_privilege('anon','public.aqari_property_tenant_ledger(uuid,uuid,date)','EXECUTE') then raise exception 'ANON_EXECUTE';end if;
end$$;
reset role;
rollback;
