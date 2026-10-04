import copy
import hashlib
import importlib.util
import json
import unittest
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from pypdf import PdfReader,PdfWriter
from reportlab.pdfgen import canvas
from lib.pdf_field_template import *

W='76610000-0000-4000-8000-000000000001'
P='76610000-0000-4000-8000-000000000002'
D='76610000-0000-4000-8000-000000000003'
spec=importlib.util.spec_from_file_location('pdf_field_api',Path(__file__).parents[1]/'api/pdf-field-template.py');api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)

def original():
    b=BytesIO();c=canvas.Canvas(b,pagesize=(595,842));c.drawString(20,800,'ORIGINAL TERMS');c.showPage();c.drawString(20,800,'SECOND PAGE');c.showPage();c.save();return b.getvalue()
def mapping():
    return {'version':1,'title':'Test template','propertyId':P,'fields':[{'id':'tenant','label':'اسم المستأجر','type':'text','page':1,'x':.1,'y':.12,'width':.6,'height':.04,'fontSize':12,'align':'right'},{'id':'date','label':'تاريخ العقد','type':'date','page':2,'x':.1,'y':.2,'width':.3,'height':.04,'fontSize':12,'align':'left'}]}
class PdfFieldsTest(unittest.TestCase):
    def test_position_lock_roundtrips_and_does_not_change_printed_content(self):
        m=mapping();m['fields'][0]['locked']=True;m['fields'][1]['locked']=False
        valid=validate_map(m,page_sizes(open_pdf(original())),P)
        saved=write_template(open_pdf(original()),valid);self.assertEqual(saved_map(open_pdf(saved),P),m)
        values={'tenant':'LOCK TEST','date':'2026-10-04'}
        locked_pdf=fill_template(open_pdf(saved),m,values)
        unlocked=copy.deepcopy(m)
        for f in unlocked['fields']:f.pop('locked',None)
        plain_pdf=fill_template(open_pdf(original()),unlocked,values)
        for n in [1,2]:self.assertEqual(render_page(open_pdf(locked_pdf),n),render_page(open_pdf(plain_pdf),n))
        for bad in [None,1,0,'true',{},[]]:
            invalid=copy.deepcopy(m);invalid['fields'][0]['locked']=bad
            with self.assertRaisesRegex(ValueError,'INVALID_FIELD'):validate_map(invalid,page_sizes(open_pdf(original())),P)
    def test_linked_fields_roundtrip_and_conflicts(self):
        m=mapping();m['fields'][0]['dataKey']='tenant_name'
        second=copy.deepcopy(m['fields'][0]);second.update(id='tenant_copy',page=2,y=.4);m['fields'].append(second)
        m=validate_map(m,page_sizes(open_pdf(original())),P)
        saved=write_template(open_pdf(original()),m);self.assertEqual(saved_map(open_pdf(saved),P),m)
        values={'tenant':'LINKED VALUE','tenant_copy':'LINKED VALUE','date':'2026-10-04'}
        filled=PdfReader(BytesIO(fill_template(open_pdf(saved),m,values)))
        for page in filled.pages:self.assertIn('LINKED VALUE',page.extract_text())
        values['tenant_copy']='DIFFERENT'
        with self.assertRaisesRegex(ValueError,'FIELD_LINK_CONFLICT'):fill_template(open_pdf(saved),m,values)
        for key in [None,'','bad key',42,'x'*65]:
            bad=copy.deepcopy(m);bad['fields'][0]['dataKey']=key
            with self.assertRaisesRegex(ValueError,'INVALID_FIELD'):validate_map(bad,page_sizes(open_pdf(original())),P)
        bad=copy.deepcopy(m);bad['fields'][-1]['type']='date'
        with self.assertRaisesRegex(ValueError,'INVALID_FIELD'):validate_map(bad,page_sizes(open_pdf(original())),P)
    def test_roundtrip_preserves_every_page_and_original_terms(self):
        raw=original();reader=open_pdf(raw);m=validate_map(mapping(),page_sizes(reader),P);saved=write_template(reader,m);r=open_pdf(saved)
        self.assertEqual(saved_map(r,P),m);self.assertEqual(len(r.pages),2)
        for n in [1,2]:self.assertEqual(render_page(open_pdf(raw),n),render_page(open_pdf(saved),n))
        filled=fill_template(r,m,{'tenant':'مستأجر تجريبي','date':'2026-10-03'});result=PdfReader(BytesIO(filled))
        self.assertEqual(len(result.pages),2);self.assertIn('ORIGINAL TERMS',result.pages[0].extract_text());self.assertIn('SECOND PAGE',result.pages[1].extract_text());self.assertIn('2026-10-03',result.pages[1].extract_text());self.assertNotIn(MAP_KEY,result.metadata)
        self.assertTrue(render_page(open_pdf(filled),1).startswith(b'\x89PNG'))
    def test_field_colors_and_font_sizes_survive_template_and_pdf_rendering(self):
        from PIL import Image
        m=mapping();m['fields'][0].update(color='#ff0000',fontSize=24,height=.08)
        valid=validate_map(m,page_sizes(open_pdf(original())),P)
        raw=write_template(open_pdf(original()),valid)
        self.assertEqual(saved_map(open_pdf(raw),P)['fields'][0]['color'],'#ff0000')
        filled=fill_template(open_pdf(raw),valid,{'tenant':'COLOR TEST','date':'2026-10-03'})
        image=Image.open(BytesIO(render_page(open_pdf(filled),1))).convert('RGB')
        self.assertGreater(sum(r>180 and g<80 and b<80 for r,g,b in image.getdata()),100)
        legacy=mapping();self.assertEqual(validate_map(legacy,page_sizes(open_pdf(original())),P),legacy)
        for color in [None,'red','#fff','#zz0000','url(x)',123]:
            bad=mapping();bad['fields'][0]['color']=color
            with self.assertRaisesRegex(ValueError,'INVALID_FIELD'):validate_map(bad,page_sizes(open_pdf(original())),P)
        m['fields'][0]['fontSize']=48;validate_map(m,page_sizes(open_pdf(original())),P)
    def test_rotated_cropped_template_keeps_field_coordinates_on_reopen(self):
        source=PdfReader(BytesIO(original()));writer=PdfWriter()
        p=writer.add_page(source.pages[0]);p.cropbox=RectangleObject([30,40,560,800]);p.rotate(90)
        raw=BytesIO();writer.write(raw);reader=open_pdf(raw.getvalue())
        self.assertEqual(page_sizes(reader),[{'width':760.0,'height':530.0}])
        m=mapping();m['fields']=m['fields'][:1]
        saved=write_template(reader,validate_map(m,page_sizes(reader),P))
        self.assertEqual(render_page(open_pdf(raw.getvalue()),1),render_page(open_pdf(saved),1))
        result=fill_template(open_pdf(saved),m,{'tenant':'Test tenant'})
        self.assertIn('Test tenant',PdfReader(BytesIO(result)).pages[0].extract_text())
    def test_existing_form_is_not_rewritten(self):
        from pypdf.generic import DictionaryObject,NameObject
        writer=PdfWriter();p=writer.add_blank_page(width=595,height=842)
        writer.add_annotation(0,DictionaryObject({NameObject('/Subtype'):NameObject('/Widget'),NameObject('/Rect'):RectangleObject([0,0,50,20])}))
        raw=BytesIO();writer.write(raw)
        with self.assertRaisesRegex(ValueError,'PDF_EXISTING_FORM'):open_pdf(raw.getvalue())
    def test_invalid_maps_rejected(self):
        for mutate in [lambda m:m.update(propertyId=W),lambda m:m['fields'][0].update(x=float('nan')),lambda m:m['fields'][0].update(page=3),lambda m:m['fields'][0].update(width=2),lambda m:m['fields'].append(copy.deepcopy(m['fields'][0])),lambda m:m.update(fields=[])]:
            m=mapping();mutate(m)
            with self.assertRaises(ValueError):validate_map(m,page_sizes(open_pdf(original())),P)
        m=mapping();m['fields'][1].update(page=1,x=.15,y=.12)
        with self.assertRaisesRegex(ValueError,'FIELD_OVERLAP'):validate_map(m,page_sizes(open_pdf(original())),P)
    def test_no_silent_truncation_or_missing_values(self):
        for values in [{'tenant':'','date':'2026-10-03'},{'tenant':'X'*1000,'date':'2026-10-03'},{'tenant':'Name','date':'2026-99-03'},{'tenant':'Name'}]:
            with self.assertRaises(ValueError):fill_template(open_pdf(original()),mapping(),values)
    def test_scope_and_role_checked_before_storage(self):
        row={'id':D,'workspace_id':W,'status':'uploaded','entity_type':'property','entity_ref':'property-ref','document_type':'property_document','metadata':{'category':'property_other','asset_role':'property_contract','property_id':P}}
        def read(path,auth):
            return [{'id':P,'workspace_id':W,'external_ref':'property-ref'}] if '/aqari_properties?' in path else [row]
        calls=[]
        def storage(row,auth):calls.append('storage');return original()
        ctx={'workspace_id':W,'can_publish':True,'user_id':'manager'}
        rpc=lambda *args:ctx
        data={'workspaceId':W,'propertyId':P,'documentId':D,'action':'inspect'}
        body,mime=api.process(data,'Bearer test.token',rpc,read,storage);self.assertEqual(len(json.loads(body)['pages']),2);self.assertEqual(calls,['storage'])
        for key,value in [('workspace_id',P),('entity_ref','other-property'),('status','pending')]:
            old=row[key];row[key]=value;calls.clear()
            with self.assertRaises(PermissionError):api.process(data,'Bearer test.token',rpc,read,storage)
            self.assertEqual(calls,[]);row[key]=old
        ctx['can_publish']=False;calls.clear()
        with self.assertRaises(PermissionError):api.process(data,'Bearer test.token',rpc,read,storage)
        self.assertEqual(calls,[])
    def test_fill_uses_saved_map_and_session_is_rechecked(self):
        raw=write_template(open_pdf(original()),mapping())
        def read(path,auth):return [{'id':P,'workspace_id':W,'external_ref':'p'}] if '/aqari_properties?' in path else [{'id':D,'workspace_id':W,'status':'uploaded','entity_type':'property','entity_ref':'p','document_type':'property_document','metadata':{'category':'property_other','asset_role':'property_contract','property_id':P}}]
        calls=[]
        def rpc(*args):calls.append(1);return {'workspace_id':W,'can_publish':True,'user_id':'a' if len(calls)==1 else 'b'}
        with self.assertRaises(PermissionError):api.process({'workspaceId':W,'propertyId':P,'documentId':D,'action':'fill','values':{'tenant':'Test','date':'2026-10-03'}},'Bearer test.token',rpc,read,lambda *a:raw)
    def test_filled_page_matches_downloaded_pdf_on_every_page_and_obeys_scope(self):
        raw=write_template(open_pdf(original()),mapping())
        row={'id':D,'workspace_id':W,'status':'uploaded','entity_type':'property','entity_ref':'p','document_type':'property_document','metadata':{'category':'property_other','asset_role':'property_contract','property_id':P}}
        def read(path,auth):return [{'id':P,'workspace_id':W,'external_ref':'p'}] if '/aqari_properties?' in path else [row]
        ctx={'workspace_id':W,'can_publish':True,'user_id':'manager'}
        data={'workspaceId':W,'propertyId':P,'documentId':D,'action':'fill','values':{'tenant':'مستأجر تجريبي','date':'2026-10-03'}}
        def call(data):return api.process(data,'Bearer test.token',lambda *a:ctx,read,lambda *a:raw)
        pdf,_=call(data)
        for page in [1,2]:
            png,mime=call(dict(data,action='filled_page',page=page))
            self.assertEqual(mime,'image/png')
            self.assertEqual(png,render_page(open_pdf(pdf),page))
            self.assertNotEqual(png,render_page(open_pdf(raw),page))
        for page in [0,3,True,'1']:
            with self.assertRaisesRegex(ValueError,'INVALID_FIELD_PAGE'):call(dict(data,action='filled_page',page=page))
        ctx['can_publish']=False
        with self.assertRaises(PermissionError):call(dict(data,action='filled_page',page=1))
        ctx['can_publish']=True;row['metadata']['property_id']=W
        with self.assertRaises(PermissionError):call(dict(data,action='filled_page',page=1))
    def test_text_extraction_obeys_page_and_manager_scope(self):
        row={'id':D,'workspace_id':W,'status':'uploaded','entity_type':'property','entity_ref':'p','document_type':'property_document','metadata':{'category':'property_other','asset_role':'property_contract','property_id':P}}
        def read(path,auth):return [{'id':P,'workspace_id':W,'external_ref':'p'}] if '/aqari_properties?' in path else [row]
        ctx={'workspace_id':W,'can_publish':True,'user_id':'manager'}
        data={'workspaceId':W,'propertyId':P,'documentId':D,'action':'text','page':2}
        result,mime=api.process(data,'Bearer test.token',lambda *a:ctx,read,lambda *a:original())
        self.assertEqual(json.loads(result)['text'].strip(),'SECOND PAGE')
        for page in [0,3,True,'1']:
            with self.assertRaisesRegex(ValueError,'INVALID_FIELD_PAGE'):api.process(dict(data,page=page),'Bearer test.token',lambda *a:ctx,read,lambda *a:original())
        ctx['can_publish']=False
        with self.assertRaises(PermissionError):api.process(data,'Bearer test.token',lambda *a:ctx,read,lambda *a:original())
    def test_preview_is_high_resolution_without_changing_pdf_pages(self):
        from PIL import Image
        reader=open_pdf(original());image=Image.open(BytesIO(render_page(reader,1)))
        self.assertGreaterEqual(image.width,2399)
        self.assertLessEqual(image.height,3401)
        self.assertEqual(page_sizes(reader),[{'width':595.,'height':842.}]*2)
    def test_bad_storage_paths_rejected_before_network(self):
        for path in [W+'/../secret','other/file',W+'//file',W+'/a\\b']:
            with self.assertRaises(PermissionError):api.storage_pdf({'workspace_id':W,'storage_path':path},'Bearer test.token')
if __name__=='__main__':unittest.main()
