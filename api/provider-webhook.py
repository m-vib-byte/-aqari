"""Signed webhook ingress. It records a verified event; payment posting remains a separate idempotent workflow."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from urllib.request import Request,urlopen
import json,os,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.provider_webhook import verify_and_normalize,UUID

SUPABASE_URL=re.compile(r'^https://[a-z0-9]+\.supabase\.co$')
def record(workspace,receipt,env=os.environ,post=urlopen):
    url=env.get('AQARI_SUPABASE_URL','');key=env.get('AQARI_SUPABASE_SERVICE_ROLE_KEY','')
    if not SUPABASE_URL.fullmatch(url) or len(key)<32: raise RuntimeError('SERVER_DATABASE_CREDENTIALS_NOT_CONFIGURED')
    raw=json.dumps({'p_workspace_id':workspace,'p_receipt':receipt},separators=(',',':')).encode()
    req=Request(url+'/rest/v1/rpc/aqari_record_verified_webhook',data=raw,method='POST',headers={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':'application/json','Accept':'application/json'})
    with post(req,timeout=8) as response:return json.loads(response.read(65537))

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            query=parse_qs(urlparse(self.path).query);workspace=query.get('workspace',[''])[0];provider=query.get('provider',[''])[0]
            length=int(self.headers.get('Content-Length','0'))
            if not UUID.fullmatch(workspace) or length<=0 or length>131072: raise ValueError('INVALID_REQUEST')
            raw=self.rfile.read(length);headers={k.lower():v for k,v in self.headers.items()};receipt=verify_and_normalize(workspace,provider,raw,headers);result=record(workspace,receipt)
            body=json.dumps(result,separators=(',',':')).encode();self.send_response(202);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        except PermissionError:self.send_error(401)
        except RuntimeError:self.send_error(503)
        except Exception:self.send_error(400)
