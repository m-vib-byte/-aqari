"""Verify AQARI V267 application rollback rehearsal continuity without performing a rollback.

The verifier is intentionally data-only: it proves that an application-only rollback rehearsal
keeps the same database project, preserves every transaction that existed at the checkpoint,
preserves every declared transaction created during the rehearsal window, and returns the
application to the exact candidate SHA. It does not execute a deployment, database restore,
or rollback.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re

FORMAT = "AQARI-V267-ROLLBACK-CONTINUITY-1"
REPORT_FORMAT = "AQARI-V267-ROLLBACK-REHEARSAL-1"
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_PROJECT_REF_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,127}$")
_KIND_RE = re.compile(r"^[a-z][a-z0-9_.-]{1,63}$")
_UTC_SECOND_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
MAX_REHEARSAL_WINDOW_SECONDS = 3600


class RollbackRehearsalError(ValueError):
    """Raised when rollback continuity evidence is incomplete or unsafe."""


def _parse_utc(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not _UTC_SECOND_RE.fullmatch(value):
        raise RollbackRehearsalError(
            f"{field} must use canonical UTC seconds format YYYY-MM-DDTHH:MM:SSZ"
        )
    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise RollbackRehearsalError(f"invalid {field}") from exc
    return parsed


def _require_sha(value: object, field: str) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        raise RollbackRehearsalError(f"{field} must be a lowercase 40-character git SHA")
    return value


def _canonical_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _record_key(record: dict) -> tuple[str, str]:
    return record["kind"], record["record_key_sha256"]


def validate_continuity_manifest(payload: object, label: str) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise RollbackRehearsalError(f"{label} must use {FORMAT}")
    project_ref = payload.get("project_ref")
    if not isinstance(project_ref, str) or not _PROJECT_REF_RE.fullmatch(project_ref):
        raise RollbackRehearsalError(f"{label} has invalid project_ref")
    application_sha = _require_sha(payload.get("application_sha"), f"{label}.application_sha")
    captured_at = payload.get("captured_at")
    _parse_utc(captured_at, f"{label}.captured_at")
    records = payload.get("records")
    if not isinstance(records, list):
        raise RollbackRehearsalError(f"{label}.records must be an array")

    normalized_records = []
    seen = set()
    for index, raw in enumerate(records):
        if not isinstance(raw, dict):
            raise RollbackRehearsalError(f"{label}.records[{index}] must be an object")
        kind = raw.get("kind")
        key_hash = raw.get("record_key_sha256")
        immutable_hash = raw.get("immutable_sha256")
        if not isinstance(kind, str) or not _KIND_RE.fullmatch(kind):
            raise RollbackRehearsalError(f"{label}.records[{index}] has invalid kind")
        if not isinstance(key_hash, str) or not _HEX64_RE.fullmatch(key_hash):
            raise RollbackRehearsalError(f"{label}.records[{index}] has invalid record_key_sha256")
        if not isinstance(immutable_hash, str) or not _HEX64_RE.fullmatch(immutable_hash):
            raise RollbackRehearsalError(f"{label}.records[{index}] has invalid immutable_sha256")
        key = (kind, key_hash)
        if key in seen:
            raise RollbackRehearsalError(f"{label} contains duplicate transaction identity")
        seen.add(key)
        normalized_records.append({
            "kind": kind,
            "record_key_sha256": key_hash,
            "immutable_sha256": immutable_hash,
        })

    normalized_records.sort(key=lambda row: (row["kind"], row["record_key_sha256"]))
    expected_count = payload.get("record_count")
    if expected_count != len(normalized_records):
        raise RollbackRehearsalError(f"{label}.record_count does not match records")
    expected_digest = payload.get("records_sha256")
    actual_digest = sha256(_canonical_bytes(normalized_records)).hexdigest()
    if expected_digest != actual_digest:
        raise RollbackRehearsalError(f"{label}.records_sha256 does not match records")

    return {
        "format": FORMAT,
        "project_ref": project_ref,
        "application_sha": application_sha,
        "captured_at": captured_at,
        "record_count": len(normalized_records),
        "records_sha256": actual_digest,
        "records": normalized_records,
    }


def create_continuity_manifest(
    *,
    project_ref: str,
    application_sha: str,
    captured_at: str,
    records: list[dict],
) -> dict:
    payload = {
        "format": FORMAT,
        "project_ref": project_ref,
        "application_sha": application_sha,
        "captured_at": captured_at,
        "record_count": len(records),
        "records_sha256": "",
        "records": records,
    }
    normalized_seed = []
    for record in records:
        if isinstance(record, dict):
            normalized_seed.append({
                "kind": record.get("kind"),
                "record_key_sha256": record.get("record_key_sha256"),
                "immutable_sha256": record.get("immutable_sha256"),
            })
        else:
            normalized_seed.append(record)
    try:
        normalized_seed.sort(key=lambda row: (row["kind"], row["record_key_sha256"]))
        payload["records_sha256"] = sha256(_canonical_bytes(normalized_seed)).hexdigest()
    except Exception as exc:
        raise RollbackRehearsalError(f"invalid records: {exc}") from exc
    return validate_continuity_manifest(payload, "continuity manifest")


def read_continuity_manifest(path: str | Path, label: str) -> dict:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RollbackRehearsalError(f"cannot read {label}: {exc}") from exc
    return validate_continuity_manifest(payload, label)


def verify_rollback_rehearsal(
    *,
    candidate_sha: str,
    rollback_application_sha: str,
    checkpoint_manifest_path: str | Path,
    during_manifest_path: str | Path,
    after_manifest_path: str | Path,
    database_rollback_performed: bool,
) -> dict:
    """Verify a data-preserving application-only rollback rehearsal."""
    candidate_sha = _require_sha(candidate_sha, "candidate_sha")
    rollback_application_sha = _require_sha(rollback_application_sha, "rollback_application_sha")
    if rollback_application_sha == candidate_sha:
        raise RollbackRehearsalError("rollback_application_sha must differ from candidate_sha")
    if database_rollback_performed is not False:
        raise RollbackRehearsalError("database rollback must not be performed during application rollback rehearsal")

    checkpoint = read_continuity_manifest(checkpoint_manifest_path, "checkpoint manifest")
    during = read_continuity_manifest(during_manifest_path, "during-window manifest")
    after = read_continuity_manifest(after_manifest_path, "after-rehearsal manifest")

    if checkpoint["application_sha"] != candidate_sha:
        raise RollbackRehearsalError("checkpoint manifest application_sha must match candidate_sha")
    if during["application_sha"] != rollback_application_sha:
        raise RollbackRehearsalError(
            "during-window manifest application_sha must match rollback_application_sha"
        )
    if after["application_sha"] != candidate_sha:
        raise RollbackRehearsalError("after-rehearsal manifest application_sha must match candidate_sha")

    refs = {checkpoint["project_ref"], during["project_ref"], after["project_ref"]}
    if len(refs) != 1:
        raise RollbackRehearsalError("all rollback continuity manifests must use the same database project_ref")

    checkpoint_at = _parse_utc(checkpoint["captured_at"], "checkpoint captured_at")
    during_at = _parse_utc(during["captured_at"], "during-window captured_at")
    after_at = _parse_utc(after["captured_at"], "after-rehearsal captured_at")
    if not (checkpoint_at <= during_at <= after_at):
        raise RollbackRehearsalError("rollback evidence timestamps are out of order")
    window_seconds = (after_at - checkpoint_at).total_seconds()
    if window_seconds < 0 or window_seconds > MAX_REHEARSAL_WINDOW_SECONDS:
        raise RollbackRehearsalError(
            f"rollback rehearsal window exceeds {MAX_REHEARSAL_WINDOW_SECONDS} seconds"
        )
    window = int(window_seconds)

    checkpoint_map = {_record_key(row): row["immutable_sha256"] for row in checkpoint["records"]}
    during_map = {_record_key(row): row["immutable_sha256"] for row in during["records"]}
    after_map = {_record_key(row): row["immutable_sha256"] for row in after["records"]}

    if not checkpoint_map:
        raise RollbackRehearsalError("checkpoint manifest must contain at least one pre-existing transaction")
    if not during_map:
        raise RollbackRehearsalError("during-window manifest must contain at least one newly created transaction")

    overlap = set(checkpoint_map) & set(during_map)
    if overlap:
        raise RollbackRehearsalError("during-window manifest must contain only newly created transactions")

    expected_after = dict(checkpoint_map)
    expected_after.update(during_map)
    if set(after_map) != set(expected_after):
        missing = len(set(expected_after) - set(after_map))
        unexpected = len(set(after_map) - set(expected_after))
        raise RollbackRehearsalError(
            f"after-rehearsal transaction set mismatch: missing={missing}, unexpected={unexpected}"
        )

    mutated = [key for key, digest in expected_after.items() if after_map[key] != digest]
    if mutated:
        raise RollbackRehearsalError(f"immutable transaction facts changed for {len(mutated)} record(s)")

    counts_by_kind: dict[str, int] = {}
    for kind, _ in after_map:
        counts_by_kind[kind] = counts_by_kind.get(kind, 0) + 1

    return {
        "format": REPORT_FORMAT,
        "verified": True,
        "candidate_sha": candidate_sha,
        "rollback_application_sha": rollback_application_sha,
        "database_project_ref": checkpoint["project_ref"],
        "database_rollback_performed": False,
        "rehearsal_window_seconds": window,
        "checkpoint_record_count": len(checkpoint_map),
        "new_record_count": len(during_map),
        "after_record_count": len(after_map),
        "counts_by_kind": dict(sorted(counts_by_kind.items())),
        "checkpoint_records_sha256": checkpoint["records_sha256"],
        "during_records_sha256": during["records_sha256"],
        "after_records_sha256": after["records_sha256"],
    }
