"""Real API/render code; in-memory transport simulates the controlled archive RPCs.

The separate SQL suite executes grants, immutability, scope and persistence.
These tests do not claim a live Supabase or physical-device result.
"""
import base64
import copy
import hashlib
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch
from official_document_pdf_test import fixture, DOC, WS

spec = importlib.util.spec_from_file_location('official_api', Path(__file__).parents[1] / 'api/official-document.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
ACTOR = '10000000-0000-4000-8000-000000000004'
REQUEST = {'workspaceId': WS, 'documentId': DOC, 'version': 1}
AUTH = 'Bearer fixture.claims.signature'

class Transport:
    def __init__(self):
        self.document = fixture()
        self.artifact = {}
        self.commits = 0
        self.gets = 0
        self.lost_reply = False
        self.reject_commit = False
        self.revoke_after = None
        self.wrong_readback = None
    def read(self, path, auth, data=None):
        assert auth == AUTH
        if path == '/auth/v1/user': return {'id': ACTOR}
        assert data['p_workspace_id'] == WS
        if path.endswith('aqari_official_document_register'):
            self.gets += 1
            if self.revoke_after is not None and self.gets >= self.revoke_after: raise PermissionError('ACCESS_DENIED')
            return copy.deepcopy(self.document)
        if path.endswith('aqari_official_pdf_get'):
            assert data['p_document_id'] == DOC and data['p_version'] == 1
            value = copy.deepcopy(self.artifact)
            if value:
                value['document_status'] = self.document['series']['status']
                if self.wrong_readback: value.update(self.wrong_readback)
            return value
        raise AssertionError(path)
    def commit(self, data):
        assert data['p_actor_id'] == ACTOR
        self.commits += 1
        if self.reject_commit: raise RuntimeError('PDF_ARCHIVE_NOT_CONFIGURED')
        self.artifact = {
            'workspace_id':data['p_workspace_id'], 'series_id':data['p_document_id'], 'version':data['p_version'],
            'snapshot_sha256':data['p_snapshot_sha256'], 'pdf_base64':data['p_pdf_base64'],
            'pdf_sha256':data['p_pdf_sha256'], 'renderer_version':data['p_renderer_version'], 'document_status':'issued'}
        if self.lost_reply: raise TimeoutError('lost acknowledgement')
        return {'archived': True}
    def export(self, **kwargs):
        return api.export_archive(REQUEST, AUTH, self.read, self.commit, **kwargs)

class OfficialDocumentArchiveTest(unittest.TestCase):
    def test_real_pdf_persisted_then_exact_bytes_read_without_rerender(self):
        t = Transport()
        first, status = t.export()
        self.assertTrue(first.startswith(b'%PDF-'))
        self.assertEqual(status, 'issued')
        self.assertEqual(first, base64.b64decode(t.artifact['pdf_base64']))
        def upgraded_renderer(*args): raise AssertionError('immutable bytes must not be regenerated')
        self.assertEqual(t.export(render=upgraded_renderer)[0], first)
        self.assertEqual(t.commits, 1)

    def test_lost_reply_after_persistence_recovers_by_readback(self):
        t = Transport(); t.lost_reply = True
        pdf, _ = t.export()
        self.assertEqual(hashlib.sha256(pdf).hexdigest(), t.artifact['pdf_sha256'])
        self.assertEqual(t.commits, 1)

    def test_failed_persistence_never_returns_unarchived_render(self):
        t = Transport(); t.reject_commit = True
        with self.assertRaisesRegex(RuntimeError, 'NOT_CONFIGURED'): t.export()
        self.assertEqual(t.artifact, {})
        t.reject_commit = False
        self.assertTrue(t.export()[0].startswith(b'%PDF-'))

    def test_success_acknowledgement_without_persistence_is_rejected(self):
        t = Transport()
        with self.assertRaisesRegex(ValueError, 'WRITE_NOT_CONFIRMED'):
            api.export_pdf(REQUEST, AUTH, t.read, lambda _: {'archived': True})

    def test_wrong_workspace_document_version_and_snapshot_are_rejected(self):
        for key, value in [('workspace_id','foreign'),('series_id','foreign'),('version',2),('version',True),('snapshot_sha256','b'*64)]:
            with self.subTest(key=key, value=value):
                t = Transport(); t.export(); t.wrong_readback = {key:value}
                with self.assertRaisesRegex(ValueError, 'SCOPE_MISMATCH'): t.export()

    def test_corrupt_stored_bytes_or_hash_rejected(self):
        for update in [{'pdf_base64':'invalid!'}, {'pdf_base64':base64.b64encode(b'%PDF-1.7 tampered').decode()}, {'pdf_sha256':'b'*64}]:
            with self.subTest(update=update):
                t = Transport(); t.export(); t.wrong_readback = update
                with self.assertRaises(ValueError): t.export()

    def test_revocation_before_read_and_after_read_blocks_download(self):
        for at in (1, 2):
            t = Transport(); t.revoke_after = at
            with self.assertRaises(PermissionError): t.export()

    def test_void_status_keeps_original_bytes_and_is_returned_separately(self):
        t = Transport(); original, _ = t.export()
        t.document['series'].update(status='void', void_reason='إلغاء موثق')
        result, status = t.export()
        self.assertEqual(result, original); self.assertEqual(status, 'void')
        self.assertEqual(t.commits, 1)

    def test_void_without_archived_original_does_not_fabricate_one(self):
        t = Transport(); t.document['series']['status'] = 'void'
        with self.assertRaisesRegex(ValueError, 'ORIGINAL_UNAVAILABLE'): t.export()
        self.assertEqual(t.commits, 0)

    def test_void_during_export_requires_fresh_request(self):
        t = Transport()
        def commit_and_void(data):
            t.commit(data); t.document['series']['status'] = 'void'
        with self.assertRaisesRegex(ValueError, 'CHANGED_DURING_EXPORT'):
            api.export_pdf(REQUEST, AUTH, t.read, commit_and_void)

    def test_invalid_render_or_oversized_render_cannot_be_committed(self):
        for pdf in (b'bad data', b'%PDF-' + b'A' * api.PDF_LIMIT):
            t = Transport()
            with self.assertRaisesRegex(ValueError, 'INVALID_RENDERED'): t.export(render=lambda *_: pdf)
            self.assertEqual(t.commits, 0)

    def test_invalid_request_and_auth_rejected_without_transport(self):
        t = Transport()
        for request in ({**REQUEST, 'amount':100}, {**REQUEST, 'version':True}, {**REQUEST, 'workspaceId':'bad'}):
            with self.assertRaises(ValueError): api.export_pdf(request, AUTH, t.read, t.commit)
        with self.assertRaises(PermissionError): api.export_pdf(REQUEST, None, t.read, t.commit)
        self.assertEqual(t.gets, 0)

    def test_missing_cross_project_and_non_service_credentials_fail_before_network(self):
        url, _ = api.config()
        user_claims = base64.urlsafe_b64encode(b'{"role":"authenticated","ref":"ofgmcsmxmdswlovsckqs"}').decode().rstrip('=')
        for env in ({}, {'AQARI_PDF_ARCHIVE_SERVICE_KEY':'sb_secret_fixture','AQARI_PDF_ARCHIVE_SUPABASE_URL':'https://wrong.supabase.co'},
                    {'AQARI_PDF_ARCHIVE_SERVICE_KEY':'a.'+user_claims+'.c','AQARI_PDF_ARCHIVE_SUPABASE_URL':url}):
            with self.subTest(env=list(env)), patch.dict(api.os.environ, env, clear=True), patch.object(api, 'build_opener') as network:
                with self.assertRaisesRegex(RuntimeError, 'NOT_CONFIGURED'): api.commit_archive({})
                network.assert_not_called()

if __name__ == '__main__': unittest.main()
