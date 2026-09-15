-- AQARI V267 isolated trial — property official area + owner/heir proportional area + supporting document evidence.
-- Additive only. Property Master remains authoritative for owner identity and ownership percentages.
begin;

create table if not exists private.aqari_property_ownership_heads(
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 current_revision bigint not null default 0 check(current_revision>=0),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_ownership_heads enable row level security;
revoke all on private.aqari_property_ownership_heads from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_ownership_head_no_delete on private.aqari_property_ownership_heads;
create trigger aqari_property_ownership_head_no_delete before delete on private.aqari_property_ownership_heads for each row execute function private.aqari_reject_immutable_change();

create table if not exists private.aqari_property_ownership_revisions(
 workspace_id uuid not null,
 property_id uuid not null,
 revision bigint not null check(revision>0),
 official_area_sqm numeric(18,3) not null check(official_area_sqm>0 and official_area_sqm=round(official_area_sqm,3)),
 owner_rows jsonb not null check(jsonb_typeof(owner_rows)='array' and octet_length(owner_rows::text)<=1000000),
 reason text not null check(length(btrim(reason)) between 3 and 1000),
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,property_id,revision),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id)
);
alter table private.aqari_property_ownership_revisions enable row level security;
revoke all on private.aqari_property_ownership_revisions from public,anon,authenticated,service_role;
drop trigger if exists aqari_property_ownership_revision_immutable on private.aqari_property_ownership_revisions;
create trigger aqari_property_ownership_revision_immutable before update or delete on private.aqari_property_ownership_revisions for each row execute function private.aqari_reject_immutable_change();
create index if not exists aqari_property_ownership_revision_latest on private.aqari_property_ownership_revisions(workspace_id,property_id,revision desc);

create or replace function private.aqari_property_ownership_snapshot(w uuid,p uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare master jsonb;head_rev bigint:=0;saved jsonb;area numeric;rows jsonb;docs jsonb;
begin
 master:=private.aqari_property_master_snapshot(w,p);
 if master is null then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 select h.current_revision into head_rev from private.aqari_property_ownership_heads h where h.workspace_id=w and h.property_id=p;
 head_rev:=coalesce(head_rev,0);
 if head_rev>0 then select r.official_area_sqm,r.owner_rows into area,saved from private.aqari_property_ownership_revisions r where r.workspace_id=w and r.property_id=p and r.revision=head_rev;end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',o->>'id','name',o->>'name','role',o->>'role','bps',(o->>'bps')::int,
   'percentage',round((o->>'bps')::numeric/100,2),
   'areaSqm',case when saved is null then null else (select x->>'areaSqm' from jsonb_array_elements(saved)x where x->>'ownerId'=o->>'id') end,
   'documentId',case when saved is null then null else (select nullif(x->>'documentId','') from jsonb_array_elements(saved)x where x->>'ownerId'=o->>'id') end
  ) order by o->>'name',o->>'id'),'[]'::jsonb) into rows
 from jsonb_array_elements(coalesce(master->'owners','[]'::jsonb))o;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'documentNo',d.document_no,'title',d.title,'status',d.status) order by d.created_at desc,d.id desc),'[]'::jsonb) into docs
 from public.aqari_documents d join public.aqari_properties pr on pr.workspace_id=d.workspace_id and pr.external_ref=d.entity_ref
 where d.workspace_id=w and pr.id=p and d.entity_type='property' and d.status='uploaded';
 return jsonb_build_object('workspace_id',w,'property_id',p,'propertyName',master->>'name','revision',head_rev,'officialAreaSqm',area,'owners',rows,'documents',docs,'complete',head_rev>0 and area is not null and jsonb_array_length(rows)>0 and not exists(select 1 from jsonb_array_elements(rows)x where coalesce(x->>'documentId','')=''));
