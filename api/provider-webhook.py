"""Signed webhook ingress. Verified KNET success is atomically settled server-side."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from urllib.request import Request,urlopen
import json,os,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.provider_webhook import verify_and_normalize,UUID

SUPABASE_URL=re.compile(r'^https://[a-z0-9]+\.supabase\.co$')
def rpc(name,payload,env=os.environ,post=urlopen):
    url=env.get('AQARI_SUPABASE_URL','');key=env.get('AQARI_SUPABASE_SERVICE_ROLE_KEY','')
    if not SUPABASE_URL.fullmatch(url) or len(key)<32: raise RuntimeError('SERVER_DATABASE_CREDENTIALS_NOT_CONFIGURED')
    raw=json.dumps(payload,separators=(',',':')).encode();req=Request(url+'/rest/v1/rpc/'+name,data=raw,method='POST',headers={'Authorization':'Bearer '+key,'apikey':key,'Content-Type':'application/json','Accept':'application/json'})
    with post(req,timeout=12) as response:
        body=response.read(65537)
        if len(body)>65536:raise RuntimeError('DATABASE_RESPONSE_TOO_LARGE')
        return json.loads(body or b'null')

def record(workspace,receipt,env=os.environ,post=urlopen):return rpc('aqari_record_verified_webhook',{'p_workspace_id':workspace,'p_receipt':receipt},env,post)
def settle_knet(receipt_id,env=os.environ,post=urlopen):return rpc('aqari_process_knet_webhook',{'p_receipt_id':receipt_id},env,post)

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            query=parse_qs(urlparse(self.path).query);workspace=query.get('workspace',[''])[0];provider=query.get('provider',[''])[0];length=int(self.headers.get('Content-Length','0'))
            if not UUID.fullmatch(workspace) or length<=0 or length>131072: raise ValueError('INVALID_REQUEST')
            raw=self.rfile.read(length);headers={k.lower():v for k,v in self.headers.items()};receipt=verify_and_normalize(workspace,provider,raw,headers);stored=record(workspace,receipt)
            if not isinstance(stored,dict) or not UUID.fullmatch(str(stored.get('id',''))):raise RuntimeError('WEBHOOK_RECORD_NOT_CONFIRMED')
            result={'recorded':stored}
            if provider=='knet':
                settlement=settle_knet(str(stored['id']))
                if not isinstance(settlement,dict):raise RuntimeError('KNET_SETTLEMENT_NOT_CONFIRMED')
                result['settlement']=settlement
            body=json.dumps(result,separators=(',',':')).encode();self.send_response(200 if provider=='knet' else 202);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        except PermissionError:self.send_error(401)
        except RuntimeError:self.send_error(503)
        except Exception:self.send_error(400)