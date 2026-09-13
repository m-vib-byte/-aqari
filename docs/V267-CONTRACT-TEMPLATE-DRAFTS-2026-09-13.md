# Editable contract wording drafts — 13 September 2026

Owner request: add contracts now to establish the routes and let the owner edit wording later. This is not permission to declare old wording legally current.

## Implemented

From the saved rental-contract workspace, the general manager can open **قوالب العقود والإقرارات — تعديل المسودات** and return to contracts. Five independent initial drafts: house, apartment, shop, vacating undertaking and unit handover. Editable title/body, insertion of variable fields, safe text-only preview, explicit save, readback, retry reconciliation, and unsaved-change warnings.

The forms retain the requested Kuwait execution-day/date heading, contract serial, official unit PACI placeholder distinct from floor/unit, second-party identity and contact fields, contract-specific deposit, tenant signature/fingerprint and owner full name/signature only. Actual handover date/time is separate from drafting date and is not filled automatically. Wording is deliberately provisional. The editor does NOT issue documents, change signed leases, fill live tenant data, approve legal wording or modify existing official print templates.

## Persistence and authorization

Additive table `public.aqari_contract_template_drafts`, applied ONLY to `AQARI-V267-Staging` (`djkpkkgoibruaezdrchb`) through migration `20260913093921_v267_contract_template_drafts`. Append-only versions; workspace/template/revision uniqueness prevents concurrent replacement. General-manager membership is checked by the existing administration permission helper, and saving also requires contracts/write. Author is bound to `auth.uid()`. No anonymous access and no authenticated UPDATE/DELETE grant. Only draft status is allowed. No localStorage or shared browser cache holds contract wording.

No seed tenant data or signed contract was changed. Transactional test rows were rolled back; post-test draft table count was zero. Bundled initial templates appear after the permitted successful database read; the first owner edit creates revision 1.

## Verified

- 14 local Node tests passed: schema/fields, role/scope, save/readback, retry idempotence, lost acknowledgement, conflict, and failure handling.
- Transactional authenticated-role SQL checks passed on Staging: append/readback, duplicate revision rejection, UPDATE/DELETE denial, author binding, draft-only status, cross-workspace denial, preservation of earlier wording, and nonmember read/write denial. All test writes rolled back.
- Real Chromium tested the editor at 390x844, 1024x768 and 1440x900 with mocked session/database and minimal harness styling. Five-template selection, edit, text-only preview, save/reload, version preservation, failed-write retry, unsaved-close protection, refresh and permission boundary passed without JS errors or horizontal overflow. This is NOT hosted authentication, actual app-theme acceptance or physical iPhone/iPad testing.
- Supabase security advisor returned no finding naming the new table. Findings elsewhere remain; the project is not declared security-clean.

## Release limits

Base is PR #116 candidate `9aa57dd52dbf373342ad3cbc1f0a1a7cfa837dec`. No main merge, Production deployment, V266 change, production database mutation, or Vercel protection change. Full 155-item acceptance, inventory gate, hosted end-to-end acceptance and official-template publication are not established by this change. Keep release gates on HOLD.
