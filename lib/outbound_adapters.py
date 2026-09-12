"""Pure provider request builders. Network delivery and credentials stay server-side."""
from decimal import Decimal,InvalidOperation
from urllib.parse import urlparse
import json,re

IDEMPOTENCY=re.compile(r'^[A-Za-z0-9:_-]{8,200}$')
CHANNELS={'email','whatsapp','sms','push'}
LEDGERS={'quickbooks','zoho_books','xero'}
SENSITIVE_FIELDS={'password','secret','token','apikey','civilid','accesstoken','refreshtoken','authorization','servicerolekey'}

def json_snapshot(value):
    """Keep the validated envelope independent of later caller mutations."""
    try:
        encoded=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
        if len(encoded.encode('utf-8'))>131072:raise ValueError('PAYLOAD_TOO_LARGE')
        return json.loads(encoded)
    except (TypeError,ValueError,OverflowError,RecursionError) as exc:
        raise ValueError('INVALID_JSON_PAYLOAD') from exc

def check_notification_variables(value,depth=0):
    if depth>16:raise ValueError('INVALID_NOTIFICATION')
    if isinstance(value,dict):
        for key,item in value.items():
            normalized=re.sub(r'[_\-\s]','',key).casefold()
            if normalized in SENSITIVE_FIELDS:raise ValueError('INVALID_NOTIFICATION')
            check_notification_variables(item,depth+1)
    elif isinstance(value,list):
        for item in value:check_notification_variables(item,depth+1)

def relative_route(value,path):
    """Accept the exact local route and its query, never a path prefix."""
    if not isinstance(value,str) or len(value)>2048 or re.search(r'[\x00-\x20\x7f\\]',value):raise ValueError('INVALID_REDIRECT_PATH')
    parsed=urlparse(value)
    if parsed.scheme or parsed.netloc or parsed.path!=path or parsed.params or parsed.fragment or '#' in value:raise ValueError('INVALID_REDIRECT_PATH')
    return value

def https_origin(value):
    p=urlparse(value)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.path not in ('','/') or p.query or p.fragment:raise ValueError('HTTPS_ORIGIN_REQUIRED')
    return f'https://{p.hostname}'+(f':{p.port}' if p.port else '')
def money(value):
    try:a=Decimal(str(value))
    except InvalidOperation as exc:raise ValueError('INVALID_AMOUNT') from exc
    if not a.is_finite() or a<=0 or a>Decimal('999999999.999') or a!=a.quantize(Decimal('0.001')):raise ValueError('INVALID_AMOUNT')
    return f'{a:.3f}'
def clean_id(value,label):
    value=str(value or '')
    if not IDEMPOTENCY.fullmatch(value):raise ValueError(label)
    return value
def knet_payment_request(data,origin):
    required={'idempotency_key','lease_id','contract_no','amount','currency','expires_at','callback_path','return_path'}
    if not isinstance(data,dict) or set(data)!=required or data['currency']!='KWD':raise ValueError('INVALID_KNET_REQUEST')
    callback=relative_route(data['callback_path'],'/api/provider-webhook');return_path=relative_route(data['return_path'],'/app')
    return {'method':'POST','origin':https_origin(origin),'path':'/payments','headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':{'merchant_reference':data['idempotency_key'],'lease_reference':clean_id(data['lease_id'],'INVALID_LEASE_REFERENCE'),'contract_reference':str(data['contract_no'])[:120],'amount':money(data['amount']),'currency':'KWD','expires_at':data['expires_at'],'callback_path':callback,'return_path':return_path}}
def notification_request(channel,data,origin):
    if channel not in CHANNELS or not isinstance(data,dict):raise ValueError('INVALID_NOTIFICATION')
    allowed={'idempotency_key','recipient_reference','template','variables','locale'}
    if set(data)!=allowed or not isinstance(data['variables'],dict):raise ValueError('INVALID_NOTIFICATION')
    data=json_snapshot(data);check_notification_variables(data['variables'])
    return {'method':'POST','origin':https_origin(origin),'path':'/messages/'+channel,'headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':data}
def accounting_export(provider,data,origin):
    if provider not in LEDGERS or not isinstance(data,dict) or set(data)!={'idempotency_key','period','entries','schema_version'} or data['schema_version']!=1 or not isinstance(data['entries'],list):raise ValueError('INVALID_ACCOUNTING_EXPORT')
    data=json_snapshot(data)
    return {'method':'POST','origin':https_origin(origin),'path':'/accounting/v1/journal-exports','headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':data}
def encoded_body(request):return json.dumps(request['json'],ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
