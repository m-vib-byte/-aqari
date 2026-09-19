import copy
import unittest

from lib.stage_c_evidence_bundle import StageCEvidenceError, create_stage_c_evidence_bundle
from tests.stage_c_evidence_bundle_test import SHA, fixtures


class StageCRollbackWindowParityTests(unittest.TestCase):
    def _build_with_window(self, window):
        backup, storage, restore, rollback, devices = fixtures()
        rollback = copy.deepcopy(rollback)
        rollback["rehearsal_window_seconds"] = window
        return create_stage_c_evidence_bundle(
            candidate_sha=SHA,
            backup_set=backup,
            backup_storage_report=storage,
            restore_report=restore,
            rollback_report=rollback,
            devices=devices,
        )

    def test_accepts_upper_bound_3600(self):
        bundle = self._build_with_window(3600)
        self.assertEqual(bundle["rollback"]["rehearsal_window_seconds"], 3600)

    def test_rejects_zero_window(self):
        with self.assertRaisesRegex(StageCEvidenceError, "between 1 and 3600"):
            self._build_with_window(0)

    def test_rejects_window_above_3600(self):
        with self.assertRaisesRegex(StageCEvidenceError, "between 1 and 3600"):
            self._build_with_window(3601)

    def test_rejects_bool_window(self):
        with self.assertRaisesRegex(StageCEvidenceError, "between 1 and 3600"):
            self._build_with_window(True)


if __name__ == "__main__":
    unittest.main()
