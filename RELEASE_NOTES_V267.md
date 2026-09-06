# V267 — Premium workspace

The previous home page placed a large introduction and workflow guide ahead of operational content. V267 gives collection figures and follow-up priorities a clearer hierarchy, with a compact heading and a collapsible property guide.

- Navy navigation, restrained gold accents and consistent light working surfaces.
- Desktop side navigation, intermediate tablet layout and existing mobile navigation.
- Direct access to contracts and documents through the existing navigation handler.
- Larger Arabic labels, touch targets, amount typography and visible keyboard focus.
- Refined login screen with inline styling and no additional render-blocking dependency; remains below the existing 17 KB limit.
- Collection figures explicitly describe the selected month, never implying monthly amounts are today's KNET payments.
- Public product identity advances to V267. The V198 API contract and historical module/diagnostic identifiers remain compatible.

Authentication, workspace isolation, payment processing, database policies, document printing and recovery behavior are preserved. This presentation update does not establish that the previously reported owner-device startup problem has been resolved.

Validation before review: all 343 existing Node regression tests pass, as do the nine release self-checks. Connected deployment and browser CI results are recorded on the pull request.
