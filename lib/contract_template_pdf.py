"""Read-only rental document previews; no approval, signature or financial mutation."""
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from lib.rent_pdf import FONT, FONT_PATH, shaped

if FONT not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))

FIELD_KEY = re.compile(r'^[a-z][a-z0-9_]{1,49}$')
TOKEN = re.compile(r'\{\{([a-z][a-z0-9_]{1,49})\}\}')
ALIASES = {'civil_id': 'tenant_civil_id', 'nationality': 'tenant_nationality', 'floor': 'floor_no', 'tenant_passport': 'tenant_passport_no', 'contract_start_date': 'start_date', 'contract_end_date': 'end_date', 'owner_representative_name': 'representative_name'}
SIGNERS = {
    'rental_agreement': [('owner', 'المالك / الوكيل المفوض'), ('tenant', 'المستأجر')],
    'apartment_handover': [('tenant', 'المستأجر')],
    'rent_receipt': [('receiver', 'المستلم'), ('accountant', 'المحاسب')],
    'eviction': [('tenant', 'المستأجر')],
    'owner_final_clearance': [('owner', 'المالك / الوكيل المفوض'), ('tenant', 'المستأجر')],
}


def _text(value):
    text = '' if value is None else str(value).strip()
    visual = shaped(text) if re.search(r'[\u0600-\u06ff]', text) else text
    return escape(visual).replace('\n', '<br/>')


def format_field(value, field):
    """Use the same plain display strings in browser and PDF; preserve numeric zero."""
    if value is None or value == '':
        return ''
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError('INVALID_FIELD_VALUE')
    text = str(value).strip()
    if len(text) > 2000 or '{{' in text or '}}' in text or any(ord(c) < 32 and c not in '\n\t' for c in text):
        raise ValueError('INVALID_FIELD_VALUE')
    kind = field.get('type', 'text')
    if kind in {'number', 'money'}:
        if not re.fullmatch(r'-?\d+(?:\.\d{1,3})?' if kind == 'money' else r'-?\d+(?:\.\d+)?', text):
            raise ValueError('INVALID_FIELD_VALUE')
        try:
            amount = Decimal(text)
            if not amount.is_finite() or abs(amount) > Decimal('999999999.999'):
                raise ValueError('INVALID_FIELD_VALUE')
            if kind == 'money':
                if amount != amount.quantize(Decimal('.001')):
                    raise ValueError('INVALID_FIELD_VALUE')
                return f'{abs(amount) if amount == 0 else amount:.3f}'
            return text
        except InvalidOperation as exc:
            raise ValueError('INVALID_FIELD_VALUE') from exc
    if kind == 'date':
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
            raise ValueError('INVALID_FIELD_DATE')
        parsed = date.fromisoformat(text)
        return parsed.strftime('%d/%m/%Y')
    return text


def render_document_template(template, values=None):
    """Return resolved text for either an empty model or a bound preview."""
    if not isinstance(template, dict):
        raise ValueError('INVALID_TEMPLATE')
    allowed = {'id', 'revision', 'kind', 'kind_label', 'title', 'fields', 'clauses'}
    if set(template) - allowed:
        raise ValueError('INVALID_TEMPLATE')
    title, kind = template.get('title'), template.get('kind_label')
    clauses, fields = template.get('clauses'), template.get('fields', [])
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 200 or not isinstance(kind, str) or not 1 <= len(kind.strip()) <= 80:
        raise ValueError('INVALID_TEMPLATE')
    if not isinstance(clauses, list) or not 1 <= len(clauses) <= 50 or not isinstance(fields, list) or len(fields) > 50:
        raise ValueError('INVALID_TEMPLATE')
    if values is not None and not isinstance(values, dict):
        raise ValueError('INVALID_FIELD_VALUES')
    catalog, rendered, raw_values, canonical_keys = {}, {}, {}, set()
    for field in fields:
        if (not isinstance(field, dict) or set(field) - {'key', 'label', 'type', 'required'}
                or not isinstance(field.get('key'), str) or not FIELD_KEY.fullmatch(field['key'])
                or field['key'] in {'field_name', 'constructor', 'prototype', '__proto__'} or ALIASES.get(field['key'], field['key']) in canonical_keys
                or not isinstance(field.get('label'), str) or not 1 <= len(field['label'].strip()) <= 100
                or field.get('type') not in {'text', 'number', 'date', 'money'}
                or not isinstance(field.get('required'), bool)):
            raise ValueError('INVALID_TEMPLATE_FIELDS')
        catalog[field['key']] = field
        canonical = ALIASES.get(field['key'], field['key'])
        canonical_keys.add(canonical)
        candidates = [str((values or {})[k]).strip() for k in [canonical] + [a for a, c in ALIASES.items() if c == canonical] if (values or {}).get(k) is not None and (values or {}).get(k) != '']
        if len(set(candidates)) > 1:
            raise ValueError('FIELD_ALIAS_CONFLICT')
        value = candidates[0] if candidates else ''
        raw_values[field['key']] = value
        display = format_field(value, field)
        if values is not None and field['required'] and not display:
            raise ValueError('MISSING_REQUIRED_FIELD:' + field['key'])
        rendered[field['key']] = display or ("" if values is not None else "«" + field['label'] + "»")

    def substitute(text):
        if not isinstance(text, str):
            raise ValueError('INVALID_TEMPLATE')
        def replace(match):
            key = match.group(1)
            if key not in rendered:
                raise ValueError('UNKNOWN_TEMPLATE_FIELD:' + key)
            return rendered[key]
        remaining = TOKEN.sub('', text)
        if '{' in remaining or '}' in remaining:
            raise ValueError('INVALID_TEMPLATE_TOKEN')
        return TOKEN.sub(replace, text)

    normalized = []
    if sum(len(str(c)) for c in clauses) > 100000:
        raise ValueError('INVALID_TEMPLATE')
    for clause in clauses:
        if (not isinstance(clause, dict) or set(clause) != {'title', 'text'}
                or not isinstance(clause['title'], str) or not 1 <= len(clause['title'].strip()) <= 200
                or not isinstance(clause['text'], str) or not 1 <= len(clause['text'].strip()) <= 30000):
            raise ValueError('INVALID_TEMPLATE')
        normalized.append({key: substitute(clause[key]) for key in ['title', 'text']})
    # Never render user supplied signature/biometric data as an executed signature.
    signatures = []
    for role, label in SIGNERS.get(template.get('kind'), SIGNERS['rental_agreement']):
        name_key = role + '_name'
        if role == 'owner' and (values or {}).get('representative_name'):
            name_key = 'representative_name'
            label = 'وكيل المالك المفوض'
        name = format_field((values or {}).get(name_key), {'type': 'text'})
        signatures.append({'role': role, 'label': label, 'name': name})
    for key in ['tenant_name', 'owner_name', 'representative_name', 'receiver_name', 'accountant_name']:
        raw_values[key] = next((str((values or {})[k]).strip() for k in [key] + [a for a, c in ALIASES.items() if c == key] if (values or {}).get(k) is not None and (values or {}).get(k) != ''), '')
    return {'kind': template.get('kind', ''), 'values': raw_values, 'title': substitute(title), 'kind_label': substitute(kind), 'clauses': normalized,
            'fields': [{'key': key, 'label': field['label'], 'value': rendered[key]} for key, field in catalog.items()],
            'signatures': signatures, 'bound': values is not None}



