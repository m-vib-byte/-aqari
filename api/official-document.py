"""Authenticated official-document PDF export; values are read from the immutable DB archive."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
import json, re, sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib.official_document_pdf import verified_version, render_official_document

ROOT = Path(__file__).resolve().parents[1]
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
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

def export_pdf(request_data, auth, read=upstream):
    if not isinstance(request_data,dict) or set(request_data)!={"workspaceId","documentId","version"}: raise ValueError("INVALID_REQUEST")
    workspace,document_id,version=request_data["workspaceId"],request_data["documentId"],request_data["version"]
    if not UUID.fullmatch(str(workspace)) or not UUID.fullmatch(str(document_id)) or type(version) is not int or not 1<=version<=10000: raise ValueError("INVALID_REQUEST")
    if not isinstance(auth,str) or len(auth)>8192 or not re.fullmatch(r"Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",auth): raise PermissionError("AUTH_REQUIRED")
    user=read("/auth/v1/user",auth); uid=user.get("id") if isinstance(user,dict) else None
    if not UUID.fullmatch(str(uid)): raise PermissionError("AUTH_REQUIRED")
    result=read("/rest/v1/rpc/aqari_official_document_register",auth,{"p_workspace_id":workspace,"p_action":"get","p_data":{"id":document_id}})
    series,snapshot=verified_version(result,document_id,version)
    if series.get("workspace_id")!=workspace: raise PermissionError("ACCESS_DENIED")
    # Re-read immediately before rendering so a revoked membership cannot reuse an earlier response.
    final=read("/rest/v1/rpc/aqari_official_document_register",auth,{"p_workspace_id":workspace,"p_action":"get","p_data":{"id":document_id}})
    final_series,final_snapshot=verified_version(final,document_id,version)
    if final_series!=series or final_snapshot!=snapshot: raise ValueError("DOCUMENT_CHANGED_DURING_EXPORT")
    return render_official_document(series,snapshot)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length=int(self.headers.get("Content-Length","0"))
            if length<=0 or length>131072: raise ValueError("INVALID_REQUEST")
            data=json.loads(self.rfile.read(length)); pdf=export_pdf(data,self.headers.get("Authorization"))
            self.send_response(200); self.send_header("Content-Type","application/pdf"); self.send_header("Content-Disposition","attachment; filename=aqari-official-document.pdf"); self.send_header("Cache-Control","no-store"); self.send_header("Content-Length",str(len(pdf))); self.end_headers(); self.wfile.write(pdf)
        except (PermissionError,HTTPError) as exc:
            self.send_error(403 if not isinstance(exc,HTTPError) or exc.code in (401,403) else 502)
        except Exception:
            self.send_error(400)
