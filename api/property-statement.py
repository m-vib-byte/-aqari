"""Export only the stored source register visible through workspace RLS."""
import importlib.util
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError
import json,re
spec=importlib.util.spec_from_file_location('receipt_export_common',Path(__file__).with_name('rent-receipt.py'))
common=importlib.util.module_from_spec(spec);spec.loader.exec_module(common)
from lib.property_statement_pdf import render_statement

def export_statement(data,auth,read=common.upstream):
    if not isinstance(data,dict) or set(data)!={'workspaceId','propertyId','period'}:raise ValueError('INVALID_REQUEST')
    if not all(isinstance(data[k],str) and common.UUID.fullmatch(data[k]) for k in ['workspaceId','propertyId']) or not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])',str(data['period'])):raise ValueError('INVALID_REQUEST')
    if not isinstance(auth,str) or len(auth)>8192 or not re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',auth):raise PermissionError('AUTH_REQUIRED')
    user=read('/auth/v1/user',auth)
    if not isinstance(user,dict) or not common.UUID.fullmatch(str(user.get('id',''))):raise PermissionError('AUTH_REQUIRED')
    query={'select':'workspace_id,property_id,period,content','workspace_id':'eq.'+data['workspaceId'],'property_id':'eq.'+data['propertyId'],'period':'eq.'+data['period']+'-01'}
    rows=read('/rest/v1/aqari_property_statements?'+urlencode(query),auth)
    if not isinstance(rows,list) or len(rows)!=1:raise PermissionError('ACCESS_DENIED')
    row=rows[0]
    if row['workspace_id']!=data['workspaceId'] or row['property_id']!=data['propertyId'] or row['period']!=data['period']+'-01':raise PermissionError('ACCESS_DENIED')
    return render_statement(row['content'])

class handler(common.handler):
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and origin!='https://'+self.headers.get('Host',''):raise PermissionError('ORIGIN_REJECTED')
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=2048:raise ValueError('INVALID_REQUEST')
            result=export_statement(json.loads(self.rfile.read(size)),self.headers.get('Authorization'))
            self.respond(200,result,'application/pdf')
        except (PermissionError,HTTPError):self.respond(403,b'{"error":"ACCESS_DENIED"}')
        except (ValueError,KeyError,TypeError):self.respond(400,b'{"error":"INVALID_STATEMENT"}')
        except Exception:self.respond(503,b'{"error":"EXPORT_UNAVAILABLE"}')
