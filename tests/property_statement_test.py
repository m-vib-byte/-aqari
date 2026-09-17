import importlib.util,unittest
from pathlib import Path
from io import BytesIO
from pypdf import PdfReader
spec=importlib.util.spec_from_file_location('statement_api',Path(__file__).parents[1]/'api/property-statement.py')
api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
W='11111111-1111-4111-8111-111111111111';P='22222222-2222-4222-8222-222222222222';U='33333333-3333-4333-8333-333333333333'
class StatementTests(unittest.TestCase):
 def test_denies_unavailable_or_cross_workspace(self):
  for rows in [[],[dict(workspace_id=U,property_id=P,period='2026-08-01')]]:
   with self.assertRaises(PermissionError):api.export_statement(dict(workspaceId=W,propertyId=P,period='2026-08'),'Bearer a.b.c',lambda path,auth:dict(id=U) if path.startswith('/auth') else rows)
 def test_rejects_client_rows_and_anonymous(self):
  with self.assertRaises(ValueError):api.export_statement(dict(workspaceId=W,propertyId=P,period='2026-08',rows=[]),'Bearer a.b.c')
  with self.assertRaises(PermissionError):api.export_statement(dict(workspaceId=W,propertyId=P,period='2026-08'),None)
 def test_exports_only_saved_data(self):
  content=dict(property_name='عقار اختبار',period='2026-08',rows=[dict(unit='101',pending=['payment_date'],payment_date_raw='02/08/2025')],summary=dict(printed_totals=dict(rent_kd=195,advance_kd=0,cleaning_kd=5)))
  row=dict(workspace_id=W,property_id=P,period='2026-08-01',content=content)
  out=api.export_statement(dict(workspaceId=W,propertyId=P,period='2026-08'),'Bearer a.b.c',lambda path,auth:dict(id=U) if path.startswith('/auth') else [row])
  self.assertTrue(out.startswith(b'%PDF-'));self.assertEqual(len(PdfReader(BytesIO(out)).pages),1)
 def test_owner_approved_discount_is_derived_without_rewriting_rent(self):
  from lib.property_statement_values import owner_approved_discount
  self.assertEqual(owner_approved_discount(dict(contract_rent_kd=250,current_rent_kd=195)),55)
  self.assertEqual(owner_approved_discount(dict(contract_rent_kd='250.125',current_rent_kd='145')),105.125)
  self.assertEqual(owner_approved_discount(dict(contract_rent_kd=195,current_rent_kd=195)),0)
  self.assertEqual(owner_approved_discount(dict(contract_rent_kd=195,current_rent_kd=260)),0)
  self.assertIsNone(owner_approved_discount(dict(contract_rent_kd='',current_rent_kd=195)))
  self.assertIsNone(owner_approved_discount(dict(contract_rent_kd='bad',current_rent_kd=195)))
 def test_source_remaining_uses_current_rent_and_saved_paid_only(self):
  from lib.property_statement_values import source_remaining
  self.assertEqual(source_remaining(dict(current_rent_kd=195,paid_amount_kd=195)),0)
  self.assertEqual(source_remaining(dict(current_rent_kd='195.125',paid_amount_kd='145')),50.125)
  self.assertEqual(source_remaining(dict(current_rent_kd=145,paid_amount_kd=195)),0)
  self.assertIsNone(source_remaining(dict(current_rent_kd='',paid_amount_kd=100)))
  self.assertIsNone(source_remaining(dict(current_rent_kd=195,paid_amount_kd='bad')))
 def test_source_totals_preserve_saved_insurance_and_knet_without_inventing_missing_values(self):
  from lib.property_statement_values import statement_source_totals
  rows=[
   dict(current_rent_kd='195',paid_amount_kd='195',insurance_kd='50',payment_method_raw='كي نت من المصدر'),
   dict(current_rent_kd='145',paid_amount_kd='100',insurance_kd='75',payment_method_raw='نقدي')
  ]
  self.assertEqual(statement_source_totals(rows),dict(paid_amount_kd=295.0,remaining_kd=45.0,insurance_kd=125.0,knet_paid_kd=195.0))
  pending=[dict(rows[0],insurance_status='pending_reconciliation'),rows[1]]
  self.assertIsNone(statement_source_totals(pending)['insurance_kd'])
  missing_method=[rows[0],dict(rows[1],payment_method_raw='')]
  self.assertIsNone(statement_source_totals(missing_method)['knet_paid_kd'])
  missing_paid=[dict(rows[0],paid_amount_kd='bad'),rows[1]]
  totals=statement_source_totals(missing_paid)
  self.assertIsNone(totals['paid_amount_kd']);self.assertIsNone(totals['remaining_kd']);self.assertIsNone(totals['knet_paid_kd'])
 def test_notes_are_scoped_to_saved_statement(self):
  from lib.property_statement_pdf import statement_notes
  clean=dict(rows=[dict(unit='101',pending=None)],pending=[])
  self.assertEqual(statement_notes(clean),[])
  saved=dict(rows=[dict(unit='402',pending=['contract_dates']),dict(unit='703',pending=['payment_date'])],pending=['insurance_difference'])
  notes=statement_notes(saved)
  self.assertEqual(len(notes),3)
  self.assertIn('402',notes[1]);self.assertIn('703',notes[2])
  self.assertNotIn('403',' '.join(notes))
  self.assertNotIn('2450',' '.join(notes))
  self.assertNotIn('2200',' '.join(notes))
 def test_clean_export_contains_no_foreign_dispute_amounts(self):
  from lib.property_statement_pdf import render_statement
  content=dict(property_name='Independent property',period='2026-09',rows=[dict(unit='101',insurance_kd=None,insurance_status='pending_reconciliation',pending=None)],summary=dict(printed_totals=dict(rent_kd=195,advance_kd=0,cleaning_kd=5)))
  pdf=render_statement(content)
  text=' '.join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
  self.assertIn('101',text);self.assertNotIn('None',text);self.assertNotIn('2450',text);self.assertNotIn('2200',text);self.assertNotIn('703',text)
 def test_pdf_prints_complete_source_insurance_and_knet_totals_only_from_saved_rows(self):
  from lib.property_statement_pdf import render_statement
  content=dict(property_name='Saved totals',period='2026-08',rows=[
   dict(unit='401',contract_rent_kd=250,current_rent_kd=195,paid_amount_kd=195,insurance_kd=50,payment_method_raw='K-Net',pending=None),
   dict(unit='402',contract_rent_kd=250,current_rent_kd=145,paid_amount_kd=100,insurance_kd=75,payment_method_raw='نقدي',pending=None)
  ],summary=dict(printed_totals=dict(rent_kd=340,advance_kd=0,cleaning_kd=5)))
  text=' '.join(page.extract_text() for page in PdfReader(BytesIO(render_statement(content))).pages)
  for value in ['295.0','45.0','125.0','195.0']:
   self.assertIn(value,text)
  pending=dict(content);pending['rows']=[dict(content['rows'][0],insurance_status='pending_reconciliation'),content['rows'][1]]
  pending_text=' '.join(page.extract_text() for page in PdfReader(BytesIO(render_statement(pending))).pages)
  self.assertIn('غير مكتمل بالمصدر',pending_text)
 def test_pdf_carries_saved_non_email_source_profile_fields_without_borrowing_defaults(self):
  from lib.property_statement_pdf import render_statement
  content=dict(property_name='Dhahawi source profile',period='2026-08',rows=[dict(unit='401',cleaning_kd='7.500',contract_received_raw='received-source',email_raw='tenant401@example.test',nationality_raw='Indian',passport_no_raw='P401SOURCE',free_month_raw='free-source-month',eviction_notice_raw='notice-source-401',notes_raw='source-note-401',pending=None)],summary=dict(printed_totals=dict(rent_kd=195,advance_kd=0,cleaning_kd=7.5)))
  pdf=render_statement(content)
  text=' '.join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
  for value in ['401','7.500','received-source','Indian','P401SOURCE','free-source-month','notice-source-401','source-note-401']:
   self.assertIn(value,text)
  for excluded in ['tenant401@example.test','tenant403@example.test','P403SOURCE','source-note-403']:
   self.assertNotIn(excluded,text)
if __name__=='__main__':unittest.main()
