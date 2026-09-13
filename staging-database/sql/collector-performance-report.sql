-- AQARI V267 Preview/Staging only.
-- G07-09: authoritative collection-employee performance by operations and amounts.
-- Legacy collector/accountant names remain explicitly unmatched until a manager maps
-- them to an active account; the system never guesses staff identity.

begin;

create or replace function private.aqari_normalize_collector_name(v text)
returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(replace(btrim(coalesce(v,'')),'ـ',''),'[[:space:]]+',' ','g'))
$$;
revoke all on function private.aqari_normalize_collector_name(text) from public,anon,authenticated,service_role;

create table if not exists private.aqari_collector_aliases(
 workspace_id uuid not null references public.aqari_workspaces(id),
 normalized_name text not null,
 source_name text not null,
 user_id uuid not null,
 user_name_snapshot text not null,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,normalized_name),
 check(length(normalized_name) between 2 and 160),
 check(length(source_name) between 2 and 160)
);
alter table private.aqari_collector_aliases enable row level security;
revoke all on private.aqari_collector_aliases from public,anon,authenticated,service_role;

create table if not exists private.aqari_collection_attribution(
 payment_id uuid primary key references public.aqari_rent_payments(id) on delete restrict,
 workspace_id uuid not null references public.aqari_workspaces(id),
 collector_user_id uuid,
 collector_name_snapshot text,
 source_name text,
 source_kind text not null check(source_kind in ('authenticated','legacy_name','system_unassigned')),
 recorded_at timestamptz not null default now()
);
alter table private.aqari_collection_attribution enable row level security;
revoke all on private.aqari_collection_attribution from public,anon,authenticated,service_role;
drop trigger if exists aqari_collection_attribution_immutable on private.aqari_collection_attribution;
create trigger aqari_collection_attribution_immutable before update or delete on private.aqari_collection_attribution
for each row execute function private.aqari_reject_immutable_change();

create or replace function private.aqari_capture_collection_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_name text; source_value text;
begin
 source_value:=coalesce(nullif(btrim(new.record->>'collectorName'),''),nullif(btrim(new.record->>'collector'),''),nullif(btrim(new.record->>'accountant'),''),nullif(btrim(new.receipt->>'accountant'),''));
 if actor is not null and exists(select 1 from public.aqari_memberships m where m.workspace_id=new.workspace_id and m.user_id=actor and m.is_active) then
   select coalesce(nullif(p.display_name,''),actor::text) into actor_name from public.aqari_profiles p where p.user_id=actor;
   actor_name:=coalesce(actor_name,actor::text);
   insert into private.aqari_collection_attribution(payment_id,workspace_id,collector_user_id,collector_name_snapshot,source_name,source_kind)
   values(new.id,new.workspace_id,actor,actor_name,source_value,'authenticated') on conflict(payment_id) do nothing;
 elsif source_value is not null then
   insert into private.aqari_collection_attribution(payment_id,workspace_id,collector_name_snapshot,source_name,source_kind)
   values(new.id,new.workspace_id,source_value,source_value,'legacy_name') on conflict(payment_id) do nothing;
 else
   insert into private.aqari_collection_attribution(payment_id,workspace_id,source_kind)
   values(new.id,new.workspace_id,'system_unassigned') on conflict(payment_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.aqari_capture_collection_attribution() from public,anon,authenticated,service_role;
drop trigger if exists aqari_capture_collection_attribution on public.aqari_rent_payments;
create trigger aqari_capture_collection_attribution after insert on public.aqari_rent_payments
for each row execute function private.aqari_capture_collection_attribution();

-- Existing rows keep their literal historical source identity. This is not a staff
-- assignment and is never silently changed by later profile/name changes.
insert into private.aqari_collection_attribution(payment_id,workspace_id,collector_name_snapshot,source_name,source_kind,recorded_at)
select p.id,p.workspace_id,
       coalesce(nullif(btrim(p.record->>'collectorName'),''),nullif(btrim(p.record->>'collector'),''),nullif(btrim(p.record->>'accountant'),''),nullif(btrim(p.receipt->>'accountant'),'')),
       coalesce(nullif(btrim(p.record->>'collectorName'),''),nullif(btrim(p.record->>'collector'),''),nullif(btrim(p.record->>'accountant'),''),nullif(btrim(p.receipt->>'accountant'),'')),
       case when coalesce(nullif(btrim(p.record->>'collectorName'),''),nullif(btrim(p.record->>'collector'),''),nullif(btrim(p.record->>'accountant'),''),nullif(btrim(p.receipt->>'accountant'),'')) is null then 'system_unassigned' else 'legacy_name' end,
       p.created_at
from public.aqari_rent_payments p
on conflict(payment_id) do nothing;

create or replace function public.aqari_collector_alias_candidates(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'user_id',m.user_id,'name',coalesce(nullif(p.display_name,''),m.user_id::text),'role',m.role::text
 ) order by coalesce(nullif(p.display_name,''),m.user_id::text),m.user_id)
 from public.aqari_memberships m
 left join public.aqari_profiles p on p.user_id=m.user_id
 where m.workspace_id=p_workspace_id and m.is_active),'[]'::jsonb);
