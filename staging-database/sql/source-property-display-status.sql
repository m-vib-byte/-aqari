-- Display source statements without presenting unlinked units as zero or source rents as income.
-- Changes only the existing read projection; authorization and stored records are unchanged.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('private.aqari_read_state_v267_unscoped(uuid)'::regprocedure) into definition;
 if strpos(definition,$old$jsonb_build_array(p.name,'غير مدون',(select count(*) from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id),(select sum((r->>'current_rent_kd')::numeric) from jsonb_array_elements(s.content->'rows') r))$old$)=0 then raise exception 'Unexpected read projection: review before applying'; end if;
 execute replace(definition,$old$jsonb_build_array(p.name,'غير مدون',(select count(*) from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id),(select sum((r->>'current_rent_kd')::numeric) from jsonb_array_elements(s.content->'rows') r))$old$,$new$jsonb_build_array(p.name,'غير مدون',
case when p.metadata->>'source_only'='true' and not exists(select 1 from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id)
 then to_jsonb(case when jsonb_array_length(coalesce(s.content->'rows','[]'::jsonb))>0
 then jsonb_array_length(s.content->'rows')::text||' صفًا في الكشف — الربط معلق'
 else 'تفاصيل الوحدات قيد الاستكمال' end)
 else to_jsonb((select count(*) from public.aqari_units u where u.workspace_id=p.workspace_id and u.property_id=p.id)) end,
case when p.metadata->>'source_only'='true' then to_jsonb('غير مرحّل — راجع كشف الإيجار'::text)
 else to_jsonb((select sum((r->>'current_rent_kd')::numeric) from jsonb_array_elements(s.content->'rows') r)) end)$new$);
end
$migration$;