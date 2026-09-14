# V267 employee directory filters

Preview continuation of draft PR 116 from 0db841ec020f2ef18f9df903c1b85454ac77349b.

The employee directory now shows the count of returned authorized employee
records and active/on-leave/inactive counts. Property and status filters combine
with the existing normalized Arabic name/phone search. A live result count
reports matches against available records. Clear filters restores the full
returned list without another request. Multi-property employees are counted
once, and missing property arrays safely fail a selected property filter.

The summary uses the existing white/gold note styling. Labelled filters use the
shared two-column grid, collapsing to one column below 560px. No new dependency,
database mutation, permissions change or production deployment is involved.
Refresh continues to reload the directory and reset filters; no persistent
filter preferences are claimed.

23 focused local tests passed: eight employee directory/editor cases, six
payroll cases and nine shared dialog boundary/progress cases. The new runtime
case checks combined search/status/property filters, counts, empty results,
reset without RPC, and stale controls after disposal. Existing CI includes the
suite. Local tests do not replace hosted UI or physical-device acceptance.
Full-155 evidence and release HOLD remain unchanged.
