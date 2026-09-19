# PR 200 repair continuation — 2026-09-18

Started from `fa6297d2a0b63b2c8b66144ab058457f5133da25`, then incorporated
`3548d608f66539f976155da2ebf330043adba9b2` without overwriting its reference-shell
self-refresh repair. Its eight lifecycle/render tests passed. Continues the existing
`fix/work1-live-render-20260917` branch. This is repair work, not final acceptance.

## Runtime repairs

- Stored-document quality review was waiting for user confirmation while the
  surrounding dialog kept its pre-existing controls disabled. After retrieving
  and verifying the stored bytes, only the review checkbox, confirm and cancel
  controls are enabled. Upload controls stay locked. Finalization still requires
  explicit confirmation and a second stored-byte checksum check.
- Build-installed design modules previously loaded independently of the existing
  authenticated startup chain. They now register with the same deferred loader,
  which rechecks active membership, both workspace scopes and the unlocked page
  before loading. Sign-out before the queued task prevents loading; subsequent
  valid login resumes it without duplicate scripts.

## Regression verification

- 197 focused Node tests passed, including existing monetary precision,
  save/readback, duplicate prevention, attachment integrity, private-state
  disposal, maintenance navigation and all-five-language portal assertions.
- The generated design loaders passed the 34-test startup/navigation suite.
- The Vercel build script completed: 369 Node tests, 25 Python tests across its
  accounting and PDF/export stages, and the package check passed. Owner-reference
  and owner-feedback installers were also executed after updating the loaders.
- VM fixtures now load actual translation/catalog helpers and current read-only
  executor metadata. No business/security assertions were removed. Anonymous
  language preference tests explicitly preserve each verified account's stored
  preference. The scanner fixture exercises the real stored-copy review.

## Remaining release work

The broad all-files run is not green: after the build installers, it reported
1,583/1,598 passing before the startup repair; the five startup failures have
since passed their targeted generated-artifact run. Remaining failures include
older login payload/style assumptions, deployment-preparation fixtures, metadata
guard assumptions and navigation assertions for the earlier pre-install router.
These need reconciliation with the applicable build stages; they are not waived.

The owner supplied a GitHub Actions annotation screenshot on 2026-09-18:
"The job was not started because an Actions budget is preventing further use."
That run is blocked before execution, not evidence of a code/test failure. No
budget or billing settings were changed. The connected API cannot read the
annotation endpoint; the screenshot is the evidence for the budget diagnosis. The protected candidate opens the Vercel sign-in page in the
current browser. Authenticated visual checks, live save/readback and actual device
verification therefore remain incomplete. No production promotion or final design
certification is claimed. The owner's final test URL remains myaqari.com.

## Continuation after owner sign-in report

- Remote branch head verified as `bdad3719f214d0f5684918174e55f7c109dc286e`.
- Reconciled deployment-target test expectations with the existing explicit
  isolated domain-trial configuration and ordered reference-design build stages.
  Retained all three independent production-data rejection assertions by testing
  the production mode with trial disabled. No deployment settings were changed.
- 24 deployment-target, domain-trial and owner-approval tests passed locally.
- Production-preparation tests still fail at the localized imported-tenant source
  anchor; these failures are independent of Actions budget and remain open.
- A fresh browser navigation still shows GitHub Sign in/404 for private PR 200
  and Vercel login for the exact candidate. The reported sign-in is not available
  in the connected browser session. Live visual/data verification remains blocked.
- No domain promotion and no final acceptance are claimed.
