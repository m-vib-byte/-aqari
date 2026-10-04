-- Local synthetic history only. Never run this fixture on a hosted database.
insert into public.aqari_tenants(id,workspace_id,external_ref,full_name,civil_id,phone,profile)
values('768d0000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000001','contact-history-fixture','Synthetic retained contact history','768100000011','76810011','{}');
insert into private.aqari_contact_preference_audit(workspace_id,tenant_id,actor_id,before_snapshot,after_snapshot)
values('70000000-0000-4000-8000-000000000001','768d0000-0000-4000-8000-000000000011','768d0000-0000-4000-8000-000000000012','{"preferred_channel":"both"}','{"preferred_channel":"none"}');
select set_config('aqari.contact.audit_before',(select to_jsonb(a)::text from private.aqari_contact_preference_audit a where tenant_id='768d0000-0000-4000-8000-000000000011'),false);
select set_config('aqari.contact.register_acl',(select proacl::text from pg_proc where oid='public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure),false);
