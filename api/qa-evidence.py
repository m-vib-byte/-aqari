"""Persist sanitized Phase-B authenticated acceptance evidence for the exact Preview SHA."""
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
SHA=re.compile(r'^[0-9a-f]{40}$')
HOST=re.compile(r'^aqari-[a-z0-9-]+\.vercel\.app$')
SAFE_ERROR=re.compile(r'^[A-Z][A-Z0-9_]{2,79}$')

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('UPSTREAM_REDIRECT_REJECTED')

def public_key():
 source=(Path(__file__).resolve().parents[1]/'lib/release-config.js').read_text()
 url=re.search(r"url:\s*'([^']+)'",source);key=re.search(r"publishableKey:\s*'([^']+)'",source)
 if not url or not key or url.group(1)!=EXPECTED_URL or not key.group(1).startswith('sb_publishable_'):raise RuntimeError('QA_STAGING_CONFIG_INVALID')
 return key.group(1)

def exact_candidate(requested):
 deployed=str(os.environ.get('VERCEL_GIT_COMMIT_SHA') or '').strip().lower()
 candidate=str(requested or '').strip().lower()
 if not SHA.fullmatch(deployed):raise RuntimeError('QA_PREVIEW_SHA_INVALID')
 if not SHA.fullmatch(candidate) or candidate!=deployed:raise ValueError('QA_CANDIDATE_SHA_MISMATCH')
 return candidate

def rpc(payload,auth,candidate):
 if os.environ.get('VERCEL_ENV')!='preview' or os.environ.get('VERCEL_GIT_COMMIT_REF')!=EXPECTED_BRANCH:raise RuntimeError('QA_PREVIEW_ONLY')
 sha=exact_candidate(candidate);host=str(os.environ.get('VERCEL_URL') or '').lower()
 if not HOST.fullmatch(host):raise RuntimeError('QA_PREVIEW_HOST_INVALID')
 if not isinstance(auth,str) or len(auth)>8192 or not JWT.fullmatch(auth):raise PermissionError('AUTH_REQUIRED')
 body={
  'p_workspace_id':payload['workspaceId'],
  'p_candidate_sha':sha,
  'p_preview_host':host,
  'p_results':payload['results']
 }
 raw=json.dumps(body,separators=(',',':'),ensure_ascii=False).encode()
 req=Request(EXPECTED_URL+'/rest/v1/rpc/aqari_qa_acceptance_report',data=raw,method='POST',headers={'apikey':public_key(),'Authorization':auth,'Content-Type':'application/json','Accept':'application/json'})
 status=0;response=b''
 try:
  with build_opener(NoRedirect).open(req,timeout=12) as result:
   status=int(getattr(result,'status',200));response=result.read(65537)
 except HTTPError as exc:
  status=int(exc.code);response=exc.read(65537)
 if len(response)>65536:raise RuntimeError('QA_EVIDENCE_RESPONSE_TOO_LARGE')
 try:data=json.loads(response or b'{}')
 except Exception:raise RuntimeError('QA_EVIDENCE_RESPONSE_INVALID') from None
 if status>=400:
  code=data.get('message') if isinstance(data,dict) else None
  match=SAFE_ERROR.fullmatch(str(code or ''))
  return status,{'ok':False,'error':match.group(0) if match else 'QA_EVIDENCE_REJECTED'}
 if not isinstance(data,dict) or data.get('ok') is not True:return 502,{'ok':False,'error':'QA_EVIDENCE_RESPONSE_INVALID'}
 return 200,{'ok':True,'id':data.get('id'),'passed':data.get('passed'),'candidate_sha':data.get('candidate_sha')}

class handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def _reply(self,status,payload):
  body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store, max-age=0');self.send_header('Pragma','no-cache');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
 def do_POST(self):
  try:
   candidate=self.headers.get('X-AQARI-Candidate-Sha')
   try:exact_candidate(candidate)
   except ValueError:self._reply(409,{'ok':False,'error':'QA_CANDIDATE_SHA_MISMATCH'});return
   length=int(self.headers.get('Content-Length','0'))
   if length<=0 or length>32768:raise ValueError('INVALID_REQUEST')
   data=json.loads(self.rfile.read(length))
   if not isinstance(data,dict):raise ValueError('INVALID_REQUEST')
   workspace=str(data.get('workspaceId',''));results=data.get('results')
   if not UUID.fullmatch(workspace) or not isinstance(results,dict):raise ValueError('INVALID_REQUEST')
   encoded=json.dumps(results,separators=(',',':'),ensure_ascii=False)
   if len(encoded.encode())>16384:raise ValueError('INVALID_REQUEST')
   status,result=rpc({'workspaceId':workspace,'results':results},self.headers.get('Authorization',''),candidate);self._reply(status,result)
  except PermissionError:self._reply(403,{'ok':False,'error':'ACCESS_DENIED'})
  except RuntimeError as exc:
   code=str(exc)
   if code in('QA_PREVIEW_ONLY','QA_STAGING_CONFIG_INVALID','QA_PREVIEW_SHA_INVALID','QA_PREVIEW_HOST_INVALID'):self._reply(503,{'ok':False,'error':code})
   else:self._reply(502,{'ok':False,'error':'QA_EVIDENCE_FAILED'})
  except (ValueError,KeyError,TypeError,json.JSONDecodeError):self._reply(400,{'ok':False,'error':'INVALID_REQUEST'})
  except Exception:self._reply(500,{'ok':False,'error':'QA_EVIDENCE_FAILED'})
 def do_GET(self):self._reply(405,{'ok':False,'error':'METHOD_NOT_ALLOWED'})