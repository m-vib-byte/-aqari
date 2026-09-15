"""Authenticated rent-receipt PDF export with immutable server archive."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlencode
from urllib.error import HTTPError
import base64
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.rent_pdf import verified_receipt, render_receipt, money

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
PDF_LIMIT = 2 * 1024 * 1024
RENDERER_VERSION = "v267-rent-receipt-pdf-archive-1"


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
    with build_opener(NoRedirect).open(request, timeout=8) as response:
        data = response.read(20 * 1024 * 1024 + 1)
        if len(data) > 20 * 1024 * 1024:
            raise ValueError("STATE_TOO_LARGE")
        return json.loads(data)


def commit_archive(data):
    """Commit bytes only through the server-only credential for this exact Supabase target."""
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
        url + "/rest/v1/rpc/aqari_rent_receipt_pdf_commit",
        data=json.dumps(data, separators=(",", ":")).encode(),
        headers=headers,
        method="POST",
    )
    with build_opener(NoRedirect).open(request, timeout=8) as response:
        raw = response.read(16385)
        if len(raw) > 16384:
            raise ValueError("INVALID_ARCHIVE_RESPONSE")
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get("archived") is not True:
            raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
        return result


def verified_artifact(value, workspace, reference):
    if (
        not isinstance(value, dict)
        or value.get("workspace_id") != workspace
        or value.get("receipt_no") != reference
        or not UUID.fullmatch(str(value.get("payment_id", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(value.get("snapshot_sha256", "")))
        or not re.fullmatch(r"[a-f0-9]{64}", str(value.get("pdf_sha256", "")))
        or not isinstance(value.get("pdf_base64"), str)
        or len(value["pdf_base64"]) > 2796204
        or not isinstance(value.get("payment_status"), str)
    ):
        raise ValueError("PDF_ARCHIVE_SCOPE_MISMATCH")
    pdf = base64.b64decode(value["pdf_base64"], validate=True)
    if not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-") or hashlib.sha256(pdf).hexdigest() != value["pdf_sha256"]:
        raise ValueError("PDF_ARCHIVE_INTEGRITY_FAILED")
    return pdf


def export_pdf(input_data, auth, read=upstream):
    """Verify the persisted receipt and render deterministic bytes; archival is done by export_archive."""
    if not isinstance(input_data, dict) or set(input_data) != {"workspaceId", "receiptNo"}:
        raise ValueError("INVALID_REQUEST")
    workspace, reference = input_data["workspaceId"], input_data["receiptNo"]
    if not isinstance(workspace, str) or not UUID.fullmatch(workspace) or not isinstance(reference, str) or not 1 <= len(reference) <= 150 or any(ord(c) < 32 for c in reference):
        raise ValueError("INVALID_REQUEST")
    if not isinstance(auth, str) or len(auth) > 8192 or not re.fullmatch(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", auth):
        raise PermissionError("AUTH_REQUIRED")
    user = read("/auth/v1/user", auth)
    uid = user.get("id") if isinstance(user, dict) else None
    if not isinstance(uid, str) or not UUID.fullmatch(uid):
        raise PermissionError("AUTH_REQUIRED")
    member_path = "/rest/v1/aqari_memberships?" + urlencode({"select": "user_id,workspace_id,role,is_active", "workspace_id": "eq." + workspace, "user_id": "eq." + uid})

    def check_member():
        members = read(member_path, auth)
        if not isinstance(members, list) or len(members) != 1:
            raise PermissionError("ACCESS_DENIED")
        m = members[0]
        if m.get("user_id") != uid or m.get("workspace_id") != workspace or m.get("is_active") is not True or m.get("role") not in {"general_manager", "property_manager", "accountant"}:
            raise PermissionError("ACCESS_DENIED")

    initial_members = read(member_path, auth)
    if initial_members == []:
        return export_tenant_pdf(workspace, reference, uid, auth, read)
    check_member()
    state = read("/rest/v1/rpc/aqari_read_state_v267?" + urlencode({"p_workspace_id": workspace}), auth)
    if not isinstance(state, dict) or state.get("workspace_id") != workspace or not isinstance(state.get("payload"), dict):
        raise PermissionError("ACCESS_DENIED")
    saved = verified_receipt(state["payload"], reference)
    check_member()
    verify_scoped_payment(workspace, reference, saved, auth, read)
    return render_receipt(saved)


def verify_scoped_payment(workspace, reference, saved, auth, read):
    """Recheck property/section RLS and the immutable source in one final read."""
    path = "/rest/v1/aqari_rent_payments?" + urlencode({
        "select": "workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt,lease:aqari_leases!inner(id,workspace_id,external_ref,contract_no)",
        "workspace_id": "eq." + workspace, "reference": "eq." + reference, "limit": "2",
    })
    rows = read(path, auth)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise PermissionError("ACCESS_DENIED")
    payment = rows[0]
    lease = payment.get("lease")
    if (
        payment.get("workspace_id") != workspace or payment.get("reference") != reference
        or not UUID.fullmatch(str(payment.get("lease_id", ""))) or not isinstance(lease, dict)
        or lease.get("workspace_id") != workspace or lease.get("id") != payment["lease_id"]
    ):
        raise PermissionError("ACCESS_DENIED")
    contract = saved["contract"]
    if str(contract.get("id")) != str(lease.get("external_ref")) or contract.get("contract_no") != lease.get("contract_no"):
        raise ValueError("CONTRACT_LINK_MISMATCH")
    if payment.get("receipt") != saved:
        raise ValueError("RECEIPT_SNAPSHOT_MISMATCH")
    verified_receipt(dict(rentReceiptsV267=[saved], collections=[saved["record"]], contractsV202=[{"id": lease["external_ref"]}], rentLedgerV202=[payment.get("record")]), reference)
    row = saved["record"]
    if (
        money(payment.get("amount")) != money(row[2]) or payment.get("period") != row[8] + "-01"
        or payment.get("paid_at") != row[5] or payment.get("status") != row[3] or payment.get("payment_method") != row[9]
    ):
        raise ValueError("PAYMENT_LINK_MISMATCH")


def export_tenant_pdf(workspace, reference, uid, auth, read):
    """Tenant access uses row policies; never reads the administration state."""
    account_path = "/rest/v1/aqari_portal_accounts?" + urlencode({"select": "user_id,workspace_id,tenant_id,is_active", "workspace_id": "eq." + workspace, "user_id": "eq." + uid})

    def account():
        rows = read(account_path, auth)
        if not isinstance(rows, list) or len(rows) != 1:
            raise PermissionError("ACCESS_DENIED")
        a = rows[0]
        if a.get("user_id") != uid or a.get("workspace_id") != workspace or a.get("is_active") is not True or not UUID.fullmatch(str(a.get("tenant_id", ""))):
            raise PermissionError("ACCESS_DENIED")
        return a

    owner = account()
    rows = read("/rest/v1/aqari_rent_payments?" + urlencode({"select": "*", "workspace_id": "eq." + workspace, "reference": "eq." + reference}), auth)
    if not isinstance(rows, list) or len(rows) != 1:
        raise PermissionError("ACCESS_DENIED")
    p = rows[0]
    if p.get("workspace_id") != workspace or p.get("reference") != reference or not UUID.fullmatch(str(p.get("lease_id", ""))):
        raise PermissionError("ACCESS_DENIED")
    lease_path = "/rest/v1/aqari_leases?" + urlencode({"select": "id,workspace_id,tenant_id,external_ref,contract_no", "workspace_id": "eq." + workspace, "id": "eq." + p["lease_id"], "tenant_id": "eq." + owner["tenant_id"]})

    def lease():
        leases = read(lease_path, auth)
        if not isinstance(leases, list) or len(leases) != 1:
            raise PermissionError("ACCESS_DENIED")
        l = leases[0]
        if l.get("workspace_id") != workspace or l.get("id") != p["lease_id"] or l.get("tenant_id") != owner["tenant_id"]:
            raise PermissionError("ACCESS_DENIED")
        return l

    l = lease()
    saved = p["receipt"]
    c = saved["contract"]
    if str(c.get("id")) != str(l["external_ref"]) or c.get("contract_no") != l["contract_no"]:
        raise ValueError("CONTRACT_LINK_MISMATCH")
    saved = verified_receipt(dict(rentReceiptsV267=[saved], collections=[saved["record"]], contractsV202=[{"id": l["external_ref"]}], rentLedgerV202=[p["record"]]), reference)
    row = saved["record"]
    if money(p["amount"]) != money(row[2]) or p["period"] != row[8] + "-01" or p["paid_at"] != row[5] or p["status"] != row[3] or p["payment_method"] != row[9]:
        raise ValueError("PAYMENT_LINK_MISMATCH")
    if account() != owner or lease() != l:
        raise PermissionError("ACCESS_DENIED")
    return render_receipt(saved)


def export_archive(input_data, auth, read=upstream, commit=commit_archive, render=export_pdf):
    if not isinstance(input_data, dict) or set(input_data) != {"workspaceId", "receiptNo"}:
        raise ValueError("INVALID_REQUEST")
    workspace, reference = input_data["workspaceId"], input_data["receiptNo"]
    if not UUID.fullmatch(str(workspace)) or not isinstance(reference, str) or not 1 <= len(reference) <= 150:
        raise ValueError("INVALID_REQUEST")
    if not isinstance(auth, str) or len(auth) > 8192 or not re.fullmatch(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", auth):
        raise PermissionError("AUTH_REQUIRED")
    user = read("/auth/v1/user", auth)
    uid = user.get("id") if isinstance(user, dict) else None
    if not UUID.fullmatch(str(uid)):
        raise PermissionError("AUTH_REQUIRED")
    query = {"p_workspace_id": workspace, "p_receipt_no": reference}
    artifact = read("/rest/v1/rpc/aqari_rent_receipt_pdf_get", auth, query)
    if artifact == {}:
        pdf = render(input_data, auth, read)
        if not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b"%PDF-"):
            raise ValueError("INVALID_RENDERED_PDF")
        failure = None
        try:
            commit({
                **query,
                "p_actor_id": uid,
                "p_pdf_base64": base64.b64encode(pdf).decode(),
                "p_pdf_sha256": hashlib.sha256(pdf).hexdigest(),
                "p_renderer_version": RENDERER_VERSION,
            })
        except Exception as exc:
            failure = exc
        artifact = read("/rest/v1/rpc/aqari_rent_receipt_pdf_get", auth, query)
        if artifact == {}:
            if failure:
                raise failure
            raise ValueError("ARCHIVE_WRITE_NOT_CONFIRMED")
    pdf = verified_artifact(artifact, workspace, reference)
    final = read("/rest/v1/rpc/aqari_rent_receipt_pdf_get", auth, query)
    if final != artifact:
        raise ValueError("RECEIPT_CHANGED_DURING_EXPORT")
    verified_artifact(final, workspace, reference)
    return pdf


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body, mime="application/json; charset=utf-8", extra_headers=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "private, no-store, max-age=0")
        self.send_header("Vercel-CDN-Cache-Control", "no-store")
        self.send_header("Vary", "Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        if mime == "application/pdf":
            self.send_header("Content-Disposition", 'attachment; filename="rent-receipt.pdf"')
            self.send_header("Content-Length", str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.respond(405, b'{"error":"METHOD_NOT_ALLOWED"}')

    def do_POST(self):
        try:
            origin = self.headers.get("Origin")
            if origin and origin != "https://" + self.headers.get("Host", ""):
                raise PermissionError("ORIGIN_REJECTED")
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 2048:
                raise ValueError("INVALID_REQUEST")
            input_data = json.loads(self.rfile.read(size))
            pdf = export_archive(input_data, self.headers.get("Authorization"))
            self.respond(200, pdf, "application/pdf", {"X-Aqari-Archived-SHA256": hashlib.sha256(pdf).hexdigest()})
        except (PermissionError, HTTPError):
            self.respond(403, b'{"error":"ACCESS_DENIED"}')
        except RuntimeError:
            self.respond(503, b'{"error":"PDF_ARCHIVE_NOT_CONFIGURED"}')
        except (ValueError, KeyError, TypeError):
            self.respond(400, b'{"error":"RECEIPT_NOT_VERIFIED"}')
        except Exception:
            self.respond(503, b'{"error":"PDF_UNAVAILABLE"}')
