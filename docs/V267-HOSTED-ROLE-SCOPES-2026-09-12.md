# AQARI V267 — Hosted staff role scope acceptance — 12 Sep 2026

Environment: isolated V267 Staging only (`ofgmcsmxmdswlovsckqs`). No Production mutation. All synthetic users, assignments and properties were created inside a transaction and rolled back after verification.

## Collector — G02-03 / G09-01 / G09-02

A synthetic collector was assigned only to property A. Hosted readback showed only that property through the scoped path. Collection write permission for the assigned property remained available, while finance visibility was denied. This proves the server-side role ceiling and property scope used by collection workflows; it does not replace a real-account browser/device test.

## Accountant — G02-04 / G09-01

A synthetic accountant was assigned only to property A. The hosted financial-register read returned exactly that property, and contract-write authority was denied. This proves the database/RPC boundary for the tested role and property; UI/export acceptance with a real accountant account is still required.

## Maintenance — G02-05 / G09-01

A synthetic maintenance user was assigned only to property B. The hosted maintenance RPC returned exactly that property, and finance visibility was denied. This proves the tested maintenance/finance separation and property scope; physical-device acceptance remains separate.

## Acceptance boundary

The hosted transaction passed for all three roles and rolled back cleanly. It strengthens G02-03, G02-04, G02-05, G09-01 and G09-02 but does not close practical real-account acceptance on Desktop, physical iPhone and physical iPad, nor every UI/download/export surface.
