-- AQARI V267 Staging: tenant-facing engagement feed.
-- Exposes only the authenticated tenant's own preference/ratings and active,
-- tenant-visible public property links from current signed leases.
begin;
create or replace function public.aqari_tenant_engagement_feed()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.aqari_portal_accounts%rowtype;
begin
 if auth.uid() is null then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 select * into a from public.aqari_portal_accounts where user_id=auth.uid() and is_active=true;
 if not found then raise insufficient_privilege using message='PORTAL_ACCOUNT_NOT_ACTIVE';end if;
 return jsonb_build_object(
  'workspace_id',a.workspace_id,
  'tenant_id',a.tenant_id,
  'preference',(select to_jsonb(p)-'updated_by' from private.aqari_tenant_preferences p where p.workspace_id=a.workspace_id and p.tenant_id=a.tenant_id),
  'channels',coalesce((
   select jsonb_agg(jsonb_build_object('id',c.id,'property_id',c.property_id,'property_name',pr.name,'kind',c.kind,'public_url',c.public_url) order by pr.name,c.kind,c.id)
   from private.aqari_property_channels c
   join public.aqari_properties pr on pr.workspace_id=c.workspace_id and pr.id=c.property_id
   where c.workspace_id=a.workspace_id
    and c.tenant_visible=true
    and c.status='active'
    and exists(
     select 1 from public.aqari_leases l
     join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
     where l.workspace_id=a.workspace_id and l.tenant_id=a.tenant_id
      and u.property_id=c.property_id and l.status='signed'
      and l.start_date<=current_date and l.end_date>=current_date
    )
  ),'[]'::jsonb),
  'ratings',coalesce((
   select jsonb_agg(jsonb_build_object('year',r.rating_year,'stars',r.stars,'rating',r.rating,'quarter_evidence',r.quarter_evidence,'calculated_at',r.calculated_at) order by r.rating_year desc)
   from private.aqari_tenant_year_ratings r
   where r.workspace_id=a.workspace_id and r.tenant_id=a.tenant_id
  ),'[]'::jsonb)
 );
end $$;
revoke all on function public.aqari_tenant_engagement_feed() from public,anon;
grant execute on function public.aqari_tenant_engagement_feed() to authenticated;
commit;
