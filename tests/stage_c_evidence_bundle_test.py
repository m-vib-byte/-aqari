import copy
import unittest

from lib.backup_set_manifest import FORMAT as BACKUP_FORMAT
from lib.stage_c_evidence_bundle import StageCEvidenceError, create_stage_c_evidence_bundle
from lib.storage_byte_manifest import FORMAT as STORAGE_FORMAT
from lib.restore_equivalence import FORMAT as RESTORE_FORMAT
from lib.rollback_rehearsal import REPORT_FORMAT as ROLLBACK_FORMAT

SHA = "1" * 40
ROLLBACK_SHA = "2" * 40
REHEARSAL_ID = "3" * 32
H = "a" * 64
H2 = "b" * 64
SOURCE = "ofgmcsmxmdswlovsckqs"
RESTORE = "djkpkkgoibruaezdrchb"
PREVIEW_DEPLOYMENT = "dpl_AqariExactPreview123"
PREVIEW_URL = "https://aqari-exact-preview-123.vercel.app"
REQUIRED_FLOWS = ("login", "session", "save", "reopen", "permissions", "contracts", "printing")


def fixtures():
    backup = {
        "format": BACKUP_FORMAT,
        "candidate_sha": SHA,
        "project_ref": SOURCE,
        "capture_started_at": "2026-09-17T06:00:00Z",
        "capture_finished_at": "2026-09-17T06:00:30Z",
        "capture_window_seconds": 30,
        "components": {
            "database": {"bytes": 1000, "sha256": H},
            "auth": {"bytes": 200, "sha256": H2},
            "storage": {
                "bytes": 300,
                "sha256": H,
                "object_count": 2,
                "object_bytes": 156509,
                "storage_manifest_sha256": H2,
            },
        },
    }
    storage = {
        "format": STORAGE_FORMAT,
        "verified": True,
        "object_count": 2,
        "total_bytes": 156509,
        "manifest_sha256": H2,
    }
    restore = {
        "format": RESTORE_FORMAT,
        "verified": True,
        "candidate_sha": SHA,
        "source_project_ref": SOURCE,
        "restore_project_ref": RESTORE,
        "section_sha256": {
            "business": H,
            "schema_safe": H2,
            "auth_safe": H,
            "storage_safe": H2,
        },
        "storage_object_count": 2,
        "storage_total_bytes": 156509,
        "storage_manifest_sha256": H2,
    }
    rollback = {
        "format": ROLLBACK_FORMAT,
        "verified": True,
        "candidate_sha": SHA,
        "rollback_application_sha": ROLLBACK_SHA,
        "rehearsal_id": REHEARSAL_ID,
        "database_project_ref": SOURCE,
        "database_rollback_performed": False,
        "rehearsal_window_seconds": 180,
        "checkpoint_record_count": 10,
        "new_record_count": 2,
        "after_record_count": 12,
        "counts_by_kind": {"payment": 7, "receipt": 5},
        "checkpoint_records_sha256": H,
        "during_records_sha256": H2,
        "after_records_sha256": H,
    }
    devices = {}
    for cls, instance, browser in (
        ("desktop", "desktop-hardware-01", "Chrome"),
        ("iphone", "iphone-hardware-01", "Safari"),
        ("ipad", "ipad-hardware-01", "Safari"),
    ):
        flow_evidence = {flow: [f"evidence/{cls}/{flow}.json"] for flow in REQUIRED_FLOWS}
        devices[cls] = {
            "accepted": True,
            "real_account": True,
            "simulated": False,
            "emulated": False,
            "physical": True,
            "candidate_sha": SHA,
            "preview_deployment_id": PREVIEW_DEPLOYMENT,
            "preview_url": PREVIEW_URL,
            "device_instance": instance,
            "browser": browser,
            "flows": {name: True for name in REQUIRED_FLOWS},
            "flow_evidence": flow_evidence,
            "evidence": sorted(ref for refs in flow_evidence.values() for ref in refs),
        }
    return backup, storage, restore, rollback, devices


