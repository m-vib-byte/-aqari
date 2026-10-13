-- Shared source phones do not identify a person. Keep civil-ID and unknown-identity
-- review gates, original source identity, canonical property logic and all ACLs.
begin;
set local lock_timeout='5s';
do $patch$
declare definition text;
 old_guard text := $old$((valid_civil is not null and civil_id=valid_civil) or (valid_phone is not null and phone=valid_phone))$old$;
 new_guard text := $new$((valid_civil is not null and civil_id=valid_civil) or (valid_phone is not null and phone=valid_phone and (valid_civil is null or civil_id is null)))$new$;
 old_result text := $old$'posted_payments',0);$old$;
 new_result text := $new$'posted_payments',0,'shared_phone_tenants',(
  select count(distinct t.id) from public.aqari_statement_links lk
  join public.aqari_tenants t on t.workspace_id=lk.workspace_id and t.id=lk.tenant_id
  where lk.workspace_id=p_workspace_id and lk.property_id=p_property_id and lk.period=p_period
  and nullif(t.phone,'') is not null and exists(
   select 1 from public.aqari_tenants other where other.workspace_id=t.workspace_id and other.id<>t.id and other.phone=t.phone
  )
 ));$new$;
begin
 select pg_get_functiondef('public.aqari_link_property_statement(uuid,uuid,date,text)'::regprocedure) into definition;
 if position(new_guard in definition)>0 and position(new_result in definition)>0 then return;end if;
 if position(old_guard in definition)=0 or position(old_result in definition)=0 then raise exception 'STATEMENT_PHONE_POLICY_ANCHOR_CHANGED';end if;
 execute replace(replace(definition,old_guard,new_guard),old_result,new_result);
end $patch$;
commit;
