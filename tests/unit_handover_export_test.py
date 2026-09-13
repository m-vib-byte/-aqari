import base64
import hashlib
import importlib.util
from pathlib import Path
import unittest

MODULE_PATH = Path(__file__).resolve().parents[1] / "api" / "unit-handover.py"
spec = importlib.util.spec_from_file_location("aqari_unit_handover_api", MODULE_PATH)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

WORKSPACE = "11111111-1111-4111-8111-111111111111"
INSPECTION = "22222222-2222-4222-8222-222222222222"
LEASE = "33333333-3333-4333-8333-333333333333"
UNIT = "44444444-4444-4444-8444-444444444444"
ACTOR = "55555555-5555-4555-8555-555555555555"
DOCS = [
    ("66666666-6666-4666-8666-666666666661", "PHOTO_1", "image/jpeg"),
    ("66666666-6666-4666-8666-666666666662", "TENANT_SIGNATURE", "image/png"),
    ("66666666-6666-4666-8666-666666666663", "INSPECTOR_SIGNATURE", "image/png"),
]
AUTH = "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI1NTU1NTU1NS01NTU1LTQ1NTUtODU1NS01NTU1NTU1NTU1NTUifQ.signature"


def source_fixture():
    attachments = []
    evidence = []
    for index, (doc_id, role, mime) in enumerate(DOCS, 1):
        raw = (b"\xff\xd8\xff" + b"photo") if mime == "image/jpeg" else (b"\x89PNG\r\n\x1a\n" + b"signature")
        digest = hashlib.sha256(raw).hexdigest()
        row = {"id": doc_id, "role": role, "checksum_sha256": digest, "size_bytes": len(raw), "mime_type": mime}
        attachments.append(row)
        evidence.append({**row, "storage_bucket": "aqari-documents", "storage_path": f"{WORKSPACE}/{doc_id}.bin"})
    return {
        "bundle": {
            "kind": "unit_handover",
            "title": "محضر تسليم واستلام وحدة",
            "summary": "محضر محفوظ من فحص خروج موقع.",
            "source": {
                "inspection_id": INSPECTION,
                "lease_id": LEASE,
                "unit_id": UNIT,
                "inspection_revision": 2,
                "inspected_at": "2026-09-13T12:00:00+00:00",
                "signed_at": "2026-09-13T12:10:00+00:00",
            },
            "parties": {"tenant_name": "مستأجر اختبار", "contract_no": "C-1", "property_name": "عقار اختبار", "unit_no": "101"},
            "checklist": [{"item": "الجدران", "result": "سليم"}],
            "attachments": attachments,
        },
        "evidence": evidence,
    }


def archived(source, pdf):
    return {
        "workspace_id": WORKSPACE,
        "inspection_id": INSPECTION,
        "inspection_revision": source["bundle"]["source"]["inspection_revision"],
        "lease_id": LEASE,
        "unit_id": UNIT,
        "snapshot_sha256": api.unit_handover_snapshot_sha256(source["bundle"]),
        "pdf_sha256": hashlib.sha256(pdf).hexdigest(),
        "pdf_base64": base64.b64encode(pdf).decode(),
        "renderer_version": api.RENDERER_VERSION,
    }


