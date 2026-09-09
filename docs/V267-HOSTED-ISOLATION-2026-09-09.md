# V267 hosted test isolation — 9 September 2026

The owner completed the Supabase subscription upgrade. The connected API verified Pro on the existing organization. This resolves the prerequisite for creating a development branch; it does not resolve GitHub Actions billing or runner allocation.

## Independent target

- Branch: `v267-isolated-test`; branch ID `5ae2b208-dba5-4e83-981d-84a7c19ccbc0`.
- Test project: `ofgmcsmxmdswlovsckqs`; parent: `djkpkkgoibruaezdrchb`.
- Created 2026-09-09 18:45 UTC, `with_data=false`, `FUNCTIONS_DEPLOYED`, `ACTIVE_HEALTHY`.
- This is a preview branch (`persistent=false`), subject to provider preview-branch lifecycle rules. No branch merge, reset or rebase was performed.
- Operating quote: USD 0.01344/hour, previously authorized by the owner, in addition to the Pro subscription and other project/usage charges. No further subscription or spend-cap change was performed by this work.
- The V266 project `qtavnufzbkdfeauyukot` and the shared live database `djkpkkgoibruaezdrchb` remain protected. All SQL writes in this work targeted only `ofgmcsmxmdswlovsckqs`.

The branch inherited 33 schema migrations and an empty workspace/state. Initial checks found zero Auth users, memberships, tenants, leases, payments, stored objects and vault secrets. There are no foreign servers or deployed Edge Functions. Both document buckets are private. The inherited payroll draft job was disabled on this test branch only, so test fixtures cannot enter a scheduled payroll run.

## Applied existing reviewed SQL

| Hosted migration version | Source |
|---|---|
| `20260909184808` | `staging-database/sql/staff-property-scope.sql` |
| `20260909184812` | `staging-database/sql/financial-register.sql` |
| `20260909184815` | `staging-database/sql/workspace-feature-discovery.sql` |

Three transactional regression suites passed against the new hosted database: `staff_property_scope.sql`, `financial_register.sql`, and `staff_contract_approval.sql`. These cover scoped collection save/readback, preservation of hidden rows, revocation, exact KWD expenses, document/approval/audit controls, closed financial periods, and legacy-contract approval bypass rejection. The same tests were previously verified locally. Test comments mentioning local execution do not change the fact that these three runs used this independently verified hosted target.

Every fixture was rolled back. Post-test counts were zero for Auth users, memberships, tenants, leases, payments, staff assignments and financial expenses. Active cron jobs, public buckets, foreign servers and vault secrets were also zero.

## Preview configuration

Browser configuration, server configuration, session binding, direct document requests, tenant/partner portals, password recovery, cloud-state handling and saved-contract routing now target `ofgmcsmxmdswlovsckqs` with its own publishable key and `sb-ofgmcsmxmdswlovsckqs-auth-token` session key. The two protected targets are explicitly rejected by the configuration generator and session guard.

Regression coverage checks browser/server agreement, protected-project rejection, and document requests staying on the isolated target even when configuration changes during a session. No secret/service-role key or copied authentication credential is included.

## Verification and open gates

- The complete local Node suite passed before the final configuration-generator guard: 632 tests, zero failures/skips. The final guard receives a targeted regression run recorded in the PR.
- Package validation, all 15 critical runtime checksum/syntax checks, and whitespace validation passed on the configuration changes.
- Security advisors returned 15 informational private-table RLS-without-policy findings and 15 warnings for authenticated SECURITY DEFINER RPCs. Direct access to these private tables is intentionally denied; the scoped RPC tests verify the access checks. These findings are disclosed, not suppressed, and are not a zero-advisory claim. [RLS guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [RPC guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Browser tab discovery timed out; documented recovery and one retry also timed out. No authenticated browser, real-account, physical-iPhone/iPad or visual pass is claimed.
- No real account was copied or created in the new Auth instance. New-instance account activation and Auth redirect settings still need verification before owner login acceptance. Business-source data import and reconciliation remain open.
- GitHub startup-order run `34389122343` on parent head `25c86f6` failed with `runner_id=0`, `steps=[]`, and no log URL. No test ran. This matches the earlier pre-run failure pattern; this endpoint does not expose the current billing annotation. Supabase payment is not evidence of GitHub billing recovery. No workflow was bypassed or weakened.
- Deployment and Actions results on the new commit are recorded in PR #70 after the push. READY by itself is not login or final-release acceptance.

Release Gate remains HOLD. No PR merge, production deployment, domain reassignment or V266 modification was performed.
