"""Authenticated operational export; never trusts client-provided report rows."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
import importlib.util,json,re

spec=importlib.util.spec_from_file_location('rent_receipt_common',Path(__file__).with_name('rent-receipt.py'))
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
from lib.operational_report_pdf import render_operational_report

UUID=common.UUID
MONTH=re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')


def _rpc(name,payload,auth):
    config=(common.ROOT/'lib/release-config.js').read_text()
    url=re.search(r"url:\s*'([^']+)'",config).group(1);key=re.search(r"publishableKey:\s*'([^']+)'",config).group(1)
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co',url) or not key.startswith('sb_publishable_'):raise ValueError('INVALID_CONFIG')
    raw=json.dumps(payload,separators=(',',':')).encode()
    req=Request(url+'/rest/v1/rpc/'+name,data=raw,method='POST',headers={'Authorization':auth,'apikey':key,'Accept':'application/json','Content-Type':'application/json'})
    with build_opener(common.NoRedirect).open(req,timeout=8) as response:
        body=response.read(20*1024*1024+1)
        if len(body)>20*1024*1024:raise ValueError('STATE_TOO_LARGE')
        return json.loads(body)


def _month_range(month):
    import calendar
    y,m=map(int,month.split('-'));return month+'-01',f'{month}-{calendar.monthrange(y,m)[1]:02d}'


def _canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def export_report(data,auth,read=common.upstream,rpc_call=_rpc):
    if not isinstance(data,dict) or set(data)!={'workspaceId','propertyId','month','report','format'}:raise ValueError('INVALID_REQUEST')
    workspace,prop,month,kind,fmt=data['workspaceId'],data['propertyId'],data['month'],data['report'],data['format']
    if not all(isinstance(x,str) and UUID.fullmatch(x) for x in [workspace,prop]) or not isinstance(month,str) or not MONTH.fullmatch(month) or kind not in {'collection','collectors'} or fmt not in {'json','pdf'}:raise ValueError('INVALID_REQUEST')
    if not isinstance(auth,str) or len(auth)>8192 or not re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',auth):raise PermissionError('AUTH_REQUIRED')
    user=read('/auth/v1/user',auth)
    if not isinstance(user,dict) or not UUID.fullmatch(str(user.get('id',''))):raise PermissionError('AUTH_REQUIRED')
    if kind=='collection':
        name='aqari_monthly_collection_report';payload={'p_workspace_id':workspace,'p_period':month+'-01','p_property_id':prop}
    else:
        start,end=_month_range(month);name='aqari_collector_performance_report';payload={'p_workspace_id':workspace,'p_from':start,'p_to':end,'p_property_id':prop}
    first=rpc_call(name,payload,auth)
    second=rpc_call(name,payload,auth)
    if _canonical(first)!=_canonical(second):raise RuntimeError('REPORT_CHANGED_RETRY')
    property_name='العقار المحدد'
    if kind=='collection' and first.get('properties'):property_name=str(first['properties'][0].get('property_name') or property_name)
    elif kind=='collectors' and first.get('lines'):property_name=str(first['lines'][0].get('property_name') or property_name)
    envelope={'report':kind,'workspaceId':workspace,'propertyId':prop,'month':month,'retrievedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat().replace('+00:00','Z'),'data':first}
    if fmt=='json':return 'json',json.dumps(envelope,ensure_ascii=False,separators=(',',':')).encode()
    return 'pdf',render_operational_report(kind,first,property_name,month)


class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,status,body,mime='application/json; charset=utf-8'):
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Cache-Control','private, no-store, max-age=0');self.send_header('Vercel-CDN-Cache-Control','no-store');self.send_header('Vary','Authorization');self.send_header('X-Content-Type-Options','nosniff')
        if mime=='application/pdf':self.send_header('Content-Disposition','attachment; filename="aqari-operational-report.pdf"')
        self.end_headers();self.wfile.write(body)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and origin!='https://'+self.headers.get('Host',''):raise PermissionError('ORIGIN_REJECTED')
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=4096:raise ValueError('INVALID_REQUEST')
            kind,result=export_report(json.loads(self.rfile.read(size)),self.headers.get('Authorization'))
            self.respond(200,result,'application/pdf' if kind=='pdf' else 'application/json; charset=utf-8')
        except (PermissionError,HTTPError):self.respond(403,b'{"error":"ACCESS_DENIED"}')
        except RuntimeError:self.respond(409,b'{"error":"REPORT_CHANGED_RETRY"}')
        except (ValueError,KeyError,TypeError):self.respond(400,b'{"error":"INVALID_REPORT"}')
        except Exception:self.respond(503,b'{"error":"EXPORT_UNAVAILABLE"}')
