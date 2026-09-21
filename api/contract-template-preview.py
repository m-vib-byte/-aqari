"""Manager-only PDF previews. Reads only; never saves, approves, signs or collects."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, build_opener
from urllib.error import HTTPError
import hashlib
import importlib.util
import json
import re

spec = importlib.util.spec_from_file_location('rent_receipt_common', Path(__file__).with_name('rent-receipt.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
from lib.contract_template_pdf import render_contract_template, render_document_template, sanitized_logo
from lib.rental_document_context import LINKED_FIELDS, exactly, resolve_document_values, text


def rpc(name, payload, auth):
    return common.upstream('/rest/v1/rpc/' + name, auth, payload)


def _context(workspace, auth, rpc_call):
    context = rpc_call('aqari_rental_templates', {'p_workspace_id': workspace, 'p_action': 'context', 'p_data': {}}, auth)
    if not isinstance(context, dict) or context.get('workspace_id') != workspace or context.get('can_publish') is not True:
        raise PermissionError('ACCESS_DENIED')
    return context


def _record(table, workspace, column, value, auth, read):
    rows = read('/rest/v1/' + table + '?' + urlencode({'select': '*', 'workspace_id': 'eq.' + workspace, column: 'eq.' + str(value), 'limit': '2'}), auth)
    row = exactly(rows, 'DOCUMENT_LINK_NOT_FOUND')
    if row.get('workspace_id') != workspace:
        raise PermissionError('ACCESS_DENIED')
    return row


def document_digest(resolved):
    values = resolved['values']
    shape = [resolved['title'], resolved['kind'], resolved['kind_label'], [[c['title'], c['text']] for c in resolved['clauses']], sorted(values.items()), [[s['role'], s['label'], s['name']] for s in resolved['signatures']]]
    if resolved.get('presentation') is not None:
        shape.append(resolved['presentation'])
    return hashlib.sha256(json.dumps(shape, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def storage_logo_bytes(row, auth):
    """Only the configured Supabase bucket is accessed, using the caller's token."""
    path = row.get('storage_path')
    if (row.get('storage_bucket', 'aqari-documents') != 'aqari-documents' or not isinstance(path, str)
            or not 1 <= len(path) <= 1024 or path.startswith('/') or '\\' in path
            or any(part in {'', '.', '..'} for part in path.split('/'))
            or any(ord(c) < 32 or ord(c) == 127 for c in path)):
        raise ValueError('INVALID_PROPERTY_LOGO_PATH')
    size = row.get('size_bytes')
    if type(size) is not int or not 1 <= size <= 2*1024*1024 or row.get('mime_type') not in {'image/png', 'image/jpeg'}:
        raise ValueError('INVALID_PROPERTY_LOGO')
    url, key = common.config()
    encoded = '/'.join(quote(part, safe='') for part in path.split('/'))
    req = Request(url+'/storage/v1/object/authenticated/aqari-documents/'+encoded, method='GET', headers={'Authorization': auth, 'apikey': key, 'Accept': row['mime_type']})
    with build_opener(common.NoRedirect).open(req, timeout=10) as response:
        raw = response.read(size+1)
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != row.get('checksum_sha256'):
        raise ValueError('PROPERTY_LOGO_INTEGRITY_FAILED')
    return raw


def load_property_logo(workspace, property_row, master, auth, read=common.upstream, storage=storage_logo_bytes):
    prop = master.get('property') if isinstance(master, dict) else None
    assets = prop.get('assets') if isinstance(prop, dict) else None
    logo_id = assets.get('logo') if isinstance(assets, dict) else None
    if not logo_id:
        return None, None
    if not isinstance(logo_id, str) or not common.UUID.fullmatch(logo_id):
        raise ValueError('INVALID_PROPERTY_LOGO')
    row = _record('aqari_documents', workspace, 'id', logo_id, auth, read)
    property_refs = {str(property_row.get(k, '')) for k in ['id', 'external_ref', 'externalRef']} - {''}
    if row.get('status') != 'uploaded' or row.get('entity_type') != 'property' or str(row.get('entity_ref')) not in property_refs:
        raise PermissionError('PROPERTY_LOGO_SCOPE_MISMATCH')
    if row.get('mime_type') not in {'image/png', 'image/jpeg'}:
        return None, None
    raw = storage(row, auth)
    sanitized = sanitized_logo(raw)
    return sanitized, {'id': logo_id, 'checksum_sha256': row.get('checksum_sha256'), 'size_bytes': row.get('size_bytes'), 'mime_type': row.get('mime_type')}


