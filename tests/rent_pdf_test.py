"""Synthetic data only: authorization, durable receipt links and real PDF output."""
import copy
import base64
import hashlib
import importlib.util
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from pypdf import PdfReader
from lib.rent_pdf import verified_receipt, render_receipt
from lib.arabic_money import kwd_words
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

def staff_payment():
    state = fixture()
    lease_id = '33333333-3333-4333-8333-333333333333'
    return dict(workspace_id=W, lease_id=lease_id, reference='TEST-001', amount=125.375,
                period='2026-09-01', paid_at='2026-09-07', status='paid', payment_method='كي نت',
                record=state['rentLedgerV202'][0], receipt=state['rentReceiptsV267'][0],
                lease=dict(id=lease_id, workspace_id=W, external_ref='123', contract_no='TEST-L-001'))

def entitlement_fixture(manual=False):
    state = fixture()
    row = state['collections'][0]
    row[2], row[5] = 33, '2026-09-21'
    contract = state['contractsV202'][0]
    policy = 'manual_first_period' if manual else 'daily_prorated'
    contract.update(contractRent=100, rent=90, discount=10, rentalTermsVersion=1,
                    rentEntitlement=dict(version=1, startDate='2026-09-20', firstPeriodPolicy=policy,
                                         manualFirstPeriodAmount=33 if manual else None))
    entry = state['rentLedgerV202'][0]
    entry.update(paid=33, paidAt=row[5], due=33)
    state['rentReceiptsV267'][0].update(
        detailsVersion=2, record=copy.deepcopy(row), contract=copy.deepcopy(contract),
        rentPeriodBreakdown=dict(version=1, period='2026-09', dueOn='2026-09-20', policy=policy,
                                 gross=None if manual else 36.667, discount=None if manual else 3.667,
                                 net=33, manual=manual, freeMonth=False))
    return state

