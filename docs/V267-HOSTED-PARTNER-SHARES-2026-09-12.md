# AQARI V267 — Hosted partner-share integrity acceptance — 12 Sep 2026

Environment: isolated V267 Staging only (`ofgmcsmxmdswlovsckqs`). No Production mutation. The acceptance transaction rolled back after readback and rejection checks.

## G05-01 / G05-02

The existing server guard `private.aqari_guard_partner_shares()` and `private.aqari_validate_partner_owners(jsonb)` were verified as installed on Staging. A manager session saved a new synthetic ownership register with exact integer basis points:

- 80.88% = 8088 bps
- 16.00% = 1600 bps
- 3.12% = 312 bps

The total 100.00% ownership state was accepted and re-read from the authoritative app state without precision loss.

Two negative hosted cases were then attempted against the same server boundary: 99.99% and 100.01%. Both were rejected by the database guard. The full transaction was rolled back, leaving the existing Staging ownership data unchanged.

## Acceptance boundary

This is hosted database/RPC evidence for enforcing an exact 100% ownership total and preserving the requested fractional shares. It does not by itself prove the legal ownership documents, partner profit-distribution accounting, or practical browser/device acceptance with real partner accounts.
