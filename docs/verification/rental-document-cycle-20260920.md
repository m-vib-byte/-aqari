# Rental document cycle — incremental platform repair

Source baseline: `485a66ce4d801b2c84e513f44561570502f6b1f0` on `main`.
Prior production deployment/rollback reference: `dpl_9D5fBmWFjMuTDzjB5qYUi4AWL6jp`.

The owner authorized platform implementation and deployment, and explicitly reserved template wording, entry, approval and publication to himself. The four supplied images were viewed as references; no image or legal text was inserted into the platform.

## Implemented

- Five independent document structures in order: lease, unit handover, rent receipt, tenant evacuation pledge, owner final clearance.
- A manager-only read-only document cycle, accessible from the contract workspace and the selected contract. It uses only the owner's already published templates; opening it never seeds models or writes documents or payments.
- Contract/tenant selection resolves normalized tenant, unit and property IDs under the current workspace. Multiple contracts require an explicit choice. Historical display names are not used as identity keys.
- Typed field catalogue and insertion at the caret; generic, undeclared, malformed or duplicate variables block final preview. Existing alias fields remain supported. Source fields are pulled from saved records and are read-only; document-specific inputs remain separate.
- New lease fields automatically follow tenant, property, unit, dates and rent edits. Authoritative property/unit master data supplies owner and automatic-number fields where those records contain them.
- Separate signer names and empty signature/fingerprint spaces. An explicitly stored representative is labeled as representative; no marks or biometric data are generated.
- Final text preview and PDF share a digest covering title, kind, resolved clauses, field values and signer roles/names. Changed data, mismatched digest, cancelled/ineligible receipts and changed sessions prevent download.
- PDF preserves numeric currency content and wraps logical Arabic lines before shaping. English-only lines preserve punctuation.
- Lease-save conflict detection now locks only the four collections actually changed, retaining fresh cloud profile/property validation and revision checks. Optional email validation matches the existing rental-record behavior.

## Executed verification

- Standard Vercel build plus the configured owner-reference and owner-feedback installers succeeded in an isolated build copy.
- Full built JavaScript suite: **1,883 passed, 0 failed, 0 skipped**.
- Focused source suite: **91 passed** (core, composer, template editor, prefill, lease save and contract viewing).
- PDF and endpoint suite: **13 passed**, including all five kinds compared across JavaScript/Python, exact rendered values/signers/digest, mocked authenticated endpoint reads, workspace/role rejection, source overrides, receipt eligibility and changed-preview rejection.
- PDF rendered and visually inspected for Arabic wrapping, bilingual content, amounts, names, and empty signing areas. It contains synthetic test content only and is not an owner template.
- Real database inspected read-only: 7 properties, 170 units, 44 tenants, 43 leases, 2 documents, one pre-existing draft and no user-published templates. The existing draft has 25 generic `{{field_name}}` occurrences. Its content was not modified.

## Practical limits

- Browser inspection reached the actual sign-in screen; there was no authenticated session. The live account document journey and physical iPhone/iPad testing were **not performed**. Automated fixture coverage is not claimed as physical-device acceptance.
- The owner must assign the correct field to each generic occurrence in his existing draft and approve his own templates. There is no automatic inference of legal wording or placeholder meanings.
- Owner/representative information absent from source records stays absent. Multi-owner, civil ID and power-of-attorney data are not invented. Required missing source data blocks final preview until the source is completed.
- This incremental change requires no database migration and performs no template or business-data mutation during deployment. It prepares read-only review/PDF; it does not constitute template approval, official document issuance, signature capture, or a financial transaction.

Reproduce focused verification:

```sh
node --test tests/v267-rental-document-cycle.test.mjs tests/v267-rental-document-composer.test.mjs tests/v267-contract-template-prefill.test.mjs tests/v267-rental-templates.test.mjs tests/v267-rental-records.test.cjs tests/v267-contract-view.test.mjs
python -m unittest tests.contract_template_pdf_test tests.contract_template_preview_test
```
