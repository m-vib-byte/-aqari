"""Cross-bind AQARI V267 Stage-C acceptance evidence to one exact Preview candidate.

This module is verification-only. It does not create backups, restore databases, perform a
rollback, run devices, deploy Production, or grant owner approval. It only refuses to mark Stage C
accepted unless independently produced backup, Storage-byte, restore, rollback and physical-device
evidence all agree on the same candidate and source data project.
"""
from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from urllib.parse import urlsplit

from lib.backup_set_manifest import backup_set_sha256, validate_backup_set

FORMAT = "AQARI-V267-STAGE-C-EVIDENCE-1"
STORAGE_FORMAT = "AQARI-V267-STORAGE-BYTE-MANIFEST-1"
RESTORE_FORMAT = "AQARI-V267-RESTORE-EQUIVALENCE-1"
ROLLBACK_FORMAT = "AQARI-V267-ROLLBACK-REHEARSAL-1"
_SHA_RE = re.compile(r"^[0-9a-f]{40}$")
_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_REHEARSAL_ID_RE = re.compile(r"^[0-9a-f]{32}$")
_PROJECT_REF_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{2,127}$")
_DEPLOYMENT_ID_RE = re.compile(r"^dpl_[A-Za-z0-9]+$")
_UTC_SECOND_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
_UNSAFE_EVIDENCE_PATH_RE = re.compile(r"[%\x00-\x1F\x7F-\x9F\u202A-\u202E\u2066-\u2069]")
REQUIRED_FLOWS = ("login", "session", "save", "reopen", "permissions", "contracts", "printing")
DEVICE_CLASSES = ("desktop", "iphone", "ipad")


class StageCEvidenceError(ValueError):
    """Raised when Stage-C evidence is incomplete, simulated, stale or cross-candidate."""


def _canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _digest(value: object) -> str:
    return sha256(_canonical(value)).hexdigest()


def _sha(value: object, field: str) -> str:
    if not isinstance(value, str) or not _SHA_RE.fullmatch(value):
        raise StageCEvidenceError(f"{field} must be a lowercase 40-character git SHA")
    return value


def _hex64(value: object, field: str) -> str:
    if not isinstance(value, str) or not _HEX64_RE.fullmatch(value):
        raise StageCEvidenceError(f"{field} must be a lowercase SHA-256 digest")
    return value


def _rehearsal_id(value: object, field: str) -> str:
    if not isinstance(value, str) or not _REHEARSAL_ID_RE.fullmatch(value):
        raise StageCEvidenceError(f"{field} must be a lowercase 32-character hexadecimal rehearsal id")
    return value


def _project_ref(value: object, field: str) -> str:
    if not isinstance(value, str) or not _PROJECT_REF_RE.fullmatch(value):
        raise StageCEvidenceError(f"invalid {field}")
    return value


def _deployment_id(value: object, field: str) -> str:
    if not isinstance(value, str) or not _DEPLOYMENT_ID_RE.fullmatch(value.strip()):
        raise StageCEvidenceError(f"invalid {field}")
    return value.strip()


def _preview_url(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise StageCEvidenceError(f"invalid {field}")
    raw = value.strip()
    try:
        parsed = urlsplit(raw)
    except ValueError as exc:
        raise StageCEvidenceError(f"invalid {field}") from exc
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
        or not parsed.hostname.endswith(".vercel.app")
    ):
        raise StageCEvidenceError(f"{field} must be an immutable HTTPS vercel.app Preview URL")
    return f"https://{parsed.hostname}"


