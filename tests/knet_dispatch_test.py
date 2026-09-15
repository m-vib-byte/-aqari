import json,unittest
from io import BytesIO
from lib.knet_dispatch import provider_request,send_link,dispatch_knet_once

EVENT={'eventId':'11111111-1111-4111-8111-111111111111','workspaceId':'22222222-2222-4222-8222-222222222222','eventType':'knet.payment_link','intentId':'33333333-3333-4333-8333-333333333333','idempotencyKey':'knet:intent:001','leaseId':'44444444-4444-4444-8444-444444444444','contractNo':'AQ-C-2026-000001','amount':'10.000','currency':'KWD','expiresAt':'2026-09-15T12:00:00+03:00','endpointOrigin':'https://provider.example.invalid','secretReference':'AQARI_TEST_KNET_SECRET','callbackPath':'/api/provider-webhook?workspace=22222222-2222-4222-8222-222222222222&provider=knet','returnPath':'/app?release=V267&knet_intent=33333333-3333-4333-8333-333333333333'}

class Response:
 def __init__(self,payload,status=200):self.payload=payload;self.status=status
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def read(self,size=-1):return json.dumps(self.payload).encode()

class KnetDispatchTest(unittest.TestCase):
 def test_provider_request_keeps_secret_server_side_and_uses_bounded_routes(self):
  spec=provider_request(EVENT,{'AQARI_TEST_KNET_SECRET':'synthetic-knet-secret'})
  self.assertEqual(spec['origin'],'https://provider.example.invalid');self.assertEqual(spec['path'],'/payments')
  self.assertEqual(spec['headers']['Authorization'],'Bearer synthetic-knet-secret');self.assertEqual(spec['headers']['Idempotency-Key'],EVENT['idempotencyKey'])
  self.assertEqual(spec['json']['callback_path'],EVENT['callbackPath']);self.assertEqual(spec['json']['return_path'],EVENT['returnPath']);self.assertNotIn('synthetic-knet-secret',json.dumps(spec['json']))

 def test_provider_response_requires_https_link_and_reference(self):
  ok=send_link(EVENT,{'AQARI_TEST_KNET_SECRET':'synthetic-knet-secret'},lambda req,timeout:Response({'payment_url':'https://pay.example.invalid/x','payment_reference':'KNET-001'}))
  self.assertEqual(ok,(True,False,'KNET-001','https://pay.example.invalid/x',None))
  bad=send_link(EVENT,{'AQARI_TEST_KNET_SECRET':'synthetic-knet-secret'},lambda req,timeout:Response({'payment_url':'http://bad.invalid/x','payment_reference':'KNET-001'}))
  self.assertFalse(bad[0]);self.assertFalse(bad[1]);self.assertIn('INVALID_KNET_PROVIDER_RESPONSE',bad[4])

 def test_dispatch_claims_and_finalizes_link_idempotently(self):
  calls=[]
  def db(name,payload,env):
   calls.append((name,payload))
   if name=='aqari_knet_payment_link_claim':return [dict(EVENT)]
   self.assertEqual(name,'aqari_knet_payment_link_result');self.assertTrue(payload['p_ok']);self.assertEqual(payload['p_provider_reference'],'KNET-001');return {'status':'link_ready'}
  result=dispatch_knet_once(1,{},db,lambda item,env:(True,False,'KNET-001','https://pay.example.invalid/x',None))
  self.assertEqual(result,{'knetClaimed':1,'knetLinksReady':1,'knetFailed':0,'knetDeadLetter':0});self.assertEqual([x[0] for x in calls],['aqari_knet_payment_link_claim','aqari_knet_payment_link_result'])

 def test_invalid_claim_and_missing_secret_fail_closed(self):
  with self.assertRaisesRegex(RuntimeError,'PROVIDER_SECRET_NOT_CONFIGURED'):provider_request(EVENT,{})
  with self.assertRaisesRegex(ValueError,'INVALID_KNET_CLAIM'):provider_request({**EVENT,'eventType':'notification.rent_reminder'},{'AQARI_TEST_KNET_SECRET':'synthetic-knet-secret'})

if __name__=='__main__':unittest.main()