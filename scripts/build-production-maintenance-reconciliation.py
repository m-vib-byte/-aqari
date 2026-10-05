"""Build a guarded review candidate; never connect to a hosted database."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'staging-database/reconciliation/maintenance'
SOURCES = [ROOT / 'staging-database/sql' / name for name in (
    'maintenance-request-category.sql', 'work-order-request-link.sql')]

def build():
    catalog = json.loads((ROOT / 'staging-database/local-test/schema-catalog-production-2026-10-05.json').read_text())
    signatures = ('aqari_operations_register(uuid,text,text,jsonb)',
                  'private.aqari_operations_register_core(uuid,text,text,jsonb)')
    expected = {s: hashlib.md5(next(f['definition'] for f in catalog['functions'] if f['signature'] == s).encode()).hexdigest() for s in signatures}
    category, link = [p.read_text() for p in SOURCES]
    old = "alter table public.aqari_maintenance_requests add column if not exists category_code text;\nupdate public.aqari_maintenance_requests set category_code='legacy_unclassified' where category_code is null;"
    if category.count(old) != 1:
        raise ValueError('Maintenance category source changed')
    category = category.replace(old, "-- Constant default preserves existing fields and does not fire row UPDATE triggers.\nalter table public.aqari_maintenance_requests add column category_code text not null default 'legacy_unclassified';")
    def body(sql):
        if sql.count('\nbegin;\n') != 1 or not sql.rstrip().endswith('commit;'):
            raise ValueError('Unexpected transaction envelope')
        return sql.replace('\nbegin;\n', '\n', 1).rstrip()[:-len('commit;')]
    checks = '\n or '.join("md5(pg_get_functiondef('" + ('public.' if not s.startswith('private.') else '') + s + "'::regprocedure)) is distinct from '" + h + "'" for s, h in expected.items())
    sql = """-- REVIEW ONLY: no hosted installation or existing business-row updates.
begin;
set local lock_timeout='5s';
do $guard$ begin
 if """ + checks + """
 or to_regprocedure('private.aqari_operations_register_base(uuid,text,text,jsonb)') is not null
 or to_regprocedure('private.aqari_operations_request_link(uuid,text,text,jsonb)') is not null
 or to_regprocedure('private.aqari_work_order_request_guard()') is not null
 or to_regprocedure('private.aqari_require_explicit_maintenance_category()') is not null
 or exists(select 1 from pg_attribute where attrelid='public.aqari_maintenance_requests'::regclass and attname='category_code' and not attisdropped)
 or exists(select 1 from pg_attribute where attrelid='private.aqari_work_orders'::regclass and attname in('unit_id','request_snapshot') and not attisdropped)
 then raise exception 'PRODUCTION_MAINTENANCE_SOURCE_CHANGED';end if;
end $guard$;
""" + body(category) + '\n' + body(link) + '\ncommit;\n'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'candidate.sql').write_text(sql)
    (OUT / 'manifest.json').write_text(json.dumps({
        'production_applied': False, 'installation_row_update': False,
        'sources': [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in SOURCES],
        'preflight_function_md5': expected,
        'candidate_sha256': hashlib.sha256(sql.encode()).hexdigest(),
        'historical_category': 'legacy_unclassified; existing request_type preserved without guessing a mapping',
        'scope': 'Category column required by current UI and guarded request/work-order linkage; no Storage changes'
    }, indent=2) + '\n')

if __name__ == '__main__':
    build()
