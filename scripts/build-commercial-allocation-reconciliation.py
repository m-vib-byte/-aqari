"""Build a review-only SQL candidate. No database access or deployment.

Reuses individually tracked financial sources, not the entire Preview history.
The resulting SQL is deliberately outside supabase/migrations until recovery
and hosted rehearsal gates are complete.
"""
from pathlib import Path
import hashlib
import json
import importlib.util

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'staging-database/reconciliation/commercial-allocation'
BASE = 'staging-database/supabase/migrations/'
SOURCES = [
    '20260912182933_v267_commercial_payment_allocation_and_vacating_balance.sql',
    '20260912183407_v267_commercial_active_allocation_view.sql',
    '20260912183421_v267_rent_schedule_commercial_allocation_residual.sql',
    '20260912183434_v267_commercial_statement_cancelled_receipt_consistency.sql',
    '20260912183448_v267_commercial_clearance_active_payment_consistency.sql',
    '20260912183503_v267_vacating_balance_commercial_payment_consistency.sql',
    '20260912184410_v267_commercial_payment_context.sql',
    '20260912184456_v267_commercial_payment_context_wrapper_fix.sql',
]

def current_payment_fixtures(sql):
    path = ROOT / 'staging-database/hosted-test/current-fixtures.py'
    spec = importlib.util.spec_from_file_location('commercial_current_fixtures', path)
    adapter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(adapter)
    def payment(row):
        ref, method = '(' + row['reference'] + ')', '(' + row['payment_method'] + ')'
        provider = "case when " + method + " in ('cash','نقدي') then '' when " + method + " in ('KNET','knet','كي نت') then 'KNET' else 'Synthetic Bank' end"
        fields = "jsonb_build_object('transactionNo'," + ref + ",'method'," + method + ",'paymentProvider'," + provider + ')'
        receipt = "jsonb_build_object('transactionNo'," + ref + ",'record',jsonb_build_array(null,null,null,null,null,null,null,null,null," + method + '))'
        return {**row, 'record': '(' + row['record'] + ')::jsonb||' + fields,
                'receipt': '(' + row['receipt'] + ')::jsonb||' + receipt}
    return adapter.insert_values(sql, 'public.aqari_rent_payments', payment)
GUARD = """-- REVIEW CANDIDATE ONLY: not an approved Production migration.
begin;
set local lock_timeout='5s';
do $preflight$
begin
 if to_regclass('private.aqari_commercial_payment_allocations') is not null
 or to_regclass('private.aqari_commercial_payment_allocation_reversals') is not null
 or to_regprocedure('private.aqari_legacy_allocation_clearance(uuid,uuid)') is not null
 or to_regprocedure('private.aqari_legacy_allocation_vacating_balances(uuid,uuid,date)') is not null then
  raise exception 'COMMERCIAL_RECONCILIATION_ALREADY_PRESENT_OR_PARTIAL';
 end if;
 if md5(pg_get_functiondef('private.aqari_refresh_rent_due_schedule(uuid,uuid)'::regprocedure))<>'d08c427a9a88f3ce9ce825856c1f7ee6'
 or md5(pg_get_functiondef('private.aqari_require_commercial_clearance(uuid,uuid)'::regprocedure))<>'f85dbffd94958b57ff39041e1aad7562'
 or md5(pg_get_functiondef('private.aqari_vacating_balances(uuid,uuid,date)'::regprocedure))<>'eee384e897e6041f1b815f9c5d590e1a' then
  raise exception 'COMMERCIAL_RECONCILIATION_SOURCE_CHANGED';
 end if;
 if to_regprocedure('private.aqari_independent_commercial_clearance(uuid,uuid)') is null
 or to_regprocedure('private.aqari_commercial_legacy_mode_guard()') is null then
  raise exception 'COMMERCIAL_RECONCILIATION_INDEPENDENT_MODE_MISSING';
 end if;
end $preflight$;
"""

