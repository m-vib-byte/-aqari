# Linked renewals and durable freeze — local implementation evidence

Scope: isolated V267 preview source only. These files do not apply a hosted migration, publish a site, generate legal text, alter an archived PDF, or transfer an original contract's money.

## Server behavior

- `lease-renewal-freeze-guard.sql` uses the stored `private.aqari_cheques.renewal_frozen` flag. Returned→redeposited/cancelled does not clear it. Every frozen cheque for the same workspace, tenant and unit must be resolved. A new number, a new ID, or a previously saved unlinked draft cannot evade the freeze.
- Unchanged historical projection, shortening and status-only cancellation remain subject to their existing controls. Combining cancellation with an extension still triggers the freeze. The later entitlement migration separately fixes approved or financially used new-contract dates.
- `linked-lease-renewals.sql` binds a new successor to a saved approved/signed/expired source with complete dates and no recorded vacating. The successor uses a distinct contract number enforced by the existing database constraint, the same tenant/unit and a start strictly after the source end. A currently published template is selected explicitly in the existing form; no template or money is copied automatically.
- The private link retains the source identity and full source snapshot SHA-256. Link deletion, retagging and retroactive attachment are rejected. There is one noncancelled successor per source. Source checks run again on progress/date review and after the whole payload has been projected, so array order cannot validate against an obsolete source in the same save.
- An original term cannot be extended into a saved noncancelled successor. Normal unit-readiness and overlap controls remain enabled; the tested successor uses the same ready unit without a vacating operation.
- Cancelled linked renewals remain cancelled. A fresh contract is required to try again. Draft/ready cancellation needs scoped write access and a reason. Approved/signing cancellation additionally needs the general manager and AAL2, and is denied if any signature/acknowledgment, financial history, allocation, cheque or tenant ledger entry exists, even if the financial record was reversed. A cancelled successor cannot acquire new commitments. Signed contracts use the existing termination/settlement path.
- The original contract, deposit, rent receipts, cheques and balances stay with the original lease. Existing contract-version auditing records the actor, date, reason and cancellation. No financial rows are created by renewal itself.

## UI integration

`src/v267/components/lease-renewal.js` retrieves scoped source context and supplies a safe text summary. `src/v267/pages/rental-contracts.js` integrates the renewal action into the real contract form: source tenant/property/unit are fixed, the new number/rent/template/entitlement policy are entered explicitly, and saving uses the existing audited contract API. The page provides reasoned cancellation for a stale unsigned successor before preparing a fresh one.

## Integration and verification order

After the existing published-template and payment guards:

1. Apply `lease-renewal-freeze-guard.sql` twice to verify reapplication; run `tests/lease_renewal_freeze_guard.sql` **before** `rent-entitlement-start.sql`. This test creates the older no-entitlement contract shape and rolls back entirely. After the entitlement guard, that new fixture shape is intentionally no longer issuable.
2. Apply `linked-lease-renewals.sql` twice.
3. Apply the independent `rent-entitlement-start.sql` migration.
4. Run `tests/linked_lease_renewals.sql` with all new entitlement fields present. This uses actual public RPCs under synthetic role/JWT fixtures and rolls back completely; it contains no DDL or grants.
5. Run `node --test tests/v267-lease-renewal.test.mjs`.

Local evidence: 129/129 setup and targeted SQL steps passed with exit 0; the three renewal module tests passed. The SQL acceptance includes two simultaneous frozen cheques, no-op/shortening/cancellation, renumber and pre-existing draft denial, distinct-unit scope, staff draft→ready and GM approval, final-payload source consistency, unique active successor, stale draft and signing cancellation/recreation, AAL1/staff denial, financial-history cancellation denial, and immutable link/audit retention. The general contract and collection regression suite remains the root integration gate.

Limits: synthetic role/JWT fixtures do not prove actual-account authentication, MFA enrollment, OTP delivery or device behavior. The acceptance reaches approved/signing; it does not claim a real tenant signed/uploaded the renewal. There was no hosted apply by this implementation task and no two-connection concurrency execution. Canonical RPC paths share the workspace lock with freeze/commitment mutation; direct privileged lease SQL can acquire a lease lock first and deadlock with a simultaneous state save, causing transaction abort rather than a bypass. No claim of universal lock-order freedom or measured production performance is made.

Root integration note: subsequent existing hosted migrations `20260913182820`/`20260913182835`/`20260913182850` were preserved. SQL fixture AAL2 claims now include a synthetic current TOTP timestamp to meet the recent-MFA requirement. The targeted counts above describe the author's earlier run; the combined root report records verification against the current security policy.
