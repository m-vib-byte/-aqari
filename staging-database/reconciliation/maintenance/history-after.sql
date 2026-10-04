begin;
do $$begin
 if exists(select 1 from maintenance_before b full join public.aqari_maintenance_requests r using(id)
   where b.original is distinct from (to_jsonb(r)-'category_code')) then
  raise exception 'HISTORICAL_REQUEST_CHANGED';end if;
 if exists(select 1 from public.aqari_maintenance_requests where category_code<>'legacy_unclassified') then
  raise exception 'HISTORICAL_CATEGORY_INVENTED';end if;
 if exists(select 1 from work_orders_before b full join private.aqari_work_orders r using(id)
   where b.original is distinct from (to_jsonb(r)-'unit_id'-'request_snapshot')) then
  raise exception 'HISTORICAL_WORK_ORDER_CHANGED';end if;
 if exists(select 1 from private.aqari_work_orders where unit_id is not null or request_snapshot is not null) then
  raise exception 'HISTORICAL_LINK_SNAPSHOT_INVENTED';end if;
 if (select replace(definition,'public.aqari_operations_register(', 'private.aqari_operations_register_base(') from operations_before)
    is distinct from pg_get_functiondef('private.aqari_operations_register_base(uuid,text,text,jsonb)'::regprocedure) then
  raise exception 'ORIGINAL_OPERATIONS_GUARDS_CHANGED';end if;
 if has_function_privilege('authenticated','private.aqari_operations_register_base(uuid,text,text,jsonb)','execute')
 or has_function_privilege('anon','public.aqari_operations_register(uuid,text,text,jsonb)','execute') then
  raise exception 'OPERATIONS_ACCESS_BROADENED';end if;
end $$;
rollback;
