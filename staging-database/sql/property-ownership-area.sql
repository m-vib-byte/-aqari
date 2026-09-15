-- AQARI V267 isolated trial — official property area + owner/heir share evidence.
-- Additive and revisioned. Core owners remain in Property Master; this layer adds official area and evidence history.
begin;

create table if not exists private.aqari_property_ownership_heads(
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 current_revision bigint not null default 0 check(current_revision>=0),
 total_area_sqm numeric(18,3),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(total_area_sqm is null or (total_area_sqm>0 and total_area_sqm=round(total_area_sqm,3)))
);
alter table private.aqari_property_ownership_heads enable row level security;
revoke all on private.aqari_property_ownership_heads from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_ownership_head_no_delete on private.aqari_property_ownership_heads;
create trigger aqari_property_ownership_head_no_delete before delete on private.aqari_property_ownership_heads
 for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_property_ownership_versions(
 workspace_id uuid not null,
 property_id uuid not null,
 revision bigint not null check(revision>0),
 total_area_sqm numeric(18,3) not null check(total_area_sqm>0 and total_area_sqm=round(total_area_sqm,3)),
 owners jsonb not null,
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,property_id,revision),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(jsonb_typeof(owners)='array' and jsonb_array_length(owners)>0 and octet_length(owners::text)<=500000)
);
alter table private.aqari_property_ownership_versions enable row level security;
revoke all on private.aqari_property_ownership_versions from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_ownership_version_immutable on private.aqari_property_ownership_versions;
create trigger aqari_property_ownership_version_immutable before update or delete on private.aqari_property_ownership_versions
 for each row execute function private.aqari_reject_immutable_change();

create index if not exists aqari_property_ownership_versions_latest
 on private.aqari_property_ownership_versions(workspace_id,property_id,revision desc);

