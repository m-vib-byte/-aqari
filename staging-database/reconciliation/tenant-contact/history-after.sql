-- Local assertions after both candidates. Historical provenance must stay unknown.
do $test$
declare row_value jsonb;
begin
 select to_jsonb(a) into strict row_value from private.aqari_contact_preference_audit a where tenant_id='768d0000-0000-4000-8000-000000000011';
 if row_value-'source_route' is distinct from current_setting('aqari.contact.audit_before')::jsonb
 or row_value->'source_route' is distinct from 'null'::jsonb then
  raise exception 'CONTACT_HISTORY_REWRITTEN_OR_PROVENANCE_INVENTED';
 end if;
 if (select proacl::text from pg_proc where oid='public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure)
 is distinct from current_setting('aqari.contact.register_acl') then raise exception 'REGISTER_ACL_CHANGED';end if;
 if has_function_privilege('authenticated','private.aqari_tenant_rating_evidence(uuid,uuid,integer)','execute')
 or has_function_privilege('authenticated','private.aqari_record_contact_preference(uuid,uuid,text,text)','execute')
 or has_function_privilege('anon','public.aqari_final_gap_register(uuid,text,jsonb)','execute') then
  raise exception 'PRIVATE_HELPER_OR_REGISTER_EXPOSED';
 end if;
end $test$;
