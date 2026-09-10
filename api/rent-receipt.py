"""Authenticated PDF export. Never accept client-provided amounts, names or HTML."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlencode
from urllib.error import HTTPError
import json
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.rent_pdf import verified_receipt, render_receipt, money

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("UPSTREAM_REDIRECT_REJECTED")


def upstream(path, auth):
    config = (ROOT / "lib/release-config.js").read_text()
    url = re.search(r"url:\s*'([^']+)'", config).group(1)
    key = re.search(r"publishableKey:\s*'([^']+)'", config).group(1)
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co", url) or not key.startswith("sb_publishable_"):
        raise ValueError("INVALID_CONFIG")
    request = Request(url + path, headers={"Authorization": auth, "apikey": key, "Accept": "application/json"})
    with build_opener(NoRedirect).open(request, timeout=8) as response:
        body = response.read(20 * 1024 * 1024 + 1)
        if len(body) > 20 * 1024 * 1024:
            raise ValueError("STATE_TOO_LARGE")
        return json.loads(body)


def export_pdf(input_data, auth, read=upstream):
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
    # Staff reads use the same server-side section projection as the app.
    # A legitimate accountant must not need unrestricted bulk-state access.
    state = read("/rest/v1/rpc/aqari_read_state_v267?" + urlencode({"p_workspace_id": workspace}), auth)
    if not isinstance(state, dict) or state.get("workspace_id") != workspace or not isinstance(state.get("payload"), dict):
        raise PermissionError("ACCESS_DENIED")
    saved = verified_receipt(state["payload"], reference)
    check_member()
    verify_scoped_payment(workspace, reference, saved, auth, read)
    return render_receipt(saved)


def verify_scoped_payment(workspace, reference, saved, auth, read):
    """Recheck property/section RLS and the immutable source in one final read."""
    # The existing composite foreign key joins workspace_id and lease_id. An
    # inner embed requires both payment and lease row policies to allow access
    # in the same statement, including grants revoked after the state read.
    path = "/rest/v1/aqari_rent_payments?" + urlencode({
        "select": "workspace_id,lease_id,reference,amount,period,paid_at,status,payment_method,record,receipt,lease:aqari_leases!inner(id,workspace_id,external_ref,contract_no)",
        "workspace_id": "eq." + workspace, "reference": "eq." + reference,
        "limit": "2",
    })
    rows = read(path, auth)
    if not isinstance(rows, list) or len(rows) != 1 or not isinstance(rows[0], dict):
        raise PermissionError("ACCESS_DENIED")
    payment = rows[0]
    lease = payment.get("lease")
    if (payment.get("workspace_id") != workspace or payment.get("reference") != reference
            or not UUID.fullmatch(str(payment.get("lease_id", "")))
            or not isinstance(lease, dict) or lease.get("workspace_id") != workspace
            or lease.get("id") != payment["lease_id"]):
        raise PermissionError("ACCESS_DENIED")
    contract = saved["contract"]
    if (str(contract.get("id")) != str(lease.get("external_ref"))
            or contract.get("contract_no") != lease.get("contract_no")):
        raise ValueError("CONTRACT_LINK_MISMATCH")
    if payment.get("receipt") != saved:
        raise ValueError("RECEIPT_SNAPSHOT_MISMATCH")
    verified_receipt(dict(rentReceiptsV267=[saved], collections=[saved["record"]],
                          contractsV202=[{"id": lease["external_ref"]}],
                          rentLedgerV202=[payment.get("record")]), reference)
    row = saved["record"]
    if (money(payment.get("amount")) != money(row[2]) or payment.get("period") != row[8] + "-01"
            or payment.get("paid_at") != row[5] or payment.get("status") != row[3]
            or payment.get("payment_method") != row[9]):
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
    # Recheck identity and RLS immediately before returning the private document.
    if account() != owner or lease() != l:
        raise PermissionError("ACCESS_DENIED")
    return render_receipt(saved)


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body, mime="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "private, no-store, max-age=0")
        self.send_header("Vercel-CDN-Cache-Control", "no-store")
        self.send_header("Vary", "Authorization")
        self.send_header("X-Content-Type-Options", "nosniff")
        if mime == "application/pdf":
            self.send_header("Content-Disposition", 'attachment; filename="rent-receipt.pdf"')
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
            pdf = export_pdf(input_data, self.headers.get("Authorization"))
            self.respond(200, pdf, "application/pdf")
        except (PermissionError, HTTPError):
            self.respond(403, b'{"error":"ACCESS_DENIED"}')
        except (ValueError, KeyError, TypeError):
            self.respond(400, b'{"error":"RECEIPT_NOT_VERIFIED"}')
        except Exception:
            self.respond(503, b'{"error":"PDF_UNAVAILABLE"}')
