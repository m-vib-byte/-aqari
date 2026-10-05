"""Current-schema fixture adapters. No guard, assertion or permission is removed.

Legacy generated acceptance remains reproducible. These copies supply new
mandatory fixture inputs and are validated on the isolated hosted project.
"""
import importlib.util
import json
import hashlib
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('baseline', HERE / 'generate-completion.py')
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


def once(sql, old, new):
    if sql.count(old) != 1:
        raise ValueError('Fixture anchor changed: ' + old[:100])
    return sql.replace(old, new, 1)


def insert_values(sql, table, adapt):
    """Adapt only literal VALUES fixture inserts, preserving every other query."""
    pattern = re.compile(r'insert into ' + re.escape(table) + r'\s*\(([^)]+)\)\s*values\s*', re.I)
    offset = 0
    while (match := pattern.search(sql, offset)):
        columns = [x.strip() for x in match[1].split(',')]
        pos = match.end()
        rows = []
        while pos < len(sql) and sql[pos] == '(':
            start, depth, quoted, i = pos + 1, 1, False, pos + 1
            while depth:
                c = sql[i]
                if c == "'":
                    if quoted and sql[i:i + 2] == "''":
                        i += 2
                        continue
                    quoted = not quoted
                elif not quoted:
                    depth += (c == '(') - (c == ')')
                i += 1
            values = baseline.args(sql[start:i - 1])
            if len(values) != len(columns):
                raise ValueError('Fixture column mismatch: ' + table)
            updated = adapt(dict(zip(columns, values)))
            rows.append(updated)
            pos = i
            while sql[pos].isspace():
                pos += 1
            if sql[pos] != ',':
                break
            pos += 1
            while sql[pos].isspace():
                pos += 1
        if not rows:
            raise ValueError('VALUES expected')
        keys = list(rows[0])
        replacement = 'insert into ' + table + '(' + ','.join(keys) + ')values\n' + ',\n'.join(
            '(' + ','.join(row[key] for key in keys) + ')' for row in rows)
        sql = sql[:match.start()] + replacement + sql[pos:]
        offset = match.start() + len(replacement)
    return sql


def current(sql, name):
    if name in ('maintenance_attachments', 'work_order_request_link'):
        sql = insert_values(sql, 'public.aqari_maintenance_requests',
                            lambda row: {**row, 'category_code': "'plumbing'"})
    if name in ('tenant_rating_quarters', 'collection_account_management', 'commercial_sales_vacating'):
        def payment(row):
            ref, method = '(' + row['reference'] + ')', '(' + row['payment_method'] + ')'
            provider = "case when " + method + " in ('cash','نقدي') then '' when " + method + " in ('KNET','knet','كي نت') then 'KNET' else 'Synthetic Bank' end"
            fields = "jsonb_build_object('transactionNo'," + ref + ",'method'," + method + ",'paymentProvider'," + provider + ')'
            receipt = "jsonb_build_object('transactionNo'," + ref + ",'record',jsonb_build_array(null,null,null,null,null,null,null,null,null," + method + '))'
            return {**row, 'record': '(' + row['record'] + ')::jsonb||' + fields,
                    'receipt': '(' + row['receipt'] + ')::jsonb||' + receipt}
        sql = insert_values(sql, 'public.aqari_rent_payments', payment)
    if name == 'tenant_contact_unification':
        sql = insert_values(sql, 'public.aqari_leases', lambda row: {
            **row, 'snapshot': '(' + row['snapshot'] + ")::jsonb||'{\"source\":\"statement-import\"}'::jsonb"})
    if name in ('commercial_sales', 'commercial_sales_vacating'):
        anchor = "  insert into public.aqari_properties"
        sql = once(sql, anchor, "  insert into public.aqari_app_state(workspace_id,payload) values(w,'{}') on conflict(workspace_id) do nothing;\n" + anchor)
    if name == 'work_order_request_link':
        anchor = "  insert into public.aqari_properties"
        sql = once(sql, anchor, "  insert into public.aqari_app_state(workspace_id,payload) values(s,'{}') on conflict(workspace_id) do nothing;\n" + anchor)
    if name == 'maintenance_workflow':
        evidence = "perform public.aqari_maintenance_evidence(w,'76580000-0000-4000-8000-000000000101','add',jsonb_build_object('taskId','76580000-0000-4000-8000-000000000501','documentId',current_setting('maintenance.test.gooddoc'),'stage','%s','reason','Synthetic %s evidence'));"
        start = " r:=public.aqari_maintenance_plans(w,'start_task','{\"id\":\"76580000-0000-4000-8000-000000000501\",\"revision\":1,\"reason\":\"بدء التنفيذ المثبت\"}');"
        sql = once(sql, start, ' ' + evidence % ('before', 'before') + '\n' + start + '\n ' + evidence % ('after', 'after'))
    # No unscoped mutations, DDL, commits or bypass flags may enter these copies.
    baseline_guard = re.sub(r'--[^\n]*', '', sql)
    if re.search(r'(?im)^\s*(create|alter|drop|grant|revoke|commit|truncate)\b|session_replication_role|disable\s+(?:row\s+level|trigger)', baseline_guard):
        raise ValueError('Unsafe hosted fixture')
    if len(re.findall(r'^begin;', sql, re.M)) != 1 or len(re.findall(r'^rollback;', sql, re.M)) != 1:
        raise ValueError('Transaction boundary changed')
    return '-- CURRENT SCHEMA FIXTURES: metadata-only synthetic acceptance; rollback-only.\n' + sql


def main():
    check = sys.argv[1:] == ['--check']
    if sys.argv[1:] not in ([], ['--check']):
        raise SystemExit('Usage: current-fixtures.py [--check]')
    out = HERE / 'completion-current'
    artifacts, entries = {}, []
    for index, name in enumerate(baseline.NAMES, 1):
        sql, entry = baseline.generated(name, index)
        content = current(sql, name).encode()
        filename = f'{index:02d}-{name}.sql'
        artifacts[out / filename] = content
        entries.append({**entry, 'file': filename, 'sha256': hashlib.sha256(content).hexdigest()})
    artifacts[out / 'manifest.json'] = (json.dumps({'tests': entries}, indent=2) + '\n').encode()
    if check:
        changed = [str(path.relative_to(HERE)) for path, data in artifacts.items() if not path.is_file() or path.read_bytes() != data]
        if changed:
            raise SystemExit('Stale current fixtures: ' + ', '.join(changed))
    else:
        out.mkdir(exist_ok=True)
        for path, data in artifacts.items():
            path.write_bytes(data)
    print('PASS: current fixture copies ' + ('match sources' if check else 'generated'))


if __name__ == '__main__':
    main()
