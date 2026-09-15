"""Authenticated manager endpoint for isolated temporary QA identities on Preview."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.error import HTTPError
import json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.qa_accounts import provision_automation_account,disable_account,UUID

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
   auth=self.headers.get('Authorization','')
   if action=='provision':
    request=data.get('data');result=provision_automation_account(workspace,request,auth);self._reply(201,{'ok':True,**result});return
   account_id=str(data.get('accountId',''));reason=data.get('reason')
   result=disable_account(workspace,account_id,reason,auth);self._reply(200,{'ok':True,**result})
  except PermissionError:self._reply(403,{'ok':False,'error':'ACCESS_DENIED'})
  except HTTPError as exc:self._reply(409 if exc.code in(400,409,422) else 502,{'ok':False,'error':'QA_UPSTREAM_REJECTED'})
  except RuntimeError as exc:
   code=str(exc)
   if code in('QA_PREVIEW_ONLY','QA_STAGING_TARGET_REQUIRED','QA_AUTH_ADMIN_NOT_CONFIGURED','QA_STAGING_CONFIG_INVALID'):self._reply(503,{'ok':False,'error':code})
   else:self._reply(409,{'ok':False,'error':'QA_OPERATION_NOT_CONFIRMED'})
  except (ValueError,KeyError,TypeError,json.JSONDecodeError):self._reply(400,{'ok':False,'error':'INVALID_REQUEST'})
  except Exception:self._reply(500,{'ok':False,'error':'QA_OPERATION_FAILED'})
 def do_GET(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})
