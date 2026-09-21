"""Issuance boundary tests use synthetic records and never contact a service."""
import base64
import copy
import hashlib
import importlib.util
import json
from io import BytesIO
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("rental_document_issue", ROOT / "api/rental-document.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

W = "11111111-1111-4111-8111-111111111111"
USER = "22222222-2222-4222-8222-222222222222"
PROPERTY = "33333333-3333-4333-8333-333333333333"
UNIT = "44444444-4444-4444-8444-444444444444"
TENANT = "55555555-5555-4555-8555-555555555555"
LEASE = "66666666-6666-4666-8666-666666666666"
TEMPLATE = "77777777-7777-4777-8777-777777777777"
REQUEST = "88888888-8888-4888-8888-888888888888"
OTHER = "99999999-9999-4999-8999-999999999999"
CLAIMS = {"sub": USER, "role": "authenticated", "aal": "aal2", "amr": [{"method": "totp"}]}


def bearer(claims=CLAIMS):
    encoded = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return "Bearer header." + encoded + ".signature"


class IssueTests(unittest.TestCase):
    def setUp(self):
        self.auth = bearer()
        self.user = USER
        self.allowed = True
        self.calls = []
        self.commits = []
        self.archive = None
        self.render_count = 0
        profile = {"id": "tenant-local", "nameAr": "مستأجر اختبار", "nameEn": "Synthetic Tenant",
                   "civilId": "123456789012", "nationality": "اختبار", "passportNo": "TEST-P123"}
        contract = {"id": 123, "tenantId": "tenant-local", "contract_no": "TEST-123", "propertyId": PROPERTY,
                    "unitId": UNIT, "property": "عقار اختبار", "unit": "1", "floor": "2", "status": "signed",
                    "start_date": "2026-01-01", "end_date": "2026-12-31", "writtenOn": "2025-12-28", "contractRent": 100}
        template = {"id": TEMPLATE, "version": 1, "published_at": "2026-09-21T08:00:00Z", "content_sha256": "a" * 64,
                    "kind": "rental_agreement", "kind_label": "عقد إيجار", "title": "نموذج اختبار",
                    "fields": [{"key": "tenant_name", "label": "المستأجر", "type": "text", "required": True},
                               {"key": "note", "label": "ملاحظة", "type": "text", "required": False}],
                    "clauses": [{"title": "بند محفوظ", "text": "المستأجر {{tenant_name}}. {{note}}"}]}
        self.source = {"template": template, "contract": contract,
                       "lease": {"id": LEASE, "workspace_id": W, "external_ref": "123", "contract_no": "TEST-123",
                                 "tenant_id": TENANT, "unit_id": UNIT, "status": "signed"},
                       "tenant": {"id": TENANT, "workspace_id": W, "external_ref": "tenant-local", "profile": profile,
                                  "full_name": profile["nameAr"], "civil_id": profile["civilId"]},
                       "property": {"id": PROPERTY, "name": "عقار اختبار", "owners": [], "assets": {}},
                       "property_row": {"id": PROPERTY, "workspace_id": W, "name": "عقار اختبار", "metadata": []},
                       "unit": {"id": UNIT, "propertyId": PROPERTY, "unitNo": "1", "floor": "2"},
                       "unit_row": {"id": UNIT, "workspace_id": W, "property_id": PROPERTY, "unit_no": "1"},
                       "receipt": None}
        self.source_hash = "b" * 64
        self.pdf = b"%PDF-1.4\nsynthetic exact reviewed bytes\n%%EOF"
        self.preview_digest = "c" * 64
        self.request = {"workspaceId": W, "requestId": REQUEST, "templateId": TEMPLATE, "leaseId": LEASE,
                        "propertyId": PROPERTY, "values": {"note": "ملاحظة اختبار"}, "previewDigest": self.preview_digest,
                        "reviewedPdfSha256": hashlib.sha256(self.pdf).hexdigest(), "approved": True,
                        "reason": "راجعت النص وملف PDF وأعتمد الإصدار"}

    def read(self, path, auth, body=None):
        self.assertEqual(auth, self.auth)
        self.calls.append((path, copy.deepcopy(body)))
        if path == "/auth/v1/user":
            return {"id": self.user}
        if path.endswith("/aqari_rental_templates"):
            return {"workspace_id": W, "user_id": self.user, "can_publish": self.allowed}
        if path.endswith("/aqari_rental_document_source"):
            self.assertEqual(body, {"p_workspace_id": W, "p_template_id": TEMPLATE, "p_lease_id": LEASE, "p_receipt_id": None})
            return {"workspace_id": W, "user_id": self.user, "source": copy.deepcopy(self.source), "source_sha256": self.source_hash}
        if path.endswith("/aqari_rental_document_archive"):
            if self.archive is None:
                raise HTTPError("https://test.invalid", 404, "P0002", None, None)
            return {"workspace_id": W, "user_id": self.user, "record": copy.deepcopy(self.archive)}
        self.fail("Unexpected upstream access: " + path)

    def render(self, source, extras, workspace, auth, read):
        self.render_count += 1
        self.assertEqual(source, self.source)
        self.assertEqual(workspace, W)
        self.assertEqual(auth, self.auth)
        self.assertEqual(extras, self.request["values"])
        return {"pdf": self.pdf, "digest": self.preview_digest,
                "values": {"tenant_name": "مستأجر اختبار", **extras},
                "resolved": {"title": "نموذج اختبار", "clauses": [{"title": "بند محفوظ", "text": "نص معروض"}],
                             "signatures": [{"role": "tenant", "name": "مستأجر اختبار"}]}, "logo_snapshot": None}

    def commit(self, payload):
        self.commits.append(copy.deepcopy(payload))
        self.assertEqual(payload["p_actor_id"], USER)
        self.assertEqual(payload["p_actor_claims"], CLAIMS)
        self.assertEqual(payload["p_snapshot"]["source"], self.source)
        self.assertEqual(payload["p_source_sha256"], self.source_hash)
        self.assertTrue(payload["p_approved"])
        self.archive = {"id": payload["p_request_id"], "workspace_id": W, "template_id": TEMPLATE,
                        "lease_id": LEASE, "property_id": PROPERTY, "unit_id": UNIT, "tenant_id": TENANT,
                        "receipt_id": None, "issued_by": USER, "source_sha256": payload["p_source_sha256"],
                        "snapshot_sha256": "d" * 64, "pdf_sha256": payload["p_pdf_sha256"],
                        "pdf_base64": payload["p_pdf_base64"], "snapshot": copy.deepcopy(payload["p_snapshot"])}
        return {"workspace_id": W, "user_id": USER, "archived": True, "record": {"id": REQUEST}}

    def issue(self, request=None, commit=None, render=None):
        return api.issue_document(request or self.request, self.auth, self.read, commit or self.commit, render or self.render)

    def test_explicit_issue_renders_server_side_and_returns_only_verified_archive(self):
        pdf, record = self.issue()
        self.assertEqual(pdf, self.pdf)
        self.assertEqual(record, self.archive)
        self.assertEqual(len(self.commits), 1)
        self.assertEqual(self.render_count, 1)
        self.assertEqual(self.archive["snapshot"]["request"]["receiptId"], None)
        self.assertEqual(self.archive["snapshot"]["source"], self.source)
        self.assertEqual(self.commits[0]["p_renderer_version"], api.RENDERER_VERSION)
        self.assertEqual(self.calls[-1][0], "/rest/v1/rpc/aqari_rental_templates")

    def test_owner_approval_and_review_hashes_are_mandatory(self):
        for mutation in [{"approved": False}, {"approved": 1}, {"reason": ""}, {"reason": "yes"},
                         {"previewDigest": ""}, {"reviewedPdfSha256": "not-a-hash"}]:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.issue({**self.request, **mutation})
        self.assertEqual(self.calls, [])
        self.assertEqual(self.commits, [])

    def test_client_cannot_submit_pdf_template_source_or_linked_field_override(self):
        for mutation in [{"pdf_base64": "caller-bytes"}, {"snapshot": self.source}, {"template": self.source["template"]},
                         {"actorId": OTHER}, {"values": {"tenant_name": "somebody else"}},
                         {"values": {"monthly_rent": "1"}}, {"values": {"note": {"html": "unsafe"}}},
                         {"values": {"note": float("nan")}}]:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                self.issue({**self.request, **mutation})
        self.assertEqual(self.calls, [])

    def test_bearer_is_verified_before_using_claims_and_forged_subject_is_refused(self):
        self.user = OTHER
        with self.assertRaises(PermissionError):
            self.issue()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.calls[0][0], "/auth/v1/user")
        self.assertEqual(self.commits, [])

    def test_general_manager_gate_rejects_non_owner_before_source_or_render(self):
        self.allowed = False
        with self.assertRaisesRegex(PermissionError, "OWNER_APPROVAL_REQUIRED"):
            self.issue()
        self.assertEqual(self.render_count, 0)
        self.assertEqual(self.commits, [])

    def test_wrong_property_unit_tenant_and_workspace_sources_fail_closed(self):
        original = copy.deepcopy(self.source)
        mutations = [lambda: self.source["property"].update(id=OTHER),
                     lambda: self.source["unit"].update(propertyId=OTHER),
                     lambda: self.source["lease"].update(unit_id=OTHER),
                     lambda: self.source["tenant"].update(id=OTHER),
                     lambda: self.source["property_row"].update(workspace_id=OTHER),
                     lambda: self.source["template"].update(id=OTHER)]
        for mutate in mutations:
            self.source = copy.deepcopy(original)
            mutate()
            with self.assertRaises((ValueError, PermissionError)):
                self.issue()
        self.assertEqual(self.commits, [])
        self.assertEqual(self.render_count, 0)

    def test_changed_digest_or_actual_reviewed_pdf_bytes_never_commit(self):
        for mutation in [{"previewDigest": "a" * 64}, {"reviewedPdfSha256": "a" * 64}]:
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "DOCUMENT_PREVIEW_CHANGED"):
                self.issue({**self.request, **mutation})
        self.assertEqual(self.commits, [])

    def test_lost_commit_acknowledgement_reads_back_original_and_does_not_retry_write(self):
        def lost_ack(payload):
            self.commit(payload)
            raise TimeoutError("response lost after transaction")
        pdf, record = self.issue(commit=lost_ack)
        self.assertEqual(pdf, self.pdf)
        self.assertEqual(record["id"], REQUEST)
        self.assertEqual(len(self.commits), 1)

    def test_missing_readback_cannot_be_reported_as_issuance(self):
        with self.assertRaisesRegex(ValueError, "ARCHIVE_WRITE_NOT_CONFIRMED"):
            self.issue(commit=lambda payload: {"archived": True})
        self.assertIsNone(self.archive)

    def test_server_source_change_during_render_is_rejected_by_transaction_without_success(self):
        def stale_source(payload):
            raise HTTPError("https://test.invalid", 409, "DOCUMENT_SOURCE_CHANGED", None, None)
        with self.assertRaises(HTTPError) as raised:
            self.issue(commit=stale_source)
        self.assertEqual(raised.exception.code, 409)
        self.assertIsNone(self.archive)

    def test_revocation_during_render_prevents_commit(self):
        def revoke(*args):
            result = self.render(*args)
            self.allowed = False
            return result
        with self.assertRaises(PermissionError):
            self.issue(render=revoke)
        self.assertEqual(self.commits, [])

    def test_revocation_after_commit_prevents_returning_pdf(self):
        def revoke(payload):
            result = self.commit(payload)
            self.allowed = False
            return result
        with self.assertRaises(PermissionError):
            self.issue(commit=revoke)
        self.assertIsNotNone(self.archive)

    def test_exact_retry_returns_original_after_source_changes_without_rerender(self):
        original, _ = self.issue()
        self.source["contract"]["contractRent"] = 999
        self.source_hash = "e" * 64
        self.pdf = b"%PDF-1.4\nnew source must not replace archive"
        result, _ = self.issue()
        self.assertEqual(result, original)
        self.assertEqual(self.render_count, 1)
        self.assertEqual(len(self.commits), 1)

    def test_request_id_collision_is_not_treated_as_a_successful_retry(self):
        self.issue()
        for mutation in [{"reason": "سبب مختلف لهذا الاعتماد"}, {"values": {"note": "edited"}}, {"leaseId": OTHER}]:
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "ISSUE_REQUEST_CONFLICT"):
                self.issue({**self.request, **mutation})
        self.assertEqual(len(self.commits), 1)

    def test_different_archived_snapshot_or_corrupt_bytes_never_return_success(self):
        def wrong_snapshot(payload):
            result = self.commit(payload)
            self.archive["snapshot"]["values"]["tenant_name"] = "incorrect"
            return result
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SNAPSHOT_MISMATCH"):
            self.issue(commit=wrong_snapshot)
        self.archive["pdf_base64"] = base64.b64encode(b"%PDF-corrupt").decode()
        with self.assertRaisesRegex(ValueError, "ARCHIVE_INTEGRITY_FAILED"):
            self.issue()

    def test_archive_download_uses_stored_bytes_and_rechecks_property_scope(self):
        original, _ = self.issue()
        body = {"action": "get", "workspaceId": W, "documentId": REQUEST, "propertyId": PROPERTY}
        self.source.clear()
        self.pdf = b"unrelated"
        downloaded, _ = api.get_document(body, self.auth, self.read)
        self.assertEqual(downloaded, original)
        with self.assertRaisesRegex(ValueError, "ARCHIVE_SCOPE_MISMATCH"):
            api.get_document({**body, "propertyId": OTHER}, self.auth, self.read)
        self.assertEqual(self.render_count, 1)
        self.assertEqual(len(self.commits), 1)

    def test_wrong_project_service_configuration_is_rejected_before_network(self):
        with patch.object(api.common, "config", return_value=("https://expected.supabase.co", "sb_publishable_TEST")), \
                patch.dict(api.os.environ, {"AQARI_PDF_ARCHIVE_SERVICE_KEY": "sb_secret_TEST",
                                           "AQARI_PDF_ARCHIVE_SUPABASE_URL": "https://different.supabase.co"}), \
                patch.object(api, "build_opener") as network:
            with self.assertRaisesRegex(RuntimeError, "PDF_ARCHIVE_NOT_CONFIGURED"):
                api.commit_issue({})
            network.assert_not_called()

    def test_real_renderer_deterministic_pdf_is_the_exact_archived_reviewed_file(self):
        first = api.render_source(self.source, self.request["values"], W, self.auth, self.read)
        second = api.render_source(self.source, self.request["values"], W, self.auth, self.read)
        self.assertEqual(first["pdf"], second["pdf"])
        self.request["previewDigest"] = first["digest"]
        self.request["reviewedPdfSha256"] = hashlib.sha256(first["pdf"]).hexdigest()
        pdf, record = self.issue(render=api.render_source)
        self.assertEqual(pdf, first["pdf"])
        self.assertEqual(record["snapshot"]["values"]["tenant_name"], "مستأجر اختبار")
        self.assertEqual(record["snapshot"]["source"]["template"]["clauses"], self.source["template"]["clauses"])

    def test_changed_property_logo_bytes_require_new_pdf_review_even_with_same_semantic_digest(self):
        from PIL import Image
        flags = {"name": True, "signature": True, "fingerprint": True}
        self.source["template"]["presentation"] = {
            "version": 1, "paper": "A4", "language": "ar", "placements": [],
            "logo": {"enabled": True, "source": "property"}, "signers": {"owner": flags, "tenant": flags}}
        self.source["property"]["assets"]["logo"] = OTHER
        def png(color):
            output = BytesIO()
            Image.new("RGB", (8, 8), color).save(output, format="PNG")
            return output.getvalue()
        logo = [png("red")]
        def logo_read(path, auth, body=None):
            if path.startswith("/rest/v1/aqari_documents?"):
                return [{"id": OTHER, "workspace_id": W, "status": "uploaded", "entity_type": "property",
                         "entity_ref": PROPERTY, "mime_type": "image/png", "size_bytes": len(logo[0]),
                         "document_type": "supporting_document", "metadata": {"category": "property_logo"},
                         "checksum_sha256": hashlib.sha256(logo[0]).hexdigest()}]
            return self.read(path, auth, body)
        def render(source, values, workspace, auth, read):
            return api.preview.render_source_preview(source, values, workspace, auth, logo_read,
                                                     storage=lambda row, bearer: logo[0])
        reviewed = render(self.source, self.request["values"], W, self.auth, self.read)
        self.request["previewDigest"] = reviewed["digest"]
        self.request["reviewedPdfSha256"] = hashlib.sha256(reviewed["pdf"]).hexdigest()
        logo[0] = png("blue")
        changed = render(self.source, self.request["values"], W, self.auth, self.read)
        self.assertEqual(changed["digest"], reviewed["digest"])
        self.assertNotEqual(changed["pdf"], reviewed["pdf"])
        with self.assertRaisesRegex(ValueError, "DOCUMENT_PREVIEW_CHANGED"):
            self.issue(render=render)
        self.assertEqual(self.commits, [])


if __name__ == "__main__":
    unittest.main()
