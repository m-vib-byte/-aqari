import copy
import json
import tempfile
import unittest
from pathlib import Path

from lib.restore_equivalence import RestoreEquivalenceError, verify_restore_equivalence
from lib.storage_byte_manifest import write_manifest


class RestoreEquivalenceTest(unittest.TestCase):
    SHA = "fde5ae9c16b7fe8609aef831a40ea7bdbbfea183"

    def manifest(self, generated_at: str):
        return {
            "format": "AQARI-V267-DATA-SAFETY-MANIFEST-3",
            "generated_at": generated_at,
            "business": {"table_count": 1, "row_count": 1, "sha256": "a" * 64, "tables": []},
            "schema_safe": {"columns": {"rows": 2, "sha256": "b" * 64}},
            "auth_safe": {"users": {"rows": 1, "sha256": "c" * 64}},
            "storage_safe": {"objects": 1, "buckets": 1, "metadata_sha256": "d" * 64, "bytes_reported": 9},
            "warning": "volatile explanatory text may differ",
        }

    def make_evidence(self, root: Path):
        source_json = root / "source.json"
        restored_json = root / "restored.json"
        source_json.write_text(json.dumps(self.manifest("2026-09-17T04:00:00Z")), encoding="utf-8")
        restored_json.write_text(json.dumps(self.manifest("2026-09-17T04:10:00Z")), encoding="utf-8")
        source_storage = root / "source-storage"
        restored_storage = root / "restored-storage"
        for tree in (source_storage, restored_storage):
            (tree / "contracts").mkdir(parents=True)
            (tree / "contracts" / "lease.pdf").write_bytes(b"PDF-BYTES")
        storage_manifest = root / "storage.json"
        write_manifest(source_storage, storage_manifest)
        return source_json, restored_json, storage_manifest, restored_storage

    def verify(self, source, restored, storage_manifest, restored_storage, **overrides):
        args = dict(
            candidate_sha=self.SHA,
            source_project_ref="aqari-v267-staging",
            restore_project_ref="aqari-v267-restore-r3",
            source_data_safety_path=source,
            restored_data_safety_path=restored,
            source_storage_manifest_path=storage_manifest,
            restored_storage_root=restored_storage,
        )
        args.update(overrides)
        return verify_restore_equivalence(**args)

    def test_independent_restore_matches_all_canonical_sections_and_storage_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            source, restored, storage, tree = self.make_evidence(Path(temp))
            report = self.verify(source, restored, storage, tree)
            self.assertTrue(report["verified"])
            self.assertEqual(report["candidate_sha"], self.SHA)
            self.assertEqual(report["source_generated_at"], "2026-09-17T04:00:00Z")
            self.assertEqual(report["restored_generated_at"], "2026-09-17T04:10:00Z")
            self.assertEqual(report["storage_object_count"], 1)
            self.assertEqual(report["storage_total_bytes"], 9)
            self.assertEqual(set(report["section_sha256"]), {"business", "schema_safe", "auth_safe", "storage_safe"})

    def test_restore_must_use_a_different_project_ref(self):
        with tempfile.TemporaryDirectory() as temp:
            source, restored, storage, tree = self.make_evidence(Path(temp))
            with self.assertRaisesRegex(RestoreEquivalenceError, "must differ"):
                self.verify(source, restored, storage, tree, restore_project_ref="aqari-v267-staging")

    def test_restore_manifest_must_be_independently_generated_after_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, restored, storage, tree = self.make_evidence(root)
            with self.assertRaisesRegex(RestoreEquivalenceError, "independently generated"):
                self.verify(source, source, storage, tree)

            payload = json.loads(restored.read_text(encoding="utf-8"))
            payload["generated_at"] = "2026-09-17T04:00:00Z"
            restored.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RestoreEquivalenceError, "generated after"):
                self.verify(source, restored, storage, tree)

            payload["generated_at"] = "2026-09-17T03:59:59Z"
            restored.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RestoreEquivalenceError, "generated after"):
                self.verify(source, restored, storage, tree)

    def test_restore_manifest_timestamps_must_be_valid_utc(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, restored, storage, tree = self.make_evidence(root)
            payload = json.loads(restored.read_text(encoding="utf-8"))
            payload["generated_at"] = "2026-09-17T07:10:00+03:00"
            restored.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RestoreEquivalenceError, "must be UTC"):
                self.verify(source, restored, storage, tree)

            payload["generated_at"] = "not-a-time"
            restored.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RestoreEquivalenceError, "invalid restored generated_at"):
                self.verify(source, restored, storage, tree)

    def test_each_canonical_section_drift_is_rejected(self):
        for section in ("business", "schema_safe", "auth_safe", "storage_safe"):
            with self.subTest(section=section), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                source, restored, storage, tree = self.make_evidence(root)
                payload = json.loads(restored.read_text(encoding="utf-8"))
                payload[section] = copy.deepcopy(payload[section])
                payload[section]["restore_tamper"] = True
                restored.write_text(json.dumps(payload), encoding="utf-8")
                with self.assertRaisesRegex(RestoreEquivalenceError, rf"restored {section} does not match"):
                    self.verify(source, restored, storage, tree)

    def test_source_storage_byte_manifest_must_match_data_safety_metadata(self):
        for field, value, expected in (
            ("objects", 2, "object_count"),
            ("bytes_reported", 8, "total_bytes"),
        ):
            with self.subTest(field=field), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                source, restored, storage, tree = self.make_evidence(root)
                for path in (source, restored):
                    payload = json.loads(path.read_text(encoding="utf-8"))
                    payload["storage_safe"][field] = value
                    path.write_text(json.dumps(payload), encoding="utf-8")
                with self.assertRaisesRegex(RestoreEquivalenceError, expected):
                    self.verify(source, restored, storage, tree)

    def test_storage_byte_tamper_is_rejected_even_when_metadata_manifest_matches(self):
        with tempfile.TemporaryDirectory() as temp:
            source, restored, storage, tree = self.make_evidence(Path(temp))
            (tree / "contracts" / "lease.pdf").write_bytes(b"PDF-TAMPER")
            with self.assertRaisesRegex(RestoreEquivalenceError, "Storage bytes"):
                self.verify(source, restored, storage, tree)

    def test_invalid_manifest_format_and_candidate_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, restored, storage, tree = self.make_evidence(root)
            payload = json.loads(restored.read_text(encoding="utf-8"))
            payload["format"] = "AQARI-V267-DATA-SAFETY-MANIFEST-2"
            restored.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RestoreEquivalenceError, "DATA-SAFETY-MANIFEST-3"):
                self.verify(source, restored, storage, tree)
            with self.assertRaisesRegex(RestoreEquivalenceError, "candidate_sha"):
                self.verify(source, source, storage, tree, candidate_sha="not-a-sha")


if __name__ == "__main__":
    unittest.main()
