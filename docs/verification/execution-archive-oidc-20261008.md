# Execution archive workload authentication — 8 October 2026

Production has no configured renderer service key. This adds a narrowly scoped
Supabase function so the existing Vercel renderer can authenticate using its
short-lived runtime workload identity. Database credentials stay inside Supabase.
The existing service-key transport remains available for the original Preview.
Enable the new transport explicitly with `AQARI_PDF_ARCHIVE_TRANSPORT=oidc_gateway`.

## Boundaries

- `jose` 6.2.12 verifies RS256, JWT type, issuer, audience, subject, expiry,
  not-before, issue time, stable team/project IDs and exact environment.
- The issuer is `https://oidc.vercel.com/m-vib-5421`. Its public discovery document
  identifies `https://oidc.vercel.com/m-vib-5421/.well-known/jwks`.
- Only the existing AQARI project is trusted. Preview is bound to the isolated
  `ofgmcsmxmdswlovsckqs` project; Production is bound to `djkpkkgoibruaezdrchb`.
  Development, other projects, global issuer and cross-environment requests fail.
- The Python handler uses the per-request `x-vercel-oidc-token`, never a build
  token or browser-supplied body value. The gateway verifies its signature.
- The gateway independently verifies the real user with `/auth/v1/user`, rereads
  the user-scoped source and compares the exact source before privileged commit.
- There is one fixed commit operation. No SQL, table, RPC, environment name or
  URL can be selected by a caller. Redirects are rejected, reads are bounded,
  failures are redacted, and there are no credential/token logs.
- `verify_jwt=false` applies only to this new function because its handler
  performs custom Vercel OIDC authentication. Existing functions and Supabase
  user/session/MFA guards are unchanged.
- The `check` operation verifies the live workload and local configuration but
  makes no database calls. It proves neither signing nor archival acceptance.

## Verification scope

26 gateway tests pass, including real locally signed JWT verification, forged
signatures, missing/expired claims, wrong team/project/environment, independent
user rejection, source drift, operation allowlisting, response redaction and
oversized input/output. The real PDFs and transport are covered by 25 Python
execution-package tests. The gateway suite also runs in release CI.

No production business records are created by deployment or readiness checks.
The existing guarded SQL capability and signed-in hosted finalization/reopening
acceptance are separate release requirements. Their status must be recorded
explicitly before claiming Production readiness.

References: https://vercel.com/docs/oidc/reference,
https://vercel.com/docs/oidc/api,
https://supabase.com/docs/guides/functions/secrets.