def render_source_preview(source, extras, workspace, auth, read=common.upstream, storage=storage_logo_bytes):
    """Render the canonical source RPC snapshot for an explicitly approved issue."""
    if not isinstance(source, dict) or not isinstance(extras, dict):
        raise ValueError('INVALID_DOCUMENT_SOURCE')
    original = source.get('template')
    if not isinstance(original, dict):
        raise ValueError('INVALID_DOCUMENT_SOURCE')
    template = {key: original[key] for key in ['id', 'family_id', 'kind', 'kind_label', 'title', 'fields', 'clauses', 'presentation'] if key in original}
    template.setdefault('kind_label', '')
    declared = {field['key'] for field in template.get('fields', [])}
    if set(extras)-declared or any(key in LINKED_FIELDS for key in extras):
        raise ValueError('LINKED_FIELD_OVERRIDE')
    contract, lease, tenant = source.get('contract'), source.get('lease'), source.get('tenant')
    prop, unit = source.get('property_row'), source.get('unit_row')
    master = {'property': source.get('property'), 'unit': source.get('unit')}
    if not all(isinstance(row, dict) for row in [contract, lease, tenant, prop, unit]):
        raise ValueError('INVALID_DOCUMENT_SOURCE')
    if any(row.get('workspace_id') != workspace for row in [lease, tenant, prop, unit]):
        raise PermissionError('ACCESS_DENIED')
    payload = {'contractsV202': [contract], 'tenantProfilesV267': [tenant['profile']] if isinstance(tenant.get('profile'), dict) else []}
    selection = {'contractId': str(contract.get('id', ''))}
    payment=source.get('receipt')
    if payment:
        selection['receiptId']=payment['id']
    values=resolve_document_values(payload,selection,lease,tenant,prop,unit,master,payment)
    values.update(extras)
    resolved=render_document_template(template,values)
    logo_bytes=logo_snapshot=None
    if resolved.get('presentation') and resolved['presentation']['logo']['enabled']:
        logo_bytes,logo_snapshot=load_property_logo(workspace,prop,master,auth,read,storage)
    return {'pdf':render_contract_template(template,values,logo_bytes),'digest':document_digest(resolved),'resolved':resolved,'values':values,'logo_snapshot':logo_snapshot}


