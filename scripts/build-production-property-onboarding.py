"""Add missing onboarding fields without replacing current production safeguards."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'staging-database/reconciliation/property-onboarding'
before = json.loads((OUT / 'production-functions-before.json').read_text())
save = next(f['definition'] for f in before if f['proname'] == 'aqari_property_master_save')
snapshot = next(f['definition'] for f in before if f['proname'] == 'aqari_property_master_snapshot')

def replace_once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Production source anchor changed: ' + old)
    return source.replace(old, new, 1)

save = replace_once(save, 'location_value text; automatic_value text;', 'location_value text; automatic_value text; description_value text; visibility_value jsonb; tenant_info_value jsonb;')
save = replace_once(save, "'assets','locationUrl','propertyAutomaticRef'))", "'assets','locationUrl','propertyAutomaticRef','description','tenantVisibility','tenantInfo'))")
anchor = " if length(location_value)>2000 or length(automatic_value)>200 then"
validation = """ description_value:=case when p_data?'description' then btrim(coalesce(p_data->>'description','')) else coalesce(old_row.description,'') end;
 visibility_value:=case when p_data?'tenantVisibility' then p_data->'tenantVisibility' else coalesce(old_row.tenant_visibility,'{}'::jsonb) end;
 tenant_info_value:=case when p_data?'tenantInfo' then p_data->'tenantInfo' else coalesce(old_row.tenant_public_info,'{}'::jsonb) end;
 if length(description_value)>5000 or (p_data?'description' and jsonb_typeof(p_data->'description') not in ('string','null')) then raise invalid_parameter_value using message='PROPERTY_DESCRIPTION_INVALID';end if;
 if jsonb_typeof(visibility_value) is distinct from 'object' or octet_length(visibility_value::text)>10000 then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_INVALID';end if;
 if visibility_value?'officeHours' then
  if visibility_value?'office_hours' and visibility_value->'office_hours' is distinct from visibility_value->'officeHours' then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_CONFLICT';end if;
  visibility_value:=(visibility_value-'officeHours')||jsonb_build_object('office_hours',visibility_value->'officeHours');
 end if;
 if exists(select 1 from jsonb_each(visibility_value) e where e.key !~ '^[a-z][a-z0-9_.-]{0,49}$' or jsonb_typeof(e.value)<>'boolean') then raise invalid_parameter_value using message='PROPERTY_TENANT_VISIBILITY_INVALID';end if;
 if jsonb_typeof(tenant_info_value) is distinct from 'object' or octet_length(tenant_info_value::text)>30000 then raise invalid_parameter_value using message='PROPERTY_TENANT_INFO_INVALID';end if;
 if exists(select 1 from jsonb_each(tenant_info_value) e where e.key not in ('instructions','officeHours','emergency','services') or jsonb_typeof(e.value)<>'string') then raise invalid_parameter_value using message='PROPERTY_TENANT_INFO_INVALID';end if;
"""
save = replace_once(save, anchor, validation + anchor)
save = replace_once(save, 'assets,location_url,property_automatic_ref,revision,updated_by,updated_at)', 'assets,location_url,property_automatic_ref,description,tenant_visibility,tenant_public_info,revision,updated_by,updated_at)')
save = replace_once(save, 'location_value,automatic_value,rev+1,auth.uid(),now())', 'location_value,automatic_value,description_value,visibility_value,tenant_info_value,rev+1,auth.uid(),now())')
save = replace_once(save, 'property_automatic_ref=excluded.property_automatic_ref,revision=', 'property_automatic_ref=excluded.property_automatic_ref,description=excluded.description,tenant_visibility=excluded.tenant_visibility,tenant_public_info=excluded.tenant_public_info,revision=')
snapshot = replace_once(snapshot, "  'type',", "  'description',coalesce(m.description,''),\n  'tenantVisibility',coalesce(m.tenant_visibility,'{}'::jsonb)||case when coalesce(m.tenant_visibility,'{}'::jsonb)?'office_hours' then jsonb_build_object('officeHours',m.tenant_visibility->'office_hours') else '{}'::jsonb end,\n  'tenantInfo',coalesce(m.tenant_public_info,'{}'::jsonb),\n  'type',")
assert "case when m.property_id is not null then coalesce(m.property_type,'') else coalesce(x.metadata->>'propertyType','') end" in snapshot
assert "case when m.property_id is not null then m.stated_income else nullif(x.metadata->>'propertyMonthlyIncome','')::numeric end" in snapshot
source = (ROOT / 'staging-database/sql/property-batch-a2-core.sql').read_text()
completeness = source[source.index('create or replace function public.aqari_property_completeness('):source.index('create or replace function public.aqari_property_dashboard_header(')]
guards = []
for f in before:
    signature = f["schema"]+'.'+f['proname']+('('+('uuid,uuid,bigint,jsonb,text' if f['proname']=='aqari_property_master_save' else 'uuid,uuid')+')')
    guards.append("md5(pg_get_functiondef('"+signature+"'::regprocedure))<>'"+hashlib.md5(f['definition'].encode()).hexdigest()+"'")
sql = """-- Additive production onboarding compatibility; no business-row updates at installation.
begin;
set local lock_timeout='5s';
do $guard$ begin
 if """+' or '.join(guards)+""" then raise exception 'PRODUCTION_PROPERTY_SOURCE_CHANGED';end if;
 if to_regprocedure('public.aqari_property_completeness(uuid,uuid)') is not null then raise exception 'PRODUCTION_COMPLETENESS_ALREADY_PRESENT';end if;
end $guard$;
alter table private.aqari_property_master add column description text not null default '';
alter table private.aqari_property_master add column tenant_visibility jsonb not null default '{}'::jsonb;
alter table private.aqari_property_master add column tenant_public_info jsonb not null default '{}'::jsonb;
""" + save + ';\n' + snapshot + ';\n' + completeness + "notify pgrst, 'reload schema';\ncommit;\n"
(OUT / 'candidate.sql').write_text(sql)
(OUT / 'functions-before.sql').write_text('\n'.join(f['definition']+';' for f in before))
(OUT / 'rollback-functions.sql').write_text('-- Preserve added columns and any newly saved field values. Restore previous API functions only.\nbegin;\n'+ '\n'.join(f['definition']+';' for f in before)+"\ndrop function if exists public.aqari_property_completeness(uuid,uuid);\nnotify pgrst, 'reload schema';\ncommit;\n")
print('Generated production property onboarding candidate; not applied.')
