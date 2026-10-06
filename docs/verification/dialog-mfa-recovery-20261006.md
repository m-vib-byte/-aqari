# Preserve drafts on explicit step-up authentication rejection

Hosted candidate 1dc220bb853b533adeb3c63a6ca9811b8051e4fa was READY. Secure browser sign-in succeeded as the existing general manager. The official document form loaded the existing synthetic Preview lease TEST-V267-20260910-01 and authoritative statement values: opening 0, charges 200, payments 200, credits 0, closing 0 for 2026-09-01 through 2026-10-06. This is authenticated read evidence, not completed issuance.

Clicking issue closed the dialog without a visible explanation; the Preview reservation count for tenant_statement was zero. The live response body was not observed, so its exact denial reason is not claimed. Source inspection showed that all 403/42501 errors close dialogs, including explicit MFA_REQUIRED and MFA_RECENT_REAUTH_REQUIRED. An executable regression reproduced the draft loss for both named responses.

The candidate preserves a draft only for an exact 403 + 42501 + named MFA response and only after the bound user/workspace/role check succeeds. It explains that recent second-factor verification is required and no operation was performed. It does not retry, grant access, create an account, disable MFA or bypass server checks. Other authorization denials and session boundaries retain immediate disposal.

24 focused dialog and official-form runtime tests passed after the pre-fix failure. Browser acceptance of this new candidate remains pending. No confirmed document issuance, PDF download, financial movement or production deployment occurred in this verification.
