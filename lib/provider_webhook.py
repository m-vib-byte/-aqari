"""Provider-neutral signed webhook intake. Provider-specific field mapping stays explicit."""
from hashlib import sha256
import hmac, json, math, os, re, time, uuid

UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',re.I)
# Keep the canonical envelope provider-neutral. Native provider signatures/field maps
# still require their own verified server adapter before entering this contract.
PROVIDERS={'knet','email','whatsapp','sms','push','quickbooks','zoho_books','xero','generic_webhook'}
ALLOWED={'event_type','payment_reference','provider_status','amount','currency','occurred_at','message_reference','account_reference','maintenance_request_no','sender_reference','message_text'}

def secret_name(workspace,provider): return 'AQARI_WEBHOOK_SECRET_'+workspace.replace('-','_').upper()+'_'+provider.upper()

def signature_message(workspace, provider, timestamp, event_id, raw):
    """Versioned, unambiguous envelope binding routing and idempotency to the body."""
    return ('aqari-webhook-v1\n'+workspace.lower()+'\n'+provider+'\n'+timestamp+'\n'+event_id+'\n').encode('ascii')+bytes(raw)

def unique_object(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('DUPLICATE_JSON_FIELD')
        result[key]=value
    return result

def reject_constant(value): raise ValueError('NON_FINITE_JSON_NUMBER')
def finite_float(value):
    number=float(value)
    if not math.isfinite(number): raise ValueError('NON_FINITE_JSON_NUMBER')
    return number

def _validate_maintenance_message(provider,normalized):
    maintenance_keys={'maintenance_request_no','sender_reference','message_text'}
    present=maintenance_keys.intersection(normalized)
    if not present:return
    if provider!='whatsapp' or normalized.get('event_type')!='maintenance.message' or present!=maintenance_keys:raise ValueError('INVALID_MAINTENANCE_MESSAGE')
    request=str(normalized['maintenance_request_no']);sender=normalized['sender_reference'];message=normalized['message_text'];reference=normalized.get('message_reference')
    if not re.fullmatch(r'[0-9]{1,20}',request) or not isinstance(sender,str) or not 3<=len(sender)<=80 or re.search(r'[\x00-\x1f\x7f]',sender):raise ValueError('INVALID_MAINTENANCE_MESSAGE')
    if not isinstance(message,str) or not 1<=len(message)<=4000 or '\x00' in message:raise ValueError('INVALID_MAINTENANCE_MESSAGE')
    if not isinstance(reference,str) or not 1<=len(reference)<=200 or re.search(r'[\x00-\x1f\x7f]',reference):raise ValueError('INVALID_MAINTENANCE_MESSAGE')

def verify_and_normalize(workspace,provider,raw,headers,now=None,secrets=os.environ):
    if not isinstance(workspace,str) or not UUID.fullmatch(workspace) or not isinstance(provider,str) or provider not in PROVIDERS or not isinstance(raw,(bytes,bytearray)) or not 0<len(raw)<=131072: raise ValueError('INVALID_WEBHOOK')
    timestamp=headers.get('x-aqari-timestamp','');event_id=headers.get('x-aqari-event-id','');signature=headers.get('x-aqari-signature','')
    if not isinstance(timestamp,str) or not re.fullmatch(r'(?:0|[1-9][0-9]{0,11})',timestamp) or abs((int(time.time()) if now is None else now)-int(timestamp))>300: raise PermissionError('STALE_WEBHOOK')
    if not isinstance(event_id,str) or not isinstance(signature,str) or not re.fullmatch(r'[A-Za-z0-9:_-]{8,200}',event_id) or not re.fullmatch(r'[a-f0-9]{64}',signature): raise PermissionError('INVALID_SIGNATURE')
    secret=secrets.get(secret_name(workspace,provider))
    if not isinstance(secret,str) or len(secret)<32: raise RuntimeError('WEBHOOK_SECRET_NOT_CONFIGURED')
    expected=hmac.new(secret.encode(),signature_message(workspace,provider,timestamp,event_id,raw),sha256).hexdigest()
    if not hmac.compare_digest(expected,signature): raise PermissionError('INVALID_SIGNATURE')
    body=json.loads(raw,object_pairs_hook=unique_object,parse_constant=reject_constant,parse_float=finite_float)
    if not isinstance(body,dict): raise ValueError('INVALID_PAYLOAD')
    normalized={k:body[k] for k in ALLOWED if k in body and isinstance(body[k],(str,int,float,bool))}
    occurred=normalized.get('occurred_at')
    if not isinstance(occurred,str) or not 1<=len(occurred)<=40: raise ValueError('OCCURRED_AT_REQUIRED')
    event_type=normalized.get('event_type')
    if not isinstance(event_type,str) or not 1<=len(event_type)<=100: raise ValueError('EVENT_TYPE_REQUIRED')
    _validate_maintenance_message(provider,normalized)
    return {'id':str(uuid.uuid4()),'provider':provider,'provider_event_id':event_id,'event_type':event_type,'body_sha256':sha256(raw).hexdigest(),'signature_sha256':sha256(signature.encode()).hexdigest(),'occurred_at':occurred,'normalized_payload':normalized}
