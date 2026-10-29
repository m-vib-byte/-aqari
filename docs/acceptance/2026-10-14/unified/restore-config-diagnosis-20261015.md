# U499-05.2 — restore configuration diagnosis

Receiver configuration validation now removes harmless whitespace and a trailing slash from the source API base URL, while keeping the exact isolated source-project allowlist. The enabled flag accepts whitespace/case around the literal true; false remains disabled. It never accepts arbitrary source projects or enables a disabled receiver.

HTTP503 reports fixed reason codes alongside setting names. It does not report values, API keys, workspace IDs, submitted URLs, or credentials. This distinguishes absent settings, explicit disablement, a different project, and a function path where an API base URL is required.

Validation: 36 executable adapter/protocol tests passed; package check and release inventory guard passed. These are local tests and do not prove hosted restore, account acceptance, or physical device acceptance. The previous candidate's CI and preview results must not be attributed to this new revision.

Deployment scope: the existing isolated receiver nlqynpmilcdqztwrrvyu/aqari-storage-restore-v2 only. No configuration writes, transfer, membership changes, new resources, merge, or production publication. Manual AAL2 user and manager checks remain in place. Rollback uses the captured previous receiver files with the same authentication configuration; it does not remove current settings or stored records.

At 2026-10-14T22:52:08Z the receiver named only AQARI_STORAGE_RESTORE_V2_ENABLED and AQARI_RESTORE_SOURCE_URL, rather than the five names seen earlier. Presence of the other fields is not proof of their validity. Hosted restore logs still showed zero runs and objects.
