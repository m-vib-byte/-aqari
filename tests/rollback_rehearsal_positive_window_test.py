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


class RollbackRehearsalPositiveWindowTest(unittest.TestCase):
    CANDIDATE = "5c920cbfd3113e4520b29fdbd7f07816f3b661e5"
    ROLLBACK = "102f3d17fb25a0b460bde76eb984361682a4ba3e"
    PROJECT = "aqari-v267-staging"
    REHEARSAL = "c" * 32
    CAPTURED_AT = "2026-09-17T05:00:00Z"

    @staticmethod
    def record(kind: str, key: str, facts: str) -> dict:
        return {
            "kind": kind,
            "record_key_sha256": sha256(key.encode()).hexdigest(),
            "immutable_sha256": sha256(facts.encode()).hexdigest(),
        }

    def write_manifest(self, path: Path, phase: str, application_sha: str, records: list[dict]) -> None:
        payload = create_continuity_manifest(
            project_ref=self.PROJECT,
            rehearsal_id=self.REHEARSAL,
            phase=phase,
            application_sha=application_sha,
            captured_at=self.CAPTURED_AT,
            records=records,
        )
        path.write_text(json.dumps(payload), encoding="utf-8")

    def test_zero_second_rehearsal_is_rejected_before_it_can_be_stage_c_evidence(self):
        before = [self.record("rent_payment", "pay-1", "amount=195")]
        new = [self.record("receipt", "receipt-2", "amount=250")]

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            checkpoint = root / "checkpoint.json"
            during = root / "during.json"
            after = root / "after.json"
            self.write_manifest(checkpoint, "checkpoint", self.CANDIDATE, before)
            self.write_manifest(during, "during", self.ROLLBACK, new)
            self.write_manifest(after, "after", self.CANDIDATE, before + new)

            with self.assertRaisesRegex(RollbackRehearsalError, "at least 1 second"):
                verify_rollback_rehearsal(
                    candidate_sha=self.CANDIDATE,
                    rollback_application_sha=self.ROLLBACK,
                    checkpoint_manifest_path=checkpoint,
                    during_manifest_path=during,
                    after_manifest_path=after,
                    database_rollback_performed=False,
                )


if __name__ == "__main__":
    unittest.main()
