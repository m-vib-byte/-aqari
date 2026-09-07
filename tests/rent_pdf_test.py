"""Synthetic data only: authorization, durable receipt links and real PDF output."""
import copy
import importlib.util
import unittest
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader
from lib.rent_pdf import verified_receipt, render_receipt
spec = importlib.util.spec_from_file_location('receipt_api', Path(__file__).parents[1] / 'api/rent-receipt.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
W = '11111111-1111-4111-8111-111111111111'
U = '22222222-2222-4222-8222-222222222222'

def fixture():
    row = ['TEST-001', 'مستأجر اختبار', 125.375, 'paid', 'عقار اختبار', '2026-09-07', '12', 'بيانات اختبار فقط', '2026-09', 'كي نت']
    c = dict(id=123, contract_no='TEST-L-001', status='signed', start_date='2026-01-01', end_date='2026-12-31', tenant=row[1], property=row[4], unit=row[6])
    entry = dict(receiptNo=row[0], contractId=c['id'], contractNo=c['contract_no'], tenant=row[1], property=row[4], unit=row[6], period=row[8], paidAt=row[5], status=row[3], paid=row[2])
    saved = dict(id=row[0], template='rent-voucher-v267-1', record=copy.deepcopy(row), contract=copy.deepcopy(c))
    return dict(collections=[row], contractsV202=[c], rentLedgerV202=[entry], rentReceiptsV267=[saved])

class ReceiptTests(unittest.TestCase):
    def test_real_embedded_font_deterministic_pdf(self):
        state=fixture(); saved=verified_receipt(state,'TEST-001')
        result=render_receipt(saved)
        self.assertEqual(result,render_receipt(saved)); self.assertTrue(result.startswith(b'%PDF-'))
        doc=PdfReader(BytesIO(result));self.assertEqual(len(doc.pages),1);self.assertEqual(doc.metadata.title,'وصل إيجار')
        self.assertTrue(any('/FontFile2' in f.get_object().get('/FontDescriptor',{}) .get_object() for f in doc.pages[0]['/Resources']['/Font'].values() if '/FontDescriptor' in f.get_object()))
    def test_reject_missing_or_duplicate_or_tampered_payment(self):
        for mutate in [lambda s:s['collections'].clear(),lambda s:s['rentLedgerV202'].clear(),lambda s:s['contractsV202'].clear(),lambda s:s['collections'].append(copy.deepcopy(s['collections'][0])),lambda s:s['rentLedgerV202'][0].update(paid=10),lambda s:s['rentLedgerV202'][0].update(contractId=999),lambda s:s['rentReceiptsV267'][0]['contract'].update(status='draft')]:
            with self.subTest(mutate=mutate):
                state=fixture();mutate(state)
                with self.assertRaises(ValueError):verified_receipt(state,'TEST-001')
    def test_wrapping_paginates_long_note(self):
        saved=fixture()['rentReceiptsV267'][0];saved['record'][7]='ملاحظة طويلة للتحقق من امتداد النص على الصفحات ' * 300
        doc=PdfReader(BytesIO(render_receipt(saved)));self.assertGreater(len(doc.pages),1)
    def reader(self,role='general_manager',active=True,workspace=W):
        def read(path,auth):
            if path.startswith('/auth/'):return {'id':U}
            if 'memberships?' in path:return [dict(user_id=U,workspace_id=workspace,role=role,is_active=active)]
            return [dict(workspace_id=W,payload=fixture())]
        return read
    def test_authenticated_export(self):
        self.assertTrue(api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.reader()).startswith(b'%PDF-'))
    def test_denied_scope_role_and_inactive(self):
        for reader in [self.reader(role='viewer'),self.reader(active=False),self.reader(workspace=U)]:
            with self.assertRaises(PermissionError):api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',reader)
    def test_no_client_amount_or_missing_auth(self):
        with self.assertRaises(ValueError):api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001',amount=1),'Bearer a.b.c',self.reader())
        with self.assertRaises(PermissionError):api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),None,self.reader())
    def test_revocation_before_export(self):
        base=self.reader();calls=0
        def read(path,auth):
            nonlocal calls
            if 'memberships?' in path:
                calls+=1
                if calls==2:return []
            return base(path,auth)
        with self.assertRaises(PermissionError):api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',read)

    def tenant_reader(self, change=None, revoke=False):
        state=fixture(); lease_id='33333333-3333-4333-8333-333333333333'; tenant_id='44444444-4444-4444-8444-444444444444'
        payment=dict(workspace_id=W,lease_id=lease_id,reference='TEST-001',amount=125.375,period='2026-09-01',paid_at='2026-09-07',status='paid',payment_method='كي نت',record=state['rentLedgerV202'][0],receipt=state['rentReceiptsV267'][0])
        if change:change(payment)
        calls=0
        def read(path,auth):
            nonlocal calls
            if path.startswith('/auth/'):return {'id':U}
            if 'memberships?' in path:return []
            if 'portal_accounts?' in path:return [dict(user_id=U,workspace_id=W,tenant_id=tenant_id,is_active=True)]
            if 'rent_payments?' in path:return [payment]
            if 'aqari_leases?' in path:
                calls+=1
                if revoke and calls>1:return []
                return [dict(id=lease_id,workspace_id=W,tenant_id=tenant_id,external_ref='123',contract_no='TEST-L-001')]
            self.fail('Tenant export must not read administration state')
        return read
    def test_tenant_receipt_uses_private_saved_payment(self):
        result=api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.tenant_reader())
        self.assertTrue(result.startswith(b'%PDF-'))
    def test_tenant_rejects_other_workspace_and_changed_amount(self):
        for change in [lambda p:p.update(workspace_id=U),lambda p:p.update(amount=1),lambda p:p['receipt']['contract'].update(contract_no='OTHER')]:
            with self.assertRaises((PermissionError,ValueError)):
                api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.tenant_reader(change))
    def test_tenant_access_revocation_before_export(self):
        with self.assertRaises(PermissionError):
            api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.tenant_reader(revoke=True))

if __name__=='__main__':unittest.main()
