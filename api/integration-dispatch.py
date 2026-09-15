"""CRON_SECRET-protected integration outbox dispatcher."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import hmac,json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.integration_dispatch import dispatch_once

class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def _reply(self,status,payload):
        body=json.dumps(payload,separators=(',',':')).encode()
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        secret=os.environ.get('CRON_SECRET','');auth=self.headers.get('Authorization','')
        if not secret or len(secret)>8192 or not hmac.compare_digest(auth,'Bearer '+secret):
            self._reply(401,{'ok':False});return
        try:
            result=dispatch_once(5)
            self._reply(200,{'ok':True,**result})
        except RuntimeError as exc:
            self._reply(503,{'ok':False,'error':str(exc)[:120]})
        except Exception:
            self._reply(500,{'ok':False,'error':'DISPATCH_FAILED'})
    def do_POST(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})
