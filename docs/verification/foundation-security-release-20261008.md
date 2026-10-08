# Foundation and security fixes — 8 October 2026

The owner explicitly requested completion, direct verification and production
publication. This candidate starts from published `4041d5cea2635dda1ad761d5d2b76c47d2825295`
and carries forward two independently releasable fixes already developed in
PR #460. It preserves the imported-tenant changes from #461.

Contract foundation now requires an explicit monthly, quarterly, half-yearly
or annual payment cycle. Autosave, review and promotion retain that selection;
blank and unsupported intervals fail validation. Promotion is checked against
the real rental-record engine for all four supported intervals.

The security center explains `insufficient_aal` enrollment rejection without
closing the recovery interface. Unexpected authorization failures still dispose
the private dialog. No authentication guard is bypassed and no factor is changed.

Validation on the prepared production candidate: 2,717 JavaScript tests passed,
zero failures or skips. Release freeze, runtime inventory and diff checks passed.
Hosted CI and deployment evidence are recorded in the execution register after
the exact commit is published. These checks do not claim physical-device or
signed-in hosted business acceptance.

No SQL migration, business-row mutation, environment change or new paid resource
is part of this release. Rollback baseline: `4041d5cea2635dda1ad761d5d2b76c47d2825295`,
Vercel `dpl_sPSDyQSDbtRssYM2NGgZbVjBu98Z`.

Separate contract-execution activation remains unfinished: Preview renderer
configuration returns configured=true, while Production has neither matching
renderer environment variables nor execution-package RPCs. PR #460 remains a
separate candidate. The current browser reaches the production login form and
does not have an authenticated account session. This release closes neither the
full contract workflow nor all 258 open requirements.
