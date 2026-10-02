# Employment draft entry correction

The employee section create action now clones the existing independent employment starter, instead of bypassing it with an empty rental editor. The starter contains labeled sections for employer/employee, job/location, start/duration, salary/allowances/payment, schedule/leave, additional terms and signatures. No personal data, legal commitments or approval are prefilled. Existing saved documents are not overwritten.

Employment signer labels and name resolution are employment-specific in the editor, domain resolver and PDF renderer. Existing role keys remain compatible with storage. Lease signer behavior is preserved.

Validation: targeted Node starter/editor regression tests cover creation, save and direct download with a synthetic PDF response. Python PDF tests exercise the real renderer, employment identities and default lease behavior. Package check passed. No production records were written; physical iPhone printing was not tested.
