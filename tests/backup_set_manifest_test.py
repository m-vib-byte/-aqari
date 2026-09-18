import tempfile
import unittest
from pathlib import Path

from lib.backup_set_manifest import (
    BackupSetManifestError,
    backup_set_sha256,
    create_backup_set,
    verify_backup_set,
)
from lib.storage_byte_manifest import write_manifest


class BackupSetManifestTest(unittest.TestCase):
    SHA = '394cfe13c3ec7dc06c2aabdc71af91c57faf1174'

    def make_artifacts(self, root: Path):
        root.mkdir(parents=True, exist_ok=True)
        db = root / 'database.dump'
        auth = root / 'auth.json'
        storage_tree = root / 'storage-tree'
        storage_manifest = root / 'storage-byte-manifest.json'
        db.write_bytes(b'PGDUMP-AQARI-V267\x00snapshot')
        auth.write_text('{"users":[{"id":"u1"}],"identities":[]}', encoding='utf-8')
        (storage_tree / 'contracts').mkdir(parents=True)
        (storage_tree / 'contracts' / 'lease.pdf').write_bytes(b'%PDF-AQARI')
        write_manifest(storage_tree, storage_manifest)
        return db, auth, storage_manifest

    def create(self, db, auth, storage_manifest, **overrides):
        args = dict(
            candidate_sha=self.SHA,
            project_ref='aqari-v267-staging',
            capture_started_at='2026-09-17T03:00:00Z',
            capture_finished_at='2026-09-17T03:02:00Z',
            database_path=db,
            auth_path=auth,
            storage_manifest_path=storage_manifest,
        )
        args.update(overrides)
        return create_backup_set(**args)

    def test_round_trip_binds_all_three_artifacts_and_candidate(self):
        with tempfile.TemporaryDirectory() as temp:
            db, auth, storage = self.make_artifacts(Path(temp))
            payload = self.create(db, auth, storage)
            report = verify_backup_set(
                payload,
                candidate_sha=self.SHA,
                database_path=db,
                auth_path=auth,
                storage_manifest_path=storage,
            )
            self.assertTrue(report['verified'])
            self.assertEqual(report['candidate_sha'], self.SHA)
            self.assertEqual(len(report['backup_set_sha256']), 64)
            self.assertEqual(report['backup_set_sha256'], backup_set_sha256(payload))
            self.assertEqual(set(payload['components']), {'database', 'auth', 'storage'})
            self.assertEqual(payload['components']['storage']['object_count'], 1)

    def test_database_byte_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            db, auth, storage = self.make_artifacts(Path(temp))
            payload = self.create(db, auth, storage)
            db.write_bytes(db.read_bytes() + b'changed')
            with self.assertRaisesRegex(BackupSetManifestError, 'database backup artifact'):
                verify_backup_set(
                    payload,
                    candidate_sha=self.SHA,
                    database_path=db,
                    auth_path=auth,
                    storage_manifest_path=storage,
                )

    def test_mixed_auth_snapshot_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db, auth, storage = self.make_artifacts(root)
            payload = self.create(db, auth, storage)
            mixed = root / 'auth-other.json'
            mixed.write_text('{"users":[{"id":"different"}]}', encoding='utf-8')
            with self.assertRaisesRegex(BackupSetManifestError, 'auth backup artifact'):
                verify_backup_set(
                    payload,
                    candidate_sha=self.SHA,
                    database_path=db,
                    auth_path=mixed,
                    storage_manifest_path=storage,
                )

    def test_candidate_mismatch_is_rejected_before_acceptance(self):
        with tempfile.TemporaryDirectory() as temp:
            db, auth, storage = self.make_artifacts(Path(temp))
            payload = self.create(db, auth, storage)
            with self.assertRaisesRegex(BackupSetManifestError, 'candidate SHA'):
                verify_backup_set(
                    payload,
                    candidate_sha='0' * 40,
                    database_path=db,
                    auth_path=auth,
                    storage_manifest_path=storage,
                )

    def test_capture_window_is_bounded(self):
        with tempfile.TemporaryDirectory() as temp:
            db, auth, storage = self.make_artifacts(Path(temp))
            exact = self.create(db, auth, storage, capture_finished_at='2026-09-17T03:05:00Z')
            self.assertEqual(exact['capture_window_seconds'], 300)
            with self.assertRaisesRegex(BackupSetManifestError, 'capture window out of bounds'):
                self.create(db, auth, storage, capture_finished_at='2026-09-17T03:05:01Z')

    def test_capture_timestamps_reject_subsecond_or_noncanonical_precision(self):
        with tempfile.TemporaryDirectory() as temp:
            db, auth, storage = self.make_artifacts(Path(temp))
            for invalid in ('2026-09-17T03:05:00.001Z', '2026-09-17 03:05:00Z'):
                with self.subTest(invalid=invalid):
                    with self.assertRaisesRegex(BackupSetManifestError, 'canonical UTC second precision'):
                        self.create(db, auth, storage, capture_finished_at=invalid)

    def test_invalid_storage_manifest_or_reused_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            db, auth, storage = self.make_artifacts(root)
            storage.write_text('{}', encoding='utf-8')
            with self.assertRaisesRegex(BackupSetManifestError, 'invalid storage byte manifest'):
                self.create(db, auth, storage)
            other_storage = self.make_artifacts(root / 'other')[2]
            with self.assertRaisesRegex(BackupSetManifestError, 'distinct files'):
                self.create(db, db, other_storage)


if __name__ == '__main__':
    unittest.main()
