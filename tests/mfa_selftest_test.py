import unittest
from lib.mfa_selftest import totp_code,_config,_error_code

ENV={'VERCEL_ENV':'preview','VERCEL_GIT_COMMIT_REF':'support/v267-knet-range-reconcile-20260915','VERCEL_GIT_COMMIT_SHA':'a'*40,'AQARI_SUPABASE_URL':'https://ofgmcsmxmdswlovsckqs.supabase.co','AQARI_SUPABASE_SERVICE_ROLE_KEY':'sb_secret_'+'x'*32}

class MfaSelftestTest(unittest.TestCase):
 def test_rfc_totp_vector_is_compatible(self):
  # RFC 6238 SHA1 vector truncated to six digits.
  self.assertEqual(totp_code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59), '287082')
 def test_selftest_is_preview_branch_and_exact_sha_only(self):
  self.assertEqual(_config(ENV)[0],'https://ofgmcsmxmdswlovsckqs.supabase.co')
  for changed,error in (({'VERCEL_ENV':'production'},'MFA_SELFTEST_PREVIEW_ONLY'),({'VERCEL_GIT_COMMIT_REF':'main'},'MFA_SELFTEST_PREVIEW_ONLY'),({'VERCEL_GIT_COMMIT_SHA':'bad'},'MFA_SELFTEST_SHA_REQUIRED'),({'AQARI_SUPABASE_URL':'https://wrong.supabase.co'},'MFA_SELFTEST_STAGING_TARGET_REQUIRED'),({'AQARI_SUPABASE_SERVICE_ROLE_KEY':''},'MFA_SELFTEST_AUTH_ADMIN_NOT_CONFIGURED')):
   with self.subTest(changed=changed),self.assertRaisesRegex(RuntimeError,error):_config({**ENV,**changed})
 def test_upstream_error_is_sanitized(self):
  self.assertEqual(_error_code({'code':'mfa_verification_failed'}),'mfa_verification_failed')
  self.assertEqual(_error_code({'message':'contains spaces or sensitive detail'}),'UPSTREAM_REJECTED')

if __name__=='__main__':unittest.main()
