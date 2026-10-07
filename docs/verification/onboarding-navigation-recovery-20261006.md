# Onboarding navigation recovery — 2026-10-06

Onboarding closed its dialog before importing the property hub. If module loading
failed, the dialog's error handler had no visible status area left, leaving the user
without an explanation or retry control despite a verified save.

Load and validate the hub module before dispatching the saved event and closing the
dialog. A loading failure leaves the dialog open and explains in Arabic that the
property is saved and retrying opens its file without creating another property.
Check the original session again after the asynchronous load. Retry uses the
existing creation, attachment and master-readback recovery paths.

## Evidence

- Three new runtime cases use the actual creation and submission functions with a
  controllable module loader: failed load/retry, missing hub export, and session
  revocation during loading.
- Before: 19 passed, 3 failed. After: all 22 creation/navigation cases pass.
- Combined onboarding, attachments, ownership, master-data, dialog and MFA suites:
  172 passed, zero failed. Existing CI already runs the updated test file.
- Retry creates only one legacy property; no saved event or close occurs before
  the module is ready and the bound session passes validation.
- Runtime inventory verification and diff checks pass.

This only handles module loading and export validation before navigation; errors
inside an already opened property hub remain its own responsibility. Transport
fault tests are local, not hosted browser or physical-device acceptance. No hosted
business records, database schema, grants or production deployment are changed.
Stack on PR440 and retain the separate PR423 completeness-service fix at integration.
