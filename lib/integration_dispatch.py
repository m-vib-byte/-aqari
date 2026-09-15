"""Server-only delivery worker for AQARI integration outbox.

The database owns claiming/idempotency state. This module only builds the normalized
provider request, resolves the referenced server secret, sends without redirects,
and records the authoritative result back through service-only RPCs.
"""
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
import json,os,re
from lib.outbound_adapters import notification_request,encoded_body

UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',re.I)
ENV_SECRET=re.compile(r'^[A-Z][A-Z0-9_]{2,127}$')
SUPABASE_URL=re.compile(r'^https://[a-z0-9]+\.supabase\.co$')

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('PROVIDER_REDIRECT_REJECTED')

def _service_headers(key):
    if key.startswith('sb_secret_'):return {'apikey':key}
    if len(key)<32:raise RuntimeError('SERVER_DATABASE_CREDENTIALS_NOT_CONFIGURED')
    return {'apikey':key,'Authorization':'Bearer '+key}

def rpc(name,payload,env=os.environ,open_url=None):
    open_url=open_url or build_opener(NoRedirect).open
    url=env.get('AQARI_SUPABASE_URL','');key=env.get('AQARI_SUPABASE_SERVICE_ROLE_KEY','')
    if not SUPABASE_URL.fullmatch(url) or not key:raise RuntimeError('SERVER_DATABASE_CREDENTIALS_NOT_CONFIGURED')
    body=json.dumps(payload,separators=(',',':'),ensure_ascii=False).encode()
    headers=_service_headers(key);headers.update({'Content-Type':'application/json','Accept':'application/json'})
    req=Request(url+'/rest/v1/rpc/'+name,data=body,method='POST',headers=headers)
    with open_url(req,timeout=12) as response:
        raw=response.read(8*1024*1024+1)
        if len(raw)>8*1024*1024:raise RuntimeError('DATABASE_RESPONSE_TOO_LARGE')
        return json.loads(raw or b'null')

def _provider_reference(value):
    if not isinstance(value,dict):return ''
    for key in ('message_id','messageId','id','reference','provider_reference'):
        item=value.get(key)
        if isinstance(item,(str,int)) and 1<=len(str(item))<=300:return str(item)
    return ''

def _provider_request(item,env):
    if not isinstance(item,dict) or not UUID.fullmatch(str(item.get('eventId',''))):raise ValueError('INVALID_CLAIM')
    secret_ref=str(item.get('secretReference') or '')
    if not ENV_SECRET.fullmatch(secret_ref):raise RuntimeError('PROVIDER_SECRET_REFERENCE_INVALID')
    secret=env.get(secret_ref,'')
    if not isinstance(secret,str) or not 8<=len(secret)<=8192:raise RuntimeError('PROVIDER_SECRET_NOT_CONFIGURED')
    data={
      'idempotency_key':str(item.get('idempotencyKey') or ''),
      'recipient_reference':str(item.get('recipientReference') or ''),
      'template':str(item.get('template') or ''),
      'variables':item.get('variables') or {},
      'locale':str(item.get('locale') or 'ar')
    }
    attachment=item.get('attachment')
    if attachment is not None:data['attachments']=[attachment]
    request=notification_request(str(item.get('channel') or ''),data,str(item.get('endpointOrigin') or ''))
    request['headers']['Authorization']='Bearer '+secret
    request['headers']['Content-Type']='application/json'
    request['headers']['Accept']='application/json'
    return request

def _send(item,env=os.environ,open_url=None):
    open_url=open_url or build_opener(NoRedirect).open
    spec=_provider_request(item,env);url=spec['origin']+spec['path']
    req=Request(url,data=encoded_body(spec),method='POST',headers=spec['headers'])
    try:
        with open_url(req,timeout=15) as response:
            status=getattr(response,'status',200);raw=response.read(65537)
            if len(raw)>65536:raise RuntimeError('PROVIDER_RESPONSE_TOO_LARGE')
            if status<200 or status>=300:raise HTTPError(url,status,'provider error',{},None)
            try:value=json.loads(raw or b'{}')
            except json.JSONDecodeError:value={}
            return True,False,_provider_reference(value),None
    except HTTPError as exc:
        retryable=exc.code in (408,425,429) or 500<=exc.code<=599
        return False,retryable,'','PROVIDER_HTTP_'+str(exc.code)
    except (URLError,TimeoutError,OSError) as exc:
        return False,True,'','PROVIDER_NETWORK_ERROR'
    except ValueError as exc:
        return False,False,'',str(exc)[:200]

def dispatch_once(limit=5,env=os.environ,db_rpc=rpc,send=_send):
    if not isinstance(limit,int) or not 1<=limit<=20:raise ValueError('INVALID_DISPATCH_LIMIT')
    claimed=db_rpc('aqari_integration_dispatch_claim',{'p_limit':limit},env)
    if not isinstance(claimed,list):raise RuntimeError('INVALID_DISPATCH_CLAIM_RESPONSE')
    result={'claimed':len(claimed),'sent':0,'failed':0,'deadLetter':0}
    for item in claimed:
        event=str(item.get('eventId') if isinstance(item,dict) else '')
        try:
            ok,retryable,provider_ref,error=send(item,env)
        except RuntimeError as exc:
            ok,retryable,provider_ref,error=False,True,'',str(exc)[:200]
        except Exception:
            ok,retryable,provider_ref,error=False,False,'','DISPATCH_WORKER_ERROR'
        final=db_rpc('aqari_integration_dispatch_result',{
          'p_event_id':event,'p_ok':bool(ok),'p_retryable':bool(retryable),
          'p_provider_reference':provider_ref or None,'p_error':error or None
        },env)
        status=final.get('status') if isinstance(final,dict) else None
        if status=='sent':result['sent']+=1
        elif status=='dead_letter':result['deadLetter']+=1
        else:result['failed']+=1
    return result
