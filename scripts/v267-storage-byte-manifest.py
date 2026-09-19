#!/usr/bin/env python3
"""Create or verify AQARI V267 Storage byte manifests for Stage C evidence."""
from __future__ import annotations

import argparse
import json
import sys

from lib.storage_byte_manifest import (
    StorageByteManifestError,
    manifest_sha256,
    read_manifest,
    verify_storage_tree,
    write_manifest,
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Create a deterministic SHA-256 manifest from already-exported Storage bytes, "
            "or verify an independently restored tree against that manifest."
        )
    )
    sub = parser.add_subparsers(dest="command", required=True)
    create = sub.add_parser("create", help="hash an exported Storage tree")
    create.add_argument("root", help="root containing <bucket>/<object> files")
    create.add_argument("manifest", help="output JSON manifest path")
    verify = sub.add_parser("verify", help="verify a restored Storage tree byte-for-byte")
    verify.add_argument("root", help="independently restored <bucket>/<object> tree")
    verify.add_argument("manifest", help="expected JSON manifest path")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "create":
            payload = write_manifest(args.root, args.manifest)
            report = {
                "created": True,
                "object_count": payload["object_count"],
                "total_bytes": payload["total_bytes"],
                "manifest_sha256": manifest_sha256(payload),
            }
        else:
            payload = read_manifest(args.manifest)
            report = verify_storage_tree(args.root, payload)
    except StorageByteManifestError as exc:
        print(json.dumps({"verified": False, "error": str(exc)}, ensure_ascii=False, sort_keys=True), file=sys.stderr)
        return 2
    except OSError as exc:
        print(json.dumps({"verified": False, "error": str(exc)}, ensure_ascii=False, sort_keys=True), file=sys.stderr)
        return 2

    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