def prepare_preview(data, auth, rpc_call=rpc, read=common.upstream):
    if (not isinstance(data, dict) or set(data) - {'workspaceId', 'template', 'document', 'previewPropertyId'}
            or not {'workspaceId', 'template'} <= set(data)
            or not isinstance(data['workspaceId'], str) or not common.UUID.fullmatch(data['workspaceId'])):
        raise ValueError('INVALID_REQUEST')
    if not isinstance(auth, str) or len(auth) > 8192 or not re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', auth):
        raise PermissionError('AUTH_REQUIRED')
    if 'previewPropertyId' in data and (not isinstance(data['previewPropertyId'], str) or not common.UUID.fullmatch(data['previewPropertyId'])):
        raise ValueError('INVALID_PREVIEW_PROPERTY')
    workspace, template = data['workspaceId'], data['template']
    initial_context = _context(workspace, auth, rpc_call)
    values, digest, logo_bytes = None, None, None
    if 'document' in data:
        selection = data['document']
        if (not isinstance(selection, dict) or set(selection) - {'contractId', 'tenantId', 'propertyId', 'receiptId', 'values', 'previewDigest'}
                or isinstance(selection.get('contractId'), bool) or not isinstance(selection.get('contractId'), (str, int))
                or not 1 <= len(text(selection['contractId'])) <= 150):
            raise ValueError('INVALID_DOCUMENT')
        for key in ['tenantId', 'propertyId', 'receiptId']:
            if key in selection and (not isinstance(selection[key], str) or not 1 <= len(selection[key]) <= 150):
                raise ValueError('INVALID_DOCUMENT')
        if 'previewDigest' in selection and (not isinstance(selection['previewDigest'], str) or not re.fullmatch(r'[a-f0-9]{64}', selection['previewDigest'])):
            raise ValueError('INVALID_DOCUMENT')
        extras = selection.get('values', {})
        if not isinstance(extras, dict) or len(extras) > 50 or any(k in LINKED_FIELDS for k in extras):
            raise ValueError('LINKED_FIELD_OVERRIDE')
        # Validate declaration and tokens before retrieving record data.
        render_document_template(template)
        declared = {field['key'] for field in template.get('fields', [])}
        if set(extras) - declared:
            raise ValueError('UNKNOWN_DOCUMENT_FIELD')
        state = rpc_call('aqari_read_state_v267', {'p_workspace_id': workspace}, auth)
        if not isinstance(state, dict) or state.get('workspace_id') != workspace or not isinstance(state.get('payload'), dict):
            raise PermissionError('ACCESS_DENIED')
        lease = _record('aqari_leases', workspace, 'external_ref', selection['contractId'], auth, read)
        tenant = _record('aqari_tenants', workspace, 'id', lease.get('tenant_id'), auth, read)
        unit = _record('aqari_units', workspace, 'id', lease.get('unit_id'), auth, read)
        property_row = _record('aqari_properties', workspace, 'id', unit.get('property_id'), auth, read)
        if (selection.get('propertyId') and selection['propertyId'] != property_row.get('id')) or (data.get('previewPropertyId') and data['previewPropertyId'] != property_row.get('id')):
            raise ValueError('PROPERTY_LINK_MISMATCH')
        master = rpc_call('aqari_property_contract_context', {'p_workspace_id': workspace, 'p_property_id': property_row['id'], 'p_unit_id': unit['id']}, auth)
        if (not isinstance(master, dict) or master.get('workspace_id') != workspace
                or master.get('user_id') != initial_context.get('user_id')):
            raise PermissionError('ACCESS_DENIED')
        payment = None
        if selection.get('receiptId'):
            payment = _record('aqari_rent_payments', workspace, 'id' if common.UUID.fullmatch(selection['receiptId']) else 'reference', selection['receiptId'], auth, read)
            if payment.get('lease_id') != lease['id']:
                raise ValueError('RECEIPT_CONTRACT_MISMATCH')
            eligible = rpc_call('aqari_official_document_context', {'p_workspace_id': workspace, 'p_kind': 'rent_receipt', 'p_entity_id': lease['id'], 'p_source_id': payment['id'], 'p_fields': {}}, auth)
            if (not isinstance(eligible, dict) or eligible.get('workspace_id') != workspace
                    or eligible.get('user_id') != initial_context.get('user_id')
                    or eligible.get('entity_id') != lease['id'] or eligible.get('source_id') != payment['id']
                    or not any(isinstance(row, dict) and row.get('id') == payment['id'] for row in eligible.get('sources', []))):
                raise PermissionError('RECEIPT_NOT_ELIGIBLE')
        values = resolve_document_values(state['payload'], selection, lease, tenant, property_row, unit, master, payment)
        if template.get('kind') == 'rent_receipt' and not selection.get('receiptId'):
            raise ValueError('SAVED_RECEIPT_REQUIRED')
        values.update(extras)
        resolved = render_document_template(template, values)
        # Published templates must satisfy the same current property eligibility
        # and canonical source binding used by final issuance. Unsaved editor
        # previews remain manager-only and never create an issued document.
        published = any(isinstance(item, dict) and item.get('id') == template.get('id') for item in initial_context.get('items', []))
        if published:
            source_result = rpc_call('aqari_rental_document_source', {'p_workspace_id': workspace, 'p_template_id': template['id'], 'p_lease_id': lease['id'], 'p_receipt_id': payment['id'] if payment else None}, auth)
            if (not isinstance(source_result, dict) or source_result.get('workspace_id') != workspace
                    or source_result.get('user_id') != initial_context.get('user_id') or not isinstance(source_result.get('source'), dict)):
                raise PermissionError('ACCESS_DENIED')
            source = source_result['source']
            if any(not isinstance(source.get(key), dict) or source[key].get('id') != expected for key, expected in [('lease', lease['id']), ('tenant', tenant['id']), ('property_row', property_row['id']), ('unit_row', unit['id'])]):
                raise ValueError('DOCUMENT_PREVIEW_CHANGED')
            source_receipt = source.get('receipt')
            if (source_receipt.get('id') if isinstance(source_receipt, dict) else None) != (payment['id'] if payment else None):
                raise ValueError('DOCUMENT_PREVIEW_CHANGED')
            saved_template = source.get('template', {})
            for key in ['id', 'kind', 'title', 'fields', 'clauses']:
                if saved_template.get(key, [] if key == 'fields' else None) != template.get(key, [] if key == 'fields' else None):
                    raise ValueError('DOCUMENT_PREVIEW_CHANGED')
            if saved_template.get('kind_label', '') != template.get('kind_label', '') or saved_template.get('presentation') != template.get('presentation'):
                raise ValueError('DOCUMENT_PREVIEW_CHANGED')
            rendered = render_source_preview(source, extras, workspace, auth, read)
            if selection.get('previewDigest') and rendered['digest'] != selection['previewDigest']:
                raise ValueError('DOCUMENT_PREVIEW_CHANGED')
            final_context = _context(workspace, auth, rpc_call)
            if final_context.get('user_id') != initial_context.get('user_id'):
                raise PermissionError('ACCESS_DENIED')
            return rendered['pdf'], rendered['digest']
        if resolved.get('presentation') and resolved['presentation']['logo']['enabled']:
            logo_bytes, _ = load_property_logo(workspace, property_row, master, auth, read)
        digest = document_digest(resolved)
        if selection.get('previewDigest') and digest != selection['previewDigest']:
            raise ValueError('DOCUMENT_PREVIEW_CHANGED')
        final_context = _context(workspace, auth, rpc_call)
        if final_context.get('user_id') != initial_context.get('user_id'):
            raise PermissionError('ACCESS_DENIED')
    if digest is None:
        resolved = render_document_template(template, values)
        if data.get('previewPropertyId'):
            property_row = _record('aqari_properties', workspace, 'id', data['previewPropertyId'], auth, read)
            if property_row.get('id') != data['previewPropertyId']:
                raise PermissionError('ACCESS_DENIED')
            master = rpc_call('aqari_property_contract_context', {'p_workspace_id': workspace, 'p_property_id': property_row['id'], 'p_unit_id': None}, auth)
            if (not isinstance(master, dict) or master.get('workspace_id') != workspace
                    or master.get('user_id') != initial_context.get('user_id')
                    or not isinstance(master.get('property'), dict) or master['property'].get('id') != property_row['id']):
                raise PermissionError('ACCESS_DENIED')
            if resolved.get('presentation') and resolved['presentation']['logo']['enabled']:
                logo_bytes, _ = load_property_logo(workspace, property_row, master, auth, read)
            if _context(workspace, auth, rpc_call).get('user_id') != initial_context.get('user_id'):
                raise PermissionError('ACCESS_DENIED')
        digest = document_digest(resolved)
    return render_contract_template(template, values, logo_bytes), digest


