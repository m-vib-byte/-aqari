#!/usr/bin/env python3
"""Generate nine isolated rollback-only acceptance scripts; never connects to a DB.

Temporary SQL helper functions from local tests become literal expressions or
anonymous DO blocks. No DDL, GRANT, trigger changes or committed seed is emitted.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'hosted-test' / 'completion'
NAMES = ['maintenance_workflow', 'maintenance_attachments', 'tenant_rating_quarters',
         'tenant_contact_unification', 'work_order_request_link', 'commercial_sales',
         'commercial_sales_vacating', 'collection_account_management', 'vendor_optional_identity']

def args(text):
    parts, start, depth, quoted, i = [], 0, 0, False, 0
    while i < len(text):
        c = text[i]
        if c == "'":
            if quoted and i + 1 < len(text) and text[i + 1] == "'":
                i += 2
                continue
            quoted = not quoted
        elif not quoted:
            if c in '([': depth += 1
            elif c in ')]': depth -= 1
            elif c == ',' and depth == 0:
                parts.append(text[start:i].strip()); start = i + 1
        i += 1
    return parts + [text[start:].strip()]

def subst(sql, values):
    # Replace parameter identifiers, never SQL string literals or literal keys.
    return re.sub(r"'(?:''|[^'])*'|[A-Za-z_]\w*", lambda m: '(' + values[m[0]] + ')' if m[0] in values else m[0], sql)

def helpers(sql):
    found = {}
    pattern = r'create function pg_temp\.(\w+)\((.*?)\)\s*returns .*? as \$\$(.*?)\$\$;'
    def remove(m):
        parameters = []
        for p in args(m[2]):
            parsed = re.fullmatch(r'(\w+)\s+(\w+)(?:\s+default\s+(.+))?', p.strip(), re.I)
            if not parsed: raise ValueError('Unsupported helper parameter: ' + p)
            parameters.append(parsed.groups())
        found[m[1]] = (parameters, m[3].strip())
        return ''
    return re.sub(pattern, remove, sql, flags=re.I | re.S), found

def values(parameters, supplied):
    result = {}
    for i, (name, kind, default) in enumerate(parameters):
        raw = supplied[i] if i < len(supplied) else default
        if raw is None: raise ValueError('Missing helper argument: ' + name)
        result[name] = raw
    if len(supplied) > len(parameters): raise ValueError('Excess helper arguments')
    return result

def sql_helpers(sql, found):
    for name, (parameters, body) in found.items():
        if not body.lower().startswith('select '): continue
        expression = body[7:].strip().rstrip(';')
        pattern = r'pg_temp\.' + name + r'\(([^()]*)\)'
        sql = re.sub(pattern, lambda m: '(' + subst(expression, values(parameters, args(m[1]))) + ')', sql)
    return sql

def seed_call(helper, supplied, from_clause, found):
    parameters, body = found[helper]
    supplied_values = values(parameters, supplied)
    select = ','.join('(' + supplied_values[name] + ')::' + kind + ' AS arg' + str(i)
                      for i, (name, kind, default) in enumerate(parameters))
    declarations = ''.join(name + ' ' + kind + ':=seed_args.arg' + str(i) + ';'
                           for i, (name, kind, default) in enumerate(parameters))
    if body.lower().startswith('declare '):
        nested = 'declare ' + declarations + body[8:]
    else:
        nested = 'declare ' + declarations + '\nbegin\n' + body.rstrip(';') + ';\nend'
    return ('do $hosted_seed$ declare seed_args record;begin\n for seed_args in select '
            + select + (' ' + from_clause.strip() if from_clause.strip() else '')
            + ' loop\n ' + nested.rstrip(';') + ';\n end loop;\nend $hosted_seed$;')

def rating_helpers(sql, found):
    for helper in ['rating_fixture', 'rating_payment']:
        pattern = r'^select pg_temp\.' + helper + r'\((.*?)\)(\s+from\s+.*?)?;\s*$'
        sql = re.sub(pattern, lambda m: seed_call(helper, args(m[1]), m[2] or '', found), sql, flags=re.M)
    def assertion(target, supplied):
        label, expected, year = (supplied + ['2024'])[:3] if len(supplied) == 2 else supplied
        tenant = "md5('rating-tenant-'||(" + label + '))::uuid'
        return (f"select x into {target} from jsonb_array_elements(public.aqari_final_gap_register(current_setting('rating.w')::uuid,'rate',jsonb_build_object('tenant_id',{tenant},'year',({year})::integer))->'ratings')x "
                f"where x->>'tenant_id'=({tenant})::text and (x->>'rating_year')::integer=({year})::integer;\n"
                f"if ({target}->>'stars')::integer is distinct from ({expected})::integer then raise exception 'HOSTED_RATING_EXPECTATION_FAILED';end if;")
    def top_assert(m):
        supplied = args(m[1]); label, expected = supplied[:2]; year = supplied[2] if len(supplied) > 2 else '2024'
        query = f"select ({label})::text as label,({expected})::integer as expected,({year})::integer as rating_year" + (m[2] or '')
        return 'do $hosted_assert$ declare seed_args record;rating_result jsonb;begin for seed_args in ' + query + ' loop\n' + assertion('rating_result', ['seed_args.label', 'seed_args.expected', 'seed_args.rating_year']) + '\nend loop;end $hosted_assert$;'
    sql = re.sub(r'^select pg_temp\.rating_assert\((.*?)\)(\s+from\s+.*?)?;\s*$', top_assert, sql, flags=re.M)
    sql = re.sub(r'(\w+)\s*:=\s*pg_temp\.rating_assert\(([^()]*)\);', lambda m: assertion(m[1], args(m[2])), sql)
    return sql

def maintenance_documents(sql):
    pattern = r"select set_config\('([^']+)',pg_temp\.maintenance_doc\((.*?)\)::text,true\);"
    def replace(m):
        supplied = args(m[2]); ref = supplied[0]; mime = supplied[1] if len(supplied) > 1 else "'image/jpeg'"
        return ("do $hosted_doc$ declare reserved record;begin\n"
                "select * into reserved from public.aqari_reserve_document(current_setting('maintenance.test.workspace')::uuid,'property_document','property'," + ref + ",'دليل إنجاز اصطناعي','fixture-document'," + mime + ",'{}');\n"
                "insert into storage.objects(bucket_id,name,metadata)values(reserved.storage_bucket,reserved.storage_path,jsonb_build_object('size',100,'mimetype'," + mime + "));\n"
                "perform public.aqari_finalize_document(reserved.document_id,100," + mime + ",repeat('a',64));\n"
                "perform set_config('" + m[1] + "',reserved.document_id::text,true);\nend $hosted_doc$;")
    return re.sub(pattern, replace, sql)

def restrict_mutations(sql):
    pattern = r'\b(update\s+|delete\s+from\s+)((?:public|private|storage)\.\w+)\s*([^;]*);'
    def restrict(m):
        tail = m[3]
        if m[2] == 'storage.objects':
            guard = "name like current_setting('hosted.test.workspace')||'/%'"
        else:
            guard = "workspace_id=current_setting('hosted.test.workspace')::uuid"
        # Keep every original predicate and add an explicit synthetic scope even
        # to negative writes that are expected to fail before row evaluation.
        tail += (' and ' if re.search(r'\bwhere\b', tail, re.I) else ' where ') + guard
        return m[1] + m[2] + ' ' + tail + ';'
    return re.sub(pattern, restrict, sql, flags=re.I)

def generated(name, index):
    source_path = ROOT / 'tests' / (name + '.sql')
    original = source_path.read_text()
    sql, found = helpers(original)
    sql = sql_helpers(sql, found)
    if name == 'maintenance_workflow': sql = maintenance_documents(sql)
    if name == 'tenant_rating_quarters': sql = rating_helpers(sql, found)
    wid = '76f10000-0000-4000-8000-' + str(index).zfill(12)
    slug = 'hosted-completion-' + name.replace('_', '-')
    if name == 'tenant_contact_unification':
        sql = sql.replace('c0710000-0000-4000-8000-000000000000', wid).replace('contact-unification-test', slug)
        # Record readiness through the public, authenticated identity checked RPC.
        old = re.search(r"do \$\$begin if to_regclass\('private.aqari_unit_readiness'\).*?end if;end\$\$;", sql, flags=re.S)
        if not old: raise ValueError('Contact readiness fixture changed')
        replacement = """do $$declare unit record;begin
 for unit in select * from public.aqari_units where workspace_id=current_setting('contact.w')::uuid loop
  perform public.aqari_unit_readiness_register(unit.workspace_id,'record',jsonb_build_object('id',gen_random_uuid(),'property_id',unit.property_id,'unit_no',unit.unit_no,'expected_revision',0,'state','ready','inspected_on',current_date,'source_ref','Synthetic hosted contact readiness','reason','Unit inspected before the synthetic lease'));
 end loop;
