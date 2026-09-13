"""Fail-closed journal payload maps for supported accounting providers.

The functions in this module are pure: they validate and map one balanced AQARI
journal but do not perform network I/O and never accept OAuth/access-token fields.
Provider credentials remain server-side delivery concerns.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
import re

IDEMPOTENCY = re.compile(r"^[A-Za-z0-9:_-]{8,200}$")
ACCOUNT_REF = re.compile(r"^[A-Za-z0-9._:-]{1,120}$")
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CURRENCY = re.compile(r"^[A-Z]{3}$")


def _text(value, label, max_len, required=False):
    if not isinstance(value, str):
        raise ValueError(label)
    value = value.strip()
    if required and not value:
        raise ValueError(label)
    if len(value) > max_len or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError(label)
    return value


def _journal_date(value):
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        raise ValueError("INVALID_JOURNAL_DATE")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("INVALID_JOURNAL_DATE") from exc
    return value


def _amount(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("INVALID_JOURNAL_AMOUNT") from exc
    if (
        not amount.is_finite()
        or amount <= 0
        or amount > Decimal("999999999.999")
        or amount != amount.quantize(Decimal("0.001"))
    ):
        raise ValueError("INVALID_JOURNAL_AMOUNT")
    return amount


def normalize_journal(data):
    """Validate one provider-neutral double-entry journal without mutating input."""
    required = {
        "idempotency_key",
        "reference",
        "journal_date",
        "currency",
        "memo",
        "lines",
        "schema_version",
    }
    if not isinstance(data, dict) or set(data) != required or data.get("schema_version") != 1:
        raise ValueError("INVALID_ACCOUNTING_JOURNAL")

    idempotency_key = str(data["idempotency_key"])
    if not IDEMPOTENCY.fullmatch(idempotency_key):
        raise ValueError("INVALID_IDEMPOTENCY_KEY")

    reference = _text(data["reference"], "INVALID_JOURNAL_REFERENCE", 120, True)
    journal_date = _journal_date(data["journal_date"])
    currency = data["currency"]
    if not isinstance(currency, str) or not CURRENCY.fullmatch(currency):
        raise ValueError("INVALID_JOURNAL_CURRENCY")
    memo = _text(data["memo"], "INVALID_JOURNAL_MEMO", 1000)

    lines = data["lines"]
    if not isinstance(lines, list) or not 2 <= len(lines) <= 200:
        raise ValueError("INVALID_JOURNAL_LINES")

    normalized_lines = []
    debit_total = Decimal("0")
    credit_total = Decimal("0")
    for line in lines:
        if not isinstance(line, dict) or set(line) != {"account_ref", "side", "amount", "description"}:
            raise ValueError("INVALID_JOURNAL_LINE")
        account_ref = str(line["account_ref"] or "")
        if not ACCOUNT_REF.fullmatch(account_ref):
            raise ValueError("INVALID_ACCOUNT_REFERENCE")
        side = line["side"]
        if side not in {"debit", "credit"}:
            raise ValueError("INVALID_JOURNAL_SIDE")
        amount = _amount(line["amount"])
        description = _text(line["description"], "INVALID_JOURNAL_DESCRIPTION", 500)
        if side == "debit":
            debit_total += amount
        else:
            credit_total += amount
        normalized_lines.append(
            {
                "account_ref": account_ref,
                "side": side,
                "amount": amount,
                "description": description,
            }
        )

    if debit_total != credit_total:
        raise ValueError("UNBALANCED_JOURNAL")

    return {
        "idempotency_key": idempotency_key,
        "reference": reference,
        "journal_date": journal_date,
        "currency": currency,
        "memo": memo,
        "lines": normalized_lines,
        "schema_version": 1,
    }


def accounting_provider_payload(provider, data, context=None):
    """Map an AQARI journal to a provider payload while keeping auth out of-band.

    context is deliberately non-secret. For QuickBooks/Xero it may assert the
    configured home/base currency. Zoho requires its external currency_id.
    """
    journal = normalize_journal(data)
    context = {} if context is None else context
    if not isinstance(context, dict):
        raise ValueError("INVALID_ACCOUNTING_CONTEXT")

    if provider == "quickbooks":
        if set(context) - {"home_currency"}:
            raise ValueError("INVALID_ACCOUNTING_CONTEXT")
        if context.get("home_currency") and context["home_currency"] != journal["currency"]:
            raise ValueError("CURRENCY_MAPPING_REQUIRED")
        return {
            "TxnDate": journal["journal_date"],
            "PrivateNote": journal["memo"] or journal["reference"],
            "Line": [
                {
                    "Amount": float(line["amount"]),
                    "Description": line["description"],
                    "DetailType": "JournalEntryLineDetail",
                    "JournalEntryLineDetail": {
                        "PostingType": "Debit" if line["side"] == "debit" else "Credit",
                        "AccountRef": {"value": line["account_ref"]},
                    },
                }
                for line in journal["lines"]
            ],
        }

    if provider == "zoho_books":
        currency_id = str(context.get("currency_id") or "")
        if set(context) != {"currency_id"} or not ACCOUNT_REF.fullmatch(currency_id):
            raise ValueError("CURRENCY_MAPPING_REQUIRED")
        return {
            "journal_date": journal["journal_date"],
            "reference_number": journal["reference"],
            "notes": journal["memo"],
            "currency_id": currency_id,
            "line_items": [
                {
                    "account_id": line["account_ref"],
                    "amount": float(line["amount"]),
                    "debit_or_credit": line["side"],
                    "description": line["description"],
                }
                for line in journal["lines"]
            ],
        }

    if provider == "xero":
        if set(context) - {"base_currency"}:
            raise ValueError("INVALID_ACCOUNTING_CONTEXT")
        if context.get("base_currency") and context["base_currency"] != journal["currency"]:
            raise ValueError("CURRENCY_MAPPING_REQUIRED")
        return {
            "Date": journal["journal_date"],
            "Status": "DRAFT",
            "Narration": journal["memo"] or journal["reference"],
            "LineAmountTypes": "NoTax",
            "JournalLines": [
                {
                    "LineAmount": float(line["amount"] if line["side"] == "debit" else -line["amount"]),
                    "AccountCode": line["account_ref"],
                    "Description": line["description"],
                }
                for line in journal["lines"]
            ],
        }

    raise ValueError("INVALID_ACCOUNTING_PROVIDER")
