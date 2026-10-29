# Isolated acceptance workspace selection

Base: 60e61063ee4e3450a095ac550a5fbc4dc49374eb, PR #499.

Observed: authenticated preview opened the existing workspace (4 properties, 171 units), not the approved empty acceptance workspace. No test writes were performed there.

Fix: preview configuration explicitly binds startup RPC, SDK membership lookup, and adapter access checks to the approved acceptance workspace. Other valid memberships cannot be used as a fallback. Production or other-project acceptance configuration fails closed. Existing memberships, RLS, and database defaults remain unchanged. This is an acceptance-preview configuration; remove the acceptance selector when preparing an independently approved production release.

Validation: 34 startup tests passed, including matching workspace, mismatched workspace, cross-project configuration, production configuration, revoked membership, role change, and session changes. Package and cloud-sync checks passed. These are local mocked tests, not hosted write/upload/restore acceptance.

Remaining: verify hosted preview selects the empty workspace; verify save/reopen and uploads use its ID; establish a current authenticated AAL2 session for restore; confirm bounded usage before transfer. No transfer, production deployment, schema change, or security expansion performed.
