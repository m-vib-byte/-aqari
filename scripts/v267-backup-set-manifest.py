#!/usr/bin/env python3
"""Create/verify an AQARI V267 Stage-C Database/Auth/Storage backup-set manifest."""
from __future__ import annotations

import argparse
import json
import sys

from lib.backup_set_manifest import (
    BackupSetManifestError,
    backup_set_sha256,
    create_backup_set,
    read_backup_set,
    verify_backup_set,
    write_backup_set,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Bind or verify exact-candidate Stage-C backup artifacts.")
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create")
    create.add_argument("--candidate-sha", required=True)
    create.add_argument("--project-ref", required=True)
    create.add_argument("--capture-started-at", required=True)
    create.add_argument("--capture-finished-at", required=True)
    create.add_argument("--database", required=True)
    create.add_argument("--auth", required=True)
    create.add_argument("--storage-manifest", required=True)
    create.add_argument("--output", required=True)
    verify = sub.add_parser("verify")
    verify.add_argument("--candidate-sha", required=True)
    verify.add_argument("--manifest", required=True)
    verify.add_argument("--database", required=True)
    verify.add_argument("--auth", required=True)
    verify.add_argument("--storage-manifest", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "create":
            payload = create_backup_set(
                candidate_sha=args.candidate_sha,
                project_ref=args.project_ref,
                capture_started_at=args.capture_started_at,
                capture_finished_at=args.capture_finished_at,
                database_path=args.database,
                auth_path=args.auth,
                storage_manifest_path=args.storage_manifest,
            )
            write_backup_set(payload, args.output)
            report = {
                "created": True,
                "candidate_sha": payload["candidate_sha"],
                "project_ref": payload["project_ref"],
                "capture_window_seconds": payload["capture_window_seconds"],
                "backup_set_sha256": backup_set_sha256(payload),
            }
        else:
            payload = read_backup_set(args.manifest)
            report = verify_backup_set(
                payload,
                candidate_sha=args.candidate_sha,
                database_path=args.database,
                auth_path=args.auth,
                storage_manifest_path=args.storage_manifest,
            )
    except (BackupSetManifestError, OSError) as exc:
        print(json.dumps({"verified": False, "error": str(exc)}, ensure_ascii=False, sort_keys=True), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