create or replace function private.aqari_property_ownership_owners_valid(w uuid,p uuid,rows jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare core jsonb;
begin
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows)<1 or octet_length(rows::text)>500000 then return false;end if;
 if exists(
  select 1 from jsonb_array_elements(rows) r
  where jsonb_typeof(r)<>'object'
   or exists(select 1 from jsonb_object_keys(r) k where k not in('id','name','bps','role','email','phone','whatsapp','supportingDocumentId'))
   or (coalesce(r->>'supportingDocumentId','')<>'' and coalesce(r->>'supportingDocumentId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$')
 ) then return false;end if;
 select coalesce(jsonb_agg(r.value-'supportingDocumentId' order by r.ord),'[]'::jsonb) into core
 from jsonb_array_elements(rows) with ordinality r(value,ord);
 if not private.aqari_property_owners_valid(core) then return false;end if;
 if exists(
  select 1 from jsonb_array_elements(rows) r
  where coalesce(r->>'supportingDocumentId','')<>''
   and not exists(
    select 1 from public.aqari_documents d
    join public.aqari_properties pr on pr.workspace_id=d.workspace_id and pr.external_ref=d.entity_ref
    where d.workspace_id=w and d.id=(r->>'supportingDocumentId')::uuid and d.entity_type='property' and d.status='uploaded' and pr.id=p
   )
 ) then return false;end if;
 return true;
end $$;
revoke all on function private.aqari_property_ownership_owners_valid(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function private.aqari_property_ownership_context(w uuid,p uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare master jsonb;rev bigint:=0;total numeric;owners jsonb;decorated jsonb;actor text;
begin
 master:=private.aqari_property_master_snapshot(w,p);if master is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 select h.current_revision,h.total_area_sqm into rev,total from private.aqari_property_ownership_heads h where h.workspace_id=w and h.property_id=p;
 rev:=coalesce(rev,0);
 if rev>0 then select v.owners into owners from private.aqari_property_ownership_versions v where v.workspace_id=w and v.property_id=p and v.revision=rev;
 else select coalesce(jsonb_agg(o.value||jsonb_build_object('supportingDocumentId',null) order by o.ord),'[]'::jsonb) into owners from jsonb_array_elements(coalesce(master->'owners','[]'::jsonb)) with ordinality o(value,ord);end if;
 select coalesce(jsonb_agg(
   o.value||jsonb_build_object(
    'areaSqm',case when total is null then null else round(total*((o.value->>'bps')::numeric)/10000,3) end,
    'supportingDocument',case when coalesce(o.value->>'supportingDocumentId','')='' then null else (
      select jsonb_build_object('id',d.id,'no',d.document_no,'title',d.title,'status',d.status,'category',coalesce(d.metadata->>'category',d.metadata->>'document_category',''))
      from public.aqari_documents d where d.workspace_id=w and d.id=(o.value->>'supportingDocumentId')::uuid
    ) end
   ) order by o.ord
  ),'[]'::jsonb) into decorated from jsonb_array_elements(coalesce(owners,'[]'::jsonb)) with ordinality o(value,ord);
 return jsonb_build_object(
  'workspace_id',w,'property_id',p,'masterRevision',coalesce((master->>'revision')::bigint,0),'ownershipRevision',rev,
  'property',jsonb_build_object('id',master->>'id','externalRef',master->>'externalRef','name',master->>'name','totalAreaSqm',total),
  'owners',decorated,
  'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'no',d.document_no,'title',d.title,'status',d.status,'category',coalesce(d.metadata->>'category',d.metadata->>'document_category','')) order by d.created_at desc,d.id desc)
    from public.aqari_documents d join public.aqari_properties pr on pr.workspace_id=d.workspace_id and pr.external_ref=d.entity_ref
    where d.workspace_id=w and pr.id=p and d.entity_type='property' and d.status='uploaded'),'[]'::jsonb),
  'history',coalesce((select jsonb_agg(jsonb_build_object('revision',v.revision,'totalAreaSqm',v.total_area_sqm,'actor',v.actor_name,'reason',v.reason,'at',v.created_at) order by v.revision desc) from private.aqari_property_ownership_versions v where v.workspace_id=w and v.property_id=p),'[]'::jsonb)
 );
end $$;
revoke all on function private.aqari_property_ownership_context(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_ownership(p_workspace_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=coalesce(p_data,'{}'::jsonb);p uuid;master jsonb;expected_master bigint;expected_ownership bigint;current_ownership bigint:=0;next_rev bigint;total numeric;owners jsonb;core_owners jsonb;why text;actor text;saved jsonb;
begin
 if auth.uid() is null or jsonb_typeof(d) is distinct from 'object' then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 p:=nullif(d->>'propertyId','')::uuid;if p is null or not private.aqari_can_property(w,p,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='context' then
  return private.aqari_property_ownership_context(w,p)||jsonb_build_object('user_id',auth.uid(),'manager',private.aqari_manager(w) and private.aqari_can(w,'administration','write') and private.aqari_can_property(w,p,'properties','write'));
 end if;
 if p_action<>'save' or exists(select 1 from jsonb_object_keys(d)k where k not in('propertyId','expectedMasterRevision','expectedOwnershipRevision','totalAreaSqm','owners','reason')) then raise invalid_parameter_value using message='INVALID_OWNERSHIP_REQUEST';end if;
 if not private.aqari_manager(w) or not private.aqari_can(w,'administration','write') or not private.aqari_can_property(w,p,'properties','write') then raise insufficient_privilege using message='OWNERSHIP_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 expected_master:=coalesce((d->>'expectedMasterRevision')::bigint,-1);expected_ownership:=coalesce((d->>'expectedOwnershipRevision')::bigint,-1);why:=btrim(coalesce(d->>'reason',''));owners:=d->'owners';
 begin total:=nullif(d->>'totalAreaSqm','')::numeric;exception when others then raise invalid_parameter_value using message='PROPERTY_TOTAL_AREA_INVALID';end;
 if expected_master<0 or expected_ownership<0 or total is null or total<=0 or total>1000000000000 or total<>round(total,3) or length(why) not between 3 and 1000 or not private.aqari_property_ownership_owners_valid(w,p,owners) then raise invalid_parameter_value using message='PROPERTY_OWNERSHIP_INVALID';end if;
 master:=private.aqari_property_master_snapshot(w,p);if master is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;if coalesce((master->>'revision')::bigint,0)<>expected_master then raise serialization_failure using message='PROPERTY_MASTER_REVISION_CONFLICT';end if;
 select current_revision into current_ownership from private.aqari_property_ownership_heads where workspace_id=w and property_id=p for update;current_ownership:=coalesce(current_ownership,0);if current_ownership<>expected_ownership then raise serialization_failure using message='PROPERTY_OWNERSHIP_REVISION_CONFLICT';end if;
 select coalesce(jsonb_agg(r.value-'supportingDocumentId' order by r.ord),'[]'::jsonb) into core_owners from jsonb_array_elements(owners) with ordinality r(value,ord);
 saved:=public.aqari_property_master_save(w,p,expected_master,jsonb_build_object(
  'name',master->>'name','address',coalesce(master->>'address',''),'description',coalesce(master->>'description',''),'locationUrl',coalesce(master->>'locationUrl',''),'propertyAutomaticRef',coalesce(master->>'propertyAutomaticRef',''),'type',coalesce(master->>'type',''),'status',coalesce(master->>'status','active'),'statedIncome',master->'statedIncome','owners',core_owners,'email',coalesce(master->>'email',''),'phone',coalesce(master->>'phone',''),'whatsapp',coalesce(master->>'whatsapp',''),'assets',coalesce(master->'assets','{}'::jsonb),'tenantVisibility',coalesce(master->'tenantVisibility','{}'::jsonb),'tenantInfo',coalesce(master->'tenantInfo','{}'::jsonb)
 ),why);
 next_rev:=current_ownership+1;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_property_ownership_heads(workspace_id,property_id,current_revision,total_area_sqm,updated_by,updated_at)
 values(w,p,next_rev,total,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set current_revision=excluded.current_revision,total_area_sqm=excluded.total_area_sqm,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.aqari_property_ownership_versions(workspace_id,property_id,revision,total_area_sqm,owners,reason,actor_id,actor_name)
 values(w,p,next_rev,total,owners,why,auth.uid(),actor);
 return private.aqari_property_ownership_context(w,p)||jsonb_build_object('user_id',auth.uid(),'manager',true,'savedMasterRevision',((saved->'property'->>'revision')::bigint));
end $$;
revoke all on function public.aqari_property_ownership(uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_ownership(uuid,text,jsonb) to authenticated;

commit;
