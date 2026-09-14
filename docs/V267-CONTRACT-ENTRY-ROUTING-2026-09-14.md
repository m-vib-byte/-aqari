# V267 contract entry routing repair

The user's iPad screenshots revealed two entry paths: service-menu contract
entry used the updated module while legacy smartContractsPage navigation from
quick actions and property workspace still opened the old form. Profile field
changes had reached the screenshots, so this was not established as a cache bug.

Legacy go(smartContractsPage) now opens the updated new-contract form; go(leases)
opens the updated directory. Other routes retain their original receiver/args.
The property-workspace contract action calls the same entry with its property.
Existing protected-property/read-only handling remains before this action.
The selected property is applied only if returned by the authorized property
query. Form creation waits for the directory read. The shared entry verifies
current scope/contracts access and rechecks after dynamic import; failures do
not fall through to the legacy form. Menu entries use the same guard.

50 focused local tests passed, including route dispatch, direct form entry,
unknown-property rejection, available-property selection, tenant save/readback,
print and dialog-session regressions. Runtime packaging now explicitly includes
the new routing module. Hosted path verification is recorded in PR 116.
No saved records, schema, Production or historical signed originals changed.
This fixes the entry mismatch; remaining template/wording/document requirements
in V267-TENANT-CONTRACT-CORRECTIONS-2026-09-14.md are not marked complete.
