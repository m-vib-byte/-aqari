"""Versioned Arabic rent PDF. Input comes only from a verified cloud receipt snapshot."""
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
import re

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

FONT = "AqariSans"
FONT_PATH = Path(__file__).parent / "pdf_fonts" / "AqariSans.ttf"
SETTLED = {"paid", "partial", "settled", "received", "مدفوع", "مسدد", "جزئي", "مستلم"}


def primary(payload):
    if not isinstance(payload, dict):
        raise ValueError("INVALID_STATE")
    if payload.get("format") == "aqari-cloud-state-v1":
        value = payload.get("snapshot", {}).get("values", {}).get("aqari_v30")
    elif payload.get("schema") == "aqari-local-snapshot-v1":
        value = payload.get("values", {}).get("aqari_v30")
    else:
        value = payload
    if not isinstance(value, dict):
        raise ValueError("INVALID_STATE")
    return value


def money(value):
    if isinstance(value, bool):
        raise ValueError("INVALID_AMOUNT")
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0 or amount > Decimal("999999999.999") or amount != amount.quantize(Decimal("0.001")):
            raise ValueError("INVALID_AMOUNT")
        return amount
    except InvalidOperation as exc:
        raise ValueError("INVALID_AMOUNT") from exc


def verified_receipt(payload, receipt_no):
    db = primary(payload)
    candidates = [r for r in db.get("rentReceiptsV267", []) if isinstance(r, dict) and r.get("id") == receipt_no]
    if len(candidates) != 1:
        raise ValueError("RECEIPT_NOT_FOUND")
    saved = candidates[0]
    row, contract = saved.get("record"), saved.get("contract")
    if saved.get("template") != "rent-voucher-v267-1" or not isinstance(row, list) or len(row) != 10 or not isinstance(contract, dict):
        raise ValueError("INVALID_RECEIPT")
    rows = [r for r in db.get("collections", []) if isinstance(r, list) and r and r[0] == receipt_no]
    if len(rows) != 1 or rows[0] != row or row[0] != receipt_no or row[3] not in SETTLED:
        raise ValueError("UNCONFIRMED_RECEIPT")
    amount = money(row[2])
    date.fromisoformat(str(row[5]))
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", str(row[8])):
        raise ValueError("INVALID_PERIOD")
    if contract.get("status") != "signed" or not contract.get("id") or not contract.get("contract_no"):
        raise ValueError("INACTIVE_CONTRACT")
    start, end = date.fromisoformat(contract["start_date"]), date.fromisoformat(contract["end_date"])
    if start > end or not (start.isoformat()[:7] <= row[8] <= end.isoformat()[:7]):
        raise ValueError("INVALID_CONTRACT_PERIOD")
    for field, index in [("tenant", 1), ("property", 4), ("unit", 6)]:
        if not contract.get(field) or str(contract[field]) != str(row[index]):
            raise ValueError("CONTRACT_LINK_MISMATCH")
    if not any(isinstance(c, dict) and str(c.get("id")) == str(contract["id"]) for c in db.get("contractsV202", [])):
        raise ValueError("CONTRACT_NOT_SAVED")
    ledger = [r for r in db.get("rentLedgerV202", []) if isinstance(r, dict) and receipt_no in [r.get("receiptNo"), r.get("voucherNo")]]
    if len(ledger) != 1:
        raise ValueError("AMBIGUOUS_PAYMENT")
    entry = ledger[0]
    for field, expected in [("contractId", contract["id"]), ("contractNo", contract["contract_no"]), ("tenant", row[1]), ("property", row[4]), ("unit", row[6]), ("period", row[8]), ("paidAt", row[5]), ("status", row[3])]:
        if str(entry.get(field)) != str(expected):
            raise ValueError("PAYMENT_LINK_MISMATCH")
    if money(entry.get("paid")) != amount:
        raise ValueError("PAYMENT_AMOUNT_MISMATCH")
    return saved


def shaped(text):
    return get_display(arabic_reshaper.reshape(str(text)), base_dir="R")


def render_receipt(saved):
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))
    stream = BytesIO()
    pdf = canvas.Canvas(stream, pagesize=A4, invariant=1, pageCompression=1)
    pdf.setTitle("وصل إيجار")
    pdf.setAuthor("AQARI V267")
    width, height = A4
    margin = 38
    right = width - margin
    row, contract = saved["record"], saved["contract"]

    def label(text, y, size=11, x=right):
        display = shaped(text)
        pdf.setFont(FONT, size)
        pdf.drawRightString(x, y, display)

    def wrapped(text, y, max_width, size=10, leading=17):
        words = str(text).split()
        line = ""
        def emit(value, position):
            if position < 65:
                label("AQARI V267 • " + str(saved["id"]), 27, 8)
                pdf.showPage()
                position = height - 55
            label(value, position, size)
            return position - leading
        for word in words:
            trial = (line + " " + word).strip()
            if pdfmetrics.stringWidth(shaped(trial), FONT, size) <= max_width:
                line = trial
            else:
                if line:
                    y = emit(line, y)
                # Split a long reference instead of drawing outside the page.
                line = ""
                for char in word:
                    if pdfmetrics.stringWidth(shaped(line + char), FONT, size) > max_width:
                        y = emit(line, y)
                        line = char
                    else:
                        line += char
        if line:
            y = emit(line, y)
        return y

    y = wrapped(saved.get("brand", {}).get("ar") or contract["property"], height - 55, width - margin * 2, 18, 24)
    label("وصل إيجار", y - 22, 23)
    pdf.setStrokeColorRGB(.48, .37, .19)
    pdf.line(margin, y - 38, right, y - 38)
    y -= 65
    for title, value in [
        ("رقم الوصل", saved["id"]), ("تاريخ التحصيل", row[5]),
        ("المستأجر", row[1]), ("العقار", row[4]), ("رقم الوحدة", row[6]),
        ("رقم العقد", contract["contract_no"]), ("إيجار شهر", row[8]),
        ("المبلغ المستلم", f"{money(row[2]):.3f} د.ك"), ("طريقة الدفع", row[9]),
    ]:
        y = wrapped(f"{title}: {value}", y, width - margin * 2, 11, 19) - 5
    if row[7]:
        y = wrapped("البيان: " + str(row[7]), y, width - margin * 2) - 8
    if y < 270:
        pdf.showPage()
        y = height - 55
        label("وصل إيجار — تابع", y, 18)
        y -= 35
    pdf.line(margin, y + 15, right, y + 15)
    y = wrapped("هذا الوصل لإثبات المبلغ المدفوع فقط، ولا يغيّر قيمة الإيجار المتفق عليها في العقد.", y, width - margin * 2 - 16, 10) - 4
    y = wrapped("يعتبر الوصل لاغياً في حال عدم تحصيل الشيك. تبقى حركة الإلغاء وأسبابها في السجل المالي.", y, width - margin * 2 - 16, 10)
    y -= 62
    label("اسم المحاسب: ____________________", y)
    label("اسم المستلم: ____________________", y - 29)
    label("التوقيع والختم: ____________________", y - 58)
    label("AQARI V267 • " + str(saved["id"]), 27, 8)
    pdf.save()
    return stream.getvalue()
