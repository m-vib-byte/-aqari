"""Deterministic Arabic PDF renderer for a verified AQARI V267 unit-handover bundle."""
from io import BytesIO
import hashlib
import json
import re

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from lib.official_document_pdf import FONT, FONT_PATH, shaped, issued_date

SHA256 = re.compile(r"^[a-f0-9]{64}$")
ALLOWED_MIME = re.compile(r"^(?:image/[a-z0-9.+-]+|application/pdf)$")


def _text(value, code):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"UNIT_HANDOVER_PDF_{code}_REQUIRED")
    return value.strip()


def _revision(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("UNIT_HANDOVER_PDF_REVISION_INVALID")
    return value


def verified_unit_handover_bundle(bundle):
    if not isinstance(bundle, dict) or bundle.get("kind") != "unit_handover":
        raise ValueError("UNIT_HANDOVER_PDF_BUNDLE_REQUIRED")

    source = bundle.get("source")
    parties = bundle.get("parties")
    checklist = bundle.get("checklist")
    attachments = bundle.get("attachments")
    if not isinstance(source, dict) or not isinstance(parties, dict):
        raise ValueError("UNIT_HANDOVER_PDF_SCOPE_INVALID")
    if not isinstance(checklist, list) or not checklist:
        raise ValueError("UNIT_HANDOVER_PDF_CHECKLIST_REQUIRED")
    if not isinstance(attachments, list) or len(attachments) < 3:
        raise ValueError("UNIT_HANDOVER_PDF_ATTACHMENTS_REQUIRED")

    normalized_source = {
        "inspection_id": _text(source.get("inspection_id"), "INSPECTION_ID"),
        "lease_id": _text(source.get("lease_id"), "LEASE_ID"),
        "unit_id": _text(source.get("unit_id"), "UNIT_ID"),
        "inspection_revision": _revision(source.get("inspection_revision")),
        "inspected_at": _text(source.get("inspected_at"), "INSPECTED_AT"),
        "signed_at": _text(source.get("signed_at"), "SIGNED_AT"),
    }
    normalized_parties = {
        "tenant_name": _text(parties.get("tenant_name"), "TENANT_NAME"),
        "contract_no": _text(parties.get("contract_no"), "CONTRACT_NO"),
        "property_name": _text(parties.get("property_name"), "PROPERTY_NAME"),
        "unit_no": _text(parties.get("unit_no"), "UNIT_NO"),
    }

    normalized_checklist = []
    for index, row in enumerate(checklist, 1):
        if not isinstance(row, dict):
            raise ValueError(f"UNIT_HANDOVER_PDF_CHECKLIST_{index}_INVALID")
        item = _text(row.get("item"), f"CHECKLIST_{index}_ITEM")
        result = _text(row.get("result"), f"CHECKLIST_{index}_RESULT")
        note = row.get("note", "")
        if not isinstance(note, str):
            raise ValueError(f"UNIT_HANDOVER_PDF_CHECKLIST_{index}_NOTE_INVALID")
        normalized_checklist.append({"item": item, "result": result, **({"note": note.strip()} if note.strip() else {})})

    normalized_attachments = []
    ids = set()
    roles = set()
    for index, row in enumerate(attachments, 1):
        if not isinstance(row, dict):
            raise ValueError(f"UNIT_HANDOVER_PDF_ATTACHMENT_{index}_INVALID")
        document_id = _text(row.get("id"), f"ATTACHMENT_{index}_ID")
        role = _text(row.get("role"), f"ATTACHMENT_{index}_ROLE")
        checksum = _text(row.get("checksum_sha256"), f"ATTACHMENT_{index}_SHA256").lower()
        mime = _text(row.get("mime_type"), f"ATTACHMENT_{index}_MIME").lower()
        size = row.get("size_bytes")
        if document_id in ids or role in roles:
            raise ValueError("UNIT_HANDOVER_PDF_ATTACHMENT_IDENTITY_CONFLICT")
        if not SHA256.fullmatch(checksum) or not ALLOWED_MIME.fullmatch(mime):
            raise ValueError(f"UNIT_HANDOVER_PDF_ATTACHMENT_{index}_INTEGRITY_INVALID")
        if isinstance(size, bool) or not isinstance(size, int) or size <= 0:
            raise ValueError(f"UNIT_HANDOVER_PDF_ATTACHMENT_{index}_SIZE_INVALID")
        ids.add(document_id)
        roles.add(role)
        normalized_attachments.append({
            "id": document_id,
            "role": role,
            "checksum_sha256": checksum,
            "size_bytes": size,
            "mime_type": mime,
        })

    if "TENANT_SIGNATURE" not in roles or "INSPECTOR_SIGNATURE" not in roles:
        raise ValueError("UNIT_HANDOVER_PDF_SIGNATURE_EVIDENCE_REQUIRED")
    if not any(role.startswith("PHOTO_") for role in roles):
        raise ValueError("UNIT_HANDOVER_PDF_PHOTO_EVIDENCE_REQUIRED")

    return {
        "kind": "unit_handover",
        "title": _text(bundle.get("title"), "TITLE"),
        "summary": _text(bundle.get("summary"), "SUMMARY"),
        "source": normalized_source,
        "parties": normalized_parties,
        "checklist": normalized_checklist,
        "attachments": normalized_attachments,
    }


def unit_handover_snapshot_sha256(bundle):
    verified = verified_unit_handover_bundle(bundle)
    canonical = json.dumps(verified, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def render_unit_handover_pdf(bundle):
    value = verified_unit_handover_bundle(bundle)
    snapshot_hash = unit_handover_snapshot_sha256(value)
    if FONT not in pdfmetrics.getRegisteredFontNames():
        if not FONT_PATH.exists():
            raise RuntimeError("UNIT_HANDOVER_PDF_FONT_MISSING")
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))

    stream = BytesIO()
    pdf = canvas.Canvas(stream, pagesize=A4, invariant=1, pageCompression=1)
    pdf.setTitle(value["title"])
    pdf.setAuthor("AQARI V267")
    width, height = A4
    margin = 42
    right = width - margin
    y = height - 52
    source = value["source"]
    footer_text = f"AQARI V267 • {source['inspection_id']} • r{source['inspection_revision']}"

    def footer():
        pdf.setFont(FONT, 8)
        pdf.drawRightString(right, 27, shaped(footer_text))

    def new_page():
        nonlocal y
        footer()
        pdf.showPage()
        y = height - 52

    def emit(text, size=10, gap=17):
        nonlocal y
        if y < 70:
            new_page()
        pdf.setFont(FONT, size)
        pdf.drawRightString(right, y, shaped(text))
        y -= gap

    def line(text, size=10, gap=17):
        current = ""
        for word in str(text).replace("\r", " ").replace("\n", " ").split():
            trial = (current + " " + word).strip()
            if pdfmetrics.stringWidth(shaped(trial), FONT, size) < width - margin * 2:
                current = trial
                continue
            if current:
                emit(current, size, gap)
            current = ""
            for char in word:
                if current and pdfmetrics.stringWidth(shaped(current + char), FONT, size) >= width - margin * 2:
                    emit(current, size, gap)
                    current = ""
                current += char
        if current:
            emit(current, size, gap)

    line("AQARI V267", 16, 24)
    line(value["title"], 20, 30)
    pdf.line(margin, y, right, y)
    y -= 24
    parties = value["parties"]
    line(f"رقم العقد: {parties['contract_no']}")
    line(f"العقار: {parties['property_name']}")
    line(f"الوحدة: {parties['unit_no']}")
    line(f"المستأجر: {parties['tenant_name']}")
    line(f"رقم الفحص: {source['inspection_id']}")
    line(f"مراجعة الفحص: {source['inspection_revision']}")
    line(f"تاريخ الفحص: {issued_date(source['inspected_at'])}")
    line(f"تاريخ التوقيع: {issued_date(source['signed_at'])}")
    y -= 8
    line(value["summary"], 11, 20)
    y -= 12
    line("نتيجة فحص الوحدة", 14, 24)
    for index, row in enumerate(value["checklist"], 1):
        line(f"{index}. {row['item']} — {row['result']}", 10, 17)
        if row.get("note"):
            line(f"ملاحظة: {row['note']}", 9, 15)

    y -= 10
    line("مرفقات الإثبات المحفوظة", 14, 24)
    for attachment in value["attachments"]:
        line(f"الدور: {attachment['role']} • الملف: {attachment['id']}", 9, 15)
        line(f"النوع: {attachment['mime_type']} • الحجم: {attachment['size_bytes']} بايت", 8, 14)
        line(f"SHA-256: {attachment['checksum_sha256']}", 7, 13)

    y -= 10
    line(f"بصمة محضر التسليم: {snapshot_hash}", 8, 14)
    line("هذا المحضر أُنشئ من فحص خروج محفوظ وموقّع، وتُثبت بصمات المرفقات هويتها عند الأرشفة وإعادة الفتح.", 9, 16)
    footer()
    pdf.save()
    data = stream.getvalue()
    if len(data) < 8 or not data.startswith(b"%PDF-"):
        raise RuntimeError("UNIT_HANDOVER_PDF_RENDER_FAILED")
    return data
