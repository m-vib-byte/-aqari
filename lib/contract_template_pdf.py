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
from lib.rental_document_layout import normalize_presentation, ROLES, PARTS
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image

if FONT not in pdfmetrics.getRegisteredFontNames():
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))

FIELD_KEY = re.compile(r'^[a-z][a-z0-9_]{1,49}$')
TOKEN = re.compile(r'\{\{([a-z][a-z0-9_]{1,49})\}\}')
ALIASES = {'civil_id': 'tenant_civil_id', 'nationality': 'tenant_nationality', 'floor': 'floor_no', 'tenant_passport': 'tenant_passport_no', 'contract_start_date': 'start_date', 'contract_end_date': 'end_date', 'owner_representative_name': 'representative_name'}
SIGNERS = {
    'employment_contract': [('owner', 'صاحب العمل'), ('tenant', 'الموظف')],
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
    allowed = {'id', 'revision', 'kind', 'kind_label', 'title', 'fields', 'clauses', 'presentation', 'family_id'}
    if set(template) - allowed:
        raise ValueError('INVALID_TEMPLATE')
    title, kind = template.get('title'), template.get('kind_label', '')
    clauses, fields = template.get('clauses'), template.get('fields', [])
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 200 or not isinstance(kind, str) or len(kind.strip()) > 80:
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
        # Validate original types before coercion can turn objects or booleans into text.
        candidates = [format_field((values or {})[k], {'type': 'text'}) for k in [canonical] + [a for a, c in ALIASES.items() if c == canonical] if (values or {}).get(k) is not None and (values or {}).get(k) != '']
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

    presentation = normalize_presentation(template.get('presentation'), fields, clauses)
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
    editor_signers = (presentation or {}).get('editor',{}).get('signers',{})
    signer_order = editor_signers.get('order',[]) + [role for role in ROLES if role not in editor_signers.get('order',[])]
    labels = dict(SIGNERS['rental_agreement'] + SIGNERS['rent_receipt'] + SIGNERS.get(template.get('kind'), []))
    signer_roles = [(r, labels[r]) for r in signer_order if any(presentation['signers'].get(r, {}).values()) or any(editor_signers.get('details',{}).get(r,{}).values())] if presentation else SIGNERS.get(template.get('kind'), SIGNERS['rental_agreement'])
    if presentation is None and values is None:
        signer_roles = (SIGNERS['employment_contract'] if template.get('kind') == 'employment_contract' else SIGNERS['rental_agreement']) + (SIGNERS['rent_receipt'] if template.get('kind') == 'rent_receipt' else [])
    for role, label in signer_roles:
        employment = template.get('kind') == 'employment_contract'
        name_key = ({'owner':'employer_name','tenant':'employee_name'}.get(role, role + '_name') if employment else role + '_name')
        if not employment and role == 'owner' and (values or {}).get('representative_name'):
            name_key = 'representative_name'
            label = 'وكيل المالك المفوض'
        name = format_field((values or {}).get(name_key), {'type': 'text'}) if not presentation or presentation['signers'].get(role, {}).get('name') else ''
        signature={'role': role, 'label': label, 'name': name}
        details=editor_signers.get('details',{}).get(role)
        if details is not None:
            value_role=({'owner':'employer','tenant':'employee'}.get(role,role) if employment else 'representative' if role=='owner' and (values or {}).get('representative_name') else role)
            for part,display_key,show_key in [('civil_id','civilId','showCivilId'),('nationality','nationality','showNationality')]:
                signature[show_key]=details[part]
                key=value_role+'_'+part
                candidates=[(values or {}).get(k) for k in [key]+[alias for alias,canonical in ALIASES.items() if canonical==key] if (values or {}).get(k) is not None and (values or {}).get(k)!='']
                if details[part] and len({str(item).strip() for item in candidates})>1:raise ValueError('FIELD_ALIAS_CONFLICT')
                selected=format_field(candidates[0] if candidates else None,{'type':'text'}) if details[part] else ''
                signature[display_key]=selected
                if details[part]:raw_values[key]=selected
        signatures.append(signature)
    for key in ['tenant_name', 'owner_name', 'representative_name', 'receiver_name', 'accountant_name']:
        raw_values[key] = next((str((values or {})[k]).strip() for k in [key] + [a for a, c in ALIASES.items() if c == key] if (values or {}).get(k) is not None and (values or {}).get(k) != ''), '')
    return {'presentation': presentation, 'kind': template.get('kind', ''), 'values': raw_values, 'title': substitute(title), 'kind_label': substitute(kind), 'clauses': normalized,
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


LABELS = {
    'employer': ('صاحب العمل', 'Employer'), 'employee': ('الموظف', 'Employee'),
    'owner': ('المالك / الوكيل المفوض', 'Owner / authorized agent'),
    'representative': ('وكيل المالك المفوض', 'Authorized owner agent'),
    'tenant': ('المستأجر', 'Tenant'), 'receiver': ('المستلم', 'Receiver'),
    'accountant': ('المحاسب', 'Accountant'), 'name': ('الاسم', 'Name'),
    'signature': ('التوقيع', 'Signature'), 'fingerprint': ('البصمة', 'Fingerprint'),
    'civil_id': ('الرقم المدني', 'Civil ID'), 'nationality': ('الجنسية', 'Nationality'),
    'draft': ('معاينة غير معتمدة', 'Unapproved preview'),
    'footer': ('معاينة فقط؛ لا تثبت دفعاً أو توقيعاً أو اعتماداً.', 'Preview only; no payment, signature or approval is recorded.'),
    'page': ('صفحة', 'Page'),
}


def localized(key, language):
    ar, en = LABELS[key]
    return en if language == 'en' else ar + ' / ' + en if language == 'bilingual' else ar


def _visual(value):
    return shaped(value) if re.search(r'[\u0600-\u06ff]', value) else value


def logical_lines(value, width, font_size):
    """Wrap before bidi shaping, preserving paragraph order and every source word."""
    if width <= 0:
        raise ValueError('LAYOUT_FIELD_OVERFLOW')
    lines = []
    for original in str(value).split('\n'):
        current = ''
        for word in original.split():
            candidate = (current + ' ' + word).strip()
            if pdfmetrics.stringWidth(_visual(candidate), FONT, font_size) <= width:
                current = candidate
                continue
            if current:
                lines.append(current)
                current = ''
            if pdfmetrics.stringWidth(_visual(word), FONT, font_size) <= width:
                current = word
                continue
            # Split only genuinely overlong words, not every ordinary word.
            for char in word:
                if current and pdfmetrics.stringWidth(_visual(current+char), FONT, font_size) > width:
                    lines.append(current)
                    current = ''
                current += char
        lines.append(current.rstrip())
    return lines


def sanitized_logo(raw, mime_type=None):
    """Only a small decoded raster is accepted; no SVG, URLs or embedded scripts."""
    if raw is None:
        return None
    if not isinstance(raw, bytes) or not 1 <= len(raw) <= 25*1024*1024:
        raise ValueError('INVALID_PROPERTY_LOGO')
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.format not in {'PNG', 'JPEG', 'WEBP'} or getattr(source, 'n_frames', 1) != 1:
                raise ValueError('INVALID_PROPERTY_LOGO')
            if mime_type is not None and mime_type != {'PNG':'image/png','JPEG':'image/jpeg','WEBP':'image/webp'}[source.format]:
                raise ValueError('INVALID_PROPERTY_LOGO')
            if source.width < 1 or source.height < 1 or source.width > 4096 or source.height > 4096 or source.width*source.height > 8000000:
                raise ValueError('INVALID_PROPERTY_LOGO')
            source.load()
            result = source.convert('RGBA' if source.mode in {'RGBA', 'LA'} else 'RGB')
            result.thumbnail((1200,1200))
            out=BytesIO();result.save(out, format='PNG')
            return out.getvalue()
    except (OSError, Image.DecompressionBombError) as exc:
        raise ValueError('INVALID_PROPERTY_LOGO') from exc


def render_contract_template(template, values=None, logo_bytes=None):
    resolved = render_document_template(template, values)
    presentation = resolved['presentation']
    if presentation and 'editor' in presentation:
        from lib.rental_document_editor_pdf import render_editor_pdf
        return render_editor_pdf(template,resolved,sanitized_logo(logo_bytes) if presentation['logo']['enabled'] else None)
    language = presentation['language'] if presentation else 'ar'
    typography = presentation.get('typography') if presentation else None
    logo = sanitized_logo(logo_bytes) if presentation and presentation['logo']['enabled'] else None
    placements = presentation['placements'] if presentation else []
    pages = {1: []}
    reserved = {}
    for item in placements:
        page = item['page']
        pages.setdefault(page, [])
        reserved.setdefault(page, []).append((item['y_mm']*mm-2, (item['y_mm']+item['height_mm'])*mm+2))
    if logo:
        reserved.setdefault(1, []).append((8*mm, 36*mm))
    # Overlapping explicit fields are an editing error, never a clipped PDF.
    for index, a in enumerate(placements):
        for b in placements[index+1:]:
            if a['page']==b['page'] and a['x_mm']<b['x_mm']+b['width_mm'] and b['x_mm']<a['x_mm']+a['width_mm'] and a['y_mm']<b['y_mm']+b['height_mm'] and b['y_mm']<a['y_mm']+a['height_mm']:
                raise ValueError('LAYOUT_FIELDS_OVERLAP')
        if logo and a['page']==1 and a['y_mm']<36 and a['y_mm']+a['height_mm']>8:
            raise ValueError('LAYOUT_LOGO_OVERLAP')
    margin = typography['margin_mm']*mm if typography else 18*mm
    current_page, y = 1, margin
    width, height = A4
    content_width = width-2*margin
    bottom = height-margin if typography else 279*mm

    def available(block_height):
        nonlocal current_page, y
        while True:
            if current_page > 50:
                raise ValueError('DOCUMENT_PAGE_LIMIT')
            pages.setdefault(current_page, [])
            conflict = next((band for band in sorted(reserved.get(current_page, [])) if y < band[1] and y+block_height > band[0]), None)
            if conflict:
                y = conflict[1]+3*mm
                continue
            if y+block_height > bottom:
                current_page += 1
                y = margin
                continue
            return

    def add_text(value, font=10.5, leading=17, alignment=None, color='#2f2924', gap=0):
        nonlocal y
        alignment = alignment or ('left' if language == 'en' else 'right')
        direction_start = 'left' if language == 'en' else 'right'
        if alignment == 'start':
            alignment = direction_start
        elif alignment == 'end':
            alignment = 'right' if language == 'en' else 'left'
        lines=[]
        for paragraph in str(value).split('\n'):
            wrapped=logical_lines(paragraph, content_width, font)
            for index,line in enumerate(wrapped):
                # Justify complete wrapped lines only. The final line of each
                # paragraph retains the logical start for its document language.
                line_alignment = direction_start if alignment == 'justify' and index == len(wrapped)-1 else alignment
                lines.append((line,line_alignment))
        for line,line_alignment in lines:
            available(leading)
            pages[current_page].append(('text',line,margin,y+font,content_width,font,line_alignment,color))
            y+=leading
        y+=gap

    add_text(resolved['title'],18,27,'center','#4b321f',4*mm)
    # The bound document is the exact final artifact reviewed before issuance.
    # Approval state belongs in the UI/archive, never in bytes changed afterwards.
    meta_text = resolved['kind_label'] + (' - '+localized('draft',language) if values is None else '')
    if meta_text.strip():
        add_text(meta_text,9,15,'center','#765b43',5*mm)
    for clause in resolved['clauses']:
        add_text(clause['title'],12,19,color='#56391f',gap=2*mm)
        if typography:
            add_text(clause['text'],typography['font_pt'],typography['font_pt']*typography['line_height'],typography['alignment'],gap=4*mm)
        else:
            add_text(clause['text'],10.5,17,gap=4*mm)

    placed_keys={p['field_key'] for p in placements}
    # The explicitly selected signer fields are blank spaces; no mark is invented.
    for signer in resolved['signatures']:
        role=signer['role']
        flags=presentation['signers'].get(role,{}) if presentation else dict.fromkeys(PARTS,True)
        parts=[part for part in PARTS if flags.get(part) and role+'_'+part not in placed_keys]
        if not parts:
            continue
        required_height=(8+len(parts)*11)*mm
        available(required_height)
        label_role=({'owner':'employer','tenant':'employee'}.get(role,role) if resolved.get('kind')=='employment_contract' else 'representative' if role=='owner' and signer['label']=='وكيل المالك المفوض' else role)
        add_text(localized(label_role,language),11,18,color='#56391f',gap=2*mm)
        for part in parts:
            value=signer['name'] if part=='name' else ''
            add_text(localized(part,language)+': '+(value or '........................................'),10,18,gap=4*mm)

    specs={f['key']:f for f in template.get('fields',[])}
    rendered_fields={f['key']:f['value'] for f in resolved['fields']}
    names={s['role']:s for s in resolved['signatures']}
    for item in placements:
        key=item['field_key'];lang=item['language'];font=item['font_pt']
        x,top,w,h=(item[k]*mm for k in ['x_mm','y_mm','width_mm','height_mm'])
        match=re.fullmatch(r'(owner|tenant|receiver|accountant)_(name|signature|fingerprint)',key)
        if match and key not in specs:
            role,part=match.groups()
            flags=presentation['signers'].get(role,{})
            if not flags.get(part):
                raise ValueError('LAYOUT_DISABLED_SIGNER')
            signer=names.get(role,{})
            role_label=({'owner':'employer','tenant':'employee'}.get(role,role) if resolved.get('kind')=='employment_contract' else 'representative' if role=='owner' and signer.get('label')=='وكيل المالك المفوض' else role)
            value=signer.get('name','') if part=='name' else ''
            label=localized(role_label,lang)+' - '+localized(part,lang)
            content=label+': '+value if part=='name' else label
        else:
            label=specs[key]['label']
            content=rendered_fields[key] or ('«'+label+'»' if values is None else '')
        lines=logical_lines(content,w-4*mm,font)
        leading=font*1.35
        if len(lines)*leading+3*mm > h:
            raise ValueError('LAYOUT_FIELD_OVERFLOW:'+item['id'])
        pages[item['page']].append(('rect',x,top,w,h))
        for offset,line in enumerate(lines):
            pages[item['page']].append(('text',line,x+2*mm,top+1.5*mm+font+offset*leading,w-4*mm,font,'left' if lang=='en' else 'right','#2f2924'))
    count=max(pages)
    output=BytesIO()
    pdf=canvas.Canvas(output,pagesize=A4,invariant=True,pageCompression=1)
    pdf.setTitle(resolved['title']);pdf.setAuthor('AQARI')
    for page in range(1,count+1):
        if logo and page==1:
            pdf.drawImage(ImageReader(BytesIO(logo)),(width-30*mm)/2,height-34*mm,width=30*mm,height=24*mm,preserveAspectRatio=True,anchor='c',mask='auto')
        for item in pages.get(page,[]):
            if item[0]=='rect':
                _,x,top,w,h=item
                pdf.setStrokeColor(colors.HexColor('#cbb99f'));pdf.setLineWidth(.45)
                pdf.rect(x,height-top-h,w,h,stroke=1,fill=0)
            else:
                _,line,x,top,w,font,alignment,color=item
                pdf.setFillColor(colors.HexColor(color));pdf.setFont(FONT,font)
                visual=_visual(line)
                if alignment=='right':pdf.drawRightString(x+w,height-top,visual)
                elif alignment=='center':pdf.drawCentredString(x+w/2,height-top,visual)
                elif alignment=='justify' and ' ' in visual:
                    text=pdf.beginText(x,height-top)
                    text.setFont(FONT,font)
                    text.setWordSpace(max(0,(w-pdfmetrics.stringWidth(visual,FONT,font))/visual.count(' ')))
                    text.textOut(visual)
                    pdf.drawText(text)
                else:pdf.drawString(x,height-top,visual)
        pdf.setFillColor(colors.HexColor('#765b43'));pdf.setFont(FONT,8)
        pdf.drawCentredString(width/2,5*mm,_visual(localized('page',language)+' '+str(page)+' / '+str(count)+' - A4'))
        pdf.showPage()
    pdf.save()
    return output.getvalue()
