import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path

from lib.rollback_rehearsal import (
    RollbackRehearsalError,
    create_continuity_manifest,
    verify_rollback_rehearsal,
)


class RollbackRehearsalTest(unittest.TestCase):
    CANDIDATE = "5c920cbfd3113e4520b29fdbd7f07816f3b661e5"
    ROLLBACK = "102f3d17fb25a0b460bde76eb984361682a4ba3e"
    PROJECT = "aqari-v267-staging"

    def record(self, kind: str, key: str, facts: str):
        return {
            "kind": kind,
            "record_key_sha256": sha256(key.encode()).hexdigest(),
            "immutable_sha256": sha256(facts.encode()).hexdigest(),
        }

    def write_manifest(self, path: Path, at: str, records, *, application_sha=None):
        payload = create_continuity_manifest(
            project_ref=self.PROJECT,
            application_sha=application_sha or self.CANDIDATE,
            captured_at=at,
            records=records,
        )
        path.write_text(json.dumps(payload), encoding="utf-8")

    def make_evidence(self, root: Path):
        before = [
            self.record("rent_payment", "pay-1", "unit=101|amount=195|period=2026-09"),
            self.record("receipt", "rcpt-1", "payment=pay-1|amount=195"),
        ]
        new = [
            self.record("rent_payment", "pay-2", "unit=102|amount=250|period=2026-09"),
            self.record("receipt", "rcpt-2", "payment=pay-2|amount=250"),
        ]
        checkpoint = root / "checkpoint.json"
        during = root / "during.json"
        after = root / "after.json"
        self.write_manifest(checkpoint, "2026-09-17T05:00:00Z", before)
        self.write_manifest(
            during,
            "2026-09-17T05:10:00Z",
            new,
            application_sha=self.ROLLBACK,
        )
        self.write_manifest(after, "2026-09-17T05:20:00Z", before + new)
        return checkpoint, during, after, before, new

    def verify(self, checkpoint, during, after, **overrides):
        args = dict(
            candidate_sha=self.CANDIDATE,
            rollback_application_sha=self.ROLLBACK,
            checkpoint_manifest_path=checkpoint,
            during_manifest_path=during,
            after_manifest_path=after,
            database_rollback_performed=False,
        )
        args.update(overrides)
        return verify_rollback_rehearsal(**args)

    def test_preserves_checkpoint_and_new_transactions_without_db_rollback(self):
        with tempfile.TemporaryDirectory() as temp:
            checkpoint, during, after, _, _ = self.make_evidence(Path(temp))
            report = self.verify(checkpoint, during, after)
            self.assertTrue(report["verified"])
            self.assertFalse(report["database_rollback_performed"])
            self.assertEqual(report["checkpoint_record_count"], 2)
            self.assertEqual(report["new_record_count"], 2)
            self.assertEqual(report["after_record_count"], 4)
            self.assertEqual(report["counts_by_kind"], {"receipt": 2, "rent_payment": 2})

    def test_rehearsal_requires_preexisting_and_new_transactions(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, before, new = self.make_evidence(root)
            self.write_manifest(checkpoint, "2026-09-17T05:00:00Z", [])
            self.write_manifest(after, "2026-09-17T05:20:00Z", new)
            with self.assertRaisesRegex(RollbackRehearsalError, "pre-existing transaction"):
                self.verify(checkpoint, during, after)

            self.write_manifest(checkpoint, "2026-09-17T05:00:00Z", before)
            self.write_manifest(
                during,
                "2026-09-17T05:10:00Z",
                [],
                application_sha=self.ROLLBACK,
            )
            self.write_manifest(after, "2026-09-17T05:20:00Z", before)
            with self.assertRaisesRegex(RollbackRehearsalError, "newly created transaction"):
                self.verify(checkpoint, during, after)

    def test_missing_or_unexpected_transaction_fails_closed(self):
        for mode in ("missing", "unexpected"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                checkpoint, during, after, before, new = self.make_evidence(root)
                if mode == "missing":
                    rows = before + new[:-1]
                else:
                    rows = before + new + [self.record("receipt", "rcpt-extra", "extra")]
                self.write_manifest(after, "2026-09-17T05:20:00Z", rows)
                with self.assertRaisesRegex(RollbackRehearsalError, "transaction set mismatch"):
                    self.verify(checkpoint, during, after)

    def test_immutable_transaction_mutation_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, before, new = self.make_evidence(root)
            mutated = [dict(row) for row in before + new]
            mutated[0]["immutable_sha256"] = sha256(b"changed-amount").hexdigest()
            self.write_manifest(after, "2026-09-17T05:20:00Z", mutated)
            with self.assertRaisesRegex(RollbackRehearsalError, "immutable transaction facts changed"):
                self.verify(checkpoint, during, after)

    def test_database_rollback_or_project_change_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, _, new = self.make_evidence(root)
            with self.assertRaisesRegex(RollbackRehearsalError, "database rollback"):
                self.verify(checkpoint, during, after, database_rollback_performed=True)
            changed = create_continuity_manifest(
                project_ref="aqari-v267-other",
                application_sha=self.ROLLBACK,
                captured_at="2026-09-17T05:10:00Z",
                records=new,
            )
            during.write_text(json.dumps(changed), encoding="utf-8")
            with self.assertRaisesRegex(RollbackRehearsalError, "same database project_ref"):
                self.verify(checkpoint, during, after)

    def test_duplicate_old_record_in_new_window_and_hash_tamper_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, before, new = self.make_evidence(root)
            self.write_manifest(
                during,
                "2026-09-17T05:10:00Z",
                [before[0]] + new,
                application_sha=self.ROLLBACK,
            )
            with self.assertRaisesRegex(RollbackRehearsalError, "only newly created"):
                self.verify(checkpoint, during, after)

            payload = json.loads(checkpoint.read_text(encoding="utf-8"))
            payload["records_sha256"] = "0" * 64
            checkpoint.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RollbackRehearsalError, "records_sha256"):
                self.verify(checkpoint, during, after)

    def test_rehearsal_window_and_sha_guards(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, before, new = self.make_evidence(root)
            self.write_manifest(after, "2026-09-17T06:00:01Z", before + new)
            with self.assertRaisesRegex(RollbackRehearsalError, "window exceeds"):
                self.verify(checkpoint, during, after)
            with self.assertRaisesRegex(RollbackRehearsalError, "candidate_sha"):
                self.verify(checkpoint, during, after, candidate_sha="bad")
            with self.assertRaisesRegex(RollbackRehearsalError, "must differ"):
                self.verify(checkpoint, during, after, rollback_application_sha=self.CANDIDATE)

    def test_timestamps_require_canonical_utc_seconds_and_exact_boundary(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, before, new = self.make_evidence(root)
            self.write_manifest(after, "2026-09-17T06:00:00Z", before + new)
            report = self.verify(checkpoint, during, after)
            self.assertEqual(report["rehearsal_window_seconds"], 3600)
            self.assertIsInstance(report["rehearsal_window_seconds"], int)

            for invalid_timestamp in (
                "2026-09-17T06:00:00.500Z",
                "2026-09-17T06:00:00+00:00",
                "2026-09-17 06:00:00Z",
                "2026-02-30T06:00:00Z",
            ):
                with self.subTest(timestamp=invalid_timestamp):
                    with self.assertRaises(RollbackRehearsalError):
                        self.write_manifest(after, invalid_timestamp, before + new)

    def test_manifest_application_sha_must_match_each_rehearsal_phase(self):
        for phase, wrong_sha, expected_error in (
            ("checkpoint", self.ROLLBACK, "checkpoint manifest application_sha must match candidate_sha"),
            ("during", self.CANDIDATE, "during-window manifest application_sha must match rollback_application_sha"),
            ("after", self.ROLLBACK, "after-rehearsal manifest application_sha must match candidate_sha"),
        ):
            with self.subTest(phase=phase), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                checkpoint, during, after, before, new = self.make_evidence(root)
                if phase == "checkpoint":
                    self.write_manifest(
                        checkpoint,
                        "2026-09-17T05:00:00Z",
                        before,
                        application_sha=wrong_sha,
                    )
                elif phase == "during":
                    self.write_manifest(
                        during,
                        "2026-09-17T05:10:00Z",
                        new,
                        application_sha=wrong_sha,
                    )
                else:
                    self.write_manifest(
                        after,
                        "2026-09-17T05:20:00Z",
                        before + new,
                        application_sha=wrong_sha,
                    )
                with self.assertRaisesRegex(RollbackRehearsalError, expected_error):
                    self.verify(checkpoint, during, after)

    def test_manifest_application_sha_is_required_and_canonical(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint, during, after, _, _ = self.make_evidence(root)
            payload = json.loads(checkpoint.read_text(encoding="utf-8"))
            payload.pop("application_sha")
            checkpoint.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(RollbackRehearsalError, "application_sha"):
                self.verify(checkpoint, during, after)

            for invalid_sha in ("bad", self.CANDIDATE.upper()):
                with self.subTest(application_sha=invalid_sha):
                    with self.assertRaisesRegex(RollbackRehearsalError, "application_sha"):
                        create_continuity_manifest(
                            project_ref=self.PROJECT,
                            application_sha=invalid_sha,
                            captured_at="2026-09-17T05:00:00Z",
                            records=[],
                        )


if __name__ == "__main__":
    unittest.main()
