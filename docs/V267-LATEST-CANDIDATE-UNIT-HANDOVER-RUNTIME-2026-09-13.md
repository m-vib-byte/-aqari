# V267 latest-candidate unit handover runtime reconciliation — 2026-09-13

This Preview/support-only reconciliation is stacked on the current PR #75 candidate plus the staff-access recovery overlay. The current PR #75 tree already contains migration `20260913164943_v267_unit_handover_pdf_runtime.sql`, but it did not contain the trusted hosted export endpoint, deterministic Arabic renderer, client archive contract, or their exact-build regression suites.

This change restores that missing runtime side without modifying the existing migration or any hosted database. It ports the latest fail-closed support implementation: signed move-out source only; exact inspection/lease/unit identity; real Storage evidence bytes; size/SHA-256/MIME verification; structural `aqari-documents` object paths; rejection when the same Storage object is reused for multiple evidence roles; deterministic Arabic PDF rendering with visual PNG/JPEG evidence; append-only archive readback; source re-read before and after commit; and server-only archive credentials.

The Vercel Preview build executes the Node bundle/archive/source-contract suites plus the real Python renderer/export tests in a throwaway interpreter-matched dependency target. A successful build is evidence for these source/runtime contracts only. It is not hosted authenticated acceptance, a real signed inspection export, physical-device printing acceptance, 155/155 acceptance, green GitHub CI, backup/restore/rollback proof, or Production readiness.

Owner governance dated 13 Sep 2026 Kuwait time controls. Preview only. No merge to `main`, Production deployment, `myaqari.com` change, historical V266 mutation, hosting-protection change, or Production-data mutation is authorized.
