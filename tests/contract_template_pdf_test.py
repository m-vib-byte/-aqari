import unittest
from lib.contract_template_pdf import render_contract_template

class ContractTemplatePdfTest(unittest.TestCase):
    def template(self):
        return {'id':'76610000-0000-4000-8000-000000000099','revision':1,'kind':'custom-shop','kind_label':'عقد محل خاص','title':'نموذج محل للاختبار','fields':[{'key':'tenant_name','label':'اسم المستأجر','type':'text','required':True}],'clauses':[{'title':'البند الأول','text':'يقر {{tenant_name}} بأن هذا نص اختبار.'}]}

    def test_preview_is_a_real_pdf_and_is_not_an_approval(self):
        result=render_contract_template(self.template())
        self.assertTrue(result.startswith(b'%PDF-'))
        self.assertGreater(len(result),1000)

    def test_empty_or_unknown_shapes_are_rejected(self):
        for value in [{}, {'title':'x','kind_label':'x','clauses':[]}, {**self.template(),'approved':True}]:
            with self.assertRaises(ValueError):render_contract_template(value)

if __name__=='__main__':unittest.main()
