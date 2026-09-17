import unittest
from urllib.error import URLError
from knet_dispatch_test import EVENT, Response
from lib.knet_dispatch import send_link

ENV={'AQARI_TEST_KNET_SECRET':'synthetic-knet-secret'}
class KnetResponseTest(unittest.TestCase):
 def test_rejects_unsafe_payment_links(self):
  for url in ['https://', 'https://user:password@pay.example.com/x',
              'https://127.0.0.1/x', 'https://10.0.0.1/x', 'https://localhost/x',
              'https://pay.example.com:bad/x', 'https://pay.example.com:8443/x',
              'https://pay.example.com/\\x', 'https://pay.example.com/#token']:
   with self.subTest(url=url):
    result=send_link(EVENT,ENV,lambda *a,**k:Response({'payment_url':url,'payment_reference':'payment-123'}))
    self.assertFalse(result[0]);self.assertFalse(result[1])
 def test_rejects_boolean_and_control_character_references(self):
  for ref in [True, 'bad\nref', '   ']:
   result=send_link(EVENT,ENV,lambda *a,**k:Response({'payment_url':'https://pay.example.com/x','payment_reference':ref}))
   self.assertFalse(result[0])
 def test_network_error_cannot_leak_credentials(self):
  def fail(*a,**k):raise URLError('synthetic-knet-secret')
  result=send_link(EVENT,ENV,fail)
  self.assertEqual(result,(False,True,'','','PROVIDER_NETWORK_ERROR'))
if __name__=='__main__':unittest.main()
