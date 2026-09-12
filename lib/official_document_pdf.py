"""Render only a verified, immutable official-document snapshot from the database."""
from io import BytesIO
import json
import re
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT = "AqariSans"
FONT_PATH = Path(__file__).parent / "pdf_fonts" / "AqariSans.ttf"
CATALOG = json.loads((Path(__file__).parent / "official_form_catalog.json").read_text(encoding="utf-8"))

def shaped(value):
    # Isolate Latin references and ISO dates so RTL layout does not reorder their parts.
    logical = re.sub(r"[+\-]?[A-Za-z0-9][A-Za-z0-9:/._+\-]*", lambda m: "\u200e"+m.group(0)+"\u200e", str(value))
    return get_display(arabic_reshaper.reshape(logical), base_dir="R")

def issued_date(value):
    try:
        date = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if date.tzinfo is not None: date = date.astimezone(ZoneInfo("Asia/Kuwait"))
        return date.strftime("%Y/%m/%d %H:%M")
    except ValueError:
        return str(value)

def verified_version(result, document_id, requested_version):
    if not isinstance(result, dict) or not isinstance(result.get("series"), dict) or not isinstance(result.get("versions"), list):
        raise ValueError("DOCUMENT_NOT_FOUND")
    series = result["series"]
    if series.get("id") != document_id or series.get("workspace_id") is None:
        raise ValueError("DOCUMENT_SCOPE_MISMATCH")
    if type(requested_version) is not int or not 1 <= requested_version <= 10000:
        raise ValueError("INVALID_DOCUMENT_VERSION")
    matches = [v for v in result["versions"] if isinstance(v, dict) and type(v.get("version")) is int and v.get("version") == requested_version]
    if len(matches) != 1:
        raise ValueError("DOCUMENT_VERSION_NOT_FOUND")
    version = matches[0]
    required = ("id", "title", "body", "payload", "content_sha256", "issued_at", "issued_by_name")
    if (any(not version.get(key) for key in required)
        or not isinstance(version.get("payload"), dict)
        or not isinstance(version.get("title"), str) or not isinstance(version.get("body"), str)
        or not isinstance(version.get("content_sha256"), str)
        or not re.fullmatch(r"[a-f0-9]{64}", version["content_sha256"])
        or version.get("workspace_id") != series["workspace_id"]
        or version.get("series_id") != document_id):
        raise ValueError("INVALID_DOCUMENT_SNAPSHOT")
    return series, version

def render_official_document(series, version):
    if FONT not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))
    stream = BytesIO(); pdf = canvas.Canvas(stream, pagesize=A4, invariant=1, pageCompression=1)
    pdf.setTitle(version["title"]); pdf.setAuthor("AQARI V267")
    width, height = A4; margin = 42; right = width-margin; y = height-52

    def line(text, size=10, gap=17):
        nonlocal y
        words = str(text).replace("\r", " ").split(); current = ""
        for word in words:
            trial = (current+" "+word).strip()
            if pdfmetrics.stringWidth(shaped(trial), FONT, size) < width-margin*2:
                current = trial; continue
            if current: emit(current, size, gap)
            current = ""
            # Long references/URLs must wrap too, without clipping identifiers.
            for char in word:
                if current and pdfmetrics.stringWidth(shaped(current+char), FONT, size) >= width-margin*2:
                    emit(current, size, gap); current = ""
                current += char
        if current: emit(current, size, gap)

    def emit(text, size, gap):
        nonlocal y
        if y < 70:
            pdf.setFont(FONT, 8); pdf.drawRightString(right, 27, shaped(f"AQARI V267 • {series['document_no']} • v{version['version']}")); pdf.showPage(); y = height-52
        pdf.setFont(FONT, size); pdf.drawRightString(right, y, shaped(text)); y -= gap

    line("AQARI V267", 16, 24); line(version["title"], 20, 30)
    pdf.line(margin, y, right, y); y -= 25
    line(f"رقم المستند: {series['document_no']}"); line(f"الإصدار: {version['version']}"); line(f"تاريخ الإصدار: {issued_date(version['issued_at'])}"); line(f"أصدره: {version['issued_by_name']}"); y -= 10
    line(version["body"], 11, 20); y -= 15
    template = CATALOG["templates"].get(series.get("kind"), {})
    for key in template.get("required", []):
        if key in ("documentNo", "issuedAt") or key not in version["payload"]: continue
        value = version["payload"][key]
        if not isinstance(value, (str, int, float)): continue
        label = CATALOG["fields"].get(key, {}).get("label")
        if label: line(f"{label}: {value}", 10, 17)
    exception = version["payload"].get("exceptionReason")
    if isinstance(exception, str) and exception.strip():
        line(f"الاستثناء المعتمد: {exception}", 11, 19)
    y -= 10
    line(f"بصمة المحتوى: {version['content_sha256']}", 8, 14)
    if series.get("status") == "void": line(f"ملغى — {series.get('void_reason') or 'إلغاء موثق'}", 12, 20)
    pdf.setFont(FONT, 8); pdf.drawRightString(right, 27, shaped(f"AQARI V267 • {series['document_no']} • v{version['version']}"))
    pdf.save(); return stream.getvalue()
