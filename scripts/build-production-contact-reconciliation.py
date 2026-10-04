"""Review-only contact repair; ordered after the Production rating candidate."""
from pathlib import Path
import hashlib
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'staging-database/reconciliation/tenant-contact'

def build():
    path = ROOT / 'scripts/build-production-rating-reconciliation.py'
    spec = importlib.util.spec_from_file_location('rating_candidate', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    rated = module.build()
    catalog = json.loads((ROOT / 'staging-database/local-test/schema-catalog-production-2026-10-05.json').read_text())
    first_path = ROOT / 'staging-database/sql/tenant-contact-preference.sql'
    second_path = ROOT / 'staging-database/sql/tenant-contact-unification.sql'
    first, second = first_path.read_text(), second_path.read_text()
    start = rated.index("if p_action='preference' then")
    end = rated.index(" elsif p_action='account' then", start)
    old_branch = rated[start:end]
    replacement = "if p_action='preference' then perform private.aqari_record_contact_preference(w,(d->>'tenant_id')::uuid,lower(btrim(coalesce(d->>'preferred_channel',''))),'financial_register');"
    # Replace only the incompatible first patch; retain all other canonical guards.
    patch_start = second.index('do $patch$')
    patch_end = second.index('end $patch$;', patch_start) + len('end $patch$;')
    patch = """do $patch$
declare definition text:=pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure);
 anchor text:=$old$""" + old_branch + """$old$;
begin
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'PRODUCTION_CONTACT_REGISTER_CHANGED';
 end if;
 execute replace(definition,anchor,$new$""" + replacement + """$new$);
end $patch$;"""
    second = second[:patch_start] + patch + second[patch_end:]
    backfill = 'do $$declare w uuid;begin for w in select id from public.aqari_workspaces loop perform private.aqari_reconcile_contact_queue(w,null);end loop;end$$;'
    if second.count(backfill) != 1:
        raise ValueError('Contact startup reconciliation anchor changed')
    second = second.replace(backfill, '-- No installation-time reconciliation of real queued messages.')
    def body(sql):
        if sql.count('\nbegin;\n') != 1 or not sql.rstrip().endswith('commit;'):
            raise ValueError('Unexpected transaction envelope')
        return sql.replace('\nbegin;\n', '\n', 1).rstrip()[:-len('commit;')]
    signatures = ['private.aqari_imported_tenant_save(uuid,text,jsonb,bigint,text)',
        'private.aqari_imported_tenant_read(uuid,text)', 'private.aqari_reconcile_reminder_queue(uuid)',
        'private.aqari_v267_prepare_reminders(uuid,date,integer)', 'private.aqari_v267_project_state()']
    # Guard any existing helper whose CREATE OR REPLACE appears in the canonical sources.
    for f in catalog['functions']:
        name = f['signature'].split('(')[0]
        if ('create or replace function ' + name + '(') in first + second:
            signatures.append(f['signature'])
    expected = {s: hashlib.md5(next(f['definition'] for f in catalog['functions'] if f['signature']==s).encode()).hexdigest() for s in sorted(set(signatures))}
    expected['public.aqari_final_gap_register(uuid,text,jsonb)'] = hashlib.md5(rated.encode()).hexdigest()
    checks = '\n or '.join("md5(pg_get_functiondef('"+s+"'::regprocedure))<>'"+h+"'" for s,h in sorted(expected.items()))
    guard = """-- REVIEW ONLY. No existing preferences, consent, audit records or messages are rewritten.
begin;
set local lock_timeout='5s';
do $guard$
begin
 if """ + checks + """ then raise exception 'PRODUCTION_CONTACT_SOURCE_CHANGED';end if;
 if to_regprocedure('private.aqari_effective_contact_profile(uuid,uuid,jsonb)') is not null then
  raise exception 'PRODUCTION_CONTACT_ALREADY_PRESENT';end if;
end $guard$;
-- Historical audit rows retain NULL provenance; never invent their source route.
alter table private.aqari_contact_preference_audit add column source_route text
 check(source_route in ('financial_register','imported_editor'));
"""
    sql = guard + body(first) + '\n' + body(second) + '\ncommit;\n'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'candidate.sql').write_text(sql)
    (OUT / 'manifest.json').write_text(json.dumps({'production_applied': False,
        'sources': [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in [first_path, second_path]],
        'preflight_function_md5': expected, 'candidate_sha256': hashlib.sha256(sql.encode()).hexdigest(),
        'requires': 'tenant-rating/candidate.sql', 'installation_backfill': False,
        'historical_audit_source_route': 'NULL, not invented'}, indent=2) + '\n')

if __name__ == '__main__':
    build()
