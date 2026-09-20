"""Manager-only PDF preview. It never saves or publishes the submitted wording."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
import importlib.util,json,re

spec=importlib.util.spec_from_file_location('rent_receipt_common',Path(__file__).with_name('rent-receipt.py'))
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
from lib.contract_template_pdf import render_contract_template

def rpc(name,payload,auth):
    config=(common.ROOT/'lib/release-config.js').read_text()
    url=re.search(r"url:\s*'([^']+)'",config).group(1);key=re.search(r"publishableKey:\s*'([^']+)'",config).group(1)
    raw=json.dumps(payload,separators=(',',':')).encode();req=Request(url+'/rest/v1/rpc/'+name,data=raw,method='POST',headers={'Authorization':auth,'apikey':key,'Accept':'application/json','Content-Type':'application/json'})
    with build_opener(common.NoRedirect).open(req,timeout=8) as response:return json.loads(response.read(1024*1024))

def export_preview(data,auth,rpc_call=rpc):
    if not isinstance(data,dict) or set(data)!={'workspaceId','template'} or not isinstance(data['workspaceId'],str) or not common.UUID.fullmatch(data['workspaceId']):raise ValueError('INVALID_REQUEST')
    if not isinstance(auth,str) or len(auth)>8192 or not re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',auth):raise PermissionError('AUTH_REQUIRED')
    context=rpc_call('aqari_rental_templates',{'p_workspace_id':data['workspaceId'],'p_action':'context','p_data':{}},auth)
    if context.get('workspace_id')!=data['workspaceId'] or context.get('can_publish') is not True:raise PermissionError('ACCESS_DENIED')
    return render_contract_template(data['template'])

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,status,body,mime='application/json; charset=utf-8'):
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Cache-Control','private, no-store, max-age=0');self.send_header('Vercel-CDN-Cache-Control','no-store');self.send_header('Vary','Authorization');self.send_header('X-Content-Type-Options','nosniff')
        if mime=='application/pdf':self.send_header('Content-Disposition','attachment; filename="aqari-contract-template-preview.pdf"')
        self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and origin!='https://'+self.headers.get('Host',''):raise PermissionError('ORIGIN_REJECTED')
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=120000:raise ValueError('INVALID_REQUEST')
            self.respond(200,export_preview(json.loads(self.rfile.read(size)),self.headers.get('Authorization')),'application/pdf')
        except (PermissionError,HTTPError):self.respond(403,b'{"error":"ACCESS_DENIED"}')
        except (ValueError,KeyError,TypeError):self.respond(400,b'{"error":"INVALID_TEMPLATE"}')
        except Exception:self.respond(503,b'{"error":"PREVIEW_UNAVAILABLE"}')
