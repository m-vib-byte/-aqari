import unittest
from lib.outbound_adapters import knet_payment_request,notification_request,accounting_export,encoded_body
BASE={'idempotency_key':'pay:lease:0001','lease_id':'lease-test-0001','contract_no':'AQ-1','amount':'10.125','currency':'KWD','expires_at':'2026-09-12T01:00:00Z','callback_path':'/api/provider-webhook?provider=knet','return_path':'/app?payment=return'}
class OutboundAdaptersTest(unittest.TestCase):
 def test_knet_builder_is_exact_idempotent_and_kwd_only(self):
  r=knet_payment_request(BASE,'https://sandbox-payments.example.invalid');self.assertEqual(r['json']['amount'],'10.125');self.assertEqual(r['headers']['Idempotency-Key'],'pay:lease:0001')
  with self.assertRaises(ValueError):knet_payment_request({**BASE,'currency':'USD'},'https://sandbox-payments.example.invalid')
 def test_redirects_and_origins_reject_credentials_and_http(self):
  with self.assertRaises(ValueError):knet_payment_request(BASE,'http://payments.example.invalid')
  with self.assertRaises(ValueError):knet_payment_request(BASE,'https://user:pass@payments.example.invalid')
  with self.assertRaises(ValueError):knet_payment_request({**BASE,'return_path':'https://evil.invalid'},'https://payments.example.invalid')
 def test_redirects_reject_prefixes_traversal_and_url_parser_ambiguity(self):
  cases={
   'return_path':['/application','/app/../admin','/app%2f..%2fadmin','/app;other','/app#external','/app#','/app\\@other','/app?next=one\r\nX-Test:two','//example.invalid/app'],
   'callback_path':['/api/provider-webhook-other','/api/provider-webhook/../other','/api/provider-webhook%2f..%2fother','/api/provider-webhook;other','/api/provider-webhook#fragment']
  }
  for field,values in cases.items():
   for value in values:
    with self.subTest(field=field,value=value):
     with self.assertRaisesRegex(ValueError,'INVALID_REDIRECT_PATH'):knet_payment_request({**BASE,field:value},'https://payments.example.invalid')
 def test_redirects_preserve_exact_routes_and_query_values(self):
  for paths in [('/api/provider-webhook','/app'),('/api/provider-webhook?provider=knet&workspace=test','/app?release=V267&payment=return')]:
   r=knet_payment_request({**BASE,'callback_path':paths[0],'return_path':paths[1]},'https://payments.example.invalid')
   self.assertEqual((r['json']['callback_path'],r['json']['return_path']),paths)
 def test_all_notification_channels_share_safe_envelope(self):
  data={'idempotency_key':'notice:test:001','recipient_reference':'tenant:001','template':'rent_due','variables':{'amount':'10.000'},'locale':'ar'}
  for channel in ('email','whatsapp','sms','push'):self.assertEqual(notification_request(channel,data,'https://messages.example.invalid')['path'],'/messages/'+channel)
  with self.assertRaises(ValueError):notification_request('email',{**data,'variables':{'token':'leak'}},'https://messages.example.invalid')
 def test_nested_credentials_and_identity_fields_never_enter_outbound_notifications(self):
  for channel in ('email','whatsapp','sms','push'):
   for field in ('api_key','apiKey','API-KEY','password','civil_id','civilId','access_token','refreshToken','authorization','service_role_key'):
    data={'idempotency_key':'notice:test:001','recipient_reference':'tenant:001','template':'rent_due','variables':{'items':[{'customer':{field:'synthetic-test-value'}}]},'locale':'ar'}
    with self.subTest(channel=channel,field=field):
     with self.assertRaisesRegex(ValueError,'INVALID_NOTIFICATION'):notification_request(channel,data,'https://messages.example.invalid')
 def test_notification_payload_is_a_snapshot_after_validation(self):
  data={'idempotency_key':'notice:test:001','recipient_reference':'tenant:001','template':'rent_due','variables':{'items':[{'amount':'10.000','name':'اختبار'}]},'locale':'ar'}
  request=notification_request('email',data,'https://messages.example.invalid')
  data['idempotency_key']='notice:changed:001';data['variables']['items'][0]['token']='synthetic';data['variables']['items'][0]['amount']='999.000'
  self.assertEqual(request['json']['variables'],{'items':[{'amount':'10.000','name':'اختبار'}]})
  self.assertEqual(request['headers']['Idempotency-Key'],request['json']['idempotency_key'])
  self.assertIn('اختبار'.encode(),encoded_body(request))
 def test_notifications_reject_nonfinite_cyclic_and_oversized_values(self):
  cycle={};cycle['self']=cycle
  for variables in ({'amount':float('nan')},{'amount':float('inf')},{'cycle':cycle},{'text':'ع'*70000}):
   data={'idempotency_key':'notice:test:001','recipient_reference':'tenant:001','template':'rent_due','variables':variables,'locale':'ar'}
   with self.subTest(variables=list(variables)):
    with self.assertRaisesRegex(ValueError,'INVALID_JSON_PAYLOAD'):notification_request('email',data,'https://messages.example.invalid')
 def test_accounting_exports_are_versioned(self):
  data={'idempotency_key':'ledger:2026:01','period':'2026-01','entries':[],'schema_version':1}
  for provider in ('quickbooks','zoho_books','xero'):self.assertEqual(accounting_export(provider,data,'https://ledger.example.invalid')['json']['schema_version'],1)
  with self.assertRaises(ValueError):accounting_export('unknown',data,'https://ledger.example.invalid')
 def test_accounting_export_snapshot_preserves_the_validated_batch(self):
  data={'idempotency_key':'ledger:2026:01','period':'2026-01','entries':[{'reference':'journal:001','amount':'10.125'}],'schema_version':1}
  request=accounting_export('xero',data,'https://ledger.example.invalid')
  data['entries'][0]['amount']='999.000';data['idempotency_key']='ledger:changed:01'
  self.assertEqual(request['json']['entries'][0]['amount'],'10.125')
  self.assertEqual(request['headers']['Idempotency-Key'],request['json']['idempotency_key'])
  with self.assertRaisesRegex(ValueError,'INVALID_JSON_PAYLOAD'):accounting_export('xero',{**data,'entries':[{'amount':float('nan')}]},'https://ledger.example.invalid')
 def test_wire_encoding_cannot_emit_nonstandard_json_numbers(self):
  with self.assertRaises(ValueError):encoded_body({'json':{'amount':float('nan')}})
if __name__=='__main__':unittest.main()