def _utc_second(value: object, field: str) -> tuple[str, datetime]:
    if not isinstance(value, str) or not _UTC_SECOND_RE.fullmatch(value):
        raise StageCEvidenceError(f"{field} must use canonical UTC second precision YYYY-MM-DDTHH:MM:SSZ")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise StageCEvidenceError(f"invalid {field}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise StageCEvidenceError(f"{field} must be UTC")
    return value, parsed


def _non_negative_int(value: object, field: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise StageCEvidenceError(f"{field} must be a non-negative integer")
    return value


def _evidence_refs(value: object, field: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise StageCEvidenceError(f"{field} must contain at least one evidence reference")
    refs: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str) or not item or item.strip() != item:
            raise StageCEvidenceError(f"{field} contains an invalid evidence reference")
        ref = item
        segments = ref.split("/")
        if (
            not ref.startswith("evidence/")
            or ref.startswith("/")
            or "://" in ref
            or "\\" in ref
            or "?" in ref
            or "#" in ref
            or _UNSAFE_EVIDENCE_PATH_RE.search(ref)
            or any(not segment or segment in (".", "..") for segment in segments)
        ):
            raise StageCEvidenceError(f"{field} contains a non-canonical evidence reference")
        if ref in seen:
            raise StageCEvidenceError(f"{field} contains a duplicate evidence reference")
        seen.add(ref)
        refs.append(ref)
    return sorted(refs)


def _validate_backup_storage_report(report: object, backup: dict) -> dict:
    if not isinstance(report, dict) or report.get("format") != STORAGE_FORMAT or report.get("verified") is not True:
        raise StageCEvidenceError("backup Storage bytes must have a successful byte-verification report")
    count = _non_negative_int(report.get("object_count"), "backup Storage object_count")
    total = _non_negative_int(report.get("total_bytes"), "backup Storage total_bytes")
    digest = _hex64(report.get("manifest_sha256"), "backup Storage manifest_sha256")
    expected = backup["components"]["storage"]
    if count != expected["object_count"] or total != expected["object_bytes"]:
        raise StageCEvidenceError("backup Storage byte counts do not match the backup set")
    if digest != expected["storage_manifest_sha256"]:
        raise StageCEvidenceError("backup Storage byte manifest does not match the backup set")
    return {
        "format": STORAGE_FORMAT,
        "verified": True,
        "object_count": count,
        "total_bytes": total,
        "manifest_sha256": digest,
    }


def _validate_restore(report: object, candidate_sha: str, backup: dict) -> dict:
    if not isinstance(report, dict) or report.get("format") != RESTORE_FORMAT or report.get("verified") is not True:
        raise StageCEvidenceError("independent restore equivalence must be verified")
    if _sha(report.get("candidate_sha"), "restore candidate_sha") != candidate_sha:
        raise StageCEvidenceError("restore evidence is not tied to the exact candidate SHA")
    source = _project_ref(report.get("source_project_ref"), "restore source_project_ref")
    restored = _project_ref(report.get("restore_project_ref"), "restore restore_project_ref")
    if source != backup["project_ref"]:
        raise StageCEvidenceError("restore source project does not match the backup source project")
    if restored == source:
        raise StageCEvidenceError("independent restore project must differ from the source project")
    source_generated_at, source_generated_time = _utc_second(
        report.get("source_generated_at"), "restore source_generated_at"
    )
    restored_generated_at, restored_generated_time = _utc_second(
        report.get("restored_generated_at"), "restore restored_generated_at"
    )
    if restored_generated_time <= source_generated_time:
        raise StageCEvidenceError("restored data-safety evidence must be generated after the source evidence")
    section_hashes = report.get("section_sha256")
    required_sections = {"business", "schema_safe", "auth_safe", "storage_safe"}
    if not isinstance(section_hashes, dict) or set(section_hashes) != required_sections:
        raise StageCEvidenceError("restore section hashes are incomplete")
    normalized_sections = {
        name: _hex64(section_hashes[name], f"restore {name} hash")
        for name in sorted(required_sections)
    }
    count = _non_negative_int(report.get("storage_object_count"), "restored Storage object_count")
    total = _non_negative_int(report.get("storage_total_bytes"), "restored Storage total_bytes")
    manifest_digest = _hex64(report.get("storage_manifest_sha256"), "restored Storage manifest_sha256")
    expected = backup["components"]["storage"]
    if count != expected["object_count"] or total != expected["object_bytes"] or manifest_digest != expected["storage_manifest_sha256"]:
        raise StageCEvidenceError("restored Storage bytes do not match the exact backup set")
    return {
        "format": RESTORE_FORMAT,
        "verified": True,
        "candidate_sha": candidate_sha,
        "source_project_ref": source,
        "restore_project_ref": restored,
        "source_generated_at": source_generated_at,
        "restored_generated_at": restored_generated_at,
        "section_sha256": normalized_sections,
        "storage_object_count": count,
        "storage_total_bytes": total,
        "storage_manifest_sha256": manifest_digest,
    }


def _validate_rollback(report: object, candidate_sha: str, backup: dict) -> dict:
    if not isinstance(report, dict) or report.get("format") != ROLLBACK_FORMAT or report.get("verified") is not True:
        raise StageCEvidenceError("rollback rehearsal must have a successful continuity report")
    if _sha(report.get("candidate_sha"), "rollback candidate_sha") != candidate_sha:
        raise StageCEvidenceError("rollback evidence is not tied to the exact candidate SHA")
    rollback_sha = _sha(report.get("rollback_application_sha"), "rollback application SHA")
    if rollback_sha == candidate_sha:
        raise StageCEvidenceError("rollback application SHA must differ from the candidate SHA")
    rehearsal_id = _rehearsal_id(report.get("rehearsal_id"), "rollback rehearsal_id")
    source = _project_ref(report.get("database_project_ref"), "rollback database_project_ref")
    if source != backup["project_ref"]:
        raise StageCEvidenceError("rollback rehearsal did not use the backup source database project")
    if report.get("database_rollback_performed") is not False:
        raise StageCEvidenceError("Stage-C rollback rehearsal must explicitly avoid database rollback")
    checkpoint = _non_negative_int(report.get("checkpoint_record_count"), "rollback checkpoint_record_count")
    new = _non_negative_int(report.get("new_record_count"), "rollback new_record_count")
    after = _non_negative_int(report.get("after_record_count"), "rollback after_record_count")
    if checkpoint == 0:
        raise StageCEvidenceError("rollback rehearsal must prove at least one pre-existing transaction")
    if new == 0:
        raise StageCEvidenceError("rollback rehearsal must prove at least one newly created transaction")
    if after != checkpoint + new:
        raise StageCEvidenceError("rollback rehearsal did not preserve checkpoint plus new transactions")
    counts = report.get("counts_by_kind")
    if not isinstance(counts, dict) or any(
        not isinstance(k, str) or not k or not isinstance(v, int) or isinstance(v, bool) or v < 0
        for k, v in counts.items()
    ):
        raise StageCEvidenceError("rollback counts_by_kind is invalid")
    if sum(counts.values()) != after:
        raise StageCEvidenceError("rollback counts_by_kind does not match after_record_count")
    digests = {
        field: _hex64(report.get(field), f"rollback {field}")
        for field in ("checkpoint_records_sha256", "during_records_sha256", "after_records_sha256")
    }
    return {
        "format": ROLLBACK_FORMAT,
        "verified": True,
        "candidate_sha": candidate_sha,
        "rollback_application_sha": rollback_sha,
        "rehearsal_id": rehearsal_id,
        "database_project_ref": source,
        "database_rollback_performed": False,
        "rehearsal_window_seconds": _non_negative_int(
            report.get("rehearsal_window_seconds"), "rollback rehearsal_window_seconds"
        ),
        "checkpoint_record_count": checkpoint,
        "new_record_count": new,
        "after_record_count": after,
        "counts_by_kind": dict(sorted(counts.items())),
        **digests,
    }


def _validate_devices(payload: object, candidate_sha: str) -> tuple[dict, dict]:
    if not isinstance(payload, dict) or set(payload) != set(DEVICE_CLASSES):
        raise StageCEvidenceError("device evidence must contain exactly desktop, iphone and ipad")
    normalized: dict[str, dict] = {}
    seen_instances: set[str] = set()
    seen_evidence_refs: set[str] = set()
    preview_deployment_id = None
    preview_url = None
    for device_class in DEVICE_CLASSES:
        row = payload[device_class]
        if not isinstance(row, dict):
            raise StageCEvidenceError(f"{device_class} device evidence must be an object")
        if row.get("accepted") is not True or row.get("real_account") is not True:
            raise StageCEvidenceError(f"{device_class} must pass using a real authenticated account")
        if row.get("simulated") is not False or row.get("emulated") is not False:
            raise StageCEvidenceError(f"{device_class} evidence must explicitly be non-simulated and non-emulated")
        if row.get("physical") is not True:
            raise StageCEvidenceError(f"{device_class} evidence must come from a physical device")
        if _sha(row.get("candidate_sha"), f"{device_class} candidate_sha") != candidate_sha:
            raise StageCEvidenceError(f"{device_class} evidence is not tied to the exact candidate SHA")
        row_deployment_id = _deployment_id(
            row.get("preview_deployment_id"), f"{device_class} preview_deployment_id"
        )
        row_preview_url = _preview_url(row.get("preview_url"), f"{device_class} preview_url")
        if preview_deployment_id is None:
            preview_deployment_id = row_deployment_id
            preview_url = row_preview_url
        elif row_deployment_id != preview_deployment_id or row_preview_url != preview_url:
            raise StageCEvidenceError("all physical devices must test the exact same hosted Preview deployment")
        instance = row.get("device_instance")
        browser = row.get("browser")
        if not isinstance(instance, str) or not instance.strip():
            raise StageCEvidenceError(f"{device_class} must identify the physical device instance")
        normalized_instance = instance.strip()
        if normalized_instance in seen_instances:
            raise StageCEvidenceError("physical device instances must be distinct")
        seen_instances.add(normalized_instance)
        if not isinstance(browser, str) or not browser.strip():
            raise StageCEvidenceError(f"{device_class} browser is required")
        flows = row.get("flows")
        if not isinstance(flows, dict) or set(flows) != set(REQUIRED_FLOWS) or any(
            flows[name] is not True for name in REQUIRED_FLOWS
        ):
            raise StageCEvidenceError(f"{device_class} must pass every required practical flow")
        flow_evidence = row.get("flow_evidence")
        if not isinstance(flow_evidence, dict) or set(flow_evidence) != set(REQUIRED_FLOWS):
            raise StageCEvidenceError(f"{device_class} must provide evidence for every required practical flow")
        normalized_flow_evidence = {}
        flattened_evidence = []
        for flow in REQUIRED_FLOWS:
            refs = _evidence_refs(flow_evidence[flow], f"{device_class} {flow} evidence")
            for ref in refs:
                if ref in seen_evidence_refs:
                    raise StageCEvidenceError("physical-device evidence references must not be reused across flows or devices")
                seen_evidence_refs.add(ref)
            normalized_flow_evidence[flow] = refs
            flattened_evidence.extend(refs)
        normalized_evidence = sorted(flattened_evidence)
        provided_evidence = _evidence_refs(row.get("evidence"), f"{device_class} evidence")
        if provided_evidence != normalized_evidence:
            raise StageCEvidenceError(f"{device_class} evidence list must exactly match the per-flow evidence references")
        normalized[device_class] = {
            "accepted": True,
            "real_account": True,
            "simulated": False,
            "emulated": False,
            "physical": True,
            "candidate_sha": candidate_sha,
            "preview_deployment_id": row_deployment_id,
            "preview_url": row_preview_url,
            "device_instance": normalized_instance,
            "browser": browser.strip(),
            "flows": {name: True for name in REQUIRED_FLOWS},
            "flow_evidence": normalized_flow_evidence,
            "evidence": normalized_evidence,
        }
    preview = {
        "deployment_id": preview_deployment_id,
        "url": preview_url,
        "candidate_sha": candidate_sha,
        "environment": "preview",
        "release_stage": "preview",
    }
    return normalized, preview


def create_stage_c_evidence_bundle(
    *,
    candidate_sha: str,
    backup_set: object,
    backup_storage_report: object,
    restore_report: object,
    rollback_report: object,
    devices: object,
) -> dict:
    """Return an accepted Stage-C bundle only when every required evidence family cross-matches."""
    candidate = _sha(candidate_sha, "candidate_sha")
    backup = validate_backup_set(backup_set)
    if backup["candidate_sha"] != candidate:
        raise StageCEvidenceError("backup set is not tied to the exact candidate SHA")
    backup_storage = _validate_backup_storage_report(backup_storage_report, backup)
    restore = _validate_restore(restore_report, candidate, backup)
    rollback = _validate_rollback(rollback_report, candidate, backup)
    device_rows, preview = _validate_devices(devices, candidate)
    normalized = {
        "format": FORMAT,
        "accepted": True,
        "candidate_sha": candidate,
        "source_project_ref": backup["project_ref"],
        "restore_project_ref": restore["restore_project_ref"],
        "preview": preview,
        "backup": backup,
        "evidence_sha256": {
            "backup_set": backup_set_sha256(backup),
            "backup_storage_bytes": _digest(backup_storage),
            "independent_restore": _digest(restore),
            "rollback_rehearsal": _digest(rollback),
            "physical_devices": _digest(device_rows),
        },
        "storage": {
            "object_count": backup_storage["object_count"],
            "total_bytes": backup_storage["total_bytes"],
            "manifest_sha256": backup_storage["manifest_sha256"],
        },
        "restore": restore,
        # Keep the full normalized rollback report in the canonical Stage-C bundle.
        # The JavaScript release gate validates these fields directly, so emitting a
        # compact subset would make a bundle created by this verifier fail the next gate.
        "rollback": rollback,
        "devices": device_rows,
    }
    normalized["bundle_sha256"] = _digest(normalized)
    return normalized
