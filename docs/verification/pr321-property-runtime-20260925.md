# PR 321 property file verification — 25 September 2026

This continues the existing property-file repair. It is not a complete-platform
acceptance report or authorization to deploy production.

## Verified defects and changes

- The currently deployed public configuration uses `djkpkkgoibruaezdrchb`.
  Despite the project's Staging name, this is the live myaqari.com data source.
  It must not receive synthetic save tests or restore experiments.
- A read-only schema query confirmed that
  `public.aqari_maintenance_requests.category_code` is absent. All other fields
  selected by the compatibility read exist. The existing PR 321 repair retries
  only the exact 42703 missing-category error and retains workspace/lease filters.
- Runtime tests reproduced unhandled rejected reads from Edit Property, Add Unit,
  and Upload Attachment. These three tests failed before this follow-up change.
  The actions and their Cancel routes now use the existing dialog/session runner,
  preserving loading, duplicate-action prevention and visible error handling.

## Verification

`node --check src/v267/pages/property-master-file.js` passed.

The following combined run passed **50/50**, with no skipped tests:

```sh
node --test tests/v267-property-master-runtime.test.mjs \
  tests/v267-property-maintenance-compat.test.mjs \
  tests/v267-property-master-file.test.mjs \
  tests/v267-dialog-progress.test.mjs
```

The new runtime suite imports the actual page, dialog, and session modules.
It uses a synthetic DOM and controlled server replies. It checks successful
old/new schema rendering, unchanged request filters, permission exclusions,
unrelated-error propagation, failed retry, session changes, form entry and Cancel
error handling. The build script runs both property runtime suites.

## Outstanding acceptance

- Production remains on `6756a6a207b237b8237c7832068081782f95bbdb` at the
  deployment check in this work session. This follow-up is prepared on PR 321 only.
- Browser observations showed login screens, not an authenticated session.
  Local test results do not establish hosted UI, save/readback or device acceptance.
- The existing preview deployment's config fetch redirected to Vercel SSO.
  Preview access and the actual preview data target still require verification.
- Read-only metadata confirms that `aqari_property_dashboard_header`,
  `aqari_property_channel_settings` and `aqari_property_tenant_ledger` are absent
  on the live data source. The basic-file recovery does not install these services.
- Backup, independent restore, Storage byte verification and rollback gate #197
  remain unresolved. No migrations or business-record writes were performed.
