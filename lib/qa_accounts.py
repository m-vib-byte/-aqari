"""Server-only temporary QA account provisioning for AQARI Preview.

The database authorizes scope with the manager JWT. Supabase Auth Admin remains the only
user-creation path. Automation passwords are random, returned once, never persisted or logged.
"""
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
import base64,json,os,re,secrets

ROOT=Path(__file__).resolve().parents[1]
EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co'
EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',re.I)
JWT=re.compile(r'^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
EMAIL=re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
AUTOMATION_ROLES={'collector','accountant','maintenance','property_manager','viewer','partner'}

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('UPSTREAM_REDIRECT_REJECTED')

def public_config():
 source=(ROOT/'lib/release-config.js').read_text()
 url=re.search(r"url:\s*'([^']+)'",source);key=re.search(r"publishableKey:\s*'([^']+)'",source)
 if not url or not key or url.group(1)!=EXPECTED_URL or not key.group(1).startswith('sb_publishable_'):raise RuntimeError('QA_STAGING_CONFIG_INVALID')
 return url.group(1),key.group(1)

def _service_headers(key):
 if not isinstance(key,str) or not 20<=len(key)<=8192:raise RuntimeError('QA_AUTH_ADMIN_NOT_CONFIGURED')
 if key.startswith('sb_secret_'):return {'apikey':key,'Authorization':'Bearer '+key}
 try:
  parts=key.split('.');claims=json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
  if len(parts)!=3 or claims.get('role')!='service_role' or claims.get('ref')!='ofgmcsmxmdswlovsckqs':raise ValueError()
 except Exception:raise RuntimeError('QA_AUTH_ADMIN_NOT_CONFIGURED') from None
 return {'apikey':key,'Authorization':'Bearer '+key}

def server_config(env=os.environ):
 url,publishable=public_config()
 if env.get('VERCEL_ENV')!='preview' or env.get('VERCEL_GIT_COMMIT_REF')!=EXPECTED_BRANCH:raise RuntimeError('QA_PREVIEW_ONLY')
 if env.get('AQARI_SUPABASE_URL')!=url:raise RuntimeError('QA_STAGING_TARGET_REQUIRED')
 service=env.get('AQARI_SUPABASE_SERVICE_ROLE_KEY','');_service_headers(service)
 return url,publishable,service

def _json_request(url,method,headers,body=None,open_url=None):
 open_url=open_url or build_opener(NoRedirect).open;raw=None if body is None else json.dumps(body,separators=(',',':'),ensure_ascii=False).encode()
 request=Request(url,data=raw,method=method,headers={**headers,**({'Content-Type':'application/json'} if raw is not None else {}),'Accept':'application/json'})
 with open_url(request,timeout=12) as response:
  data=response.read(131073)
  if len(data)>131072:raise RuntimeError('QA_UPSTREAM_RESPONSE_TOO_LARGE')
  return json.loads(data or b'null')

def user_rpc(workspace,action,data,auth,env=os.environ,open_url=None):
 url,publishable,_=server_config(env)
 if not isinstance(auth,str) or len(auth)>8192 or not JWT.fullmatch(auth):raise PermissionError('AUTH_REQUIRED')
 return _json_request(url+'/rest/v1/rpc/aqari_qa_account','POST',{'apikey':publishable,'Authorization':auth},{'p_workspace_id':workspace,'p_action':action,'p_data':data},open_url)

def service_rpc(name,payload,env=os.environ,open_url=None):
 url,_,service=server_config(env)
 return _json_request(url+'/rest/v1/rpc/'+name,'POST',_service_headers(service),payload,open_url)

def _create_auth(email,password,env=os.environ,open_url=None):
 url,_,service=server_config(env)
 return _json_request(url+'/auth/v1/admin/users','POST',_service_headers(service),{'email':email,'password':password,'email_confirm':True,'user_metadata':{'aqari_qa':True}},open_url)

def _ban_auth(user_id,env=os.environ,open_url=None):
 url,_,service=server_config(env)
 if not UUID.fullmatch(str(user_id)):raise ValueError('QA_USER_ID_INVALID')
 return _json_request(url+'/auth/v1/admin/users/'+str(user_id),'PUT',_service_headers(service),{'ban_duration':'876000h'},open_url)

def automation_request(data):
 if not isinstance(data,dict):raise ValueError('INVALID_QA_REQUEST')
 role=str(data.get('qa_role') or '')
 result={k:v for k,v in data.items() if k in {'display_name','qa_role','property_ids','tenant_id','expires_at','reason','email'}}
 if role in AUTOMATION_ROLES:
  if result.get('email') not in (None,''):raise ValueError('QA_AUTOMATION_EMAIL_FORBIDDEN')
  result['email']='qa-'+role+'-'+secrets.token_hex(8)+'@example.invalid'
 elif role=='tenant':
  email=str(result.get('email') or '').lower()
  if not EMAIL.fullmatch(email):raise ValueError('QA_TENANT_EMAIL_REQUIRED')
  result['email']=email
 else:raise ValueError('INVALID_QA_ROLE')
 return result

def provision_automation_account(workspace,data,auth,env=os.environ,user_call=user_rpc,service_call=service_rpc,create_call=_create_auth):
 if not UUID.fullmatch(str(workspace)):raise ValueError('INVALID_QA_REQUEST')
 request=automation_request(data);prepared=user_call(workspace,'prepare',request,auth,env)
 if not isinstance(prepared,dict) or not UUID.fullmatch(str(prepared.get('id',''))) or not EMAIL.fullmatch(str(prepared.get('email',''))):raise RuntimeError('QA_PREPARE_NOT_CONFIRMED')
 account_id=str(prepared['id']);email=str(prepared['email']).lower();password=secrets.token_urlsafe(32)
 try:
  created=create_call(email,password,env)
  user_id=str(created.get('id','')) if isinstance(created,dict) else ''
  if not UUID.fullmatch(user_id) or str(created.get('email','')).lower()!=email:raise RuntimeError('QA_AUTH_PROVISION_NOT_CONFIRMED')
  confirmed=service_call('aqari_qa_account_server_result',{'p_account_id':account_id,'p_action':'provision','p_user_id':user_id,'p_error':None},env)
  if not isinstance(confirmed,dict) or confirmed.get('status')!='active' or str(confirmed.get('auth_user_id'))!=user_id:raise RuntimeError('QA_AUTH_BIND_NOT_CONFIRMED')
  return {'id':account_id,'status':'active','qaRole':prepared.get('qa_role'),'expiresAt':prepared.get('expires_at'),'email':email,'password':password}
 except Exception as exc:
  try:service_call('aqari_qa_account_server_result',{'p_account_id':account_id,'p_action':'provision','p_user_id':None,'p_error':type(exc).__name__},env)
  except Exception:pass
  raise

def disable_account(workspace,account_id,reason,auth,env=os.environ,user_call=user_rpc,service_call=service_rpc,ban_call=_ban_auth):
 if not UUID.fullmatch(str(workspace)) or not UUID.fullmatch(str(account_id)) or not isinstance(reason,str):raise ValueError('INVALID_QA_DISABLE')
 prepared=user_call(workspace,'disable',{'id':account_id,'reason':reason},auth,env)
 if not isinstance(prepared,dict) or str(prepared.get('id'))!=str(account_id):raise RuntimeError('QA_DISABLE_NOT_CONFIRMED')
 user_id=prepared.get('auth_user_id')
 if not user_id:return {'id':account_id,'status':'disabled'}
 try:
  ban_call(user_id,env)
  final=service_call('aqari_qa_account_server_result',{'p_account_id':account_id,'p_action':'disable','p_user_id':user_id,'p_error':None},env)
  if not isinstance(final,dict) or final.get('status')!='disabled':raise RuntimeError('QA_DISABLE_FINALIZE_FAILED')
  return {'id':account_id,'status':'disabled'}
 except Exception as exc:
  try:service_call('aqari_qa_account_server_result',{'p_account_id':account_id,'p_action':'disable','p_user_id':user_id,'p_error':type(exc).__name__},env)
  except Exception:pass
  raise

def expire_accounts(env=os.environ,service_call=service_rpc,ban_call=_ban_auth):
 rows=service_call('aqari_qa_expire_accounts',{},env)
 if not isinstance(rows,list):raise RuntimeError('QA_EXPIRY_RESPONSE_INVALID')
 result={'expired':len(rows),'banned':0,'banFailed':0}
 for row in rows:
  if not isinstance(row,dict) or not UUID.fullmatch(str(row.get('id',''))):continue
  user_id=row.get('userId')
  if not user_id:continue
  try:
   ban_call(user_id,env)
   final=service_call('aqari_qa_account_server_result',{'p_account_id':row['id'],'p_action':'disable','p_user_id':user_id,'p_error':None},env)
   if isinstance(final,dict) and final.get('status')=='disabled':result['banned']+=1
   else:result['banFailed']+=1
  except Exception as exc:
   result['banFailed']+=1
   try:service_call('aqari_qa_account_server_result',{'p_account_id':row['id'],'p_action':'disable','p_user_id':user_id,'p_error':type(exc).__name__},env)
   except Exception:pass
 return result
