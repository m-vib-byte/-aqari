-- AQARI V267 additive property portfolio improvements.
-- Keeps all existing property, unit, tenant, lease, payment and document rows intact.
begin;

create table if not exists private.aqari_property_responsibles(
 workspace_id uuid not null,
 property_id uuid not null,
 responsible_name text not null default '',
 responsible_title text not null default '',
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,property_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(updated_by) references auth.users(id),
 check(length(responsible_name)<=200 and length(responsible_title)<=120)
);
alter table private.aqari_property_responsibles enable row level security;
revoke all on private.aqari_property_responsibles from public,anon,authenticated,service_role;

create table if not exists private.aqari_tenant_family_details(
 workspace_id uuid not null,
 tenant_id uuid not null,
 civil_id_expires_on date,
 husband_name text not null default '',
 wife_name text not null default '',
 revision bigint not null default 1 check(revision>0),
 updated_by uuid not null,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,tenant_id),
 foreign key(workspace_id,tenant_id) references public.aqari_tenants(workspace_id,id),
 foreign key(updated_by) references auth.users(id),
 check(length(husband_name)<=200 and length(wife_name)<=200)
);
alter table private.aqari_tenant_family_details enable row level security;
revoke all on private.aqari_tenant_family_details from public,anon,authenticated,service_role;

create table if not exists private.aqari_portfolio_addition_audit(
 id bigint generated always as identity primary key,
 workspace_id uuid not null references public.aqari_workspaces(id),
 property_id uuid not null,
 tenant_id uuid,
 entity_type text not null check(entity_type in('property_responsible','tenant_family')),
 reason text not null,
 actor_id uuid not null references auth.users(id),
 before_value jsonb,
 after_value jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 check(length(reason) between 3 and 1000)
);
alter table private.aqari_portfolio_addition_audit enable row level security;
revoke all on private.aqari_portfolio_addition_audit from public,anon,authenticated,service_role;
drop trigger if exists aqari_portfolio_addition_audit_immutable on private.aqari_portfolio_addition_audit;
create trigger aqari_portfolio_addition_audit_immutable before update or delete on private.aqari_portfolio_addition_audit
 for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_property_responsible_json(w uuid,p uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('propertyId',p,'name',coalesce(r.responsible_name,''),'title',coalesce(r.responsible_title,''),'revision',coalesce(r.revision,0),'updatedAt',r.updated_at)
 from (select 1) seed left join private.aqari_property_responsibles r on r.workspace_id=w and r.property_id=p
$$;
revoke all on function private.aqari_property_responsible_json(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.aqari_property_responsible(
 p_workspace_id uuid,p_property_id uuid,p_action text default 'context',p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare current_row private.aqari_property_responsibles%rowtype;before_json jsonb;after_json jsonb;expected bigint;why text;nm text;ttl text;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties',case when p_action='save' then 'write' else 'read' end) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action='context' then return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'record',private.aqari_property_responsible_json(p_workspace_id,p_property_id));end if;
 if p_action<>'save' or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('name','title','revision','reason')) then raise invalid_parameter_value using message='PROPERTY_RESPONSIBLE_INVALID';end if;
 nm:=btrim(coalesce(p_data->>'name',''));ttl:=btrim(coalesce(p_data->>'title',''));why:=btrim(coalesce(p_data->>'reason',''));expected:=coalesce((p_data->>'revision')::bigint,0);
 if length(nm)>200 or length(ttl)>120 or length(why) not between 3 and 1000 then raise invalid_parameter_value using message='PROPERTY_RESPONSIBLE_INVALID';end if;
 perform 1 from public.aqari_properties where workspace_id=p_workspace_id and id=p_property_id for update;if not found then raise no_data_found using message='PROPERTY_NOT_FOUND';end if;
 before_json:=private.aqari_property_responsible_json(p_workspace_id,p_property_id);
 select * into current_row from private.aqari_property_responsibles where workspace_id=p_workspace_id and property_id=p_property_id for update;
 if coalesce(current_row.revision,0)<>expected then raise serialization_failure using message='PROPERTY_RESPONSIBLE_REVISION_CONFLICT';end if;
 insert into private.aqari_property_responsibles(workspace_id,property_id,responsible_name,responsible_title,revision,updated_by,updated_at)
 values(p_workspace_id,p_property_id,nm,ttl,expected+1,auth.uid(),now())
 on conflict(workspace_id,property_id) do update set responsible_name=excluded.responsible_name,responsible_title=excluded.responsible_title,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 after_json:=private.aqari_property_responsible_json(p_workspace_id,p_property_id);
 insert into private.aqari_portfolio_addition_audit(workspace_id,property_id,entity_type,reason,actor_id,before_value,after_value) values(p_workspace_id,p_property_id,'property_responsible',why,auth.uid(),before_json,after_json);
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'record',after_json);
end $$;
revoke all on function public.aqari_property_responsible(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.aqari_property_responsible(uuid,uuid,text,jsonb) to authenticated;

create or replace function public.aqari_tenant_complete_file(p_workspace_id uuid,p_property_id uuid,p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant_row public.aqari_tenants%rowtype;family jsonb;leases jsonb;documents jsonb;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'tenants','read') or not private.aqari_can(p_workspace_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id) then raise insufficient_privilege using message='TENANT_PROPERTY_SCOPE_MISMATCH';end if;
 select * into strict tenant_row from public.aqari_tenants where workspace_id=p_workspace_id and id=p_tenant_id;
 select jsonb_build_object('civilIdExpiresOn',f.civil_id_expires_on,'husbandName',coalesce(f.husband_name,''),'wifeName',coalesce(f.wife_name,''),'revision',coalesce(f.revision,0),'updatedAt',f.updated_at) into family from (select 1) seed left join private.aqari_tenant_family_details f on f.workspace_id=p_workspace_id and f.tenant_id=p_tenant_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'externalRef',l.external_ref,'contractNo',l.contract_no,'unitId',l.unit_id,'unitNo',u.unit_no,'status',l.status,'startDate',l.start_date,'endDate',l.end_date,'monthlyRent',l.monthly_rent) order by l.start_date desc,l.contract_no),'[]') into leases from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id;
 if private.aqari_can(p_workspace_id,'documents','read') then
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'documentNo',d.document_no,'entityType',d.entity_type,'entityRef',d.entity_ref,'documentType',d.document_type,'title',d.title,'mimeType',d.mime_type,'status',d.status,'metadata',d.metadata,'createdAt',d.created_at) order by d.created_at desc) filter(where d.id is not null),'[]') into documents from public.aqari_documents d where d.workspace_id=p_workspace_id and d.status<>'cancelled' and ((d.entity_type='tenant' and d.entity_ref in(p_tenant_id::text,tenant_row.external_ref)) or (d.entity_type='lease' and d.entity_ref in(select x->>'id' from jsonb_array_elements(leases)x union select x->>'externalRef' from jsonb_array_elements(leases)x)));
 else documents:=null;end if;
 return jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'propertyId',p_property_id,'tenant',jsonb_build_object('id',tenant_row.id,'externalRef',tenant_row.external_ref,'name',tenant_row.full_name,'civilId',tenant_row.civil_id,'phone',tenant_row.phone,'email',tenant_row.email,'profile',tenant_row.profile),'family',family,'leases',leases,'documents',documents);
