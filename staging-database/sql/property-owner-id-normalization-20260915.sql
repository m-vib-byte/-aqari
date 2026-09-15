-- AQARI V267: keep a stable UUID for every owner/heir so ownership evidence,
-- calculated shares and owner notification settings can target the same person.
begin;

create or replace function private.aqari_property_owners_normalize(v jsonb)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select case when jsonb_typeof(v)<>'array' then v else coalesce((
  select jsonb_agg((x.value-'share') || jsonb_build_object('id',coalesce(nullif(btrim(x.value->>'id'),''),gen_random_uuid()::text)) order by x.ord)
  from jsonb_array_elements(v) with ordinality x(value,ord)
 ),'[]'::jsonb) end
$$;
revoke all on function private.aqari_property_owners_normalize(jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_property_owners_valid(v jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(v)='array'
 and octet_length(v::text)<=500000
 and not exists(
  select 1 from jsonb_array_elements(v) x
  where jsonb_typeof(x)<>'object'
   or exists(select 1 from jsonb_object_keys(x) k where k not in('id','name','bps','role','email','phone','whatsapp'))
   or coalesce(x->>'id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
   or length(btrim(coalesce(x->>'name',''))) not between 1 and 200
   or coalesce(x->>'bps','') !~ '^[0-9]{1,5}$'
   or (x->>'bps')::integer not between 1 and 10000
   or length(coalesce(x->>'role',''))>100
   or length(coalesce(x->>'email',''))>320
   or length(coalesce(x->>'phone',''))>40
   or length(coalesce(x->>'whatsapp',''))>40
 )
 and (select count(*) from jsonb_array_elements(v))=(select count(distinct x->>'id') from jsonb_array_elements(v)x)
 and (jsonb_array_length(v)=0 or (select coalesce(sum((x->>'bps')::integer),0) from jsonb_array_elements(v)x)=10000)
$$;
revoke all on function private.aqari_property_owners_valid(jsonb) from public,anon,authenticated,service_role;

do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('public.aqari_property_master_save(uuid,uuid,bigint,jsonb,text)'::regprocedure);
 anchor:='owners:=coalesce(p_data->''owners'',''[]''::jsonb);if not private.aqari_property_owners_valid(owners) then';
 replacement:='owners:=private.aqari_property_owners_normalize(coalesce(p_data->''owners'',''[]''::jsonb));if not private.aqari_property_owners_valid(owners) then';
 if strpos(s,replacement)=0 then
  if (length(s)-length(replace(s,anchor,'')))/greatest(length(anchor),1)<>1 then raise exception 'PROPERTY_OWNER_ID_NORMALIZATION_ANCHOR_MISMATCH';end if;
  execute replace(s,anchor,replacement);
 end if;
end $patch$;

commit;
