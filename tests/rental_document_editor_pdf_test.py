import copy
import hashlib
import json
from io import BytesIO
from pathlib import Path
import re
import subprocess
import unittest
from unittest.mock import patch
from PIL import Image
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from lib.contract_template_pdf import render_contract_template,render_document_template,sanitized_logo
from lib.rental_document_editor import normalize_editor,source_index
from lib.rental_document_layout import normalize_presentation
from tests.rental_document_layout_test import presentation
from tests.contract_template_preview_test import fixture,api,W,AUTH

ROOT=Path(__file__).resolve().parents[1]


def template(text='FIRST_MARK\nSECOND_MARK'):
    result=fixture()['template'];result['presentation']=presentation('en')
    result['presentation']['signers']={role:dict.fromkeys(['name','signature','fingerprint'],False) for role in ['owner','tenant']}
    result['presentation']['editor']={'version':1}
    result['clauses']=[{'title':'Heading','text':text}]
    return result


def page_count(pdf):return len(re.findall(rb'/Type\s*/Page\b',pdf))


class RentalDocumentEditorPdfTest(unittest.TestCase):
    def test_legacy_pdf_bytes_and_absent_metadata_are_unchanged(self):
        original=fixture()['template']
        self.assertEqual(hashlib.sha256(render_contract_template(original)).hexdigest(),'ac84b812537d778b0891c948eac913190450fa54c0ad68f7c87c3ca7d73f6d5a')
        original['presentation']=presentation()
        self.assertEqual(hashlib.sha256(render_contract_template(original)).hexdigest(),'0f4e246f58f879108419ddb57df5f7f5f2e2079482e0a4727349151fbfe2227c')
        self.assertNotIn('editor',normalize_presentation(original['presentation']))

    def test_utf16_offsets_protect_emoji_and_whole_field_tokens_without_mutation(self):
        raw='أ 😀 {{tenant_name}} نهاية';clauses=[{'title':'Heading','text':raw}]
        start=len('أ 😀 '.encode('utf-16-le'))//2;end=start+len('{{tenant_name}}')
        editor={'version':1,'style':{},'ranges':[{'clause':0,'part':'text','start':start,'end':end,'style':{'bold':True}}],'page_breaks':[{'clause':0,'offset':end}]}
        before=copy.deepcopy(editor)
        self.assertEqual(normalize_editor(editor,clauses),before)
        self.assertEqual(editor,before)
        self.assertEqual(source_index(raw,4),3)
        for offset in [3,start+1,end-1,1000]:
            with self.assertRaises(ValueError):normalize_editor({'version':1,'page_breaks':[{'clause':0,'offset':offset}]},clauses)
        for invalid in [ {'version':1,'style':{'font_family':'https://remote.invalid/font.ttf'}}, {'version':1,'style':{'bold':1}}, {'version':1,'ranges':[{**editor['ranges'][0],'style':{}}]}, {'version':1,'ranges':editor['ranges']*2}, {'version':1,'page_breaks':[{'clause':0,'offset':2},{'clause':0,'offset':1}]}, {'version':1,'logo':{'x_mm':190,'y_mm':8,'width_mm':30,'height_mm':24,'repeat':'all'}}, {'version':1,'signers':{'order':['tenant','tenant'],'details':{}}} ]:
            with self.assertRaises(ValueError):normalize_editor(invalid,clauses)

    def test_editor_metadata_and_extra_signer_values_have_exact_js_digest_parity(self):
        value=template('A 😀 {{tenant_name}} B')
        value['presentation']['editor']={'version':1,'style':{'font_family':'mono','bold':True,'direction':'rtl','paragraph_gap_mm':2.5},'ranges':[{'clause':0,'part':'text','start':5,'end':20,'style':{'font_pt':16.0,'underline':True}}],'page_breaks':[{'clause':0,'offset':20}],'trailing_blank_pages':1,'logo':{'x_mm':18,'y_mm':9,'width_mm':30,'height_mm':20,'repeat':'all'},'signers':{'order':['tenant','owner'],'details':{'owner':{'civil_id':True,'nationality':True},'tenant':{'civil_id':True,'nationality':True}}}}
        values={'tenant_name':'Test Tenant','civil_id':'123456789012','owner_name':'Test Owner','monthly_rent':'350.125','deposit_amount':'0','contract_start_date':'2026-09-01','representative_name':'Authorized Agent','representative_civil_id':'111111111111','representative_nationality':'Kuwaiti','nationality':'Test nationality'}
        resolved=render_document_template(value,values)
        script="""import fs from 'node:fs';import {createHash} from 'node:crypto';import {renderDocumentTemplate,rentalDocumentDigestPayload} from './src/v267/domain/rental-document-cycle.js';const f=JSON.parse(fs.readFileSync(0,'utf8'));const r=renderDocumentTemplate(f.template,f.values);process.stdout.write(JSON.stringify({presentation:r.presentation,digest:createHash('sha256').update(JSON.stringify(rentalDocumentDigestPayload(f.template,r))).digest('hex')}));"""
        browser=json.loads(subprocess.run(['node','--input-type=module','-e',script],cwd=ROOT,input=json.dumps({'template':value,'values':values}),capture_output=True,text=True,check=True).stdout)
        self.assertEqual(browser['presentation'],resolved['presentation'])
        self.assertEqual(browser['digest'],api.document_digest(resolved))
        self.assertEqual([s['role'] for s in resolved['signatures']],['tenant','owner'])
        self.assertEqual(resolved['values']['tenant_civil_id'],'123456789012')
        self.assertEqual(resolved['values']['representative_nationality'],'Kuwaiti')

    def test_selected_range_bold_font_size_and_underline_are_rendered(self):
        value=template('PLAIN BOLD UNDERLINED')
        value['presentation']['editor']={'version':1,'ranges':[{'clause':0,'part':'text','start':6,'end':10,'style':{'font_family':'mono','font_pt':18,'bold':True}},{'clause':0,'part':'text','start':11,'end':21,'style':{'underline':True}}]}
        drawn=[];underlines=[];real_draw=canvas.Canvas.drawString;real_line=canvas.Canvas.line
        def draw(pdf,x,y,text,*args,**kwargs):drawn.append((text,pdf._fontname,pdf._fontsize));return real_draw(pdf,x,y,text,*args,**kwargs)
        def line(pdf,*args,**kwargs):underlines.append(args);return real_line(pdf,*args,**kwargs)
        before=copy.deepcopy(value)
        with patch.object(canvas.Canvas,'drawString',draw),patch.object(canvas.Canvas,'line',line):pdf=render_contract_template(value)
        self.assertIn(('BOLD','AqariMonoBold',18),drawn)
        self.assertTrue(underlines)
        self.assertEqual(value,before)
        self.assertEqual(pdf,render_contract_template(value))

    def test_manual_page_break_and_adjacent_boundary_do_not_duplicate_blank_pages(self):
        value=template('FIRST_MARKSECOND_MARK');value['clauses'].append({'title':'Next','text':'THIRD_MARK'})
        value['presentation']['editor']={'version':1,'page_breaks':[{'clause':0,'offset':10},{'clause':0,'offset':21},{'clause':1,'offset':0}],'trailing_blank_pages':1}
        drawn=[];real=canvas.Canvas.drawString
        def draw(pdf,x,y,text,*args,**kwargs):drawn.append((pdf.getPageNumber(),text));return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawString',draw):pdf=render_contract_template(value)
        self.assertIn((1,'FIRST_MARK'),drawn);self.assertIn((2,'SECOND_MARK'),drawn);self.assertIn((3,'THIRD_MARK'),drawn)
        self.assertEqual(page_count(pdf),4)

    def test_logo_position_and_repeat_apply_to_the_exact_generated_pages(self):
        value=template('FIRST_MARKSECOND_MARK');value['presentation']['logo']['enabled']=True
        value['presentation']['editor']={'version':1,'page_breaks':[{'clause':0,'offset':10}],'trailing_blank_pages':1,'logo':{'x_mm':20,'y_mm':8,'width_mm':45,'height_mm':18,'repeat':'all'}}
        logo=BytesIO();Image.new('RGB',(300,120),'#bb9955').save(logo,format='WEBP');raw=logo.getvalue()
        placements=[];real=canvas.Canvas.drawImage
        def draw(pdf,image,x,y,*args,**kwargs):placements.append((pdf.getPageNumber(),x,y,kwargs['width'],kwargs['height']));return real(pdf,image,x,y,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawImage',draw):pdf=render_contract_template(value,logo_bytes=raw)
        self.assertEqual([x[0] for x in placements],list(range(1,page_count(pdf)+1)))
        self.assertTrue(all(x[1]==20*mm and x[3]==45*mm and x[4]==18*mm for x in placements))
        value['presentation']['editor']['logo']['repeat']='first';placements.clear()
        with patch.object(canvas.Canvas,'drawImage',draw):render_contract_template(value,logo_bytes=raw)
        self.assertEqual(len(placements),1)
        value['presentation']['logo']['enabled']=False;placements.clear()
        with patch.object(canvas.Canvas,'drawImage',draw):render_contract_template(value,logo_bytes=raw)
        self.assertEqual(placements,[])

    def test_long_arabic_source_keeps_all_36_clauses_and_body_inside_margins(self):
        original='\n\n'.join('CLAUSE_%02d '%index+'هذا نص أصلي محفوظ دون حذف أو تغيير. '*7 for index in range(1,37))
        value=template(original);value['presentation']['language']='ar'
        value['presentation']['typography']={'font_pt':16,'line_height':1.8,'alignment':'start','margin_mm':22}
        value['presentation']['editor']={'version':1,'style':{'font_family':'mono','bold':True,'paragraph_gap_mm':2,'direction':'rtl'}}
        drawn=[];real=canvas.Canvas.drawString
        def draw(pdf,x,y,text,*args,**kwargs):
            if pdf._fontsize==16:drawn.append((x,y,text))
            return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawString',draw):pdf=render_contract_template(value)
        for index in range(1,37):self.assertTrue(any('CLAUSE_%02d'%index in text for _,_,text in drawn),index)
        self.assertGreater(page_count(pdf),3)
        self.assertTrue(all(x>=22*mm-.001 and y>=22*mm for x,y,_ in drawn))
        self.assertEqual(value['clauses'][0]['text'],original)

    def test_canonical_source_preview_reproduces_rich_pdf_bytes_and_preserves_snapshot(self):
        f=fixture();f['template']['presentation']=presentation('ar')
        f['template']['presentation']['editor']={'version':1,'style':{'font_family':'mono','bold':True,'clause_after_mm':6},'trailing_blank_pages':1,'signers':{'order':['tenant','owner'],'details':{'tenant':{'civil_id':True,'nationality':True}}}}
        source={'template':f['template'],'contract':f['payload']['contractsV202'][0],'lease':f['lease'],'tenant':f['tenant'],'property_row':f['property_row'],'unit_row':f['unit'],'property':f['master']['property'],'unit':f['master']['unit'],'receipt':None}
        original=copy.deepcopy(source)
        first=api.render_source_preview(source,{},W,AUTH)
        second=api.render_source_preview(copy.deepcopy(source),{},W,AUTH)
        self.assertEqual(first['pdf'],second['pdf']);self.assertEqual(first['digest'],second['digest'])
        self.assertEqual(first['pdf'],render_contract_template(f['template'],first['values']))
        self.assertEqual(source,original)

    def test_positioned_signer_identity_is_rendered_once_and_requires_enabled_flag(self):
        value=template('Body');value['fields']=[]
        value['presentation']['signers']['tenant']['name']=True
        value['presentation']['editor']={'version':1,'signers':{'order':['tenant'],'details':{'tenant':{'civil_id':True,'nationality':True}}}}
        value['presentation']['placements']=[{'id':'tenant-id','field_key':'tenant_civil_id','page':2,'x_mm':20,'y_mm':20,'width_mm':150,'height_mm':18,'font_pt':10,'language':'en'}]
        values={'tenant_name':'Named Tenant','tenant_civil_id':'444444444444','tenant_nationality':'Kuwaiti'}
        drawn=[];real=canvas.Canvas.drawString
        def draw(pdf,x,y,text,*args,**kwargs):drawn.append((pdf.getPageNumber(),text));return real(pdf,x,y,text,*args,**kwargs)
        with patch.object(canvas.Canvas,'drawString',draw):render_contract_template(value,values)
        ids=[item for item in drawn if '444444444444' in item[1]]
        self.assertEqual(len(ids),1);self.assertEqual(ids[0][0],2)
        self.assertTrue(any('Kuwaiti' in text for _,text in drawn))
        value['presentation']['editor']['signers']['details']['tenant']['civil_id']=False
        with self.assertRaisesRegex(ValueError,'LAYOUT_DISABLED_SIGNER'):render_contract_template(value,values)

    def test_preview_response_counts_the_captured_pdf_and_writes_identical_bytes(self):
        value=template('FIRST_MARKSECOND_MARK')
        value['presentation']['editor']={'version':1,'page_breaks':[{'clause':0,'offset':10}],'trailing_blank_pages':2}
        pdf=render_contract_template(value);self.assertEqual(api.generated_pdf_page_count(pdf),4)
        response=object.__new__(api.handler);headers={};response.wfile=BytesIO()
        response.send_response=lambda status:self.assertEqual(status,200)
        response.send_header=lambda key,value:headers.__setitem__(key,value)
        response.end_headers=lambda:None
        response.respond(200,pdf,'application/pdf','test-digest')
        self.assertEqual(headers['X-Aqari-PDF-Pages'],'4')
        self.assertEqual(headers['X-Aqari-PDF-SHA256'],hashlib.sha256(pdf).hexdigest())
        self.assertEqual(response.wfile.getvalue(),pdf)
        with self.assertRaises(ValueError):api.generated_pdf_page_count(pdf.replace(b'/Count 4 /Kids',b'/Count 5 /Kids'))
        # Counting a pre-existing artifact must not introduce the new editor's
        # page limit into legacy preview responses.
        references=b' '.join(str(index).encode()+b' 0 R' for index in range(1,52))
        legacy_tree=b'52 0 obj\n<<\n/Count 51 /Kids [ '+references+b' ] /Type /Pages\n>>\nendobj'
        self.assertEqual(api.generated_pdf_page_count(legacy_tree),51)

    def test_webp_sanitization_retains_pixel_caps_and_rejects_animation_or_mime_mismatch(self):
        out=BytesIO();Image.new('RGBA',(60,40),'#bb995580').save(out,format='WEBP');raw=out.getvalue()
        self.assertTrue(sanitized_logo(raw,'image/webp').startswith(b'\x89PNG'))
        with self.assertRaises(ValueError):sanitized_logo(raw,'image/png')
        out=BytesIO();Image.new('RGB',(4097,1)).save(out,format='PNG')
        with self.assertRaises(ValueError):sanitized_logo(out.getvalue())
        out=BytesIO();Image.new('RGB',(3000,3000)).save(out,format='PNG')
        with self.assertRaises(ValueError):sanitized_logo(out.getvalue())
        out=BytesIO();Image.new('RGB',(40,40),'red').save(out,format='WEBP',save_all=True,append_images=[Image.new('RGB',(40,40),'blue')],duration=100,loop=0)
        with self.assertRaises(ValueError):sanitized_logo(out.getvalue())

    def test_logo_storage_scope_category_and_mime_are_fail_closed(self):
        f=fixture();ident='76610000-0000-4000-8000-000000000010';f['master']['property']['assets']={'logo':ident}
        logo=BytesIO();Image.new('RGB',(20,20)).save(logo,format='PNG');raw=logo.getvalue()
        row={'id':ident,'workspace_id':W,'status':'uploaded','entity_type':'property','entity_ref':f['property_row']['id'],'document_type':'supporting_document','metadata':{'category':'property_logo'},'mime_type':'image/png','size_bytes':len(raw),'checksum_sha256':hashlib.sha256(raw).hexdigest(),'storage_bucket':'aqari-documents','storage_path':W+'/logo.png'}
        for changes in [{'id':'other'},{'document_type':'signed_contract'},{'metadata':{'category':'property_photo'}},{'metadata':{'category':'property_logo','asset_role':'property_photo'}},{'entity_ref':'other'}]:
            with self.assertRaises(PermissionError):api.load_property_logo(W,f['property_row'],f['master'],AUTH,lambda p,a:[{**row,**changes}],lambda r,a:raw)
        with self.assertRaises(ValueError):api.load_property_logo(W,f['property_row'],f['master'],AUTH,lambda p,a:[{**row,'mime_type':'image/webp'}],lambda r,a:raw)
        for changes in [{'storage_path':'other-workspace/logo.png'},{'storage_bucket':None},{'storage_path':W+'/../logo.png'}]:
            with self.assertRaises(ValueError):api.storage_logo_bytes({**row,**changes},AUTH)


if __name__=='__main__':unittest.main()
