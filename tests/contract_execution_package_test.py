import copy, unittest
from datetime import datetime, timezone, timedelta
from lib.contract_execution_package import prepare

IDS=[f"00000000-0000-4000-8000-{n:012d}" for n in range(1,6)]
class PackageTests(unittest.TestCase):
 def setUp(self):
  self.data=dict(workspaceId=IDS[0],settlementId=IDS[1],documentId=IDS[2],packageId=IDS[3],
   contractRef="contract",preparedAt=datetime.now(timezone.utc).isoformat(),receiptNo="",receiptSequence=None,receiptArtifacts=None)
  contract={"id":"contract","status":"signed","contract_no":"CT-1"}
  self.source=dict(workspace_id=IDS[0],settlement_id=IDS[1],contract_document_id=IDS[2],
   contract_ref="contract",actor_id=IDS[4],prepared_at=self.data["preparedAt"],receipt_no="",contract_receipt_sequence=None,
   signed_contract_snapshot=contract,amounts={"rent":0})
  for role in ("tenant","owner"):
   self.source[role+"_document"]={"document_no":role,"title":role,"payload":{"copyRole":role,"contractSnapshot":contract}}
  self.commits=[]; self.reads=[];self.renders=[]
 def read(self,path,auth,body=None):
  self.reads.append(path)
  return {"id":IDS[4]} if path=="/auth/v1/user" else copy.deepcopy(self.source)
 def commit(self,payload):
  self.commits.append(payload)
  return {"package_id":IDS[3],"expires_at":(datetime.now(timezone.utc)+timedelta(minutes=10)).isoformat()}
 def render(self,series,version):
  self.renders.append(series["document_no"]);return b"%PDF-fixture"
 def run_prepare(self,**kw):
  args=dict(read=self.read,commit=self.commit,render_document=self.render,render_receipt=lambda x:b"%PDF-receipt",verify_receipt=lambda p,n:p["rentReceiptsV267"][0])
  args.update(kw)
  return prepare(self.data,"Bearer a.b.c",**args)
 def test_two_documents_before_commit(self):
  self.assertEqual(self.run_prepare()["packageId"],IDS[3])
  self.assertEqual(self.renders,["tenant","owner"])
  self.assertEqual(len(self.commits),1)
  self.assertEqual(self.commits[0]["p_source"],self.source)
  self.assertIsNone(self.commits[0]["p_receipt_pdf_base64"])
 def test_authentication_before_source_or_commit(self):
  with self.assertRaises(PermissionError):
   prepare(self.data,"invalid",read=self.read,commit=self.commit,render_document=self.render,render_receipt=None,verify_receipt=None)
  self.assertEqual(self.reads,[]); self.assertEqual(self.commits,[])
 def test_cross_scope_is_rejected(self):
  for key in ["workspace_id","contract_ref","settlement_id","actor_id","receipt_no"]:
   with self.subTest(key=key):
    original=self.source[key];self.source[key]="wrong"
    with self.assertRaises(PermissionError): self.run_prepare()
    self.source[key]=original
  self.assertEqual(self.commits,[])
 def test_source_change_after_render_blocks_commit(self):
  def read(path,auth,body=None):
   value=self.read(path,auth,body)
   if len(self.reads)==3:value["contract_ref"]="changed"
   return value
  with self.assertRaisesRegex(ValueError,"SOURCE_CHANGED"):self.run_prepare(read=read)
  self.assertEqual(self.commits,[])
 def test_render_failure_never_commits(self):
  with self.assertRaisesRegex(ValueError,"INVALID_RENDERED_PDF"):
   self.run_prepare(render_document=lambda *a:b"not pdf")
  self.assertEqual(self.commits,[])
 def test_no_fake_zero_rent_receipt(self):
  self.data["receiptArtifacts"]={}
  with self.assertRaisesRegex(ValueError,"FAKE_RECEIPT"):self.run_prepare()
  self.assertEqual(self.commits,[])
 def test_unconfirmed_or_expired_commit_never_returns_package(self):
  for response in [{},{"package_id":"wrong"},{"package_id":IDS[3],"expires_at":(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()}]:
   with self.subTest(response=response),self.assertRaises(ValueError):
    self.run_prepare(commit=lambda _:response)
 def test_commit_timeout_propagates_without_settlement(self):
  def timeout(_):raise TimeoutError()
  with self.assertRaises(TimeoutError):self.run_prepare(commit=timeout)
 def test_stale_request_fails_before_auth(self):
  self.data["preparedAt"]=(datetime.now(timezone.utc)-timedelta(minutes=20)).isoformat()
  with self.assertRaises(ValueError):self.run_prepare()
  self.assertEqual(self.reads,[])
 def paid(self):
  self.data.update(receiptNo="AQ-R-2026-00000001",receiptSequence=1)
  self.source.update(receipt_no=self.data["receiptNo"],contract_receipt_sequence=1,amounts={"rent":350})
  record=[self.data["receiptNo"],"Tenant",350]
  receipt={"id":self.data["receiptNo"],"record":record,"contract":copy.deepcopy(self.source["signed_contract_snapshot"]),"contractReceiptSequence":1}
  self.data["receiptArtifacts"]={"record":record,"ledger":{"contractReceiptSequence":1},"receipt":receipt}
 def test_paid_receipt_is_validated_and_rendered(self):
  self.paid(); self.run_prepare()
  self.assertIsNotNone(self.commits[0]["p_receipt_pdf_base64"])
 def test_changed_contract_or_amount_cannot_reach_commit(self):
  self.paid();self.data["receiptArtifacts"]["receipt"]["contract"]["contract_no"]="other"
  with self.assertRaisesRegex(ValueError,"MISMATCH"):self.run_prepare()
  self.assertEqual(self.commits,[])
  self.paid();self.data["receiptArtifacts"]["record"][2]=351
  with self.assertRaisesRegex(ValueError,"AMOUNT_MISMATCH"):self.run_prepare()
  self.assertEqual(self.commits,[])
 def test_receipt_integrity_failure_blocks_all_writes(self):
  self.paid()
  def fail(*args):raise ValueError("INVALID_RECEIPT")
  with self.assertRaisesRegex(ValueError,"INVALID_RECEIPT"):self.run_prepare(verify_receipt=fail)
  self.assertEqual(self.commits,[])

class RealRendererTests(unittest.TestCase):
 setUp=PackageTests.setUp
 paid=PackageTests.paid
 read=PackageTests.read
 commit=PackageTests.commit
 render=PackageTests.render
 run_prepare=PackageTests.run_prepare
 def test_real_frontend_receipt_and_both_pdf_copies(self):
  import subprocess,json,base64,hashlib
  from io import BytesIO
  from pypdf import PdfReader
  from lib.rent_pdf import render_receipt,verified_receipt
  from lib.official_document_pdf import render_official_document
  self.paid()
  contract=self.source['signed_contract_snapshot']
  contract.update(tenant='مستأجر اختبار',property='عقار اختبار',unit='1',start_date='2026-10-01',end_date='2027-09-30',rent=350,contractRent=350,discount=0,
   rentEntitlement={'startDate':'2026-10-01','firstPeriodPolicy':'full_month'})
  args={'contract':contract,'profile':{'id':'tenant'},'receiptNo':self.data['receiptNo'],'contractReceiptSequence':1,
   'onDate':'2026-10-06','method':'cash','transactionNo':'TEST-001',
   'due':{'rent':350,'period':'2026-10','breakdown':{'version':1,'period':'2026-10','dueOn':'2026-10-01','policy':'full_month','gross':350,'discount':0,'net':350,'manual':False,'freeMonth':False}}}
  self.data['receiptArtifacts']=json.loads(subprocess.check_output(['node','--input-type=module','-e',
   "import {rentReceiptArtifacts} from './src/v267/domain/contract-execution.js'; import fs from 'node:fs'; console.log(JSON.stringify(rentReceiptArtifacts(JSON.parse(fs.readFileSync(0,'utf8')))));"],input=json.dumps(args).encode()))
  for role in ('tenant','owner'):
   self.source[role+'_document'].update(body='عقد إيجار تجريبي للاختبار فقط',issued_at=self.data['preparedAt'],issued_by_name='اختبار',content_sha256='a'*64)
  self.run_prepare(render_document=render_official_document,render_receipt=render_receipt,verify_receipt=verified_receipt)
  first=self.commits[-1]
  for role in ('tenant','owner','receipt'):
   pdf=base64.b64decode(first['p_'+role+'_pdf_base64'])
   self.assertEqual(hashlib.sha256(pdf).hexdigest(),first['p_'+role+'_pdf_sha256'])
   self.assertGreaterEqual(len(PdfReader(BytesIO(pdf)).pages),1)
  self.run_prepare(render_document=render_official_document,render_receipt=render_receipt,verify_receipt=verified_receipt)
  for role in ('tenant','owner','receipt'):
   self.assertEqual(first['p_'+role+'_pdf_sha256'],self.commits[-1]['p_'+role+'_pdf_sha256'])

class ApiBoundaryTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  import importlib.util
  from pathlib import Path
  spec=importlib.util.spec_from_file_location('execution_package_api',Path(__file__).resolve().parents[1]/'api/contract-execution-package.py')
  cls.api=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.api)
 def test_missing_or_cross_project_service_key_never_opens_transport(self):
  from unittest.mock import patch
  for env in ({},{'AQARI_PDF_ARCHIVE_SUPABASE_URL':'https://other.supabase.co','AQARI_PDF_ARCHIVE_SERVICE_KEY':'sb_secret_test'}):
   with patch.dict(self.api.os.environ,env,clear=True),patch.object(self.api.common,'config',return_value=('https://test.supabase.co','public')),patch.object(self.api,'build_opener') as transport:
    with self.assertRaises(RuntimeError):self.api.commit_package({})
    transport.assert_not_called()
 def test_service_transport_uses_fixed_endpoint_and_no_redirects(self):
  from unittest.mock import patch,MagicMock
  env={'AQARI_PDF_ARCHIVE_SUPABASE_URL':'https://test.supabase.co','AQARI_PDF_ARCHIVE_SERVICE_KEY':'sb_secret_test'}
  with patch.dict(self.api.os.environ,env,clear=True),patch.object(self.api.common,'config',return_value=('https://test.supabase.co','public')),patch.object(self.api,'build_opener') as transport:
   response=MagicMock();response.read.return_value=b'{"package_id":"package"}'
   transport.return_value.open.return_value.__enter__.return_value=response
   self.assertEqual(self.api.commit_package({'p_package_id':'package'})['package_id'],'package')
   transport.assert_called_once_with(self.api.common.NoRedirect)
   request=transport.return_value.open.call_args.args[0]
   self.assertEqual(request.full_url,'https://test.supabase.co/rest/v1/rpc/aqari_contract_execution_package_commit')
   self.assertEqual(request.get_header('Apikey'),'sb_secret_test')
   self.assertEqual(request.get_method(),'POST')
 def test_http_handler_hides_internal_failure_and_never_reports_success(self):
  from unittest.mock import patch
  from io import BytesIO
  from urllib.error import HTTPError
  for error,status in [(PermissionError('private details'),403),(RuntimeError('private details'),503),(ValueError('private details'),400),
    (HTTPError('https://private',401,'secret',{},None),403),(HTTPError('https://private',500,'secret',{},None),502)]:
   instance=object.__new__(self.api.handler)
   instance.headers={'Content-Length':'2','Authorization':'Bearer a.b.c'};instance.rfile=BytesIO(b'{}');responses=[]
   instance.respond=lambda code,data:responses.append((code,data))
   with patch.object(self.api,'prepare',side_effect=error):instance.do_POST()
   self.assertEqual(responses[0][0],status);self.assertNotIn('private',str(responses));self.assertNotIn('secret',str(responses))

