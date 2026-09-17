"""Deterministic byte-level manifest helpers for AQARI V267 Storage backups.

This module is intentionally filesystem-only. It does not fetch Supabase Storage and it does
not claim that a backup exists. Stage C uses it after Storage objects have been exported so the
same manifest can be verified against an independent restore byte-for-byte.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path, PurePosixPath
import json

FORMAT = "AQARI-V267-STORAGE-BYTE-MANIFEST-1"


class StorageByteManifestError(ValueError):
    """Raised when a storage-byte manifest or materialized backup is unsafe/inconsistent."""


def _digest_file(path: Path) -> str:
    digest = sha256()
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _validate_relative_path(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise StorageByteManifestError("storage object path must be a non-empty string")
    if "\\" in value:
        raise StorageByteManifestError("storage object path must use canonical '/' separators")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise StorageByteManifestError(f"unsafe storage object path: {value!r}")
    if len(path.parts) < 2:
        raise StorageByteManifestError("storage object path must include bucket/name")
    return path.as_posix()


def _canonical_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def scan_storage_tree(root: str | Path) -> dict:
    """Hash every regular file under ``root`` and return a deterministic manifest payload."""
    base = Path(root).resolve()
    if not base.is_dir():
        raise StorageByteManifestError(f"storage backup root is not a directory: {base}")

    objects: list[dict] = []
    for path in sorted(base.rglob("*"), key=lambda item: item.as_posix()):
        if path.is_symlink():
            raise StorageByteManifestError(f"symlinks are not allowed in storage backup: {path}")
        if not path.is_file():
            continue
        relative = _validate_relative_path(path.relative_to(base).as_posix())
        size = path.stat().st_size
        objects.append({"path": relative, "size": size, "sha256": _digest_file(path)})

    objects.sort(key=lambda item: item["path"])
    return {
        "format": FORMAT,
        "object_count": len(objects),
        "total_bytes": sum(item["size"] for item in objects),
        "objects": objects,
    }


def manifest_sha256(payload: dict) -> str:
    """Return the canonical SHA-256 of a validated manifest payload."""
    normalized = validate_manifest(payload)
    return sha256(_canonical_bytes(normalized)).hexdigest()


def validate_manifest(payload: object) -> dict:
    """Validate and normalize a manifest without touching the filesystem."""
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise StorageByteManifestError("unsupported storage byte manifest format")
    objects = payload.get("objects")
    if not isinstance(objects, list):
        raise StorageByteManifestError("storage byte manifest objects must be a list")

    normalized: list[dict] = []
    seen: set[str] = set()
    for entry in objects:
        if not isinstance(entry, dict):
            raise StorageByteManifestError("storage byte manifest object must be a mapping")
        relative = _validate_relative_path(entry.get("path"))
        if relative in seen:
            raise StorageByteManifestError(f"duplicate storage object path: {relative}")
        seen.add(relative)
        size = entry.get("size")
        digest = entry.get("sha256")
        if not isinstance(size, int) or isinstance(size, bool) or size < 0:
            raise StorageByteManifestError(f"invalid size for storage object: {relative}")
        if not isinstance(digest, str) or len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
            raise StorageByteManifestError(f"invalid sha256 for storage object: {relative}")
        normalized.append({"path": relative, "size": size, "sha256": digest})

    normalized.sort(key=lambda item: item["path"])
    object_count = payload.get("object_count")
    total_bytes = payload.get("total_bytes")
    expected_bytes = sum(item["size"] for item in normalized)
    if object_count != len(normalized):
        raise StorageByteManifestError("storage byte manifest object_count does not match objects")
    if total_bytes != expected_bytes:
        raise StorageByteManifestError("storage byte manifest total_bytes does not match objects")
    return {
        "format": FORMAT,
        "object_count": len(normalized),
        "total_bytes": expected_bytes,
        "objects": normalized,
    }


def verify_storage_tree(root: str | Path, payload: object) -> dict:
    """Verify an independent materialized restore against an expected byte manifest.

    Verification is exact: missing objects, extra objects, size changes and byte changes all fail.
    """
    expected = validate_manifest(payload)
    actual = scan_storage_tree(root)
    expected_by_path = {item["path"]: item for item in expected["objects"]}
    actual_by_path = {item["path"]: item for item in actual["objects"]}

    missing = sorted(set(expected_by_path) - set(actual_by_path))
    extra = sorted(set(actual_by_path) - set(expected_by_path))
    mismatched = sorted(
        path
        for path in set(expected_by_path) & set(actual_by_path)
        if expected_by_path[path]["size"] != actual_by_path[path]["size"]
        or expected_by_path[path]["sha256"] != actual_by_path[path]["sha256"]
    )
    if missing or extra or mismatched:
        raise StorageByteManifestError(
            "storage byte verification failed: "
            f"missing={missing}, extra={extra}, mismatched={mismatched}"
        )

    return {
        "verified": True,
        "format": FORMAT,
        "object_count": actual["object_count"],
        "total_bytes": actual["total_bytes"],
        "manifest_sha256": manifest_sha256(expected),
    }


def write_manifest(root: str | Path, destination: str | Path) -> dict:
    """Create a canonical JSON manifest for already-exported Storage bytes."""
    payload = scan_storage_tree(root)
    Path(destination).write_bytes(_canonical_bytes(payload) + b"\n")
    return payload


def read_manifest(path: str | Path) -> dict:
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise StorageByteManifestError(f"cannot read storage byte manifest: {exc}") from exc
    return validate_manifest(payload)