def build():
    parts = [GUARD]
    manifest = []
    for name in SOURCES:
        relative = BASE + name
        raw = (ROOT / relative).read_bytes()
        parts.append('-- Source: ' + relative + '\n' + raw.decode())
        manifest.append({'path': relative, 'sha256': hashlib.sha256(raw).hexdigest()})
    relative = 'staging-database/sql/commercial-collections.sql'
    source = (ROOT / relative).read_text()
    start = source.index('do $compat$')
    end = source.index('end $compat$;', start) + len('end $compat$;')
    parts.append('-- Preserve independent collection routing and workspace locking.\n' + source[start:end])
    manifest.append({'path': relative, 'sha256': hashlib.sha256(source.encode()).hexdigest(), 'section': 'do $compat$'})
    # Keep the existing Production ACL on the changed private balance function.
    parts.append("revoke all on function private.aqari_vacating_balances(uuid,uuid,date) from public,anon,authenticated,service_role;\ncommit;\n")
    sql = '\n\n'.join(parts)
    # Do not allow a newly restored SECURITY DEFINER helper to be used directly
    # by an authenticated caller outside their lease/property scope.
    anchor = "declare due_total numeric:=0;paid_total numeric:=0;\nbegin"
    # Both historical statement definitions occur in the ordered source bundle.
    if sql.count(anchor) != 2:
        raise ValueError('Statement authorization anchor changed')
    sql = sql.replace(anchor, anchor + "\n if auth.uid() is null or not private.aqari_can_lease(w,lid,'finance','read') then raise insufficient_privilege using message='ACCESS_DENIED';end if;")
    anchor = "if not found or p.lease_id<>s.lease_id or p.status not in ('مدفوع','جزئي','paid','partial') then"
    if sql.count(anchor) != 1:
        raise ValueError('Payment cancellation anchor changed')
    sql = sql.replace(anchor, "if not found or p.lease_id<>s.lease_id or p.status not in ('مدفوع','جزئي','paid','partial') or exists(select 1 from private.aqari_receipt_cancellations c where c.workspace_id=w and c.payment_id=p.id) then")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'candidate.sql').write_text(sql)
    test_source = 'staging-database/tests/commercial_sales_payment_allocation.sql'
    test = (ROOT / test_source).read_text()
    extra = """
-- A receipt cancelled before allocation must never acquire a new allocation.
set local role authenticated;
do $test$
begin
 begin
  perform public.aqari_commercial_payment_allocations(current_setting('aqari.test.commercial.allocation.workspace')::uuid,'allocate',
   '{"id":"76610000-0000-4000-8000-000000000799","sale_id":"76610000-0000-4000-8000-000000000602","payment_id":"76610000-0000-4000-8000-000000000901","amount":"1.000"}');
  raise exception 'CANCELLED_RECEIPT_ACCEPTED_FOR_NEW_ALLOCATION';
 exception when check_violation then
  if sqlerrm<>'COMMERCIAL_PAYMENT_NOT_AVAILABLE' then raise;end if;
 end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform private.aqari_commercial_statement_data(current_setting('aqari.test.commercial.allocation.workspace')::uuid,'76610000-0000-4000-8000-000000000401','2026-01-01','2026-12-31');
  raise exception 'UNAUTHENTICATED_PRIVATE_STATEMENT_ALLOWED';
 exception when insufficient_privilege then
  if sqlerrm<>'ACCESS_DENIED' then raise;end if;
 end;
end $test$;
reset role;
"""
    if test.lower().count('rollback;') != 1:
        raise ValueError('Acceptance rollback anchor changed')
    (OUT / 'acceptance.sql').write_text('-- Generated from ' + test_source + '\n' + current_payment_fixtures(test.replace('rollback;', extra + '\nrollback;')))
    for name in ['commercial_collections_legacy_compat', 'commercial_collections']:
        relative = 'staging-database/tests/' + name + '.sql'
        original = (ROOT / relative).read_text()
        anchor = '  insert into public.aqari_properties'
        if original.count(anchor) != 1:
            raise ValueError('Commercial workspace seed anchor changed')
        adapted = original.replace(anchor, "  insert into public.aqari_app_state(workspace_id,payload) values(w,'{}') on conflict(workspace_id) do nothing;\n" + anchor)
        (OUT / (name + '.sql')).write_text('-- Current payment/workspace fixtures; original assertions preserved.\n' + current_payment_fixtures(adapted))
        manifest.append({'path': relative, 'sha256': hashlib.sha256(original.encode()).hexdigest(), 'adaptation': 'literal payment metadata and synthetic workspace state'})
    (OUT / 'manifest.json').write_text(json.dumps({'production_applied': False, 'full_production_clone': False, 'sources': manifest, 'acceptance_source': test_source, 'acceptance_source_sha256': hashlib.sha256(test.encode()).hexdigest(), 'candidate_sha256': hashlib.sha256(sql.encode()).hexdigest()}, indent=2) + '\n')

if __name__ == '__main__':
    build()
