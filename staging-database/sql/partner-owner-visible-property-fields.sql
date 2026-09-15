-- AQARI V267 Preview/Staging only.
-- Read-only owner/partner projection for manager-defined property fields.
-- Fail closed if the Property Controls prerequisite has not been applied to this isolated database.
begin;

do $prerequisite$
begin
 if to_regclass('private.aqari_property_custom_fields') is null
    or to_regclass('private.aqari_property_custom_values') is null
    or to_regclass('private.aqari_partner_access') is null
    or to_regprocedure('private.aqari_partner_summary(uuid,date)') is null then
  raise exception 'OWNER_VISIBLE_PROPERTY_FIELDS_PREREQUISITE_MISSING';
 end if;
end $prerequisite$;

create or replace function private.aqari_partner_owner_fields(property uuid)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 account auth.users%rowtype;
 scope_id uuid;
 items jsonb;
begin
 if auth.uid() is null then
  raise exception 'ACCESS_DENIED' using errcode='42501';
 end if;
 select * into account from auth.users where id=auth.uid();
 if account.email_confirmed_at is null then
  raise exception 'ACCESS_DENIED' using errcode='42501';
 end if;

 select a.workspace_id into scope_id
 from private.aqari_partner_access a
 where a.property_id=property
   and a.user_id=auth.uid()
   and a.email=lower(account.email)
   and a.is_active
   and not exists(
    select 1 from public.aqari_memberships m
    where m.user_id=auth.uid() and m.workspace_id=a.workspace_id
   );
 if scope_id is null then
  raise exception 'ACCESS_DENIED' using errcode='42501';
 end if;
 if not exists(select 1 from public.aqari_properties p where p.id=property and p.workspace_id=scope_id) then
  raise exception 'ACCESS_DENIED' using errcode='42501';
 end if;

 select coalesce(
  jsonb_agg(
   jsonb_build_object(
    'label_ar',f.label_ar,
    'label_en',f.label_en,
    'type',f.field_type,
    -- Never expose an archived-document UUID through the owner portal. The UI only needs
    -- to know whether an approved archived document is linked to this owner-visible field.
    'value',case when f.field_type='document' then to_jsonb(v.value is not null) else v.value end
   ) order by f.label_ar,f.id
  ),
  '[]'::jsonb
 ) into items
 from private.aqari_property_custom_fields f
 left join private.aqari_property_custom_values v
   on v.workspace_id=f.workspace_id
  and v.property_id=property
  and v.field_id=f.id
 where f.workspace_id=scope_id
   and f.is_active
   and f.visibility in('owner','both')
   and property=any(f.property_ids);

 return jsonb_build_object(
  'user_id',auth.uid(),
  'workspace_id',scope_id,
  'property_id',property,
  'items',items
 );
end $$;

create or replace function public.aqari_partner_owner_fields(p_property_id uuid)
returns jsonb
language sql stable security invoker set search_path='' as $$
 select private.aqari_partner_owner_fields(p_property_id)
$$;

revoke all on function private.aqari_partner_owner_fields(uuid),public.aqari_partner_owner_fields(uuid) from public,anon;
grant execute on function private.aqari_partner_owner_fields(uuid),public.aqari_partner_owner_fields(uuid) to authenticated;

commit;
