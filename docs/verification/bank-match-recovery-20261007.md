# Explicit bank matching recovery — 2026-10-07

After an uncertain reconcile response, the form previously allowed another request using its original revision. The server revision guard remains authoritative, but the page offered no read-only recovery of the submitted result.

The form now snapshots the selected payment and request before sending, locks submission and back navigation while unresolved, and exposes a read-only verification action. Recovery independently verifies the expected saved payment, next revision, amount and bank identity using the existing verifier. Transport errors, contradictory acknowledgements and failed readbacks retain the lock. Definite validation/constraint rejection or the recognized MFA requirement unlocks inputs. No automatic retry is introduced.

Validation: five new runtime cases failed before the fix and pass afterward. Bank plus financial-register suites: 55 passed, zero failed. Runtime verification and diff checks pass. Cases cover lost responses, changed controls after submission, contradictory persisted state, definite rejection versus transport failure, and recovery after list failure.

Limitations: pending state is scoped to the open form; closing/reloading loses it. Reopen recovery and durable recovery are not included. Tests use DOM/RPC fixtures, not authenticated hosted acceptance. No database, real transfer, production change or owner acceptance. R12.09 remains partial and platform counts stay 16/106/152.
