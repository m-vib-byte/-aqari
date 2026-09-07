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
from lib.rent_pdf import verified_receipt, render_receipt

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

    check_member()
    states = read("/rest/v1/aqari_app_state?" + urlencode({"select": "workspace_id,payload", "workspace_id": "eq." + workspace}), auth)
    if not isinstance(states, list) or len(states) != 1 or states[0].get("workspace_id") != workspace:
        raise PermissionError("ACCESS_DENIED")
    saved = verified_receipt(states[0]["payload"], reference)
    check_member()
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