class StageCEvidenceBundleTests(unittest.TestCase):
    def test_accepts_only_cross_bound_exact_candidate_evidence(self):
        bundle = create_stage_c_evidence_bundle(
            candidate_sha=SHA,
            backup_set=fixtures()[0],
            backup_storage_report=fixtures()[1],
            restore_report=fixtures()[2],
            rollback_report=fixtures()[3],
            devices=fixtures()[4],
        )
        self.assertTrue(bundle["accepted"])
        self.assertEqual(bundle["candidate_sha"], SHA)
        self.assertEqual(bundle["source_project_ref"], SOURCE)
        self.assertEqual(bundle["restore_project_ref"], RESTORE)
        self.assertEqual(bundle["preview"]["deployment_id"], PREVIEW_DEPLOYMENT)
        self.assertEqual(bundle["preview"]["url"], PREVIEW_URL)
        self.assertEqual(bundle["preview"]["environment"], "preview")
        self.assertEqual(bundle["preview"]["release_stage"], "preview")
        self.assertEqual(bundle["storage"]["total_bytes"], 156509)
        self.assertEqual(bundle["rollback"]["rehearsal_id"], REHEARSAL_ID)
        self.assertEqual(bundle["rollback"]["after_record_count"], 12)
        self.assertEqual(set(bundle["devices"]["desktop"]["flow_evidence"]), set(REQUIRED_FLOWS))
        self.assertEqual(len(bundle["devices"]["desktop"]["evidence"]), len(REQUIRED_FLOWS))
        self.assertEqual(len(bundle["bundle_sha256"]), 64)

    def test_rejects_storage_byte_evidence_that_does_not_match_backup_set(self):
        backup, storage, restore, rollback, devices = fixtures()
        storage["manifest_sha256"] = H
        with self.assertRaisesRegex(StageCEvidenceError, "Storage byte manifest"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_restore_from_wrong_source_or_same_project(self):
        backup, storage, restore, rollback, devices = fixtures()
        restore["source_project_ref"] = "otherproject123"
        with self.assertRaisesRegex(StageCEvidenceError, "source project"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)
        backup, storage, restore, rollback, devices = fixtures()
        restore["restore_project_ref"] = SOURCE
        with self.assertRaisesRegex(StageCEvidenceError, "must differ"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_rollback_that_loses_new_transactions_or_rolls_back_database(self):
        backup, storage, restore, rollback, devices = fixtures()
        rollback["after_record_count"] = 11
        with self.assertRaisesRegex(StageCEvidenceError, "checkpoint plus new"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)
        backup, storage, restore, rollback, devices = fixtures()
        rollback["database_rollback_performed"] = True
        with self.assertRaisesRegex(StageCEvidenceError, "avoid database rollback"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_rollback_without_canonical_rehearsal_identity(self):
        for value in (None, "bad", REHEARSAL_ID.upper()):
            with self.subTest(rehearsal_id=value):
                backup, storage, restore, rollback, devices = fixtures()
                if value is None:
                    rollback.pop("rehearsal_id")
                else:
                    rollback["rehearsal_id"] = value
                with self.assertRaisesRegex(StageCEvidenceError, "rehearsal_id"):
                    create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_empty_rollback_rehearsal_that_does_not_prove_old_and_new_transactions(self):
        backup, storage, restore, rollback, devices = fixtures()
        rollback["checkpoint_record_count"] = 0
        rollback["after_record_count"] = rollback["new_record_count"]
        rollback["counts_by_kind"] = {"payment": 2}
        with self.assertRaisesRegex(StageCEvidenceError, "pre-existing transaction"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

        backup, storage, restore, rollback, devices = fixtures()
        rollback["new_record_count"] = 0
        rollback["after_record_count"] = rollback["checkpoint_record_count"]
        rollback["counts_by_kind"] = {"payment": 5, "receipt": 5}
        with self.assertRaisesRegex(StageCEvidenceError, "newly created transaction"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_simulated_or_nonphysical_device_acceptance(self):
        for mutate in (
            lambda devices: devices["iphone"].update(simulated=True),
            lambda devices: devices["ipad"].update(physical=False),
            lambda devices: devices["desktop"]["flows"].update(printing=False),
        ):
            backup, storage, restore, rollback, devices = fixtures()
            mutate(devices)
            with self.assertRaises(StageCEvidenceError):
                create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_device_evidence_from_mixed_or_non_preview_deployments(self):
        mutations = (
            lambda devices: devices["iphone"].update(preview_deployment_id="dpl_DifferentPreview456"),
            lambda devices: devices["ipad"].update(preview_url="https://aqari-other-preview.vercel.app"),
            lambda devices: devices["desktop"].update(preview_url="https://myaqari.com"),
        )
        for mutate in mutations:
            backup, storage, restore, rollback, devices = fixtures()
            mutate(devices)
            with self.assertRaisesRegex(StageCEvidenceError, "Preview|preview|same hosted"):
                create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_missing_reused_or_aggregate_only_device_flow_evidence(self):
        mutations = (
            lambda devices: devices["ipad"]["flow_evidence"].pop("printing"),
            lambda devices: devices["iphone"]["flow_evidence"].update(session=devices["iphone"]["flow_evidence"]["login"]),
            lambda devices: devices["ipad"]["flow_evidence"].update(login=devices["iphone"]["flow_evidence"]["login"]),
            lambda devices: devices["desktop"].update(evidence=devices["desktop"]["evidence"][:-1]),
        )
        for mutate in mutations:
            backup, storage, restore, rollback, devices = fixtures()
            mutate(devices)
            with self.assertRaisesRegex(StageCEvidenceError, "evidence|Evidence"):
                create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)

    def test_rejects_mixed_candidate_sha(self):
        backup, storage, restore, rollback, devices = fixtures()
        restore["candidate_sha"] = "3" * 40
        with self.assertRaisesRegex(StageCEvidenceError, "exact candidate"):
            create_stage_c_evidence_bundle(candidate_sha=SHA, backup_set=backup, backup_storage_report=storage, restore_report=restore, rollback_report=rollback, devices=devices)


if __name__ == "__main__":
    unittest.main()
