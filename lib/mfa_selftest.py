"""Preview-only end-to-end Supabase TOTP diagnostic.

Creates a disposable Auth user, proves AAL1 -> TOTP enroll -> challenge/verify -> AAL2,
then deletes the user. No credential, token, factor secret or OTP is returned to callers.
"""
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError
import base64,hashlib,hmac,json,os,re,secrets,struct,time

ROOT=Path(__file__).resolve().parents[1]
EXPECTED_URL='https://ofgmcsmxmdswlovsckqs.supabase.co'
EXPECTED_BRANCH='support/v267-knet-range-reconcile-20260915'
SHA=re.compile(r'^[0-9a-f]{40}$')
SAFE_CODE=re.compile(r'^[A-Za-z0-9_:-]{2,120}$')

class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('UPSTREAM_REDIRECT_REJECTED')

def _public_config():
 source=(ROOT/'lib/release-config.js').read_text()
 url=re.search(r"url:\s*'([^']+)'",source);key=re.search(r"publishableKey:\s*'([^']+)'",source)
 if not url or not key or url.group(1)!=EXPECTED_URL or not key.group(1).startswith('sb_publishable_'):raise RuntimeError('MFA_SELFTEST_STAGING_CONFIG_INVALID')
 return url.group(1),key.group(1)

def _service_headers(key):
 if not isinstance(key,str) or not 20<=len(key)<=8192:raise RuntimeError('MFA_SELFTEST_AUTH_ADMIN_NOT_CONFIGURED')
 if key.startswith('sb_secret_'):return {'apikey':key}
 try:
  parts=key.split('.');claims=json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
  if len(parts)!=3 or claims.get('role')!='service_role' or claims.get('ref')!='ofgmcsmxmdswlovsckqs':raise ValueError()
 except Exception:raise RuntimeError('MFA_SELFTEST_AUTH_ADMIN_NOT_CONFIGURED') from None
 return {'apikey':key,'Authorization':'Bearer '+key}

def _config(env=os.environ):
 url,publishable=_public_config()
 if env.get('VERCEL_ENV')!='preview' or env.get('VERCEL_GIT_COMMIT_REF')!=EXPECTED_BRANCH:raise RuntimeError('MFA_SELFTEST_PREVIEW_ONLY')
 sha=str(env.get('VERCEL_GIT_COMMIT_SHA') or '').lower()
 if not SHA.fullmatch(sha):raise RuntimeError('MFA_SELFTEST_SHA_REQUIRED')
 configured=str(env.get('AQARI_SUPABASE_URL') or '').strip()
 if configured and configured!=url:raise RuntimeError('MFA_SELFTEST_STAGING_TARGET_REQUIRED')
 service=str(env.get('AQARI_SUPABASE_SERVICE_ROLE_KEY') or '')
 _service_headers(service)
 return url,publishable,service,sha

def _request(url,method,headers,body=None,open_url=None):
 open_url=open_url or build_opener(NoRedirect).open
 raw=None if body is None else json.dumps(body,separators=(',',':')).encode()
 request=Request(url,data=raw,method=method,headers={**headers,**({'Content-Type':'application/json'} if raw is not None else {}),'Accept':'application/json'})
 status=0;data=b''
 try:
  with open_url(request,timeout=12) as response:
   status=int(getattr(response,'status',200));data=response.read(131073)
 except HTTPError as exc:
  status=int(exc.code);data=exc.read(131073)
 if len(data)>131072:raise RuntimeError('MFA_SELFTEST_RESPONSE_TOO_LARGE')
 try:parsed=json.loads(data or b'{}')
 except Exception:parsed={}
 return status,parsed

def _error_code(data):
 if isinstance(data,dict):
  for key in ('code','error_code','error','message'):
   value=data.get(key)
   if isinstance(value,str) and SAFE_CODE.fullmatch(value):return value
 return 'UPSTREAM_REJECTED'

def _expect(stage,status,data,allowed=(200,201)):
 if status not in allowed:raise RuntimeError(stage+':'+_error_code(data))
 if not isinstance(data,dict):raise RuntimeError(stage+':INVALID_RESPONSE')
 return data

def _expect_factors(stage,status,data):
 if status not in (200,201):raise RuntimeError(stage+':'+_error_code(data))
 if not isinstance(data,(dict,list)):raise RuntimeError(stage+':INVALID_RESPONSE')
 return data

def _factor_status(data,factor_id):
 factors=data.get('factors') if isinstance(data,dict) else data
 if not isinstance(factors,list):return None
 for factor in factors:
  if not isinstance(factor,dict) or str(factor.get('id') or '')!=factor_id:continue
  if factor.get('factor_type')!='totp':return None
  status=factor.get('status')
  return status if status in ('unverified','verified') else None
 return None

def _b32(secret):
 raw=''.join(str(secret or '').split()).upper();raw+=('='*((8-len(raw)%8)%8))
 try:return base64.b32decode(raw,casefold=True)
 except Exception:raise RuntimeError('TOTP_SECRET_INVALID') from None

def totp_code(secret,at=None,digits=6,period=30):
 if digits not in (6,7,8) or period<=0:raise ValueError('TOTP_PARAMETERS_INVALID')
 counter=int((time.time() if at is None else at)//period)
 digest=hmac.new(_b32(secret),struct.pack('>Q',counter),hashlib.sha1).digest();offset=digest[-1]&15
 value=(struct.unpack('>I',digest[offset:offset+4])[0]&0x7fffffff)%(10**digits)
 return str(value).zfill(digits)

def _totp_candidates(secret,at=None,period=30):
 base=time.time() if at is None else at
 return [(offset,totp_code(secret,base+offset,period=period)) for offset in (0,-period,period)]

def _jwt_claims(token):
 try:
  parts=str(token).split('.');return json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4))) if len(parts)==3 else {}
 except Exception:return {}

