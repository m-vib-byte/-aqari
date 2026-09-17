import json
import unittest
from lib.integration_dispatch import _send

ITEM = {'eventId': '11111111-1111-4111-8111-111111111111',
        'secretReference': 'TEST_SECRET', 'idempotencyKey': 'test:notification:1',
        'recipientReference': 'test-recipient', 'channel': 'whatsapp',
        'template': 'rent_reminder', 'variables': {}, 'locale': 'ar',
        'endpointOrigin': 'https://provider.example.invalid'}
ENV = {'TEST_SECRET': 'synthetic-token-only'}

class Response:
    status = 200
    def __init__(self, raw): self.raw = raw
    def __enter__(self): return self
    def __exit__(self, *args): pass
    def read(self, size): return self.raw[:size]

class DeliveryAcknowledgementTest(unittest.TestCase):
    def test_ambiguous_success_never_marks_sent_or_retries_blindly(self):
        for payload in [{}, {'message_id': True}, {'id': '   '},
                        {'id': 'bad\nref'}, {'error': 'failed', 'id': 'x'}, []]:
            with self.subTest(payload=payload):
                result = _send(ITEM, ENV, lambda *a, **k: Response(json.dumps(payload).encode()))
                self.assertEqual(result, (False, False, '', 'PROVIDER_ACKNOWLEDGEMENT_REQUIRED'))

    def test_malformed_or_oversize_response_is_not_success(self):
        for raw in [b'not-json', b'x' * 65537]:
            result = _send(ITEM, ENV, lambda *a, **k: Response(raw))
            self.assertFalse(result[0])
            self.assertFalse(result[1])

    def test_valid_acknowledgement_preserves_provider_reference(self):
        result = _send(ITEM, ENV, lambda *a, **k: Response(b'{"message_id":"message-123"}'))
        self.assertEqual(result, (True, False, 'message-123', None))

if __name__ == '__main__': unittest.main()
