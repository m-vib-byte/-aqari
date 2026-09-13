import importlib.util,json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('operational_report',ROOT/'api'/'operational-report.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

W='11111111-1111-4111-8111-111111111111';P='22222222-2222-4222-8222-222222222222';U='33333333-3333-4333-8333-333333333333';AUTH='Bearer a.b.c'

def reader(path,auth):
    if path=='/auth/v1/user':return {'id':U}
    raise AssertionError(path)

class ExportTests(unittest.TestCase):
    def payload(self,kind='collection',fmt='json'):
        return {'workspaceId':W,'propertyId':P,'month':'2026-09','report':kind,'format':fmt}

    def test_collection_rpc_is_server_selected_and_read_twice(self):
        calls=[]
        data={'properties':[{'property_id':P,'property_name':'برج','due':'100','allocated_paid':'100','remaining':'0','collection_rate_pct':'100'}],'lines':[]}
        def rpc(name,payload,auth):calls.append((name,payload.copy(),auth));return data
        kind,raw=mod.export_report(self.payload(),AUTH,reader,rpc)
        self.assertEqual(kind,'json');self.assertEqual(len(calls),2);self.assertEqual(calls[0][0],'aqari_monthly_collection_report');self.assertEqual(calls[0][1]['p_property_id'],P)
        saved=json.loads(raw);self.assertEqual(saved['data'],data);self.assertEqual(saved['workspaceId'],W)

    def test_collector_rpc_uses_full_month_and_not_client_rows(self):
        calls=[]
        data={'summary':[],'lines':[]}
        def rpc(name,payload,auth):calls.append((name,payload.copy()));return data
        mod.export_report(self.payload('collectors'),AUTH,reader,rpc)
        self.assertEqual(calls[0],('aqari_collector_performance_report',{'p_workspace_id':W,'p_from':'2026-09-01','p_to':'2026-09-30','p_property_id':P}))

    def test_changed_second_read_fails_closed(self):
        n=[0]
        def rpc(*args):n[0]+=1;return {'properties':[],'lines':[],'version':n[0]}
        with self.assertRaisesRegex(RuntimeError,'REPORT_CHANGED_RETRY'):mod.export_report(self.payload(),AUTH,reader,rpc)

    def test_pdf_is_real_pdf_from_verified_readback(self):
        data={'properties':[{'property_id':P,'property_name':'برج','due':'100','allocated_paid':'80','remaining':'20','collection_rate_pct':'80'}],'lines':[{'property_name':'برج','contract_no':'C1','unit_no':'101','due':'100','allocated_paid':'80','remaining':'20','overpayment':'0','status':'partial'}]}
        kind,raw=mod.export_report(self.payload(fmt='pdf'),AUTH,reader,lambda *args:data)
        self.assertEqual(kind,'pdf');self.assertTrue(raw.startswith(b'%PDF-'));self.assertGreater(len(raw),1000)

    def test_request_shape_rejects_client_rows_or_unknown_fields(self):
        bad=self.payload();bad['rows']=[]
        with self.assertRaises(ValueError):mod.export_report(bad,AUTH,reader,lambda *args:{})
        for field,value in [('report','other'),('format','xlsx'),('month','2026-13'),('workspaceId','bad')]:
            bad=self.payload();bad[field]=value
            with self.assertRaises(ValueError):mod.export_report(bad,AUTH,reader,lambda *args:{})

    def test_auth_is_required(self):
        with self.assertRaises(PermissionError):mod.export_report(self.payload(),'bad',reader,lambda *args:{})

if __name__=='__main__':unittest.main()
