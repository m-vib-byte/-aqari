import unittest
from lib.outbound_adapters import knet_payment_request,notification_request,accounting_export
BASE={'idempotency_key':'pay:lease:0001','lease_id':'lease-test-0001','contract_no':'AQ-1','amount':'10.125','currency':'KWD','expires_at':'2026-09-12T01:00:00Z','callback_path':'/api/provider-webhook?provider=knet','return_path':'/app?payment=return'}
class OutboundAdaptersTest(unittest.TestCase):
 def test_knet_builder_is_exact_idempotent_and_kwd_only(self):
  r=knet_payment_request(BASE,'https://sandbox-payments.example.invalid');self.assertEqual(r['json']['amount'],'10.125');self.assertEqual(r['headers']['Idempotency-Key'],'pay:lease:0001')
  with self.assertRaises(ValueError):knet_payment_request({**BASE,'currency':'USD'},'https://sandbox-payments.example.invalid')
 def test_redirects_and_origins_reject_credentials_and_http(self):
  with self.assertRaises(ValueError):knet_payment_request(BASE,'http://payments.example.invalid')
  with self.assertRaises(ValueError):knet_payment_request(BASE,'https://user:pass@payments.example.invalid')
  with self.assertRaises(ValueError):knet_payment_request({**BASE,'return_path':'https://evil.invalid'},'https://payments.example.invalid')
 def test_all_notification_channels_share_safe_envelope(self):
  data={'idempotency_key':'notice:test:001','recipient_reference':'tenant:001','template':'rent_due','variables':{'amount':'10.000'},'locale':'ar'}
  for channel in ('email','whatsapp','sms','push'):self.assertEqual(notification_request(channel,data,'https://messages.example.invalid')['path'],'/messages/'+channel)
  with self.assertRaises(ValueError):notification_request('email',{**data,'variables':{'token':'leak'}},'https://messages.example.invalid')
 def test_accounting_exports_are_versioned(self):
  data={'idempotency_key':'ledger:2026:01','period':'2026-01','entries':[],'schema_version':1}
  for provider in ('quickbooks','zoho_books','xero'):self.assertEqual(accounting_export(provider,data,'https://ledger.example.invalid')['json']['schema_version'],1)
  with self.assertRaises(ValueError):accounting_export('unknown',data,'https://ledger.example.invalid')
if __name__=='__main__':unittest.main()
