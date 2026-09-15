import base64,hashlib,json,unittest
from pathlib import Path
from lib.outbound_adapters import notification_request,encoded_body
from lib.integration_dispatch import dispatch_once,_provider_request

ROOT=Path(__file__).resolve().parents[1]
PDF=b'%PDF-1.4\n% synthetic integration receipt\n%%EOF\n'
ATTACHMENT={'filename':'rent-receipt.pdf','content_type':'application/pdf','base64':base64.b64encode(PDF).decode(),'sha256':hashlib.sha256(PDF).hexdigest()}
EVENT={
 'eventId':'11111111-1111-4111-8111-111111111111','workspaceId':'22222222-2222-4222-8222-222222222222',
 'eventType':'collection.receipt','idempotencyKey':'collection:receipt:11111111-1111-4111-8111-111111111111','attempt':1,
 'provider':'email','mode':'sandbox','endpointOrigin':'https://provider.example.invalid','secretReference':'AQARI_TEST_PROVIDER_SECRET',
 'channel':'email','recipientReference':'tenant@example.invalid','template':'collection_receipt','variables':{'amount':'10.000','receiptReference':'AQ-R-1'},'locale':'ar','attachment':ATTACHMENT
}

class IntegrationDispatchTest(unittest.TestCase):
 def test_notification_attachment_is_verified_and_snapshotted(self):
  data={'idempotency_key':'notice:test:001','recipient_reference':'tenant@example.invalid','template':'collection_receipt','variables':{'amount':'10.000'},'locale':'ar','attachments':[dict(ATTACHMENT)]}
  request=notification_request('email',data,'https://provider.example.invalid')
  self.assertEqual(request['json']['attachments'][0]['sha256'],ATTACHMENT['sha256'])
  data['attachments'][0]['base64']='broken'
  self.assertEqual(request['json']['attachments'][0]['base64'],ATTACHMENT['base64'])
  self.assertIn(ATTACHMENT['base64'].encode(),encoded_body(request))

 def test_notification_attachment_rejects_tamper_and_non_pdf(self):
  base={'idempotency_key':'notice:test:001','recipient_reference':'tenant@example.invalid','template':'collection_receipt','variables':{},'locale':'ar'}
  bad=dict(ATTACHMENT);bad['sha256']='0'*64
  with self.assertRaisesRegex(ValueError,'INVALID_NOTIFICATION_ATTACHMENT'):notification_request('email',{**base,'attachments':[bad]},'https://provider.example.invalid')
  raw=b'not a pdf';bad={'filename':'x.pdf','content_type':'application/pdf','base64':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()}
  with self.assertRaisesRegex(ValueError,'INVALID_NOTIFICATION_ATTACHMENT'):notification_request('email',{**base,'attachments':[bad]},'https://provider.example.invalid')

 def test_provider_request_resolves_server_secret_without_putting_it_in_json(self):
  spec=_provider_request(EVENT,{'AQARI_TEST_PROVIDER_SECRET':'synthetic-server-secret'})
  self.assertEqual(spec['headers']['Authorization'],'Bearer synthetic-server-secret')
  self.assertNotIn('synthetic-server-secret',json.dumps(spec['json']))
  self.assertEqual(spec['headers']['Idempotency-Key'],EVENT['idempotencyKey'])
  with self.assertRaisesRegex(RuntimeError,'PROVIDER_SECRET_NOT_CONFIGURED'):_provider_request(EVENT,{})

 def test_dispatch_records_success_with_same_claim_identity(self):
  calls=[]
  def db(name,payload,env):
   calls.append((name,payload))
   if name=='aqari_integration_dispatch_claim':return [dict(EVENT)]
   self.assertEqual(payload['p_event_id'],EVENT['eventId']);self.assertTrue(payload['p_ok']);return {'status':'sent'}
  def send(item,env):return True,False,'provider-001',None
  result=dispatch_once(5,{'AQARI_TEST_PROVIDER_SECRET':'synthetic-server-secret'},db,send)
  self.assertEqual(result,{'claimed':1,'sent':1,'failed':0,'deadLetter':0})
  self.assertEqual([x[0] for x in calls],['aqari_integration_dispatch_claim','aqari_integration_dispatch_result'])

 def test_dispatch_records_retryable_and_permanent_failures(self):
  for retryable,status in ((True,'failed'),(False,'dead_letter')):
   with self.subTest(retryable=retryable):
    def db(name,payload,env):
     if name=='aqari_integration_dispatch_claim':return [dict(EVENT)]
     self.assertFalse(payload['p_ok']);self.assertEqual(payload['p_retryable'],retryable);return {'status':status}
    result=dispatch_once(1,{},db,lambda item,env:(False,retryable,'','PROVIDER_HTTP_503' if retryable else 'PROVIDER_HTTP_400'))
    self.assertEqual(result['failed'],1 if retryable else 0);self.assertEqual(result['deadLetter'],0 if retryable else 1)

 def test_database_contract_is_service_only_crash_safe_and_immutable(self):
  sql=(ROOT/'staging-database/sql/integration-outbox-dispatch-20260915.sql').read_text()
  self.assertIn("current_setting('role',true) is distinct from 'service_role'",sql)
  self.assertIn('for update skip locked',sql)
  self.assertIn("status='sending'",sql)
  self.assertIn('DELIVERY_LEASE_EXPIRED',sql)
  self.assertIn('aqari_integration_delivery_events_immutable',sql)
  self.assertIn('aqari_rent_receipt_pdf_artifacts',sql)
  self.assertIn("purpose_value:='collection_receipt'",sql)

 def test_cron_route_is_declared_and_requires_cron_secret(self):
  config=json.loads((ROOT/'vercel.json').read_text())
  self.assertIn({'path':'/api/integration-dispatch','schedule':'*/5 * * * *'},config['crons'])
  api=(ROOT/'api/integration-dispatch.py').read_text()
  self.assertIn("os.environ.get('CRON_SECRET'",api)
  self.assertIn("hmac.compare_digest(auth,'Bearer '+secret)",api)

if __name__=='__main__':unittest.main()