def run_selftest(env=os.environ,open_url=None,now=None):
 url,publishable,service,sha=_config(env);admin=_service_headers(service);public={'apikey':publishable};user_id=None;stage='START'
 report={'ok':False,'candidateSha':sha,'created':False,'aal1':False,'enrolled':False,'factorUnverified':False,'qrReturned':False,'challenged':False,'verified':False,'factorVerified':False,'aal2':False,'cleanup':False,'totpWindowsTried':0}
 email='qa-mfa-selftest-'+secrets.token_hex(10)+'@example.invalid';password=secrets.token_urlsafe(36)
 try:
  stage='CREATE_USER';s,d=_request(url+'/auth/v1/admin/users','POST',admin,{'email':email,'password':password,'email_confirm':True,'user_metadata':{'aqari_mfa_selftest':True}},open_url);d=_expect(stage,s,d);user_id=str(d.get('id') or '');
  if not re.fullmatch(r'[0-9a-fA-F-]{36}',user_id):raise RuntimeError(stage+':USER_ID_INVALID')
  report['created']=True
  stage='AAL1_SIGNIN';s,d=_request(url+'/auth/v1/token?grant_type=password','POST',public,{'email':email,'password':password},open_url);d=_expect(stage,s,d);token=str(d.get('access_token') or '');claims=_jwt_claims(token)
  if claims.get('sub')!=user_id or claims.get('aal')!='aal1':raise RuntimeError(stage+':AAL1_NOT_CONFIRMED')
  report['aal1']=True;user_headers={'apikey':publishable,'Authorization':'Bearer '+token}
  stage='ENROLL';s,d=_request(url+'/auth/v1/factors','POST',user_headers,{'factor_type':'totp','friendly_name':'AQARI V267 selftest '+secrets.token_hex(6)},open_url);d=_expect(stage,s,d);factor_id=str(d.get('id') or '');totp=d.get('totp') if isinstance(d.get('totp'),dict) else {};secret=str(totp.get('secret') or '');qr=str(totp.get('qr_code') or '');uri=str(totp.get('uri') or '')
  if not factor_id or not secret:raise RuntimeError(stage+':ENROLLMENT_DATA_MISSING')
  report['enrolled']=True
  stage='FACTOR_UNVERIFIED';s,d=_request(url+'/auth/v1/admin/users/'+user_id+'/factors','GET',admin,None,open_url);d=_expect_factors(stage,s,d)
  if _factor_status(d,factor_id)!='unverified':raise RuntimeError(stage+':STATUS_NOT_UNVERIFIED')
  report['factorUnverified']=True
  if not qr or not uri.startswith('otpauth://'):raise RuntimeError(stage+':QR_OR_URI_MISSING')
  report['qrReturned']=True
  last_error='UPSTREAM_REJECTED'
  for window,code in _totp_candidates(secret,now):
   stage='CHALLENGE';s,d=_request(url+'/auth/v1/factors/'+factor_id+'/challenge','POST',user_headers,{},open_url);d=_expect(stage,s,d);challenge_id=str(d.get('id') or '')
   if not challenge_id:raise RuntimeError(stage+':CHALLENGE_ID_MISSING')
   report['challenged']=True;report['totpWindowsTried']+=1
   stage='VERIFY';s,d=_request(url+'/auth/v1/factors/'+factor_id+'/verify','POST',user_headers,{'challenge_id':challenge_id,'code':code},open_url)
   if s not in (200,201):
    last_error=_error_code(d)
    if s in (400,422):continue
    raise RuntimeError(stage+':'+last_error)
   d=_expect(stage,s,d);aal_token=str(d.get('access_token') or '');aal_claims=_jwt_claims(aal_token)
   if aal_claims.get('sub')!=user_id or aal_claims.get('aal')!='aal2':raise RuntimeError(stage+':AAL2_NOT_CONFIRMED')
   methods=[x.get('method') for x in (aal_claims.get('amr') or []) if isinstance(x,dict)]
   if 'totp' not in methods:raise RuntimeError(stage+':TOTP_AMR_MISSING')
   report['verified']=True;report['verifiedWindowSeconds']=window;report['aal2']=True
   stage='FACTOR_VERIFIED';s,d=_request(url+'/auth/v1/admin/users/'+user_id+'/factors','GET',admin,None,open_url);d=_expect_factors(stage,s,d)
   if _factor_status(d,factor_id)!='verified':raise RuntimeError(stage+':STATUS_NOT_VERIFIED')
   report['factorVerified']=True;report['ok']=True;stage='COMPLETE';break
  if not report['verified']:raise RuntimeError('VERIFY:'+last_error)
 except RuntimeError as exc:
  text=str(exc);report['stage']=stage;report['error']=text if SAFE_CODE.fullmatch(text) else stage+':SELFTEST_FAILED'
 except Exception:
  report['stage']=stage;report['error']=stage+':SELFTEST_FAILED'
 finally:
  if user_id:
   try:
    s,_=_request(url+'/auth/v1/admin/users/'+user_id,'DELETE',admin,None,open_url);report['cleanup']=s in (200,204)
   except Exception:report['cleanup']=False
  else:report['cleanup']=True
  if not report['cleanup']:
   report['ok']=False;report.setdefault('stage','CLEANUP');report.setdefault('error','CLEANUP:FAILED')
 for forbidden in ('email','password','secret','token','factorId','challengeId','code'):
  report.pop(forbidden,None)
 return report
