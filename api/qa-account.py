"""Authenticated manager endpoint for isolated temporary QA identities on Preview."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import json,os,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.qa_accounts import UUID,provision_automation_account,disable_account

EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'
JWT=re.compile(r'^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
SHA=re.compile(r'^[0-9a-f]{40}$')
SAFE_ERROR=re.compile(r'^[A-Z][A-Z0-9_]{2,79}$')

def exact_candidate(requested):
 deployed=str(os.environ.get('VERCEL_GIT_COMMIT_SHA') or '').strip().lower()
 candidate=str(requested or '').strip().lower()
 if not SHA.fullmatch(deployed):raise RuntimeError('QA_PREVIEW_SHA_INVALID')
 if not SHA.fullmatch(candidate) or candidate!=deployed:raise ValueError('QA_CANDIDATE_SHA_MISMATCH')
 return candidate

def safe_error(exc):
 text=str(exc or '')
 for code in ('MFA_RECENT_REAUTH_REQUIRED','MFA_REQUIRED','QA_PREVIEW_ONLY','QA_STAGING_TARGET_REQUIRED','QA_AUTH_ADMIN_NOT_CONFIGURED','QA_STAGING_CONFIG_INVALID','QA_PREVIEW_SHA_INVALID'):
  if code in text:return code
 match=re.search(r'QA_[A-Z0-9_]{2,77}',text)
 return match.group(0) if match else 'QA_OPERATION_FAILED'

class handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def _reply(self,status,payload):
  body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store, max-age=0');self.send_header('Pragma','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_POST(self):
  try:
   if os.environ.get('VERCEL_ENV')!='preview' or os.environ.get('VERCEL_GIT_COMMIT_REF')!=EXPECTED_BRANCH:raise RuntimeError('QA_PREVIEW_ONLY')
   try:exact_candidate(self.headers.get('X-AQARI-Candidate-Sha'))
   except ValueError:self._reply(409,{'ok':False,'error':'QA_CANDIDATE_SHA_MISMATCH'});return
   auth=self.headers.get('Authorization','')
   if not isinstance(auth,str) or len(auth)>8192 or not JWT.fullmatch(auth):raise PermissionError('AUTH_REQUIRED')
   length=int(self.headers.get('Content-Length','0'))
   if length<=0 or length>32768:raise ValueError('INVALID_REQUEST')
   data=json.loads(self.rfile.read(length))
   if not isinstance(data,dict):raise ValueError('INVALID_REQUEST')
   workspace=str(data.get('workspaceId',''));action=str(data.get('action',''))
   if not UUID.fullmatch(workspace) or action not in('provision','disable'):raise ValueError('INVALID_REQUEST')
   if action=='provision':
    result=provision_automation_account(workspace,data.get('data'),auth,os.environ)
    self._reply(201,{'ok':True,**result});return
   account_id=str(data.get('accountId',''));reason=str(data.get('reason') or '')
   if not UUID.fullmatch(account_id) or not 3<=len(reason)<=500:raise ValueError('INVALID_REQUEST')
   result=disable_account(workspace,account_id,reason,auth,os.environ)
   self._reply(200,{'ok':True,**result})
  except PermissionError:self._reply(403,{'ok':False,'error':'ACCESS_DENIED'})
  except RuntimeError as exc:
   code=safe_error(exc);status=403 if code in ('MFA_RECENT_REAUTH_REQUIRED','MFA_REQUIRED') else 503 if code in ('QA_PREVIEW_ONLY','QA_STAGING_TARGET_REQUIRED','QA_AUTH_ADMIN_NOT_CONFIGURED','QA_STAGING_CONFIG_INVALID','QA_PREVIEW_SHA_INVALID') else 409
   self._reply(status,{'ok':False,'error':code})
  except (ValueError,KeyError,TypeError,json.JSONDecodeError):self._reply(400,{'ok':False,'error':'INVALID_REQUEST'})
  except Exception:self._reply(502,{'ok':False,'error':'QA_OPERATION_FAILED'})
 def do_GET(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})