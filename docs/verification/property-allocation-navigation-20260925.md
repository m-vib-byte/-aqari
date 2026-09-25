# Property cost allocation navigation — 25 September 2026

## Hosted observations

The owner's platform is https://myaqari.com. All hosted observations below
were made on that domain with the authenticated manager session, not a Vercel
Preview URL. No form was saved and no business records were changed.

At the deployment check, Production deployment
`dpl_7k5eWLyMhgowifAgzwczQsJZqrB1` was READY and assigned to myaqari.com at
`f33c655738eb5bdcc1a395af4619d5741c2323af` (merged PR 321). Main subsequently
advanced to `75425010ef50bcd3eb217111af3ed23e0ed0ba14` (PR 322).

- Dashboard loaded with the manager account and property cards.
- The property hub reports missing database functionality, then its basic-file
  action successfully renders the selected property, units and draft contracts.
- Edit Property and Add Unit forms opened. Cancel returned to the property file.
- Employee directory opened and confirmed a database read.
- Contracts entry opened and displayed property-specific contract/unit counts.
- Upload form opening remains unverified: browser automation timed out before
  a successful transition. This is not recorded as an application failure.
- Clicking the property cost-allocation action left the property dialog open
  without opening the allocation dialog or reporting an error.

## Root cause and repair

The shared dialog component permits one active dialog. The property page tried
to open the allocation dialog while retaining its own active dialog, so the
destination returned false. That action also bypassed the dialog's session/error
runner and did not pass the selected property to the destination.

The action now uses the existing runner, imports the destination, rechecks the
bound session, closes the source dialog, and opens allocations with propertyId.
Import failures therefore leave the source dialog available with an error.
No database migration, authorization expansion or financial write was added.

## Regression evidence

Two tests failed before the repair and pass after it. They exercise the actual
property, dialog, session and allocation modules with a synthetic DOM and
controlled server responses: only one destination dialog opens, the property
filter is retained, the read is workspace-scoped, and a changed session blocks
the transition. Combined verification passed 54/54, zero skipped:

```sh
node --test tests/v267-property-master-runtime.test.mjs \
  tests/v267-property-maintenance-compat.test.mjs \
  tests/v267-property-master-file.test.mjs \
  tests/v267-dialog-progress.test.mjs
```

## Remaining acceptance

This new navigation change has not been merged or deployed by this follow-up.
Hosted acceptance of the changed navigation is still pending. Missing property
hub / tenant-ledger services, save/readback, physical device coverage and the
backup / independent restore / rollback requirements in issue 197 remain open.
The authenticated read-only checks above do not establish complete-platform or
financial acceptance.
