"""Explicit owner issuance and immutable retrieval of rental-document PDFs.

The browser submits identifiers, document-only fields, and the hashes it reviewed.
Only this authenticated server renders the PDF and sends bytes to the service-only
commit RPC. A successful response always comes from the immutable archive.
"""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener
import base64
import hashlib
import importlib.util
import json
import os
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("rental_issue_preview", ROOT / "api/contract-template-preview.py")
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
common = preview.common
from lib.rental_document_context import LINKED_FIELDS

UUID = common.UUID
SHA256 = re.compile(r"^[a-f0-9]{64}$")
AUTH = re.compile(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
PDF_LIMIT = 2 * 1024 * 1024
RENDERER_VERSION = "v267-rental-document-archive-1"


def _uuid(value):
    return isinstance(value, str) and UUID.fullmatch(value) is not None


def _hash(value):
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def _rpc(read, name, auth, data):
    return read("/rest/v1/rpc/" + name, auth, data)


def _authenticated(auth, read):
    if not isinstance(auth, str) or len(auth) > 8192 or not AUTH.fullmatch(auth):
        raise PermissionError("AUTH_REQUIRED")
    # Supabase authenticates this exact signed bearer. Decoding claims alone is
    # never an authentication decision and is deliberately done only afterward.
    user = read("/auth/v1/user", auth)
    uid = user.get("id") if isinstance(user, dict) else None
    if not _uuid(uid):
        raise PermissionError("AUTH_REQUIRED")
    try:
        encoded = auth[7:].split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
    except (ValueError, TypeError):
        raise PermissionError("AUTH_REQUIRED") from None
    if not isinstance(claims, dict) or claims.get("sub") != uid or claims.get("role") != "authenticated":
        raise PermissionError("AUTH_REQUIRED")
    return uid, claims


def _manager(workspace, uid, auth, read):
    context = _rpc(read, "aqari_rental_templates", auth,
                   {"p_workspace_id": workspace, "p_action": "context", "p_data": {}})
    if (not isinstance(context, dict) or context.get("workspace_id") != workspace
            or context.get("user_id") != uid or context.get("can_publish") is not True):
        raise PermissionError("OWNER_APPROVAL_REQUIRED")


def _issue_request(data):
    required = {"workspaceId", "requestId", "templateId", "leaseId", "propertyId",
                "previewDigest", "reviewedPdfSha256", "approved", "reason"}
    if not isinstance(data, dict) or not required <= set(data) or set(data) - required - {"receiptId", "values", "action"}:
        raise ValueError("INVALID_REQUEST")
    if data.get("action", "issue") != "issue":
        raise ValueError("INVALID_REQUEST")
    if any(not _uuid(data[key]) for key in ["workspaceId", "requestId", "templateId", "leaseId", "propertyId"]):
        raise ValueError("INVALID_REQUEST")
    if data.get("receiptId") is not None and not _uuid(data["receiptId"]):
        raise ValueError("INVALID_REQUEST")
    if not _hash(data["previewDigest"]) or not _hash(data["reviewedPdfSha256"]):
        raise ValueError("PREVIEW_REQUIRED")
    if data["approved"] is not True or not isinstance(data["reason"], str) or not 6 <= len(data["reason"].strip()) <= 500:
        raise ValueError("EXPLICIT_OWNER_APPROVAL_REQUIRED")
    values = data.get("values", {})
    if (not isinstance(values, dict) or len(values) > 50
            or any(not isinstance(k, str) or not re.fullmatch(r"[a-z][a-z0-9_]{1,49}", k)
                   or k in LINKED_FIELDS for k in values)
            or any(isinstance(v, bool) or not isinstance(v, (str, int, float))
                   or len(str(v)) > 2000 for v in values.values())):
        raise ValueError("INVALID_DOCUMENT_VALUES")
    # JSON round-trip also prevents an injected mutable dictionary from changing
    # the approval request while asynchronous upstream operations are in flight.
    result = {key: data[key] for key in required}
    result.update(receiptId=data.get("receiptId"), values=values, reason=data["reason"].strip())
    return json.loads(json.dumps(result, ensure_ascii=False, allow_nan=False))


def _archive(workspace, document_id, uid, auth, read, missing=False):
    try:
        result = _rpc(read, "aqari_rental_document_archive", auth,
                      {"p_workspace_id": workspace, "p_action": "get", "p_data": {"id": document_id}})
    except HTTPError as exc:
        if missing and exc.code == 404:
            return None
        raise
    if (not isinstance(result, dict) or result.get("workspace_id") != workspace
            or result.get("user_id") != uid or not isinstance(result.get("record"), dict)):
        raise ValueError("ARCHIVE_READ_NOT_CONFIRMED")
    record = result["record"]
    if record.get("workspace_id") != workspace or record.get("id") != document_id:
        raise ValueError("ARCHIVE_SCOPE_MISMATCH")
    return record


def _artifact(record, workspace, property_id, document_id):
    if (not isinstance(record, dict) or record.get("workspace_id") != workspace
            or record.get("id") != document_id or record.get("property_id") != property_id
            or not _uuid(record.get("issued_by")) or not _hash(record.get("source_sha256"))
            or not _hash(record.get("snapshot_sha256")) or not _hash(record.get("pdf_sha256"))
            or not isinstance(record.get("snapshot"), dict)
            or not isinstance(record.get("pdf_base64"), str)
            or len(record["pdf_base64"]) > 4 * ((PDF_LIMIT + 2) // 3)):
        raise ValueError("ARCHIVE_SCOPE_MISMATCH")
    try:
        pdf = base64.b64decode(record["pdf_base64"], validate=True)
    except ValueError:
        raise ValueError("ARCHIVE_INTEGRITY_FAILED") from None
    if (not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-")
            or hashlib.sha256(pdf).hexdigest() != record["pdf_sha256"]):
        raise ValueError("ARCHIVE_INTEGRITY_FAILED")
    return pdf


def _replay(record, request, uid):
    pdf = _artifact(record, request["workspaceId"], request["propertyId"], request["requestId"])
    if (record.get("issued_by") != uid or record["snapshot"].get("request") != request
            or record.get("template_id") != request["templateId"]
            or record.get("lease_id") != request["leaseId"]
            or record.get("receipt_id") != request["receiptId"]
            or record.get("pdf_sha256") != request["reviewedPdfSha256"]
            or record["snapshot"].get("preview_digest") != request["previewDigest"]):
        raise ValueError("ISSUE_REQUEST_CONFLICT")
    return pdf


def _source(request, uid, auth, read):
    result = _rpc(read, "aqari_rental_document_source", auth,
                  {"p_workspace_id": request["workspaceId"], "p_template_id": request["templateId"],
                   "p_lease_id": request["leaseId"], "p_receipt_id": request["receiptId"]})
    if (not isinstance(result, dict) or result.get("workspace_id") != request["workspaceId"]
            or result.get("user_id") != uid or not _hash(result.get("source_sha256"))
            or not isinstance(result.get("source"), dict)):
        raise PermissionError("SOURCE_SCOPE_MISMATCH")
    source = result["source"]
    if any(not isinstance(source.get(k), dict) for k in ["template", "lease", "contract", "property", "unit", "tenant", "property_row", "unit_row"]):
        raise ValueError("INVALID_DOCUMENT_SOURCE")
    template, lease, prop, unit, tenant = (source[k] for k in ["template", "lease", "property", "unit", "tenant"])
    receipt = source.get("receipt")
    if (template.get("id") != request["templateId"] or type(template.get("version")) is not int
            or template["version"] < 1 or not isinstance(template.get("published_at"), str)
            or lease.get("id") != request["leaseId"] or prop.get("id") != request["propertyId"]
            or lease.get("unit_id") != unit.get("id") or lease.get("tenant_id") != tenant.get("id")
            or unit.get("propertyId") != prop.get("id")
            or source["property_row"].get("id") != prop.get("id")
            or source["unit_row"].get("id") != unit.get("id")
            or source["unit_row"].get("property_id") != prop.get("id")
            or (request["receiptId"] is None and receipt is not None)
            or (request["receiptId"] is not None and (not isinstance(receipt, dict)
                or receipt.get("id") != request["receiptId"] or receipt.get("lease_id") != lease.get("id")))):
        raise ValueError("DOCUMENT_LINK_MISMATCH")
    for row in [lease, tenant, source["property_row"], source["unit_row"], receipt]:
        if row is not None and row.get("workspace_id") != request["workspaceId"]:
            raise PermissionError("SOURCE_SCOPE_MISMATCH")
    return result


def render_source(source, values, workspace, auth, read):
    return preview.render_source_preview(source, values, workspace, auth, read)


def commit_issue(payload):
    """Same-project server credential only; never use a request-supplied key."""
    url, _ = common.config()
    service_key = os.environ.get("AQARI_PDF_ARCHIVE_SERVICE_KEY", "")
    if os.environ.get("AQARI_PDF_ARCHIVE_SUPABASE_URL", "") != url or not service_key or len(service_key) > 8192:
        raise RuntimeError("PDF_ARCHIVE_NOT_CONFIGURED")
    if service_key.startswith("sb_secret_"):
        headers = {"apikey": service_key}
    else:
        try:
            parts = service_key.split(".")
            claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
            if (len(parts) != 3 or not isinstance(claims, dict) or claims.get("role") != "service_role"
                    or claims.get("ref") != url.split("//")[1].split(".")[0]):
                raise ValueError()
        except (ValueError, IndexError, TypeError):
            raise RuntimeError("PDF_ARCHIVE_NOT_CONFIGURED") from None
        headers = {"apikey": service_key, "Authorization": "Bearer " + service_key}
    headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    request = Request(url + "/rest/v1/rpc/aqari_rental_document_issue", method="POST", headers=headers,
                      data=json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode())
    with build_opener(common.NoRedirect).open(request, timeout=12) as response:
        raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError("INVALID_ARCHIVE_RESPONSE")
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get("archived") is not True:
            raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
        return result


def issue_document(data, auth, read=common.upstream, commit=commit_issue, render=render_source):
    request = _issue_request(data)
    workspace, ident = request["workspaceId"], request["requestId"]
    uid, claims = _authenticated(auth, read)
    _manager(workspace, uid, auth, read)
    existing = _archive(workspace, ident, uid, auth, read, missing=True)
    if existing is not None:
        pdf = _replay(existing, request, uid)
        _manager(workspace, uid, auth, read)
        return pdf, existing
    source_result = _source(request, uid, auth, read)
    source = source_result["source"]
    rendered = render(source, request["values"], workspace, auth, read)
    if not isinstance(rendered, dict) or not isinstance(rendered.get("pdf"), bytes):
        raise ValueError("INVALID_RENDERED_DOCUMENT")
    pdf = rendered["pdf"]
    if not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-"):
        raise ValueError("INVALID_RENDERED_PDF")
    digest = rendered.get("digest")
    pdf_hash = hashlib.sha256(pdf).hexdigest()
    if digest != request["previewDigest"] or pdf_hash != request["reviewedPdfSha256"]:
        raise ValueError("DOCUMENT_PREVIEW_CHANGED")
    if not isinstance(rendered.get("resolved"), dict) or not isinstance(rendered.get("values"), dict):
        raise ValueError("INVALID_RENDERED_DOCUMENT")
    snapshot = {"source": source, "request": request, "values": rendered["values"],
                "resolved": rendered["resolved"], "logo": rendered.get("logo_snapshot"),
                "preview_digest": digest, "renderer_version": RENDERER_VERSION}
    final_uid, final_claims = _authenticated(auth, read)
    if final_uid != uid or final_claims != claims:
        raise PermissionError("AUTH_CHANGED")
    _manager(workspace, uid, auth, read)
    payload = {"p_workspace_id": workspace, "p_actor_id": uid, "p_actor_claims": claims,
               "p_request_id": ident, "p_template_id": request["templateId"], "p_lease_id": request["leaseId"],
               "p_receipt_id": request["receiptId"], "p_source_sha256": source_result["source_sha256"],
               "p_snapshot": snapshot, "p_pdf_base64": base64.b64encode(pdf).decode(), "p_pdf_sha256": pdf_hash,
               "p_renderer_version": RENDERER_VERSION, "p_approved": True, "p_reason": request["reason"]}
    failure = None
    try:
        commit(payload)
    except Exception as exc:
        failure = exc
    # A lost response can follow a successful transaction. Only verified readback
    # establishes issuance; generated in-memory bytes are never a success result.
    archived = _archive(workspace, ident, uid, auth, read, missing=True)
    if archived is None:
        if failure is not None:
            raise failure
        raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
    result_pdf = _replay(archived, request, uid)
    if archived["snapshot"] != snapshot or archived.get("source_sha256") != source_result["source_sha256"]:
        raise ValueError("ARCHIVE_SNAPSHOT_MISMATCH")
    _manager(workspace, uid, auth, read)
    return result_pdf, archived


def get_document(data, auth, read=common.upstream):
    if (not isinstance(data, dict) or set(data) != {"action", "workspaceId", "documentId", "propertyId"}
            or data["action"] != "get" or any(not _uuid(data[k]) for k in ["workspaceId", "documentId", "propertyId"])):
        raise ValueError("INVALID_REQUEST")
    uid, _ = _authenticated(auth, read)
    record = _archive(data["workspaceId"], data["documentId"], uid, auth, read)
    pdf = _artifact(record, data["workspaceId"], data["propertyId"], data["documentId"])
    final = _archive(data["workspaceId"], data["documentId"], uid, auth, read)
    if final != record:
        raise ValueError("ARCHIVE_CHANGED_DURING_EXPORT")
    return pdf, record


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body, record=None):
        self.send_response(status)
        headers = {"Content-Type": "application/pdf" if record is not None else "application/json; charset=utf-8",
                   "Cache-Control": "private, no-store, max-age=0", "Vercel-CDN-Cache-Control": "no-store",
                   "Vary": "Authorization", "X-Content-Type-Options": "nosniff", "Content-Length": str(len(body))}
        if record is not None:
            headers.update({"Content-Disposition": 'attachment; filename="aqari-rental-document.pdf"',
                            "X-Aqari-Document-Id": record["id"], "X-Aqari-Archived-SHA256": record["pdf_sha256"],
                            "X-Aqari-Document-SHA256": record["snapshot"].get("preview_digest", "")})
        for name, value in headers.items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            origin = self.headers.get("Origin")
            if origin and origin != "https://" + self.headers.get("Host", ""):
                raise PermissionError("ORIGIN_REJECTED")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 120000:
                raise ValueError("INVALID_REQUEST")
            data = json.loads(self.rfile.read(size))
            operation = get_document if isinstance(data, dict) and data.get("action") == "get" else issue_document
            pdf, record = operation(data, self.headers.get("Authorization"))
            self.respond(200, pdf, record)
        except PermissionError:
            self.respond(403, b'{"error":"ACCESS_DENIED"}')
        except HTTPError as exc:
            status = 403 if exc.code in (401, 403) else 409 if exc.code == 409 else 404 if exc.code == 404 else 503
            code = "ACCESS_DENIED" if status == 403 else "DOCUMENT_CHANGED" if status == 409 else "DOCUMENT_NOT_FOUND" if status == 404 else "ISSUE_UNAVAILABLE"
            self.respond(status, json.dumps({"error": code}).encode())
        except (ValueError, TypeError, KeyError) as exc:
            conflict = str(exc) in {"DOCUMENT_PREVIEW_CHANGED", "ISSUE_REQUEST_CONFLICT", "ARCHIVE_SNAPSHOT_MISMATCH", "ARCHIVE_CHANGED_DURING_EXPORT"}
            self.respond(409 if conflict else 400, json.dumps({"error": str(exc) if conflict else "INVALID_REQUEST"}).encode())
        except Exception:
            self.respond(503, b'{"error":"ISSUE_UNAVAILABLE"}')