class UnitHandoverExportTests(unittest.TestCase):
    def test_first_export_renders_commits_then_reopens_exact_archive(self):
        source = source_fixture()
        pdf = b"%PDF-1.4\nverified-handover"
        artifact = {}
        calls = {"evidence": 0, "render": 0, "commit": 0, "source": 0}

        def read(path, auth, body=None):
            self.assertEqual(auth, AUTH)
            if path == "/auth/v1/user":
                return {"id": ACTOR}
            if path.endswith("aqari_unit_handover_pdf_source"):
                calls["source"] += 1
                return source
            if path.endswith("aqari_unit_handover_pdf_get"):
                return artifact
            self.fail(path)

        def fetch_evidence(value, auth):
            calls["evidence"] += 1
            self.assertIs(value, source)
            return {row["id"]: b"evidence" for row in source["bundle"]["attachments"]}

        def render(bundle, evidence):
            calls["render"] += 1
            self.assertEqual(bundle["source"]["inspection_id"], INSPECTION)
            return pdf

        def commit(payload):
            nonlocal artifact
            calls["commit"] += 1
            self.assertEqual(payload["p_source"], source)
            self.assertEqual(payload["p_actor_id"], ACTOR)
            self.assertEqual(payload["p_pdf_sha256"], hashlib.sha256(pdf).hexdigest())
            artifact = archived(source, pdf)
            return {"archived": True, "replayed": False}

        exported, saved = api.export_archive(
            {"workspaceId": WORKSPACE, "inspectionId": INSPECTION}, AUTH,
            read=read, fetch_evidence=fetch_evidence, commit=commit, render=render,
        )
        self.assertEqual(exported, pdf)
        self.assertEqual(saved, artifact)
        self.assertEqual(calls, {"evidence": 1, "render": 1, "commit": 1, "source": 3})

    def test_existing_archive_skips_evidence_render_and_commit(self):
        source = source_fixture()
        pdf = b"%PDF-1.4\nexisting"
        artifact = archived(source, pdf)
        forbidden = lambda *args, **kwargs: self.fail("unexpected mutation")

        def read(path, auth, body=None):
            if path == "/auth/v1/user":
                return {"id": ACTOR}
            if path.endswith("aqari_unit_handover_pdf_source"):
                return source
            if path.endswith("aqari_unit_handover_pdf_get"):
                return artifact
            self.fail(path)

        exported, _ = api.export_archive(
            {"workspaceId": WORKSPACE, "inspectionId": INSPECTION}, AUTH,
            read=read, fetch_evidence=forbidden, commit=forbidden, render=forbidden,
        )
        self.assertEqual(exported, pdf)

    def test_source_change_before_commit_fails_closed(self):
        source = source_fixture()
        changed = source_fixture()
        changed["bundle"]["checklist"] = [{"item": "الجدران", "result": "يحتاج إصلاح"}]
        source_reads = 0
        committed = False

        def read(path, auth, body=None):
            nonlocal source_reads
            if path == "/auth/v1/user":
                return {"id": ACTOR}
            if path.endswith("aqari_unit_handover_pdf_get"):
                return {}
            if path.endswith("aqari_unit_handover_pdf_source"):
                source_reads += 1
                return source if source_reads == 1 else changed
            self.fail(path)

        def commit(payload):
            nonlocal committed
            committed = True

        with self.assertRaisesRegex(ValueError, "UNIT_HANDOVER_SOURCE_CHANGED"):
            api.export_archive(
                {"workspaceId": WORKSPACE, "inspectionId": INSPECTION}, AUTH,
                read=read, fetch_evidence=lambda *_: {}, commit=commit,
                render=lambda *_: b"%PDF-1.4\nchanged",
            )
        self.assertFalse(committed)

    def test_lost_commit_ack_is_reconciled_only_from_verified_readback(self):
        source = source_fixture()
        pdf = b"%PDF-1.4\nlost-ack"
        artifact = {}

        def read(path, auth, body=None):
            if path == "/auth/v1/user":
                return {"id": ACTOR}
            if path.endswith("aqari_unit_handover_pdf_source"):
                return source
            if path.endswith("aqari_unit_handover_pdf_get"):
                return artifact
            self.fail(path)

        def commit(payload):
            nonlocal artifact
            artifact = archived(source, pdf)
            raise TimeoutError("reply lost after commit")

        exported, _ = api.export_archive(
            {"workspaceId": WORKSPACE, "inspectionId": INSPECTION}, AUTH,
            read=read, fetch_evidence=lambda *_: {}, commit=commit, render=lambda *_: pdf,
        )
        self.assertEqual(exported, pdf)

    def test_tampered_archive_is_rejected(self):
        source = source_fixture()
        artifact = archived(source, b"%PDF-1.4\noriginal")
        artifact["pdf_base64"] = base64.b64encode(b"%PDF-1.4\ntampered").decode()
        with self.assertRaisesRegex(ValueError, "UNIT_HANDOVER_ARCHIVE_INTEGRITY_FAILED"):
            api.verified_artifact(artifact, WORKSPACE, INSPECTION, source, artifact["snapshot_sha256"])

    def test_invalid_scope_or_auth_never_reads_source(self):
        def forbidden(*args, **kwargs):
            self.fail("upstream must not be called")
        with self.assertRaises(ValueError):
            api.export_archive({"workspaceId": "bad", "inspectionId": INSPECTION}, AUTH, read=forbidden)
        with self.assertRaises(PermissionError):
            api.export_archive({"workspaceId": WORKSPACE, "inspectionId": INSPECTION}, "Bearer bad", read=forbidden)


if __name__ == "__main__":
    unittest.main()
