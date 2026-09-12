-- Append-only unit handover readings. Apply only after verified backup and scope.
-- Depends on staff-property-scope.sql, operations-register.sql and MFA helpers.
begin;
create table private.aqari_unit_meter_readings(
 id uuid primary key,workspace_id uuid not null,property_id uuid not null,unit_id uuid not null,
 lease_id uuid not null,meter_id uuid not null,phase text not null check(phase in ('entry','periodic','exit')),
 reading numeric(18,3) not null check(reading>=0 and reading<1000000000000000),
 reading_unit text not null check(reading_unit in ('kWh','m3')),
 observed_on date not null,source_ref text not null check(length(btrim(source_ref)) between 3 and 500),
 photo_document_id uuid references public.aqari_documents(id),
 supersedes_id uuid references private.aqari_unit_meter_readings(id),
 reason text not null check(length(btrim(reason)) between 3 and 500),
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 unique(workspace_id,id),unique(supersedes_id),
 foreign key(workspace_id,property_id) references public.aqari_properties(workspace_id,id),
 foreign key(workspace_id,unit_id) references public.aqari_units(workspace_id,id),
 foreign key(workspace_id,lease_id) references public.aqari_leases(workspace_id,id),
 foreign key(meter_id) references public.aqari_utility_meters(id)
);
create index aqari_unit_meter_history on private.aqari_unit_meter_readings(workspace_id,lease_id,meter_id,observed_on);
alter table private.aqari_unit_meter_readings enable row level security;
revoke all on private.aqari_unit_meter_readings from public,anon,authenticated;
create trigger aqari_unit_meter_readings_immutable before update or delete on private.aqari_unit_meter_readings
 for each row execute function private.aqari_reject_immutable_change();

