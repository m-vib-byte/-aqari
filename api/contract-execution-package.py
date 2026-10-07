"""Authenticated preparation of execution PDFs, without posting a settlement."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
import base64, importlib.util, json, os, sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("execution_official_common", ROOT / "api/official-document.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
from lib.contract_execution_package import prepare
from lib.rent_pdf import render_receipt, verified_receipt

class SourceMfaChallenge(PermissionError):
    """An exact user-scoped source rejection, before the privileged commit."""

def read_execution_source(path, auth, body=None):
    try:
        return common.upstream(path, auth, body)
    except HTTPError as exc:
        message = None
        if exc.code == 403 and path == '/rest/v1/rpc/aqari_contract_execution_package_source':
            try:
                raw = exc.read(16385)
                error = json.loads(raw) if len(raw) <= 16384 else None
                if (isinstance(error, dict) and error.get('code') == '42501'
                        and error.get('message') in ('MFA_REQUIRED', 'MFA_RECENT_REAUTH_REQUIRED')):
                    message = error['message']
            except (ValueError, TypeError, OSError):
                pass
        if message:
            raise SourceMfaChallenge(message) from None
        raise

def renderer_config():
    # A server-only credential is required for the first render. Never obtain it
    # from a browser, request body or a different Supabase project.
    url, _ = common.config()
    key = os.environ.get('AQARI_PDF_ARCHIVE_SERVICE_KEY', '')
    target = os.environ.get('AQARI_PDF_ARCHIVE_SUPABASE_URL', '')
    if target != url or not key or len(key) > 8192:
        raise RuntimeError('PDF_ARCHIVE_NOT_CONFIGURED')
    if key.startswith('sb_secret_'):
        headers = {'apikey': key}
    else:
        try:
            parts = key.split('.')
            claims = json.loads(base64.urlsafe_b64decode(parts[1] + '=' * (-len(parts[1]) % 4)))
            if len(parts) != 3 or not isinstance(claims, dict) or claims.get('role') != 'service_role' or claims.get('ref') != url.split('//')[1].split('.')[0]:
                raise ValueError()
        except (ValueError, IndexError, TypeError):
            raise RuntimeError('PDF_ARCHIVE_NOT_CONFIGURED') from None
        # Supabase verifies this JWT; the local claim check only prevents an
        # accidental cross-project configuration before sending any document.
        headers = {'apikey': key, 'Authorization': 'Bearer ' + key}
    headers.update({'Content-Type': 'application/json', 'Accept': 'application/json'})
    return url, headers

def commit_package(data):
    url, headers = renderer_config()
    request = Request(url + '/rest/v1/rpc/aqari_contract_execution_package_commit',
                      data=json.dumps(data, separators=(',', ':')).encode(), headers=headers, method='POST')
    with build_opener(common.NoRedirect).open(request, timeout=8) as response:
        raw = response.read(16385)
        if len(raw) > 16384: raise ValueError('INVALID_ARCHIVE_RESPONSE')
        result = json.loads(raw)
        if not isinstance(result, dict) or not result.get('package_id'):
            raise ValueError('ARCHIVE_WRITE_NOT_CONFIRMED')
        return result


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def respond(self, status, data):
        raw=json.dumps(data,separators=(",",":"),allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type","application/json")
        self.send_header("Cache-Control","no-store")
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Content-Length",str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        # Configuration only: never claims database or signing acceptance.
        # Return no project identifiers, credentials or document metadata.
        try:
            renderer_config()
            self.respond(200, {"configured": True})
        except Exception:
            self.respond(503, {"configured": False})
    def do_POST(self):
        try:
            length=int(self.headers.get("Content-Length","0"))
            if not 0 < length <= 262144:
                raise ValueError("INVALID_REQUEST")
            data=json.loads(self.rfile.read(length))
            result=prepare(data,self.headers.get("Authorization"),read=read_execution_source,
                           commit=commit_package,render_document=common.render_official_document,
                           render_receipt=render_receipt,verify_receipt=verified_receipt)
            self.respond(200,result)
        except SourceMfaChallenge as exc:
            self.respond(403,{"error":str(exc),"code":"42501"})
        except PermissionError:
            self.respond(403,{"error":"ACCESS_DENIED"})
        except HTTPError as exc:
            self.respond(403 if exc.code in (401,403) else 502,{"error":"EXECUTION_PREPARATION_FAILED"})
        except RuntimeError:
            self.respond(503,{"error":"EXECUTION_PREPARATION_UNAVAILABLE"})
        except Exception:
            self.respond(400,{"error":"EXECUTION_PREPARATION_NOT_CONFIRMED"})
