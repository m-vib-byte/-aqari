"""One-shot Preview build proof for Issue #193. Never prints credentials or MFA secrets."""
from pathlib import Path
import json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from lib.mfa_selftest import run_selftest

if os.environ.get('VERCEL_ENV')!='preview':
 print('V267 MFA live self-test skipped outside Preview.')
 raise SystemExit(0)

report=run_selftest()
safe={key:value for key,value in report.items() if key not in {'email','password','secret','token','code','factorId','challengeId','tenantId','userId'}}
print('V267 MFA live self-test:',json.dumps(safe,separators=(',',':'),sort_keys=True))
required=('tenantPrepared','created','aal1','enrolled','factorUnverified','qrReturned','challenged','verified','factorVerified','aal2','cleanup','tenantCleanup')
if report.get('ok') is not True or any(report.get(key) is not True for key in required):
 raise SystemExit(1)
