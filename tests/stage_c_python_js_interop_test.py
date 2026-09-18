import json
import os
import subprocess
import unittest

from lib.stage_c_evidence_bundle import create_stage_c_evidence_bundle
from tests.stage_c_evidence_bundle_test import SHA, fixtures


class StageCPythonJsInteropTests(unittest.TestCase):
    def test_python_generated_bundle_passes_javascript_release_gate(self):
        backup, storage, restore, rollback, devices = fixtures()
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

        javascript = """
import fs from 'node:fs';
import {validateStageCReleaseBundle} from './scripts/v267-stage-c-release-bundle-gate.mjs';
const bundle=JSON.parse(fs.readFileSync(0,'utf8'));
const result=validateStageCReleaseBundle(bundle,process.env.CANDIDATE_SHA||'');
if(!result.ok){console.error(JSON.stringify(result.errors));process.exit(1);}
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
