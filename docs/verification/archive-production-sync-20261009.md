# Preserve published contract repairs in archive candidate — 9 October 2026

Merge archive head `5a70564270d1253e58a56f757c874e049f3c27bb` with mobile repair head `806185dfcb77d7b9fe38f55d45e5ab0c24227abb`, which descends from published save-order release `241c6aa1d5250ad694ea86f311a0b6929f3b95a1`.

The save-order implementation and mobile stylesheet were already byte-identical in the archive candidate. The only merge conflict is the file inventory; retain the archive inventory and add the independent release evidence documents. This merge changes no runtime source, SQL, authorization, archive behavior or business records. The inventory/package/freeze checks pass. Fresh exact-head CI is tracked on #464; previous-head results are not represented as new executions.

The archive remains a draft Preview candidate. Hosted real-user finalization, opening both archived original PDFs and receipt, duplicate-settlement rejection and owner device acceptance remain unverified under the existing browser credential-state restriction. This source integration does not deploy archive code or SQL to Production.
