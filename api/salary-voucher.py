"""Authenticated salary voucher PDF generated from the immutable salary registry."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
import json, re, sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.salary_voucher_pdf import render_salary_voucher

ROOT=Path(__file__).resolve().parents[1]
UUID=re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",re.I)
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError("UPSTREAM_REDIRECT_REJECTED")

def config():
    source=(ROOT/"lib/release-config.js").read_text();url=re.search(r"url:\s*'([^']+)'",source).group(1);key=re.search(r"publishableKey:\s*'([^']+)'",source).group(1)
    if not re.fullmatch(r"https://[a-z0-9]+\.supabase\.co",url) or not key.startswith("sb_publishable_"): raise ValueError("INVALID_CONFIG")
    return url,key

def read_cycle(body,auth):
    url,key=config();raw=json.dumps(body,separators=(",",":")).encode();request=Request(url+"/rest/v1/rpc/aqari_hr_cycle",data=raw,headers={"Authorization":auth,"apikey":key,"Content-Type":"application/json","Accept":"application/json"},method="POST")
    with build_opener(NoRedirect).open(request,timeout=8) as response:
        data=response.read(4*1024*1024+1)
        if len(data)>4*1024*1024: raise ValueError("STATE_TOO_LARGE")
        return json.loads(data)

def export_pdf(data,auth,read=read_cycle,render=render_salary_voucher):
    if not isinstance(data,dict) or set(data)!={"workspaceId","employeeId","payrollId"}: raise ValueError("INVALID_REQUEST")
    if not all(UUID.fullmatch(str(data[key])) for key in data): raise ValueError("INVALID_REQUEST")
    if not isinstance(auth,str) or len(auth)>8192 or not auth.startswith("Bearer "): raise PermissionError("AUTH_REQUIRED")
    result=read({"p_workspace_id":data["workspaceId"],"p_action":"salary_export","p_data":{"employee_id":data["employeeId"],"payroll_id":data["payrollId"]}},auth)
    registry=result.get("registry") if isinstance(result,dict) else None;payload=result.get("payload") if isinstance(result,dict) else None;token=result.get("verification_token") if isinstance(result,dict) else None
    if not isinstance(registry,dict) or not isinstance(payload,dict) or registry.get("workspace_id")!=data["workspaceId"] or registry.get("employee_id")!=data["employeeId"] or registry.get("payroll_id")!=data["payrollId"]: raise PermissionError("SCOPE_MISMATCH")
    return render(payload,{**registry,"verification_token":token})

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length=int(self.headers.get("Content-Length","0"));
            if length<=0 or length>65536: raise ValueError("INVALID_REQUEST")
            pdf=export_pdf(json.loads(self.rfile.read(length)),self.headers.get("Authorization"))
            self.send_response(200);self.send_header("Content-Type","application/pdf");self.send_header("Content-Disposition","attachment; filename=aqari-salary-voucher.pdf");self.send_header("Cache-Control","no-store");self.send_header("X-Content-Type-Options","nosniff");self.send_header("Content-Length",str(len(pdf)));self.end_headers();self.wfile.write(pdf)
        except (PermissionError,HTTPError) as exc:self.send_error(403 if not isinstance(exc,HTTPError) or exc.code in (401,403) else 502)
        except Exception:self.send_error(400)