end $$;
revoke all on function private.aqari_property_ownership_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_ownership_profile(p_workspace_id uuid,p_property_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;p uuid:=p_property_id;d jsonb:=coalesce(p_data,'{}'::jsonb);expected bigint;next_rev bigint;area numeric;input_rows jsonb;master jsonb;owners jsonb;normalized jsonb;why text;actor text;current_rev bigint:=0;
begin
 if auth.uid() is null or not private.aqari_can_property(w,p,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='context' then return private.aqari_property_ownership_snapshot(w,p);end if;
 if p_action<>'save' or not private.aqari_manager(w) or not private.aqari_can_property(w,p,'properties','write') then raise insufficient_privilege using message='PROPERTY_OWNERSHIP_MANAGER_ONLY';end if;
 perform private.aqari_require_sensitive_aal2(w);
 if jsonb_typeof(d) is distinct from 'object' or exists(select 1 from jsonb_object_keys(d)k where k not in('revision','officialAreaSqm','owners','reason')) then raise invalid_parameter_value using message='INVALID_PROPERTY_OWNERSHIP_REQUEST';end if;
 expected:=coalesce((d->>'revision')::bigint,-1);why:=btrim(coalesce(d->>'reason',''));input_rows:=coalesce(d->'owners','[]'::jsonb);
 begin area:=(d->>'officialAreaSqm')::numeric;exception when others then raise invalid_parameter_value using message='OFFICIAL_AREA_INVALID';end;
 if expected<0 or area<=0 or area<>round(area,3) or area>1000000000 or length(why) not between 3 and 1000 or jsonb_typeof(input_rows)<>'array' then raise invalid_parameter_value using message='PROPERTY_OWNERSHIP_FIELDS_REQUIRED';end if;
 master:=private.aqari_property_master_snapshot(w,p);owners:=coalesce(master->'owners','[]'::jsonb);if jsonb_array_length(owners)<1 then raise check_violation using message='PROPERTY_OWNERS_REQUIRED';end if;
 if jsonb_array_length(input_rows)<>jsonb_array_length(owners) or exists(select 1 from jsonb_array_elements(input_rows)r where jsonb_typeof(r)<>'object' or exists(select 1 from jsonb_object_keys(r)k where k not in('ownerId','documentId')) or coalesce(r->>'ownerId','')='' or not exists(select 1 from jsonb_array_elements(owners)o where o->>'id'=r->>'ownerId')) or (select count(distinct r->>'ownerId') from jsonb_array_elements(input_rows)r)<>jsonb_array_length(owners) then raise check_violation using message='PROPERTY_OWNERSHIP_OWNER_SCOPE_MISMATCH';end if;
 if exists(select 1 from jsonb_array_elements(input_rows)r where coalesce(r->>'documentId','')<>'' and (coalesce(r->>'documentId','') !~ '^[0-9a-fA-F-]{36}$' or not exists(select 1 from public.aqari_documents doc join public.aqari_properties pr on pr.workspace_id=doc.workspace_id and pr.external_ref=doc.entity_ref where doc.workspace_id=w and doc.id=(r->>'documentId')::uuid and doc.entity_type='property' and doc.status='uploaded' and pr.id=p))) then raise check_violation using message='PROPERTY_OWNERSHIP_DOCUMENT_INVALID';end if;
 with b as(
  select o->>'id' owner_id,o->>'name' owner_name,o->>'role' owner_role,(o->>'bps')::int bps,
   nullif(r->>'documentId','') document_id,
   floor(area*1000*(o->>'bps')::numeric/10000)::bigint base_milli,
   (area*1000*(o->>'bps')::numeric/10000)-floor(area*1000*(o->>'bps')::numeric/10000) frac
  from jsonb_array_elements(owners)o join jsonb_array_elements(input_rows)r on r->>'ownerId'=o->>'id'
 ),ranked as(
  select *,row_number() over(order by frac desc,owner_id) rn,(round(area*1000)::bigint-sum(base_milli) over())::bigint remainder from b
 ),final as(
  select owner_id,owner_name,owner_role,bps,document_id,base_milli+case when rn<=remainder then 1 else 0 end milli from ranked
 )
 select jsonb_agg(jsonb_build_object('ownerId',owner_id,'name',owner_name,'role',owner_role,'bps',bps,'areaSqm',(milli::numeric/1000)::numeric(18,3),'documentId',document_id) order by owner_name,owner_id) into normalized from final;
 if (select sum((x->>'areaSqm')::numeric) from jsonb_array_elements(normalized)x)<>area then raise check_violation using message='PROPERTY_OWNERSHIP_AREA_TOTAL_MISMATCH';end if;
 select coalesce(h.current_revision,0) into current_rev from private.aqari_property_ownership_heads h where h.workspace_id=w and h.property_id=p for update;
 if current_rev is distinct from expected then raise serialization_failure using message='PROPERTY_OWNERSHIP_REVISION_CONFLICT';end if;
 next_rev:=expected+1;select coalesce(nullif(display_name,''),auth.uid()::text) into actor from public.aqari_profiles where user_id=auth.uid();actor:=coalesce(actor,auth.uid()::text);
 insert into private.aqari_property_ownership_heads(workspace_id,property_id,current_revision,updated_by,updated_at) values(w,p,next_rev,auth.uid(),now()) on conflict(workspace_id,property_id) do update set current_revision=excluded.current_revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.aqari_property_ownership_revisions(workspace_id,property_id,revision,official_area_sqm,owner_rows,reason,actor_id,actor_name) values(w,p,next_rev,area,normalized,why,auth.uid(),actor);
 return private.aqari_property_ownership_snapshot(w,p);
end $$;
revoke all on function public.aqari_property_ownership_profile(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_ownership_profile(uuid,uuid,text,jsonb) to authenticated;

commit;
