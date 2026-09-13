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
    period_breakdown(saved, entry)
    return saved


def period_breakdown(saved, entry=None):
    """Validate saved period values; never recalculate an issued receipt from a live lease."""
    contract = saved.get("contract", {})
    value = saved.get("rentPeriodBreakdown")
    if value is None:
        if contract.get("rentEntitlement") is not None:
            raise ValueError("RECEIPT_PERIOD_BREAKDOWN_REQUIRED")
        return None
    fields = {"version", "period", "dueOn", "policy", "gross", "discount", "net", "manual", "freeMonth"}
    if (not isinstance(value, dict) or set(value) != fields
            or type(value["version"]) is not int or value["version"] != 1
            or type(value["manual"]) is not bool or type(value["freeMonth"]) is not bool
            or not isinstance(value["policy"], str)
            or value["policy"] not in {"full_month", "daily_prorated", "manual_first_period"}):
        raise ValueError("INVALID_RECEIPT_PERIOD_BREAKDOWN")
    row = saved["record"]
    due_on = date.fromisoformat(str(value["dueOn"]))
    if (value["period"] != row[8] or due_on.isoformat() != value["dueOn"]
            or due_on.isoformat()[:7] != row[8]
            or not date.fromisoformat(contract["start_date"]) <= due_on <= date.fromisoformat(contract["end_date"])):
        raise ValueError("RECEIPT_PERIOD_DATE_MISMATCH")
    entitlement = contract.get("rentEntitlement")
    if not isinstance(entitlement, dict):
        raise ValueError("RECEIPT_ENTITLEMENT_MISSING")
    entitlement_start = date.fromisoformat(str(entitlement.get("startDate")))
    first = row[8] == entitlement_start.isoformat()[:7]
    expected_policy = entitlement.get("firstPeriodPolicy") if first else "full_month"
    if (row[8] < entitlement_start.isoformat()[:7]
            or due_on != max(date.fromisoformat(row[8] + "-01"), entitlement_start)
            or value["policy"] != expected_policy
            or value["manual"] != (first and expected_policy == "manual_first_period")):
        raise ValueError("RECEIPT_ENTITLEMENT_MISMATCH")

    def nonnegative(amount):
        if isinstance(amount, bool) or not isinstance(amount, (int, float, Decimal)):
            raise ValueError("INVALID_RECEIPT_PERIOD_AMOUNT")
        try:
            number = Decimal(str(amount))
            if (not number.is_finite() or number < 0 or number > Decimal("999999999.999")
                    or number != number.quantize(Decimal("0.001"))):
                raise ValueError("INVALID_RECEIPT_PERIOD_AMOUNT")
        except InvalidOperation as exc:
            raise ValueError("INVALID_RECEIPT_PERIOD_AMOUNT") from exc
        return number

    result = dict(value, net=nonnegative(value["net"]))
    if value["manual"]:
        if value["policy"] != "manual_first_period" or value["gross"] is not None or value["discount"] is not None:
            raise ValueError("INVALID_MANUAL_PERIOD_BREAKDOWN")
    else:
        result.update(gross=nonnegative(value["gross"]), discount=nonnegative(value["discount"]))
        if result["gross"] - result["discount"] != result["net"]:
            raise ValueError("RECEIPT_PERIOD_TOTAL_MISMATCH")
    if value["freeMonth"] and result["net"] != 0:
        raise ValueError("RECEIPT_FREE_PERIOD_MISMATCH")
    if entry is not None:
        # The immutable payment record supplies the original period due, even
        # for a partial payment. Compare values without reading current terms.
        try:
            due = Decimal(str(entry["due"]))
        except (KeyError, InvalidOperation, TypeError) as exc:
            raise ValueError("RECEIPT_PERIOD_DUE_MISMATCH") from exc
        if isinstance(entry["due"], bool) or not due.is_finite() or due != result["net"]:
            raise ValueError("RECEIPT_PERIOD_DUE_MISMATCH")
    return result


def shaped(text):
    return get_display(arabic_reshaper.reshape(str(text)), base_dir="R")


def render_receipt(saved):
    breakdown = period_breakdown(saved)
    if saved.get('contract', {}).get('property') == 'برج شيخة' and saved.get('detailsVersion') != 2 and breakdown is None:
        from lib.property_statement_pdf import render_shaikhah_receipt
        return render_shaikhah_receipt(saved)
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
    if breakdown is not None:
        period_fields = [('تاريخ استحقاق الفترة', breakdown['dueOn'])]
        if breakdown['manual']:
            period_fields.append(('صافي أول فترة - مبلغ يدوي، دون خصم إضافي', f"{breakdown['net']:.3f} د.ك"))
        else:
            period_fields.extend([
                ('قيمة الفترة قبل الخصم', f"{breakdown['gross']:.3f} د.ك"),
                ('خصم الفترة', f"{breakdown['discount']:.3f} د.ك"),
                ('صافي استحقاق الفترة', f"{breakdown['net']:.3f} د.ك"),
            ])
        for title, value in period_fields:
            y = wrapped(f'{title}: {value}', y, width - margin * 2, 11, 19) - 5
    if saved.get('detailsVersion') == 2:
        tenant = contract.get('tenantProfile', {})
        for title, value in [
            ('الدور', contract.get('floor')), ('الاسم بالعربي', tenant.get('nameAr')),
            ('الاسم بالإنجليزي', tenant.get('nameEn')), ('الهاتف', tenant.get('phone')),
            ('الجنسية', tenant.get('nationality')), ('الرقم المدني', tenant.get('civilId')),
            ('رقم الجواز', tenant.get('passportNo')), ('البريد الإلكتروني', tenant.get('email')),
            ('بداية العقد', contract.get('start_date')), ('نهاية العقد', contract.get('end_date')),
            ('الإيجار عند كتابة العقد', contract.get('contractRent')),
            *([] if breakdown is not None else [('الإيجار الحالي بعد الخصم', contract.get('rent'))]),
            ('التأمين', contract.get('deposit')), ('العربون', contract.get('advance')),
            ('تاريخ استلام التأمين', contract.get('depositReceivedOn')),
            ('الشهر المجاني المعتمد', ('نعم — ' + str(contract.get('freeMonthPeriod', ''))) if contract.get('freeMonthApproved') else ('لا' if contract.get('rentalTermsVersion') == 1 else 'غير مدون')),
            ('رسوم النظافة', contract.get('cleaningFee')), ('رقم العملية', saved.get('transactionNo')),
            ('استلام العقد', contract.get('contractReceived')), ('تاريخ ووقت الاستلام — الكويت', contract.get('receivedAt')),
            ('حالة تبليغ الإخلاء', contract.get('evictionNotice')), ('المحاسب المسؤول', saved.get('accountant')),
        ]:
            if title == 'تاريخ ووقت الاستلام — الكويت' and value:
                value = '\u202a' + str(value) + '\u202c'
            y = wrapped(f'{title}: {value if value is not None and value != "" else "غير مدون"}', y, width - margin * 2, 11, 19) - 5
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
    label("اسم المحاسب: " + str(saved.get("accountant") or "____________________"), y)
    label("اسم المستلم: ____________________", y - 29)
    label("التوقيع والختم: ____________________", y - 58)
    label("AQARI V267 • " + str(saved["id"]), 27, 8)
    pdf.save()
    return stream.getvalue()
