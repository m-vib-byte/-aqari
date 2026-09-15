import base64,hashlib,json,unittest
from pathlib import Path
from lib.outbound_adapters import notification_request,encoded_body
from lib.integration_dispatch import dispatch_once,_provider_request,_ensure_receipt_attachment

ROOT=Path(__file__).resolve().parents[1]
PDF=b'%PDF-1.4\n% synthetic integration receipt\n%%EOF\n'
ATTACHMENT={'filename':'rent-receipt.pdf','content_type':'application/pdf','base64':base64.b64encode(PDF).decode(),'sha256':hashlib.sha256(PDF).hexdigest()}
EVENT={
 'eventId':'11111111-1111-4111-8111-111111111111','workspaceId':'22222222-2222-4222-8222-222222222222',
 'eventType':'collection.receipt','idempotencyKey':'collection:receipt:11111111-1111-4111-8111-111111111111','attempt':1,
 'provider':'email','mode':'sandbox','endpointOrigin':'https://provider.example.invalid','secretReference':'AQARI_TEST_PROVIDER_SECRET',
 'channel':'email','recipientReference':'tenant@example.invalid','template':'collection_receipt','variables':{'amount':'10.000','receiptReference':'AQ-R-1'},'locale':'ar','attachment':ATTACHMENT
}
COMPLETION_EVENT={
 'eventId':'44444444-4444-4444-8444-444444444444','workspaceId':EVENT['workspaceId'],'eventType':'notification.payment_thanks',
 'idempotencyKey':'notification:55555555-5555-4555-8555-555555555555','attempt':1,'provider':'email','mode':'sandbox',
 'endpointOrigin':'https://provider.example.invalid','secretReference':'AQARI_TEST_PROVIDER_SECRET','channel':'email',
 'recipientReference':'tenant@example.invalid','template':'payment_thanks','variables':{'paidAmount':'10.000','remainingBalance':'0.000'},'locale':'ar'
}
RECEIPT={
 'id':'AQ-R-1','template':'rent-voucher-v267-1','brand':{'ar':'عقار اختبار'},
 'record':['AQ-R-1','مستأجر اختبار',10,'مدفوع','عقار اختبار','2026-09-15','1','دفعة اختبار','2026-09','نقدي'],
 'contract':{'id':'lease-external-1','contract_no':'AQ-C-2026-000001','status':'signed','tenant':'مستأجر اختبار','property':'عقار اختبار','unit':'1','start_date':'2026-09-01','end_date':'2027-08-31'},
 'accountant':'اختبار'
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

 def test_missing_receipt_pdf_is_rendered_archived_and_attached_before_send(self):
  source={'workspaceId':EVENT['workspaceId'],'paymentId':'33333333-3333-4333-8333-333333333333','receiptNo':'AQ-R-1','snapshotSha256':'1'*64,'receipt':RECEIPT}
  item={**EVENT,'attachment':None,'receiptSource':source};calls=[]
  def db(name,payload,env):
   calls.append((name,payload));self.assertEqual(name,'aqari_rent_receipt_pdf_auto_commit')
   self.assertEqual(payload['p_workspace_id'],source['workspaceId']);self.assertEqual(payload['p_payment_id'],source['paymentId'])
   raw=base64.b64decode(payload['p_pdf_base64']);self.assertTrue(raw.startswith(b'%PDF-'));self.assertEqual(hashlib.sha256(raw).hexdigest(),payload['p_pdf_sha256'])
   return {'archived':True,'receiptNo':'AQ-R-1','pdfSha256':payload['p_pdf_sha256'],'snapshotSha256':source['snapshotSha256']}
  prepared=_ensure_receipt_attachment(item,{},db,lambda saved:PDF)
  self.assertNotIn('receiptSource',prepared);self.assertEqual(prepared['attachment']['content_type'],'application/pdf');self.assertEqual(len(calls),1)

 def test_dispatch_bridges_rent_thanks_and_operational_then_records_success(self):
  calls=[]
  def db(name,payload,env):
   calls.append((name,payload))
   if name=='aqari_notification_dispatch_bridge':return {'bridged':2,'cancelled':1,'awaitingConfiguration':3}
   if name=='aqari_notification_dispatch_completion_bridge':return {'paymentThanks':1,'operational':2,'cancelled':1,'awaitingConfiguration':4}
   if name=='aqari_integration_dispatch_completion_claim':return [dict(COMPLETION_EVENT)]
   if name=='aqari_integration_dispatch_claim':return [dict(EVENT)]
   if name=='aqari_integration_dispatch_completion_result':self.assertEqual(payload['p_event_id'],COMPLETION_EVENT['eventId']);self.assertTrue(payload['p_ok']);return {'status':'sent'}
   self.assertEqual(name,'aqari_integration_dispatch_result');self.assertEqual(payload['p_event_id'],EVENT['eventId']);self.assertTrue(payload['p_ok']);return {'status':'sent'}
  result=dispatch_once(5,{'AQARI_TEST_PROVIDER_SECRET':'synthetic-server-secret'},db,lambda item,env:(True,False,'provider-001',None))
  self.assertEqual(result,{'bridged':2,'cancelledReminders':1,'paymentThanksBridged':1,'operationalBridged':2,'completionCancelled':1,'awaitingConfiguration':7,'claimed':2,'sent':2,'failed':0,'deadLetter':0})
  self.assertEqual([x[0] for x in calls],['aqari_notification_dispatch_bridge','aqari_notification_dispatch_completion_bridge','aqari_integration_dispatch_completion_claim','aqari_integration_dispatch_claim','aqari_integration_dispatch_completion_result','aqari_integration_dispatch_result'])

 def test_completion_claims_use_completion_result_for_retry_and_dead_letter(self):
  for retryable,status in ((True,'failed'),(False,'dead_letter')):
   with self.subTest(retryable=retryable):
    def db(name,payload,env):
     if name=='aqari_notification_dispatch_bridge':return {'bridged':0,'cancelled':0,'awaitingConfiguration':0}
     if name=='aqari_notification_dispatch_completion_bridge':return {'paymentThanks':1,'operational':0,'cancelled':0,'awaitingConfiguration':0}
     if name=='aqari_integration_dispatch_completion_claim':return [dict(COMPLETION_EVENT)]
     self.assertEqual(name,'aqari_integration_dispatch_completion_result');self.assertFalse(payload['p_ok']);self.assertEqual(payload['p_retryable'],retryable);return {'status':status}
    result=dispatch_once(1,{},db,lambda item,env:(False,retryable,'','PROVIDER_HTTP_503' if retryable else 'PROVIDER_HTTP_400'))
    self.assertEqual(result['failed'],1 if retryable else 0);self.assertEqual(result['deadLetter'],0 if retryable else 1)

 def test_regular_dispatch_records_retryable_and_permanent_failures(self):
  for retryable,status in ((True,'failed'),(False,'dead_letter')):
   with self.subTest(retryable=retryable):
    def db(name,payload,env):
     if name=='aqari_notification_dispatch_bridge':return {'bridged':0,'cancelled':0,'awaitingConfiguration':0}
     if name=='aqari_notification_dispatch_completion_bridge':return {'paymentThanks':0,'operational':0,'cancelled':0,'awaitingConfiguration':0}
     if name=='aqari_integration_dispatch_completion_claim':return []
     if name=='aqari_integration_dispatch_claim':return [dict(EVENT)]
     self.assertEqual(name,'aqari_integration_dispatch_result');self.assertFalse(payload['p_ok']);self.assertEqual(payload['p_retryable'],retryable);return {'status':status}
    result=dispatch_once(1,{},db,lambda item,env:(False,retryable,'','PROVIDER_HTTP_503' if retryable else 'PROVIDER_HTTP_400'))
    self.assertEqual(result['failed'],1 if retryable else 0);self.assertEqual(result['deadLetter'],0 if retryable else 1)

 def test_database_contract_is_service_only_crash_safe_immutable_and_auto_archives_receipt(self):
  sql=(ROOT/'staging-database/sql/integration-outbox-dispatch-20260915.sql').read_text();auto=(ROOT/'staging-database/sql/integration-receipt-auto-archive-20260915.sql').read_text()
  self.assertIn("current_setting('role',true) is distinct from 'service_role'",sql);self.assertIn('for update skip locked',sql);self.assertIn("status='sending'",sql);self.assertIn('DELIVERY_LEASE_EXPIRED',sql)
  self.assertIn('aqari_integration_delivery_events_immutable',sql);self.assertIn("when 'collection.receipt' then 'collection_receipt'",sql)
  self.assertIn('aqari_rent_receipt_pdf_system_source',auto);self.assertIn('aqari_rent_receipt_pdf_auto_commit',auto);self.assertIn("archive_actor_kind='system'",auto);self.assertIn('aqari_rent_receipt_pdf_automation_immutable',auto);self.assertIn("'receiptSource'",auto);self.assertNotIn("'system'::uuid",auto)

 def test_rent_reminder_bridge_rechecks_balance_contact_and_delivery_state(self):
  sql=(ROOT/'staging-database/sql/notification-dispatch-bridge-20260915.sql').read_text()
  self.assertIn('aqari_notification_dispatch_bridge',sql);self.assertIn('private.aqari_refresh_rent_due_schedule',sql);self.assertIn('due.balance<=0',sql)
  self.assertIn('private.aqari_contact_channel_allowed',sql);self.assertIn("'notification.rent_reminder'",sql);self.assertIn('REMINDER_SETTLED_BEFORE_DELIVERY',sql)
  self.assertIn("remainingBalance',due.balance",sql);self.assertIn("status='cancelled'",sql);self.assertIn("status='sending'",sql)

 def test_completion_bridge_covers_payment_thanks_and_all_current_operational_alerts(self):
  sql=(ROOT/'staging-database/sql/notification-dispatch-completion-20260915.sql').read_text()
  self.assertIn('aqari_payment_thanks_dispatch_payload',sql);self.assertIn('private.aqari_refresh_rent_due_schedule',sql);self.assertIn("d.balance>0",sql);self.assertIn('private.aqari_contact_channel_allowed',sql)
  for kind in ['maintenance_due','maintenance_sla_escalation','lease_expiry','vendor_contract_expiry','cheque_returned']:
   self.assertIn("'"+kind+"'",sql)
  self.assertIn("'notification.payment_thanks'",sql);self.assertIn("'notification.operational'",sql)
  self.assertIn('aqari_integration_dispatch_completion_claim',sql);self.assertIn('aqari_integration_dispatch_completion_result',sql);self.assertIn('for update skip locked',sql)
  self.assertIn("status='delivered'",sql);self.assertIn('provider_reference',sql);self.assertIn('PROVIDER_CONFIGURATION_MISSING',sql)

 def test_cron_route_is_declared_and_requires_cron_secret(self):
  config=json.loads((ROOT/'vercel.json').read_text());self.assertIn({'path':'/api/integration-dispatch','schedule':'*/5 * * * *'},config['crons'])
  api=(ROOT/'api/integration-dispatch.py').read_text();self.assertIn("os.environ.get('CRON_SECRET'",api);self.assertIn("hmac.compare_digest(auth,'Bearer '+secret)",api)

if __name__=='__main__':unittest.main()