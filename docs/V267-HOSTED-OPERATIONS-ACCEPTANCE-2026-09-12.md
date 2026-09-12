# AQARI V267 — Hosted operations acceptance — 12 Sep 2026

Environment: isolated V267 Staging only. No Production mutation. All acceptance fixtures described below were executed inside transactions and rolled back after readback verification.

## Petty cash — G12-22

Hosted acceptance passed for: fund creation with a 100.000 KWD ceiling; funding by 80.000 KWD; rejection of a further 21.000 KWD funding attempt that would exceed the ceiling; a 25.000 KWD spend backed by an existing verified stored document; creation of exactly one approved financial expense; and final fund balance readback of 55.000 KWD. The test confirmed both the fund ledger and the approved-expense link before rollback.

Evidence boundary: this proves hosted database/RPC behavior. It does not prove physical-device UI acceptance or month-end closing of a real employee fund.

## Legal cases and costs — G12-07 / G12-08

Hosted acceptance passed for: legal-case creation on an existing signed lease; hearing/event creation; transaction-freeze state on the case; a 12.500 KWD court-cost entry backed by a verified document; one approved financial expense; and one tenant debit adjustment linked to the legal cost. Readback matched before rollback.

Evidence boundary: the tested cycle does not yet prove a full close/appeal lifecycle or external legal-policy review.

## Vendors, annual service contracts and work orders — G12-13 / G12-14 / G08-03 / G08-04

Hosted acceptance passed for: active vendor creation with rating evidence; annual vendor contract creation linked to a verified document; work-order creation; state transitions draft → approved → assigned → in_progress → completed; a verified completion invoice of 60.000 KWD within a 75.000 KWD approved limit; and exactly one approved financial expense linked to the invoice. Final work-order readback was completed with revision 6 before rollback.

Evidence boundary: this proves the isolated hosted lifecycle and accounting link, not physical-device acceptance.

## Recurring maintenance and alerts — G08-05 / G08-06

Hosted acceptance passed for: recurring fire-system maintenance-plan creation; due-alert preparation; task generation; active-vendor assignment; and transition to in_progress with readback. The delivery record was prepared in the internal notification queue.

Completion is intentionally still open. Current hosted workflow correctly requires the task to be in_progress and requires at least one verified image document plus a verified completion document. The isolated Staging dataset currently contains no verified image/jpeg, image/png, image/webp, image/heic or image/heif document satisfying the storage-integrity checks. Therefore completion was not bypassed or falsely marked passed.

This also does not prove delivery through an external Push/WhatsApp/SMS/email provider.

## Financial expenses — G04-14 / G04-15 / G04-16

Hosted acceptance passed for a 12.345 KWD property expense backed by an existing verified stored document. The isolated Staging test saved the expense as draft, re-read the saved value, approved it with a generated voucher reference, rejected an attempted edit after approval, and then cancelled it with a mandatory reason and recorded approver identity. The full test transaction was rolled back after verification.

Evidence boundary: this proves hosted database/RPC behavior for expense save, approval immutability and documented cancellation. It does not by itself prove physical-device UI acceptance or month-end accounting review with real production data.

## Partner property isolation — G02-06 / G02-07

Hosted acceptance passed for two synthetic partner identities mapped to two different properties. Each partner could list only the property explicitly granted to that identity, and an attempted read of the other partner's property was rejected. The setup and both identities were created only inside the acceptance transaction and rolled back afterwards.

Evidence boundary: this proves hosted property-level isolation at the database/RPC boundary. It does not yet prove real partner browser sign-in, ownership-share display, or physical-device acceptance.

## Release impact

These results strengthen hosted evidence for the listed requirements but do not close the full 155-item release gate. Physical iPhone/iPad/Desktop acceptance, complete Database/Auth/Storage backup, independent restore, transaction-preserving rollback rehearsal, provider integrations and the remaining partial/external requirements are still required before Production.