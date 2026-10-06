# Preserve drafts on explicit step-up authentication rejection

Hosted candidate 1dc220bb853b533adeb3c63a6ca9811b8051e4fa was READY. Secure browser sign-in succeeded as the existing general manager. The official document form loaded the existing synthetic Preview lease TEST-V267-20260910-01 and authoritative statement values: opening 0, charges 200, payments 200, credits 0, closing 0 for 2026-09-01 through 2026-10-06. This is authenticated read evidence, not completed issuance.

Clicking issue closed the dialog without a visible explanation; the Preview reservation count for tenant_statement was zero. The live response body was not observed, so its exact denial reason is not claimed. Source inspection showed that all 403/42501 errors close dialogs, including explicit MFA_REQUIRED and MFA_RECENT_REAUTH_REQUIRED. An executable regression reproduced the draft loss for both named responses.

The candidate preserves a draft only for an exact 403 + 42501 + named MFA response and only after the bound user/workspace/role check succeeds. It explains that recent second-factor verification is required and no operation was performed. It does not retry, grant access, create an account, disable MFA or bypass server checks. Other authorization denials and session boundaries retain immediate disposal.

24 focused dialog and official-form runtime tests passed after the pre-fix failure. Browser acceptance of this new candidate remains pending. No confirmed document issuance, PDF download, financial movement or production deployment occurred in this verification.

## Follow-up: authenticated period reads and retry identity

On the same authenticated hosted head `1dc220bb853b533adeb3c63a6ca9811b8051e4fa`, the existing synthetic lease returned these read-only UI values:

| Period | Opening | Charges | Payments | Credits | Closing |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-09-01 through 2026-10-06 | 0.000 | 200.000 | 200.000 | 0.000 | 0.000 |
| 2026-10-01 through 2026-10-06 | -100.000 | 100.000 | 0.000 | 0.000 | 0.000 |
| 2026-09-01 through 2026-09-30 | 0.000 | 100.000 | 200.000 | 0.000 | -100.000 |

Setting the end date before the start displayed the Arabic date-validation message and disabled issuance. Correcting the start date cleared that error, reloaded the authoritative values and enabled issuance again. Financial fields were read-only. No issuance was submitted during these period checks.

Four additional transport-simulated tests exercise the actual official form, session and dialog together. Both named MFA rejections are injected separately before number reservation and before registration. They verify retention of the reason and financial fields, no automatic retry, no falsely confirmed archive, and reuse of the same reservation request on the explicit next attempt. Exactly one serial and one archived version result. These tests do not perform real MFA or prove hosted issuance.

Focused test command: `node --test tests/v267-dialog-boundary.test.mjs tests/v267-dialog-progress.test.mjs tests/v267-official-document-source-runtime.test.mjs` — **28 passed, 0 failed, 0 skipped**.

The prior fix head `04f42c9f2e6160943039d14191fe1d38d54ee724` had successful test/startup-order/paint checks and READY deployment `dpl_BtdB9wwPpLq5ZD3nXMSAuTKxkV1Y`; Supabase Preview was skipped. Its hosted page reached the Vercel sign-in gate in this follow-up, so authenticated browser acceptance of the fix remains open. No production deployment or database mutation was made by this follow-up.
