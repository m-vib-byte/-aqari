import unittest
from lib.qa_accounts import automation_request,provision_automation_account,disable_account,expire_accounts,server_config,_service_headers

W='11111111-1111-4111-8111-111111111111';A='22222222-2222-4222-8222-222222222222';U='33333333-3333-4333-8333-333333333333'
ENV={'VERCEL_ENV':'preview','VERCEL_GIT_COMMIT_REF':'support/v267-knet-range-reconcile-20260915','AQARI_SUPABASE_URL':'https://ofgmcsmxmdswlovsckqs.supabase.co','AQARI_SUPABASE_SERVICE_ROLE_KEY':'sb_secret_'+'x'*32}
AUTH='Bearer aaaaa.bbbbb.ccccc'

class QaAccountsTest(unittest.TestCase):
 def test_server_config_is_preview_branch_and_staging_only(self):
  expected='https://ofgmcsmxmdswlovsckqs.supabase.co'
  self.assertEqual(server_config(ENV)[0],expected)
  no_url={key:value for key,value in ENV.items() if key!='AQARI_SUPABASE_URL'}
  self.assertEqual(server_config(no_url)[0],expected)
  for changed,error in (({'VERCEL_ENV':'production'},'QA_PREVIEW_ONLY'),({'VERCEL_GIT_COMMIT_REF':'main'},'QA_PREVIEW_ONLY'),({'AQARI_SUPABASE_URL':'https://wrong.supabase.co'},'QA_STAGING_TARGET_REQUIRED'),({'AQARI_SUPABASE_SERVICE_ROLE_KEY':''},'QA_AUTH_ADMIN_NOT_CONFIGURED')):
   with self.subTest(changed=changed),self.assertRaisesRegex(RuntimeError,error):server_config({**ENV,**changed})

 def test_opaque_secret_key_is_apikey_only_and_never_bearer(self):
  headers=_service_headers(ENV['AQARI_SUPABASE_SERVICE_ROLE_KEY'])
  self.assertEqual(headers,{'apikey':ENV['AQARI_SUPABASE_SERVICE_ROLE_KEY']})
  self.assertNotIn('Authorization',headers)

 def test_automation_roles_get_synthetic_email_and_general_manager_is_forbidden(self):
  value=automation_request({'qa_role':'collector','display_name':'QA Collector','property_ids':['p'],'expires_at':'x','reason':'qa'})
  self.assertRegex(value['email'],r'^qa-collector-[a-f0-9]{16}@example\.invalid$')
  with self.assertRaisesRegex(ValueError,'QA_AUTOMATION_EMAIL_FORBIDDEN'):automation_request({'qa_role':'collector','email':'real@example.com'})
  with self.assertRaisesRegex(ValueError,'INVALID_QA_ROLE'):automation_request({'qa_role':'general_manager'})
  tenant=automation_request({'qa_role':'tenant','email':'tenant@example.test'})
  self.assertEqual(tenant['email'],'tenant@example.test')

 def test_provision_uses_admin_create_once_and_password_is_not_persisted(self):
  calls=[]
  def user(workspace,action,data,auth,env):
   calls.append(('prepare',dict(data)));return {'id':A,'email':data['email'],'qa_role':data['qa_role'],'expires_at':'2026-09-16T00:00:00Z'}
  def create(email,password,env):
   calls.append(('create',email,password));return {'id':U,'email':email}
  def service(name,payload,env):
   calls.append(('service',name,dict(payload)));return {'id':A,'status':'active','auth_user_id':U}
  out=provision_automation_account(W,{'qa_role':'maintenance','display_name':'QA Maintenance','property_ids':['p'],'expires_at':'x','reason':'B role test'},AUTH,ENV,user,service,create)
  self.assertEqual(out['status'],'active');self.assertEqual(out['qaRole'],'maintenance');self.assertGreaterEqual(len(out['password']),32)
  prepared=calls[0][1];self.assertNotIn('password',prepared)
  service_payload=calls[2][2];self.assertNotIn('password',service_payload);self.assertEqual(service_payload['p_action'],'provision')

 def test_provision_failure_records_only_error_class(self):
  events=[]
  def user(workspace,action,data,auth,env):return {'id':A,'email':data['email'],'qa_role':data['qa_role'],'expires_at':'x'}
  def service(name,payload,env):events.append(dict(payload));return {'status':'provision_failed'}
  def create(email,password,env):raise OSError('contains-sensitive-provider-detail')
  with self.assertRaises(OSError):provision_automation_account(W,{'qa_role':'viewer','display_name':'QA','property_ids':['p'],'expires_at':'x','reason':'role test'},AUTH,ENV,user,service,create)
  self.assertEqual(events[-1]['p_error'],'OSError');self.assertNotIn('sensitive',str(events[-1]))

 def test_disable_revokes_application_access_before_auth_ban(self):
  order=[]
  def user(workspace,action,data,auth,env):order.append('app-revoke');return {'id':A,'status':'disable_pending','auth_user_id':U}
  def ban(user_id,env):order.append('auth-ban');return {'id':user_id}
  def service(name,payload,env):order.append('confirm');return {'id':A,'status':'disabled','auth_user_id':U}
  self.assertEqual(disable_account(W,A,'QA complete',AUTH,ENV,user,service,ban)['status'],'disabled')
  self.assertEqual(order,['app-revoke','auth-ban','confirm'])

 def test_expiry_revokes_in_database_then_bans_auth_user(self):
  order=[]
  def service(name,payload,env):
   if name=='aqari_qa_expire_accounts':order.append('app-expire');return [{'id':A,'userId':U}]
   order.append('confirm');return {'id':A,'status':'disabled'}
  def ban(user_id,env):order.append('auth-ban')
  self.assertEqual(expire_accounts(ENV,service,ban),{'expired':1,'banned':1,'banFailed':0});self.assertEqual(order,['app-expire','auth-ban','confirm'])

if __name__=='__main__':unittest.main()