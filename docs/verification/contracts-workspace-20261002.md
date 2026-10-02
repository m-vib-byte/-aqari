# Contracts workspace — 2026-10-02

Implements the owner's approved ivory/gold mobile workspace, property logo selector, contracts/documents/archive navigation, and separate saved / currently published template indicators. Drafts remain visibly inactive. Property names and logos are read from the selected property; no fixed apartment number is added.

Ready contracts accept a PDF or up to 20 ordered camera/photo pages. Images use the existing scanner and PDF writer, then the existing verified property upload. Originals remain private property documents and do not create leases or collections. PDF archive pagination and verified download remain intact.

Every property file now has shortcuts for rent receipts, salary vouchers and employment contract drafts. The two new document starters contain only labelled empty fields; employment terms must be supplied and reviewed by the owner. Their default signers do not mislabel employees as tenants. They are excluded from lease-template pickers. Templates remain a shared reusable library; these shortcuts pass the property's identity to the existing editor/logo context.

Validation: package check; 83 focused template, draft, property archive, logo and contract foundation tests; Chromium synthetic-session UI checks at 390×844 and 1280×900, covering tabs, saved/active state, six document starters, upload choices, empty archive, no writes on navigation and no page errors. No production database migration or record mutation.