end $$;
revoke all on function public.aqari_tenant_complete_file(uuid,uuid,uuid) from public,anon;
grant execute on function public.aqari_tenant_complete_file(uuid,uuid,uuid) to authenticated;

create or replace function public.aqari_tenant_family_save(p_workspace_id uuid,p_property_id uuid,p_tenant_id uuid,p_expected_revision bigint,p_data jsonb,p_reason text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare current_row private.aqari_tenant_family_details%rowtype;before_json jsonb;after_json jsonb;expiry date;husband text;wife text;
begin
 if not private.aqari_can_property(p_workspace_id,p_property_id,'properties','read') or not private.aqari_can(p_workspace_id,'tenants','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if not exists(select 1 from public.aqari_leases l join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id where l.workspace_id=p_workspace_id and l.tenant_id=p_tenant_id and u.property_id=p_property_id) then raise insufficient_privilege using message='TENANT_PROPERTY_SCOPE_MISMATCH';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in('civilIdExpiresOn','husbandName','wifeName')) then raise invalid_parameter_value using message='TENANT_FAMILY_INVALID';end if;
 begin expiry:=nullif(p_data->>'civilIdExpiresOn','')::date;exception when others then raise invalid_parameter_value using message='TENANT_CIVIL_EXPIRY_INVALID';end;
 husband:=btrim(coalesce(p_data->>'husbandName',''));wife:=btrim(coalesce(p_data->>'wifeName',''));
 if length(husband)>200 or length(wife)>200 or length(btrim(coalesce(p_reason,''))) not between 3 and 1000 then raise invalid_parameter_value using message='TENANT_FAMILY_INVALID';end if;
 select * into current_row from private.aqari_tenant_family_details where workspace_id=p_workspace_id and tenant_id=p_tenant_id for update;
 if coalesce(current_row.revision,0)<>coalesce(p_expected_revision,0) then raise serialization_failure using message='TENANT_FAMILY_REVISION_CONFLICT';end if;
 before_json:=case when found then to_jsonb(current_row) else null end;
 insert into private.aqari_tenant_family_details(workspace_id,tenant_id,civil_id_expires_on,husband_name,wife_name,revision,updated_by,updated_at)
 values(p_workspace_id,p_tenant_id,expiry,husband,wife,coalesce(p_expected_revision,0)+1,auth.uid(),now())
 on conflict(workspace_id,tenant_id) do update set civil_id_expires_on=excluded.civil_id_expires_on,husband_name=excluded.husband_name,wife_name=excluded.wife_name,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 select to_jsonb(f) into after_json from private.aqari_tenant_family_details f where f.workspace_id=p_workspace_id and f.tenant_id=p_tenant_id;
 insert into private.aqari_portfolio_addition_audit(workspace_id,property_id,tenant_id,entity_type,reason,actor_id,before_value,after_value) values(p_workspace_id,p_property_id,p_tenant_id,'tenant_family',btrim(p_reason),auth.uid(),before_json,after_json);
 return public.aqari_tenant_complete_file(p_workspace_id,p_property_id,p_tenant_id);
end $$;
revoke all on function public.aqari_tenant_family_save(uuid,uuid,uuid,bigint,jsonb,text) from public,anon;
grant execute on function public.aqari_tenant_family_save(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;

create or replace function public.aqari_property_monthly_rent(p_workspace_id uuid,p_property_id uuid,p_period date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_period is null or p_period<>date_trunc('month',p_period)::date or not private.aqari_can_property(p_workspace_id,p_property_id,'collections','read') or not private.aqari_can(p_workspace_id,'contracts','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 with lines as (
  select l.id lease_id,l.contract_no,u.id unit_id,u.unit_no,t.id tenant_id,t.full_name tenant_name,l.monthly_rent,d.due_amount,d.paid_amount,coalesce(d.credit_amount,0) credit_amount,d.balance,d.status,
   greatest((case when coalesce(l.snapshot->>'contractRent','') ~ '^[0-9]+([.][0-9]{1,3})?$' then (l.snapshot->>'contractRent')::numeric else l.monthly_rent end)-d.due_amount,0)::numeric(15,3) discount,
   case when greatest((case when coalesce(l.snapshot->>'contractRent','') ~ '^[0-9]+([.][0-9]{1,3})?$' then (l.snapshot->>'contractRent')::numeric else l.monthly_rent end)-d.due_amount,0)=0 then ''
    when l.snapshot->>'freeMonthPeriod'=to_char(p_period,'YYYY-MM') then 'شهر مجاني معتمد'
    else coalesce((select a->>'reason' from jsonb_array_elements(coalesce(l.snapshot->'rentAdjustments','[]'))a where a->>'effectiveMonth'<=to_char(p_period,'YYYY-MM') order by a->>'effectiveMonth' desc limit 1),'خصم محفوظ ضمن شروط العقد') end discount_reason
  from private.aqari_rent_due_periods d join public.aqari_leases l on l.workspace_id=d.workspace_id and l.id=d.lease_id join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id join public.aqari_tenants t on t.workspace_id=l.workspace_id and t.id=l.tenant_id
  where d.workspace_id=p_workspace_id and u.property_id=p_property_id and d.period=p_period
 ) select jsonb_build_object('workspace_id',p_workspace_id,'user_id',auth.uid(),'propertyId',p_property_id,'period',p_period,'summary',jsonb_build_object('due',coalesce(sum(due_amount),0),'paid',coalesce(sum(paid_amount),0),'unpaid',coalesce(sum(greatest(balance,0)),0),'discount',coalesce(sum(discount),0)),'lines',coalesce(jsonb_agg(to_jsonb(lines) order by unit_no,contract_no),'[]')) into result from lines;
 return result;
end $$;
revoke all on function public.aqari_property_monthly_rent(uuid,uuid,date) from public,anon;
grant execute on function public.aqari_property_monthly_rent(uuid,uuid,date) to authenticated;

commit;
