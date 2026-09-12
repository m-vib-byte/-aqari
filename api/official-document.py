"""Authenticated official-document PDF export; values are read from the immutable DB archive."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
import base64, hashlib, json, os, re, sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.official_document_pdf import verified_version, render_official_document

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
PDF_LIMIT = 2 * 1024 * 1024
RENDERER_VERSION = 'v267-official-pdf-archive-1'
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): raise ValueError("UPSTREAM_REDIRECT_REJECTED")

def config():
    source=(ROOT/"lib/release-config.js").read_text(); url=re.search(r"url:\s*'([^']+)'",source).group(1); key=re.search(r"publishableKey:\s*'([^']+)'",source).group(1)
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co",url) or not key.startswith("sb_publishable_"): raise ValueError("INVALID_CONFIG")
    return url,key

def upstream(path, auth, body=None):
    url,key=config(); raw=None if body is None else json.dumps(body,separators=(",",":"),ensure_ascii=False).encode()
    headers={"Authorization":auth,"apikey":key,"Accept":"application/json"}
    if raw is not None: headers["Content-Type"]="application/json"
    request=Request(url+path,data=raw,headers=headers,method="POST" if raw is not None else "GET")
    with build_opener(NoRedirect).open(request,timeout=8) as response:
        data=response.read(4*1024*1024+1)
        if len(data)>4*1024*1024: raise ValueError("STATE_TOO_LARGE")
        return json.loads(data)

def commit_archive(data):
    # A server-only credential is required for the first render. Never obtain it
    # from a browser, request body or a different Supabase project.
    url, _ = config()
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
    request = Request(url + '/rest/v1/rpc/aqari_official_pdf_commit',
                      data=json.dumps(data, separators=(',', ':')).encode(), headers=headers, method='POST')
    with build_opener(NoRedirect).open(request, timeout=8) as response:
        raw = response.read(16385)
        if len(raw) > 16384: raise ValueError('INVALID_ARCHIVE_RESPONSE')
        result = json.loads(raw)
        if not isinstance(result, dict) or result.get('archived') is not True:
            raise ValueError('ARCHIVE_WRITE_NOT_CONFIRMED')
        return result

def verified_artifact(value, workspace, document_id, version, snapshot_hash):
    if (not isinstance(value, dict) or value.get('workspace_id') != workspace
        or value.get('series_id') != document_id or type(value.get('version')) is not int
        or value['version'] != version or value.get('snapshot_sha256') != snapshot_hash
        or value.get('document_status') not in ('issued', 'void')
        or not isinstance(value.get('pdf_base64'), str) or len(value['pdf_base64']) > 2796204):
        raise ValueError('PDF_ARCHIVE_SCOPE_MISMATCH')
    pdf = base64.b64decode(value['pdf_base64'], validate=True)
    if (not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b'%PDF-')
        or hashlib.sha256(pdf).hexdigest() != value.get('pdf_sha256')):
        raise ValueError('PDF_ARCHIVE_INTEGRITY_FAILED')
    return pdf

def export_archive(request_data, auth, read=upstream, commit=commit_archive, render=render_official_document):
    if not isinstance(request_data,dict) or set(request_data)!={"workspaceId","documentId","version"}: raise ValueError("INVALID_REQUEST")
    workspace,document_id,version=request_data["workspaceId"],request_data["documentId"],request_data["version"]
    if not UUID.fullmatch(str(workspace)) or not UUID.fullmatch(str(document_id)) or type(version) is not int or not 1<=version<=10000: raise ValueError("INVALID_REQUEST")
    if not isinstance(auth,str) or len(auth)>8192 or not re.fullmatch(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",auth): raise PermissionError("AUTH_REQUIRED")
    user=read("/auth/v1/user",auth); uid=user.get("id") if isinstance(user,dict) else None
    if not UUID.fullmatch(str(uid)): raise PermissionError("AUTH_REQUIRED")
    result=read("/rest/v1/rpc/aqari_official_document_register",auth,{"p_workspace_id":workspace,"p_action":"get","p_data":{"id":document_id}})
    series,snapshot=verified_version(result,document_id,version)
    if series.get("workspace_id")!=workspace: raise PermissionError("ACCESS_DENIED")
    query = {'p_workspace_id':workspace, 'p_document_id':document_id, 'p_version':version}
    artifact = read('/rest/v1/rpc/aqari_official_pdf_get', auth, query)
    if artifact == {}:
        if series.get('status') != 'issued': raise ValueError('VOID_DOCUMENT_ORIGINAL_UNAVAILABLE')
        pdf = render(series, snapshot)
        if not 8 <= len(pdf) <= PDF_LIMIT or not pdf.startswith(b'%PDF-'): raise ValueError('INVALID_RENDERED_PDF')
        # A timed-out response may follow a successful commit. Always read back;
        # never return freshly generated bytes as if persistence were proven.
        failure = None
        try:
            commit({**query, 'p_actor_id':uid, 'p_snapshot_sha256':snapshot['content_sha256'],
                    'p_pdf_base64':base64.b64encode(pdf).decode(), 'p_pdf_sha256':hashlib.sha256(pdf).hexdigest(),
                    'p_renderer_version':RENDERER_VERSION})
        except Exception as exc:
            failure = exc
        artifact = read('/rest/v1/rpc/aqari_official_pdf_get', auth, query)
        if artifact == {}:
            if failure: raise failure
            raise ValueError('ARCHIVE_WRITE_NOT_CONFIRMED')
    pdf = verified_artifact(artifact, workspace, document_id, version, snapshot['content_sha256'])
    # Re-authorize after downloading the bytes, including revocation during a
    # slow read or first render. A changed status must be fetched afresh.
    final=read("/rest/v1/rpc/aqari_official_document_register",auth,{"p_workspace_id":workspace,"p_action":"get","p_data":{"id":document_id}})
    final_series,final_snapshot=verified_version(final,document_id,version)
    if final_series!=series or final_snapshot!=snapshot: raise ValueError("DOCUMENT_CHANGED_DURING_EXPORT")
    if artifact['document_status'] != final_series.get('status'): raise ValueError('DOCUMENT_CHANGED_DURING_EXPORT')
    return pdf, artifact['document_status']

def export_pdf(request_data, auth, read=upstream, commit=commit_archive, render=render_official_document):
    return export_archive(request_data, auth, read, commit, render)[0]

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<=0 or length>131072: raise ValueError("INVALID_REQUEST")
            data=json.loads(self.rfile.read(length)); pdf,status=export_archive(data,self.headers.get("Authorization"))
            self.send_response(200); self.send_header("Content-Type","application/pdf"); self.send_header("Content-Disposition","attachment; filename=aqari-official-document.pdf"); self.send_header("Cache-Control","no-store"); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('X-Aqari-Archived-SHA256',hashlib.sha256(pdf).hexdigest()); self.send_header('X-Aqari-Document-Status',status); self.send_header("Content-Length",str(len(pdf))); self.end_headers(); self.wfile.write(pdf)
        except (PermissionError,HTTPError) as exc:
            self.send_error(403 if not isinstance(exc,HTTPError) or exc.code in (401,403) else 502)
        except RuntimeError:
            self.send_error(503, 'PDF archive is not configured')
        except Exception:
            self.send_error(400)
