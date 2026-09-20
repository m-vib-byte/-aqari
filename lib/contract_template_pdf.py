from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from lib.rent_pdf import FONT, FONT_PATH, shaped

if FONT not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))

def _text(value):
    return escape(shaped(str(value or '').strip())).replace('\n','<br/>')

def render_contract_template(template):
    if not isinstance(template,dict): raise ValueError('INVALID_TEMPLATE')
    allowed={'id','revision','kind','kind_label','title','fields','clauses'}
    if set(template)-allowed: raise ValueError('INVALID_TEMPLATE')
    title=template.get('title');kind=template.get('kind_label');clauses=template.get('clauses');fields=template.get('fields',[])
    if not isinstance(title,str) or not 1<=len(title.strip())<=200 or not isinstance(kind,str) or not 1<=len(kind.strip())<=80: raise ValueError('INVALID_TEMPLATE')
    if not isinstance(clauses,list) or not 1<=len(clauses)<=50 or not isinstance(fields,list) or len(fields)>50: raise ValueError('INVALID_TEMPLATE')
    out=BytesIO();doc=SimpleDocTemplate(out,pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=18*mm,bottomMargin=18*mm,title=title,author='AQARI')
    heading=ParagraphStyle('heading',fontName=FONT,fontSize=18,leading=28,alignment=TA_CENTER,textColor=colors.HexColor('#4b321f'),spaceAfter=8*mm)
    meta=ParagraphStyle('meta',fontName=FONT,fontSize=10,leading=17,alignment=TA_CENTER,textColor=colors.HexColor('#765b43'),spaceAfter=6*mm)
    clause_title=ParagraphStyle('clause-title',fontName=FONT,fontSize=12,leading=20,alignment=TA_RIGHT,textColor=colors.HexColor('#56391f'),spaceBefore=4*mm,spaceAfter=2*mm)
    body=ParagraphStyle('body',fontName=FONT,fontSize=10.5,leading=20,alignment=TA_RIGHT,textColor=colors.HexColor('#2f2924'),borderColor=colors.HexColor('#ded0bd'),borderWidth=.5,borderPadding=7,spaceAfter=3*mm)
    story=[Paragraph(_text(title),heading),Paragraph(_text(kind)+' — معاينة غير معتمدة',meta)]
    if fields:
        story.append(Paragraph(_text('الحقول المتغيرة: '+ '، '.join('{{'+str(v.get('key',''))+'}}' for v in fields)),meta))
    for index,clause in enumerate(clauses,1):
        if not isinstance(clause,dict) or set(clause)!={'title','text'} or not isinstance(clause['title'],str) or not isinstance(clause['text'],str) or not clause['title'].strip() or not clause['text'].strip(): raise ValueError('INVALID_TEMPLATE')
        story.extend([Paragraph(_text(str(index)+'. '+clause['title']),clause_title),Paragraph(_text(clause['text']),body)])
    story.extend([Spacer(1,8*mm),Paragraph(_text('هذه معاينة قبل الاعتماد ولا تعتبر عقدًا منشورًا أو مبرمًا.'),meta)])
    doc.build(story);return out.getvalue()