def _paragraph(value, style, width):
    """Wrap logical text first; bidi-shaping an entire paragraph reverses line order."""
    available = width - 2 * (getattr(style, 'borderPadding', 0) or 0) - 2
    lines = []
    for original in str(value).split('\n'):
        current = ''
        for word in original.split():
            candidate = (current + ' ' + word).strip()
            if current and pdfmetrics.stringWidth(shaped(candidate), FONT, style.fontSize) > available:
                lines.append(current)
                current = word
            else:
                current = candidate
        lines.append(current)
    return Paragraph('<br/>'.join(_text(line) or '&#160;' for line in lines), style)


def render_contract_template(template, values=None):
    resolved = render_document_template(template, values)
    out = BytesIO()
    doc = SimpleDocTemplate(out, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm, title=resolved['title'], author='AQARI')
    heading = ParagraphStyle('heading', fontName=FONT, fontSize=18, leading=28, alignment=TA_CENTER, textColor=colors.HexColor('#4b321f'), spaceAfter=8*mm)
    meta = ParagraphStyle('meta', fontName=FONT, fontSize=10, leading=17, alignment=TA_CENTER, textColor=colors.HexColor('#765b43'), spaceAfter=6*mm)
    clause_title = ParagraphStyle('clause-title', fontName=FONT, fontSize=12, leading=20, alignment=TA_RIGHT, textColor=colors.HexColor('#56391f'), spaceBefore=4*mm, spaceAfter=2*mm)
    body = ParagraphStyle('body', fontName=FONT, fontSize=10.5, leading=20, alignment=TA_RIGHT, textColor=colors.HexColor('#2f2924'), borderColor=colors.HexColor('#ded0bd'), borderWidth=.5, borderPadding=7, spaceAfter=3*mm)
    signature = ParagraphStyle('signature', fontName=FONT, fontSize=10, leading=19, alignment=TA_RIGHT, textColor=colors.HexColor('#2f2924'))
    story = [_paragraph(resolved['title'], heading, doc.width), _paragraph(resolved['kind_label'] + ' - معاينة غير معتمدة', meta, doc.width)]
    for index, clause in enumerate(resolved['clauses'], 1):
        story.extend([_paragraph(str(index) + '. ' + clause['title'], clause_title, doc.width), _paragraph(clause['text'], body, doc.width)])
    cells = []
    for signer in resolved['signatures']:
        cells.append([_paragraph(signer['label'], clause_title, doc.width/len(resolved['signatures']) - 20), _paragraph('الاسم: ' + (signer['name'] or '................................'), signature, doc.width/len(resolved['signatures']) - 20),
                      Spacer(1, 3*mm), Paragraph(_text('التوقيع: ................................'), signature),
                      Spacer(1, 6*mm), Paragraph(_text('البصمة: ................................'), signature), Spacer(1, 6*mm)])
    table = Table([list(reversed(cells))], colWidths=[doc.width/len(cells)]*len(cells))
    table.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10)]))
    story.extend([Spacer(1, 8*mm), KeepTogether(table), _paragraph('هذه معاينة فقط؛ لا تعتمد مستندًا أو تثبت دفعًا أو توقيعًا.', meta, doc.width)])
    doc.build(story)
    return out.getvalue()
