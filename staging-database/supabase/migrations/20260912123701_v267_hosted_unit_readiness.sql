-- AQARI V267: explicit, audited unit readiness before a new tenancy.
-- Apply on the independently verified test branch only after its backup is verified.
-- Requires staff-property-scope.sql and mfa-enforcement.sql. Existing data is not rewritten.
begin;
create table private.aqari_unit_readiness(
 id uuid primary key,workspace_id uuid not null,unit_id uuid not null,
 revision bigint not null check(revision>0),
 state text not null check(state in ('ready','not_ready','review_required')),
 inspected_on date not null,source_ref text not null check(length(btrim(source_ref)) between 3 and 500),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),
 unique(workspace_id,unit_id,revision)
);
alter table private.aqari_unit_readiness enable row level security;
revoke all on private.aqari_unit_readiness from public,anon,authenticated;
create function private.aqari_readiness_immutable() returns trigger
language plpgsql set search_path='' as $$begin raise check_violation using message='READINESS_HISTORY_IMMUTABLE';end$$;
revoke all on function private.aqari_readiness_immutable() from public,anon,authenticated;
create trigger aqari_unit_readiness_immutable before update or delete on private.aqari_unit_readiness
 for each row execute function private.aqari_readiness_immutable();

create function public.aqari_unit_readiness_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare w uuid:=p_workspace_id;d jsonb:=p_data;p uuid;u public.aqari_units;
 saved private.aqari_unit_readiness;ident uuid;expected bigint;version bigint;number text;observed date;
begin
 if auth.uid() is null or not private.aqari_can(w,'properties','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if p_action is null or p_action not in ('list','record') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>8192 then raise invalid_parameter_value using message='INVALID_READINESS_REQUEST';end if;
 if p_action='list' then
  return jsonb_build_object(
   'properties',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'can_create',private.aqari_can_property(w,x.id,'properties','write'),'can_write',private.aqari_can_property(w,x.id,'properties','write') or private.aqari_can_property(w,x.id,'maintenance','write')) order by x.name,x.id) from public.aqari_properties x where x.workspace_id=w and private.aqari_can_property(w,x.id,'properties','read')),'[]'),
   'units',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'property_id',x.property_id,'unit_no',x.unit_no,'revision',coalesce(r.revision,0),'state',coalesce(r.state,'review_required'),'inspected_on',r.inspected_on,'source_ref',r.source_ref,'reason',r.reason) order by x.unit_no,x.id)
    from public.aqari_units x left join lateral(select y.* from private.aqari_unit_readiness y where y.workspace_id=w and y.unit_id=x.id order by y.revision desc limit 1)r on true where x.workspace_id=w and private.aqari_can_property(w,x.property_id,'properties','read')),'[]'),
   'history',coalesce((select jsonb_agg(to_jsonb(r) order by r.recorded_at desc,r.revision desc) from private.aqari_unit_readiness r join public.aqari_units x on x.workspace_id=r.workspace_id and x.id=r.unit_id where r.workspace_id=w and private.aqari_can_property(w,x.property_id,'properties','read')),'[]'));
 end if;
 ident:=(d->>'id')::uuid;p:=(d->>'property_id')::uuid;
 if ident is null or p is null or not (private.aqari_can_property(w,p,'properties','write') or private.aqari_can_property(w,p,'maintenance','write')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 number:=translate(btrim(coalesce(d->>'unit_no','')),'٠١٢٣٤٥٦٧٨٩','0123456789');
 if length(number) not between 1 and 80 or number~'[[:cntrl:]<>]' or coalesce(d->>'state','') not in ('ready','not_ready','review_required') or coalesce(d->>'expected_revision','')!~'^[0-9]{1,15}$' or coalesce(d->>'inspected_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(btrim(coalesce(d->>'source_ref',''))) not between 3 and 500 or length(btrim(coalesce(d->>'reason',''))) not between 3 and 500 then raise check_violation using message='INVALID_READINESS_RECORD';end if;
 expected:=(d->>'expected_revision')::bigint;observed:=(d->>'inspected_on')::date;
 if observed>(now() at time zone 'Asia/Kuwait')::date then raise check_violation using message='INVALID_READINESS_DATE';end if;
 select * into u from public.aqari_units where workspace_id=w and property_id=p and unit_no=number for update;
 if u.id is null then
  if not private.aqari_can_property(w,p,'properties','write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
  insert into public.aqari_units(id,workspace_id,property_id,unit_no) values(md5(p::text||':unit:'||number)::uuid,w,p,number) on conflict(workspace_id,property_id,unit_no) do nothing;
  select * into u from public.aqari_units where workspace_id=w and property_id=p and unit_no=number for update;
 end if;
 select * into saved from private.aqari_unit_readiness where id=ident;
 if found then
  if saved.workspace_id<>w or saved.unit_id<>u.id or saved.revision<>expected+1 or saved.state<>d->>'state' or saved.inspected_on<>observed or saved.source_ref<>btrim(d->>'source_ref') or saved.reason<>btrim(d->>'reason') then raise unique_violation using message='READINESS_IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(saved);
 end if;
 select coalesce(max(revision),0) into version from private.aqari_unit_readiness where workspace_id=w and unit_id=u.id;
 if version<>expected then raise serialization_failure using message='REVISION_CONFLICT';end if;
 insert into private.aqari_unit_readiness(id,workspace_id,unit_id,revision,state,inspected_on,source_ref,reason,recorded_by)
 values(ident,w,u.id,version+1,d->>'state',observed,btrim(d->>'source_ref'),btrim(d->>'reason'),auth.uid()) returning * into saved;
 return to_jsonb(saved);
end$$;
revoke all on function public.aqari_unit_readiness_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_unit_readiness_register(uuid,text,jsonb) to authenticated;

create function private.aqari_require_unit_ready() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare readiness text;
begin
 if new.status in ('cancelled','expired') then return new;end if;
 -- Preserve existing leases and routine state projection/financial saves. A new
 -- lease, reactivation, progression from draft, move or date extension needs review.
 if tg_op='UPDATE' then
  if new.workspace_id=old.workspace_id and new.unit_id=old.unit_id and new.tenant_id=old.tenant_id
   and new.start_date>=old.start_date and new.end_date<=old.end_date
   and (new.status=old.status or (old.status not in ('draft','ready','cancelled','expired') and new.status not in ('draft','ready'))) then return new;end if;
 end if;
 -- Share a row lock with readiness recording so acceptance cannot race a
 -- readiness change. AFTER INSERT runs only for new rows, not UPSERT conflicts.
 perform 1 from public.aqari_units where workspace_id=new.workspace_id and id=new.unit_id for update;
 select r.state into readiness from private.aqari_unit_readiness r where r.workspace_id=new.workspace_id and r.unit_id=new.unit_id order by r.revision desc limit 1;
 if readiness is distinct from 'ready' then raise check_violation using message='UNIT_NOT_READY';end if;
 return new;
end$$;
revoke all on function private.aqari_require_unit_ready() from public,anon,authenticated;
create trigger aqari_unit_ready_insert after insert on public.aqari_leases for each row execute function private.aqari_require_unit_ready();
create trigger aqari_unit_ready_update before update on public.aqari_leases for each row execute function private.aqari_require_unit_ready();
commit;
