"""Build a review-only rating repair for the captured Production function shape."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'staging-database/reconciliation/tenant-rating'
CATALOG = ROOT / 'staging-database/local-test/schema-catalog-production-2026-10-05.json'
SOURCE = ROOT / 'staging-database/sql/tenant-rating-quarter-hardening.sql'

def build():
    catalog = json.loads(CATALOG.read_text())
    rows = [f for f in catalog['functions'] if f['signature'] in (
        'aqari_final_gap_register(uuid,text,jsonb)', 'public.aqari_final_gap_register(uuid,text,jsonb)')]
    if len(rows) != 1:
        raise ValueError('Expected exactly one Production register')
    original = rows[0]['definition']
    expected = 'f8be20ff5f57401e13dc99a950343ebf'
    if hashlib.md5(original.encode()).hexdigest() != expected:
        raise ValueError('Production register snapshot changed')
    canonical = SOURCE.read_text()
    helper = canonical[canonical.index('create or replace function private.aqari_tenant_rating_evidence'):canonical.index('-- Replace only the known rating branch.')]
    branch = canonical.split('after_branch:=$branch$', 1)[1].split('$branch$;', 1)[0]
    branch = branch.replace(" if p_action='rate' then", " elsif p_action='rate' then", 1)
    branch, closing = branch.rsplit(' end if;', 1)
    if closing.strip():
        raise ValueError('Unexpected canonical branch suffix')
    start = " elsif p_action='rate' then"
    end = " end if; return public.aqari_final_gap_register(w,'list','{}'::jsonb);"
    if original.count(start) != 1 or original.count(end) != 1 or original.count('rating_year integer;') != 1:
        raise ValueError('Production branch anchor changed')
    first, last = original.index(start), original.index(end)
    if first >= last:
        raise ValueError('Invalid branch boundaries')
    fixed = (original[:first] + branch + original[last:]).replace('rating_year integer;', '', 1)
    guard = f"""-- REVIEW ONLY; no business rows or stored ratings are updated.
begin;
set local lock_timeout='5s';
do $guard$
begin
 if md5(pg_get_functiondef('public.aqari_final_gap_register(uuid,text,jsonb)'::regprocedure))<>'{expected}'
 or to_regprocedure('private.aqari_tenant_rating_evidence(uuid,uuid,integer)') is not null then
  raise exception 'PRODUCTION_RATING_SOURCE_CHANGED';
 end if;
end $guard$;
"""
    sql = guard + helper + '\n' + fixed + ';\ncommit;\n'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'candidate.sql').write_text(sql)
    (OUT / 'manifest.json').write_text(json.dumps({
        'production_applied': False, 'source': str(SOURCE.relative_to(ROOT)),
        'source_sha256': hashlib.sha256(canonical.encode()).hexdigest(),
        'original_register_md5': expected,
        'original_register_acl': rows[0]['acl'],
        'candidate_sha256': hashlib.sha256(sql.encode()).hexdigest(),
        'scope': 'Only rating branch and its unused shadowing variable; canonical evidence helper; existing register ACL preserved'
    }, indent=2) + '\n')
    return fixed

if __name__ == '__main__':
    build()
