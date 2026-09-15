# AQARI V267 — Collection payment method acceptance

Scope: PR #192 Preview/Staging only. No Production authorization.

The collection entry and Today Payments display must make the payment channel explicit and auditable:

- KNET: method label KNET; provider defaults to KNET; transaction reference required.
- Cash: method label Cash/كاش; cash receipt/reference required; provider is not applicable.
- Cheque: method label Cheque/شيك; reference required; bank/provider name required for new entries.
- Bank transfer: electronic bank-transfer label; reference required; bank/provider name required for new entries.
- Other: electronic payment label; reference required; provider name required for new entries.

The detail view shows amount, property, reference, bank/provider, payment date, recorded time when available, status, and receipt number. Historical rows are never backfilled with invented provider or time values; missing historical data is shown explicitly as `غير مسجل` (or `لا ينطبق` for cash provider).

Source data remains bounded to the protected ledger. No access token, refresh token, password, bank-account credential, or secret is added to the display contract.

Acceptance requires the exact-head Preview build tests to pass. This document is not owner final acceptance and does not close Phase B while the real MFA role pass remains deferred.