class MfaBoundaryTests(unittest.TestCase):
 setUpClass=classmethod(ApiBoundaryTests.setUpClass.__func__)
 def invoke(self, *, source_error=None, commit_error=None, challenge_on=1):
  import json
  from io import BytesIO
  from unittest.mock import patch
  fixture=PackageTests();fixture.setUp();reads=0
  def read(path,auth,body=None):
   nonlocal reads
   if path.endswith('/aqari_contract_execution_package_source'):
    reads+=1
    if source_error and reads==challenge_on:raise source_error
   return fixture.read(path,auth,body)
  instance=object.__new__(self.api.handler);raw=json.dumps(fixture.data).encode()
  instance.headers={'Content-Length':str(len(raw)),'Authorization':'Bearer a.b.c'};instance.rfile=BytesIO(raw);responses=[]
  instance.respond=lambda code,data:responses.append((code,data))
  with patch.object(self.api.common,'upstream',side_effect=read),patch.object(self.api.common,'render_official_document',side_effect=fixture.render),patch.object(self.api,'commit_package',side_effect=commit_error or fixture.commit) as commit:
   instance.do_POST()
  return responses,commit.call_count,fixture.renders
 def error(self,status=403,code='42501',message='MFA_REQUIRED',raw=None):
  import json
  from io import BytesIO
  from urllib.error import HTTPError
  return HTTPError('https://private',status,'private details',{'Content-Type':'application/json'},BytesIO(raw if raw is not None else json.dumps({'code':code,'message':message,'details':'secret','hint':'secret'}).encode()))
 def test_source_mfa_is_preserved_before_any_privileged_write(self):
  for message in ('MFA_REQUIRED','MFA_RECENT_REAUTH_REQUIRED'):
   for stage in (1,2):
    with self.subTest(message=message,stage=stage):
     responses,commits,renders=self.invoke(source_error=self.error(message=message),challenge_on=stage)
     self.assertEqual(responses,[(403,{'error':message,'code':'42501'})])
     self.assertEqual(commits,0)
     self.assertEqual(len(renders),0 if stage==1 else 2)
 def test_untrusted_or_expired_errors_never_become_recoverable_mfa(self):
  for args in ({'status':401},{'status':500},{'code':'P0001'},{'message':'MFA_REQUIRED_extra'},{'raw':b'not json'},{'raw':b'[]'},{'raw':b' '*16385}):
   with self.subTest(args=str(args)[:80]):
    responses,commits,_=self.invoke(source_error=self.error(**args))
    self.assertNotIn('MFA_REQUIRED',str(responses));self.assertNotIn('secret',str(responses));self.assertEqual(commits,0)
 def test_privileged_commit_error_does_not_allow_mfa_retry(self):
  responses,commits,_=self.invoke(commit_error=self.error())
  self.assertEqual(commits,1);self.assertEqual(responses,[(403,{'error':'EXECUTION_PREPARATION_FAILED'})])

if __name__=='__main__':unittest.main()
