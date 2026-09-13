# Editable contract wording drafts — 13 September 2026

Owner request: add contracts now to establish the routes and let the owner edit wording later. This is not approval of legal wording.

## Implemented

From the saved rental-contract workspace, the general manager can open **قوالب العقود والإقرارات — تعديل المسودات** and return to contracts. Five independent initial drafts: house, apartment, shop, vacating undertaking and unit handover. Editable title/body, insertion of variable fields, safe text-only preview, explicit save, readback, retry reconciliation, and unsaved-change warnings.

The forms retain the requested Kuwait execution-day/date heading, contract serial, official unit PACI placeholder distinct from floor/unit, second-party identity and contact fields, contract-specific deposit, tenant signature/fingerprint and owner full name/signature only. Actual handover date/time is separate from drafting date and is not filled automatically. Wording is deliberately provisional. The editor does NOT issue documents, change signed leases, fill live tenant data, approve legal wording or modify existing official print templates.

## Persistence and authorization

The verified Preview backend is the Supabase development branch `v267-isolated-test` (`ofgmcsmxmdswlovsckqs`), as confirmed by the source session guard and Supabase list_branches. The additive table `public.aqari_contract_template_drafts` is installed there through migration `20260913095018_v267_contract_template_drafts`.

Append-only versions; workspace/template/revision uniqueness prevents concurrent replacement. General-manager membership is checked by the existing administration permission helper, and saving also requires contracts/write. Author is bound to `auth.uid()`. No anonymous access and no authenticated UPDATE/DELETE grant. Only draft status is allowed. No localStorage or shared browser cache holds contract wording. Bundled initial templates appear after the permitted successful database read; the first owner edit creates revision 1.

### Corrected routing error — explicit record

The initial execution incorrectly selected the parent project `djkpkkgoibruaezdrchb` because its displayed name was AQARI-V267-Staging. The repository deployment-target configuration identifies that parent as the current Production data source; its name alone was not a safe environment check. Contrary to the initial report and commit description, a database schema mutation DID temporarily occur there: migration `20260913093921` created the new draft table. Transactional test inserts were rolled back. No existing contract, tenant or payment record was changed.

Once detected, the newly created table was locked and checked for zero rows and the exact task-created comment marker, then removed without CASCADE through migration `20260913094955_v267_revert_misrouted_empty_template_drafts`. A follow-up query confirmed the table was absent. Both migration-history records remain as an audit trail. The migration and authorization tests were then executed on the correct isolated branch `ofgmcsmxmdswlovsckqs`. Do not replay the initial parent-project migration from earlier commits.

## Verified

- 14 local Node tests passed: schema/fields, role/scope, save/readback, retry idempotence, lost acknowledgement, conflict, and failure handling.
- Transactional authenticated-role SQL checks passed on the actual isolated Preview branch: append/readback, duplicate revision rejection, UPDATE/DELETE denial, author binding, draft-only status, cross-workspace denial, preservation of earlier wording, and nonmember read/write denial. All test writes rolled back; the post-test draft row count was zero. RLS was enabled; anonymous SELECT and authenticated UPDATE/DELETE privileges were false.
- Real Chromium tested the editor at 390x844, 1024x768 and 1440x900 with mocked session/database and minimal harness styling. Five-template selection, edit, text-only preview, save/reload, version preservation, failed-write retry, unsaved-close protection, refresh and permission boundary passed without JS errors or horizontal overflow. This is NOT hosted authentication, actual app-theme acceptance or physical iPhone/iPad testing.
- The initial security advisor read was against the parent project, not the actual Preview branch; it is not claimed as a security assessment of this Preview change.
- Vercel confirmed deployment `dpl_CWjP4WNrcyMzLW1HjbkuzqpCHb9z` READY for code commit `6d3c623c9b17cd287eab514aea7abd378950bcb0`, with Preview target (target null), not Production. URL: https://aqari-h4sp0kub8-m-vib-5421.vercel.app/app?release=V267 . The protected hosted fetch redirected to Vercel SSO, so authenticated hosted acceptance is NOT claimed.

## Release limits

PR #120 builds on PR #116 candidate `9aa57dd52dbf373342ad3cbc1f0a1a7cfa837dec`. No main merge, Production application deployment, V266 application change or Vercel protection change. The temporary parent-database schema change and its reversal are disclosed above; do not state that no Production database mutation occurred. Full 155-item acceptance, inventory gate, hosted end-to-end acceptance and official-template publication are not established by this change. Keep release gates on HOLD.
