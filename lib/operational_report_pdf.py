"""Render server-verified AQARI operational reports. Input is a trusted RPC readback."""
from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from lib.rent_pdf import FONT, FONT_PATH, shaped


def _p(style, value):
    return Paragraph(escape(shaped('غير مدون' if value is None else str(value))), style)


def render_operational_report(kind, report, property_name, month):
    if kind not in {'collection','collectors'} or not isinstance(report, dict):
        raise ValueError('INVALID_REPORT')
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))
    out=BytesIO(); title=('كشف التحصيل الفعلي' if kind=='collection' else 'تقرير أداء موظفي التحصيل')
    doc=SimpleDocTemplate(out,pagesize=landscape(A3),rightMargin=24,leftMargin=24,topMargin=24,bottomMargin=24,title=f'{title} {month}',author='AQARI V267')
    style=ParagraphStyle('ar-operational',fontName=FONT,fontSize=8,leading=12,alignment=2)
    story=[_p(style,f'{title} — {property_name} — {month}'),Spacer(1,10)]
    if kind=='collection':
        summaries=report.get('properties') or []
        summary=summaries[0] if summaries else None
        if summary:
            story.extend([_p(style,'المطلوب: {} د.ك • المدفوع المحتسب: {} د.ك • المتبقي: {} د.ك • نسبة التحصيل: {}'.format(summary.get('due'),summary.get('allocated_paid'),summary.get('remaining'),('غير منطبق' if summary.get('collection_rate_pct') is None else str(summary.get('collection_rate_pct'))+'%'))),Spacer(1,8)])
        headers=['الحالة','الزيادة','المتبقي','المدفوع المحتسب','المطلوب','الوحدة','العقد','العقار']
        data=[[_p(style,h) for h in headers]]
        for r in report.get('lines') or []:
            data.append([_p(style,x) for x in [r.get('status'),r.get('overpayment'),r.get('remaining'),r.get('allocated_paid'),r.get('due'),r.get('unit_no'),r.get('contract_no'),r.get('property_name')]])
    else:
        headers=['التصنيف','الحالة','المبلغ','الوحدة','العقد','الوصل','التاريخ','المحصل']
        data=[[_p(style,h) for h in headers]]
        for r in report.get('lines') or []:
            data.append([_p(style,x) for x in [('تسوية' if r.get('is_settlement') else 'تحصيل عادي'),r.get('mapping_status'),r.get('amount'),r.get('unit_no'),r.get('contract_no'),r.get('receipt_no'),r.get('paid_at'),r.get('collector_name')]])
    table=Table(data,repeatRows=1,hAlign='RIGHT')
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#E8DDBD')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#B8B3A5')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
    story.extend([table,Spacer(1,10),_p(style,'تم إنشاء الملف من إعادة قراءة خادمية محكومة. لا تعتمد المنصة صفوف الشاشة كمرجع للتصدير.')])
    doc.build(story)
    return out.getvalue()
