"""PDF-backed field maps. Original pages remain vector pages; no contract activation."""
from io import BytesIO
import json
import math
import re
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from lib.rent_pdf import FONT, FONT_PATH, shaped

MAP_KEY = '/AqariFieldTemplateV1'
MAX_PAGES = 30
MAX_FIELDS = 100
if FONT not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))


def open_pdf(raw):
    if not isinstance(raw, bytes) or not raw.startswith(b'%PDF-') or len(raw)>25*1024*1024:
        raise ValueError('INVALID_PDF')
    reader=PdfReader(BytesIO(raw))
    if reader.is_encrypted or not 1<=len(reader.pages)<=MAX_PAGES:
        raise ValueError('PDF_LIMIT')
    # A signed document or an existing form is not a blank reusable template.
    if reader.get_fields() or any(a.get_object().get('/Subtype')=='/Widget' for p in reader.pages for a in p.get('/Annots',[])):
        raise ValueError('PDF_EXISTING_FORM')
    normalized=PdfWriter()
    if (reader.metadata or {}).get(MAP_KEY) is not None:normalized.add_metadata({MAP_KEY:reader.metadata[MAP_KEY]})
    for source in reader.pages:
        p=normalized.add_page(source,excluded_keys=['/Annots','/AA'])
        p.transfer_rotation_to_content()
        box=p.cropbox
        left,bottom,w,h=float(box.left),float(box.bottom),float(box.width),float(box.height)
        if not all(math.isfinite(n) for n in [left,bottom,w,h]) or not 72<=w<=2000 or not 72<=h<=2000 or float(p.get('/UserUnit',1))!=1:
            raise ValueError('PDF_PAGE_SIZE')
        p.add_transformation(Transformation().translate(-left,-bottom))
        p.mediabox=RectangleObject([0,0,w,h]);p.cropbox=RectangleObject([0,0,w,h])
        p.pop('/Annots',None);p.pop('/AA',None)
    return normalized


def page_sizes(reader):
    return [{'width':float(p.mediabox.width),'height':float(p.mediabox.height)} for p in reader.pages]


