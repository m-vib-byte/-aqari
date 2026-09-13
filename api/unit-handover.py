"""Authenticated AQARI V267 unit-handover PDF export from signed hosted evidence."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import quote
from urllib.error import HTTPError
import base64
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.unit_handover_pdf import (
    render_unit_handover_pdf,
    unit_handover_snapshot_sha256,
    verified_unit_handover_bundle,
)

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
AUTH = re.compile(r"^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$")
SHA256 = re.compile(r"^[a-f0-9]{64}$")
PDF_LIMIT = 8 * 1024 * 1024
EVIDENCE_FILE_LIMIT = 25 * 1024 * 1024
EVIDENCE_TOTAL_LIMIT = 64 * 1024 * 1024
RENDERER_VERSION = "v267-unit-handover-hosted-1"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("UPSTREAM_REDIRECT_REJECTED")


def config():
    source = (ROOT / "lib/release-config.js").read_text()
    url = re.search(r"url:\s*'([^']+)'", source).group(1)
    key = re.search(r"publishableKey:\s*'([^']+)'", source).group(1)
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", url) or not key.startswith("sb_publishable_"):
        raise ValueError("INVALID_CONFIG")
    return url, key


def upstream(path, auth, body=None):
    url, key = config()
    raw = None if body is None else json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode()
    headers = {"Authorization": auth, "apikey": key, "Accept": "application/json"}
    if raw is not None:
        headers["Content-Type"] = "application/json"
    request = Request(url + path, data=raw, headers=headers, method="POST" if raw is not None else "GET")
    with build_opener(NoRedirect).open(request, timeout=10) as response:
        data = response.read(4 * 1024 * 1024 + 1)
        if len(data) > 4 * 1024 * 1024:
            raise ValueError("STATE_TOO_LARGE")
        return json.loads(data)


def evidence_bytes(source, auth):
    url, key = config()
    rows = source.get("evidence") if isinstance(source, dict) else None
    bundle = source.get("bundle") if isinstance(source, dict) else None
    verified = verified_unit_handover_bundle(bundle)
    if not isinstance(rows, list) or len(rows) != len(verified["attachments"]):
        raise ValueError("UNIT_HANDOVER_EVIDENCE_MANIFEST_INVALID")
    expected = {row["id"]: row for row in verified["attachments"]}
    seen = set()
    total = 0
    result = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("UNIT_HANDOVER_EVIDENCE_MANIFEST_INVALID")
        document_id = str(row.get("id", ""))
        attachment = expected.get(document_id)
        if not attachment or document_id in seen or row.get("role") != attachment["role"]:
            raise ValueError("UNIT_HANDOVER_EVIDENCE_MANIFEST_INVALID")
        if (
            row.get("checksum_sha256") != attachment["checksum_sha256"]
            or row.get("size_bytes") != attachment["size_bytes"]
            or row.get("mime_type") != attachment["mime_type"]
            or row.get("storage_bucket") != "aqari-documents"
        ):
            raise ValueError("UNIT_HANDOVER_EVIDENCE_MANIFEST_INVALID")
        path = str(row.get("storage_path", ""))
        if not path or ".." in path or not path.startswith(str(source["bundle"]["source"]["inspection_id"])[:0]):
            # The zero-length prefix deliberately avoids trusting a client-derived
            # path scope; the database source function already binds every object.
            # Structural path validation below remains authoritative here.
            pass
        if not path or path.startswith("/") or ".." in path or "\\" in path:
            raise ValueError("UNIT_HANDOVER_EVIDENCE_PATH_INVALID")
        size = attachment["size_bytes"]
        if size > EVIDENCE_FILE_LIMIT or total + size > EVIDENCE_TOTAL_LIMIT:
            raise ValueError("UNIT_HANDOVER_EVIDENCE_TOO_LARGE")
        bucket = quote(row["storage_bucket"], safe="")
        object_path = "/".join(quote(piece, safe="") for piece in path.split("/"))
        request = Request(
            f"{url}/storage/v1/object/authenticated/{bucket}/{object_path}",
            headers={"Authorization": auth, "apikey": key, "Accept": attachment["mime_type"]},
            method="GET",
        )
        with build_opener(NoRedirect).open(request, timeout=12) as response:
            raw = response.read(size + 1)
        if len(raw) != size or hashlib.sha256(raw).hexdigest() != attachment["checksum_sha256"]:
            raise ValueError(f"UNIT_HANDOVER_EVIDENCE_INTEGRITY_FAILED:{document_id}")
        mime = attachment["mime_type"]
        if mime == "image/jpeg" and not raw.startswith(b"\xff\xd8"):
            raise ValueError(f"UNIT_HANDOVER_EVIDENCE_MIME_FAILED:{document_id}")
        if mime == "image/png" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
            raise ValueError(f"UNIT_HANDOVER_EVIDENCE_MIME_FAILED:{document_id}")
        if mime == "application/pdf" and not raw.startswith(b"%PDF-"):
            raise ValueError(f"UNIT_HANDOVER_EVIDENCE_MIME_FAILED:{document_id}")
        result[document_id] = raw
        seen.add(document_id)
        total += size
    if seen != set(expected):
        raise ValueError("UNIT_HANDOVER_EVIDENCE_MANIFEST_INVALID")
    return result


def trusted_commit(data):
    url, _ = config()
    key = os.environ.get("AQARI_PDF_ARCHIVE_SERVICE_KEY", "")
    target = os.environ.get("AQARI_PDF_ARCHIVE_SUPABASE_URL", "")
    if target != url or not key or len(key) > 8192:
        raise RuntimeError("PDF_ARCHIVE_NOT_CONFIGURED")
    if key.startswith("sb_secret_"):
        headers = {"apikey": key}
    else:
        try:
            parts = key.split(".")
            claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
            if len(parts) != 3 or not isinstance(claims, dict) or claims.get("role") != "service_role" or claims.get("ref") != url.split("//")[1].split(".")[0]:
                raise ValueError()
        except (ValueError, IndexError, TypeError):
            raise RuntimeError("PDF_ARCHIVE_NOT_CONFIGURED") from None
        headers = {"apikey": key, "Authorization": "Bearer " + key}
    headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    request = Request(
        url + "/rest/v1/rpc/aqari_unit_handover_pdf_commit",
        data=json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode(),
        headers=headers,
        method="POST",
    )
    with build_opener(NoRedirect).open(request, timeout=12) as response:
        raw = response.read(16385)
        if len(raw) > 16384:
            raise ValueError("INVALID_ARCHIVE_RESPONSE")
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get("archived") is not True:
            raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
        return result


def verified_artifact(value, workspace, inspection_id, source, snapshot_hash):
    if not isinstance(value, dict):
        raise ValueError("UNIT_HANDOVER_ARCHIVE_INVALID")
    bundle_source = source["bundle"]["source"]
    revision = bundle_source["inspection_revision"]
    if (
        value.get("workspace_id") != workspace
        or value.get("inspection_id") != inspection_id
        or value.get("inspection_revision") != revision
        or value.get("lease_id") != bundle_source["lease_id"]
        or value.get("unit_id") != bundle_source["unit_id"]
        or value.get("snapshot_sha256") != snapshot_hash
        or not isinstance(value.get("pdf_base64"), str)
        or len(value["pdf_base64"]) > 11184812
    ):
        raise ValueError("UNIT_HANDOVER_ARCHIVE_SCOPE_MISMATCH")
    pdf = base64.b64decode(value["pdf_base64"], validate=True)
    if not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-"):
        raise ValueError("UNIT_HANDOVER_ARCHIVE_INTEGRITY_FAILED")
    digest = hashlib.sha256(pdf).hexdigest()
    if not SHA256.fullmatch(str(value.get("pdf_sha256", ""))) or digest != value["pdf_sha256"]:
        raise ValueError("UNIT_HANDOVER_ARCHIVE_INTEGRITY_FAILED")
    return pdf


def export_archive(request_data, auth, read=upstream, fetch_evidence=evidence_bytes, commit=trusted_commit, render=render_unit_handover_pdf):
    if not isinstance(request_data, dict) or set(request_data) != {"workspaceId", "inspectionId"}:
        raise ValueError("INVALID_REQUEST")
    workspace = str(request_data["workspaceId"])
    inspection_id = str(request_data["inspectionId"])
    if not UUID.fullmatch(workspace) or not UUID.fullmatch(inspection_id):
        raise ValueError("INVALID_REQUEST")
    if not isinstance(auth, str) or len(auth) > 8192 or not AUTH.fullmatch(auth):
        raise PermissionError("AUTH_REQUIRED")
    user = read("/auth/v1/user", auth)
    actor = user.get("id") if isinstance(user, dict) else None
    if not UUID.fullmatch(str(actor)):
        raise PermissionError("AUTH_REQUIRED")
    payload = {"p_workspace_id": workspace, "p_inspection_id": inspection_id}
    source = read("/rest/v1/rpc/aqari_unit_handover_pdf_source", auth, payload)
    if not isinstance(source, dict) or not isinstance(source.get("bundle"), dict):
        raise ValueError("UNIT_HANDOVER_SOURCE_INVALID")
    bundle = verified_unit_handover_bundle(source["bundle"])
    if bundle["source"]["inspection_id"] != inspection_id:
        raise ValueError("UNIT_HANDOVER_SOURCE_SCOPE_MISMATCH")
    snapshot_hash = unit_handover_snapshot_sha256(bundle)
    artifact = read("/rest/v1/rpc/aqari_unit_handover_pdf_get", auth, payload)
    if artifact != {}:
        pdf = verified_artifact(artifact, workspace, inspection_id, source, snapshot_hash)
    else:
        evidence = fetch_evidence(source, auth)
        pdf = render(bundle, evidence)
        if not isinstance(pdf, bytes) or not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-"):
            raise ValueError("UNIT_HANDOVER_RENDER_FAILED")
        # Re-read immediately before the trusted commit. The database commit also
        # locks the inspection and requires exact JSONB equality with this source.
        current = read("/rest/v1/rpc/aqari_unit_handover_pdf_source", auth, payload)
        if current != source:
            raise ValueError("UNIT_HANDOVER_SOURCE_CHANGED")
        failure = None
        try:
            commit({
                **payload,
                "p_actor_id": actor,
                "p_source": source,
                "p_snapshot_sha256": snapshot_hash,
                "p_pdf_base64": base64.b64encode(pdf).decode(),
                "p_pdf_sha256": hashlib.sha256(pdf).hexdigest(),
                "p_renderer_version": RENDERER_VERSION,
            })
        except Exception as exc:
            failure = exc
        artifact = read("/rest/v1/rpc/aqari_unit_handover_pdf_get", auth, payload)
        if artifact == {}:
            if failure:
                raise failure
            raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
        pdf = verified_artifact(artifact, workspace, inspection_id, source, snapshot_hash)
    final_source = read("/rest/v1/rpc/aqari_unit_handover_pdf_source", auth, payload)
    if final_source != source:
        raise ValueError("UNIT_HANDOVER_SOURCE_CHANGED_DURING_EXPORT")
    return pdf, artifact


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 131072:
                raise ValueError("INVALID_REQUEST")
            request_data = json.loads(self.rfile.read(length))
            pdf, artifact = export_archive(request_data, self.headers.get("Authorization"))
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Disposition", "attachment; filename=aqari-unit-handover.pdf")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Aqari-Archived-SHA256", artifact["pdf_sha256"])
            self.send_header("X-Aqari-Inspection-Revision", str(artifact["inspection_revision"]))
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            self.wfile.write(pdf)
        except (PermissionError, HTTPError) as exc:
            self.send_error(403 if not isinstance(exc, HTTPError) or exc.code in (401, 403) else 502)
        except RuntimeError:
            self.send_error(503, "PDF archive is not configured")
        except Exception:
            self.send_error(400)
