import unittest
from lib.official_document_pdf import verified_version, render_official_document, FONT_PATH

DOC='10000000-0000-4000-8000-000000000001'; WS='10000000-0000-4000-8000-000000000002'
def fixture():
    return {'series':{'id':DOC,'workspace_id':WS,'document_no':'TEST-001','status':'issued'},'versions':[{'id':'10000000-0000-4000-8000-000000000003','version':1,'title':'وصل اختبار','body':'هذا مستند عربي محفوظ للاختبار','payload':{'amount':'100.000'},'content_sha256':'a'*64,'issued_at':'2026-09-12T00:00:00Z','issued_by_name':'مدير الاختبار'}]}

class OfficialDocumentPdfTest(unittest.TestCase):
    @unittest.skipUnless(FONT_PATH.exists(),'repository font fixture is required')
    def test_verified_snapshot_renders_pdf(self):
        series,version=verified_version(fixture(),DOC,1); data=render_official_document(series,version)
        self.assertTrue(data.startswith(b'%PDF-')); self.assertGreater(len(data),1000)
    def test_wrong_document_or_version_is_rejected(self):
        with self.assertRaises(ValueError): verified_version(fixture(),'20000000-0000-4000-8000-000000000001',1)
        with self.assertRaises(ValueError): verified_version(fixture(),DOC,2)
    def test_missing_hash_is_rejected(self):
        data=fixture();data['versions'][0]['content_sha256']=''
        with self.assertRaises(ValueError): verified_version(data,DOC,1)

if __name__=='__main__': unittest.main()
