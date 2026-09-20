begin;

create or replace function private.aqari_require_unit_ready() returns trigger
language plpgsql security definer set search_path='' as $$
declare readiness text; source_property uuid; source_period date; source_hash text;
begin
 if new.status in ('cancelled','expired') then return new;end if;

 -- Historical source-statement imports are review drafts, not new occupancy.
 -- They may be persisted without fabricating a physical readiness inspection,
 -- but only when every source pointer matches an immutable stored statement.
 if tg_op='INSERT'
    and new.status='draft'
    and new.snapshot->>'source'='statement-import'
    and new.import_source is not null
    and new.external_ref=new.snapshot->>'id'
 then
   begin
     source_property:=(new.import_source->>'property_id')::uuid;
     source_period:=(new.import_source->>'period')::date;
     source_hash:=new.import_source->>'source_sha256';
   exception when others then
     source_property:=null;source_period:=null;source_hash:=null;
   end;
   if source_property is not null and source_period is not null and nullif(source_hash,'') is not null
      and exists(
        select 1 from public.aqari_units u
        where u.workspace_id=new.workspace_id and u.id=new.unit_id and u.property_id=source_property
      )
      and exists(
        select 1 from public.aqari_property_statements st
        where st.workspace_id=new.workspace_id and st.property_id=source_property
          and st.period=source_period and st.source_sha256=source_hash
      )
   then
     return new;
   end if;
 end if;

 if tg_op='UPDATE' then
  if new.workspace_id=old.workspace_id and new.unit_id=old.unit_id and new.tenant_id=old.tenant_id
   and new.start_date>=old.start_date and new.end_date<=old.end_date
   and (new.status=old.status or (old.status not in ('draft','ready','cancelled','expired') and new.status not in ('draft','ready'))) then return new;end if;
 end if;

 perform 1 from public.aqari_units where workspace_id=new.workspace_id and id=new.unit_id for update;
 select r.state into readiness from private.aqari_unit_readiness r
 where r.workspace_id=new.workspace_id and r.unit_id=new.unit_id
 order by r.revision desc limit 1;
 if readiness is distinct from 'ready' then raise check_violation using message='UNIT_NOT_READY';end if;
 return new;
end$$;

commit;
