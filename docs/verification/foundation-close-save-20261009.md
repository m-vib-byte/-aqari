# Flush contract foundation edits before closing — 9 October 2026

Production `5c9185be3198ab6ae83f1196edeb711ef90deab1` flushes foundation edits before review/promotion but disposes a pending autosave when the dialog closes. Its flush also waits only for the queue captured at invocation, and an older completed save can announce success while a newer edit remains unsaved.

The new regressions reproduce early flush completion and stale saved feedback before the repair. The queue now drains edits arriving during an in-flight close flush, whether still debounced or already queued. Revision tracking reports unsaved work until the latest snapshot is confirmed and suppresses saved feedback for superseded snapshots. Failed writes remain rejected until a later edit is successfully saved; forced disposal still cancels unsent work and rejects outstanding flushes.

The foundation connects to the existing guarded dialog close and before-unload hooks. A normal close waits for confirmed saves and a failure retains the dialog; a browser-level unload requests its standard unsaved-change warning while needed. Authentication boundary disposal stays immediate. Browser unload warnings are best-effort and do not guarantee preservation after force-closing the app or a device shutdown.

Focused autosave/foundation/dialog/onboarding regressions and the complete prepared suite are recorded in the pull request and execution register. No backend, schema, role, payment or archive-activation changes. Hosted signed-in and owner iPhone/iPad acceptance remain unverified under the existing browser credential-state restriction.
