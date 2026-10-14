import unittest
from copy import deepcopy
from io import BytesIO
from pypdf import PdfReader
from lib.contract_print_pdf import prepare_print, SourceChanged
from lib.contract_template_pdf import render_contract_template

W='00000000-0000-4000-8000-000000000001'
U='00000000-0000-4000-8000-000000000002'
AUTH='Bearer test.test.test'
class PrintTests(unittest.TestCase):
    def setUp(self):
        self.request=dict(workspaceId=W,contractRef='qa-test',count=2,mode='official',expectedRevision=7)
        self.contract=dict(id='qa-test',source='v267-cloud',status='approved',contract_no='QA-NONBINDING',property='عقار تجريبي',unit='QA-TEST',tenant='مستأجر مصطنع',contractRent=100,rent=80,deposit=0,advance=0,cleaningFee=0,contractTemplate=dict(kind='custom',kind_label='عقد تجريبي',title='اختبار غير رسمي',fields=[],clauses=[dict(title='Synthetic clause',text='TEST ONLY - ORIGINAL RENT 100 - NO LEGAL EFFECT')]),templateFieldValues={})
        self.context=dict(workspace_id=W,user_id=U,can_publish=True)
        self.state=dict(workspace_id=W,revision=7,payload=dict(contractsV202=[self.contract]))
        self.calls=[];self.after=None;self.reads=0
    def read(self,path,auth,body=None):
        self.assertEqual(auth,AUTH);self.calls.append((path,body))
        if path=='/auth/v1/user':return {'id':U}
        if path.endswith('aqari_rental_templates'):return deepcopy(self.context)
        self.assertTrue(path.endswith('aqari_read_state_v267'))
        self.reads+=1
        if self.reads==2 and self.after:self.after()
        return deepcopy(self.state)
    def make(self):return prepare_print(self.request,AUTH,read=self.read)
    def test_real_pdf_two_copies_and_original_clause(self):
        original=deepcopy(self.state);rendered=[]
        def render(template,values):
            rendered.append(deepcopy(template))
            return render_contract_template(template,values)
        pdf,count=prepare_print(self.request,AUTH,read=self.read,render=render);reader=PdfReader(BytesIO(pdf))
        self.assertEqual(count,len(reader.pages));self.assertEqual(count,6)
        text='\n'.join(p.extract_text() for p in reader.pages)
        self.assertEqual(text.count('TEST ONLY - ORIGINAL RENT 100'),2)
        self.assertIn('نسخة المستأجر',rendered[0]['title']);self.assertIn('نسخة المالك',rendered[3]['title'])
        for index in [0,2,3,5]:
            self.assertIn('QA-NONBINDING',rendered[index]['title'])
            self.assertIn('الإيجار الأصلي: 100',rendered[index]['clauses'][0]['text'])
            self.assertNotIn('الإيجار الأصلي: 80',rendered[index]['clauses'][0]['text'])
        self.assertEqual(self.state,original);self.assertEqual(self.reads,2)
        self.assertTrue(all('read_state' in p or 'rental_templates' in p or p=='/auth/v1/user' for p,_ in self.calls))
    def test_authorization_and_status_guards(self):
        for key,value in [('workspace_id',U),('user_id',W),('can_publish',False)]:
            original=self.context[key];self.context[key]=value
            with self.assertRaises(PermissionError):self.make()
            self.context[key]=original
        for status in ['draft','ready','cancelled','unknown']:
            self.contract['status']=status
            with self.assertRaises(PermissionError):self.make()
    def test_missing_duplicate_and_imported(self):
        for records in [[],[self.contract,self.contract],[{**self.contract,'source':'statement-import'}]]:
            self.state['payload']['contractsV202']=records
            with self.assertRaises(PermissionError):self.make()
    def test_stale_revision_and_during_render_change(self):
        self.state['revision']=8
        with self.assertRaises(SourceChanged):self.make()
        self.state['revision']=7;self.reads=0;self.after=lambda:self.contract.update(contractRent=200)
        with self.assertRaises(SourceChanged):self.make()
    def test_every_draft_page_is_marked(self):
        self.request['mode']='draft';self.contract['status']='draft'
        pdf,count=self.make()
        for page in PdfReader(BytesIO(pdf)).pages:self.assertIn('DRAFT - NOT FOR SIGNATURE',page.extract_text())
    def test_invalid_request_and_renderer_are_rejected(self):
        for field,value in [('workspaceId','bad'),('count',True),('count',3),('mode','signed'),('expectedRevision',-1)]:
            req={**self.request,field:value}
            with self.assertRaises(ValueError):prepare_print(req,AUTH,read=self.read)
        with self.assertRaises(ValueError):prepare_print({**self.request,'html':'untrusted'},AUTH,read=self.read)
        with self.assertRaises(ValueError):prepare_print(self.request,AUTH,read=self.read,render=lambda *args:b'<html>bad</html>')
        with self.assertRaises(PermissionError):prepare_print(self.request,None,read=self.read)
if __name__=='__main__':unittest.main()
