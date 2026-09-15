"""Authenticated manager proxy for isolated temporary QA identities on Preview."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError
import json,os,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.qa_accounts import UUID

EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co'
EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'
JWT=re.compile(r'^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
SAFE_ERROR=re.compile(r'^[A-Z][A-Z0-9_]{2,79}$')

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('UPSTREAM_REDIRECT_REJECTED')

def public_key():
 source=(Path(__file__).resolve().parents[1]/'lib/release-config.js').read_text()
 url=re.search(r"url:\s*'([^']+)'",source);key=re.search(r"publishableKey:\s*'([^']+)'",source)
 if not url or not key or url.group(1)!=EXPECTED_URL or not key.group(1).startswith('sb_publishable_'):raise RuntimeError('QA_STAGING_CONFIG_INVALID')
 return key.group(1)

def edge_request(payload,auth):
 if os.environ.get('VERCEL_ENV')!='preview' or os.environ.get('VERCEL_GIT_COMMIT_REF')!=EXPECTED_BRANCH:raise RuntimeError('QA_PREVIEW_ONLY')
 if not isinstance(auth,str) or len(auth)>8192 or not JWT.fullmatch(auth):raise PermissionError('AUTH_REQUIRED')
 raw=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
 req=Request(EXPECTED_URL+'/functions/v1/qa-account-admin',data=raw,method='POST',headers={'apikey':public_key(),'Authorization':auth,'Content-Type':'application/json','Accept':'application/json'})
 status=0;body=b''
 try:
  with build_opener(NoRedirect).open(req,timeout=12) as response:
   status=int(getattr(response,'status',200));body=response.read(131073)
 except HTTPError as exc:
  status=int(exc.code);body=exc.read(131073)
 if len(body)>131072:raise RuntimeError('QA_UPSTREAM_RESPONSE_TOO_LARGE')
 try:data=json.loads(body or b'{}')
 except Exception:raise RuntimeError('QA_EDGE_RESPONSE_INVALID') from None
 if not isinstance(data,dict):raise RuntimeError('QA_EDGE_RESPONSE_INVALID')
 if status not in(200,201,400,401,403,409,413,503):raise RuntimeError('QA_EDGE_STATUS_INVALID')
 if status>=400:
  code=data.get('error') or data.get('message')
  data={'ok':False,'error':code if isinstance(code,str) and SAFE_ERROR.fullmatch(code) else 'QA_UPSTREAM_REJECTED'}
 return status,data

class handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def _reply(self,status,payload):
  body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store, max-age=0');self.send_header('Pragma','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_POST(self):
  try:
   length=int(self.headers.get('Content-Length','0'))
   if length<=0 or length>32768:raise ValueError('INVALID_REQUEST')
   data=json.loads(self.rfile.read(length));workspace=str(data.get('workspaceId','')) if isinstance(data,dict) else '';action=data.get('action') if isinstance(data,dict) else None
   if not UUID.fullmatch(workspace) or action not in('provision','disable'):raise ValueError('INVALID_REQUEST')
   payload={'workspaceId':workspace,'action':action}
   if action=='provision':payload['data']=data.get('data')
   else:payload.update({'accountId':str(data.get('accountId','')),'reason':data.get('reason')})
   status,result=edge_request(payload,self.headers.get('Authorization',''));self._reply(status,result)
  except PermissionError:self._reply(403,{'ok':False,'error':'ACCESS_DENIED'})
  except RuntimeError as exc:
   code=str(exc)
   if code in('QA_PREVIEW_ONLY','QA_STAGING_CONFIG_INVALID'):self._reply(503,{'ok':False,'error':code})
   else:self._reply(502,{'ok':False,'error':'QA_UPSTREAM_REJECTED'})
  except (ValueError,KeyError,TypeError,json.JSONDecodeError):self._reply(400,{'ok':False,'error':'INVALID_REQUEST'})
  except Exception:self._reply(500,{'ok':False,'error':'QA_OPERATION_FAILED'})
 def do_GET(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})
