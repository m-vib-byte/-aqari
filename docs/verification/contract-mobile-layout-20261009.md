# Independent contract mobile layout repair — 9 October 2026

The owner theme can override the foreground of property contract cards, while the generic text-input rules also force the hidden upload input to be opaque and at least 46 px high. Long contract navigation labels can exceed narrow cards.

This candidate carries the exact `src/v267/styles/contract-pages.css` repair from archive head `5a70564270d1253e58a56f757c874e049f3c27bb` onto Production `241c6aa1d5250ad694ea86f311a0b6929f3b95a1`. It keeps property-card text readable, excludes file inputs from text-field rules, contains and clips the accessible upload control, exposes a focus indicator, and wraps long navigation labels. No JavaScript, PDF page geometry, archive transport, database, permissions or business records change.

Existing contract view, upload, foundation, full-page and warm-beige style regressions are used for this independent release. Exact-head CI and deployed stylesheet identity are recorded in the pull request and execution register. These automated checks do not constitute owner iPhone/iPad acceptance or hosted archive finalization; those remain open under the existing browser credential-state restriction.
