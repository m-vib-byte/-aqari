-- AQARI V267: resolve a property display name without exposing direct table reads to the UI.
-- This RPC deliberately returns only the unique property id/name that the current authenticated
-- user may read inside the requested workspace. Missing and unauthorized names are indistinguishable.
begin;

create or replace function public.aqari_property_master_resolve_by_name(
  p_workspace_id uuid,
  p_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_ids uuid[];
  v_property_id uuid;
  v_name text;
begin
  if auth.uid() is null or p_workspace_id is null or nullif(btrim(p_name),'') is null then
    raise invalid_parameter_value using message='INVALID_PROPERTY_LOOKUP';
  end if;

  select array_agg(p.id order by p.id::text)
    into v_ids
    from public.aqari_properties p
   where p.workspace_id=p_workspace_id
     and btrim(p.name)=btrim(p_name)
     and private.aqari_can_property(p_workspace_id,p.id,'properties','read');

  if coalesce(array_length(v_ids,1),0)=0 then
    raise no_data_found using message='PROPERTY_NOT_FOUND_OR_DENIED';
  end if;
  if array_length(v_ids,1)<>1 then
    raise data_exception using message='PROPERTY_NAME_NOT_UNIQUE';
  end if;

  v_property_id:=v_ids[1];
  select p.name into strict v_name
    from public.aqari_properties p
   where p.workspace_id=p_workspace_id
     and p.id=v_property_id
     and private.aqari_can_property(p_workspace_id,p.id,'properties','read');

  return jsonb_build_object(
    'workspace_id',p_workspace_id,
    'user_id',auth.uid(),
    'property_id',v_property_id,
    'name',v_name
  );
end $$;

revoke all on function public.aqari_property_master_resolve_by_name(uuid,text) from public,anon;
grant execute on function public.aqari_property_master_resolve_by_name(uuid,text) to authenticated;

commit;
