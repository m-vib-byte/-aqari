"""Provider-neutral KNET payment-link dispatcher."""
from urllib.request import Request,build_opener
from urllib.error import HTTPError,URLError
import json,os,re
from lib.integration_dispatch import rpc,NoRedirect
from lib.outbound_adapters import knet_payment_request,encoded_body

UUID=re.compile(r'^[0-9a-f-]{36}$',re.I);ENV=re.compile(r'^[A-Z][A-Z0-9_]{2,127}$')

def provider_request(item,env=os.environ):
 if not isinstance(item,dict) or item.get('eventType')!='knet.payment_link' or not UUID.fullmatch(str(item.get('eventId',''))):raise ValueError('INVALID_KNET_CLAIM')
 ref=str(item.get('secretReference') or '');secret=env.get(ref,'')
 if not ENV.fullmatch(ref):raise RuntimeError('PROVIDER_SECRET_REFERENCE_INVALID')
 if not isinstance(secret,str) or not 8<=len(secret)<=8192:raise RuntimeError('PROVIDER_SECRET_NOT_CONFIGURED')
 required={'idempotencyKey','leaseId','contractNo','amount','currency','expiresAt','callbackPath','returnPath','endpointOrigin'}
 if not required.issubset(item):raise ValueError('INVALID_KNET_CLAIM')
 data={'idempotency_key':str(item['idempotencyKey']),'lease_id':str(item['leaseId']),'contract_no':str(item['contractNo']),'amount':item['amount'],'currency':str(item['currency']),'expires_at':str(item['expiresAt']),'callback_path':str(item['callbackPath']),'return_path':str(item['returnPath'])}
 spec=knet_payment_request(data,str(item['endpointOrigin']));spec['headers'].update({'Authorization':'Bearer '+secret,'Content-Type':'application/json','Accept':'application/json'});return spec

def send_link(item,env=os.environ,open_url=None):
 try:
  spec=provider_request(item,env);url=spec['origin']+spec['path'];req=Request(url,data=encoded_body(spec),method='POST',headers=spec['headers']);open_url=open_url or build_opener(NoRedirect).open
  with open_url(req,timeout=15) as response:
   status=getattr(response,'status',200);raw=response.read(65537)
   if len(raw)>65536:raise RuntimeError('PROVIDER_RESPONSE_TOO_LARGE')
   if status<200 or status>=300:raise HTTPError(url,status,'provider error',{},None)
   value=json.loads(raw or b'{}');payment_url=value.get('payment_url') if isinstance(value,dict) else None;reference=(value.get('payment_reference') or value.get('provider_reference') or value.get('reference') or value.get('id')) if isinstance(value,dict) else None
   if not isinstance(payment_url,str) or not payment_url.startswith('https://') or len(payment_url)>2048 or any(c.isspace() or ord(c)<32 for c in payment_url) or not isinstance(reference,(str,int)) or not 1<=len(str(reference))<=300:raise ValueError('INVALID_KNET_PROVIDER_RESPONSE')
   return True,False,str(reference),payment_url,None
 except HTTPError as exc:return False,exc.code in(408,425,429) or 500<=exc.code<=599,'','',f'PROVIDER_HTTP_{exc.code}'
 except (URLError,TimeoutError,OSError,RuntimeError) as exc:return False,True,'','',str(exc)[:200]
 except Exception as exc:return False,False,'','',str(exc)[:200]

def dispatch_knet_once(limit=1,env=os.environ,db_rpc=rpc,send=send_link):
 if not isinstance(limit,int) or not 1<=limit<=3:raise ValueError('INVALID_KNET_DISPATCH_LIMIT')
 claimed=db_rpc('aqari_knet_payment_link_claim',{'p_limit':limit},env)
 if not isinstance(claimed,list) or len(claimed)>limit:raise RuntimeError('INVALID_KNET_CLAIM_RESPONSE')
 result={'knetClaimed':len(claimed),'knetLinksReady':0,'knetFailed':0,'knetDeadLetter':0}
 for item in claimed:
  event=str(item.get('eventId') if isinstance(item,dict) else '');ok,retryable,reference,url,error=send(item,env)
  final=db_rpc('aqari_knet_payment_link_result',{'p_event_id':event,'p_ok':ok,'p_retryable':retryable,'p_provider_reference':reference or None,'p_payment_url':url or None,'p_error':error or None},env);status=final.get('status') if isinstance(final,dict) else None
  if status=='link_ready':result['knetLinksReady']+=1
  elif status in('failed','pending','awaiting_configuration'):result['knetFailed']+=1
  else:result['knetDeadLetter']+=1
 return result