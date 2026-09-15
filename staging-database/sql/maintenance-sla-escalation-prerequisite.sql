-- AQARI V267 isolated Staging: narrow prerequisite for maintenance SLA migration.
do $$
begin
 if to_regprocedure('private.aqari_property_control_reject_delete()') is null then
  execute $fn$
   create function private.aqari_property_control_reject_delete()
   returns trigger language plpgsql security definer set search_path='' as $body$
   begin
    raise check_violation using message='PROPERTY_CONTROL_DELETE_FORBIDDEN';
   end
   $body$
  $fn$;
  execute 'revoke all on function private.aqari_property_control_reject_delete() from public,anon,authenticated,service_role';
 end if;
end $$;
