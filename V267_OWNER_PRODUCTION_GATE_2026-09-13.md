# AQARI V267 — Owner Production Gate (13 Sep 2026)

Status: **HOLD unless every release gate is satisfied and the owner later gives explicit Production approval for the exact candidate SHA.**

This policy supersedes earlier automatic-deploy authority for V267. Approval of styling, luxury/polish, a Vercel READY build, or a preview review is not Production approval.

Before Production approval may be validated, the exact candidate must already have passed the owner's final hosted acceptance and the complete release evidence must remain current: 155/155 accepted with evidence, CI green on that same SHA, hosted preview tested, real-account login/session/save/reopen/permissions/contracts/printing on Desktop plus physical iPhone and physical iPad, complete current Database/Auth/Storage backup including attachment bytes, independent restore, tested rollback preserving existing and new transactions, and correct Production configuration.

The mechanical guard is `scripts/v267-owner-production-approval.mjs`. It fails closed unless:

- candidate, final-tested, and owner-approved values are full 40-character SHAs and are identical;
- the decision is exactly `approved_for_production`;
- final-test and approval timestamps are valid ISO-8601 values; and
- Production approval occurred strictly after final owner testing.

`.github/workflows/v267-owner-production-approval.yml` is validation-only. It has read-only repository permissions and contains no merge, Vercel, Supabase, DNS, or Production write/deploy step. Passing this policy check is necessary but is **not sufficient** to claim release readiness; the rest of the owner gate still needs independent evidence.

No merge to `main`, Production deployment, or `myaqari.com` change is authorized by this document or by a passing preview/policy test alone.
