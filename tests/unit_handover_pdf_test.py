import base64
import copy
import hashlib
import unittest

from lib.unit_handover_pdf import (
    FONT_PATH,
    render_unit_handover_pdf,
    unit_handover_snapshot_sha256,
    verified_unit_handover_bundle,
    verified_unit_handover_evidence,
)

PNG_BYTES = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)


def attachment(document_id, role, raw=PNG_BYTES, mime_type='image/png'):
    return {
        'id': document_id,
        'role': role,
        'checksum_sha256': hashlib.sha256(raw).hexdigest(),
        'size_bytes': len(raw),
        'mime_type': mime_type,
    }


def fixture():
    return {
        'kind': 'unit_handover',
        'title': 'محضر تسليم واستلام وحدة',
        'summary': 'محضر محفوظ من فحص خروج موقع للطرفين.',
        'source': {
            'inspection_id': 'inspection-1',
            'lease_id': 'lease-1',
            'unit_id': 'unit-1',
            'inspection_revision': 2,
            'inspected_at': '2026-09-13T08:00:00Z',
            'signed_at': '2026-09-13T08:05:00Z',
        },
        'parties': {
            'tenant_name': 'مستأجر تجريبي',
            'contract_no': 'C-100',
            'property_name': 'برج تجريبي',
            'unit_no': '401',
        },
        'checklist': [
            {'item': 'الأبواب', 'result': 'سليم'},
            {'item': 'المياه', 'result': 'ملاحظة', 'note': 'تسريب بسيط'},
        ],
        'attachments': [
            attachment('photo-1', 'PHOTO_1'),
            attachment('tenant-signature', 'TENANT_SIGNATURE'),
            attachment('inspector-signature', 'INSPECTOR_SIGNATURE'),
        ],
    }


def evidence_bytes(value=None):
    value = value or fixture()
    return {row['id']: PNG_BYTES for row in value['attachments']}


class UnitHandoverPdfTest(unittest.TestCase):
    def test_verified_bundle_normalizes_and_hash_is_stable(self):
        value = verified_unit_handover_bundle(fixture())
        self.assertEqual(value['source']['inspection_revision'], 2)
        self.assertEqual(value['attachments'][1]['role'], 'TENANT_SIGNATURE')
        self.assertRegex(unit_handover_snapshot_sha256(value), r'^[a-f0-9]{64}$')
        self.assertEqual(unit_handover_snapshot_sha256(value), unit_handover_snapshot_sha256(copy.deepcopy(value)))

    def test_snapshot_hash_changes_when_saved_handover_changes(self):
        original = fixture()
        changed = copy.deepcopy(original)
        changed['checklist'][0]['result'] = 'متضرر'
        self.assertNotEqual(unit_handover_snapshot_sha256(original), unit_handover_snapshot_sha256(changed))

    def test_missing_signature_photo_or_integrity_is_rejected(self):
        cases = []
        value = fixture(); value['attachments'] = [row for row in value['attachments'] if row['role'] != 'TENANT_SIGNATURE']; cases.append(value)
        value = fixture(); value['attachments'] = [row for row in value['attachments'] if not row['role'].startswith('PHOTO_')]; cases.append(value)
        value = fixture(); value['attachments'][0]['checksum_sha256'] = 'bad'; cases.append(value)
        value = fixture(); value['attachments'][0]['size_bytes'] = 0; cases.append(value)
        for value in cases:
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    verified_unit_handover_bundle(value)

    def test_duplicate_attachment_identity_is_rejected(self):
        value = fixture()
        value['attachments'][1]['id'] = value['attachments'][0]['id']
        with self.assertRaisesRegex(ValueError, 'IDENTITY_CONFLICT'):
            verified_unit_handover_bundle(value)
        value = fixture()
        value['attachments'][1]['role'] = value['attachments'][0]['role']
        with self.assertRaisesRegex(ValueError, 'IDENTITY_CONFLICT'):
            verified_unit_handover_bundle(value)

    def test_evidence_bytes_are_required_and_reverified(self):
        value = fixture()
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_BYTES_REQUIRED'):
            verified_unit_handover_evidence(value, None)

        missing = evidence_bytes(value)
        missing.pop('photo-1')
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_BYTES_REQUIRED'):
            verified_unit_handover_evidence(value, missing)

        wrong_size = evidence_bytes(value)
        wrong_size['photo-1'] = PNG_BYTES + b'x'
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_SIZE_MISMATCH'):
            verified_unit_handover_evidence(value, wrong_size)

        wrong_sha = evidence_bytes(value)
        wrong_sha['photo-1'] = bytes([PNG_BYTES[0] ^ 1]) + PNG_BYTES[1:]
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_SHA256_MISMATCH'):
            verified_unit_handover_evidence(value, wrong_sha)

        mime_mismatch = fixture()
        mime_mismatch['attachments'][0]['mime_type'] = 'image/jpeg'
        with self.assertRaisesRegex(ValueError, 'EVIDENCE_MIME_MISMATCH'):
            verified_unit_handover_evidence(mime_mismatch, evidence_bytes(mime_mismatch))

    @unittest.skipUnless(FONT_PATH.exists(), 'repository font fixture is required')
    def test_verified_handover_renders_real_pdf_with_visual_evidence(self):
        value = fixture()
        data = render_unit_handover_pdf(value, evidence_bytes(value))
        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertGreater(len(data), 1000)
        self.assertIn(b'/Subtype /Image', data)


if __name__ == '__main__':
    unittest.main()
