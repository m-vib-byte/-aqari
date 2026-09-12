# AQARI V266 backup development workspace

Date: 2026-09-12
Branch: `dev/v266-backup-development-20260912`
Base rollback commit: `af9515e624afe9a524f1b16ed8b37e47583da786`

This branch is an isolated development copy created from the historical V266 rollback point. The historical V266 reference itself must remain unchanged.

## Safety rules
- Do not point `myaqari.com` at this branch until its candidate passes the required release gate.
- Do not mutate or delete the historical V266 rollback reference.
- Development and testing occur only on this isolated branch / its Preview environment.
- Preserve current production data and transactions.
- Before any production promotion, require green exact-head CI, practical authenticated acceptance, current Database/Auth/Storage backup, independent restore rehearsal, and a tested data-preserving rollback point.

## Development objective
Use the V266 rollback codebase as a stable isolated base for continued AQARI development while keeping the original rollback reference immutable. Bring forward only verified improvements, with mobile-first Arabic RTL usability and data integrity preserved.
