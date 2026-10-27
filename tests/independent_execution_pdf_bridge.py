"""Local-only actual PDF preparation/archive adapter. No provider transport."""
import sys,json,socket,subprocess,os,base64,hashlib,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
def blocked(*a,**k):raise RuntimeError('NETWORK_FORBIDDEN')
socket.socket.connect=blocked;socket.create_connection=blocked;socket.getaddrinfo=blocked
from lib.contract_execution_package import prepare
from lib.rent_pdf import render_receipt,verified_receipt
from lib.official_document_pdf import render_official_document
req=json.load(sys.stdin);uid=req['user'];sock=req['socket'];assert sock.startswith('/workspace/aqari-execution-pg-') and sock.endswith('/socket')
def load(name):
 s=importlib.util.spec_from_file_location('local_'+name,ROOT/'api'/f'{name}.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
allowed={'aqari_contract_execution_package_source','aqari_contract_execution_package_commit','aqari_official_document_register','aqari_official_pdf_get','aqari_rent_receipt_pdf_get'}
def lit(v):
 if v is None:return 'null'
 return "'"+(json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else str(v)).replace("'","''")+"'"
def rpc(name,args,role='authenticated'):
 assert name in allowed and all(k.startswith('p_') and k.replace('_','').isalnum() for k in args)
 claims={'sub':uid,'role':'authenticated','aal':'aal2','auth_time':req['auth_time'],'amr':[{'method':'totp','timestamp':req['auth_time']}]}
 sql=f"set role {role};set request.jwt.claim.sub={lit(uid)};set request.jwt.claims={lit(claims)};select public.{name}("+','.join(k+'=>'+lit(v) for k,v in args.items())+');'
 r=subprocess.run(['/workspace/aqari-test-tools/pgsql/usr/lib/postgresql/17/bin/psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',sock,'-p','55441','-U','synthetic','-d','postgres'],input=sql,text=True,capture_output=True,env={k:v for k,v in os.environ.items() if not k.startswith('PG')})
 if r.returncode:raise RuntimeError(r.stderr.strip())
 return json.loads(r.stdout)
def read(path,auth,body=None):
 if path=='/auth/v1/user':return {'id':uid}
 prefix='/rest/v1/rpc/'
 if path.startswith(prefix):return rpc(path[len(prefix):],body)
 raise RuntimeError('UNKNOWN_READ_FORBIDDEN')
def no_commit(*a):raise RuntimeError('UNEXPECTED_NEW_ARCHIVE_RENDER')
try:
 if req['mode']=='prepare':
  out=prepare(req['body'],'Bearer a.b.c',read=read,commit=lambda p:rpc('aqari_contract_execution_package_commit',p,'service_role'),render_document=render_official_document,render_receipt=render_receipt,verify_receipt=verified_receipt)
 else:
  mod=load(req['mode']);pdf=mod.export_archive(req['body'],'Bearer a.b.c',read,no_commit,no_commit)
  if isinstance(pdf,tuple):pdf=pdf[0]
  out={'base64':base64.b64encode(pdf).decode(),'sha256':hashlib.sha256(pdf).hexdigest(),'bytes':len(pdf)}
 print(json.dumps({'data':out}))
except Exception as e:print(json.dumps({'error':str(e),'type':type(e).__name__}));sys.exit(1)
