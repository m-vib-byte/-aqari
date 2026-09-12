# Paper scanning and document entry — 12 September 2026

Base: `744a48354bf54dcd9f9374e3db01ebf082fcb63c`, existing PR #75.

## Confirmed usability gaps

The authenticated Documents navigation rendered counts and a paragraph sending the
user to More. It had no upload action. Rental contracts placed the signed-file
input after the full contract, and no direct scanner button existed. Imported
contracts returned early before all attachment tools. The scanner combined camera
capture and file selection in one input and handled only one image at a time.

## Implemented

- Documents now exposes scanning/upload, original-byte upload, and saved contracts
  directly, with short instructions and no irrelevant collection-month field.
- Each saved contract, including imported contracts, opens scanning with its saved
  reference selected. A return button reopens the same contract.
- Property files expose their private document archive and scanner with the
  property reference selected and a return path to the file.
- A supplied reference is resolved by an RLS-protected exact database read, avoiding
  failure when the record is outside the first 50 search results. The selected
  record is locked in this contextual flow.
- Separate camera and file inputs; crop/rotation, ordered page previews, move/remove
  controls; up to 20 JPEG scan pages assembled locally into one bounded A4 PDF.
  Camera capture remains device-dependent. No remote image processor is used.
- Existing PDF/DOCX can be uploaded individually; malformed headers and oversized
  files are rejected. Original-byte PDF/image preservation remains a separate
  explicit action. This is image scanning, not OCR or automatic field extraction.
- Signed-contract category requires explicit review of the selected pages. Upload
  never changes lease approval/signing status by itself.
- Existing private storage, insert-only upload, checksum/readback, retry and auth
  disposal protections remain. The scanner also verifies the returned document ID.
- In-app guide explains the same entry points and retrieval steps.

## Validation

- 1,014 local Node tests passed, zero failures/skips. Eight new behavioral tests
  exercise ordered multi-page saving, exact target lookup, interrupted/corrupt/
  denied storage, wrong record ID, signed review, file mixing, disposal and PDF
  byte offsets/limits. Existing upload recovery tests remain successful.
- The existing browser CI scanner flow now selects two images and asserts one
  two-page PDF while retaining its failure/retry/reload/revocation assertions.
- Poppler parsed and rendered both pages of a generated synthetic PDF; both were
  visually checked, including order and legibility. There are no scripts or forms.
- Hosted acceptance of this change is recorded below.

## Hosted acceptance

The authenticated V267 Preview build for commit
`8799e8431d604219289b62d8f7fba48336a07f8f` was READY. Using the actual UI and
the existing preview acceptance property (not a real contract), two synthetic
JPEG pages were selected, previewed and saved as one PDF. The saved document is
`DOC-058ddee9-59f8-46e8-aac8-a15dc377c0ea`, titled
«اختبار مسح ورقتين 12-09 — مستند اصطناعي غير رسمي». The application confirmed
private-file readback, checksum, category and linked-record verification. The
archive showed the saved document and its authenticated author.

After a full page reload, opening the same property and its new Documents button
showed the saved item with the property selection locked. Return reopened the
property file. The Documents-to-contract route opened the saved test contract;
its scanner selected the exact contract number, displayed the signed-page review
checkbox, and listed the pre-existing attachment. No contract status was changed
and no new signed-contract attestation was made.

The saved document's download action successfully fetched the private object and
displayed the download link. The browser adapter did not emit a download event,
so no independently downloaded hosted PDF artifact is claimed. The separate
two-page PDF generated locally was parsed and visually verified as described
above. Physical camera capture remains unverified.

The first browser CI run on `8799e84` passed the scanner's multi-page, retry,
readback and reload checks, then failed in all six engine/viewport variants on a
later financial-panel fixture: it tried to fill the collection-month input that
was intentionally removed from Documents. The follow-up keeps the financial
month checks on financial panels and explicitly checks the three document entry
buttons and absence of a document-month restriction. Its result must be read from
the follow-up commit's CI, not inferred from the local unit tests. Concurrent
authenticated-renderer fixture corrections on the same branch were preserved.

No production deployment, schema mutation, provider activation, or assertion that
all 155 requirements are accepted is included. The release gate remains HOLD.
Physical iPhone/iPad camera and Safari acceptance are distinct from browser CI.

The existing non-overwriting storage design follows the provider's documented
[standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads).
The Supabase changelog was checked; no relevant Storage breaking change required
changing the existing upload API.
