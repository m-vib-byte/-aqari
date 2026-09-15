# V267 B — TOTP rejection fix and backup-factor assessment — 15 Sep 2026

Scope: Draft PR #192 / Preview only. No Production or myaqari.com change.

## Current TOTP rejection hardening
- The prior stale unverified TOTP factor was removed; current manager factor counts are 0 verified / 0 unverified before the next enrollment.
- Fresh TOTP enrollment uses a collision-proof internal friendly name while the UI continues to display `AQARI V267`.
- Security Center and the Phase-B reauthentication page normalize Arabic-Indic and Persian digits, trim whitespace/bidi marks/hyphens, and require exactly six normalized digits.
- TOTP verification now uses Supabase `mfa.challengeAndVerify()` to create and verify the challenge atomically instead of separate manual challenge/verify calls.
- Invalid/expired-code guidance now explicitly asks for the current authenticator code and automatic device time.
- Existing verified-factor removal remains AAL2-gated; no MFA enforcement was weakened.

Current candidate: `dbd1e952bc85fc22cb3809bc37cd40403ad0ce7e`.
Hosted Preview build for this exact SHA is READY.
B remains OPEN until the owner completes real Hosted Preview enrollment and the authenticated role runner succeeds.

## Backup-factor assessment (not enabled yet)
- Supabase Auth supports phone verification as a real MFA second factor in addition to TOTP. A verified phone factor can participate in the AAL2 MFA flow.
- Phone MFA requires enabling the feature and configuring a real SMS/phone messaging provider (or approved Send SMS Hook); this configuration has not been assumed or silently enabled.
- If adopted, phone MFA should be a backup factor, not a bypass: E.164 number, masked display, official enroll/challenge/verify flow, rate limits, audit, server-side provider credentials, no release/test OTPs, and AAL2 requirement for verified-factor removal.
- SIM-swap risk must be accepted in the security design, so TOTP remains the preferred primary factor.
- Email OTP is suitable for email login/recovery flows, but Supabase does not expose email as an `mfa.enroll()` second-factor type equivalent to TOTP/phone. It must not be used to bypass the current AAL2 gate.

Decision: do not add the backup factor before the current TOTP path is proven in real Hosted Preview. After TOTP succeeds, phone/SMS MFA is the recommended backup option to evaluate/enable; email remains a separate recovery/login mechanism unless a separately reviewed security design is approved.
