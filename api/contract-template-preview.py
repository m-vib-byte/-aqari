"""Manager-only PDF previews. Reads only; never saves, approves, signs or collects."""
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError
import hashlib
import importlib.util
import json
import re

spec = importlib.util.spec_from_file_location('rent_receipt_common', Path(__file__).with_name('rent-receipt.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
from lib.contract_template_pdf import render_contract_template, render_document_template
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
    return hashlib.sha256(json.dumps(shape, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def prepare_preview(data, auth, rpc_call=rpc, read=common.upstream):
    if (not isinstance(data, dict) or set(data) - {'workspaceId', 'template', 'document'}
            or not {'workspaceId', 'template'} <= set(data)
            or not isinstance(data['workspaceId'], str) or not common.UUID.fullmatch(data['workspaceId'])):
        raise ValueError('INVALID_REQUEST')
    if not isinstance(auth, str) or len(auth) > 8192 or not re.fullmatch(r'Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', auth):
        raise PermissionError('AUTH_REQUIRED')
    workspace, template = data['workspaceId'], data['template']
    initial_context = _context(workspace, auth, rpc_call)
    values, digest = None, None
    if 'document' in data:
        selection = data['document']
        if (not isinstance(selection, dict) or set(selection) - {'contractId', 'tenantId', 'receiptId', 'values', 'previewDigest'}
                or isinstance(selection.get('contractId'), bool) or not isinstance(selection.get('contractId'), (str, int))
                or not 1 <= len(text(selection['contractId'])) <= 150):
            raise ValueError('INVALID_DOCUMENT')
        for key in ['tenantId', 'receiptId']:
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
        digest = document_digest(resolved)
        if selection.get('previewDigest') and digest != selection['previewDigest']:
            raise ValueError('DOCUMENT_PREVIEW_CHANGED')
        final_context = _context(workspace, auth, rpc_call)
        if final_context.get('user_id') != initial_context.get('user_id'):
            raise PermissionError('ACCESS_DENIED')
    return render_contract_template(template, values), digest


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
            self.send_header('Content-Disposition', 'attachment; filename="aqari-rental-document-preview.pdf"')
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
            if not 0 < size <= 120000:
                raise ValueError('INVALID_REQUEST')
            pdf, digest = prepare_preview(json.loads(self.rfile.read(size)), self.headers.get('Authorization'))
            self.respond(200, pdf, 'application/pdf', digest)
        except (PermissionError, HTTPError):
            self.respond(403, b'{"error":"ACCESS_DENIED"}')
        except (ValueError, KeyError, TypeError) as exc:
            if str(exc) == 'DOCUMENT_PREVIEW_CHANGED':
                self.respond(409, b'{"error":"DOCUMENT_PREVIEW_CHANGED"}')
            else:
                self.respond(400, b'{"error":"INVALID_TEMPLATE"}')
        except Exception:
            self.respond(503, b'{"error":"PREVIEW_UNAVAILABLE"}')
