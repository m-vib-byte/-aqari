# V267 operational PDF / Excel export — 14 Sep 2026

Scope: Preview only. This advances G07-08 for the operational collection and collector-performance reports.

## Trust boundary

The browser never sends report rows to the export API. It sends only workspace, property, month, report kind and requested format. `api/operational-report.py` validates the authenticated account and invokes the authoritative scoped RPC (`aqari_monthly_collection_report` or `aqari_collector_performance_report`) itself.

The server executes the same scoped RPC twice before releasing an export. If access is revoked, either read is denied. If the canonical report changes between the two reads, export fails with `REPORT_CHANGED_RETRY` rather than downloading a stale snapshot.

## PDF

PDF is generated server-side with the existing registered Arabic font/shaping path. It contains the complete returned result lines, not only expanded/visible browser rows, and states that the source was a fresh server readback.

## Excel

For Excel the server returns the verified snapshot only after the two-read check. The browser then passes that exact snapshot to `src/v267/reports/operational-report-xlsx.js`, which deliberately reuses the hardened `financial-archive-xlsx.js` OOXML encoder already covered by ZIP/XML/openpyxl tests.

Collection money fields are expanded into explicit typed-money rows (due, allocated paid, remaining, discount and overpayment) so monetary values are not silently converted to strings. Collector export writes one typed-money row per saved non-cancelled payment. The inherited encoder retains Arabic RTL, frozen header, filters, sortable dates, three-decimal money cells, literal formula-like identifiers, no macros/formulas/external links, 10,000-row and 16 MiB fail-closed limits.

## UI

`src/v267/pages/property-statements.js` exposes **تنزيل Excel للنتائج** and **تحميل PDF للنتائج** under both the monthly collection report and collector-performance report. The action fetches a fresh server export snapshot; it does not pass the report currently shown in the DOM.

## Exact-build contracts

- `tests/v267-operational-report-xlsx.test.mjs`
- `tests/v267-operational-export-ui.test.mjs`
- `tests/operational_report_export_test.py`

The Python tests prove server-selected RPCs, full-month collector range, rejection of client row payloads, double readback, failure on changed second read, authentication requirement and real PDF bytes. The Node tests prove the operational-to-XLSX mapping and the UI/server trust boundary.

This is Preview implementation evidence. It does not replace exact-head GitHub CI, hosted real-account practical acceptance, physical-device printing, full 155/155 evidence, complete backup/restore/rollback or owner final Production approval.
