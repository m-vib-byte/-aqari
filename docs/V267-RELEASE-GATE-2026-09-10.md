# AQARI V267 Release Gate — 10 September 2026

Status: **HOLD**. This note is evidence only and does not authorize a merge or production publication.

## Candidate and production chronology

- Development branch before this note: `396ec96186ac972ed6dd99ecf0f02bb5e3cb08e7` (`design/v267-premium-workspace`).
- PR #70 was merged earlier using candidate `29f5ce09bf17f1dbe75c68abe48282a4da3744d0` and reached a Production deployment.
- Production smoke failed because the published tree still carried Preview release configuration, a Preview Auth redirect, and the isolated V267 Supabase target.
- Main was rolled back to commit `4d5e21073e1696b2f151a56e4af38242c3122693`, restoring the prior `2cd2804d496b82c0ce9cf5e09fd3d9368a62510a` source tree. The historical V266 rollback reference remains unchanged.
- The restored prior tree itself still contains `releaseStage: "preview"` and the V267 Preview Auth redirect in `public-config.js`. Infrastructure READY therefore does not prove a correct Production configuration or authenticated Production acceptance.

## Latest Staging repair

The audited post-clearance lease release added by `8334c95247531ebb9a6854b0e99c14bc89460d4f` and covered by `5d540d8ae0a5330b20c527d34064eb59613330f7` / `396ec96186ac972ed6dd99ecf0f02bb5e3cb08e7` was not yet present in the isolated hosted branch. The exact `staging-database/sql/vacating-release.sql` migration was applied to the isolated V267 test branch only. A read-only verification then confirmed the RPC and `vacated_on` schema exist; Auth users, active memberships, and leases remain zero. No Production or historical V266 database was written.

## Open release gates

Release remains blocked until all of the following are concrete on the exact latest head:

1. Every row in the 155-requirement register is closed with implementation and acceptance evidence.
2. Every required GitHub Actions workflow completes green on that exact head.
3. The matching Vercel Preview is READY and functional smoke tests pass against the intended Staging services.
4. Practical real-account flows pass for login/session restore, save/reload, permissions, contracts, and printing on desktop plus physical iPhone and iPad.
5. A complete current DB/Auth/Storage backup exists and an independent restore rehearsal proves rollback can preserve both current and post-release transactions.
6. A production-specific configuration is verified before publication; Preview Auth/database targets must not be promoted as Production configuration.

PR #72 is the replacement draft review gate after PR #70 closed. Keep it unmerged while any item above remains open.
