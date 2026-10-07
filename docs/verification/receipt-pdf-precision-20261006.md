# Rent-receipt PDF precision — R09.07

Executed the real ReportLab renderer and inspected its PDF output with pypdf layout extraction. Three canonical archived amounts were preserved exactly: `0.001`, `350.010`, and the stress value `999999999999.999`. The archived payload remained unchanged after rendering. The test uses synthetic data and does not create a receipt, reserve a number, move money or connect to storage.

`PYTHONPATH=.:tests python3 -m unittest official_document_pdf_test -v`: **8 tests passed**, including the three precision vectors, all catalogue forms, RTL identifiers and scope/hash validation. No skipped tests.

This proves rendering of supplied canonical three-decimal strings, not normalization of every possible input, live source calculation, hosted issuance, download/print on owner devices, or visual acceptance of the original receipt design. R09.07 is partially verified, not complete. No runtime code or production data changed in this follow-up.
