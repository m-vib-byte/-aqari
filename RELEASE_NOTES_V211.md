# AQARI V211 — Secure Rent Follow-up Center

V211 turns the V210 rent KPIs into a protected operational follow-up queue.

- Reads properties, rent records, statements, contracts, receipts and payment actions only through the protected V202 APIs.
- Separates reminder, pending review, read-only, uncollectible and setup states without inventing due dates.
- Shows legal contract-expiry alerts only when an official contract end date exists.
- Generates bilingual reminder text; copy, email and search remain explicit user actions and nothing is sent automatically.
- Adds a scoped follow-up journal bound to the current user, workspace and role, with revision and access verification before and after persistence.
- Routes V210 overdue, pending and property priorities into V211.
- Keeps V198 as the compatibility runtime/API contract.

Release requires Runtime Contracts, Release Gate, exact-SHA Vercel Preview and Preview E2E on the same head. Merge remains manual after explicit approval.
