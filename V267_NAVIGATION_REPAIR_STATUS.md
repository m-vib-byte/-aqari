# V267 navigation repair — 2026-09-07

Status: NOT approved; actual iPhone verification remains blocked. Do not promote the main domain or replace V266. Do not ask the owner to repeat testing on this evidence alone.

Investigation found 36 legacy section-render wrappers executing during every global render, including hidden financial, maintenance, compliance and hardening views. Hardening scans synchronously parse localStorage repeatedly. Previous observer debouncing did not address this global render chain.

The wrappers now update only when one of their section pages is selected. Direct action handlers, data calculations, authentication, session enforcement, and storage writes are unchanged. On returning to a section its existing renderer runs again, so this introduces no persistent financial cache.

Validation: 422 automated tests pass, including repeated navigation with hidden-render counters and entry/return coverage for every scoped section. These are isolated JavaScript regression tests, not browser performance measurements or physical iPhone tests. Release inventory validation also passes after updating checksums.

Remaining: authenticated end-to-end navigation, actual iPhone/Safari responsiveness and long-task measurements, login/session retention, and complete functional regression with real scoped data. The available browser session has not passed Vercel/GitHub authentication and provides no physical iPhone. No assertion that the general freeze is fully resolved is justified yet.
