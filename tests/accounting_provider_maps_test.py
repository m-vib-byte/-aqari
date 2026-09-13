import copy
import unittest

from lib.accounting_provider_maps import accounting_provider_payload, normalize_journal

BASE = {
    "idempotency_key": "ledger:2026:09:001",
    "reference": "AQ-2026-0001",
    "journal_date": "2026-09-13",
    "currency": "KWD",
    "memo": "تحصيل إيجار",
    "schema_version": 1,
    "lines": [
        {"account_ref": "1010", "side": "debit", "amount": "10.125", "description": "بنك"},
        {"account_ref": "4010", "side": "credit", "amount": "10.125", "description": "إيراد"},
    ],
}


class AccountingProviderMapsTest(unittest.TestCase):
    def test_balanced_journal_maps_to_all_three_provider_shapes(self):
        quickbooks = accounting_provider_payload("quickbooks", BASE, {"home_currency": "KWD"})
        self.assertEqual(quickbooks["TxnDate"], "2026-09-13")
        self.assertEqual(quickbooks["Line"][0]["JournalEntryLineDetail"]["PostingType"], "Debit")
        self.assertEqual(quickbooks["Line"][1]["JournalEntryLineDetail"]["PostingType"], "Credit")
        self.assertEqual(quickbooks["Line"][0]["JournalEntryLineDetail"]["AccountRef"]["value"], "1010")

        zoho = accounting_provider_payload("zoho_books", BASE, {"currency_id": "460000000000097"})
        self.assertEqual(zoho["reference_number"], "AQ-2026-0001")
        self.assertEqual(zoho["line_items"][0]["debit_or_credit"], "debit")
        self.assertEqual(zoho["line_items"][1]["account_id"], "4010")

        xero = accounting_provider_payload("xero", BASE, {"base_currency": "KWD"})
        self.assertEqual(xero["Status"], "DRAFT")
        self.assertEqual(xero["JournalLines"][0]["LineAmount"], 10.125)
        self.assertEqual(xero["JournalLines"][1]["LineAmount"], -10.125)
        self.assertEqual(xero["JournalLines"][1]["AccountCode"], "4010")

    def test_unbalanced_or_single_line_journal_is_rejected(self):
        unbalanced = copy.deepcopy(BASE)
        unbalanced["lines"][1]["amount"] = "9.125"
        with self.assertRaisesRegex(ValueError, "UNBALANCED_JOURNAL"):
            normalize_journal(unbalanced)
        one_line = {**BASE, "lines": [BASE["lines"][0]]}
        with self.assertRaisesRegex(ValueError, "INVALID_JOURNAL_LINES"):
            normalize_journal(one_line)

    def test_currency_mapping_never_silently_changes_the_ledger_currency(self):
        with self.assertRaisesRegex(ValueError, "CURRENCY_MAPPING_REQUIRED"):
            accounting_provider_payload("quickbooks", BASE, {"home_currency": "USD"})
        with self.assertRaisesRegex(ValueError, "CURRENCY_MAPPING_REQUIRED"):
            accounting_provider_payload("xero", BASE, {"base_currency": "USD"})
        with self.assertRaisesRegex(ValueError, "CURRENCY_MAPPING_REQUIRED"):
            accounting_provider_payload("zoho_books", BASE, {})

    def test_invalid_dates_amounts_unknown_fields_and_provider_are_rejected(self):
        bad_date = {**BASE, "journal_date": "2026-02-30"}
        with self.assertRaisesRegex(ValueError, "INVALID_JOURNAL_DATE"):
            normalize_journal(bad_date)
        bad_amount = copy.deepcopy(BASE)
        bad_amount["lines"][0]["amount"] = "10.1259"
        with self.assertRaisesRegex(ValueError, "INVALID_JOURNAL_AMOUNT"):
            normalize_journal(bad_amount)
        extra = {**BASE, "access_token": "must-not-enter-payload"}
        with self.assertRaisesRegex(ValueError, "INVALID_ACCOUNTING_JOURNAL"):
            normalize_journal(extra)
        with self.assertRaisesRegex(ValueError, "INVALID_ACCOUNTING_PROVIDER"):
            accounting_provider_payload("unknown", BASE)

    def test_input_is_not_mutated_and_credentials_are_not_accepted_as_context(self):
        source = copy.deepcopy(BASE)
        accounting_provider_payload("quickbooks", source, {"home_currency": "KWD"})
        self.assertEqual(source, BASE)
        with self.assertRaisesRegex(ValueError, "INVALID_ACCOUNTING_CONTEXT"):
            accounting_provider_payload("xero", BASE, {"base_currency": "KWD", "token": "secret"})
        with self.assertRaisesRegex(ValueError, "INVALID_ACCOUNTING_CONTEXT"):
            accounting_provider_payload("quickbooks", BASE, {"home_currency": "KWD", "authorization": "Bearer secret"})


if __name__ == "__main__":
    unittest.main()
