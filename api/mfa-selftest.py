"""Protected Preview-only MFA diagnostic endpoint.

Vercel Deployment Protection is the outer access boundary. The endpoint is additionally
pinned to the exact Preview branch and requires the caller to supply the exact deployed SHA.
It returns only sanitized stage/boolean evidence and never credentials, tokens, OTPs or TOTP secrets.
"""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,parse_qs
import json,os,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.mfa_selftest import run_selftest

SHA=re.compile(r'^[0-9a-f]{40}$')

class handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def _reply(self,status,payload):
  body=json.dumps(payload,separators=(',',':')).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store, max-age=0');self.send_header('Pragma','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_GET(self):
  try:
   requested=(parse_qs(urlparse(self.path).query).get('run') or [''])[0].lower();deployed=str(os.environ.get('VERCEL_GIT_COMMIT_SHA') or '').lower()
   if not SHA.fullmatch(requested) or requested!=deployed:self._reply(409,{'ok':False,'error':'EXACT_PREVIEW_SHA_REQUIRED'});return
   result=run_selftest();self._reply(200 if result.get('ok') else 503,result)
  except RuntimeError as exc:
   code=str(exc);self._reply(503,{'ok':False,'error':code if re.fullmatch(r'[A-Z0-9_:]{3,120}',code) else 'MFA_SELFTEST_FAILED'})
  except Exception:self._reply(500,{'ok':False,'error':'MFA_SELFTEST_FAILED'})
 def do_POST(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})