def validate_map(value,sizes,property_id):
    if not isinstance(value,dict) or set(value)!={'version','title','propertyId','fields'} or value.get('version')!=1 or value.get('propertyId')!=property_id:
        raise ValueError('INVALID_FIELD_MAP')
    title=value.get('title')
    if not isinstance(title,str) or not 1<=len(title.strip())<=160:raise ValueError('TEMPLATE_TITLE_REQUIRED')
    fields=value.get('fields')
    if not isinstance(fields,list) or not 1<=len(fields)<=MAX_FIELDS:raise ValueError('FIELDS_REQUIRED')
    ids=set()
    for f in fields:
        if not isinstance(f,dict) or set(f)!={'id','label','type','page','x','y','width','height','fontSize','align'}:raise ValueError('INVALID_FIELD')
        if not isinstance(f['id'],str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',f['id']) or f['id'] in ids:raise ValueError('INVALID_FIELD')
        ids.add(f['id'])
        if not isinstance(f['label'],str) or not 1<=len(f['label'].strip())<=100 or f['type'] not in ['text','date','number','money'] or f['align'] not in ['right','left','center']:raise ValueError('INVALID_FIELD')
        if type(f['page']) is not int or not 1<=f['page']<=len(sizes):raise ValueError('INVALID_FIELD_PAGE')
        for k in ['x','y','width','height','fontSize']:
            if type(f[k]) not in [int,float] or not math.isfinite(f[k]):raise ValueError('INVALID_FIELD_POSITION')
        if not(0<=f['x']<1 and 0<=f['y']<1 and .01<=f['width']<=1 and .006<=f['height']<=1 and f['x']+f['width']<=1.000001 and f['y']+f['height']<=1.000001 and 6<=f['fontSize']<=30):raise ValueError('INVALID_FIELD_POSITION')
        for old in fields[:fields.index(f)]:
            if old['page']==f['page'] and min(old['x']+old['width'],f['x']+f['width'])-max(old['x'],f['x'])>0.00001 and min(old['y']+old['height'],f['y']+f['height'])-max(old['y'],f['y'])>0.00001:raise ValueError('FIELD_OVERLAP')
    return {'version':1,'title':title.strip(),'propertyId':property_id,'fields':fields}


def saved_map(reader,property_id):
    raw=(reader.metadata or {}).get(MAP_KEY)
    if raw is None:return None
    if not isinstance(raw,str) or len(raw)>100000:raise ValueError('INVALID_FIELD_MAP')
    return validate_map(json.loads(raw),page_sizes(reader),property_id)


def write_template(reader,mapping):
    writer=PdfWriter()
    for p in reader.pages:writer.add_page(p,excluded_keys=['/Annots','/AA'])
    writer.add_metadata({MAP_KEY:json.dumps(mapping,ensure_ascii=False,separators=(',',':')),'/Title':mapping['title']})
    out=BytesIO();writer.write(out);return out.getvalue()


def render_page(reader,page_number):
    import pypdfium2 as pdfium
    if type(page_number) is not int or not 1<=page_number<=len(reader.pages):raise ValueError('INVALID_FIELD_PAGE')
    writer=PdfWriter();writer.add_page(reader.pages[page_number-1],excluded_keys=['/Annots','/AA'])
    raw=BytesIO();writer.write(raw)
    pdf=pdfium.PdfDocument(raw.getvalue());page=pdf[0];bitmap=None
    try:
        w,h=page.get_size();bitmap=page.render(scale=min(2400/w,3400/h))
        image=bitmap.to_pil()
        try:
            while True:
                out=BytesIO();image.save(out,format='PNG')
                if len(out.getvalue())<=4*1024*1024:return out.getvalue()
                if image.width<800:raise ValueError('PDF_OUTPUT_LIMIT')
                resized=image.resize((int(image.width*.8),int(image.height*.8)))
                image.close();image=resized
        finally:image.close()
    finally:
        if bitmap:bitmap.close()
        page.close();pdf.close()


def fill_template(reader,mapping,values):
    fields=mapping['fields']
    if not isinstance(values,dict) or set(values)!={f['id'] for f in fields}:raise ValueError('FIELD_VALUES_REQUIRED')
    writer=reader
    for n,p in enumerate(reader.pages,1):
        width,height=float(p.mediabox.width),float(p.mediabox.height)
        buf=BytesIO();c=canvas.Canvas(buf,pagesize=(width,height))
        for f in [f for f in fields if f['page']==n]:
            value=values[f['id']]
            if not isinstance(value,str) or len(value)>1000 or any(ord(ch)<32 for ch in value):raise ValueError('INVALID_FIELD_VALUE')
            value=value.strip()
            if not value:raise ValueError('FIELD_VALUES_REQUIRED')
            if f['type']=='date':
                from datetime import date
                date.fromisoformat(value)
            if f['type'] in ['number','money'] and not re.fullmatch(r'-?[0-9٠-٩۰-۹]+(?:[.٫][0-9٠-٩۰-۹]{1,3})?',value):raise ValueError('INVALID_FIELD_VALUE')
            text=shaped(value) if re.search(r'[\u0600-\u06ff]',value) else value
            x,y,w,h=f['x']*width,f['y']*height,f['width']*width,f['height']*height
            size=min(f['fontSize'],h*.75)
            while size>=6 and pdfmetrics.stringWidth(text,FONT,size)>w-4:size-=.25
            if size<6:raise ValueError('FIELD_TEXT_TOO_LONG')
            c.setFont(FONT,size);c.setFillColorRGB(0,0,0)
            baseline=height-y-(h+size*.7)/2
            if f['align']=='right':c.drawRightString(x+w-2,baseline,text)
            elif f['align']=='center':c.drawCentredString(x+w/2,baseline,text)
            else:c.drawString(x+2,baseline,text)
        c.showPage();c.save();overlay=PdfReader(buf);p.merge_page(overlay.pages[0])
    writer.metadata=None
    writer.add_metadata({'/Title':mapping['title'],'/Subject':'Filled copy for review; no lease activation or payment recorded.'})
    out=BytesIO();writer.write(out);return out.getvalue()
