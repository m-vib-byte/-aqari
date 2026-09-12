import hashlib,hmac,json,unittest
from lib.provider_webhook import verify_and_normalize,secret_name
WS='10000000-0000-4000-8000-000000000002';NOW=1789171200;SECRET='x'*40
def signed(raw,event='evt_test_0001',timestamp=NOW):
    sig=hmac.new(SECRET.encode(),str(timestamp).encode()+b'.'+raw,hashlib.sha256).hexdigest();return {'x-aqari-timestamp':str(timestamp),'x-aqari-event-id':event,'x-aqari-signature':sig}
class ProviderWebhookTest(unittest.TestCase):
    def test_valid_signature_is_normalized_and_sensitive_unknown_fields_are_dropped(self):
        raw=json.dumps({'event_type':'payment.completed','occurred_at':'2026-09-12T00:00:00Z','amount':'10.000','civil_id':'must-not-pass'}).encode();r=verify_and_normalize(WS,'knet',raw,signed(raw),NOW,{secret_name(WS,'knet'):SECRET});self.assertEqual(r['normalized_payload']['amount'],'10.000');self.assertNotIn('civil_id',r['normalized_payload'])
    def test_bad_signature_stale_timestamp_and_unknown_provider_are_rejected(self):
        raw=b'{"event_type":"x","occurred_at":"2026-09-12T00:00:00Z"}'
        with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,{**signed(raw),'x-aqari-signature':'0'*64},NOW,{secret_name(WS,'knet'):SECRET})
        with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,signed(raw,timestamp=NOW-301),NOW,{secret_name(WS,'knet'):SECRET})
        with self.assertRaises(ValueError):verify_and_normalize(WS,'unknown',raw,signed(raw),NOW,{})
    def test_event_id_supports_database_idempotency(self):
        raw=b'{"event_type":"x","occurred_at":"2026-09-12T00:00:00Z"}';headers=signed(raw);a=verify_and_normalize(WS,'knet',raw,headers,NOW,{secret_name(WS,'knet'):SECRET});b=verify_and_normalize(WS,'knet',raw,headers,NOW,{secret_name(WS,'knet'):SECRET});self.assertEqual(a['provider_event_id'],b['provider_event_id'])
if __name__=='__main__':unittest.main()
