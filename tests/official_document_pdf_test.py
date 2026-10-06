import unittest
from lib.official_document_pdf import verified_version, render_official_document, FONT_PATH, CATALOG, shaped, issued_date
from io import BytesIO
from pypdf import PdfReader

DOC='10000000-0000-4000-8000-000000000001'; WS='10000000-0000-4000-8000-000000000002'
def fixture():
    return {'series':{'id':DOC,'workspace_id':WS,'document_no':'TEST-001','status':'issued'},'versions':[{'id':'10000000-0000-4000-8000-000000000003','version':1,'workspace_id':WS,'series_id':DOC,'title':'وصل اختبار','body':'هذا مستند عربي محفوظ للاختبار','payload':{'amount':'100.000'},'content_sha256':'a'*64,'issued_at':'2026-09-12T00:00:00Z','issued_by_name':'مدير الاختبار'}]}

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

    def test_invalid_scope_hash_and_boolean_version_are_rejected(self):
        for key,value in [('workspace_id','other-workspace'),('series_id','other-series'),('content_sha256','z'*64),('payload',[]),('body',{})]:
            with self.subTest(key=key):
                data=fixture();data['versions'][0][key]=value
                with self.assertRaises(ValueError): verified_version(data,DOC,1)
        with self.assertRaises(ValueError): verified_version(fixture(),DOC,True)

    def test_all_catalogue_forms_render_required_values_from_archived_payload(self):
        for kind,spec in CATALOG['templates'].items():
            with self.subTest(kind=kind):
                data=fixture();data['series']['kind']=kind
                version=data['versions'][0];version['title']=spec['title']
                version['payload']={key:'FIELD'+str(i)+'END' for i,key in enumerate(spec['required'])}
                version['body']='نص محفوظ';version['payload']['exceptionReason']='استثناء موثق TEST-EXCEPTION'
                pdf=PdfReader(BytesIO(render_official_document(data['series'],version)))
                # Layout extraction preserves the LRM-isolated Latin spans next
                # to Arabic; default bidi extraction drops those visible spans.
                text=''.join(page.extract_text(extraction_mode='layout') for page in pdf.pages).replace('\u200e','')
                for key,value in version['payload'].items():
                    if key not in ('documentNo','issuedAt','exceptionReason'):self.assertIn(value,text)
                self.assertIn('TEST-EXCEPTION',text)

    def test_rtl_preserves_dates_and_identifiers_and_uses_kuwait_issue_time(self):
        self.assertIn('2026-09-12',shaped('التاريخ 2026-09-12'))
        self.assertIn('AQ-20260912-00000001',shaped('الرقم AQ-20260912-00000001'))
        self.assertIn('-5.125',shaped('الرصيد -5.125'))
        self.assertEqual(issued_date('2026-09-12T08:45:00Z'),'2026/09/12 11:45')

    def test_rent_receipt_pdf_preserves_exact_three_decimal_archived_amounts(self):
        for amount in ['0.001','350.010','999999999999.999']:
            with self.subTest(amount=amount):
                data=fixture();data['series']['kind']='rent_receipt'
                version=data['versions'][0];spec=CATALOG['templates']['rent_receipt']
                version['title']=spec['title']
                version['payload']={key:'اختبار' for key in spec['required']}
                version['payload'].update(amount=amount,documentNo='AQ-RENT_RECEIPT-20261006-00000001',issuedAt='2026-10-06',period='2026-09',unitNo='101',contractNo='TEST-RENT-1')
                version['body']='وصل اختبار دقة الفلس'
                before=dict(version['payload'])
                pdf=PdfReader(BytesIO(render_official_document(data['series'],version)))
                text=''.join(page.extract_text(extraction_mode='layout') for page in pdf.pages).replace('\u200e','')
                self.assertIn(amount,text)
                self.assertEqual(version['payload'],before,'rendering must not round or alter archived values')

    def test_long_unbroken_reference_wraps_without_horizontal_clipping(self):
        data=fixture();data['versions'][0]['body']='A'*5000
        pdf=PdfReader(BytesIO(render_official_document(data['series'],data['versions'][0])))
        positions=[]
        for page in pdf.pages:
            page.extract_text(visitor_text=lambda text,cm,tm,font,size:positions.append((text,tm[4],size)))
        self.assertTrue(positions)
        self.assertGreater(len(pdf.pages),1)
        self.assertTrue(all(x>=40 for text,x,size in positions if 'AAAAA' in text))

if __name__=='__main__': unittest.main()
