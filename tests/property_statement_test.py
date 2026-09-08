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
if __name__=='__main__':unittest.main()
