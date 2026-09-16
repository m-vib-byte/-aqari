"""Read-only export of a saved source register; never posts rent or invents paid amounts."""
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from lib.rent_pdf import FONT,FONT_PATH,shaped
from lib.property_statement_values import owner_approved_discount,statement_rent_totals

def statement_notes(content):
    """Only annotate evidence stored on this statement; never borrow another property's notes."""
    notes=[]
    if 'insurance_difference' in (content.get('pending') or []):
        notes.append('التأمين: يوجد فرق معلق بين تفاصيل المصدر وملخصه؛ لا تعتمد التسوية قبل توثيقها.')
    for row in content.get('rows',[]):
        pending=row.get('pending') or []
        prefix='الوحدة '+str(row.get('unit','غير مدون'))+': '
        if 'contract_dates' in pending:notes.append(prefix+'تواريخ العقد معلقة للمراجعة.')
        if 'payment_date' in pending:notes.append(prefix+'تاريخ الدفع معلق للمراجعة.')
    return notes

def render_statement(content):
    if FONT not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(FONT,str(FONT_PATH)))
    out=BytesIO();doc=SimpleDocTemplate(out,pagesize=landscape(A3),rightMargin=24,leftMargin=24,topMargin=24,bottomMargin=24,title='كشف إيجار '+content['property_name'],author='AQARI V267')
    style=ParagraphStyle('ar',fontName=FONT,fontSize=8,leading=12,alignment=2)
    def p(v):return Paragraph(escape(shaped('غير مدون' if v is None else str(v))),style)
    fields=[('المحاسب','accountant_raw'),('الوصل','receipt_no_raw'),('رقم العملية','payment_operation_raw'),('طريقة السداد','payment_method_raw'),('تاريخ الدفع','payment_date_raw'),('المدفوع بالمصدر','paid_amount_kd'),('الإيجار الحالي','current_rent_kd'),('خصم معتمد من المالك','__owner_discount'),('إيجار العقد','contract_rent_kd'),('العربون','advance_kd'),('التأمين','insurance_kd'),('رقم العقد','contract_no_raw'),('الجنسية بالمصدر','nationality_raw'),('اسم المستأجر بالمصدر','name_en_raw'),('الوحدة','unit')]
    data=[[p(title) for title,_ in fields]]
    for r in content['rows']:
        values=[]
        for _,key in fields:
            value=owner_approved_discount(r) if key=='__owner_discount' else r.get(key)
            if value is None:value='غير مدون'
            if key=='insurance_kd' and r.get('insurance_status')=='pending_reconciliation':value=str(value) + ' • معلق'
            if key=='payment_date_raw' and 'payment_date' in (r.get('pending') or []):value='معلق — '+str(value)
            if key=='contract_no_raw' and 'contract_dates' in (r.get('pending') or []):value=str(value)+' • التواريخ معلقة'
            values.append(p(value))
        data.append(values)
    widths=[60,46,66,58,88,58,58,66,58,56,66,58,60,205,48]
    table=Table(data,colWidths=widths,repeatRows=1,hAlign='RIGHT')
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8DDBD')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#B8B3A5')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    source_fields=[('صفحة الاتصال بالمصدر','contact_source_page'),('صفحة البيانات المالية بالمصدر','financial_source_page'),('الرقم المدني بالمصدر','civil_id_raw'),('الهاتف بالمصدر','phone_raw'),('نهاية العقد بالمصدر','contract_end_raw'),('بداية العقد بالمصدر','contract_start_raw'),('الوحدة','unit')]
    source_data=[[p(title) for title,_ in source_fields]]
    for r in content['rows']:
        values=[]
        pending=r.get('pending') or []
        for _,key in source_fields:
            value=r.get(key)
            if value is None or value=='':value='غير مدون'
            if key in ('contract_start_raw','contract_end_raw') and 'contract_dates' in pending:value='معلق — '+str(value)
            values.append(p(value))
        source_data.append(values)
    source_table=Table(source_data,colWidths=[100,115,125,105,105,105,55],repeatRows=1,hAlign='RIGHT')
    source_table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#F3EEDF')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#B8B3A5')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    summary=content['summary']['printed_totals'];rent_totals=statement_rent_totals(content.get('rows',[]))
    story=[p(content['property_name']+' — كشف إيجار '+content['period']),Spacer(1,12),p('نسخة من الكشف الأصلي المحفوظ. إيجار العقد والخصم المعتمد والإيجار الحالي تعرض كقيم منفصلة؛ المدفوع بالمصدر قراءة من الكشف المحفوظ ولا يستبدل التحصيل الفعلي المحمي؛ هذا الكشف لا ينشئ حركة مالية أو وصل إيجار جديداً.'),Spacer(1,12),table,Spacer(1,12),p('بيانات المصدر التكميلية — تواريخ العقد والهاتف والرقم المدني وأرقام صفحات المصدر أدناه قراءة فقط من نفس صفوف الكشف المحفوظ ولا تُستكمل بقيم افتراضية.'),Spacer(1,6),source_table,Spacer(1,12)]
    if rent_totals is None:
        story.append(p('مجاميع إيجار العقد والخصم المعتمد والإيجار الحالي غير مكتملة بالمصدر؛ لم تُفترض أي قيمة بديلة.'))
    else:
        story.append(p('إجمالي إيجار العقود: '+str(rent_totals['contract_rent_kd'])+' د.ك • إجمالي خصم المالك: '+str(rent_totals['owner_discount_kd'])+' د.ك • إجمالي الإيجار الحالي: '+str(rent_totals['current_rent_kd'])+' د.ك'))
    story.append(p('الإيجار الحالي المطبوع بالمصدر: '+str(summary['rent_kd'])+' د.ك • العربون: '+str(summary['advance_kd'])+' د.ك • النظافة: '+str(summary['cleaning_kd'])+' د.ك'))
    for note in statement_notes(content):story.append(p(note))
    doc.build(story);return out.getvalue()

