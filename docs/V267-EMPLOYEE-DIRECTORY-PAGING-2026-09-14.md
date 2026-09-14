# V267 employee directory paging and return state

Preview continuation of draft PR 116 from 6e0dc0cf3e49b23cfd80831303331ce072fb4e41.

The directory renders 20 matching employee records per page with the total
match count, visible range, current page and previous/next controls. Search and
filter changes reset the page; return from a profile or editor and database
refresh preserve the search, property, status and page within this dialog.
A refreshed shorter list clamps the page to its valid range. A disappeared
selected property remains explicitly unavailable instead of broadening results.

Directory view identity blocks detached controls from altering later views.
Closing the dialog clears directory data, filter values and the active view.
Paging/filtering makes no new server calls. The pager is hidden when only one
page exists. No saved employee, account, schema or production setting changes.

25 focused local tests passed: 10 employee directory/editor, six payroll,
and nine shared-dialog boundary/progress tests. New coverage uses 45 employee
fixtures, checks 20/20/5 paging, return-state retention, refresh clamping,
stale controls and unavailable property filters. Existing CI includes the suite.
Full-155 acceptance remains HOLD. Live verification is recorded in PR 116;
physical-device acceptance and hosted employee writes are not claimed.
