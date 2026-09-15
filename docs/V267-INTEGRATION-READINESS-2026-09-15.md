# V267 integration readiness — Preview only

Scope: Draft PR #192 / isolated Staging. No Production or `myaqari.com` change.

## What is already prepared

- Provider-neutral integration registry: `knet`, `email`, `whatsapp`, `sms`, `push`, `quickbooks`, `zoho_books`, `xero`, `generic_webhook`.
- Runtime modes: `disabled`, `sandbox`, `live`; runtime remains disabled until an authorized configuration is saved.
- HTTPS-only provider origins.
- Database stores only `secret_reference`, never provider credential values.
- Server-only outbound dispatcher with idempotency, retry/dead-letter handling and provider reference readback.
- Official rent-receipt PDF is rendered, archived and byte-verified before receipt delivery when needed.
- Signed inbound webhook envelope with timestamp window, event-id idempotency, SHA-256 HMAC verification and immutable receipt audit.
- KNET payment-link intent/settlement and webhook processing paths.
- WhatsApp maintenance-message ingestion path and sender/request matching.
- Reminder recheck/stop-after-settlement and payment-thanks/owner-summary queue bridges.
- Accounting export contract for QuickBooks / Zoho Books / Xero.
- Preview cron calls `/api/integration-dispatch` every five minutes and requires `CRON_SECRET`.

## External values required before a real provider can be enabled

For each provider actually selected:
1. The provider HTTPS API origin/endpoint, stored server-side under the manifest `endpointReference` name.
2. A server-side outbound API credential/token stored in Vercel under the manifest `secretReference` name. Never paste the value into AQARI business tables or source code.
3. For inbound callbacks, a strong webhook HMAC secret under `AQARI_WEBHOOK_SECRET_<WORKSPACE_UUID>_<PROVIDER>` and the provider callback configured to `/api/provider-webhook?workspace=<WORKSPACE_UUID>&provider=<provider>`.
4. Native provider-specific signing/field mapping must be verified before switching from sandbox to live. The existing canonical adapter is not permission to guess a bank/payment vendor protocol.

Canonical environment slots are defined in `config/v267-integration-readiness.json`. They contain names only, never values. The endpoint slots are:

- KNET: `AQARI_KNET_PROVIDER_ORIGIN`
- Email: `AQARI_EMAIL_PROVIDER_ORIGIN`
- WhatsApp: `AQARI_WHATSAPP_PROVIDER_ORIGIN`
- SMS: `AQARI_SMS_PROVIDER_ORIGIN`
- Push: `AQARI_PUSH_PROVIDER_ORIGIN`
- QuickBooks: `AQARI_QUICKBOOKS_PROVIDER_ORIGIN`
- Zoho Books: `AQARI_ZOHO_BOOKS_PROVIDER_ORIGIN`
- Xero: `AQARI_XERO_PROVIDER_ORIGIN`
- Generic webhook: `AQARI_GENERIC_WEBHOOK_PROVIDER_ORIGIN`

Each has a matching `AQARI_<PROVIDER>_PROVIDER_SECRET` slot and workspace-scoped webhook-secret pattern in the manifest. Runtime code remains fail-closed when any required value is absent.

## Additional provider-specific requirements

- KNET: merchant/gateway credentials and the chosen gateway's real endpoint/signature specification. Live settlement is HOLD until the native gateway adapter is verified against that provider.
- WhatsApp/SMS: selected messaging provider credentials and sender/service identifiers as required by that provider.
- Email: production email API/SMTP-gateway credential and sender identity/domain verification as required by the chosen provider.
- Push: chosen push provider credential/project identity.
- QuickBooks / Zoho Books / Xero: real OAuth/client credentials and tenant/company identifiers. OAuth token refresh/storage must remain server-side; no browser token storage.
- Phone/SMS MFA (Issue #193 fallback candidate): this is an Auth configuration item, not an AQARI notification shortcut. It requires Supabase Phone MFA enabled plus a real SMS provider; do not reuse ordinary notification credentials implicitly.

## Current isolated-Staging runtime state

No live/sandbox integration config rows or queued provider deliveries are intentionally installed yet. This is fail-closed and expected until provider identities/credentials are known and the manager-authorized activation path is available.

No credential is requested from the owner at this point. B remains OPEN; integrations being technically prepared does not constitute external-provider acceptance.
