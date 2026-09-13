import copy
import unittest

from lib.unit_handover_pdf import (
    FONT_PATH,
    render_unit_handover_pdf,
    unit_handover_snapshot_sha256,
    verified_unit_handover_bundle,
)


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
            {'id': 'photo-1', 'role': 'PHOTO_1', 'checksum_sha256': '1' * 64, 'size_bytes': 101, 'mime_type': 'image/jpeg'},
            {'id': 'tenant-signature', 'role': 'TENANT_SIGNATURE', 'checksum_sha256': '2' * 64, 'size_bytes': 102, 'mime_type': 'image/png'},
            {'id': 'inspector-signature', 'role': 'INSPECTOR_SIGNATURE', 'checksum_sha256': '3' * 64, 'size_bytes': 103, 'mime_type': 'application/pdf'},
        ],
    }


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

    @unittest.skipUnless(FONT_PATH.exists(), 'repository font fixture is required')
    def test_verified_handover_renders_real_pdf_bytes(self):
        data = render_unit_handover_pdf(fixture())
        self.assertTrue(data.startswith(b'%PDF-'))
        self.assertGreater(len(data), 1000)


if __name__ == '__main__':
    unittest.main()