create function private.aqari_unit_meter_access(w uuid,p uuid,a text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.aqari_can_property(w,p,'maintenance',a) or private.aqari_can_property(w,p,'properties',a)
$$;
revoke all on function private.aqari_unit_meter_access(uuid,uuid,text) from public,anon,authenticated;

create function private.aqari_unit_meter_register(w uuid,a text,d jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare l public.aqari_leases;u public.aqari_units;m public.aqari_utility_meters;
 r private.aqari_unit_meter_readings;old private.aqari_unit_meter_readings;
 ident uuid;photo uuid;prior uuid;amount numeric;observed date;unit_label text;expected jsonb;
begin
 if auth.uid() is null or not (private.aqari_can(w,'maintenance','read') or private.aqari_can(w,'properties','read')) then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 if a is null or a not in ('list','record') or d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>8192 then raise invalid_parameter_value using message='INVALID_METER_REQUEST';end if;
 if a='list' then
  return jsonb_build_object(
   'leases',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unit_id',q.id,'unit_no',q.unit_no,'property_id',p.id,'property_name',p.name,'property_ref',p.external_ref,'start_date',x.start_date,'can_write',private.aqari_unit_meter_access(w,p.id,'write')) order by p.name,q.unit_no,x.start_date desc) from public.aqari_leases x join public.aqari_units q on q.workspace_id=x.workspace_id and q.id=x.unit_id join public.aqari_properties p on p.workspace_id=q.workspace_id and p.id=q.property_id where x.workspace_id=w and private.aqari_unit_meter_access(w,p.id,'read')),'[]'),
   'meters',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'property_id',x.property_id,'unit_no',x.unit_no,'kind',x.kind,'serial_no',x.serial_no) order by x.kind,x.serial_no) from public.aqari_utility_meters x where x.workspace_id=w and private.aqari_unit_meter_access(w,x.property_id,'read')),'[]'),
   'readings',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('superseded',exists(select 1 from private.aqari_unit_meter_readings n where n.workspace_id=w and n.supersedes_id=x.id)) order by x.recorded_at desc,x.id) from private.aqari_unit_meter_readings x where x.workspace_id=w and private.aqari_unit_meter_access(w,x.property_id,'read')),'[]'));
 end if;
 ident:=(d->>'id')::uuid;photo:=nullif(d->>'photo_document_id','')::uuid;prior:=nullif(d->>'supersedes_id','')::uuid;
 select * into l from public.aqari_leases where workspace_id=w and id=(d->>'lease_id')::uuid;
 select * into u from public.aqari_units where workspace_id=w and id=l.unit_id;
 if l.id is null or u.id is null or not private.aqari_unit_meter_access(w,u.property_id,'write') then raise insufficient_privilege using message='ACCESS_DENIED';end if;
 perform private.aqari_require_sensitive_aal2(w);
 -- Serialize readings/corrections on the existing lease, including concurrent retries.
 perform 1 from public.aqari_leases where workspace_id=w and id=l.id for update;
 select * into m from public.aqari_utility_meters where workspace_id=w and id=(d->>'meter_id')::uuid;
 if m.id is null or m.property_id<>u.property_id or nullif(btrim(m.unit_no),'') is distinct from btrim(u.unit_no) then raise check_violation using message='METER_UNIT_MISMATCH';end if;
 if ident is null or coalesce(d->>'phase','') not in ('entry','periodic','exit') or coalesce(d->>'reading','')!~'^[0-9]{1,15}(\.[0-9]{1,3})?$' or coalesce(d->>'observed_on','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or length(btrim(coalesce(d->>'source_ref',''))) not between 3 and 500 or length(btrim(coalesce(d->>'reason',''))) not between 3 and 500 then raise check_violation using message='INVALID_METER_READING';end if;
 amount:=(d->>'reading')::numeric;observed:=(d->>'observed_on')::date;unit_label:=case m.kind when 'water' then 'm3' when 'electricity' then 'kWh' end;
 if unit_label is null or observed>(now() at time zone 'Asia/Kuwait')::date then raise check_violation using message='INVALID_READING_DATE_OR_KIND';end if;
 expected:=jsonb_build_object('id',ident,'workspace_id',w,'property_id',u.property_id,'unit_id',u.id,'lease_id',l.id,'meter_id',m.id,'phase',d->>'phase','reading',amount,'reading_unit',unit_label,'observed_on',observed,'source_ref',btrim(d->>'source_ref'),'photo_document_id',photo,'supersedes_id',prior,'reason',btrim(d->>'reason'));
 select * into r from private.aqari_unit_meter_readings where id=ident;
 if found then
  if (to_jsonb(r)-'recorded_by'-'recorded_at') is distinct from expected then raise unique_violation using message='METER_IDEMPOTENCY_CONFLICT';end if;
  return to_jsonb(r);
 end if;
 if photo is not null and (not private.aqari_operations_document(w,u.property_id,photo) or not exists(select 1 from public.aqari_documents doc where doc.workspace_id=w and doc.id=photo and doc.mime_type in ('image/jpeg','image/png','image/webp') and doc.metadata->>'unit_meter_reading_id'=ident::text and doc.metadata->>'meter_id'=m.id::text)) then raise check_violation using message='METER_PHOTO_UNVERIFIED';end if;
 if prior is not null then
  select * into old from private.aqari_unit_meter_readings where workspace_id=w and id=prior;
  if old.id is null or old.lease_id<>l.id or old.meter_id<>m.id or old.phase<>d->>'phase' or exists(select 1 from private.aqari_unit_meter_readings where supersedes_id=prior) then raise check_violation using message='METER_CORRECTION_CONFLICT';end if;
 end if;
 if d->>'phase' in ('entry','exit') and exists(select 1 from private.aqari_unit_meter_readings x where x.workspace_id=w and x.lease_id=l.id and x.meter_id=m.id and x.phase=d->>'phase' and x.id is distinct from prior and not exists(select 1 from private.aqari_unit_meter_readings n where n.supersedes_id=x.id)) then raise unique_violation using message='METER_PHASE_ALREADY_RECORDED';end if;
 -- Active historical readings must remain monotonic; no invented rollover values.
 if exists(select 1 from private.aqari_unit_meter_readings x where x.workspace_id=w and x.lease_id=l.id and x.meter_id=m.id and x.id is distinct from prior and not exists(select 1 from private.aqari_unit_meter_readings n where n.supersedes_id=x.id) and ((x.observed_on<observed and x.reading>amount) or (x.observed_on>observed and x.reading<amount) or (d->>'phase'='entry' and (observed>x.observed_on or amount>x.reading)) or (d->>'phase'='exit' and (observed<x.observed_on or amount<x.reading)) or (x.phase='entry' and (observed<x.observed_on or amount<x.reading)) or (x.phase='exit' and (observed>x.observed_on or amount>x.reading)))) then raise check_violation using message='METER_READING_ORDER_CONFLICT';end if;
 insert into private.aqari_unit_meter_readings(id,workspace_id,property_id,unit_id,lease_id,meter_id,phase,reading,reading_unit,observed_on,source_ref,photo_document_id,supersedes_id,reason,recorded_by)
 values(ident,w,u.property_id,u.id,l.id,m.id,d->>'phase',amount,unit_label,observed,btrim(d->>'source_ref'),photo,prior,btrim(d->>'reason'),auth.uid()) returning * into r;
 insert into private.aqari_operations_audit(workspace_id,domain,entity_id,action,actor_id,actor_name,reason,after_value)
 values(w,'unit_meter',ident,case when prior is null then 'record' else 'correct' end,auth.uid(),auth.uid()::text,r.reason,to_jsonb(r));
 return to_jsonb(r);
end $$;
revoke all on function private.aqari_unit_meter_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.aqari_unit_meter_register(uuid,text,jsonb) to authenticated;
create function public.aqari_unit_meter_register(p_workspace_id uuid,p_action text,p_data jsonb default '{}') returns jsonb
language sql volatile security invoker set search_path='' as $$select private.aqari_unit_meter_register(p_workspace_id,p_action,p_data)$$;
revoke all on function public.aqari_unit_meter_register(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.aqari_unit_meter_register(uuid,text,jsonb) to authenticated;
commit;
