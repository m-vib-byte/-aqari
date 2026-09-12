"""Render only a verified, immutable official-document snapshot from the database."""
from io import BytesIO
from pathlib import Path
import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT = "AqariSans"
FONT_PATH = Path(__file__).parent / "pdf_fonts" / "AqariSans.ttf"

def shaped(value):
    return get_display(arabic_reshaper.reshape(str(value)), base_dir="R")

def verified_version(result, document_id, requested_version):
    if not isinstance(result, dict) or not isinstance(result.get("series"), dict) or not isinstance(result.get("versions"), list):
        raise ValueError("DOCUMENT_NOT_FOUND")
    series = result["series"]
    if series.get("id") != document_id or series.get("workspace_id") is None:
        raise ValueError("DOCUMENT_SCOPE_MISMATCH")
    matches = [v for v in result["versions"] if isinstance(v, dict) and v.get("version") == requested_version]
    if len(matches) != 1:
        raise ValueError("DOCUMENT_VERSION_NOT_FOUND")
    version = matches[0]
    required = ("id", "title", "body", "payload", "content_sha256", "issued_at", "issued_by_name")
    if any(not version.get(key) for key in required) or len(version["content_sha256"]) != 64:
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
            emit(current, size, gap); current = word
        if current: emit(current, size, gap)

    def emit(text, size, gap):
        nonlocal y
        if y < 70:
            pdf.setFont(FONT, 8); pdf.drawRightString(right, 27, shaped(f"AQARI V267 • {series['document_no']} • v{version['version']}")); pdf.showPage(); y = height-52
        pdf.setFont(FONT, size); pdf.drawRightString(right, y, shaped(text)); y -= gap

    line("AQARI V267", 16, 24); line(version["title"], 20, 30)
    pdf.line(margin, y, right, y); y -= 25
    line(f"رقم المستند: {series['document_no']}"); line(f"الإصدار: {version['version']}"); line(f"تاريخ الإصدار: {version['issued_at']}"); line(f"أصدره: {version['issued_by_name']}"); y -= 10
    line(version["body"], 11, 20); y -= 15
    line(f"بصمة المحتوى: {version['content_sha256']}", 8, 14)
    if series.get("status") == "void": line(f"ملغى — {series.get('void_reason') or 'إلغاء موثق'}", 12, 20)
    pdf.setFont(FONT, 8); pdf.drawRightString(right, 27, shaped(f"AQARI V267 • {series['document_no']} • v{version['version']}"))
    pdf.save(); return stream.getvalue()
