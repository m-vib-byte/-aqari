import json
import tempfile
import unittest
from pathlib import Path

from lib.storage_byte_manifest import (
    FORMAT,
    StorageByteManifestError,
    manifest_sha256,
    read_manifest,
    scan_storage_tree,
    verify_storage_tree,
    write_manifest,
)


class StorageByteManifestTest(unittest.TestCase):
    def make_tree(self, root: Path):
        (root / 'contracts' / 'signed').mkdir(parents=True)
        (root / 'maintenance').mkdir(parents=True)
        (root / 'contracts' / 'signed' / 'lease-001.pdf').write_bytes(b'PDF-AQARI-001\x00\xff')
        (root / 'maintenance' / 'before.jpg').write_bytes(b'JPEG-BEFORE-123')

    def test_create_and_verify_exact_tree(self):
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as restored_dir, tempfile.TemporaryDirectory() as out_dir:
            source = Path(source_dir)
            restored = Path(restored_dir)
            self.make_tree(source)
            self.make_tree(restored)
            manifest_path = Path(out_dir) / 'storage-byte-manifest.json'
            payload = write_manifest(source, manifest_path)

            self.assertEqual(payload['format'], FORMAT)
            self.assertEqual(payload['object_count'], 2)
            self.assertEqual(payload['total_bytes'], sum(item['size'] for item in payload['objects']))
            self.assertEqual(payload['objects'], sorted(payload['objects'], key=lambda item: item['path']))
            self.assertEqual(read_manifest(manifest_path), payload)

            report = verify_storage_tree(restored, payload)
            self.assertTrue(report['verified'])
            self.assertEqual(report['object_count'], 2)
            self.assertEqual(report['total_bytes'], payload['total_bytes'])
            self.assertEqual(report['manifest_sha256'], manifest_sha256(payload))

    def test_same_size_byte_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as restored_dir:
            source = Path(source_dir)
            restored = Path(restored_dir)
            self.make_tree(source)
            self.make_tree(restored)
            payload = scan_storage_tree(source)
            target = restored / 'maintenance' / 'before.jpg'
            original = target.read_bytes()
            target.write_bytes(b'X' + original[1:])
            self.assertEqual(target.stat().st_size, len(original))

            with self.assertRaisesRegex(StorageByteManifestError, 'mismatched'):
                verify_storage_tree(restored, payload)

    def test_missing_and_extra_objects_are_rejected(self):
        with tempfile.TemporaryDirectory() as source_dir, tempfile.TemporaryDirectory() as restored_dir:
            source = Path(source_dir)
            restored = Path(restored_dir)
            self.make_tree(source)
            self.make_tree(restored)
            payload = scan_storage_tree(source)
            (restored / 'maintenance' / 'before.jpg').unlink()
            (restored / 'maintenance' / 'unexpected.bin').write_bytes(b'extra')

            with self.assertRaisesRegex(StorageByteManifestError, "missing=.*before.jpg.*extra=.*unexpected.bin"):
                verify_storage_tree(restored, payload)

    def test_unsafe_or_duplicate_manifest_paths_are_rejected(self):
        digest = '0' * 64
        unsafe = {
            'format': FORMAT,
            'object_count': 1,
            'total_bytes': 0,
            'objects': [{'path': '../escape.bin', 'size': 0, 'sha256': digest}],
        }
        with self.assertRaises(StorageByteManifestError):
            verify_storage_tree('.', unsafe)

        duplicate = {
            'format': FORMAT,
            'object_count': 2,
            'total_bytes': 0,
            'objects': [
                {'path': 'bucket/a.bin', 'size': 0, 'sha256': digest},
                {'path': 'bucket/a.bin', 'size': 0, 'sha256': digest},
            ],
        }
        with self.assertRaisesRegex(StorageByteManifestError, 'duplicate'):
            manifest_sha256(duplicate)

    def test_manifest_metadata_must_match_objects(self):
        with tempfile.TemporaryDirectory() as source_dir:
            source = Path(source_dir)
            self.make_tree(source)
            payload = scan_storage_tree(source)
            broken = json.loads(json.dumps(payload))
            broken['total_bytes'] += 1
            with self.assertRaisesRegex(StorageByteManifestError, 'total_bytes'):
                manifest_sha256(broken)


if __name__ == '__main__':
    unittest.main()
