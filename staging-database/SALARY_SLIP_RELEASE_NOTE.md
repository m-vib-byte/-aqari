# Dhahawi salary slip — V267 Staging

User reference: IMG_1461(2).jpeg. This change reproduces the bilingual salary-slip sections and wording as a dynamic printable template. Personal values and handwriting are not imported. The reference differs between languages in passport number and designation; neither value was chosen. Letterhead is typeset, with a text DT mark; it does not reproduce the original tower logo artwork.

- Employees → monthly salary → template: Dhahawi Salary Slip.
- Saves payer names, template selection and all eight addition / three deduction categories; shows prior-advance repayment separately when nonzero.
- Net calculated in fils on the client and as a generated Postgres value. The reference's 120 + 5 + 5 + 10 + 10 totals 150 KWD. Amount in words includes fils.
- New loan paid through salary is added to the advance balance only after payment confirmation. Existing standalone advances and prior repayments retain their accounting semantics.
- Server-issued unique voucher number and Kuwait issue date; frozen financial snapshot/template after issuance. Existing issued payrolls are not relabelled or rewritten.
- Six bilingual receipt clauses, payment method/reference, five blank physical-signature/fingerprint/approval/stamp areas. Actual approver names come from authenticated approvals, never from the scanned handwriting.
- Existing private storage, signed-original upload, monthly archive, dual approval and audit remain in force.

Validation: 568 Node tests passed; package check passed; old and new rolled-back SQL scenarios passed including persistence/readback, CAS, role/property isolation, advance accounting, dual approvals, signed-file gate and replay rejection. A generated layout fixture rendered to one A4 page and was visually reviewed; it contains synthetic test labels and is not payment evidence. No real employee from the reference was created. Actual iPhone/iPad printing and authenticated browser interaction with this new template have not been verified.

Applied migration: v267_dhahawi_salary_slip, project djkpkkgoibruaezdrchb only. No additional client table grants or public storage. Existing security-advisor findings remain: intentional guarded authenticated RPCs, private RLS tables without client policies, and the pre-existing leaked-password-protection warning.

CI/overall Release Gate remains open; no claim of a successful GitHub Actions run. No V266, Production, domain or production-alias changes.
