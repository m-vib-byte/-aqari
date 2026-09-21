import copy
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess
import unittest
from unittest.mock import patch
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.pdfgen.textobject import PDFTextObject
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from lib.contract_template_pdf import render_contract_template, render_document_template, sanitized_logo
from lib.rental_document_layout import normalize_presentation
from tests.contract_template_preview_test import fixture, api, W, AUTH

ROOT=Path(__file__).resolve().parents[1]


def presentation(language='bilingual'):
    return {'version':1,'paper':'A4','language':language,'logo':{'enabled':False,'source':'property'},'signers':{role:{'name':True,'signature':True,'fingerprint':True} for role in ['owner','tenant']},'placements':[]}


def placement(key='tenant_name',ident='test-field',page=1):
    return {'id':ident,'field_key':key,'page':page,'x_mm':20,'y_mm':70,'width_mm':90,'height_mm':18,'font_pt':10,'language':'bilingual'}


class RentalDocumentLayoutTest(unittest.TestCase):
    def test_typography_is_optional_and_rejects_unsafe_or_ambiguous_values(self):
        legacy=presentation();before=copy.deepcopy(legacy)
        self.assertEqual(normalize_presentation(legacy),legacy)
        self.assertEqual(legacy,before)
        typography={'font_pt':12.0,'line_height':1.85,'alignment':'start','margin_mm':18.0}
        formatted={**legacy,'typography':typography}
        normalized=normalize_presentation(formatted)
        self.assertEqual(normalized['typography'],{'font_pt':12,'line_height':1.85,'alignment':'start','margin_mm':18})
        self.assertEqual(formatted['typography'],typography)
        for invalid in [None, {}, {**typography,'unknown':1}, {**typography,'font_pt':9}, {**typography,'font_pt':19}, {**typography,'font_pt':True}, {**typography,'font_pt':'12'}, {**typography,'line_height':float('nan')}, {**typography,'line_height':float('inf')}, {**typography,'line_height':1.19}, {**typography,'line_height':2.21}, {**typography,'alignment':'left'}, {**typography,'alignment':{}}, {**typography,'margin_mm':11}, {**typography,'margin_mm':26}]:
            with self.subTest(invalid=invalid):
                with self.assertRaisesRegex(ValueError,'INVALID_DOCUMENT_TYPOGRAPHY'):
                    normalize_presentation({**legacy,'typography':invalid})

    def test_explicit_typography_has_browser_digest_parity_without_changing_legal_text(self):
        template=fixture()['template'];template['presentation']=presentation('en')
        template['presentation']['typography']={'font_pt':14.0,'line_height':1.8,'alignment':'justify','margin_mm':22.5}
        before=copy.deepcopy(template)
        values={'tenant_name':'Test Tenant','civil_id':'123456789012','owner_name':'Test Owner','monthly_rent':'350.125','deposit_amount':'0','contract_start_date':'2026-09-01'}
        resolved=render_document_template(template,values)
        script="""import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderDocumentTemplate,rentalDocumentDigestPayload} from './src/v267/domain/rental-document-cycle.js';const f=JSON.parse(fs.readFileSync(0,'utf8'));const r=renderDocumentTemplate(f.template,f.values);process.stdout.write(JSON.stringify({presentation:r.presentation,digest:createHash('sha256').update(JSON.stringify(rentalDocumentDigestPayload(f.template,r))).digest('hex')}));"""
        browser=json.loads(subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'template':template,'values':values}),capture_output=True,text=True,check=True).stdout)
        self.assertEqual(browser['presentation'],resolved['presentation'])
        self.assertEqual(browser['digest'],api.document_digest(resolved))
        self.assertEqual(template,before)
        unformatted=copy.deepcopy(template);del unformatted['presentation']['typography']
        self.assertEqual(resolved['clauses'],render_document_template(unformatted,values)['clauses'])
        self.assertNotEqual(api.document_digest(resolved),api.document_digest(render_document_template(unformatted,values)))

    def test_explicit_font_leading_margin_and_direction_are_drawn_in_pdf(self):
        template=fixture()['template'];template['clauses']=[{'title':'Heading','text':'FORMAT_FIRST_LINE\nFORMAT_SECOND_LINE'}]
        for language,alignment,method,expected_x in [('en','start','drawString',25*mm),('en','end','drawRightString',A4[0]-25*mm),('ar','start','drawRightString',A4[0]-25*mm),('ar','end','drawString',25*mm),('bilingual','center','drawCentredString',A4[0]/2)]:
            with self.subTest(language=language,alignment=alignment):
                template['presentation']=presentation(language)
                template['presentation']['typography']={'font_pt':17,'line_height':1.9,'alignment':alignment,'margin_mm':25}
                drawn=[];real=getattr(canvas.Canvas,method)
                def track(pdf,x,y,text,*args,**kwargs):
                    if text.startswith('FORMAT_'):drawn.append((x,y,pdf._fontsize,text))
                    return real(pdf,x,y,text,*args,**kwargs)
                with patch.object(canvas.Canvas,method,track):
                    result=render_contract_template(template)
                self.assertTrue(result.startswith(b'%PDF-'))
                self.assertEqual([line[3] for line in drawn],['FORMAT_FIRST_LINE','FORMAT_SECOND_LINE'])
                self.assertTrue(all(abs(line[0]-expected_x)<.00001 and line[2]==17 for line in drawn))
                self.assertAlmostEqual(drawn[0][1]-drawn[1][1],17*1.9)

    def test_justification_stretches_wrapped_lines_but_not_paragraph_endings(self):
        template=fixture()['template'];template['presentation']=presentation('en')
        template['presentation']['typography']={'font_pt':14,'line_height':1.6,'alignment':'justify','margin_mm':18}
        template['clauses']=[{'title':'Heading','text':('A full justified paragraph with all words retained. '*18)+'\nPARAGRAPH_END'}]
        spaces=[];ends=[];set_space=PDFTextObject.setWordSpace;draw_string=canvas.Canvas.drawString
        def track_space(obj,value):
            spaces.append(value);return set_space(obj,value)
        def track_end(pdf,x,y,text,*args,**kwargs):
            if text=='PARAGRAPH_END':ends.append((x,pdf._fontsize))
            return draw_string(pdf,x,y,text,*args,**kwargs)
        with patch.object(PDFTextObject,'setWordSpace',track_space),patch.object(canvas.Canvas,'drawString',track_end):
            first=render_contract_template(template)
        self.assertTrue(any(value>0 for value in spaces))
        self.assertEqual(ends,[(18*mm,14)])
        self.assertEqual(first,render_contract_template(template))

    def test_large_typography_keeps_all_36_original_clauses_inside_page_margins(self):
        template=fixture()['template'];template['presentation']=presentation('en')
        template['presentation']['signers']={r:dict.fromkeys(['name','signature','fingerprint'],False) for r in ['owner','tenant']}
        template['presentation']['typography']={'font_pt':18,'line_height':2.2,'alignment':'start','margin_mm':25}
        original='\n'.join('CLAUSE_%02d '%i+'Unchanged original legal text. '*12 for i in range(1,37))
        template['clauses']=[{'title':'Heading','text':original}]
        drawn=[];real=canvas.Canvas.drawString
        def track(pdf,x,y,text,*args,**kwargs):
            drawn.append((x,y,text));return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawString',track):result=render_contract_template(template)
        self.assertGreater(len(re.findall(rb'/Type\s*/Page\b',result)),3)
        self.assertTrue(all(x==25*mm and y>=25*mm for x,y,_ in drawn))
        for index in range(1,37):self.assertTrue(any('CLAUSE_%02d'%index in text for _,_,text in drawn),index)
        self.assertEqual(render_document_template(template)['clauses'][0]['text'],original)

    def test_layout_digest_exact_browser_parity_including_languages_flags_and_float_positions(self):
        template=fixture()['template'];template['presentation']=presentation('en')
        template['presentation']['placements']=[{**placement(), 'x_mm':20.0,'y_mm':75.5}]
        template['presentation']['signers']['owner']['name']=False
        values={'tenant_name':'Test Tenant','civil_id':'123456789012','owner_name':'Test Owner','monthly_rent':'350.125','deposit_amount':'0','contract_start_date':'2026-09-01'}
        resolved=render_document_template(template,values)
        script="""import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderDocumentTemplate,rentalDocumentDigestPayload} from './src/v267/domain/rental-document-cycle.js';const f=JSON.parse(fs.readFileSync(0,'utf8'));const r=renderDocumentTemplate(f.template,f.values);process.stdout.write(JSON.stringify({presentation:r.presentation,digest:createHash('sha256').update(JSON.stringify(rentalDocumentDigestPayload(f.template,r))).digest('hex')}));"""
        browser=json.loads(subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'template':template,'values':values}),capture_output=True,text=True,check=True).stdout)
        self.assertEqual(browser['presentation'],resolved['presentation'])
        self.assertEqual(browser['digest'],api.document_digest(resolved))
        self.assertEqual(resolved['signatures'][0]['name'],'')
        template['presentation']['placements']=[placement('owner_name')]
        self.assertTrue(render_contract_template(template,values).startswith(b'%PDF-'))

    def test_original_36_paragraphs_in_single_clause_are_all_drawn_on_a4_pages(self):
        template=fixture()['template'];template['presentation']=presentation()
        original='\n\n'.join('CLAUSE_%02d '%i+'نص اختبار أصلي محفوظ كاملًا دون تغيير أو اقتطاع. '*9 for i in range(1,37))
        template['clauses']=[{'title':'أصل طويل للاختبار','text':original}]
        self.assertEqual(render_document_template(template)['clauses'][0]['text'],original)
        drawn=[];real=canvas.Canvas.drawRightString
        def track(pdf,x,y,text,*args,**kwargs):
            drawn.append((y,text));return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawRightString',track):
            pdf=render_contract_template(template)
        page_count=len(re.findall(rb'/Type\s*/Page\b',pdf))
        self.assertGreaterEqual(page_count,3)
        self.assertEqual(len(re.findall(rb'/MediaBox \[ 0 0 595\.2756 841\.8898 \]',pdf)),page_count)
        for index in range(1,37):self.assertTrue(any('CLAUSE_%02d'%index in text for _,text in drawn),index)
        self.assertTrue(all(y>20 for y,_ in drawn))

    def test_pdf_identical_on_repeat_and_absolute_page_placements_change_hash(self):
        template=fixture()['template'];template['presentation']=presentation()
        a=render_contract_template(template);b=render_contract_template(copy.deepcopy(template))
        self.assertEqual(a,b)
        template['presentation']['placements']=[placement(page=3)]
        placed=render_contract_template(template)
        self.assertEqual(len(re.findall(rb'/Type\s*/Page\b',placed)),3)
        self.assertNotEqual(a,placed)
        self.assertEqual(placed,render_contract_template(template))

    def test_overflow_overlap_and_external_logo_inputs_rejected(self):
        template=fixture()['template'];template['presentation']=presentation()
        for delta in [{'x_mm':200},{'page':51},{'font_pt':37},{'language':'unknown'},{'id':'a'*65}]:
            template['presentation']['placements']=[{**placement(),**delta}]
            with self.assertRaises(ValueError):render_contract_template(template)
        template['presentation']['placements']=[{**placement(),'height_mm':4,'width_mm':8,'font_pt':20}]
        with self.assertRaisesRegex(ValueError,'LAYOUT_FIELD_OVERFLOW'):render_contract_template(template)
        template['presentation']['placements']=[placement(),placement(ident='second')]
        with self.assertRaisesRegex(ValueError,'LAYOUT_FIELDS_OVERLAP'):render_contract_template(template)
        template['presentation']['placements']=[]
        template['presentation']['logo']['url']='https://untrusted.invalid/logo.png'
        with self.assertRaises(ValueError):render_contract_template(template)
        for invalid in [b'<svg xmlns="http://www.w3.org/2000/svg"/>',b'not-an-image',b'x'*(2*1024*1024+1)]:
            with self.assertRaises(ValueError):sanitized_logo(invalid)

    def test_both_parties_and_blank_signatures_are_independent(self):
        template=fixture()['template'];template['kind']='apartment_handover'
        before=copy.deepcopy(template)
        self.assertEqual([s['role'] for s in render_document_template(template)['signatures']],['owner','tenant'])
        self.assertEqual(template,before)
        template['presentation']=presentation()
        self.assertEqual([s['role'] for s in render_document_template(template)['signatures']],['owner','tenant'])
        template['presentation']['signers']['owner']['fingerprint']=False
        pdf=render_contract_template(template)
        self.assertTrue(pdf.startswith(b'%PDF-'))
        template['presentation']['placements']=[placement('owner_fingerprint')]
        with self.assertRaisesRegex(ValueError,'LAYOUT_DISABLED_SIGNER'):render_contract_template(template)

    def test_property_logo_must_be_same_scope_and_raster_hash_changes_pdf(self):
        f=fixture();f['master']['property']['assets']={'logo':'76610000-0000-4000-8000-000000000010'}
        logo=BytesIO();Image.new('RGB',(120,80),'#b59968').save(logo,format='PNG');raw=logo.getvalue()
        row={'workspace_id':W,'id':f['master']['property']['assets']['logo'],'status':'uploaded','entity_type':'property','entity_ref':f['property_row']['id'],'mime_type':'image/png','size_bytes':len(raw),'checksum_sha256':'a'*64}
        read=lambda path,auth:[row]
        safe,snapshot=api.load_property_logo(W,f['property_row'],f['master'],AUTH,read,lambda row,auth:raw)
        self.assertEqual(snapshot['id'],row['id'])
        template=f['template'];template['presentation']=presentation();template['presentation']['logo']['enabled']=True
        self.assertNotEqual(render_contract_template(template),render_contract_template(template,logo_bytes=safe))
        self.assertEqual(render_contract_template(template,logo_bytes=safe),render_contract_template(template,logo_bytes=safe))
        row['entity_ref']='foreign-property'
        with self.assertRaises(PermissionError):api.load_property_logo(W,f['property_row'],f['master'],AUTH,read,lambda row,auth:raw)

    def test_bound_final_pdf_has_neutral_status_without_changing_after_approval(self):
        f=fixture();f['template']['presentation']=presentation('en')
        values={'tenant_name':'Test Tenant','civil_id':'123456789012','owner_name':'Test Owner','monthly_rent':'350.125','deposit_amount':'0','contract_start_date':'2026-09-01'}
        drawn=[];real=canvas.Canvas.drawCentredString
        def track(pdf,x,y,text,*args,**kwargs):
            drawn.append(text);return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawCentredString',track):
            render_contract_template(f['template'],values)
        self.assertFalse(any('Unapproved preview' in text for text in drawn))
        self.assertTrue(any('A4' in text for text in drawn))

    def test_canonical_issue_helper_reproduces_verified_preview_bytes(self):
        f=fixture();f['template']['presentation']=presentation()
        source={'template':f['template'],'contract':f['payload']['contractsV202'][0],'lease':f['lease'],'tenant':f['tenant'],'property_row':f['property_row'],'unit_row':f['unit'],'property':f['master']['property'],'unit':f['master']['unit'],'receipt':None}
        first=api.render_source_preview(source,{},W,AUTH)
        second=api.render_source_preview(copy.deepcopy(source),{},W,AUTH)
        self.assertEqual(first['pdf'],second['pdf']);self.assertEqual(first['digest'],second['digest'])
        self.assertIn('350.125',first['resolved']['clauses'][0]['text'])
        self.assertEqual(first['logo_snapshot'],None)


if __name__=='__main__':unittest.main()