def export_preview(data, auth, rpc_call=rpc, read=common.upstream):
    """Preserve the existing template-only API and its bytes return value."""
    return prepare_preview(data, auth, rpc_call, read)[0]


class handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body, mime='application/json; charset=utf-8', digest=None):
        self.send_response(status)
        for key, value in [('Content-Type', mime), ('Cache-Control', 'private, no-store, max-age=0'), ('Vercel-CDN-Cache-Control', 'no-store'), ('Vary', 'Authorization'), ('X-Content-Type-Options', 'nosniff')]:
            self.send_header(key, value)
        if mime == 'application/pdf':
            self.send_header('Content-Disposition', 'inline; filename="aqari-rental-document-preview.pdf"')
            self.send_header('X-Aqari-PDF-SHA256', hashlib.sha256(body).hexdigest())
        if digest:
            self.send_header('X-Aqari-Document-SHA256', digest)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            origin = self.headers.get('Origin')
            if origin and origin != 'https://' + self.headers.get('Host', ''):
                raise PermissionError('ORIGIN_REJECTED')
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 150000:
                raise ValueError('INVALID_REQUEST')
            pdf, digest = prepare_preview(json.loads(self.rfile.read(size)), self.headers.get('Authorization'))
            self.respond(200, pdf, 'application/pdf', digest)
        except (PermissionError, HTTPError):
            self.respond(403, b'{"error":"ACCESS_DENIED"}')
        except (ValueError, KeyError, TypeError) as exc:
            if str(exc) == 'DOCUMENT_PREVIEW_CHANGED':
                self.respond(409, b'{"error":"DOCUMENT_PREVIEW_CHANGED"}')
            elif str(exc).startswith('LAYOUT_'):
                self.respond(400, json.dumps({'error': str(exc).split(':')[0], 'message': 'راجع مواضع الحقول: زد حجم الحقل الذي لا يتسع للنص، وأبعد الحقول المتداخلة عن بعضها وعن الشعار.'}, ensure_ascii=False).encode())
            else:
                self.respond(400, b'{"error":"INVALID_TEMPLATE"}')
        except Exception:
            self.respond(503, b'{"error":"PREVIEW_UNAVAILABLE"}')
