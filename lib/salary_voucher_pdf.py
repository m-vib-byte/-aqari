"""Render an immutable AQARI salary-registry snapshot as a bilingual A4 PDF."""
from io import BytesIO
from pathlib import Path
import re

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

FONT = "AqariSalary"
FONT_PATH = Path(__file__).resolve().parent / "pdf_fonts" / "AqariSans.ttf"

def _font():
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))

def _ar(value):
    return get_display(arabic_reshaper.reshape(str(value or "—")), base_dir="R")

def _money(value):
    try: return f"{float(value or 0):,.3f}"
    except (TypeError, ValueError): raise ValueError("INVALID_SALARY_AMOUNT") from None

def _property(payload):
    rows=payload.get("property_details") or []
    if not isinstance(rows,list): raise ValueError("INVALID_PROPERTY_DETAILS")
    first=rows[0] if rows else {}
    metadata=first.get("metadata") if isinstance(first,dict) else {}
    if not isinstance(metadata,dict): metadata={}
    return {
        "name": first.get("name") or "AQARI",
        "address": metadata.get("address_ar") or metadata.get("address") or metadata.get("location") or "",
    }

def render_salary_voucher(payload, registry, verify_base="https://myaqari.com/api/salary-verify?token="):
    if not isinstance(payload,dict) or not isinstance(registry,dict): raise ValueError("INVALID_SALARY_PAYLOAD")
    employee=payload.get("employee") or {}; snapshot=payload.get("snapshot") or {}
    token=registry.get("verification_token")
    if not re.fullmatch(r"[0-9a-f-]{36}",str(token),re.I): raise ValueError("INVALID_VERIFICATION_TOKEN")
    _font(); out=BytesIO(); doc=SimpleDocTemplate(out,pagesize=A4,rightMargin=12*mm,leftMargin=12*mm,topMargin=10*mm,bottomMargin=10*mm,title="AQARI Salary Voucher")
    base=ParagraphStyle("base",fontName=FONT,fontSize=8.5,leading=11,textColor=colors.HexColor("#1f2937"))
    right=ParagraphStyle("right",parent=base,alignment=TA_RIGHT); center=ParagraphStyle("center",parent=base,alignment=TA_CENTER)
    left=ParagraphStyle("left",parent=base,alignment=TA_LEFT); heading=ParagraphStyle("heading",parent=center,fontSize=17,leading=21,textColor=colors.HexColor("#7a531b"))
    prop=_property(payload); voucher=registry.get("voucher_no") or payload.get("voucher_no") or payload.get("id")
    qr=QrCodeWidget(verify_base+str(token)); bounds=qr.getBounds(); drawing=Drawing(25*mm,25*mm,transform=[25*mm/(bounds[2]-bounds[0]),0,0,25*mm/(bounds[3]-bounds[1]),0,0]);drawing.add(qr)
    story=[Table([[Paragraph(f"<b>{prop['name']}</b><br/>{prop['address']}",right),Paragraph("AQARI",center),drawing]],colWidths=[75*mm,75*mm,25*mm],style=TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BOX',(0,0),(-1,-1),.5,colors.HexColor('#c9a66b')),('INNERGRID',(0,0),(-1,-1),.25,colors.HexColor('#e4d4b6')),('BACKGROUND',(1,0),(1,0),colors.HexColor('#fbf6ed'))]))]
    story += [Spacer(1,4*mm),Paragraph(_ar("سند استلام راتب")+" / Salary Receipt",heading),Spacer(1,2*mm)]
    person=payload.get("snapshot") or employee.get("profile") or {}
    identity=[
      (_ar("رقم السند")+" / Voucher",voucher),(_ar("الشهر")+" / Month",str(payload.get("month") or "")[:7]),
      (_ar("اسم الموظف")+" / Employee",f"{person.get('name_ar','')} / {person.get('name_en','')}"),
      (_ar("الرقم المدني")+" / Civil ID",person.get("civil_id")),(_ar("الجواز")+" / Passport",person.get("passport")),
      (_ar("الوظيفة")+" / Job",f"{person.get('job_ar','')} / {person.get('job_en','')}"),
    ]
    story.append(Table([[Paragraph(str(k),right),Paragraph(str(v or '—'),left)] for k,v in identity],colWidths=[65*mm,110*mm],style=TableStyle([('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8.5),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#d1d5db')),('BACKGROUND',(0,0),(0,-1),colors.HexColor('#f8f3e9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)])))
    additions=[("Basic / "+_ar("الأساسي"),payload.get("basic")),("Allowances / "+_ar("البدلات"),payload.get("allowances")),("Overtime / "+_ar("الإضافي"),payload.get("overtime")),("Bonus / "+_ar("المكافآت"),payload.get("reward"))]
    deductions=[("Late / "+_ar("التأخير"),payload.get("late")),("Absence / "+_ar("الغياب"),payload.get("absence")),("Deductions / "+_ar("الخصومات"),payload.get("deductions")),("Advance installment / "+_ar("قسط السلفة"),payload.get("advance_repayment"))]
    def financial(title,rows):
        data=[[Paragraph(title,center),Paragraph("KWD / "+_ar("د.ك"),center)]]+[[Paragraph(label,right),Paragraph(_money(value),left)] for label,value in rows]
        return Table(data,colWidths=[62*mm,25*mm],style=TableStyle([('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#9ca3af')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#7a531b')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story += [Spacer(1,3*mm),Table([[financial(_ar("المستحقات")+" / Earnings",additions),financial(_ar("الاستقطاعات")+" / Deductions",deductions)]],colWidths=[88*mm,88*mm]),Spacer(1,3*mm)]
    net=payload.get("net");story.append(Table([[Paragraph(_ar("صافي المستحق")+" / Net payable",right),Paragraph("KWD "+_money(net),center)]],colWidths=[90*mm,86*mm],style=TableStyle([('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),13),('BOX',(0,0),(-1,-1),1,colors.HexColor('#7a531b')),('BACKGROUND',(1,0),(1,0),colors.HexColor('#f8f3e9')),('VALIGN',(0,0),(-1,-1),'MIDDLE')])))
    payment=[(_ar("طريقة الصرف")+" / Method",payload.get("method")),(_ar("المرجع")+" / Reference",payload.get("reference") or "—"),(_ar("تاريخ ووقت الصرف")+" / Paid at",payload.get("paid_at") or "—")]
    story += [Spacer(1,3*mm),Table([[Paragraph(k,right),Paragraph(str(v),left)] for k,v in payment],colWidths=[65*mm,111*mm],style=TableStyle([('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8.5),('GRID',(0,0),(-1,-1),.35,colors.HexColor('#d1d5db'))]))]
    signatures=[[Paragraph(_ar("توقيع الموظف")+"<br/><br/><br/>____________",center),Paragraph(_ar("البصمة")+"<br/><br/><br/>____________",center),Paragraph(_ar("اعتماد المسؤول")+"<br/><br/><br/>____________",center),Paragraph(_ar("اعتماد الإدارة والختم")+"<br/><br/><br/>____________",center)]]
    story += [Spacer(1,5*mm),KeepTogether(Table(signatures,colWidths=[44*mm]*4,style=TableStyle([('FONTNAME',(0,0),(-1,-1),FONT),('FONTSIZE',(0,0),(-1,-1),8),('GRID',(0,0),(-1,-1),.5,colors.HexColor('#9ca3af')),('VALIGN',(0,0),(-1,-1),'TOP'),('MINROWHEIGHT',(0,0),(-1,-1),28*mm)]))),Spacer(1,2*mm),Paragraph(_ar("يمكن التحقق من حالة السند بواسطة رمز QR دون إظهار بيانات الموظف."),center)]
    doc.build(story);pdf=out.getvalue()
    if not pdf.startswith(b"%PDF-"): raise ValueError("INVALID_RENDERED_PDF")
    return pdf
