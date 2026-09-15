import hashlib,hmac,json,unittest
from lib.provider_webhook import verify_and_normalize,secret_name
WS='10000000-0000-4000-8000-000000000002';NOW=1789171200;SECRET='x'*40
def signed(raw,event='evt_test_0001',timestamp=NOW,workspace=WS,provider='knet'):
    envelope=('aqari-webhook-v1\n'+workspace.lower()+'\n'+provider+'\n'+str(timestamp)+'\n'+event+'\n').encode()+raw
    sig=hmac.new(SECRET.encode(),envelope,hashlib.sha256).hexdigest();return {'x-aqari-timestamp':str(timestamp),'x-aqari-event-id':event,'x-aqari-signature':sig}
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
    def test_captured_signature_cannot_change_idempotency_key(self):
        raw=b'{"event_type":"payment.completed","occurred_at":"2026-09-12T00:00:00Z"}'
        with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,{**signed(raw),'x-aqari-event-id':'evt_replayed_002'},NOW,{secret_name(WS,'knet'):SECRET})
    def test_body_timestamp_provider_and_workspace_are_bound_even_with_reused_secret(self):
        raw=b'{"event_type":"payment.completed","occurred_at":"2026-09-12T00:00:00Z"}';other='20000000-0000-4000-8000-000000000002';cases=[(WS,'knet',raw+b' ',signed(raw)),(WS,'knet',raw,{**signed(raw),'x-aqari-timestamp':str(NOW+1)}),(WS,'email',raw,signed(raw)),(other,'knet',raw,signed(raw))]
        for workspace,provider,body,headers in cases:
            with self.subTest(workspace=workspace,provider=provider,body=body,headers=headers):
                with self.assertRaises(PermissionError):verify_and_normalize(workspace,provider,body,headers,NOW,{secret_name(workspace,provider):SECRET})
    def test_legacy_signature_without_event_binding_is_rejected(self):
        raw=b'{"event_type":"x","occurred_at":"2026-09-12T00:00:00Z"}';legacy=hmac.new(SECRET.encode(),str(NOW).encode()+b'.'+raw,hashlib.sha256).hexdigest()
        with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,{**signed(raw),'x-aqari-signature':legacy},NOW,{secret_name(WS,'knet'):SECRET})
    def test_timestamp_window_checks_both_directions_and_respects_zero_clock(self):
        raw=b'{"event_type":"x","occurred_at":"2026-09-12T00:00:00Z"}'
        for delta in (-300,300):verify_and_normalize(WS,'knet',raw,signed(raw,timestamp=NOW+delta),NOW,{secret_name(WS,'knet'):SECRET})
        for delta in (-301,301):
            with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,signed(raw,timestamp=NOW+delta),NOW,{secret_name(WS,'knet'):SECRET})
        verify_and_normalize(WS,'knet',raw,signed(raw,timestamp=0),0,{secret_name(WS,'knet'):SECRET})
    def test_signed_ambiguous_or_non_finite_json_is_rejected(self):
        for raw in (b'{"event_type":"a","event_type":"b","occurred_at":"x"}',b'{"event_type":"a","occurred_at":"x","amount":NaN}',b'{"event_type":"a","occurred_at":"x","amount":Infinity}',b'{"event_type":"a","occurred_at":""}',b'[]'):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):verify_and_normalize(WS,'knet',raw,signed(raw),NOW,{secret_name(WS,'knet'):SECRET})
    def test_missing_secret_and_malformed_headers_fail_closed(self):
        raw=b'{"event_type":"x","occurred_at":"2026-09-12T00:00:00Z"}'
        with self.assertRaises(RuntimeError):verify_and_normalize(WS,'knet',raw,signed(raw),NOW,{})
        for header,value in [('x-aqari-timestamp',str(NOW)+'\n'),('x-aqari-timestamp','9'*1000),('x-aqari-event-id','evt_test_001\n'),('x-aqari-signature',None)]:
            with self.subTest(header=header):
                with self.assertRaises(PermissionError):verify_and_normalize(WS,'knet',raw,{**signed(raw),header:value},NOW,{secret_name(WS,'knet'):SECRET})
    def test_whatsapp_maintenance_message_requires_complete_bounded_canonical_fields(self):
        body={'event_type':'maintenance.message','occurred_at':'2026-09-12T00:00:00Z','maintenance_request_no':'12345','sender_reference':'+96550000000','message_reference':'wamid.qa.001','message_text':'متابعة البلاغ'};raw=json.dumps(body,ensure_ascii=False).encode();headers=signed(raw,provider='whatsapp');result=verify_and_normalize(WS,'whatsapp',raw,headers,NOW,{secret_name(WS,'whatsapp'):SECRET});self.assertEqual(result['normalized_payload']['maintenance_request_no'],'12345');self.assertEqual(result['normalized_payload']['message_reference'],'wamid.qa.001')
        for change in ({'message_reference':''},{'message_text':''},{'sender_reference':'x'},{'maintenance_request_no':'abc'}):
            bad={**body,**change};raw_bad=json.dumps(bad,ensure_ascii=False).encode()
            with self.subTest(change=change):
                with self.assertRaises(ValueError):verify_and_normalize(WS,'whatsapp',raw_bad,signed(raw_bad,provider='whatsapp'),NOW,{secret_name(WS,'whatsapp'):SECRET})
    def test_maintenance_link_fields_are_rejected_on_other_providers_or_event_types(self):
        for provider,event_type in [('knet','maintenance.message'),('whatsapp','message.received')]:
            body={'event_type':event_type,'occurred_at':'2026-09-12T00:00:00Z','maintenance_request_no':'12345','sender_reference':'+96550000000','message_reference':'msg-001','message_text':'x'};raw=json.dumps(body).encode()
            with self.subTest(provider=provider,event_type=event_type):
                with self.assertRaises(ValueError):verify_and_normalize(WS,provider,raw,signed(raw,provider=provider),NOW,{secret_name(WS,provider):SECRET})
if __name__=='__main__':unittest.main()
