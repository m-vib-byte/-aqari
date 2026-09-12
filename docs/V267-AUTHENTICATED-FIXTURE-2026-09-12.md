# Authenticated property-create regression fixture

The authenticated-home run [34700669445](https://github.com/m-vib-byte/-aqari/actions/runs/34700669445) failed on source `744a48354bf54dcd9f9374e3db01ebf082fcb63c`: both Chromium and WebKit timed out opening the quick-create property dialog in empty and populated workspaces.

The new property form correctly requires the V267 workspace permission response. The older full-renderer fixture configured Supabase as localhost, which the existing isolated-project guard rejects, and did not serve `aqari_workspace_access`. The guard therefore prevented the property form from opening. Production permission checks must remain intact.

The fixture now declares the existing isolated project origin and translates only that exact origin to its local synthetic HTTP backend. All other external browser requests remain blocked. The permission RPC checks the synthetic authorization token, POST method and workspace ID before returning the manager's section rights. No hosted writes or real accounts are used.

The presentation check waits for verified property write access, opens the real property form through quick-create, and checks its input labels. It then revokes property write access in the synthetic backend, refreshes through the existing controls-change event, and verifies that the form cannot reopen. Re-enabling the synthetic permission must restore access before navigation checks continue.

Local validation: JavaScript syntax and diff checks plus 61 existing workspace, rental-record, property-presentation and service-directory tests passed. The complete browser gate runs in GitHub Actions on the resulting commit; this note does not represent a completed browser run or acceptance of all 155 requirements. No application permission guard, production setting, database or V266 state is changed by this repair.