end $$;
revoke all on function public.aqari_collector_alias_candidates(uuid) from public,anon,service_role;
grant execute on function public.aqari_collector_alias_candidates(uuid) to authenticated;

create or replace function public.aqari_set_collector_alias(p_workspace_id uuid,p_source_name text,p_user_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare n text:=private.aqari_normalize_collector_name(p_source_name); uname text;
begin
 if auth.uid() is null or not private.aqari_manager(p_workspace_id) then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 perform private.aqari_require_sensitive_aal2(p_workspace_id);
 if length(n) not between 2 and 160 then raise exception 'COLLECTOR_ALIAS_INVALID' using errcode='22023'; end if;
 if not exists(select 1 from public.aqari_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_user_id and m.is_active) then
   raise exception 'COLLECTOR_USER_NOT_ACTIVE' using errcode='23514';
 end if;
 select coalesce(nullif(p.display_name,''),p_user_id::text) into uname from public.aqari_profiles p where p.user_id=p_user_id;
 uname:=coalesce(uname,p_user_id::text);
 insert into private.aqari_collector_aliases(workspace_id,normalized_name,source_name,user_id,user_name_snapshot,created_by)
 values(p_workspace_id,n,btrim(p_source_name),p_user_id,uname,auth.uid())
 on conflict(workspace_id,normalized_name) do update set source_name=excluded.source_name,user_id=excluded.user_id,user_name_snapshot=excluded.user_name_snapshot,created_by=excluded.created_by,created_at=now();
 return jsonb_build_object('normalized_name',n,'user_id',p_user_id,'user_name',uname);
end $$;
revoke all on function public.aqari_set_collector_alias(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.aqari_set_collector_alias(uuid,text,uuid) to authenticated;

create or replace function public.aqari_collector_performance_report(
 p_workspace_id uuid,p_from date,p_to date,p_property_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or p_from is null or p_to is null or p_from>p_to then raise exception 'INVALID_REPORT_RANGE' using errcode='22023'; end if;
 if p_to-p_from>366 then raise exception 'REPORT_RANGE_TOO_LARGE' using errcode='22023'; end if;
 if not private.aqari_can(p_workspace_id,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 if p_property_id is not null and not private.aqari_can_property(p_workspace_id,p_property_id,'collections','read') then raise insufficient_privilege using message='ACCESS_DENIED'; end if;
 with lines as (
   select p.id payment_id,p.reference receipt_no,p.amount::numeric(15,3) amount,p.paid_at,p.period,p.payment_method,
          pr.id property_id,pr.name property_name,u.unit_no,l.contract_no,
          a.source_name,
          coalesce(a.collector_user_id,al.user_id) collector_user_id,
          coalesce(case when a.collector_user_id is not null then a.collector_name_snapshot end,al.user_name_snapshot,a.source_name,'غير محدد') collector_name,
          case when a.collector_user_id is not null then 'authenticated'
               when al.user_id is not null then 'legacy_mapped'
               when a.source_name is not null then 'legacy_unmatched'
               else 'unassigned' end mapping_status,
          case when lower(coalesce(p.record->>'collectionKind',p.record->>'paymentType',p.receipt->>'paymentType','')) in ('settlement','vacating_settlement','exit_settlement')
                    or coalesce(p.record->>'collectionKind',p.record->>'paymentType',p.receipt->>'paymentType','')='تسوية'
               then true else false end is_settlement
   from public.aqari_rent_payments p
   join public.aqari_leases l on l.workspace_id=p.workspace_id and l.id=p.lease_id
   join public.aqari_units u on u.workspace_id=l.workspace_id and u.id=l.unit_id
   join public.aqari_properties pr on pr.workspace_id=u.workspace_id and pr.id=u.property_id
   left join private.aqari_collection_attribution a on a.payment_id=p.id and a.workspace_id=p.workspace_id
   left join private.aqari_collector_aliases al on al.workspace_id=p.workspace_id and al.normalized_name=private.aqari_normalize_collector_name(a.source_name)
   where p.workspace_id=p_workspace_id and p.paid_at between p_from and p_to
     and (p_property_id is null or pr.id=p_property_id)
     and private.aqari_can_property(p_workspace_id,pr.id,'collections','read')
     and not exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=p.workspace_id and c.payment_id=p.id)
 ), summary as (
   select collector_user_id,collector_name,mapping_status,
          count(*)::integer operation_count,sum(amount)::numeric(15,3) amount,
          count(*) filter(where is_settlement)::integer settlement_count,
          coalesce(sum(amount) filter(where is_settlement),0)::numeric(15,3) settlement_amount,
          count(*) filter(where not is_settlement)::integer regular_count,
          coalesce(sum(amount) filter(where not is_settlement),0)::numeric(15,3) regular_amount,
          count(distinct property_id)::integer property_count,
          count(distinct contract_no)::integer contract_count
   from lines group by collector_user_id,collector_name,mapping_status
 )
 select jsonb_build_object(
   'from',p_from,'to',p_to,'property_id',p_property_id,
   'summary',coalesce((select jsonb_agg(jsonb_build_object(
      'collector_user_id',s.collector_user_id,'collector_name',s.collector_name,'mapping_status',s.mapping_status,
      'operation_count',s.operation_count,'amount',s.amount,'settlement_count',s.settlement_count,'settlement_amount',s.settlement_amount,
      'regular_count',s.regular_count,'regular_amount',s.regular_amount,'property_count',s.property_count,'contract_count',s.contract_count
   ) order by s.amount desc,s.collector_name) from summary s),'[]'::jsonb),
   'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'payment_id',x.payment_id,'receipt_no',x.receipt_no,'amount',x.amount,'paid_at',x.paid_at,'period',x.period,
      'payment_method',x.payment_method,'property_id',x.property_id,'property_name',x.property_name,'unit_no',x.unit_no,
      'contract_no',x.contract_no,'collector_user_id',x.collector_user_id,'collector_name',x.collector_name,
      'source_name',x.source_name,'mapping_status',x.mapping_status,'is_settlement',x.is_settlement
   ) order by x.paid_at desc,x.receipt_no,x.payment_id) from lines x),'[]'::jsonb),
   'policy',jsonb_build_object('cancelled_receipts_excluded',true,'legacy_names_never_auto_assigned',true,'settlement_requires_explicit_payment_classification',true)
 ) into result;
 return result;
end $$;
revoke all on function public.aqari_collector_performance_report(uuid,date,date,uuid) from public,anon,service_role;
grant execute on function public.aqari_collector_performance_report(uuid,date,date,uuid) to authenticated;

commit;
