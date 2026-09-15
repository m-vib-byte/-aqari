import unittest
from lib.mfa_selftest import totp_code,_totp_candidates,_config,_error_code,_factor_status,_expect_factors

ENV={'VERCEL_ENV':'preview','VERCEL_GIT_COMMIT_REF':'support/v267-knet-range-reconcile-20260915','VERCEL_GIT_COMMIT_SHA':'a'*40,'AQARI_SUPABASE_URL':'https://ofgmcsmxmdswlovsckqs.supabase.co','AQARI_SUPABASE_SERVICE_ROLE_KEY':'sb_secret_'+'x'*32}

class MfaSelftestTest(unittest.TestCase):
 def test_rfc_totp_vector_is_compatible(self):
  # RFC 6238 SHA1 vector truncated to six digits.
  self.assertEqual(totp_code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59), '287082')
 def test_selftest_tries_current_then_adjacent_totp_windows(self):
  candidates=_totp_candidates('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59)
  self.assertEqual([offset for offset,_ in candidates],[0,-30,30])
  self.assertEqual(candidates[0][1],'287082')
  self.assertEqual(len({code for _,code in candidates}),3)
 def test_selftest_is_preview_branch_and_exact_sha_only(self):
  self.assertEqual(_config(ENV)[0],'https://ofgmcsmxmdswlovsckqs.supabase.co')
  for changed,error in (({'VERCEL_ENV':'production'},'MFA_SELFTEST_PREVIEW_ONLY'),({'VERCEL_GIT_COMMIT_REF':'main'},'MFA_SELFTEST_PREVIEW_ONLY'),({'VERCEL_GIT_COMMIT_SHA':'bad'},'MFA_SELFTEST_SHA_REQUIRED'),({'AQARI_SUPABASE_URL':'https://wrong.supabase.co'},'MFA_SELFTEST_STAGING_TARGET_REQUIRED'),({'AQARI_SUPABASE_SERVICE_ROLE_KEY':''},'MFA_SELFTEST_AUTH_ADMIN_NOT_CONFIGURED')):
   with self.subTest(changed=changed),self.assertRaisesRegex(RuntimeError,error):_config({**ENV,**changed})
 def test_upstream_error_is_sanitized(self):
  self.assertEqual(_error_code({'code':'mfa_verification_failed'}),'mfa_verification_failed')
  self.assertEqual(_error_code({'message':'contains spaces or sensitive detail'}),'UPSTREAM_REJECTED')
 def test_factor_status_requires_exact_totp_factor_and_transition_state(self):
  fid='11111111-2222-3333-4444-555555555555'
  unverified=[{'id':fid,'factor_type':'totp','status':'unverified'}]
  verified={'factors':[{'id':fid,'factor_type':'totp','status':'verified'}]}
  self.assertEqual(_factor_status(_expect_factors('FACTOR_UNVERIFIED',200,unverified),fid),'unverified')
  self.assertEqual(_factor_status(_expect_factors('FACTOR_VERIFIED',200,verified),fid),'verified')
  self.assertIsNone(_factor_status([{'id':fid,'factor_type':'phone','status':'verified'}],fid))
  self.assertIsNone(_factor_status([{'id':'other','factor_type':'totp','status':'verified'}],fid))
  with self.assertRaisesRegex(RuntimeError,'FACTOR_VERIFIED:INVALID_RESPONSE'):_expect_factors('FACTOR_VERIFIED',200,'bad')

if __name__=='__main__':unittest.main()
