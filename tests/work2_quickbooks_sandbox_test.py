import json
import unittest
from urllib.error import URLError, HTTPError
from lib.quickbooks_sandbox import send_sandbox_journal

JOURNAL={'schema_version':1,'idempotency_key':'journal:test:001','reference':'AQ-J-1',
         'journal_date':'2026-09-17','currency':'KWD','memo':'Synthetic test',
         'lines':[{'account_ref':'1','side':'debit','amount':'10.125','description':'test'},
                  {'account_ref':'2','side':'credit','amount':'10.125','description':'test'}]}
OPTIONS={'realm_id':'123456','home_currency':'KWD','access_token':'synthetic-token-only'}
class Response:
 status=200
 def __init__(self,raw=b'{"JournalEntry":{"Id":"99"}}'):self.raw=raw
 def __enter__(self):return self
 def __exit__(self,*args):pass
 def read(self,n):return self.raw[:n]

class QuickBooksSandboxTest(unittest.TestCase):
 def test_native_request_and_stable_id_without_token_leak(self):
  calls=[]
  def send(req,timeout):calls.append(req);return Response()
  a=send_sandbox_journal(JOURNAL,**OPTIONS,open_url=send)
  b=send_sandbox_journal(JOURNAL,**OPTIONS,open_url=send)
  self.assertEqual(a,b);self.assertEqual(a['status'],'accepted')
  self.assertEqual(a['provider_reference'],'99')
  self.assertTrue(calls[0].full_url.startswith('https://sandbox-quickbooks.api.intuit.com/v3/company/123456/journalentry?requestid='))
  self.assertEqual(json.loads(calls[0].data)['Line'][0]['Amount'],10.125)
  self.assertNotIn(OPTIONS['access_token'],str(a));self.assertNotIn(OPTIONS['access_token'].encode(),calls[0].data)
 def test_unbalanced_journal_rejected_before_network(self):
  bad={**JOURNAL,'lines':[dict(x) for x in JOURNAL['lines']]};bad['lines'][0]['amount']='11'
  with self.assertRaisesRegex(ValueError,'UNBALANCED'):send_sandbox_journal(bad,**OPTIONS,open_url=lambda *a,**k:self.fail('network'))
 def test_configuration_and_currency_rejected_before_network(self):
  for changes in [{'realm_id':'../production'},{'home_currency':'USD'},{'access_token':'bad\nsecret'}]:
   with self.subTest(changes=changes),self.assertRaises(ValueError):
    send_sandbox_journal(JOURNAL,**{**OPTIONS,**changes},open_url=lambda *a,**k:self.fail('network'))
 def test_fault_missing_id_and_malformed_response_require_reconciliation(self):
  for raw in [b'{}',b'not json',b'{"Fault":{},"JournalEntry":{"Id":"99"}}',b'x'*262145]:
   result=send_sandbox_journal(JOURNAL,**OPTIONS,open_url=lambda *a,**k:Response(raw))
   self.assertEqual(result['status'],'reconciliation_required')
 def test_network_ambiguity_is_not_retried_or_reported_success(self):
  calls=[]
  def send(*a,**k):calls.append(1);raise URLError('synthetic-token-only')
  result=send_sandbox_journal(JOURNAL,**OPTIONS,open_url=send)
  self.assertEqual(len(calls),1);self.assertEqual(result['status'],'reconciliation_required')
  self.assertNotIn('synthetic-token-only',str(result))
 def test_http_auth_failure_is_rejected(self):
  def send(*a,**k):raise HTTPError('https://example.invalid',401,'auth',{},None)
  result=send_sandbox_journal(JOURNAL,**OPTIONS,open_url=send)
  self.assertEqual(result['status'],'rejected')
if __name__=='__main__':unittest.main()
