"""Real receipt renderer/API archive + real archive SQL on a fresh Unix-socket PG.
Synthetic relational/auth boundary only; no contract issuance or hosted RLS claim.
"""
import sys,os,json,hashlib,base64,subprocess,tempfile,socket,importlib.util
from pathlib import Path
from copy import deepcopy
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
OUT=Path('/workspace/aqari-independent-evidence/remaining-20261026/archive-permissions-pg');OUT.mkdir(parents=True,exist_ok=True)
BIN=Path('/workspace/aqari-test-tools/pgsql/usr/lib/postgresql/17/bin')
from tests.rent_pdf_test import fixture,staff_payment,W,U
spec=importlib.util.spec_from_file_location('independent_receipt_api',ROOT/'api/rent-receipt.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
def no_network(*args,**kwargs):raise RuntimeError('NETWORK_FORBIDDEN')
socket.socket.connect=no_network;socket.create_connection=no_network;socket.getaddrinfo=no_network
run=Path(tempfile.mkdtemp(prefix='aqari-archive-permissions-pg-',dir='/workspace'));data=run/'data';sock=run/'socket';sock.mkdir(mode=0o700)
env={k:v for k,v in os.environ.items() if not k.startswith('PG')};port='55440';started=False;results=[]
def command(args):
 r=subprocess.run(args,input=None,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError('Local command failed: '+r.stderr[-1200:])
 return r.stdout

def sql(statement,role=None,actor=None):
 prefix=''
 if role:prefix="set role "+role+";set request.jwt.claim.sub='"+(actor or U)+"';"
 r=subprocess.run([str(BIN/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',str(sock),'-p',port,'-U','synthetic','-d','postgres'],input=prefix+statement,text=True,capture_output=True,env=env)
 if r.returncode:raise RuntimeError(r.stderr.strip())
 return r.stdout.strip()
def lit(v):return "'"+str(v).replace("'","''")+"'"
def record(name,**details):results.append({'name':name,'passed':True,**details});print('PASS '+name,flush=True)
import re
MODE=os.environ.get('AQARI_ARCHIVE_PERMISSION_MODE','before')
MIG='staging-database/supabase/migrations/20260921090251_v267_template_families_a4_archive.sql'
def function(path,name):
 s=(ROOT/path).read_text();m=re.search(r'create (?:or replace )?function '+re.escape(name)+r'\([\s\S]*?\$\$;',s);assert m,name;return m.group()
def get(actor,action,doc=None):
 body={} if doc is None else {'id':doc}
 return json.loads(sql(f"select public.aqari_rental_document_archive({lit(W)},{lit(action)},{lit(json.dumps(body))}::jsonb);",'authenticated',actor))
GM='66666666-6666-4666-8666-666666666666';PROP='77777777-7777-4777-8777-777777777777';UNIT='88888888-8888-4888-8888-888888888888';LEASE='99999999-9999-4999-8999-999999999999'
ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc']
try:
 command([str(BIN/'initdb'),'-D',str(data),'--no-locale','--encoding=UTF8','--auth-local=trust','--auth-host=reject','-U','synthetic'])
 command([str(BIN/'pg_ctl'),'-D',str(data),'-l',str(run/'postgres.log'),'-o',"-k "+str(sock)+" -c listen_addresses='' -c unix_socket_permissions=0700 -p "+port,'-w','start']);started=True
 sql("""create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);create table public.aqari_workspaces(id uuid primary key);
 create table public.aqari_memberships(workspace_id uuid,user_id uuid,role text,is_active boolean);
 create table public.aqari_workspace_controls(workspace_id uuid,settings jsonb);
 create table private.aqari_staff_assignments(workspace_id uuid,user_id uuid,operational_role text,property_ids uuid[],is_active boolean);
 create table public.aqari_properties(workspace_id uuid,id uuid);
 create table public.aqari_units(workspace_id uuid,id uuid,property_id uuid);
 create table public.aqari_leases(workspace_id uuid,id uuid,unit_id uuid);
 grant usage on schema public,auth,private to authenticated;
 """)
 for name in ['private.aqari_manager','private.aqari_section_keys']:sql(function('staging-database/supabase/migrations/20260907203456_v267_workspace_controls.sql',name))
 sql(function('staging-database/sql/staff-property-scope.sql','private.aqari_staff_ceiling'))
 sql(function('staging-database/sql/staff-membership-ceiling.sql','private.aqari_can'))
 for name in ['private.aqari_can_property','private.aqari_can_lease']:sql(function('staging-database/sql/staff-property-scope.sql',name))
 migration=(ROOT/MIG).read_text();start=migration.index('create table private.aqari_rental_document_archive(');end=migration.index('create trigger aqari_rental_document_archive_immutable',start);sql(migration[start:end])
 sql(function(MIG,'private.aqari_rental_document_archive'));sql(function(MIG,'public.aqari_rental_document_archive'))
 if MODE=='after':sql((ROOT/'staging-database/sql/rental-archive-receipt-permission.sql').read_text())
 settings={'permissions':{'user:'+U:{'collections':{'read':False}}}}
 sql(f"insert into auth.users values({lit(U)}),({lit(GM)});insert into aqari_workspaces values({lit(W)});insert into aqari_memberships values({lit(W)},{lit(U)},'accountant',true),({lit(W)},{lit(GM)},'general_manager',true);insert into aqari_workspace_controls values({lit(W)},{lit(json.dumps(settings))}::jsonb);insert into private.aqari_staff_assignments values({lit(W)},{lit(U)},'accountant',array[{lit(PROP)}]::uuid[],true);insert into aqari_properties values({lit(W)},{lit(PROP)});insert into aqari_units values({lit(W)},{lit(UNIT)},{lit(PROP)});insert into aqari_leases values({lit(W)},{lit(LEASE)},{lit(UNIT)});")
 for i,kind in enumerate(['rental_agreement','rent_receipt','custom']):
  receipt='null' if i==0 else lit('dddddddd-dddd-4ddd-8ddd-dddddddddddd')+'::uuid'
  sql(f"insert into private.aqari_rental_document_archive(id,workspace_id,template_id,template_version,kind,title,property_id,unit_id,tenant_id,lease_id,receipt_id,source_sha256,snapshot,snapshot_sha256,pdf_bytes,pdf_sha256,renderer_version,issued_by,issued_by_name,reason) values({lit(ids[i])},{lit(W)},{lit(ids[i])},1,{lit(kind)},'Synthetic only',{lit(PROP)},{lit(UNIT)},{lit(U)},{lit(LEASE)},{receipt},repeat('a',64),'{{}}',encode(sha256(convert_to('{{}}','UTF8')),'hex'),convert_to('%PDF-1.4 SYNTHETIC','UTF8'),encode(sha256(convert_to('%PDF-1.4 SYNTHETIC','UTF8')),'hex'),'test',{lit(GM)},'Synthetic','Local permission test');")
 permissions=json.loads(sql(f"select jsonb_build_object('contracts',private.aqari_can({lit(W)},'contracts','read'),'collections',private.aqari_can({lit(W)},'collections','read'),'property',private.aqari_can_property({lit(W)},{lit(PROP)},'properties','read'));",'authenticated',U));assert permissions=={'contracts':True,'collections':False,'property':True}
 listed=get(U,'list')['items'];observation={'mode':MODE,'permissions':permissions,'listedKinds':[r['kind'] for r in listed],'directReceiptExposed':False,'directCustomReceiptExposed':False}
 for index in [1,2]:
  try:
   row=get(U,'get',ids[index])['record'];observation['directReceiptExposed' if index==1 else 'directCustomReceiptExposed']=bool(row['pdf_base64'])
  except RuntimeError as e:assert 'ACCESS_DENIED' in str(e)
 (OUT/(MODE+'-observation.json')).write_text(json.dumps(observation,indent=2));print(json.dumps(observation),flush=True)
 assert [r['kind'] for r in listed]==['rental_agreement'],'Receipt metadata exposed to contracts-only reader'
 assert not observation['directReceiptExposed'] and not observation['directCustomReceiptExposed'],'Receipt bytes exposed'
 record('actual permission functions: collections-denied staff sees only ordinary contract, receipt/custom receipt get denied')
 ordinary=get(U,'get',ids[0])['record'];assert base64.b64decode(ordinary['pdf_base64'])==b'%PDF-1.4 SYNTHETIC'
 for i in [1,2]:assert get(GM,'get',ids[i])['record']['pdf_base64']==ordinary['pdf_base64']
 record('ordinary contract remains readable and manager receives unchanged receipt bytes')
 sql("update aqari_workspace_controls set settings='{}';")
 for i in [1,2]:assert get(U,'get',ids[i])['record']['pdf_base64']==ordinary['pdf_base64']
 assert len(get(U,'list')['items'])==3;record('authorized collections reader receives all three original archives')
 sql(f"update aqari_workspace_controls set settings={lit(json.dumps(settings))}::jsonb;")
 for i in [1,2]:
  try:get(U,'get',ids[i])
  except RuntimeError as e:assert 'ACCESS_DENIED' in str(e)
  else:raise AssertionError('revoked collections permission returned receipt')
 assert len(get(U,'list')['items'])==1;assert get(U,'get',ids[0])['record']['pdf_base64']==ordinary['pdf_base64'];record('revocation after successful read blocks subsequent receipt get/list while contract remains readable')
finally:
 if started:command([str(BIN/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'])
 (OUT/(MODE+'-results.json')).write_text(json.dumps({'baseline':'2a8bdf7e10b247800dc7abfed7a4a2588959f28d','mode':MODE,'results':results,'cluster':str(run),'stopped':started,'scope':'Actual archive get/list and actual staff permission functions on minimal synthetic schema; source issuance RPC not executed; no hosted permission changes.'},indent=2))
