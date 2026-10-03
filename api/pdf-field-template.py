"""Authenticated, read-only PDF field mapping and filling. Never activates leases."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, build_opener
from urllib.error import HTTPError
import hashlib
import importlib.util
import json
import re
from lib.pdf_field_template import open_pdf,page_sizes,saved_map,validate_map,write_template,render_page,fill_template

spec=importlib.util.spec_from_file_location('template_preview',Path(__file__).with_name('contract-template-preview.py'))
preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)
common=preview.common


def storage_pdf(row,auth):
    path=row.get('storage_path');workspace=row.get('workspace_id')
    if not isinstance(path,str) or not isinstance(workspace,str) or not common.UUID.fullmatch(workspace) or not path.startswith(workspace+'/') or len(path)>1024 or '\\' in path or any(part in {'','.','..'} for part in path.split('/')) or any(ord(c)<32 or ord(c)==127 for c in path):raise PermissionError('ACCESS_DENIED')
    size=row.get('size_bytes')
    if row.get('storage_bucket')!='aqari-documents' or row.get('mime_type')!='application/pdf' or type(size) is not int or not 1<=size<=25*1024*1024 or not re.fullmatch('[a-f0-9]{64}',row.get('checksum_sha256','')):raise ValueError('INVALID_PDF')
    url,key=common.config();encoded='/'.join(quote(p,safe='') for p in path.split('/'))
    req=Request(url+'/storage/v1/object/authenticated/aqari-documents/'+encoded,headers={'Authorization':auth,'apikey':key,'Accept':'application/pdf'})
    with build_opener(common.NoRedirect).open(req,timeout=15) as response:raw=response.read(size+1)
    if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=row['checksum_sha256']:raise ValueError('PDF_INTEGRITY_FAILED')
    return raw


def process(data,auth,rpc_call=preview.rpc,read=common.upstream,storage=storage_pdf):
    if not isinstance(data,dict) or set(data)-{'workspaceId','propertyId','documentId','action','page','mapping','values'}:raise ValueError('INVALID_REQUEST')
    if not isinstance(auth,str) or not re.fullmatch(r'Bearer [A-Za-z0-9_.-]+',auth):raise PermissionError('ACCESS_DENIED')
    for key in ['workspaceId','propertyId','documentId']:
        if not isinstance(data.get(key),str) or not common.UUID.fullmatch(data[key]):raise ValueError('INVALID_REQUEST')
    workspace,property_id=data['workspaceId'],data['propertyId']
    context=preview._context(workspace,auth,rpc_call)
    prop=preview._record('aqari_properties',workspace,'id',property_id,auth,read)
    row=preview._record('aqari_documents',workspace,'id',data['documentId'],auth,read)
    metadata=row.get('metadata',{})
    if row.get('id')!=data['documentId'] or prop.get('id')!=property_id or row.get('entity_type')!='property' or row.get('entity_ref')!=prop.get('external_ref') or row.get('document_type')!='property_document' or row.get('status')!='uploaded' or not isinstance(metadata,dict) or metadata.get('category')!='property_other' or metadata.get('asset_role')!='property_contract' or metadata.get('property_id')!=property_id:raise PermissionError('PDF_PROPERTY_MISMATCH')
    action=data.get('action')
    if action not in ['inspect','page','text','save','fill']:raise ValueError('INVALID_REQUEST')
    reader=open_pdf(storage(row,auth));sizes=page_sizes(reader);mapping=saved_map(reader,property_id)
    if action=='inspect':body=json.dumps({'pages':sizes,'mapping':mapping},ensure_ascii=False).encode();mime='application/json; charset=utf-8'
    elif action=='text':
        number=data.get('page')
        if type(number) is not int or not 1<=number<=len(reader.pages):raise ValueError('INVALID_FIELD_PAGE')
        body=json.dumps({'text':(reader.pages[number-1].extract_text() or '')[:100000]},ensure_ascii=False).encode();mime='application/json; charset=utf-8'
    elif action=='page':body=render_page(reader,data.get('page'));mime='image/png'
    elif action=='save':
        mapping=validate_map(data.get('mapping'),sizes,property_id);body=write_template(reader,mapping);mime='application/pdf'
    else:
        if not mapping:raise ValueError('SAVED_TEMPLATE_REQUIRED')
        body=fill_template(reader,mapping,data.get('values'));mime='application/pdf'
    if len(body)>4*1024*1024:raise ValueError('PDF_OUTPUT_LIMIT')
    final=preview._context(workspace,auth,rpc_call)
    if final.get('user_id')!=context.get('user_id'):raise PermissionError('ACCESS_DENIED')
    return body,mime


class handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def respond(self,status,body,mime='application/json; charset=utf-8'):
        self.send_response(status)
        for k,v in [('Content-Type',mime),('Cache-Control','private, no-store, max-age=0'),('Vercel-CDN-Cache-Control','no-store'),('Vary','Authorization'),('X-Content-Type-Options','nosniff'),('Content-Length',str(len(body)))]:self.send_header(k,v)
        if mime=='application/pdf':self.send_header('Content-Disposition','inline; filename="aqari-pdf-template.pdf"')
        self.end_headers();self.wfile.write(body)
    def do_POST(self):
        try:
            origin=self.headers.get('Origin')
            if origin and origin!='https://'+self.headers.get('Host',''):raise PermissionError('ORIGIN_REJECTED')
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=150000:raise ValueError('INVALID_REQUEST')
            body,mime=process(json.loads(self.rfile.read(size)),self.headers.get('Authorization'));self.respond(200,body,mime)
        except (PermissionError,HTTPError):self.respond(403,b'{"error":"ACCESS_DENIED"}')
        except Exception as exc:
            allowed={'INVALID_PDF','PDF_LIMIT','PDF_EXISTING_FORM','PDF_PAGE_SIZE','TEMPLATE_TITLE_REQUIRED','FIELDS_REQUIRED','INVALID_FIELD','INVALID_FIELD_PAGE','INVALID_FIELD_POSITION','FIELD_OVERLAP','FIELD_TEXT_TOO_LONG','FIELD_VALUES_REQUIRED','INVALID_FIELD_VALUE','PDF_OUTPUT_LIMIT','PDF_INTEGRITY_FAILED','SAVED_TEMPLATE_REQUIRED'}
            code=str(exc) if str(exc) in allowed else 'INVALID_PDF_TEMPLATE'
            self.respond(400,json.dumps({'error':code}).encode())
