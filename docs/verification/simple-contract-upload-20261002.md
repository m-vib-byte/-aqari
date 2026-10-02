# Simple contract upload

The upload screen now presents a primary PDF picker, secondary photo/camera choices, the selected filename and a save action that appears only after selection. It shows the bound property name without a duplicate selector. The archive is a separate destination. Saving displays a clear confirmation and actions to view the verified stored original or visit the archive; it no longer automatically expands every old contract below the upload controls. Upload progress, failed retry, image ordering and scope/hash verification remain in place.

The workspace hides repeated identity/tabs while uploading, and labels the editable-model action explicitly as creating a fillable template. Uploaded PDFs remain archived originals, not automatically converted templates.

Validation:
- Regression tests: archive paging/readback, initial state, selection, one save, successful confirmation, original download, failed retry with retained file; existing template and upload suites passed.
- Local Chromium: real browser file selection and submit with synthetic storage boundaries, success visibility and no archive clutter; no JS page errors or horizontal overflow at 390, 768 and 1280px.
- Phone-size screenshot inspected. Physical iPhone and production upload were not tested. No production records changed.
