"""Canonical bounded A4 layout. Coordinates use millimetres from the top left."""
import math
import re
from lib.rental_document_editor import normalize_editor

ROLES = ('owner', 'tenant', 'receiver', 'accountant')
PARTS = ('name', 'signature', 'fingerprint')
LANGUAGES = {'ar', 'en', 'bilingual'}


def normalize_presentation(value, fields=(), clauses=None):
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - {'version', 'paper', 'language', 'logo', 'signers', 'placements', 'typography', 'editor'}:
        raise ValueError('INVALID_DOCUMENT_PRESENTATION')
    if type(value.get('version')) not in (int, float) or value.get('version') != 1 or value.get('paper') != 'A4' or value.get('language') not in LANGUAGES:
        raise ValueError('INVALID_DOCUMENT_PRESENTATION')
    logo = value.get('logo')
    if not isinstance(logo, dict) or set(logo) != {'enabled', 'source'} or type(logo.get('enabled')) is not bool or logo.get('source') != 'property':
        raise ValueError('INVALID_DOCUMENT_LOGO')
    signers = value.get('signers')
    if not isinstance(signers, dict) or set(signers) - set(ROLES) or not {'owner', 'tenant'} <= set(signers):
        raise ValueError('INVALID_DOCUMENT_SIGNERS')
    normalized_signers = {}
    for role in ROLES:
        if role not in signers:
            continue
        flags = signers[role]
        if not isinstance(flags, dict) or set(flags) != set(PARTS) or any(type(flags[p]) is not bool for p in PARTS):
            raise ValueError('INVALID_DOCUMENT_SIGNERS')
        normalized_signers[role] = {p: flags[p] for p in PARTS}
    placements = value.get('placements')
    editor = normalize_editor(value['editor'],clauses) if 'editor' in value else None
    if not isinstance(placements, list) or len(placements) > 120:
        raise ValueError('INVALID_DOCUMENT_PLACEMENTS')
    extra_parts = ('civil_id','nationality')
    allowed = {f.get('key') for f in fields if isinstance(f, dict)} | {r+'_'+p for r in ROLES for p in PARTS+extra_parts}
    ids, placed = set(), []
    for item in placements:
        if not isinstance(item, dict) or set(item) != {'id', 'field_key', 'page', 'x_mm', 'y_mm', 'width_mm', 'height_mm', 'font_pt', 'language'}:
            raise ValueError('INVALID_DOCUMENT_PLACEMENT')
        if not isinstance(item['id'], str) or not 1 <= len(item['id']) <= 64 or not re.fullmatch(r'[a-zA-Z0-9_-]+', item['id']) or item['id'] in ids:
            raise ValueError('INVALID_DOCUMENT_PLACEMENT_ID')
        if item['field_key'] not in allowed or item['language'] not in LANGUAGES:
            raise ValueError('INVALID_DOCUMENT_PLACEMENT_FIELD')
        if type(item['page']) is not int or not 1 <= item['page'] <= 50:
            raise ValueError('INVALID_DOCUMENT_PLACEMENT_PAGE')
        for key in ['x_mm', 'y_mm', 'width_mm', 'height_mm', 'font_pt']:
            if type(item[key]) not in (int, float) or not math.isfinite(item[key]):
                raise ValueError('INVALID_DOCUMENT_PLACEMENT_SIZE')
        x, y, w, h, font = (item[k] for k in ['x_mm', 'y_mm', 'width_mm', 'height_mm', 'font_pt'])
        if x < 8 or y < 8 or w < 8 or h < 4 or x+w > 202+1e-8 or y+h > 289+1e-8 or not 8 <= font <= 36:
            raise ValueError('INVALID_DOCUMENT_PLACEMENT_SIZE')
        role, part = next(((r,item['field_key'][len(r)+1:]) for r in ROLES if item['field_key'].startswith(r+'_')),('',''))
        flags = (editor or {}).get('signers',{}).get('details',{}).get(role,{}) if part in extra_parts else normalized_signers.get(role,{})
        if item['field_key'] not in {f.get('key') for f in fields if isinstance(f, dict)} and role in ROLES and not flags.get(part):
            raise ValueError('LAYOUT_DISABLED_SIGNER')
        ids.add(item['id'])
        placed.append({k: (int(item[k]) if isinstance(item[k], (int, float)) and float(item[k]).is_integer() else item[k]) for k in ['id', 'field_key', 'page', 'x_mm', 'y_mm', 'width_mm', 'height_mm', 'font_pt', 'language']})
    normalized = {'version': 1, 'paper': 'A4', 'language': value['language'], 'logo': {'enabled': logo['enabled'], 'source': 'property'}, 'signers': normalized_signers, 'placements': placed}
    # Optional by design: opening an older draft must not change its digest or
    # the PDF bytes approved before document-wide formatting was introduced.
    if 'typography' in value:
        typography = value['typography']
        keys = {'font_pt', 'line_height', 'alignment', 'margin_mm'}
        if not isinstance(typography, dict) or set(typography) != keys:
            raise ValueError('INVALID_DOCUMENT_TYPOGRAPHY')
        for key, lower, upper in [('font_pt', 10, 18), ('line_height', 1.2, 2.2), ('margin_mm', 12, 25)]:
            if type(typography[key]) not in (int, float) or not math.isfinite(typography[key]) or not lower <= typography[key] <= upper:
                raise ValueError('INVALID_DOCUMENT_TYPOGRAPHY')
        if typography['alignment'] not in ('start', 'center', 'end', 'justify'):
            raise ValueError('INVALID_DOCUMENT_TYPOGRAPHY')
        normalized['typography'] = {key: (int(typography[key]) if type(typography[key]) in (int, float) and float(typography[key]).is_integer() else typography[key]) for key in ['font_pt', 'line_height', 'alignment', 'margin_mm']}
    if editor is not None:normalized['editor']=editor
    return normalized
