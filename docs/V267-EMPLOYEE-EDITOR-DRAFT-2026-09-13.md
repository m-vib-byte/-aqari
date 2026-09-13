# V267 employee editor draft protection

Preview continuation of draft PR 116 from a84eb607d0dc4d280b652897feabf377afc8e12d.

Two runtime cases reproduced lost unsaved employee form values when returning
 to the directory or opening the saved-record check. Back navigation now checks
raw form values, including pay, status, account and property selections. An
explicit discard-and-return action is available. Saved-record checking reads
without replacing the editor and explicitly distinguishes record existence
from confirmation that the latest changes were saved. It does not advance the
editor revision or automatically replay a write.

Previously assigned properties absent from the current directory remain
selected with a generic unavailable label. Saving requires explicit removal
or reopening after availability is restored. Unchecking an unavailable choice
disables it. Existing server authorization remains authoritative. Optional
profile access also tolerates missing profile fields when creating an editor.

40 focused runtime tests passed: employee directory/editor (7), payroll (6),
shared dialog boundary/progress (9) and staff access (18). Regression coverage
includes blocked accidental navigation, explicit discard, unchanged navigation,
non-destructive saved-record checking, and unavailable-property save blocking
followed by explicit removal. The existing HR CI step already includes this suite.

This slice does not add exact employee-write reconciliation; interrupted saves
still require review of the persisted record before retrying. Closing the whole
dialog retains the shared immediate private-data disposal behavior. Hosted UI
and physical-device acceptance are not claimed for this slice; the preceding
browser connection failure remains an outstanding verification limitation.
No hosted records, schema, accounts or Production settings were modified.
Full-155 acceptance remains HOLD.
