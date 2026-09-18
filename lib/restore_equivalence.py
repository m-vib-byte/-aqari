"""Verify AQARI V267 independent restore equivalence without performing a restore.

The verifier compares source and restored DATA-SAFETY-MANIFEST-3 payloads while ignoring only
volatile report metadata, binds the source Storage byte manifest to the source data-safety metadata,
and separately proves restored Storage object bytes against that exact source byte manifest. It is
verification tooling only: it does not create a backup or a restore.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re

from lib.storage_byte_manifest import StorageByteManifestError, manifest_sha256, read_manifest, verify_storage_tree

FORMAT = "AQARI-V267-RESTORE-EQUIVALENCE-1"
DATA_SAFETY_FORMAT = "AQARI-V267-DATA-SAFETY-MANIFEST-3"
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_PROJECT_REF_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,127}$")
_SECTIONS = ("business", "schema_safe", "auth_safe", "storage_safe")


class RestoreEquivalenceError(ValueError):
    """Raised when restore evidence is not independent, complete, or equivalent."""


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _section_sha256(value: object) -> str:
    return sha256(_canonical_bytes(value)).hexdigest()


def _validate_project_ref(value: object, field: str) -> str:
    if not isinstance(value, str) or not _PROJECT_REF_RE.fullmatch(value):
        raise RestoreEquivalenceError(f"invalid {field}")
    return value


def _parse_manifest_time(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise RestoreEquivalenceError(f"{field} must be an ISO-8601 UTC timestamp")
    raw = value.strip()
    normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise RestoreEquivalenceError(f"invalid {field}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise RestoreEquivalenceError(f"{field} must be UTC")
    return parsed


def _non_negative_int(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise RestoreEquivalenceError(f"{field} must be a non-negative integer")
    return value


def validate_data_safety_manifest(payload: object, label: str) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != DATA_SAFETY_FORMAT:
        raise RestoreEquivalenceError(f"{label} must use {DATA_SAFETY_FORMAT}")
    missing = [name for name in _SECTIONS if name not in payload]
    if missing:
        raise RestoreEquivalenceError(f"{label} missing sections: {', '.join(missing)}")
    normalized = {name: payload[name] for name in _SECTIONS}
    for name, value in normalized.items():
        if not isinstance(value, dict):
            raise RestoreEquivalenceError(f"{label} section {name} must be an object")
    return normalized


def _read_data_safety_payload(path: str | Path, label: str) -> dict:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RestoreEquivalenceError(f"cannot read {label}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RestoreEquivalenceError(f"{label} must be a JSON object")
    return payload


def read_data_safety_manifest(path: str | Path, label: str) -> dict:
    payload = _read_data_safety_payload(path, label)
    return validate_data_safety_manifest(payload, label)


def _bind_storage_manifest_to_data_safety(storage_manifest: dict, storage_safe: dict) -> None:
    expected_objects = _non_negative_int(storage_safe.get("objects"), "source storage_safe.objects")
    expected_bytes = _non_negative_int(storage_safe.get("bytes_reported"), "source storage_safe.bytes_reported")
    if storage_manifest["object_count"] != expected_objects:
        raise RestoreEquivalenceError(
            "source Storage byte manifest object_count does not match data-safety Storage metadata"
        )
    if storage_manifest["total_bytes"] != expected_bytes:
        raise RestoreEquivalenceError(
            "source Storage byte manifest total_bytes does not match data-safety Storage metadata"
        )


def verify_restore_equivalence(
    *,
    candidate_sha: str,
    source_project_ref: str,
    restore_project_ref: str,
    source_data_safety_path: str | Path,
    restored_data_safety_path: str | Path,
    source_storage_manifest_path: str | Path,
    restored_storage_root: str | Path,
) -> dict:
    """Compare independent restored state to the source backup-point evidence."""
    if not isinstance(candidate_sha, str) or not _SHA_RE.fullmatch(candidate_sha):
        raise RestoreEquivalenceError("candidate_sha must be a lowercase 40-character git SHA")
    source_ref = _validate_project_ref(source_project_ref, "source_project_ref")
    restore_ref = _validate_project_ref(restore_project_ref, "restore_project_ref")
    if source_ref == restore_ref:
        raise RestoreEquivalenceError("restore_project_ref must differ from source_project_ref")

    source_manifest_path = Path(source_data_safety_path).resolve()
    restored_manifest_path = Path(restored_data_safety_path).resolve()
    if source_manifest_path == restored_manifest_path:
        raise RestoreEquivalenceError("restored data-safety manifest must be independently generated")

    source_payload = _read_data_safety_payload(source_manifest_path, "source data-safety manifest")
    restored_payload = _read_data_safety_payload(restored_manifest_path, "restored data-safety manifest")
    source_generated_at = _parse_manifest_time(source_payload.get("generated_at"), "source generated_at")
    restored_generated_at = _parse_manifest_time(restored_payload.get("generated_at"), "restored generated_at")
    if restored_generated_at <= source_generated_at:
        raise RestoreEquivalenceError("restored data-safety manifest must be generated after the source manifest")

    source = validate_data_safety_manifest(source_payload, "source data-safety manifest")
    restored = validate_data_safety_manifest(restored_payload, "restored data-safety manifest")

    section_hashes: dict[str, str] = {}
    for name in _SECTIONS:
        source_hash = _section_sha256(source[name])
        restored_hash = _section_sha256(restored[name])
        if source_hash != restored_hash:
            raise RestoreEquivalenceError(f"restored {name} does not match source")
        section_hashes[name] = source_hash

    try:
        storage_manifest = read_manifest(source_storage_manifest_path)
        _bind_storage_manifest_to_data_safety(storage_manifest, source["storage_safe"])
        storage_report = verify_storage_tree(restored_storage_root, storage_manifest)
    except RestoreEquivalenceError:
        raise
    except (StorageByteManifestError, OSError, json.JSONDecodeError) as exc:
        raise RestoreEquivalenceError(f"restored Storage bytes do not match source: {exc}") from exc

    return {
        "format": FORMAT,
        "verified": True,
        "candidate_sha": candidate_sha,
        "source_project_ref": source_ref,
        "restore_project_ref": restore_ref,
        "source_generated_at": source_payload["generated_at"],
        "restored_generated_at": restored_payload["generated_at"],
        "section_sha256": section_hashes,
        "storage_object_count": storage_report["object_count"],
        "storage_total_bytes": storage_report["total_bytes"],
        "storage_manifest_sha256": manifest_sha256(storage_manifest),
    }
