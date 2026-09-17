"""Bind AQARI V267 Database/Auth/Storage backup artifacts into one exact-candidate evidence set.

This module does not create a Supabase backup. It hashes already-exported artifacts so Stage C can
prove that Database, Auth and Storage-byte evidence belong to one bounded capture window and the
same AQARI candidate, and can later verify an independently restored package without mixing files
from different snapshots.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re

from lib.storage_byte_manifest import manifest_sha256 as storage_manifest_sha256, read_manifest

FORMAT = "AQARI-V267-BACKUP-SET-MANIFEST-1"
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_PROJECT_REF_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,127}$")
_COMPONENTS = ("database", "auth", "storage")
MAX_CAPTURE_WINDOW_SECONDS = 300


class BackupSetManifestError(ValueError):
    """Raised when a Stage-C backup set is incomplete, mixed or inconsistent."""


def _sha256_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact(path: str | Path, label: str) -> dict:
    candidate = Path(path)
    if not candidate.is_file() or candidate.is_symlink():
        raise BackupSetManifestError(f"{label} backup artifact must be a regular file")
    size = candidate.stat().st_size
    if size <= 0:
        raise BackupSetManifestError(f"{label} backup artifact must not be empty")
    return {"bytes": size, "sha256": _sha256_file(candidate)}


def _parse_utc(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise BackupSetManifestError(f"{field} must be an ISO-8601 UTC timestamp ending in Z")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise BackupSetManifestError(f"invalid {field}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise BackupSetManifestError(f"{field} must be UTC")
    return parsed


def _canonical_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def create_backup_set(
    *,
    candidate_sha: str,
    project_ref: str,
    capture_started_at: str,
    capture_finished_at: str,
    database_path: str | Path,
    auth_path: str | Path,
    storage_manifest_path: str | Path,
    max_capture_window_seconds: int = MAX_CAPTURE_WINDOW_SECONDS,
) -> dict:
    """Create a deterministic manifest over already-exported DB/Auth/Storage evidence."""
    started = _parse_utc(capture_started_at, "capture_started_at")
    finished = _parse_utc(capture_finished_at, "capture_finished_at")
    if not _SHA_RE.fullmatch(candidate_sha or ""):
        raise BackupSetManifestError("candidate_sha must be a lowercase 40-character git SHA")
    if not _PROJECT_REF_RE.fullmatch(project_ref or ""):
        raise BackupSetManifestError("invalid staging project_ref")
    if (
        not isinstance(max_capture_window_seconds, int)
        or isinstance(max_capture_window_seconds, bool)
        or max_capture_window_seconds <= 0
        or max_capture_window_seconds > MAX_CAPTURE_WINDOW_SECONDS
    ):
        raise BackupSetManifestError(f"max_capture_window_seconds must be between 1 and {MAX_CAPTURE_WINDOW_SECONDS}")
    window = int((finished - started).total_seconds())
    if window < 0 or window > max_capture_window_seconds:
        raise BackupSetManifestError(
            f"backup capture window out of bounds: {window}s > {max_capture_window_seconds}s"
        )

    database = _artifact(database_path, "database")
    auth = _artifact(auth_path, "auth")
    storage_file = _artifact(storage_manifest_path, "storage manifest")
    resolved = [Path(database_path).resolve(), Path(auth_path).resolve(), Path(storage_manifest_path).resolve()]
    if len(set(resolved)) != len(resolved):
        raise BackupSetManifestError("database/auth/storage manifest artifacts must be distinct files")

    try:
        storage_payload = read_manifest(storage_manifest_path)
    except Exception as exc:
        raise BackupSetManifestError(f"invalid storage byte manifest: {exc}") from exc

    storage_file.update({
        "object_count": storage_payload["object_count"],
        "object_bytes": storage_payload["total_bytes"],
        "storage_manifest_sha256": storage_manifest_sha256(storage_payload),
    })
    return {
        "format": FORMAT,
        "candidate_sha": candidate_sha,
        "project_ref": project_ref,
        "capture_started_at": capture_started_at,
        "capture_finished_at": capture_finished_at,
        "capture_window_seconds": window,
        "components": {
            "database": database,
            "auth": auth,
            "storage": storage_file,
        },
    }


def validate_backup_set(payload: object) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise BackupSetManifestError("unsupported backup-set manifest format")
    candidate_sha = payload.get("candidate_sha")
    project_ref = payload.get("project_ref")
    if not isinstance(candidate_sha, str) or not _SHA_RE.fullmatch(candidate_sha):
        raise BackupSetManifestError("invalid candidate_sha")
    if not isinstance(project_ref, str) or not _PROJECT_REF_RE.fullmatch(project_ref):
        raise BackupSetManifestError("invalid project_ref")
    started = _parse_utc(payload.get("capture_started_at"), "capture_started_at")
    finished = _parse_utc(payload.get("capture_finished_at"), "capture_finished_at")
    window = int((finished - started).total_seconds())
    if window < 0 or window > MAX_CAPTURE_WINDOW_SECONDS:
        raise BackupSetManifestError("capture window exceeds the Stage-C bound")
    if payload.get("capture_window_seconds") != window:
        raise BackupSetManifestError("capture_window_seconds does not match timestamps")
    components = payload.get("components")
    if not isinstance(components, dict) or set(components) != set(_COMPONENTS):
        raise BackupSetManifestError("backup set must contain exactly database, auth and storage components")

    normalized = {}
    for name in _COMPONENTS:
        item = components.get(name)
        if not isinstance(item, dict):
            raise BackupSetManifestError(f"invalid {name} component")
        size, digest = item.get("bytes"), item.get("sha256")
        if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            raise BackupSetManifestError(f"invalid {name} byte size")
        if not isinstance(digest, str) or not _HEX64_RE.fullmatch(digest):
            raise BackupSetManifestError(f"invalid {name} sha256")
        normalized[name] = {"bytes": size, "sha256": digest}
        if name == "storage":
            count = item.get("object_count")
            object_bytes = item.get("object_bytes")
            manifest_digest = item.get("storage_manifest_sha256")
            if not isinstance(count, int) or isinstance(count, bool) or count < 0:
                raise BackupSetManifestError("invalid storage object_count")
            if not isinstance(object_bytes, int) or isinstance(object_bytes, bool) or object_bytes < 0:
                raise BackupSetManifestError("invalid storage object_bytes")
            if not isinstance(manifest_digest, str) or not _HEX64_RE.fullmatch(manifest_digest):
                raise BackupSetManifestError("invalid storage manifest sha256")
            normalized[name].update({
                "object_count": count,
                "object_bytes": object_bytes,
                "storage_manifest_sha256": manifest_digest,
            })
    return {
        "format": FORMAT,
        "candidate_sha": candidate_sha,
        "project_ref": project_ref,
        "capture_started_at": payload["capture_started_at"],
        "capture_finished_at": payload["capture_finished_at"],
        "capture_window_seconds": window,
        "components": normalized,
    }


def backup_set_sha256(payload: object) -> str:
    return sha256(_canonical_bytes(validate_backup_set(payload))).hexdigest()


def verify_backup_set(
    payload: object,
    *,
    candidate_sha: str,
    database_path: str | Path,
    auth_path: str | Path,
    storage_manifest_path: str | Path,
) -> dict:
    """Verify exact component bytes and candidate binding for an independent restore evidence set."""
    expected = validate_backup_set(payload)
    if candidate_sha != expected["candidate_sha"]:
        raise BackupSetManifestError("candidate SHA does not match backup set")
    actual = create_backup_set(
        candidate_sha=expected["candidate_sha"],
        project_ref=expected["project_ref"],
        capture_started_at=expected["capture_started_at"],
        capture_finished_at=expected["capture_finished_at"],
        database_path=database_path,
        auth_path=auth_path,
        storage_manifest_path=storage_manifest_path,
        max_capture_window_seconds=max(expected["capture_window_seconds"], 1),
    )
    for name in _COMPONENTS:
        if actual["components"][name] != expected["components"][name]:
            raise BackupSetManifestError(f"{name} backup artifact does not match backup set")
    return {
        "verified": True,
        "candidate_sha": expected["candidate_sha"],
        "project_ref": expected["project_ref"],
        "capture_window_seconds": expected["capture_window_seconds"],
        "backup_set_sha256": backup_set_sha256(expected),
    }


def write_backup_set(payload: object, destination: str | Path) -> None:
    normalized = validate_backup_set(payload)
    Path(destination).write_bytes(_canonical_bytes(normalized) + b"\n")


def read_backup_set(path: str | Path) -> dict:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BackupSetManifestError(f"cannot read backup-set manifest: {exc}") from exc
    return validate_backup_set(payload)
