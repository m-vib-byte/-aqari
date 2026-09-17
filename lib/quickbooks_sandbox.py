"""Explicit Sandbox-only journal transport; not an enabled accounting integration.

Trusted server callers must supply an authorized, approved journal with mapped
external account IDs. OAuth acquisition/refresh and durable outbox reconciliation
remain separate. No production endpoint or automatic retries are exposed here.
"""
import hashlib
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener
from lib.accounting_provider_maps import accounting_provider_payload
from lib.integration_dispatch import NoRedirect

ORIGIN = 'https://sandbox-quickbooks.api.intuit.com'

def send_sandbox_journal(journal, *, realm_id, home_currency, access_token, open_url=None):
    """Return a provider acknowledgement, never a claim of reconciled posting.

    A caller must not change a journal under an existing idempotency key, and
    must retain its payload hash and acknowledgement durably before scheduling
    any subsequent work. Ambiguous outcomes require reconciliation, not retry.
    """
    if not isinstance(realm_id, str) or not re.fullmatch(r'[0-9]{1,30}', realm_id):
        raise ValueError('INVALID_QUICKBOOKS_REALM')
    if not isinstance(home_currency, str) or not re.fullmatch(r'[A-Z]{3}', home_currency):
        raise ValueError('HOME_CURRENCY_REQUIRED')
    if not isinstance(access_token, str) or not 16 <= len(access_token) <= 8192 or re.search(r'\s|[\x00-\x1f\x7f]', access_token):
        raise ValueError('OAUTH_ACCESS_TOKEN_REQUIRED')
    payload = accounting_provider_payload('quickbooks', journal, {'home_currency': home_currency})
    # Stable across attempts for the same company's immutable journal.
    request_id = hashlib.sha256((realm_id + ':' + journal['idempotency_key']).encode()).hexdigest()[:40]
    body = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
    digest = hashlib.sha256(body).hexdigest()
    request = Request(ORIGIN + '/v3/company/' + realm_id + '/journalentry?requestid=' + request_id,
                      data=body, method='POST', headers={
                          'Authorization': 'Bearer ' + access_token,
                          'Accept': 'application/json', 'Content-Type': 'application/json'})
    send = open_url or build_opener(NoRedirect).open
    def result(status, reference=None, error=None):
        return {'status': status, 'provider_reference': reference, 'request_id': request_id,
                'payload_sha256': digest, 'error': error, 'environment': 'sandbox'}
    try:
        with send(request, timeout=15) as response:
            if not 200 <= response.status < 300:
                raise HTTPError(request.full_url, response.status, 'provider error', {}, None)
            raw = response.read(262145)
            if len(raw) > 262144:
                return result('reconciliation_required', error='RESPONSE_TOO_LARGE')
            value = json.loads(raw)
            entry = value.get('JournalEntry') if isinstance(value, dict) and 'Fault' not in value else None
            reference = entry.get('Id') if isinstance(entry, dict) else None
            if not isinstance(reference, str) or not re.fullmatch(r'[0-9]{1,100}', reference):
                return result('reconciliation_required', error='JOURNAL_ACKNOWLEDGEMENT_REQUIRED')
            return result('accepted', reference)
    except HTTPError as exc:
        # A timeout or server failure can occur after posting. Preserve request ID.
        ambiguous = exc.code in (408, 425, 429) or 500 <= exc.code <= 599
        return result('reconciliation_required' if ambiguous else 'rejected', error='PROVIDER_HTTP_' + str(exc.code))
    except (URLError, TimeoutError, OSError):
        return result('reconciliation_required', error='PROVIDER_NETWORK_ERROR')
    except (ValueError, UnicodeError):
        return result('reconciliation_required', error='INVALID_PROVIDER_RESPONSE')
