import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from urllib.parse import parse_qs, urlsplit
from lib.contract_template_pdf import render_document_template
from lib.rental_document_context import resolve_document_values

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('template_preview', ROOT / 'api/contract-template-preview.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
W = '76610000-0000-4000-8000-000000000001'
AUTH = 'Bearer test.user.signature'


def fixture():
    profile = {'id': 'profile1', 'nameAr': 'مستأجر اختبار', 'nameEn': 'Test Tenant', 'civilId': '123456789012', 'nationality': 'اختبار', 'nationalityEn': 'Test', 'passportNo': 'PASS', 'phone': '55555555', 'email': 'example@example.invalid'}
    contract = {'id': 101, 'tenantId': 'profile1', 'contract_no': 'C101', 'property': 'عقار اختبار', 'unit': '5', 'floor': '3', 'propertyId': 'property1', 'unitId': 'unit1', 'start_date': '2026-09-01', 'end_date': '2027-08-31', 'writtenOn': '2026-08-20', 'contractRent': '350.125', 'deposit': 0, 'advance': 0, 'cleaningFee': '5.000', 'status': 'signed', 'accountant': 'محاسب اختبار'}
    lease = {'id': 'lease1', 'workspace_id': W, 'external_ref': '101', 'tenant_id': 'tenant1', 'unit_id': 'unit1', 'contract_no': 'C101', 'start_date': contract['start_date'], 'end_date': contract['end_date'], 'monthly_rent': 350.125, 'status': 'signed'}
    tenant = {'id': 'tenant1', 'workspace_id': W, 'external_ref': 'profile1', 'profile': profile, 'civil_id': profile['civilId'], 'full_name': profile['nameAr']}
    unit = {'id': 'unit1', 'workspace_id': W, 'property_id': 'property1', 'unit_no': '5'}
    prop = {'id': 'property1', 'workspace_id': W, 'name': contract['property'], 'metadata': {'source_owner': 'مالك المصدر', 'source_address': 'عنوان المصدر'}}
    master = {'workspace_id': W, 'user_id': 'user1', 'property': {'id': 'property1', 'name': prop['name'], 'address': '', 'owners': [], 'propertyAutomaticRef': 'AUTO-P'}, 'unit': {'id': 'unit1', 'propertyId': 'property1', 'unitNo': '5', 'floor': '3', 'automaticRef': 'AUTO-U'}}
    state = {'contractsV202': [contract], 'tenantProfilesV267': [profile]}
    fields = [{'key': k, 'label': label, 'type': typ, 'required': required} for k, label, typ, required in [('tenant_name', 'اسم المستأجر', 'text', True), ('civil_id', 'الرقم المدني', 'text', True), ('owner_name', 'اسم المالك', 'text', True), ('monthly_rent', 'الإيجار', 'money', True), ('deposit_amount', 'التأمين', 'money', True), ('contract_start_date', 'بداية العقد', 'date', True), ('note', 'ملاحظة', 'text', False)]]
    template = {'id': 'test-template', 'revision': 0, 'kind': 'rental_agreement', 'kind_label': 'عقد إيجار', 'title': 'معاينة اختبار', 'fields': fields, 'clauses': [{'title': 'بيانات {{tenant_name}}', 'text': 'المستأجر {{tenant_name}} مدني {{civil_id}} المالك {{owner_name}} الإيجار {{monthly_rent}} التأمين {{deposit_amount}} البداية {{contract_start_date}} {{note}}'}]}
    return {'payload': state, 'selection': {'contractId': '101'}, 'lease': lease, 'tenant': tenant, 'property_row': prop, 'unit': unit, 'master': master, 'template': template}


class PreviewTest(unittest.TestCase):
    def setUp(self):
        self.f = fixture()
        self.calls = []
        self.context = {'workspace_id': W, 'user_id': 'user1', 'can_publish': True}

    def rpc(self, name, payload, auth):
        self.assertEqual(auth, AUTH)
        self.calls.append((name, payload))
        if name == 'aqari_rental_templates':
            self.assertEqual(payload['p_action'], 'context')
            return copy.deepcopy(self.context)
        if name == 'aqari_read_state_v267':
            return {'workspace_id': W, 'payload': copy.deepcopy(self.f['payload'])}
        if name == 'aqari_property_contract_context':
            return copy.deepcopy(self.f['master'])
        if name == 'aqari_official_document_context':
            payment = self.f['payment']
            return {'workspace_id': W, 'user_id': 'user1', 'entity_id': self.f['lease']['id'], 'source_id': payment['id'], 'sources': [] if self.f.get('cancelled') else [{'id': payment['id']}]}
        self.fail('Unexpected RPC: ' + name)

    def read(self, path, auth):
        self.assertEqual(auth, AUTH)
        query = parse_qs(urlsplit(path).query)
        self.assertEqual(query['workspace_id'], ['eq.' + W])
        key = {'aqari_leases': 'lease', 'aqari_tenants': 'tenant', 'aqari_units': 'unit', 'aqari_properties': 'property_row', 'aqari_rent_payments': 'payment'}[urlsplit(path).path.split('/')[-1]]
        return [copy.deepcopy(self.f[key])]

    def body(self):
        return {'workspaceId': W, 'template': self.f['template'], 'document': copy.deepcopy(self.f['selection'])}

    def test_template_only_contract_stays_compatible(self):
        result = api.export_preview({'workspaceId': W, 'template': self.f['template']}, AUTH, self.rpc, self.read)
        self.assertTrue(result.startswith(b'%PDF-'))
        self.assertEqual(len(self.calls), 1)

    def test_bound_export_and_snapshot_digest(self):
        result, digest = api.prepare_preview(self.body(), AUTH, self.rpc, self.read)
        self.assertTrue(result.startswith(b'%PDF-'))
        body = self.body()
        body['document']['previewDigest'] = digest
        self.assertEqual(api.prepare_preview(body, AUTH, self.rpc, self.read)[1], digest)
        self.f['payload']['contractsV202'][0]['contractRent'] = '400.000'
        with self.assertRaisesRegex(ValueError, 'DOCUMENT_PREVIEW_CHANGED'):
            api.prepare_preview(body, AUTH, self.rpc, self.read)
        self.assertTrue(all(name in {'aqari_rental_templates', 'aqari_read_state_v267', 'aqari_property_contract_context'} for name, _ in self.calls))

    def test_authorization_workspace_and_override_guards(self):
        with self.assertRaises(PermissionError):
            api.export_preview(self.body(), None, self.rpc, self.read)
        self.context['can_publish'] = False
        with self.assertRaises(PermissionError):
            api.export_preview(self.body(), AUTH, self.rpc, self.read)
        self.context['can_publish'] = True
        for values in [{'tenant_name': 'someone'}, {'civil_id': '999'}, {'contract_start_date': '2026-01-01'}, {'unknown': 'value'}]:
            body = self.body(); body['document']['values'] = values
            with self.assertRaises(ValueError):
                api.export_preview(body, AUTH, self.rpc, self.read)
        self.f['unit']['workspace_id'] = 'foreign'
        with self.assertRaises(PermissionError):
            api.export_preview(self.body(), AUTH, self.rpc, self.read)

    def test_mismatched_links_fail_and_duplicate_contract_fails(self):
        for key, value in [('tenant_id', 'foreign-tenant'), ('unit_id', 'foreign-unit'), ('contract_no', 'other-contract')]:
            saved = self.f['lease'][key]; self.f['lease'][key] = value
            with self.assertRaises(ValueError):
                api.export_preview(self.body(), AUTH, self.rpc, self.read)
            self.f['lease'][key] = saved
        self.f['payload']['contractsV202'].append(copy.deepcopy(self.f['payload']['contractsV202'][0]))
        with self.assertRaises(ValueError):
            api.export_preview(self.body(), AUTH, self.rpc, self.read)

    def test_receipt_cancellation_checked_against_official_source(self):
        self.f['payment'] = {'id': 'payment1', 'workspace_id': W, 'lease_id': 'lease1', 'reference': 'R1', 'status': 'paid', 'paid_at': '2026-09-02', 'period': '2026-09-01', 'amount': 350.125, 'payment_method': 'KNET', 'record': {'contractId': 101, 'transactionNo': 'TX1'}, 'receipt': {'contract': {'id': 101}}}
        self.f['selection']['receiptId'] = 'payment1'
        self.f['template']['kind'] = 'rent_receipt'
        self.assertTrue(api.export_preview(self.body(), AUTH, self.rpc, self.read).startswith(b'%PDF-'))
        self.f['cancelled'] = True
        with self.assertRaises(PermissionError):
            api.export_preview(self.body(), AUTH, self.rpc, self.read)

    def test_python_browser_resolver_render_and_digest_parity(self):
        f = self.f
        values = resolve_document_values(**{k: f[k] for k in ['payload', 'selection', 'lease', 'tenant', 'property_row', 'unit', 'master']})
        rendered = render_document_template(f['template'], values)
        js = '''import fs from 'node:fs'; import {createHash} from 'node:crypto'; import {resolveRentalDocumentContext,renderDocumentTemplate,resolveDocumentSigners} from './src/v267/domain/rental-document-cycle.js';
const f=JSON.parse(fs.readFileSync(0,'utf8')); const c=resolveRentalDocumentContext(f.payload,f.selection,{workspaceId:f.lease.workspace_id,leases:[f.lease],tenants:[f.tenant],properties:[f.property_row],units:[{...f.unit,...f.master.unit}],propertyMasters:[f.master]});
const r=renderDocumentTemplate(f.template,c.values); const shape=[r.title,f.template.kind,f.template.kind_label,r.clauses.map(c=>[c.title,c.text]),Object.entries(r.values).sort(([a],[b])=>a<b?-1:a>b?1:0),resolveDocumentSigners(f.template.kind,r.values).map(s=>[s.role,s.label,s.name])];
process.stdout.write(JSON.stringify({values:c.values,rendered:r,digest:createHash('sha256').update(JSON.stringify(shape)).digest('hex')}));'''
        result = subprocess.run(['node', '--input-type=module', '-e', js], input=json.dumps(f), capture_output=True, text=True, cwd=ROOT, check=True)
        browser = json.loads(result.stdout)
        self.assertEqual(browser['values'], values)
        self.assertEqual(browser['rendered']['values'], rendered['values'])
        self.assertEqual(browser['rendered']['clauses'], rendered['clauses'])
        self.assertEqual(browser['digest'], api.document_digest(rendered))
        self.assertIn('0.000', rendered['clauses'][0]['text'])
        self.assertIn('01/09/2026', rendered['clauses'][0]['text'])


    def test_renamed_property_and_legacy_array_metadata(self):
        self.f['property_row']['name'] = 'الاسم الجديد'
        self.f['property_row']['metadata'] = ['legacy', 'array']
        self.f['master']['property']['name'] = 'الاسم الجديد'
        self.f['master']['property']['owners'] = [{'name': 'مالك اختبار', 'bps': 10000}]
        self.assertTrue(api.export_preview(self.body(), AUTH, self.rpc, self.read).startswith(b'%PDF-'))

    def test_five_document_kinds_browser_pdf_snapshot_parity(self):
        js = "import {documentTemplateBlueprints} from './src/v267/domain/rental-document-cycle.js';process.stdout.write(JSON.stringify(documentTemplateBlueprints));"
        blueprints = json.loads(subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True, cwd=ROOT, check=True).stdout)
        payment = {'id': '76610000-0000-4000-8000-000000000009', 'workspace_id': W, 'lease_id': 'lease1', 'reference': 'R1', 'status': 'paid', 'paid_at': '2026-09-02', 'period': '2026-09-01', 'amount': '350.125', 'payment_method': 'KNET', 'record': {'contractId': 101, 'transactionNo': 'TX1', 'receiverName': 'مستلم الوصل', 'accountant': 'محاسب الوصل'}, 'receipt': {'contract': {'id': 101}, 'record': ['R1', 'مستأجر اختبار', '350.125', 'paid', 'عقار اختبار', '2026-09-02', '5', '', '2026-09', 'KNET']}}
        extras = {'document_no': 'D1', 'issued_at': '2026-09-20', 'handover_date': '2026-09-01', 'key_count': 0, 'unit_condition': 'حالة اختبار', 'vacate_date': '2026-09-30', 'key_return_date': '2026-09-30', 'settlement_reference': 'S1', 'net_balance': 0}
        parity_script = """import fs from 'node:fs';import {createHash} from 'node:crypto';import {resolveRentalDocumentContext,renderDocumentTemplate,resolveDocumentSigners} from './src/v267/domain/rental-document-cycle.js';
const f=JSON.parse(fs.readFileSync(0,'utf8'));const c=resolveRentalDocumentContext(f.payload,f.selection,{workspaceId:f.lease.workspace_id,leases:[f.lease],tenants:[f.tenant],properties:[f.property_row],units:[{...f.unit,...f.master.unit}],propertyMasters:[f.master],receipts:f.payment?[f.payment]:[]});const r=renderDocumentTemplate(f.template,{...c.values,...f.extras});const signs=resolveDocumentSigners(f.template.kind,r.values).map(s=>[s.role,s.label,s.name]);const shape=[r.title,f.template.kind,f.template.kind_label,r.clauses.map(c=>[c.title,c.text]),Object.entries(r.values).sort(([a],[b])=>a<b?-1:a>b?1:0),signs];process.stdout.write(JSON.stringify({values:c.values,rendered:r,digest:createHash('sha256').update(JSON.stringify(shape)).digest('hex')}));"""
        for bp in blueprints:
            with self.subTest(kind=bp['kind']):
                f = fixture()
                f['master']['property']['representative'] = {'name': 'وكيل اختبار', 'civilId': '123456789013', 'powerOfAttorneyNo': 'P1'}
                fields = [{k: field[k] for k in ['key', 'label', 'type', 'required']} for field in bp['fields']]
                f['template'] = {'kind': bp['kind'], 'kind_label': bp['label'], 'title': 'معاينة اصطناعية', 'fields': fields, 'clauses': [{'title': 'بيانات اختبار', 'text': ' / '.join('{{'+field['key']+'}}' for field in fields)}]}
                f['extras'] = {k:v for k,v in extras.items() if k in {field['key'] for field in fields}}
                f['payment'] = payment if bp['kind'] == 'rent_receipt' else None
                if f['payment']:
                    f['selection']['receiptId'] = payment['id']
                values = resolve_document_values(**{k: f[k] for k in ['payload', 'selection', 'lease', 'tenant', 'property_row', 'unit', 'master', 'payment']})
                rendered = render_document_template(f['template'], {**values, **f['extras']})
                browser = json.loads(subprocess.run(['node', '--input-type=module', '-e', parity_script], input=json.dumps(f), capture_output=True, text=True, cwd=ROOT, check=True).stdout)
                self.assertEqual(browser['values'], values)
                self.assertEqual(browser['rendered']['values'], rendered['values'])
                self.assertEqual(browser['rendered']['clauses'], rendered['clauses'])
                self.assertEqual(browser['digest'], api.document_digest(rendered))
                self.assertTrue(all('signature' not in s and 'fingerprint' not in s for s in rendered['signatures']))
                self.f = f
                body = self.body(); body['document']['values'] = f['extras']; body['document']['previewDigest'] = browser['digest']
                pdf, digest = api.prepare_preview(body, AUTH, self.rpc, self.read)
                self.assertTrue(pdf.startswith(b'%PDF-'))
                self.assertEqual(digest, browser['digest'])


if __name__ == '__main__':
    unittest.main()