def render_shaikhah_receipt(saved):
    """Only called after the existing saved-payment/active-contract verification."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from lib.rent_pdf import money
    if FONT not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(FONT,str(FONT_PATH)))
    out=BytesIO();pdf=canvas.Canvas(out,pagesize=A4,invariant=1);w,h=A4;left,right=32,w-32
    row,c=saved['record'],saved['contract']
    def text(v,y,size=11,x=right):
        pdf.setFont(FONT,size);value=shaped(v)
        while pdfmetrics.stringWidth(value,FONT,size)>w-64 and size>7:size-=.5
        pdf.setFont(FONT,size);pdf.drawRightString(x,y,value)
    def line(y):pdf.setStrokeColor(colors.HexColor('#B69C55'));pdf.line(left,y,right,y)
    pdf.setTitle('وصل إيجار — أبراج شيخة');pdf.setAuthor('AQARI V267')
    text('أبراج شيخة',h-55,24);text('SHAIKHAH TOWER',h-83,16)
    text('50721277 • 51119040 • 55521007 • 25640025',h-105,9);text('shaikhahtower@gmail.com',h-121,9);line(h-136)
    text('وصل إيجار / Rent Voucher',h-170,21)
    text('رقم الوصل: '+saved['id'],h-199,12);text('التاريخ: '+str(row[5]),h-222)
    amount=money(row[2]);text('المبلغ المستلم: '+f'{amount:.3f}'+' د.ك',h-248,15)
    y=h-279
    for title,value in [('وصلني من السيد / السادة',row[1]),('العقار والوحدة',str(row[4])+' — '+str(row[6])),('رقم العقد',c['contract_no']),('وذلك عن إيجار شهر',row[8]),('طريقة الدفع',row[9]),('البيان / مرجع العملية المحفوظ',row[7] or 'غير مدون')]:
        text(title+': '+str(value),y);y-=29
    line(y+8);y-=18
    for s in ['هذا الوصل لإثبات المبلغ المدفوع فقط، ولا يغيّر قيمة الإيجار المتفق عليها في العقد.','يعتبر الوصل لاغياً في حال عدم تحصيل الشيك؛ الإلغاء يخضع للسجل المالي الموثق.','تدفع الإيجارات بمدة أقصاها الخامس من كل شهر.']:
        text(s,y,9);y-=22
    y-=30;text('اسم المستلم: ____________________',y);text('اسم المحاسب: ____________________',y-28);text('توقيع المستلم: ____________________',y-65);text('توقيع المحاسب: ____________________',y-93)
    line(89);text('للشكاوى والاقتراحات: shaikhahtower@gmail.com',69,9)
    text('Salmiya - Block (10) - Street Essa Al-Qutami - Bldg. (28)',49,8);text('AQARI V267 • '+saved['id'],29,8)
    pdf.save();return out.getvalue()