class ReceiptTests(unittest.TestCase):
    def test_preexisting_archive_survives_amount_words_renderer_upgrade(self):
        original = b'%PDF-1.4\npreviously archived receipt bytes'
        artifact = dict(workspace_id=W, receipt_no='TEST-001', payment_id=U,
                        snapshot_sha256='a'*64, pdf_sha256=hashlib.sha256(original).hexdigest(),
                        pdf_base64=base64.b64encode(original).decode(), payment_status='paid',
                        renderer_version='v267-rent-receipt-pdf-archive-1')
        def read(path, auth, data=None):
            return {'id': U} if path == '/auth/v1/user' else copy.deepcopy(artifact)
        with patch.object(api, 'commit_archive') as commit:
            def no_render(*args):
                raise AssertionError('Issued archive must not be regenerated')
            result = api.export_archive(dict(workspaceId=W, receiptNo='TEST-001'),
                                        'Bearer a.b.c', read, commit, no_render)
            self.assertEqual(result, original)
            commit.assert_not_called()

    def test_exact_arabic_dinars_and_fils(self):
        cases = {
            '0.001': 'فلس واحد', '0.002': 'فلسان', '0.003': 'ثلاثة فلوس',
            '0.010': 'عشرة فلوس', '0.011': 'أحد عشر فلسًا', '0.012': 'اثنا عشر فلسًا',
            '0.020': 'عشرون فلسًا', '0.021': 'واحد وعشرون فلسًا',
            '0.100': 'مائة فلس', '0.200': 'مائتا فلس', '0.999': 'تسعمائة وتسعة وتسعون فلسًا',
            '1': 'دينار كويتي واحد', '2': 'ديناران كويتيان', '3': 'ثلاثة دنانير كويتية',
            '10': 'عشرة دنانير كويتية', '11': 'أحد عشر دينارًا كويتيًا',
            '100': 'مائة دينار كويتي', '200': 'مائتا دينار كويتي',
            '1000': 'ألف دينار كويتي', '2000': 'ألفا دينار كويتي',
            '3000': 'ثلاثة آلاف دينار كويتي', '11000': 'أحد عشر ألف دينار كويتي',
            '200000': 'مائتا ألف دينار كويتي', '1000000': 'مليون دينار كويتي',
            '2000000': 'مليونا دينار كويتي',
            '125.375': 'مائة وخمسة وعشرون دينارًا كويتيًا وثلاثمائة وخمسة وسبعون فلسًا',
            '1.010': 'دينار كويتي واحد وعشرة فلوس',
            '2.002': 'ديناران كويتيان وفلسان',
            '999999999.999': 'تسعمائة وتسعة وتسعون مليونًا وتسعمائة وتسعة وتسعون ألفًا وتسعمائة وتسعة وتسعون دينارًا كويتيًا وتسعمائة وتسعة وتسعون فلسًا',
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(kwd_words(value), 'فقط ' + expected + ' لا غير')
        self.assertEqual(kwd_words(125.375), kwd_words('125.375'))

    def test_words_reject_invalid_amount_without_rounding(self):
        for value in [True, False, None, '', 'NaN', 'Infinity', '-1', '0', '1.0001', '1000000000']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                kwd_words(value)

    def test_words_use_saved_paid_amount_in_both_receipt_layouts(self):
        from lib import rent_pdf, property_statement_pdf
        for special in [False, True]:
            saved = fixture()['rentReceiptsV267'][0]
            saved['contract']['rent'] = 999
            if special:
                saved['contract']['property'] = saved['record'][4] = 'برج شيخة'
            module = property_statement_pdf if special else rent_pdf
            with patch.object(module, 'shaped', wraps=module.shaped) as rendered:
                pdf = render_receipt(saved)
            text = ' '.join(str(c.args[0]) for c in rendered.call_args_list)
            self.assertIn('المبلغ بالحروف', text)
            self.assertIn('مائة وخمسة وعشرون دينارًا كويتيًا', text)
            self.assertIn('ثلاثمائة وخمسة وسبعون فلسًا', text)
            self.assertEqual(len(PdfReader(BytesIO(pdf)).pages), 1)
            self.assertEqual(pdf, render_receipt(saved))

    def test_entitlement_pdf_uses_saved_period_due_not_current_monthly_rent(self):
        from lib import rent_pdf
        state = entitlement_fixture()
        state['contractsV202'][0].update(contractRent=999, rent=888)
        saved = verified_receipt(state, 'TEST-001')
        with patch.object(rent_pdf, 'shaped', wraps=rent_pdf.shaped) as rendered:
            pdf = render_receipt(saved)
        calls = ' '.join(str(c.args[0]) for c in rendered.call_args_list)
        for value in ['2026-09-20', '36.667', '3.667', '33.000', 'قيمة الفترة قبل الخصم', 'خصم الفترة']:
            self.assertIn(value, calls)
        self.assertNotIn('الإيجار الحالي بعد الخصم', calls)
        self.assertNotIn('888', calls)
        self.assertTrue(pdf.startswith(b'%PDF-'))

    def test_manual_period_pdf_does_not_invent_gross_or_another_discount(self):
        from lib import rent_pdf
        saved = verified_receipt(entitlement_fixture(manual=True), 'TEST-001')
        with patch.object(rent_pdf, 'shaped', wraps=rent_pdf.shaped) as rendered:
            render_receipt(saved)
        calls = ' '.join(str(c.args[0]) for c in rendered.call_args_list)
        self.assertIn('دون خصم إضافي', calls)
        self.assertNotIn('قيمة الفترة قبل الخصم', calls)
        self.assertNotIn('خصم الفترة:', calls)

    def test_entitlement_receipt_rejects_inconsistent_or_missing_breakdown(self):
        changes = [
            lambda r: r.pop('rentPeriodBreakdown'),
            lambda r: r['rentPeriodBreakdown'].update(net=34),
            lambda r: r['rentPeriodBreakdown'].update(discount=3),
            lambda r: r['rentPeriodBreakdown'].update(net=True),
            lambda r: r['rentPeriodBreakdown'].update(net=float('nan')),
            lambda r: r['rentPeriodBreakdown'].update(gross=-1),
            lambda r: r['rentPeriodBreakdown'].update(net=33.0001),
            lambda r: r['rentPeriodBreakdown'].update(version=True),
            lambda r: r['rentPeriodBreakdown'].update(freeMonth=True),
            lambda r: r['rentPeriodBreakdown'].update(dueOn='2026-09-19'),
            lambda r: r['rentPeriodBreakdown'].update(period='2026-10'),
            lambda r: r['rentPeriodBreakdown'].update(policy='manual_first_period', manual=True),
            lambda r: r['contract'].pop('rentEntitlement'),
        ]
        for change in changes:
            with self.subTest(change=change):
                state = entitlement_fixture()
                change(state['rentReceiptsV267'][0])
                with self.assertRaises(ValueError):
                    verified_receipt(state, 'TEST-001')

    def test_period_breakdown_must_match_saved_ledger_due_for_partial_payment(self):
        state = entitlement_fixture()
        state['collections'][0][2] = state['rentReceiptsV267'][0]['record'][2] = 10
        state['rentLedgerV202'][0]['paid'] = 10
        verified_receipt(state, 'TEST-001')
        for due in [10, 34, None, True]:
            state['rentLedgerV202'][0]['due'] = due
            with self.subTest(due=due), self.assertRaises(ValueError):
                verified_receipt(state, 'TEST-001')

    def test_later_manual_policy_month_uses_saved_full_month_breakdown(self):
        state = entitlement_fixture(manual=True)
        row = state['collections'][0]
        row[2], row[5], row[8] = 90, '2026-10-02', '2026-10'
        state['rentLedgerV202'][0].update(paid=90, paidAt=row[5], period=row[8], due=90)
        receipt = state['rentReceiptsV267'][0]
        receipt['record'] = copy.deepcopy(row)
        receipt['rentPeriodBreakdown'].update(period=row[8], dueOn='2026-10-01', policy='full_month',
                                            gross=100, discount=10, net=90, manual=False)
        verified_receipt(state, 'TEST-001')
        self.assertTrue(render_receipt(receipt).startswith(b'%PDF-'))

    def test_linked_details_are_rendered_from_saved_snapshot_across_pages(self):
        from unittest.mock import patch
        from lib import rent_pdf
        saved=fixture()['rentReceiptsV267'][0]
        saved.update(detailsVersion=2,accountant='Synthetic Accountant',transactionNo='TX-TEST-267')
        saved['contract'].update(floor='FLOOR-2',contractRent=150,discount=24.625,rent=125.375,deposit=50,advance=0,cleaningFee=5,contractReceived='مستلم',receivedAt='2026-09-01T10:30:00+03:00',evictionNotice='لم يُبلّغ',tenantProfile=dict(nameAr='مستأجر اختبار',nameEn='Test English Name',email='tenant@example.invalid',phone='55555555',civilId='123456789012',passportNo='TEST-PASSPORT',nationality='اختبار'))
        with patch.object(rent_pdf,'shaped',wraps=rent_pdf.shaped) as rendered:
            pdf=render_receipt(saved)
        calls=' '.join(str(c.args[0]) for c in rendered.call_args_list)
        for value in ['FLOOR-2','Test English Name','tenant@example.invalid','TEST-PASSPORT','Synthetic Accountant','TX-TEST-267','2026-09-01T10:30:00+03:00','150','125.375']:
            self.assertIn(value,calls)
        self.assertGreaterEqual(len(PdfReader(BytesIO(pdf)).pages),2)

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
            self.assertEqual(auth, 'Bearer a.b.c')
            if path.startswith('/auth/'):return {'id':U}
            if 'memberships?' in path:return [dict(user_id=U,workspace_id=workspace,role=role,is_active=active)]
            if path.startswith('/rest/v1/rpc/aqari_read_state_v267?'):return dict(workspace_id=W,payload=fixture())
            if path.startswith('/rest/v1/aqari_rent_payments?'):
                query=parse_qs(urlsplit(path).query)
                self.assertEqual(query['workspace_id'], ['eq.'+W])
                self.assertEqual(query['reference'], ['eq.TEST-001'])
                self.assertIn('lease:aqari_leases!inner(', query['select'][0])
                return [staff_payment()]
            self.fail('Staff export must use the filtered-state RPC and final scoped payment')
        return read
    def test_authenticated_export(self):
        self.assertTrue(api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.reader()).startswith(b'%PDF-'))
    def test_accountant_export_uses_filtered_state_without_bulk_access(self):
        self.assertTrue(api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.reader(role='accountant')).startswith(b'%PDF-'))
    def test_staff_final_payment_preserves_original_pdf(self):
        self.assertEqual(api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',self.reader()),
                         render_receipt(fixture()['rentReceiptsV267'][0]))
    def test_staff_property_revoked_after_state_read_does_not_render(self):
        base=self.reader(role='accountant');state_read=False;member_checks=0
        def read(path,auth):
            nonlocal state_read,member_checks
            if 'memberships?' in path:member_checks+=1
            if path.startswith('/rest/v1/rpc/aqari_read_state_v267?'):state_read=True
            if path.startswith('/rest/v1/aqari_rent_payments?'):
                self.assertTrue(state_read)
                # Membership stays active; the final row policy hides this property.
                return []
            return base(path,auth)
        with patch.object(api,'render_receipt') as render:
            with self.assertRaises(PermissionError):
                api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',read)
            render.assert_not_called()
        self.assertEqual(member_checks,3)
    def test_staff_final_payment_rejects_hidden_lease_or_ambiguous_source(self):
        for rows in [None,[],[staff_payment(),staff_payment()],[dict(staff_payment(),lease=None)]]:
            with self.subTest(rows=rows):
                base=self.reader()
                def read(path,auth):
                    if path.startswith('/rest/v1/aqari_rent_payments?'):return rows
                    return base(path,auth)
                with patch.object(api,'render_receipt') as render:
                    with self.assertRaises(PermissionError):
                        api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',read)
                    render.assert_not_called()
    def test_staff_final_payment_rejects_changed_identity_or_immutable_source(self):
        mutations=[lambda p:p.update(workspace_id=U),lambda p:p.update(reference='OTHER'),
                   lambda p:p.update(lease_id=U),lambda p:p['lease'].update(workspace_id=U),
                   lambda p:p['lease'].update(external_ref='OTHER'),lambda p:p['lease'].update(contract_no='OTHER'),
                   lambda p:p.update(amount=1),lambda p:p.update(period='2026-08-01'),
                   lambda p:p.update(paid_at='2026-09-06'),lambda p:p.update(status='cancelled'),
                   lambda p:p.update(payment_method='cash'),lambda p:p['record'].update(paid=1),
                   lambda p:p['receipt'].update(accountant='Changed after state read')]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                payment=staff_payment();mutate(payment);base=self.reader()
                def read(path,auth):
                    if path.startswith('/rest/v1/aqari_rent_payments?'):return [payment]
                    return base(path,auth)
                with patch.object(api,'render_receipt') as render:
                    with self.assertRaises((PermissionError,ValueError)):
                        api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',read)
                    render.assert_not_called()
    def test_filtered_state_cannot_export_hidden_or_other_workspace_receipt(self):
        for state in [None,dict(workspace_id=U,payload=fixture()),dict(workspace_id=W,payload={})]:
            base=self.reader(role='accountant')
            def read(path,auth):
                if path.startswith('/rest/v1/rpc/aqari_read_state_v267?'):return state
                return base(path,auth)
            with self.assertRaises((PermissionError,ValueError)):
                api.export_pdf(dict(workspaceId=W,receiptNo='TEST-001'),'Bearer a.b.c',read)
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