end$$;"""
        sql = sql[:old.start()] + replacement + sql[old.end():]
        prefix = "\nselect set_config('hosted.test.workspace','" + wid + "',true);\n"
    else:
        sql = sql.replace('aqari-v267-staging', slug)
        prefix = ("\nselect set_config('hosted.test.workspace','" + wid + "',true);\n"
                  "insert into public.aqari_workspaces(id,slug,name) values('" + wid + "','" + slug + "','Synthetic rollback acceptance: " + name + "');\n"
                  "insert into public.aqari_app_state(workspace_id,payload) values('" + wid + "','{}');\n")
    sql = re.sub(r'^begin;', lambda m: m[0] + prefix, sql, count=1, flags=re.M)
    sql = restrict_mutations(sql)
    for mutation in re.findall(r'\b(?:update\s+|delete\s+from\s+)(?:public|private|storage)\.\w+[^;]*;', sql, re.I):
        if "current_setting('hosted.test.workspace')" not in mutation:
            raise ValueError('Unscoped mutation: ' + mutation)
    if re.search(r'\bpg_temp\.', sql): raise ValueError('Unexpanded helper: ' + name)
    if 'aqari-v267-staging' in sql: raise ValueError('Shared workspace reference: ' + name)
    if len(re.findall(r'^begin;', sql, re.M)) != 1 or len(re.findall(r'^rollback;', sql, re.M)) != 1: raise ValueError('Transaction boundary changed')
    uncommented = re.sub(r'--[^\n]*', '', sql)
    if re.search(r'(?im)^\s*(create|alter|drop|grant|revoke|commit|truncate)\b|session_replication_role|disable\s+(?:row\s+level|trigger)', uncommented): raise ValueError('Forbidden statement: ' + name)
    header = ('-- GENERATED ROLLBACK-ONLY HOSTED PREVIEW ACCEPTANCE. No schema/permission changes.\n'
              '-- Source: staging-database/tests/' + name + '.sql\n'
              '-- Primary workspace: ' + wid + ' / ' + slug + '\n'
              '-- Run this entire file as one query; never extract setup statements.\n')
    return header + sql, {'name': name, 'workspace_id': wid, 'workspace_slug': slug,
                          'source_sha256': hashlib.sha256(original.encode()).hexdigest()}

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Compare generated SQL and manifest with saved files without writing anything.')
    options = parser.parse_args(argv)
    artifacts = {}
    manifest = []
    for index, name in enumerate(NAMES, 1):
        sql, entry = generated(name, index)
        target = OUT / (f'{index:02d}-' + name + '.sql')
        artifacts[target] = sql.encode('utf-8')
        entry.update(file=target.name, sha256=hashlib.sha256(sql.encode()).hexdigest())
        manifest.append(entry)
    artifacts[OUT / 'manifest.json'] = (json.dumps({'tests': manifest, 'excluded_local_only': ['partner_shares_integrity.sql', 'commercial_sales_vacating_upgrade.sql']}, indent=2) + '\n').encode('utf-8')
    if options.check:
        mismatches = []
        for target, expected in artifacts.items():
            if not target.is_file():
                mismatches.append('Missing: ' + str(target.relative_to(ROOT)))
            elif target.read_bytes() != expected:
                mismatches.append('Out of date: ' + str(target.relative_to(ROOT)))
        if mismatches:
            print('\n'.join(mismatches), file=sys.stderr)
            print('Run python3 staging-database/hosted-test/generate-completion.py to regenerate.', file=sys.stderr)
            return 1
        print('PASS: all nine hosted SQL files and manifest match their sources; no files written.')
        return 0
    OUT.mkdir(parents=True, exist_ok=True)
    for target, content in artifacts.items():
        target.write_bytes(content)
        print(target.relative_to(ROOT))
    return 0

if __name__ == '__main__': sys.exit(main())
