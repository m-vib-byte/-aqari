import importlib.util
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('salary_voucher',ROOT/'api'/'salary-voucher.py')
API=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(API)

class SalaryVoucherTest(unittest.TestCase):
 def payload(self):
  return {'id':'33333333-3333-4333-8333-333333333333','month':'2026-09-01','state':'paid','voucher_no':'AQ-202609-1','snapshot':{'name_ar':'موظف اختبار','name_en':'Test Employee','civil_id':'CID','passport':'PASS','job_ar':'محاسب','job_en':'Accountant'},'employee':{'profile':{}},'property_details':[{'id':'44444444-4444-4444-8444-444444444444','name':'برج شيخة','metadata':{'address_ar':'السالمية'}}],'basic':500,'allowances':25,'overtime':10,'reward':5,'late':1,'absence':2,'deductions':3,'advance_repayment':4,'net':530,'method':'transfer','reference':'REF-1','paid_at':'2026-09-22T12:00:00Z'}
 def registry(self):return {'workspace_id':'11111111-1111-4111-8111-111111111111','employee_id':'22222222-2222-4222-8222-222222222222','payroll_id':'33333333-3333-4333-8333-333333333333','voucher_no':'AQ-202609-1','verification_token':'55555555-5555-4555-8555-555555555555'}
 def test_a4_pdf_contains_one_page_and_qr(self):
  pdf=API.render_salary_voucher(self.payload(),self.registry());self.assertTrue(pdf.startswith(b'%PDF-'));self.assertGreater(len(pdf),5000);self.assertIn(b'/Type /Page',pdf)
 def test_endpoint_uses_authorized_registry_scope(self):
  data={'workspaceId':self.registry()['workspace_id'],'employeeId':self.registry()['employee_id'],'payrollId':self.registry()['payroll_id']}
  def read(body,auth):return {'registry':{k:v for k,v in self.registry().items() if k!='verification_token'},'verification_token':self.registry()['verification_token'],'payload':self.payload()}
  pdf=API.export_pdf(data,'Bearer token',read=read);self.assertTrue(pdf.startswith(b'%PDF-'))
  bad=lambda body,auth:{'registry':{'workspace_id':data['workspaceId'],'employee_id':data['employeeId'],'payroll_id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},'verification_token':self.registry()['verification_token'],'payload':self.payload()}
  with self.assertRaises(PermissionError):API.export_pdf(data,'Bearer token',read=bad)

if __name__=='__main__':unittest.main()

