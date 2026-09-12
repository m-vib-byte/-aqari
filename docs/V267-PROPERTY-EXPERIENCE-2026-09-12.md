# Property search and simplified pages

Implemented on the current PR #75 development candidate, starting at e382cec2e87a34117d15d01ad86b6989159d92a6.

- The home page begins with property search by name, area/address and owner. Arabic diacritics, hamza, spelling variants and Arabic/Latin digits are normalized for searching. Six results appear at a time with explicit pagination. Each card opens the existing property workspace.
- Property details show saved photos, asking price, location and explicit telephone/WhatsApp/map links. Links open only when corresponding data exists. Missing photos, asking prices and contact details remain visibly missing. Source rental income is never substituted for an advertised price. Financial KPIs remain available in an expandable section, and contracts/collections/units retain their current handlers.
- Property creation and editing use a single form with a required property name; optional location, asking price, listing purpose, contact and up to four compressed JPEG photos. Administrative fields are grouped as optional. Existing property names remain locked to protect linked records.
- Presentation metadata is a versioned extension of the existing property row. Other row fields and unknown extensions are retained. The existing cloud store performs revision checks, save and authoritative readback before showing success. The existing property projection preserves the complete row as metadata; no schema migration was added or applied.
- Read/write controls depend on the current workspace access result. Search is cleared at authentication boundaries. Pending photo processing cannot repopulate a disposed form. Image rendering accepts bounded inline JPEGs, avoiding third-party tracking images.

## Verification

Executed 121 targeted local tests with no failures or skips: 115 existing property/rental regressions plus six new tests covering Arabic search, metadata preservation, price/source separation, validation, escaped links/images and save/readback. The full local JavaScript suite also passed: 1,005 tests, zero failures or skips. The Staging source inventory and syntax checks passed. Test fixtures are synthetic, not production data.

The visual fixture `tests/v267-property-experience.fixture.html` uses the actual presentation, search and property-entry modules with an in-memory store. It makes no Supabase requests and creates no real account or property. Its buttons allow exercising save, reload, edit and permission withdrawal. Browser execution on Preview `9e7f13ed9ed4ba95daba1e719449383407f028d3` verified Arabic search, property detail rendering, invalid-phone rejection, a successful synthetic property save followed by independent readback, exact three-decimal price display, explicit contact URLs, locked existing property identity and clearing the search/form after permission withdrawal. Contact links were inspected without calling or messaging anyone. The actual application session currently displays sign-in, so this is not authenticated real-data acceptance. Responsive-frame checks and final CI results are recorded separately.

No production deployment, main merge, hosted SQL or real property mutation was performed for this change. The prior release gates for authenticated acceptance, full Database/Auth/Storage backup, restore and rollback remain unproven. This bounded UI change is not acceptance of all 155 requirements or activation of a public advertising marketplace.

## Authenticated integration correction

The real manager session successfully signed in. Its daily collection panel contains a nested `details` element. The service-directory mount incorrectly used that descendant as a direct `insertBefore` reference, throwing `NotFoundError` and stopping the workspace refresh. The mount now selects only direct home children. A regression reproduces the real DOM topology: it failed before the change and all nine service-directory tests pass after it. No permission checks are bypassed.

On candidate `717a6e0b7aa176e4e18843c0ee6dd898b9b9d412`, actual Chrome rendering in a synthetic 390-pixel iframe verified the single-column cards and form, exact saved-property feedback while a different search was active, and independent readback. At 820 pixels, document scroll width equals client width (820), with no horizontal overflow. These are browser viewport tests, not physical iPhone/iPad acceptance.

## Actual account read-only acceptance

On Preview `dc522d373b18175dcdb4a2ed7f94b3c362962780`, the manager session survived page reload. The new home search was visible, Arabic-digit search found the existing Staging acceptance property, and its existing property dialog displayed the new summary and expandable financial details. The real-account add-property form opened successfully without saving a real record. Its legacy parent grid initially confined the complete form to half the dialog; a scoped grid-column correction now lets it use the full dialog width. The full local suite after the nested-details fix passed 1,006 tests with zero failures/skips. No hosted property values were changed.
