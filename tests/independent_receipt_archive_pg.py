"""Real receipt renderer/API archive + real archive SQL on a fresh Unix-socket PG.
Synthetic relational/auth boundary only; no contract issuance or hosted RLS claim.
"""
import sys,os,json,hashlib,base64,subprocess,tempfile,socket,importlib.util
from pathlib import Path
from copy import deepcopy
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
OUT=Path('/workspace/aqari-independent-evidence/remaining-20261026/receipt-pg');OUT.mkdir(parents=True,exist_ok=True)
BIN=Path('/workspace/aqari-test-tools/pgsql/usr/lib/postgresql/17/bin')
from tests.rent_pdf_test import fixture,staff_payment,W,U
spec=importlib.util.spec_from_file_location('independent_receipt_api',ROOT/'api/rent-receipt.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
def no_network(*args,**kwargs):raise RuntimeError('NETWORK_FORBIDDEN')
socket.socket.connect=no_network;socket.create_connection=no_network;socket.getaddrinfo=no_network
run=Path(tempfile.mkdtemp(prefix='aqari-receipt-pg-',dir='/workspace'));data=run/'data';sock=run/'socket';sock.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};port='55439';started=False;results=[]
def command(args):
 r=subprocess.run(args,input=None,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError('Local command failed: '+r.stderr[-1200:])
 return r.stdout

def sql(statement,role=None):
 prefix=''
 if role:prefix="set role "+role+";set request.jwt.claim.sub='"+U+"';"
 r=subprocess.run([str(BIN/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(sock),'-p',port,'-U','synthetic','-d','postgres'],input=prefix+statement,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError(r.stderr.strip())
 return r.stdout.strip()
def lit(v):return "'"+str(v).replace("'","''")+"'"
def record(name,**details):results.append({'name':name,'passed':True,**details});print('PASS '+name,flush=True)
try:
 command([str(BIN/'initdb'),'-D',str(data),'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=reject','-U','synthetic'])
 command([str(BIN/'pg_ctl'),'-D',str(data),'-l',str(run/'postgres.log'),'-o',"-k "+str(sock)+" -c listen_addresses='' -c unix_socket_permissions=0700 -p "+port,'-w','start']);started=True
 sql("""create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.synthetic_access(actor uuid primary key,allowed boolean);
 create function private.aqari_can_lease(uuid,uuid,text,text) returns boolean language sql stable as $$select coalesce((select allowed from public.synthetic_access where actor=auth.uid()),false)$$;
 create function private.aqari_owns_tenant(uuid,uuid) returns boolean language sql stable as $$select false$$;
 create table public.aqari_leases(id uuid primary key,workspace_id uuid,tenant_id uuid);
 create table public.aqari_rent_payments(id uuid primary key,workspace_id uuid,lease_id uuid,reference text,status text,receipt jsonb);
 create table private.aqari_financial_audit(workspace_id uuid,entity_id text,action text,actor_id uuid,actor_name text,reason text,after_value jsonb);
 grant usage on schema public,auth to authenticated,service_role;
 """)
 source=(ROOT/'staging-database/sql/operations-completion.sql').read_text();start=source.index('create function private.aqari_reject_immutable_change()');end=source.index('revoke all on function private.aqari_reject_immutable_change()',start);sql(source[start:end])
 sql((ROOT/'staging-database/sql/rent-receipt-pdf-archive.sql').read_text())
 state=fixture();payment=staff_payment();pid='44444444-4444-4444-8444-444444444444';lease=payment['lease_id'];tid='55555555-5555-4555-8555-555555555555'
 sql(f"insert into synthetic_access values({lit(U)},true);insert into aqari_leases values({lit(lease)},{lit(W)},{lit(tid)});insert into aqari_rent_payments values({lit(pid)},{lit(W)},{lit(lease)},'TEST-001','paid',{lit(json.dumps(state['rentReceiptsV267'][0],ensure_ascii=False))}::jsonb);")
 commits=0;renders=0
 def read(path,auth,body=None):
  assert auth=='Bearer a.b.c'
  if path=='/auth/v1/user':return {'id':U}
  if path=='/rest/v1/rpc/aqari_rent_receipt_pdf_get':return json.loads(sql(f"select public.aqari_rent_receipt_pdf_get({lit(W)},'TEST-001');",'authenticated'))
  if path.startswith('/rest/v1/aqari_memberships?'):return [{'user_id':U,'workspace_id':W,'role':'accountant','is_active':True}]
  if path.startswith('/rest/v1/rpc/aqari_read_state_v267?'):return {'workspace_id':W,'payload':deepcopy(state)}
  if path.startswith('/rest/v1/aqari_rent_payments?'):return [deepcopy(payment)]
  raise AssertionError('Unexpected read path')
 def commit(d):
  global commits
  commits+=1;args=','.join(lit(d[k]) for k in ['p_workspace_id','p_receipt_no','p_actor_id','p_pdf_base64','p_pdf_sha256','p_renderer_version'])
  result=json.loads(sql('select public.aqari_rent_receipt_pdf_commit('+args+');','service_role'));assert result['archived'] is True
  # A committed SQL transaction succeeds, but its caller loses the reply.
  raise OSError('Synthetic lost response after actual committed SQL')
 def render(d,auth,reader):
  global renders
  renders+=1;return api.export_pdf(d,auth,reader)
 req={'workspaceId':W,'receiptNo':'TEST-001'}
 pdf=api.export_archive(req,'Bearer a.b.c',read,commit,render);assert pdf.startswith(b'%PDF-');assert commits==renders==1
 archived=json.loads(sql(f"select public.aqari_rent_receipt_pdf_get({lit(W)},'TEST-001');",'authenticated'))
 assert base64.b64decode(archived['pdf_base64'])==pdf;assert archived['pdf_sha256']==hashlib.sha256(pdf).hexdigest();assert sql('select count(*) from private.aqari_rent_receipt_pdf_artifacts;')=='1';assert sql('select count(*) from private.aqari_financial_audit;')=='1'
 (OUT/'synthetic-archived-receipt.pdf').write_bytes(pdf)
 record('real renderer and archive SQL recover committed lost response with exact PDF readback',bytes=len(pdf),sha256=hashlib.sha256(pdf).hexdigest(),archives=1,audit=1)
 again=api.export_archive(req,'Bearer a.b.c',read,commit,render);assert again==pdf;assert commits==renders==1
 record('reopen returns immutable archived bytes without rendering or committing again')
 args=','.join(lit(v) for v in [W,'TEST-001',U,base64.b64encode(pdf).decode(),hashlib.sha256(pdf).hexdigest(),api.RENDERER_VERSION]);replay=json.loads(sql('select public.aqari_rent_receipt_pdf_commit('+args+');','service_role'));assert replay['replayed'];assert sql('select count(*) from private.aqari_financial_audit;')=='1'
 record('duplicate SQL commit replays one archive and one audit event')
 sql('update synthetic_access set allowed=false;')
 try:api.export_archive(req,'Bearer a.b.c',read,commit,render)
 except RuntimeError as e:assert 'ACCESS_DENIED' in str(e)
 else:raise AssertionError('revoked access returned PDF')
 assert commits==renders==1;record('revoked synthetic access is enforced by real archive SQL before PDF return')
 sql('update synthetic_access set allowed=true;')
 try:sql("update private.aqari_rent_receipt_pdf_artifacts set renderer_version='changed';")
 except RuntimeError as e:assert 'IMMUTABLE' in str(e).upper()
 else:raise AssertionError('archive update unexpectedly allowed')
 record('actual immutable trigger refuses archive update')
 sql("update public.aqari_rent_payments set receipt=jsonb_set(receipt,'{record,2}','1'::jsonb);")
 try:api.export_archive(req,'Bearer a.b.c',read,commit,render)
 except RuntimeError as e:assert 'RECEIPT_ARCHIVE_SOURCE_CHANGED' in str(e)
 else:raise AssertionError('changed payment source returned archived PDF')
 assert sql('select count(*) from private.aqari_rent_receipt_pdf_artifacts;')=='1';record('changed payment snapshot cannot reuse prior archive; prior bytes retained')
finally:
 if started:command([str(BIN/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'])
 (OUT/'results.json').write_text(json.dumps({'baseline':'2a8bdf7e10b247800dc7abfed7a4a2588959f28d','results':results,'cluster':str(run),'stopped':started,'listen_addresses':'','runtime':'PostgreSQL 17.11','scope':'Actual API/render/archive SQL; synthetic payment/contract inputs and access helper. Not full issuance, hosted RLS or production migration acceptance. No HTTP transport tested.'},indent=2))
