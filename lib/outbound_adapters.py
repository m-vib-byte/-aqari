"""Pure provider request builders. Network delivery and credentials stay server-side."""
from decimal import Decimal,InvalidOperation
from urllib.parse import urlparse
import json,re

IDEMPOTENCY=re.compile(r'^[A-Za-z0-9:_-]{8,200}$')
CHANNELS={'email','whatsapp','sms','push'}
LEDGERS={'quickbooks','zoho_books','xero'}
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
    if not str(data['callback_path']).startswith('/api/provider-webhook') or not str(data['return_path']).startswith('/app'):raise ValueError('INVALID_REDIRECT_PATH')
    return {'method':'POST','origin':https_origin(origin),'path':'/payments','headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':{'merchant_reference':data['idempotency_key'],'lease_reference':clean_id(data['lease_id'],'INVALID_LEASE_REFERENCE'),'contract_reference':str(data['contract_no'])[:120],'amount':money(data['amount']),'currency':'KWD','expires_at':data['expires_at'],'callback_path':data['callback_path'],'return_path':data['return_path']}}
def notification_request(channel,data,origin):
    if channel not in CHANNELS or not isinstance(data,dict):raise ValueError('INVALID_NOTIFICATION')
    allowed={'idempotency_key','recipient_reference','template','variables','locale'}
    if set(data)!=allowed or not isinstance(data['variables'],dict) or any(k.lower() in {'password','secret','token','civil_id'} for k in data['variables']):raise ValueError('INVALID_NOTIFICATION')
    return {'method':'POST','origin':https_origin(origin),'path':'/messages/'+channel,'headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':data}
def accounting_export(provider,data,origin):
    if provider not in LEDGERS or not isinstance(data,dict) or set(data)!={'idempotency_key','period','entries','schema_version'} or data['schema_version']!=1 or not isinstance(data['entries'],list):raise ValueError('INVALID_ACCOUNTING_EXPORT')
    return {'method':'POST','origin':https_origin(origin),'path':'/accounting/v1/journal-exports','headers':{'Idempotency-Key':clean_id(data['idempotency_key'],'INVALID_IDEMPOTENCY_KEY')},'json':data}
def encoded_body(request):return json.dumps(request['json'],ensure_ascii=False,separators=(',',':')).encode()
