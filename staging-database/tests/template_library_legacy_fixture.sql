-- Run after the existing studio migration and before the additive migration.
insert into public.aqari_workspaces(id,slug,name) values('79910000-0000-4000-8000-000000000001','template-library-test','Synthetic templates');
insert into private.aqari_allowed_users(email,display_name,role,workspace_slug) values
 ('library-owner@example.invalid','Synthetic Owner','general_manager','template-library-test'),
 ('library-viewer@example.invalid','Synthetic Viewer','viewer','template-library-test');
insert into auth.users(id,email,email_confirmed_at) values
 ('79910000-0000-4000-8000-000000000002','library-owner@example.invalid',now()),
 ('79910000-0000-4000-8000-000000000003','library-viewer@example.invalid',now());
select set_config('request.jwt.claim.sub','79910000-0000-4000-8000-000000000002',false);
insert into public.aqari_app_state(workspace_id,payload) values('79910000-0000-4000-8000-000000000001',jsonb_build_object('contractsV202',jsonb_build_array(jsonb_build_object(
 'id','synthetic-lease','tenantId','synthetic-tenant','propertyId','79910000-0000-4000-8000-000000000010','unitId','79910000-0000-4000-8000-000000000011','contract_no','SYNTHETIC-1'))));
insert into public.aqari_properties(id,workspace_id,external_ref,name,metadata) values('79910000-0000-4000-8000-000000000010','79910000-0000-4000-8000-000000000001','synthetic-property','Synthetic Property','{}');
insert into public.aqari_units(id,workspace_id,property_id,unit_no) values('79910000-0000-4000-8000-000000000011','79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000010','1');
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile) values('79910000-0000-4000-8000-000000000012','79910000-0000-4000-8000-000000000001','synthetic-tenant','Synthetic Tenant','799100000001','79910001','{"id":"synthetic-tenant","nameAr":"Synthetic Tenant"}');
insert into public.aqari_leases(id,workspace_id,external_ref,tenant_id,unit_id,contract_no,status,start_date,end_date,monthly_rent,deposit,snapshot)
 select '79910000-0000-4000-8000-000000000013',workspace_id,'synthetic-lease','79910000-0000-4000-8000-000000000012','79910000-0000-4000-8000-000000000011','SYNTHETIC-1','signed',current_date,current_date+30,100,0,payload#>'{contractsV202,0}' from public.aqari_app_state where workspace_id='79910000-0000-4000-8000-000000000001';
insert into public.aqari_rent_payments(id,workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt) values
 ('79910000-0000-4000-8000-000000000014','79910000-0000-4000-8000-000000000001','79910000-0000-4000-8000-000000000013','SYNTHETIC-RECEIPT',1,current_date,current_date,'paid','cash','{}','{}');
insert into private.aqari_rental_template_drafts_v2(id,workspace_id,kind,kind_label,title,fields,clauses,revision,request_id,created_by,updated_by)
 values('79910000-0000-4000-8000-000000000020','79910000-0000-4000-8000-000000000001','rental_agreement','Lease','Synthetic 36-line draft','[{"key":"tenant_name","label":"Tenant","type":"text","required":true}]',
 jsonb_build_array(jsonb_build_object('title','Unchanged synthetic content','text',(select string_agg(n::text||'- Synthetic {{field_name}}',E'\n' order by n) from generate_series(1,36)n))),4,'79910000-0000-4000-8000-000000000021','79910000-0000-4000-8000-000000000002','79910000-0000-4000-8000-000000000002');
insert into private.aqari_rental_template_versions(id,workspace_id,kind,version,title,clauses,content_sha256,reason,request_sha256,published_by,published_by_name)
 values('79910000-0000-4000-8000-000000000030','79910000-0000-4000-8000-000000000001','shop',1,'Legacy synthetic template','[{"title":"Synthetic","text":"Preserved historical text"}]',repeat('a',64),'Synthetic baseline',repeat('b',64),'79910000-0000-4000-8000-000000000002','Synthetic Owner');
create temp table template_legacy_baseline as select id,to_jsonb(d) row from private.aqari_rental_template_drafts_v2 d;
create temp table template_published_baseline as select id,private.aqari_rental_template_snapshot(v) snapshot from private.aqari_rental_template_versions v;
grant select on template_legacy_baseline,template_published_baseline to authenticated;
-- Existing scope table shape, from property-owner-controls.sql (not a new feature).
create table private.aqari_property_template_scopes(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.aqari_workspaces(id),
 template_id uuid not null references private.aqari_rental_template_versions(id),kind text not null,
 scope_kind text not null check(scope_kind in('property','property_type')),property_id uuid,property_type text,
 is_active boolean not null default true,revision bigint not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_template_scopes enable row level security;
revoke all on private.aqari_property_template_scopes from public,anon,authenticated,service_role;
