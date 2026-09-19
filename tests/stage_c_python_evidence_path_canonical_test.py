import unittest

from lib.stage_c_evidence_bundle import StageCEvidenceError, create_stage_c_evidence_bundle
from tests.stage_c_evidence_bundle_test import SHA, fixtures


def _refresh_aggregate(devices, device_class="desktop"):
    devices[device_class]["evidence"] = sorted(
        ref
        for refs in devices[device_class]["flow_evidence"].values()
        for ref in refs
    )


class StageCPythonEvidencePathCanonicalTests(unittest.TestCase):
    def test_rejects_noncanonical_or_ambiguous_device_evidence_paths(self):
        bad_refs = (
            " evidence/desktop/login.json",
            "evidence/desktop/login.json ",
            "evidence/desktop/%2e%2e/login.json",
            "evidence/desktop/../login.json",
            "evidence/desktop/./login.json",
            "evidence/desktop//login.json",
            "evidence\\desktop\\login.json",
            "evidence/desktop/login.json?raw=1",
            "evidence/desktop/login.json#fragment",
            "evidence/desktop/\nlogin.json",
            "evidence/desktop/\u202elogin.json",
            "https://example.com/evidence/login.json",
        )
        for ref in bad_refs:
            with self.subTest(ref=repr(ref)):
                backup, storage, restore, rollback, devices = fixtures()
                devices["desktop"]["flow_evidence"]["login"] = [ref]
                _refresh_aggregate(devices)
                with self.assertRaisesRegex(StageCEvidenceError, "evidence reference"):
                    create_stage_c_evidence_bundle(
                        candidate_sha=SHA,
                        backup_set=backup,
                        backup_storage_report=storage,
                        restore_report=restore,
                        rollback_report=rollback,
                        devices=devices,
                    )

    def test_accepts_normal_unicode_evidence_path(self):
        backup, storage, restore, rollback, devices = fixtures()
        ref = "evidence/desktop/تسجيل-الدخول.json"
        devices["desktop"]["flow_evidence"]["login"] = [ref]
        _refresh_aggregate(devices)
        bundle = create_stage_c_evidence_bundle(
            candidate_sha=SHA,
            backup_set=backup,
            backup_storage_report=storage,
            restore_report=restore,
            rollback_report=rollback,
            devices=devices,
        )
        self.assertEqual(bundle["devices"]["desktop"]["flow_evidence"]["login"], [ref])
        self.assertIn(ref, bundle["devices"]["desktop"]["evidence"])


if __name__ == "__main__":
    unittest.main()
