import unittest
from io import BytesIO
from pypdf import PdfReader
from lib.contract_template_pdf import render_contract_template, render_document_template

class ContractTemplatePdfTest(unittest.TestCase):
    def test_clause_heading_stays_with_first_body_line_at_page_boundary(self):
        for filler_count in (35, 36):
            with self.subTest(filler_count=filler_count):
                template = self.template()
                template.update(title='Pagination test', kind_label='Test', fields=[])
                template['clauses'] = [
                    {'title': 'Intro', 'text': '\n'.join(['Filler line'] * filler_count)},
                    {'title': 'CLAUSE HEADING', 'text': 'CLAUSE BODY first line'},
                ]
                pages = [page.extract_text() for page in PdfReader(BytesIO(render_contract_template(template))).pages]
                heading_page = next(index for index, text in enumerate(pages) if 'CLAUSE HEADING' in text)
                body_page = next(index for index, text in enumerate(pages) if 'CLAUSE BODY first line' in text)
                self.assertEqual(heading_page, body_page)
                self.assertEqual(sum(text.count('CLAUSE HEADING') for text in pages), 1)
                self.assertEqual(sum(text.count('CLAUSE BODY first line') for text in pages), 1)

    def template(self):
        return {'id':'76610000-0000-4000-8000-000000000099','revision':1,'kind':'custom-shop','kind_label':'عقد محل خاص','title':'نموذج محل للاختبار','fields':[{'key':'tenant_name','label':'اسم المستأجر','type':'text','required':True}],'clauses':[{'title':'البند الأول','text':'يقر {{tenant_name}} بأن هذا نص اختبار.'}]}

    def test_preview_is_a_real_pdf_and_is_not_an_approval(self):
        result=render_contract_template(self.template())
        self.assertTrue(result.startswith(b'%PDF-'))
        self.assertGreater(len(result),1000)

    def test_empty_or_unknown_shapes_are_rejected(self):
        for value in [{}, {'title':'x','kind_label':'x','clauses':[]}, {**self.template(),'approved':True}]:
            with self.assertRaises(ValueError):render_contract_template(value)


    def test_blank_model_uses_labels_and_rejects_unknown_generic_or_malformed_tokens(self):
        template=self.template()
        resolved=render_document_template(template)
        self.assertIn('«اسم المستأجر»',resolved['clauses'][0]['text'])
        self.assertNotIn('{{',resolved['clauses'][0]['text'])
        for token in ['{{field_name}}','{{missing_key}}','{{ tenant_name }}','{{tenant_name}', '{(field_name}}']:
            template['clauses'][0]['text']=token
            with self.assertRaises(ValueError):render_document_template(template)

    def test_required_values_zero_dates_and_inserted_data_are_validated(self):
        with self.assertRaises(ValueError):render_document_template(self.template(),{})
        with self.assertRaises(ValueError):render_document_template(self.template(),{'tenant_name':'{{owner_name}}'})
        result=render_document_template(self.template(),{'tenant_name':'اسم {ملاحظة}'})
        self.assertIn('اسم {ملاحظة}',result['clauses'][0]['text'])
        for field in [{'key':'tenant_name','label':'duplicate','type':'text','required':True},{'key':'field_name','label':'generic','type':'text','required':True}]:
            template=self.template();template['fields'].append(field)
            with self.assertRaises(ValueError):render_document_template(template)

    def test_signature_and_fingerprint_marks_are_never_generated(self):
        template=self.template();template['kind']='owner_final_clearance'
        result=render_document_template(template,{'tenant_name':'المستأجر','owner_name':'المالك','representative_name':'الوكيل','owner_signature':'forged mark','tenant_fingerprint':'forged mark'})
        self.assertEqual(result['signatures'][0],{'role':'owner','label':'وكيل المالك المفوض','name':'الوكيل'})
        self.assertFalse(any('forged' in str(s) for s in result['signatures']))

    def test_bound_fields_reject_non_scalar_values_before_string_conversion(self):
        template=self.template()
        template['fields']=[{'key':'property_name','label':'Property','type':'text','required':True}]
        template['clauses'][0]['text']='Property: {{property_name}}'
        for value in [True, False, [], ['Tower'], {}, {'name':'Tower'}]:
            with self.subTest(value=value):
                with self.assertRaisesRegex(ValueError, 'INVALID_FIELD_VALUE'):
                    render_document_template(template, {'property_name':value})
        for value, expected in [('Tower', 'Tower'), (0, '0'), (12.5, '12.5')]:
            with self.subTest(value=value):
                result=render_document_template(template, {'property_name':value})
                self.assertEqual(result['clauses'][0]['text'], 'Property: '+expected)

    def test_employment_preview_uses_employment_parties(self):
        template=self.template()
        template['kind']='employment_contract'
        result=render_document_template(template)
        self.assertEqual([s['label'] for s in result['signatures']], ['صاحب العمل','الموظف'])
        result=render_document_template(template, {'tenant_name':'legacy','employee_name':'Employee','employer_name':'Employer','representative_name':'Landlord agent'})
        self.assertEqual([s['name'] for s in result['signatures']], ['Employer','Employee'])
        self.assertTrue(render_contract_template(template).startswith(b'%PDF-'))

if __name__=='__main__':unittest.main()
