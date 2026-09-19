import json
import os
import subprocess
import unittest

from lib.stage_c_evidence_bundle import create_stage_c_evidence_bundle
from tests.stage_c_evidence_bundle_test import SHA, fixtures


class StageCPythonJsInteropTests(unittest.TestCase):
    def test_python_generated_bundle_passes_javascript_release_and_rollback_gates(self):
        backup, storage, restore, rollback, devices = fixtures()
        # The rollback verifier models three different record sets: checkpoint existing
        # transactions, the during-window newly-created subset, and the final union.
        # Keep the interop fixture faithful to those semantics so Python and JS cannot
        # silently drift back to treating the new-only subset as the final set.
        rollback["after_records_sha256"] = "c" * 64
        bundle = create_stage_c_evidence_bundle(
            candidate_sha=SHA,
            backup_set=backup,
            backup_storage_report=storage,
            restore_report=restore,
            rollback_report=rollback,
            devices=devices,
        )

        required_rollback_fields = {
            "format",
            "verified",
            "candidate_sha",
            "rollback_application_sha",
            "rehearsal_id",
            "database_project_ref",
            "database_rollback_performed",
            "rehearsal_window_seconds",
            "checkpoint_record_count",
            "new_record_count",
            "after_record_count",
            "counts_by_kind",
            "checkpoint_records_sha256",
            "during_records_sha256",
            "after_records_sha256",
        }
        self.assertEqual(set(bundle["rollback"]), required_rollback_fields)
        self.assertEqual(len({
            bundle["rollback"]["checkpoint_records_sha256"],
            bundle["rollback"]["during_records_sha256"],
            bundle["rollback"]["after_records_sha256"],
        }), 3)

        javascript = """
import fs from 'node:fs';
import {validateStageCReleaseBundle} from './scripts/v267-stage-c-release-bundle-gate.mjs';
import {validateStageCRollbackContinuity} from './scripts/v267-stage-c-rollback-continuity.mjs';
const bundle=JSON.parse(fs.readFileSync(0,'utf8'));
const release=validateStageCReleaseBundle(bundle,process.env.CANDIDATE_SHA||'');
if(!release.ok){console.error(JSON.stringify(release.errors));process.exit(1);}
const rollback=validateStageCRollbackContinuity(bundle);
if(!rollback.ok){console.error(JSON.stringify(rollback.errors));process.exit(2);}
"""
        env = dict(os.environ)
        env["CANDIDATE_SHA"] = SHA
        completed = subprocess.run(
            ["node", "--input-type=module", "-e", javascript],
            input=json.dumps(bundle, separators=(",", ":")),
            text=True,
            capture_output=True,
            env=env,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)


if __name__ == "__main__":
    unittest.main()
